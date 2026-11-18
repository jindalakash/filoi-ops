"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { ThemeControls } from "./ThemeControls";
import { LayoutDashboard, ClipboardCheck, BookOpen, FileText, FolderKanban, ListChecks, Receipt, Building2, Users, Settings, LogOut, Menu, X } from "lucide-react";

type NavItem = { href: string; label: string; icon: React.ElementType; cap?: string };
const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "My tasks", icon: ClipboardCheck },
  { href: "/opportunities", label: "Proposals", icon: FileText, cap: "presalesView" },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/deliverables", label: "Deliverables", icon: ListChecks },
  { href: "/finance", label: "Finance", icon: Receipt, cap: "financeView" },
  { href: "/library", label: "Library", icon: BookOpen, cap: "library" },
  { href: "/clients", label: "Clients", icon: Building2 },
  { href: "/users", label: "Users", icon: Users, cap: "admin" },
  { href: "/settings", label: "Settings", icon: Settings, cap: "admin" },
];

export function Shell({ user, caps, logout, taskCount = 0, children }: { user: { name: string; role: string; roleLabel: string }; caps: string[]; logout: () => Promise<void>; taskCount?: number; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => !n.cap || caps.includes(n.cap));
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="rounded-lg bg-white px-2 py-1"><Image src="/filoi-logo.png" alt="Filoi" width={56} height={35} priority /></div>
        <div>
          <div className="font-display text-[15px] font-semibold leading-tight text-white">Filoi Ops</div>
          <div className="text-[11px] text-white/60">Proposal → Project → Cash</div>
        </div>
      </div>
      <div className="flex-1 space-y-0.5 px-3">
        {items.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={() => setOpen(false)}
            className={clsx("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition",
              isActive(href) ? "bg-white/12 text-white shadow-[inset_3px_0_0_var(--color-sun)]" : "text-white/70 hover:bg-white/6 hover:text-white")}>
            <Icon size={18} strokeWidth={2} />
            {label}
            {href === "/tasks" && taskCount > 0 && <span className="ml-auto rounded-full bg-sun px-2 py-0.5 text-[11px] font-bold text-night">{taskCount}</span>}
          </Link>
        ))}
      </div>
      <div className="m-3 rounded-xl bg-white/6 p-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-plum text-sm font-bold text-white">
            {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{user.name}</div>
            <div className="text-[11px] text-white/60">{user.roleLabel}</div>
          </div>
          <form action={logout}>
            <button className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white" title="Sign out"><LogOut size={16} /></button>
          </form>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-navy lg:block">{nav}</aside>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-3 backdrop-blur lg:hidden no-print">
        <button onClick={() => setOpen(true)} className="rounded-md p-1.5 hover:bg-mist" aria-label="Open menu"><Menu size={22} /></button>
        <div className="font-display font-semibold">Filoi Ops</div>
        <ThemeControls />
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-night/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-navy">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-5 text-white/70" aria-label="Close menu"><X size={20} /></button>
            {nav}
          </aside>
        </div>
      )}
      <div className="sticky top-0 z-20 hidden justify-end border-b border-transparent bg-mist/80 px-8 py-2.5 backdrop-blur lg:flex no-print">
        <ThemeControls />
      </div>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:pb-8 lg:pt-2">{children}</main>
    </div>
  );
}
