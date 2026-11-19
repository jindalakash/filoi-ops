"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Volume2, VolumeX } from "lucide-react";
import clsx from "clsx";
import { play, soundEnabled, setSoundEnabled } from "@/lib/sound";

type Theme = "light" | "dark";
const THEME_KEY = "filoi-theme";

/** Inline script for <head>: applies the saved (or system) theme before first paint. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t);if(localStorage.getItem("filoi-rail")==="1")document.documentElement.setAttribute("data-rail","1")}catch(e){}})()`;

function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const readTheme = (): Theme => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

function subscribeSound(cb: () => void) {
  window.addEventListener("filoi-sound", cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener("filoi-sound", cb); window.removeEventListener("storage", cb); };
}

/** Day / night switch with an animated sun ↔ moon and a chime. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as Theme);
  const dark = theme === "dark";
  const toggle = () => {
    const next: Theme = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage blocked */ }
    play(next === "dark" ? "night" : "day");
  };
  return (
    <button type="button" onClick={toggle} data-silent role="switch" aria-checked={dark} aria-label={dark ? "Switch to day mode" : "Switch to night mode"} title={dark ? "Day mode" : "Night mode"}
      className={clsx("relative inline-flex h-8 w-[60px] shrink-0 items-center rounded-full border border-line bg-sky/10 transition-colors duration-300 dark:border-[#3a4f80] dark:bg-[#16223d]", className)}>
      {/* look is driven by [data-theme] in CSS, so it is correct on the first frame */}
      <span className="pointer-events-none absolute left-2 text-[10px] opacity-0 transition-opacity duration-300 dark:opacity-100">✦</span>
      <span className="pointer-events-none absolute right-2.5 text-[10px] text-sun opacity-100 transition-opacity duration-300 dark:opacity-0">☀</span>
      <span className="absolute left-0.5 top-0.5 grid h-6 w-6 place-items-center overflow-hidden rounded-full bg-sun shadow-md transition-all duration-300 ease-[cubic-bezier(.5,1.6,.4,1)] dark:left-[30px] dark:bg-[#c9d6f2]">
        <span className="block h-6 w-6 translate-x-4 -translate-y-4 scale-0 rounded-full transition-all duration-300 dark:translate-x-1.5 dark:-translate-y-1 dark:scale-[.72] dark:bg-[#16223d]" />
      </span>
    </button>
  );
}

export function SoundToggle({ className }: { className?: string }) {
  const on = useSyncExternalStore(subscribeSound, soundEnabled, () => true);
  return (
    <button type="button" data-silent onClick={() => { setSoundEnabled(!on); if (!on) setTimeout(() => play("pop"), 10); }}
      aria-label={on ? "Mute sounds" : "Turn sounds on"} title={on ? "Sounds on" : "Sounds off"}
      className={clsx("grid h-8 w-8 place-items-center rounded-full border border-line text-ink-soft transition hover:text-ink", className)}>
      {on ? <Volume2 size={15} /> : <VolumeX size={15} />}
    </button>
  );
}

/** Global UI sounds: a tick on clicks, a whoosh on page changes. */
export function SoundEffects() {
  const path = usePathname();
  const lastPath = useRef(path);
  useEffect(() => {
    if (lastPath.current === path) return; // first render
    lastPath.current = path;
    play("nav");
  }, [path]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("button, a[href], [role=button], select, summary, input[type=checkbox], input[type=radio], input[type=file]");
      if (!el || el.closest("[data-silent]") || (el as HTMLButtonElement).disabled) return;
      play("click");
    };
    document.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    return () => document.removeEventListener("pointerdown", onDown, { capture: true });
  }, []);
  return null;
}

export function ThemeControls({ className }: { className?: string }) {
  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <SoundToggle />
      <ThemeToggle />
    </div>
  );
}
