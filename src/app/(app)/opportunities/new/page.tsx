import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, Card, Notice } from "@/components/ui";
import { OpportunityForm } from "@/components/OpportunityForm";

export const metadata = { title: "New proposal" };

export default async function NewOpportunity() {
  await requireUser("presales");
  const [clients, users] = await Promise.all([
    db.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true, role: { in: ["ADMIN", "PROJECT_MANAGER"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="New proposal" subtitle="Capture the key facts of the tender. You can upload the TOR / RFP right after saving." back={{ href: "/opportunities", label: "Proposals" }} />
      <div className="mb-4 max-w-5xl"><Notice>AI-assisted reading of the TOR (auto-filling this form) arrives in Phase 2 — for now fill in what you need; everything is editable later.</Notice></div>
      <Card className="max-w-5xl"><OpportunityForm clients={clients} users={users} cancel="/opportunities" /></Card>
    </>
  );
}
