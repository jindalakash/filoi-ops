import { db } from "./db";
import { getSetting } from "./settings";
import { sendOnce, emailShell } from "./email";
import { daysUntil, date, money, splitEmails } from "./format";

const APP_URL = () => process.env.APP_URL || "http://localhost:3000";

function parseDays(s: string) {
  return s.split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
}

function unique(...lists: (string | null | undefined | string[])[]) {
  const all = lists.flatMap((l) => (Array.isArray(l) ? l : splitEmails(l)));
  return [...new Set(all.map((e) => e.toLowerCase()))];
}

function trigger(due: Date | null, before: number[], after: number[]) {
  const d = daysUntil(due);
  if (d === null) return null;
  if (d >= 0 && before.includes(d)) return { tag: `pre${d}`, d };
  if (d < 0 && after.includes(-d)) return { tag: `post${-d}`, d };
  return null;
}

function whenText(d: number) {
  return d === 0 ? "is due <b>today</b>" : d > 0 ? `is due in <b>${d} day${d > 1 ? "s" : ""}</b>` : `is <b style="color:#b42318">${-d} day${d < -1 ? "s" : ""} overdue</b>`;
}

export async function runReminders() {
  const cfg = await getSetting("reminders");
  const summary = { checked: 0, sent: 0, skipped: 0, failed: 0 };
  if (!cfg.enabled) return summary;
  const defaultBefore = parseDays(cfg.defaultDays);
  const after = parseDays(cfg.overdueDays);

  const tally = (r: Awaited<ReturnType<typeof sendOnce>>) => {
    if (!r) return;
    if (r.status === "SENT") summary.sent++;
    else if (r.status === "FAILED") summary.failed++;
    else summary.skipped++;
  };

  // 1. Deliverables
  const deliverables = await db.deliverable.findMany({
    where: { status: { not: "ACCEPTED" }, dueDate: { not: null }, project: { status: "ACTIVE" } },
    include: { project: { include: { client: true, manager: true } }, owner: true },
  });
  for (const dl of deliverables) {
    summary.checked++;
    const before = dl.project.reminderDays ? parseDays(dl.project.reminderDays) : defaultBefore;
    const t = trigger(dl.dueDate, before, after);
    if (!t) continue;
    const to = unique(dl.project.alertEmails, dl.alertEmails, dl.owner?.email ? [dl.owner.email] : [], dl.project.manager?.email ? [dl.project.manager.email] : []);
    const subject = `[${dl.project.code}] Deliverable ${t.d < 0 ? "overdue" : "due"}: ${dl.title}`;
    const html = emailShell(
      `Deliverable ${t.d < 0 ? "overdue" : "reminder"}`,
      `<p><b>${dl.title}</b> for <b>${dl.project.title}</b> (${dl.project.client.name}) ${whenText(t.d)} — due ${date(dl.dueDate)}.</p>
       <p>Status: ${dl.status.replace("_", " ").toLowerCase()} · Owner: ${dl.owner?.name ?? "unassigned"}</p>`,
      { href: `${APP_URL()}/projects/${dl.projectId}`, label: "Open project" },
    );
    tally(await sendOnce(`dl:${dl.id}:${date(dl.dueDate)}:${t.tag}`, "deliverable", to, subject, html));
  }

  // 2. Billing milestones not yet invoiced
  const milestones = await db.milestone.findMany({
    where: { status: "PLANNED", dueDate: { not: null }, project: { status: "ACTIVE" } },
    include: { project: { include: { client: true, manager: true } } },
  });
  for (const m of milestones) {
    summary.checked++;
    const before = m.project.reminderDays ? parseDays(m.project.reminderDays) : defaultBefore;
    const t = trigger(m.dueDate, before, after);
    if (!t) continue;
    const to = unique(m.project.alertEmails, cfg.digestEmails);
    const subject = `[${m.project.code}] Invoice ${t.d < 0 ? "overdue to raise" : "to be raised"}: ${m.title} (${money(m.amount, m.project.currency)})`;
    const html = emailShell(
      "Invoicing reminder",
      `<p>Billing milestone <b>${m.title}</b> on <b>${m.project.title}</b> (${m.project.client.name}) ${whenText(t.d)} for invoicing.</p>
       <p>Amount: <b>${money(m.amount, m.project.currency)}</b> · Planned date: ${date(m.dueDate)}</p>`,
      { href: `${APP_URL()}/projects/${m.projectId}?tab=billing`, label: "Raise invoice" },
    );
    tally(await sendOnce(`ms:${m.id}:${date(m.dueDate)}:${t.tag}`, "milestone", to, subject, html));
  }

  // 3. Unpaid invoices (payment due)
  const invoices = await db.invoice.findMany({
    where: { status: { in: ["SENT", "PARTIALLY_PAID"] }, dueDate: { not: null } },
    include: { project: true, client: true },
  });
  for (const inv of invoices) {
    summary.checked++;
    const t = trigger(inv.dueDate, [0], after);
    if (!t) continue;
    const to = unique(inv.project.alertEmails, cfg.digestEmails);
    const subject = `Payment ${t.d < 0 ? "overdue" : "due"}: ${inv.number} – ${inv.client.name} (${money(inv.total, inv.currency)})`;
    const html = emailShell(
      "Payment follow-up",
      `<p>Invoice <b>${inv.number}</b> to <b>${inv.client.name}</b> for <b>${money(inv.total, inv.currency)}</b> ${whenText(t.d)} (due ${date(inv.dueDate)}).</p>`,
      { href: `${APP_URL()}/finance/invoices/${inv.id}`, label: "Open invoice" },
    );
    tally(await sendOnce(`inv:${inv.id}:${date(inv.dueDate)}:${t.tag}`, "invoice", to, subject, html));
  }

  // 4. Proposal submission deadlines
  const opps = await db.opportunity.findMany({
    where: { status: { in: ["DRAFT", "IN_REVIEW", "READY_TO_SUBMIT"] }, submissionDeadline: { not: null } },
    include: { client: true, owner: true },
  });
  for (const o of opps) {
    summary.checked++;
    const t = trigger(o.submissionDeadline, [...new Set([...defaultBefore, 1])], []);
    if (!t) continue;
    const to = unique(o.alertEmails, o.owner?.email ? [o.owner.email] : [], cfg.digestEmails);
    const subject = `[${o.code}] Proposal submission ${t.d === 0 ? "TODAY" : `in ${t.d} days`}: ${o.title}`;
    const html = emailShell(
      "Proposal deadline",
      `<p>The proposal <b>${o.title}</b> for <b>${o.client.name}</b> ${whenText(t.d)} — deadline ${date(o.submissionDeadline)}.</p>`,
      { href: `${APP_URL()}/opportunities/${o.id}`, label: "Open proposal" },
    );
    tally(await sendOnce(`opp:${o.id}:${date(o.submissionDeadline)}:${t.tag}`, "proposal", to, subject, html));
  }

  // 5. Proposal tasks (assignee; reviewer while it waits for review)
  const tasks = await db.proposalTask.findMany({
    where: { status: { not: "APPROVED" }, dueDate: { not: null }, opportunity: { status: { in: ["DRAFT", "IN_REVIEW", "READY_TO_SUBMIT"] } } },
    include: { assignee: true, reviewer: true, opportunity: true },
  });
  for (const t of tasks) {
    summary.checked++;
    const tr = trigger(t.dueDate, [2, 0], after);
    if (!tr) continue;
    const who = t.status === "IN_REVIEW" ? t.reviewer : t.assignee;
    if (!who?.email) continue;
    const verb = t.status === "IN_REVIEW" ? "review" : "complete";
    const subject = `[${t.opportunity.code}] Task ${tr.d < 0 ? "overdue" : "due"}: ${t.title}`;
    const html = emailShell(
      tr.d < 0 ? "Task overdue" : "Task reminder",
      `<p>Please ${verb} <b>${t.title}</b> for <b>${t.opportunity.title}</b> — it ${whenText(tr.d)} (due ${date(t.dueDate)}).</p>`,
      { href: `${APP_URL()}/tasks/${t.id}`, label: "Open task" },
    );
    tally(await sendOnce(`task:${t.id}:${date(t.dueDate)}:${t.status}:${tr.tag}`, "task", [who.email], subject, html));
  }

  // 6. Delivery tasks & client issues → the assignee (or whoever logged it), by email and in the bell
  const work = await db.workItem.findMany({
    where: { status: { category: { not: "DONE" } }, dueDate: { not: null }, project: { status: "ACTIVE" } },
    include: { assignee: true, reporter: true, project: true, deliverable: true },
  });
  for (const w of work) {
    summary.checked++;
    const tr = trigger(w.dueDate, [1, 0], after);
    if (!tr) continue;
    const who = w.assignee?.active ? w.assignee : w.reporter;
    if (!who?.email) continue;
    const key = `W-${w.number}`;
    const what = w.type === "ISSUE" ? "Client issue" : "Task";
    const title = `${key} ${tr.d < 0 ? "overdue" : tr.d === 0 ? "due today" : "due tomorrow"}: ${w.title}`;
    const subject = `[${w.project.code}] ${what} ${title}`;
    const html = emailShell(
      tr.d < 0 ? `${what} overdue` : `${what} reminder`,
      `<p><b>${w.title}</b> (${key}) for <b>${w.project.title}</b>${w.deliverable ? ` · ${w.deliverable.title}` : ""} ${whenText(tr.d)} — due ${date(w.dueDate)}.</p>${w.assignee ? "" : "<p>It has no assignee yet.</p>"}`,
      { href: `${APP_URL()}/work/${w.number}`, label: "Open task" },
    );
    const r = await sendOnce(`work:${w.id}:${date(w.dueDate)}:${tr.tag}`, "work", [who.email], subject, html);
    const seen = await db.notification.findFirst({ where: { userId: who.id, kind: "DUE", title }, select: { id: true } });
    if (!seen) await db.notification.create({ data: { userId: who.id, kind: "DUE", title, body: w.project.code, href: `/work/${w.number}` } });
    tally(r);
  }

  console.log("[reminders]", summary);
  return summary;
}

