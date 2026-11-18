// JSON Schemas for structured extraction. Every property is required and nullable
// where the document may not state it, so the model never has to guess.

const str = { type: ["string", "null"] };
const num = { type: ["number", "null"] };
const int = { type: ["integer", "null"] };
const currency = { type: ["string", "null"], description: "ISO currency code, e.g. USD, EUR, INR" };

const evidence = {
  type: "array",
  description: "Short verbatim quotes from the document backing the most important extracted values.",
  items: {
    type: "object",
    properties: { field: { type: "string" }, quote: { type: "string" }, page: int },
    required: ["field", "quote", "page"],
    additionalProperties: false,
  },
};

export const TENDER_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Assignment / tender title" },
    client_name: { type: "string", description: "Full name of the issuing organisation" },
    client_short_name: str,
    client_country: { ...str, description: "Country of the issuing office (e.g. Switzerland for WHO HQ)" },
    reference_no: str,
    source: { ...str, description: "Portal or channel if stated, e.g. UNGM" },
    submission_deadline: { ...str, description: "ISO 8601 local date-time, e.g. 2026-12-05T17:00" },
    deadline_timezone: { ...str, description: "Timezone as written, e.g. CET, Geneva time" },
    query_deadline: { ...str, description: "ISO date YYYY-MM-DD" },
    pre_bid_date: { ...str, description: "ISO date YYYY-MM-DD" },
    currency,
    budget: { ...num, description: "Indicative budget or ceiling if stated" },
    duration_months: int,
    emd_amount: { ...num, description: "Bid security / EMD amount if any" },
    evaluation_method: { ...str, description: "e.g. QCBS, LCS, QBS, lowest price" },
    technical_weight: int,
    financial_weight: int,
    scope_summary: { type: "string", description: "5–10 sentence plain-English summary of objectives and scope" },
    eligibility: { type: "string", description: "Bullet list (one per line, starting with '- ') of eligibility / qualification requirements" },
    required_documents: { type: "array", items: { type: "string" }, description: "Everything the bidder must submit" },
    expected_deliverables: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, timing: str },
        required: ["title", "timing"],
        additionalProperties: false,
      },
    },
    key_experts: { type: "array", items: { type: "string" }, description: "Required team positions with minimum qualifications" },
    risks: { type: "array", items: { type: "string" }, description: "Points the bid team should watch: tight timelines, liability, unusual terms, ambiguities" },
    evidence,
  },
  required: [
    "title", "client_name", "client_short_name", "client_country", "reference_no", "source", "submission_deadline", "deadline_timezone",
    "query_deadline", "pre_bid_date", "currency", "budget", "duration_months", "emd_amount", "evaluation_method", "technical_weight",
    "financial_weight", "scope_summary", "eligibility", "required_documents", "expected_deliverables", "key_experts", "risks", "evidence",
  ],
  additionalProperties: false,
} as const;

export type TenderExtraction = {
  title: string; client_name: string; client_short_name: string | null; client_country: string | null; reference_no: string | null; source: string | null;
  submission_deadline: string | null; deadline_timezone: string | null; query_deadline: string | null; pre_bid_date: string | null;
  currency: string | null; budget: number | null; duration_months: number | null; emd_amount: number | null; evaluation_method: string | null;
  technical_weight: number | null; financial_weight: number | null; scope_summary: string; eligibility: string; required_documents: string[];
  expected_deliverables: { title: string; timing: string | null }[]; key_experts: string[]; risks: string[];
  evidence: { field: string; quote: string; page: number | null }[];
};

const DL_TYPES = ["DOCUMENT", "SYSTEM", "REPORT", "TRAINING", "DATA", "OTHER"];

export const CONTRACT_SCHEMA = {
  type: "object",
  properties: {
    contract_no: str,
    contract_date: { ...str, description: "ISO date YYYY-MM-DD" },
    client_name: str,
    title: str,
    currency,
    contract_value: { ...num, description: "Total contract / PO ceiling value" },
    start_date: { ...str, description: "ISO date YYYY-MM-DD" },
    end_date: { ...str, description: "ISO date YYYY-MM-DD" },
    deliverables: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { ...str, description: "Short description / acceptance criteria" },
          type: { type: "string", enum: DL_TYPES },
          due_date: { ...str, description: "ISO date if stated or computable from the start date; otherwise null" },
          timing: { ...str, description: "Timing as written, e.g. 'Week 4' or '30 days after signature'" },
        },
        required: ["title", "description", "type", "due_date", "timing"],
        additionalProperties: false,
      },
    },
    payment_schedule: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "e.g. '1st instalment – on acceptance of inception report'" },
          percent: num,
          amount: num,
          deliverable_title: { ...str, description: "Exact title of the linked deliverable from the deliverables list, if any" },
          due_date: str,
        },
        required: ["title", "percent", "amount", "deliverable_title", "due_date"],
        additionalProperties: false,
      },
    },
    penalties: { ...str, description: "Liquidated damages / penalty clauses, summarised" },
    notes: { type: "array", items: { type: "string" }, description: "Other obligations worth tracking: reporting, insurance, bank guarantee, retention, tax clauses" },
    evidence,
  },
  required: ["contract_no", "contract_date", "client_name", "title", "currency", "contract_value", "start_date", "end_date", "deliverables", "payment_schedule", "penalties", "notes", "evidence"],
  additionalProperties: false,
} as const;

export type ContractExtraction = {
  contract_no: string | null; contract_date: string | null; client_name: string | null; title: string | null; currency: string | null;
  contract_value: number | null; start_date: string | null; end_date: string | null;
  deliverables: { title: string; description: string | null; type: string; due_date: string | null; timing: string | null }[];
  payment_schedule: { title: string; percent: number | null; amount: number | null; deliverable_title: string | null; due_date: string | null }[];
  penalties: string | null; notes: string[]; evidence: { field: string; quote: string; page: number | null }[];
};

export const CV_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    title: { ...str, description: "Current position / professional title" },
    email: str,
    phone: str,
    nationality: str,
    years_experience: { ...int, description: "Total years of professional experience" },
    expertise: { type: "array", items: { type: "string" }, description: "5–10 short expertise tags, e.g. DHIS2, immunization, M&E" },
    languages: { type: "array", items: { type: "string" } },
    education: { ...str, description: "Degrees with institution and year, one per line" },
    summary: { type: "string", description: "4–6 sentence professional summary" },
    key_projects: { type: "array", items: { type: "string" }, description: "Most relevant assignments: role, client, country, years" },
  },
  required: ["name", "title", "email", "phone", "nationality", "years_experience", "expertise", "languages", "education", "summary", "key_projects"],
  additionalProperties: false,
} as const;

export type CvExtraction = {
  name: string; title: string | null; email: string | null; phone: string | null; nationality: string | null; years_experience: number | null;
  expertise: string[]; languages: string[]; education: string | null; summary: string; key_projects: string[];
};
