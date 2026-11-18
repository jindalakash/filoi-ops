import { db } from "./db";
import { can } from "./permissions";
import type { Role } from "@prisma/client";

/** Who may edit a proposal's content: admins/PMs, or anyone with a task on it. Financials also: accounts. */
export async function proposalAccess(user: { id: string; role: Role }, opportunityId: string) {
  const presales = can(user.role, "presales");
  const hasTask = presales ? true : (await db.proposalTask.count({ where: { opportunityId, OR: [{ assigneeId: user.id }, { reviewerId: user.id }] } })) > 0;
  return { technical: presales || hasTask, financial: presales || hasTask || can(user.role, "finance"), manage: presales };
}
