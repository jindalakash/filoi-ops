import Link from "next/link";
import clsx from "clsx";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageTasks } from "@/lib/tasks";
import { PageHeader, Card, Empty } from "@/components/ui";
import { TaskRow } from "@/components/TaskParts";
import type { Prisma } from "@prisma/client";

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
  return (
    <>
      <PageHeader title="My tasks" subtitle="Proposal parts assigned to you, and work waiting for your review." />
      <div className="mb-4 flex flex-wrap gap-2">
        {views.map(([k, l]) => (
          <Link key={k} href={`/tasks?v=${k}`} className={clsx("rounded-full border px-3 py-1.5 text-sm font-semibold", v === k ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft hover:text-ink")}>
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
