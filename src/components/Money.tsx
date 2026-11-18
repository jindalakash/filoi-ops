import { cache } from "react";
import { money } from "@/lib/format";
import { getSetting, type FxSettings } from "@/lib/settings";
import { toINR } from "@/lib/fx";
import type { CurrencyTotals } from "@/lib/metrics";

/** Settings exchange rates, loaded once per request. */
export const getFx = cache(() => getSetting("fx"));

/** "₹20.2L ($24,000.00)" — INR first (Settings rate), original currency in brackets. */
export function amtText(v: unknown, c: string, fx: FxSettings, compact = false) {
  if (c === "INR") return money(v, "INR", { compact });
  return `${money(toINR(v, c, fx), "INR", { compact })} (${money(v, c, { compact })})`;
}

/** Amount shown in INR with the original currency in brackets. */
export async function Amt({ v, c, compact = false }: { v: unknown; c: string; compact?: boolean }) {
  if (c === "INR") return <span className="whitespace-nowrap">{money(v, "INR", { compact })}</span>;
  const fx = await getFx();
  return (
    <span className="whitespace-nowrap">
      {money(toINR(v, c, fx), "INR", { compact })} <span className="text-[0.85em] font-normal text-ink-soft">({money(v, c, { compact })})</span>
    </span>
  );
}

/** Multi-currency total, always in INR. */
export function MultiMoney({ inr }: { totals?: CurrencyTotals; inr: number }) {
  return <span>{money(inr, "INR", { compact: true })}</span>;
}

/** Original-currency parts behind an INR total, e.g. "($96K + €145K)". */
export function Breakdown({ totals }: { totals: CurrencyTotals }) {
  const parts = Object.entries(totals).filter(([, v]) => Math.abs(v) > 0.009);
  if (!parts.length) return <>—</>;
  if (parts.length === 1 && parts[0][0] === "INR") return null;
  return <>({parts.map(([c, v]) => money(v, c, { compact: true })).join(" + ")})</>;
}
