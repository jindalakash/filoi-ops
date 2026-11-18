import Image from "next/image";
import { login } from "../actions/auth";
import { ActionForm, SubmitButton } from "@/components/client";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-plum/40 blur-3xl" />
        <div className="absolute -bottom-32 right-0 h-[28rem] w-[28rem] rounded-full bg-sky/30 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="inline-flex w-fit rounded-xl bg-white px-3 py-2"><Image src="/filoi-logo.png" alt="Filoi" width={90} height={57} priority /></div>
          <div>
            <h1 className="max-w-md text-4xl font-semibold leading-tight">From tender to invoice, in one place.</h1>
            <p className="mt-4 max-w-md text-white/70">Track proposals, deliverables, billing milestones and payments for every Filoi engagement — with reminders before anything slips.</p>
          </div>
          <div className="text-sm text-white/50">Filoi Private Limited · www.filoi.in</div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Image src="/filoi-logo.png" alt="Filoi" width={80} height={50} priority /></div>
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-ink-soft">Use the account your administrator created for you.</p>
          <ActionForm action={login} className="mt-6 space-y-4">
            <input type="hidden" name="next" value={next ?? "/"} />
            <label className="block"><span className="label">Email</span><input name="email" type="email" required autoComplete="email" className="input" /></label>
            <label className="block"><span className="label">Password</span><input name="password" type="password" required autoComplete="current-password" className="input" /></label>
            <SubmitButton className="btn-primary w-full !py-2.5" pendingText="Signing in…">Sign in</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
