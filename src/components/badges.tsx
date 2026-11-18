import clsx from "clsx";
import { daysUntil, relDays, date } from "@/lib/format";

type Tone = "gray" | "blue" | "purple" | "amber" | "green" | "red" | "navy";
const TONE: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-sky/10 text-sky ring-sky/20",
  purple: "bg-plum/10 text-plum ring-plum/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  navy: "bg-ink/10 text-ink ring-ink/20",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap", TONE[tone])}>{children}</span>;
}

export const OPP_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "gray" },
  IN_REVIEW: { label: "Internal review", tone: "amber" },
  SUBMITTED: { label: "Submitted", tone: "blue" },
  UNDER_EVALUATION: { label: "Under evaluation", tone: "purple" },
  WON: { label: "Won", tone: "green" },
  LOST: { label: "Lost", tone: "red" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
  NO_GO: { label: "No-go", tone: "gray" },
};
export const PROJECT_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "green" },
  ON_HOLD: { label: "On hold", tone: "amber" },
  COMPLETED: { label: "Completed", tone: "navy" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
};
export const DL_STATUS: Record<string, { label: string; tone: Tone }> = {
  NOT_STARTED: { label: "Not started", tone: "gray" },
  IN_PROGRESS: { label: "In progress", tone: "blue" },
  SUBMITTED: { label: "Submitted", tone: "purple" },
  REVISION: { label: "Revision asked", tone: "amber" },
  ACCEPTED: { label: "Accepted", tone: "green" },
};
export const MS_STATUS: Record<string, { label: string; tone: Tone }> = {
  PLANNED: { label: "To invoice", tone: "gray" },
  INVOICED: { label: "Invoiced", tone: "blue" },
  PAID: { label: "Paid", tone: "green" },
};
export const INV_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "gray" },
  SENT: { label: "Sent", tone: "blue" },
  PARTIALLY_PAID: { label: "Part paid", tone: "amber" },
  PAID: { label: "Paid", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
};

export function StatusBadge({ map, value }: { map: Record<string, { label: string; tone: Tone }>; value: string }) {
  const s = map[value] ?? { label: value, tone: "gray" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Due date with colour coding: red overdue, amber ≤5 days */
export function DueDate({ value, done }: { value?: Date | string | null; done?: boolean }) {
  if (!value) return <span className="text-ink-soft">—</span>;
  const d = daysUntil(value)!;
  const tone = done ? "text-ink-soft" : d < 0 ? "text-red-700" : d <= 5 ? "text-amber-700" : "text-ink";
  return (
    <span className={clsx("whitespace-nowrap", tone)}>
      {date(value)}
      {!done && <span className="ml-1 text-xs opacity-80">({relDays(value)})</span>}
    </span>
  );
}
