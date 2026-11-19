"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { guard, req, str, dateOf, FormError } from "@/lib/form";
import { logActivity } from "@/lib/activity";
import { canManageTasks, isAssignee, isReviewer, notifyTask, notifyAssignedMany } from "@/lib/tasks";
import type { ActionState } from "@/components/client";
import { scopeForPart, STANDARD_SECTIONS } from "@/lib/proposal-meta";

/** Find (or create) the workspace section a SECTION task writes into, so task and workspace edit the same text. */
async function sectionFor(opportunityId: string, title: string) {
  const all = await db.proposalSection.findMany({ where: { opportunityId }, select: { id: true, title: true } });
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const hit = all.find((x) => norm(x.title) === norm(title));
  if (hit) return hit.id;
  const std = STANDARD_SECTIONS.find((x) => norm(x.title) === norm(title));
  const s = await db.proposalSection.create({ data: { opportunityId, title, guidance: std?.guidance ?? null, seq: all.length } });
  return s.id;
}

function refresh(opportunityId: string, taskId?: string) {
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/tasks");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/", "layout"); // sidebar task count
}

async function activeUser(id: string | null | undefined, label: string) {
  if (!id) return null;
  const u = await db.user.findUnique({ where: { id } });
  if (!u || !u.active) throw new FormError(`${label} must be an active user.`);
  return u.id;
}

/** When the last open part is approved, the proposal moves to "Ready to submit". */
async function checkAllApproved(opportunityId: string, actorId: string) {
  const [open, total, o] = await Promise.all([
    db.proposalTask.count({ where: { opportunityId, status: { not: "APPROVED" } } }),
    db.proposalTask.count({ where: { opportunityId } }),
    db.opportunity.findUniqueOrThrow({ where: { id: opportunityId } }),
  ]);
  if (total > 0 && open === 0 && (o.status === "DRAFT" || o.status === "IN_REVIEW")) {
    await db.opportunity.update({ where: { id: opportunityId }, data: { status: "READY_TO_SUBMIT" } });
    await logActivity(actorId, "status", "opportunity", opportunityId, `${o.code} → Ready to submit (all parts approved)`);
    const anyTask = await db.proposalTask.findFirst({ where: { opportunityId }, select: { id: true } });
    if (anyTask) await notifyTask(anyTask.id, "ALL_APPROVED", actorId);
  }
}

/** Create or edit a task (admins & project managers). */
export async function saveTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManageTasks(user)) return { error: "Only admins and project managers can assign proposal tasks." };
  return guard(async () => {
    const id = str(fd, "id");
    const opportunityId = req(fd, "opportunityId");
    const data = {
      description: str(fd, "description"),
      dueDate: dateOf(fd, "dueDate"),
      assigneeId: await activeUser(str(fd, "assigneeId"), "Assignee"),
      reviewerId: await activeUser(str(fd, "reviewerId"), "Reviewer"),
    };
    if (id) {
      const before = await db.proposalTask.findUniqueOrThrow({ where: { id } });
      const t = await db.proposalTask.update({ where: { id }, data: { ...data, title: req(fd, "title", "Task") } });
      if (t.assigneeId && t.assigneeId !== before.assigneeId) {
        await db.taskComment.create({ data: { taskId: id, userId: user.id, kind: "ASSIGNED" } });
        await notifyTask(id, "ASSIGNED", user.id);
      }
      refresh(opportunityId, id);
      return { ok: "Task updated." };
    }
    // one or more parts (multi-select), each its own task with the same person, reviewer and due date
    const existing = new Set((await db.proposalTask.findMany({ where: { opportunityId }, select: { title: true } })).map((x) => x.title.trim().toLowerCase()));
    const titles = [...new Set([...fd.getAll("titles").map(String), str(fd, "title") ?? ""].map((x) => x.trim()).filter(Boolean))]
      .filter((x) => !existing.has(x.toLowerCase()));
    if (!titles.length) throw new FormError("Pick at least one part (or add your own).");
    let seq = await db.proposalTask.count({ where: { opportunityId } });
    const created: string[] = [];
    for (const title of titles) {
      const scope = scopeForPart(title);
      const sectionId = scope === "SECTION" ? await sectionFor(opportunityId, title) : null;
      const t = await db.proposalTask.create({ data: { ...data, title, scope, sectionId, opportunityId, seq: seq++, createdById: user.id } });
      await db.taskComment.create({ data: { taskId: t.id, userId: user.id, kind: "ASSIGNED" } });
      created.push(t.id);
    }
    if (data.assigneeId) await notifyAssignedMany(created, user.id);
    const who = data.assigneeId ? (await db.user.findUnique({ where: { id: data.assigneeId }, select: { name: true } }))?.name : null;
    await logActivity(user.id, "create", "opportunity", opportunityId, `Assigned ${titles.length === 1 ? `“${titles[0]}”` : `${titles.length} parts`}${who ? ` to ${who}` : ""}`);
    refresh(opportunityId);
    return { ok: titles.length === 1 ? `Task “${titles[0]}” added.` : `${titles.length} tasks added${who ? ` for ${who}` : ""}.` };
  });
}

