"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { guard, req, str, FormError } from "@/lib/form";
import { saveUpload, readStored, deleteStored } from "@/lib/files";
import { logActivity } from "@/lib/activity";
import { extractTender, extractContract, AiError } from "@/lib/ai/run";
import type { SourceDoc } from "@/lib/ai/text";
import type { ActionState } from "@/components/client";
import type { DeliverableType, DocCategory } from "@prisma/client";

const ACCEPT = /\.(pdf|docx|txt|md)$/i;

async function collectDocs(fd: FormData, link: { opportunityId?: string | null; projectId?: string | null }, category: (name: string) => DocCategory, userId: string) {
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  for (const f of files) if (!ACCEPT.test(f.name)) throw new FormError(`${f.name}: please upload PDF, Word (.docx) or text files.`);
  const created: string[] = [];
  for (const f of files) {
    const saved = await saveUpload(f);
    const doc = await db.document.create({ data: { ...saved, category: category(f.name), opportunityId: link.opportunityId ?? null, projectId: link.projectId ?? null, uploadedById: userId } });
    created.push(doc.id);
  }
  const existing = fd.getAll("docIds").map(String).filter(Boolean);
  const ids = [...existing, ...created];
  if (!ids.length) throw new FormError("Choose at least one document.");
  const docs = await db.document.findMany({ where: { id: { in: ids } } });
  const sources: SourceDoc[] = [];
  for (const d of docs) sources.push({ fileName: d.fileName, mimeType: d.mimeType ?? "", buffer: await readStored(d.storedName) });
  return { ids, created, sources };
}

async function discardUploads(ids: string[]) {
  const docs = await db.document.findMany({ where: { id: { in: ids } } });
  await db.document.deleteMany({ where: { id: { in: ids } } });
  await Promise.all(docs.map((d) => deleteStored(d.storedName)));
}

const msg = (e: unknown) => (e instanceof AiError || e instanceof FormError ? e.message : "The AI service failed. Please try again.");

/** TOR / RFP → AI → prefilled proposal form (new, or an existing proposal's edit page) */
export async function analyzeTender(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("presales");
  let target = "";
  const opportunityId = str(fd, "opportunityId") ?? null;
  let created: string[] = [];
  try {
    const c = await collectDocs(fd, { opportunityId }, (n) => (/rfp|rfq|itb|tender|bid/i.test(n) ? "RFP" : "TOR"), user.id);
    created = c.created;
    const r = await extractTender(c.sources);
    const x = await db.aiExtraction.create({
      data: { kind: "TENDER", result: r.data as object, documentIds: c.ids, provider: r.provider, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, opportunityId, createdById: user.id },
    });
    await logActivity(user.id, "ai", opportunityId ? "opportunity" : "ai", opportunityId ?? x.id, `AI read ${c.sources.map((s) => s.fileName).join(", ")} (${r.model})`);
    target = opportunityId ? `/opportunities/${opportunityId}/edit?intake=${x.id}` : `/opportunities/new?intake=${x.id}`;
  } catch (e) {
    if (!opportunityId && created.length) await discardUploads(created);
    if (!(e instanceof AiError || e instanceof FormError)) console.error("[ai] tender extraction failed", e);
    return { error: msg(e) };
  }
  redirect(target);
}

/** Contract / PO → AI → review screen for deliverables & payment schedule */
export async function analyzeContract(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("projects");
  const projectId = req(fd, "projectId");
  let target = "";
  try {
    const c = await collectDocs(fd, { projectId }, (n) => (/\bpo\b|purchase/i.test(n) ? "PURCHASE_ORDER" : "CONTRACT"), user.id);
    const r = await extractContract(c.sources);
    const x = await db.aiExtraction.create({
      data: { kind: "CONTRACT", result: r.data as object, documentIds: c.ids, provider: r.provider, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, projectId, createdById: user.id },
    });
    await logActivity(user.id, "ai", "project", projectId, `AI read contract ${c.sources.map((s) => s.fileName).join(", ")} (${r.model})`);
    revalidatePath(`/projects/${projectId}`);
    target = `/projects/${projectId}/intake/${x.id}`;
  } catch (e) {
    if (!(e instanceof AiError || e instanceof FormError)) console.error("[ai] contract extraction failed", e);
    return { error: msg(e) };
  }
  redirect(target);
}

