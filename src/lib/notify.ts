import { db } from "./db";
import { sendOnce, emailShell } from "./email";

export const appUrl = () => process.env.APP_URL || "http://localhost:3000";
const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;");

type Note = { kind: string; title: string; body?: string | null; href: string };

/**
 * In-app notification for each user (never the actor), optionally also by email.
 * Never throws — a failed notification must not block the action that caused it.
 */
export async function notifyUsers(userIds: (string | null | undefined)[], actorId: string | null, n: Note, email?: { subject: string; html: string; dedupe: string }) {
  try {
    const ids = [...new Set(userIds.filter((x): x is string => !!x && x !== actorId))];
    if (!ids.length) return;
    const users = await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, email: true } });
    if (!users.length) return;
    await db.notification.createMany({ data: users.map((u) => ({ userId: u.id, kind: n.kind, title: n.title, body: n.body ?? null, href: n.href })) });
    if (email) {
      const to = users.map((u) => u.email).filter(Boolean);
      if (to.length) await sendOnce(`${email.dedupe}:${Date.now()}`, "notify", to, email.subject, emailShell(n.title, email.html, { href: `${appUrl()}${n.href}`, label: "Open" }));
    }
  } catch (e) {
    console.error("[notify] failed", e);
  }
}

/** Same, addressed by email (used by the proposal-task emails that already know addresses). */
export async function notifyEmails(emails: string[], actorId: string | null, n: Note) {
  try {
    if (!emails.length) return;
    const users = await db.user.findMany({ where: { email: { in: emails, mode: "insensitive" } }, select: { id: true } });
    await notifyUsers(users.map((u) => u.id), actorId, n);
  } catch (e) {
    console.error("[notify] failed", e);
  }
}

/** @usernames in a comment → active user ids. */
export async function mentionedUsers(text: string) {
  const names = [...new Set([...text.matchAll(/(^|[^\w@.])@([a-z0-9._-]{2,32})/gi)].map((m) => m[2].toLowerCase().replace(/[.]+$/, "")))];
  if (!names.length) return [];
  return db.user.findMany({ where: { username: { in: names, mode: "insensitive" }, active: true }, select: { id: true, name: true, username: true } });
}

export function commentHtml(context: string, who: string, body: string) {
  return `<p style="color:#4a5878;font-size:13px">${esc(context)}</p><p><b>${esc(who)}</b> wrote:</p><blockquote style="border-left:3px solid #dfe4ef;margin:12px 0;padding:4px 12px;color:#4a5878;white-space:pre-line">${esc(body)}</blockquote>`;
}
