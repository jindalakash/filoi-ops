"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { guard, req, str, dateOf, numOf } from "@/lib/form";
import { nextProjectCode } from "@/lib/codes";
import { logActivity } from "@/lib/activity";
import { getSetting } from "@/lib/settings";
import { applyTemplateTo } from "@/lib/work";
import { readCustom } from "@/lib/custom";
import { FormError } from "@/lib/form";
import type { ActionState } from "@/components/client";
import type { DeliverableStatus, ProjectStatus } from "@prisma/client";

export async function saveProject(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("projects");
  return guard(async () => {
    const id = str(fd, "id");
    const d = {
      title: req(fd, "title", "Title"),
      clientId: req(fd, "clientId", "Client"),
      contractNo: str(fd, "contractNo"),
      contractDate: dateOf(fd, "contractDate"),
      contractValue: numOf(fd, "contractValue") ?? 0,
      currency: str(fd, "currency") || "USD",
      startDate: dateOf(fd, "startDate"),
      endDate: dateOf(fd, "endDate"),
      status: (str(fd, "status") || "ACTIVE") as ProjectStatus,
      description: str(fd, "description"),
      managerId: str(fd, "managerId"),
      alertEmails: str(fd, "alertEmails"),
      reminderDays: str(fd, "reminderDays") || "5,2,0",
    };
    const custom = await readCustom(fd, "PROJECT", id ? (await db.project.findUnique({ where: { id }, select: { custom: true } }))?.custom : undefined);
    const dd = { ...d, ...(custom ? { custom: custom as object } : {}) };
    const p = id ? await db.project.update({ where: { id }, data: dd }) : await db.project.create({ data: { ...dd, code: await nextProjectCode() } });
    await logActivity(user.id, id ? "update" : "create", "project", p.id, `${id ? "Updated" : "Created"} project ${p.code}`);
    revalidatePath("/projects");
    redirect(`/projects/${p.id}`);
  });
}

export async function deleteProject(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("admin");
  return guard(async () => {
    const id = req(fd, "id");
    const p = await db.project.findUniqueOrThrow({ where: { id }, include: { _count: { select: { invoices: true } } } });
    if (p._count.invoices) return { error: "This project has invoices. Cancel/delete them first, or mark the project Cancelled." };
    await db.project.delete({ where: { id } });
    await logActivity(user.id, "delete", "project", id, `Deleted project ${p.code}`);
    redirect("/projects");
  });
}

// ── Deliverables ──
export async function saveDeliverable(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("projects");
  return guard(async () => {
    const id = str(fd, "id");
    const projectId = req(fd, "projectId");
    const d = {
      title: req(fd, "title", "Title"),
      description: str(fd, "description"),
      type: str(fd, "type") || "DOCUMENT",
      dueDate: dateOf(fd, "dueDate"),
      ownerId: str(fd, "ownerId"),
      alertEmails: str(fd, "alertEmails"),
    };
    const known = await db.optionItem.findFirst({ where: { list: "deliverableType", value: d.type } });
    const prev = id ? await db.deliverable.findUnique({ where: { id }, select: { type: true, custom: true } }) : null;
    if (!known && prev?.type !== d.type) throw new FormError("Unknown deliverable type — pick one from the list.");
    const custom = await readCustom(fd, "DELIVERABLE", prev?.custom);
    const dd = { ...d, ...(custom ? { custom: custom as object } : {}) };
    let dl;
    if (id) dl = await db.deliverable.update({ where: { id }, data: dd });
    else {
      const seq = (await db.deliverable.count({ where: { projectId } })) + 1;
      dl = await db.deliverable.create({ data: { ...dd, projectId, seq } });
      if ((await getSetting("taskTemplates")).auto) await applyTemplateTo(dl.id, user.id);
      // optional billing milestone created together with the deliverable
      const amount = numOf(fd, "billAmount");
      if (amount && can(user.role, "finance")) {
        await db.milestone.create({
          data: { projectId, deliverableId: dl.id, title: `Payment on ${d.title}`, amount, percent: numOf(fd, "billPercent"), dueDate: dateOf(fd, "billDate") ?? d.dueDate },
        });
      }
    }
    await logActivity(user.id, id ? "update" : "create", "deliverable", dl.id, `${id ? "Updated" : "Added"} deliverable “${dl.title}”`);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/deliverables");
    return { ok: id ? "Deliverable updated." : "Deliverable added." };
  });
}

export async function setDeliverableStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("projects");
  return guard(async () => {
    const id = req(fd, "id");
    const status = req(fd, "status") as DeliverableStatus;
    const dl = await db.deliverable.update({
      where: { id },
      data: {
        status,
        ...(status === "SUBMITTED" ? { submittedAt: new Date() } : {}),
        ...(status === "ACCEPTED" ? { acceptedAt: new Date() } : {}),
      },
    });
    await logActivity(user.id, "status", "deliverable", id, `“${dl.title}” → ${status.replace("_", " ").toLowerCase()}`);
    revalidatePath(`/projects/${dl.projectId}`);
    revalidatePath("/deliverables");
    return { ok: "Updated." };
  });
}

export async function deleteDeliverable(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("projects");
  return guard(async () => {
    const dl = await db.deliverable.delete({ where: { id: req(fd, "id") } });
    await logActivity(user.id, "delete", "deliverable", dl.id, `Deleted deliverable “${dl.title}”`);
    revalidatePath(`/projects/${dl.projectId}`);
    return { ok: "Deleted." };
  });
}
