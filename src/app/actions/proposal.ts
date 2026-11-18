"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { proposalAccess } from "@/lib/permissions-proposal";
import { guard, req, str, numOf, FormError } from "@/lib/form";
import { logActivity } from "@/lib/activity";
import { STANDARD_SECTIONS } from "@/lib/proposal-meta";
import { proposalContext, DRAFT_SYSTEM } from "@/lib/proposal-context";
import { draftText, AiError } from "@/lib/ai/run";
import type { ActionState } from "@/components/client";
import type { CostCategory } from "@prisma/client";

const ws = (id: string) => revalidatePath(`/opportunities/${id}/workspace`);

async function gate(opportunityId: string, need: "technical" | "financial" | "manage" = "technical") {
  const user = await requireUser();
  const a = await proposalAccess(user, opportunityId);
  if (!a[need]) throw new FormError("You don't have edit access to this proposal.");
  return user;
}

// ── Sections ──
export async function addStandardSections(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const opportunityId = req(fd, "opportunityId");
    await gate(opportunityId);
    const have = new Set((await db.proposalSection.findMany({ where: { opportunityId }, select: { title: true } })).map((s) => s.title.toLowerCase()));
    let seq = have.size;
    const add = STANDARD_SECTIONS.filter((s) => !have.has(s.title.toLowerCase()));
    for (const s of add) await db.proposalSection.create({ data: { opportunityId, title: s.title, guidance: s.guidance, seq: seq++ } });
    ws(opportunityId);
    return { ok: add.length ? `${add.length} sections added.` : "All standard sections are already there." };
  });
}

export async function addSection(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const opportunityId = req(fd, "opportunityId");
    await gate(opportunityId);
    const seq = await db.proposalSection.count({ where: { opportunityId } });
    await db.proposalSection.create({ data: { opportunityId, title: req(fd, "title", "Section title"), guidance: str(fd, "guidance"), seq } });
    ws(opportunityId);
    return { ok: "Section added." };
  });
}

export async function saveSection(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const s = await db.proposalSection.findUniqueOrThrow({ where: { id: req(fd, "id") } });
    const user = await gate(s.opportunityId);
    await db.proposalSection.update({ where: { id: s.id }, data: { title: req(fd, "title", "Title"), guidance: str(fd, "guidance"), content: String(fd.get("content") ?? ""), updatedById: user.id } });
    ws(s.opportunityId);
    return { ok: "Saved." };
  });
}

export async function moveSection(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const s = await db.proposalSection.findUniqueOrThrow({ where: { id: req(fd, "id") } });
    await gate(s.opportunityId);
    const all = await db.proposalSection.findMany({ where: { opportunityId: s.opportunityId }, orderBy: [{ seq: "asc" }, { createdAt: "asc" }] });
    const i = all.findIndex((x) => x.id === s.id);
    const j = str(fd, "dir") === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= all.length) return { ok: "" };
    [all[i], all[j]] = [all[j], all[i]];
    await Promise.all(all.map((x, k) => db.proposalSection.update({ where: { id: x.id }, data: { seq: k } })));
    ws(s.opportunityId);
    return { ok: "" };
  });
}

export async function deleteSection(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const s = await db.proposalSection.findUniqueOrThrow({ where: { id: req(fd, "id") } });
    await gate(s.opportunityId);
    await db.proposalSection.delete({ where: { id: s.id } });
    ws(s.opportunityId);
    return { ok: "Section removed." };
  });
}

/** AI writes (or rewrites) a section using the TOR, team, references, company profile and past proposals. */
export async function draftSection(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await db.proposalSection.findUniqueOrThrow({ where: { id: req(fd, "id") } });
    const user = await gate(s.opportunityId);
    const extra = str(fd, "instructions");
    const { stable, volatile } = await proposalContext(s.opportunityId, s.id);
    const request = [
      volatile,
      `Write the proposal section titled "${s.title}".`,
      s.guidance && `It should cover: ${s.guidance}`,
      s.content.trim() && `Improve and complete this existing draft rather than starting over:\n"""\n${s.content.slice(0, 20_000)}\n"""`,
      extra && `Additional instructions from the bid team: ${extra}`,
      "Aim for 400–900 words unless the instructions say otherwise.",
    ].filter(Boolean).join("\n\n");
    const r = await draftText(DRAFT_SYSTEM, stable, request);
    if (!r.text) return { error: "The AI returned an empty draft. Try again." };
    await db.proposalSection.update({ where: { id: s.id }, data: { content: r.text, aiModel: r.model, updatedById: user.id } });
    const cache = r.cacheRead ? ` · ${Math.round(r.cacheRead / 1000)}k tokens from cache` : r.cacheWrite ? ` · cached ${Math.round(r.cacheWrite / 1000)}k tokens for the next sections` : "";
    await logActivity(user.id, "ai", "opportunity", s.opportunityId, `AI drafted “${s.title}” (${r.model}${cache})`);
    ws(s.opportunityId);
    return { ok: `Drafted with ${r.model}${r.cacheRead ? " (reused cached context — cheaper)" : ""}. Review and edit before using.` };
  } catch (e) {
    if (e instanceof AiError || e instanceof FormError) return { error: e.message };
    console.error("[ai] draft", e);
    return { error: "The AI service failed. Please try again." };
  }
}

