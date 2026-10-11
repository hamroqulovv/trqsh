/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server build for Docker (.next/standalone/server.js).
  output: "standalone",
  // Public deploy-time configuration. These are inlined at build so both Server
  // and Client Components can read them. Local Compose passes explicit overrides.
  env: {
    // Where "Sign up" / "Dashboard" / "Log in" CTAs point (Part 06).
    TRQSH_DASHBOARD_URL: process.env.TRQSH_DASHBOARD_URL || "https://app.trqsh.uz",
    // Control API (Part 05) — used for the OAuth deep-links on signup.
    TRQSH_API_URL: process.env.TRQSH_API_URL || "https://api.trqsh.uz",
    // Source repo (also hosts the desktop GUI's desktop-v* releases).
    TRQSH_GITHUB_REPO: process.env.TRQSH_GITHUB_REPO || "algorithco/trqsh",
    // CLI releases (Part 08 goreleaser output) publish to their own repo.
    TRQSH_CLI_GITHUB_REPO: process.env.TRQSH_CLI_GITHUB_REPO || "algorithco/trqshcli",
    // Canonical public origin (sitemap, robots, Open Graph, docs links).
    TRQSH_SITE_URL: process.env.TRQSH_SITE_URL || "https://trqsh.uz",
    // Latest published version — drives download filenames (matches goreleaser
    // `trqsh_<version>_<os>_<arch>` archive names).
    TRQSH_LATEST_VERSION: process.env.TRQSH_LATEST_VERSION || "0.2.2",
    // Telegram username (no @) users contact to buy/upgrade a plan — shown on the
    // /upgrade page (there is no self-serve checkout).
    TRQSH_TELEGRAM: process.env.TRQSH_TELEGRAM || "hamroqulovv",
  },
  // A single Cloudflare hostname can serve the site, dashboard and public API.
  // Only documented public API routes are forwarded; internal RPC/metrics stay
  // on the Docker network. The dashboard is built with basePath=/dashboard.
  async rewrites() {
    const dashboard = process.env.TRQSH_DASHBOARD_INTERNAL_URL?.replace(/\/$/, "");
    const api = process.env.TRQSH_API_INTERNAL_URL?.replace(/\/$/, "");
    return {
      beforeFiles: [
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
