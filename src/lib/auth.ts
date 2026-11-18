import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { SESSION_COOKIE, verifySession } from "./session";
import { can, type Capability } from "./permissions";

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = await verifySession(token);
  if (!s) return null;
  const user = await db.user.findUnique({
    where: { id: s.uid },
    select: { id: true, name: true, username: true, email: true, role: true, active: true, designation: true },
  });
  if (!user || !user.active) return null;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(cap?: Capability) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (cap && !can(user.role, cap)) redirect("/?denied=1");
  return user;
}
