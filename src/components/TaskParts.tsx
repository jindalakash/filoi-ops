import Link from "next/link";
import clsx from "clsx";
import { Field } from "./ui";
import { ActionForm, SubmitButton } from "./client";
import { PersonSelect } from "./forms";
import { StatusBadge, TASK_STATUS, DueDate } from "./badges";
import { saveTask } from "@/app/actions/tasks";
import { inputDate } from "@/lib/format";

type Opt = { id: string; name: string };

export const SECTION_SUGGESTIONS = [
  "Technical proposal – approach & methodology", "Understanding of the TOR", "Work plan & timeline", "Team composition & CVs",
  "Relevant experience & references", "Financial proposal", "Compliance & declaration forms", "Company documents (registration, audited accounts)", "Final review & formatting",
];

export function Avatar({ name, size = "sm" }: { name?: string | null; size?: "sm" | "md" }) {
  if (!name) return <span className="text-xs text-ink-soft">Unassigned</span>;
  const ini = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx("grid shrink-0 place-items-center rounded-full bg-ink font-bold text-white", size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs")}>{ini}</span>
      <span className="truncate text-sm">{name}</span>
    </span>
  );
}

export function TaskForm({ opportunityId, users, defaultReviewer, t, defaultDue }: {
  opportunityId: string; users: Opt[]; defaultReviewer?: string | null; defaultDue?: Date | null;
  t?: { id: string; title: string; description: string | null; assigneeId: string | null; reviewerId: string | null; dueDate: Date | null };
}) {
  return (
    <ActionForm action={saveTask} resetOnOk={!t} className="rounded-xl border border-line bg-mist/50 p-4">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Part / task *" className="sm:col-span-2">
          <input name="title" required defaultValue={t?.title} className="input" list="task-sections" placeholder="e.g. Team composition & CVs" />
          <datalist id="task-sections">{SECTION_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Assign to"><PersonSelect name="assigneeId" users={users} value={t?.assigneeId} /></Field>
        <Field label="Due date"><input type="date" name="dueDate" defaultValue={inputDate(t ? t.dueDate : defaultDue)} className="input" /></Field>
        <Field label="Instructions" className="sm:col-span-2 lg:col-span-3"><textarea name="description" rows={2} defaultValue={t?.description ?? ""} className="input" placeholder="What exactly is needed, page limits, templates to use…" /></Field>
        <Field label="Reviewer"><PersonSelect name="reviewerId" users={users} value={t ? t.reviewerId : defaultReviewer} placeholder="— Choose later —" /></Field>
      </div>
      <div className="mt-3 flex justify-end"><SubmitButton className="btn-dark btn-sm">{t ? "Save task" : "Assign task"}</SubmitButton></div>
    </ActionForm>
  );
}

export function TaskRow({ t, showProposal }: {
  t: { id: string; title: string; status: string; dueDate: Date | null; assignee?: { name: string } | null; reviewer?: { name: string } | null; opportunity?: { id: string; code: string; title: string } };
  showProposal?: boolean;
}) {
  return (
    <li className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <Link href={`/tasks/${t.id}`} className="font-semibold hover:text-plum">{t.title}</Link>
        {showProposal && t.opportunity && <div className="truncate text-xs text-ink-soft">{t.opportunity.code} · {t.opportunity.title}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:justify-end">
        <span className="w-36"><Avatar name={t.assignee?.name} /></span>
        <span className="w-40"><DueDate value={t.dueDate} done={t.status === "APPROVED"} /></span>
        <span className="w-28 text-right"><StatusBadge map={TASK_STATUS} value={t.status} /></span>
      </div>
    </li>
  );
}
