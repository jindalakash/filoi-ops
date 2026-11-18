import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { invoicePdf } from "@/lib/export/invoice-pdf";
import { saveBuffer, deleteStored } from "@/lib/files";

/** Generates the invoice PDF, keeps a copy in the project's files (replacing the previous copy), and downloads it. */
export async function GET(req: Request, ctx: RouteContext<"/api/invoices/[id]/pdf">) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "financeView")) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  const { buffer, fileName, invoice } = await invoicePdf(id);

  if (can(user.role, "finance")) {
    const old = await db.document.findFirst({ where: { projectId: invoice.projectId, category: "INVOICE", fileName } });
    const saved = await saveBuffer(fileName, Buffer.from(buffer), "application/pdf");
    if (old) {
      await db.document.update({ where: { id: old.id }, data: { storedName: saved.storedName, size: saved.size, uploadedById: user.id, createdAt: new Date() } });
      await deleteStored(old.storedName);
    } else {
      await db.document.create({ data: { ...saved, category: "INVOICE", projectId: invoice.projectId, uploadedById: user.id } });
    }
  }
  const inline = new URL(req.url).searchParams.has("view");
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}` },
  });
}
