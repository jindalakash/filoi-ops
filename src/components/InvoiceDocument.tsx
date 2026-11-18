// Printable GST-compliant tax invoice
import { amountInWords, date, money, num } from "@/lib/format";
import type { CompanySettings } from "@/lib/settings";
import type { Client, Invoice, InvoiceItem, Project } from "@prisma/client";

export function InvoiceDocument({ inv, company }: { inv: Invoice & { items: InvoiceItem[]; client: Client; project: Project }; company: CompanySettings }) {
  const c = inv.currency;
  const isExport = inv.supplyType === "EXPORT_LUT";
  const rate = num(inv.taxRate);
  return (
    <div className="mx-auto max-w-[800px] bg-white p-10 text-[13px] leading-relaxed text-ink print:p-0">
      <div className="flex items-start justify-between gap-6 border-b-2 border-ink pb-5">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/filoi-logo.png" alt="Filoi" className="h-14 w-auto" />
          <div className="mt-2 font-display text-base font-semibold">{company.legalName}</div>
          <div className="whitespace-pre-line text-ink-soft">{company.address}</div>
          <div className="text-ink-soft">{[company.email, company.phone, company.website].filter(Boolean).join(" · ")}</div>
          <div className="mt-1 text-xs">{company.gstin && <>GSTIN: <b>{company.gstin}</b> · </>}{company.pan && <>PAN: {company.pan}</>}{company.cin && <> · CIN: {company.cin}</>}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-semibold tracking-wide text-plum">{isExport || inv.supplyType === "EXEMPT" ? "INVOICE" : "TAX INVOICE"}</div>
          <table className="ml-auto mt-2 text-left text-xs">
            <tbody>
              <tr><td className="pr-3 text-ink-soft">Invoice no.</td><td className="font-semibold">{inv.number}</td></tr>
              <tr><td className="pr-3 text-ink-soft">Date</td><td>{date(inv.issueDate)}</td></tr>
              {inv.dueDate && <tr><td className="pr-3 text-ink-soft">Due date</td><td>{date(inv.dueDate)}</td></tr>}
              {inv.poReference && <tr><td className="pr-3 text-ink-soft">PO / Contract</td><td>{inv.poReference}</td></tr>}
              {inv.placeOfSupply && <tr><td className="pr-3 text-ink-soft">Place of supply</td><td>{inv.placeOfSupply}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {isExport && (
        <div className="mt-4 rounded-md border border-plum/30 bg-plum/5 px-3 py-2 text-xs font-semibold text-plum">
          SUPPLY MEANT FOR EXPORT OF SERVICES UNDER LETTER OF UNDERTAKING (LUT) WITHOUT PAYMENT OF INTEGRATED TAX (IGST)
          {company.lutNumber && <span className="font-normal"> — LUT ARN: {company.lutNumber}{company.lutValidity && ` (valid ${company.lutValidity})`}</span>}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Bill to</div>
          <div className="mt-1 font-semibold">{inv.client.name}</div>
          <div className="whitespace-pre-line">{inv.client.address}</div>
          <div>{inv.client.country}</div>
          {inv.client.gstin && <div className="text-xs">GSTIN: {inv.client.gstin}</div>}
          {inv.client.vendorNumber && <div className="text-xs">Supplier no.: {inv.client.vendorNumber}</div>}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Project</div>
          <div className="mt-1 font-semibold">{inv.project.title}</div>
          <div className="text-xs text-ink-soft">{inv.project.code}</div>
        </div>
      </div>

      <table className="mt-6 w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="bg-ink text-left text-white">
            <th className="px-3 py-2 font-semibold">#</th><th className="px-3 py-2 font-semibold">Description of services</th><th className="px-3 py-2 font-semibold">SAC</th>
            <th className="px-3 py-2 text-right font-semibold">Qty</th><th className="px-3 py-2 text-right font-semibold">Rate</th><th className="px-3 py-2 text-right font-semibold">Amount ({c})</th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((it, i) => (
            <tr key={it.id} className="border-b border-line align-top">
              <td className="px-3 py-2">{i + 1}</td><td className="whitespace-pre-line px-3 py-2">{it.description}</td><td className="px-3 py-2">{it.sac}</td>
              <td className="px-3 py-2 text-right">{num(it.quantity)}</td><td className="px-3 py-2 text-right">{money(it.rate, c)}</td><td className="px-3 py-2 text-right">{money(it.amount, c)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex justify-end">
        <table className="w-72 text-sm">
          <tbody>
            <tr><td className="py-1 text-ink-soft">Taxable value</td><td className="py-1 text-right">{money(inv.subtotal, c)}</td></tr>
            {num(inv.cgst) > 0 && <tr><td className="py-1 text-ink-soft">CGST @ {rate / 2}%</td><td className="py-1 text-right">{money(inv.cgst, c)}</td></tr>}
            {num(inv.sgst) > 0 && <tr><td className="py-1 text-ink-soft">SGST @ {rate / 2}%</td><td className="py-1 text-right">{money(inv.sgst, c)}</td></tr>}
            {num(inv.igst) > 0 && <tr><td className="py-1 text-ink-soft">IGST @ {rate}%</td><td className="py-1 text-right">{money(inv.igst, c)}</td></tr>}
            {isExport && <tr><td className="py-1 text-ink-soft">IGST @ 0% (LUT)</td><td className="py-1 text-right">{money(0, c)}</td></tr>}
            <tr className="border-t-2 border-ink font-semibold"><td className="py-2">Total</td><td className="py-2 text-right">{money(inv.total, c)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="mt-1 text-right text-xs italic">{amountInWords(inv.total, c)}</div>
      {c !== "INR" && <div className="mt-1 text-right text-xs text-ink-soft">INR equivalent @ {num(inv.exchangeRate)}: ₹{new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(num(inv.total) * num(inv.exchangeRate))}</div>}

      {inv.notes && <div className="mt-5"><div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Notes</div><p className="whitespace-pre-line">{inv.notes}</p></div>}

      <div className="mt-6 grid grid-cols-2 gap-6 border-t border-line pt-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Bank details for remittance</div>
          <p className="mt-1 whitespace-pre-line text-xs">{company.bankDetails || "— add bank details in Settings —"}</p>
        </div>
        <div className="text-right">
          <div className="text-xs">For {company.legalName}</div>
          <div className="h-16" />
          <div className="text-xs font-semibold">Authorised Signatory</div>
        </div>
      </div>
      {company.invoiceFooter && <div className="mt-6 text-center text-xs text-ink-soft">{company.invoiceFooter}</div>}
    </div>
  );
}
