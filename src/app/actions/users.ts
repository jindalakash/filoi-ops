"use server";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { guard, req, str, FormError } from "@/lib/form";
import { logActivity } from "@/lib/activity";
import type { ActionState } from "@/components/client";
import type { Role } from "@prisma/client";

function checkPassword(p: string) {
  if (p.length < 8) throw new FormError("Password must be at least 8 characters.");
}

export async function saveUser(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  return guard(async () => {
    const id = str(fd, "id");
    const email = req(fd, "email", "Email").toLowerCase();
    const username = (str(fd, "username") || email.split("@")[0]).toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(username)) throw new FormError("Username: 2–30 characters, letters, numbers, dot, dash or underscore (no spaces).");
    const role = req(fd, "role") as Role;
    const data = { name: req(fd, "name", "Name"), username, email, role, designation: str(fd, "designation"), phone: str(fd, "phone") };
    const clash = await db.user.findFirst({ where: { OR: [{ email }, { username }], ...(id ? { NOT: { id } } : {}) } });
    if (clash) throw new FormError(clash.email === email ? "Another user already has this email." : `The username “${username}” is taken.`);
    if (id) {
      if (id === admin.id && role !== "ADMIN") throw new FormError("You cannot remove your own admin role.");
      await db.user.update({ where: { id }, data });
      await logActivity(admin.id, "update", "user", id, `Updated user ${email}`);
      revalidatePath("/users");
      return { ok: "User updated." };
    }
    const password = req(fd, "password", "Password");
    checkPassword(password);
    const u = await db.user.create({ data: { ...data, passwordHash: await bcrypt.hash(password, 10) } });
    await logActivity(admin.id, "create", "user", u.id, `Created user ${email} (${role})`);
    revalidatePath("/users");
    return { ok: `User ${u.name} created — they sign in as “${u.username}”. Share the password with them securely.` };
  });
}

export async function resetPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  return guard(async () => {
    const id = req(fd, "id");
    const password = req(fd, "password", "New password");
    checkPassword(password);
    await db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    await logActivity(admin.id, "password", "user", id, "Reset password");
    return { ok: "Password reset." };
  });
}

export async function toggleUser(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  return guard(async () => {
    const id = req(fd, "id");
    if (id === admin.id) return { error: "You cannot deactivate yourself." };
    const u = await db.user.findUniqueOrThrow({ where: { id } });
    await db.user.update({ where: { id }, data: { active: !u.active } });
    await logActivity(admin.id, "update", "user", id, `${u.active ? "Deactivated" : "Activated"} ${u.email}`);
    revalidatePath("/users");
    return { ok: "Updated." };
  });
}

/** Any user can change their own password */
export async function changeOwnPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireUser();
  return guard(async () => {
    const u = await db.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await bcrypt.compare(String(fd.get("current") || ""), u.passwordHash))) throw new FormError("Current password is incorrect.");
    const p = req(fd, "password", "New password");
    checkPassword(p);
    await db.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(p, 10) } });
    return { ok: "Password changed." };
  });
}
