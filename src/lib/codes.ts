import { db } from "./db";
import { getSetting } from "./settings";

/** Indian financial year label for a date, e.g. 2026-27 */
export function fyLabel(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

async function nextSeq(prefix: string, find: (p: string) => Promise<string[]>) {
  const existing = await find(prefix);
  const max = existing.reduce((m, c) => {
    const n = parseInt(c.slice(prefix.length), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return max + 1;
}

export async function nextOpportunityCode() {
  const prefix = `BID-${new Date().getFullYear()}-`;
  const n = await nextSeq(prefix, async (p) =>
    (await db.opportunity.findMany({ where: { code: { startsWith: p } }, select: { code: true } })).map((r) => r.code),
  );
  return `${prefix}${String(n).padStart(3, "0")}`;
}

export async function nextProjectCode() {
  const prefix = `PRJ-${new Date().getFullYear()}-`;
  const n = await nextSeq(prefix, async (p) =>
    (await db.project.findMany({ where: { code: { startsWith: p } }, select: { code: true } })).map((r) => r.code),
  );
  return `${prefix}${String(n).padStart(3, "0")}`;
}

/** GST rule: invoice number max 16 chars, unique per financial year. e.g. FIL/26-27/007 */
export async function nextInvoiceNumber(issueDate: Date) {
  const company = await getSetting("company");
  const fy = fyLabel(issueDate).slice(2); // 26-27
  const prefix = `${company.invoicePrefix || "INV"}/${fy}/`;
  const n = await nextSeq(prefix, async (p) =>
    (await db.invoice.findMany({ where: { number: { startsWith: p } }, select: { number: true } })).map((r) => r.number),
  );
  return `${prefix}${String(n).padStart(3, "0")}`;
}
