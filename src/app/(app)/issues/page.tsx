import Link from "next/link";
import clsx from "clsx";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, Card, Empty } from "@/components/ui";
import { Badge, DueDate } from "@/components/badges";
import { Disclosure } from "@/components/client";
import { StatusPill, ResponseState } from "@/components/WorkParts";
import { WorkItemForm } from "@/components/WorkForm";
import { WORK_PRIORITY, workKey, workFormExtras } from "@/lib/work";
import { optionLabels } from "@/lib/custom";
import { date } from "@/lib/format";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Client issues" };

export default async function IssuesPage({ searchParams }: { searchParams: Promise<{ v?: string; project?: string }> }) {
  await requireUser();
  const { v = "open", project } = await searchParams;
  const base: Prisma.WorkItemWhereInput = { type: "ISSUE", ...(project ? { projectId: project } : {}) };
  const where: Record<string, Prisma.WorkItemWhereInput> = {
    open: { ...base, status: { category: { not: "DONE" } } },
    waiting: { ...base, status: { category: { not: "DONE" } }, respondedAt: null },
    resolved: { ...base, status: { category: "DONE" } },
    all: base,
  };
  const views = [["open", "Open"], ["waiting", "Awaiting first response"], ["resolved", "Resolved"], ["all", "All"]];
  const [counts, items, projects, users, extras, SRC] = await Promise.all([
    Promise.all(views.map(async ([k]) => [k, await db.workItem.count({ where: where[k] })] as const)).then(Object.fromEntries),
    db.workItem.findMany({
      where: where[v] ?? where.open,
      include: { status: true, assignee: { select: { name: true } }, project: { select: { id: true, code: true } }, deliverable: { select: { title: true } } },
      orderBy: [{ reportedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 300,
    }),
    db.project.findMany({ where: { status: "ACTIVE" }, select: { id: true, code: true, deliverables: { select: { id: true, title: true }, orderBy: { seq: "asc" } } }, orderBy: { code: "asc" } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    workFormExtras(),
    optionLabels("issueSource"),
  ]);
  // most severe first among open ones
  if (v !== "resolved" && v !== "all") items.sort((a, b) => WORK_PRIORITY[a.priority].rank - WORK_PRIORITY[b.priority].rank);
  const q = (k: string) => `/issues?v=${k}${project ? `&project=${project}` : ""}`;

  return (
    <>
      <PageHeader title="Client issues" subtitle="Problems and requests reported by clients — who reported them, response and fix targets."
 />
      {projects.length > 0 && (
        <div className="mb-4">
          <Disclosure label="+ Log client issue" className="btn-primary">
            <WorkItemForm projects={projects} users={users} type="ISSUE" projectId={project} {...extras} />
          </Disclosure>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {views.map(([k, l]) => (
          <Link key={k} href={q(k)} className={clsx("rounded-full border px-3 py-1.5 text-sm font-semibold", v === k ? "border-navy bg-navy text-white" : "border-line bg-surface text-ink-soft hover:text-ink")}>
            {l} <span className="ml-1 opacity-70">{counts[k]}</span>
          </Link>
        ))}
        <form action="/issues" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="v" value={v} />
          <select name="project" defaultValue={project ?? ""} className="input !w-44 !py-1.5" aria-label="Project"><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select>
          <button className="btn-ghost btn-sm">Filter</button>
        </form>
      </div>
      <Card pad={false}>
        {items.length === 0 ? <Empty title="No issues here">Log anything a client reports — a bug, a data problem, a complaint — so it gets an owner and a response date.</Empty> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Issue</th><th>Project</th><th>Severity</th><th>Reported</th><th>Response</th><th>Fix by</th><th>Owner</th><th>Status</th></tr></thead>
            <tbody>{items.map((i) => (
              <tr key={i.id}>
                <td className="min-w-64"><Link href={`/work/${i.number}`} className="font-semibold hover:text-plum">{i.title}</Link><div className="font-mono text-xs text-ink-soft">{workKey(i.number)}</div></td>
                <td><Link className="link" href={`/projects/${i.project.id}`}>{i.project.code}</Link>{i.deliverable && <div className="max-w-48 truncate text-xs text-ink-soft">{i.deliverable.title}</div>}</td>
                <td><Badge tone={WORK_PRIORITY[i.priority].tone}>{WORK_PRIORITY[i.priority].label}</Badge></td>
                <td className="whitespace-nowrap text-xs">{i.reportedAt ? date(i.reportedAt) : "—"}<div className="text-ink-soft">{[i.clientContact, i.source && SRC[i.source]].filter(Boolean).join(" · ")}</div></td>
                <td className="whitespace-nowrap">{i.status.category === "DONE" && !i.respondedAt ? <span className="text-xs text-ink-soft">—</span> : <ResponseState respondBy={i.respondBy} respondedAt={i.respondedAt} />}</td>
                <td><DueDate value={i.dueDate} done={i.status.category === "DONE"} /></td>
                <td className="text-ink-soft">{i.assignee?.name ?? "—"}</td>
                <td><StatusPill s={i.status} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
