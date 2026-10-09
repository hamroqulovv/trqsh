"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { docsNav } from "@/lib/docs-nav";
import { cn } from "@/lib/utils";

export function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");
  const searchId = React.useId();
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
    <nav aria-label="Documentation navigation">
      <div className="relative mb-7">
        <label htmlFor={searchId} className="sr-only">
          Filter documentation
        </label>
        <Search
          className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-muted"
          aria-hidden="true"
        />
        <input
          id={searchId}
          type="search"
          placeholder="Find a guide…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-10 w-full rounded-md border border-border bg-page pl-9 pr-9 text-xs placeholder:text-muted"
        />
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
        {groups.map((group) => (
          <div key={group.title}>
            <h2 className="mb-2 px-3 text-[11px] font-semibold text-foreground">
              {group.title}
            </h2>
            <ul className="space-y-0.5">
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
                        "block rounded-md px-3 py-2 text-xs leading-5 transition-colors",
                        active
                          ? "bg-accent font-medium text-foreground"
                          : "text-secondary hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
