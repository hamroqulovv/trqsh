"use client";

import { useActionState, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Github,
  Loader2,
  Terminal,
} from "lucide-react";
import { authenticate, type LoginState } from "./actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const API = process.env.TRQSH_API_URL || "https://api.trqsh.uz";
const SITE = process.env.NEXT_PUBLIC_TRQSH_SITE_URL || "https://trqsh.uz";
const TUNNEL_DOMAIN = process.env.NEXT_PUBLIC_TRQSH_BASE_DOMAIN || "trqsh.uz";

export function LoginForm({
  next,
  providers,
}: {
  next: string;
  providers: string[];
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    authenticate,
    {},
  );
  const [creatingAccount, setCreatingAccount] = useState(false);

  return (
    <div className="flex min-h-svh flex-col bg-page">
      <a
        href="#sign-in"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground focus:translate-y-0"
      >
        Skip to sign in
      </a>
      <header className="border-b border-border">
        <div className="mx-auto flex h-20 max-w-[1600px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
          <a href={SITE} aria-label="trqsh home">
            <Logo />
          </a>
          <div className="flex items-center gap-4 sm:gap-6">
            <a
              href={`${SITE}/docs`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-secondary hover:text-foreground"
            >
              Docs <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1600px] flex-1 lg:grid-cols-[1fr_1.05fr]">
        <section
          aria-labelledby="product-heading"
          className="hidden flex-col justify-center border-r border-border bg-surface-2 px-12 py-16 lg:flex xl:px-20"
        >
          <div className="max-w-lg">
            <p className="mb-6 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              Local work. Global reach.
            </p>
            <h2
              id="product-heading"
              className="text-[3.5rem] font-semibold leading-[1.08] tracking-[-0.055em] xl:text-[4.5rem]"
            >
              Your localhost.
              <br />
              Anywhere.
            </h2>
            <p className="mt-6 max-w-sm text-base leading-7 text-secondary">
              Bring your local services online. Share a preview, receive a
              webhook, or connect a device.
            </p>

            <div className="mt-10 overflow-hidden rounded-xl border border-border-strong bg-page">
              <div className="flex items-center gap-2 border-b border-border px-5 py-3 text-xs text-muted">
                <Terminal className="h-3.5 w-3.5" aria-hidden="true" /> Terminal
                example
              </div>
              <div className="space-y-5 p-5 font-mono text-sm">
                <p>
                  <span className="mr-2 text-muted" aria-hidden="true">
                    $
                  </span>
                  <code className="font-medium">trqsh http 3000</code>
                </p>
                <div className="space-y-1 border-l-2 border-border-strong pl-4 text-xs leading-6 text-secondary">
                  <p>localhost:3000</p>
                  <p className="flex items-center gap-2 break-all">
                    <ArrowRight
                      className="h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    your-subdomain.{TUNNEL_DOMAIN}
                  </p>
                </div>
              </div>
            </div>

            <ul className="mt-8 space-y-3 text-sm text-secondary">
              {[
                "One workspace for your tunnels and domains",
                "CLI and desktop apps for your workflow",
                "Usage and request inspection in one place",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <Check
                    className="h-4 w-4 shrink-0 text-foreground"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="sign-in"
          aria-labelledby="login-heading"
          className="flex items-center justify-center px-5 py-12 sm:px-8 sm:py-16 lg:px-12"
        >
          <div className="w-full max-w-[400px]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              Your workspace
            </p>
            <h1
              id="login-heading"
              className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.045em]"
            >
              {creatingAccount ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-3 text-sm leading-6 text-secondary">
              {creatingAccount
                ? "Start with a free account. Your next tunnel is a command away."
                : "Sign in to manage your tunnels, domains and connected devices."}
            </p>

            {providers.length > 0 && (
              <>
                <div className="mt-8 flex flex-col gap-3">
                  {providers.includes("github") && (
                    <a
                      href={`${API}/v1/auth/oauth/github?next=${encodeURIComponent(next)}`}
                      className={buttonVariants({
                        variant: "outline",
                        className: "h-12 w-full",
                      })}
                    >
                      <Github className="h-4 w-4" aria-hidden="true" />
                      Continue with GitHub
                    </a>
                  )}
                  {providers.includes("google") && (
                    <a
                      href={`${API}/v1/auth/oauth/google?next=${encodeURIComponent(next)}`}
                      className={buttonVariants({
                        variant: "outline",
                        className: "h-12 w-full",
                      })}
                    >
                      <span
                        className="text-base font-semibold"
                        aria-hidden="true"
                      >
                        G
                      </span>
                      Continue with Google
                    </a>
                  )}
                </div>
                <div className="my-6 flex items-center gap-4 text-xs text-muted">
                  <span className="h-px flex-1 bg-border" />
                  or continue with email
                  <span className="h-px flex-1 bg-border" />
                </div>
              </>
            )}

            <form
              action={action}
              aria-label={creatingAccount ? "Create account" : "Sign in"}
              aria-busy={pending}
              className={`flex flex-col gap-5 ${providers.length === 0 ? "mt-8" : ""}`}
            >
              <input type="hidden" name="next" value={next} />
              {creatingAccount && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name" className="flex justify-between">
                    Full name
                    <span className="font-normal text-muted">Optional</span>
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Your name"
                    readOnly={pending}
                    className="h-12 px-4 text-base sm:text-sm"
                  />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="you@example.com"
                  required
                  readOnly={pending}
                  aria-invalid={state.error ? true : undefined}
                  aria-describedby={state.error ? "login-error" : undefined}
                  className="h-12 px-4 text-base sm:text-sm"
                />
              </div>
              {state.error && (
                <p
                  id="login-error"
                  role="alert"
                  className="rounded-md border border-border-strong bg-surface-2 px-4 py-3 text-sm leading-6 text-critical"
                >
                  {state.error}
                </p>
              )}
              <Button type="submit" disabled={pending} className="h-12 w-full">
                {pending ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Please wait...
                  </>
                ) : (
                  <>
                    {creatingAccount
                      ? "Create free account"
                      : "Continue with email"}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-6 text-sm text-secondary">
              {creatingAccount ? "Already have an account? " : "New to trqsh? "}
              <button
                type="button"
                disabled={pending}
                onClick={() => setCreatingAccount(!creatingAccount)}
                className="font-semibold text-foreground underline-offset-4 hover:underline disabled:opacity-50"
              >
                {creatingAccount ? "Sign in" : "Create an account"}
              </button>
            </p>
            <div className="mt-8 border-t border-border pt-6">
              <a
                href={`${SITE}/docs/quickstart`}
                className="inline-flex items-center gap-2 text-sm text-secondary hover:text-foreground"
              >
                Getting started? Read the quickstart
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-5 py-5 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1504px] flex-wrap items-center justify-between gap-x-6 gap-y-3 text-xs text-muted">
          <p>Your localhost, live on the internet.</p>
          <nav aria-label="Legal" className="flex items-center gap-5">
            <a
              href={`${SITE}/terms`}
              className="hover:text-foreground hover:underline"
            >
              Terms
            </a>
            <a
              href={`${SITE}/privacy`}
              className="hover:text-foreground hover:underline"
            >
              Privacy
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
