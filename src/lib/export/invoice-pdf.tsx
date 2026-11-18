import fs from "fs/promises";
import path from "path";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { db } from "../db";
import { getSetting } from "../settings";
import { amountInWords, date, num } from "../format";

const INK = "#0f2550", PLUM = "#8a2c8d", SOFT = "#4a5878", LINE = "#dfe4ef", MIST = "#f3f5fa";

// Built-in PDF fonts have no ₹ glyph, so amounts use the ISO code ("INR 1,23,456.00")
const amt = (v: unknown, c: string) => `${c} ${new Intl.NumberFormat(c === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num(v))}`;

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9.5, fontFamily: "Helvetica", color: "#1f2a44", lineHeight: 1.4 },
  row: { flexDirection: "row" },
  head: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: INK, paddingBottom: 12 },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", color: PLUM, textAlign: "right", letterSpacing: 1, marginBottom: 8 },
  bold: { fontFamily: "Helvetica-Bold" },
  soft: { color: SOFT },
  label: { fontSize: 7.5, color: SOFT, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  lut: { marginTop: 10, padding: 7, borderWidth: 1, borderColor: "#e3c9e4", backgroundColor: "#f8f1f8", color: PLUM, fontSize: 8, fontFamily: "Helvetica-Bold" },
  th: { backgroundColor: INK, color: "#fff", fontFamily: "Helvetica-Bold", paddingVertical: 5, paddingHorizontal: 6 },
  td: { paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: LINE },
});

const cols = [{ w: "6%" }, { w: "46%" }, { w: "10%" }, { w: "8%", r: true }, { w: "14%", r: true }, { w: "16%", r: true }];

