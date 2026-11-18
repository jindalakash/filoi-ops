import { money } from "@/lib/format";
import type { CurrencyTotals } from "@/lib/metrics";

/** Shows a multi-currency total: main INR figure + per-currency breakdown */
export function MultiMoney({ totals, inr, compact = true }: { totals: CurrencyTotals; inr: number; compact?: boolean }) {
  const parts = Object.entries(totals).filter(([, v]) => Math.abs(v) > 0.009);
  const onlyOne = parts.length === 1;
  return (
    <span>
      {onlyOne ? money(parts[0][1], parts[0][0], { compact }) : money(inr, "INR", { compact })}
    </span>
  );
}

export function Breakdown({ totals }: { totals: CurrencyTotals }) {
  const parts = Object.entries(totals).filter(([, v]) => Math.abs(v) > 0.009);
  if (parts.length <= 1) return parts.length ? null : <>—</>;
  return <>{parts.map(([c, v]) => money(v, c, { compact: true })).join(" + ")} (in ₹)</>;
}
