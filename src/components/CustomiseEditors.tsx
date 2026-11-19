"use client";
import { useState } from "react";
import clsx from "clsx";
import { ArrowUp, ArrowDown, X } from "lucide-react";
import { ActionForm, SubmitButton } from "./client";
import { saveColumns, saveLabels, saveList, saveCustomFields } from "@/app/actions/customise";

const TONES: [string, string, string][] = [
  ["gray", "Grey", "bg-slate-400"], ["blue", "Blue", "bg-sky"], ["purple", "Purple", "bg-plum"], ["amber", "Amber", "bg-sun"],
  ["green", "Green", "bg-emerald-600"], ["red", "Red", "bg-red-600"], ["navy", "Navy", "bg-navy"],
];
const dot = (c: string) => TONES.find((t) => t[0] === c)?.[2] ?? "bg-slate-400";

/** Local editable copy that resets whenever the server sends fresh data (e.g. after a save). */
function useSynced<T>(value: T[]) {
  const [rows, setRows] = useState<T[]>(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) { setSeen(value); setRows(value); }
  return [rows, setRows] as const;
}

function move<T>(list: T[], i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

function RowTools({ i, n, onMove, onRemove, removeTitle = "Remove" }: { i: number; n: number; onMove: (d: number) => void; onRemove?: () => void; removeTitle?: string }) {
  const btn = "grid h-8 w-8 place-items-center rounded-lg text-ink-soft hover:bg-mist hover:text-ink disabled:opacity-30";
  return (
    <span className="flex shrink-0 items-center">
      <button type="button" className={btn} disabled={i === 0} onClick={() => onMove(-1)} aria-label="Move up"><ArrowUp size={15} /></button>
      <button type="button" className={btn} disabled={i === n - 1} onClick={() => onMove(1)} aria-label="Move down"><ArrowDown size={15} /></button>
      {onRemove ? <button type="button" className={clsx(btn, "hover:bg-red-50 hover:text-red-700")} onClick={onRemove} aria-label={removeTitle} title={removeTitle}><X size={15} /></button> : <span className="w-8" />}
    </span>
  );
}

function ColourSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={clsx("h-3 w-3 shrink-0 rounded-full", dot(value))} aria-hidden />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input !w-24 !py-1.5" aria-label="Colour">{TONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </span>
  );
}

// ── Board columns ──
type Col = { id?: string; name: string; category: string; color: string; active: boolean; count?: number };
export function ColumnsEditor({ value }: { value: Col[] }) {
  const [rows, setRows] = useSynced(value);
  const set = (i: number, p: Partial<Col>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <ActionForm action={saveColumns} className="space-y-3">
      <input type="hidden" name="json" value={JSON.stringify(rows.map((r) => ({ id: r.id, name: r.name, category: r.category, color: r.color, active: r.active })))} />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id ?? `n${i}`} className={clsx("flex flex-wrap items-center gap-2 rounded-lg border border-line p-2", !r.active && "opacity-60")}>
            <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} className="input !w-44 !py-1.5" aria-label="Column name" />
            <select value={r.category} onChange={(e) => set(i, { category: e.target.value })} className="input !w-48 !py-1.5" aria-label="Counts as">
              <option value="TODO">Counts as: not started</option><option value="IN_PROGRESS">Counts as: in progress</option><option value="DONE">Counts as: done</option>
            </select>
            <ColourSelect value={r.color} onChange={(c) => set(i, { color: c })} />
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={r.active} onChange={(e) => set(i, { active: e.target.checked })} className="h-4 w-4 accent-plum" /> Active</label>
            <span className="text-xs text-ink-soft">{r.count ? `${r.count} card${r.count > 1 ? "s" : ""}` : r.id ? "empty" : "new"}</span>
            <span className="ml-auto" />
            <RowTools i={i} n={rows.length} onMove={(d) => setRows((x) => move(x, i, d))} onRemove={r.count ? undefined : () => setRows((x) => x.filter((_, j) => j !== i))} removeTitle="Delete column" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setRows((r) => [...r, { name: "", category: "IN_PROGRESS", color: "gray", active: true }])} className="text-sm font-semibold text-sky hover:underline">+ Add column</button>
        <SubmitButton className="btn-primary btn-sm ml-auto">Save columns</SubmitButton>
      </div>
    </ActionForm>
  );
}

// ── Labels ──
type Label = { id?: string; name: string; color: string; active: boolean; count?: number };
export function LabelsEditor({ value }: { value: Label[] }) {
  const [rows, setRows] = useSynced(value);
  const set = (i: number, p: Partial<Label>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <ActionForm action={saveLabels} className="space-y-3">
      <input type="hidden" name="json" value={JSON.stringify(rows.map((r) => ({ id: r.id, name: r.name, color: r.color, active: r.active })))} />
      {rows.length === 0 && <p className="text-sm text-ink-soft">No labels yet. Examples: Kiribati, Data quality, Urgent from client, Server.</p>}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id ?? `n${i}`} className={clsx("flex flex-wrap items-center gap-2 rounded-lg border border-line p-2", !r.active && "opacity-60")}>
            <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} className="input !w-44 !py-1.5" aria-label="Label name" placeholder="Label" />
            <ColourSelect value={r.color} onChange={(c) => set(i, { color: c })} />
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={r.active} onChange={(e) => set(i, { active: e.target.checked })} className="h-4 w-4 accent-plum" /> Active</label>
            {!!r.count && <span className="text-xs text-ink-soft">on {r.count} task{r.count > 1 ? "s" : ""}</span>}
            <span className="ml-auto" />
            <RowTools i={i} n={rows.length} onMove={(d) => setRows((x) => move(x, i, d))} onRemove={() => { if (!r.count || confirm(`Remove “${r.name}” from ${r.count} task(s) and delete it?`)) setRows((x) => x.filter((_, j) => j !== i)); }} removeTitle="Delete label" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setRows((r) => [...r, { name: "", color: "blue", active: true }])} className="text-sm font-semibold text-sky hover:underline">+ Add label</button>
        <SubmitButton className="btn-primary btn-sm ml-auto">Save labels</SubmitButton>
      </div>
    </ActionForm>
  );
}

