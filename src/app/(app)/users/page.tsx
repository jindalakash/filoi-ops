import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/permissions";
import { PageHeader, Card, Field } from "@/components/ui";
import { Badge } from "@/components/badges";
import { ActionForm, ConfirmAction, Disclosure, SubmitButton } from "@/components/client";
import { saveUser, toggleUser, resetPassword } from "@/app/actions/users";
import { date } from "@/lib/format";
import type { User } from "@prisma/client";

export const metadata = { title: "Users" };

const ROLE_HELP = [
  ["ADMIN", "Everything: proposals, projects, finance, users and settings."],
  ["PROJECT_MANAGER", "Proposals, projects and deliverables. No money figures, users or settings."],
  ["ACCOUNTS", "Finance: billing milestones, invoices, payments and financial dashboard. Read-only on projects."],
] as const;

function UserFields({ u }: { u?: User }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {u && <input type="hidden" name="id" value={u.id} />}
      <Field label="Full name *"><input name="name" required defaultValue={u?.name} className="input" /></Field>
      <Field label="Username (login) *" hint="Short name used to sign in, e.g. neeraj"><input name="username" required pattern="[A-Za-z0-9][A-Za-z0-9._\-]{1,29}" defaultValue={u?.username} className="input lowercase" autoCapitalize="none" placeholder="neeraj" /></Field>
      <Field label="Email *" hint="For reminders and alerts; also works for sign-in"><input name="email" type="email" required defaultValue={u?.email} className="input" /></Field>
      <Field label="Role *">
        <select name="role" defaultValue={u?.role ?? "PROJECT_MANAGER"} className="input">{ROLE_HELP.map(([r]) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
      </Field>
      <Field label="Designation"><input name="designation" defaultValue={u?.designation ?? ""} className="input" /></Field>
      <Field label="Phone"><input name="phone" defaultValue={u?.phone ?? ""} className="input" /></Field>
      {!u && <Field label="Initial password *" hint="Min. 8 characters. They can change it later."><input name="password" type="text" required minLength={8} className="input" autoComplete="new-password" /></Field>}
    </div>
  );
}

export default async function UsersPage() {
  const me = await requireUser("admin");
  const users = await db.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  return (
    <>
      <PageHeader title="Users" subtitle="Create team accounts and control what each person can see." />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {ROLE_HELP.map(([r, h]) => (
          <div key={r} className="card p-4"><Badge tone={r === "ADMIN" ? "purple" : r === "ACCOUNTS" ? "green" : "blue"}>{ROLE_LABEL[r]}</Badge><p className="mt-2 text-sm text-ink-soft">{h}</p></div>
        ))}
      </div>
      <Card title={`Team (${users.length})`} actions={null}>
        <Disclosure label="+ Add user" className="btn-primary" panelClassName="mt-4 mb-2">
          <ActionForm action={saveUser} resetOnOk className="rounded-xl border border-line bg-mist/50 p-4">
            <UserFields />
            <div className="mt-3 flex justify-end"><SubmitButton className="btn-dark btn-sm">Create user</SubmitButton></div>
          </ActionForm>
        </Disclosure>
        <ul className="-mx-5 mt-4 divide-y divide-line border-t border-line">
          {users.map((u) => (
            <li key={u.id} className="px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${u.active ? "bg-navy" : "bg-slate-300"}`}>{u.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-semibold">{u.name}{u.id === me.id && <span className="text-xs font-normal text-ink-soft">(you)</span>}
                    <Badge tone={u.role === "ADMIN" ? "purple" : u.role === "ACCOUNTS" ? "green" : "blue"}>{ROLE_LABEL[u.role]}</Badge>{!u.active && <Badge tone="red">Deactivated</Badge>}</div>
                  <div className="text-sm text-ink-soft"><span className="font-semibold text-ink">@{u.username}</span> · {u.email}{u.designation && ` · ${u.designation}`} · last login {u.lastLoginAt ? date(u.lastLoginAt) : "never"}</div>
                </div>
                {u.id !== me.id && <ConfirmAction action={toggleUser} fields={{ id: u.id }} label={u.active ? "Deactivate" : "Activate"} confirm={`${u.active ? "Deactivate" : "Activate"} ${u.name}?`} className={u.active ? "btn-danger btn-sm" : "btn-ghost btn-sm"} />}
              </div>
              <div className="mt-2 flex flex-wrap gap-4 sm:pl-13">
                <Disclosure label="Edit" className="text-xs font-semibold text-sky hover:underline">
                  <ActionForm action={saveUser} className="rounded-xl border border-line bg-mist/50 p-4"><UserFields u={u} /><div className="mt-3 flex justify-end"><SubmitButton className="btn-dark btn-sm">Save</SubmitButton></div></ActionForm>
                </Disclosure>
                <Disclosure label="Reset password" className="text-xs font-semibold text-sky hover:underline">
                  <ActionForm action={resetPassword} resetOnOk className="flex max-w-md items-end gap-2 rounded-xl border border-line bg-mist/50 p-4">
                    <input type="hidden" name="id" value={u.id} />
                    <Field label="New password" className="flex-1"><input name="password" type="text" minLength={8} required className="input" autoComplete="new-password" /></Field>
                    <SubmitButton className="btn-dark btn-sm">Set</SubmitButton>
                  </ActionForm>
                </Disclosure>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
