"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { guard, FormError } from "@/lib/form";
import { logActivity } from "@/lib/activity";
import { LISTS, ENTITIES, FIELD_TYPES, type ListKey } from "@/lib/custom";
import type { ActionState } from "@/components/client";
import type { StatusCategory } from "@prisma/client";

const TONES = ["gray", "blue", "purple", "amber", "green", "red", "navy"];
const tone = (c: unknown) => (TONES.includes(String(c)) ? String(c) : "gray");
const clean = (s: unknown, max = 80) => String(s ?? "").trim().slice(0, max);
const parse = <T,>(fd: FormData): T[] => {
  try { const v = JSON.parse(String(fd.get("json") ?? "[]")); return Array.isArray(v) ? v : []; } catch { throw new FormError("Could not read the changes."); }
};
function refreshAll() {
  revalidatePath("/settings");
  revalidatePath("/board");
  revalidatePath("/deliverables");
  revalidatePath("/issues");
  revalidatePath("/", "layout");
}

/** Board columns: order, names, meaning, colour; retire or delete only when empty. */
export async function saveColumns(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("admin");
  return guard(async () => {
    type Row = { id?: string; name: string; category: string; color: string; active: boolean };
    const rows = parse<Row>(fd).map((r) => ({ ...r, name: clean(r.name, 40), category: ["TODO", "IN_PROGRESS", "DONE"].includes(r.category) ? r.category : "IN_PROGRESS", active: r.active !== false }));
    if (rows.some((r) => !r.name)) throw new FormError("Every column needs a name.");
    if (new Set(rows.map((r) => r.name.toLowerCase())).size !== rows.length) throw new FormError("Column names must be different.");
    const live = rows.filter((r) => r.active);
    if (!live.some((r) => r.category === "TODO")) throw new FormError("Keep at least one active “To do” column — new tasks start there.");
    if (!live.some((r) => r.category === "DONE")) throw new FormError("Keep at least one active “Done” column — progress counts tasks there.");
    if (live[0].category !== "TODO") throw new FormError("The first active column must be a “To do” column — new tasks are placed in it.");
    const existing = await db.workStatus.findMany({ include: { _count: { select: { items: true } } } });
    const keep = new Set(rows.map((r) => r.id).filter(Boolean));
    for (const e of existing) {
      const r = rows.find((x) => x.id === e.id);
      if ((!r || !r.active) && e._count.items > 0) throw new FormError(`“${e.name}” still has ${e._count.items} card(s). Move them to another column first.`);
    }
    await db.$transaction(async (tx) => {
      // free names first so renames/swaps don't clash with the unique index
      for (const e of existing) await tx.workStatus.update({ where: { id: e.id }, data: { name: `__tmp_${e.id}` } });
      for (const e of existing) if (!keep.has(e.id)) await tx.workStatus.delete({ where: { id: e.id } });
      for (const [i, r] of rows.entries()) {
        const data = { name: r.name, category: r.category as StatusCategory, color: tone(r.color), seq: i, active: r.active };
        if (r.id && existing.some((e) => e.id === r.id)) await tx.workStatus.update({ where: { id: r.id }, data });
        else await tx.workStatus.create({ data });
      }
    });
    await logActivity(user.id, "settings", "settings", null, "Updated board columns");
    refreshAll();
    return { ok: "Board columns saved." };
  });
}

export async function saveLabels(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("admin");
  return guard(async () => {
    type Row = { id?: string; name: string; color: string; active: boolean };
    const rows = parse<Row>(fd).map((r) => ({ ...r, name: clean(r.name, 30), active: r.active !== false })).filter((r) => r.name);
    if (new Set(rows.map((r) => r.name.toLowerCase())).size !== rows.length) throw new FormError("Label names must be different.");
    const existing = await db.workLabel.findMany();
    const keep = new Set(rows.map((r) => r.id).filter(Boolean));
    await db.$transaction(async (tx) => {
      for (const e of existing) await tx.workLabel.update({ where: { id: e.id }, data: { name: `__tmp_${e.id}` } });
      for (const e of existing) if (!keep.has(e.id)) await tx.workLabel.delete({ where: { id: e.id } });
      for (const [i, r] of rows.entries()) {
        const data = { name: r.name, color: tone(r.color), seq: i, active: r.active };
        if (r.id && existing.some((e) => e.id === r.id)) await tx.workLabel.update({ where: { id: r.id }, data });
        else await tx.workLabel.create({ data });
      }
    });
    await logActivity(user.id, "settings", "settings", null, "Updated task labels");
    refreshAll();
    return { ok: "Labels saved." };
  });
}

