import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { proposalAccess } from "@/lib/permissions-proposal";
import { aiReady } from "@/lib/ai/run";
import { getFx } from "@/components/Money";
import { PageHeader, Card, Tabs, Empty, Field, Notice } from "@/components/ui";
import { Badge, StatusBadge, OPP_STATUS } from "@/components/badges";
import { ActionForm, ConfirmAction, Disclosure, SubmitButton } from "@/components/client";
import { SectionEditor } from "@/components/SectionEditor";
import { FinancialEditor } from "@/components/FinancialEditor";
import { Amt } from "@/components/Money";
import { addStandardSections, addSection, addTeamMember, updateTeamMember, removeTeamMember, toggleReference } from "@/app/actions/proposal";
import { num } from "@/lib/format";
import { FileDown } from "lucide-react";

export default async function Workspace({ params, searchParams }: PageProps<"/opportunities/[id]/workspace">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "sections";
  const o = await db.opportunity.findUnique({
    where: { id },
    include: {
      client: true,
      sections: { orderBy: [{ seq: "asc" }, { createdAt: "asc" }] },
      team: { include: { expert: true }, orderBy: { seq: "asc" } },
      refs: { select: { referenceId: true } },
      finLines: { orderBy: { seq: "asc" } },
    },
  });
  if (!o) notFound();
  const access = await proposalAccess(user, id);
  const [ai, experts, references, fx] = await Promise.all([
    aiReady(),
    tab === "team" ? db.expert.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    tab === "references" ? db.reference.findMany({ orderBy: [{ endDate: { sort: "desc", nulls: "first" } }] }) : Promise.resolve([]),
    getFx(),
  ]);
  const written = o.sections.filter((s) => s.content.trim()).length;
  const finTotal = o.finLines.reduce((a, l) => a + num(l.quantity) * num(l.rate), 0) * (1 + num(o.finTaxRate) / 100);
  // positions suggested from "Key experts required" in the proposal notes (filled by AI from the TOR)
  const expertsBlock = (o.notes ?? "").split(/\n\s*\n/).find((b) => /^key experts/i.test(b.trim())) ?? "";
  const positions = expertsBlock.split("\n").filter((l) => /^\s*[-•*]/.test(l)).map((l) => l.replace(/^\s*[-•*]\s*/, "").split(/\s[–-]\s|:/)[0].trim()).filter((l) => l.length > 3 && l.length < 60);
  const selectedRefs = new Set(o.refs.map((r) => r.referenceId));

  const tabs = [
    { key: "sections", label: "Technical proposal", href: "?tab=sections", count: o.sections.length },
    { key: "team", label: "Team", href: "?tab=team", count: o.team.length },
    { key: "references", label: "Experience", href: "?tab=references", count: o.refs.length },
    { key: "financial", label: "Financial proposal", href: "?tab=financial" },
    { key: "export", label: "Export", href: "?tab=export" },
  ];

  return (
    <>
      <PageHeader back={{ href: `/opportunities/${id}`, label: o.code }} title="Proposal workspace"
        subtitle={<span className="flex flex-wrap items-center gap-2">{o.title} · {o.client.shortName || o.client.name} <StatusBadge map={OPP_STATUS} value={o.status} /></span>}
        actions={<>
          <a href={`/api/proposals/${id}/technical`} className="btn-dark"><FileDown size={16} /> Technical .docx</a>
          <a href={`/api/proposals/${id}/financial`} className="btn-ghost"><FileDown size={16} /> Financial .docx</a>
        </>} />

      <div className="mb-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="card px-4 py-3"><div className="text-xs text-ink-soft">Sections written</div><div className="font-display text-lg font-semibold">{written}/{o.sections.length}</div></div>
        <div className="card px-4 py-3"><div className="text-xs text-ink-soft">Team</div><div className="font-display text-lg font-semibold">{o.team.length} expert{o.team.length === 1 ? "" : "s"}</div></div>
        <div className="card px-4 py-3"><div className="text-xs text-ink-soft">References</div><div className="font-display text-lg font-semibold">{o.refs.length}</div></div>
        <div className="card px-4 py-3"><div className="text-xs text-ink-soft">Financial total</div><div className="font-display text-lg font-semibold"><Amt v={finTotal} c={o.currency} compact /></div></div>
      </div>

      <Tabs tabs={tabs} active={tab} />

      {tab === "sections" && (
        <div className="space-y-5">
          {!ai && access.technical && <Notice>Turn on AI in Settings → AI to draft sections from the TOR and your library.</Notice>}
          {o.sections.length === 0 ? (
            <Card><Empty title="No sections yet">Start with the standard structure most UN / development-bank evaluators expect, or add your own.</Empty></Card>
          ) : o.sections.map((s, i) => <SectionEditor key={s.id} s={s} index={i} editable={access.technical} ai={ai} />)}
          {access.technical && (
            <div className="flex flex-wrap items-start gap-2">
              <ActionForm action={addStandardSections}><input type="hidden" name="opportunityId" value={id} /><SubmitButton className="btn-primary btn-sm">+ Standard sections</SubmitButton></ActionForm>
              <Disclosure label="+ Custom section" className="btn-ghost btn-sm">
                <ActionForm action={addSection} resetOnOk className="flex flex-col gap-2 rounded-xl border border-line bg-mist/50 p-4 sm:flex-row sm:items-end">
                  <input type="hidden" name="opportunityId" value={id} />
                  <Field label="Title" className="flex-1"><input name="title" required className="input" placeholder="e.g. Gender and inclusion" /></Field>
                  <Field label="Should cover" className="flex-1"><input name="guidance" className="input" /></Field>
                  <SubmitButton className="btn-dark btn-sm">Add</SubmitButton>
                </ActionForm>
              </Disclosure>
            </div>
          )}
        </div>
      )}

      {tab === "team" && (
        <Card pad={false}>
          {o.team.length === 0 ? <Empty title="No team yet">Pick experts from the CV bank for each position the TOR asks for.</Empty> : (
            <ul className="divide-y divide-line">
              {o.team.map((m) => (
                <li key={m.id} className="px-5 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{m.position} {m.isKey ? <Badge tone="purple">Key expert</Badge> : <Badge>Non-key</Badge>}</div>
                      <div className="text-sm"><Link href={`/library/experts/${m.expert.id}`} className="link">{m.expert.name}</Link> <span className="text-ink-soft">· {m.expert.title ?? ""}{m.expert.yearsExperience != null && ` · ${m.expert.yearsExperience} yrs`}</span></div>
                    </div>
                    <div className="text-sm text-ink-soft">{m.inputDays ? `${num(m.inputDays)} days` : "days not set"}{m.expert.dailyRate ? <> · <Amt v={m.expert.dailyRate} c={m.expert.rateCurrency} />/day</> : ""}</div>
                    {access.technical && <ConfirmAction action={removeTeamMember} fields={{ id: m.id }} label="Remove" confirm={`Remove ${m.expert.name} from the team?`} className="btn-ghost btn-sm" />}
                  </div>
                  {access.technical && (
                    <Disclosure label="Edit" className="mt-1 text-xs font-semibold text-sky hover:underline">
                      <ActionForm action={updateTeamMember} className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-mist/50 p-3">
                        <input type="hidden" name="id" value={m.id} />
                        <Field label="Position" className="flex-1"><input name="position" defaultValue={m.position} className="input" /></Field>
                        <Field label="Days"><input name="inputDays" inputMode="decimal" defaultValue={m.inputDays ? num(m.inputDays) : ""} className="input w-24" /></Field>
                        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="isKey" defaultChecked={m.isKey} className="h-4 w-4 accent-plum" /> Key</label>
                        <SubmitButton className="btn-dark btn-sm">Save</SubmitButton>
                      </ActionForm>
                    </Disclosure>
                  )}
                </li>
              ))}
            </ul>
          )}
          {access.technical && (
            <div className="border-t border-line p-4">
              {experts.length === 0 ? <p className="text-sm text-ink-soft">Your CV bank is empty. <Link className="link" href="/library/experts/new">Add experts</Link> first.</p> : (
                <ActionForm action={addTeamMember} resetOnOk className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
                  <input type="hidden" name="opportunityId" value={id} />
                  <Field label="Position *" className="lg:col-span-2">
                    <input name="position" required className="input" list="positions" placeholder="Team Leader" />
                    <datalist id="positions">{positions.map((p) => <option key={p} value={p} />)}</datalist>
                  </Field>
                  <Field label="Expert *">
                    <select name="expertId" required className="input" defaultValue=""><option value="" disabled>Choose…</option>{experts.map((e) => <option key={e.id} value={e.id}>{e.name}{e.title ? ` — ${e.title}` : ""}</option>)}</select>
                  </Field>
                  <Field label="Days"><input name="inputDays" inputMode="decimal" className="input" /></Field>
                  <div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isKey" defaultChecked className="h-4 w-4 accent-plum" /> Key</label><SubmitButton className="btn-primary btn-sm">Add to team</SubmitButton></div>
                </ActionForm>
              )}
            </div>
          )}
        </Card>
      )}

      {tab === "references" && (
        <Card pad={false}>
          {references.length === 0 ? <Empty title="Experience bank is empty"><Link className="link" href="/library?tab=references">Add past assignments</Link> to cite them here.</Empty> : (
            <ul className="divide-y divide-line">
              {[...references].sort((a, b) => Number(selectedRefs.has(b.id)) - Number(selectedRefs.has(a.id))).map((r) => {
                const on = selectedRefs.has(r.id);
                return (
                  <li key={r.id} className={`flex items-start gap-3 px-5 py-3 ${on ? "bg-emerald-50/50" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{r.title}</div>
                      <div className="text-sm text-ink-soft">{r.client}{r.country && ` · ${r.country}`} · {r.startDate?.getFullYear() ?? "?"}–{r.endDate?.getFullYear() ?? "ongoing"}{r.value && <> · <Amt v={r.value} c={r.currency} compact /></>}</div>
                    </div>
                    {access.technical ? (
                      <ActionForm action={toggleReference}><input type="hidden" name="opportunityId" value={id} /><input type="hidden" name="referenceId" value={r.id} />
                        <SubmitButton className={on ? "btn-ghost btn-sm" : "btn-primary btn-sm"} pendingText="…">{on ? "✓ Included" : "Include"}</SubmitButton>
                      </ActionForm>
                    ) : on && <Badge tone="green">Included</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === "financial" && (
        <Card>
          <FinancialEditor
            opportunityId={id}
            editable={access.financial}
            currency={o.currency}
            taxRate={num(o.finTaxRate)}
            notes={o.finNotes ?? ""}
            fx={fx}
            initial={o.finLines.map((l) => ({ category: l.category, description: l.description, expertId: l.expertId, unit: l.unit, quantity: num(l.quantity), rate: num(l.rate) }))}
            team={o.team.map((m) => ({ expertId: m.expertId, name: m.expert.name, position: m.position, days: m.inputDays ? num(m.inputDays) : null, rate: m.expert.dailyRate ? num(m.expert.dailyRate) : null, rateCurrency: m.expert.rateCurrency }))}
          />
        </Card>
      )}

      {tab === "export" && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card title="Technical proposal (.docx)">
            <ul className="mb-4 space-y-1.5 text-sm">
              <li>{written === o.sections.length && written > 0 ? "✅" : "⚠️"} {written}/{o.sections.length} sections written</li>
              <li>{o.team.length ? "✅" : "⚠️"} {o.team.length} team member(s) — table + expert summaries</li>
              <li>{o.refs.length ? "✅" : "⚠️"} {o.refs.length} reference(s)</li>
            </ul>
            <a href={`/api/proposals/${id}/technical`} className="btn-dark"><FileDown size={16} /> Download technical proposal</a>
          </Card>
          <Card title="Financial proposal (.docx)">
            <ul className="mb-4 space-y-1.5 text-sm">
              <li>{o.finLines.length ? "✅" : "⚠️"} {o.finLines.length} cost line(s)</li>
              <li>Total: <b><Amt v={finTotal} c={o.currency} /></b></li>
            </ul>
            <a href={`/api/proposals/${id}/financial`} className="btn-dark"><FileDown size={16} /> Download financial proposal</a>
          </Card>
          <div className="md:col-span-2"><Notice>The Word files use Filoi branding with editable headings, tables and page numbers — open them in Word to paste into the client&apos;s mandatory forms or adjust formatting before submission.</Notice></div>
        </div>
      )}
    </>
  );
}
