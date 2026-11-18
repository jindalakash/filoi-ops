"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { guard, req, str, dateOf, numOf, intOf } from "@/lib/form";
import { nextOpportunityCode, nextProjectCode } from "@/lib/codes";
import { logActivity } from "@/lib/activity";
import { OPP_STATUS } from "@/components/badges";
import type { ActionState } from "@/components/client";
import type { OpportunityStatus } from "@prisma/client";

export async function saveOpportunity(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("presales");
  return guard(async () => {
    const id = str(fd, "id");
    let clientId = req(fd, "clientId", "Client");
    if (clientId === "__new__") {
      const c = await db.client.create({
        data: { name: req(fd, "newClientName", "New client name"), shortName: str(fd, "newClientShortName"), country: str(fd, "newClientCountry") || "Switzerland", defaultCurrency: str(fd, "currency") || "USD" },
      });
      await logActivity(user.id, "create", "client", c.id, `Added client ${c.name} (from TOR)`);
      clientId = c.id;
    }
    const d = {
      title: req(fd, "title", "Title"),
      clientId,
      source: str(fd, "source"),
      referenceNo: str(fd, "referenceNo"),
      currency: str(fd, "currency") || "USD",
      estimatedValue: numOf(fd, "estimatedValue"),
      technicalWeight: intOf(fd, "technicalWeight"),
      financialWeight: intOf(fd, "financialWeight"),
      evaluationMethod: str(fd, "evaluationMethod"),
      submissionDeadline: dateOf(fd, "submissionDeadline"),
      preBidDate: dateOf(fd, "preBidDate"),
      queryDeadline: dateOf(fd, "queryDeadline"),
      durationMonths: intOf(fd, "durationMonths"),
      emdAmount: numOf(fd, "emdAmount"),
      scopeSummary: str(fd, "scopeSummary"),
      eligibility: str(fd, "eligibility"),
      requiredDocuments: str(fd, "requiredDocuments"),
      notes: str(fd, "notes"),
      alertEmails: str(fd, "alertEmails"),
      ownerId: str(fd, "ownerId"),
    };
    const o = id
      ? await db.opportunity.update({ where: { id }, data: d })
      : await db.opportunity.create({ data: { ...d, code: await nextOpportunityCode(), ownerId: d.ownerId ?? user.id } });
    await logActivity(user.id, id ? "update" : "create", "opportunity", o.id, `${id ? "Updated" : "Created"} proposal ${o.code}`);
    // documents read by AI on the intake screen now belong to this proposal
    const intakeId = str(fd, "intakeId");
    if (intakeId) {
      const x = await db.aiExtraction.findUnique({ where: { id: intakeId } });
      if (x && x.status === "READY") {
        await db.document.updateMany({ where: { id: { in: x.documentIds }, opportunityId: null, projectId: null }, data: { opportunityId: o.id } });
        await db.aiExtraction.update({ where: { id: intakeId }, data: { status: "APPLIED", appliedAt: new Date(), opportunityId: o.id } });
      }
    }
    revalidatePath("/opportunities");
    redirect(`/opportunities/${o.id}`);
  });
}

export async function setOpportunityStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("presales");
  return guard(async () => {
    const id = req(fd, "id");
    const status = req(fd, "status") as OpportunityStatus;
    const o = await db.opportunity.update({
      where: { id },
      data: {
        status,
        ...(status === "SUBMITTED" ? { submittedAt: new Date() } : {}),
        ...(["WON", "LOST", "CANCELLED", "NO_GO"].includes(status) ? { decisionAt: new Date() } : {}),
      },
    });
    await logActivity(user.id, "status", "opportunity", id, `${o.code} → ${OPP_STATUS[status]?.label ?? status}`);
    revalidatePath(`/opportunities/${id}`);
    revalidatePath("/opportunities");
    return { ok: "Status updated." };
  });
}

/** Won → creates a project pre-filled from the proposal */
export async function convertToProject(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("projects");
  return guard(async () => {
    const id = req(fd, "id");
    const o = await db.opportunity.findUniqueOrThrow({ where: { id }, include: { project: true } });
    if (o.project) redirect(`/projects/${o.project.id}`);
    const start = new Date();
    const end = o.durationMonths ? new Date(start.getFullYear(), start.getMonth() + o.durationMonths, start.getDate()) : null;
    const p = await db.project.create({
      data: {
        code: await nextProjectCode(),
        title: o.title,
        clientId: o.clientId,
        opportunityId: o.id,
        contractValue: o.estimatedValue ?? 0,
        currency: o.currency,
        startDate: start,
        endDate: end,
        description: o.scopeSummary,
        managerId: o.ownerId,
        alertEmails: o.alertEmails,
      },
    });
    if (o.status !== "WON") await db.opportunity.update({ where: { id }, data: { status: "WON", decisionAt: new Date() } });
    await logActivity(user.id, "create", "project", p.id, `Created project ${p.code} from ${o.code}`);
    revalidatePath("/projects");
    redirect(`/projects/${p.id}?created=1`);
  });
}

export async function deleteOpportunity(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("presales");
  return guard(async () => {
    const id = req(fd, "id");
    const o = await db.opportunity.findUniqueOrThrow({ where: { id }, include: { project: true } });
    if (o.project) return { error: "A project was created from this proposal; delete or unlink the project first." };
    await db.opportunity.delete({ where: { id } });
    await logActivity(user.id, "delete", "opportunity", id, `Deleted proposal ${o.code}`);
    redirect("/opportunities");
  });
}
