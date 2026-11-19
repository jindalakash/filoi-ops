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
import { boardColumns, canMoveItem } from "@/lib/work";
import { KanbanSquare } from "lucide-react";

export const metadata = { title: "Delivery" };

export default async function DeliveryPage({ searchParams }: { searchParams: Promise<{ v?: string; mine?: string }> }) {
  const user = await requireUser();
  const { v = "open", mine } = await searchParams;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in30 = new Date(today.getTime() + 30 * 86400000);

  const [projects, columns, users] = await Promise.all([
    db.project.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true, code: true, title: true, managerId: true, client: { select: { name: true, shortName: true } },
        deliverables: { include: { owner: { select: { name: true } }, workItems: { include: workRowInclude, orderBy: [{ position: "asc" }] } }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { seq: "asc" }] },
        workItems: { where: { deliverableId: null }, include: workRowInclude, orderBy: [{ position: "asc" }] },
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
  const edit = can(user.role, "projects");
  const q = (k: string, m?: string) => `/deliverables?v=${k}${m ? "&mine=1" : ""}`;
  const projectOpts = projects.map((p) => ({ id: p.id, code: p.code, deliverables: p.deliverables.map((d) => ({ id: d.id, title: d.title })) }));
  const colOpts = columns.map((c) => ({ id: c.id, name: c.name, category: c.category, color: c.color }));
  const allRows = projects.flatMap((p) => p.deliverables);

  return (
    <>
      <PageHeader title="Delivery" subtitle="Deliverables by project, the tasks under each, and what's left."
        actions={<Link href="/board" className="btn-ghost"><KanbanSquare size={16} /> Board</Link>} />

      {projects.length > 0 && (
        <div className="mb-4 flex flex-wrap items-start gap-3">
          {projects.length > 1 && <Card className="min-w-72 flex-1"><ProgressLine rows={allRows} label="All active projects" sub={`${projects.length} projects · ${allRows.length} deliverables`} big /></Card>}
          <Disclosure label="+ New task or issue" className="btn-primary" panelClassName="mt-3 w-full basis-full">
            <WorkItemForm projects={projectOpts} users={users} />
          </Disclosure>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {views.map(([k, l]) => <Link key={k} href={q(k, mine)} className={clsx("rounded-full border px-3 py-1.5 text-sm font-semibold", v === k ? "border-navy bg-navy text-white" : "border-line bg-surface text-ink-soft hover:text-ink")}>{l}</Link>)}
        <Link href={q(v, mine ? undefined : "1")} className={clsx("ml-auto rounded-full border px-3 py-1.5 text-sm font-semibold", mine ? "border-plum bg-plum text-white" : "border-line bg-surface text-ink-soft")}>{mine ? "✓ " : ""}Only mine</Link>
      </div>

      {groups.length === 0 ? <Card><Empty title="No active projects">{mine ? "Nothing assigned to you." : "Active projects and their deliverables show here."}</Empty></Card> : (
        <div className="space-y-5">
          {groups.map(({ p, rows }) => (
            <Card key={p.id} pad={false}
              title={<span className="flex flex-wrap items-baseline gap-x-2"><Link href={`/projects/${p.id}?tab=deliverables`} className="link">{p.code}</Link><span className="text-sm font-normal text-ink-soft">{p.client.shortName || p.client.name} · {p.title}</span></span>}
              actions={<Link href={`/board?project=${p.id}`} className="btn-ghost btn-sm shrink-0">Board</Link>}>
              <div className="border-b border-line px-5 py-4"><ProgressLine rows={p.deliverables} big /></div>
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
                                {d.workItems.map((w) => <WorkRow key={w.id} i={w} columns={colOpts} canMove={canMoveItem(user, w)} />)}
                              </ul>
                            )}
                            <div className="py-2"><WorkItemForm compact projects={projectOpts} users={users} projectId={p.id} deliverableId={d.id} /></div>
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
                    {p.workItems.map((w) => <WorkRow key={w.id} i={w} columns={colOpts} canMove={canMoveItem(user, w)} />)}
                  </ul>
                </details>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
