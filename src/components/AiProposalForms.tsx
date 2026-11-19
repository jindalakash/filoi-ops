import { Sparkles } from "lucide-react";
import { ActionForm, SubmitButton } from "./client";
import { draftAllSections, draftFinancial } from "@/app/actions/proposal";

/** "Draft the whole technical proposal with AI" — fills every empty section in order. */
export function DraftAllForm({ opportunityId, sectionCount, emptyCount }: { opportunityId: string; sectionCount: number; emptyCount: number }) {
  return (
    <ActionForm action={draftAllSections} className="rounded-xl border border-plum/30 bg-plum/5 p-4">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <div className="flex items-start gap-3">
        <Sparkles size={20} className="mt-0.5 shrink-0 text-plum" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="font-semibold">Draft the whole technical proposal with AI</div>
          <p className="text-sm text-ink-soft">
            {sectionCount === 0 ? "Adds the standard sections and writes each one" : `Writes the ${emptyCount} empty section${emptyCount === 1 ? "" : "s"}`} from the TOR, your team, selected experience,
            company profile and the most similar past proposals in the Library. Takes about 30 seconds per section; you then edit each one.
          </p>
          <textarea name="instructions" rows={2} className="input text-sm" placeholder="Optional guidance for every section — e.g. stress our DHIS2 work in the Caribbean, British English, max 15 pages in total" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" name="rewrite" className="h-4 w-4 accent-plum" /> Also improve sections that already have text</label>
            <SubmitButton className="btn-primary" pendingText="Writing all sections… (≈30 s each)"><Sparkles size={15} /> Draft whole proposal</SubmitButton>
          </div>
        </div>
      </div>
    </ActionForm>
  );
}

/** "Draft the financial proposal with AI" — proposes cost lines; the user reviews and saves. */
export function DraftFinancialForm({ opportunityId, hasLines }: { opportunityId: string; hasLines: boolean }) {
  return (
    <ActionForm action={draftFinancial} className="rounded-xl border border-plum/30 bg-plum/5 p-4">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <div className="flex items-start gap-3">
        <Sparkles size={20} className="mt-0.5 shrink-0 text-plum" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="font-semibold">Draft the financial proposal with AI</div>
          <p className="text-sm text-ink-soft">Builds fee lines from the team&apos;s daily rates and days, plus travel, per diem and other costs the TOR implies, following your past financial proposals in the Library.{hasLines && " This replaces the current lines."}</p>
          <textarea name="instructions" rows={2} className="input text-sm" placeholder="Optional — e.g. 3 missions of 5 days to each country; total must stay under USD 120,000" />
          <div className="flex justify-end"><SubmitButton className="btn-primary" pendingText="Building the budget…"><Sparkles size={15} /> {hasLines ? "Redraft with AI" : "Draft with AI"}</SubmitButton></div>
        </div>
      </div>
    </ActionForm>
  );
}
