import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/** Active app users with their email — suggestions for email fields. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const people = await db.user.findMany({ where: { active: true }, select: { name: true, email: true, designation: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ people });
}
