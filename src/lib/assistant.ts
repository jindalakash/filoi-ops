import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { can } from "./permissions";
import { proposalAccess } from "./permissions-proposal";
import { readStored, mimeFor } from "./files";
import { documentText } from "./ai/text";
import { normalise } from "./ai/run";
import { CONTRACT_SCHEMA, TENDER_SCHEMA } from "./ai/schemas";
import { logActivity } from "./activity";
import { num, date } from "./format";
import type { CurrentUser } from "./auth";
import type { CostCategory, DeliverableStatus } from "@prisma/client";

type Tool = { name: string; description: string; input_schema: Anthropic.Beta.BetaTool.InputSchema; run: (input: Record<string, unknown>) => Promise<string> };
export type PageScope = { label: string; context: string; tools: Tool[]; refreshPaths: string[] };

const d = (s: unknown) => { if (typeof s !== "string" || !s.trim()) return null; const x = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s); return isNaN(+x) ? null : x; };
const iso = (x?: Date | null) => (x ? x.toISOString().slice(0, 10) : null);
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() && isFinite(Number(v)) ? Number(v) : null);
const cap = (t: string, max: number) => (t.length > max ? `${t.slice(0, max)}\n[…truncated]` : t);

async function docsText(ids: string[], max = 80_000) {
  const docs = await db.document.findMany({ where: { id: { in: ids } } });
  let out = "";
  for (const doc of docs) {
    try { out += `\n--- ${doc.fileName} ---\n${await documentText({ fileName: doc.fileName, mimeType: doc.mimeType ?? mimeFor(doc.fileName), buffer: await readStored(doc.storedName) })}`; } catch { /* unreadable */ }
  }
  return cap(out, max);
}

const DL_TYPES = ["DOCUMENT", "SYSTEM", "REPORT", "TRAINING", "DATA", "OTHER"];
const DL_STATUS = ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "REVISION", "ACCEPTED"];

