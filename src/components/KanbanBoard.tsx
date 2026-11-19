"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { moveWorkItem } from "@/app/actions/work";
import { play } from "@/lib/sound";

export type BoardCard = {
  id: string; number: number; title: string; type: string; priority: string;
  statusId: string; position: number; due: string | null; overdue: boolean;
  assignee: string | null; project: string; deliverable: string | null; canMove: boolean;
};
type Col = { id: string; name: string; category: string; color: string };

const DOT: Record<string, string> = { gray: "bg-slate-400", blue: "bg-sky", purple: "bg-plum", amber: "bg-sun", green: "bg-emerald-600", red: "bg-red-600", navy: "bg-navy" };
const TYPE_TAG: Record<string, [string, string]> = { ISSUE: ["Client issue", "bg-red-50 text-red-700 ring-red-200"], CHANGE: ["Change", "bg-amber-50 text-amber-800 ring-amber-200"] };
const PRIO_TAG: Record<string, [string, string]> = { URGENT: ["Urgent", "bg-red-50 text-red-700 ring-red-200"], HIGH: ["High", "bg-amber-50 text-amber-800 ring-amber-200"] };

const initials = (n: string) => n.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();

export function KanbanBoard({ columns, cards: initial }: { columns: Col[]; cards: BoardCard[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ col: string; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  // fresh server data (after refresh / filter change) replaces the local optimistic copy
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) { setSeen(initial); setCards(initial); }

  const inCol = (colId: string) => cards.filter((c) => c.statusId === colId).sort((a, b) => a.position - b.position);

  function drop(colId: string, index: number) {
    const id = drag;
    setDrag(null); setOver(null);
    if (!id) return;
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const list = inCol(colId).filter((c) => c.id !== id);
    const prev = list[index - 1], next = list[index];
    const position = prev && next ? (prev.position + next.position) / 2 : prev ? prev.position + 1 : next ? next.position - 1 : 1;
    if (card.statusId === colId && card.position === position) return;
    const before = cards;
    setCards(cards.map((c) => (c.id === id ? { ...c, statusId: colId, position } : c)));
    play(columns.find((c) => c.id === colId)?.category === "DONE" ? "success" : "pop");
    start(async () => {
      const r = await moveWorkItem(id, colId, position);
      if (r?.error) { setCards(before); setError(r.error); play("error"); }
      else { setError(null); router.refresh(); }
    });
  }

  return (
    <>
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-4">
        {columns.map((col) => {
          const list = inCol(col.id);
          return (
            <section key={col.id}
              className={clsx("flex w-72 shrink-0 flex-col rounded-xl border bg-mist/60 transition", over?.col === col.id ? "border-sky ring-2 ring-sky/20" : "border-line")}
              onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (!list.length || over?.col !== col.id) setOver({ col: col.id, index: over?.col === col.id ? over.index : list.length }); }}
              onDrop={(e) => { e.preventDefault(); drop(col.id, over?.col === col.id ? over.index : list.length); }}
              aria-label={col.name}>
              <header className="flex items-center gap-2 px-3 py-2.5">
                <span className={clsx("h-2.5 w-2.5 rounded-full", DOT[col.color] ?? DOT.gray)} aria-hidden />
                <h3 className="text-sm font-semibold">{col.name}</h3>
                <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-ink-soft">{list.length}</span>
              </header>
              <ol className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {list.map((c, i) => (
                  <li key={c.id}
                    draggable={c.canMove}
                    onDragStart={(e) => { setDrag(c.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.id); }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}
                    onDragOver={(e) => { if (!drag) return; e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); const idx = e.clientY < r.top + r.height / 2 ? i : i + 1; if (over?.col !== col.id || over.index !== idx) setOver({ col: col.id, index: idx }); }}
                    className={clsx("relative", drag === c.id && "opacity-40")}>
                    {over?.col === col.id && over.index === i && drag && drag !== c.id && <div className="absolute -top-1.5 left-1 right-1 h-0.5 rounded bg-sky" />}
                    <Link href={`/work/${c.number}`} draggable={false}
                      className={clsx("block rounded-lg border border-line bg-surface p-3 shadow-sm transition hover:border-sky/50 hover:shadow-md", c.canMove ? "cursor-grab active:cursor-grabbing" : "cursor-pointer")}>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-soft">
                        <span className="font-mono">W-{c.number}</span>
                        <span>· {c.project}</span>
                        {TYPE_TAG[c.type] && <span className={clsx("rounded-full px-1.5 py-px font-semibold ring-1 ring-inset", TYPE_TAG[c.type][1])}>{TYPE_TAG[c.type][0]}</span>}
                        {PRIO_TAG[c.priority] && <span className={clsx("rounded-full px-1.5 py-px font-semibold ring-1 ring-inset", PRIO_TAG[c.priority][1])}>{PRIO_TAG[c.priority][0]}</span>}
                      </div>
                      <div className="mt-1 text-sm font-medium leading-snug">{c.title}</div>
                      {c.deliverable && <div className="mt-1 truncate text-xs text-ink-soft">↳ {c.deliverable}</div>}
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                        <span className={clsx(c.overdue ? "font-semibold text-red-700" : "text-ink-soft")}>{c.due ?? ""}</span>
                        {c.assignee
                          ? <span title={c.assignee} className="grid h-6 w-6 place-items-center rounded-full bg-navy text-[10px] font-bold text-white">{initials(c.assignee)}</span>
                          : <span className="text-ink-soft">Unassigned</span>}
                      </div>
                    </Link>
                  </li>
                ))}
                {over?.col === col.id && over.index === list.length && drag && <li className="h-0.5 rounded bg-sky" aria-hidden />}
                {!list.length && <li className="grid flex-1 place-items-center rounded-lg border border-dashed border-line py-6 text-xs text-ink-soft">Drop here</li>}
              </ol>
            </section>
          );
        })}
      </div>
    </>
  );
}
