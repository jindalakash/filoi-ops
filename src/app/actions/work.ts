"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { guard, req, str, dateOf, FormError } from "@/lib/form";
import { logActivity } from "@/lib/activity";
import { canEditItem, canMoveItem, notifyWorkAssigned, workKey, applyTemplateTo } from "@/lib/work";
import { notifyUsers, mentionedUsers, commentHtml } from "@/lib/notify";
import { readCustom } from "@/lib/custom";
import type { ActionState } from "@/components/client";
import type { WorkPriority, WorkType } from "@prisma/client";

const TYPES = ["TASK", "ISSUE", "CHANGE"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function refresh(projectId: string, number?: number) {
  revalidatePath("/deliverables");
  revalidatePath("/board");
  revalidatePath("/tasks");
  revalidatePath("/issues");
  revalidatePath(`/projects/${projectId}`);
  if (number) revalidatePath(`/work/${number}`);
  revalidatePath("/", "layout"); // sidebar count
}

async function activeUser(id: string | null | undefined) {
  if (!id) return null;
  const u = await db.user.findUnique({ where: { id } });
  if (!u || !u.active) throw new FormError("Assignee must be an active user.");
  return u.id;
}

async function statusOrDefault(id: string | null | undefined) {
  if (id) {
    const s = await db.workStatus.findUnique({ where: { id } });
    if (!s) throw new FormError("Unknown status.");
    return s;
  }
  const s = await db.workStatus.findFirst({ where: { active: true }, orderBy: { seq: "asc" } });
  if (!s) throw new FormError("No board columns are set up.");
  return s;
}

async function nextPosition(statusId: string) {
  const last = await db.workItem.findFirst({ where: { statusId }, orderBy: { position: "desc" }, select: { position: true } });
  return (last?.position ?? 0) + 1;
}

/** Create or edit a task / issue. Anyone can create; editing is for managers and the reporter. */
export async function saveWorkItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return guard(async () => {
    const id = str(fd, "id");
    const before = id ? await db.workItem.findUniqueOrThrow({ where: { id } }) : null;
    if (before && !canEditItem(user, before)) throw new FormError("Only admins, project managers or the person who created it can edit this.");
    const projectId = before?.projectId ?? req(fd, "projectId", "Project");
    const deliverableId = str(fd, "deliverableId");
    if (deliverableId) {
      const d = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { projectId: true } });
      if (!d || d.projectId !== projectId) throw new FormError("That deliverable belongs to another project.");
    }
    const type = (str(fd, "type") ?? before?.type ?? "TASK") as WorkType;
    const priority = (str(fd, "priority") ?? before?.priority ?? "MEDIUM") as WorkPriority;
    if (!TYPES.includes(type) || !PRIORITIES.includes(priority)) throw new FormError("Invalid type or priority.");
    const data = {
      title: req(fd, "title", "Title"),
      description: str(fd, "description") ?? null,
      deliverableId: deliverableId ?? null,
      type, priority,
      assigneeId: await activeUser(str(fd, "assigneeId")),
      dueDate: dateOf(fd, "dueDate") ?? null,
      ...(type === "ISSUE" ? {
        source: str(fd, "source") ?? null,
        clientContact: str(fd, "clientContact") ?? null,
        reportedAt: dateOf(fd, "reportedAt") ?? before?.reportedAt ?? new Date(),
        respondBy: dateOf(fd, "respondBy") ?? null,
      } : {}),
    };
    const custom = await readCustom(fd, "WORK_ITEM", before?.custom);
    const labelIds = fd.has("labels__present") ? fd.getAll("labelIds").map(String) : undefined;
    const extra = { ...(custom ? { custom: custom as object } : {}) };
    if (before) {
      const item = await db.workItem.update({ where: { id: before.id }, data: { ...data, ...extra, ...(labelIds ? { labels: { set: labelIds.map((id) => ({ id })) } } : {}) } });
      if (item.assigneeId && item.assigneeId !== before.assigneeId) {
        await db.workComment.create({ data: { itemId: item.id, userId: user.id, kind: "ASSIGNED", body: item.assigneeId } });
        await notifyWorkAssigned(item.id, user.id);
      }
      refresh(projectId, item.number);
      return { ok: "Saved." };
    }
    const status = await statusOrDefault(str(fd, "statusId"));
    const item = await db.workItem.create({
      data: { ...data, ...extra, ...(labelIds?.length ? { labels: { connect: labelIds.map((id) => ({ id })) } } : {}), projectId, statusId: status.id, reporterId: user.id, position: await nextPosition(status.id), completedAt: status.category === "DONE" ? new Date() : null },
    });
    await db.workComment.create({ data: { itemId: item.id, userId: user.id, kind: "CREATED" } });
    await logActivity(user.id, "create", "work", item.id, `${workKey(item.number)} “${item.title}” created`);
    if (item.assigneeId) await notifyWorkAssigned(item.id, user.id);
    refresh(projectId, item.number);
    return { ok: `${workKey(item.number)} created.` };
  });
}

