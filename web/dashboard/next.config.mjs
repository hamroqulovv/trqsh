/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  ...(process.env.TRQSH_BUILD_CPUS
    ? { experimental: { cpus: Number(process.env.TRQSH_BUILD_CPUS) } }
    : {}),
  basePath: process.env.NEXT_PUBLIC_TRQSH_DASHBOARD_BASE_PATH || "",
  // The control-plane API base (Part 05). Server-only; the browser never calls
  // it directly — reads go through Server Components and writes through Server
  // Actions, so the JWT stays server-side.
  env: {
    TRQSH_API_URL: process.env.TRQSH_API_URL || "https://api.trqsh.uz",
  },
  // The /qr viewer URL carries the pairing code, which is the viewer's whole
  // credential: never leak it via Referer, never cache it, never frame it.
  async headers() {
    const hardened = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
    ];
    // The proxy routes set their own Cache-Control (the SSE stream needs
    // no-transform), so only the pages add no-store here.
    return [
      { source: "/remote/:path*", headers: [...hardened, { key: "Cache-Control", value: "no-store" }] },
      { source: "/api/remote/:path*", headers: hardened },
    ];
  },
};

export default nextConfig;
