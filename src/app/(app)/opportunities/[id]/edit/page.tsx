import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fieldsFor } from "@/lib/custom";
import { loadIntake } from "@/lib/ai/intake";
import { tenderPrefill } from "@/lib/ai/prefill";
import type { TenderExtraction } from "@/lib/ai/schemas";
import { PageHeader, Card, Notice } from "@/components/ui";
import { OpportunityForm } from "@/components/OpportunityForm";
import { AiEvidence } from "@/components/AiEvidence";

export default async function EditOpportunity({ params, searchParams }: PageProps<"/opportunities/[id]/edit">) {
  await requireUser("presales");
  const { id } = await params;
  const sp = await searchParams;
  const [o, clients, users] = await Promise.all([
    db.opportunity.findUnique({ where: { id } }),
    db.client.findMany({ select: { id: true, name: true, shortName: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true, role: { in: ["ADMIN", "PROJECT_MANAGER"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!o) notFound();
  const intake = await loadIntake<TenderExtraction>(typeof sp.intake === "string" ? sp.intake : undefined, "TENDER");
  if (intake && intake.opportunityId !== id) notFound();
  const pre = intake ? tenderPrefill(intake.data, clients, o) : null;
  return (
    <>
      <PageHeader title={`Edit ${o.code}`} back={{ href: `/opportunities/${id}`, label: o.title }} />
      {intake && <div className="mb-4 max-w-5xl"><Notice>AI filled in the <b>empty</b> fields from the tender; values you had already entered were kept.</Notice></div>}
      <div className={intake ? "grid items-start gap-6 xl:grid-cols-3" : ""}>
        <Card className={intake ? "xl:col-span-2" : "max-w-5xl"}>
          <OpportunityForm o={pre?.o ?? o} clients={clients} users={users} cancel={`/opportunities/${id}`} intakeId={intake?.id} fields={await fieldsFor("PROPOSAL")} />
        </Card>
        {intake && <div className="xl:sticky xl:top-6"><AiEvidence evidence={intake.data.evidence} risks={intake.data.risks} model={intake.model} files={intake.files} /></div>}
      </div>
    </>
  );
}
