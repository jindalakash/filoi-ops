"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { proposalAccess } from "@/lib/permissions-proposal";
import { guard, req, str, numOf, FormError } from "@/lib/form";
import { logActivity } from "@/lib/activity";
import { STANDARD_SECTIONS } from "@/lib/proposal-meta";
import { proposalContext, DRAFT_SYSTEM } from "@/lib/proposal-context";
import { draftText, draftFinancialLines, AiError } from "@/lib/ai/run";
import { getSetting } from "@/lib/settings";
import { toINR } from "@/lib/fx";
import { num } from "@/lib/format";
import type { ActionState } from "@/components/client";
import type { CostCategory } from "@prisma/client";

const ws = (id: string) => {
  revalidatePath(`/opportunities/${id}/workspace`);
  revalidatePath("/tasks", "layout"); // task pages embed the same sections / financials
};

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

/** Draft one section; shared by "Draft with AI" and "Draft the whole technical proposal". */
async function draftOne(sectionId: string, userId: string, extra?: string | null) {
  const s = await db.proposalSection.findUniqueOrThrow({ where: { id: sectionId } });
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
  if (!r.text) throw new AiError("The AI returned an empty draft. Try again.");
  await db.proposalSection.update({ where: { id: s.id }, data: { content: r.text, aiModel: r.model, updatedById: userId } });
  const cache = r.cacheRead ? ` · ${Math.round(r.cacheRead / 1000)}k tokens from cache` : r.cacheWrite ? ` · cached ${Math.round(r.cacheWrite / 1000)}k tokens for the next sections` : "";
  await logActivity(userId, "ai", "opportunity", s.opportunityId, `AI drafted “${s.title}” (${r.model}${cache})`);
  return { s, r };
}

const aiFail = (e: unknown) => {
  if (e instanceof AiError || e instanceof FormError) return { error: e.message };
  console.error("[ai] draft", e);
  return { error: "The AI service failed. Please try again." };
};

/** AI writes (or rewrites) a section using the TOR, team, references, company profile and past proposals. */
export async function draftSection(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await db.proposalSection.findUniqueOrThrow({ where: { id: req(fd, "id") } });
    const user = await gate(s.opportunityId);
    const { r } = await draftOne(s.id, user.id, str(fd, "instructions"));
    ws(s.opportunityId);
    return { ok: `Drafted with ${r.model}${r.cacheRead ? " (reused cached context — cheaper)" : ""}. Review and edit before using.` };
  } catch (e) { return aiFail(e); }
}

/** Draft every empty section in order (adds the standard structure first if there are no sections). */
export async function draftAllSections(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const opportunityId = req(fd, "opportunityId");
    const user = await gate(opportunityId);
    if ((await db.proposalSection.count({ where: { opportunityId } })) === 0) {
      let seq = 0;
      for (const st of STANDARD_SECTIONS) await db.proposalSection.create({ data: { opportunityId, title: st.title, guidance: st.guidance, seq: seq++ } });
    }
    const rewrite = fd.get("rewrite") === "on";
    const sections = await db.proposalSection.findMany({ where: { opportunityId }, orderBy: [{ seq: "asc" }, { createdAt: "asc" }] });
    const todo = sections.filter((x) => rewrite || !x.content.trim());
    if (!todo.length) return { ok: "Every section already has text. Tick “also improve sections that have text” to revise them." };
    const extra = str(fd, "instructions");
    let done = 0;
    for (const sec of todo) {
      await draftOne(sec.id, user.id, extra);
      done++;
    }
    ws(opportunityId);
    return { ok: `Drafted ${done} section${done > 1 ? "s" : ""}. Review each one and edit before submitting.` };
  } catch (e) { ws(String(fd.get("opportunityId") ?? "")); return aiFail(e); }
}

/** AI proposes the cost breakdown from the TOR, the team's rates and past financial proposals; you review and save. */
export async function draftFinancial(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const opportunityId = req(fd, "opportunityId");
    const user = await gate(opportunityId, "financial");
    const [{ stable, opportunity: o }, team, fins, fx] = await Promise.all([
      proposalContext(opportunityId),
      db.proposalTeamMember.findMany({ where: { opportunityId }, include: { expert: true }, orderBy: { seq: "asc" } }),
      db.libraryItem.findMany({ where: { kind: "FIN_TEMPLATE", textContent: { not: null } }, take: 3, orderBy: { createdAt: "desc" } }),
      getSetting("fx"),
    ]);
    const cur = o.currency || "USD";
    const rateIn = (v: unknown, from: string) => Math.round((toINR(v, from, fx) / (fx[cur as keyof typeof fx] ?? 1)) * 100) / 100;
    const ctx = [
      stable,
      `=== FINANCIAL PROPOSAL BASICS ===\nCurrency: ${cur}\nDuration: ${o.durationMonths ?? "?"} months\n${o.estimatedValue ? `Current indicative value: ${cur} ${num(o.estimatedValue)}` : ""}`,
      team.length ? `=== TEAM DAILY RATES (in ${cur}) ===\n${team.map((m) => `- ${m.expert.name} (${m.position}${m.isKey ? ", key expert" : ""}): ${m.expert.dailyRate ? `${cur} ${rateIn(m.expert.dailyRate, m.expert.rateCurrency)} / day` : "rate not set"}${m.inputDays ? `; planned ${num(m.inputDays)} days` : ""}`).join("\n")}` : "=== TEAM ===\n(No team selected yet — propose generic positions with estimated rates and say so.)",
      fins.length ? `=== OUR PAST FINANCIAL PROPOSALS (follow their structure) ===\n${fins.map((f) => `--- ${f.title} ---\n${(f.textContent ?? "").slice(0, 15_000)}`).join("\n\n")}` : "",
      str(fd, "instructions") ? `=== INSTRUCTIONS FROM THE BID TEAM ===\n${str(fd, "instructions")}` : "",
    ].filter(Boolean).join("\n\n");
    const r = await draftFinancialLines(ctx);
    const lines = r.data.lines.filter((l) => l.description && l.quantity > 0);
    if (!lines.length) return { error: "The AI did not return any cost lines. Add the team first, then try again." };
    const byName = new Map(team.map((m) => [m.expert.name.toLowerCase(), m.expertId]));
    await db.$transaction([
      db.financialLine.deleteMany({ where: { opportunityId } }),
      ...lines.map((l, i) => db.financialLine.create({ data: {
        opportunityId, seq: i, category: l.category as CostCategory, unit: l.unit || "day", quantity: l.quantity, rate: l.rate || 0,
        description: l.basis && /estimate/i.test(l.basis) ? `${l.description} (estimate)` : l.description,
        expertId: l.expert_name ? byName.get(l.expert_name.toLowerCase()) ?? null : null,
      } })),
      db.opportunity.update({ where: { id: opportunityId }, data: { finNotes: r.data.notes, ...(o.finTaxRate == null ? { finTaxRate: 0 } : {}) } }),
    ]);
    await logActivity(user.id, "ai", "opportunity", opportunityId, `AI drafted the financial proposal (${lines.length} lines, ${r.model})`);
    ws(opportunityId);
    revalidatePath(`/opportunities/${opportunityId}`);
    return { ok: `AI drafted ${lines.length} cost lines with ${r.model}. Check quantities and rates, then click “Save financial proposal”.` };
  } catch (e) { return aiFail(e); }
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
