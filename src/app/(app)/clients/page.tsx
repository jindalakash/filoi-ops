import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, Card, Empty } from "@/components/ui";
import { CLIENT_TYPES } from "@/components/forms";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q } = await searchParams;
  const clients = await db.client.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { shortName: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: { name: "asc" },
    include: { _count: { select: { opportunities: true, projects: true } } },
  });
  const typeLabel = Object.fromEntries(CLIENT_TYPES);
  return (
    <>
      <PageHeader title="Clients" subtitle="Agencies, governments and organisations you bid for and work with." actions={<Link href="/clients/new" className="btn-primary">+ New client</Link>} />
      <Card pad={false}>
        <form className="border-b border-line p-3"><input name="q" defaultValue={q} placeholder="Search clients…" className="input max-w-sm" /></form>
        {clients.length === 0 ? <Empty title="No clients yet">Add WHO, UNICEF or any organisation you work with.</Empty> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Client</th><th>Type</th><th>Country</th><th>Contact</th><th className="text-right">Proposals</th><th className="text-right">Projects</th></tr></thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/clients/${c.id}`} className="link">{c.name}</Link>{c.shortName && <span className="ml-2 text-xs text-ink-soft">{c.shortName}</span>}</td>
                    <td className="text-ink-soft">{typeLabel[c.type]}</td>
                    <td>{c.country}</td>
                    <td className="text-ink-soft">{c.contactName}{c.contactEmail && <div className="text-xs">{c.contactEmail}</div>}</td>
                    <td className="text-right tabular-nums">{c._count.opportunities}</td>
                    <td className="text-right tabular-nums">{c._count.projects}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
