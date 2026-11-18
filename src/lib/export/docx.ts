import fs from "fs/promises";
import path from "path";
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, Packer, PageBreak, PageNumber, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, WidthType, type ParagraphChild,
} from "docx";
import { db } from "../db";
import { getSetting } from "../settings";
import { amountInWords, date, num } from "../format";
import { COST_LABEL } from "../proposal-meta";

const INK = "0F2550", PLUM = "8A2C8D", LINE = "DFE4EF", MIST = "F3F5FA";
const FONT = "Calibri";

// ── small helpers ──
const runs = (text: string, base: { bold?: boolean; color?: string; size?: number } = {}): TextRun[] =>
  text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) =>
    part.startsWith("**") && part.endsWith("**") ? new TextRun({ text: part.slice(2, -2), bold: true, color: base.color, size: base.size }) : new TextRun({ text: part, ...base }),
  );
const p = (text: string, opts: { bold?: boolean; color?: string; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number } = {}) =>
  new Paragraph({ children: runs(text, opts), alignment: opts.align, spacing: { after: opts.after ?? 120 } });
const cell = (content: string | ParagraphChild[], o: { bold?: boolean; fill?: string; color?: string; width?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new TableCell({
    children: [new Paragraph({ children: typeof content === "string" ? runs(content, { bold: o.bold, color: o.color, size: 20 }) : content, alignment: o.align })],
    shading: o.fill ? { type: ShadingType.CLEAR, color: "auto", fill: o.fill } : undefined,
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
  });
const borders = { top: { style: BorderStyle.SINGLE, size: 4, color: LINE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE }, left: { style: BorderStyle.SINGLE, size: 4, color: LINE }, right: { style: BorderStyle.SINGLE, size: 4, color: LINE }, insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: LINE }, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: LINE } };
const table = (head: string[], rows: string[][], widths?: number[], alignRight: number[] = []) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, { bold: true, fill: INK, color: "FFFFFF", width: widths?.[i], align: alignRight.includes(i) ? AlignmentType.RIGHT : undefined })) }),
      ...rows.map((r, ri) => new TableRow({ children: r.map((c, i) => cell(c, { width: widths?.[i], fill: ri % 2 ? MIST : undefined, align: alignRight.includes(i) ? AlignmentType.RIGHT : undefined })) })),
    ],
  });

/** Light markdown → Word: ### headings, - bullets, **bold**, pipe tables, paragraphs. */
function markdown(md: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const lines = md.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line.trim()) continue;
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const block: string[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) block.push(lines[i++].trim());
      i--;
      const rows = block.filter((r) => !/^\|\s*:?-{2,}/.test(r)).map((r) => r.slice(1, -1).split("|").map((c) => c.trim()));
      if (rows.length) out.push(table(rows[0], rows.slice(1)), new Paragraph({ text: "", spacing: { after: 120 } }));
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { out.push(new Paragraph({ children: runs(h[2].replace(/\*\*/g, ""), { color: h[1].length <= 2 ? INK : PLUM }), heading: h[1].length <= 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } })); continue; }
    const b = line.match(/^(\s*)[-*•]\s+(.*)$/);
    if (b) { out.push(new Paragraph({ children: runs(b[2]), bullet: { level: Math.min(2, Math.floor(b[1].length / 2)) }, spacing: { after: 60 } })); continue; }
    out.push(p(line.trim(), { after: 140 }));
  }
  return out;
}

async function logo() {
  try {
    const data = await fs.readFile(path.join(process.cwd(), "public", "filoi-logo.png"));
    return new ImageRun({ type: "png", data, transformation: { width: 150, height: 95 } });
  } catch { return null; }
}

