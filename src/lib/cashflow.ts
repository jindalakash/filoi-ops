import { db } from "./db";
import { getSetting } from "./settings";
import { toINR } from "./fx";
import { num } from "./format";

export type CashItem = { date: Date; label: string; sub?: string; inr: number; kind: "IN" | "OUT"; source: "invoice" | "milestone" | "pipeline" | "entry" | "fixed"; href?: string; overdue?: boolean; entryId?: string };
export type CashMonth = { key: string; label: string; start: Date; invoices: number; milestones: number; pipeline: number; otherIn: number; fixed: number; otherOut: number; totalIn: number; totalOut: number; net: number; closing: number; items: CashItem[] };

const DAY = 86400000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Month-by-month cash forecast in INR, built from invoices, billing milestones, (optionally) pipeline, fixed costs and one-off entries. */
export async function cashForecast(horizon: number, includePipeline: boolean) {
  const [cfg, fx] = await Promise.all([getSetting("cashflow"), getSetting("fx")]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const months: CashMonth[] = Array.from({ length: horizon }, (_, i) => {
    const start = new Date(today.getFullYear(), today.getMonth() + i, 1);
    return { key: monthKey(start), label: start.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), start, invoices: 0, milestones: 0, pipeline: 0, otherIn: 0, fixed: 0, otherOut: 0, totalIn: 0, totalOut: 0, net: 0, closing: 0, items: [] };
  });
  const end = new Date(today.getFullYear(), today.getMonth() + horizon, 1);
  const bucket = (d: Date) => months.find((m) => m.key === monthKey(d));

  // how long each client actually takes to pay (invoice date → payment date)
  const paid = await db.payment.findMany({ include: { invoice: { select: { clientId: true, issueDate: true } } } });
  const delays = new Map<string, number[]>();
  for (const p of paid) { const d = Math.round((+p.date - +p.invoice.issueDate) / DAY); if (d >= 0 && d < 365) delays.set(p.invoice.clientId, [...(delays.get(p.invoice.clientId) ?? []), d]); }
  const delayFor = (clientId: string) => { const xs = delays.get(clientId); return xs?.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : cfg.paymentDelayDays || 30; };

  const items: CashItem[] = [];

  // 1. invoices sent but not fully paid
  const open = await db.invoice.findMany({ where: { status: { in: ["SENT", "PARTIALLY_PAID"] } }, include: { client: true, payments: true } });
  for (const i of open) {
    const bal = num(i.total) - i.payments.reduce((a, p) => a + num(p.amount) + num(p.tds) + num(p.bankCharges), 0);
    if (bal <= 0.01) continue;
    const expected = i.dueDate ?? addDays(i.issueDate, delayFor(i.clientId));
    const overdue = expected < today;
    items.push({ date: overdue ? today : expected, label: `Invoice ${i.number}`, sub: `${i.client.shortName || i.client.name}${overdue ? " · overdue" : ""}`, inr: toINR(bal, i.currency, fx), kind: "IN", source: "invoice", href: `/finance/invoices/${i.id}`, overdue });
  }

  // 2. billing milestones not yet invoiced: planned invoice date + the client's usual payment time
  const ms = await db.milestone.findMany({ where: { status: "PLANNED", project: { status: { in: ["ACTIVE", "ON_HOLD"] } } }, include: { project: { include: { client: true } } } });
  for (const m of ms) {
    const invDate = m.dueDate ?? m.project.endDate;
    if (!invDate) continue;
    const start = invDate < today ? today : invDate;
    const delay = delayFor(m.project.clientId);
    items.push({ date: addDays(start, delay), label: m.title, sub: `${m.project.code} · ${m.project.client.shortName || m.project.client.name} · invoice ${start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} + ${delay}d`, inr: toINR(m.amount, m.project.currency, fx), kind: "IN", source: "milestone", href: `/projects/${m.projectId}?tab=billing`, overdue: invDate < today });
  }

  // 3. pipeline (optional): submitted bids × win rate, spread over the assignment
  let winRate = 0;
  if (includePipeline) {
    const [won, lost] = await Promise.all([db.opportunity.count({ where: { status: "WON" } }), db.opportunity.count({ where: { status: "LOST" } })]);
    winRate = won + lost >= 3 ? won / (won + lost) : 0.3;
    const bids = await db.opportunity.findMany({ where: { status: { in: ["SUBMITTED", "UNDER_EVALUATION"] }, estimatedValue: { not: null } }, include: { client: true } });
    for (const o of bids) {
      const months_ = Math.max(1, o.durationMonths ?? 6);
      const award = addDays(o.submissionDeadline && o.submissionDeadline > today ? o.submissionDeadline : today, 60); // evaluation + contracting
      const perMonth = (toINR(o.estimatedValue, o.currency, fx) * winRate) / months_;
      for (let k = 1; k <= months_; k++) {
        const d = addDays(new Date(award.getFullYear(), award.getMonth() + k, 15), delayFor(o.clientId));
        items.push({ date: d, label: `${o.code} (weighted ${Math.round(winRate * 100)}%)`, sub: `${o.title} · ${o.client.shortName || o.client.name}`, inr: perMonth, kind: "IN", source: "pipeline", href: `/opportunities/${o.id}` });
      }
    }
  }

  // 4. one-off entries
  const entries = await db.cashEntry.findMany({ where: { date: { gte: months[0].start, lt: end } }, orderBy: { date: "asc" } });
  for (const e of entries) items.push({ date: e.date, label: e.description, inr: num(e.amountInr), kind: e.kind, source: "entry", entryId: e.id });

  for (const it of items) {
    const m = bucket(it.date);
    if (!m) continue;
    m.items.push(it);
    if (it.kind === "IN") { if (it.source === "invoice") m.invoices += it.inr; else if (it.source === "milestone") m.milestones += it.inr; else if (it.source === "pipeline") m.pipeline += it.inr; else m.otherIn += it.inr; }
    else m.otherOut += it.inr;
  }
  const fixedPerMonth = (cfg.monthlyCosts ?? []).reduce((a, c) => a + (Number(c.amount) || 0), 0);
  let bal = Number(cfg.openingBalance) || 0;
  for (const m of months) {
    m.fixed = fixedPerMonth;
    m.totalIn = m.invoices + m.milestones + m.pipeline + m.otherIn;
    m.totalOut = m.fixed + m.otherOut;
    m.net = m.totalIn - m.totalOut;
    bal += m.net;
    m.closing = bal;
    m.items.sort((a, b) => +a.date - +b.date);
  }
  const later = items.filter((i) => i.date >= end && i.kind === "IN" && i.source !== "pipeline").reduce((a, i) => a + i.inr, 0);
  return { months, cfg, winRate, fixedPerMonth, laterIn: later, hasOpening: !!cfg.openingDate };
}
