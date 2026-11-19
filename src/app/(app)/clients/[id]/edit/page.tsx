import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fieldsFor } from "@/lib/custom";
import { PageHeader, Card } from "@/components/ui";
import { ActionForm } from "@/components/client";
import { ClientFields, FormFooter } from "@/components/forms";
import { saveClient } from "@/app/actions/clients";

export default async function EditClient({ params }: PageProps<"/clients/[id]/edit">) {
  await requireUser();
  const { id } = await params;
  const c = await db.client.findUnique({ where: { id } });
  if (!c) notFound();
  return (
    <>
      <PageHeader title={`Edit ${c.name}`} back={{ href: `/clients/${id}`, label: c.name }} />
      <Card className="max-w-3xl"><ActionForm action={saveClient}><ClientFields c={c} fields={await fieldsFor("CLIENT")} users={await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })} /><FormFooter cancel={`/clients/${id}`} /></ActionForm></Card>
    </>
  );
}
