#!/usr/bin/env node
// Read-only production audit. Node 22+. No credentials or account creation.
// Usage: node deploy/verify-public.mjs [site-origin] [app-origin] [api-origin]
if (process.argv.includes("--help")) {
  console.log("node deploy/verify-public.mjs [https://trqsh.uz] [https://app.trqsh.uz] [https://api.trqsh.uz]");
  process.exit(0);
}
const site = new URL(process.argv[2] || "https://trqsh.uz").origin;
const app = new URL(process.argv[3] || "https://app.trqsh.uz").origin;
const api = new URL(process.argv[4] || "https://api.trqsh.uz").origin;
const localURL = /^(?:https?:)?\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[^/]*\.lvh\.me|lvh\.me|(?:api|dashboard|site):)/i;
const checks = [
  ...["/", "/pricing", "/download", "/docs", "/docs/api", "/docs/quickstart", "/docs/inspector", "/upgrade", "/terms", "/privacy", "/robots.txt", "/sitemap.xml", "/openapi.yaml"].map(path => [site, path, 200]),
  [app, "/login", 200], [app, "/", 307], [app, "/keys", 307],
  [app, "/api/remote/domain-audit-missing/viewer", 404],
  [api, "/healthz", 200], [api, "/v1/auth/providers", 200],
  [api, "/v1/plans/public", 200], [api, "/v1/me", 401],
  [api, "/openapi.yaml", 200], [api, "/status", 404], [api, "/docs", 404],
  [api, "/internal/entitlements", 404], [api, "/metrics", 404],
];
let failures = 0;
const assets = new Set();
async function check(origin, path, expected) {
  const target = new URL(path, origin);
  try {
    const response = await fetch(target, {
      redirect: "manual", signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "trqsh-domain-audit/2.0" },
    });
    const body = await response.text();
    const errors = [];
    if (response.status !== expected) errors.push(`expected ${expected}, got ${response.status}`);
    const location = response.headers.get("location");
    if (location) {
      const dest = new URL(location, origin);
      if (origin !== app || dest.origin !== app || dest.pathname !== "/login") errors.push(`unexpected redirect: ${location}`);
    }
    if (response.headers.get("content-type")?.includes("text/html")) {
      for (const match of body.matchAll(/\b(?:href|src|action)=["']([^"']+)["']/g)) {
        if (localURL.test(match[1]) || /https?:\/\/tunnel\.trqsh\.uz(?:[/:]|$)/i.test(match[1])) errors.push(`obsolete/local navigation URL: ${match[1]}`);
        const asset = new URL(match[1], target);
        if ([site, app].includes(asset.origin) && /^\/_next\/static\/.+\.(?:js|css)$/.test(asset.pathname)) assets.add(asset.href);
      }
    }
    if (origin === app && path === "/login") {
      if (/<input\b[^>]*\btype=["']email["']/i.test(body)) errors.push("email-only login form is public");
      for (const provider of ["github", "google"]) {
        if (!body.includes(`/login/oauth/${provider}`)) errors.push(`${provider} sign-in unavailable`);
      }
    }
    if (["/robots.txt", "/sitemap.xml"].includes(path) && /https?:\/\/(?:localhost|127\.0\.0\.1)/i.test(body)) errors.push("local canonical URL");
    if (path === "/openapi.yaml" && !body.includes(`url: ${api}/v1`)) errors.push("incorrect public API server URL");
    if (origin === api && path === "/v1/auth/providers" && response.ok) {
      const data = JSON.parse(body);
      if (!Array.isArray(data.providers) || !["github", "google"].every(provider => data.providers.includes(provider))) errors.push("both OAuth providers must be configured");
    }
    if (errors.length) { failures++; console.error(`FAIL ${target}: ${errors.join("; ")}`); }
    else console.log(`PASS ${target} (${response.status})`);
  } catch (error) { failures++; console.error(`FAIL ${target}: ${error.message}`); }
}
for (let index = 0; index < checks.length; index += 4) {
  await Promise.all(checks.slice(index, index + 4).map(([origin, path, expected]) => check(origin, path, expected)));
}
for (const asset of assets) {
  const url = new URL(asset);
  await check(url.origin, url.pathname + url.search, 200);
}
console.log(`${checks.length} route checks and ${assets.size} assets checked; ${failures} failures.`);
process.exitCode = failures ? 1 : 0;
