import { extractText as pdfText } from "unpdf";
import mammoth from "mammoth";

export type SourceDoc = { fileName: string; mimeType: string; buffer: Buffer };

export const isPdf = (d: SourceDoc) => d.mimeType.includes("pdf") || d.fileName.toLowerCase().endsWith(".pdf");
export const isDocx = (d: SourceDoc) => d.fileName.toLowerCase().endsWith(".docx");
const isText = (d: SourceDoc) => d.mimeType.startsWith("text/") || /\.(txt|md|csv)$/i.test(d.fileName);

/** Plain text of a document, read locally (no AI). Empty string for scanned PDFs. */
export async function documentText(d: SourceDoc): Promise<string> {
  if (isPdf(d)) {
    const { text } = await pdfText(new Uint8Array(d.buffer), { mergePages: true });
    return text.replace(/[ \t]+\n/g, "\n").trim();
  }
  if (isDocx(d)) return (await mammoth.extractRawText({ buffer: d.buffer })).value.trim();
  if (isText(d)) return d.buffer.toString("utf8");
  throw new Error(`${d.fileName}: unsupported file type. Use PDF, Word (.docx) or text.`);
}
