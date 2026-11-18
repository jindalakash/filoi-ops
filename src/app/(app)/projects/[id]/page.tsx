import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader, Card, KV, Tabs, Stat, Empty, Notice, Progress } from "@/components/ui";
import { StatusBadge, PROJECT_STATUS, DL_STATUS, MS_STATUS, INV_STATUS, DueDate, Badge } from "@/components/badges";
import { AutoSelect, ConfirmAction, Disclosure } from "@/components/client";
import { Documents } from "@/components/Documents";
import { ActivityFeed } from "@/components/ActivityFeed";
import { DeliverableForm, MilestoneForm, DL_TYPES } from "@/components/ProjectParts";
import { setDeliverableStatus, deleteDeliverable, deleteProject } from "@/app/actions/projects";
import { deleteMilestone } from "@/app/actions/finance";
import { Amt } from "@/components/Money";
import { date, num, splitEmails } from "@/lib/format";
import { aiReady } from "@/lib/ai/run";
import { IntakeUploader } from "@/components/IntakeUploader";
import { analyzeContract } from "@/app/actions/intake";
import { Sparkles } from "lucide-react";

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const tab = (typeof sp.tab === "string" ? sp.tab : "deliverables") as string;
  const p = await db.project.findUnique({
    where: { id },
    include: {
      client: true, manager: true, opportunity: true,
      deliverables: { include: { owner: true, milestones: true }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { seq: "asc" }] },
      milestones: { include: { deliverable: true, invoices: { where: { status: { not: "CANCELLED" } } } }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }] },
      invoices: { include: { payments: true }, orderBy: { issueDate: "desc" } },
      documents: { include: { uploadedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!p) notFound();
  const editPM = can(user.role, "projects");
  const fin = can(user.role, "financeView");
  const finEdit = can(user.role, "finance");
  const users = editPM ? await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];

  const ready = editPM && (await aiReady());
  const contractDocs = p.documents.filter((d) => d.category === "CONTRACT" || d.category === "PURCHASE_ORDER");
  const aiCard = ready ? (
    <Card title={<span className="flex items-center gap-2"><Sparkles size={16} className="text-plum" /> Read the contract with AI</span>}>
      <p className="mb-3 text-sm text-ink-soft">Finds deliverables, due dates and the payment schedule. You review everything before it&apos;s added.</p>
      <IntakeUploader action={analyzeContract} hidden={{ projectId: id }} existing={contractDocs.map((d) => ({ id: d.id, fileName: d.fileName }))} label="Read contract" hint="Contract, PO or amendment · PDF, Word .docx or text" />
    </Card>
  ) : null;
  const applied = typeof sp.applied === "string" ? sp.applied.split("-").map(Number) : null;
  const cv = num(p.contractValue);
  const live = p.invoices.filter((i) => i.status !== "CANCELLED" && i.status !== "DRAFT");
  const invoiced = live.reduce((a, i) => a + num(i.subtotal), 0);
  const received = live.reduce((a, i) => a + i.payments.reduce((s, x) => s + num(x.amount) + num(x.tds) + num(x.bankCharges), 0), 0);
  const invoicedGross = live.reduce((a, i) => a + num(i.total), 0);
  const scheduled = p.milestones.reduce((a, m) => a + num(m.amount), 0);
  const dlDone = p.deliverables.filter((d) => d.status === "ACCEPTED").length;
  const typeLabel = Object.fromEntries(DL_TYPES);

  const tabs = [
    { key: "deliverables", label: "Deliverables", href: `?tab=deliverables`, count: p.deliverables.length },
    ...(fin ? [{ key: "billing", label: "Billing & invoices", href: `?tab=billing`, count: p.milestones.length }] : []),
    { key: "documents", label: "Contract & files", href: `?tab=documents`, count: p.documents.length },
    { key: "overview", label: "Details", href: `?tab=overview` },
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/projects", label: "Projects" }}
        title={p.title}
        subtitle={<span className="flex flex-wrap items-center gap-2">{p.code} · <Link className="link" href={`/clients/${p.clientId}`}>{p.client.name}</Link> <StatusBadge map={PROJECT_STATUS} value={p.status} /></span>}
        actions={<>
          {editPM && <Link href={`/projects/${id}/edit`} className="btn-ghost">Edit project</Link>}
          {can(user.role, "admin") && <ConfirmAction action={deleteProject} fields={{ id }} label="Delete" confirm="Delete this project, its deliverables and files?" className="btn-danger" />}
        </>}
      />
      {applied && <div className="mb-5"><Notice tone="ok">Added {applied[0]} deliverable(s) and {applied[1]} billing milestone(s) from the contract.</Notice></div>}
      {sp.created && <div className="mb-5"><Notice tone="ok">Project created from the proposal. Next: upload the contract / PO in <b>Contract & files</b>, then add deliverables and billing milestones.</Notice></div>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Deliverables" value={`${dlDone}/${p.deliverables.length}`} hint="accepted" tone="plum" />
        <Stat label="Ends" value={<span className="text-xl">{date(p.endDate)}</span>} hint={p.startDate ? `Started ${date(p.startDate)}` : undefined} tone="ink" />
        {fin ? <>
          <Stat label="Contract value" value={<Amt v={cv} c={p.currency} compact />} hint={<><Amt v={cv - invoiced} c={p.currency} compact /> yet to invoice</>} tone="sky" />
          <Stat label="Received" value={<Amt v={received} c={p.currency} compact />} hint={<><Amt v={Math.max(0, invoicedGross - received)} c={p.currency} compact /> outstanding</>} tone="green" />
        </> : <>
          <Stat label="Manager" value={<span className="text-base leading-snug">{p.manager?.name ?? "—"}</span>} tone="sky" />
          <Stat label="Contract no." value={<span className="break-all text-base leading-snug">{p.contractNo ?? "—"}</span>} tone="sun" />
        </>}
      </div>

      <Tabs tabs={tabs} active={tab} />

      {tab === "deliverables" && (
        <div className="space-y-4">
          {editPM && (
            <Disclosure label="+ Add deliverable" className="btn-primary">
              <DeliverableForm projectId={id} users={users} withBilling={finEdit} currency={p.currency} />
            </Disclosure>
          )}
          <Card pad={false}>
            {p.deliverables.length === 0 ? <Empty title="No deliverables yet">Add each output from the contract — reports, systems, trainings — with its due date.{ready && <> Or let AI read the contract in <a className="link" href="?tab=documents">Contract &amp; files</a>.</>}</Empty> : (
              <ul className="divide-y divide-line">
                {p.deliverables.map((d) => (
                  <li key={d.id} className="p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{d.title}</span>
                          <Badge tone="navy">{typeLabel[d.type]}</Badge>
                          {fin && d.milestones.map((m) => <Badge key={m.id} tone="purple"><Amt v={m.amount} c={p.currency} compact /></Badge>)}
                        </div>
                        {d.description && <p className="mt-1 text-sm text-ink-soft">{d.description}</p>}
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
                          <span>Due: <DueDate value={d.dueDate} done={d.status === "ACCEPTED"} /></span>
                          <span>Owner: {d.owner?.name ?? "—"}</span>
                          {d.submittedAt && <span>Submitted {date(d.submittedAt)}</span>}
                          {d.acceptedAt && <span>Accepted {date(d.acceptedAt)}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-start gap-2">
                        {editPM ? (
                          <AutoSelect action={setDeliverableStatus} name="status" value={d.status} hidden={{ id: d.id }} options={Object.entries(DL_STATUS).map(([v, s]) => ({ value: v, label: s.label }))} />
                        ) : <StatusBadge map={DL_STATUS} value={d.status} />}
                        {editPM && <ConfirmAction action={deleteDeliverable} fields={{ id: d.id }} label="Delete" confirm={`Delete “${d.title}”?`} className="btn-ghost btn-sm" />}
                      </div>
                    </div>
                    {editPM && (
                      <div className="mt-2">
                        <Disclosure label="Edit" className="text-xs font-semibold text-sky hover:underline">
                          <DeliverableForm projectId={id} d={d} users={users} currency={p.currency} />
                        </Disclosure>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === "billing" && fin && (
        <div className="space-y-6">
          <Card title="Payment schedule" actions={<span className="text-xs text-ink-soft">Scheduled <Amt v={scheduled} c={p.currency} /> of <Amt v={cv} c={p.currency} /></span>}>
            {Math.abs(scheduled - cv) > 0.5 && cv > 0 && (
              <div className="mb-4"><Notice tone="warn">Milestones add up to <Amt v={scheduled} c={p.currency} />, contract value is <Amt v={cv} c={p.currency} /> — difference <Amt v={cv - scheduled} c={p.currency} />.</Notice></div>
            )}
            <div className="mb-4"><Progress value={cv ? (invoiced / cv) * 100 : 0} tone="sky" /><div className="mt-1 text-xs text-ink-soft">{cv ? Math.round((invoiced / cv) * 100) : 0}% invoiced</div></div>
            {p.milestones.length === 0 ? <Empty title="No billing milestones">Add the payment schedule from the contract (e.g. 20% on inception report).</Empty> : (
              <div className="-mx-5 overflow-x-auto">
                <table className="table">
                  <thead><tr><th>Milestone</th><th>Linked deliverable</th><th>Invoice date</th><th className="text-right">Amount</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {p.milestones.map((m) => (
                      <tr key={m.id}>
                        <td className="font-semibold">{m.title}{m.percent && <span className="ml-1 text-xs font-normal text-ink-soft">({num(m.percent)}%)</span>}</td>
                        <td className="text-ink-soft">{m.deliverable?.title ?? "—"}{m.deliverable && <div><StatusBadge map={DL_STATUS} value={m.deliverable.status} /></div>}</td>
                        <td><DueDate value={m.dueDate} done={m.status !== "PLANNED"} /></td>
                        <td className="text-right tabular-nums"><Amt v={m.amount} c={p.currency} /></td>
                        <td><StatusBadge map={MS_STATUS} value={m.status} /></td>
                        <td className="text-right whitespace-nowrap">
                          {finEdit && m.status === "PLANNED" && <Link href={`/finance/invoices/new?milestoneId=${m.id}`} className="btn-primary btn-sm">Raise invoice</Link>}
                          {m.invoices.map((i) => <Link key={i.id} href={`/finance/invoices/${i.id}`} className="link ml-2 text-xs">{i.number}</Link>)}
                          {finEdit && m.status === "PLANNED" && <span className="ml-1"><ConfirmAction action={deleteMilestone} fields={{ id: m.id }} label="✕" confirm="Delete milestone?" className="btn-ghost btn-sm" /></span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {finEdit && <div className="mt-4"><Disclosure label="+ Add billing milestone" className="btn-ghost btn-sm"><MilestoneForm projectId={id} currency={p.currency} deliverables={p.deliverables} /></Disclosure></div>}
          </Card>
          <Card title="Invoices" pad={false} actions={finEdit && <Link href={`/finance/invoices/new?projectId=${id}`} className="btn-ghost btn-sm">+ Ad-hoc invoice</Link>}>
            {p.invoices.length === 0 ? <Empty title="No invoices yet" /> : (
              <div className="overflow-x-auto"><table className="table">
                <thead><tr><th>Number</th><th>Date</th><th>Due</th><th className="text-right">Total</th><th>Status</th></tr></thead>
                <tbody>{p.invoices.map((i) => (
                  <tr key={i.id}><td><Link className="link" href={`/finance/invoices/${i.id}`}>{i.number}</Link></td><td>{date(i.issueDate)}</td>
                    <td><DueDate value={i.dueDate} done={i.status === "PAID" || i.status === "CANCELLED"} /></td>
                    <td className="text-right tabular-nums"><Amt v={i.total} c={i.currency} /></td><td><StatusBadge map={INV_STATUS} value={i.status} /></td></tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-6">
        {aiCard}
        <Documents docs={p.documents} link={{ projectId: id }} path={`/projects/${id}`} defaultCategory="CONTRACT" title="Contract, PO & project files"
          categories={["CONTRACT", "PURCHASE_ORDER", "DELIVERABLE", "INVOICE", "CORRESPONDENCE", "OTHER"]} />
        </div>
      )}

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Project details" className="lg:col-span-2">
            <KV items={[
              ["Contract / PO no.", p.contractNo], ["Contract date", date(p.contractDate)], ["Currency", p.currency],
              ["Start", date(p.startDate)], ["End", date(p.endDate)], ["Project manager", p.manager?.name],
              ["From proposal", p.opportunity ? <Link className="link" href={`/opportunities/${p.opportunity.id}`}>{p.opportunity.code}</Link> : "—"],
              ["Reminder days", p.reminderDays], ["Alert emails", splitEmails(p.alertEmails).join(", ") || "—"],
            ]} />
            {p.description && <div className="mt-5"><div className="label">Scope</div><p className="whitespace-pre-line text-sm">{p.description}</p></div>}
          </Card>
          <ActivityFeed entities={[{ entity: "project", ids: [id] }, { entity: "deliverable", ids: p.deliverables.map((d) => d.id) }, { entity: "milestone", ids: p.milestones.map((m) => m.id) }, { entity: "invoice", ids: p.invoices.map((i) => i.id) }]} />
        </div>
      )}
    </>
  );
}
