import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, Card } from "@/components/ui";
import { OpportunityForm } from "@/components/OpportunityForm";

export default async function EditOpportunity({ params }: PageProps<"/opportunities/[id]/edit">) {
  await requireUser("presales");
  const { id } = await params;
  const [o, clients, users] = await Promise.all([
    db.opportunity.findUnique({ where: { id } }),
    db.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true, role: { in: ["ADMIN", "PROJECT_MANAGER"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!o) notFound();
  return (
    <>
      <PageHeader title={`Edit ${o.code}`} back={{ href: `/opportunities/${id}`, label: o.title }} />
      <Card className="max-w-5xl"><OpportunityForm o={o} clients={clients} users={users} cancel={`/opportunities/${id}`} /></Card>
    </>
  );
}
