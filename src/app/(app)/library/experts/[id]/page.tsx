import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { aiReady } from "@/lib/ai/run";
import { PageHeader, Card } from "@/components/ui";
import { StatusBadge, OPP_STATUS } from "@/components/badges";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/client";
import { ExpertForm } from "@/components/ExpertForm";
import { readCvWithAi, deleteExpert } from "@/app/actions/library";
import { Sparkles, Download } from "lucide-react";

export default async function ExpertPage({ params }: PageProps<"/library/experts/[id]">) {
  await requireUser();
  const { id } = await params;
  const e = await db.expert.findUnique({ where: { id }, include: { proposals: { include: { opportunity: { select: { id: true, code: true, title: true, status: true } } } } } });
  if (!e) notFound();
  const ready = await aiReady();
  return (
    <>
      <PageHeader title={e.name} subtitle={e.title ?? undefined} back={{ href: "/library?tab=experts", label: "CV bank" }}
        actions={<>
          {e.cvFileName && <a href={`/api/experts/${id}/cv`} className="btn-ghost"><Download size={16} /> CV</a>}
          <ConfirmAction action={deleteExpert} fields={{ id }} label="Remove" confirm="Remove this expert? (Kept as inactive if used in proposals.)" className="btn-danger" />
        </>} />
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2"><ExpertForm e={e} cancel="/library?tab=experts" /></Card>
        <div className="order-first space-y-6 xl:order-none">
          {e.cvFileName && ready && (
            <Card title={<span className="flex items-center gap-2"><Sparkles size={16} className="text-plum" /> Read CV with AI</span>}>
              <p className="mb-3 text-sm text-ink-soft">Fills empty fields (summary, expertise, education, key assignments…) from <b>{e.cvFileName}</b>.</p>
              <ActionForm action={readCvWithAi}><input type="hidden" name="id" value={id} /><SubmitButton className="btn-primary w-full" pendingText="Reading…">Read CV</SubmitButton></ActionForm>
            </Card>
          )}
          <Card title="Proposed on">
            {e.proposals.length === 0 ? <p className="text-sm text-ink-soft">Not on any proposal yet.</p> : (
              <ul className="space-y-2 text-sm">
                {e.proposals.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2"><Link className="link truncate" href={`/opportunities/${p.opportunity.id}/workspace?tab=team`}>{p.opportunity.code} · {p.position}</Link><StatusBadge map={OPP_STATUS} value={p.opportunity.status} /></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
