"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActive, navGroups, normalizePath } from "@/components/nav-config";

// One highlight glides to the hovered or focused link; a bar marks the current
// page and springs to the next one on navigation.
export function Nav({ className, label = "Main navigation" }: { className?: string; label?: string }) {
  const pathname = normalizePath(usePathname());
  const railRef = React.useRef<HTMLDivElement>(null);
  const pillRef = React.useRef<HTMLSpanElement>(null);
  const barRef = React.useRef<HTMLSpanElement>(null);
  const placed = React.useRef(false);

  const movePill = React.useCallback((target: HTMLElement | null) => {
    const pill = pillRef.current;
    if (!pill) return;
    if (!target) {
      pill.dataset.visible = "false";
      return;
    }
    // The first time it appears it drops in place, then it slides.
    const appearing = pill.dataset.visible !== "true";
    if (appearing) pill.dataset.instant = "";
    pill.style.setProperty("--pill-y", `${target.offsetTop}px`);
    pill.style.setProperty("--pill-h", `${target.offsetHeight}px`);
    if (appearing) {
      void pill.offsetWidth;
      delete pill.dataset.instant;
    }
    pill.dataset.visible = "true";
  }, []);

  const placeBar = React.useCallback(() => {
    const rail = railRef.current;
    const bar = barRef.current;
    if (!rail || !bar) return;
    const current = rail.querySelector<HTMLElement>('[aria-current="page"]');
    if (!current || current.offsetHeight === 0) {
      bar.dataset.ready = "false";
      return;
    }
    const first = !placed.current;
    if (first) bar.style.transition = "opacity 200ms ease";
    bar.style.setProperty("--ind-y", `${current.offsetTop + (current.offsetHeight - 20) / 2}px`);
    bar.dataset.ready = "true";
    if (first) {
      void bar.offsetWidth;
      bar.style.transition = "";
      placed.current = true;
    }
  }, []);

  React.useLayoutEffect(placeBar, [pathname, placeBar]);
  // The rail has no size while a drawer is closed; measure again once it has.
  React.useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const observer = new ResizeObserver(placeBar);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [placeBar]);

  return (
    <nav aria-label={label} className={cn("px-3", className)}>
      <div
        ref={railRef}
        className="nav-rail flex flex-col gap-5"
        onPointerLeave={() => movePill(null)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) movePill(null);
        }}
      >
        <span ref={pillRef} className="nav-pill" aria-hidden="true" />
        <span ref={barRef} className="nav-indicator" aria-hidden="true" />
        {navGroups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <p className="eyebrow px-3 pb-1.5">{group.label}</p>
            {group.items.map(({ href, label, icon: Icon, key }) => {
              const active = isActive(href, pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onPointerEnter={(event) => movePill(event.currentTarget)}
                  onFocus={(event) => movePill(event.currentTarget)}
                  className={cn(
                    "nav-item relative z-[1] flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-200 hover:text-foreground lg:py-2",
                    active ? "font-medium text-foreground" : "text-secondary",
                  )}
                >
                  <Icon className={cn("nav-icon h-4 w-4 shrink-0", !active && "text-muted")} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <span className="kbd-hint hidden items-center gap-1 lg:flex" aria-hidden="true">
                    <kbd className="kbd">G</kbd>
                    <kbd className="kbd">{key.toUpperCase()}</kbd>
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
