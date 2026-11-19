import Link from "next/link";
import clsx from "clsx";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader, Card, Empty } from "@/components/ui";
import { StatusBadge, DL_STATUS, DueDate } from "@/components/badges";
import { AutoSelect, Disclosure } from "@/components/client";
import { setDeliverableStatus } from "@/app/actions/projects";
import { ProgressLine, ProgressBar, deliverablePct } from "@/components/DeliverableProgress";
import { WorkRow, workRowInclude } from "@/components/WorkParts";
import { WorkItemForm } from "@/components/WorkForm";
import { boardColumns, canMoveItem, workFormExtras } from "@/lib/work";
import { KanbanSquare, Sparkles } from "lucide-react";
import { CollapsibleGroup, CollapseAllButtons } from "@/components/CollapsibleGroup";
import { ActionForm, SubmitButton } from "@/components/client";
import { Notice } from "@/components/ui";
import { applyTemplate, applyTemplatesToProject } from "@/app/actions/work";
import { aiSplitDeliverable } from "@/app/actions/workplan";
import { getSetting } from "@/lib/settings";
import { aiReady } from "@/lib/ai/run";
import { fieldsFor } from "@/lib/custom";
import { CustomChips } from "@/components/CustomFieldView";

export const metadata = { title: "Delivery" };

