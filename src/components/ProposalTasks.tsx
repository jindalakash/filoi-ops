import { db } from "@/lib/db";
import { Card, Progress } from "./ui";
import { Disclosure, ConfirmAction } from "./client";
import { TaskForm, TaskRow } from "./TaskParts";
import { tasksFromChecklist } from "@/app/actions/tasks";
import { Users } from "lucide-react";

/** "Team & tasks" card on a proposal: parts assigned to people, with review progress. */
export async function ProposalTasks({ opportunityId, manage, ownerId, deadline, hasChecklist }: { opportunityId: string; manage: boolean; ownerId: string | null; deadline: Date | null; hasChecklist: boolean }) {
  const [tasks, users] = await Promise.all([
    db.proposalTask.findMany({ where: { opportunityId }, include: { assignee: { select: { name: true } }, reviewer: { select: { name: true } } }, orderBy: [{ seq: "asc" }, { createdAt: "asc" }] }),
    manage ? db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const approved = tasks.filter((t) => t.status === "APPROVED").length;
  const defaultDue = deadline ? new Date(deadline.getTime() - 2 * 86400000) : null;
  return (
    <Card title={<span className="flex items-center gap-2"><Users size={16} className="text-plum" /> Team & tasks</span>} pad={false}
      actions={tasks.length > 0 && <span className="text-xs text-ink-soft">{approved}/{tasks.length} parts approved</span>}>
      {tasks.length > 0 && <div className="px-5 pt-4"><Progress value={(approved / tasks.length) * 100} tone="green" /></div>}
      {tasks.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-soft">Split the proposal into parts and assign each to a team member. They mark it done, a reviewer approves it, and when every part is approved the proposal becomes <b>Ready to submit</b>.</p>
      ) : (
        <ul className="divide-y divide-line">{tasks.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
      )}
      {manage && (
        <div className="flex flex-wrap items-start gap-2 border-t border-line p-4">
          <div className="w-full"><Disclosure label="+ Assign a part" className="btn-primary btn-sm"><TaskForm opportunityId={opportunityId} users={users} defaultReviewer={ownerId} defaultDue={defaultDue} existing={tasks.map((t) => t.title)} /></Disclosure></div>
          {hasChecklist && <ConfirmAction action={tasksFromChecklist} fields={{ opportunityId }} label="Create tasks from the submission checklist" confirm="Create one task for each item in “Documents to submit”?" className="btn-ghost btn-sm" />}
        </div>
      )}
    </Card>
  );
}
