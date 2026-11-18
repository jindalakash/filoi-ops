import { num } from "./format";
import type { FxSettings } from "./settings";

export function toINR(amount: unknown, currency: string, fx: FxSettings) {
  const rate = fx[currency as keyof FxSettings] ?? 1;
  return num(amount) * rate;
}
