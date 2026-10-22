import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ERRORS, errorAnchor } from "@/lib/errors";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Fragment } from "react";

export const metadata: Metadata = {
  title: "Error reference",
  description:
    "Every trqsh error code, what it means, and how to fix it. The CLI, desktop app, and dashboard deep-link here.",
};

export default function ErrorsPage() {
  return (
    <div className="py-10">
      <nav aria-label="Breadcrumb" className="docs-breadcrumb"><Link href="/docs">Documentation</Link><span aria-hidden="true">/</span>Error reference</nav>
      <header className="docs-article-header max-w-3xl">
        <div className="docs-page-meta"><span>Reference</span><span>Errors & recovery</span></div>
        <h1>Error reference</h1>
        <p className="docs-lead">
          These are stable tunnel/edge error codes. Use the specific fix below, then verify the
          affected part of the connection. Control API HTTP errors can instead return a plain
          message in an error field; they do not all use this code taxonomy.
        </p>
        <Link href="/docs/troubleshooting" className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
          Follow the diagnostic checklist
        </Link>
      </header>

      <div className="mb-8 flex flex-wrap gap-2">
        {ERRORS.map((e) => (
          <a
            key={e.code}
            href={`#${errorAnchor(e.code)}`}
            className="rounded-md border border-border bg-surface px-2.5 py-1 font-mono text-xs text-secondary transition-colors hover:border-border-strong hover:text-foreground"
          >
            {e.code}
          </a>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {ERRORS.map((e) => (
          <section
            key={e.code}
            id={errorAnchor(e.code)}
            className="scroll-mt-24 border-t border-border py-6"
          >
            <div className="flex flex-wrap items-center gap-3">
              <code className="rounded-md bg-accent px-2 py-1 font-mono text-sm font-medium text-primary">
                {e.code}
              </code>
              <h2 className="text-base font-semibold text-foreground">{e.title}</h2>
              {e.upgrade && <Badge variant="warning">Plan limit</Badge>}
            </div>
            <p className="mt-3 text-sm text-secondary">{e.detail}</p>
            <p className="mt-2 text-sm text-foreground">
              <span className="font-medium">Fix:</span> <InlineCode text={e.fix} />
            </p>
            {e.upgrade && (
              <Link href="/pricing" className={cn(buttonVariants({ variant: "subtle", size: "sm" }), "mt-4")}>
                Compare plans <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function InlineCode({ text }: { text: string }) {
  return text.split(/(`[^`]+`)/g).map((part, index) => part.startsWith("`")
    ? <code key={index} className="break-words rounded bg-accent px-1 font-mono text-xs">{part.slice(1, -1)}</code>
    : <Fragment key={index}>{part}</Fragment>);
}
