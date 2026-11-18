import { Sparkles } from "lucide-react";
import { Card } from "./ui";

/** Side panel listing where the AI found each value, plus watch-outs. */
export function AiEvidence({ evidence, risks = [], model, files, extra }: { evidence: { field: string; quote: string; page: number | null }[]; risks?: string[]; model: string; files: string[]; extra?: React.ReactNode }) {
  return (
    <Card title={<span className="flex items-center gap-2"><Sparkles size={16} className="text-plum" /> What the AI found</span>}>
      <p className="text-xs text-ink-soft">Read from {files.join(", ")} with {model}. Check every value against the source before saving.</p>
      {extra}
      {risks.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">Watch-outs</div>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-amber-900">{risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      {evidence.length > 0 && (
        <div className="mt-4">
          <div className="label">Evidence from the document</div>
          <ul className="space-y-3">
            {evidence.map((e, i) => (
              <li key={i} className="text-sm">
                <div className="text-xs font-semibold text-plum">{e.field.replace(/_/g, " ")}{e.page ? ` · p.${e.page}` : ""}</div>
                <blockquote className="mt-0.5 border-l-2 border-line pl-2 italic text-ink-soft">“{e.quote.trim().replace(/^["“”']+|["“”']+$/g, "")}”</blockquote>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