// ── Option lists ──
type Option = { id?: string; value?: string; label: string; active: boolean; count?: number };
export function ListEditor({ list, value }: { list: string; value: Option[] }) {
  const [rows, setRows] = useSynced(value);
  const set = (i: number, p: Partial<Option>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <ActionForm action={saveList} className="space-y-3">
      <input type="hidden" name="list" value={list} />
      <input type="hidden" name="json" value={JSON.stringify(rows.map(({ id, label, active }) => ({ id, label, active })))} />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id ?? `n${i}`} className={clsx("flex flex-wrap items-center gap-2 rounded-lg border border-line p-2", !r.active && "opacity-60")}>
            <input value={r.label} onChange={(e) => set(i, { label: e.target.value })} className="input !w-56 !py-1.5" aria-label="Option name" placeholder="Name" />
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={r.active} onChange={(e) => set(i, { active: e.target.checked })} className="h-4 w-4 accent-plum" /> Active</label>
            <span className="text-xs text-ink-soft">{r.count ? `used ${r.count}×` : r.id ? "unused" : "new"}</span>
            <span className="ml-auto" />
            <RowTools i={i} n={rows.length} onMove={(d) => setRows((x) => move(x, i, d))} onRemove={r.count ? undefined : () => setRows((x) => x.filter((_, j) => j !== i))} removeTitle="Delete option" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setRows((r) => [...r, { label: "", active: true }])} className="text-sm font-semibold text-sky hover:underline">+ Add option</button>
        <SubmitButton className="btn-primary btn-sm ml-auto">Save</SubmitButton>
      </div>
    </ActionForm>
  );
}

// ── Custom fields ──
type Field = { id?: string; label: string; type: string; options: string; help: string; required: boolean; showInList: boolean; active: boolean };
export function FieldsEditor({ entity, value, types }: { entity: string; value: Field[]; types: [string, string][] }) {
  const [rows, setRows] = useSynced(value);
  const set = (i: number, p: Partial<Field>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <ActionForm action={saveCustomFields} className="space-y-3">
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="json" value={JSON.stringify(rows)} />
      {rows.length === 0 && <p className="text-sm text-ink-soft">No extra fields yet.</p>}
      <div className="space-y-2">
        {rows.map((r, i) => {
          const choice = r.type === "SELECT" || r.type === "MULTISELECT";
          return (
            <div key={r.id ?? `n${i}`} className={clsx("rounded-lg border border-line p-3", !r.active && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-2">
                <input value={r.label} onChange={(e) => set(i, { label: e.target.value })} className="input !w-52 !py-1.5" aria-label="Field name" placeholder="Field name, e.g. Country" />
                <select value={r.type} disabled={!!r.id} onChange={(e) => set(i, { type: e.target.value })} className="input !w-44 !py-1.5" aria-label="Field type" title={r.id ? "The type can't change once created" : undefined}>
                  {types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={r.required} onChange={(e) => set(i, { required: e.target.checked })} className="h-4 w-4 accent-plum" /> Required</label>
                <label className="flex items-center gap-1.5 text-xs" title="Shown on board cards and list rows"><input type="checkbox" checked={r.showInList} onChange={(e) => set(i, { showInList: e.target.checked })} className="h-4 w-4 accent-plum" /> Show in lists</label>
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={r.active} onChange={(e) => set(i, { active: e.target.checked })} className="h-4 w-4 accent-plum" /> Active</label>
                <span className="ml-auto" />
                <RowTools i={i} n={rows.length} onMove={(d) => setRows((x) => move(x, i, d))} onRemove={() => { if (!r.id || confirm(`Delete the field “${r.label}”? Values already entered will no longer be shown. Untick “Active” instead to just hide it.`)) setRows((x) => x.filter((_, j) => j !== i)); }} removeTitle="Delete field" />
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {choice && <textarea value={r.options} onChange={(e) => set(i, { options: e.target.value })} rows={3} className="input !py-1.5 text-sm" placeholder={"Choices, one per line\nBhutan\nNepal"} aria-label="Choices" />}
                <input value={r.help} onChange={(e) => set(i, { help: e.target.value })} className="input !py-1.5 text-sm" placeholder="Help text (optional)" aria-label="Help text" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setRows((r) => [...r, { label: "", type: "TEXT", options: "", help: "", required: false, showInList: false, active: true }])} className="text-sm font-semibold text-sky hover:underline">+ Add field</button>
        <SubmitButton className="btn-primary btn-sm ml-auto">Save fields</SubmitButton>
      </div>
    </ActionForm>
  );
}
