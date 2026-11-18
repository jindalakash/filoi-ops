import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader, Card, KV, Empty } from "@/components/ui";
import { StatusBadge, OPP_STATUS, PROJECT_STATUS } from "@/components/badges";
import { ConfirmAction } from "@/components/client";
import { CLIENT_TYPES } from "@/components/forms";
import { deleteClient } from "@/app/actions/clients";
import { Amt } from "@/components/Money";
import { date } from "@/lib/format";

export default async function ClientPage({ params }: PageProps<"/clients/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const c = await db.client.findUnique({
    where: { id },
    include: { opportunities: { orderBy: { createdAt: "desc" } }, projects: { orderBy: { createdAt: "desc" } } },
  });
  if (!c) notFound();
  const fin = can(user.role, "financeView");
  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={[c.shortName, Object.fromEntries(CLIENT_TYPES)[c.type], c.country].filter(Boolean).join(" · ")}
        back={{ href: "/clients", label: "Clients" }}
        actions={<>
          <Link href={`/clients/${id}/edit`} className="btn-ghost">Edit</Link>
          {can(user.role, "admin") && <ConfirmAction action={deleteClient} fields={{ id }} label="Delete" confirm="Delete this client?" className="btn-danger" />}
        </>}
      />
      <div className="grid gap-6">
        <Card title="Details">
          <KV items={[
            ["Contact", c.contactName], ["Email", c.contactEmail], ["Phone", c.contactPhone],
            ["Default currency", c.defaultCurrency], ["Vendor no.", c.vendorNumber], ["GSTIN", c.gstin],
            ["Address", c.address && <span className="whitespace-pre-line">{c.address}</span>], ["Notes", c.notes],
          ]} />
        </Card>
        <Card title="Proposals" pad={false}>
          {c.opportunities.length === 0 ? <Empty title="No proposals" /> : (
            <div className="overflow-x-auto"><table className="table"><tbody>
              {c.opportunities.map((o) => (
                <tr key={o.id}><td className="text-xs text-ink-soft">{o.code}</td><td><Link className="link" href={`/opportunities/${o.id}`}>{o.title}</Link></td>
                  <td><StatusBadge map={OPP_STATUS} value={o.status} /></td><td className="text-right">{o.estimatedValue ? <Amt v={o.estimatedValue} c={o.currency} /> : ""}</td></tr>
              ))}
            </tbody></table></div>
          )}
        </Card>
        <Card title="Projects" pad={false}>
          {c.projects.length === 0 ? <Empty title="No projects" /> : (
            <div className="overflow-x-auto"><table className="table"><tbody>
              {c.projects.map((p) => (
                <tr key={p.id}><td className="text-xs text-ink-soft">{p.code}</td><td><Link className="link" href={`/projects/${p.id}`}>{p.title}</Link></td>
                  <td><StatusBadge map={PROJECT_STATUS} value={p.status} /></td><td className="text-ink-soft">{date(p.endDate)}</td>
                  <td className="text-right">{fin ? <Amt v={p.contractValue} c={p.currency} /> : ""}</td></tr>
              ))}
            </tbody></table></div>
          )}
        </Card>
      </div>
    </>
  );
}
