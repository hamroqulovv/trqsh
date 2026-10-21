"use client";

import { Children, useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, ChevronDown, Command, Search, Terminal, X } from "lucide-react";
import type { ChangelogEntry, ReleaseProduct } from "@/lib/changelog";
import { formatReleaseDate } from "@/lib/release-date";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

const filters = [{ id: "all", label: "All updates" }, { id: "cli", label: "CLI" }, { id: "desktop", label: "Desktop" }] as const;

export function ChangelogList({ entries, children }: { entries: ChangelogEntry[]; children: ReactNode }) {
  const [product, setProduct] = useState<ReleaseProduct | "all">("all");
  const [query, setQuery] = useState("");
  const searchId = useId();
  const notes = Children.toArray(children);
  const needle = query.trim().toLowerCase();
  const visible = entries.filter((entry) => (product === "all" || product === entry.product) && entry.searchText.includes(needle));
  const latestCLI = entries.find((entry) => entry.product === "cli" && !entry.prerelease)?.id;
  const latestDesktop = entries.find((entry) => entry.product === "desktop" && !entry.prerelease)?.id;
  const clear = () => { setProduct("all"); setQuery(""); };
  useEffect(() => {
    let frame = 0;
    const revealPermalink = (id: string) => {
      if (!entries.some((entry) => entry.id === id)) return;
      setProduct("all");
      setQuery("");
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    };
    const followPermalink = () => revealPermalink(window.location.hash.slice(1));
    // A link to the current hash does not fire hashchange. Handle clicks too,
    // so a filtered-out release can still be reached from the latest links.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
      if (anchor) revealPermalink(anchor.getAttribute("href")!.slice(1));
    };
    window.addEventListener("hashchange", followPermalink);
    document.addEventListener("click", onClick);
    followPermalink();
    return () => {
      window.removeEventListener("hashchange", followPermalink);
      document.removeEventListener("click", onClick);
      cancelAnimationFrame(frame);
    };
  }, [entries]);

  return (
    <section id="releases" className="changelog-body" aria-label="Release history">
      <aside className="changelog-sidebar">
        <div className="changelog-sidebar-inner">
          <p className="eyebrow hidden lg:block">Explore the updates</p>
          <div className="release-filters" role="group" aria-label="Filter releases by product">
            {filters.map((filter) => (
              <button key={filter.id} type="button" aria-pressed={product === filter.id}
                onClick={() => setProduct(filter.id)} className={cn("release-filter", product === filter.id && "is-active")}>
                <span>{filter.label}</span>
                <span className="release-filter-count">{filter.id === "all" ? entries.length : entries.filter((entry) => entry.product === filter.id).length}</span>
              </button>
            ))}
          </div>
          <div className="changelog-sidebar-note hidden lg:block">
            <Terminal className="h-5 w-5" aria-hidden="true" />
            <h2 className="mt-4 text-sm font-medium">Put the latest to work.</h2>
            <p className="mt-2 text-sm leading-relaxed text-secondary">One command closer to your next connection.</p>
            <Link href="/download" className="text-link mt-5">Get trqsh <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="release-search-row">
          <div className="release-search">
            <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <label htmlFor={searchId} className="sr-only">Search release notes</label>
            <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Search updates, features, versions…" autoComplete="off" spellCheck={false} />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="release-clear"><X className="h-4 w-4" aria-hidden="true" /></button>}
          </div>
          <p className="whitespace-nowrap text-xs text-muted tabular" role="status" aria-live="polite" aria-atomic="true">{visible.length} {visible.length === 1 ? "release" : "releases"}</p>
        </div>
        <noscript><p className="mb-6 text-sm text-secondary">All published releases are listed below. Enable JavaScript to search and filter them.</p></noscript>

        {visible.length === 0 ? (
          <div className="release-empty">
            <Search className="mx-auto h-7 w-7 text-muted" aria-hidden="true" />
            <h2 className="mt-5 text-xl font-medium tracking-tight">No matching updates.</h2>
            <p className="mt-2 text-sm text-secondary">Try a version number, a feature, or a different product.</p>
            <button type="button" onClick={clear} className="text-link mt-6">Clear filters <X className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </div>
        ) : (
          <div className="release-timeline" key={product}>
            {entries.map((entry, index) => {
              if (!visible.includes(entry)) return null;
              const latest = entry.id === latestCLI || entry.id === latestDesktop;
              const Icon = entry.product === "cli" ? Terminal : Command;
              const previous = visible[visible.indexOf(entry) - 1];
              const month = entry.publishedAt.slice(0, 7);
              const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(entry.publishedAt));
              return (
                <div key={entry.id}>
                  {previous?.publishedAt.slice(0, 7) !== month && <div className="release-month"><span>{monthLabel}</span><span aria-hidden="true" /></div>}
                  <Reveal as="article" className="release-entry">
                    <div className="release-marker" aria-hidden="true"><Icon className="h-3.5 w-3.5" /></div>
                    <div className="release-card" id={entry.id}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <a className="release-version" href={`#${entry.id}`} aria-label={`Link to ${entry.product === "cli" ? "CLI" : "Desktop"} ${entry.version}`}>
                            {entry.product === "cli" ? "CLI" : "Desktop"} <span className="font-mono">v{entry.version}</span>
                          </a>
                          {latest && <span className="release-badge">Latest {entry.product === "cli" ? "CLI" : "desktop"}</span>}
                          {(entry.prerelease || entry.preview) && <span className="release-badge release-badge-muted">Preview</span>}
                        </div>
                        <time dateTime={entry.publishedAt} className="text-xs text-muted tabular">{formatReleaseDate(entry.publishedAt)}</time>
                      </div>
                      <h2 className="release-title"><a href={`#${entry.id}`}>{entry.title}</a></h2>
                      <p className="release-summary">{entry.summary}</p>
                      {entry.highlights.length > 0 && <ul className="release-highlights">{entry.highlights.map((highlight) => <li key={highlight}><Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{highlight}</span></li>)}</ul>}
                      <div className="release-card-bottom">
                        <details className="release-details">
                          <summary><span>Full release notes</span><ChevronDown className="h-3.5 w-3.5 transition-transform" aria-hidden="true" /></summary>
                          <div className="release-detail-content">{notes[index]}</div>
                        </details>
                        <a href={entry.url} target="_blank" rel="noopener noreferrer" className="release-source" aria-label={`View ${entry.product === "cli" ? "CLI" : "Desktop"} ${entry.version} on GitHub`}>GitHub <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></a>
                      </div>
                    </div>
                  </Reveal>
                </div>
              );
            })}
            <div className="release-history-end"><span aria-hidden="true" /><p>You’re all caught up.</p><a href="#main-content" className="inline-flex items-center gap-1.5">Back to top <ArrowDown className="h-3 w-3 rotate-180" aria-hidden="true" /></a></div>
          </div>
        )}
      </div>
    </section>
  );
}
