"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Search, X, ArrowUpRight, Layers, Terminal, Compass, Braces, Rocket } from "lucide-react";
import { docsNav } from "@/lib/docs-nav";
import { cn } from "@/lib/utils";

export function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");
  const searchId = React.useId();
  const groupId = React.useId();
  const searchRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey ||
        target.closest("input, textarea, select, [contenteditable='true']") ||
        !searchRef.current?.getClientRects().length) return;
      event.preventDefault();
      searchRef.current.focus();
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);
  const filter = query.trim().toLowerCase();
  const groups = docsNav
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        `${item.title} ${item.description ?? ""} ${group.title}`
          .toLowerCase()
          .includes(filter),
      ),
    }))
    .filter((group) => group.items.length);
  return (
    <nav aria-label="Documentation navigation" className="docs-navigation">
      <Link href="/docs" onClick={onNavigate} className="docs-home-link" aria-current={pathname === "/docs" ? "page" : undefined}>
        <BookOpen size={17} aria-hidden="true" /> Documentation
        <span className="docs-home-badge">Docs</span>
      </Link>
      <div className="relative mb-7">
        <label htmlFor={searchId} className="sr-only">
          Filter documentation
        </label>
        <Search
          className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-muted"
          aria-hidden="true"
        />
        <input
          ref={searchRef}
          id={searchId}
          type="search"
          placeholder="Find a guide…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="docs-search h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-9 text-[13px] placeholder:text-muted"
        />
        {!query && <kbd className="docs-search-key" aria-hidden="true">/</kbd>}
        {query && (
          <button
            type="button"
            aria-label="Clear guide filter"
            onClick={() => setQuery("")}
            className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded hover:bg-accent"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      {groups.length === 0 && (
        <p className="px-2 text-xs leading-relaxed text-muted" role="status">
          No guides found. Try another term.
        </p>
      )}
      <div className="space-y-6">
        {groups.map((group) => {
          const Icon = ({ "Getting started": Rocket, Tunnels: Layers, Tools: Terminal, Guides: Compass, Reference: Braces })[group.title] ?? BookOpen;
          const labelId = `${groupId}-${group.title.replace(/\W+/g, "-")}`;
          return (
          <div key={group.title}>
            {/* Not a heading: this sidebar precedes the page's <h1>, and its
                group labels would otherwise outrank the page title. */}
            <p id={labelId} className="docs-nav-group">
              <Icon size={14} aria-hidden="true" />
              {group.title}
            </p>
            <ul className="space-y-0.5" aria-labelledby={labelId}>
              {group.items.map((item) => {
                const href = `/docs/${item.slug}`;
                const active = pathname === href;
                return (
                  <li key={item.slug}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "docs-nav-link",
                        active
                          ? "is-active"
                          : "",
                      )}
                    >
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ); })}
      </div>
      <Link href="/docs/troubleshooting" onClick={onNavigate} className="docs-nav-help">
        <span>Need a hand?<small>Find a fix in troubleshooting</small></span>
        <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    </nav>
  );
}
