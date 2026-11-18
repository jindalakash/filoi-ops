import { requireUser } from "@/lib/auth";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { Shell } from "@/components/Shell";
import { logout } from "../actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const caps = [
    "presalesView",
    can(user.role, "presales") && "presales",
    can(user.role, "financeView") && "financeView",
    can(user.role, "admin") && "admin",
  ].filter(Boolean) as string[];
  return (
    <Shell user={{ name: user.name, role: user.role, roleLabel: ROLE_LABEL[user.role] }} caps={caps} logout={logout}>
      {children}
    </Shell>
  );
}
