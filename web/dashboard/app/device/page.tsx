import { ArrowRight, Github, MonitorSmartphone } from "lucide-react";
import { getOAuthProviders } from "@/lib/api";
import { getTokens } from "@/lib/session";
import { dashboardPath } from "@/lib/paths";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { DeviceApprove } from "./device-approve";

// Device-authorization approval page (RFC 8628 style) used by the desktop app's
// "Sign in with browser" flow. It is reachable signed-in or signed-out: a
// signed-in user approves immediately; a signed-out user signs in via OAuth and
// is returned right back here (the ?code= is preserved through login).
export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code = "" } = await searchParams;
  const [{ access, refresh }, providers] = await Promise.all([getTokens(), getOAuthProviders()]);
  // A refresh token alone is a live session: the API renews the access token.
  const signedIn = !!(access || refresh);
  const next = `/device${code ? `?code=${encodeURIComponent(code)}` : ""}`;
  // Same entry point as the login page, so the OAuth state is bound to this browser.
  const oauth = (provider: string) => `${dashboardPath(`/login/oauth/${provider}`)}?next=${encodeURIComponent(next)}`;

  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-page px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="rise-sm mb-6">
            <Logo />
          </span>
          <span
            className="rise-sm flex h-11 w-11 items-center justify-center rounded-full bg-accent"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            <MonitorSmartphone className="draw-icon h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="rise-sm mt-4 text-2xl font-semibold tracking-[-0.04em]" style={{ "--i": 2 } as React.CSSProperties}>
            Connect a device
          </h1>
          <p className="rise-sm mt-1.5 text-sm text-secondary" style={{ "--i": 3 } as React.CSSProperties}>
            Authorize the trqsh desktop app.
          </p>
        </div>

        <div
          className="rise-sm rounded-xl border border-border bg-surface p-6"
          style={{ "--i": 4 } as React.CSSProperties}
        >
          {signedIn ? (
            <DeviceApprove code={code} />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="mb-1 text-sm text-secondary">Sign in to approve this device.</p>
              {providers.includes("github") && (
                <a href={oauth("github")} className={buttonVariants({ className: "w-full" })}>
                  <Github className="h-4 w-4" aria-hidden="true" />
                  Continue with GitHub
                </a>
              )}
              {providers.includes("google") && (
                <a
                  href={oauth("google")}
                  className={buttonVariants({
                    variant: providers.includes("github") ? "outline" : "default",
                    className: "w-full",
                  })}
                >
                  Continue with Google
                </a>
              )}
              {providers.length === 0 && (
                <p role="status" className="text-sm text-secondary">
                  Sign-in is temporarily unavailable. Please try again in a moment.
                </p>
              )}
              <a
                href={dashboardPath(`/login?next=${encodeURIComponent(next)}`)}
                className="group mt-1 inline-flex items-center justify-center gap-1.5 text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
              >
                Other ways to sign in
                <ArrowRight
                  className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </a>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs leading-relaxed text-muted">
          You&apos;re approving the code shown in the desktop app. Never enter a code someone sent you.
        </p>
      </div>
    </main>
  );
}