export default async function DeliveryPage({ searchParams }: { searchParams: Promise<{ v?: string; mine?: string; added?: string }> }) {
  const user = await requireUser();
  const { v = "open", mine, added } = await searchParams;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in30 = new Date(today.getTime() + 30 * 86400000);

  const edit = can(user.role, "projects");
  const [tpl, ai, plans, extras, dlFields] = await Promise.all([
    getSetting("taskTemplates"),
    edit ? aiReady() : Promise.resolve(false),
    edit ? db.aiExtraction.findMany({ where: { kind: "WORKPLAN", status: "READY" }, select: { id: true, result: true } }) : Promise.resolve([]),
    workFormExtras(),
    fieldsFor("DELIVERABLE"),
  ]);
  const planFor = new Map(plans.map((x) => [(x.result as { deliverableId?: string }).deliverableId, x.id]));
  const tplCount = (type: string) => (tpl.types[type] ?? []).length;
  const [projects, columns, users] = await Promise.all([
    db.project.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true, code: true, title: true, managerId: true, client: { select: { name: true, shortName: true } },
        deliverables: { include: { owner: { select: { name: true } }, workItems: { include: workRowInclude, orderBy: [{ position: "asc" }] } }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { seq: "asc" }] },
        workItems: { where: { deliverableId: null }, include: workRowInclude, orderBy: [{ position: "asc" }] },
        _count: { select: { workItems: { where: { type: "ISSUE", status: { category: { not: "DONE" } } } } } },
      },
      orderBy: { endDate: { sort: "asc", nulls: "last" } },
    }),
    boardColumns(),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  type D = (typeof projects)[number]["deliverables"][number];
  const inView = (d: D) => {
    const open = d.status !== "ACCEPTED";
    if (v === "overdue") return open && !!d.dueDate && d.dueDate < today;
    if (v === "upcoming") return open && !!d.dueDate && d.dueDate >= today && d.dueDate <= in30;
    if (v === "open") return open;
    return true;
  };
  const isMine = (p: (typeof projects)[number], d?: D) =>
    p.managerId === user.id || (d ? d.ownerId === user.id || d.workItems.some((w) => w.assigneeId === user.id) : p.workItems.some((w) => w.assigneeId === user.id));
  const groups = projects
    .map((p) => ({ p, rows: p.deliverables.filter((d) => inView(d) && (!mine || isMine(p, d))) }))
    .filter((g) => !mine || g.p.managerId === user.id || g.rows.length > 0 || isMine(g.p));

  const views = [["open", "All open"], ["upcoming", "Next 30 days"], ["overdue", "Overdue"], ["all", "Everything"]];
  const q = (k: string, m?: string) => `/deliverables?v=${k}${m ? "&mine=1" : ""}`;
  const projectOpts = projects.map((p) => ({ id: p.id, code: p.code, deliverables: p.deliverables.map((d) => ({ id: d.id, title: d.title })) }));
  const colOpts = columns.map((c) => ({ id: c.id, name: c.name, category: c.category, color: c.color }));
  const allRows = projects.flatMap((p) => p.deliverables);

  return (
    <>
      <PageHeader title="Delivery" subtitle="Deliverables by project, the tasks under each, and what's left."
        actions={<Link href="/board" className="btn-ghost"><KanbanSquare size={16} /> Board</Link>} />

      {added && <div className="mb-4"><Notice tone="ok">Added {added} task{added === "1" ? "" : "s"} from the AI work plan.</Notice></div>}
      {projects.length > 0 && (
        <div className="mb-4 space-y-4">
          {projects.length > 1 && <Card><ProgressLine rows={allRows} label="All active projects" sub={`${projects.length} projects · ${allRows.length} deliverables`} big /></Card>}
          <Disclosure label="+ New task or issue" className="btn-primary">
            <WorkItemForm projects={projectOpts} users={users} {...extras} />
          </Disclosure>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {views.map(([k, l]) => <Link key={k} href={q(k, mine)} className={clsx("rounded-full border px-3 py-1.5 text-sm font-semibold", v === k ? "border-navy bg-navy text-white" : "border-line bg-surface text-ink-soft hover:text-ink")}>{l}</Link>)}
        {groups.length > 1 && <span className="ml-auto"><CollapseAllButtons scope="delivery" ids={groups.map((g) => g.p.id)} /></span>}
        <Link href={q(v, mine ? undefined : "1")} className={clsx(groups.length > 1 ? "" : "ml-auto", "rounded-full border px-3 py-1.5 text-sm font-semibold", mine ? "border-plum bg-plum text-white" : "border-line bg-surface text-ink-soft")}>{mine ? "✓ " : ""}Only mine</Link>
      </div>

      {groups.length === 0 ? <Card><Empty title="No active projects">{mine ? "Nothing assigned to you." : "Active projects and their deliverables show here."}</Empty></Card> : (
        <div className="space-y-5">
          {groups.map(({ p, rows }) => (
            <CollapsibleGroup key={p.id} scope="delivery" id={p.id}
              title={<span className="flex flex-wrap items-baseline gap-x-2"><Link href={`/projects/${p.id}?tab=deliverables`} className="link">{p.code}</Link><span className="text-sm font-normal text-ink-soft">{p.client.shortName || p.client.name} · {p.title}</span></span>}
              actions={<span className="flex shrink-0 items-center gap-2">
                {(() => { const n = p._count.workItems; return n > 0 && <Link href={`/issues?project=${p.id}`} className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200 hover:underline">{n} open client issue{n > 1 ? "s" : ""}</Link>; })()}
                <Link href={`/board?project=${p.id}`} className="btn-ghost btn-sm">Board</Link>
              </span>}
              summary={<ProgressLine rows={p.deliverables} big />}>
              {(() => {
                  const n = edit ? p.deliverables.filter((d) => d.status !== "ACCEPTED" && d.workItems.length === 0 && tplCount(d.type) > 0).length : 0;
                  return n > 0 && (
                    <ActionForm action={applyTemplatesToProject} className="mx-5 my-3 flex flex-wrap items-center gap-2 rounded-lg bg-mist/60 px-3 py-2 text-xs text-ink-soft">
                      <input type="hidden" name="projectId" value={p.id} />
                      <span>{n} open deliverable{n > 1 ? "s have" : " has"} no tasks yet.</span>
                      <SubmitButton className="btn-ghost btn-sm" pendingText="Adding…">Add template tasks to all {n}</SubmitButton>
                      <a href="/settings?tab=templates" className="link">Edit templates</a>
                    </ActionForm>
                  );
                })()}
              {rows.length === 0 ? <div className="px-5 py-4 text-sm text-ink-soft">No deliverables in this view.</div> : (
                <ul className="divide-y divide-line">
                  {rows.map((d) => {
                    const pct = Math.round(deliverablePct(d) * 100);
                    const done = d.workItems.filter((w) => w.status.category === "DONE").length;
                    return (
                      <li key={d.id} className="px-5 py-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold">{d.title}</div>
                            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-soft">
                              <span>Due <DueDate value={d.dueDate} done={d.status === "ACCEPTED"} /></span>
                              <span>{d.owner?.name ?? "No owner"}</span>
                              <CustomChips fields={dlFields} values={d.custom} />
                            </div>
                          </div>
                          <div className="flex items-center gap-3 md:w-80">
                            <ProgressBar pct={pct} />
                            <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">{pct}%</span>
                            {edit
                              ? <AutoSelect action={setDeliverableStatus} name="status" value={d.status} hidden={{ id: d.id }} options={Object.entries(DL_STATUS).map(([val, s]) => ({ value: val, label: s.label }))} />
                              : <StatusBadge map={DL_STATUS} value={d.status} />}
                          </div>
                        </div>
                        <details className="group mt-1.5">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-1.5 py-0.5 -ml-1.5 text-xs font-semibold text-ink-soft hover:bg-mist hover:text-ink [&::-webkit-details-marker]:hidden">
                            <span className="transition group-open:rotate-90" aria-hidden>▸</span>
                            {d.workItems.length ? `Tasks · ${done}/${d.workItems.length} done` : "Tasks · none yet — add one"}
                          </summary>
                          <div className="mt-2 rounded-lg border border-line/70 bg-mist/30 px-4 py-2">
                            {d.workItems.length > 0 && (
                              <ul className="mb-2 divide-y divide-line/70">
                                {d.workItems.map((w) => <WorkRow key={w.id} i={w} columns={colOpts} canMove={canMoveItem(user, w)} fields={extras.fields} />)}
                              </ul>
                            )}
                            <div className="py-2"><WorkItemForm compact projects={projectOpts} users={users} projectId={p.id} deliverableId={d.id} /></div>
                            {edit && (
                              <div className="flex flex-wrap items-center gap-2 border-t border-line/70 py-2 text-xs">
                                {planFor.get(d.id) ? (
                                  <Link href={`/deliverables/plan/${planFor.get(d.id)}`} className="inline-flex items-center gap-1.5 rounded-lg bg-plum/10 px-2.5 py-1.5 font-semibold text-plum hover:bg-plum/15"><Sparkles size={13} /> AI plan waiting — review →</Link>
                                ) : ai && (
                                  <ActionForm action={aiSplitDeliverable}><input type="hidden" name="id" value={d.id} /><SubmitButton className="btn-ghost btn-sm" pendingText="AI is planning…"><Sparkles size={13} className="text-plum" /> Split into tasks with AI</SubmitButton></ActionForm>
                                )}
                                {tplCount(d.type) > 0 && (
                                  <ActionForm action={applyTemplate}><input type="hidden" name="id" value={d.id} /><SubmitButton className="btn-ghost btn-sm" pendingText="Adding…">Add template tasks ({tplCount(d.type)})</SubmitButton></ActionForm>
                                )}
                              </div>
                            )}
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              )}
              {p.workItems.length > 0 && (
                <details className="border-t border-line">
                  <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-ink-soft hover:text-ink">Other tasks & issues for this project ({p.workItems.filter((w) => w.status.category !== "DONE").length} open)</summary>
                  <ul className="divide-y divide-line/70 px-5 pb-3 md:pl-10">
                    {p.workItems.map((w) => <WorkRow key={w.id} i={w} columns={colOpts} canMove={canMoveItem(user, w)} fields={extras.fields} />)}
                  </ul>
                </details>
              )}
            </CollapsibleGroup>
          ))}
        </div>
      )}
    </>
  );
}
