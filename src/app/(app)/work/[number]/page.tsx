import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, Card, KV } from "@/components/ui";
import { Badge, DueDate } from "@/components/badges";
import { ActionForm, SubmitButton, AutoSelect, ConfirmAction, Disclosure } from "@/components/client";
import { Documents } from "@/components/Documents";
import { StatusPill, ResponseState } from "@/components/WorkParts";
import { WorkItemForm } from "@/components/WorkForm";
import { addWorkComment, deleteWorkItem, setWorkStatus, convertToTask } from "@/app/actions/work";
import { boardColumns, canEditItem, canMoveItem, workKey, WORK_TYPE, WORK_PRIORITY, workFormExtras } from "@/lib/work";
import { optionLabels } from "@/lib/custom";
import { customRows } from "@/components/CustomFieldView";
import { LabelChip } from "@/components/LabelChip";
import { date, inputDate } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/work/[number]">) {
  const { number } = await params;
  return { title: `W-${number}` };
}

export default async function WorkItemPage({ params }: PageProps<"/work/[number]">) {
  const user = await requireUser();
  const n = Number((await params).number);
  if (!Number.isInteger(n)) notFound();
  const i = await db.workItem.findUnique({
    where: { number: n },
    include: {
      status: true, assignee: { select: { name: true } }, reporter: { select: { name: true } }, labels: { orderBy: { seq: "asc" } },
      project: { select: { id: true, code: true, title: true, client: { select: { name: true, shortName: true } } } },
      deliverable: { select: { id: true, title: true } },
      comments: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      documents: { include: { uploadedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!i) notFound();
  const [columns, users, projects, extras, SRC] = await Promise.all([
    boardColumns(),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, username: true }, orderBy: { name: "asc" } }),
    db.project.findMany({ where: { id: i.projectId }, select: { id: true, code: true, deliverables: { select: { id: true, title: true }, orderBy: { seq: "asc" } } } }),
    workFormExtras(),
    optionLabels("issueSource"),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const edit = canEditItem(user, i), move = canMoveItem(user, i);
  const EVENT: Record<string, (b: string | null) => string> = {
    CREATED: (b) => (b === "template" ? "added this from the task template" : b === "ai" ? "added this from the AI work plan" : "created this"),
    STATUS: (b) => `moved it: ${b ?? ""}`,
    ASSIGNED: (b) => `assigned it to ${(b && userName.get(b)) || "someone"}`,
    CONVERTED: () => "converted this client issue into a task",
  };
  const issue = i.type === "ISSUE";

  return (
    <>
      <PageHeader
        back={{ href: i.deliverable ? `/deliverables` : `/board?project=${i.projectId}`, label: i.deliverable ? "Delivery" : "Board" }}
        title={i.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{workKey(i.number)}</span> · <Link className="link" href={`/projects/${i.project.id}?tab=deliverables`}>{i.project.code}</Link>{i.deliverable && <> · ↳ {i.deliverable.title}</>}<StatusPill s={i.status} /></span>}
        actions={edit && <ConfirmAction action={deleteWorkItem} fields={{ id: i.id, back: i.deliverable ? "/deliverables" : "/board" }} label="Delete" confirm={`Delete ${workKey(i.number)}?`} className="btn-danger" />}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="space-y-6">
          <Card title="Description">
            {i.description ? <p className="whitespace-pre-line text-sm">{i.description}</p> : <p className="text-sm text-ink-soft">No description.</p>}
            {edit && (
              <div className="mt-4 border-t border-line pt-4">
                <Disclosure label="Edit details" className="btn-ghost btn-sm">
                  <WorkItemForm projects={projects} users={users}
                    item={{ id: i.id, projectId: i.projectId, deliverableId: i.deliverableId, type: i.type, title: i.title, description: i.description, priority: i.priority, assigneeId: i.assigneeId, dueDate: inputDate(i.dueDate), source: i.source, clientContact: i.clientContact, reportedAt: inputDate(i.reportedAt), respondBy: inputDate(i.respondBy), labelIds: i.labels.map((l) => l.id), custom: i.custom as Record<string, unknown> }} {...extras}
                    labels={[...extras.labels, ...i.labels.filter((l) => !l.active).map((l) => ({ id: l.id, name: `${l.name} (retired)`, color: l.color }))]} />
                </Disclosure>
              </div>
            )}
          </Card>

          <Documents docs={i.documents} link={{ workItemId: i.id }} path={`/work/${i.number}`} defaultCategory="OTHER" categories={["CORRESPONDENCE", "OTHER"]} title="Attachments" />

          <Card title="Activity & comments">
            <ol className="space-y-4">
              {i.comments.map((c) => (
                <li key={c.id} className="flex gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white">{(c.user?.name ?? "S").split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <b>{c.user?.name ?? "System"}</b>
                      {c.kind !== "COMMENT" && <span className="ml-1.5 text-ink-soft">{EVENT[c.kind]?.(c.body) ?? c.kind.toLowerCase()}</span>}
                      <span className="ml-2 text-xs text-ink-soft">{c.createdAt.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    {c.kind === "COMMENT" && c.body && <p className="mt-1 whitespace-pre-line rounded-xl bg-mist px-3 py-2 text-sm">{c.body}</p>}
                  </div>
                </li>
              ))}
            </ol>
            <ActionForm action={addWorkComment} resetOnOk className="mt-5 flex items-end gap-2 border-t border-line pt-4">
              <input type="hidden" name="id" value={i.id} />
              <textarea name="body" rows={2} required className="input flex-1" placeholder="Write a comment… type @username to notify someone" />
              <SubmitButton className="btn-dark btn-sm">Post</SubmitButton>
            </ActionForm>
            <p className="mt-1.5 text-xs text-ink-soft">Mention: {users.map((u) => `@${u.username}`).join("  ")}</p>
          </Card>
        </div>

        <div className="order-first space-y-6 lg:sticky lg:top-6 lg:order-none">
          <Card title="Status">
            {move
              ? <AutoSelect action={setWorkStatus} name="statusId" value={i.statusId} hidden={{ id: i.id }} options={columns.map((c) => ({ value: c.id, label: c.name }))} className="w-full" />
              : <><StatusPill s={i.status} /><p className="mt-2 text-xs text-ink-soft">Only the assignee, the creator or a manager can move it.</p></>}
            <div className="mt-4">
              <KV items={[
                ["Type", <Badge key="t" tone={WORK_TYPE[i.type].tone}>{WORK_TYPE[i.type].label}</Badge>],
                [issue ? "Severity" : "Priority", <Badge key="p" tone={WORK_PRIORITY[i.priority].tone}>{WORK_PRIORITY[i.priority].label}</Badge>],
                ["Assignee", i.assignee?.name ?? "Unassigned"],
                ...(issue ? [
                  ["Reported", `${i.reportedAt ? date(i.reportedAt) : "—"}${i.clientContact ? ` · ${i.clientContact}` : ""}${i.source ? ` · ${SRC[i.source] ?? i.source}` : ""}`],
                  ["Response", <ResponseState key="r" respondBy={i.respondBy} respondedAt={i.respondedAt} />],
                ] as [string, React.ReactNode][] : []),
                [issue ? "Fix by" : "Due", <DueDate key="d" value={i.dueDate} done={i.status.category === "DONE"} />],
                ...(i.labels.length ? [["Labels", <span key="l" className="flex flex-wrap gap-1">{i.labels.map((l) => <LabelChip key={l.id} name={l.name} color={l.color} />)}</span>] as [string, React.ReactNode]] : []),
                ...customRows(extras.fields, i.custom, userName),
                ["Project", `${i.project.code} · ${i.project.client.shortName || i.project.client.name}`],
                ["Deliverable", i.deliverable?.title ?? "—"],
                ["Created by", `${i.reporter?.name ?? "—"} · ${date(i.createdAt)}`],
                ...(i.completedAt ? [["Completed", date(i.completedAt)] as [string, string]] : []),
              ]} />
            </div>
            {issue && edit && (
              <div className="mt-4 border-t border-line pt-4">
                <ConfirmAction action={convertToTask} fields={{ id: i.id }} label="Convert to task" confirm="Make this a normal task? It will then count toward its deliverable's progress." className="btn-ghost btn-sm w-full" />
                <p className="mt-1.5 text-xs text-ink-soft">For issues that turn out to be planned work.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
