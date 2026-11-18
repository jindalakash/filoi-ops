import { requireUser } from "@/lib/auth";
import { PageHeader, Card } from "@/components/ui";
import { ActionForm } from "@/components/client";
import { ClientFields, FormFooter } from "@/components/forms";
import { saveClient } from "@/app/actions/clients";

export const metadata = { title: "New client" };

export default async function NewClient({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  await requireUser();
  const { returnTo } = await searchParams;
  return (
    <>
      <PageHeader title="New client" back={{ href: "/clients", label: "Clients" }} />
      <Card className="max-w-3xl">
        <ActionForm action={saveClient}>
          {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
          <ClientFields />
          <FormFooter label="Create client" cancel="/clients" />
        </ActionForm>
      </Card>
    </>
  );
}
