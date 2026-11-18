import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/permissions";
import { PageHeader, Card, Field, KV } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client";
import { changeOwnPassword } from "@/app/actions/users";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const u = await requireUser();
  return (
    <>
      <PageHeader title="My account" />
      <div className="grid max-w-4xl gap-6 md:grid-cols-2">
        <Card title="Profile"><KV items={[["Name", u.name], ["Username", `@${u.username}`], ["Email", u.email], ["Role", ROLE_LABEL[u.role]]]} /></Card>
        <Card title="Change password">
          <ActionForm action={changeOwnPassword} resetOnOk className="space-y-3">
            <Field label="Current password"><input name="current" type="password" required className="input" autoComplete="current-password" /></Field>
            <Field label="New password"><input name="password" type="password" minLength={8} required className="input" autoComplete="new-password" /></Field>
            <SubmitButton>Change password</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
