import Link from "next/link";
import { FileDown, PenLine, Users } from "lucide-react";
import { db } from "@/lib/db";
import { Card, Notice } from "./ui";
import { Badge } from "./badges";
import { ActionForm, SubmitButton } from "./client";
import { SectionEditor } from "./SectionEditor";
import { FinancialEditor } from "./FinancialEditor";
import { DraftAllForm, DraftFinancialForm } from "./AiProposalForms";
import { startWritingTask } from "@/app/actions/tasks";
import { financialEditorProps } from "@/lib/financial-props";
import { num } from "@/lib/format";

type Task = { id: string; title: string; scope: string; sectionId: string | null; opportunityId: string };

/** Where the assignee writes their part — section editor, whole technical/financial proposal, team, or uploads. */
export async function TaskWriteArea({ t, canEdit, canEditFinancial, ai }: { t: Task; canEdit: boolean; canEditFinancial: boolean; ai: boolean }) {
  const ws = `/opportunities/${t.opportunityId}/workspace`;
  const head = (label: string, extra?: React.ReactNode) => <span className="flex items-center gap-2"><PenLine size={16} className="text-plum" /> {label} {extra}</span>;

  if (t.scope === "SECTION") {
    const section = t.sectionId ? await db.proposalSection.findUnique({ where: { id: t.sectionId } }) : null;
    if (!section) {
      return (
        <Card title={head("Write this part")}>
          <p className="mb-3 text-sm text-ink-soft">This part becomes a section of the technical proposal. Start it to write here — by hand or with AI.</p>
          {canEdit && <ActionForm action={startWritingTask}><input type="hidden" name="id" value={t.id} /><SubmitButton>Start writing</SubmitButton></ActionForm>}
        </Card>
      );
    }
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-display text-[15px] font-semibold"><PenLine size={16} className="text-plum" /> Write this part</h2><Link href={ws} className="text-xs link">See the whole proposal →</Link></div>
        <SectionEditor s={section} index={section.seq} editable={canEdit} ai={ai} />
        {!ai && canEdit && <Notice>Turn on AI in Settings → AI to draft this section automatically.</Notice>}
      </div>
    );
  }

  if (t.scope === "TECHNICAL") {
    const sections = await db.proposalSection.findMany({ where: { opportunityId: t.opportunityId }, orderBy: [{ seq: "asc" }, { createdAt: "asc" }] });
    const empty = sections.filter((s) => !s.content.trim()).length;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold"><PenLine size={16} className="text-plum" /> Technical proposal <Badge tone="purple">{sections.length - empty}/{sections.length} sections written</Badge></h2>
          <span className="flex gap-2"><Link href={ws} className="btn-ghost btn-sm">Team, experience & order</Link><a href={`/api/proposals/${t.opportunityId}/technical`} className="btn-dark btn-sm"><FileDown size={14} /> Word</a></span>
        </div>
        {canEdit && ai && (empty > 0 || sections.length === 0) && <DraftAllForm opportunityId={t.opportunityId} sectionCount={sections.length} emptyCount={empty} />}
        {canEdit && ai && empty === 0 && sections.length > 0 && <DraftAllForm opportunityId={t.opportunityId} sectionCount={sections.length} emptyCount={0} />}
        {!ai && <Notice>Turn on AI in Settings → AI to draft the proposal automatically — or write each section below.</Notice>}
        {sections.map((s, i) => <SectionEditor key={s.id} s={s} index={i} editable={canEdit} ai={ai} />)}
      </div>
    );
  }

  if (t.scope === "FINANCIAL") {
    const fp = await financialEditorProps(t.opportunityId);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold"><PenLine size={16} className="text-plum" /> Financial proposal</h2>
          <a href={`/api/proposals/${t.opportunityId}/financial`} className="btn-dark btn-sm"><FileDown size={14} /> Word</a>
        </div>
        {canEditFinancial && ai && <DraftFinancialForm opportunityId={t.opportunityId} hasLines={fp.initial.length > 0} />}
        {fp.team.length === 0 && <Notice tone="warn">No team on this proposal yet — fee lines work best once the team is chosen in the <Link className="link" href={`${ws}?tab=team`}>workspace</Link>.</Notice>}
        <Card><FinancialEditor key={fp.initial.map((l) => `${l.description}:${l.quantity}:${l.rate}`).join("|")} opportunityId={t.opportunityId} editable={canEditFinancial} {...fp} /></Card>
      </div>
    );
  }

  if (t.scope === "TEAM") {
    const team = await db.proposalTeamMember.findMany({ where: { opportunityId: t.opportunityId }, include: { expert: true }, orderBy: { seq: "asc" } });
    return (
      <Card title={head("Team & CVs")} actions={<Link href={`${ws}?tab=team`} className="btn-ghost btn-sm"><Users size={14} /> Manage team</Link>}>
        {team.length === 0 ? <p className="text-sm text-ink-soft">No experts selected yet. Add them in the workspace from the CV bank; upload CVs in the client&apos;s format below if needed.</p> : (
          <ul className="space-y-1.5 text-sm">{team.map((m) => <li key={m.id}><b>{m.position}</b> — {m.expert.name}{m.inputDays ? ` · ${num(m.inputDays)} days` : ""}</li>)}</ul>
        )}
      </Card>
    );
  }

  return <Notice>This part is about supporting documents — upload them under “Drafts & files” below, then send for review.</Notice>;
}
