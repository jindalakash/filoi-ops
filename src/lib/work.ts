import { db } from "./db";
import { can } from "./permissions";
import { notifyUsers } from "./notify";
import { date } from "./format";
import type { Role } from "@prisma/client";

type Actor = { id: string; role: Role };
type ItemLite = { assigneeId: string | null; reporterId: string | null };

/** Admins & project managers manage all delivery work. */
export const canManageWork = (u: Actor) => can(u.role, "projects");
/** Edit title/assignee/dates/delete: managers and whoever reported it. */
export const canEditItem = (u: Actor, i: ItemLite) => canManageWork(u) || i.reporterId === u.id;
/** Move on the board / change status: also the assignee. */
export const canMoveItem = (u: Actor, i: ItemLite) => canEditItem(u, i) || i.assigneeId === u.id;

export const workKey = (n: number) => `W-${n}`;

export const WORK_TYPE: Record<string, { label: string; tone: "gray" | "blue" | "purple" | "amber" | "green" | "red" | "navy" }> = {
  TASK: { label: "Task", tone: "blue" },
  ISSUE: { label: "Client issue", tone: "red" },
  CHANGE: { label: "Change request", tone: "amber" },
};
export const WORK_PRIORITY: Record<string, { label: string; tone: "gray" | "blue" | "purple" | "amber" | "green" | "red" | "navy"; rank: number }> = {
  URGENT: { label: "Urgent", tone: "red", rank: 0 },
  HIGH: { label: "High", tone: "amber", rank: 1 },
  MEDIUM: { label: "Medium", tone: "gray", rank: 2 },
  LOW: { label: "Low", tone: "gray", rank: 3 },
};

export async function boardColumns() {
  return db.workStatus.findMany({ where: { active: true }, orderBy: { seq: "asc" } });
}

/** Tell the new assignee (bell + email). Never throws. */
export async function notifyWorkAssigned(itemId: string, actorId: string) {
  try {
    const i = await db.workItem.findUnique({ where: { id: itemId }, include: { project: { include: { client: true } }, deliverable: true } });
    if (!i?.assigneeId) return;
    const p = i.project;
    const esc = (x: string) => x.replace(/</g, "&lt;");
    const kind = i.type === "ISSUE" ? "client issue" : "task";
    await notifyUsers([i.assigneeId], actorId,
      { kind: "ASSIGNED", title: `${workKey(i.number)} assigned to you: ${i.title}`, body: `${p.code}${i.deliverable ? ` · ${i.deliverable.title}` : ""}${i.dueDate ? ` · due ${date(i.dueDate)}` : ""}`, href: `/work/${i.number}` },
      {
        dedupe: `work:${i.id}:ASSIGNED:${i.assigneeId}`,
        subject: `[${p.code}] ${workKey(i.number)} assigned to you: ${i.title}`,
        html: `<p style="color:#4a5878;font-size:13px">${p.code} · ${esc(p.title)} (${esc(p.client.shortName || p.client.name)})${i.deliverable ? ` · ${esc(i.deliverable.title)}` : ""}</p>
<p>You have been assigned the ${kind} <b>${esc(i.title)}</b>${i.dueDate ? `, due <b>${date(i.dueDate)}</b>` : ""}.</p>${i.description ? `<p style="white-space:pre-line">${esc(i.description)}</p>` : ""}`,
      });
  } catch (e) {
    console.error("[work] notify failed", e);
  }
}

export const ISSUE_SOURCES = [["EMAIL", "Email"], ["CALL", "Phone call"], ["MEETING", "Meeting"], ["PORTAL", "Client portal / system"], ["OTHER", "Other"]] as const;

/** Due date `daysBefore` days before the deliverable's due date (negative = after). */
export function dueFrom(deliverableDue: Date | null, daysBefore: number | null | undefined) {
  if (!deliverableDue || daysBefore === null || daysBefore === undefined || !Number.isFinite(daysBefore)) return null;
  const d = new Date(deliverableDue);
  d.setDate(d.getDate() - Math.round(daysBefore));
  return d;
}

type NewTask = { title: string; description?: string | null; dueDate?: Date | null; assigneeId?: string | null; priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT" };

/**
 * Create several tasks under one deliverable in the first board column.
 * Skips titles the deliverable already has. Returns how many were created.
 */
export async function createDeliverableTasks(deliverableId: string, tasks: NewTask[], actorId: string, how: string) {
  const dl = await db.deliverable.findUniqueOrThrow({ where: { id: deliverableId }, include: { workItems: { select: { title: true } } } });
  const have = new Set(dl.workItems.map((w) => w.title.trim().toLowerCase()));
  const todo = await db.workStatus.findFirst({ where: { active: true }, orderBy: { seq: "asc" } });
  if (!todo) return 0;
  const last = await db.workItem.findFirst({ where: { statusId: todo.id }, orderBy: { position: "desc" }, select: { position: true } });
  let pos = (last?.position ?? 0) + 1;
  let made = 0;
  const forWhom = new Map<string, { number: number; title: string }[]>();
  for (const t of tasks) {
    const title = t.title.trim();
    if (!title || have.has(title.toLowerCase())) continue;
    have.add(title.toLowerCase());
    const item = await db.workItem.create({
      data: { projectId: dl.projectId, deliverableId: dl.id, title, description: t.description ?? null, dueDate: t.dueDate ?? null, assigneeId: t.assigneeId ?? null, priority: t.priority ?? "MEDIUM", statusId: todo.id, reporterId: actorId, position: pos++ },
    });
    await db.workComment.create({ data: { itemId: item.id, userId: actorId, kind: "CREATED", body: how } });
    if (item.assigneeId) forWhom.set(item.assigneeId, [...(forWhom.get(item.assigneeId) ?? []), { number: item.number, title }]);
    made++;
  }
  // one notice per person, not one per task
  for (const [uid, list] of forWhom) {
    if (list.length === 1) { const one = await db.workItem.findUnique({ where: { number: list[0].number }, select: { id: true } }); if (one) await notifyWorkAssigned(one.id, actorId); continue; }
    const esc = (x: string) => x.replace(/</g, "&lt;");
    await notifyUsers([uid], actorId,
      { kind: "ASSIGNED", title: `${list.length} tasks assigned to you: ${dl.title}`, body: list.map((x) => x.title).join(" · "), href: `/board?who=me&deliverable=${dl.id}&project=${dl.projectId}` },
      { dedupe: `work:dl:${dl.id}:ASSIGNED:${uid}`, subject: `${list.length} tasks assigned to you: ${dl.title}`, html: `<p>You have been assigned these tasks for <b>${esc(dl.title)}</b>:</p><ul>${list.map((x) => `<li>${workKey(x.number)} ${esc(x.title)}</li>`).join("")}</ul>` });
  }
  return made;
}

/** Add the template tasks for this deliverable's type. */
export async function applyTemplateTo(deliverableId: string, actorId: string) {
  const [{ getSetting }, dl] = await Promise.all([import("./settings"), db.deliverable.findUniqueOrThrow({ where: { id: deliverableId } })]);
  const cfg = await getSetting("taskTemplates");
  const list = cfg.types[dl.type] ?? [];
  if (!list.length) return 0;
  return createDeliverableTasks(dl.id, list.map((t) => ({ title: t.title, dueDate: dueFrom(dl.dueDate, t.daysBefore), assigneeId: dl.ownerId })), actorId, "template");
}
