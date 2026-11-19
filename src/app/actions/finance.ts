"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { guard, req, str, dateOf, numOf, FormError } from "@/lib/form";
import { nextInvoiceNumber } from "@/lib/codes";
import { computeTax } from "@/lib/tax";
import { logActivity } from "@/lib/activity";
import { money, num } from "@/lib/format";
import type { ActionState } from "@/components/client";
import type { InvoiceStatus, SupplyType, CashKind } from "@prisma/client";
import { saveSetting } from "@/lib/settings";

// ── Billing milestones ──
export async function saveMilestone(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("finance");
  return guard(async () => {
    const id = str(fd, "id");
    const projectId = req(fd, "projectId");
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    let amount = numOf(fd, "amount");
    const percent = numOf(fd, "percent");
    if (!amount && percent) amount = Math.round(num(project.contractValue) * percent) / 100;
    if (!amount) throw new FormError("Enter an amount or a % of contract value.");
    const d = { title: req(fd, "title", "Title"), amount, percent, dueDate: dateOf(fd, "dueDate"), deliverableId: str(fd, "deliverableId") };
    const m = id ? await db.milestone.update({ where: { id }, data: d }) : await db.milestone.create({ data: { ...d, projectId } });
    await logActivity(user.id, id ? "update" : "create", "milestone", m.id, `${id ? "Updated" : "Added"} billing milestone “${m.title}” (${money(amount, project.currency)})`);
    revalidatePath(`/projects/${projectId}`);
    return { ok: id ? "Milestone updated." : "Milestone added." };
  });
}

export async function deleteMilestone(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("finance");
  return guard(async () => {
    const m = await db.milestone.findUniqueOrThrow({ where: { id: req(fd, "id") }, include: { invoices: { where: { status: { not: "CANCELLED" } } } } });
    if (m.invoices.length) return { error: "Already invoiced — cancel the invoice first." };
    await db.milestone.delete({ where: { id: m.id } });
    revalidatePath(`/projects/${m.projectId}`);
    return { ok: "Deleted." };
  });
}

// ── Invoices ──
export async function createInvoice(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("finance");
  return guard(async () => {
    const projectId = req(fd, "projectId", "Project");
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    const issueDate = dateOf(fd, "issueDate") ?? new Date();
    const supplyType = req(fd, "supplyType") as SupplyType;
    const rate = numOf(fd, "taxRate") ?? 18;

    const desc = fd.getAll("item_description").map(String);
    const sac = fd.getAll("item_sac").map(String);
    const qty = fd.getAll("item_quantity").map((v) => Number(v) || 0);
    const price = fd.getAll("item_rate").map((v) => Number(String(v).replace(/,/g, "")) || 0);
    const items = desc
      .map((d, i) => ({ description: d.trim(), sac: sac[i]?.trim() || null, quantity: qty[i] || 1, rate: price[i], amount: Math.round((qty[i] || 1) * price[i] * 100) / 100 }))
      .filter((it) => it.description && it.rate);
    if (!items.length) throw new FormError("Add at least one line item with a description and amount.");
    const subtotal = Math.round(items.reduce((s, it) => s + it.amount, 0) * 100) / 100;
    const tax = computeTax(subtotal, supplyType, rate);
    const milestoneId = str(fd, "milestoneId");

    const inv = await db.invoice.create({
      data: {
        number: str(fd, "number") || (await nextInvoiceNumber(issueDate)),
        projectId,
        clientId: project.clientId,
        milestoneId,
        issueDate,
        dueDate: dateOf(fd, "dueDate"),
        currency: str(fd, "currency") || project.currency,
        exchangeRate: numOf(fd, "exchangeRate") ?? 1,
        supplyType,
        placeOfSupply: str(fd, "placeOfSupply"),
        taxRate: tax.taxRate,
        subtotal,
        cgst: tax.cgst,
        sgst: tax.sgst,
        igst: tax.igst,
        total: tax.total,
        poReference: str(fd, "poReference"),
        notes: str(fd, "notes"),
        status: fd.get("markSent") ? "SENT" : "DRAFT",
        sentAt: fd.get("markSent") ? new Date() : null,
        items: { create: items },
      },
    });
    if (milestoneId) await db.milestone.update({ where: { id: milestoneId }, data: { status: "INVOICED" } });
    await logActivity(user.id, "create", "invoice", inv.id, `Raised invoice ${inv.number} for ${money(inv.total, inv.currency)}`);
    revalidatePath("/finance");
    redirect(`/finance/invoices/${inv.id}`);
  });
}

async function refreshInvoiceStatus(invoiceId: string) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true } });
  if (inv.status === "CANCELLED" || inv.status === "DRAFT") return inv;
  const settled = inv.payments.reduce((s, p) => s + num(p.amount) + num(p.tds) + num(p.bankCharges), 0);
  const status: InvoiceStatus = settled <= 0 ? "SENT" : settled + 0.01 >= num(inv.total) ? "PAID" : "PARTIALLY_PAID";
  await db.invoice.update({ where: { id: invoiceId }, data: { status } });
  if (inv.milestoneId) await db.milestone.update({ where: { id: inv.milestoneId }, data: { status: status === "PAID" ? "PAID" : "INVOICED" } });
  return inv;
}

export async function setInvoiceStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("finance");
  return guard(async () => {
    const id = req(fd, "id");
    const status = req(fd, "status") as InvoiceStatus;
    const inv = await db.invoice.update({ where: { id }, data: { status, ...(status === "SENT" ? { sentAt: new Date() } : {}) } });
    if (inv.milestoneId && status === "CANCELLED") await db.milestone.update({ where: { id: inv.milestoneId }, data: { status: "PLANNED" } });
    if (status === "SENT") await refreshInvoiceStatus(id);
    await logActivity(user.id, "status", "invoice", id, `Invoice ${inv.number} → ${status.toLowerCase()}`);
    revalidatePath(`/finance/invoices/${id}`);
    revalidatePath("/finance");
    return { ok: "Invoice updated." };
  });
}

