import { FileText, Download, Eye } from "lucide-react";
import { Card } from "./ui";
import { ActionForm, SubmitButton, ConfirmAction } from "./client";
import { AttachmentPicker } from "./AttachmentPicker";
import { uploadDocuments, deleteDocument } from "@/app/actions/documents";
import { date } from "@/lib/format";

type Doc = { id: string; fileName: string; mimeType: string | null; size: number; createdAt: Date; uploadedBy?: { name: string } | null };
const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.ceil(b / 1e3)} KB`);

/** Screenshots as a gallery, other files as a list, and paste / drop / browse to add more. */
export function WorkAttachments({ itemId, path, docs, isIssue }: { itemId: string; path: string; docs: Doc[]; isIssue: boolean }) {
  const images = docs.filter((d) => d.mimeType?.startsWith("image/"));
  const others = docs.filter((d) => !d.mimeType?.startsWith("image/"));
  const del = (d: Doc) => <ConfirmAction action={deleteDocument} fields={{ id: d.id, path }} label="✕" confirm={`Delete ${d.fileName}?`} className="rounded-md px-2 py-1 text-xs text-ink-soft hover:bg-red-50 hover:text-red-700" />;
  return (
    <Card title={<>Attachments {docs.length > 0 && <span className="ml-1 text-sm font-normal text-ink-soft">{docs.length}</span>}</>}>
      {images.length > 0 && (
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((d) => (
            <li key={d.id} className="overflow-hidden rounded-lg border border-line">
              <a href={`/api/files/${d.id}?view`} target="_blank" rel="noreferrer" title="Open full size">
                {/* eslint-disable-next-line @next/next/no-img-element -- private file served by our own API */}
                <img src={`/api/files/${d.id}?view`} alt={d.fileName} loading="lazy" className="h-36 w-full bg-mist object-cover transition hover:opacity-90" />
              </a>
              <div className="flex items-center gap-1 px-2 py-1">
                <span className="min-w-0 flex-1 truncate text-[11px] text-ink-soft" title={d.fileName}>{d.fileName} · {date(d.createdAt)}{d.uploadedBy && ` · ${d.uploadedBy.name}`}</span>
                {del(d)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <ul className="mb-4 divide-y divide-line rounded-lg border border-line">
          {others.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2">
              <FileText size={18} className="shrink-0 text-ink-soft" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{d.fileName}</div>
                <div className="text-xs text-ink-soft">{size(d.size)} · {date(d.createdAt)}{d.uploadedBy && ` · ${d.uploadedBy.name}`}</div>
              </div>
              {d.mimeType?.includes("pdf") && <a href={`/api/files/${d.id}?view`} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-ink-soft hover:bg-mist" title="View"><Eye size={16} /></a>}
              <a href={`/api/files/${d.id}`} className="rounded-md p-1.5 text-ink-soft hover:bg-mist" title="Download"><Download size={16} /></a>
              {del(d)}
            </li>
          ))}
        </ul>
      )}
      <ActionForm action={uploadDocuments} resetOnOk className="space-y-2">
        <input type="hidden" name="workItemId" value={itemId} />
        <input type="hidden" name="path" value={path} />
        <input type="hidden" name="category" value={isIssue ? "CORRESPONDENCE" : "OTHER"} />
        <AttachmentPicker label={docs.length ? "Add more" : isIssue ? "Screenshots & files from the client" : "Add files"} />
        <div className="flex justify-end"><SubmitButton className="btn-dark btn-sm" pendingText="Uploading…">Upload</SubmitButton></div>
      </ActionForm>
    </Card>
  );
}
