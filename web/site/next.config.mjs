// Public origin, e.g. https://trqsh.uz. When it is a bare registrable domain,
// the www host is sent here instead of serving a second copy of the site.
const siteOrigin = new URL(process.env.TRQSH_SITE_URL || "https://trqsh.uz");
const wwwHost =
  /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(siteOrigin.hostname) &&
  !/^\d+(\.\d+){3}$/.test(siteOrigin.hostname) &&
  !siteOrigin.hostname.startsWith("www.")
    ? `www.${siteOrigin.hostname}`
    : null;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server build for Docker (.next/standalone/server.js).
  output: "standalone",
  ...(process.env.TRQSH_BUILD_CPUS
    ? { experimental: { cpus: Number(process.env.TRQSH_BUILD_CPUS) } }
    : {}),
  // Public deploy-time configuration. These are inlined at build so both Server
  // and Client Components can read them. Local Compose passes explicit overrides.
  env: {
    // Where "Sign up" / "Dashboard" / "Log in" CTAs point (Part 06).
    TRQSH_DASHBOARD_URL: process.env.TRQSH_DASHBOARD_URL || "https://app.trqsh.uz",
    // Control API (Part 05) — used for the OAuth deep-links on signup.
    TRQSH_API_URL: process.env.TRQSH_API_URL || "https://api.trqsh.uz",
    // Source repo (also hosts the desktop GUI's desktop-v* releases).
    TRQSH_GITHUB_REPO: process.env.TRQSH_GITHUB_REPO || "trqsh-tunnel/trqsh",
    // CLI releases (Part 08 goreleaser output) publish to their own repo.
    TRQSH_CLI_GITHUB_REPO: process.env.TRQSH_CLI_GITHUB_REPO || "trqsh-tunnel/trqshcli",
    // Canonical public origin (sitemap, robots, Open Graph, docs links).
    TRQSH_SITE_URL: process.env.TRQSH_SITE_URL || "https://trqsh.uz",
    TRQSH_BASE_DOMAIN: process.env.TRQSH_BASE_DOMAIN || "trqsh.uz",
    // Latest published version — drives download filenames (matches goreleaser
    // `trqsh_<version>_<os>_<arch>` archive names).
    TRQSH_LATEST_VERSION: process.env.TRQSH_LATEST_VERSION || "0.2.7",
    // Telegram username (no @) users contact to buy/upgrade a plan — shown on the
    // /upgrade page (there is no self-serve checkout).
    TRQSH_TELEGRAM: process.env.TRQSH_TELEGRAM || "hamroqulovv",
  },
  // One hostname per page: the www host would otherwise answer with a full copy
  // of the site, splitting every URL across two origins.
  async redirects() {
    return wwwHost
      ? [
          {
            source: "/:path*",
            has: [{ type: "host", value: wwwHost }],
            destination: `${siteOrigin.origin}/:path*`,
            permanent: true,
          },
        ]
      : [];
  },
  // Installers are piped into a shell, so serve them as readable UTF-8 text.
  // They and the OpenAPI download are files, not pages: keep them out of search
  // results while leaving them crawlable so the header can be read.
  async headers() {
    const noindex = { key: "X-Robots-Tag", value: "noindex" };
    const text = [{ key: "Content-Type", value: "text/plain; charset=utf-8" }, noindex];
    return [
      ...["/install", "/install.sh", "/install.ps1"].map((source) => ({ source, headers: text })),
      { source: "/openapi.yaml", headers: [noindex] },
      // /upgrade renders per request, so Next streams its <meta name="robots">
      // into the body. The header keeps the noindex independent of that markup.
      { source: "/upgrade", headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }] },
    ];
  },
  // A single Cloudflare hostname can serve the site, dashboard and public API.
  // Only documented public API routes are forwarded; internal RPC/metrics stay
  // on the Docker network. The dashboard is built with basePath=/dashboard.
  async rewrites() {
    const dashboard = process.env.TRQSH_DASHBOARD_INTERNAL_URL?.replace(/\/$/, "");
    const api = process.env.TRQSH_API_INTERNAL_URL?.replace(/\/$/, "");
    const agent = process.env.TRQSH_AGENT_INTERNAL_URL?.replace(/\/$/, "");
    return {
      beforeFiles: [
        // Short installer URLs: `curl -fsSL https://trqsh.uz/install | sh`.
        { source: "/install", destination: "/install.sh" },
        ...(agent ? [{ source: "/_trqsh/agent", destination: `${agent}/_trqsh/agent` }] : []),
        ...(dashboard
          ? [
              { source: "/dashboard", destination: `${dashboard}/dashboard` },
              { source: "/dashboard/:path*", destination: `${dashboard}/dashboard/:path*` },
            ]
          : []),
        ...(api
          ? [
              { source: "/v1/:path*", destination: `${api}/v1/:path*` },
              { source: "/healthz", destination: `${api}/healthz` },
              { source: "/status", destination: `${api}/status` },
              { source: "/api-docs", destination: `${api}/docs` },
            ]
          : []),
      ],
    };
  },
};

export default nextConfig;