/** Work out what page the user is on, what the assistant may see, and which changes it may make there. */
export async function scopeFor(url: string, user: CurrentUser): Promise<PageScope> {
  const u = new URL(url, "http://x");
  const p = u.pathname;
  const intake = u.searchParams.get("intake");
  let m: RegExpMatchArray | null;

  // ── Contract reading review ──
  if ((m = p.match(/^\/projects\/([^/]+)\/intake\/([^/]+)/))) {
    const [, projectId, xid] = m;
    const x = await db.aiExtraction.findUnique({ where: { id: xid } });
    const project = await db.project.findUnique({ where: { id: projectId }, include: { client: true } });
    if (!x || !project) return generic(p);
    const docs = await docsText(x.documentIds);
    return {
      label: "Contract reading review",
      refreshPaths: [p],
      context: `The user is reviewing an AI reading of a contract for project ${project.code} "${project.title}" (client ${project.client.name}, currency ${project.currency}).
Nothing is saved to the project until the user clicks "Create selected items"; you can rewrite the reading itself.
CURRENT READING (JSON):\n${JSON.stringify(x.result, null, 1)}\n\nCONTRACT TEXT:${docs || " (not available)"}`,
      tools: can(user.role, "projects") ? [{
        name: "replace_contract_reading",
        description: "Replace the whole contract reading shown on screen (contract details, deliverables, payment schedule, notes). Send the complete updated reading, not a diff. Use when the user wants deliverables or payments structured differently.",
        input_schema: CONTRACT_SCHEMA as unknown as Anthropic.Beta.BetaTool.InputSchema,
        run: async (input) => {
          const data = normalise(input) as { deliverables?: unknown[]; payment_schedule?: unknown[] };
          await db.aiExtraction.update({ where: { id: xid }, data: { result: data as object } });
          await logActivity(user.id, "ai", "project", projectId, "Ask AI revised the contract reading");
          return `Saved: ${data.deliverables?.length ?? 0} deliverables, ${data.payment_schedule?.length ?? 0} payments. The screen will refresh.`;
        },
      }] : [],
    };
  }

  // ── Tender reading review (new proposal or edit with ?intake=) ──
  if (intake && (p === "/opportunities/new" || /^\/opportunities\/[^/]+\/edit$/.test(p))) {
    const x = await db.aiExtraction.findUnique({ where: { id: intake } });
    if (x && x.kind === "TENDER") {
      const docs = await docsText(x.documentIds);
      return {
        label: "Tender reading review",
        refreshPaths: [p],
        context: `The user is reviewing an AI reading of a tender (TOR/RFP) that pre-fills the proposal form. The form reloads from this reading.
CURRENT READING (JSON):\n${JSON.stringify(x.result, null, 1)}\n\nTENDER TEXT:${docs || " (not available)"}`,
        tools: can(user.role, "presales") ? [{
          name: "replace_tender_reading",
          description: "Replace the whole tender reading that pre-fills the form. Send the complete updated reading.",
          input_schema: TENDER_SCHEMA as unknown as Anthropic.Beta.BetaTool.InputSchema,
          run: async (input) => {
            await db.aiExtraction.update({ where: { id: intake }, data: { result: normalise(input) as object } });
            return "Saved. The form will refresh with the new values (unsaved edits in the form are replaced).";
          },
        }] : [],
      };
    }
  }

  // ── Project ──
  if ((m = p.match(/^\/projects\/([^/]+)$/))) {
    const id = m[1];
    const pr = await db.project.findUnique({ where: { id }, include: { client: true, deliverables: { orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }] }, milestones: { orderBy: { dueDate: "asc" } } } });
    if (!pr) return generic(p);
    const fin = can(user.role, "financeView");
    const tools: Tool[] = [];
    if (can(user.role, "projects")) {
      tools.push({
        name: "save_deliverables",
        description: "Create or update deliverables. Give id to update an existing one; omit id to create.",
        input_schema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: {
          id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, type: { type: "string", description: `Deliverable type code, e.g. ${DL_TYPES.join(", ")} (or another type set up in Settings)` },
          due_date: { type: "string", description: "YYYY-MM-DD" }, status: { type: "string", enum: DL_STATUS } }, required: ["title"] } } }, required: ["items"] },
        run: async (input) => {
          const items = (input.items as Record<string, unknown>[]) ?? [];
          let seq = await db.deliverable.count({ where: { projectId: id } });
          let c = 0, upd = 0;
          for (const it of items) {
            const data = { title: s(it.title) ?? "Untitled", description: s(it.description), ...(it.type ? { type: String(it.type).toUpperCase() } : {}), ...(it.due_date !== undefined ? { dueDate: d(it.due_date) } : {}), ...(it.status ? { status: it.status as DeliverableStatus } : {}) };
            const ex = s(it.id) ? await db.deliverable.findFirst({ where: { id: s(it.id)!, projectId: id } }) : null;
            if (ex) { await db.deliverable.update({ where: { id: ex.id }, data }); upd++; } else { await db.deliverable.create({ data: { ...data, projectId: id, seq: ++seq } }); c++; }
          }
          await logActivity(user.id, "ai", "project", id, `Ask AI: ${c} deliverable(s) added, ${upd} updated`);
          return `${c} created, ${upd} updated.`;
        },
      }, {
        name: "delete_deliverables",
        description: "Delete deliverables by id (only when the user clearly asks).",
        input_schema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"] },
        run: async (input) => {
          const r = await db.deliverable.deleteMany({ where: { projectId: id, id: { in: (input.ids as string[]) ?? [] } } });
          await logActivity(user.id, "ai", "project", id, `Ask AI deleted ${r.count} deliverable(s)`);
          return `${r.count} deleted.`;
        },
      }, {
        name: "update_project",
        description: "Update project details. Only include fields to change.",
        input_schema: { type: "object", properties: { title: { type: "string" }, contract_no: { type: "string" }, start_date: { type: "string" }, end_date: { type: "string" }, description: { type: "string" }, ...(can(user.role, "finance") ? { contract_value: { type: "number" } } : {}) } },
        run: async (input) => {
          const data: Record<string, unknown> = {};
          if (s(input.title)) data.title = s(input.title);
          if (input.contract_no !== undefined) data.contractNo = s(input.contract_no);
          if (input.start_date !== undefined) data.startDate = d(input.start_date);
          if (input.end_date !== undefined) data.endDate = d(input.end_date);
          if (input.description !== undefined) data.description = s(input.description);
          if (n(input.contract_value) != null && can(user.role, "finance")) data.contractValue = n(input.contract_value);
          await db.project.update({ where: { id }, data });
          return `Updated: ${Object.keys(data).join(", ") || "nothing"}.`;
        },
      });
    }
    if (can(user.role, "finance")) {
      tools.push({
        name: "save_milestones",
        description: "Create or update billing milestones (payment schedule). Give id to update. Amounts in the project currency.",
        input_schema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: {
          id: { type: "string" }, title: { type: "string" }, amount: { type: "number" }, percent: { type: "number" }, due_date: { type: "string" }, deliverable_id: { type: "string" } }, required: ["title"] } } }, required: ["items"] },
        run: async (input) => {
          let c = 0, upd = 0;
          for (const it of (input.items as Record<string, unknown>[]) ?? []) {
            const amount = n(it.amount) ?? (n(it.percent) != null ? Math.round(num(pr.contractValue) * n(it.percent)!) / 100 : null);
            const data = { title: s(it.title) ?? "Milestone", ...(amount != null ? { amount } : {}), ...(n(it.percent) != null ? { percent: n(it.percent) } : {}), ...(it.due_date !== undefined ? { dueDate: d(it.due_date) } : {}), ...(it.deliverable_id !== undefined ? { deliverableId: s(it.deliverable_id) } : {}) };
            const ex = s(it.id) ? await db.milestone.findFirst({ where: { id: s(it.id)!, projectId: id } }) : null;
            if (ex) { if (ex.status !== "PLANNED") continue; await db.milestone.update({ where: { id: ex.id }, data }); upd++; }
            else if (amount != null) { await db.milestone.create({ data: { ...data, amount, projectId: id } }); c++; }
          }
          await logActivity(user.id, "ai", "project", id, `Ask AI: ${c} milestone(s) added, ${upd} updated`);
          return `${c} created, ${upd} updated (invoiced milestones are never changed).`;
        },
      }, {
        name: "delete_milestones",
        description: "Delete not-yet-invoiced billing milestones by id (only when the user clearly asks).",
        input_schema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"] },
        run: async (input) => {
          const r = await db.milestone.deleteMany({ where: { projectId: id, status: "PLANNED", id: { in: (input.ids as string[]) ?? [] } } });
          return `${r.count} deleted.`;
        },
      });
    }
    return {
      label: `Project ${pr.code}`,
      refreshPaths: [p],
      context: `Project ${pr.code} "${pr.title}" for ${pr.client.name}. Contract ${pr.contractNo ?? "—"}, ${iso(pr.startDate)} to ${iso(pr.endDate)}${fin ? `, value ${pr.currency} ${num(pr.contractValue)}` : ""}.
Description: ${pr.description ?? "—"}
DELIVERABLES:\n${pr.deliverables.map((x) => `- id=${x.id} | ${x.title} | ${x.type} | due ${iso(x.dueDate) ?? "—"} | ${x.status}${x.description ? ` | ${cap(x.description, 200)}` : ""}`).join("\n") || "(none)"}
${fin ? `BILLING MILESTONES:\n${pr.milestones.map((x) => `- id=${x.id} | ${x.title} | ${pr.currency} ${num(x.amount)}${x.percent ? ` (${num(x.percent)}%)` : ""} | invoice ${iso(x.dueDate) ?? "—"} | ${x.status} | deliverable ${x.deliverableId ?? "—"}`).join("\n") || "(none)"}` : ""}`,
      tools,
    };
  }

  // ── Proposal, its workspace, or a task on it ──
  let oppId: string | null = null, taskSection: string | null = null;
  if ((m = p.match(/^\/opportunities\/([^/]+)(\/workspace|\/edit)?$/)) && m[1] !== "new") oppId = m[1];
  if ((m = p.match(/^\/tasks\/([^/]+)$/))) {
    const t = await db.proposalTask.findUnique({ where: { id: m[1] } });
    if (t) { oppId = t.opportunityId; taskSection = t.sectionId; }
  }
  if (oppId) {
    const o = await db.opportunity.findUnique({ where: { id: oppId }, include: { client: true, sections: { orderBy: { seq: "asc" } }, team: { include: { expert: true } }, finLines: { orderBy: { seq: "asc" } } } });
    if (!o) return generic(p);
    const acc = await proposalAccess(user, o.id);
    const tools: Tool[] = [];
    if (acc.manage) tools.push({
      name: "update_proposal",
      description: "Update proposal details. Only include fields to change.",
      input_schema: { type: "object", properties: { title: { type: "string" }, reference_no: { type: "string" }, submission_deadline: { type: "string", description: "YYYY-MM-DDTHH:mm" }, scope_summary: { type: "string" }, eligibility: { type: "string" }, required_documents: { type: "array", items: { type: "string" } }, notes: { type: "string" }, estimated_value: { type: "number" }, duration_months: { type: "integer" } } },
      run: async (input) => {
        const data: Record<string, unknown> = {};
        if (s(input.title)) data.title = s(input.title);
        if (input.reference_no !== undefined) data.referenceNo = s(input.reference_no);
        if (input.submission_deadline !== undefined) data.submissionDeadline = d(input.submission_deadline);
        if (input.scope_summary !== undefined) data.scopeSummary = s(input.scope_summary);
        if (input.eligibility !== undefined) data.eligibility = s(input.eligibility);
        if (Array.isArray(input.required_documents)) data.requiredDocuments = (input.required_documents as string[]).join("\n");
        if (input.notes !== undefined) data.notes = s(input.notes);
        if (n(input.estimated_value) != null) data.estimatedValue = n(input.estimated_value);
        if (n(input.duration_months) != null) data.durationMonths = Math.round(n(input.duration_months)!);
        await db.opportunity.update({ where: { id: o.id }, data });
        await logActivity(user.id, "ai", "opportunity", o.id, `Ask AI updated ${Object.keys(data).join(", ")}`);
        return `Updated: ${Object.keys(data).join(", ") || "nothing"}.`;
      },
    });
    if (acc.technical) tools.push({
      name: "write_section",
      description: "Write or replace the full text of a technical-proposal section (markdown-light: ### headings, - bullets, **bold**). Give section_id to replace an existing one, or a new title to add a section. Follow the drafting rules: no invented facts, [placeholders] for missing ones.",
      input_schema: { type: "object", properties: { section_id: { type: "string" }, title: { type: "string" }, content: { type: "string" } }, required: ["content"] },
      run: async (input) => {
        const content = String(input.content ?? "");
        const ex = s(input.section_id) ? await db.proposalSection.findFirst({ where: { id: s(input.section_id)!, opportunityId: o.id } }) : null;
        if (ex) { await db.proposalSection.update({ where: { id: ex.id }, data: { content, aiModel: "Ask AI", updatedById: user.id, ...(s(input.title) ? { title: s(input.title)! } : {}) } }); return `Section “${ex.title}” updated (${content.split(/\s+/).length} words).`; }
        const title = s(input.title) ?? "New section";
        await db.proposalSection.create({ data: { opportunityId: o.id, title, content, aiModel: "Ask AI", updatedById: user.id, seq: await db.proposalSection.count({ where: { opportunityId: o.id } }) } });
        return `Section “${title}” added.`;
      },
    });
    if (acc.financial) tools.push({
      name: "replace_cost_lines",
      description: "Replace all financial-proposal cost lines. Rates in the proposal currency.",
      input_schema: { type: "object", properties: { lines: { type: "array", items: { type: "object", properties: { category: { type: "string", enum: ["FEES", "TRAVEL", "PER_DIEM", "OTHER"] }, description: { type: "string" }, unit: { type: "string" }, quantity: { type: "number" }, rate: { type: "number" } }, required: ["category", "description", "unit", "quantity", "rate"] } } }, required: ["lines"] },
      run: async (input) => {
        const lines = ((input.lines as Record<string, unknown>[]) ?? []).filter((l) => s(l.description) && (n(l.quantity) ?? 0) > 0);
        await db.$transaction([
          db.financialLine.deleteMany({ where: { opportunityId: o.id } }),
          ...lines.map((l, i) => db.financialLine.create({ data: { opportunityId: o.id, seq: i, category: l.category as CostCategory, description: s(l.description)!, unit: s(l.unit) ?? "day", quantity: n(l.quantity)!, rate: n(l.rate) ?? 0 } })),
        ]);
        return `${lines.length} cost lines saved — click “Save financial proposal” to update the proposal value.`;
      },
    });
    const total = o.finLines.reduce((a, l) => a + num(l.quantity) * num(l.rate), 0);
    return {
      label: `Proposal ${o.code}`,
      refreshPaths: [p],
      context: `Proposal ${o.code} "${o.title}" for ${o.client.name}. Status ${o.status}. Deadline ${o.submissionDeadline ? date(o.submissionDeadline) : "—"}. Currency ${o.currency}, value ${o.estimatedValue ? num(o.estimatedValue) : "—"}, duration ${o.durationMonths ?? "—"} months.
Scope: ${cap(o.scopeSummary ?? "—", 2000)}
Eligibility: ${cap(o.eligibility ?? "—", 1500)}
Documents to submit: ${o.requiredDocuments ?? "—"}
${taskSection ? `The user is on a task for section id=${taskSection}.\n` : ""}SECTIONS:\n${o.sections.map((x) => `- id=${x.id} | ${x.title} | ${x.content.trim() ? `${x.content.split(/\s+/).length} words: ${cap(x.content, 1500)}` : "empty"}`).join("\n") || "(none)"}
TEAM: ${o.team.map((t) => `${t.position}: ${t.expert.name}${t.inputDays ? ` (${num(t.inputDays)} days)` : ""}`).join("; ") || "—"}
${acc.financial ? `COST LINES (${o.currency}, total ${total}):\n${o.finLines.map((l) => `- ${l.category} | ${l.description} | ${num(l.quantity)} ${l.unit} × ${num(l.rate)}`).join("\n") || "(none)"}` : ""}`,
      tools,
    };
  }
  return generic(p);
}

function generic(p: string): PageScope {
  return { label: "This page", refreshPaths: [p], context: `The user is on ${p}. You can explain how Filoi Ops works and answer questions; changes on this page are not available through chat yet.`, tools: [] };
}
