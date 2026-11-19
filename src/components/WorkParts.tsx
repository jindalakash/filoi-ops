import Link from "next/link";
import clsx from "clsx";
import { Badge, DueDate } from "./badges";
import { AutoSelect } from "./client";
import { setWorkStatus } from "@/app/actions/work";
import { WORK_TYPE, WORK_PRIORITY, workKey } from "@/lib/work";

type Tone = "gray" | "blue" | "purple" | "amber" | "green" | "red" | "navy";
export type Column = { id: string; name: string; category: string; color: string };
export type WorkRowData = {
  id: string; number: number; title: string; type: string; priority: string; dueDate: Date | null;
  statusId: string; status: { name: string; category: string; color: string };
  assignee: { name: string } | null;
  project?: { code: string } | null;
  deliverable?: { title: string } | null;
};

export function StatusPill({ s }: { s: { name: string; color: string } }) {
  return <Badge tone={(s.color as Tone) || "gray"}>{s.name}</Badge>;
}

export function WorkMeta({ i, showProject }: { i: WorkRowData; showProject?: boolean }) {
  const done = i.status.category === "DONE";
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
      <span className="font-mono">{workKey(i.number)}</span>
      {i.type !== "TASK" && <Badge tone={WORK_TYPE[i.type]?.tone}>{WORK_TYPE[i.type]?.label}</Badge>}
      {(i.priority === "URGENT" || i.priority === "HIGH") && <Badge tone={WORK_PRIORITY[i.priority].tone}>{WORK_PRIORITY[i.priority].label}</Badge>}
      {showProject && i.project && <span>{i.project.code}{i.deliverable ? ` · ${i.deliverable.title}` : ""}</span>}
      <span>{i.assignee?.name ?? "Unassigned"}</span>
      {i.dueDate && <DueDate value={i.dueDate} done={done} />}
    </div>
  );
}

/** One task / issue line with an inline status dropdown (when allowed). */
export function WorkRow({ i, columns, canMove, showProject }: { i: WorkRowData; columns: Column[]; canMove: boolean; showProject?: boolean }) {
  const done = i.status.category === "DONE";
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className={clsx("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", done ? "bg-emerald-600" : i.status.category === "IN_PROGRESS" ? "bg-sky" : "bg-line")} aria-hidden />
      <div className="min-w-0 flex-1">
        <Link href={`/work/${i.number}`} className={clsx("font-medium hover:text-plum", done && "text-ink-soft line-through decoration-ink-soft/40")}>{i.title}</Link>
        <WorkMeta i={i} showProject={showProject} />
      </div>
      <div className="shrink-0">
        {canMove
          ? <AutoSelect action={setWorkStatus} name="statusId" value={i.statusId} hidden={{ id: i.id }} options={columns.map((c) => ({ value: c.id, label: c.name }))} />
          : <StatusPill s={i.status} />}
      </div>
    </li>
  );
}

export const workRowInclude = {
  status: { select: { name: true, category: true, color: true } },
  assignee: { select: { name: true } },
} as const;
