import Link from "next/link";
import clsx from "clsx";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader, Card, Empty } from "@/components/ui";
import { StatusBadge, OPP_STATUS, DueDate } from "@/components/badges";
import { Amt } from "@/components/Money";

import type { OpportunityStatus, Prisma } from "@prisma/client";

export const metadata = { title: "Proposals" };

const FILTERS: { key: string; label: string; statuses?: OpportunityStatus[] }[] = [
  { key: "open", label: "In progress", statuses: ["DRAFT", "IN_REVIEW", "READY_TO_SUBMIT"] },
  { key: "pending", label: "Awaiting result", statuses: ["SUBMITTED", "UNDER_EVALUATION"] },
  { key: "won", label: "Won", statuses: ["WON"] },
  { key: "closed", label: "Lost / dropped", statuses: ["LOST", "CANCELLED", "NO_GO"] },
  { key: "all", label: "All" },
];

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const user = await requireUser();
  const { f = "all", q } = await searchParams;
  const filter = FILTERS.find((x) => x.key === f) ?? FILTERS[4];
  const where: Prisma.OpportunityWhereInput = {
    ...(filter.statuses ? { status: { in: filter.statuses } } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { client: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, counts] = await Promise.all([
    db.opportunity.findMany({ where, include: { client: true, owner: true }, orderBy: [{ submissionDeadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }] }),
    db.opportunity.groupBy({ by: ["status"], _count: true }),
  ]);
  const countFor = (s?: OpportunityStatus[]) => counts.filter((c) => !s || s.includes(c.status)).reduce((a, c) => a + c._count, 0);

  return (
    <>
      <PageHeader title="Proposals" subtitle="Tenders, RFPs and TORs — from first read to award."
        actions={can(user.role, "presales") && <Link href="/opportunities/new" className="btn-primary">+ New proposal</Link>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <Link key={x.key} href={`/opportunities?f=${x.key}`} className={clsx("rounded-full border px-3 py-1.5 text-sm font-semibold transition", f === x.key ? "border-navy bg-navy text-white" : "border-line bg-surface text-ink-soft hover:text-ink")}>
            {x.label} <span className="ml-1 opacity-70">{countFor(x.statuses)}</span>
          </Link>
        ))}
      </div>
      <Card pad={false}>
        <form className="border-b border-line p-3"><input type="hidden" name="f" value={f} /><input name="q" defaultValue={q} placeholder="Search by title, code or client…" className="input max-w-sm" /></form>
        {rows.length === 0 ? <Empty title="No proposals here">Start by creating a proposal and uploading the TOR / RFP.</Empty> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Proposal</th><th>Client</th><th>Status</th><th>Deadline</th><th>Owner</th><th className="text-right">Value</th></tr></thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className="min-w-64"><div className="text-xs text-ink-soft">{o.code}</div><Link href={`/opportunities/${o.id}`} className="link">{o.title}</Link></td>
                    <td>{o.client.shortName || o.client.name}</td>
                    <td><StatusBadge map={OPP_STATUS} value={o.status} /></td>
                    <td><DueDate value={o.submissionDeadline} done={!["DRAFT", "IN_REVIEW", "READY_TO_SUBMIT"].includes(o.status)} /></td>
                    <td className="text-ink-soft">{o.owner?.name ?? "—"}</td>
                    <td className="text-right tabular-nums">{o.estimatedValue ? <Amt v={o.estimatedValue} c={o.currency} /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
