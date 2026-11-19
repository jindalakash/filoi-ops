"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "./client";
import { saveWorkItem } from "@/app/actions/work";
import { CustomFieldInputs } from "./CustomFieldInputs";
import { LabelChip } from "./LabelChip";
import { AttachmentPicker } from "./AttachmentPicker";
import type { FieldDef, CustomValues } from "@/lib/custom";

type Opt = { id: string; name: string };
export type ProjectOpt = { id: string; code: string; deliverables: { id: string; title: string }[] };
export type WorkItemEdit = { id: string; projectId: string; deliverableId: string | null; type: string; title: string; description: string | null; priority: string; assigneeId: string | null; dueDate: string; source?: string | null; clientContact?: string | null; reportedAt?: string; respondBy?: string; labelIds?: string[]; custom?: CustomValues };
export type LabelOpt = { id: string; name: string; color: string };

const TYPES = [["TASK", "Task"], ["ISSUE", "Client issue"], ["CHANGE", "Change request"]];
const PRIORITIES = [["URGENT", "Urgent"], ["HIGH", "High"], ["MEDIUM", "Medium"], ["LOW", "Low"]];
const SOURCES = [["EMAIL", "Email"], ["CALL", "Phone call"], ["MEETING", "Meeting"], ["PORTAL", "Client portal / system"], ["OTHER", "Other"]];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

/**
 * New / edit task or issue.
 * `compact`: one-line quick add under a deliverable (project & deliverable fixed).
 */
export function WorkItemForm({ projects, users, item, projectId, deliverableId, statusId, type, compact, onDone, labels = [], fields = [], sources }: {
  projects: ProjectOpt[]; users: Opt[]; item?: WorkItemEdit; projectId?: string; deliverableId?: string; statusId?: string; type?: string; compact?: boolean; onDone?: () => void;
  labels?: LabelOpt[]; fields?: FieldDef[]; sources?: { value: string; label: string }[];
}) {
  const [pid, setPid] = useState(item?.projectId ?? projectId ?? projects[0]?.id ?? "");
  const [did, setDid] = useState(item?.deliverableId ?? deliverableId ?? "");
  const [kind, setKind] = useState(item?.type ?? type ?? "TASK");
  const issue = kind === "ISSUE";
  const [defaults] = useState(() => ({ today: plusDays(0), respond: plusDays(2) }));
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
          <select name="type" value={kind} onChange={(e) => setKind(e.target.value)} className="input">{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="block"><span className="label">{issue ? "Severity" : "Priority"}</span>
          <select name="priority" defaultValue={item?.priority ?? "MEDIUM"} className="input">{PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="block sm:col-span-2"><span className="label">Description</span>
          <textarea name="description" rows={3} defaultValue={item?.description ?? ""} className="input" placeholder="Details, acceptance criteria, links…" /></label>
        <label className="block"><span className="label">Assignee</span>
          <select name="assigneeId" defaultValue={item?.assigneeId ?? ""} className="input"><option value="">— Unassigned —</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label className="block"><span className="label">{issue ? "Fix by" : "Due date"}</span>
          <input type="date" name="dueDate" defaultValue={item?.dueDate ?? ""} className="input" /></label>
        {issue && (
          <>
            <div className="-mb-1 mt-1 text-xs font-semibold text-plum sm:col-span-2 lg:col-span-4">Reported by the client</div>
            <label className="block"><span className="label">Reported by</span>
              <input name="clientContact" defaultValue={item?.clientContact ?? ""} className="input" placeholder="e.g. Dr Ana Ruiz, PAHO" /></label>
            <label className="block"><span className="label">How</span>
              <select name="source" defaultValue={item?.source ?? (sources?.[0]?.value ?? "EMAIL")} className="input">{(sources ?? SOURCES.map(([value, label]) => ({ value, label }))).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
            <label className="block"><span className="label">Reported on</span>
              <input type="date" name="reportedAt" defaultValue={item?.reportedAt ?? defaults.today} className="input" /></label>
            <label className="block"><span className="label">Respond by</span>
              <input type="date" name="respondBy" defaultValue={item?.respondBy ?? (item ? "" : defaults.respond)} className="input" /></label>
          </>
        )}
        {labels.length > 0 && (
          <fieldset className="sm:col-span-2 lg:col-span-4">
            <input type="hidden" name="labels__present" value="1" />
            <legend className="label">Labels</legend>
            <div className="flex flex-wrap gap-2">
              {labels.map((l) => (
                <label key={l.id} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-2 py-1 has-[:checked]:border-sky has-[:checked]:bg-sky/5">
                  <input type="checkbox" name="labelIds" value={l.id} defaultChecked={item?.labelIds?.includes(l.id)} className="h-3.5 w-3.5 accent-plum" />
                  <LabelChip name={l.name} color={l.color} />
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <CustomFieldInputs fields={fields} values={item?.custom} users={users} />
        {!item && (
          <div className="sm:col-span-2 lg:col-span-4">
            <AttachmentPicker label={issue ? "Screenshots & files from the client" : "Attachments"} />
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-end"><SubmitButton className="btn-dark btn-sm">{item ? "Save" : "Create"}</SubmitButton></div>
    </ActionForm>
  );
}
