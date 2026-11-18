import type { Role } from "@prisma/client";

export type Capability =
  | "presales" // proposals / opportunities
  | "projects" // projects & deliverables (edit)
  | "finance" // invoices, payments, billing
  | "financeView" // see money figures
  | "admin"; // users & settings

const MATRIX: Record<Role, Capability[]> = {
  ADMIN: ["presales", "projects", "finance", "financeView", "admin"],
  PROJECT_MANAGER: ["presales", "projects"],
  ACCOUNTS: ["finance", "financeView"],
};

export function can(role: Role | string | undefined, cap: Capability) {
  if (!role) return false;
  return MATRIX[role as Role]?.includes(cap) ?? false;
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  PROJECT_MANAGER: "Project Manager",
  ACCOUNTS: "Accounts Manager",
};
