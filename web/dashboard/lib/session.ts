import { cookies } from "next/headers";
import { secureSession, sessionCookieName } from "./session-config";

const ACCESS = sessionCookieName("trqsh_access");
const REFRESH = sessionCookieName("trqsh_refresh");

// Sessions are host-only. The base domain is used only to expire legacy cookies.
const BASE = process.env.NEXT_PUBLIC_TRQSH_BASE_DOMAIN || "";
const DOMAIN = BASE && BASE !== "localhost" ? "." + BASE : undefined;

export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

/** Read the session tokens from httpOnly cookies (server-side only). */
export async function getTokens(): Promise<{ access?: string; refresh?: string }> {
  const c = await cookies();
  return { access: c.get(ACCESS)?.value, refresh: c.get(REFRESH)?.value };
}

/**
 * Persist tokens as host-only httpOnly cookies. Only valid inside
 * a Server Action or Route Handler; calling it during a plain render throws.
 */
export async function setTokens(t: Tokens): Promise<void> {
  const c = await cookies();
  const opts = {
    httpOnly: true,
    secure: secureSession,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
  // Remove domain-wide cookies left by older deployments before setting the
  // host-only session. __Host- also prevents sibling-domain cookie injection.
  if (DOMAIN) {
    for (const name of ["trqsh_access", "trqsh_refresh"]) {
      c.set(name, "", { ...opts, domain: DOMAIN, maxAge: 0 });
    }
  }
  c.set(ACCESS, t.access_token, { ...opts, maxAge: t.expires_in });
  c.set(REFRESH, t.refresh_token, opts);
}

/** Clear the session (logout) — expires both the domain-scoped and any host-only
 * cookie so a different account can sign in cleanly. */
export async function clearTokens(): Promise<void> {
  const c = await cookies();
  for (const name of [ACCESS, REFRESH, "trqsh_access", "trqsh_refresh"]) {
    if (DOMAIN && !name.startsWith("__Host-")) {
      c.set(name, "", { httpOnly: true, secure: secureSession, sameSite: "lax", path: "/", domain: DOMAIN, maxAge: 0 });
    }
    c.set(name, "", { httpOnly: true, secure: secureSession, sameSite: "lax", path: "/", maxAge: 0 });
  }
}
