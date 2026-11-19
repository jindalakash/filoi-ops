import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fieldsFor } from "@/lib/custom";
import { can } from "@/lib/permissions";
import { aiReady } from "@/lib/ai/run";
import { loadIntake } from "@/lib/ai/intake";
import { tenderPrefill } from "@/lib/ai/prefill";
import type { TenderExtraction } from "@/lib/ai/schemas";
import { PageHeader, Card, Notice } from "@/components/ui";
import { OpportunityForm } from "@/components/OpportunityForm";
import { IntakeUploader } from "@/components/IntakeUploader";
import { AiEvidence } from "@/components/AiEvidence";
import { ConfirmAction } from "@/components/client";
import { analyzeTender, discardExtraction } from "@/app/actions/intake";

export const metadata = { title: "New proposal" };

export default async function NewOpportunity({ searchParams }: { searchParams: Promise<{ intake?: string; manual?: string }> }) {
  const user = await requireUser("presales");
  const propFields = await fieldsFor("PROPOSAL");
  const sp = await searchParams;
  const [clients, users, ready, intake] = await Promise.all([
    db.client.findMany({ select: { id: true, name: true, shortName: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true, role: { in: ["ADMIN", "PROJECT_MANAGER"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    aiReady(),
    loadIntake<TenderExtraction>(sp.intake, "TENDER"),
  ]);

  // Step 2: review what the AI read, then save
  if (intake) {
    const { o, newClient, matchedClient } = tenderPrefill(intake.data, clients);
    return (
      <>
        <PageHeader title="Review the proposal details" subtitle="Pre-filled from the tender by AI. Correct anything that's off, then create the proposal — the documents are attached automatically." back={{ href: "/opportunities", label: "Proposals" }}
          actions={<ConfirmAction action={discardExtraction} fields={{ id: intake.id }} label="Discard & start over" confirm="Discard this AI reading and the uploaded files?" className="btn-ghost" />} />
        <div className="grid items-start gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2"><OpportunityForm o={{ ...o, ownerId: user.id }} clients={clients} users={users} cancel="/opportunities" newClient={newClient} intakeId={intake.id} fields={propFields} /></Card>
          <div className="xl:sticky xl:top-6">
            <AiEvidence evidence={intake.data.evidence} risks={intake.data.risks} model={intake.model} files={intake.files}
              extra={<div className="mt-3 text-sm">{matchedClient ? <>Client matched to <b>{matchedClient.name}</b>.</> : newClient ? <>New client <b>{newClient.name}</b> will be added when you save.</> : null}</div>} />
          </div>
        </div>
      </>
    );
  }

  // Readings started earlier but never saved as a proposal (no new AI cost to continue)
  const unfinished = await db.aiExtraction.findMany({ where: { kind: "TENDER", status: "READY", opportunityId: null }, orderBy: { createdAt: "desc" }, take: 5 });

  // Step 1: start from the TOR (or fill in manually)
  const manualForm = <Card className="max-w-5xl"><OpportunityForm o={{ ownerId: user.id }} clients={clients} users={users} cancel="/opportunities" fields={propFields} /></Card>;
  return (
    <>
      <PageHeader title="New proposal" subtitle="Start from the tender document — AI reads it and fills in the proposal for you to check." back={{ href: "/opportunities", label: "Proposals" }} />
      {sp.manual ? manualForm : (
        <div className="max-w-3xl space-y-4">
          {unfinished.length > 0 && (
            <Card title="Continue where you left off">
              <ul className="space-y-2">
                {unfinished.map((x) => {
                  const r = x.result as { title?: string; client_name?: string };
                  return (
                    <li key={x.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0 text-sm"><b className="block truncate">{r.title ?? "Tender reading"}</b><span className="text-xs text-ink-soft">{r.client_name ?? ""} · read {x.createdAt.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · not saved yet</span></span>
                      <span className="flex shrink-0 gap-2">
                        <Link href={`/opportunities/new?intake=${x.id}`} className="btn-primary btn-sm">Continue review →</Link>
                        <ConfirmAction action={discardExtraction} fields={{ id: x.id }} label="Discard" confirm="Discard this reading and its uploaded file?" className="btn-ghost btn-sm" />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          <Card title="1 · Upload the TOR / RFP">
            {ready ? (
              <IntakeUploader action={analyzeTender} label="Read the tender" hint="TOR, RFP, EOI and annexes · PDF (scanned is fine with Claude/Gemini), Word .docx or text" />
            ) : (
              <Notice tone="warn">
                AI isn&apos;t set up yet, so the tender can&apos;t be read automatically.{" "}
                {can(user.role, "admin") ? <>Add an API key in <Link className="link" href="/settings?tab=ai">Settings → AI</Link>.</> : <>Ask an admin to add an API key in Settings → AI.</>}
              </Notice>
            )}
          </Card>
          <p className="text-center text-sm text-ink-soft">or <Link href="/opportunities/new?manual=1" className="link">fill in the proposal manually</Link> and attach files afterwards</p>
        </div>
      )}
    </>
  );
}
