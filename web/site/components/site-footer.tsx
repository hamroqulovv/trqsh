import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "./logo";
import { footerLegalNav, footerNav, site } from "@/lib/site";
import { cn } from "@/lib/utils";

const footerLinkClassName =
  "inline-flex min-h-9 items-center gap-1.5 rounded-sm text-sm text-secondary transition-colors hover:text-foreground";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-page">
      <div className="shell pb-7 pt-12 sm:pt-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
          <div className="max-w-xs">
            <Link
              href="/"
              aria-label="trqsh home"
              className="inline-flex rounded-sm text-foreground"
            >
              <Logo />
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-secondary">
              {site.tagline}
            </p>
          </div>
          <nav
            className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 sm:gap-x-8"
            aria-label="Footer navigation"
          >
            {footerNav.map((column, index) => (
              <div
                key={column.title}
                className={cn(
                  "min-w-0",
                  index === footerNav.length - 1 && "col-span-2 sm:col-span-1",
                )}
              >
                <h2 className="text-sm font-semibold text-foreground">
                  {column.title}
                </h2>
                <ul
                  className={cn(
                    "mt-3 grid gap-y-1",
                    index === footerNav.length - 1 &&
                      "grid-cols-2 gap-x-6 sm:grid-cols-1",
                  )}
                >
                  {column.links.map((link) => {
                    const opensNewTab =
                      link.external &&
                      !link.href.startsWith(site.dashboardUrl);

                    return (
                      <li key={link.href}>
                        {link.external ? (
                          <a
                            href={link.href}
                            target={opensNewTab ? "_blank" : undefined}
                            rel={opensNewTab ? "noopener noreferrer" : undefined}
                            className={footerLinkClassName}
                          >
                            {link.label}
                            {opensNewTab && (
                              <>
                                <ArrowUpRight
                                  className="h-3 w-3 shrink-0 text-muted"
                                  aria-hidden="true"
                                />
                                <span className="sr-only"> (opens in a new tab)</span>
                              </>
                            )}
                          </a>
                        ) : (
                          <Link href={link.href} className={footerLinkClassName}>
                            {link.label}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-10 flex flex-col-reverse gap-3 border-t border-border pt-5 text-xs text-muted sm:mt-12 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} trqsh</p>
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-6">
            {footerLegalNav.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex min-h-9 items-center rounded-sm transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
