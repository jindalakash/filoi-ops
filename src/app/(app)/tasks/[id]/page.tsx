import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageTasks, isAssignee, isReviewer } from "@/lib/tasks";
import { PageHeader, Card, KV, Field, Notice } from "@/components/ui";
import { StatusBadge, TASK_STATUS, OPP_STATUS, DueDate } from "@/components/badges";
import { ActionForm, ConfirmAction, Disclosure, SubmitButton } from "@/components/client";
import { PersonSelect } from "@/components/forms";
import { Documents } from "@/components/Documents";
import { Avatar, TaskForm } from "@/components/TaskParts";
import { moveTask, commentTask, deleteTask } from "@/app/actions/tasks";
import { date } from "@/lib/format";

const EVENT: Record<string, string> = {
  ASSIGNED: "assigned the task", STARTED: "started working", SUBMITTED: "marked it done and sent it for review",
  APPROVED: "approved it", CHANGES: "asked for changes", REOPENED: "reopened it",
};

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const t = await db.proposalTask.findUnique({
    where: { id },
    include: {
      opportunity: { include: { client: true } },
      assignee: true, reviewer: true, createdBy: true,
      comments: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      documents: { include: { uploadedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!t) notFound();
  const manager = canManageTasks(user);
  const mine = isAssignee(user, t);
  const reviewing = isReviewer(user, t);
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const o = t.opportunity;
  const canWork = (mine || manager) && ["TODO", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(t.status);
  const canReview = (reviewing || manager) && t.status === "IN_REVIEW";
  const lastChange = [...t.comments].reverse().find((c) => c.kind === "CHANGES");

  let waiting: React.ReactNode = null;
  if (!canWork && !canReview) {
    waiting = t.status === "APPROVED" ? <>This part is approved{t.approvedAt && ` on ${date(t.approvedAt)}`}. ✅</>
      : t.status === "IN_REVIEW" ? <>Waiting for <b>{t.reviewer?.name ?? "a reviewer"}</b> to review.</>
      : <>Waiting for <b>{t.assignee?.name ?? "someone to be assigned"}</b>.</>;
  }

  return (
    <>
      <PageHeader
        back={{ href: `/opportunities/${o.id}`, label: o.code }}
        title={t.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Link className="link" href={`/opportunities/${o.id}`}>{o.title}</Link> · {o.client.shortName || o.client.name} <StatusBadge map={OPP_STATUS} value={o.status} /></span>}
        actions={<StatusBadge map={TASK_STATUS} value={t.status} />}
      />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Details">
            <KV items={[
              ["Assigned to", <Avatar key="a" name={t.assignee?.name} />],
              ["Reviewer", <Avatar key="r" name={t.reviewer?.name} />],
              ["Due", <DueDate key="d" value={t.dueDate} done={t.status === "APPROVED"} />],
              ["Proposal deadline", <DueDate key="p" value={o.submissionDeadline} done={!["DRAFT", "IN_REVIEW", "READY_TO_SUBMIT"].includes(o.status)} />],
              ["Created by", t.createdBy?.name],
              ["Submitted", date(t.submittedAt)],
            ]} />
            {t.description && <div className="mt-5"><div className="label">Instructions</div><p className="whitespace-pre-line text-sm">{t.description}</p></div>}
          </Card>

          <Documents docs={t.documents} link={{ opportunityId: o.id, proposalTaskId: t.id }} path={`/tasks/${t.id}`} defaultCategory="TECHNICAL_PROPOSAL"
            categories={["TECHNICAL_PROPOSAL", "FINANCIAL_PROPOSAL", "CORRESPONDENCE", "OTHER"]} title="Drafts & files for this part" />

          <Card title="Discussion">
            <ol className="space-y-4">
              {t.comments.map((c) => (
                <li key={c.id} className="flex gap-3">
                  <Avatar name={c.user?.name ?? "System"} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      {c.kind !== "COMMENT" && <span className="text-ink-soft">{EVENT[c.kind] ?? c.kind.toLowerCase()}</span>}
                      <span className="ml-2 text-xs text-ink-soft">{c.createdAt.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    {c.body && <p className={`mt-1 whitespace-pre-line rounded-xl px-3 py-2 text-sm ${c.kind === "CHANGES" ? "bg-amber-50 text-amber-900" : "bg-mist"}`}>{c.body}</p>}
                  </div>
                </li>
              ))}
            </ol>
            <ActionForm action={commentTask} resetOnOk className="mt-5 flex items-end gap-2 border-t border-line pt-4">
              <input type="hidden" name="id" value={t.id} />
              <textarea name="body" rows={2} required className="input flex-1" placeholder="Write a comment…" />
              <SubmitButton className="btn-dark btn-sm">Post</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <div className="order-first space-y-6 lg:sticky lg:top-6 lg:order-none">
          <Card title="Your next step">
            {t.status === "CHANGES_REQUESTED" && lastChange?.body && (mine || manager) && (
              <div className="mb-4"><Notice tone="warn"><b>{lastChange.user?.name ?? "Reviewer"} asked:</b> {lastChange.body}</Notice></div>
            )}
            {canWork && (
              <div className="space-y-4">
                {t.status === "TODO" && (
                  <ActionForm action={moveTask}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="step" value="start" />
                    <SubmitButton className="btn-ghost w-full">Start working on it</SubmitButton>
                  </ActionForm>
                )}
                <ActionForm action={moveTask} className="space-y-3">
                  <input type="hidden" name="id" value={t.id} /><input type="hidden" name="step" value="submit" />
                  <Field label="Send for review to"><PersonSelect name="reviewerId" users={users.filter((u) => u.id !== t.assigneeId)} value={t.reviewerId} placeholder="— Choose reviewer —" /></Field>
                  <Field label="Note for the reviewer"><textarea name="note" rows={3} className="input" placeholder="What's done, where the files are, open questions…" /></Field>
                  <SubmitButton className="btn-primary w-full">✓ Mark done & send for review</SubmitButton>
                  <p className="text-xs text-ink-soft">Upload your draft under “Drafts & files” first.</p>
                </ActionForm>
              </div>
            )}
            {canReview && (
              <div className="space-y-4">
                <p className="text-sm"><b>{t.assignee?.name ?? "The assignee"}</b> sent this for your review. Check the files and the note in the discussion.</p>
                <ActionForm action={moveTask} className="space-y-2">
                  <input type="hidden" name="id" value={t.id} /><input type="hidden" name="step" value="approve" />
                  <textarea name="note" rows={2} className="input" placeholder="Optional comment" />
                  <SubmitButton className="btn-primary w-full">Approve</SubmitButton>
                </ActionForm>
                <ActionForm action={moveTask} className="space-y-2 border-t border-line pt-4">
                  <input type="hidden" name="id" value={t.id} /><input type="hidden" name="step" value="changes" />
                  <textarea name="note" rows={3} required className="input" placeholder="What needs to change? (required)" />
                  <SubmitButton className="btn-ghost w-full">Send back for changes</SubmitButton>
                </ActionForm>
              </div>
            )}
            {waiting && <p className="text-sm text-ink-soft">{waiting}</p>}
            {t.status === "APPROVED" && (manager || reviewing) && (
              <div className="mt-4"><ConfirmAction action={moveTask} fields={{ id: t.id, step: "reopen" }} label="Reopen" confirm="Reopen this approved part?" className="btn-ghost btn-sm" /></div>
            )}
          </Card>
          {manager && (
            <Card title="Manage">
              <Disclosure label="Edit / reassign" className="btn-ghost btn-sm">
                <TaskForm opportunityId={o.id} users={users} t={t} />
              </Disclosure>
              <div className="mt-3"><ConfirmAction action={deleteTask} fields={{ id: t.id, back: "1" }} label="Delete task" confirm="Delete this task and its discussion? Files stay on the proposal." /></div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

export async function generateMetadata({ params }: PageProps<"/tasks/[id]">) {
  const { id } = await params;
  const t = await db.proposalTask.findUnique({ where: { id }, select: { title: true } });
  return { title: t?.title ?? "Task" };
}
