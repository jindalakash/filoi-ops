"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";

export type ActionState = { error?: string; ok?: string } | undefined;
type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function SubmitButton({ children, className = "btn-primary", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}

/** Form wired to a server action that returns {error|ok}. */
export function ActionForm({ action, children, className, resetOnOk, onOk }: { action: Action; children: React.ReactNode; className?: string; resetOnOk?: boolean; onOk?: () => void }) {
  const [state, run] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnOk) ref.current?.reset();
      onOk?.();
    }
  }, [state, resetOnOk, onOk]);
  return (
    <form ref={ref} action={run} className={className}>
      {state?.error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</div>}
      {state?.ok && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</div>}
      {children}
    </form>
  );
}

/** A small button that submits a hidden-field form after confirm(). */
export function ConfirmAction({ action, fields, label, confirm, className = "btn-danger btn-sm" }: { action: Action; fields: Record<string, string>; label: React.ReactNode; confirm: string; className?: string }) {
  const [state, run] = useActionState(action, undefined);
  return (
    <form action={run} onSubmit={(e) => { if (!window.confirm(confirm)) e.preventDefault(); }} className="inline">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton className={className} pendingText="…">{label}</SubmitButton>
      {state?.error && <span className="ml-2 text-xs text-red-700">{state.error}</span>}
    </form>
  );
}

/** Collapsible panel used for inline "Add …" forms. */
export function Disclosure({ label, children, className = "btn-ghost btn-sm", defaultOpen = false, panelClassName = "mt-3" }: { label: React.ReactNode; children: React.ReactNode; className?: string; defaultOpen?: boolean; panelClassName?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button type="button" className={className} onClick={() => setOpen((o) => !o)}>{open ? "Close" : label}</button>
      {open && <div className={panelClassName}>{children}</div>}
    </div>
  );
}

/** Auto-submitting select (status changes etc.) */
export function AutoSelect({ action, name, value, options, hidden, className }: { action: Action; name: string; value: string; options: { value: string; label: string }[]; hidden: Record<string, string>; className?: string }) {
  const [, run] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form action={run} ref={ref} className="inline">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <select name={name} defaultValue={value} onChange={() => ref.current?.requestSubmit()} className={clsx("input !w-auto !py-1 !text-xs", className)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </form>
  );
}
