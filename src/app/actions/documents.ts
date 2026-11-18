"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { guard, req, str } from "@/lib/form";
import { saveUpload, deleteStored } from "@/lib/files";
import type { ActionState } from "@/components/client";
import type { DocCategory } from "@prisma/client";

export async function uploadDocuments(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return guard(async () => {
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) return { error: "Choose at least one file." };
    const category = (str(fd, "category") || "OTHER") as DocCategory;
    const link = { opportunityId: str(fd, "opportunityId") ?? null, projectId: str(fd, "projectId") ?? null, deliverableId: str(fd, "deliverableId") ?? null, proposalTaskId: str(fd, "proposalTaskId") ?? null };
    for (const f of files) {
      const saved = await saveUpload(f);
      await db.document.create({ data: { ...saved, category, ...link, uploadedById: user.id } });
    }
    revalidatePath(str(fd, "path") || "/");
    return { ok: `${files.length} file${files.length > 1 ? "s" : ""} uploaded.` };
  });
}

export async function deleteDocument(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  return guard(async () => {
    const doc = await db.document.delete({ where: { id: req(fd, "id") } });
    await deleteStored(doc.storedName);
    revalidatePath(str(fd, "path") || "/");
    return { ok: "Deleted." };
  });
}
