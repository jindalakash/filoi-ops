import { ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import { ActionForm, ConfirmAction, Disclosure, SubmitButton } from "./client";
import { Badge } from "./badges";
import { saveSection, moveSection, deleteSection, draftSection } from "@/app/actions/proposal";
import type { ProposalSection } from "@prisma/client";

export function SectionEditor({ s, index, editable, ai }: { s: ProposalSection; index: number; editable: boolean; ai: boolean }) {
  const words = s.content.trim() ? s.content.trim().split(/\s+/).length : 0;
  return (
    <section id={`s-${s.id}`} className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-xs font-bold text-white">{index + 1}</span>
        <h3 className="flex-1 font-display font-semibold">{s.title}</h3>
        {s.aiModel && <Badge tone="purple">AI draft</Badge>}
        <span className="text-xs text-ink-soft">{words} words</span>
        {editable && (
          <span className="flex items-center gap-1">
            <ActionForm action={moveSection}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="up" /><button className="rounded p-1 text-ink-soft hover:bg-mist" title="Move up"><ArrowUp size={14} /></button></ActionForm>
            <ActionForm action={moveSection}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="down" /><button className="rounded p-1 text-ink-soft hover:bg-mist" title="Move down"><ArrowDown size={14} /></button></ActionForm>
            <ConfirmAction action={deleteSection} fields={{ id: s.id }} label="✕" confirm={`Delete section “${s.title}”?`} className="rounded px-1.5 py-0.5 text-xs text-ink-soft hover:bg-red-50 hover:text-red-700" />
          </span>
        )}
      </div>
      <div className="p-5">
        {editable ? (
          <ActionForm action={saveSection} className="space-y-3">
            <input type="hidden" name="id" value={s.id} />
            <input type="hidden" name="title" value={s.title} />
            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-semibold text-ink-soft">What this section should cover</summary>
              <textarea name="guidance" defaultValue={s.guidance ?? ""} rows={2} className="input mt-2 text-sm" />
            </details>
            <textarea key={s.updatedAt.toISOString()} name="content" defaultValue={s.content} rows={Math.min(28, Math.max(8, Math.ceil(s.content.length / 95)))} className="input font-[inherit] leading-relaxed"
              placeholder="Write here, or let AI draft it from the TOR, your team, references and past proposals. Use ### for sub-headings and - for bullets." />
            <div className="flex justify-end"><SubmitButton className="btn-dark btn-sm">Save section</SubmitButton></div>
          </ActionForm>
        ) : (
          <div className="whitespace-pre-line text-sm leading-relaxed">{s.content || <span className="text-ink-soft">Not written yet.</span>}</div>
        )}
        {editable && ai && (
          <div className="mt-3 border-t border-line pt-3">
            <Disclosure label={<span className="inline-flex items-center gap-1.5"><Sparkles size={14} /> {s.content.trim() ? "Improve with AI" : "Draft with AI"}</span>} className="btn-ghost btn-sm">
              <ActionForm action={draftSection} className="space-y-2">
                <input type="hidden" name="id" value={s.id} />
                <textarea name="instructions" rows={2} className="input text-sm" placeholder="Optional: e.g. emphasise our DHIS2 tracker work in Bhutan; keep it under 500 words; add a table of activities" />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-ink-soft">{s.content.trim() ? "AI will revise the current text. Save your edits first." : "Uses the TOR, team, references and similar past proposals."}</p>
                  <SubmitButton className="btn-primary btn-sm" pendingText="Writing… (up to a minute)">{s.content.trim() ? "Improve" : "Draft"}</SubmitButton>
                </div>
              </ActionForm>
            </Disclosure>
          </div>
        )}
      </div>
    </section>
  );
}
