import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

type Hit = { type: string; id: string; title: string; subtitle?: string; href: string };
const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

/** Searches across the app, respecting what the user's role may see. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ groups: [] });
  const fin = can(user.role, "financeView");
  const lib = can(user.role, "presales") || can(user.role, "finance");
  const take = 5;

  const [opps, projects, deliverables, clients, invoices, tasks, experts, refs, docs] = await Promise.all([
    db.opportunity.findMany({ where: { OR: [{ title: ci(q) }, { code: ci(q) }, { referenceNo: ci(q) }, { client: { OR: [{ name: ci(q) }, { shortName: ci(q) }] } }] }, include: { client: true }, take, orderBy: { updatedAt: "desc" } }),
    db.project.findMany({ where: { OR: [{ title: ci(q) }, { code: ci(q) }, { contractNo: ci(q) }, { client: { OR: [{ name: ci(q) }, { shortName: ci(q) }] } }] }, include: { client: true }, take, orderBy: { updatedAt: "desc" } }),
    db.deliverable.findMany({ where: { title: ci(q) }, include: { project: true }, take, orderBy: { dueDate: "asc" } }),
    db.client.findMany({ where: { OR: [{ name: ci(q) }, { shortName: ci(q) }, { contactName: ci(q) }, { contactEmail: ci(q) }] }, take }),
    fin ? db.invoice.findMany({ where: { OR: [{ number: ci(q) }, { poReference: ci(q) }, { client: { OR: [{ name: ci(q) }, { shortName: ci(q) }] } }] }, include: { client: true }, take, orderBy: { issueDate: "desc" } }) : Promise.resolve([]),
    db.proposalTask.findMany({ where: { title: ci(q) }, include: { opportunity: true }, take, orderBy: { updatedAt: "desc" } }),
    lib ? db.expert.findMany({ where: { active: true, OR: [{ name: ci(q) }, { title: ci(q) }, { expertise: ci(q) }] }, take }) : Promise.resolve([]),
    lib ? db.reference.findMany({ where: { OR: [{ title: ci(q) }, { client: ci(q) }, { country: ci(q) }] }, take }) : Promise.resolve([]),
    db.document.findMany({ where: { fileName: ci(q) }, include: { opportunity: { select: { id: true, code: true } }, project: { select: { id: true, code: true } } }, take, orderBy: { createdAt: "desc" } }),
  ]);

  const groups: { label: string; hits: Hit[] }[] = [
    { label: "Proposals", hits: opps.map((o) => ({ type: "proposal", id: o.id, title: o.title, subtitle: `${o.code} · ${o.client.shortName || o.client.name}`, href: `/opportunities/${o.id}` })) },
    { label: "Projects", hits: projects.map((p) => ({ type: "project", id: p.id, title: p.title, subtitle: `${p.code} · ${p.client.shortName || p.client.name}`, href: `/projects/${p.id}` })) },
    { label: "Deliverables", hits: deliverables.map((d) => ({ type: "deliverable", id: d.id, title: d.title, subtitle: d.project.code, href: `/projects/${d.projectId}` })) },
    { label: "Invoices", hits: invoices.map((i) => ({ type: "invoice", id: i.id, title: i.number, subtitle: i.client.shortName || i.client.name, href: `/finance/invoices/${i.id}` })) },
    { label: "Tasks", hits: tasks.map((t) => ({ type: "task", id: t.id, title: t.title, subtitle: t.opportunity.code, href: `/tasks/${t.id}` })) },
    { label: "Clients", hits: clients.map((c) => ({ type: "client", id: c.id, title: c.name, subtitle: c.country, href: `/clients/${c.id}` })) },
    { label: "Experts", hits: experts.map((e) => ({ type: "expert", id: e.id, title: e.name, subtitle: e.title ?? e.expertise ?? undefined, href: `/library/experts/${e.id}` })) },
    { label: "Experience", hits: refs.map((r) => ({ type: "reference", id: r.id, title: r.title, subtitle: r.client, href: `/library?tab=references` })) },
    {
      label: "Files",
      hits: docs.filter((d) => d.opportunity || d.project).map((d) => ({
        type: "file", id: d.id, title: d.fileName, subtitle: d.opportunity?.code ?? d.project?.code,
        href: d.opportunity ? `/opportunities/${d.opportunity.id}` : `/projects/${d.project!.id}?tab=documents`,
      })),
    },
  ].filter((g) => g.hits.length);
  return NextResponse.json({ groups });
}
