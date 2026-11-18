"use client";
import { useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "./client";
import { createInvoice } from "@/app/actions/finance";
import { CURRENCIES } from "@/lib/format";

type Item = { description: string; sac: string; quantity: number; rate: number };
type ProjectOpt = { id: string; label: string; currency: string; supplyType: string };

const SUPPLY = [
  ["EXPORT_LUT", "Export of services – under LUT (0% GST)"],
  ["DOMESTIC_INTER", "Domestic – inter-state (IGST)"],
  ["DOMESTIC_INTRA", "Domestic – intra-state (CGST + SGST)"],
  ["EXEMPT", "Exempt / non-taxable"],
] as const;

export function InvoiceEditor(props: {
  projects: ProjectOpt[];
  projectId?: string;
  milestoneId?: string;
  defaults: { issueDate: string; dueDate: string; items: Item[]; supplyType: string; currency: string; exchangeRate: number; poReference: string; placeOfSupply: string; nextNumber: string };
  fx: Record<string, number>;
}) {
  const { defaults: d } = props;
  const [projectId, setProjectId] = useState(props.projectId ?? "");
  const [items, setItems] = useState<Item[]>(d.items.length ? d.items : [{ description: "", sac: "998311", quantity: 1, rate: 0 }]);
  const [supply, setSupply] = useState(d.supplyType);
  const [rate, setRate] = useState(18);
  const [currency, setCurrency] = useState(d.currency);
  const [fxRate, setFxRate] = useState(d.exchangeRate);

  const sub = useMemo(() => Math.round(items.reduce((s, i) => s + (i.quantity || 0) * (i.rate || 0), 0) * 100) / 100, [items]);
  const taxable = supply === "DOMESTIC_INTER" || supply === "DOMESTIC_INTRA";
  const tax = taxable ? Math.round(sub * rate) / 100 : 0;
  const total = sub + tax;
  const fmt = (n: number) => new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(n);

  function pickProject(id: string) {
    setProjectId(id);
    const p = props.projects.find((x) => x.id === id);
    if (p) { setCurrency(p.currency); setSupply(p.supplyType); setFxRate(props.fx[p.currency] ?? 1); }
  }
  const upd = (i: number, k: keyof Item, v: string) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: k === "quantity" || k === "rate" ? Number(v.replace(/,/g, "")) || 0 : v } : x)));

  return (
    <ActionForm action={createInvoice}>
      {props.milestoneId && <input type="hidden" name="milestoneId" value={props.milestoneId} />}
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block sm:col-span-2"><span className="label">Project *</span>
          <select className="input" value={projectId} onChange={(e) => pickProject(e.target.value)} disabled={!!props.milestoneId} required>
            <option value="">Select project…</option>
            {props.projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Invoice no.</span><input name="number" placeholder={d.nextNumber} className="input" /><span className="mt-1 block text-xs text-ink-soft">Leave blank for {d.nextNumber}</span></label>
        <label className="block"><span className="label">Client PO / contract ref.</span><input name="poReference" defaultValue={d.poReference} className="input" /></label>
        <label className="block"><span className="label">Invoice date</span><input type="date" name="issueDate" defaultValue={d.issueDate} className="input" /></label>
        <label className="block"><span className="label">Payment due</span><input type="date" name="dueDate" defaultValue={d.dueDate} className="input" /></label>
        <label className="block"><span className="label">Currency</span>
          <select name="currency" className="input" value={currency} onChange={(e) => { setCurrency(e.target.value); setFxRate(props.fx[e.target.value] ?? 1); }}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label className="block"><span className="label">Exchange rate (1 {currency} = ₹)</span><input name="exchangeRate" inputMode="decimal" value={fxRate} onChange={(e) => setFxRate(Number(e.target.value) || 0)} className="input" disabled={currency === "INR"} />
          {currency === "INR" && <input type="hidden" name="exchangeRate" value="1" />}
        </label>
        <label className="block sm:col-span-2"><span className="label">GST treatment</span>
          <select name="supplyType" className="input" value={supply} onChange={(e) => setSupply(e.target.value)}>{SUPPLY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        {taxable && <label className="block"><span className="label">GST rate %</span><input name="taxRate" inputMode="decimal" value={rate} onChange={(e) => setRate(Number(e.target.value) || 0)} className="input" /></label>}
        <label className="block"><span className="label">Place of supply</span><input name="placeOfSupply" defaultValue={d.placeOfSupply} className="input" placeholder="Outside India (96)" /></label>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        <table className="table">
          <thead><tr><th className="w-[46%]">Description</th><th>SAC</th><th className="w-20">Qty</th><th className="w-36">Rate</th><th className="text-right">Amount</th><th></th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td><textarea name="item_description" rows={2} value={it.description} onChange={(e) => upd(i, "description", e.target.value)} className="input min-w-56" required /></td>
                <td><input name="item_sac" value={it.sac} onChange={(e) => upd(i, "sac", e.target.value)} className="input !w-24" /></td>
                <td><input name="item_quantity" inputMode="decimal" value={it.quantity} onChange={(e) => upd(i, "quantity", e.target.value)} className="input min-w-16" /></td>
                <td><input name="item_rate" inputMode="decimal" value={it.rate} onChange={(e) => upd(i, "rate", e.target.value)} className="input min-w-28" /></td>
                <td className="text-right tabular-nums">{fmt((it.quantity || 0) * (it.rate || 0))}</td>
                <td>{items.length > 1 && <button type="button" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} className="text-ink-soft hover:text-red-700">✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-line p-3"><button type="button" className="btn-ghost btn-sm" onClick={() => setItems((xs) => [...xs, { description: "", sac: xs[0]?.sac ?? "998311", quantity: 1, rate: 0 }])}>+ Add line</button></div>
      </div>

      <div className="mt-4 flex flex-col gap-6 md:flex-row md:justify-between">
        <label className="block md:w-1/2"><span className="label">Notes on invoice</span><textarea name="notes" rows={3} className="input" /></label>
        <div className="min-w-72 space-y-1.5 rounded-xl bg-mist p-4 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{fmt(sub)}</span></div>
          {supply === "DOMESTIC_INTRA" && <><div className="flex justify-between"><span>CGST {rate / 2}%</span><span className="tabular-nums">{fmt(tax / 2)}</span></div><div className="flex justify-between"><span>SGST {rate / 2}%</span><span className="tabular-nums">{fmt(tax / 2)}</span></div></>}
          {supply === "DOMESTIC_INTER" && <div className="flex justify-between"><span>IGST {rate}%</span><span className="tabular-nums">{fmt(tax)}</span></div>}
          {supply === "EXPORT_LUT" && <div className="flex justify-between text-ink-soft"><span>IGST (LUT, zero-rated)</span><span>0.00</span></div>}
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums">{fmt(total)}</span></div>
          {currency !== "INR" && <div className="text-right text-xs text-ink-soft">≈ ₹{new Intl.NumberFormat("en-IN").format(Math.round(total * fxRate))}</div>}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="markSent" className="h-4 w-4 accent-plum" /> Mark as sent to client</label>
        <SubmitButton>Create invoice</SubmitButton>
      </div>
    </ActionForm>
  );
}
