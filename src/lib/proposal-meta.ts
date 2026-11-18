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
