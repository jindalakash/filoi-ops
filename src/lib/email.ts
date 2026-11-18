import nodemailer from "nodemailer";
import { db } from "./db";
import { getSetting } from "./settings";
import { decrypt } from "./crypto";

export type MailResult = { status: "SENT" | "SKIPPED" | "FAILED"; error?: string };

export async function sendMail(to: string[], subject: string, html: string): Promise<MailResult> {
  if (!to.length) return { status: "SKIPPED", error: "No recipients" };
  const s = await getSetting("smtp");
  if (!s.host || !s.fromEmail) {
    console.log(`[mail:skipped – SMTP not configured] to=${to.join(",")} subject=${subject}`);
    return { status: "SKIPPED", error: "SMTP not configured" };
  }
  try {
    const t = nodemailer.createTransport({
      host: s.host,
      port: Number(s.port) || 587,
      secure: !!s.secure,
      auth: s.user ? { user: s.user, pass: decrypt(s.passwordEnc) } : undefined,
    });
    await t.sendMail({ from: `"${s.fromName || "Filoi Ops"}" <${s.fromEmail}>`, to: to.join(", "), subject, html });
    return { status: "SENT" };
  } catch (e) {
    return { status: "FAILED", error: e instanceof Error ? e.message : String(e) };
  }
}

/** Send once per dedupeKey; logs every attempt. */
export async function sendOnce(dedupeKey: string, kind: string, to: string[], subject: string, html: string) {
  const prior = await db.notificationLog.findUnique({ where: { dedupeKey } });
  if (prior?.status === "SENT") return null; // unsent (no SMTP yet) or failed → retried on the next run
  const r = await sendMail(to, subject, html);
  await db.notificationLog.upsert({
    where: { dedupeKey },
    create: { dedupeKey, kind, subject, recipients: to.join(", "), status: r.status, error: r.error },
    update: { status: r.status, error: r.error, recipients: to.join(", "), createdAt: new Date() },
  });
  return r;
}

export function emailShell(title: string, body: string, link?: { href: string; label: string }) {
  return `<div style="font-family:Segoe UI,Arial,sans-serif;background:#f3f5fa;padding:24px">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #dfe4ef">
    <div style="background:#0f2550;color:#fff;padding:16px 20px;font-weight:600">Filoi Ops</div>
    <div style="padding:20px;color:#0f2550">
      <h2 style="margin:0 0 12px;font-size:18px">${title}</h2>
      ${body}
      ${link ? `<p style="margin-top:20px"><a href="${link.href}" style="background:#8a2c8d;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${link.label}</a></p>` : ""}
    </div>
    <div style="padding:12px 20px;font-size:12px;color:#4a5878;border-top:1px solid #dfe4ef">Automated reminder from Filoi Ops · Filoi Private Limited</div>
  </div></div>`;
}
