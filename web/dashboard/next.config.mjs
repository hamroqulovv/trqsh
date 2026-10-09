/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: process.env.NEXT_PUBLIC_TRQSH_DASHBOARD_BASE_PATH || "",
  // The control-plane API base (Part 05). Server-only; the browser never calls
  // it directly — reads go through Server Components and writes through Server
  // Actions, so the JWT stays server-side.
  env: {
    TRQSH_API_URL: process.env.TRQSH_API_URL || "https://api.trqsh.uz",
  },
};

export default nextConfig;
