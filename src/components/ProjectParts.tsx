import { Field } from "./ui";
import { ActionForm, SubmitButton } from "./client";
import { PersonSelect } from "./forms";
import { saveDeliverable } from "@/app/actions/projects";
import { saveMilestone } from "@/app/actions/finance";
import { inputDate, num } from "@/lib/format";
import type { Deliverable, Milestone } from "@prisma/client";
import { CustomFieldInputs } from "./CustomFieldInputs";
import type { FieldDef, CustomValues } from "@/lib/custom";
import { EmailsInput } from "./EmailsInput";


export function DeliverableForm({ projectId, d, users, withBilling, currency, types, fields = [] }: { projectId: string; d?: Deliverable; users: { id: string; name: string }[]; withBilling?: boolean; currency: string; types: { value: string; label: string }[]; fields?: FieldDef[] }) {
  return (
    <ActionForm action={saveDeliverable} resetOnOk={!d} className="rounded-xl border border-line bg-mist/50 p-4">
      <input type="hidden" name="projectId" value={projectId} />
      {d && <input type="hidden" name="id" value={d.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Deliverable *" className="sm:col-span-2"><input name="title" required defaultValue={d?.title} className="input" placeholder="Inception report" /></Field>
        <Field label="Type"><select name="type" defaultValue={d?.type ?? types[0]?.value} className="input">{types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}{d && !types.some((t) => t.value === d.type) && <option value={d.type}>{d.type} (retired)</option>}</select></Field>
        <Field label="Due date"><input type="date" name="dueDate" defaultValue={inputDate(d?.dueDate)} className="input" /></Field>
        <Field label="Description / acceptance criteria" className="sm:col-span-2"><textarea name="description" rows={2} defaultValue={d?.description ?? ""} className="input" /></Field>
        <Field label="Owner"><PersonSelect name="ownerId" users={users} value={d?.ownerId} /></Field>
        <Field label="Extra alert emails" className="sm:col-span-2"><EmailsInput name="alertEmails" defaultValue={d?.alertEmails} placeholder="Optional — pick people or type emails" /></Field>
        {withBilling && !d && (
          <>
            <div className="sm:col-span-2 lg:col-span-4 -mb-1 mt-1 text-xs font-semibold text-plum">Payment linked to this deliverable (optional)</div>
            <Field label={`Amount (${currency})`}><input name="billAmount" inputMode="decimal" className="input" /></Field>
            <Field label="% of contract"><input name="billPercent" inputMode="decimal" className="input" /></Field>
            <Field label="Expected invoice date" hint="Defaults to due date"><input type="date" name="billDate" className="input" /></Field>
          </>
        )}
        <CustomFieldInputs fields={fields} values={d?.custom as CustomValues | undefined} users={users} />
      </div>
      <div className="mt-3 flex justify-end"><SubmitButton className="btn-dark btn-sm">{d ? "Save deliverable" : "Add deliverable"}</SubmitButton></div>
    </ActionForm>
  );
}

export function MilestoneForm({ projectId, m, deliverables, currency }: { projectId: string; m?: Milestone; deliverables: { id: string; title: string }[]; currency: string }) {
  return (
    <ActionForm action={saveMilestone} resetOnOk={!m} className="rounded-xl border border-line bg-mist/50 p-4">
      <input type="hidden" name="projectId" value={projectId} />
      {m && <input type="hidden" name="id" value={m.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Milestone *" className="sm:col-span-2"><input name="title" required defaultValue={m?.title} className="input" placeholder="2nd instalment – on acceptance of draft report" /></Field>
        <Field label={`Amount (${currency})`}><input name="amount" inputMode="decimal" defaultValue={m ? num(m.amount) : ""} className="input" /></Field>
        <Field label="or % of contract"><input name="percent" inputMode="decimal" defaultValue={m?.percent ? num(m.percent) : ""} className="input" /></Field>
        <Field label="Expected invoice date"><input type="date" name="dueDate" defaultValue={inputDate(m?.dueDate)} className="input" /></Field>
        <Field label="Linked deliverable" className="sm:col-span-2">
          <select name="deliverableId" defaultValue={m?.deliverableId ?? ""} className="input"><option value="">— none —</option>{deliverables.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>
        </Field>
      </div>
      <div className="mt-3 flex justify-end"><SubmitButton className="btn-dark btn-sm">{m ? "Save milestone" : "Add milestone"}</SubmitButton></div>
    </ActionForm>
  );
}
