import Link from "next/link";
import clsx from "clsx";
import { DueDate } from "@/components/badges";

type Row = { title: string; status: string; dueDate: Date | null };

/** How far along each status is. Accepted = done; submitted is waiting on the client. */
export const STAGE_WEIGHT: Record<string, number> = { NOT_STARTED: 0, IN_PROGRESS: 0.4, REVISION: 0.6, SUBMITTED: 0.8, ACCEPTED: 1 };
const STAGES: [string, string][] = [["ACCEPTED", "accepted"], ["SUBMITTED", "with client"], ["REVISION", "in revision"], ["IN_PROGRESS", "in progress"], ["NOT_STARTED", "not started"]];

export function deliverableProgress(rows: Row[]) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const total = rows.length;
  const counts = Object.fromEntries(STAGES.map(([k]) => [k, rows.filter((r) => r.status === k).length])) as Record<string, number>;
  const open = rows.filter((r) => r.status !== "ACCEPTED");
  const overdue = open.filter((r) => r.dueDate && r.dueDate < today).length;
  const next = open.filter((r) => r.dueDate && r.dueDate >= today).sort((a, b) => +a.dueDate! - +b.dueDate!)[0] ?? null;
  const pct = total ? Math.round((rows.reduce((a, r) => a + (STAGE_WEIGHT[r.status] ?? 0), 0) / total) * 100) : 0;
  return { total, done: counts.ACCEPTED, left: open.length, overdue, next, counts, pct };
}

export function ProgressBar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={clsx("h-2 w-full overflow-hidden rounded-full bg-line", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-plum transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

const WEIGHT_NOTE = "Progress counts accepted as 100%, submitted 80%, revision asked 60%, in progress 40%, not started 0%.";

/** One line of progress: bar, %, and what is left. */
export function ProgressLine({ rows, label, href, sub, big }: { rows: Row[]; label?: React.ReactNode; href?: string; sub?: React.ReactNode; big?: boolean }) {
  const p = deliverableProgress(rows);
  const breakdown = STAGES.filter(([k]) => k !== "ACCEPTED" && p.counts[k]).map(([k, l]) => `${p.counts[k]} ${l}`).join(" · ");
  return (
    <div className="grid gap-x-5 gap-y-1.5 md:grid-cols-[minmax(0,14rem)_1fr]" title={WEIGHT_NOTE}>
      {label !== undefined && (
        <div className="min-w-0">
          {href ? <Link href={href} className="link font-semibold">{label}</Link> : <span className="font-semibold">{label}</span>}
          {sub && <div className="truncate text-xs text-ink-soft">{sub}</div>}
        </div>
      )}
      <div className={clsx("min-w-0", label === undefined && "md:col-span-2")}>
        <div className="flex items-center gap-3">
          <ProgressBar pct={p.pct} className={big ? "h-3" : undefined} />
          <span className={clsx("w-12 shrink-0 text-right font-semibold tabular-nums", big ? "text-lg" : "text-sm")}>{p.pct}%</span>
        </div>
        {p.total === 0 ? <div className="mt-1 text-xs text-ink-soft">No deliverables yet</div> : (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-soft">
            <span><b className="text-ink">{p.done}</b> of {p.total} accepted</span>
            {p.left > 0 ? <span><b className="text-ink">{p.left}</b> left{breakdown && ` (${breakdown})`}</span> : <span className="font-semibold text-emerald-700">All delivered ✓</span>}
            {p.overdue > 0 && <span className="font-semibold text-red-700">{p.overdue} overdue</span>}
            {p.next && <span>Next: {p.next.title} · <DueDate value={p.next.dueDate} /></span>}
          </div>
        )}
      </div>
    </div>
  );
}
