"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import type { ActionState } from "@/components/client";

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  const next = String(fd.get("next") || "/");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Incorrect email or password." };
  }
  const token = await signSession({ uid: user.id, role: user.role, name: user.name });
  // "Keep me signed in" → 7-day cookie; otherwise it ends when the browser closes (the token itself still expires after 7 days)
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "1",
    ...(fd.get("remember") ? { maxAge: SESSION_MAX_AGE } : {}),
    path: "/",
  });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
