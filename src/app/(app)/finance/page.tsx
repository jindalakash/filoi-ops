import Link from "next/link";
import clsx from "clsx";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { financeSnapshot, sumINR } from "@/lib/metrics";
import { PageHeader, Card, Stat, Empty } from "@/components/ui";
import { StatusBadge, INV_STATUS, DueDate } from "@/components/badges";
import { MultiMoney, Breakdown } from "@/components/Money";
import { Amt } from "@/components/Money";
import { money, date, num, daysFromNow } from "@/lib/format";
import type { InvoiceStatus } from "@prisma/client";
import { GroupTbody, CollapseAllButtons } from "@/components/CollapsibleGroup";

type ProjectLite = { id: string; code: string; title: string; client: { name: string; shortName: string | null } };
/** Rows grouped by project, in the order projects first appear. */
function byProject<T extends { project: ProjectLite }>(rows: T[]) {
  const map = new Map<string, { project: ProjectLite; rows: T[] }>();
  for (const r of rows) {
    const g = map.get(r.project.id) ?? { project: r.project, rows: [] };
    g.rows.push(r);
    map.set(r.project.id, g);
  }
  return [...map.values()];
}
function addTo(t: Record<string, number>, c: string, v: number) { t[c] = (t[c] ?? 0) + v; return t; }

