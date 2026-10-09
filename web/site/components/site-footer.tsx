import Link from "next/link";
import { ArrowUpRight, Github } from "lucide-react";
import { Logo } from "./logo";
import { footerNav, site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-page">
      <div className="shell pb-7 pt-14 sm:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_2fr] lg:gap-20">
          <div className="max-w-xs">
            <Link href="/" aria-label="trqsh home">
              <Logo />
            </Link>
            <p className="mt-5 text-sm leading-relaxed text-secondary">
              A small command.
              <br />A world of possibilities.
              <br />
              Local development, connected.
            </p>
            <a
              href={site.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="text-link mt-5"
            >
              <Github className="h-4 w-4" aria-hidden="true" /> Explore the
              source <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
          <nav
            className="grid grid-cols-2 gap-x-8 gap-y-9 sm:grid-cols-4"
            aria-label="Footer navigation"
          >
            {footerNav.map((column) => (
              <div key={column.title}>
                <h2 className="text-xs font-semibold tracking-wide text-foreground">
                  {column.title}
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target={
                            link.href.startsWith(site.dashboardUrl)
                              ? undefined
                              : "_blank"
                          }
                          rel="noreferrer"
                          className="text-sm text-secondary transition-colors hover:text-foreground"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-sm text-secondary transition-colors hover:text-foreground"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-14 flex flex-col justify-between gap-3 border-t border-border pt-6 text-xs text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} trqsh. All rights reserved.</p>
          <p className="font-mono">
            CLI v{site.version} · macOS / Windows / Linux
          </p>
        </div>
      </div>
    </footer>
  );
}
