import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronRight, Clock3, List } from "lucide-react";
import { mdSlugs, loadDoc, docEntry, docsNav } from "@/lib/docs";
import { DocsToc } from "@/components/docs-toc";
import { DocsContent } from "@/components/docs-content";

// Statically pre-render every Markdown-backed doc. Bespoke routes (api, errors)
// are excluded because they aren't in mdSlugs.
export function generateStaticParams() {
  return mdSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = docEntry(slug);
  if (!entry) return {};
  return { title: entry.title, description: entry.description };
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = docEntry(slug);
  if (!entry || entry.type !== "md") notFound();

  const doc = loadDoc(slug);
  if (!doc) notFound();
  const category = docsNav.find((group) => group.items.some((item) => item.slug === slug))?.title;
  const readingMinutes = Math.max(1, Math.ceil(doc.html.replace(/<[^>]+>/g, " ").split(/\s+/).length / 220));
  // Keep the authored title and introduction in a consistent page header.
  const opening = doc.html.match(/^<h1>([\s\S]*?)<\/h1>\s*(<p>[\s\S]*?<\/p>)/);
  const body = opening ? doc.html.slice(opening[0].length) : doc.html;

  // Prev/next within the flat Markdown order.
  const idx = mdSlugs.indexOf(slug);
  const prev = idx > 0 ? docEntry(mdSlugs[idx - 1]) : undefined;
  const next =
    idx < mdSlugs.length - 1 ? docEntry(mdSlugs[idx + 1]) : undefined;

  return (
    <div className="docs-page-grid" id="docs-top">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="docs-breadcrumb">
          <Link href="/docs" className="hover:text-foreground">
            Documentation
          </Link>
          <ChevronRight size={13} aria-hidden="true" />
          {entry.title}
        </nav>
        {opening && <header className="docs-article-header">
          <div className="docs-page-meta"><span>{category}</span><span><Clock3 size={13} aria-hidden="true" />{readingMinutes} min read</span></div>
          <h1 dangerouslySetInnerHTML={{ __html: opening[1] }} />
          <div className="docs-lead" dangerouslySetInnerHTML={{ __html: opening[2] }} />
        </header>}
        <details className="docs-mobile-toc xl:hidden">
          <summary><List size={16} aria-hidden="true" /> On this page <ChevronRight size={15} aria-hidden="true" /></summary>
          <ul>{doc.toc.map((item) => <li key={item.id}><a href={`#${item.id}`}>{item.text}</a></li>)}</ul>
        </details>
        <DocsContent html={body} />

        <nav aria-label="Previous and next guides" className="docs-pagination mt-12 flex items-stretch justify-between gap-4 border-t border-border pt-6">
          {prev ? (
            <Link
              href={`/docs/${prev.slug}`}
              className="group flex flex-1 flex-col rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
            >
              <span className="flex items-center gap-1 text-xs text-muted">
                <ArrowLeft className="h-3.5 w-3.5" /> Previous
              </span>
              <span className="mt-1 text-sm font-medium text-foreground">
                {prev.title}
              </span>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
          {next ? (
            <Link
              href={`/docs/${next.slug}`}
              className="group flex flex-1 flex-col items-end rounded-lg border border-border bg-surface p-4 text-right transition-colors hover:border-border-strong"
            >
              <span className="flex items-center gap-1 text-xs text-muted">
                Next <ArrowRight className="h-3.5 w-3.5" />
              </span>
              <span className="mt-1 text-sm font-medium text-foreground">
                {next.title}
              </span>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
        </nav>
      </div>

      <aside className="docs-toc-rail hidden xl:block">
        <DocsToc items={doc.toc} />
      </aside>
    </div>
  );
}