export const metadata = { title: "Finance" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const user = await requireUser("financeView");
  const { s = "open" } = await searchParams;
  const fx = await getSetting("fx");
  const snap = await financeSnapshot();
  const statusFilter: Record<string, InvoiceStatus[] | undefined> = { open: ["SENT", "PARTIALLY_PAID"], draft: ["DRAFT"], paid: ["PAID"], cancelled: ["CANCELLED"], all: undefined };
  const in45 = daysFromNow(45);
  const [invoices, toRaise] = await Promise.all([
    db.invoice.findMany({ where: statusFilter[s] ? { status: { in: statusFilter[s] } } : {}, include: { client: true, project: { include: { client: true } }, payments: true }, orderBy: { issueDate: "desc" }, take: 300 }),
    db.milestone.findMany({ where: { status: "PLANNED", project: { status: "ACTIVE" }, OR: [{ dueDate: { lte: in45 } }, { dueDate: null }] }, include: { project: { include: { client: true } }, deliverable: true }, orderBy: { dueDate: { sort: "asc", nulls: "last" } }, take: 200 }),
  ]);
  const S = (t: typeof snap.received) => <MultiMoney totals={t} inr={sumINR(t, fx)} />;
  const ageing = [["Not yet due", snap.ageing.current], ["1–30 days", snap.ageing.d30], ["31–60 days", snap.ageing.d60], ["61–90 days", snap.ageing.d90], ["90+ days", snap.ageing.d90p]] as const;
  const ageTotal = ageing.reduce((a, [, t]) => a + sumINR(t, fx), 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const raiseGroups = byProject(toRaise);
  const invGroups = byProject(invoices);
  const balanceOf = (i: (typeof invoices)[number]) => Math.max(0, num(i.total) - i.payments.reduce((a, p) => a + num(p.amount) + num(p.tds) + num(p.bankCharges), 0));
  const Subtotal = ({ totals }: { totals: Record<string, number> }) => {
    const parts = Object.entries(totals).filter(([, v]) => Math.abs(v) > 0.009);
    if (!parts.length) return <>—</>;
    if (parts.length === 1) return <b className="text-ink"><Amt v={parts[0][1]} c={parts[0][0]} compact /></b>;
    return <b className="text-ink"><MultiMoney inr={sumINR(totals, fx)} /> <Breakdown totals={totals} /></b>;
  };
  const projectHeader = (p: ProjectLite, tab?: string) => (
    <span><Link href={`/projects/${p.id}${tab ? `?tab=${tab}` : ""}`} className="link">{p.code}</Link> <span className="font-normal text-ink-soft">· {p.client.shortName || p.client.name} · {p.title}</span></span>
  );

  return (
    <>
      <PageHeader title="Finance" subtitle={`Billing, receivables and payments. Mixed currencies are shown in ₹ at USD ${fx.USD} / EUR ${fx.EUR} (change in Settings).`}
        actions={<>
          <Link href="/finance/cashflow" className="btn-ghost">Cash-flow forecast</Link>
          {can(user.role, "finance") && <Link href="/finance/invoices/new" className="btn-primary">+ New invoice</Link>}
        </>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Invoiced (all time)" value={S(snap.invoiced)} hint={<Breakdown totals={snap.invoiced} />} tone="sky" />
        <Stat label="Received" value={S(snap.received)} hint={<Breakdown totals={snap.received} />} tone="green" />
        <Stat label="Outstanding" value={S(snap.outstanding)} hint={<Breakdown totals={snap.outstanding} />} tone="red" href="/finance?s=open" />
        <Stat label="TDS deducted" value={S(snap.tds)} hint="Claim in your ITR / 26AS" tone="sun" />
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-5">
        <Card title="To invoice — next 45 days" className="lg:col-span-3" pad={false} actions={raiseGroups.length > 1 && <CollapseAllButtons scope="finance-raise" ids={raiseGroups.map((g) => g.project.id)} />}>
          {toRaise.length === 0 ? <Empty title="Nothing due for invoicing" /> : (
            <div className="overflow-x-auto"><table className="table">
              {raiseGroups.map(({ project: p, rows }) => {
                const overdue = rows.filter((m) => m.dueDate && m.dueDate < today).length;
                return (
                  <GroupTbody key={p.id} scope="finance-raise" id={p.id} colSpan={4} header={projectHeader(p, "billing")}
                    summary={<>{rows.length} to invoice{overdue > 0 && <span className="font-semibold text-red-700"> · {overdue} overdue</span>} · <Subtotal totals={rows.reduce((t, m) => addTo(t, m.project.currency, num(m.amount)), {} as Record<string, number>)} /></>}>
                    {rows.map((m) => (
                      <tr key={m.id}>
                        <td className="pl-12"><div className="font-semibold">{m.title}</div>{m.deliverable && <div className="text-xs text-ink-soft">{m.deliverable.title}</div>}</td>
                        <td><DueDate value={m.dueDate} /></td>
                        <td className="text-right tabular-nums"><Amt v={m.amount} c={m.project.currency} /></td>
                        <td className="text-right">{can(user.role, "finance") && <Link href={`/finance/invoices/new?milestoneId=${m.id}`} className="btn-primary btn-sm">Invoice</Link>}</td>
                      </tr>
                    ))}
                  </GroupTbody>
                );
              })}
            </table></div>
          )}
        </Card>
        <Card title="Receivables ageing (₹)" className="lg:col-span-2">
          <ul className="space-y-3">
            {ageing.map(([label, t], i) => {
              const v = sumINR(t, fx);
              return (
                <li key={label}>
                  <div className="flex justify-between text-sm"><span>{label}</span><span className="font-semibold tabular-nums">{money(v, "INR", { compact: true })}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-line"><div className={clsx("h-full rounded-full", i === 0 ? "bg-sky" : i === 1 ? "bg-sun" : "bg-red-600")} style={{ width: `${ageTotal ? (v / ageTotal) * 100 : 0}%` }} /></div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 pt-2">
          {[["open", "Unpaid"], ["draft", "Drafts"], ["paid", "Paid"], ["cancelled", "Cancelled"], ["all", "All"]].map(([k, l]) => (
            <Link key={k} href={`/finance?s=${k}`} className={clsx("tab", s === k && "tab-active")}>{l}</Link>
          ))}
          {invGroups.length > 1 && <span className="mb-1.5 ml-auto"><CollapseAllButtons scope="finance-invoices" ids={invGroups.map((g) => g.project.id)} /></span>}
        </div>
        {invoices.length === 0 ? <Empty title="No invoices" /> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th className="pl-12">Invoice</th><th>Date</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Balance</th><th>Status</th></tr></thead>
            {invGroups.map(({ project: p, rows }) => {
              const live = rows.filter((i) => i.status !== "CANCELLED");
              const bal = live.reduce((t, i) => addTo(t, i.currency, balanceOf(i)), {} as Record<string, number>);
              const tot = live.reduce((t, i) => addTo(t, i.currency, num(i.total)), {} as Record<string, number>);
              const overdue = rows.filter((i) => ["SENT", "PARTIALLY_PAID"].includes(i.status) && i.dueDate && i.dueDate < today).length;
              return (
                <GroupTbody key={p.id} scope="finance-invoices" id={p.id} colSpan={6} header={projectHeader(p, "billing")}
                  summary={<>{rows.length} invoice{rows.length > 1 ? "s" : ""}{overdue > 0 && <span className="font-semibold text-red-700"> · {overdue} overdue</span>} · {s === "paid" || s === "cancelled" ? <>total <Subtotal totals={tot} /></> : <>balance <Subtotal totals={bal} /></>}</>}>
                  {rows.map((i) => (
                    <tr key={i.id}>
                      <td className="whitespace-nowrap pl-12"><Link className="link" href={`/finance/invoices/${i.id}`}>{i.number}</Link></td>
                      <td>{date(i.issueDate)}</td>
                      <td><DueDate value={i.dueDate} done={["PAID", "CANCELLED", "DRAFT"].includes(i.status)} /></td>
                      <td className="text-right tabular-nums"><Amt v={i.total} c={i.currency} /></td>
                      <td className="text-right tabular-nums">{i.status === "CANCELLED" ? "—" : <Amt v={balanceOf(i)} c={i.currency} />}</td>
                      <td><StatusBadge map={INV_STATUS} value={i.status} /></td>
                    </tr>
                  ))}
                </GroupTbody>
              );
            })}
          </table></div>
        )}
      </Card>
    </>
  );
}
