"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import {
  DARK_THEME_COLOR,
  LIGHT_THEME_COLOR,
  THEME_STORAGE_KEY,
  THEME_COLOR_META_ID,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

function storedTheme(): "light" | "dark" | null {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null;
  }
}

function applyTheme(dark: boolean) {
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.dataset.theme = dark ? "dark" : "light";
  document
    .getElementById(THEME_COLOR_META_ID)
    ?.setAttribute("content", dark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const saved = storedTheme();
      const next = saved ? saved === "dark" : system.matches;
      applyTheme(next);
      setDark(next);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) sync();
    };
    sync();
    system.addEventListener("change", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      system.removeEventListener("change", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function toggle(event: React.MouseEvent<HTMLButtonElement>) {
    const next = !document.documentElement.classList.contains("dark");
    const commit = () => {
      applyTheme(next);
      setDark(next);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
      } catch {}
    };

    // The new theme spreads out from the button as a growing circle.
    const doc = document as ViewTransitionDocument;
    if (
      !doc.startViewTransition ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      commit();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    doc
      .startViewTransition(commit)
      .ready.then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 700,
            easing: "cubic-bezier(0.65, 0, 0.35, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Dark theme"
      aria-pressed={dark}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={cn(
        "relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface text-secondary transition-colors hover:border-border-strong hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <Sun className="theme-icon theme-icon-sun h-4 w-4" aria-hidden="true" />
      <Moon className="theme-icon theme-icon-moon h-4 w-4" aria-hidden="true" />
    </button>
  );
}
