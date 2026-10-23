import { getTokens, setTokens, type Tokens } from "./session";

const BASE = process.env.TRQSH_API_INTERNAL_URL || process.env.TRQSH_API_URL || "https://api.trqsh.uz";

// ---- Domain types (mirror Part 05 responses; see docs/openapi.yaml) ----

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  oauth_provider?: string;
  created_at: string;
}
export interface Org {
  id: string;
  name: string;
  plan: string;
  stripe_customer_id?: string;
  created_at: string;
}
export interface Account {
  user: User;
  orgs: Org[];
  active_org: string;
  /** Sign-in providers linked to this account, oldest first (e.g. ["github", "google"]). */
  providers?: string[];
}
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
}
export interface CreatedApiKey extends ApiKey {
  api_key: string;
}
export interface ReservedSubdomain {
  id: string;
  org_id: string;
  subdomain: string;
  created_at: string;
}
export interface CustomDomain {
  id: string;
  org_id: string;
  domain: string;
  verify_token: string;
  verified_at?: string | null;
  cert_status: string;
  created_at: string;
}
export interface DnsInstructions {
  txt_name: string;
  txt_value: string;
  cname_name: string;
  cname_value: string;
}
export interface AddedDomain {
  domain: CustomDomain;
  dns_instructions: DnsInstructions;
}
export interface UsageRecord {
  bytes_in: number;
  bytes_out: number;
  requests: number;
  window_start: string;
  window_end: string;
}
export interface UsageResponse {
  usage: UsageRecord;
  limits: { bandwidth_bytes_mo: number; requests_mo: number };
  plan: string;
}
export interface Tunnel {
  id: string;
  proto: string;
  public_url: string;
  local_addr: string;
  region?: string;
  bytes_in?: number;
  bytes_out?: number;
  requests?: number;
}
export interface Plan {
  code: string;
  name: string;
  max_concurrent_tunnels: number;
  max_bandwidth_bytes_mo: number;
  max_requests_mo: number;
  max_reserved_subdomains: number;
  max_custom_domains: number;
  allow_custom_domains: boolean;
  allow_tcp: boolean;
  allow_tls: boolean;
  allow_udp: boolean;
  rate_limit_rps: number;
  inspector_history: number;
  metered_seats: boolean;
  price_monthly_cents: number;
  price_annual_cents: number;
}
export interface Me {
  user: User;
  org: Org;
  plan: string;
  plan_expires_at?: string | null;
  via_api_key?: boolean;
  usage: UsageRecord;
  limits: {
    bandwidth_bytes_mo: number;
    requests_mo: number;
    max_concurrent_tunnels: number;
    max_reserved_subdomains: number;
    max_custom_domains: number;
  };
}
export interface Subscription {
  id: string;
  plan: string;
  status: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
}
export interface SubscriptionResponse {
  plan: string;
  billing_enabled: boolean;
  subscription?: Subscription;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const TIMEOUT_MS = 15_000;

/**
 * fetch() with a timeout. It only rejects on a network failure or a timeout, so
 * both become an ApiError a page can show, instead of a raw "fetch failed" or a
 * request that hangs forever.
 */
async function request(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new ApiError(
      timedOut ? 504 : 503,
      timedOut ? "The trqsh API took too long to respond." : "Can't reach the trqsh API.",
    );
  }
}

async function refreshTokens(refresh: string): Promise<Tokens> {
  const res = await request(`${BASE}/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) throw new ApiError(res.status, "session expired");
  return (await res.json()) as Tokens;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  // A gateway or proxy error is often HTML, not JSON; that must not surface as a
  // "Unexpected token <" SyntaxError.
  let body: Record<string, unknown> = {};
  let json = true;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      json = false;
    }
  }
  if (!res.ok) {
    const message =
      typeof body.error === "string" && body.error
        ? body.error
        : res.statusText || `Request failed (${res.status})`;
    const code =
      typeof body.error_code === "string"
        ? body.error_code
        : typeof body.code === "string"
          ? body.code
          : undefined;
    throw new ApiError(res.status, message, code);
  }
  if (!json) throw new ApiError(502, "The trqsh API returned an unexpected response.");
  return body as unknown as T;
}

/** True when the API rejected the session itself (as opposed to being unreachable). */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** Best-effort server-side sign-out: revokes the refresh token so a copy of it is useless. */
export async function revokeRefreshToken(refresh: string): Promise<void> {
  try {
    await request(`${BASE}/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* signing out locally must not depend on the API being reachable */
  }
}