/** One task per line of the proposal's "Documents to submit" checklist. */
export async function tasksFromChecklist(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManageTasks(user)) return { error: "Only admins and project managers can assign proposal tasks." };
  return guard(async () => {
    const o = await db.opportunity.findUniqueOrThrow({ where: { id: req(fd, "opportunityId") }, include: { tasks: { select: { title: true } } } });
    const have = new Set(o.tasks.map((t) => t.title.trim().toLowerCase()));
    const lines = (o.requiredDocuments ?? "").split("\n").map((s) => s.replace(/^[-•*]\s*/, "").trim()).filter((s) => s && !have.has(s.toLowerCase()));
    if (!lines.length) return { error: "No new items in the “Documents to submit” checklist." };
    const due = o.submissionDeadline ? new Date(o.submissionDeadline.getTime() - 2 * 86400000) : null; // 2 days before submission
    let seq = o.tasks.length;
    for (const title of lines) {
      await db.proposalTask.create({ data: { opportunityId: o.id, title, seq: seq++, dueDate: due, reviewerId: o.ownerId, createdById: user.id } });
    }
    refresh(o.id);
    return { ok: `${lines.length} task(s) created — now assign each one.` };
  });
}

/** Workflow step: start | submit | approve | changes | reopen */
export async function moveTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return guard(async () => {
    const t = await db.proposalTask.findUniqueOrThrow({ where: { id: req(fd, "id") }, include: { opportunity: true } });
    const step = req(fd, "step");
    const note = str(fd, "note");
    const manager = canManageTasks(user);
    const done = async (kind: string, body?: string | null) => db.taskComment.create({ data: { taskId: t.id, userId: user.id, kind, body } });

    if (step === "start") {
      if (!isAssignee(user, t) && !manager) throw new FormError("Only the assignee can start this task.");
      await db.proposalTask.update({ where: { id: t.id }, data: { status: "IN_PROGRESS" } });
      await done("STARTED");
    } else if (step === "submit") {
      if (!isAssignee(user, t) && !manager) throw new FormError("Only the assignee can submit this task.");
      const reviewerId = (await activeUser(str(fd, "reviewerId"), "Reviewer")) ?? t.reviewerId;
      if (!reviewerId) throw new FormError("Choose who should review it.");
      await db.proposalTask.update({ where: { id: t.id }, data: { status: "IN_REVIEW", reviewerId, submittedAt: new Date() } });
      await done("SUBMITTED", note);
      await notifyTask(t.id, "SUBMITTED", user.id, note);
    } else if (step === "approve" || step === "changes") {
      if (t.status !== "IN_REVIEW") throw new FormError("This task is not waiting for review.");
      if (!isReviewer(user, t) && !manager) throw new FormError("Only the reviewer can approve or send back this task.");
      if (step === "changes" && !note) throw new FormError("Tell the assignee what to change.");
      await db.proposalTask.update({ where: { id: t.id }, data: step === "approve" ? { status: "APPROVED", approvedAt: new Date() } : { status: "CHANGES_REQUESTED" } });
      await done(step === "approve" ? "APPROVED" : "CHANGES", note);
      await notifyTask(t.id, step === "approve" ? "APPROVED" : "CHANGES", user.id, note);
      if (step === "approve") await checkAllApproved(t.opportunityId, user.id);
    } else if (step === "reopen") {
      if (!manager && !isReviewer(user, t)) throw new FormError("Only a reviewer or manager can reopen a task.");
      await db.proposalTask.update({ where: { id: t.id }, data: { status: "IN_PROGRESS", approvedAt: null } });
      await done("REOPENED", note);
      if (t.opportunity.status === "READY_TO_SUBMIT") await db.opportunity.update({ where: { id: t.opportunityId }, data: { status: "IN_REVIEW" } });
    } else throw new FormError("Unknown step.");

    refresh(t.opportunityId, t.id);
    return { ok: "Updated." };
  });
}

export async function commentTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return guard(async () => {
    const t = await db.proposalTask.findUniqueOrThrow({ where: { id: req(fd, "id") } });
    await db.taskComment.create({ data: { taskId: t.id, userId: user.id, body: req(fd, "body", "Comment") } });
    refresh(t.opportunityId, t.id);
    return { ok: "Comment added." };
  });
}

export async function deleteTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManageTasks(user)) return { error: "Only admins and project managers can delete tasks." };
  return guard(async () => {
    const t = await db.proposalTask.delete({ where: { id: req(fd, "id") } });
    await logActivity(user.id, "delete", "opportunity", t.opportunityId, `Removed task “${t.title}”`);
    refresh(t.opportunityId);
    if (str(fd, "back") === "1") redirect(`/opportunities/${t.opportunityId}`);
    return { ok: "Task deleted." };
  });
}

/** For older tasks without a linked section: create/link it so the person can write here. */
export async function startWritingTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return guard(async () => {
    const t = await db.proposalTask.findUniqueOrThrow({ where: { id: req(fd, "id") } });
    if (!isAssignee(user, t) && !isReviewer(user, t) && !canManageTasks(user)) throw new FormError("Only people on this task can do that.");
    const scope = scopeForPart(t.title);
    const sectionId = scope === "SECTION" ? await sectionFor(t.opportunityId, t.title) : null;
    await db.proposalTask.update({ where: { id: t.id }, data: { scope, sectionId, ...(t.status === "TODO" && isAssignee(user, t) ? { status: "IN_PROGRESS" } : {}) } });
    refresh(t.opportunityId, t.id);
    return { ok: "Ready — write below or let AI draft it." };
  });
}
