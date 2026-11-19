"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { guard, req, str, FormError } from "@/lib/form";
import { logActivity } from "@/lib/activity";
import { getSetting } from "@/lib/settings";
import { draftWorkPlan, AiError } from "@/lib/ai/run";
import { createDeliverableTasks } from "@/lib/work";
import { date } from "@/lib/format";
import type { ActionState } from "@/components/client";

const TYPE_LABEL: Record<string, string> = { DOCUMENT: "Document / report", SYSTEM: "System / software", REPORT: "Progress report", TRAINING: "Training / workshop", DATA: "Data / dataset", OTHER: "Other" };

/** Everything the model needs about this deliverable, as plain text. */
async function contextFor(deliverableId: string) {
  const dl = await db.deliverable.findUniqueOrThrow({
    where: { id: deliverableId },
    include: {
      owner: true,
      workItems: { select: { title: true } },
      project: { include: { client: true, manager: true, deliverables: { select: { title: true, dueDate: true, type: true }, orderBy: { dueDate: { sort: "asc", nulls: "last" } } } } },
    },
  });
  const p = dl.project;
  const [team, tpl, contract, similar] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { name: true, designation: true, role: true } }),
    getSetting("taskTemplates"),
    db.aiExtraction.findFirst({ where: { projectId: p.id, kind: "CONTRACT", status: { not: "DISCARDED" } }, orderBy: { createdAt: "desc" } }),
    // tasks the team already planned for deliverables of the same type — the house style
    db.workItem.findMany({ where: { deliverable: { type: dl.type, id: { not: dl.id } }, type: "TASK" }, select: { title: true, deliverable: { select: { title: true } } }, take: 30, orderBy: { createdAt: "desc" } }),
  ]);
  const contractDl = (contract?.result as { deliverables?: { title?: string; description?: string; timing?: string; acceptance?: string }[] } | null)?.deliverables
    ?.find((x) => x.title && x.title.trim().toLowerCase() === dl.title.trim().toLowerCase());
  const lines = [
    `PROJECT: ${p.code} — ${p.title}`,
    `Client: ${p.client.name}${p.contractNo ? ` · Contract ${p.contractNo}` : ""}`,
    `Project dates: ${date(p.startDate)} to ${date(p.endDate)}`,
    p.description ? `Project description:\n${p.description}` : "",
    "",
    `DELIVERABLE TO PLAN: ${dl.title}`,
    `Type: ${TYPE_LABEL[dl.type] ?? dl.type}`,
    `Due: ${dl.dueDate ? date(dl.dueDate) : "not set"}`,
    `Owner: ${dl.owner?.name ?? "not set"}`,
    dl.description ? `Description / acceptance criteria:\n${dl.description}` : "",
    contractDl ? `From the contract:\n${JSON.stringify(contractDl)}` : "",
    "",
    `Other deliverables in this contract:\n${p.deliverables.filter((x) => x.title !== dl.title).map((x) => `- ${x.title} (${TYPE_LABEL[x.type] ?? x.type}, due ${date(x.dueDate)})`).join("\n") || "none"}`,
    "",
    `Team (name — designation — app role):\n${team.map((u) => `- ${u.name} — ${u.designation ?? "—"} — ${u.role.replace("_", " ").toLowerCase()}`).join("\n")}`,
    p.manager ? `Project manager: ${p.manager.name}` : "",
    "",
    `Tasks that already exist for this deliverable (do not repeat):\n${dl.workItems.map((w) => `- ${w.title}`).join("\n") || "none"}`,
    `Firm's standard template for this type:\n${(tpl.types[dl.type] ?? []).map((t) => `- ${t.title} (${t.daysBefore} days before due)`).join("\n") || "none"}`,
    similar.length ? `Tasks the team used on similar deliverables:\n${similar.map((s) => `- ${s.title} (for ${s.deliverable?.title ?? "?"})`).join("\n")}` : "",
  ];
  return { dl, text: lines.filter((x) => x !== "").join("\n") };
}

/** Ask AI to split a deliverable into tasks; the result waits for review (no tasks are created yet). */
export async function aiSplitDeliverable(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("projects");
  let target = "";
  try {
    const { dl, text } = await contextFor(req(fd, "id"));
    const r = await draftWorkPlan(text);
    const x = await db.aiExtraction.create({
      data: { kind: "WORKPLAN", result: { deliverableId: dl.id, ...r.data } as object, documentIds: [], provider: r.provider, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, projectId: dl.projectId, createdById: user.id },
    });
    await logActivity(user.id, "ai", "deliverable", dl.id, `AI proposed ${r.data.tasks?.length ?? 0} tasks for “${dl.title}” (${r.model})`);
    target = `/deliverables/plan/${x.id}`;
  } catch (e) {
    if (!(e instanceof AiError || e instanceof FormError)) console.error("[ai] work plan failed", e);
    return { error: e instanceof Error ? e.message : "AI request failed." };
  }
  redirect(target);
}

/** Create the ticked tasks from a reviewed AI work plan. */
export async function applyWorkPlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("projects");
  return guard(async () => {
    const x = await db.aiExtraction.findUniqueOrThrow({ where: { id: req(fd, "extractionId") } });
    if (x.kind !== "WORKPLAN" || x.status !== "READY") return { error: "This plan was already applied or discarded." };
    const deliverableId = (x.result as { deliverableId: string }).deliverableId;
    const count = Number(fd.get("count") || 0);
    const tasks = [];
    for (let i = 0; i < count; i++) {
      if (!fd.get(`inc_${i}`)) continue;
      const title = str(fd, `title_${i}`);
      if (!title) continue;
      const due = str(fd, `due_${i}`);
      tasks.push({ title, description: str(fd, `desc_${i}`) ?? null, dueDate: due ? new Date(`${due}T00:00:00`) : null, assigneeId: str(fd, `who_${i}`) ?? null });
    }
    if (!tasks.length) throw new FormError("Tick at least one task.");
    const made = await createDeliverableTasks(deliverableId, tasks, user.id, "ai");
    await db.aiExtraction.update({ where: { id: x.id }, data: { status: "APPLIED", appliedAt: new Date() } });
    revalidatePath("/deliverables");
    revalidatePath("/board");
    revalidatePath(`/projects/${x.projectId}`);
    redirect(`/deliverables?added=${made}`);
  });
}

export async function discardWorkPlan(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("projects");
  return guard(async () => {
    await db.aiExtraction.update({ where: { id: req(fd, "id") }, data: { status: "DISCARDED" } });
    revalidatePath("/deliverables");
    redirect("/deliverables");
  });
}
