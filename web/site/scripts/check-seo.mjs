#!/usr/bin/env node
// Rendered-HTML SEO audit. Node 22+, no dependencies, read-only.
//
//   pnpm build && pnpm start          # then, in another terminal:
//   pnpm check:seo                    # http://localhost:3002
//   node scripts/check-seo.mjs http://localhost:3012
//   node scripts/check-seo.mjs https://trqsh.uz
//
// Fetches every URL in /sitemap.xml plus every internal link found on those
// pages, and checks what a search engine receives: status codes and redirects,
// canonical, title, description, social tags, headings, JSON-LD, indexing
// directives and fragment targets. Canonical URLs are compared against
// --canonical-origin (default $TRQSH_SITE_URL or https://trqsh.uz), so a local
// server is checked against the production names it will publish.
//
// Exit code 1 when any check fails; warnings never fail the run.

import http from "node:http";

const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
const base = new URL(args.find((arg) => !arg.startsWith("--")) ?? "http://localhost:3002");
const canonicalOrigin = new URL(
  option("canonical-origin") ?? process.env.TRQSH_SITE_URL ?? "https://trqsh.uz",
).origin;
const userAgent = "trqsh-seo-check/1.0 (+https://trqsh.uz)";

const failures = [];
const warnings = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);
const passed = [];
const ok = (message) => passed.push(message);

// ---------------------------------------------------------------- fetching --

/** A URL on the canonical origin is fetched from the server under test. */
const toLocal = (url) => {
  const parsed = new URL(url, base);
  return parsed.origin === canonicalOrigin ? new URL(parsed.pathname + parsed.search, base) : parsed;
};

async function get(target) {
  const response = await fetch(toLocal(target), {
    redirect: "manual",
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  const type = response.headers.get("content-type") ?? "";
  return {
    status: response.status,
    headers: response.headers,
    location: response.headers.get("location"),
    type,
    body: /text|xml|json|yaml/.test(type) ? await response.text() : (await response.arrayBuffer(), ""),
  };
}

/** GET with an explicit Host header, for exercising the www redirect locally. */
function getWithHost(path, host) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: base.hostname, port: base.port, path, headers: { host, "user-agent": userAgent } },
      (response) => {
        response.resume();
        resolve({ status: response.statusCode, location: response.headers.location ?? null });
      },
    );
    request.on("error", reject);
    request.setTimeout(30_000, () => request.destroy(new Error("timeout")));
    request.end();
  });
}

// ----------------------------------------------------------------- parsing --

const decode = (text) =>
  text
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");

function attributes(tag) {
  const out = {};
  for (const match of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*"([^"]*)"/g)) out[match[1].toLowerCase()] = decode(match[2]);
  return out;
}

/**
 * Text of an HTML fragment: everything outside "<" ... ">". It scans instead of
 * replacing tag patterns, so split or nested tags such as "<scr<b>ipt>" cannot
 * reform into markup.
 */
function textOf(fragment) {
  let text = "";
  let inTag = false;
  for (const char of fragment) {
    if (char === "<") inTag = true;
    else if (char === ">" && inTag) inTag = false;
    else if (!inTag) text += char;
  }
  return decode(text).replace(/\s+/g, " ").trim();
}

/**
 * The HTML without its <script> and <style> elements, found by scanning for an
 * opening tag and then the next end tag. End tags may carry whitespace or
 * attributes ("</script >"), so they are matched up to the closing ">".
 */
function withoutCode(html) {
  const opening = /<(script|style)(?=[\s/>])/gi;
  const closing = { script: /<\/script\b[^>]*>/gi, style: /<\/style\b[^>]*>/gi };
  let out = "";
  let position = 0;
  for (let open = opening.exec(html); open; open = opening.exec(html)) {
    out += html.slice(position, open.index);
    const end = closing[open[1].toLowerCase()];
    end.lastIndex = open.index;
    const close = end.exec(html);
    position = close ? close.index + close[0].length : html.length;
    opening.lastIndex = position;
  }
  return out + html.slice(position);
}

