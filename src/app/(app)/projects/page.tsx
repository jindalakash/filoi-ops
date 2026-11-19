import Link from "next/link";
import clsx from "clsx";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader, Card, Empty, Progress } from "@/components/ui";
import { StatusBadge, PROJECT_STATUS, DueDate } from "@/components/badges";
import { Amt } from "@/components/Money";
import { deliverableProgress, progressItems } from "@/components/DeliverableProgress";
import { num } from "@/lib/format";
import type { ProjectStatus } from "@prisma/client";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ s?: string; q?: string }> }) {
  const user = await requireUser();
  const { s = "ACTIVE", q } = await searchParams;
  const fin = can(user.role, "financeView");
  const projects = await db.project.findMany({
    where: {
      ...(s !== "ALL" ? { status: s as ProjectStatus } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { client: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    include: {
      client: true, manager: true,
      deliverables: { select: { title: true, status: true, dueDate: true, workItems: progressItems } },
      invoices: { where: { status: { not: "CANCELLED" } }, select: { subtotal: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const tabs = [["ACTIVE", "Active"], ["ON_HOLD", "On hold"], ["COMPLETED", "Completed"], ["ALL", "All"]];
  return (
    <>
      <PageHeader title="Projects" subtitle="Contracts in delivery — deliverables, deadlines and billing."
        actions={can(user.role, "projects") && <Link href="/projects/new" className="btn-primary">+ New project</Link>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([k, l]) => <Link key={k} href={`/projects?s=${k}`} className={clsx("rounded-full border px-3 py-1.5 text-sm font-semibold", s === k ? "border-navy bg-navy text-white" : "border-line bg-surface text-ink-soft hover:text-ink")}>{l}</Link>)}
      </div>
      {projects.length === 0 ? <Card><Empty title="No projects">When a proposal is won, use “Create project” — or add one directly.</Empty></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const dp = deliverableProgress(p.deliverables);
            const next = p.deliverables.filter((d) => d.status !== "ACCEPTED" && d.dueDate).sort((a, b) => +a.dueDate! - +b.dueDate!)[0];
            const invoiced = p.invoices.reduce((a, i) => a + num(i.subtotal), 0);
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-ink-soft">{p.code} · {p.client.shortName || p.client.name}</div>
                  <StatusBadge map={PROJECT_STATUS} value={p.status} />
                </div>
                <div className="mt-2 line-clamp-2 font-display text-[15px] font-semibold group-hover:text-plum">{p.title}</div>
                <div className="mt-4 space-y-1.5">
                  <div className="flex justify-between text-xs text-ink-soft"><span>Deliverables <b className="text-ink">{dp.pct}%</b></span><span>{dp.done}/{dp.total} accepted{dp.left > 0 && ` · ${dp.left} left`}{dp.overdue > 0 && <b className="text-red-700"> · {dp.overdue} overdue</b>}</span></div>
                  <Progress value={dp.pct} />
                </div>
                {fin && num(p.contractValue) > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex justify-between text-xs text-ink-soft"><span>Invoiced</span><span className="text-right"><Amt v={invoiced} c={p.currency} compact /> / <Amt v={p.contractValue} c={p.currency} compact /></span></div>
                    <Progress value={(invoiced / num(p.contractValue)) * 100} tone="sky" />
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs">
                  <span className="text-ink-soft">{p.manager?.name ?? "No PM"}</span>
                  {next ? <span>Next: <DueDate value={next.dueDate} /></span> : <span className="text-ink-soft">No upcoming deadline</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
