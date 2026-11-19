import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/** The signed-in user's latest notifications and unread count. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, kind: true, title: true, body: true, href: true, readAt: true, createdAt: true } }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return NextResponse.json({ items, unread });
}

/** Mark read: { id } for one, or { all: true }. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };
  await db.notification.updateMany({ where: { userId: user.id, readAt: null, ...(body.all ? {} : { id: String(body.id ?? "") }) }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
}
