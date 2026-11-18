import Link from "next/link";
import clsx from "clsx";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { cashForecast } from "@/lib/cashflow";
import { PageHeader, Card, Stat, Field, Notice } from "@/components/ui";
import { Badge } from "@/components/badges";
import { ActionForm, ConfirmAction, Disclosure, SubmitButton } from "@/components/client";
import { InOutChart, BalanceChart } from "@/components/CashCharts";
import { MonthlyCostsEditor } from "@/components/MonthlyCostsEditor";
import { saveCashflowSettings, addCashEntry, deleteCashEntry } from "@/app/actions/finance";
import { money, date, inputDate } from "@/lib/format";

export const metadata = { title: "Cash-flow forecast" };
const inr = (n: number) => money(n, "INR", { compact: true });
const SOURCE: Record<string, string> = { invoice: "Invoice", milestone: "Milestone", pipeline: "Pipeline", entry: "One-off", fixed: "Fixed" };

export default async function CashflowPage({ searchParams }: { searchParams: Promise<{ h?: string; p?: string }> }) {
  const user = await requireUser("financeView");
  const sp = await searchParams;
  const horizon = sp.h === "12" ? 12 : 6;
  const pipeline = sp.p === "1";
  const edit = can(user.role, "finance");
  const f = await cashForecast(horizon, pipeline);
  const entries = await db.cashEntry.findMany({ where: { date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } }, orderBy: { date: "asc" } });
  const next3 = f.months.slice(0, 3);
  const in3 = next3.reduce((a, m) => a + m.totalIn, 0), out3 = next3.reduce((a, m) => a + m.totalOut, 0);
  const low = f.months.reduce((a, m) => (m.closing < a.closing ? m : a), f.months[0]);
  const firstShort = f.months.find((m) => m.closing < 0);
  const overdue = f.months[0]?.items.filter((i) => i.overdue && i.source === "invoice") ?? [];
  const q = (h: number, p: boolean) => `?h=${h}${p ? "&p=1" : ""}`;

  return (
    <>
      <PageHeader title="Cash-flow forecast" back={{ href: "/finance", label: "Finance" }}
        subtitle={<>Expected money in and out, month by month, in ₹. {f.hasOpening ? <>Starts from your bank balance of <b>{money(f.cfg.openingBalance, "INR")}</b> on {date(f.cfg.openingDate)}.</> : <>Add your current bank balance below to see the projected balance.</>}</>}
        actions={<div className="flex flex-wrap gap-2">
          {[6, 12].map((h) => <Link key={h} href={q(h, pipeline)} className={clsx("rounded-full border px-3 py-1.5 text-sm font-semibold", horizon === h ? "border-navy bg-navy text-white" : "border-line bg-surface text-ink-soft")}>{h} months</Link>)}
          <Link href={q(horizon, !pipeline)} className={clsx("rounded-full border px-3 py-1.5 text-sm font-semibold", pipeline ? "border-plum bg-plum text-white" : "border-line bg-surface text-ink-soft")}>{pipeline ? "✓ " : ""}Include pipeline</Link>
        </div>} />

      {firstShort && <div className="mb-4"><Notice tone="error">⚠ Projected <b>shortfall in {firstShort.label}</b>: balance {money(firstShort.closing, "INR")}. Chase receivables, bring invoices forward or plan funding.</Notice></div>}
      {overdue.length > 0 && <div className="mb-4"><Notice tone="warn">{overdue.length} overdue invoice(s) worth <b>{inr(overdue.reduce((a, i) => a + i.inr, 0))}</b> are counted in this month — follow up to make that real.</Notice></div>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Expected in · 3 months" value={inr(in3)} hint={`${next3[0]?.label} – ${next3[2]?.label}`} tone="sky" />
        <Stat label="Expected out · 3 months" value={inr(out3)} hint={f.fixedPerMonth ? `${inr(f.fixedPerMonth)} fixed / month` : "Add your monthly costs below"} tone="plum" />
        <Stat label="Net · 3 months" value={inr(in3 - out3)} tone={in3 - out3 >= 0 ? "green" : "red"} />
        <Stat label="Lowest balance" value={inr(low.closing)} hint={`end of ${low.label}`} tone={low.closing < 0 ? "red" : "ink"} />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card title="Money in vs money out (₹)"><InOutChart months={f.months} /></Card>
        <Card title="Projected bank balance, end of month (₹)"><BalanceChart months={f.months} /></Card>
      </div>

      <Card title="Month by month" pad={false} className="mb-6">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Month</th><th className="text-right">Invoices due</th><th className="text-right">Milestones</th>{pipeline && <th className="text-right">Pipeline</th>}<th className="text-right">Other in</th><th className="text-right">Fixed costs</th><th className="text-right">Other out</th><th className="text-right">Net</th><th className="text-right">Balance</th></tr></thead>
            <tbody>{f.months.map((m) => (
              <tr key={m.key}>
                <td className="font-semibold">{m.label}</td>
                <td className="text-right tabular-nums">{inr(m.invoices)}</td>
                <td className="text-right tabular-nums">{inr(m.milestones)}</td>
                {pipeline && <td className="text-right tabular-nums text-ink-soft">{inr(m.pipeline)}</td>}
                <td className="text-right tabular-nums">{inr(m.otherIn)}</td>
                <td className="text-right tabular-nums">{inr(m.fixed)}</td>
                <td className="text-right tabular-nums">{inr(m.otherOut)}</td>
                <td className={clsx("text-right font-semibold tabular-nums", m.net < 0 && "text-red-700")}>{inr(m.net)}</td>
                <td className={clsx("text-right font-semibold tabular-nums", m.closing < 0 && "text-red-700")}>{inr(m.closing)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {f.laterIn > 0 && <p className="border-t border-line px-5 py-3 text-xs text-ink-soft">Another {inr(f.laterIn)} from invoices and milestones is expected after this period.</p>}
      </Card>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <Card title="What's expected each month" className="xl:col-span-2" pad={false}>
          <div className="divide-y divide-line">
            {f.months.filter((m) => m.items.length).map((m) => (
              <details key={m.key} className="group px-5 py-3" open={m === f.months[0]}>
                <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold"><span>{m.label} · {m.items.length} item(s)</span><span className="tabular-nums text-ink-soft">{inr(m.totalIn - m.otherOut)}</span></summary>
                <ul className="mt-2 space-y-1.5">
                  {m.items.map((it, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm">
                      <Badge tone={it.kind === "OUT" ? "purple" : it.source === "pipeline" ? "gray" : it.overdue ? "amber" : "blue"}>{it.kind === "OUT" ? "Out" : SOURCE[it.source]}</Badge>
                      <span className="min-w-0 flex-1">{it.href ? <Link href={it.href} className="hover:underline">{it.label}</Link> : it.label}{it.sub && <span className="block truncate text-xs text-ink-soft">{it.sub}</span>}</span>
                      <span className="text-xs text-ink-soft">{date(it.date)}</span>
                      <span className={clsx("w-24 text-right tabular-nums", it.kind === "OUT" && "text-plum")}>{it.kind === "OUT" ? "−" : ""}{inr(it.inr)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            {f.months.every((m) => !m.items.length) && <p className="px-5 py-6 text-sm text-ink-soft">Nothing expected yet — add billing milestones to projects, or one-off items on the right.</p>}
          </div>
        </Card>

        <div className="space-y-6">
          {edit && (
            <Card title="Forecast inputs">
              <ActionForm action={saveCashflowSettings} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Bank balance (₹)"><input name="openingBalance" inputMode="decimal" defaultValue={f.cfg.openingBalance || ""} className="input" /></Field>
                  <Field label="As of"><input type="date" name="openingDate" defaultValue={f.cfg.openingDate || inputDate(new Date())} className="input" /></Field>
                </div>
                <Field label="Default days to get paid" hint="Used for clients without payment history; others use their real average."><input name="paymentDelayDays" type="number" min={0} defaultValue={f.cfg.paymentDelayDays} className="input" /></Field>
                <div><span className="label">Fixed monthly costs (₹)</span><MonthlyCostsEditor initial={f.cfg.monthlyCosts ?? []} /></div>
                <SubmitButton>Save inputs</SubmitButton>
              </ActionForm>
              <p className="mt-3 text-xs text-ink-soft">Update the bank balance at the start of each month for an accurate view.</p>
            </Card>
          )}
          <Card title="One-off items" pad={false}>
            {entries.length === 0 ? <p className="px-5 py-4 text-sm text-ink-soft">E.g. advance tax, a laptop purchase, a grant or a loan.</p> : (
              <ul className="divide-y divide-line">
                {entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-5 py-2.5 text-sm">
                    <Badge tone={e.kind === "IN" ? "blue" : "purple"}>{e.kind === "IN" ? "In" : "Out"}</Badge>
                    <span className="min-w-0 flex-1 truncate">{e.description}<span className="block text-xs text-ink-soft">{date(e.date)}</span></span>
                    <span className="tabular-nums">{money(e.amountInr, "INR", { compact: true })}</span>
                    {edit && <ConfirmAction action={deleteCashEntry} fields={{ id: e.id }} label="✕" confirm="Remove this item?" className="px-1 text-xs text-ink-soft hover:text-red-700" />}
                  </li>
                ))}
              </ul>
            )}
            {edit && (
              <div className="border-t border-line p-4">
                <Disclosure label="+ Add one-off item" className="btn-ghost btn-sm">
                  <ActionForm action={addCashEntry} resetOnOk className="space-y-3">
                    <Field label="Description"><input name="description" required className="input" placeholder="Advance tax – Q3" /></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Date"><input type="date" name="date" required className="input" /></Field>
                      <Field label="Amount (₹)"><input name="amountInr" inputMode="decimal" required className="input" /></Field>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <label className="flex items-center gap-1.5"><input type="radio" name="kind" value="OUT" defaultChecked className="accent-plum" /> Money out</label>
                      <label className="flex items-center gap-1.5"><input type="radio" name="kind" value="IN" className="accent-plum" /> Money in</label>
                    </div>
                    <SubmitButton className="btn-dark btn-sm">Add</SubmitButton>
                  </ActionForm>
                </Disclosure>
              </div>
            )}
          </Card>
          <Card title="How it's calculated">
            <ul className="list-disc space-y-1.5 pl-4 text-xs text-ink-soft">
              <li><b>Invoices due:</b> unpaid balances on their due date; overdue ones count in this month.</li>
              <li><b>Milestones:</b> planned invoice date + each client&apos;s average time to pay (from your payment history), else the default.</li>
              <li><b>Pipeline</b> (optional): submitted bids × your win rate{pipeline ? ` (${Math.round(f.winRate * 100)}%)` : ""}, spread over the assignment, starting ~2 months after the deadline.</li>
              <li>USD/EUR converted with Settings → Currencies. GST and TDS are not modelled.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
