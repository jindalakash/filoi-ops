import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { financeSnapshot, sumINR } from "@/lib/metrics";
import { toINR } from "@/lib/fx";
import { fyLabel } from "@/lib/codes";
import { Card, Stat, Empty, Notice } from "@/components/ui";
import { StatusBadge, DL_STATUS, OPP_STATUS, DueDate } from "@/components/badges";
import { MultiMoney, Breakdown } from "@/components/Money";
import { ColumnChart } from "@/components/ColumnChart";
import { Amt } from "@/components/Money";
import { num } from "@/lib/format";

export const metadata = { title: "Dashboard" };

function monthKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()}`; }
function monthLabel(d: Date) { return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }); }

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const fin = can(user.role, "financeView");
  const pm = user.role === "PROJECT_MANAGER";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in14 = new Date(today.getTime() + 14 * 86400000);
  const fyStart = new Date(today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1, 3, 1);

  const [oppCounts, wonFY, decidedFY, deliverables, deadlines, activeProjects] = await Promise.all([
    db.opportunity.groupBy({ by: ["status"], _count: true }),
    db.opportunity.count({ where: { status: "WON", decisionAt: { gte: fyStart } } }),
    db.opportunity.count({ where: { status: { in: ["WON", "LOST"] }, decisionAt: { gte: fyStart } } }),
    db.deliverable.findMany({
      where: { status: { not: "ACCEPTED" }, dueDate: { lte: in14 }, project: { status: "ACTIVE" }, ...(pm ? { OR: [{ ownerId: user.id }, { project: { managerId: user.id } }] } : {}) },
      include: { project: { include: { client: true } }, owner: true }, orderBy: { dueDate: "asc" }, take: 12,
    }),
    db.opportunity.findMany({ where: { status: { in: ["DRAFT", "IN_REVIEW"] }, submissionDeadline: { gte: today } }, include: { client: true }, orderBy: { submissionDeadline: "asc" }, take: 6 }),
    db.project.count({ where: { status: "ACTIVE" } }),
  ]);
  const cnt = (...s: string[]) => oppCounts.filter((c) => s.includes(c.status)).reduce((a, c) => a + c._count, 0);

  // finance data (admin + accounts only)
  let financeBlock = null;
  if (fin) {
    const [fx, snap] = await Promise.all([getSetting("fx"), financeSnapshot()]);
    const months = Array.from({ length: 6 }, (_, i) => new Date(today.getFullYear(), today.getMonth() + i, 1));
    const past = Array.from({ length: 6 }, (_, i) => new Date(today.getFullYear(), today.getMonth() - 5 + i, 1));
    const [planned, payments] = await Promise.all([
      db.milestone.findMany({ where: { status: "PLANNED", dueDate: { gte: months[0], lt: new Date(today.getFullYear(), today.getMonth() + 6, 1) }, project: { status: "ACTIVE" } }, include: { project: { select: { currency: true } } } }),
      db.payment.findMany({ where: { date: { gte: past[0] } }, include: { invoice: { select: { currency: true } } } }),
    ]);
    const fwd = new Map(months.map((m) => [monthKey(m), 0]));
    for (const m of planned) { const k = monthKey(m.dueDate!); fwd.set(k, (fwd.get(k) ?? 0) + toINR(m.amount, m.project.currency, fx)); }
    const back = new Map(past.map((m) => [monthKey(m), 0]));
    for (const p of payments) { const k = monthKey(p.date); if (back.has(k)) back.set(k, back.get(k)! + num(p.amount) * (p.invoice.currency === "INR" ? 1 : num(p.exchangeRate))); }
    const overdueInv = await db.invoice.findMany({ where: { status: { in: ["SENT", "PARTIALLY_PAID"] }, dueDate: { lt: today } }, include: { client: true, payments: true }, orderBy: { dueDate: "asc" }, take: 6 });
    const S = (t: typeof snap.received) => <MultiMoney totals={t} inr={sumINR(t, fx)} />;

    financeBlock = (
      <>
        <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-ink-soft">Financial position</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label="Active contracts" value={S(snap.activeContract)} hint={<Breakdown totals={snap.activeContract} />} tone="ink" href="/projects" />
          <Stat label="Awaiting award" value={S(snap.awaitingAward)} hint={`${snap.pipelineCount} proposals submitted`} tone="plum" href="/opportunities?f=pending" />
          <Stat label="Yet to invoice" value={S(snap.unbilled)} hint="Active contract value not billed" tone="sun" />
          <Stat label="Received" value={S(snap.received)} hint={<Breakdown totals={snap.received} />} tone="green" href="/finance?s=paid" />
          <Stat label="Outstanding" value={S(snap.outstanding)} hint={<Breakdown totals={snap.outstanding} />} tone="red" href="/finance?s=open" />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="Expected invoicing — next 6 months (₹)">
            <ColumnChart caption="Planned billing milestones per month, in INR" color="var(--color-plum)"
              data={months.map((m) => ({ label: monthLabel(m), value: Math.round(fwd.get(monthKey(m)) ?? 0) }))} />
          </Card>
          <Card title="Money received — last 6 months (₹)">
            <ColumnChart caption="Payments received per month, in INR" color="var(--color-sky)"
              data={past.map((m) => ({ label: monthLabel(m), value: Math.round(back.get(monthKey(m)) ?? 0) }))} />
          </Card>
        </div>
        {overdueInv.length > 0 && (
          <Card title="Overdue payments" className="mt-6" pad={false}>
            <div className="overflow-x-auto"><table className="table"><tbody>
              {overdueInv.map((i) => (
                <tr key={i.id}><td><Link className="link" href={`/finance/invoices/${i.id}`}>{i.number}</Link></td><td>{i.client.shortName || i.client.name}</td>
                  <td><DueDate value={i.dueDate} /></td>
                  <td className="text-right tabular-nums"><Amt v={num(i.total) - i.payments.reduce((a, p) => a + num(p.amount) + num(p.tds) + num(p.bankCharges), 0)} c={i.currency} /></td></tr>
              ))}
            </tbody></table></div>
          </Card>
        )}
      </>
    );
  }

  const hour = new Date().getHours();
  return (
    <>
      {denied && <div className="mb-4"><Notice tone="warn">You don&apos;t have access to that page.</Notice></div>}
      <div className="mb-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold sm:text-[26px]">Good {hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, {user.name.split(" ")[0]}</h1>
          <p className="text-sm text-ink-soft">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · FY {fyLabel()} · {activeProjects} active projects</p>
        </div>
        {can(user.role, "presales") && <Link href="/opportunities/new" className="btn-primary self-start">+ New proposal</Link>}
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">Proposals</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="In draft / review" value={cnt("DRAFT", "IN_REVIEW")} hint={`${cnt("IN_REVIEW")} in internal review`} tone="sun" href="/opportunities?f=open" />
        <Stat label="Submitted" value={cnt("SUBMITTED", "UNDER_EVALUATION")} hint="Awaiting client decision" tone="sky" href="/opportunities?f=pending" />
        <Stat label="Won" value={cnt("WON")} hint={`${wonFY} this financial year`} tone="green" href="/opportunities?f=won" />
        <Stat label="Lost / dropped" value={cnt("LOST", "CANCELLED", "NO_GO")} tone="red" href="/opportunities?f=closed" />
        <Stat label="Win rate (FY)" value={decidedFY ? `${Math.round((wonFY / decidedFY) * 100)}%` : "—"} hint={`${decidedFY} decided this FY`} tone="plum" />
      </div>

      {financeBlock}

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <Card title={pm ? "My deliverables — due within 14 days or overdue" : "Deliverables — due within 14 days or overdue"} className="lg:col-span-3" pad={false} actions={<Link href="/deliverables" className="text-xs link">View all</Link>}>
          {deliverables.length === 0 ? <Empty title="All clear">Nothing due in the next two weeks.</Empty> : (
            <ul className="divide-y divide-line">
              {deliverables.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{d.title}</div>
                    <div className="truncate text-xs text-ink-soft"><Link href={`/projects/${d.projectId}`} className="hover:underline">{d.project.code} · {d.project.client.shortName || d.project.client.name}</Link>{d.owner && ` · ${d.owner.name}`}</div>
                  </div>
                  <div className="text-right text-xs"><DueDate value={d.dueDate} /><div className="mt-1"><StatusBadge map={DL_STATUS} value={d.status} /></div></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Upcoming proposal deadlines" className="lg:col-span-2" pad={false} actions={<Link href="/opportunities?f=open" className="text-xs link">View all</Link>}>
          {deadlines.length === 0 ? <Empty title="No open deadlines" /> : (
            <ul className="divide-y divide-line">
              {deadlines.map((o) => (
                <li key={o.id} className="px-5 py-3">
                  <Link href={`/opportunities/${o.id}`} className="line-clamp-1 text-sm font-semibold hover:text-plum">{o.title}</Link>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-xs"><span className="text-ink-soft">{o.client.shortName || o.client.name}</span><DueDate value={o.submissionDeadline} /></div>
                  <div className="mt-1"><StatusBadge map={OPP_STATUS} value={o.status} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
