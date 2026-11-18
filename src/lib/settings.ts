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
};

export type FxSettings = { USD: number; EUR: number; INR: number }; // value of 1 unit in INR

export type AiSettings = {
  enabled: boolean;
  provider: "anthropic" | "openai" | "gemini" | "ollama";
  model: string;
  apiKeyEnc: string;
  baseUrl: string;
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
  reminders: { enabled: true, defaultDays: "5,2,0", overdueDays: "1,7,14", hour: 8, digestEmails: "" } as ReminderSettings,
  fx: { USD: 84, EUR: 91, INR: 1 } as FxSettings,
  ai: { enabled: false, provider: "anthropic", model: "claude-sonnet-5-5", apiKeyEnc: "", baseUrl: "" } as AiSettings,
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
