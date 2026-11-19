// Plain inputs for admin-defined fields. No hooks, so both server and client forms can use it.
import type { FieldDef, CustomValues } from "@/lib/custom";

const CF_MARKER = "cf__present"; // keep in sync with lib/custom.ts

export function CustomFieldInputs({ fields, values, users, className = "sm:col-span-2 lg:col-span-4", heading = true }: {
  fields: FieldDef[]; values?: CustomValues | null; users?: { id: string; name: string }[]; className?: string; heading?: boolean;
}) {
  if (!fields.length) return null;
  const v = (values ?? {}) as Record<string, unknown>;
  return (
    <div className={className}>
      <input type="hidden" name={CF_MARKER} value="1" />
      {heading && <div className="mb-2 mt-1 text-xs font-semibold uppercase tracking-wide text-plum">More details</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((f) => {
          const name = `cf_${f.id}`;
          const val = v[f.id];
          const label = <span className="label">{f.label}{f.required && " *"}</span>;
          const help = f.help ? <span className="mt-1 block text-xs text-ink-soft">{f.help}</span> : null;
          switch (f.type) {
            case "LONGTEXT":
              return <label key={f.id} className="block sm:col-span-2">{label}<textarea name={name} rows={3} defaultValue={(val as string) ?? ""} required={f.required} className="input" />{help}</label>;
            case "NUMBER":
              return <label key={f.id} className="block">{label}<input name={name} inputMode="decimal" defaultValue={val === undefined || val === null ? "" : String(val)} required={f.required} className="input" />{help}</label>;
            case "DATE":
              return <label key={f.id} className="block">{label}<input type="date" name={name} defaultValue={(val as string) ?? ""} required={f.required} className="input" />{help}</label>;
            case "URL":
              return <label key={f.id} className="block">{label}<input name={name} type="url" defaultValue={(val as string) ?? ""} required={f.required} className="input" placeholder="https://…" />{help}</label>;
            case "SELECT":
              return <label key={f.id} className="block">{label}<select name={name} defaultValue={(val as string) ?? ""} required={f.required} className="input"><option value="">—</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>{help}</label>;
            case "USER":
              return <label key={f.id} className="block">{label}<select name={name} defaultValue={(val as string) ?? ""} required={f.required} className="input"><option value="">—</option>{(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>{help}</label>;
            case "CHECKBOX":
              return <label key={f.id} className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name={name} defaultChecked={val === true} className="h-4 w-4 accent-plum" /> {f.label}{f.required && " *"}</label>;
            case "MULTISELECT": {
              const sel = new Set(Array.isArray(val) ? (val as string[]) : []);
              return (
                <fieldset key={f.id} className="sm:col-span-2">
                  <legend className="label">{f.label}{f.required && " *"}</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-line px-3 py-2">
                    {f.options.map((o) => <label key={o} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name={name} value={o} defaultChecked={sel.has(o)} className="h-4 w-4 accent-plum" />{o}</label>)}
                  </div>
                  {help}
                </fieldset>
              );
            }
            default:
              return <label key={f.id} className="block">{label}<input name={name} defaultValue={(val as string) ?? ""} required={f.required} className="input" />{help}</label>;
          }
        })}
      </div>
    </div>
  );
}
