import clsx from "clsx";

// Label colours, matching the badge tones used elsewhere.
const TONE: Record<string, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-sky/10 text-sky ring-sky/25",
  purple: "bg-plum/10 text-plum ring-plum/25",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  navy: "bg-ink/10 text-ink ring-ink/20",
};

export function LabelChip({ name, color, className }: { name: string; color: string; className?: string }) {
  return <span className={clsx("inline-flex items-center rounded-full px-1.5 py-px text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap", TONE[color] ?? TONE.gray, className)}>{name}</span>;
}
