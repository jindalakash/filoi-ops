import { requireUser } from "@/lib/auth";
import { PageHeader, Card } from "@/components/ui";
import { ExpertForm } from "@/components/ExpertForm";

export const metadata = { title: "Add expert" };

export default async function NewExpert() {
  await requireUser();
  return (
    <>
      <PageHeader title="Add expert" subtitle="Tip: upload the CV and save — then use “Read CV with AI” to fill the profile." back={{ href: "/library?tab=experts", label: "CV bank" }} />
      <Card className="max-w-5xl"><ExpertForm cancel="/library?tab=experts" /></Card>
    </>
  );
}
