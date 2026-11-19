import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Disclosure } from "@/components/client";
import { KanbanBoard, type BoardCard } from "@/components/KanbanBoard";
import { WorkItemForm } from "@/components/WorkForm";
import { boardColumns, canMoveItem, workFormExtras } from "@/lib/work";
import { date, daysUntil } from "@/lib/format";
import { formatCustom } from "@/lib/custom";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Board" };

type SP = { project?: string; who?: string; type?: string; deliverable?: string; label?: string };

export default async function BoardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const since = new Date(); since.setDate(since.getDate() - 30);
  const where: Prisma.WorkItemWhereInput = {
    project: { status: "ACTIVE" },
    ...(sp.project ? { projectId: sp.project } : {}),
    ...(sp.deliverable ? { deliverableId: sp.deliverable } : {}),
    ...(sp.type ? { type: sp.type as Prisma.EnumWorkTypeFilter["equals"] } : {}),
    ...(sp.label ? { labels: { some: { id: sp.label } } } : {}),
    ...(sp.who === "me" ? { assigneeId: user.id } : sp.who === "none" ? { assigneeId: null } : sp.who ? { assigneeId: sp.who } : {}),
    // keep the Done column short: finished in the last 30 days
    OR: [{ completedAt: null }, { completedAt: { gte: since } }],
  };
  const [columns, items, projects, users, extras] = await Promise.all([
    boardColumns(),
    db.workItem.findMany({ where, include: { assignee: { select: { name: true } }, project: { select: { code: true } }, deliverable: { select: { title: true } }, labels: { select: { name: true, color: true }, orderBy: { seq: "asc" } } }, orderBy: { position: "asc" } }),
    db.project.findMany({ where: { status: "ACTIVE" }, select: { id: true, code: true, deliverables: { select: { id: true, title: true }, orderBy: { seq: "asc" } } }, orderBy: { code: "asc" } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    workFormExtras(),
  ]);
  const userNames = new Map(users.map((u) => [u.id, u.name]));
  const doneIds = new Set(columns.filter((c) => c.category === "DONE").map((c) => c.id));
  const cards: BoardCard[] = items.map((i) => ({
    id: i.id, number: i.number, title: i.title, type: i.type, priority: i.priority, statusId: i.statusId, position: i.position,
    due: i.dueDate ? date(i.dueDate) : null, overdue: !!i.dueDate && !doneIds.has(i.statusId) && (daysUntil(i.dueDate) ?? 0) < 0,
    assignee: i.assignee?.name ?? null, project: i.project.code, deliverable: i.deliverable?.title ?? null, canMove: canMoveItem(user, i),
    labels: i.labels,
    chips: extras.fields.filter((f) => f.showInList).flatMap((f) => { const t = formatCustom(f, (i.custom as Record<string, unknown>)[f.id], userNames); return t === null || (f.type === "CHECKBOX" && t === "No") ? [] : [f.type === "CHECKBOX" ? f.label : `${f.label}: ${t}`]; }),
  }));
  const deliverables = sp.project ? projects.find((p) => p.id === sp.project)?.deliverables ?? [] : [];
  const filtered = !!(sp.project || sp.who || sp.type || sp.deliverable || sp.label);

  return (
    <>
      <PageHeader title="Board" subtitle="Drag cards between columns. Done shows the last 30 days."
        actions={<Link href="/deliverables" className="btn-ghost">By deliverable</Link>} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form className="flex flex-wrap items-end gap-2" action="/board">
          <label className="block"><span className="label">Project</span>
            <select name="project" defaultValue={sp.project ?? ""} className="input !w-44 !py-1.5"><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></label>
          {deliverables.length > 0 && (
            <label className="block"><span className="label">Deliverable</span>
              <select name="deliverable" defaultValue={sp.deliverable ?? ""} className="input !w-56 !py-1.5"><option value="">All deliverables</option>{deliverables.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
          )}
          <label className="block"><span className="label">Assignee</span>
            <select name="who" defaultValue={sp.who ?? ""} className="input !w-44 !py-1.5"><option value="">Everyone</option><option value="me">Me</option><option value="none">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          <label className="block"><span className="label">Type</span>
            <select name="type" defaultValue={sp.type ?? ""} className="input !w-40 !py-1.5"><option value="">All types</option><option value="TASK">Tasks</option><option value="ISSUE">Client issues</option><option value="CHANGE">Change requests</option></select></label>
          {extras.labels.length > 0 && (
            <label className="block"><span className="label">Label</span>
              <select name="label" defaultValue={sp.label ?? ""} className="input !w-40 !py-1.5"><option value="">Any label</option>{extras.labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          )}
          <button className="btn-dark btn-sm">Apply</button>
          {filtered && <Link href="/board" className="btn-ghost btn-sm">Clear</Link>}
        </form>
      </div>
      {projects.length > 0 && (
        <div className="mb-4">
          <Disclosure label="+ New task or issue" className="btn-primary">
            <WorkItemForm projects={projects} users={users} projectId={sp.project} deliverableId={sp.deliverable} {...extras} />
          </Disclosure>
        </div>
      )}
      {projects.length === 0
        ? <div className="card p-8 text-center text-sm text-ink-soft">No active projects yet.</div>
        : <KanbanBoard columns={columns.map((c) => ({ id: c.id, name: c.name, category: c.category, color: c.color }))} cards={cards} />}
    </>
  );
}
