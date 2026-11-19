import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, Card, Notice } from "@/components/ui";
import { DueDate } from "@/components/badges";
import { ActionForm, SubmitButton, ConfirmAction } from "@/components/client";
import { applyWorkPlan, discardWorkPlan } from "@/app/actions/workplan";
import { dueFrom } from "@/lib/work";
import { inputDate } from "@/lib/format";
import type { WorkPlan } from "@/lib/ai/schemas";

export const metadata = { title: "Review AI work plan" };

export default async function WorkPlanReview({ params }: PageProps<"/deliverables/plan/[id]">) {
  await requireUser("projects");
  const { id } = await params;
  const x = await db.aiExtraction.findUnique({ where: { id } });
  if (!x || x.kind !== "WORKPLAN") notFound();
  const plan = x.result as WorkPlan & { deliverableId: string };
  const [dl, users] = await Promise.all([
    db.deliverable.findUnique({ where: { id: plan.deliverableId }, include: { project: { select: { code: true, title: true } }, workItems: { select: { title: true } } } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!dl) notFound();
  const byName = new Map(users.map((u) => [u.name.trim().toLowerCase(), u.id]));
  const have = new Set(dl.workItems.map((w) => w.title.trim().toLowerCase()));
  const tasks = plan.tasks ?? [];

  return (
    <>
      <PageHeader back={{ href: "/deliverables", label: "Delivery" }}
        title={<span className="flex items-center gap-2"><Sparkles size={22} className="text-plum" /> AI work plan</span>}
        subtitle={<>{dl.project.code} · <b>{dl.title}</b> · due <DueDate value={dl.dueDate} /></>} />
      {x.status !== "READY" && <div className="mb-5"><Notice tone="warn">This plan was already {x.status === "APPLIED" ? "applied" : "discarded"}.</Notice></div>}
      <p className="mb-4 max-w-3xl text-sm text-ink-soft">Nothing has been created yet. Untick what you don&apos;t want, adjust titles, people and dates, then create the tasks. Opening this page again later costs nothing.</p>
      {plan.notes && <div className="mb-4 max-w-3xl"><Notice tone="info"><b>AI notes:</b> <span className="whitespace-pre-line">{plan.notes}</span></Notice></div>}
      <ActionForm action={applyWorkPlan}>
        <input type="hidden" name="extractionId" value={x.id} />
        <input type="hidden" name="count" value={tasks.length} />
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {tasks.map((t, i) => {
              const dup = have.has(t.title.trim().toLowerCase());
              const due = dueFrom(dl.dueDate, t.days_before_due);
              const who = (t.assignee_name && byName.get(t.assignee_name.trim().toLowerCase())) || dl.ownerId || "";
              return (
                <li key={i} className="grid gap-3 p-4 md:grid-cols-[auto_1fr_12rem_10rem] md:items-start">
                  <input type="checkbox" name={`inc_${i}`} defaultChecked={!dup} className="mt-2.5 h-4 w-4 accent-plum" aria-label={`Include ${t.title}`} />
                  <div className="min-w-0 space-y-2">
                    <input name={`title_${i}`} defaultValue={t.title} className="input font-semibold" aria-label="Task title" />
                    <textarea name={`desc_${i}`} defaultValue={t.description ?? ""} rows={2} className="input text-sm" placeholder="Description (optional)" aria-label="Description" />
                    <div className="text-xs text-ink-soft">
                      {t.role && <>Suggested: <b>{t.role}</b></>}
                      {t.days_before_due !== null && <> · {t.days_before_due === 0 ? "on the due date" : t.days_before_due > 0 ? `${t.days_before_due} days before due` : `${-t.days_before_due} days after due`}</>}
                      {dup && <span className="ml-2 font-semibold text-amber-700">already exists — unticked</span>}
                    </div>
                  </div>
                  <label className="block"><span className="label">Assignee</span>
                    <select name={`who_${i}`} defaultValue={who} className="input"><option value="">— Unassigned —</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
                  <label className="block"><span className="label">Due</span>
                    <input type="date" name={`due_${i}`} defaultValue={inputDate(due)} className="input" /></label>
                </li>
              );
            })}
          </ul>
        </Card>
        {x.status === "READY" && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <SubmitButton className="btn-primary" pendingText="Creating…">Create ticked tasks</SubmitButton>
            <span className="text-xs text-ink-soft">Read by {x.model}</span>
          </div>
        )}
      </ActionForm>
      {x.status === "READY" && (
        <div className="mt-3"><ConfirmAction action={discardWorkPlan} fields={{ id: x.id }} label="Discard this plan" confirm="Discard the AI suggestion?" className="btn-ghost btn-sm" /></div>
      )}
    </>
  );
}
