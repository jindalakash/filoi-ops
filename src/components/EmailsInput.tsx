"use client";
import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { X, UserRound, Plus } from "lucide-react";

type Person = { name: string; email: string; designation?: string | null };
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
const split = (s?: string | null) => (s ?? "").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

// One fetch per page load, shared by every picker on the page.
let peopleCache: Promise<Person[]> | null = null;
const loadPeople = () => (peopleCache ??= fetch("/api/people").then((r) => (r.ok ? r.json() : { people: [] })).then((j) => j.people as Person[]).catch(() => []));

/**
 * Several email addresses as chips: pick app users from the list, or type any address and press Enter.
 * Submits as one comma-separated field, so the server side is unchanged.
 */
export function EmailsInput({ name, defaultValue, placeholder = "Pick a person or type an email…" }: { name: string; defaultValue?: string | null; placeholder?: string }) {
  const [emails, setEmails] = useState<string[]>(() => split(defaultValue));
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [people, setPeople] = useState<Person[]>([]);
  const listId = useId();
  const hidden = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { let live = true; loadPeople().then((p) => live && setPeople(p)); return () => { live = false; }; }, []);
  // the surrounding form may reset itself after saving
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form) return;
    const reset = () => { setEmails(split(defaultValue)); setText(""); };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [defaultValue]);

  const chosen = new Set(emails.map((e) => e.toLowerCase()));
  const q = text.trim().toLowerCase();
  const matches = people.filter((p) => !chosen.has(p.email.toLowerCase()) && (!q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)));
  const typedOk = EMAIL.test(text.trim()) && !chosen.has(q) && !people.some((p) => p.email.toLowerCase() === q);
  const options: { kind: "person" | "typed"; email: string; label: string; sub?: string }[] = [
    ...matches.map((p) => ({ kind: "person" as const, email: p.email, label: p.name, sub: p.email })),
    ...(typedOk ? [{ kind: "typed" as const, email: text.trim(), label: `Add “${text.trim()}”` }] : []),
  ];

  const add = (email: string) => {
    const e = email.trim();
    if (!e || chosen.has(e.toLowerCase())) return;
    setEmails((x) => [...x, e]);
    setText("");
    setActive(0);
  };
  const commitTyped = () => {
    // paste of several addresses at once
    const parts = split(text);
    const good = parts.filter((p) => EMAIL.test(p));
    if (good.length) { setEmails((x) => [...x, ...good.filter((g) => !x.some((y) => y.toLowerCase() === g.toLowerCase()))]); setText(parts.filter((p) => !EMAIL.test(p)).join(" ")); return true; }
    return false;
  };
  const nameOf = (e: string) => people.find((p) => p.email.toLowerCase() === e.toLowerCase())?.name;
  const bad = text.trim() !== "" && !EMAIL.test(text.trim()) && /[@.]/.test(text) && !matches.length;

  return (
    <div className="relative">
      <input ref={hidden} type="hidden" name={name} value={[...emails, ...(EMAIL.test(text.trim()) && !chosen.has(q) ? [text.trim()] : [])].join(", ")} />
      <div onClick={() => input.current?.focus()}
        className={clsx("input flex min-h-[38px] cursor-text flex-wrap items-center gap-1.5 !py-1.5", open && "border-sky ring-2 ring-sky/20")}>
        {emails.map((e) => {
          const n = nameOf(e);
          return (
            <span key={e} title={e} className="inline-flex max-w-full items-center gap-1 rounded-full bg-sky/10 py-0.5 pl-2 pr-1 text-xs font-semibold text-ink ring-1 ring-inset ring-sky/25">
              {n ? <><UserRound size={12} className="shrink-0 text-sky" />{n}</> : <span className="truncate">{e}</span>}
              <button type="button" onClick={(ev) => { ev.stopPropagation(); setEmails((x) => x.filter((y) => y !== e)); }} className="grid h-4 w-4 place-items-center rounded-full hover:bg-sky/20" aria-label={`Remove ${n ?? e}`}><X size={11} /></button>
            </span>
          );
        })}
        <input ref={input} value={text} placeholder={emails.length ? "" : placeholder}
          onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => { commitTyped(); setOpen(false); }, 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, options.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter" || e.key === "," || e.key === ";" || (e.key === "Tab" && text.trim())) {
              if (open && options[active] && (e.key === "Enter" || e.key === "Tab")) { e.preventDefault(); add(options[active].email); }
              else if (commitTyped()) e.preventDefault();
              else if (e.key !== "Tab") e.preventDefault();
            } else if (e.key === "Backspace" && !text && emails.length) setEmails((x) => x.slice(0, -1));
            else if (e.key === "Escape") setOpen(false);
          }}
          className="min-w-32 flex-1 border-0 bg-transparent p-0 text-sm text-ink outline-none placeholder:text-ink-soft/50 focus:ring-0"
          aria-label={placeholder} aria-autocomplete="list" aria-expanded={open} aria-controls={listId} role="combobox" />
      </div>
      {bad && <p className="mt-1 text-xs text-amber-700">That doesn&apos;t look like a full email address yet.</p>}
      {open && options.length > 0 && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-xl">
          {options.map((o, i) => (
            <li key={o.email} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); add(o.email); }} onMouseEnter={() => setActive(i)}
                className={clsx("flex w-full items-center gap-2 px-3 py-2 text-left text-sm", i === active ? "bg-mist" : "")}>
                {o.kind === "person" ? <UserRound size={15} className="shrink-0 text-ink-soft" /> : <Plus size={15} className="shrink-0 text-sky" />}
                <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{o.label}</span>{o.sub && <span className="ml-2 text-xs text-ink-soft">{o.sub}</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
