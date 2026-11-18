import Link from "next/link";
import clsx from "clsx";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader, Card, Empty } from "@/components/ui";
import { StatusBadge, DL_STATUS, DueDate } from "@/components/badges";
import { AutoSelect } from "@/components/client";
import { setDeliverableStatus } from "@/app/actions/projects";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Deliverables" };

export default async function DeliverablesPage({ searchParams }: { searchParams: Promise<{ v?: string; mine?: string }> }) {
  const user = await requireUser();
  const { v = "upcoming", mine } = await searchParams;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in30 = new Date(today.getTime() + 30 * 86400000);
  const where: Prisma.DeliverableWhereInput = {
    project: { status: "ACTIVE" },
    ...(mine ? { OR: [{ ownerId: user.id }, { project: { managerId: user.id } }] } : {}),
    ...(v === "overdue" ? { status: { not: "ACCEPTED" }, dueDate: { lt: today } }
      : v === "upcoming" ? { status: { not: "ACCEPTED" }, dueDate: { gte: today, lte: in30 } }
      : v === "open" ? { status: { not: "ACCEPTED" } } : {}),
  };
  const rows = await db.deliverable.findMany({ where, include: { project: { include: { client: true } }, owner: true }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }] });
  const views = [["upcoming", "Next 30 days"], ["overdue", "Overdue"], ["open", "All open"], ["all", "Everything"]];
  const edit = can(user.role, "projects");
  const q = (k: string, val?: string) => `/deliverables?v=${k}${val ? "&mine=1" : ""}`;
  return (
    <>
      <PageHeader title="Deliverables" subtitle="Every output across active projects, by due date." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {views.map(([k, l]) => <Link key={k} href={q(k, mine)} className={clsx("rounded-full border px-3 py-1.5 text-sm font-semibold", v === k ? "border-navy bg-navy text-white" : "border-line bg-surface text-ink-soft hover:text-ink")}>{l}</Link>)}
        <Link href={q(v, mine ? undefined : "1")} className={clsx("ml-auto rounded-full border px-3 py-1.5 text-sm font-semibold", mine ? "border-plum bg-plum text-white" : "border-line bg-surface text-ink-soft")}>{mine ? "✓ " : ""}Only mine</Link>
      </div>
      <Card pad={false}>
        {rows.length === 0 ? <Empty title="Nothing here">No deliverables match this view.</Empty> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Deliverable</th><th>Project</th><th>Due</th><th>Owner</th><th>Status</th></tr></thead>
            <tbody>{rows.map((d) => (
              <tr key={d.id}>
                <td className="min-w-56 font-semibold">{d.title}</td>
                <td><Link className="link" href={`/projects/${d.projectId}`}>{d.project.code}</Link><div className="text-xs text-ink-soft">{d.project.client.shortName || d.project.client.name}</div></td>
                <td><DueDate value={d.dueDate} done={d.status === "ACCEPTED"} /></td>
                <td className="text-ink-soft">{d.owner?.name ?? "—"}</td>
                <td>{edit ? <AutoSelect action={setDeliverableStatus} name="status" value={d.status} hidden={{ id: d.id }} options={Object.entries(DL_STATUS).map(([val, s]) => ({ value: val, label: s.label }))} /> : <StatusBadge map={DL_STATUS} value={d.status} />}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
