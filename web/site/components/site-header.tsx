"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { loginUrl, primaryNav, signupUrl, site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { buttonVariants } from "./ui/button";
import { ThemeToggle } from "./theme-toggle";

const navigation = [{ label: "Product", href: "/#product" }, ...primaryNav];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const headerRef = React.useRef<HTMLElement>(null);
  const menuRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => setOpen(false), [pathname]);
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
    const query = window.matchMedia("(min-width: 768px)");
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
    !href.includes("#") &&
    (pathname === href || pathname.startsWith(`${href}/`));

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 border-b border-border bg-page/95 backdrop-blur-md"
    >
      <div className="shell flex h-[72px] items-center justify-between gap-4">
        <div className="flex items-center gap-12">
          <Link
            href="/"
            aria-label="trqsh home"
            className="rounded-sm text-foreground"
            onClick={() => setOpen(false)}
          >
            <Logo />
          </Link>
          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-7 md:flex"
          >
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active(item.href) ? "page" : undefined}
                className={cn(
                  "relative py-6 text-sm transition-colors hover:text-foreground",
                  active(item.href)
                    ? "font-medium text-foreground after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-foreground"
                    : "text-secondary",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-5">
          <a
            href={loginUrl}
            className="hidden text-sm font-medium text-secondary hover:text-foreground md:inline-flex"
          >
            Sign in
          </a>
          <ThemeToggle />
          <a
            href={signupUrl}
            className={cn(
              buttonVariants({ size: "sm" }),
              "hidden min-[360px]:inline-flex",
            )}
          >
            Start free{" "}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <button
            ref={menuRef}
            type="button"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-accent md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="absolute inset-x-0 top-full border-b border-border bg-page px-5 py-5 shadow-[0_10px_20px_-15px_rgb(0_0_0/0.2)] md:hidden"
        >
          <div className="flex flex-col gap-1">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active(item.href) ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-3 text-sm hover:bg-accent",
                  active(item.href) && "bg-accent font-medium",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border px-3 pt-5 text-sm">
            <a href={signupUrl} className={buttonVariants({ size: "sm" })}>
              Start free{" "}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <a href={loginUrl}>Sign in</a>
            <a
              href={site.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-secondary"
            >
              GitHub <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}
