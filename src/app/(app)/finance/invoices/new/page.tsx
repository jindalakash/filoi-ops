import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { nextInvoiceNumber } from "@/lib/codes";
import { suggestSupplyType } from "@/lib/tax";
import { PageHeader, Card } from "@/components/ui";
import { InvoiceEditor } from "@/components/InvoiceEditor";
import { inputDate, num } from "@/lib/format";

export const metadata = { title: "New invoice" };

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ milestoneId?: string; projectId?: string }> }) {
  await requireUser("finance");
  const sp = await searchParams;
  const [company, fx, projects] = await Promise.all([
    getSetting("company"),
    getSetting("fx"),
    db.project.findMany({ where: { status: { in: ["ACTIVE", "ON_HOLD", "COMPLETED"] } }, include: { client: true }, orderBy: { code: "desc" } }),
  ]);
  const milestone = sp.milestoneId ? await db.milestone.findUnique({ where: { id: sp.milestoneId }, include: { deliverable: true } }) : null;
  const projectId = milestone?.projectId ?? sp.projectId;
  const project = projects.find((p) => p.id === projectId);
  const supply = (p: (typeof projects)[number]) => suggestSupplyType(p.client.country, p.client.stateCode, company.stateCode);
  const today = new Date();
  const due = new Date(today.getTime() + (company.paymentTermsDays || 30) * 86400000);
  const isExport = project ? supply(project) === "EXPORT_LUT" : true;

  return (
    <>
      <PageHeader title="New invoice" subtitle={milestone ? `For milestone “${milestone.title}”` : "Ad-hoc invoice"} back={{ href: project ? `/projects/${project.id}?tab=billing` : "/finance", label: project ? project.code : "Finance" }} />
      <Card className="max-w-6xl">
        <InvoiceEditor
          projects={projects.map((p) => ({ id: p.id, label: `${p.code} – ${p.title} (${p.client.shortName || p.client.name})`, currency: p.currency, supplyType: supply(p) }))}
          projectId={projectId}
          milestoneId={milestone?.id}
          fx={fx}
          defaults={{
            issueDate: inputDate(today),
            dueDate: inputDate(due),
            nextNumber: await nextInvoiceNumber(today),
            currency: project?.currency ?? "USD",
            exchangeRate: fx[(project?.currency ?? "USD") as keyof typeof fx] ?? 1,
            supplyType: project ? supply(project) : "EXPORT_LUT",
            poReference: project?.contractNo ?? "",
            placeOfSupply: isExport ? "Outside India (96)" : project?.client.stateCode ?? "",
            items: milestone
              ? [{ description: `${project?.title}\n${milestone.title}${milestone.deliverable ? ` – ${milestone.deliverable.title}` : ""}`, sac: company.defaultSac, quantity: 1, rate: num(milestone.amount) }]
              : [],
          }}
        />
      </Card>
    </>
  );
}
