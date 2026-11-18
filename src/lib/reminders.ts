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
    where: { status: { in: ["DRAFT", "IN_REVIEW"] }, submissionDeadline: { not: null } },
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

  console.log("[reminders]", summary);
  return summary;
}
