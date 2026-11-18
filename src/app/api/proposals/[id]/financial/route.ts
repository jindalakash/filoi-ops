import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { proposalAccess } from "@/lib/permissions-proposal";
import { financialDocx } from "@/lib/export/docx";

export async function GET(_req: Request, ctx: RouteContext<"/api/proposals/[id]/financial">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const a = await proposalAccess(user, id);
  if (!(a.financial || can(user.role, "financeView"))) return new Response("Forbidden", { status: 403 });
  const { buffer, fileName } = await financialDocx(id);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
