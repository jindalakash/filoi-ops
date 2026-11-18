"use client";
import { useEffect, useState } from "react";
import { Sparkles, CheckCircle2, BellRing, FileText, ShieldCheck, Server } from "lucide-react";

const HIGHLIGHTS = [
  { t: "AI reads your TORs", d: "Deadlines, eligibility and deliverables pulled out in a minute — you just review." },
  { t: "GST & LUT invoicing", d: "Export invoices for WHO, UNICEF and every UN agency, in USD, EUR or INR." },
  { t: "Nothing slips", d: "Email reminders before deliverables, invoices and proposal deadlines." },
  { t: "Cash flow at a glance", d: "See when money will actually arrive — and plan for it." },
];

function Glass({ className, style, children }: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return <div className={`rounded-2xl border border-white/15 bg-white/[0.08] p-4 text-white shadow-[0_20px_60px_-20px_rgba(0,0,0,.5)] backdrop-blur-xl ${className ?? ""}`} style={style}>{children}</div>;
}

/** Left half of the login page: aurora background, product glimpses and rotating highlights. */
export function LoginShowcase() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % HIGHLIGHTS.length), 4500);
    return () => clearInterval(id);
  }, []);
  const h = HIGHLIGHTS[i];

  return (
    <div className="relative hidden overflow-hidden bg-[#081430] lg:block">
      {/* aurora */}
      <div className="anim-aurora absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-[#8a2c8d]/45 blur-[110px]" />
      <div className="anim-aurora absolute -bottom-48 right-[-10rem] h-[38rem] w-[38rem] rounded-full bg-[#2f6fc0]/40 blur-[120px]" style={{ animationDelay: "-6s" }} />
      <div className="anim-aurora absolute left-1/3 top-1/2 h-72 w-72 rounded-full bg-[#f0a830]/15 blur-[100px]" style={{ animationDelay: "-11s" }} />
      <div className="dot-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]" />

      <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
        <div className="anim-fade-up flex items-center gap-3">
          <div className="rounded-xl bg-white px-3 py-2 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/filoi-logo.png" alt="Filoi" width={84} height={53} />
          </div>
          <div className="text-white/70"><div className="font-display text-lg font-semibold text-white">Filoi Ops</div><div className="text-xs">Proposal → Project → Cash</div></div>
        </div>

        <div className="relative">
          <h1 className="anim-fade-up max-w-xl font-display text-[2.6rem] font-semibold leading-[1.1] text-white xl:text-5xl" style={{ animationDelay: ".1s" }}>
            From tender to invoice,<br />
            <span className="bg-gradient-to-r from-[#f0a830] via-[#e88ad0] to-[#7fb2ff] bg-clip-text text-transparent">in one place.</span>
          </h1>

          {/* product glimpses */}
          <div className="relative mt-10 h-[260px] max-w-xl">
            <Glass className="anim-fade-up absolute left-0 top-0 w-[19rem]" style={{ animationDelay: ".25s" }}>
              <div className="anim-floaty" style={{ animationDelay: "-1s" }}>
                <div className="flex items-center gap-2 text-xs text-white/70"><Sparkles size={14} className="text-[#f0a830]" /> TOR read by AI · 48s</div>
                <div className="mt-2 flex items-start gap-2.5"><FileText size={18} className="mt-0.5 shrink-0 text-[#7fb2ff]" /><div className="text-sm font-semibold leading-snug">WHO SEARO — eIR assessment, Bhutan · Nepal · Sri Lanka</div></div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-full bg-white/10 px-2 py-0.5">Deadline 10 Dec</span><span className="rounded-full bg-white/10 px-2 py-0.5">QCBS 70:30</span><span className="rounded-full bg-white/10 px-2 py-0.5">USD 145K</span>
                </div>
              </div>
            </Glass>
            <Glass className="anim-fade-up absolute right-0 top-16 w-[15.5rem]" style={{ animationDelay: ".45s" }}>
              <div className="anim-floaty" style={{ animationDelay: "-3s" }}>
                <div className="flex items-center gap-2 text-xs text-white/70"><CheckCircle2 size={14} className="text-emerald-400" /> Payment received</div>
                <div className="mt-1.5 font-display text-2xl font-semibold">₹16.1L <span className="text-sm font-normal text-white/60">($19.2K)</span></div>
                <div className="mt-1 text-xs text-white/60">FIL/26-27/001 · WHO</div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="anim-fill h-full w-[72%] rounded-full bg-gradient-to-r from-emerald-400 to-[#7fb2ff]" style={{ animationDelay: ".9s" }} /></div>
                <div className="mt-1 text-[11px] text-white/50">72% of contract collected</div>
              </div>
            </Glass>
            <Glass className="anim-fade-up absolute bottom-0 left-16 w-[17rem]" style={{ animationDelay: ".65s" }}>
              <div className="anim-floaty flex items-center gap-3" style={{ animationDelay: "-5s" }}>
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f0a830]/20"><BellRing size={16} className="text-[#f0a830]" /></div>
                <div className="min-w-0"><div className="text-sm font-semibold">Inception report due in 5 days</div><div className="text-xs text-white/60">Reminder sent to the project team</div></div>
              </div>
            </Glass>
          </div>

          {/* rotating highlight */}
          <div className="mt-10 max-w-md" aria-live="polite">
            <div key={i} className="anim-fade-up">
              <div className="font-display text-lg font-semibold text-white">{h.t}</div>
              <p className="mt-1 text-sm leading-relaxed text-white/65">{h.d}</p>
            </div>
            <div className="mt-4 flex gap-1.5">
              {HIGHLIGHTS.map((_, k) => (
                <button key={k} type="button" data-silent aria-label={`Show highlight ${k + 1}`} onClick={() => setI(k)}
                  className={`h-1.5 rounded-full transition-all duration-500 ${k === i ? "w-8 bg-white" : "w-3 bg-white/25 hover:bg-white/50"}`} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-white/45">
          <span>Filoi Private Limited · Noida · www.filoi.in</span>
          <span className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><ShieldCheck size={13} /> Encrypted sessions</span>
            <span className="flex items-center gap-1.5"><Server size={13} /> Your data stays on your server</span>
          </span>
        </div>
      </div>
    </div>
  );
}
