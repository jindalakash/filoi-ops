"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Bell, AtSign, MessageSquare, UserPlus, ArrowRightLeft, Clock, FileText } from "lucide-react";
import { play } from "@/lib/sound";

type Item = { id: string; kind: string; title: string; body: string | null; href: string; readAt: string | null; createdAt: string };
const ICON: Record<string, React.ElementType> = { MENTION: AtSign, COMMENT: MessageSquare, ASSIGNED: UserPlus, STATUS: ArrowRightLeft, DUE: Clock, PROPOSAL: FileText };

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function NotificationBell({ className }: { className?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const path = usePathname();

  const load = useCallback(async () => {
    const r = await fetch("/api/notifications", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const j = (await r.json()) as { items: Item[]; unread: number };
    setItems(j.items);
    setUnread(j.unread);
  }, []);

  // refresh on navigation, every minute, and when the tab regains focus
  useEffect(() => {
    void Promise.resolve().then(load);
    const t = setInterval(load, 60_000);
    const f = () => load();
    window.addEventListener("focus", f);
    return () => { clearInterval(t); window.removeEventListener("focus", f); };
  }, [load, path]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  async function markAll() {
    setItems((xs) => xs.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    setUnread(0);
    await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
  }

  async function openItem(n: Item) {
    setOpen(false);
    if (!n.readAt) {
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n.id }) });
    }
    router.push(n.href);
  }

  return (
    <div ref={box} className={clsx("relative", className)}>
      <button type="button" data-silent onClick={() => { setOpen((o) => !o); play(open ? "close" : "pop"); if (!open) void load(); }}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open}
        className="relative grid h-8 w-8 place-items-center rounded-full border border-line text-ink-soft transition hover:text-ink">
        <Bell size={15} />
        {unread > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-plum px-1 text-[10px] font-bold leading-none text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-[min(24rem,90vw)] overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && <button type="button" onClick={markAll} className="text-xs font-semibold text-sky hover:underline">Mark all read</button>}
          </div>
          {items.length === 0 ? <div className="px-4 py-8 text-center text-sm text-ink-soft">You&apos;re all caught up.</div> : (
            <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
              {items.map((n) => {
                const Icon = ICON[n.kind] ?? Bell;
                return (
                  <li key={n.id}>
                    <button type="button" onClick={() => openItem(n)} className={clsx("flex w-full gap-3 px-4 py-3 text-left transition hover:bg-mist", !n.readAt && "bg-plum/5")}>
                      <Icon size={16} className={clsx("mt-0.5 shrink-0", n.readAt ? "text-ink-soft" : "text-plum")} />
                      <span className="min-w-0 flex-1">
                        <span className={clsx("block text-sm leading-snug", !n.readAt && "font-semibold")}>{n.title}</span>
                        {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-ink-soft">{n.body}</span>}
                        <span className="mt-0.5 block text-[11px] text-ink-soft">{ago(n.createdAt)}</span>
                      </span>
                      {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-plum" aria-label="unread" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
