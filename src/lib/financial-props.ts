import { db } from "./db";
import { getSetting } from "./settings";
import { num } from "./format";

/** Everything FinancialEditor needs for one proposal. */
export async function financialEditorProps(opportunityId: string) {
  const [o, fx] = await Promise.all([
    db.opportunity.findUniqueOrThrow({ where: { id: opportunityId }, include: { finLines: { orderBy: { seq: "asc" } }, team: { include: { expert: true }, orderBy: { seq: "asc" } } } }),
    getSetting("fx"),
  ]);
  return {
    currency: o.currency,
    taxRate: num(o.finTaxRate),
    notes: o.finNotes ?? "",
    fx,
    initial: o.finLines.map((l) => ({ category: l.category, description: l.description, expertId: l.expertId, unit: l.unit, quantity: num(l.quantity), rate: num(l.rate) })),
    team: o.team.map((m) => ({ expertId: m.expertId, name: m.expert.name, position: m.position, days: m.inputDays ? num(m.inputDays) : null, rate: m.expert.dailyRate ? num(m.expert.dailyRate) : null, rateCurrency: m.expert.rateCurrency })),
  };
}
