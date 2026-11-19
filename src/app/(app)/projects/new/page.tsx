import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fieldsFor } from "@/lib/custom";
import { PageHeader, Card } from "@/components/ui";
import { ProjectForm } from "@/components/ProjectForm";

export const metadata = { title: "New project" };

export default async function NewProject() {
  await requireUser("projects");
  const [clients, users] = await Promise.all([
    db.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true, role: { in: ["ADMIN", "PROJECT_MANAGER"] } }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="New project" subtitle="After saving, upload the contract / PO and add deliverables & billing milestones." back={{ href: "/projects", label: "Projects" }} />
      <Card className="max-w-5xl"><ProjectForm clients={clients} users={users} cancel="/projects" fields={await fieldsFor("PROJECT")} /></Card>
    </>
  );
}