async function usage(list: ListKey, value: string) {
  if (list === "deliverableType") return db.deliverable.count({ where: { type: value } });
  return db.workItem.count({ where: { source: value } });
}

/** Rename, reorder, add or retire options. Values are fixed once created; used options can only be retired. */
export async function saveList(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("admin");
  return guard(async () => {
    const list = String(fd.get("list")) as ListKey;
    if (!(list in LISTS)) throw new FormError("Unknown list.");
    type Row = { id?: string; label: string; active: boolean };
    const rows = parse<Row>(fd).map((r) => ({ ...r, label: clean(r.label, 60), active: r.active !== false }));
    if (rows.some((r) => !r.label)) throw new FormError("Every option needs a name.");
    if (!rows.some((r) => r.active)) throw new FormError("Keep at least one active option.");
    const existing = await db.optionItem.findMany({ where: { list } });
    const keep = new Set(rows.map((r) => r.id).filter(Boolean));
    for (const e of existing) if (!keep.has(e.id)) {
      const n = await usage(list, e.value);
      if (n) throw new FormError(`“${e.label}” is used by ${n} record(s) — untick “Active” to retire it instead.`);
    }
    const taken = new Set(existing.map((e) => e.value));
    const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "OPTION";
    await db.$transaction(async (tx) => {
      for (const e of existing) if (!keep.has(e.id)) await tx.optionItem.delete({ where: { id: e.id } });
      for (const [i, r] of rows.entries()) {
        if (r.id && existing.some((e) => e.id === r.id)) { await tx.optionItem.update({ where: { id: r.id }, data: { label: r.label, seq: i, active: r.active } }); continue; }
        let value = slug(r.label), n = 2;
        while (taken.has(value)) value = `${slug(r.label)}_${n++}`;
        taken.add(value);
        await tx.optionItem.create({ data: { list, value, label: r.label, seq: i, active: r.active } });
      }
    });
    await logActivity(user.id, "settings", "settings", null, `Updated list: ${LISTS[list].label}`);
    refreshAll();
    return { ok: `${LISTS[list].label} saved.` };
  });
}

/** Custom fields for one form. A field's type is fixed once created. */
export async function saveCustomFields(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("admin");
  return guard(async () => {
    const entity = String(fd.get("entity"));
    if (!(entity in ENTITIES)) throw new FormError("Unknown form.");
    type Row = { id?: string; label: string; type: string; options: string[] | string; help?: string; required?: boolean; showInList?: boolean; active?: boolean };
    const rows = parse<Row>(fd).map((r) => ({
      id: r.id,
      label: clean(r.label, 60),
      type: r.type in FIELD_TYPES ? r.type : "TEXT",
      options: [...new Set((Array.isArray(r.options) ? r.options : String(r.options ?? "").split("\n")).map((o) => clean(o, 60)).filter(Boolean))],
      help: clean(r.help, 200) || null,
      required: !!r.required, showInList: !!r.showInList, active: r.active !== false,
    }));
    if (rows.some((r) => !r.label)) throw new FormError("Every field needs a name.");
    const bad = rows.find((r) => (r.type === "SELECT" || r.type === "MULTISELECT") && r.options.length < 2);
    if (bad) throw new FormError(`“${bad.label}” needs at least two choices (one per line).`);
    const existing = await db.customField.findMany({ where: { entity } });
    for (const r of rows) {
      const e = r.id && existing.find((x) => x.id === r.id);
      if (e && e.type !== r.type) throw new FormError(`The type of “${e.label}” can't change once created. Add a new field instead.`);
    }
    const keep = new Set(rows.map((r) => r.id).filter(Boolean));
    await db.$transaction(async (tx) => {
      for (const e of existing) if (!keep.has(e.id)) await tx.customField.delete({ where: { id: e.id } });
      for (const [i, r] of rows.entries()) {
        const data = { label: r.label, options: r.options, help: r.help, required: r.required, showInList: r.showInList, active: r.active, seq: i };
        if (r.id && existing.some((e) => e.id === r.id)) await tx.customField.update({ where: { id: r.id }, data });
        else await tx.customField.create({ data: { ...data, entity, type: r.type } });
      }
    });
    await logActivity(user.id, "settings", "settings", null, `Updated custom fields: ${ENTITIES[entity as keyof typeof ENTITIES]}`);
    refreshAll();
    return { ok: `Fields for ${ENTITIES[entity as keyof typeof ENTITIES].toLowerCase()} saved.` };
  });
}
