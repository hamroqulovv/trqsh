// Central site configuration: brand strings, deploy-time URLs, and navigation.
// All external destinations resolve from next.config.mjs `env` (public defaults),
// so the same build points at dev or prod by setting env vars — never hardcode.

const dashboardUrl = process.env.TRQSH_DASHBOARD_URL || "https://app.trqsh.uz";
const apiUrl = process.env.TRQSH_API_URL || "https://api.trqsh.uz";
// Source (and the desktop GUI's own desktop-v* releases) live in the main
// monorepo; CLI releases publish to their own dedicated repo so CLI download
// links / changelog / checksums point users at a clean, CLI-only release list
// instead of one mixed with desktop and other release types.
const githubRepo = process.env.TRQSH_GITHUB_REPO || "trqsh-tunnel/trqsh";
const cliGithubRepo = process.env.TRQSH_CLI_GITHUB_REPO || "trqsh-tunnel/trqshcli";
const siteUrl = process.env.TRQSH_SITE_URL || "https://trqsh.uz";
const version = process.env.TRQSH_LATEST_VERSION || "0.2.5";
// Telegram handle (without @) users message to buy/upgrade a plan. There is no
// self-serve checkout; the /upgrade page routes people here.
const telegram = (process.env.TRQSH_TELEGRAM || "hamroqulovv").replace(
  /^@/,
  "",
);

export const site = {
  name: "trqsh",
  supportEmail: "hello@trqsh.uz",
  tagline: "Your localhost, live on the internet.",
  description:
    "Bring your localhost to the internet with the trqsh CLI. Share development servers, receive webhooks, and connect TCP or UDP services from your terminal.",
  version,
  siteUrl,
  dashboardUrl,
  apiUrl,
  githubRepo,
  githubUrl: `https://github.com/${githubRepo}`,
  cliGithubRepo,
  cliGithubUrl: `https://github.com/${cliGithubRepo}`,
  // Public wildcard where tunnels appear (Part 00 §1); shown in examples.
  tunnelDomain: process.env.TRQSH_BASE_DOMAIN || "trqsh.uz",
  // curl|sh installer served from the marketing origin (Part 08 release/install.sh).
  installShUrl: `${siteUrl}/install.sh`,
  // Sales/upgrade contact (manual, Telegram-only — no Stripe).
  telegram,
  telegramUrl: `https://t.me/${telegram}`,
} as const;

/** Where "Start free" / "Sign up" go — the dashboard's GitHub/Google OAuth entry (Part 06/05). */
export const signupUrl = `${dashboardUrl}/login`;
export const loginUrl = `${dashboardUrl}/login`;
/** OAuth deep-links straight into the control API (Part 05). */
export const oauthUrl = (provider: "github" | "google") =>
  `${apiUrl}/v1/auth/oauth/${provider}`;

export const primaryNav = [
  { label: "Pricing", href: "/pricing" },
  { label: "Download", href: "/download" },
  { label: "Docs", href: "/docs" },
  { label: "Changelog", href: "/changelog" },
] as const;

export const footerNav: {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
}[] = [
  {
    title: "Product",
    links: [
      { label: "Download", href: "/download" },
      { label: "Pricing", href: "/pricing" },
      { label: "Dashboard", href: site.dashboardUrl, external: true },
    ],
  },
  {
    title: "Documentation",
    links: [
      { label: "Quickstart", href: "/docs/quickstart" },
      { label: "CLI reference", href: "/docs/cli-reference" },
      { label: "API reference", href: "/docs/api" },
      { label: "Self-hosting", href: "/docs/self-hosting" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "GitHub", href: site.githubUrl, external: true },
      { label: "Changelog", href: "/changelog" },
      { label: "Troubleshooting", href: "/docs/troubleshooting" },
      { label: "Security", href: "/docs/security" },
    ],
  },
];

export const footerLegalNav = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Cookies", href: "/cookies" },
  { label: "Acceptable use", href: "/acceptable-use" },
  { label: "Contact", href: `mailto:${site.supportEmail}` },
] as const;
