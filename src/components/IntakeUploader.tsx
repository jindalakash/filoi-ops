"use client";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles, UploadCloud, FileText, X } from "lucide-react";
import clsx from "clsx";
import type { ActionState } from "./client";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

function Go({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary !px-5 !py-2.5">
      {pending ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Reading… this can take a minute</> : <><Sparkles size={16} /> {label}</>}
    </button>
  );
}

/** Drag-and-drop upload that sends files (and/or already-stored documents) to an AI intake action. */
export function IntakeUploader({ action, hidden = {}, existing = [], label = "Read with AI", hint }: {
  action: Action; hidden?: Record<string, string>; existing?: { id: string; fileName: string }[]; label?: string; hint?: string;
}) {
  const [state, run] = useActionState(action, undefined);
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const sync = (list: File[]) => {
    setFiles(list);
    const dt = new DataTransfer();
    list.forEach((f) => dt.items.add(f));
    if (input.current) input.current.files = dt.files;
  };
  return (
    <form action={run} className="space-y-4">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {state?.error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</div>}
      {existing.length > 0 && (
        <div>
          <div className="label">Already uploaded</div>
          <div className="space-y-1.5">
            {existing.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="docIds" value={d.id} defaultChecked className="h-4 w-4 accent-plum" /> <FileText size={14} className="text-ink-soft" /> {d.fileName}</label>
            ))}
          </div>
        </div>
      )}
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); sync([...files, ...Array.from(e.dataTransfer.files)]); }}
        className={clsx("flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition", drag ? "border-plum bg-plum/5" : "border-line bg-mist/40 hover:border-sky")}
      >
        <UploadCloud size={30} className="text-plum" />
        <div className="mt-2 font-semibold">{existing.length ? "Add more files" : "Drop files here or click to choose"}</div>
        <div className="mt-1 text-xs text-ink-soft">{hint ?? "PDF (including scanned), Word .docx or text · up to 50 MB each"}</div>
        <input ref={input} type="file" name="files" multiple accept=".pdf,.docx,.txt,.md" className="sr-only" onChange={(e) => sync(Array.from(e.target.files ?? []))} />
      </label>
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg bg-mist px-3 py-2 text-sm">
              <FileText size={14} className="text-ink-soft" /><span className="flex-1 truncate">{f.name}</span><span className="text-xs text-ink-soft">{(f.size / 1e6).toFixed(1)} MB</span>
              <button type="button" onClick={() => sync(files.filter((_, j) => j !== i))} className="text-ink-soft hover:text-red-700"><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end"><Go label={label} /></div>
    </form>
  );
}
