import { db } from "./db";
import { can } from "./permissions";
import { sendOnce, emailShell } from "./email";
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

const appUrl = () => process.env.APP_URL || "http://localhost:3000";

/** Email the new assignee. Never throws. */
export async function notifyWorkAssigned(itemId: string, actorId: string) {
  try {
    const i = await db.workItem.findUnique({ where: { id: itemId }, include: { assignee: true, project: { include: { client: true } }, deliverable: true } });
    if (!i?.assignee?.email || !i.assignee.active || i.assigneeId === actorId) return;
    const p = i.project;
    const esc = (x: string) => x.replace(/</g, "&lt;");
    const subject = `[${p.code}] ${workKey(i.number)} assigned to you: ${i.title}`;
    const body = `<p style="color:#4a5878;font-size:13px">${p.code} · ${esc(p.title)} (${esc(p.client.shortName || p.client.name)})${i.deliverable ? ` · ${esc(i.deliverable.title)}` : ""}</p>
<p>You have been assigned <b>${esc(i.title)}</b>${i.dueDate ? `, due <b>${date(i.dueDate)}</b>` : ""}.</p>${i.description ? `<p>${esc(i.description)}</p>` : ""}`;
    await sendOnce(`work:${i.id}:ASSIGNED:${i.assigneeId}:${Date.now()}`, "work", [i.assignee.email], subject, emailShell(`${workKey(i.number)} · ${i.title}`, body, { href: `${appUrl()}/work/${i.number}`, label: "Open task" }));
  } catch (e) {
    console.error("[work] notify failed", e);
  }
}
