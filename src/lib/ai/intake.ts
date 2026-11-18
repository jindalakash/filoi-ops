import { db } from "../db";
import type { TenderExtraction, ContractExtraction } from "./schemas";

export async function loadIntake<T extends TenderExtraction | ContractExtraction>(id: string | undefined, kind: "TENDER" | "CONTRACT") {
  if (!id) return null;
  const x = await db.aiExtraction.findUnique({ where: { id } });
  if (!x || x.kind !== kind || x.status !== "READY") return null;
  const docs = await db.document.findMany({ where: { id: { in: x.documentIds } }, select: { fileName: true } });
  return { ...x, data: x.result as unknown as T, files: docs.map((d) => d.fileName) };
}
