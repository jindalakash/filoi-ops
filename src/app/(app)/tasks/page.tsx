import Link from "next/link";
import clsx from "clsx";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageTasks } from "@/lib/tasks";
import { PageHeader, Card, Empty } from "@/components/ui";
import { TaskRow } from "@/components/TaskParts";
import type { Prisma } from "@prisma/client";
import { WorkRow, workRowInclude } from "@/components/WorkParts";
import { boardColumns, canMoveItem } from "@/lib/work";

export const metadata = { title: "My tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const user = await requireUser();
  const { v = "mine" } = await searchParams;
  const manager = canManageTasks(user);
  const open: Prisma.ProposalTaskWhereInput = { opportunity: { status: { in: ["DRAFT", "IN_REVIEW", "READY_TO_SUBMIT"] } } };
  const where: Record<string, Prisma.ProposalTaskWhereInput> = {
    mine: { ...open, assigneeId: user.id, status: { in: ["TODO", "IN_PROGRESS", "CHANGES_REQUESTED"] } },
    review: { ...open, reviewerId: user.id, status: "IN_REVIEW" },
    waiting: { ...open, assigneeId: user.id, status: "IN_REVIEW" },
    done: { OR: [{ assigneeId: user.id }, { reviewerId: user.id }], status: "APPROVED" },
    all: { ...open, status: { not: "APPROVED" } },
  };
  const views = [["mine", "Assigned to me"], ["review", "To review"], ["waiting", "Waiting on review"], ["done", "Done"], ...(manager ? [["all", "All open tasks"]] : [])];
  const counts = Object.fromEntries(await Promise.all(views.map(async ([k]) => [k, await db.proposalTask.count({ where: where[k] })])));
  const tasks = await db.proposalTask.findMany({
    where: where[v] ?? where.mine,
    include: { assignee: { select: { name: true } }, reviewer: { select: { name: true } }, opportunity: { select: { id: true, code: true, title: true } } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 200,
  });
  const [work, columns] = await Promise.all([
    db.workItem.findMany({
      where: { assigneeId: user.id, status: { category: { not: "DONE" } }, project: { status: "ACTIVE" } },
      include: { ...workRowInclude, project: { select: { code: true } }, deliverable: { select: { title: true } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    boardColumns(),
  ]);
  return (
    <>
      <PageHeader title="My tasks" subtitle="Delivery tasks and proposal parts assigned to you, and work waiting for your review." />
      {work.length > 0 && (
        <Card className="mb-6" title={<>Delivery tasks & issues <span className="ml-1 text-sm font-normal text-ink-soft">{work.length} open</span></>} actions={<Link href="/board?who=me" className="btn-ghost btn-sm">My board</Link>}>
          <ul className="-my-2.5 divide-y divide-line">
            {work.map((w) => <WorkRow key={w.id} i={w} columns={columns.map((c) => ({ id: c.id, name: c.name, category: c.category, color: c.color }))} canMove={canMoveItem(user, w)} showProject />)}
          </ul>
        </Card>
      )}
      <h2 className="mb-3 text-[15px] font-semibold">Proposal parts</h2>
      <div className="mb-4 flex flex-wrap gap-2">
        {views.map(([k, l]) => (
          <Link key={k} href={`/tasks?v=${k}`} className={clsx("rounded-full border px-3 py-1.5 text-sm font-semibold", v === k ? "border-navy bg-navy text-white" : "border-line bg-surface text-ink-soft hover:text-ink")}>
            {l} <span className="ml-1 opacity-70">{counts[k]}</span>
          </Link>
        ))}
      </div>
      <Card pad={false}>
        {tasks.length === 0 ? <Empty title="Nothing here">{v === "mine" ? "No open tasks assigned to you." : v === "review" ? "Nothing is waiting for your review." : "No tasks in this view."}</Empty> : (
          <ul className="divide-y divide-line">{tasks.map((t) => <TaskRow key={t.id} t={t} showProposal />)}</ul>
        )}
      </Card>
    </>
  );
}
