import { requireUser } from "@/lib/auth";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { Shell } from "@/components/Shell";
import { logout } from "../actions/auth";
import { db } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const caps = [
    "presalesView",
    can(user.role, "presales") && "presales",
    can(user.role, "financeView") && "financeView",
    can(user.role, "admin") && "admin",
    (can(user.role, "presales") || can(user.role, "finance")) && "library",
  ].filter(Boolean) as string[];
  const live = { opportunity: { status: { in: ["DRAFT", "IN_REVIEW", "READY_TO_SUBMIT"] as ("DRAFT" | "IN_REVIEW" | "READY_TO_SUBMIT")[] } } };
  const taskCount = await db.proposalTask.count({
    where: { ...live, OR: [{ assigneeId: user.id, status: { in: ["TODO", "IN_PROGRESS", "CHANGES_REQUESTED"] } }, { reviewerId: user.id, status: "IN_REVIEW" }] },
  });
  return (
    <Shell user={{ name: user.name, role: user.role, roleLabel: ROLE_LABEL[user.role] }} caps={caps} logout={logout} taskCount={taskCount}>
      {children}
    </Shell>
  );
}
