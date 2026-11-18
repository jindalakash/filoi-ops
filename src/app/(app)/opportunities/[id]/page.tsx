import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader, Card, KV, Notice } from "@/components/ui";
import { StatusBadge, OPP_STATUS, DueDate } from "@/components/badges";
import { AutoSelect, ConfirmAction } from "@/components/client";
import { Documents } from "@/components/Documents";
import { ActivityFeed } from "@/components/ActivityFeed";
import { setOpportunityStatus, convertToProject, deleteOpportunity } from "@/app/actions/opportunities";
import { Amt } from "@/components/Money";
import { date, splitEmails } from "@/lib/format";
import { aiReady } from "@/lib/ai/run";
import { IntakeUploader } from "@/components/IntakeUploader";
import { analyzeTender } from "@/app/actions/intake";
import { Sparkles } from "lucide-react";

export default async function OpportunityPage({ params }: PageProps<"/opportunities/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const o = await db.opportunity.findUnique({
    where: { id },
    include: { client: true, owner: true, project: true, documents: { include: { uploadedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } } },
  });
  if (!o) notFound();
  const edit = can(user.role, "presales");
  const ready = edit && (await aiReady());
  const tenderDocs = o.documents.filter((d) => d.category === "TOR" || d.category === "RFP");
  const docsNeeded = (o.requiredDocuments ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <>
      <PageHeader
        back={{ href: "/opportunities", label: "Proposals" }}
        title={o.title}
        subtitle={<span className="flex flex-wrap items-center gap-2">{o.code} · <Link className="link" href={`/clients/${o.clientId}`}>{o.client.name}</Link> <StatusBadge map={OPP_STATUS} value={o.status} /></span>}
        actions={edit && <>
          <AutoSelect action={setOpportunityStatus} name="status" value={o.status} hidden={{ id }} className="!py-2 !text-sm"
            options={Object.entries(OPP_STATUS).map(([value, s]) => ({ value, label: `Status: ${s.label}` }))} />
          <Link href={`/opportunities/${id}/edit`} className="btn-ghost">Edit</Link>
          <ConfirmAction action={deleteOpportunity} fields={{ id }} label="Delete" confirm="Delete this proposal and its files?" className="btn-danger" />
        </>}
      />

      {o.project ? (
        <div className="mb-6"><Notice tone="ok">Contract won 🎉 — managed as project <Link className="link" href={`/projects/${o.project.id}`}>{o.project.code}</Link>.</Notice></div>
      ) : o.status === "WON" && can(user.role, "projects") ? (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-emerald-900"><b>This proposal is won.</b> Create the project to start tracking deliverables, billing and reminders. Details carry over.</div>
          <ConfirmAction action={convertToProject} fields={{ id }} label="Create project →" confirm="Create a project from this proposal?" className="btn-primary" />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Key information">
            <KV items={[
              ["Submission deadline", <DueDate key="d" value={o.submissionDeadline} done={!["DRAFT", "IN_REVIEW"].includes(o.status)} />],
              ["Deadline time", o.submissionDeadline ? o.submissionDeadline.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"],
              ["Query deadline", date(o.queryDeadline)],
              ["Pre-bid meeting", date(o.preBidDate)],
              ["Reference no.", o.referenceNo],
              ["Source", o.source],
              ["Proposed value", o.estimatedValue ? <Amt key="v" v={o.estimatedValue} c={o.currency} /> : "—"],
              ["Duration", o.durationMonths ? `${o.durationMonths} months` : "—"],
              ["EMD / bid security", o.emdAmount ? <Amt key="e" v={o.emdAmount} c={o.currency} /> : "—"],
              ["Evaluation", [o.evaluationMethod, o.technicalWeight != null && `${o.technicalWeight}:${o.financialWeight ?? 100 - o.technicalWeight}`].filter(Boolean).join(" · ") || "—"],
              ["Owner", o.owner?.name],
              ["Submitted on", date(o.submittedAt)],
            ]} />
          </Card>
          {(o.scopeSummary || o.eligibility) && (
            <Card title="Scope & eligibility">
              <div className="grid gap-6 md:grid-cols-2">
                <div><div className="label">Scope</div><p className="whitespace-pre-line text-sm">{o.scopeSummary || "—"}</p></div>
                <div><div className="label">Eligibility</div><p className="whitespace-pre-line text-sm">{o.eligibility || "—"}</p></div>
              </div>
            </Card>
          )}
          <Documents docs={o.documents} link={{ opportunityId: id }} path={`/opportunities/${id}`} defaultCategory="TOR"
            categories={["TOR", "RFP", "TECHNICAL_PROPOSAL", "FINANCIAL_PROPOSAL", "CORRESPONDENCE", "CONTRACT", "OTHER"]}
            title="TOR, RFP & proposal files" />
        </div>
        <div className="space-y-6">
          {ready && (
            <Card title={<span className="flex items-center gap-2"><Sparkles size={16} className="text-plum" /> Read the tender with AI</span>}>
              <p className="mb-3 text-sm text-ink-soft">Fills in empty fields (deadlines, scope, eligibility, documents to submit) for you to review.</p>
              <IntakeUploader action={analyzeTender} hidden={{ opportunityId: id }} existing={tenderDocs.map((d) => ({ id: d.id, fileName: d.fileName }))} label="Read with AI" />
            </Card>
          )}
          <Card title="Submission checklist">
            {docsNeeded.length === 0 ? <p className="text-sm text-ink-soft">Add “Documents to submit” in Edit to build a checklist.</p> : (
              <ul className="space-y-2">
                {docsNeeded.map((d, i) => <li key={i} className="flex items-start gap-2 text-sm"><span className="text-plum">•</span>{d}</li>)}
              </ul>
            )}
          </Card>
          <Card title="Alerts">
            <p className="text-sm text-ink-soft">Deadline reminders go to:</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...new Set([...splitEmails(o.alertEmails), ...(o.owner ? [o.owner.email] : [])])].map((e) => <span key={e} className="rounded-full bg-mist px-2 py-0.5 text-xs">{e}</span>)}
            </div>
          </Card>
          {o.notes && <Card title="Notes"><p className="whitespace-pre-line text-sm">{o.notes}</p></Card>}
          <ActivityFeed entities={[{ entity: "opportunity", ids: [id] }]} />
        </div>
      </div>
    </>
  );
}
