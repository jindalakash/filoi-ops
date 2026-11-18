"use client";
import { useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "./client";
import { saveFinancial } from "@/app/actions/proposal";
import { CURRENCIES } from "@/lib/format";
import { COST_LABEL } from "@/lib/proposal-meta";

type Cat = keyof typeof COST_LABEL;
type Line = { category: Cat; description: string; expertId: string | null; unit: string; quantity: number; rate: number };
type TeamOpt = { expertId: string; name: string; position: string; days: number | null; rate: number | null; rateCurrency: string };

const UNITS = ["day", "month", "trip", "night", "person", "lump sum", "workshop", "unit"];

export function FinancialEditor({ opportunityId, initial, team, currency: cur0, taxRate: tax0, notes, fx, editable }: {
  opportunityId: string; initial: Line[]; team: TeamOpt[]; currency: string; taxRate: number; notes: string; fx: Record<string, number>; editable: boolean;
}) {
  const [lines, setLines] = useState<Line[]>(initial);
  const [currency, setCurrency] = useState(cur0);
  const [tax, setTax] = useState(tax0);
  const fmt = (n: number, c = currency) => new Intl.NumberFormat(c === "INR" ? "en-IN" : "en-US", { style: "currency", currency: c }).format(n);
  const totals = useMemo(() => {
    const by: Record<string, number> = {};
    for (const l of lines) by[l.category] = (by[l.category] ?? 0) + (l.quantity || 0) * (l.rate || 0);
    const sub = Object.values(by).reduce((a, b) => a + b, 0);
    return { by, sub, tax: (sub * tax) / 100, total: sub * (1 + tax / 100) };
  }, [lines, tax]);
  const upd = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const add = (category: Cat) => setLines((ls) => [...ls, { category, description: "", expertId: null, unit: category === "FEES" ? "day" : category === "TRAVEL" ? "trip" : category === "PER_DIEM" ? "night" : "lump sum", quantity: 1, rate: 0 }]);
  const fromTeam = () => {
    const have = new Set(lines.filter((l) => l.expertId).map((l) => `${l.expertId}`));
    const add = team.filter((t) => !have.has(t.expertId)).map((t) => ({
      category: "FEES" as Cat, description: `${t.position} – ${t.name}`, expertId: t.expertId, unit: "day", quantity: t.days ?? 0,
      // convert the expert's rate into the proposal currency using Settings rates
      rate: t.rate ? Math.round(((t.rate * (fx[t.rateCurrency] ?? 1)) / (fx[currency] ?? 1)) * 100) / 100 : 0,
    }));
    setLines((ls) => [...add, ...ls]);
  };
  const inr = totals.total * (fx[currency] ?? 1);

  return (
    <ActionForm action={saveFinancial}>
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block"><span className="label">Currency</span>
          <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="input !w-28" disabled={!editable}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label className="block"><span className="label">Tax %</span><input name="taxRate" inputMode="decimal" value={tax} onChange={(e) => setTax(Number(e.target.value) || 0)} className="input !w-24" disabled={!editable} /></label>
        <p className="pb-2 text-xs text-ink-soft">UN / foreign clients: usually 0% (export under LUT). Indian clients: 18% GST.</p>
        {editable && team.length > 0 && <button type="button" onClick={fromTeam} className="btn-ghost btn-sm ml-auto">+ Fee lines from proposed team</button>}
      </div>

      {(Object.keys(COST_LABEL) as Cat[]).map((cat) => {
        const rows = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.category === cat);
        return (
          <section key={cat} className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-plum">{COST_LABEL[cat]}</h3>
              <span className="text-sm tabular-nums text-ink-soft">{fmt(totals.by[cat] ?? 0)}</span>
            </div>
            {rows.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="table">
                  <thead><tr><th className="min-w-64">Description</th><th>Unit</th><th className="w-24">Qty</th><th className="w-36">Rate ({currency})</th><th className="text-right">Amount</th><th /></tr></thead>
                  <tbody>{rows.map(({ l, i }) => (
                    <tr key={i}>
                      <td><input value={l.description} onChange={(e) => upd(i, { description: e.target.value })} className="input" disabled={!editable} placeholder={cat === "FEES" ? "Team Leader – name" : cat === "TRAVEL" ? "Return flight Delhi–Thimphu" : ""} /></td>
                      <td><select value={l.unit} onChange={(e) => upd(i, { unit: e.target.value })} className="input min-w-28" disabled={!editable}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></td>
                      <td><input inputMode="decimal" value={l.quantity} onChange={(e) => upd(i, { quantity: Number(e.target.value) || 0 })} className="input min-w-16" disabled={!editable} /></td>
                      <td><input inputMode="decimal" value={l.rate} onChange={(e) => upd(i, { rate: Number(e.target.value.replace(/,/g, "")) || 0 })} className="input min-w-28" disabled={!editable} /></td>
                      <td className="text-right tabular-nums">{fmt((l.quantity || 0) * (l.rate || 0))}</td>
                      <td>{editable && <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-ink-soft hover:text-red-700">✕</button>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {editable && <button type="button" onClick={() => add(cat)} className="mt-2 text-xs font-semibold text-sky hover:underline">+ Add {COST_LABEL[cat].toLowerCase()} line</button>}
          </section>
        );
      })}

      <div className="flex flex-col gap-4 border-t border-line pt-5 md:flex-row md:justify-between">
        <label className="block md:w-1/2"><span className="label">Notes / assumptions</span><textarea name="finNotes" defaultValue={notes} rows={4} className="input" disabled={!editable} placeholder="Rates are all-inclusive; DSA as per UN rates; validity 120 days…" /></label>
        <div className="min-w-72 space-y-1.5 rounded-xl bg-mist p-4 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{fmt(totals.sub)}</span></div>
          <div className="flex justify-between"><span>Tax {tax}%</span><span className="tabular-nums">{fmt(totals.tax)}</span></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums">{fmt(totals.total)}</span></div>
          {currency !== "INR" && <div className="text-right text-xs text-ink-soft">≈ ₹{new Intl.NumberFormat("en-IN").format(Math.round(inr))}</div>}
        </div>
      </div>
      {editable && (
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="setValue" defaultChecked className="h-4 w-4 accent-plum" /> Use the total as the proposal value</label>
          <SubmitButton>Save financial proposal</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}
