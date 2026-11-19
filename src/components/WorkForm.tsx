"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "./client";
import { saveWorkItem } from "@/app/actions/work";

type Opt = { id: string; name: string };
export type ProjectOpt = { id: string; code: string; deliverables: { id: string; title: string }[] };
export type WorkItemEdit = { id: string; projectId: string; deliverableId: string | null; type: string; title: string; description: string | null; priority: string; assigneeId: string | null; dueDate: string };

const TYPES = [["TASK", "Task"], ["ISSUE", "Client issue"], ["CHANGE", "Change request"]];
const PRIORITIES = [["URGENT", "Urgent"], ["HIGH", "High"], ["MEDIUM", "Medium"], ["LOW", "Low"]];

/**
 * New / edit task or issue.
 * `compact`: one-line quick add under a deliverable (project & deliverable fixed).
 */
export function WorkItemForm({ projects, users, item, projectId, deliverableId, statusId, type, compact, onDone }: {
  projects: ProjectOpt[]; users: Opt[]; item?: WorkItemEdit; projectId?: string; deliverableId?: string; statusId?: string; type?: string; compact?: boolean; onDone?: () => void;
}) {
  const [pid, setPid] = useState(item?.projectId ?? projectId ?? projects[0]?.id ?? "");
  const [did, setDid] = useState(item?.deliverableId ?? deliverableId ?? "");
  const project = projects.find((p) => p.id === pid);
  const fixedProject = !!(item || projectId);

  if (compact) {
    return (
      <ActionForm action={saveWorkItem} resetOnOk className="flex flex-wrap items-center gap-2" onOk={onDone}>
        <input type="hidden" name="projectId" value={pid} />
        {did && <input type="hidden" name="deliverableId" value={did} />}
        <input name="title" required placeholder="New task — e.g. Draft report" className="input !w-auto min-w-48 flex-1 !py-1.5" />
        <select name="assigneeId" defaultValue="" className="input !w-40 !py-1.5" aria-label="Assignee"><option value="">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <input type="date" name="dueDate" className="input !w-36 !py-1.5" aria-label="Due date" />
        <SubmitButton className="btn-dark btn-sm">Add task</SubmitButton>
      </ActionForm>
    );
  }

  return (
    <ActionForm action={saveWorkItem} resetOnOk={!item} onOk={onDone} className="rounded-xl border border-line bg-mist/50 p-4">
      {item && <input type="hidden" name="id" value={item.id} />}
      {statusId && <input type="hidden" name="statusId" value={statusId} />}
      <input type="hidden" name="projectId" value={pid} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block sm:col-span-2 lg:col-span-4"><span className="label">Title *</span>
          <input name="title" required defaultValue={item?.title} className="input" placeholder="What needs to be done?" /></label>
        <label className="block"><span className="label">Project *</span>
          <select value={pid} disabled={fixedProject} onChange={(e) => { setPid(e.target.value); setDid(""); }} className="input">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
          </select></label>
        <label className="block"><span className="label">Deliverable</span>
          <select name="deliverableId" value={did} onChange={(e) => setDid(e.target.value)} className="input">
            <option value="">— none (general) —</option>
            {project?.deliverables.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select></label>
        <label className="block"><span className="label">Type</span>
          <select name="type" defaultValue={item?.type ?? type ?? "TASK"} className="input">{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="block"><span className="label">Priority</span>
          <select name="priority" defaultValue={item?.priority ?? "MEDIUM"} className="input">{PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="block sm:col-span-2"><span className="label">Description</span>
          <textarea name="description" rows={3} defaultValue={item?.description ?? ""} className="input" placeholder="Details, acceptance criteria, links…" /></label>
        <label className="block"><span className="label">Assignee</span>
          <select name="assigneeId" defaultValue={item?.assigneeId ?? ""} className="input"><option value="">— Unassigned —</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label className="block"><span className="label">Due date</span>
          <input type="date" name="dueDate" defaultValue={item?.dueDate ?? ""} className="input" /></label>
      </div>
      <div className="mt-3 flex justify-end"><SubmitButton className="btn-dark btn-sm">{item ? "Save" : "Create"}</SubmitButton></div>
    </ActionForm>
  );
}