/** Apply the reviewed contract extraction: project fields, deliverables, billing milestones */
export async function applyContract(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("projects");
  return guard(async () => {
    const id = req(fd, "extractionId");
    const x = await db.aiExtraction.findUniqueOrThrow({ where: { id } });
    if (x.status !== "READY" || !x.projectId) return { error: "This reading was already applied or discarded." };
    const projectId = x.projectId;
    const d = (k: string) => { const s = str(fd, k); return s ? new Date(`${s}T00:00:00`) : null; };
    const n = (k: string) => { const s = str(fd, k); if (!s) return null; const v = Number(s.replace(/,/g, "")); return Number.isFinite(v) ? v : null; };

    // 1. project fields (only those ticked)
    const upd: Record<string, unknown> = {};
    if (fd.get("apply_contractNo")) upd.contractNo = str(fd, "contractNo");
    if (fd.get("apply_contractDate")) upd.contractDate = d("contractDate");
    if (fd.get("apply_contractValue") && can(user.role, "finance")) upd.contractValue = n("contractValue") ?? 0;
    if (fd.get("apply_currency")) upd.currency = str(fd, "currency") ?? undefined;
    if (fd.get("apply_startDate")) upd.startDate = d("startDate");
    if (fd.get("apply_endDate")) upd.endDate = d("endDate");
    if (fd.get("apply_notes")) {
      const p = await db.project.findUniqueOrThrow({ where: { id: projectId } });
      upd.description = [p.description, str(fd, "notes")].filter(Boolean).join("\n\n");
    }
    if (Object.keys(upd).length) await db.project.update({ where: { id: projectId }, data: upd });

    // 2. deliverables
    const dlCount = Number(fd.get("dlCount") || 0);
    const dlIds = new Map<string, string>();
    let seq = await db.deliverable.count({ where: { projectId } });
    let dlMade = 0;
    for (let i = 0; i < dlCount; i++) {
      if (!fd.get(`dl_include_${i}`)) continue;
      const title = str(fd, `dl_title_${i}`);
      if (!title) continue;
      const dl = await db.deliverable.create({
        data: { projectId, seq: ++seq, title, description: str(fd, `dl_desc_${i}`), type: (str(fd, `dl_type_${i}`) || "DOCUMENT") as DeliverableType, dueDate: d(`dl_due_${i}`) },
      });
      dlIds.set(`new:${i}`, dl.id);
      dlMade++;
    }

    // 3. billing milestones (finance roles only)
    let msMade = 0;
    if (can(user.role, "finance")) {
      const msCount = Number(fd.get("msCount") || 0);
      for (let i = 0; i < msCount; i++) {
        if (!fd.get(`ms_include_${i}`)) continue;
        const title = str(fd, `ms_title_${i}`);
        const amount = n(`ms_amount_${i}`);
        if (!title || !amount) continue;
        const link = str(fd, `ms_dl_${i}`);
        const deliverableId = link?.startsWith("new:") ? dlIds.get(link) ?? null : link?.startsWith("id:") ? link.slice(3) : null;
        await db.milestone.create({ data: { projectId, title, amount, percent: n(`ms_percent_${i}`), dueDate: d(`ms_due_${i}`), deliverableId } });
        msMade++;
      }
    }
    await db.aiExtraction.update({ where: { id }, data: { status: "APPLIED", appliedAt: new Date() } });
    await logActivity(user.id, "ai", "project", projectId, `Applied AI contract reading: ${dlMade} deliverables, ${msMade} billing milestones`);
    revalidatePath(`/projects/${projectId}`);
    redirect(`/projects/${projectId}?tab=deliverables&applied=${dlMade}-${msMade}`);
  });
}

export async function discardExtraction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  return guard(async () => {
    const x = await db.aiExtraction.update({ where: { id: req(fd, "id") }, data: { status: "DISCARDED" } });
    // files uploaded for a brand-new proposal that was never saved are removed again
    if (!x.opportunityId && !x.projectId) {
      const orphans = await db.document.findMany({ where: { id: { in: x.documentIds }, opportunityId: null, projectId: null, deliverableId: null }, select: { id: true } });
      await discardUploads(orphans.map((o) => o.id));
    }
    redirect(x.projectId ? `/projects/${x.projectId}?tab=documents` : x.opportunityId ? `/opportunities/${x.opportunityId}` : "/opportunities/new");
  });
}
