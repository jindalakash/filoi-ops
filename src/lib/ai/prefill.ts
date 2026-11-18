import type { Opportunity } from "@prisma/client";
import type { TenderExtraction } from "./schemas";
import type { NewClientHint } from "@/components/OpportunityForm";

const CURR = ["USD", "EUR", "INR"];

// Models sometimes emit typographic hyphens (U+2010–2015, U+2212) inside dates and codes.
export const dashes = (s?: string | null) => (s == null ? s : s.replace(/[\u2010-\u2015\u2212]/g, "-"));

function toDate(raw?: string | null) {
  const s = dashes(raw);
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);
  return isNaN(d.getTime()) ? null : d;
}
const norm = (s?: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const bullets = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");

/** Match the client named in the TOR against existing clients */
export function matchClient(t: Pick<TenderExtraction, "client_name" | "client_short_name">, clients: { id: string; name: string; shortName?: string | null }[]) {
  const n = norm(t.client_name), sn = norm(t.client_short_name);
  return (
    clients.find((c) => norm(c.name) === n) ??
    clients.find((c) => sn && (norm(c.shortName) === sn || norm(c.name) === sn)) ??
    clients.find((c) => n && norm(c.name).length > 4 && (n.includes(norm(c.name)) || norm(c.name).includes(n)))
  );
}

/** AI tender reading → proposal form values. `base` (an existing proposal) wins where it already has a value. */
export function tenderPrefill(t: TenderExtraction, clients: { id: string; name: string; shortName?: string | null }[], base?: Partial<Opportunity>) {
  const client = matchClient(t, clients);
  const scope = [t.scope_summary, t.expected_deliverables.length ? `Expected deliverables:\n${bullets(t.expected_deliverables.map((d) => (d.timing ? `${d.title} (${d.timing})` : d.title)))}` : ""].filter(Boolean).join("\n\n");
  const notes = [
    t.key_experts.length ? `Key experts required:\n${bullets(t.key_experts)}` : "",
    t.risks.length ? `Watch-outs:\n${bullets(t.risks)}` : "",
    t.deadline_timezone ? `Deadline time zone: ${t.deadline_timezone}` : "",
  ].filter(Boolean).join("\n\n");
  const ai: Partial<Opportunity> = {
    title: t.title,
    clientId: client?.id,
    referenceNo: dashes(t.reference_no),
    source: t.source && !/\.(pdf|docx?|txt)$/i.test(t.source) ? t.source : null,
    currency: t.currency && CURR.includes(t.currency) ? t.currency : undefined,
    estimatedValue: (t.budget ?? null) as unknown as Opportunity["estimatedValue"],
    emdAmount: (t.emd_amount ?? null) as unknown as Opportunity["emdAmount"],
    durationMonths: t.duration_months,
    evaluationMethod: t.evaluation_method,
    technicalWeight: t.technical_weight,
    financialWeight: t.financial_weight,
    submissionDeadline: toDate(t.submission_deadline),
    queryDeadline: toDate(t.query_deadline),
    preBidDate: toDate(t.pre_bid_date),
    scopeSummary: scope || null,
    eligibility: t.eligibility || null,
    requiredDocuments: t.required_documents.join("\n") || null,
    notes: notes || null,
  };
  const merged: Partial<Opportunity> = { ...ai };
  if (base) {
    for (const [k, v] of Object.entries(base)) if (v !== null && v !== undefined && v !== "") (merged as Record<string, unknown>)[k] = v;
    // currency always has a default; prefer the tender's when no value was entered yet
    if (base.estimatedValue == null && ai.currency) merged.currency = ai.currency;
  }
  const newClient: NewClientHint | undefined = !merged.clientId && t.client_name
    ? { name: dashes(t.client_name)!, shortName: dashes(t.client_short_name), country: t.client_country?.replace(/\s*\(.*\)\s*/, "").trim() || null }
    : undefined;
  return { o: merged, newClient, matchedClient: client };
}
