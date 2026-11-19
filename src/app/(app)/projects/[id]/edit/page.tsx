import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fieldsFor } from "@/lib/custom";
import { PageHeader, Card } from "@/components/ui";
import { ProjectForm } from "@/components/ProjectForm";

export default async function EditProject({ params }: PageProps<"/projects/[id]/edit">) {
  await requireUser("projects");
  const { id } = await params;
  const [p, clients, users] = await Promise.all([
    db.project.findUnique({ where: { id } }),
    db.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true, role: { in: ["ADMIN", "PROJECT_MANAGER"] } }, select: { id: true, name: true } }),
  ]);
  if (!p) notFound();
  return (
    <>
      <PageHeader title={`Edit ${p.code}`} back={{ href: `/projects/${id}`, label: p.title }} />
      <Card className="max-w-5xl"><ProjectForm p={p} clients={clients} users={users} cancel={`/projects/${id}`} fields={await fieldsFor("PROJECT")} /></Card>
    </>
  );
}
