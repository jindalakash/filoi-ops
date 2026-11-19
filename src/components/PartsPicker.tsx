"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Plus, X } from "lucide-react";
import { play } from "@/lib/sound";

/** Pick one or more proposal parts (suggested or custom); each becomes its own task for the same person. */
export function PartsPicker({ groups, existing }: { groups: { label: string; items: string[] }[]; existing: string[] }) {
  const suggestions = groups.flatMap((g) => g.items);
  const taken = new Set(existing.map((e) => e.trim().toLowerCase()));
  const [picked, setPicked] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const root = useRef<HTMLDivElement>(null);
  // the form resets after a successful assign — clear our own selection too
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    const clear = () => { setPicked([]); setCustom([]); setDraft(""); };
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);
  const toggle = (s: string) => { play("click"); setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s])); };
  const addCustom = () => {
    const v = draft.trim();
    if (!v) return;
    if (![...suggestions, ...custom].some((x) => x.toLowerCase() === v.toLowerCase())) setCustom((c) => [...c, v]);
    setPicked((p) => (p.some((x) => x.toLowerCase() === v.toLowerCase()) ? p : [...p, v]));
    setDraft("");
    play("pop");
  };
  const options = [...suggestions, ...custom];
  const chosen = picked.filter((p) => !taken.has(p.toLowerCase())); // never resend parts that already exist
  const selectable = options.filter((o) => !taken.has(o.toLowerCase()));
  return (
    <div ref={root}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label !mb-0">Parts to assign * <span className="normal-case tracking-normal text-ink-soft">— pick one or more</span></span>
        {selectable.length > 1 && (
          <button type="button" data-silent onClick={() => { play("click"); setPicked(chosen.length === selectable.length ? [] : selectable); }} className="text-xs font-semibold text-sky hover:underline">
            {chosen.length === selectable.length ? "Clear" : "Select all"}
          </button>
        )}
      </div>
      {chosen.map((p) => <input key={p} type="hidden" name="titles" value={p} />)}
      <div className="space-y-3">
        {[...groups, ...(custom.length ? [{ label: "Your own parts", items: custom }] : [])].map((g) => (
          <div key={g.label}>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{g.label}</div>
            <div className="flex flex-wrap gap-2">{g.items.map((o: string) => {
          const done = taken.has(o.toLowerCase());
          const on = !done && picked.includes(o);
          return (
            <button key={o} type="button" data-silent disabled={done} onClick={() => toggle(o)} aria-pressed={on}
              title={done ? "Already a task on this proposal" : undefined}
              className={clsx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition",
                done ? "cursor-not-allowed border-line text-ink-soft/50 line-through" : on ? "border-plum bg-plum text-white shadow-sm" : "border-line bg-surface text-ink hover:border-plum/50")}>
              {on ? <Check size={14} /> : <Plus size={14} className="opacity-50" />}{o}
            </button>
          );
        })}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
          className="input flex-1" placeholder="Add another part, e.g. Gender & inclusion strategy" />
        <button type="button" data-silent onClick={addCustom} className="btn-ghost btn-sm">Add</button>
      </div>
      {chosen.length > 0 && (
        <div className="mt-3 rounded-lg bg-mist px-3 py-2 text-sm">
          <b>{chosen.length}</b> part{chosen.length > 1 ? "s" : ""} selected — each becomes its own task with the same person, reviewer and due date:
          <span className="mt-1 flex flex-wrap gap-1.5">{chosen.map((p) => (
            <span key={p} className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs ring-1 ring-line">{p}
              <button type="button" data-silent onClick={() => toggle(p)} aria-label={`Remove ${p}`} className="text-ink-soft hover:text-red-700"><X size={12} /></button></span>
          ))}</span>
        </div>
      )}
    </div>
  );
}
