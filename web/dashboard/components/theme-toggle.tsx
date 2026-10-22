"use client";

import { Moon, Sun } from "lucide-react";
import { centerOf, toggleTheme, useTheme } from "@/lib/theme-client";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { dark } = useTheme();

  return (
    <button
      type="button"
      onClick={(event) => toggleTheme(centerOf(event.currentTarget))}
      aria-label="Dark theme"
      aria-pressed={dark}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={cn(
        "relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface text-secondary transition-[color,background-color,border-color,transform] duration-200 hover:border-border-strong hover:bg-accent hover:text-foreground active:scale-90",
        className,
      )}
    >
      <Sun className="theme-icon theme-icon-sun h-4 w-4" aria-hidden="true" />
      <Moon className="theme-icon theme-icon-moon h-4 w-4" aria-hidden="true" />
    </button>
  );
}