export async function invoicePdf(invoiceId: string) {
  const [inv, company] = await Promise.all([
    db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { items: true, client: true, project: true } }),
    getSetting("company"),
  ]);
  const logo = await fs.readFile(path.join(process.cwd(), "public", "filoi-logo.png")).catch(() => null);
  const c = inv.currency;
  const isExport = inv.supplyType === "EXPORT_LUT";
  const rate = num(inv.taxRate);
  const title = isExport || inv.supplyType === "EXEMPT" ? "INVOICE" : "TAX INVOICE";
  const meta: [string, string][] = [["Invoice no.", inv.number], ["Date", date(inv.issueDate)], ...(inv.dueDate ? [["Due date", date(inv.dueDate)] as [string, string]] : []), ...(inv.poReference ? [["PO / Contract", inv.poReference] as [string, string]] : []), ...(inv.placeOfSupply ? [["Place of supply", inv.placeOfSupply] as [string, string]] : [])];
  const totals: [string, string, boolean?][] = [
    ["Taxable value", amt(inv.subtotal, c)],
    ...(num(inv.cgst) > 0 ? [[`CGST @ ${rate / 2}%`, amt(inv.cgst, c)] as [string, string]] : []),
    ...(num(inv.sgst) > 0 ? [[`SGST @ ${rate / 2}%`, amt(inv.sgst, c)] as [string, string]] : []),
    ...(num(inv.igst) > 0 ? [[`IGST @ ${rate}%`, amt(inv.igst, c)] as [string, string]] : []),
    ...(isExport ? [["IGST @ 0% (LUT)", amt(0, c)] as [string, string]] : []),
    ["Total", amt(inv.total, c), true],
  ];

  const doc = (
    <Document title={`Invoice ${inv.number}`} author={company.legalName} creator="Filoi Ops">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View style={{ width: "58%" }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
            {logo && <Image src={{ data: logo, format: "png" }} style={{ width: 80, marginBottom: 6 }} />}
            <Text style={[s.bold, { fontSize: 12, color: INK }]}>{company.legalName}</Text>
            <Text style={s.soft}>{company.address}</Text>
            <Text style={s.soft}>{[company.email, company.phone, company.website].filter(Boolean).join(" · ")}</Text>
            <Text style={{ fontSize: 8.5, marginTop: 2 }}>{[company.gstin && `GSTIN: ${company.gstin}`, company.pan && `PAN: ${company.pan}`, company.cin && `CIN: ${company.cin}`].filter(Boolean).join("   ")}</Text>
          </View>
          <View style={{ width: "40%" }}>
            <Text style={s.h1}>{title}</Text>
            <View style={{ marginTop: 6 }}>
              {meta.map(([k, v]) => (
                <View key={k} style={[s.row, { justifyContent: "flex-end" }]}><Text style={[s.soft, { width: 80 }]}>{k}</Text><Text style={[s.bold, { width: 110 }]}>{v}</Text></View>
              ))}
            </View>
          </View>
        </View>

        {isExport && (
          <Text style={s.lut}>
            SUPPLY MEANT FOR EXPORT OF SERVICES UNDER LETTER OF UNDERTAKING (LUT) WITHOUT PAYMENT OF INTEGRATED TAX (IGST){company.lutNumber ? ` — LUT ARN: ${company.lutNumber}${company.lutValidity ? ` (valid ${company.lutValidity})` : ""}` : ""}
          </Text>
        )}

        <View style={[s.row, { marginTop: 14 }]}>
          <View style={{ width: "50%", paddingRight: 10 }}>
            <Text style={s.label}>Bill to</Text>
            <Text style={s.bold}>{inv.client.name}</Text>
            {inv.client.address && <Text>{inv.client.address}</Text>}
            <Text>{inv.client.country}</Text>
            {inv.client.gstin && <Text style={{ fontSize: 8.5 }}>GSTIN: {inv.client.gstin}</Text>}
            {inv.client.vendorNumber && <Text style={{ fontSize: 8.5 }}>Supplier no.: {inv.client.vendorNumber}</Text>}
          </View>
          <View style={{ width: "50%" }}>
            <Text style={s.label}>Project</Text>
            <Text style={s.bold}>{inv.project.title}</Text>
            <Text style={s.soft}>{inv.project.code}</Text>
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <View style={s.row} fixed>
            {["#", "Description of services", "SAC", "Qty", "Rate", `Amount (${c})`].map((h, i) => <Text key={h} style={[s.th, { width: cols[i].w, textAlign: cols[i].r ? "right" : "left" }]}>{h}</Text>)}
          </View>
          {inv.items.map((it, i) => (
            <View key={it.id} style={s.row} wrap={false}>
              <Text style={[s.td, { width: cols[0].w }]}>{i + 1}</Text>
              <Text style={[s.td, { width: cols[1].w }]}>{it.description}</Text>
              <Text style={[s.td, { width: cols[2].w }]}>{it.sac ?? ""}</Text>
              <Text style={[s.td, { width: cols[3].w, textAlign: "right" }]}>{num(it.quantity)}</Text>
              <Text style={[s.td, { width: cols[4].w, textAlign: "right" }]}>{amt(it.rate, c).replace(`${c} `, "")}</Text>
              <Text style={[s.td, { width: cols[5].w, textAlign: "right" }]}>{amt(it.amount, c).replace(`${c} `, "")}</Text>
            </View>
          ))}
        </View>

        <View style={{ alignSelf: "flex-end", width: "48%", marginTop: 8 }} wrap={false}>
          {totals.map(([k, v, strong]) => (
            <View key={k} style={[s.row, { justifyContent: "space-between", paddingVertical: 3, ...(strong ? { borderTopWidth: 2, borderTopColor: INK, marginTop: 3, paddingTop: 5 } : {}) }]}>
              <Text style={strong ? [s.bold, { fontSize: 11 }] : s.soft}>{k}</Text><Text style={strong ? [s.bold, { fontSize: 11 }] : {}}>{v}</Text>
            </View>
          ))}
          <Text style={{ fontSize: 8, fontStyle: "italic", textAlign: "right", marginTop: 3 }}>{amountInWords(inv.total, c)}</Text>
          {c !== "INR" && <Text style={[s.soft, { fontSize: 8, textAlign: "right" }]}>INR equivalent @ {num(inv.exchangeRate)}: {amt(num(inv.total) * num(inv.exchangeRate), "INR")}</Text>}
        </View>

        {inv.notes && <View style={{ marginTop: 12 }}><Text style={s.label}>Notes</Text><Text>{inv.notes}</Text></View>}

        <View style={[s.row, { marginTop: 18, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 10 }]} wrap={false}>
          <View style={{ width: "60%", paddingRight: 10 }}>
            <Text style={s.label}>Bank details for remittance</Text>
            <Text style={{ fontSize: 8.5, backgroundColor: MIST, padding: 6 }}>{company.bankDetails || "— add bank details in Settings —"}</Text>
          </View>
          <View style={{ width: "40%", alignItems: "flex-end" }}>
            <Text style={{ fontSize: 8.5 }}>For {company.legalName}</Text>
            <Text style={{ marginTop: 40, fontSize: 8.5 }} >Authorised Signatory</Text>
          </View>
        </View>

        {company.invoiceFooter && <Text style={[s.soft, { textAlign: "center", fontSize: 8, marginTop: 16 }]}>{company.invoiceFooter}</Text>}
        <Text style={{ position: "absolute", bottom: 20, left: 40, right: 40, textAlign: "center", fontSize: 7.5, color: SOFT }} render={({ pageNumber, totalPages }) => `${inv.number} · Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(doc);
  const clientShort = (inv.client.shortName || inv.client.name).replace(/[^\w\s-]/g, "").trim().slice(0, 30);
  return { buffer, fileName: `${inv.number.replace(/\//g, "-")} ${clientShort}.pdf`, invoice: inv };
}
