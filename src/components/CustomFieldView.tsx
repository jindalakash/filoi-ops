import { formatCustom, type FieldDef, type CustomValues } from "@/lib/custom";

/** [label, value] pairs for the KV lists on detail pages (empty values skipped). */
export function customRows(fields: FieldDef[], values: unknown, userNames?: Map<string, string>): [string, React.ReactNode][] {
  const v = (values ?? {}) as CustomValues;
  return fields.flatMap((f) => {
    const text = formatCustom(f, v[f.id], userNames);
    if (text === null) return [];
    const node: React.ReactNode = f.type === "URL" ? <a href={text} target="_blank" rel="noreferrer" className="link break-all">{text.replace(/^https?:\/\//, "")}</a>
      : f.type === "LONGTEXT" ? <span className="whitespace-pre-line">{text}</span> : text;
    return [[f.label, node] as [string, React.ReactNode]];
  });
}

/** Small chips for list rows / board cards (fields marked "show in lists"). */
export function CustomChips({ fields, values, userNames }: { fields: FieldDef[]; values: unknown; userNames?: Map<string, string> }) {
  const v = (values ?? {}) as CustomValues;
  const chips = fields.filter((f) => f.showInList).flatMap((f) => {
    const t = formatCustom(f, v[f.id], userNames);
    return t === null ? [] : [{ id: f.id, text: f.type === "CHECKBOX" ? (v[f.id] ? f.label : null) : `${f.label}: ${t}` }];
  }).filter((c) => c.text);
  if (!chips.length) return null;
  return <>{chips.map((c) => <span key={c.id} className="rounded-full bg-mist px-2 py-0.5 text-[11px] text-ink-soft ring-1 ring-inset ring-line">{c.text}</span>)}</>;
}
