"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ArrowUpRight, Github } from "lucide-react";
import { loginUrl, primaryNav, signupUrl, site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { Magnetic } from "./magnetic";
import { buttonVariants } from "./ui/button";
import { ThemeToggle } from "./theme-toggle";
import { ScrollProgress } from "./scroll-progress";

// Marketing pages float the bar into a rounded island once the page scrolls;
// the docs keep a full-width bar because their sidebar is pinned beneath it.
// The header's own box is always 72px tall, so neither mode shifts layout.
export function SiteHeader() {
  const pathname = usePathname();
  const docs = pathname === "/docs" || pathname.startsWith("/docs/");
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const headerRef = React.useRef<HTMLElement>(null);
  const menuRef = React.useRef<HTMLButtonElement>(null);
  const pillRef = React.useRef<HTMLSpanElement>(null);
  // The menu stays mounted briefly after closing so it can animate out.
  const [menuMounted, setMenuMounted] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setMenuMounted(true);
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (still.matches) {
      setMenuMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setMenuMounted(false), 200);
    return () => window.clearTimeout(timer);
  }, [open]);

  // One highlight glides to whichever link is hovered or focused. It appears
  // in place the first time, then slides between links.
  const movePill = React.useCallback((target: HTMLElement | null) => {
    const pill = pillRef.current;
    if (!pill) return;
    if (!target) {
      pill.dataset.visible = "false";
      return;
    }
    const appearing = pill.dataset.visible !== "true";
    if (appearing) pill.dataset.instant = "";
    pill.style.setProperty("--pill-x", `${target.offsetLeft}px`);
    pill.style.setProperty("--pill-w", `${target.offsetWidth}px`);
    if (appearing) {
      void pill.offsetWidth;
      delete pill.dataset.instant;
    }
    pill.dataset.visible = "true";
  }, []);

  React.useEffect(() => setOpen(false), [pathname]);
  React.useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const query = window.matchMedia("(min-width: 1024px)");
    const onResize = () => {
      if (query.matches) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    query.addEventListener("change", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      query.removeEventListener("change", onResize);
    };
  }, [open]);

  const active = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      ref={headerRef}
      className="site-header"
      data-variant={docs ? "bar" : "island"}
      data-scrolled={scrolled || open ? "" : undefined}
      // The home hero runs up behind the bar until the page scrolls.
      data-overlay={pathname === "/" && !scrolled && !open ? "" : undefined}
    >
      <div className="header-bar">
        <div className={cn("header-inner", docs ? "docs-shell" : "shell")}>
          <Link
            href="/"
            aria-label="trqsh home"
            className="site-brand w-fit shrink-0 rounded-sm text-foreground"
            onClick={() => setOpen(false)}
          >
            <Logo />
          </Link>
          <nav
            aria-label="Main navigation"
            className="relative hidden items-center gap-1 lg:flex"
            onPointerLeave={() => movePill(null)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                movePill(null);
            }}
          >
            <span ref={pillRef} className="nav-pill" aria-hidden="true" />
            {primaryNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active(item.href) ? "page" : undefined}
                onPointerEnter={(event) => movePill(event.currentTarget)}
                onFocus={(event) => movePill(event.currentTarget)}
                className={cn(
                  "nav-link relative z-[1] rounded-lg px-3.5 py-2 text-sm transition-colors hover:text-foreground",
                  active(item.href)
                    ? "font-medium text-foreground"
                    : "text-secondary",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center justify-end gap-1.5 sm:gap-2">
            <a
              href={site.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="trqsh on GitHub (opens in a new tab)"
              title="GitHub"
              className="header-icon hidden lg:inline-flex"
            >
              <Github className="h-[17px] w-[17px]" aria-hidden="true" />
            </a>
            <ThemeToggle className="header-icon h-9 w-9 border-transparent bg-transparent hover:border-transparent" />
            <span
              className="mx-1.5 hidden h-5 w-px bg-border lg:block"
              aria-hidden="true"
            />
            <a
              href={loginUrl}
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-accent hover:text-foreground lg:inline-flex"
            >
              Sign in
            </a>
            <Magnetic strength={0.18}>
              <a
                href={signupUrl}
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "hidden rounded-lg min-[360px]:inline-flex",
                )}
              >
                Start free{" "}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </Magnetic>
            <button
              ref={menuRef}
              type="button"
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              aria-controls="mobile-navigation"
              onClick={() => setOpen((value) => !value)}
              className="burger header-icon inline-flex lg:hidden"
            >
              <span className="burger-lines" aria-hidden="true">
                <span />
                <span />
              </span>
            </button>
          </div>
        </div>
        <ScrollProgress />
      </div>
      {menuMounted && (
        <div
          id="mobile-navigation"
          data-closing={open ? undefined : ""}
          className="mobile-menu lg:hidden"
        >
          <nav aria-label="Mobile navigation" className="mobile-menu-card">
            {primaryNav.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active(item.href) ? "page" : undefined}
                style={{ "--i": index } as React.CSSProperties}
                className="mobile-menu-item mobile-menu-link"
              >
                {item.label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ))}
            <div
              className="mobile-menu-item mt-4 grid grid-cols-2 gap-2"
              style={{ "--i": primaryNav.length } as React.CSSProperties}
            >
              <a
                href={loginUrl}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Sign in
              </a>
              <a href={signupUrl} className={buttonVariants({ size: "sm" })}>
                Start free{" "}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
            <a
              href={site.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mobile-menu-item mt-3 inline-flex items-center justify-center gap-2 py-2 text-xs text-secondary hover:text-foreground"
              style={{ "--i": primaryNav.length + 1 } as React.CSSProperties}
            >
              <Github className="h-3.5 w-3.5" aria-hidden="true" />
              View on GitHub
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
