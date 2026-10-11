// The frozen §8 error taxonomy (pkg/proto), presented for humans. This is the
// canonical mapping the CLI, GUI, and dashboard deep-link into: every code has a
// stable anchor at /docs/errors#<lowercased-code>, so an error surfaced anywhere
// in the product links straight to its explanation and fix.
//
// Keep the code set identical to pkg/proto and web/dashboard/lib/errors.ts.

export interface ErrorDoc {
  code: string;
  title: string;
  /** What it means. */
  detail: string;
  /** How to resolve it. */
  fix: string;
  /** True when the resolution is a plan upgrade (CTA to /pricing). */
  upgrade?: boolean;
}

export const ERRORS: ErrorDoc[] = [
  {
    code: "ERR_AUTH_REQUIRED",
    title: "Authentication required",
    detail: "The edge received a bind without valid credentials.",
    fix: "Run `/login` inside the console, or set `TRQSH_API_KEY` / `api_key` in `~/.trqsh/trqsh.yml`. Restart an existing daemon after changing startup credentials.",
  },
  {
    code: "ERR_AUTH_INVALID",
    title: "Invalid credentials",
    detail: "The API key or token was rejected.",
    fix: "Create a fresh key in the dashboard under API keys and update your config.",
  },
  {
    code: "ERR_VERSION_UNSUPPORTED",
    title: "Agent version unsupported",
    detail: "This edge no longer supports your agent's protocol version.",
    fix: "Use `/update` inside the console or reinstall through your original package manager. Use `/down` before relaunching the updated agent.",
  },
  {
    code: "ERR_QUOTA_TUNNELS",
    title: "Concurrent tunnel limit reached",
    detail: "You've hit the number of simultaneous tunnels your plan allows.",
    fix: "Stop an unused tunnel, or upgrade for a higher concurrent limit.",
    upgrade: true,
  },
  {
    code: "ERR_QUOTA_BANDWIDTH",
    title: "Bandwidth quota exceeded",
    detail: "The account's transfer allowance for the enforced usage window is used up.",
    fix: "Check the account usage window, wait for allowance to become available, or choose a plan with more bandwidth.",
    upgrade: true,
  },
  {
    code: "ERR_QUOTA_REQUESTS",
    title: "Request quota exceeded",
    detail: "This month's request allowance is used up.",
    fix: "Check this deployment's request allowance and usage window, then wait or choose a higher limit.",
    upgrade: true,
  },
  {
    code: "ERR_SUBDOMAIN_TAKEN",
    title: "Subdomain already taken",
    detail: "Another account has claimed that subdomain.",
    fix: "Pick a different subdomain, or omit it to get a random one.",
  },
  {
    code: "ERR_SUBDOMAIN_FORBIDDEN",
    title: "Subdomain not permitted",
    detail: "The requested name is not reserved by the account binding the tunnel, or reserved names are not permitted.",
    fix: "Use `/subdomains reserve NAME` or the dashboard's Domains page, then bind using the same account. Check reservation limits separately.",
  },
  {
    code: "ERR_DOMAIN_UNVERIFIED",
    title: "Custom domain not verified",
    detail: "The custom domain hasn't completed DNS verification.",
    fix: "Add the TXT and CNAME records shown in the dashboard, then re-verify.",
  },
  {
    code: "ERR_PLAN_FORBIDS",
    title: "Not available on your plan",
    detail: "The feature you requested (for example UDP or a custom domain) isn't allowed by your effective plan.",
    fix: "Check the effective plan and its expiry, then use an allowed feature or upgrade. Protocol availability also depends on the edge deployment.",
    upgrade: true,
  },
  {
    code: "ERR_PROTO_UNSUPPORTED",
    title: "Unsupported protocol",
    detail: "The tunnel protocol you asked for isn't available on this edge.",
    fix: "Use the documented HTTP, TCP or UDP workflow supported by your edge. Core HTTPS/TLS identifiers do not guarantee HTTPS upstream forwarding or SNI passthrough.",
  },
  {
    code: "ERR_PORT_UNAVAILABLE",
    title: "Remote port unavailable",
    detail: "The requested TCP/UDP remote port is already in use.",
    fix: "Choose an available port in the edge's configured pool, or omit `remote_port`. On a self-hosted edge, also publish/open the assigned port.",
  },
  {
    code: "ERR_RATE_LIMITED",
    title: "Rate limited",
    detail: "You're opening connections or making requests too quickly.",
    fix: "Back off and retry; upgrade for a higher rate limit if you hit it often.",
    upgrade: true,
  },
  {
    code: "ERR_INTERNAL",
    title: "Internal error",
    detail: "Something went wrong on the edge.",
    fix: "Retry shortly. If it persists, check status or contact support.",
  },
  {
    code: "ERR_UPSTREAM_UNREACHABLE",
    title: "Local service unreachable",
    detail: "The edge reached your agent, but the agent couldn't connect to your local service.",
    fix: "Confirm your local server is running on the address you tunneled (e.g. `localhost:3000`).",
  },
];

/** Stable docs anchor for a code, e.g. "ERR_QUOTA_BANDWIDTH" -> "err_quota_bandwidth". */
export function errorAnchor(code: string): string {
  return code.toLowerCase();
}

/** Full deep-link the CLI/GUI/dashboard can print for a code. */
export function errorDocUrl(code: string): string {
  return `/docs/errors#${errorAnchor(code)}`;
}
