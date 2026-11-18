import Link from "next/link";
import { Field } from "./ui";
import { ActionForm } from "./client";
import { CurrencySelect, PersonSelect, FormFooter } from "./forms";
import { saveOpportunity } from "@/app/actions/opportunities";
import { inputDate, num } from "@/lib/format";
import type { Opportunity } from "@prisma/client";

type Opt = { id: string; name: string };

export function OpportunityForm({ o, clients, users, cancel }: { o?: Opportunity; clients: Opt[]; users: Opt[]; cancel: string }) {
  const dt = (d?: Date | null) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  return (
    <ActionForm action={saveOpportunity}>
      {o && <input type="hidden" name="id" value={o.id} />}
      <div className="space-y-8">
        <section>
          <h3 className="mb-3 text-sm font-semibold text-plum">Basics</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Assignment / tender title *" className="sm:col-span-2 lg:col-span-3"><input name="title" required defaultValue={o?.title} className="input" placeholder="Technical support for DHIS2 implementation in…" /></Field>
            <Field label="Client *" hint={undefined}>
              <select name="clientId" required defaultValue={o?.clientId ?? ""} className="input">
                <option value="" disabled>Select client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Link href="/clients/new?returnTo=/opportunities/new" className="mt-1 inline-block text-xs link">+ Add a new client</Link>
            </Field>
            <Field label="Reference / RFP no."><input name="referenceNo" defaultValue={o?.referenceNo ?? ""} className="input" /></Field>
            <Field label="Source"><input name="source" defaultValue={o?.source ?? ""} className="input" placeholder="UNGM, client email, devex…" list="sources" />
              <datalist id="sources"><option>UNGM</option><option>Client email</option><option>Devex</option><option>CPPP / GeM</option><option>Website</option><option>Referral</option></datalist>
            </Field>
            <Field label="Proposal owner"><PersonSelect name="ownerId" users={users} value={o?.ownerId} /></Field>
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-sm font-semibold text-plum">Key dates</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Submission deadline"><input type="datetime-local" name="submissionDeadline" defaultValue={dt(o?.submissionDeadline)} className="input" /></Field>
            <Field label="Clarification / query deadline"><input type="date" name="queryDeadline" defaultValue={inputDate(o?.queryDeadline)} className="input" /></Field>
            <Field label="Pre-bid meeting"><input type="date" name="preBidDate" defaultValue={inputDate(o?.preBidDate)} className="input" /></Field>
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-sm font-semibold text-plum">Commercials & evaluation</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Currency"><CurrencySelect value={o?.currency} /></Field>
            <Field label="Proposed value"><input name="estimatedValue" inputMode="decimal" defaultValue={o?.estimatedValue ? num(o.estimatedValue) : ""} className="input" /></Field>
            <Field label="Duration (months)"><input name="durationMonths" type="number" min={0} defaultValue={o?.durationMonths ?? ""} className="input" /></Field>
            <Field label="EMD / bid security"><input name="emdAmount" inputMode="decimal" defaultValue={o?.emdAmount ? num(o.emdAmount) : ""} className="input" /></Field>
            <Field label="Evaluation method"><input name="evaluationMethod" defaultValue={o?.evaluationMethod ?? ""} className="input" placeholder="QCBS, LCS, QBS…" /></Field>
            <Field label="Technical weight %"><input name="technicalWeight" type="number" min={0} max={100} defaultValue={o?.technicalWeight ?? ""} className="input" /></Field>
            <Field label="Financial weight %"><input name="financialWeight" type="number" min={0} max={100} defaultValue={o?.financialWeight ?? ""} className="input" /></Field>
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-sm font-semibold text-plum">Requirements</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Scope summary"><textarea name="scopeSummary" rows={5} defaultValue={o?.scopeSummary ?? ""} className="input" /></Field>
            <Field label="Eligibility / qualification criteria"><textarea name="eligibility" rows={5} defaultValue={o?.eligibility ?? ""} className="input" /></Field>
            <Field label="Documents to submit" hint="One per line — shown as a checklist."><textarea name="requiredDocuments" rows={5} defaultValue={o?.requiredDocuments ?? ""} className="input" placeholder={"Technical proposal\nFinancial proposal\nCVs of key experts\nCompany registration certificate"} /></Field>
            <Field label="Internal notes"><textarea name="notes" rows={5} defaultValue={o?.notes ?? ""} className="input" /></Field>
            <Field label="Alert emails" hint="Comma-separated. Deadline reminders go here + the owner." className="lg:col-span-2"><input name="alertEmails" defaultValue={o?.alertEmails ?? ""} className="input" placeholder="bids@filoi.in, akash@filoi.in" /></Field>
          </div>
        </section>
      </div>
      <FormFooter label={o ? "Save changes" : "Create proposal"} cancel={cancel} />
    </ActionForm>
  );
}
