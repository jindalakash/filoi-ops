import { Field } from "./ui";
import { ActionForm } from "./client";
import { CurrencySelect, FormFooter } from "./forms";
import { saveExpert } from "@/app/actions/library";
import { num } from "@/lib/format";
import type { Expert } from "@prisma/client";

export function ExpertForm({ e, cancel }: { e?: Expert; cancel: string }) {
  return (
    <ActionForm action={saveExpert}>
      {e && <input type="hidden" name="id" value={e.id} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Full name *"><input name="name" required defaultValue={e?.name} className="input" /></Field>
        <Field label="Title / position"><input name="title" defaultValue={e?.title ?? ""} className="input" placeholder="Senior HIS Specialist" /></Field>
        <Field label="Years of experience"><input name="yearsExperience" type="number" min={0} defaultValue={e?.yearsExperience ?? ""} className="input" /></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={e?.email ?? ""} className="input" /></Field>
        <Field label="Phone"><input name="phone" defaultValue={e?.phone ?? ""} className="input" /></Field>
        <Field label="Nationality"><input name="nationality" defaultValue={e?.nationality ?? ""} className="input" /></Field>
        <Field label="Expertise tags" hint="Comma-separated, e.g. DHIS2, immunization, M&E" className="sm:col-span-2"><input name="expertise" defaultValue={e?.expertise ?? ""} className="input" /></Field>
        <Field label="Languages"><input name="languages" defaultValue={e?.languages ?? ""} className="input" /></Field>
        <Field label="Daily fee rate"><input name="dailyRate" inputMode="decimal" defaultValue={e?.dailyRate ? num(e.dailyRate) : ""} className="input" /></Field>
        <Field label="Rate currency"><CurrencySelect name="rateCurrency" value={e?.rateCurrency} /></Field>
        <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" name="isStaff" defaultChecked={e?.isStaff} className="h-4 w-4 accent-plum" /> Filoi staff (not an associate)</label>
        <Field label="Professional summary" className="sm:col-span-2 lg:col-span-3"><textarea name="summary" rows={4} defaultValue={e?.summary ?? ""} className="input" /></Field>
        <Field label="Education" hint="One degree per line" className="sm:col-span-2 lg:col-span-3"><textarea name="education" rows={3} defaultValue={e?.education ?? ""} className="input" /></Field>
        <Field label="Key assignments" hint="One per line: role – client – country – years" className="sm:col-span-2 lg:col-span-3"><textarea name="keyProjects" rows={5} defaultValue={e?.keyProjects ?? ""} className="input" /></Field>
        <Field label={e?.cvFileName ? `Replace CV (current: ${e.cvFileName})` : "CV file"} hint="PDF or Word" className="sm:col-span-2"><input type="file" name="cv" accept=".pdf,.docx,.doc" className="input" /></Field>
      </div>
      <FormFooter label={e ? "Save expert" : "Add expert"} cancel={cancel} />
    </ActionForm>
  );
}