async function applyStatus(userId: string, itemId: string, statusId: string, position?: number) {
  const [item, status] = await Promise.all([db.workItem.findUniqueOrThrow({ where: { id: itemId }, include: { status: true } }), db.workStatus.findUniqueOrThrow({ where: { id: statusId } })]);
  const changed = item.statusId !== statusId;
  const updated = await db.workItem.update({
    where: { id: itemId },
    data: {
      statusId,
      position: position ?? (changed ? await nextPosition(statusId) : item.position),
      ...(changed ? { completedAt: status.category === "DONE" ? new Date() : null } : {}),
      ...(changed && status.category !== "TODO" && !item.respondedAt ? { respondedAt: new Date() } : {}),
    },
  });
  if (changed) {
    await db.workComment.create({ data: { itemId, userId, kind: "STATUS", body: `${item.status.name} → ${status.name}` } });
    await logActivity(userId, "status", "work", itemId, `${workKey(item.number)} → ${status.name}`);
    await notifyUsers([item.reporterId, item.assigneeId], userId, { kind: "STATUS", title: `${workKey(item.number)} moved to ${status.name}`, body: item.title, href: `/work/${item.number}` });
  }
  return updated;
}

/** Board drag & drop: new column and a position between its neighbours. */
export async function moveWorkItem(id: string, statusId: string, position: number): Promise<ActionState> {
  const user = await requireUser();
  return guard(async () => {
    const item = await db.workItem.findUniqueOrThrow({ where: { id } });
    if (!canMoveItem(user, item)) throw new FormError("You can only move tasks assigned to you or that you created.");
    if (!Number.isFinite(position)) throw new FormError("Bad position.");
    const u = await applyStatus(user.id, id, statusId, position);
    refresh(u.projectId, u.number);
    return { ok: "Moved." };
  });
}

/** Status dropdown (lists, detail page). */
export async function setWorkStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return guard(async () => {
    const id = req(fd, "id");
    const item = await db.workItem.findUniqueOrThrow({ where: { id } });
    if (!canMoveItem(user, item)) throw new FormError("You can only update tasks assigned to you or that you created.");
    const u = await applyStatus(user.id, id, req(fd, "statusId"));
    refresh(u.projectId, u.number);
    return { ok: "Updated." };
  });
}

