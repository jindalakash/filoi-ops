import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader, Card, KV, Field, Empty } from "@/components/ui";
import { StatusBadge, INV_STATUS, DueDate } from "@/components/badges";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/client";
import { setInvoiceStatus, deleteInvoice, recordPayment, deletePayment } from "@/app/actions/finance";
import { SUPPLY_LABEL } from "@/lib/tax";
import { Amt } from "@/components/Money";
import { money, date, num, inputDate } from "@/lib/format";

export default async function InvoicePage({ params }: PageProps<"/finance/invoices/[id]">) {
  const user = await requireUser("financeView");
  const { id } = await params;
  const inv = await db.invoice.findUnique({ where: { id }, include: { items: true, client: true, project: true, milestone: true, payments: { orderBy: { date: "asc" } } } });
  if (!inv) notFound();
  const edit = can(user.role, "finance");
  const c = inv.currency;
  const settled = inv.payments.reduce((a, p) => a + num(p.amount) + num(p.tds) + num(p.bankCharges), 0);
  const balance = Math.max(0, num(inv.total) - settled);
  const inrReceived = inv.payments.reduce((a, p) => a + num(p.amount) * num(p.exchangeRate), 0);

  return (
    <>
      <PageHeader
        back={{ href: "/finance", label: "Finance" }}
        title={<span className="flex flex-wrap items-center gap-3">Invoice {inv.number} <StatusBadge map={INV_STATUS} value={inv.status} /></span>}
        subtitle={<><Link className="link" href={`/projects/${inv.projectId}?tab=billing`}>{inv.project.code}</Link> · {inv.client.name}</>}
        actions={<>
          <Link href={`/print/invoices/${id}`} className="btn-dark">View / Print PDF</Link>
          {edit && inv.status === "DRAFT" && <ConfirmAction action={setInvoiceStatus} fields={{ id, status: "SENT" }} label="Mark as sent" confirm="Mark this invoice as sent to the client?" className="btn-primary" />}
          {edit && inv.status === "DRAFT" && <ConfirmAction action={deleteInvoice} fields={{ id }} label="Delete draft" confirm="Delete this draft invoice?" className="btn-danger" />}
          {edit && ["SENT", "PARTIALLY_PAID"].includes(inv.status) && settled === 0 && <ConfirmAction action={setInvoiceStatus} fields={{ id, status: "CANCELLED" }} label="Cancel invoice" confirm="Cancel this invoice? The number stays used (GST)." className="btn-danger" />}
        </>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Summary">
            <KV items={[
              ["Invoice date", date(inv.issueDate)], ["Payment due", <DueDate key="d" value={inv.dueDate} done={inv.status === "PAID" || inv.status === "CANCELLED"} />],
              ["GST treatment", SUPPLY_LABEL[inv.supplyType]], ["Taxable value", <Amt key="s" v={inv.subtotal} c={c} />],
              ["GST", <Amt key="g" v={num(inv.cgst) + num(inv.sgst) + num(inv.igst)} c={c} />], ["Invoice total", <b key="t"><Amt v={inv.total} c={c} /></b>],
              ["Exchange rate", c === "INR" ? "—" : `1 ${c} = ₹${num(inv.exchangeRate)}`], ["Milestone", inv.milestone?.title], ["PO / contract", inv.poReference],
            ]} />
          </Card>
          <Card title="Line items" pad={false}>
            <div className="overflow-x-auto"><table className="table">
              <thead><tr><th>Description</th><th>SAC</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead>
              <tbody>{inv.items.map((it) => (
                <tr key={it.id}><td className="whitespace-pre-line">{it.description}</td><td>{it.sac}</td><td className="text-right">{num(it.quantity)}</td><td className="text-right">{money(it.rate, c)}</td><td className="text-right">{money(it.amount, c)}</td></tr>
              ))}</tbody>
            </table></div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Payments">
            <div className="mb-4 space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5"><span className="text-emerald-800">Settled</span><span className="font-display font-semibold tabular-nums text-emerald-900"><Amt v={settled} c={c} /></span></div>
              <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2.5"><span className="text-amber-800">Balance</span><span className="font-display font-semibold tabular-nums text-amber-900"><Amt v={balance} c={c} /></span></div>
            </div>
            {inv.payments.length === 0 ? <Empty title="No payments yet" /> : (
              <ul className="divide-y divide-line text-sm">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-2 py-2.5">
                    <div>
                      <div className="font-semibold"><Amt v={p.amount} c={c} /> <span className="font-normal text-ink-soft">on {date(p.date)}</span></div>
                      <div className="text-xs text-ink-soft">
                        {num(p.tds) > 0 && `TDS ${money(p.tds, c)} · `}{num(p.bankCharges) > 0 && `Bank charges ${money(p.bankCharges, c)} · `}
                        {c !== "INR" && `@ ₹${num(p.exchangeRate)} · `}{p.reference}
                      </div>
                    </div>
                    {edit && <ConfirmAction action={deletePayment} fields={{ id: p.id }} label="✕" confirm="Remove this payment?" className="text-xs text-ink-soft hover:text-red-700" />}
                  </li>
                ))}
              </ul>
            )}
            {c !== "INR" && inrReceived > 0 && <p className="mt-2 text-xs text-ink-soft">Realised in INR: ₹{new Intl.NumberFormat("en-IN").format(Math.round(inrReceived))}</p>}
            {edit && ["SENT", "PARTIALLY_PAID"].includes(inv.status) && (
              <ActionForm action={recordPayment} resetOnOk className="mt-4 space-y-3 border-t border-line pt-4">
                <input type="hidden" name="invoiceId" value={id} />
                <div className="text-sm font-semibold">Record payment</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`Received (${c})`}><input name="amount" inputMode="decimal" required defaultValue={balance || ""} className="input" /></Field>
                  <Field label="Date"><input type="date" name="date" defaultValue={inputDate(new Date())} className="input" /></Field>
                  <Field label="TDS deducted"><input name="tds" inputMode="decimal" className="input" /></Field>
                  <Field label="Bank charges"><input name="bankCharges" inputMode="decimal" className="input" /></Field>
                  {c !== "INR" && <Field label="Realised rate (₹)"><input name="exchangeRate" inputMode="decimal" defaultValue={num(inv.exchangeRate)} className="input" /></Field>}
                  <Field label="Reference / UTR"><input name="reference" className="input" /></Field>
                </div>
                <SubmitButton className="btn-primary w-full">Save payment</SubmitButton>
              </ActionForm>
            )}
            {inv.status === "DRAFT" && <p className="mt-3 text-xs text-ink-soft">Mark the invoice as sent to start recording payments.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
