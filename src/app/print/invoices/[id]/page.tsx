import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { PrintButton } from "./PrintButton";

export default async function PrintInvoice({ params }: PageProps<"/print/invoices/[id]">) {
  await requireUser("financeView");
  const { id } = await params;
  const [inv, company] = await Promise.all([
    db.invoice.findUnique({ where: { id }, include: { items: true, client: true, project: true } }),
    getSetting("company"),
  ]);
  if (!inv) notFound();
  return (
    <div className="min-h-dvh bg-mist py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[800px] justify-between px-2">
        <a href={`/finance/invoices/${id}`} className="btn-ghost">← Back</a>
        <PrintButton />
      </div>
      <div className="card mx-auto max-w-[800px] overflow-hidden print:border-0 print:shadow-none">
        <InvoiceDocument inv={inv} company={company} />
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: PageProps<"/print/invoices/[id]">) {
  const { id } = await params;
  const inv = await db.invoice.findUnique({ where: { id }, select: { number: true } });
  return { title: { absolute: `Invoice ${inv?.number.replace(/\//g, "-") ?? ""}` } };
}
