import type { LibraryKind } from "@prisma/client";

export const KIND_LABEL: Record<LibraryKind, string> = { PAST_PROPOSAL: "Past technical proposal", FIN_TEMPLATE: "Financial proposal / budget", COMPANY_PROFILE: "Company profile", OTHER: "Other" };

export const STANDARD_SECTIONS: { title: string; guidance: string }[] = [
  { title: "Understanding of the assignment", guidance: "Context, objectives and our reading of the scope in the TOR; key challenges; how Filoi's experience fits." },
  { title: "Approach and methodology", guidance: "Overall approach, methods per objective / deliverable, tools (e.g. DHIS2), stakeholder engagement, data collection and analysis." },
  { title: "Work plan and timeline", guidance: "Phases and activities mapped to each deliverable and its due date; key milestones; level of effort." },
  { title: "Team organisation and staffing", guidance: "Roles of the proposed experts, management structure, backstopping by Filoi, communication with the client." },
  { title: "Relevant experience", guidance: "Similar assignments from the selected references: client, country, years, what we delivered and why it is relevant." },
  { title: "Quality assurance and risk management", guidance: "Internal QA and review steps, data protection, key risks with mitigation measures." },
];

export const COST_LABEL = { FEES: "Professional fees", TRAVEL: "Travel", PER_DIEM: "Per diem / DSA", OTHER: "Other direct costs" } as const;

export const WHOLE_TECHNICAL = "Complete technical proposal";
export const WHOLE_FINANCIAL = "Complete financial proposal";
export const TEAM_PART = "Team & CVs";
export const SUPPORT_PARTS = ["Compliance & declaration forms", "Company documents (registration, audited accounts)", "Final review & formatting"];

/** Parts offered when assigning work, grouped for the picker. */
export const PART_GROUPS: { label: string; items: string[] }[] = [
  { label: "Whole proposal", items: [WHOLE_TECHNICAL, WHOLE_FINANCIAL] },
  { label: "Technical sections", items: [...STANDARD_SECTIONS.map((s) => s.title), TEAM_PART] },
  { label: "Supporting documents", items: SUPPORT_PARTS },
];
export const SECTION_SUGGESTIONS: string[] = PART_GROUPS.flatMap((g) => g.items);

export type TaskScope = "SECTION" | "TECHNICAL" | "FINANCIAL" | "TEAM" | "OTHER";

/** What a part means: a section to write, the whole technical/financial proposal, the team, or supporting uploads. */
export function scopeForPart(title: string): TaskScope {
  const t = title.trim().toLowerCase();
  if (t === WHOLE_TECHNICAL.toLowerCase()) return "TECHNICAL";
  if (t === WHOLE_FINANCIAL.toLowerCase() || /financial proposal|budget/.test(t)) return "FINANCIAL";
  if (t === TEAM_PART.toLowerCase() || /\bcvs?\b|team composition/.test(t)) return "TEAM";
  if (SUPPORT_PARTS.some((p) => p.toLowerCase() === t) || /compliance|declaration|company document|registration|final review|formatting/.test(t)) return "OTHER";
  return "SECTION"; // standard or custom technical section
}
