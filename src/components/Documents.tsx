import { FileText, Download, Eye } from "lucide-react";
import { ActionForm, ConfirmAction, SubmitButton } from "./client";
import { Card, Empty } from "./ui";
import { Badge } from "./badges";
import { uploadDocuments, deleteDocument } from "@/app/actions/documents";
import { date } from "@/lib/format";
import type { Document, DocCategory } from "@prisma/client";

export const DOC_LABEL: Record<DocCategory, string> = {
  TOR: "TOR", RFP: "RFP / tender", TECHNICAL_PROPOSAL: "Technical proposal", FINANCIAL_PROPOSAL: "Financial proposal",
  CONTRACT: "Contract", PURCHASE_ORDER: "Purchase order", DELIVERABLE: "Deliverable", INVOICE: "Invoice", CORRESPONDENCE: "Correspondence", OTHER: "Other",
};

export function Documents({ docs, link, path, categories, defaultCategory, title = "Documents" }: {
  docs: (Document & { uploadedBy?: { name: string } | null })[];
  link: { opportunityId?: string; projectId?: string; deliverableId?: string };
  path: string;
  categories: DocCategory[];
  defaultCategory: DocCategory;
  title?: string;
}) {
  const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.ceil(b / 1e3)} KB`);
  return (
    <Card title={title} pad={false}>
      <ActionForm action={uploadDocuments} resetOnOk className="border-b border-line p-4">
        {Object.entries(link).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <input type="hidden" name="path" value={path} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select name="category" defaultValue={defaultCategory} className="input sm:!w-48">
            {categories.map((c) => <option key={c} value={c}>{DOC_LABEL[c]}</option>)}
          </select>
          <input type="file" name="files" multiple required className="input file:mr-3 file:rounded-md file:border-0 file:bg-mist file:px-2 file:py-1 file:text-sm file:font-semibold" />
          <SubmitButton className="btn-dark" pendingText="Uploading…">Upload</SubmitButton>
        </div>
      </ActionForm>
      {docs.length === 0 ? <Empty title="No files yet">Upload PDFs, Word or Excel files (max 50 MB each).</Empty> : (
        <ul className="divide-y divide-line">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <FileText size={20} className="shrink-0 text-ink-soft" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{d.fileName}</div>
                <div className="text-xs text-ink-soft">{size(d.size)} · {date(d.createdAt)}{d.uploadedBy && ` · ${d.uploadedBy.name}`}</div>
              </div>
              <Badge tone="navy">{DOC_LABEL[d.category]}</Badge>
              {d.mimeType?.includes("pdf") && <a href={`/api/files/${d.id}?view`} target="_blank" className="rounded-md p-1.5 text-ink-soft hover:bg-mist" title="View"><Eye size={16} /></a>}
              <a href={`/api/files/${d.id}`} className="rounded-md p-1.5 text-ink-soft hover:bg-mist" title="Download"><Download size={16} /></a>
              <ConfirmAction action={deleteDocument} fields={{ id: d.id, path }} label="✕" confirm={`Delete ${d.fileName}?`} className="rounded-md px-2 py-1 text-xs text-ink-soft hover:bg-red-50 hover:text-red-700" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
