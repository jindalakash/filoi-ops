"use client";
import { useState } from "react";

type Point = { label: string; value: number; detail?: string };

/** Single-series column chart: ≤24px bars, 4px rounded tops, hairline grid, per-bar hover/focus tooltip, sr-only table. */
export function ColumnChart({ data, color = "var(--color-plum)", currency = "INR", height = 180, caption }: { data: Point[]; color?: string; currency?: string; height?: number; caption: string }) {
  const format = (n: number) => new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(n);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 0);
  const nice = niceMax(max);
  // with no data the max is 0, so only the baseline is drawn (avoids three identical gridlines / keys)
  const ticks = nice > 0 ? [0, nice / 2, nice] : [0];
  return (
    <figure>
      <div className="relative" style={{ height }}>
        {nice === 0 && <div className="absolute inset-0 grid place-items-center pl-14 text-sm text-ink-soft">Nothing yet — this fills in as you plan and receive payments.</div>}
        {ticks.map((t, i) => (
          <div key={i} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${(t / (nice || 1)) * 100}%` }}>
            <span className="w-12 -translate-y-1/2 text-right text-[11px] tabular-nums text-ink-soft">{format(t)}</span>
            <span className="h-px flex-1 -translate-y-1/2 bg-line" />
          </div>
        ))}
        <div className={`absolute inset-y-0 left-14 right-0 flex items-end ${nice === 0 ? "pointer-events-none" : ""}`}>
          {data.map((d, i) => {
            const h = nice ? (d.value / nice) * 100 : 0;
            return (
              <button key={d.label} type="button" className="relative flex h-full flex-1 items-end justify-center outline-none"
                onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                aria-label={`${d.label}: ${format(d.value)}`}>
                <span className="block w-full max-w-6 rounded-t transition-[filter]" style={{ height: `${h}%`, minHeight: d.value > 0 ? 2 : 0, background: color, filter: hover === i ? "brightness(1.15)" : undefined }} />
                {hover === i && (
                  <span className="pointer-events-none absolute z-10 w-max max-w-48 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-left shadow-lg" style={{ bottom: `calc(${h}% + 8px)` }}>
                    <span className="block font-display text-sm font-semibold tabular-nums text-ink">{format(d.value)}</span>
                    <span className="block text-[11px] text-ink-soft">{d.label}{d.detail ? ` · ${d.detail}` : ""}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="ml-14 mt-2 flex">
        {data.map((d) => <span key={d.label} className="flex-1 text-center text-[11px] text-ink-soft">{d.label}</span>)}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only"><caption>{caption}</caption><tbody>{data.map((d) => <tr key={d.label}><th>{d.label}</th><td>{format(d.value)}</td></tr>)}</tbody></table>
    </figure>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
