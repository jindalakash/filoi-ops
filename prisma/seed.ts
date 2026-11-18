/* Seed: first admin + Filoi company settings. Pass --demo for sample data. */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const demo = process.argv.includes("--demo");
const d = (offsetDays: number) => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + offsetDays); return x; };

async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@filoi.in").toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("Set ADMIN_PASSWORD in .env");
  const admin = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Filoi Admin", role: "ADMIN", designation: "Director", passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`✔ admin user: ${email}`);

  await db.setting.upsert({
    where: { key: "company" },
    update: {},
    create: {
      key: "company",
      value: {
        name: "Filoi", legalName: "Filoi Private Limited", website: "www.filoi.in", email: "contact@filoi.in", phone: "+91 96549 96364",
        address: "Ground Floor, D-9, Sector-3\nNoida, Uttar Pradesh 201301\nIndia", state: "Uttar Pradesh", stateCode: "09",
        gstin: "", pan: "", cin: "", lutNumber: "", lutValidity: "", defaultSac: "998311", invoicePrefix: "FIL", paymentTermsDays: 30,
        bankDetails: "", invoiceFooter: "Thank you for your business.",
      },
    },
  });
  console.log("✔ company settings");

  if (!demo) return;
  if (await db.client.count()) { console.log("• data exists, skipping demo"); return; }
  const pw = await bcrypt.hash(password, 10);
  const pm = await db.user.create({ data: { email: "pm.demo@filoi.in", name: "Priya Sharma (demo)", role: "PROJECT_MANAGER", designation: "Project Manager", passwordHash: pw } });
  await db.user.create({ data: { email: "accounts.demo@filoi.in", name: "Rahul Verma (demo)", role: "ACCOUNTS", designation: "Accounts Manager", passwordHash: pw } });

  const who = await db.client.create({ data: { name: "World Health Organization", shortName: "WHO", type: "UN_AGENCY", country: "Switzerland", address: "Avenue Appia 20\n1211 Geneva 27", defaultCurrency: "USD", contactName: "Procurement Officer" } });
  const unicef = await db.client.create({ data: { name: "UNICEF Regional Office for South Asia", shortName: "UNICEF ROSA", type: "UN_AGENCY", country: "Nepal", address: "Lainchaur, Kathmandu", defaultCurrency: "USD" } });
  const gavi = await db.client.create({ data: { name: "Gavi, the Vaccine Alliance", shortName: "Gavi", type: "MULTILATERAL", country: "Switzerland", defaultCurrency: "EUR" } });
  const nhsrc = await db.client.create({ data: { name: "State Health Society (demo)", shortName: "SHS", type: "GOVERNMENT", country: "India", stateCode: "09", defaultCurrency: "INR" } });

  const opp = (code: string, data: object) => db.opportunity.create({ data: { code, ownerId: pm.id, ...data } as never });
  await opp("BID-2026-001", { title: "Digital immunization registry assessment – 5 countries", clientId: gavi.id, status: "DRAFT", currency: "EUR", estimatedValue: 145000, submissionDeadline: d(4), durationMonths: 8, evaluationMethod: "QCBS", technicalWeight: 70, financialWeight: 30, requiredDocuments: "Technical proposal\nFinancial proposal\nCVs of key experts\nCompany registration" });
  await opp("BID-2026-002", { title: "DHIS2 tracker customization for maternal health", clientId: nhsrc.id, status: "IN_REVIEW", currency: "INR", estimatedValue: 4800000, submissionDeadline: d(9), emdAmount: 96000 });
  await opp("BID-2026-003", { title: "Cold chain equipment inventory analytics", clientId: unicef.id, status: "SUBMITTED", currency: "USD", estimatedValue: 88000, submissionDeadline: d(-12), submittedAt: d(-12) });
  await opp("BID-2026-004", { title: "Health information system interoperability roadmap", clientId: who.id, status: "UNDER_EVALUATION", currency: "USD", estimatedValue: 120000, submissionDeadline: d(-30), submittedAt: d(-30) });
  await opp("BID-2026-005", { title: "Training on routine data quality review", clientId: unicef.id, status: "LOST", currency: "USD", estimatedValue: 40000, decisionAt: d(-20) });
  const wonOpp = await opp("BID-2026-006", { title: "Immunization data dashboard & analytics support", clientId: who.id, status: "WON", currency: "USD", estimatedValue: 96000, decisionAt: d(-60), durationMonths: 9 });

  const project = await db.project.create({
    data: {
      code: "PRJ-2026-001", title: "Immunization data dashboard & analytics support", clientId: who.id, opportunityId: wonOpp.id, contractNo: "WHO/APW/2026/0412",
      contractDate: d(-55), contractValue: 96000, currency: "USD", startDate: d(-50), endDate: d(220), managerId: pm.id, alertEmails: "contact@filoi.in", reminderDays: "5,2,0",
      description: "Design and deploy an immunization analytics dashboard, with data quality review and capacity building.",
    },
  });
  const dl = async (seq: number, title: string, type: string, due: number, status: string, amount?: number) => {
    const x = await db.deliverable.create({ data: { projectId: project.id, seq, title, type: type as never, dueDate: d(due), status: status as never, ownerId: pm.id, ...(status === "ACCEPTED" ? { acceptedAt: d(due) } : {}) } });
    if (amount) await db.milestone.create({ data: { projectId: project.id, deliverableId: x.id, title: `Payment on ${title}`, amount, percent: (amount / 96000) * 100, dueDate: d(due + 3), status: due < 0 ? "INVOICED" : "PLANNED" } });
    return x;
  };
  await dl(1, "Inception report & workplan", "DOCUMENT", -30, "ACCEPTED", 19200);
  await dl(2, "Data landscape assessment", "REPORT", 3, "IN_PROGRESS", 24000);
  await dl(3, "Dashboard prototype (v1)", "SYSTEM", 40, "NOT_STARTED", 28800);
  await dl(4, "Training of national data managers", "TRAINING", 120, "NOT_STARTED");
  await dl(5, "Final report & handover", "DOCUMENT", 210, "NOT_STARTED", 24000);

  const ms = await db.milestone.findFirstOrThrow({ where: { projectId: project.id, status: "INVOICED" } });
  const inv = await db.invoice.create({
    data: {
      number: "FIL/26-27/001", projectId: project.id, clientId: who.id, milestoneId: ms.id, issueDate: d(-26), dueDate: d(4), currency: "USD", exchangeRate: 84,
      supplyType: "EXPORT_LUT", placeOfSupply: "Outside India (96)", subtotal: 19200, total: 19200, status: "PARTIALLY_PAID", poReference: project.contractNo, sentAt: d(-26),
      items: { create: [{ description: `${project.title}\nPayment on Inception report & workplan (20%)`, sac: "998311", quantity: 1, rate: 19200, amount: 19200 }] },
    },
  });
  await db.payment.create({ data: { invoiceId: inv.id, date: d(-5), amount: 12000, exchangeRate: 84.2, reference: "SWIFT demo" } });
  await db.activity.create({ data: { userId: admin.id, action: "create", entity: "project", entityId: project.id, summary: "Created project PRJ-2026-001 from BID-2026-006 (demo data)" } });
  console.log("✔ demo data (users pm.demo@filoi.in / accounts.demo@filoi.in share the admin password)");
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
