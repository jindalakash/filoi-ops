"use client";
import { useState } from "react";

/** Editable list of fixed monthly costs (salaries, rent…) posted as JSON. */
export function MonthlyCostsEditor({ initial }: { initial: { label: string; amount: number }[] }) {
  const [rows, setRows] = useState(initial.length ? initial : [{ label: "Salaries", amount: 0 }, { label: "Office rent", amount: 0 }]);
  const total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  return (
    <div>
      <input type="hidden" name="monthlyCosts" value={JSON.stringify(rows)} />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <input value={r.label} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} className="input flex-1" placeholder="e.g. Salaries" />
            <input inputMode="decimal" value={r.amount || ""} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, amount: Number(e.target.value.replace(/,/g, "")) || 0 } : y)))} className="input w-36" placeholder="₹ / month" />
            <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="px-1 text-ink-soft hover:text-red-700" aria-label="Remove">✕</button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <button type="button" onClick={() => setRows((x) => [...x, { label: "", amount: 0 }])} className="text-xs font-semibold text-sky hover:underline">+ Add cost</button>
        <span className="text-ink-soft">Total: <b className="text-ink">{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(total)}</b> / month</span>
      </div>
    </div>
  );
}
