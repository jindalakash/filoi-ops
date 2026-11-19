// Shared form bodies (server components rendering plain inputs)
import { Field } from "./ui";
import { CURRENCIES, inputDate, num } from "@/lib/format";
import { SubmitButton } from "./client";
import { CustomFieldInputs } from "./CustomFieldInputs";
import type { FieldDef, CustomValues } from "@/lib/custom";

type Opt = { id: string; name: string };

export function CurrencySelect({ name = "currency", value }: { name?: string; value?: string }) {
  return (
    <select name={name} defaultValue={value ?? "USD"} className="input">
      {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
    </select>
  );
}

export function PersonSelect({ name, users, value, placeholder = "— Unassigned —" }: { name: string; users: Opt[]; value?: string | null; placeholder?: string }) {
  return (
    <select name={name} defaultValue={value ?? ""} className="input">
      <option value="">{placeholder}</option>
      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
  );
}

export const CLIENT_TYPES = [
  ["UN_AGENCY", "UN agency"], ["MULTILATERAL", "Multilateral / development bank"], ["INTERNATIONAL_NGO", "International NGO / foundation"],
  ["GOVERNMENT", "Government"], ["PRIVATE", "Private company"], ["NGO", "Indian NGO"], ["OTHER", "Other"],
] as const;

type ClientRow = {
  id?: string; name?: string; shortName?: string | null; type?: string; country?: string; address?: string | null; gstin?: string | null; stateCode?: string | null;
  taxId?: string | null; vendorNumber?: string | null; contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null; defaultCurrency?: string; notes?: string | null;
};

export function ClientFields({ c = {}, fields = [], users = [] }: { c?: ClientRow; fields?: FieldDef[]; users?: Opt[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {c.id && <input type="hidden" name="id" value={c.id} />}
      <Field label="Organisation name *" className="sm:col-span-2"><input name="name" required defaultValue={c.name} className="input" placeholder="World Health Organization" /></Field>
      <Field label="Short name"><input name="shortName" defaultValue={c.shortName ?? ""} className="input" placeholder="WHO" /></Field>
      <Field label="Type">
        <select name="type" defaultValue={c.type ?? "UN_AGENCY"} className="input">{CLIENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </Field>
      <Field label="Country" hint="Use “India” for domestic clients — this decides GST treatment."><input name="country" defaultValue={c.country ?? "Switzerland"} className="input" /></Field>
      <Field label="Default currency"><CurrencySelect name="defaultCurrency" value={c.defaultCurrency} /></Field>
      <Field label="Billing address" className="sm:col-span-2"><textarea name="address" rows={3} defaultValue={c.address ?? ""} className="input" /></Field>
      <Field label="Contact person"><input name="contactName" defaultValue={c.contactName ?? ""} className="input" /></Field>
      <Field label="Contact email"><input name="contactEmail" type="email" defaultValue={c.contactEmail ?? ""} className="input" /></Field>
      <Field label="Contact phone"><input name="contactPhone" defaultValue={c.contactPhone ?? ""} className="input" /></Field>
      <Field label="Our vendor / supplier no." hint="e.g. WHO supplier number"><input name="vendorNumber" defaultValue={c.vendorNumber ?? ""} className="input" /></Field>
      <Field label="GSTIN (Indian clients)"><input name="gstin" defaultValue={c.gstin ?? ""} className="input uppercase" /></Field>
      <Field label="GST state code" hint="2 digits, e.g. 07 for Delhi"><input name="stateCode" defaultValue={c.stateCode ?? ""} className="input" maxLength={2} /></Field>
      <Field label="Foreign tax ID"><input name="taxId" defaultValue={c.taxId ?? ""} className="input" /></Field>
      <Field label="Notes" className="sm:col-span-2"><textarea name="notes" rows={2} defaultValue={c.notes ?? ""} className="input" /></Field>
      <CustomFieldInputs fields={fields} values={(c as { custom?: CustomValues }).custom} users={users} className="sm:col-span-2" />
    </div>
  );
}

export function FormFooter({ label = "Save", cancel }: { label?: string; cancel?: string }) {
  return (
    <div className="mt-6 flex justify-end gap-2 border-t border-line pt-5">
      {cancel && <a href={cancel} className="btn-ghost">Cancel</a>}
      <SubmitButton>{label}</SubmitButton>
    </div>
  );
}

export { inputDate, num };
