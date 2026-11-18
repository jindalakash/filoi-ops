"use client";
import { useState } from "react";
import clsx from "clsx";

type Month = { label: string; totalIn: number; totalOut: number; closing: number };
const fmt = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 }).format(n);
function nice(v: number) { if (v <= 0) return 0; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

// validated categorical pair (light / dark): money in, money out
const IN = "light-dark(#2f6fc0, #5a92e6)", OUT = "light-dark(#8a2c8d, #b566b8)";

function Tip({ show, children, bottom }: { show: boolean; children: React.ReactNode; bottom: string }) {
  if (!show) return null;
  return <span className="pointer-events-none absolute left-1/2 z-10 w-max -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-left shadow-lg" style={{ bottom }}>{children}</span>;
}

/** Money in vs money out per month: paired columns, one axis (₹). */
export function InOutChart({ months, height = 200 }: { months: Month[]; height?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const top = nice(Math.max(1, ...months.flatMap((m) => [m.totalIn, m.totalOut])));
  return (
    <figure className="pt-1">
      <div className="mb-5 flex gap-4 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: IN }} /> Money in</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: OUT }} /> Money out</span>
      </div>
      <div className="relative" style={{ height }}>
        {[0, 0.5, 1].map((t, i) => (
          <div key={i} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${t * 100}%` }}>
            <span className="w-14 -translate-y-1/2 text-right text-[11px] tabular-nums text-ink-soft">{fmt(t * top)}</span>
            <span className="h-px flex-1 -translate-y-1/2 bg-line" />
          </div>
        ))}
        <div className="absolute inset-y-0 left-16 right-0 flex items-end">
          {months.map((m) => (
            <div key={m.label} className="flex h-full flex-1 items-end justify-center gap-[2px]">
              {([["in", m.totalIn, IN, "Money in"], ["out", m.totalOut, OUT, "Money out"]] as const).map(([k, v, color, name]) => {
                const id = `${m.label}-${k}`;
                const h = top ? (v / top) * 100 : 0;
                return (
                  <button key={k} type="button" data-silent className="relative flex h-full w-full max-w-6 items-end outline-none" aria-label={`${m.label} ${name}: ${fmt(v)}`}
                    onPointerEnter={() => setHover(id)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(id)} onBlur={() => setHover(null)}>
                    <span className="block w-full rounded-t" style={{ height: `${h}%`, minHeight: v > 0 ? 2 : 0, background: color, filter: hover === id ? "brightness(1.15)" : undefined }} />
                    <Tip show={hover === id} bottom={`calc(${h}% + 8px)`}><span className="block font-display text-sm font-semibold tabular-nums text-ink">{fmt(v)}</span><span className="block text-[11px] text-ink-soft">{name} · {m.label}</span></Tip>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="ml-16 mt-2 flex">{months.map((m) => <span key={m.label} className="flex-1 text-center text-[11px] text-ink-soft">{m.label}</span>)}</div>
      <table className="sr-only"><caption>Money in and out per month (INR)</caption><tbody>{months.map((m) => <tr key={m.label}><th>{m.label}</th><td>In {fmt(m.totalIn)}</td><td>Out {fmt(m.totalOut)}</td></tr>)}</tbody></table>
    </figure>
  );
}

/** Projected bank balance at month end; columns grow up or down from a zero baseline, negatives flagged. */
export function BalanceChart({ months, height = 200 }: { months: Month[]; height?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const maxPos = Math.max(0, ...months.map((m) => m.closing));
  const maxNeg = Math.max(0, ...months.map((m) => -m.closing));
  const span = nice(maxPos) + nice(maxNeg) || 1;
  const zero = (nice(maxNeg) / span) * 100; // % from bottom
  return (
    <figure className="pt-2">
      <div className="relative" style={{ height }}>
        <div className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${zero}%` }}>
          <span className="w-14 -translate-y-1/2 text-right text-[11px] tabular-nums text-ink-soft">₹0</span>
          <span className="h-px flex-1 -translate-y-1/2 bg-ink-soft/50" />
        </div>
        {/* end labels only when they don't collide with the ₹0 line */}
        {maxPos > 0 && 100 - zero > 24 && <div className="absolute inset-x-0 top-0 flex items-center gap-2"><span className="w-14 -translate-y-1/2 text-right text-[11px] tabular-nums text-ink-soft">{fmt(nice(maxPos))}</span><span className="h-px flex-1 -translate-y-1/2 bg-line" /></div>}
        {maxNeg > 0 && zero > 24 && <div className="absolute inset-x-0 bottom-0 flex items-center gap-2"><span className="w-14 translate-y-1/2 text-right text-[11px] tabular-nums text-ink-soft">{fmt(-nice(maxNeg))}</span><span className="h-px flex-1 translate-y-1/2 bg-line" /></div>}
        <div className="absolute inset-y-0 left-16 right-0 flex">
          {months.map((m) => {
            const neg = m.closing < 0;
            const h = (Math.abs(m.closing) / span) * 100;
            return (
              <button key={m.label} type="button" data-silent className="relative h-full flex-1 outline-none" aria-label={`${m.label} closing balance ${fmt(m.closing)}`}
                onPointerEnter={() => setHover(m.label)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(m.label)} onBlur={() => setHover(null)}>
                <span className={clsx("absolute left-1/2 w-full max-w-6 -translate-x-1/2", neg ? "rounded-b bg-red-600" : "rounded-t bg-emerald-600")}
                  style={neg ? { top: `${100 - zero}%`, height: `${h}%` } : { bottom: `${zero}%`, height: `${h}%`, minHeight: m.closing > 0 ? 2 : 0 }} />
                <Tip show={hover === m.label} bottom={`calc(${neg ? zero : zero + h}% + 8px)`}><span className="block font-display text-sm font-semibold tabular-nums text-ink">{fmt(m.closing)}</span><span className="block text-[11px] text-ink-soft">{neg ? "⚠ Shortfall" : "Balance"} · end of {m.label}</span></Tip>
              </button>
            );
          })}
        </div>
      </div>
      <div className="ml-16 mt-2 flex">{months.map((m) => <span key={m.label} className={clsx("flex-1 text-center text-[11px]", m.closing < 0 ? "font-semibold text-red-700" : "text-ink-soft")}>{m.label}</span>)}</div>
      <table className="sr-only"><caption>Projected closing balance per month (INR)</caption><tbody>{months.map((m) => <tr key={m.label}><th>{m.label}</th><td>{fmt(m.closing)}</td></tr>)}</tbody></table>
    </figure>
  );
}
