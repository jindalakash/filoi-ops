import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { aiReady } from "@/lib/ai/run";
import { PageHeader, Card, Tabs, Empty, Field } from "@/components/ui";
import { Badge } from "@/components/badges";
import { ActionForm, ConfirmAction, Disclosure, SubmitButton } from "@/components/client";
import { CurrencySelect } from "@/components/forms";
import { Amt } from "@/components/Money";
import { uploadLibrary, deleteLibraryItem, importTemplatesBank, saveReference, deleteReference, referencesFromProjects } from "@/app/actions/library";
import { date, inputDate, num } from "@/lib/format";
import { FileText, Download, FolderInput } from "lucide-react";
import type { Reference } from "@prisma/client";
import { KIND_LABEL } from "@/lib/proposal-meta";

export const metadata = { title: "Library" };

function ReferenceForm({ r }: { r?: Reference }) {
  return (
    <ActionForm action={saveReference} resetOnOk={!r} className="rounded-xl border border-line bg-mist/50 p-4">
      {r && <input type="hidden" name="id" value={r.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Assignment *" className="sm:col-span-2"><input name="title" required defaultValue={r?.title} className="input" /></Field>
        <Field label="Client *"><input name="client" required defaultValue={r?.client} className="input" /></Field>
        <Field label="Country"><input name="country" defaultValue={r?.country ?? ""} className="input" /></Field>
        <Field label="Start"><input type="date" name="startDate" defaultValue={inputDate(r?.startDate)} className="input" /></Field>
        <Field label="End"><input type="date" name="endDate" defaultValue={inputDate(r?.endDate)} className="input" /></Field>
        <Field label="Value"><input name="value" inputMode="decimal" defaultValue={r?.value ? num(r.value) : ""} className="input" /></Field>
        <Field label="Currency"><CurrencySelect value={r?.currency} /></Field>
        <Field label="Description" className="sm:col-span-2"><textarea name="description" rows={3} defaultValue={r?.description ?? ""} className="input" /></Field>
        <Field label="Services provided" className="sm:col-span-2"><textarea name="services" rows={3} defaultValue={r?.services ?? ""} className="input" /></Field>
      </div>
      <div className="mt-3 flex justify-end"><SubmitButton className="btn-dark btn-sm">{r ? "Save" : "Add reference"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "presales") && !can(user.role, "finance")) return <Empty title="No access">Ask an admin for access to the library.</Empty>;
  const { tab = "docs", q } = await searchParams;
  const [items, experts, refs, ready] = await Promise.all([
    db.libraryItem.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, kind: true, title: true, fileName: true, size: true, tags: true, createdAt: true, source: true, textContent: false } }),
    db.expert.findMany({
      where: { active: true, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { expertise: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }] } : {}) },
      orderBy: { name: "asc" },
    }),
    db.reference.findMany({ orderBy: [{ endDate: { sort: "desc", nulls: "first" } }] }),
    aiReady(),
  ]);
  const tabs = [
    { key: "docs", label: "Past proposals & documents", href: "?tab=docs", count: items.length },
    { key: "experts", label: "CV bank", href: "?tab=experts", count: experts.length },
    { key: "references", label: "Experience", href: "?tab=references", count: refs.length },
  ];
  return (
    <>
      <PageHeader title="Library" subtitle="Your reusable proposal material — past proposals, CVs and project references. AI uses it when drafting."
        actions={<ActionForm action={importTemplatesBank}><SubmitButton className="btn-ghost" pendingText="Importing…"><FolderInput size={16} /> Import from templates-bank folder</SubmitButton></ActionForm>} />
      <Tabs tabs={tabs} active={tab} />

      {tab === "docs" && (
        <div className="space-y-6">
          <Card title="Add documents">
            <ActionForm action={uploadLibrary} resetOnOk className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <Field label="Type" className="lg:w-64"><select name="kind" className="input">{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="Tags" className="lg:w-56"><input name="tags" className="input" placeholder="WHO, DHIS2, evaluation" /></Field>
              <Field label="Files" className="flex-1"><input type="file" name="files" multiple required accept=".pdf,.docx,.xlsx,.txt,.md" className="input" /></Field>
              <SubmitButton className="btn-dark" pendingText="Uploading…">Upload</SubmitButton>
            </ActionForm>
            <p className="mt-2 text-xs text-ink-soft">Word and PDF text is read so AI can learn your style. Excel budgets are stored for reference.</p>
          </Card>
          <Card pad={false}>
            {items.length === 0 ? <Empty title="No documents yet">Upload past winning proposals and your company profile — or drop them in the <b>templates-bank</b> folder and click Import.</Empty> : (
              <ul className="divide-y divide-line">
                {items.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 px-5 py-3">
                    <FileText size={20} className="shrink-0 text-ink-soft" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{it.title}</div>
                      <div className="text-xs text-ink-soft">{it.fileName} · {date(it.createdAt)}{it.tags && ` · ${it.tags}`}{it.source === "templates-bank" && " · imported"}</div>
                    </div>
                    <Badge tone={it.kind === "PAST_PROPOSAL" ? "purple" : it.kind === "FIN_TEMPLATE" ? "green" : "navy"}>{KIND_LABEL[it.kind]}</Badge>
                    <a href={`/api/library/${it.id}`} className="rounded-md p-1.5 text-ink-soft hover:bg-mist" title="Download"><Download size={16} /></a>
                    <ConfirmAction action={deleteLibraryItem} fields={{ id: it.id }} label="✕" confirm={`Remove ${it.title} from the library?`} className="rounded-md px-2 py-1 text-xs text-ink-soft hover:bg-red-50 hover:text-red-700" />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === "experts" && (
        <Card pad={false}>
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
            <form className="flex-1"><input type="hidden" name="tab" value="experts" /><input name="q" defaultValue={q} placeholder="Search name, title or expertise (e.g. DHIS2)…" className="input max-w-md" /></form>
            <Link href="/library/experts/new" className="btn-primary btn-sm">+ Add expert</Link>
          </div>
          {experts.length === 0 ? <Empty title="No experts yet">Add team members and associates with their CVs. {ready && "AI can read each CV and fill in the profile."}</Empty> : (
            <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
              {experts.map((e) => (
                <Link key={e.id} href={`/library/experts/${e.id}`} className="card p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="truncate font-display font-semibold">{e.name}</div><div className="truncate text-sm text-ink-soft">{e.title ?? "—"}</div></div>
                    {e.isStaff ? <Badge tone="purple">Staff</Badge> : <Badge>Associate</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">{(e.expertise ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6).map((t) => <span key={t} className="rounded-full bg-mist px-2 py-0.5 text-xs">{t}</span>)}</div>
                  <div className="mt-3 flex justify-between text-xs text-ink-soft"><span>{e.yearsExperience != null ? `${e.yearsExperience} yrs` : ""}{e.nationality ? ` · ${e.nationality}` : ""}</span><span>{e.dailyRate ? <Amt v={e.dailyRate} c={e.rateCurrency} /> : ""}{e.dailyRate ? "/day" : ""}</span></div>
                  {!e.summary && e.cvFileName && <div className="mt-2 text-xs text-amber-700">CV uploaded — profile not filled yet</div>}
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "references" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Disclosure label="+ Add reference" className="btn-primary btn-sm"><ReferenceForm /></Disclosure>
            <ActionForm action={referencesFromProjects}><SubmitButton className="btn-ghost btn-sm" pendingText="…">Add from my projects</SubmitButton></ActionForm>
          </div>
          <Card pad={false}>
            {refs.length === 0 ? <Empty title="No references yet">Past assignments you can cite as experience in proposals.</Empty> : (
              <ul className="divide-y divide-line">
                {refs.map((r) => (
                  <li key={r.id} className="px-5 py-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-semibold">{r.title}</div>
                        <div className="text-sm text-ink-soft">{r.client}{r.country && ` · ${r.country}`} · {r.startDate ? r.startDate.getFullYear() : "?"}–{r.endDate ? r.endDate.getFullYear() : "ongoing"}</div>
                        {r.description && <p className="mt-1 line-clamp-2 text-sm">{r.description}</p>}
                      </div>
                      <div className="shrink-0 text-sm">{r.value ? <Amt v={r.value} c={r.currency} compact /> : null}</div>
                    </div>
                    <div className="mt-2 flex gap-4">
                      <Disclosure label="Edit" className="text-xs font-semibold text-sky hover:underline"><ReferenceForm r={r} /></Disclosure>
                      <ConfirmAction action={deleteReference} fields={{ id: r.id }} label="Remove" confirm="Remove this reference?" className="text-xs font-semibold text-ink-soft hover:text-red-700" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
