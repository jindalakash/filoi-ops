export const CURRENCIES = ["USD", "EUR", "INR"] as const;
export type Currency = (typeof CURRENCIES)[number];

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", INR: "₹" };

export function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  return typeof v === "number" ? v : Number(v as string);
}

export function money(v: unknown, currency = "USD", opts: { compact?: boolean } = {}) {
  const n = num(v);
  const locale = currency === "INR" ? "en-IN" : "en-US";
  if (opts.compact) {
    const f = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
    return `${SYMBOL[currency] ?? currency + " "}${f.format(n)}`;
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(n);
}

export function date(d?: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function inputDate(d?: Date | string | null) {
  if (!d) return "";
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export function daysUntil(d?: Date | string | null) {
  if (!d) return null;
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  const b = new Date(d);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function relDays(d?: Date | string | null) {
  const n = daysUntil(d);
  if (n === null) return "";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days overdue`;
}

export function splitEmails(s?: string | null) {
  return (s ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

// Amount in words (international style for foreign currency, Indian for INR)
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const t = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? " " + ONES[r % 10] : ""}`;
  return [h ? `${ONES[h]} Hundred` : "", t].filter(Boolean).join(" ");
}
function intlWords(n: number): string {
  if (n === 0) return "Zero";
  const units = ["", "Thousand", "Million", "Billion"];
  const parts: string[] = [];
  let i = 0;
  while (n > 0) {
    const c = n % 1000;
    if (c) parts.unshift(`${below1000(c)}${units[i] ? " " + units[i] : ""}`);
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join(" ");
}
function indianWords(n: number): string {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 1e7), lakh = Math.floor((n % 1e7) / 1e5), th = Math.floor((n % 1e5) / 1000), rest = n % 1000;
  return [crore && `${intlWords(crore)} Crore`, lakh && `${below1000(lakh)} Lakh`, th && `${below1000(th)} Thousand`, rest && below1000(rest)]
    .filter(Boolean)
    .join(" ");
}
export function amountInWords(v: unknown, currency: string) {
  const n = Math.round(num(v) * 100);
  const whole = Math.floor(n / 100), cents = n % 100;
  const names: Record<string, [string, string]> = { USD: ["US Dollars", "Cents"], EUR: ["Euros", "Cents"], INR: ["Rupees", "Paise"] };
  const [major, minor] = names[currency] ?? [currency, "Cents"];
  const w = currency === "INR" ? indianWords(whole) : intlWords(whole);
  return `${major} ${w}${cents ? ` and ${below1000(cents)} ${minor}` : ""} Only`;
}

export function daysFromNow(days: number) {
  return new Date(new Date().getTime() + days * 86400000);
}