function footer(company: string) {
  return new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${company} · Page `, size: 16, color: "4A5878" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "4A5878" })] })] });
}

async function cover(kind: string, o: { title: string; referenceNo: string | null; client: { name: string } }, company: { legalName: string; address: string; website: string; email: string }) {
  const img = await logo();
  return [
    ...(img ? [new Paragraph({ children: [img], spacing: { after: 600 } })] : []),
    new Paragraph({ children: [new TextRun({ text: kind.toUpperCase(), bold: true, color: PLUM, size: 28 })], spacing: { before: 1600, after: 200 } }),
    new Paragraph({ children: [new TextRun({ text: o.title, bold: true, color: INK, size: 44 })], spacing: { after: 400 } }),
    p(`Submitted to: ${o.client.name}`, { size: 24 }),
    ...(o.referenceNo ? [p(`Reference: ${o.referenceNo}`, { size: 24 })] : []),
    p(`Date: ${date(new Date())}`, { size: 24, after: 1600 }),
    p(`Submitted by ${company.legalName}`, { bold: true, color: INK, size: 22 }),
    p(company.address.replace(/\n/g, ", "), { size: 20, color: "4A5878" }),
    p([company.email, company.website].filter(Boolean).join(" · "), { size: 20, color: "4A5878" }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

const docStyles = { default: { document: { run: { font: FONT, size: 22, color: "1F2A44" } } }, paragraphStyles: [] };

// ── Technical proposal ──
export async function technicalDocx(opportunityId: string) {
  const company = await getSetting("company");
  const o = await db.opportunity.findUniqueOrThrow({
    where: { id: opportunityId },
    include: {
      client: true,
      sections: { orderBy: [{ seq: "asc" }, { createdAt: "asc" }] },
      team: { include: { expert: true }, orderBy: { seq: "asc" } },
      refs: { include: { reference: true }, orderBy: { seq: "asc" } },
    },
  });
  const body: (Paragraph | Table)[] = [];
  const h1 = (t: string) => new Paragraph({ children: [new TextRun({ text: t, color: INK })], heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 } });
  let n = 1;
  for (const s of o.sections) {
    body.push(h1(`${n++}. ${s.title}`));
    body.push(...(s.content.trim() ? markdown(s.content) : [p("[Section to be completed]", { color: PLUM })]));
  }
  if (o.team.length) {
    body.push(h1(`${n++}. Proposed team`));
    body.push(table(["Position", "Name", "Key expert", "Input (days)"], o.team.map((m) => [m.position, m.expert.name, m.isKey ? "Yes" : "No", m.inputDays ? String(num(m.inputDays)) : "—"]), [38, 32, 15, 15], [3]));
    body.push(new Paragraph({ text: "", spacing: { after: 160 } }));
    for (const m of o.team) {
      const e = m.expert;
      body.push(new Paragraph({ children: [new TextRun({ text: `${e.name} — ${m.position}`, color: PLUM })], heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 } }));
      const facts = [e.title, e.yearsExperience != null && `${e.yearsExperience} years of experience`, e.nationality && `Nationality: ${e.nationality}`, e.languages && `Languages: ${e.languages}`].filter(Boolean).join(" · ");
      if (facts) body.push(p(facts, { color: "4A5878", size: 20 }));
      if (e.summary) body.push(p(e.summary));
      if (e.education) body.push(p(`**Education:** ${e.education.replace(/\n/g, "; ")}`));
      if (e.expertise) body.push(p(`**Expertise:** ${e.expertise}`));
    }
  }
  if (o.refs.length) {
    body.push(h1(`${n++}. Relevant experience`));
    body.push(table(["Assignment", "Client / country", "Period", "Value"], o.refs.map(({ reference: r }) => [
      r.title, [r.client, r.country].filter(Boolean).join(", "), `${r.startDate?.getFullYear() ?? "?"}–${r.endDate?.getFullYear() ?? "ongoing"}`,
      r.value ? `${r.currency} ${new Intl.NumberFormat("en-US").format(num(r.value))}` : "—",
    ]), [40, 28, 14, 18], [3]));
    for (const { reference: r } of o.refs) if (r.description || r.services) {
      body.push(new Paragraph({ children: [new TextRun({ text: r.title, color: PLUM })], heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 } }));
      if (r.description) body.push(p(r.description));
      if (r.services) body.push(p(`**Services provided:** ${r.services}`));
    }
  }
  const doc = new Document({
    creator: company.legalName, title: `Technical proposal – ${o.title}`, styles: docStyles,
    sections: [{ properties: { page: { margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } } }, footers: { default: footer(company.legalName) }, children: [...(await cover("Technical proposal", o, company)), ...body] }],
  });
  return { buffer: await Packer.toBuffer(doc), fileName: `${o.code} Technical proposal.docx` };
}

// ── Financial proposal ──
export async function financialDocx(opportunityId: string) {
  const company = await getSetting("company");
  const o = await db.opportunity.findUniqueOrThrow({ where: { id: opportunityId }, include: { client: true, finLines: { orderBy: { seq: "asc" } } } });
  const c = o.currency;
  const fmt = (n: number) => new Intl.NumberFormat(c === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const rows: TableRow[] = [new TableRow({ tableHeader: true, children: ["#", "Description", "Unit", "Qty", `Rate (${c})`, `Amount (${c})`].map((h, i) => cell(h, { bold: true, fill: INK, color: "FFFFFF", align: i >= 3 ? AlignmentType.RIGHT : undefined })) })];
  let sub = 0, k = 1;
  for (const cat of Object.keys(COST_LABEL) as (keyof typeof COST_LABEL)[]) {
    const lines = o.finLines.filter((l) => l.category === cat);
    if (!lines.length) continue;
    rows.push(new TableRow({ children: [cell(""), cell(COST_LABEL[cat], { bold: true, color: PLUM }), cell(""), cell(""), cell(""), cell("")] }));
    let catTotal = 0;
    for (const l of lines) {
      const amt = num(l.quantity) * num(l.rate);
      catTotal += amt;
      rows.push(new TableRow({ children: [cell(String(k++)), cell(l.description), cell(l.unit), cell(String(num(l.quantity)), { align: AlignmentType.RIGHT }), cell(fmt(num(l.rate)), { align: AlignmentType.RIGHT }), cell(fmt(amt), { align: AlignmentType.RIGHT })] }));
    }
    rows.push(new TableRow({ children: [cell(""), cell(`Subtotal – ${COST_LABEL[cat]}`, { bold: true }), cell(""), cell(""), cell(""), cell(fmt(catTotal), { bold: true, align: AlignmentType.RIGHT })].map((x) => x) }));
    sub += catTotal;
  }
  const taxRate = num(o.finTaxRate);
  const tax = Math.round(sub * taxRate) / 100;
  const total = sub + tax;
  const sumRow = (label: string, v: number, strong = false) => new TableRow({ children: [cell(""), cell(label, { bold: strong }), cell(""), cell(""), cell(""), cell(fmt(v), { bold: strong, align: AlignmentType.RIGHT, fill: strong ? MIST : undefined })] });
  rows.push(sumRow("Total before tax", sub, true));
  if (taxRate) rows.push(sumRow(`Tax @ ${taxRate}%`, tax));
  rows.push(sumRow(`TOTAL (${c})`, total, true));

  const body: (Paragraph | Table)[] = [
    new Paragraph({ children: [new TextRun({ text: "Financial proposal", color: INK })], heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }),
    p(`Our total price for the assignment “${o.title}” is **${c} ${fmt(total)}** (${amountInWords(total, c)}), ${taxRate ? `including tax at ${taxRate}%` : "exclusive of taxes, as the services are exported under a Letter of Undertaking without payment of IGST where applicable"}.`),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders, rows }),
    new Paragraph({ text: "", spacing: { after: 200 } }),
    ...(o.finNotes ? [new Paragraph({ children: [new TextRun({ text: "Notes and assumptions", color: INK })], heading: HeadingLevel.HEADING_2 }), ...markdown(o.finNotes)] : []),
    new Paragraph({ text: "", spacing: { after: 400 } }),
    p(`For and on behalf of ${company.legalName}`, { bold: true }),
    p("Name: ____________________    Designation: ____________________", { after: 240 }),
    p("Signature: ____________________    Date: ____________________"),
  ];
  const doc = new Document({
    creator: company.legalName, title: `Financial proposal – ${o.title}`, styles: docStyles,
    sections: [{ properties: { page: { margin: { top: 1200, bottom: 1200, left: 1100, right: 1100 } } }, footers: { default: footer(company.legalName) }, children: [...(await cover("Financial proposal", o, company)), ...body] }],
  });
  return { buffer: await Packer.toBuffer(doc), fileName: `${o.code} Financial proposal.docx` };
}
