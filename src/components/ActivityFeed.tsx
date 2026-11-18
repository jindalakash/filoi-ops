import { db } from "@/lib/db";
import { Card } from "./ui";

export async function ActivityFeed({ entities }: { entities: { entity: string; ids: string[] }[] }) {
  const items = await db.activity.findMany({
    where: { OR: entities.filter((e) => e.ids.length).map((e) => ({ entity: e.entity, entityId: { in: e.ids } })) },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  return (
    <Card title="Activity">
      {items.length === 0 ? <p className="text-sm text-ink-soft">No activity yet.</p> : (
        <ol className="relative space-y-4 border-l border-line pl-4">
          {items.map((a) => (
            <li key={a.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-plum" />
              <div className="text-sm">{a.summary}</div>
              <div className="text-xs text-ink-soft">{a.user?.name ?? "System"} · {a.createdAt.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
