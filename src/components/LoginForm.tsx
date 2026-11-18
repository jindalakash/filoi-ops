"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Mail, Lock, Eye, EyeOff, ArrowRight, AlertTriangle, Info } from "lucide-react";
import clsx from "clsx";
import { login } from "@/app/actions/auth";
import { play } from "@/lib/sound";
import type { ActionState } from "./client";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#8a2c8d] to-[#6f2272] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(138,44,141,.7)] transition hover:shadow-[0_14px_36px_-10px_rgba(138,44,141,.85)] focus:outline-none focus-visible:ring-4 focus-visible:ring-plum/30 disabled:opacity-80">
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      {pending ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Signing in…</> : <>Sign in <ArrowRight size={18} className="transition group-hover:translate-x-0.5" /></>}
    </button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, run] = useActionState<ActionState, FormData>(login, undefined);
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState(""); // controlled, so React's post-submit form reset keeps it
  const pw = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state?.error) return;
    play("error");
    // restart the shake animation on the form (keeps what was typed)
    const f = form.current;
    if (f) { f.classList.remove("anim-shake"); void f.offsetWidth; f.classList.add("anim-shake"); }
    pw.current?.select();
  }, [state]);

  const field = "peer h-12 w-full rounded-xl border border-line bg-surface pl-11 pr-4 text-[15px] text-ink outline-none transition placeholder:text-ink-soft/50 focus:border-plum focus:ring-4 focus:ring-plum/15";
  return (
    <form ref={form} action={run} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {state?.error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"><AlertTriangle size={16} className="shrink-0" /> {state.error}</div>
      )}
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold text-ink">Work email</span>
        <span className="relative block">
          <input name="email" type="email" required autoComplete="email" autoFocus placeholder="you@filoi.in" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          <Mail size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft transition peer-focus:text-plum" />
        </span>
      </label>
      <label className="block">
        <span className="mb-1.5 flex items-center justify-between text-sm font-semibold text-ink">
          Password
          <button type="button" data-silent onClick={() => { setForgot((f) => !f); play(forgot ? "close" : "pop"); }} className="text-xs font-semibold text-sky hover:underline">Forgot password?</button>
        </span>
        <span className="relative block">
          <input ref={pw} name="password" type={show ? "text" : "password"} required autoComplete="current-password" placeholder="••••••••" className={clsx(field, "pr-12")}
            onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))} onKeyDown={(e) => setCaps(e.getModifierState("CapsLock"))} onBlur={() => setCaps(false)} />
          <Lock size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft transition peer-focus:text-plum" />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-soft transition hover:bg-mist hover:text-ink">
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </span>
        {caps && <span className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-700"><AlertTriangle size={13} /> Caps Lock is on</span>}
      </label>
      {forgot && (
        <div className="anim-fade-up flex gap-2 rounded-xl border border-sky/30 bg-sky/5 px-3.5 py-2.5 text-sm text-ink"><Info size={16} className="mt-0.5 shrink-0 text-sky" /> Passwords are managed by your administrator. Ask them to reset yours from <b>Users</b> — it takes a few seconds.</div>
      )}
      <label className="flex items-center gap-2.5 text-sm text-ink-soft">
        <input type="checkbox" name="remember" defaultChecked className="h-4 w-4 rounded accent-plum" /> Keep me signed in for 7 days
      </label>
      <Submit />
    </form>
  );
}