// ── Team ──
export async function addTeamMember(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const opportunityId = req(fd, "opportunityId");
    await gate(opportunityId);
    const expertId = req(fd, "expertId", "Expert");
    const position = req(fd, "position", "Position");
    const seq = await db.proposalTeamMember.count({ where: { opportunityId } });
    await db.proposalTeamMember.upsert({
      where: { opportunityId_expertId_position: { opportunityId, expertId, position } },
      create: { opportunityId, expertId, position, isKey: fd.get("isKey") === "on", inputDays: numOf(fd, "inputDays"), seq },
      update: { isKey: fd.get("isKey") === "on", inputDays: numOf(fd, "inputDays") },
    });
    ws(opportunityId);
    return { ok: "Added to the team." };
  });
}

export async function updateTeamMember(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const m = await db.proposalTeamMember.findUniqueOrThrow({ where: { id: req(fd, "id") } });
    await gate(m.opportunityId);
    await db.proposalTeamMember.update({ where: { id: m.id }, data: { position: req(fd, "position", "Position"), inputDays: numOf(fd, "inputDays"), isKey: fd.get("isKey") === "on" } });
    ws(m.opportunityId);
    return { ok: "Saved." };
  });
}

export async function removeTeamMember(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const m = await db.proposalTeamMember.findUniqueOrThrow({ where: { id: req(fd, "id") } });
    await gate(m.opportunityId);
    await db.proposalTeamMember.delete({ where: { id: m.id } });
    ws(m.opportunityId);
    return { ok: "Removed." };
  });
}

// ── References ──
export async function toggleReference(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const opportunityId = req(fd, "opportunityId");
    await gate(opportunityId);
    const referenceId = req(fd, "referenceId");
    const key = { opportunityId_referenceId: { opportunityId, referenceId } };
    if (await db.proposalReference.findUnique({ where: key })) await db.proposalReference.delete({ where: key });
    else await db.proposalReference.create({ data: { opportunityId, referenceId, seq: await db.proposalReference.count({ where: { opportunityId } }) } });
    ws(opportunityId);
    return { ok: "" };
  });
}

// ── Financial proposal ──
type LineIn = { category: CostCategory; description: string; expertId?: string | null; unit: string; quantity: number; rate: number };

export async function saveFinancial(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const opportunityId = req(fd, "opportunityId");
    const user = await gate(opportunityId, "financial");
    let lines: LineIn[];
    try { lines = JSON.parse(String(fd.get("lines") || "[]")); } catch { throw new FormError("Could not read the cost lines."); }
    lines = lines.filter((l) => l.description?.trim() && Number(l.quantity) > 0);
    const taxRate = numOf(fd, "taxRate") ?? 0;
    await db.$transaction([
      db.financialLine.deleteMany({ where: { opportunityId } }),
      ...lines.map((l, i) => db.financialLine.create({ data: { opportunityId, seq: i, category: l.category, description: l.description.trim(), expertId: l.expertId || null, unit: l.unit || "day", quantity: Number(l.quantity), rate: Number(l.rate) || 0 } })),
      db.opportunity.update({ where: { id: opportunityId }, data: { finTaxRate: taxRate, finNotes: str(fd, "finNotes"), ...(fd.get("currency") ? { currency: String(fd.get("currency")) } : {}) } }),
    ]);
    const subtotal = lines.reduce((a, l) => a + Number(l.quantity) * (Number(l.rate) || 0), 0);
    const total = Math.round(subtotal * (1 + taxRate / 100) * 100) / 100;
    if (fd.get("setValue") === "on") await db.opportunity.update({ where: { id: opportunityId }, data: { estimatedValue: total } });
    await logActivity(user.id, "update", "opportunity", opportunityId, `Updated financial proposal (${lines.length} lines)`);
    ws(opportunityId);
    revalidatePath(`/opportunities/${opportunityId}`);
    return { ok: `Saved ${lines.length} cost line(s).${fd.get("setValue") === "on" ? " Proposal value updated." : ""}` };
  });
}
