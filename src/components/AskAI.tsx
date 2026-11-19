"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sparkles, X, Send, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { play } from "@/lib/sound";

type Msg = { role: "user" | "assistant"; text: string; changes?: string[]; error?: boolean };

function suggestionsFor(path: string, intake: boolean): string[] {
  if (/^\/projects\/[^/]+\/intake\//.test(path)) return ["Make one deliverable per monthly report, each due on the last working day", "Link every payment to its deliverable", "Explain how payments are calculated in this contract"];
  if (intake) return ["Shorten the scope summary to 5 bullet points", "List every document we must submit", "Check the deadline and time zone again"];
  if (/^\/projects\/[^/]+$/.test(path)) return ["Which deliverables are overdue or due this month?", "Move all report deadlines to the last working day of the month", "Create a billing milestone for each accepted deliverable"];
  if (/^\/opportunities\/[^/]+\/workspace/.test(path) || /^\/tasks\//.test(path)) return ["Make the methodology section more specific to the TOR", "Shorten every section to about 400 words", "What is still missing before submission?"];
  if (/^\/opportunities\/[^/]+/.test(path)) return ["Summarise this tender in 5 bullets", "What are the biggest risks for us?", "Add the required documents to the checklist"];
  return ["What needs my attention today?", "How do I raise an invoice?", "Explain this page"];
}

/** Floating "Ask AI" chat that knows the current page and can change it. */
export function AskAI() {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const url = `${path}${params.toString() ? `?${params}` : ""}`;
  const lastUrl = useRef(url);

  // a new page starts a new conversation (the assistant's context is the page)
  useEffect(() => {
    if (lastUrl.current !== url && !busy) { lastUrl.current = url; setMsgs([]); }
  }, [url, busy]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setOpen((o) => !o); play("pop"); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const next: Msg[] = [...msgs, { role: "user", text: question }];
    setMsgs(next);
    setText("");
    setBusy(true);
    play("click");
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, messages: next.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text })) }) });
      const j = await r.json();
      if (j.error) { setMsgs((m) => [...m, { role: "assistant", text: j.error, error: true }]); play("error"); }
      else { setMsgs((m) => [...m, { role: "assistant", text: j.reply, changes: j.changes }]); play(j.changed ? "success" : "pop"); }
      if (j.changed) router.refresh();
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "Couldn't reach the assistant. Check your connection and try again.", error: true }]);
      play("error");
    } finally { setBusy(false); }
  }

  return (
    <>
      {!open && (
        <button type="button" data-silent onClick={() => { setOpen(true); play("pop"); }} aria-label="Ask AI (⌘J)"
          className="no-print fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-[#8a2c8d] to-[#2f6fc0] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-8px_rgba(138,44,141,.6)] transition hover:scale-[1.03]">
          <Sparkles size={17} /> Ask AI
        </button>
      )}
      {open && (
        <aside className="no-print fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-2xl sm:w-[420px]" aria-label="Ask AI">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#8a2c8d] to-[#2f6fc0] text-white"><Sparkles size={15} /></div>
            <div className="min-w-0 flex-1"><div className="font-display text-sm font-semibold">Ask AI</div><div className="truncate text-xs text-ink-soft">Knows this page · can make changes here · ⌘J</div></div>
            <button type="button" data-silent onClick={() => { setOpen(false); play("close"); }} className="rounded-md p-1.5 text-ink-soft hover:bg-mist" aria-label="Close"><X size={18} /></button>
          </div>
          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-ink-soft">Ask about what&apos;s on this screen, or tell me what to change — I&apos;ll do it and refresh the page.</p>
                <div className="space-y-2">
                  {suggestionsFor(path, params.has("intake")).map((s) => (
                    <button key={s} type="button" data-silent onClick={() => send(s)} className="block w-full rounded-xl border border-line px-3 py-2 text-left text-sm text-ink transition hover:border-plum/50 hover:bg-mist">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={clsx("max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  m.role === "user" ? "bg-plum text-white" : m.error ? "border border-red-200 bg-red-50 text-red-800" : "bg-mist text-ink")}>
                  {m.text}
                  {m.changes && m.changes.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-line pt-2">
                      {m.changes.map((c, k) => <div key={k} className="flex items-start gap-1.5 text-xs text-emerald-700"><CheckCircle2 size={13} className="mt-0.5 shrink-0" /> {c}</div>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-sm text-ink-soft"><span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-plum" /> Working on it… (large changes can take a minute)</div>}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="border-t border-line p-3">
            <div className="flex items-end gap-2">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="e.g. Split the monthly reports into one deliverable per month…"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
                className="input flex-1 resize-none" disabled={busy} />
              <button type="submit" data-silent disabled={busy || !text.trim()} className="btn-primary h-10 w-10 !p-0" aria-label="Send"><Send size={16} /></button>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-soft">Changes are applied straight away and logged. Review them on the page.</p>
          </form>
        </aside>
      )}
    </>
  );
}