export async function deleteInvoice(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("finance");
  return guard(async () => {
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: req(fd, "id") } });
    if (inv.status !== "DRAFT") return { error: "Only draft invoices can be deleted. Cancel issued invoices instead (GST rules keep the number used)." };
    await db.invoice.delete({ where: { id: inv.id } });
    if (inv.milestoneId) await db.milestone.update({ where: { id: inv.milestoneId }, data: { status: "PLANNED" } });
    await logActivity(user.id, "delete", "invoice", inv.id, `Deleted draft invoice ${inv.number}`);
    redirect("/finance");
  });
}

/**
 * Record a payment as received in the bank (always INR). For foreign-currency invoices the user says whether it
 * settles the full balance or only part of it (in the invoice currency); the realised rate is worked out from that.
 */
export async function recordPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("finance");
  return guard(async () => {
    const invoiceId = req(fd, "invoiceId");
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true } });
    if (inv.status === "DRAFT" || inv.status === "CANCELLED") return { error: "Mark the invoice as sent before recording payments." };
    const credited = numOf(fd, "amountInr");
    if (!credited || credited <= 0) throw new FormError("Enter the amount credited to the bank in ₹.");
    const tdsInr = numOf(fd, "tdsInr") ?? 0;
    const bankInr = numOf(fd, "bankInr") ?? 0;
    const balance = Math.max(0, num(inv.total) - inv.payments.reduce((a, p) => a + num(p.amount) + num(p.tds) + num(p.bankCharges), 0));
    const r2 = (x: number) => Math.round(x * 100) / 100;

    let covered: number, rate: number;
    if (inv.currency === "INR") {
      covered = credited + tdsInr + bankInr; // INR invoice: what's settled is what arrived plus deductions
      rate = 1;
    } else {
      covered = fd.get("covers") === "partial" ? numOf(fd, "coveredAmount") ?? 0 : balance;
      if (!covered || covered <= 0) throw new FormError(`Enter how much of the invoice (in ${inv.currency}) this payment settles.`);
      if (covered > balance + 0.01) throw new FormError(`That is more than the outstanding balance (${money(balance, inv.currency)}).`);
      rate = (credited + tdsInr + bankInr) / covered; // realised ₹ per unit of invoice currency
    }
    const tds = r2(tdsInr / rate), bank = r2(bankInr / rate);
    await db.payment.create({
      data: {
        invoiceId,
        date: dateOf(fd, "date") ?? new Date(),
        amount: r2(covered - tds - bank),
        tds,
        bankCharges: bank,
        exchangeRate: Math.round(rate * 10000) / 10000,
        amountInr: credited,
        reference: str(fd, "reference"),
        notes: str(fd, "notes"),
      },
    });
    await refreshInvoiceStatus(invoiceId);
    const left = r2(balance - covered);
    await logActivity(user.id, "payment", "invoice", invoiceId, `Recorded ₹${new Intl.NumberFormat("en-IN").format(credited)} against ${inv.number}${inv.currency !== "INR" ? ` (settles ${money(covered, inv.currency)} @ ₹${rate.toFixed(2)})` : ""}${left > 0.01 ? " — partial" : ""}`);
    revalidatePath(`/finance/invoices/${invoiceId}`);
    revalidatePath("/finance");
    return { ok: left > 0.01 ? `Partial payment recorded. Still due: ${money(left, inv.currency)}.` : "Payment recorded — invoice fully settled." };
  });
}

export async function deletePayment(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("finance");
  return guard(async () => {
    const p = await db.payment.delete({ where: { id: req(fd, "id") } });
    await refreshInvoiceStatus(p.invoiceId);
    revalidatePath(`/finance/invoices/${p.invoiceId}`);
    return { ok: "Payment removed." };
  });
}

// ── Cash-flow forecast inputs ──
export async function saveCashflowSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("finance");
  return guard(async () => {
    let monthlyCosts: { label: string; amount: number }[] = [];
    try { monthlyCosts = JSON.parse(String(fd.get("monthlyCosts") || "[]")); } catch { throw new FormError("Could not read the monthly costs."); }
    monthlyCosts = monthlyCosts.filter((c) => c.label?.trim() && Number(c.amount) > 0).map((c) => ({ label: c.label.trim(), amount: Number(c.amount) }));
    await saveSetting("cashflow", {
      openingBalance: numOf(fd, "openingBalance") ?? 0,
      openingDate: str(fd, "openingDate") ?? "",
      paymentDelayDays: Math.max(0, Math.round(numOf(fd, "paymentDelayDays") ?? 30)),
      monthlyCosts,
    });
    revalidatePath("/finance/cashflow");
    return { ok: "Forecast inputs saved." };
  });
}

export async function addCashEntry(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("finance");
  return guard(async () => {
    const amount = numOf(fd, "amountInr");
    if (!amount || amount <= 0) throw new FormError("Enter an amount in ₹.");
    await db.cashEntry.create({ data: { date: dateOf(fd, "date") ?? new Date(), description: req(fd, "description", "Description"), amountInr: amount, kind: (str(fd, "kind") || "OUT") as CashKind } });
    revalidatePath("/finance/cashflow");
    return { ok: "Added." };
  });
}

export async function deleteCashEntry(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("finance");
  return guard(async () => {
    await db.cashEntry.delete({ where: { id: req(fd, "id") } });
    revalidatePath("/finance/cashflow");
    return { ok: "Removed." };
  });
}
