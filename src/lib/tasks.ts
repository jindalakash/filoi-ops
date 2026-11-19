import { db } from "./db";
import { can } from "./permissions";
import { sendOnce, emailShell } from "./email";
import { notifyEmails } from "./notify";
import { date, splitEmails } from "./format";
import type { Role } from "@prisma/client";

type Actor = { id: string; role: Role };
type TaskLite = { assigneeId: string | null; reviewerId: string | null };

/** Admins & project managers manage tasks; assignees & reviewers act on their own. */
export const canManageTasks = (u: Actor) => can(u.role, "presales");
export const isAssignee = (u: Actor, t: TaskLite) => !!t.assigneeId && t.assigneeId === u.id;
export const isReviewer = (u: Actor, t: TaskLite) => !!t.reviewerId && t.reviewerId === u.id;

/** Statuses that need someone to act, and who */
export const OPEN_FOR_ASSIGNEE = ["TODO", "IN_PROGRESS", "CHANGES_REQUESTED"] as const;

const appUrl = () => process.env.APP_URL || "http://localhost:3000";

type Event = "ASSIGNED" | "SUBMITTED" | "APPROVED" | "CHANGES" | "ALL_APPROVED";

/** Email the people a task event concerns. Never throws — a failed email must not block the workflow. */
export async function notifyTask(taskId: string, event: Event, actorId: string, note?: string | null) {
  try {
    const t = await db.proposalTask.findUnique({
      where: { id: taskId },
      include: { assignee: true, reviewer: true, opportunity: { include: { owner: true, client: true } } },
    });
    if (!t) return;
    const o = t.opportunity;
    const ctx = `<p style="color:#4a5878;font-size:13px">${o.code} · ${o.title} (${o.client.shortName || o.client.name})${o.submissionDeadline ? ` · submission ${date(o.submissionDeadline)}` : ""}</p>`;
    const quote = note ? `<blockquote style="border-left:3px solid #dfe4ef;margin:12px 0;padding:4px 12px;color:#4a5878">${note.replace(/</g, "&lt;")}</blockquote>` : "";
    const link = { href: `${appUrl()}/tasks/${t.id}`, label: "Open task" };
    const mail: Record<Event, { to: (string | undefined)[]; subject: string; body: string }> = {
      ASSIGNED: { to: [t.assignee?.email], subject: `[${o.code}] You've been assigned: ${t.title}`, body: `<p>You have been assigned <b>${t.title}</b>${t.dueDate ? `, due <b>${date(t.dueDate)}</b>` : ""}.</p>${t.description ? `<p>${t.description.replace(/</g, "&lt;")}</p>` : ""}` },
      SUBMITTED: { to: [t.reviewer?.email], subject: `[${o.code}] Please review: ${t.title}`, body: `<p><b>${t.assignee?.name ?? "A team member"}</b> has completed <b>${t.title}</b> and sent it to you for review.</p>${quote}` },
      APPROVED: { to: [t.assignee?.email], subject: `[${o.code}] Approved: ${t.title}`, body: `<p><b>${t.reviewer?.name ?? "The reviewer"}</b> approved <b>${t.title}</b>. Thank you!</p>${quote}` },
      CHANGES: { to: [t.assignee?.email], subject: `[${o.code}] Changes requested: ${t.title}`, body: `<p><b>${t.reviewer?.name ?? "The reviewer"}</b> asked for changes to <b>${t.title}</b>:</p>${quote}` },
      ALL_APPROVED: { to: [o.owner?.email, ...splitEmails(o.alertEmails)], subject: `[${o.code}] All parts approved — ready to submit`, body: `<p>Every part of <b>${o.title}</b> has been approved. The proposal is now marked <b>Ready to submit</b>.</p>` },
    };
    const m = mail[event];
    // don't email people about their own actions
    const actor = await db.user.findUnique({ where: { id: actorId }, select: { email: true } });
    const to = [...new Set(m.to.filter((e): e is string => !!e && e !== actor?.email))];
    if (!to.length) return;
    await notifyEmails(to, actorId, { kind: "PROPOSAL", title: m.subject.replace(/^\[[^\]]+\]\s*/, ""), body: `${o.code} · ${o.title}`, href: event === "ALL_APPROVED" ? `/opportunities/${o.id}` : `/tasks/${t.id}` });
    await sendOnce(`task:${t.id}:${event}:${Date.now()}`, "task", to, m.subject, emailShell(m.subject.replace(/^\[[^\]]+\]\s*/, ""), ctx + m.body, event === "ALL_APPROVED" ? { href: `${appUrl()}/opportunities/${o.id}`, label: "Open proposal" } : link));
  } catch (e) {
    console.error("[tasks] notify failed", e);
  }
}

/** One email for several parts assigned to the same person at once. */
export async function notifyAssignedMany(taskIds: string[], actorId: string) {
  if (taskIds.length === 1) return notifyTask(taskIds[0], "ASSIGNED", actorId);
  try {
    const tasks = await db.proposalTask.findMany({ where: { id: { in: taskIds } }, include: { assignee: true, opportunity: { include: { client: true } } }, orderBy: { seq: "asc" } });
    const first = tasks[0];
    if (!first?.assignee?.email || first.assigneeId === actorId) return;
    const o = first.opportunity;
    const list = tasks.map((t) => `<li><a href="${appUrl()}/tasks/${t.id}">${t.title.replace(/</g, "&lt;")}</a>${t.dueDate ? ` — due ${date(t.dueDate)}` : ""}</li>`).join("");
    const subject = `[${o.code}] You've been assigned ${tasks.length} parts`;
    const body = `<p style="color:#4a5878;font-size:13px">${o.code} · ${o.title} (${o.client.shortName || o.client.name})</p><p>You have been assigned:</p><ul>${list}</ul>${first.description ? `<p>${first.description.replace(/</g, "&lt;")}</p>` : ""}`;
    await notifyEmails([first.assignee.email], actorId, { kind: "PROPOSAL", title: subject.replace(/^\[[^\]]+\]\s*/, ""), body: tasks.map((t) => t.title).join(", "), href: "/tasks" });
    await sendOnce(`tasks:${taskIds.join(",").slice(0, 120)}:ASSIGNED:${Date.now()}`, "task", [first.assignee.email], subject, emailShell(`${tasks.length} parts assigned to you`, body, { href: `${appUrl()}/tasks`, label: "Open my tasks" }));
  } catch (e) {
    console.error("[tasks] notify failed", e);
  }
}
