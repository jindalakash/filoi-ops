import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { loadIntake } from "@/lib/ai/intake";
import type { ContractExtraction } from "@/lib/ai/schemas";
import { dashes } from "@/lib/ai/prefill";
import { PageHeader, Card, Notice } from "@/components/ui";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/client";
import { AiEvidence } from "@/components/AiEvidence";
import { options } from "@/lib/custom";
import { applyContract, discardExtraction } from "@/app/actions/intake";
import { CURRENCIES, date, money, num } from "@/lib/format";

export const metadata = { title: "Review contract reading" };

const okDate = (raw?: string | null) => { const s = dashes(raw); return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ""; };

export default async function ContractIntake({ params }: PageProps<"/projects/[id]/intake/[xid]">) {
  const user = await requireUser("projects");
  const { id, xid } = await params;
  const [p, x, dlTypes] = await Promise.all([
    db.project.findUnique({ where: { id }, include: { deliverables: { select: { id: true, title: true } } } }),
    loadIntake<ContractExtraction>(xid, "CONTRACT"),
    options("deliverableType"),
  ]);
  if (!p || !x || x.projectId !== id) notFound();
  const c = x.data;
  const fin = can(user.role, "finance");
  const cur = c.currency && (CURRENCIES as readonly string[]).includes(c.currency) ? c.currency : p.currency;
  const dlIndex = (title: string | null) => (title ? c.deliverables.findIndex((d) => d.title.trim().toLowerCase() === title.trim().toLowerCase()) : -1);
  const fields: { key: string; label: string; current: string; value: string; input: React.ReactNode; show: boolean }[] = [
    { key: "contractNo", label: "Contract / PO no.", current: p.contractNo ?? "—", value: c.contract_no ?? "", input: <input name="contractNo" defaultValue={c.contract_no ?? ""} className="input" />, show: !!c.contract_no },
    { key: "contractDate", label: "Contract date", current: date(p.contractDate), value: okDate(c.contract_date), input: <input type="date" name="contractDate" defaultValue={okDate(c.contract_date)} className="input" />, show: !!okDate(c.contract_date) },
    { key: "contractValue", label: "Contract value", current: money(p.contractValue, p.currency), value: String(c.contract_value ?? ""), input: <input name="contractValue" defaultValue={c.contract_value ?? ""} className="input" />, show: fin && c.contract_value != null },
    { key: "currency", label: "Currency", current: p.currency, value: cur, input: <select name="currency" defaultValue={cur} className="input">{CURRENCIES.map((x) => <option key={x}>{x}</option>)}</select>, show: !!c.currency && cur !== p.currency },
    { key: "startDate", label: "Start date", current: date(p.startDate), value: okDate(c.start_date), input: <input type="date" name="startDate" defaultValue={okDate(c.start_date)} className="input" />, show: !!okDate(c.start_date) },
    { key: "endDate", label: "End date", current: date(p.endDate), value: okDate(c.end_date), input: <input type="date" name="endDate" defaultValue={okDate(c.end_date)} className="input" />, show: !!okDate(c.end_date) },
  ];
  const notes = [c.penalties && `Penalties / LDs: ${c.penalties}`, ...c.notes].filter(Boolean).join("\n");

  return (
    <>
      <PageHeader title="Review the contract reading" subtitle={`${p.code} · ${p.title}`} back={{ href: `/projects/${id}?tab=documents`, label: p.code }}
        actions={<ConfirmAction action={discardExtraction} fields={{ id: x.id }} label="Discard" confirm="Discard this AI reading? Nothing will be changed." className="btn-ghost" />} />
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <ActionForm action={applyContract} className="space-y-6 xl:col-span-2">
          <input type="hidden" name="extractionId" value={x.id} />
          <input type="hidden" name="dlCount" value={c.deliverables.length} />
          <input type="hidden" name="msCount" value={c.payment_schedule.length} />

          {fields.some((f) => f.show) && (
            <Card title="Contract details" pad={false}>
              <div className="overflow-x-auto"><table className="table">
                <thead><tr><th className="w-10">Use</th><th>Field</th><th>Now</th><th className="min-w-56">From contract</th></tr></thead>
                <tbody>{fields.filter((f) => f.show).map((f) => (
                  <tr key={f.key}>
                    <td><input type="checkbox" name={`apply_${f.key}`} defaultChecked={f.current === "—" || f.key !== "contractValue" || num(p.contractValue) === 0} className="h-4 w-4 accent-plum" /></td>
                    <td className="font-semibold">{f.label}</td><td className="text-ink-soft">{f.current}</td><td>{f.input}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </Card>
          )}

          <Card title={`Deliverables (${c.deliverables.length})`} pad={false}>
            {c.deliverables.length === 0 ? <p className="p-5 text-sm text-ink-soft">No deliverables found in the document.</p> : (
              <div className="overflow-x-auto"><table className="table">
                <thead><tr><th className="w-10">Add</th><th className="min-w-64">Deliverable</th><th>Type</th><th>Due date</th></tr></thead>
                <tbody>{c.deliverables.map((d, i) => (
                  <tr key={i}>
                    <td><input type="checkbox" name={`dl_include_${i}`} defaultChecked className="h-4 w-4 accent-plum" /></td>
                    <td>
                      <input name={`dl_title_${i}`} defaultValue={d.title} className="input font-semibold" />
                      <textarea name={`dl_desc_${i}`} defaultValue={d.description ?? ""} rows={2} className="input mt-1.5 text-xs" placeholder="Description / acceptance criteria" />
                    </td>
                    <td><select name={`dl_type_${i}`} defaultValue={d.type} className="input min-w-36">{dlTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></td>
                    <td><input type="date" name={`dl_due_${i}`} defaultValue={okDate(d.due_date)} className="input min-w-36" />{d.timing && <div className="mt-1 text-xs text-ink-soft">“{d.timing}”</div>}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>

          <Card title={`Payment schedule (${c.payment_schedule.length})`} pad={false}>
            {!fin ? <p className="p-5 text-sm text-ink-soft">Billing milestones are created by Admin or Accounts users. The payment terms found are shown for reference.</p> : null}
            {c.payment_schedule.length === 0 ? <p className="p-5 text-sm text-ink-soft">No payment schedule found in the document.</p> : (
              <div className="overflow-x-auto"><table className="table">
                <thead><tr>{fin && <th className="w-10">Add</th>}<th className="min-w-56">Milestone</th><th>%</th><th>Amount ({cur})</th><th>Invoice date</th><th>Linked deliverable</th></tr></thead>
                <tbody>{c.payment_schedule.map((m, i) => {
                  const amount = m.amount ?? (m.percent != null && c.contract_value ? Math.round(c.contract_value * m.percent) / 100 : null);
                  const li = dlIndex(m.deliverable_title);
                  return (
                    <tr key={i}>
                      {fin && <td><input type="checkbox" name={`ms_include_${i}`} defaultChecked={amount != null} className="h-4 w-4 accent-plum" /></td>}
                      <td><input name={`ms_title_${i}`} defaultValue={m.title} className="input" disabled={!fin} /></td>
                      <td><input name={`ms_percent_${i}`} defaultValue={m.percent ?? ""} className="input w-20" disabled={!fin} /></td>
                      <td><input name={`ms_amount_${i}`} defaultValue={amount ?? ""} className="input min-w-28" disabled={!fin} /></td>
                      <td><input type="date" name={`ms_due_${i}`} defaultValue={okDate(m.due_date) || okDate(li >= 0 ? c.deliverables[li].due_date : null)} className="input min-w-36" disabled={!fin} /></td>
                      <td>
                        <select name={`ms_dl_${i}`} defaultValue={li >= 0 ? `new:${li}` : ""} className="input min-w-44" disabled={!fin}>
                          <option value="">— none —</option>
                          <optgroup label="From this contract">{c.deliverables.map((d, j) => <option key={j} value={`new:${j}`}>{d.title}</option>)}</optgroup>
                          {p.deliverables.length > 0 && <optgroup label="Already in project">{p.deliverables.map((d) => <option key={d.id} value={`id:${d.id}`}>{d.title}</option>)}</optgroup>}
                        </select>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </Card>

          {notes && (
            <Card title="Other terms">
              <p className="whitespace-pre-line text-sm">{notes}</p>
              <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" name="apply_notes" className="h-4 w-4 accent-plum" /> Add these to the project description</label>
              <input type="hidden" name="notes" value={notes} />
            </Card>
          )}

          {p.deliverables.length > 0 && <Notice tone="warn">This project already has {p.deliverables.length} deliverable(s). Untick anything that would duplicate them.</Notice>}
          <div className="flex justify-end gap-2"><SubmitButton pendingText="Creating…">Create selected items</SubmitButton></div>
        </ActionForm>
        <div className="xl:sticky xl:top-6"><AiEvidence evidence={c.evidence} model={x.model} files={x.files} /></div>
      </div>
    </>
  );
}