/** Monday: one email per person — overdue, due this week, and everything else open. */
export async function runWeeklyDigest() {
  const cfg = await getSetting("reminders");
  if (!cfg.enabled || cfg.weeklyDigest === false) return { sent: 0 };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
  const weekTag = today.toISOString().slice(0, 10);
  const users = await db.user.findMany({ where: { active: true } });
  let sent = 0;
  for (const u of users) {
    const [work, parts] = await Promise.all([
      db.workItem.findMany({ where: { assigneeId: u.id, status: { category: { not: "DONE" } }, project: { status: "ACTIVE" } }, include: { project: true }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }] }),
      db.proposalTask.findMany({ where: { assigneeId: u.id, status: { in: ["TODO", "IN_PROGRESS", "CHANGES_REQUESTED"] }, opportunity: { status: { in: ["DRAFT", "IN_REVIEW", "READY_TO_SUBMIT"] } } }, include: { opportunity: true }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }] }),
    ]);
    const rows = [
      ...work.map((w) => ({ due: w.dueDate, label: `W-${w.number} ${w.title}`, ctx: w.project.code, href: `${APP_URL()}/work/${w.number}` })),
      ...parts.map((t) => ({ due: t.dueDate, label: t.title, ctx: `${t.opportunity.code} (proposal)`, href: `${APP_URL()}/tasks/${t.id}` })),
    ];
    if (!rows.length || !u.email) continue;
    const overdue = rows.filter((r) => r.due && r.due < today);
    const thisWeek = rows.filter((r) => r.due && r.due >= today && r.due < weekEnd);
    const later = rows.filter((r) => !r.due || r.due >= weekEnd);
    const esc = (x: string) => x.replace(/</g, "&lt;");
    const list = (title: string, xs: typeof rows, colour = "#0f2550") => xs.length ? `<h3 style="font-size:14px;margin:18px 0 6px;color:${colour}">${title} (${xs.length})</h3><ul style="padding-left:18px;margin:0">${xs.slice(0, 25).map((r) => `<li style="margin:3px 0"><a href="${r.href}">${esc(r.label)}</a> <span style="color:#4a5878">· ${r.ctx}${r.due ? ` · ${date(r.due)}` : ""}</span></li>`).join("")}</ul>${xs.length > 25 ? `<p style="color:#4a5878">…and ${xs.length - 25} more</p>` : ""}` : "";
    const body = `<p>Good morning ${esc(u.name.split(" ")[0])}, here's your week.</p>${list("Overdue", overdue, "#b42318")}${list("Due this week", thisWeek)}${list("Other open work", later)}`;
    const subject = `Your week: ${overdue.length ? `${overdue.length} overdue, ` : ""}${thisWeek.length} due this week`;
    const r = await sendOnce(`digest:${u.id}:${weekTag}`, "digest", [u.email], subject, emailShell("Your week at Filoi", body, { href: `${APP_URL()}/tasks`, label: "Open my tasks" }));
    if (r?.status === "SENT") sent++;
  }
  console.log("[digest]", { sent });
  return { sent };
}
