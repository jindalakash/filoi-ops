"use client";
import { useSyncExternalStore } from "react";
import clsx from "clsx";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { play } from "@/lib/sound";

// Which groups are collapsed, remembered in this browser (per page "scope").
const EVT = "filoi-collapsed";
const key = (scope: string) => `filoi-collapsed:${scope}`;
const read = (scope: string): string[] => { try { return JSON.parse(localStorage.getItem(key(scope)) || "[]"); } catch { return []; } };
const write = (scope: string, ids: string[]) => { try { localStorage.setItem(key(scope), JSON.stringify([...new Set(ids)])); } catch {} window.dispatchEvent(new Event(EVT)); };
const subscribe = (cb: () => void) => { window.addEventListener(EVT, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(EVT, cb); window.removeEventListener("storage", cb); }; };
function useCollapsed(scope: string) {
  const raw = useSyncExternalStore(subscribe, () => localStorage.getItem(key(scope)) ?? "[]", () => "[]");
  try { return new Set<string>(JSON.parse(raw)); } catch { return new Set<string>(); }
}

/** Card whose body folds away; header and summary stay visible. */
export function CollapsibleGroup({ scope, id, title, actions, summary, children }: { scope: string; id: string; title: React.ReactNode; actions?: React.ReactNode; summary?: React.ReactNode; children: React.ReactNode }) {
  const collapsed = useCollapsed(scope).has(id);
  const toggle = () => {
    const now = read(scope);
    write(scope, collapsed ? now.filter((x) => x !== id) : [...now, id]);
    play(collapsed ? "pop" : "close");
  };
  return (
    <section className="card">
      <div
        className="flex cursor-pointer items-center justify-between gap-3 border-b border-line px-5 py-3.5 select-none"
        onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button,select,input,form")) toggle(); }}>
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" data-silent onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? "Expand" : "Collapse"}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-soft transition hover:bg-mist hover:text-ink">
            <ChevronRight size={18} className={clsx("transition-transform duration-200", !collapsed && "rotate-90")} />
          </button>
          <h2 className="min-w-0 text-[15px] font-semibold">{title}</h2>
        </div>
        {actions}
      </div>
      {summary && <div className={clsx("px-5 py-4", !collapsed && "border-b border-line")}>{summary}</div>}
      {!collapsed && children}
    </section>
  );
}

/** "Collapse all" / "Expand all" for every group in a scope. */
export function CollapseAllButtons({ scope, ids }: { scope: string; ids: string[] }) {
  const collapsed = useCollapsed(scope);
  const allClosed = ids.length > 0 && ids.every((x) => collapsed.has(x));
  return (
    <button type="button" data-silent
      onClick={() => { write(scope, allClosed ? read(scope).filter((x) => !ids.includes(x)) : [...read(scope), ...ids]); play(allClosed ? "pop" : "close"); }}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
      {allClosed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
      {allClosed ? "Expand all" : "Collapse all"}
    </button>
  );
}

/** A table section (one <tbody>) with a clickable header row that folds its rows away. */
export function GroupTbody({ scope, id, colSpan, header, summary, children }: { scope: string; id: string; colSpan: number; header: React.ReactNode; summary?: React.ReactNode; children: React.ReactNode }) {
  const collapsed = useCollapsed(scope).has(id);
  const toggle = () => {
    const now = read(scope);
    write(scope, collapsed ? now.filter((x) => x !== id) : [...now, id]);
    play(collapsed ? "pop" : "close");
  };
  return (
    <tbody>
      <tr className="cursor-pointer select-none !bg-mist/70 hover:!bg-mist" onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) toggle(); }}>
        <td colSpan={colSpan} className="!py-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button type="button" data-silent onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? "Expand" : "Collapse"}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-soft hover:bg-surface hover:text-ink">
              <ChevronRight size={16} className={clsx("transition-transform duration-200", !collapsed && "rotate-90")} />
            </button>
            <div className="min-w-0 flex-1 font-semibold">{header}</div>
            {summary && <div className="text-sm text-ink-soft">{summary}</div>}
          </div>
        </td>
      </tr>
      {!collapsed && children}
    </tbody>
  );
}
