import { Field } from "./ui";
import { ActionForm } from "./client";
import { CustomFieldInputs } from "./CustomFieldInputs";
import type { FieldDef, CustomValues } from "@/lib/custom";

import { CurrencySelect, PersonSelect, FormFooter } from "./forms";
import { saveProject } from "@/app/actions/projects";
import { PROJECT_STATUS } from "./badges";
import { inputDate, num } from "@/lib/format";
import type { Project } from "@prisma/client";
import { EmailsInput } from "./EmailsInput";

type Opt = { id: string; name: string };

export function ProjectForm({ p, clients, users, cancel, fields = [] }: { p?: Project; clients: Opt[]; users: Opt[]; cancel: string; fields?: FieldDef[] }) {
  return (
    <ActionForm action={saveProject}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Project title *" className="sm:col-span-2 lg:col-span-3"><input name="title" required defaultValue={p?.title} className="input" /></Field>
        <Field label="Client *">
          <select name="clientId" required defaultValue={p?.clientId ?? ""} className="input">
            <option value="" disabled>Select client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Contract / PO number"><input name="contractNo" defaultValue={p?.contractNo ?? ""} className="input" /></Field>
        <Field label="Contract date"><input type="date" name="contractDate" defaultValue={inputDate(p?.contractDate)} className="input" /></Field>
        <Field label="Currency"><CurrencySelect value={p?.currency} /></Field>
        <Field label="Contract value"><input name="contractValue" inputMode="decimal" defaultValue={p ? num(p.contractValue) : ""} className="input" /></Field>
        <Field label="Status">
          <select name="status" defaultValue={p?.status ?? "ACTIVE"} className="input">{Object.entries(PROJECT_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}</select>
        </Field>
        <Field label="Start date"><input type="date" name="startDate" defaultValue={inputDate(p?.startDate)} className="input" /></Field>
        <Field label="End date"><input type="date" name="endDate" defaultValue={inputDate(p?.endDate)} className="input" /></Field>
        <Field label="Project manager"><PersonSelect name="managerId" users={users} value={p?.managerId} /></Field>
        <Field label="Description / scope" className="sm:col-span-2 lg:col-span-3"><textarea name="description" rows={4} defaultValue={p?.description ?? ""} className="input" /></Field>
        <Field label="Alert emails" hint="Receives deliverable & invoicing reminders. Pick app users or type any email and press Enter." className="sm:col-span-2"><EmailsInput name="alertEmails" defaultValue={p?.alertEmails} /></Field>
        <Field label="Remind days before due" hint="e.g. 5,2,0 → 5 days, 2 days and on the day"><input name="reminderDays" defaultValue={p?.reminderDays ?? "5,2,0"} className="input" /></Field>
      </div>
      <CustomFieldInputs fields={fields} values={p?.custom as CustomValues | undefined} users={users} className="mt-5" />
      <FormFooter label={p ? "Save changes" : "Create project"} cancel={cancel} />
    </ActionForm>
  );
}
