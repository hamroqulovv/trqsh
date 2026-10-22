import { ArrowRight, ArrowUpRight, Github, Globe, Radio, ScanLine, Terminal } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { dashboardPath } from "@/lib/paths";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginBackground } from "@/components/login-background";
import "./login.css";

const SITE = process.env.NEXT_PUBLIC_TRQSH_SITE_URL || "https://trqsh.uz";
const TUNNEL_DOMAIN = process.env.NEXT_PUBLIC_TRQSH_BASE_DOMAIN || "trqsh.uz";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92a5.07 5.07 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-7.95ZM12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.87 0-5.31-1.94-6.18-4.55H2.15v2.85A11 11 0 0 0 12 23ZM5.82 14.09A6.6 6.6 0 0 1 5.48 12c0-.73.12-1.43.34-2.09V7.06H2.15A11 11 0 0 0 1 12c0 1.78.42 3.47 1.15 4.94l3.67-2.85ZM12 5.38c1.62 0 3.06.56 4.21 1.64l3.16-3.16A10.6 10.6 0 0 0 12 1a11 11 0 0 0-9.85 6.06l3.67 2.85C6.69 7.31 9.13 5.38 12 5.38Z" />
    </svg>
  );
}

export function LoginForm({ next, providers, error }: {
  next: string;
  providers: string[];
  error?: string;
}) {
  return (
    <div className="login-page">
      <LoginBackground />
      <a href="#sign-in" className="login-skip-link">Skip to sign in</a>
      <header className="login-header">
        <div className="login-shell login-header-inner">
          <a href={SITE} aria-label="trqsh home"><Logo /></a>
          <div className="login-header-actions">
            <a href={`${SITE}/docs`} className="login-docs-link">
              Docs <ArrowUpRight aria-hidden="true" />
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="login-main">
        <div className="login-shell login-content">
          <section className="login-story" aria-labelledby="product-heading">
            <p className="login-eyebrow"><span className="login-eyebrow-line" />Local work. Global reach.</p>
            <h2 id="product-heading" className="login-product-heading">
              Your localhost.<br /><span>Now everywhere.</span>
            </h2>
            <p className="login-story-description">
              Bring your local services online. Share a preview, receive a
              webhook, or connect a device. Start with one command.
            </p>

            <div className="login-command" aria-label="Example connection">
              <div className="login-command-heading"><Terminal aria-hidden="true" /> One command. A public URL.</div>
              <div className="login-command-line">
                <span className="login-prompt" aria-hidden="true">$</span>
                <code>trqsh http 3000</code><span className="login-command-caret" aria-hidden="true" />
              </div>
              <div className="login-example-route">
                <code>localhost:3000</code><ArrowRight aria-hidden="true" /><code>your-app.{TUNNEL_DOMAIN}</code>
              </div>
              <span className="login-command-signal" aria-hidden="true" />
            </div>

            <ul className="login-capabilities">
              <li><Globe aria-hidden="true" /> Share previews</li>
              <li><Radio aria-hidden="true" /> Receive webhooks</li>
              <li><ScanLine aria-hidden="true" /> Inspect requests</li>
            </ul>
          </section>

          <section id="sign-in" tabIndex={-1} aria-labelledby="login-heading" className="login-auth">
            <div className="login-auth-content">
              <p className="login-eyebrow">Your workspace</p>
              <h1 id="login-heading">Sign in to trqsh</h1>
              <p className="login-auth-description">Your tunnels, domains, and requests. All in one place.</p>

              {providers.length > 0 && (
                <div className="login-providers" aria-label="Sign-in providers">
                  {providers.includes("github") && (
                    <a
                      href={`${dashboardPath("/login/oauth/github")}?next=${encodeURIComponent(next)}`}
                      className={buttonVariants({ className: "login-provider login-provider-primary" })}
                    >
                      <Github aria-hidden="true" /><span>Continue with GitHub</span><ArrowRight className="login-provider-arrow" aria-hidden="true" />
                    </a>
                  )}
                  {providers.includes("google") && (
                    <a
                      href={`${dashboardPath("/login/oauth/google")}?next=${encodeURIComponent(next)}`}
                      className={buttonVariants({ variant: providers.includes("github") ? "outline" : "default", className: "login-provider" })}
                    >
                      <GoogleMark /><span>Continue with Google</span><ArrowRight className="login-provider-arrow" aria-hidden="true" />
                    </a>
                  )}
                </div>
              )}
              {error && <p role="alert" className="login-notice login-error">{error}</p>}
              {providers.length === 0 && (
                <p role="status" className="login-notice">Sign-in is temporarily unavailable. Please try again later.</p>
              )}
              <p className="login-account-note">
                Use a verified email address with GitHub or Google.<br />
                New here? Your first sign-in creates your account.
              </p>
              <div className="login-quickstart">
                <span>Getting started?</span>
                <a href={`${SITE}/docs/quickstart`}>Read the quickstart <ArrowUpRight aria-hidden="true" /></a>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="login-footer">
        <div className="login-shell login-footer-inner">
          <p>Your localhost, live on the internet.</p>
          <nav aria-label="Legal">
            <a href={`${SITE}/terms`}>Terms</a><a href={`${SITE}/privacy`}>Privacy</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