function parsePage(html) {
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? "";
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((match) => attributes(match[0]));
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0]));
  const content = (key) =>
    metas.filter((meta) => meta.name === key || meta.property === key).map((meta) => meta.content ?? "");
  const markup = withoutCode(html);
  return {
    lang: html.match(/<html[^>]*\blang="([^"]*)"/i)?.[1],
    title: decode(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""),
    content,
    canonicals: links.filter((link) => link.rel === "canonical").map((link) => link.href),
    headings: [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((match) => ({
      level: Number(match[1]),
      text: textOf(match[2]),
    })),
    jsonLd: [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map(
      (match) => match[1],
    ),
    anchors: [...markup.matchAll(/<a\b[^>]*\bhref="([^"]*)"/gi)].map((match) => decode(match[1])),
    ids: new Set([...html.matchAll(/\b(?:id|name)="([^"]+)"/g)].map((match) => match[1])),
    visibleText: textOf(markup.slice(Math.max(0, markup.search(/<body\b/i)))).length,
    attributeUrls: [...html.matchAll(/\b(?:href|src|content)="(https?:\/\/[^"]+)"/g)].map((match) => match[1]),
  };
}

// ------------------------------------------------------------ site checks --

async function checkRobotsAndSitemap() {
  const robots = await get("/robots.txt");
  if (robots.status !== 200) fail("/robots.txt", `status ${robots.status}`);
  else {
    if (!robots.body.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`)) {
      fail("/robots.txt", `does not name ${canonicalOrigin}/sitemap.xml`);
    }
    const disallowed = [...robots.body.matchAll(/^\s*Disallow:\s*(\S+)/gim)].map((match) => match[1]);
    if (disallowed.includes("/")) fail("/robots.txt", "disallows the whole site");
    else ok(`robots.txt allows crawling${disallowed.length ? ` (disallows ${disallowed.join(", ")})` : ""}`);
  }

  const sitemap = await get("/sitemap.xml");
  if (sitemap.status !== 200 || !/xml/.test(sitemap.type)) {
    fail("/sitemap.xml", `status ${sitemap.status}, ${sitemap.type || "no content type"}`);
    return [];
  }
  const urls = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1]));
  if (new Set(urls).size !== urls.length) fail("/sitemap.xml", "lists a URL twice");
  for (const url of urls) {
    if (new URL(url).origin !== canonicalOrigin) fail("/sitemap.xml", `${url} is not on ${canonicalOrigin}`);
  }
  if (/<(priority|changefreq)>/.test(sitemap.body)) warn("/sitemap.xml", "carries priority or changefreq hints, which search engines ignore");
  for (const [, date] of sitemap.body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
    if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/.test(date) || Number.isNaN(Date.parse(date))) {
      fail("/sitemap.xml", `invalid lastmod ${date}`);
    }
  }
  ok(`sitemap.xml lists ${urls.length} URLs`);
  return urls;
}

async function checkStatusBehaviour(sitemapUrls) {
  // Unknown URLs must be real 404s, not soft errors.
  for (const path of ["/this-page-does-not-exist", "/docs/this-guide-does-not-exist"]) {
    const response = await get(path);
    if (response.status !== 404) fail(path, `expected 404, got ${response.status}`);
    else {
      const page = parsePage(response.body);
      const directives = [...page.content("robots"), response.headers.get("x-robots-tag") ?? ""].join(" ");
      if (!/noindex/i.test(directives)) fail(path, "the 404 page is not noindex");
      if (page.canonicals.length) fail(path, `the 404 page declares a canonical (${page.canonicals[0]})`);
      ok(`${path} is a 404 without a canonical`);
    }
  }

  // Trailing slashes go to the canonical form in one hop.
  const slash = await get("/docs/");
  if (![301, 308].includes(slash.status) || toLocal(slash.location ?? "").pathname !== "/docs") {
    fail("/docs/", `expected a permanent redirect to /docs, got ${slash.status} ${slash.location ?? ""}`);
  } else ok("/docs/ redirects to /docs");

  // Query strings never change the canonical.
  const tracked = await get("/pricing?utm_source=check&ref=seo");
  const trackedCanonical = parsePage(tracked.body).canonicals;
  if (tracked.status !== 200 || trackedCanonical.join() !== `${canonicalOrigin}/pricing`) {
    fail("/pricing?utm_source=…", `canonical is ${trackedCanonical.join() || "missing"}`);
  } else ok("query strings keep the same canonical");

  // Pages that must stay out of results.
  const upgrade = await get("/upgrade");
  const upgradeSignals = [upgrade.headers.get("x-robots-tag") ?? "", ...parsePage(upgrade.body).content("robots")];
  if (!upgradeSignals.some((signal) => /noindex/i.test(signal))) fail("/upgrade", "is not noindex");
  else if (!/noindex/i.test(upgrade.headers.get("x-robots-tag") ?? "")) warn("/upgrade", "noindex is only in the markup, not in an X-Robots-Tag header");
  else ok("/upgrade is noindex (header)");
  if (sitemapUrls.includes(`${canonicalOrigin}/upgrade`)) fail("/sitemap.xml", "lists the noindex /upgrade page");

  for (const path of ["/install.sh", "/install.ps1", "/install", "/openapi.yaml"]) {
    const response = await get(path);
    if (!/noindex/i.test(response.headers.get("x-robots-tag") ?? "")) fail(path, "is missing X-Robots-Tag: noindex");
    else ok(`${path} is noindex`);
  }

  // One hostname per page.
  const host = new URL(canonicalOrigin).hostname;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) && !/^\d+(\.\d+){3}$/.test(host) && !host.startsWith("www.")) {
    const sameHost = base.hostname === host;
    const response = sameHost
      ? await fetch(`https://www.${host}/docs`, { redirect: "manual" }).then((r) => ({ status: r.status, location: r.headers.get("location") }))
      : await getWithHost("/docs", `www.${host}`);
    if (![301, 308].includes(response.status) || response.location !== `${canonicalOrigin}/docs`) {
      fail(`www.${host}`, `expected a permanent redirect to ${canonicalOrigin}/docs, got ${response.status} ${response.location ?? ""}`);
    } else ok(`www.${host} redirects to ${canonicalOrigin}`);
  }
}

// ------------------------------------------------------------ page checks --

const pages = new Map(); // canonical URL -> { page, response }

function checkPage(url, response, page, sitemapUrls) {
  const where = new URL(url).pathname;
  if (response.status !== 200) return fail(where, `status ${response.status}`);
  if (!/text\/html/.test(response.type)) return fail(where, `content type ${response.type}`);
  if (/noindex/i.test(response.headers.get("x-robots-tag") ?? "")) fail(where, "X-Robots-Tag says noindex");
  if (page.lang !== "en") fail(where, `html lang is ${page.lang ?? "missing"}`);

  if (page.title.length < 10 || page.title.length > 70) warn(where, `title is ${page.title.length} characters: "${page.title}"`);
  const [description, ...extraDescriptions] = page.content("description");
  if (!description) fail(where, "no meta description");
  else {
    if (extraDescriptions.length) fail(where, "more than one meta description");
    if (description.length < 50 || description.length > 200) warn(where, `description is ${description.length} characters`);
  }

  if (page.canonicals.length !== 1) fail(where, `${page.canonicals.length} canonical tags`);
  else if (page.canonicals[0] !== url) fail(where, `canonical is ${page.canonicals[0]}, expected ${url}`);

  for (const robots of [...page.content("robots"), ...page.content("googlebot")]) {
    if (/noindex|none/i.test(robots)) fail(where, `robots meta says "${robots}"`);
  }

  const og = (key) => page.content(`og:${key}`)[0];
  const twitter = (key) => page.content(`twitter:${key}`)[0];
  if (og("title") !== page.title) fail(where, `og:title is "${og("title")}", not the page title`);
  if (og("description") !== description) fail(where, "og:description differs from the meta description");
  if (og("url") !== url) fail(where, `og:url is ${og("url")}, expected ${url}`);
  if (!og("site_name") || !og("type")) fail(where, "og:site_name or og:type missing");
  if (!/^https:\/\//.test(og("image") ?? "")) fail(where, "no absolute og:image");
  if (twitter("card") !== "summary_large_image") fail(where, `twitter:card is ${twitter("card")}`);
  if (twitter("title") !== page.title || twitter("description") !== description) fail(where, "twitter title or description differs from the page");
  if (!/^https:\/\//.test(twitter("image") ?? "")) fail(where, "no absolute twitter:image");

  const h1s = page.headings.filter((heading) => heading.level === 1);
  if (h1s.length !== 1) fail(where, `${h1s.length} h1 elements`);
  else if (!h1s[0].text) fail(where, "empty h1");
  if (page.headings[0]?.level !== 1) fail(where, `the first heading is an h${page.headings[0]?.level}, not the h1`);
  for (let i = 1; i < page.headings.length; i++) {
    if (page.headings[i].level - page.headings[i - 1].level > 1) {
      warn(where, `heading jumps from h${page.headings[i - 1].level} to h${page.headings[i].level} at "${page.headings[i].text}"`);
      break;
    }
  }

  if (page.visibleText < 300) fail(where, `only ${page.visibleText} characters of text in the server-rendered HTML`);
  for (const attr of page.attributeUrls) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(attr)) fail(where, `points at a local address: ${attr}`);
  }

  checkJsonLd(where, url, page, sitemapUrls);
}

function checkJsonLd(where, url, page, sitemapUrls) {
  const nodes = [];
  for (const raw of page.jsonLd) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      fail(where, `JSON-LD does not parse: ${error.message}`);
      continue;
    }
    if (data["@context"] !== "https://schema.org") fail(where, `JSON-LD @context is ${data["@context"]}`);
    nodes.push(...(data["@graph"] ?? [data]));
  }
  const types = nodes.map((node) => node["@type"]);
  const duplicated = types.filter((type, index) => types.indexOf(type) !== index);
  if (duplicated.length) fail(where, `duplicate JSON-LD types: ${[...new Set(duplicated)].join(", ")}`);

  const path = new URL(url).pathname;
  if (path === "/") {
    const website = nodes.find((node) => node["@type"] === "WebSite");
    const organization = nodes.find((node) => node["@type"] === "Organization");
    if (!website || !organization) fail(where, "the home page needs WebSite and Organization JSON-LD");
    else {
      if (website.url !== url || organization.url !== url) fail(where, "WebSite/Organization url is not the canonical home URL");
      if (!website.name || website.name !== organization.name) fail(where, "WebSite and Organization names differ");
      if (website.publisher?.["@id"] !== organization["@id"]) fail(where, "WebSite.publisher does not reference the Organization");
      for (const link of organization.sameAs ?? []) if (!/^https:\/\//.test(link)) fail(where, `sameAs is not https: ${link}`);
    }
  } else if (path.startsWith("/docs/")) {
    const breadcrumb = nodes.find((node) => node["@type"] === "BreadcrumbList");
    if (!breadcrumb) return fail(where, "no BreadcrumbList");
    const items = breadcrumb.itemListElement ?? [];
    if (items.some((item, index) => item.position !== index + 1)) fail(where, "breadcrumb positions are not sequential from 1");
    if (items.at(-1)?.item !== url) fail(where, `the last breadcrumb is ${items.at(-1)?.item}, not this page`);
    for (const item of items) {
      if (!sitemapUrls.includes(item.item)) fail(where, `breadcrumb ${item.item} is not an indexable page in the sitemap`);
      if (!item.name) fail(where, "a breadcrumb has no name");
    }
  } else if (types.includes("BreadcrumbList")) {
    fail(where, "has a BreadcrumbList without a real hierarchy");
  }
}

function checkUniqueness() {
  for (const [label, read] of [
    ["title", ({ page }) => page.title],
    ["meta description", ({ page }) => page.content("description")[0]],
  ]) {
    const seen = new Map();
    for (const [url, entry] of pages) {
      const value = read(entry);
      if (!value) continue;
      if (seen.has(value)) fail(new URL(url).pathname, `${label} duplicates ${new URL(seen.get(value)).pathname}`);
      seen.set(value, url);
    }
  }
}

// ------------------------------------------------------------------ links --

async function checkLinks() {
  const sources = new Map(); // local URL string -> Set of pages that link to it
  for (const [url, { page }] of pages) {
    for (const href of page.anchors) {
      if (/^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;
      const target = new URL(href, toLocal(url));
      const internal = target.origin === base.origin;
      if (!internal) continue;
      const key = target.pathname + target.search + target.hash;
      if (!sources.has(key)) sources.set(key, new Set());
      sources.get(key).add(new URL(url).pathname);
    }
  }

  const bodies = new Map(); // path+search -> parsed page (or null)
  const fetched = new Map(); // path+search -> response
  const requests = [...new Set([...sources.keys()].map((key) => key.replace(/#.*/, "")))];
  await pool(requests, 8, async (key) => {
    const response = fetched.get(key) ?? (await get(key));
    fetched.set(key, response);
    if (/text\/html/.test(response.type) && response.status === 200) bodies.set(key, parsePage(response.body));
  });

  let checked = 0;
  for (const [key, from] of sources) {
    const [target, fragment] = [key.replace(/#.*/, ""), key.includes("#") ? decodeURIComponent(key.split("#")[1]) : ""];
    const response = fetched.get(target);
    const origin = [...from].slice(0, 3).join(", ") + (from.size > 3 ? ` +${from.size - 3} more` : "");
    checked++;
    if (response.status >= 500 && target === "/openapi.yaml") warn(target, `answered ${response.status} (needs the upstream API); linked from ${origin}`);
    else if (response.status >= 300 && response.status < 400) fail(target, `linked from ${origin} but redirects to ${response.location}`);
    else if (response.status !== 200) fail(target, `linked from ${origin} but answers ${response.status}`);
    else if (fragment && bodies.has(target) && !bodies.get(target).ids.has(fragment)) {
      fail(key, `linked from ${origin} but the page has no #${fragment}`);
    }
  }
  ok(`${checked} internal link targets answer 200 without redirecting`);
}

async function pool(items, size, work) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) await work(queue.shift());
    }),
  );
}

// ------------------------------------------------------------------- main --

console.log(`Checking ${base.origin} against canonical origin ${canonicalOrigin}\n`);
const sitemapUrls = await checkRobotsAndSitemap();
await checkStatusBehaviour(sitemapUrls);

await pool(sitemapUrls, 6, async (url) => {
  const response = await get(url);
  const page = parsePage(response.body);
  pages.set(url, { page, response });
  checkPage(url, response, page, sitemapUrls);
});
ok(`${pages.size} sitemap pages checked`);
checkUniqueness();

const image = [...pages.values()][0]?.page.content("og:image")[0];
if (image) {
  const response = await get(image);
  if (response.status !== 200 || !/image\//.test(response.type)) fail("og:image", `${image} answers ${response.status} ${response.type}`);
  else ok("og:image loads");
}
await checkLinks();

for (const message of passed) console.log(`PASS ${message}`);
for (const message of warnings) console.warn(`WARN ${message}`);
for (const message of failures) console.error(`FAIL ${message}`);
console.log(`\n${pages.size} pages, ${failures.length} failures, ${warnings.length} warnings.`);
process.exitCode = failures.length ? 1 : 0;
