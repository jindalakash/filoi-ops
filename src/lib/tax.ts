import type { SupplyType } from "@prisma/client";

export const SUPPLY_LABEL: Record<SupplyType, string> = {
  EXPORT_LUT: "Export of services – under LUT (zero-rated, no IGST)",
  DOMESTIC_INTER: "Domestic – inter-state (IGST)",
  DOMESTIC_INTRA: "Domestic – intra-state (CGST + SGST)",
  EXEMPT: "Exempt / non-taxable",
};

export function suggestSupplyType(clientCountry: string | null | undefined, clientState: string | null | undefined, companyState: string | null | undefined): SupplyType {
  if ((clientCountry ?? "").trim().toLowerCase() !== "india") return "EXPORT_LUT";
  if (clientState && companyState && clientState === companyState) return "DOMESTIC_INTRA";
  return "DOMESTIC_INTER";
}

export function computeTax(subtotal: number, supply: SupplyType, rate: number) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let cgst = 0, sgst = 0, igst = 0;
  if (supply === "DOMESTIC_INTRA") { cgst = r2((subtotal * rate) / 200); sgst = cgst; }
  else if (supply === "DOMESTIC_INTER") igst = r2((subtotal * rate) / 100);
  const effectiveRate = supply === "DOMESTIC_INTRA" || supply === "DOMESTIC_INTER" ? rate : 0;
  return { cgst, sgst, igst, total: r2(subtotal + cgst + sgst + igst), taxRate: effectiveRate };
}
