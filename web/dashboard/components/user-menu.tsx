"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronDown, CreditCard, LogOut, Settings } from "lucide-react";
import { logout } from "@/app/actions";
import { DOCS_URL } from "@/components/nav-config";
import { ThemeSegmented } from "@/components/theme-segmented";
import { usePresence } from "@/lib/use-presence";
import { cn } from "@/lib/utils";

function Avatar({ name, email, url, className }: { name: string; email: string; url?: string; className?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      className={cn("shrink-0 rounded-full border border-border-strong object-cover", className)}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-page",
        className,
      )}
    >
      {(name || email).charAt(0).toUpperCase()}
    </span>
  );
}

const itemClass =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-secondary outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground sm:py-2";

export function UserMenu({
  name,
  email,
  avatarUrl,
  orgName,
  planLabel,
}: {
  name: string;
  email: string;
  avatarUrl?: string;
  orgName: string;
  planLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const { mounted, closing } = usePresence(open, 120);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  React.useEffect(() => setOpen(false), [pathname]);

  React.useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      // The theme control handles its own arrow keys.
      if ((event.target as HTMLElement | null)?.closest('[role="radiogroup"]')) return;
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      if (items.length === 0) return;
      event.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = event.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
      items[next].focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div
      className="relative"
      onBlur={(event) => {
        // Tabbing out of the menu closes it. The panel is itself focusable, so a
        // click on its text keeps focus inside instead of closing it.
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="user-menu"
        aria-label="Account menu"
        onClick={() => setOpen((value) => !value)}
        className="group flex h-10 items-center gap-1.5 rounded-full border border-transparent py-0 pl-1 pr-2 transition-[border-color,background-color] duration-200 hover:border-border hover:bg-accent focus-visible:outline-offset-2"
      >
        <Avatar
          name={name}
          email={email}
          url={avatarUrl}
          className="h-8 w-8 transition-transform duration-500 [transition-timing-function:var(--ease-spring)] group-hover:scale-105"
        />
        <ChevronDown
          className={cn(
            "hidden h-3.5 w-3.5 text-muted transition-transform duration-300 sm:block",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {mounted && (
        <div
          ref={panelRef}
          id="user-menu"
          role="menu"
          aria-label="Account"
          tabIndex={-1}
          data-closing={closing ? "" : undefined}
          className="pop absolute right-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-24px))] rounded-xl border border-border-strong bg-surface p-1.5 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.55)]"
        >
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar name={name} email={email} url={avatarUrl} className="h-10 w-10 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium leading-5">{name || email}</p>
              <p className="truncate text-xs text-muted">{email}</p>
            </div>
          </div>
          <p className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-lg bg-accent px-3 py-2 text-xs text-secondary">
            <span className="truncate">{orgName}</span>
            <span className="shrink-0 font-medium text-foreground">{planLabel}</span>
          </p>
          <div role="separator" className="my-1 h-px bg-border" />
          <Link href="/settings" role="menuitem" className={itemClass}>
            <Settings className="h-4 w-4" aria-hidden="true" /> Settings
          </Link>
          <Link href="/billing" role="menuitem" className={itemClass}>
            <CreditCard className="h-4 w-4" aria-hidden="true" /> Billing
          </Link>
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" role="menuitem" className={itemClass}>
            <BookOpen className="h-4 w-4" aria-hidden="true" /> Documentation
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <div role="separator" className="my-1 h-px bg-border" />
          {/* A radio group is not a menu item; role="none" keeps the menu's children valid. */}
          <div role="none" className="px-3 py-2">
            <ThemeSegmented />
          </div>
          <div role="separator" className="my-1 h-px bg-border" />
          <form action={logout}>
            <button type="submit" role="menuitem" className={itemClass}>
              <LogOut className="h-4 w-4" aria-hidden="true" /> Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
