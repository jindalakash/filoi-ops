import { db } from "./db";
import { getSetting } from "./settings";
import { readStored } from "./files";
import { documentText } from "./ai/text";
import { date } from "./format";

const cap = (s: string | null | undefined, n: number) => (s ? (s.length > n ? `${s.slice(0, n)}\n[…truncated]` : s) : "");
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);

/** Everything the AI needs to draft a proposal section, assembled from this app's data. */
export async function proposalContext(opportunityId: string, sectionId?: string) {
  const [o, company, sections, team, refs, library] = await Promise.all([
    db.opportunity.findUniqueOrThrow({ where: { id: opportunityId }, include: { client: true, documents: { where: { category: { in: ["TOR", "RFP"] } } } } }),
    getSetting("company"),
    db.proposalSection.findMany({ where: { opportunityId }, orderBy: { seq: "asc" } }),
    db.proposalTeamMember.findMany({ where: { opportunityId }, include: { expert: true }, orderBy: { seq: "asc" } }),
    db.proposalReference.findMany({ where: { opportunityId }, include: { reference: true }, orderBy: { seq: "asc" } }),
    db.libraryItem.findMany({ where: { kind: { in: ["PAST_PROPOSAL", "COMPANY_PROFILE"] }, textContent: { not: null } } }),
  ]);

  let tor = "";
  for (const d of o.documents) {
    try {
      tor += `\n--- ${d.fileName} ---\n${await documentText({ fileName: d.fileName, mimeType: d.mimeType ?? "", buffer: await readStored(d.storedName) })}`;
    } catch { /* unreadable file: skip */ }
  }

  const profile = library.filter((l) => l.kind === "COMPANY_PROFILE").map((l) => cap(l.textContent, 12_000)).join("\n\n");
  // pick the two past proposals most similar to this tender
  const target = words(`${o.title} ${o.scopeSummary ?? ""} ${tor.slice(0, 20_000)}`);
  const examples = library
    .filter((l) => l.kind === "PAST_PROPOSAL")
    .map((l) => ({ l, score: [...words(`${l.title} ${l.tags ?? ""} ${(l.textContent ?? "").slice(0, 30_000)}`)].filter((w) => target.has(w)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ l }) => `--- Past proposal: ${l.title} ---\n${cap(l.textContent, 25_000)}`)
    .join("\n\n");

  // Stable part first (same bytes for every section → prompt-cacheable); other sections change as you write, so they go separately.
  const stableBlocks = [
    `=== OUR COMPANY ===\n${company.legalName} (${company.website}), ${company.address.replace(/\n/g, ", ")}.\n${profile || "(No company profile in the library yet.)"}`,
    `=== THE TENDER ===\nTitle: ${o.title}\nClient: ${o.client.name}\nReference: ${o.referenceNo ?? "—"}\nSubmission deadline: ${date(o.submissionDeadline)}\nDuration: ${o.durationMonths ?? "?"} months\nEvaluation: ${o.evaluationMethod ?? "—"} ${o.technicalWeight ? `(technical ${o.technicalWeight} / financial ${o.financialWeight})` : ""}\nScope summary:\n${o.scopeSummary ?? "—"}\nEligibility:\n${o.eligibility ?? "—"}\n${tor ? `\nFull TOR / RFP text:\n${cap(tor, 150_000)}` : "(TOR document not uploaded — rely on the summary.)"}`,
    team.length ? `=== PROPOSED TEAM ===\n${team.map((t) => `- ${t.position}${t.isKey ? " (key expert)" : ""}: ${t.expert.name}, ${t.expert.title ?? ""}, ${t.expert.yearsExperience ?? "?"} yrs. ${t.inputDays ? `Planned input on this assignment: ${t.inputDays} days. ` : ""}${cap(t.expert.summary, 800)}`).join("\n")}` : "=== PROPOSED TEAM ===\n(Not selected yet.)",
    refs.length ? `=== RELEVANT EXPERIENCE (use only these) ===\n${refs.map(({ reference: r }) => `- ${r.title} — ${r.client}${r.country ? `, ${r.country}` : ""} (${r.startDate?.getFullYear() ?? "?"}–${r.endDate?.getFullYear() ?? "ongoing"}). ${cap(r.description, 600)}`).join("\n")}` : "=== RELEVANT EXPERIENCE ===\n(None selected.)",
    examples ? `=== STYLE EXAMPLES: our past proposals (match tone and structure; do NOT copy client-specific facts) ===\n${examples}` : "",
  ].filter(Boolean);
  const others = sections.filter((s) => s.id !== sectionId);
  const volatile = others.length ? `=== OTHER SECTIONS OF THIS PROPOSAL (for consistency) ===\n${others.map((s) => `## ${s.title}\n${cap(s.content, 700) || "(not written yet)"}`).join("\n\n")}` : "";
  return { stable: stableBlocks.join("\n\n"), volatile, opportunity: o };
}

export const DRAFT_SYSTEM = `You are a senior proposal writer at Filoi Private Limited, an Indian consulting firm in public health, digital health (DHIS2) and data systems that bids for UN agencies, development banks and governments.
Write persuasive, specific, evaluator-friendly proposal text in British English.
Rules:
- Respond to what the TOR asks, using its terminology, objectives and deliverables.
- Use only facts given to you about Filoi, its team and its past assignments. Never invent projects, clients, numbers, certifications, rosters or names. Where a needed fact is missing, write a clear placeholder like [add number of DHIS2 implementations].
- The TOR's eligibility / qualification requirements are what the client asks for, not facts about Filoi — never state that Filoi meets them unless OUR COMPANY, the team or the experience list shows it.
- An expert's "planned input" is their allocation on this assignment, not past experience.
- Structure with short paragraphs, ### sub-headings and bullet lists where they help an evaluator score the section. No title line for the section itself.
- No preamble or closing remarks — output only the section text.`;
