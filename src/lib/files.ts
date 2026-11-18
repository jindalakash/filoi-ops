import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";

// Uploads live outside the build; tell the bundler not to trace this dynamic path.
export const UPLOAD_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR || "./storage/uploads");
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function saveUpload(file: File) {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 50 MB");
  await mkdir(/*turbopackIgnore: true*/ UPLOAD_DIR, { recursive: true });
  const ext = path.extname(file.name).slice(0, 10).replace(/[^.\w]/g, "");
  const storedName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  await writeFile(/*turbopackIgnore: true*/ path.join(UPLOAD_DIR, storedName), Buffer.from(await file.arrayBuffer()));
  return { storedName, size: file.size, mimeType: file.type || "application/octet-stream", fileName: file.name };
}

export function storedPath(storedName: string) {
  return path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, path.basename(storedName));
}
export const readStored = (n: string) => readFile(/*turbopackIgnore: true*/ storedPath(n));
export const deleteStored = (n: string) => unlink(/*turbopackIgnore: true*/ storedPath(n)).catch(() => {});

/** Store bytes that did not come from a browser upload (e.g. imported from templates-bank). */
export async function saveBuffer(fileName: string, buffer: Buffer, mimeType = "application/octet-stream") {
  await mkdir(/*turbopackIgnore: true*/ UPLOAD_DIR, { recursive: true });
  const ext = path.extname(fileName).slice(0, 10).replace(/[^.\w]/g, "");
  const storedName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  await writeFile(/*turbopackIgnore: true*/ path.join(UPLOAD_DIR, storedName), buffer);
  return { storedName, size: buffer.length, mimeType, fileName };
}

export function mimeFor(name: string) {
  const ext = path.extname(name).toLowerCase();
  return ({ ".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".txt": "text/plain", ".md": "text/markdown" } as Record<string, string>)[ext] ?? "application/octet-stream";
}
