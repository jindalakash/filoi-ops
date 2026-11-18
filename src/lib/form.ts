export function str(fd: FormData, k: string) {
  const v = fd.get(k);
  if (v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? null : s;
}
export function req(fd: FormData, k: string, label = k) {
  const s = str(fd, k);
  if (!s) throw new FormError(`${label} is required.`);
  return s;
}
export function dateOf(fd: FormData, k: string) {
  const s = str(fd, k);
  if (s === undefined) return undefined;
  if (!s) return null;
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (isNaN(d.getTime())) throw new FormError(`Invalid date for ${k}.`);
  return d;
}
export function numOf(fd: FormData, k: string) {
  const s = str(fd, k);
  if (s === undefined) return undefined;
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) throw new FormError(`Invalid number for ${k}.`);
  return n;
}
export function intOf(fd: FormData, k: string) {
  const n = numOf(fd, k);
  return n === undefined || n === null ? n : Math.round(n);
}
export class FormError extends Error {}

/** Wrap an action body: converts FormError / known errors to {error}. */
export async function guard<T extends { error?: string; ok?: string } | undefined>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    // let Next.js redirect/notFound bubble
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    if (e instanceof FormError) return { error: e.message };
    console.error(e);
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
