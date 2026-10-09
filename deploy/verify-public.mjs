#!/usr/bin/env node
// Read-only HTTP audit of the public Cloudflare deployment. Requires Node 22+.
// Usage: node deploy/verify-public.mjs [https://trqsh.uz]
const origin = new URL(process.argv[2] || "https://trqsh.uz").origin;
const localURL = /^(?:https?:)?\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[^/]*\.lvh\.me|lvh\.me|(?:api|dashboard|site):)/i;
const checks = [
  ["/", 200], ["/pricing", 200], ["/download", 200], ["/docs", 200],
  ["/docs/api", 200], ["/docs/quickstart", 200], ["/docs/inspector", 200],
  ["/upgrade", 200], ["/terms", 200], ["/privacy", 200],
  ["/robots.txt", 200], ["/sitemap.xml", 200],
  ["/dashboard/login", 200], ["/dashboard/device", 200], ["/dashboard/remote", 200],
  ["/dashboard", 307], ["/dashboard/keys", 307],
  ["/healthz", 200], ["/status", 200], ["/v1/plans/public", 200],
  ["/v1/me", 401], ["/openapi.yaml", 200], ["/api-docs", 200],
  ["/dashboard/api/remote/domain-audit-missing/viewer", 404],
  ["/internal/entitlements", 404], ["/metrics", 404],
];
let failures = 0;
const assets = new Set();
async function check(path, expected) {
  try {
    const response = await fetch(`${origin}${path}`, {
      redirect: "manual", signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "trqsh-domain-audit/1.0" },
    });
    const body = await response.text();
    const errors = [];
    if (response.status !== expected) errors.push(`expected ${expected}, got ${response.status}`);
    const location = response.headers.get("location");
    if (location && new URL(location, origin).origin !== origin) errors.push(`redirect leaves public origin: ${location}`);
    if (location && new URL(location, origin).pathname !== "/dashboard/login") errors.push(`unexpected login redirect: ${location}`);
    if (response.headers.get("content-type")?.includes("text/html")) {
      for (const match of body.matchAll(/\b(?:href|src|action)=["']([^"']+)["']/g)) {
        if (localURL.test(match[1])) errors.push(`local navigation URL: ${match[1]}`);
        if (/^\/dashboard\/_next\/static\/.+\.(?:js|css)(?:\?|$)/.test(match[1])) assets.add(match[1]);
      }
    }
    if (["/robots.txt", "/sitemap.xml"].includes(path) && /https?:\/\/(?:localhost|127\.0\.0\.1)/i.test(body)) errors.push("local canonical URL");
    if (path === "/openapi.yaml" && !body.includes(`url: ${origin}/v1`)) errors.push("OpenAPI public server URL is incorrect");
    if (path === "/status" && response.ok) {
      const status = JSON.parse(body);
      if (status.base_domain !== new URL(origin).hostname) errors.push(`wrong base domain: ${status.base_domain}`);
      console.log(`API: store=${status.store}, OAuth=${status.oauth_providers.join(",") || "unconfigured"}`);
    }
    if (errors.length) { failures++; console.error(`FAIL ${path}: ${errors.join("; ")}`); }
    else console.log(`PASS ${path} (${response.status})`);
  } catch (error) { failures++; console.error(`FAIL ${path}: ${error.message}`); }
}
// Limit concurrency so this audit stays below the API's public rate limits.
for (let index = 0; index < checks.length; index += 6) {
  await Promise.all(checks.slice(index, index + 6).map(([path, expected]) => check(path, expected)));
}
for (let index = 0, paths = [...assets]; index < paths.length; index += 6) {
  await Promise.all(paths.slice(index, index + 6).map(path => check(path, 200)));
}
console.log(`${checks.length} route checks and ${assets.size} dashboard assets checked; ${failures} failures.`);
process.exitCode = failures ? 1 : 0;
