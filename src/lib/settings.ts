import { db } from "./db";

export type CompanySettings = {
  name: string;
  legalName: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  state: string;
  stateCode: string;
  gstin: string;
  pan: string;
  cin: string;
  lutNumber: string; // LUT ARN for zero-rated exports
  lutValidity: string;
  defaultSac: string;
  invoicePrefix: string;
  paymentTermsDays: number;
  bankDetails: string; // free text printed on invoice (beneficiary, account, SWIFT, IFSC...)
  invoiceFooter: string;
};

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passwordEnc: string;
  fromName: string;
  fromEmail: string;
};

export type ReminderSettings = {
  enabled: boolean;
  defaultDays: string; // "5,2,0"
  overdueDays: string; // "1,7,14"
  hour: number; // 24h
  digestEmails: string;
  weeklyDigest?: boolean; // Monday summary of each person's open tasks
};

/** Task templates per deliverable type. daysBefore: days before the deliverable's due date (negative = after). */
export type TemplateTask = { title: string; daysBefore: number };
export type TaskTemplateSettings = { auto: boolean; types: Record<string, TemplateTask[]> };

export type FxSettings = { USD: number; EUR: number; INR: number }; // value of 1 unit in INR

export type AiSettings = {
  enabled: boolean;
  provider: "anthropic" | "openai" | "gemini" | "ollama";
  model: string; // main model: TOR / RFP reading and proposal drafting
  lightModel: string; // cheaper model for CVs and contracts ("" = use the main model)
  apiKeyEnc: string;
  baseUrl: string;
};

export type BackupSettings = {
  enabled: boolean;
  hour: number; // 24h, server time
  keepDaily: number;
  keepWeekly: number;
  copyDir: string; // optional second folder (e.g. a Google Drive / external disk folder)
  lastRunAt: string;
  lastStatus: string; // OK | FAILED
  lastError: string;
  lastFile: string;
  lastSize: number;
};

export type CashflowSettings = {
  openingBalance: number; // INR, bank balance on openingDate
  openingDate: string; // YYYY-MM-DD
  paymentDelayDays: number; // default days from invoice to payment
  monthlyCosts: { label: string; amount: number }[]; // INR per month
};

const DEFAULTS = {
  company: {
    name: "Filoi",
    legalName: "Filoi Private Limited",
    website: "www.filoi.in",
    email: "",
    phone: "",
    address: "",
    state: "",
    stateCode: "",
    gstin: "",
    pan: "",
    cin: "",
    lutNumber: "",
    lutValidity: "",
    defaultSac: "998311",
    invoicePrefix: "FIL",
    paymentTermsDays: 30,
    bankDetails: "",
    invoiceFooter: "Thank you for your business.",
  } as CompanySettings,
  smtp: { host: "", port: 587, secure: false, user: "", passwordEnc: "", fromName: "Filoi Ops", fromEmail: "" } as SmtpSettings,
  reminders: { enabled: true, defaultDays: "5,2,0", overdueDays: "1,7,14", hour: 8, digestEmails: "", weeklyDigest: true } as ReminderSettings,
  fx: { USD: 84, EUR: 91, INR: 1 } as FxSettings,
  ai: { enabled: false, provider: "anthropic", model: "claude-opus-5-5", lightModel: "claude-sonnet-5-5", apiKeyEnc: "", baseUrl: "" } as AiSettings,
  backup: { enabled: true, hour: 2, keepDaily: 14, keepWeekly: 8, copyDir: "", lastRunAt: "", lastStatus: "", lastError: "", lastFile: "", lastSize: 0 } as BackupSettings,
  taskTemplates: {
    auto: true,
    types: {
      REPORT: [{ title: "Collect data & updates from the team", daysBefore: 7 }, { title: "Draft report", daysBefore: 4 }, { title: "Internal review", daysBefore: 2 }, { title: "Finalise & send to client", daysBefore: 0 }],
      DOCUMENT: [{ title: "Outline & agree structure", daysBefore: 14 }, { title: "Write first draft", daysBefore: 7 }, { title: "Internal quality review", daysBefore: 4 }, { title: "Revise & format", daysBefore: 2 }, { title: "Submit to client", daysBefore: 0 }],
      SYSTEM: [{ title: "Confirm requirements with client", daysBefore: 21 }, { title: "Build / configure", daysBefore: 10 }, { title: "Test (incl. client UAT)", daysBefore: 5 }, { title: "Deploy & hand over documentation", daysBefore: 0 }],
      TRAINING: [{ title: "Agenda & training materials", daysBefore: 14 }, { title: "Logistics & invitations", daysBefore: 7 }, { title: "Deliver training", daysBefore: 0 }, { title: "Training report & attendance", daysBefore: -5 }],
      DATA: [{ title: "Collect data", daysBefore: 14 }, { title: "Clean & validate", daysBefore: 7 }, { title: "Document & submit dataset", daysBefore: 0 }],
      OTHER: [],
    },
  } as TaskTemplateSettings,
  cashflow: { openingBalance: 0, openingDate: "", paymentDelayDays: 30, monthlyCosts: [] } as CashflowSettings,
};

type Defaults = typeof DEFAULTS;

export async function getSetting<K extends keyof Defaults>(key: K): Promise<Defaults[K]> {
  const row = await db.setting.findUnique({ where: { key } });
  return { ...DEFAULTS[key], ...((row?.value as object) ?? {}) } as Defaults[K];
}

export async function saveSetting<K extends keyof Defaults>(key: K, value: Partial<Defaults[K]>) {
  const current = await getSetting(key);
  const merged = { ...current, ...value };
  await db.setting.upsert({
    where: { key },
    create: { key, value: merged as object },
    update: { value: merged as object },
  });
  return merged;
}
