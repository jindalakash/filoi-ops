"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Search, FileText, FolderKanban, ListChecks, Receipt, ClipboardCheck, Building2, UserRound, Award, Paperclip, CornerDownLeft } from "lucide-react";
import { play } from "@/lib/sound";

type Hit = { type: string; id: string; title: string; subtitle?: string; href: string };
const ICON: Record<string, React.ElementType> = { proposal: FileText, project: FolderKanban, deliverable: ListChecks, invoice: Receipt, task: ClipboardCheck, client: Building2, expert: UserRound, reference: Award, file: Paperclip };

/** ⌘K / Ctrl K search across proposals, projects, invoices, clients, experts, files… */
export function CommandSearch({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<{ label: string; hits: Hit[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups]);

  const show = (v: boolean) => {
    setOpen(v);
    play(v ? "pop" : "close");
    if (!v) { setQ(""); setGroups([]); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => { play(o ? "close" : "pop"); return !o; }); }
      if (e.key === "/" && !open && !(e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")) { e.preventDefault(); setOpen(true); play("pop"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 20); }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const j = await r.json();
        setGroups(j.groups ?? []);
        setActive(0);
      } catch { /* aborted */ } finally { setLoading(false); }
    }, 180);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const go = (h?: Hit) => {
    if (!h) return;
    show(false);
    router.push(h.href);
  };

  let idx = -1;
  return (
    <>
      <button type="button" data-silent onClick={() => show(true)} aria-label="Search (⌘K)"
        className={clsx("flex items-center gap-2 rounded-full border border-line bg-surface text-sm text-ink-soft transition hover:text-ink", compact ? "h-8 w-8 justify-center" : "h-8 px-3")}>
        <Search size={15} />
        {!compact && <><span className="hidden xl:inline">Search everything…</span><kbd className="hidden rounded border border-line px-1.5 text-[10px] xl:inline">⌘K</kbd></>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-night/50 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) show(false); }}>
          <div className="card w-full max-w-xl overflow-hidden shadow-2xl" role="dialog" aria-label="Search">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={18} className="text-ink-soft" />
              <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 2) setGroups([]); }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") show(false);
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                  if (e.key === "Enter") { e.preventDefault(); go(flat[active]); }
                }}
                placeholder="Search proposals, projects, invoices, clients, experts, files…" className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-soft/60" />
              {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-plum" />}
              <kbd className="rounded border border-line px-1.5 text-[10px] text-ink-soft">Esc</kbd>
            </div>
            <div className="max-h-[60vh] overflow-y-auto py-2">
              {q.trim().length < 2 ? (
                <p className="px-4 py-6 text-center text-sm text-ink-soft">Type at least 2 letters — e.g. <b>WHO</b>, <b>FIL/26</b>, <b>DHIS2</b>, a person or a file name.</p>
              ) : !loading && flat.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-ink-soft">No matches for “{q}”.</p>
              ) : groups.map((g) => (
                <div key={g.label} className="mb-1">
                  <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{g.label}</div>
                  {g.hits.map((h) => {
                    idx++;
                    const i = idx;
                    const Icon = ICON[h.type] ?? FileText;
                    return (
                      <button key={`${h.type}-${h.id}`} type="button" data-silent onMouseEnter={() => setActive(i)} onClick={() => go(h)}
                        className={clsx("flex w-full items-center gap-3 px-4 py-2 text-left", active === i ? "bg-mist" : "")}>
                        <Icon size={16} className="shrink-0 text-plum" />
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{h.title}</span>{h.subtitle && <span className="block truncate text-xs text-ink-soft">{h.subtitle}</span>}</span>
                        {active === i && <CornerDownLeft size={14} className="text-ink-soft" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
