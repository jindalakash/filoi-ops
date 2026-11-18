"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { guard, req, str } from "@/lib/form";
import { logActivity } from "@/lib/activity";
import type { ActionState } from "@/components/client";
import type { ClientType } from "@prisma/client";

function data(fd: FormData) {
  return {
    name: req(fd, "name", "Client name"),
    shortName: str(fd, "shortName"),
    type: (str(fd, "type") || "UN_AGENCY") as ClientType,
    country: str(fd, "country") || "Switzerland",
    address: str(fd, "address"),
    gstin: str(fd, "gstin")?.toUpperCase() ?? null,
    stateCode: str(fd, "stateCode"),
    taxId: str(fd, "taxId"),
    vendorNumber: str(fd, "vendorNumber"),
    contactName: str(fd, "contactName"),
    contactEmail: str(fd, "contactEmail"),
    contactPhone: str(fd, "contactPhone"),
    defaultCurrency: str(fd, "defaultCurrency") || "USD",
    notes: str(fd, "notes"),
  };
}

export async function saveClient(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.role === "ACCOUNTS" && !fd.get("id")) { /* accounts may add clients too */ }
  return guard(async () => {
    const id = str(fd, "id");
    const d = data(fd);
    const c = id ? await db.client.update({ where: { id }, data: d }) : await db.client.create({ data: d });
    await logActivity(user.id, id ? "update" : "create", "client", c.id, `${id ? "Updated" : "Added"} client ${c.name}`);
    revalidatePath("/clients");
    const back = str(fd, "returnTo");
    redirect(back && back.startsWith("/") ? back : `/clients/${c.id}`);
  });
}

export async function deleteClient(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("admin");
  return guard(async () => {
    const id = req(fd, "id");
    const used = await db.client.findUnique({ where: { id }, include: { _count: { select: { opportunities: true, projects: true, invoices: true } } } });
    if (used && used._count.opportunities + used._count.projects + used._count.invoices > 0)
      return { error: "This client has proposals, projects or invoices and cannot be deleted." };
    await db.client.delete({ where: { id } });
    await logActivity(user.id, "delete", "client", id, `Deleted client ${used?.name}`);
    redirect("/clients");
  });
}
