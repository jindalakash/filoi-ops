import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { readStored } from "@/lib/files";

export async function GET(req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return new Response("Not found", { status: 404 });
  const buf = await readStored(doc.storedName).catch(() => null);
  if (!buf) return new Response("File missing on disk", { status: 410 });
  const inline = new URL(req.url).searchParams.has("view");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mimeType || "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
    },
  });
}
