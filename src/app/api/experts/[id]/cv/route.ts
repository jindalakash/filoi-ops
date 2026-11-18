import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { readStored, mimeFor } from "@/lib/files";

export async function GET(_req: Request, ctx: RouteContext<"/api/experts/[id]/cv">) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const e = await db.expert.findUnique({ where: { id } });
  if (!e?.cvStoredName || !e.cvFileName) return new Response("Not found", { status: 404 });
  const buf = await readStored(e.cvStoredName).catch(() => null);
  if (!buf) return new Response("File missing", { status: 410 });
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": mimeFor(e.cvFileName), "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(e.cvFileName)}` } });
}