export async function addWorkComment(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return guard(async () => {
    const item = await db.workItem.findUniqueOrThrow({ where: { id: req(fd, "id") }, include: { project: { select: { code: true } }, comments: { where: { kind: "COMMENT" }, select: { userId: true } } } });
    const body = req(fd, "body", "Comment");
    await db.workComment.create({ data: { itemId: item.id, userId: user.id, body } });
    if (item.type === "ISSUE" && !item.respondedAt) await db.workItem.update({ where: { id: item.id }, data: { respondedAt: new Date() } });
    const href = `/work/${item.number}`;
    const snippet = body.length > 140 ? `${body.slice(0, 140)}…` : body;
    // @mentions: bell + email; everyone else involved: bell only
    const mentioned = await mentionedUsers(body);
    const ctx = `${item.project.code} · ${workKey(item.number)} ${item.title}`;
    await notifyUsers(mentioned.map((m) => m.id), user.id, { kind: "MENTION", title: `${user.name} mentioned you on ${workKey(item.number)}`, body: snippet, href },
      { dedupe: `work:${item.id}:MENTION`, subject: `[${item.project.code}] ${user.name} mentioned you: ${item.title}`, html: commentHtml(ctx, user.name, body) });
    const mentionedIds = new Set(mentioned.map((m) => m.id));
    const involved = [item.assigneeId, item.reporterId, ...item.comments.map((c) => c.userId)].filter((x) => x && !mentionedIds.has(x));
    await notifyUsers(involved, user.id, { kind: "COMMENT", title: `${user.name} commented on ${workKey(item.number)}`, body: snippet, href });
    refresh(item.projectId, item.number);
    return { ok: mentioned.length ? `Comment added · notified ${mentioned.map((m) => m.name).join(", ")}.` : "Comment added." };
  });
}

export async function deleteWorkItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const r = await guard(async () => {
    const item = await db.workItem.findUniqueOrThrow({ where: { id: req(fd, "id") } });
    if (!canEditItem(user, item)) throw new FormError("Only admins, project managers or the person who created it can delete this.");
    await db.workItem.delete({ where: { id: item.id } });
    await logActivity(user.id, "delete", "work", item.id, `${workKey(item.number)} “${item.title}” deleted`);
    refresh(item.projectId);
    return { ok: "Deleted." };
  });
  if (r && "ok" in r && r.ok && str(fd, "back")) redirect(str(fd, "back")!);
  return r;
}

/** A client issue that turns out to be planned work → make it a task (keeps history). */
export async function convertToTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return guard(async () => {
    const item = await db.workItem.findUniqueOrThrow({ where: { id: req(fd, "id") } });
    if (!canEditItem(user, item)) throw new FormError("Only admins, project managers or the person who logged it can convert it.");
    await db.workItem.update({ where: { id: item.id }, data: { type: "TASK" } });
    await db.workComment.create({ data: { itemId: item.id, userId: user.id, kind: "CONVERTED" } });
    refresh(item.projectId, item.number);
    revalidatePath("/issues");
    return { ok: "Converted to a task — it now counts toward its deliverable's progress." };
  });
}

/** Add template tasks to one deliverable. */
export async function applyTemplate(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("projects");
  return guard(async () => {
    const id = req(fd, "id");
    const made = await applyTemplateTo(id, user.id);
    const dl = await db.deliverable.findUniqueOrThrow({ where: { id }, select: { projectId: true } });
    refresh(dl.projectId);
    return made ? { ok: `Added ${made} task${made > 1 ? "s" : ""} from the template.` } : { error: "Nothing to add — no template for this deliverable type, or the tasks already exist." };
  });
}

/** Add template tasks to every open deliverable of a project that has no tasks yet. */
export async function applyTemplatesToProject(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("projects");
  return guard(async () => {
    const projectId = req(fd, "projectId");
    const dls = await db.deliverable.findMany({ where: { projectId, status: { not: "ACCEPTED" }, workItems: { none: {} } }, select: { id: true } });
    let made = 0, dlTouched = 0;
    for (const d of dls) { const n = await applyTemplateTo(d.id, user.id); made += n; if (n) dlTouched++; }
    refresh(projectId);
    return made ? { ok: `Added ${made} tasks to ${dlTouched} deliverable${dlTouched > 1 ? "s" : ""}.` } : { error: "Nothing to add — check the templates in Settings → Task templates." };
  });
}
