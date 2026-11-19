"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "./client";
import { saveTaskTemplates } from "@/app/actions/settings";
import type { TaskTemplateSettings, TemplateTask } from "@/lib/settings";


/** Edit the standard tasks added under each deliverable type. */
export function TemplateEditor({ value, dlTypes }: { value: TaskTemplateSettings; dlTypes: { value: string; label: string }[] }) {
  const TYPES = dlTypes.map((t) => [t.value, t.label] as [string, string]);
  const [auto, setAuto] = useState(value.auto);
  const [types, setTypes] = useState<Record<string, TemplateTask[]>>(() => Object.fromEntries(TYPES.map(([k]) => [k, value.types[k] ?? []])));
  const set = (k: string, list: TemplateTask[]) => setTypes((t) => ({ ...t, [k]: list }));

  return (
    <ActionForm action={saveTaskTemplates} className="space-y-5">
      <input type="hidden" name="json" value={JSON.stringify({ auto, types })} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="mt-0.5 h-4 w-4 accent-plum" />
        <span><b>Add these tasks automatically</b> when a deliverable is created (by hand or from an AI contract reading). Tasks go to the deliverable&apos;s owner.</span>
      </label>
      <div className="grid gap-5 lg:grid-cols-2">
        {TYPES.map(([k, label]) => {
          const list = types[k];
          return (
            <section key={k} className="rounded-xl border border-line">
              <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <h3 className="text-sm font-semibold">{label}</h3>
                <span className="text-xs text-ink-soft">{list.length} task{list.length === 1 ? "" : "s"}</span>
              </header>
              <div className="space-y-2 p-3">
                {list.length > 0 && (
                  <div className="grid grid-cols-[1fr_4.5rem_2rem] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                    <span>Task</span><span title="Days before the deliverable is due. Use a negative number for after.">Days before</span><span />
                  </div>
                )}
                {list.map((t, i) => (
                  <div key={i} className="grid grid-cols-[1fr_4.5rem_2rem] items-center gap-2">
                    <input value={t.title} onChange={(e) => set(k, list.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className="input !py-1.5" aria-label="Task title" />
                    <input type="number" value={Number.isFinite(t.daysBefore) ? t.daysBefore : 0} onChange={(e) => set(k, list.map((x, j) => (j === i ? { ...x, daysBefore: Number(e.target.value) } : x)))} className="input !py-1.5" aria-label="Days before due" />
                    <button type="button" onClick={() => set(k, list.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft hover:bg-red-50 hover:text-red-700" aria-label={`Remove ${t.title}`}>✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => set(k, [...list, { title: "", daysBefore: 0 }])} className="text-xs font-semibold text-sky hover:underline">+ Add task</button>
              </div>
            </section>
          );
        })}
      </div>
      <SubmitButton className="btn-primary">Save templates</SubmitButton>
    </ActionForm>
  );
}
