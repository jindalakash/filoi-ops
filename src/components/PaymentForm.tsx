"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "./client";
import { recordPayment } from "@/app/actions/finance";

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

/** Record money received in the bank (₹). For USD/EUR invoices choose whether it settles the full balance or part of it. */
export function PaymentForm({ invoiceId, currency, balance, today }: { invoiceId: string; currency: string; balance: number; today: string }) {
  const foreign = currency !== "INR";
  const fx = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  const [credited, setCredited] = useState("");
  const [tds, setTds] = useState("");
  const [bank, setBank] = useState("");
  const [covers, setCovers] = useState<"full" | "partial">("full");
  const [part, setPart] = useState("");
  const c = Number(credited.replace(/,/g, "")) || 0, t = Number(tds) || 0, b = Number(bank) || 0;
  const covered = foreign ? (covers === "full" ? balance : Number(part) || 0) : c + t + b;
  const rate = foreign && covered > 0 ? (c + t + b) / covered : 0;
  const left = Math.max(0, balance - covered);

  return (
    <ActionForm action={recordPayment} resetOnOk onOk={() => { setCredited(""); setTds(""); setBank(""); setPart(""); setCovers("full"); }} className="mt-4 space-y-3 border-t border-line pt-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="text-sm font-semibold">Record payment</div>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block"><span className="label">Amount credited to bank (₹)</span>
          <input name="amountInr" inputMode="decimal" required value={credited} onChange={(e) => setCredited(e.target.value)} className="input text-base font-semibold" placeholder="e.g. 2,57,600" />
        </label>
        <label className="block"><span className="label">Date received</span><input type="date" name="date" defaultValue={today} className="input" /></label>
        <label className="block"><span className="label">Reference / UTR</span><input name="reference" className="input" /></label>
      </div>

      {foreign && (
        <div className="rounded-xl border border-line p-3">
          <div className="label">This payment settles</div>
          <label className="flex items-center gap-2 py-1 text-sm"><input type="radio" name="covers" value="full" checked={covers === "full"} onChange={() => setCovers("full")} className="accent-plum" /> The full balance — <b>{fx(balance)}</b></label>
          <label className="flex flex-wrap items-center gap-2 py-1 text-sm"><input type="radio" name="covers" value="partial" checked={covers === "partial"} onChange={() => setCovers("partial")} className="accent-plum" /> Part of it (partial payment):
            <input name="coveredAmount" inputMode="decimal" value={part} onChange={(e) => { setPart(e.target.value); setCovers("partial"); }} placeholder={`${currency} amount`} className="input !w-32 !py-1" />
          </label>
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-ink-soft">TDS or bank charges deducted?</summary>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="block"><span className="label">TDS (₹)</span><input name="tdsInr" inputMode="decimal" value={tds} onChange={(e) => setTds(e.target.value)} className="input" /></label>
          <label className="block"><span className="label">Bank charges (₹)</span><input name="bankInr" inputMode="decimal" value={bank} onChange={(e) => setBank(e.target.value)} className="input" /></label>
        </div>
      </details>

      {c > 0 && (
        <div className="rounded-lg bg-mist px-3 py-2 text-xs text-ink-soft">
          {foreign && rate > 0 && <div>Realised rate: <b className="text-ink">₹{rate.toFixed(2)}</b> per {currency}</div>}
          {covered > balance + 0.01
            ? <div className="text-amber-700">More than the outstanding {foreign ? fx(balance) : inr(balance)}.</div>
            : left > 0.01
              ? <div><b className="text-amber-700">Partial payment</b> — still due after this: <b className="text-ink">{foreign ? fx(left) : inr(left)}</b></div>
              : <div className="text-emerald-700"><b>Settles the invoice in full.</b></div>}
        </div>
      )}
      <SubmitButton className="btn-primary w-full">Save payment</SubmitButton>
    </ActionForm>
  );
}
