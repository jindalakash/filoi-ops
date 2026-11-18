import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { readStored } from "@/lib/files";

export async function GET(_req: Request, ctx: RouteContext<"/api/library/[id]">) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const it = await db.libraryItem.findUnique({ where: { id } });
  if (!it) return new Response("Not found", { status: 404 });
  const buf = await readStored(it.storedName).catch(() => null);
  if (!buf) return new Response("File missing", { status: 410 });
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": it.mimeType || "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(it.fileName)}` } });
}