/**
 * Authenticated server-side fetch against the control API. On a 401 with a
 * refresh token present it transparently refreshes and retries once; the new
 * token is persisted when running in a Server Action / Route Handler, and used
 * in-memory for the current render otherwise (setTokens is a no-op there).
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { access, refresh } = await getTokens();
  const doFetch = (token?: string) =>
    request(`${BASE}/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });

  let res = await doFetch(access);
  if (res.status === 401 && refresh) {
    try {
      const tokens = await refreshTokens(refresh);
      try {
        await setTokens(tokens);
      } catch {
        /* not in an action/route handler; use the new token for this request only */
      }
      res = await doFetch(tokens.access_token);
    } catch {
      /* fall through with the original 401 */
    }
  }
  return parse<T>(res);
}

/**
 * GET a list. `safe()` uses null to mean "the request failed", so a successful
 * response must never be null. The API used to answer null for an empty list
 * (Go encodes a nil slice that way); that is an empty list, not a failure.
 */
async function apiList<T>(path: string): Promise<T[]> {
  return (await apiFetch<T[] | null>(path)) ?? [];
}

// ---- Unauthenticated auth calls ----

export async function getOAuthProviders(): Promise<string[]> {
  try {
    const response = await fetch(`${BASE}/v1/auth/providers`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [];
    const status = await response.json();
    return Array.isArray(status.providers)
      ? status.providers.filter((provider: string) => provider === "github" || provider === "google")
      : [];
  } catch {
    return [];
  }
}

// ---- Typed resource methods ----

/**
 * Resolve a request to null instead of throwing, for pages that degrade
 * gracefully. The page then says it couldn't load something, so the reason goes
 * to the server log; an expired session (401) is routine and is not logged.
 */
export async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (error) {
    if (!isUnauthorized(error)) {
      console.error(
        "trqsh API request failed:",
        error instanceof ApiError ? `${error.status} ${error.message}` : error,
      );
    }
    return null;
  }
}

export const api = {
  account: () => apiFetch<Account>("/account"),
  me: () => apiFetch<Me>("/me"),
  orgs: () => apiList<Org>("/orgs"),
  approveDevice: (user_code: string) =>
    apiFetch<{ status: string }>("/auth/device/approve", {
      method: "POST",
      body: JSON.stringify({ user_code }),
    }),
  apiKeys: () => apiList<ApiKey>("/api-keys"),
  createApiKey: (name: string) =>
    apiFetch<CreatedApiKey>("/api-keys", { method: "POST", body: JSON.stringify({ name }) }),
  revokeApiKey: (id: string) => apiFetch<void>(`/api-keys/${id}`, { method: "DELETE" }),

  subdomains: () => apiList<ReservedSubdomain>("/subdomains"),
  reserveSubdomain: (subdomain: string) =>
    apiFetch<ReservedSubdomain>("/subdomains", { method: "POST", body: JSON.stringify({ subdomain }) }),
  releaseSubdomain: (id: string) => apiFetch<void>(`/subdomains/${id}`, { method: "DELETE" }),

  domains: () => apiList<CustomDomain>("/domains"),
  addDomain: (domain: string) =>
    apiFetch<AddedDomain>("/domains", { method: "POST", body: JSON.stringify({ domain }) }),
  verifyDomain: (id: string) => apiFetch<CustomDomain>(`/domains/${id}/verify`, { method: "POST" }),

  usage: () => apiFetch<UsageResponse>("/usage"),
  tunnels: () => apiList<Tunnel>("/tunnels"),
  plans: () => apiList<Plan>("/plans"),

  subscription: () => apiFetch<SubscriptionResponse>("/billing/subscription"),
  checkout: (plan: string, cadence: string) =>
    apiFetch<{ url: string; session_id: string }>("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan, cadence }),
    }),
  portal: () => apiFetch<{ url: string }>("/billing/portal", { method: "POST" }),
};
