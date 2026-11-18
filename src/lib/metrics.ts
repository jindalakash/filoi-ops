import { db } from "./db";
import { num } from "./format";
import { toINR } from "./fx";
import type { FxSettings } from "./settings";

export type CurrencyTotals = Record<string, number>;
const add = (t: CurrencyTotals, c: string, v: number) => { t[c] = (t[c] ?? 0) + v; };
export const sumINR = (t: CurrencyTotals, fx: FxSettings) => Object.entries(t).reduce((a, [c, v]) => a + toINR(v, c, fx), 0);

/** Company-wide money picture, by currency */
export async function financeSnapshot() {
  const [projects, invoices, milestones, pipeline] = await Promise.all([
    db.project.findMany({ where: { status: { in: ["ACTIVE", "ON_HOLD"] } }, select: { contractValue: true, currency: true, id: true } }),
    db.invoice.findMany({ where: { status: { in: ["SENT", "PARTIALLY_PAID", "PAID"] } }, include: { payments: true, client: true, project: { select: { status: true } } } }),
    db.milestone.findMany({ where: { status: "PLANNED", project: { status: { in: ["ACTIVE", "ON_HOLD"] } } }, include: { project: { select: { currency: true } } } }),
    db.opportunity.findMany({ where: { status: { in: ["SUBMITTED", "UNDER_EVALUATION"] } }, select: { estimatedValue: true, currency: true } }),
  ]);
  const activeContract: CurrencyTotals = {}, invoicedActive: CurrencyTotals = {}, invoiced: CurrencyTotals = {}, received: CurrencyTotals = {}, outstanding: CurrencyTotals = {}, toInvoice: CurrencyTotals = {}, awaitingAward: CurrencyTotals = {}, tds: CurrencyTotals = {};
  const activeIds = new Set(projects.map((p) => p.id));
  for (const p of projects) add(activeContract, p.currency, num(p.contractValue));
  const today = Date.now();
  const ageing = { current: {} as CurrencyTotals, d30: {} as CurrencyTotals, d60: {} as CurrencyTotals, d90: {} as CurrencyTotals, d90p: {} as CurrencyTotals };
  for (const i of invoices) {
    const settled = i.payments.reduce((a, p) => a + num(p.amount) + num(p.tds) + num(p.bankCharges), 0);
    const got = i.payments.reduce((a, p) => a + num(p.amount), 0);
    add(invoiced, i.currency, num(i.subtotal));
    if (activeIds.has(i.projectId)) add(invoicedActive, i.currency, num(i.subtotal));
    add(received, i.currency, got);
    add(tds, i.currency, i.payments.reduce((a, p) => a + num(p.tds), 0));
    const bal = Math.max(0, num(i.total) - settled);
    if (bal > 0.009) {
      add(outstanding, i.currency, bal);
      const overdue = i.dueDate ? Math.floor((today - i.dueDate.getTime()) / 86400000) : 0;
      const bucket = overdue <= 0 ? ageing.current : overdue <= 30 ? ageing.d30 : overdue <= 60 ? ageing.d60 : overdue <= 90 ? ageing.d90 : ageing.d90p;
      add(bucket, i.currency, bal);
    }
  }
  for (const m of milestones) add(toInvoice, m.project.currency, num(m.amount));
  for (const o of pipeline) add(awaitingAward, o.currency, num(o.estimatedValue));
  // contract value not yet invoiced on active projects
  const unbilled: CurrencyTotals = {};
  for (const c of Object.keys(activeContract)) unbilled[c] = Math.max(0, (activeContract[c] ?? 0) - (invoicedActive[c] ?? 0));
  return { activeContract, invoiced, received, outstanding, toInvoice, awaitingAward, unbilled, tds, ageing, pipelineCount: pipeline.length };
}
