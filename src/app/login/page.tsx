import Image from "next/image";
import { LoginForm } from "@/components/LoginForm";
import { LoginShowcase } from "@/components/LoginShowcase";
import { ThemeControls } from "@/components/ThemeControls";

export const metadata = { title: "Sign in" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; expired?: string }> }) {
  const { next, expired } = await searchParams;
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      <LoginShowcase />
      <div className="relative flex flex-col bg-mist">
        <div className="flex items-center justify-between p-5">
          <div className="rounded-xl bg-white px-2.5 py-1.5 shadow-sm lg:invisible"><Image src="/filoi-logo.png" alt="Filoi" width={64} height={40} priority /></div>
          <ThemeControls />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-[400px]">
            <p className="anim-fade-up text-sm font-semibold text-plum" style={{ animationDelay: ".05s" }}>{greeting()} 👋</p>
            <h2 className="anim-fade-up mt-1 font-display text-3xl font-semibold tracking-tight text-ink" style={{ animationDelay: ".1s" }}>Sign in to Filoi Ops</h2>
            <p className="anim-fade-up mt-2 text-sm text-ink-soft" style={{ animationDelay: ".15s" }}>Proposals, projects and billing for the Filoi team.</p>
            {expired && <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">Your session ended (your account may have been changed). Please sign in again.</p>}
            <div className="anim-fade-up mt-8" style={{ animationDelay: ".22s" }}>
              <LoginForm next={next ?? "/"} />
            </div>
            <p className="anim-fade-up mt-8 text-center text-xs text-ink-soft" style={{ animationDelay: ".3s" }}>
              New to the team? Your administrator creates your account.
            </p>
          </div>
        </div>
        <div className="pb-5 text-center text-[11px] text-ink-soft/70 lg:hidden">Filoi Private Limited · www.filoi.in</div>
      </div>
    </div>
  );
}
