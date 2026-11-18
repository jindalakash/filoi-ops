import Link from "next/link";
import clsx from "clsx";

export function PageHeader({ title, subtitle, actions, back }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-ink sm:text-[26px]">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-ink-soft">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, actions, children, className, pad = true }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx("card", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      <div className={clsx(pad && "p-5")}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone = "ink", href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "ink" | "plum" | "sky" | "sun" | "green" | "red"; href?: string }) {
  const bar: Record<string, string> = { ink: "bg-navy", plum: "bg-plum", sky: "bg-sky", sun: "bg-sun", green: "bg-emerald-600", red: "bg-red-600" };
  const inner = (
    <div className="card relative h-full overflow-hidden p-4 transition hover:shadow-md">
      <span className={clsx("absolute inset-y-0 left-0 w-1", bar[tone])} />
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="mt-1.5 font-display text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-soft">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-mist text-xl">∅</div>
      <div className="font-semibold">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

export function KV({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{k}</dt>
          <dd className="mt-0.5 break-words text-sm">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={clsx("tab", active === t.key && "tab-active")} scroll={false}>
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-mist px-1.5 py-0.5 text-[11px] text-ink-soft">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export function Progress({ value, tone = "plum" }: { value: number; tone?: "plum" | "sky" | "green" }) {
  const c = { plum: "bg-plum", sky: "bg-sky", green: "bg-emerald-600" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className={clsx("h-full rounded-full", c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: React.ReactNode }) {
  const cls = {
    info: "border-sky/30 bg-sky/5 text-ink",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-800",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  }[tone];
  return <div className={clsx("rounded-xl border px-4 py-3 text-sm", cls)}>{children}</div>;
}
