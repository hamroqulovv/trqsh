import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Missing URLs answer 404. Without this the error page would inherit the home
// page's title and a canonical for Next's internal /_not-found route, and its
// "index, follow" tag would sit beside Next's own "noindex".
export const metadata: Metadata = {
  title: "Page not found",
  alternates: { canonical: null },
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-[70vh] max-w-content flex-col items-center justify-center px-4 text-center sm:px-6"
    >
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
        Page not found
      </h1>
      <p className="mt-3 max-w-md text-secondary">
        That page slipped through the tunnel. Check the URL, or head back to
        solid ground.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/" className={cn(buttonVariants())}>
          Back home
        </Link>
        <Link
          href="/docs"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Browse docs
        </Link>
      </div>
    </main>
  );
}
