import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BackToTop } from "./back-to-top";
import { Logo } from "./logo";
import { Reveal } from "./reveal";
import { SpotlightGroup } from "./spotlight";
import { footerLegalNav, footerNav, site } from "@/lib/site";
import "./site-footer.css";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell">
        <Reveal stage className="footer-main">
          <div className="footer-item max-w-xs">
            <Link
              href="/"
              aria-label="trqsh home"
              className="site-brand inline-flex rounded-sm text-foreground"
            >
              <Logo />
            </Link>
            <p className="footer-tagline">
              Your localhost, live on the internet. Share apps, receive
              webhooks and connect services from one command line.
            </p>
          </div>

          <nav aria-label="Footer navigation" className="footer-columns">
            {footerNav.map((group, index) => (
              <div
                key={group.title}
                className="footer-item"
                style={{ "--i": index + 1 } as CSSProperties}
              >
                <h2 className="footer-heading">{group.title}</h2>
                <ul className="footer-links">
                  {group.links.map((link) => {
                    const newTab =
                      link.external && !link.href.startsWith(site.dashboardUrl);
                    const plain =
                      link.external || link.href.startsWith("mailto:");
                    const content = (
                      <>
                        {link.label}
                        {newTab && (
                          <>
                            <ArrowUpRight
                              className="h-3 w-3 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="sr-only"> (opens in a new tab)</span>
                          </>
                        )}
                      </>
                    );
                    return (
                      <li key={link.href}>
                        {plain ? (
                          <a
                            href={link.href}
                            target={newTab ? "_blank" : undefined}
                            rel={newTab ? "noopener noreferrer" : undefined}
                            className="footer-link"
                          >
                            {content}
                          </a>
                        ) : (
                          <Link href={link.href} className="footer-link">
                            {content}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </Reveal>

        <div className="footer-bottom">
          <p>
            © {new Date().getFullYear()} trqsh
            <span aria-hidden="true"> · </span>
            <Link href="/changelog" className="footer-link-quiet">
              CLI v{site.version}
            </Link>
            <span aria-hidden="true"> · </span>
            <a
              href={site.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link-quiet"
            >
              Apache-2.0
              <span className="sr-only"> license on GitHub (opens in a new tab)</span>
            </a>
          </p>
          <nav aria-label="Legal" className="footer-legal">
            {footerLegalNav.map((link) => (
              <Link key={link.href} href={link.href} className="footer-link-quiet">
                {link.label}
              </Link>
            ))}
          </nav>
          <BackToTop />
        </div>
      </div>

      {/* The wordmark rises letter by letter, then a soft shine passes over
          it every few seconds and the pointer lights it from underneath. The
          full glyphs stay visible, descender included. */}
      <SpotlightGroup className="footer-wordmark-wrap">
        <Reveal stage>
          <p className="footer-wordmark" aria-hidden="true">
            <span className="footer-wordmark-letters">
              {Array.from("trqsh", (letter, index) => (
                <span key={index} style={{ "--i": index } as CSSProperties}>
                  {letter}
                </span>
              ))}
            </span>
            <span className="footer-wordmark-shine" data-spotlight="">
              trqsh
            </span>
          </p>
        </Reveal>
      </SpotlightGroup>
    </footer>
  );
}
