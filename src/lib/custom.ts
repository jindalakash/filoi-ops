import { db } from "./db";
import { FormError } from "./form";
import type { CustomField } from "@prisma/client";

// ── Option lists ──
export const LISTS = {
  deliverableType: { label: "Deliverable types", hint: "Used on deliverables, task templates and AI work plans." },
  issueSource: { label: "Client issue sources", hint: "How a client reported an issue." },
} as const;
export type ListKey = keyof typeof LISTS;
export type Opt = { value: string; label: string };

/** Active options in order (for dropdowns). */
export async function options(list: ListKey): Promise<Opt[]> {
  const rows = await db.optionItem.findMany({ where: { list, active: true }, orderBy: { seq: "asc" }, select: { value: true, label: true } });
  return rows;
}
/** value → label for every option, retired ones included (for showing old records). */
export async function optionLabels(list: ListKey): Promise<Record<string, string>> {
  const rows = await db.optionItem.findMany({ where: { list }, select: { value: true, label: true } });
  return Object.fromEntries(rows.map((r) => [r.value, r.label]));
}

// ── Custom fields ──
export const ENTITIES = {
  WORK_ITEM: "Tasks & client issues",
  DELIVERABLE: "Deliverables",
  PROJECT: "Projects",
  CLIENT: "Clients",
  PROPOSAL: "Proposals",
} as const;
export type Entity = keyof typeof ENTITIES;
export const FIELD_TYPES = {
  TEXT: "Short text",
  LONGTEXT: "Long text",
  NUMBER: "Number",
  DATE: "Date",
  SELECT: "Dropdown (one)",
  MULTISELECT: "Dropdown (several)",
  USER: "Person (app user)",
  CHECKBOX: "Yes / no",
  URL: "Link",
} as const;
export type FieldDef = Pick<CustomField, "id" | "label" | "type" | "options" | "help" | "required" | "showInList">;
export type CustomValues = Record<string, unknown>;

export async function fieldsFor(entity: Entity): Promise<FieldDef[]> {
  return db.customField.findMany({ where: { entity, active: true }, orderBy: [{ seq: "asc" }, { createdAt: "asc" }], select: { id: true, label: true, type: true, options: true, help: true, required: true, showInList: true } });
}

/** Marker the form includes so the action knows custom inputs were on the page. */
export const CF_MARKER = "cf__present";

/**
 * Read custom field inputs (`cf_<id>`) from a form into the stored JSON.
 * Forms without custom inputs (quick adds, AI imports) leave existing values untouched.
 */
export async function readCustom(fd: FormData, entity: Entity, existing?: unknown): Promise<CustomValues | undefined> {
  if (!fd.has(CF_MARKER)) return undefined;
  const fields = await fieldsFor(entity);
  const out: CustomValues = { ...((existing as CustomValues) ?? {}) };
  for (const f of fields) {
    const name = `cf_${f.id}`;
    let v: unknown;
    const raw = (fd.get(name) ?? "").toString().trim();
    switch (f.type) {
      case "CHECKBOX": v = fd.get(name) === "on"; break;
      case "MULTISELECT": v = fd.getAll(name).map(String).filter((x) => f.options.includes(x)); break;
      case "NUMBER": {
        if (raw === "") { v = null; break; }
        const n = Number(raw.replace(/,/g, ""));
        if (!Number.isFinite(n)) throw new FormError(`${f.label} must be a number.`);
        v = n; break;
      }
      case "DATE": v = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null; break;
      case "SELECT": v = raw && f.options.includes(raw) ? raw : null; break;
      case "URL": {
        if (!raw) { v = null; break; }
        const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        try { new URL(url); } catch { throw new FormError(`${f.label} must be a web link.`); }
        v = url; break;
      }
      default: v = raw ? raw.slice(0, f.type === "LONGTEXT" ? 10000 : 500) : null;
    }
    const empty = v === null || v === "" || (Array.isArray(v) && v.length === 0);
    if (f.required && (empty || (f.type === "CHECKBOX" && v === false))) throw new FormError(`${f.label} is required.`);
    if (empty) delete out[f.id]; else out[f.id] = v;
  }
  return out;
}

/** Human-readable value, or null when empty. */
export function formatCustom(f: FieldDef, v: unknown, userNames?: Map<string, string>): string | null {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return null;
  switch (f.type) {
    case "CHECKBOX": return v ? "Yes" : "No";
    case "MULTISELECT": return (v as string[]).join(", ");
    case "DATE": return new Date(`${v}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    case "USER": return userNames?.get(String(v)) ?? "—";
    case "NUMBER": return Number(v).toLocaleString("en-IN");
    default: return String(v);
  }
}
