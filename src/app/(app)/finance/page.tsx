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

export const metadata = { title: "Finance" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const user = await requireUser("financeView");
  const { s = "open" } = await searchParams;
  const fx = await getSetting("fx");
  const snap = await financeSnapshot();
  const statusFilter: Record<string, InvoiceStatus[] | undefined> = { open: ["SENT", "PARTIALLY_PAID"], draft: ["DRAFT"], paid: ["PAID"], cancelled: ["CANCELLED"], all: undefined };
  const in45 = daysFromNow(45);
  const [invoices, toRaise] = await Promise.all([
    db.invoice.findMany({ where: statusFilter[s] ? { status: { in: statusFilter[s] } } : {}, include: { client: true, project: true, payments: true }, orderBy: { issueDate: "desc" }, take: 200 }),
    db.milestone.findMany({ where: { status: "PLANNED", project: { status: "ACTIVE" }, OR: [{ dueDate: { lte: in45 } }, { dueDate: null }] }, include: { project: { include: { client: true } }, deliverable: true }, orderBy: { dueDate: { sort: "asc", nulls: "last" } }, take: 30 }),
  ]);
  const S = (t: typeof snap.received) => <MultiMoney totals={t} inr={sumINR(t, fx)} />;
  const ageing = [["Not yet due", snap.ageing.current], ["1–30 days", snap.ageing.d30], ["31–60 days", snap.ageing.d60], ["61–90 days", snap.ageing.d90], ["90+ days", snap.ageing.d90p]] as const;
  const ageTotal = ageing.reduce((a, [, t]) => a + sumINR(t, fx), 0);

  return (
    <>
      <PageHeader title="Finance" subtitle={`Billing, receivables and payments. Mixed currencies are shown in ₹ at USD ${fx.USD} / EUR ${fx.EUR} (change in Settings).`}
        actions={can(user.role, "finance") && <Link href="/finance/invoices/new" className="btn-primary">+ New invoice</Link>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Invoiced (all time)" value={S(snap.invoiced)} hint={<Breakdown totals={snap.invoiced} />} tone="sky" />
        <Stat label="Received" value={S(snap.received)} hint={<Breakdown totals={snap.received} />} tone="green" />
        <Stat label="Outstanding" value={S(snap.outstanding)} hint={<Breakdown totals={snap.outstanding} />} tone="red" href="/finance?s=open" />
        <Stat label="TDS deducted" value={S(snap.tds)} hint="Claim in your ITR / 26AS" tone="sun" />
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-5">
        <Card title="To invoice — next 45 days" className="lg:col-span-3" pad={false}>
          {toRaise.length === 0 ? <Empty title="Nothing due for invoicing" /> : (
            <div className="overflow-x-auto"><table className="table">
              <tbody>{toRaise.map((m) => (
                <tr key={m.id}>
                  <td><div className="font-semibold">{m.title}</div><div className="text-xs text-ink-soft">{m.project.code} · {m.project.client.shortName || m.project.client.name}{m.deliverable && ` · ${m.deliverable.title}`}</div></td>
                  <td><DueDate value={m.dueDate} /></td>
                  <td className="text-right tabular-nums"><Amt v={m.amount} c={m.project.currency} /></td>
                  <td className="text-right">{can(user.role, "finance") && <Link href={`/finance/invoices/new?milestoneId=${m.id}`} className="btn-primary btn-sm">Invoice</Link>}</td>
                </tr>
              ))}</tbody>
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
        <div className="flex flex-wrap gap-1 border-b border-line px-3 pt-2">
          {[["open", "Unpaid"], ["draft", "Drafts"], ["paid", "Paid"], ["cancelled", "Cancelled"], ["all", "All"]].map(([k, l]) => (
            <Link key={k} href={`/finance?s=${k}`} className={clsx("tab", s === k && "tab-active")}>{l}</Link>
          ))}
        </div>
        {invoices.length === 0 ? <Empty title="No invoices" /> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Invoice</th><th>Client / project</th><th>Date</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Balance</th><th>Status</th></tr></thead>
            <tbody>{invoices.map((i) => {
              const bal = Math.max(0, num(i.total) - i.payments.reduce((a, p) => a + num(p.amount) + num(p.tds) + num(p.bankCharges), 0));
              return (
                <tr key={i.id}>
                  <td><Link className="link" href={`/finance/invoices/${i.id}`}>{i.number}</Link></td>
                  <td>{i.client.shortName || i.client.name}<div className="text-xs text-ink-soft">{i.project.code}</div></td>
                  <td>{date(i.issueDate)}</td>
                  <td><DueDate value={i.dueDate} done={["PAID", "CANCELLED", "DRAFT"].includes(i.status)} /></td>
                  <td className="text-right tabular-nums"><Amt v={i.total} c={i.currency} /></td>
                  <td className="text-right tabular-nums">{i.status === "CANCELLED" ? "—" : <Amt v={bal} c={i.currency} />}</td>
                  <td><StatusBadge map={INV_STATUS} value={i.status} /></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
