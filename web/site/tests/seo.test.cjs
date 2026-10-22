const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const { createLoader, root } = require("./load-ts.cjs");

// These tests run the site's real modules (lib/, app/sitemap.ts, app/robots.ts,
// next.config.mjs) and compare them with the files on disk. `pnpm check:seo`
// covers the other half: the HTML a running server actually returns.

const load = createLoader();
const { primaryNav, footerNav, footerLegalNav, site } = load("lib/site.ts");
const seo = load("lib/seo.ts");
const nav = load("lib/docs-nav.ts");
const docs = load("lib/docs.ts");
const docsDir = path.join(root, "..", "..", "docs", "content");

const origin = "https://trqsh.uz";
const guides = nav.docsNav.flatMap((group) => group.items);

/** Every page.tsx under app/, as a URL path (route groups removed). */
function pageRoutes() {
  const routes = [];
  (function walk(dir, segments) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const grouped = /^\(.*\)$/.test(entry.name);
        walk(path.join(dir, entry.name), grouped ? segments : [...segments, entry.name]);
      } else if (entry.name === "page.tsx") {
        routes.push(`/${segments.join("/")}`);
      }
    }
  })(path.join(root, "app"), []);
  return routes;
}
const routes = pageRoutes();

/** True when a URL path is served by a page (or a file the site hosts). */
function routeExists(href) {
  const pathname = href.split(/[?#]/)[0];
  if (["/install", "/install.sh", "/install.ps1", "/openapi.yaml"].includes(pathname)) return true;
  if (routes.includes(pathname)) return true;
  // /docs/[slug] serves only the guides that have a Markdown file.
  const guide = pathname.match(/^\/docs\/([^/]+)$/);
  return Boolean(guide && nav.mdSlugs.includes(guide[1]));
}

test("canonical URLs use the production origin, with the home page bare", () => {
  assert.equal(seo.absoluteUrl("/"), origin);
  assert.equal(seo.absoluteUrl(), origin);
  assert.equal(seo.absoluteUrl("/docs/quickstart"), `${origin}/docs/quickstart`);

  const staging = createLoader({ TRQSH_SITE_URL: "https://staging.example.test/" })("lib/seo.ts");
  assert.equal(staging.absoluteUrl("/docs"), "https://staging.example.test/docs");
  assert.equal(staging.absoluteUrl("/"), "https://staging.example.test");
});

test("home-page structured data describes one organization and one website", () => {
  const data = seo.siteGraph();
  assert.equal(data["@context"], "https://schema.org");
  assert.deepEqual(data["@graph"].map((node) => node["@type"]), ["Organization", "WebSite"]);

  const [organization, website] = data["@graph"];
  assert.equal(organization.name, "TRQSH");
  assert.equal(website.name, "TRQSH");
  assert.equal(organization.url, origin);
  assert.equal(website.url, origin);
  assert.deepEqual(website.alternateName, ["trqsh", "trqsh.uz"]);
  assert.deepEqual(website.publisher, { "@id": organization["@id"] });
  assert.notEqual(organization["@id"], website["@id"]);
  assert.equal(organization.contactPoint.email, site.supportEmail);

  assert.equal(organization.logo, `${origin}/trqsh-logo.png`);
  assert.ok(fs.existsSync(path.join(root, "public", "trqsh-logo.png")), "the logo file exists");
  assert.ok(organization.sameAs.length > 0);
  for (const url of organization.sameAs) assert.match(url, /^https:\/\//);

  assert.ok(!JSON.stringify(data).includes("SearchAction"), "the site has no search to describe");
  assert.deepEqual(JSON.parse(JSON.stringify(data)), data, "the data survives JSON round-tripping");
});

test("breadcrumbs run Home > Documentation > guide with sequential positions", () => {
  const list = seo.breadcrumbList(seo.docsTrail("Quickstart", "quickstart"));
  assert.equal(list["@type"], "BreadcrumbList");
  assert.deepEqual(list.itemListElement.map((item) => item.position), [1, 2, 3]);
  assert.deepEqual(list.itemListElement.map((item) => item.name), ["Home", "Documentation", "Quickstart"]);
  assert.deepEqual(list.itemListElement.map((item) => item.item), [
    origin,
    `${origin}/docs`,
    `${origin}/docs/quickstart`,
  ]);
});

test("snippet keeps short text, prefers whole sentences and never cuts mid-word", () => {
  assert.equal(seo.snippet("  Short   text. "), "Short text.");

  const first = "Create a public HTTPS URL for a service running on your computer.";
  const second = "Your app keeps running locally; trqsh forwards traffic from the edge to its local port.";
  const third = "Extra detail that would push the description beyond the limit that search results show.";
  assert.equal(seo.snippet(`${first} ${second} ${third}`), `${first} ${second}`);

  const lead =
    "Understand the boundaries before exposing a local service. trqsh provides tunnel transport and access controls; your application remains responsible for its own authorization and data handling.";
  const cut = seo.snippet(lead);
  assert.ok(cut.length <= 160, `${cut.length} characters`);
  assert.ok(cut.endsWith("…"));
  const prefix = cut.slice(0, -1);
  assert.ok(lead.startsWith(prefix));
  assert.match(lead.slice(prefix.length), /^[\s,;:.]/, "stops at a word boundary");

  assert.ok(seo.snippet(`Version 0.2.8 is out. ${"word ".repeat(40)}`).startsWith("Version 0.2.8 is out."));
});

test("every guide gets a distinct description built from its opening paragraph", () => {
  const seen = new Map();
  for (const slug of nav.mdSlugs) {
    const rendered = docs.loadDoc(slug);
    assert.ok(rendered, `docs/content/${slug}.md renders`);
    const description = docs.docDescription(rendered.html);
    assert.ok(description.length >= 50 && description.length <= 160, `${slug}: ${description.length} characters`);
    assert.doesNotMatch(description, /[<>]|&(?:amp|lt|gt|quot|#39);/, `${slug} leaks markup`);
    assert.ok(!seen.has(description), `${slug} repeats the description of ${seen.get(description)}`);
    seen.set(description, slug);
  }
  assert.equal(docs.docDescription("<h2>No lead</h2>", "fallback"), "fallback");
});

test("the docs navigation and the Markdown files agree", () => {
  const slugs = guides.map((guide) => guide.slug);
  assert.equal(new Set(slugs).size, slugs.length, "slugs are unique");
  assert.equal(new Set(guides.map((guide) => guide.title)).size, guides.length, "titles are unique");

  for (const guide of guides) {
    const page =
      guide.type === "md"
        ? path.join(docsDir, `${guide.slug}.md`)
        : path.join(root, "app", "docs", guide.slug, "page.tsx");
    assert.ok(fs.existsSync(page), `${guide.slug} has no page at ${path.relative(root, page)}`);
  }

  const unlisted = fs
    .readdirSync(docsDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.slice(0, -3))
    .filter((slug) => !slugs.includes(slug));
  assert.deepEqual(unlisted, [], "guides missing from lib/docs-nav.ts have no route, link or sitemap entry");
});

test("internal links in the guides point at real pages and anchors", () => {
  const errors = load("lib/errors.ts");
  const errorAnchors = new Set(errors.ERRORS.map((error) => errors.errorAnchor(error.code)));
  for (const file of fs.readdirSync(docsDir).filter((name) => name.endsWith(".md"))) {
    const text = fs.readFileSync(path.join(docsDir, file), "utf8");
    for (const [, target] of text.matchAll(/\]\((\/[^)\s]*)\)/g)) {
      const [pathname, fragment] = target.split("#");
      assert.ok(routeExists(pathname), `${file} links to ${target}, which is not a page`);
      if (!fragment) continue;
      if (pathname === "/docs/errors") {
        assert.ok(errorAnchors.has(fragment), `${file} links to a missing error anchor: ${target}`);
      } else {
        const rendered = docs.loadDoc(pathname.split("/").pop());
        assert.ok(rendered?.toc.some((item) => item.id === fragment), `${file} links to a missing anchor: ${target}`);
      }
    }
  }
});

test("the sitemap lists each public page once, as its canonical URL", () => {
  const urls = load("app/sitemap.ts").default().map((entry) => entry.url);
  assert.equal(new Set(urls).size, urls.length, "no duplicates");
  assert.equal(urls[0], origin, "the home page leads");

  for (const url of urls) {
    const parsed = new URL(url);
    assert.equal(parsed.origin, origin, url);
    assert.equal(parsed.search + parsed.hash, "", url);
    assert.ok(parsed.pathname === "/" || !parsed.pathname.endsWith("/"), `${url} has a trailing slash`);
    assert.ok(routeExists(parsed.pathname), `${url} is not served by any page`);
  }
  for (const page of [
    "/docs", "/docs/quickstart", "/docs/installation", "/docs/api", "/docs/errors",
    "/download", "/pricing", "/changelog", "/privacy", "/terms", "/cookies", "/acceptable-use",
  ]) {
    assert.ok(urls.includes(`${origin}${page}`), `${page} is missing`);
  }
  for (const guide of guides) assert.ok(urls.includes(`${origin}/docs/${guide.slug}`), guide.slug);
});

test("every page is in the sitemap or deliberately noindex", () => {
  const listed = new Set(load("app/sitemap.ts").default().map((entry) => new URL(entry.url).pathname));
  const noindex = ["/upgrade"];
  for (const route of routes.filter((route) => !route.includes("["))) {
    assert.ok(listed.has(route) || noindex.includes(route), `${route} is neither in the sitemap nor noindex`);
  }
  for (const route of noindex) {
    assert.ok(!listed.has(route), `${route} is noindex and must stay out of the sitemap`);
    const source = fs.readFileSync(path.join(root, "app", "(marketing)", route.slice(1), "page.tsx"), "utf8");
    assert.match(source, /robots:\s*\{\s*index:\s*false/, `${route} lost its noindex`);
  }
});

test("lastmod appears only where the page shows its own date", () => {
  const entries = load("app/sitemap.ts").default();
  const dated = entries.filter((entry) => entry.lastModified).map((entry) => new URL(entry.url).pathname);
  assert.deepEqual(dated.sort(), ["/acceptable-use", "/changelog", "/cookies", "/privacy", "/terms"]);
  for (const entry of entries) {
    assert.ok(!("changeFrequency" in entry) && !("priority" in entry), `${entry.url} carries a guessed hint`);
    if (entry.lastModified) assert.match(entry.lastModified, /^\d{4}-\d{2}-\d{2}$/, entry.url);
  }
});

test("robots.txt allows the public site and names the sitemap", () => {
  const robots = load("app/robots.ts").default();
  assert.equal(robots.sitemap, `${origin}/sitemap.xml`);
  for (const rule of [].concat(robots.rules)) {
    assert.equal(rule.userAgent, "*");
    assert.ok([].concat(rule.allow).includes("/"));
    assert.equal(rule.disallow, undefined, "nothing on this origin is private");
  }
});

test("header and footer link only to pages that exist, and reach the key guides", () => {
  const internal = [
    ...primaryNav,
    ...footerLegalNav,
    ...footerNav.flatMap((group) =>
      group.links.filter((link) => !link.external && !link.href.startsWith("mailto:")),
    ),
  ];
  for (const link of internal) assert.ok(routeExists(link.href), `${link.label} links to ${link.href}`);

  assert.deepEqual(primaryNav.map((link) => link.href), ["/docs", "/download", "/pricing"]);
  const docsLinks = footerNav.find((group) => group.title === "Docs").links.map((link) => link.href);
  for (const href of ["/docs/quickstart", "/docs/installation", "/docs/cli-reference", "/docs/api"]) {
    assert.ok(docsLinks.includes(href), `the footer should link ${href}`);
  }
});

/** next.config.mjs reads TRQSH_SITE_URL when imported, so each case gets a fresh copy. */
async function nextConfig(siteUrl, tag) {
  const previous = process.env.TRQSH_SITE_URL;
  process.env.TRQSH_SITE_URL = siteUrl;
  try {
    const url = `${pathToFileURL(path.join(root, "next.config.mjs")).href}?${tag}`;
    return (await import(url)).default;
  } finally {
    if (previous === undefined) delete process.env.TRQSH_SITE_URL;
    else process.env.TRQSH_SITE_URL = previous;
  }
}

test("the www host redirects to the canonical origin", async () => {
  const config = await nextConfig(origin, "production");
  assert.deepEqual(await config.redirects(), [
    {
      source: "/:path*",
      has: [{ type: "host", value: "www.trqsh.uz" }],
      destination: `${origin}/:path*`,
      permanent: true,
    },
  ]);
  assert.deepEqual(await (await nextConfig("http://localhost:3002", "local")).redirects(), []);
  assert.deepEqual(await (await nextConfig("http://127.0.0.1:3002", "loopback")).redirects(), []);
  assert.deepEqual(await (await nextConfig("https://www.trqsh.uz", "www")).redirects(), []);
});

test("files that are not pages are served with noindex", async () => {
  const headers = await (await nextConfig(origin, "headers")).headers();
  const forSource = (source) => headers.find((rule) => rule.source === source)?.headers ?? [];
  for (const source of ["/install", "/install.sh", "/install.ps1", "/openapi.yaml", "/upgrade"]) {
    assert.ok(
      forSource(source).some((header) => header.key === "X-Robots-Tag" && header.value.startsWith("noindex")),
      `${source} needs X-Robots-Tag: noindex`,
    );
  }
  assert.ok(
    forSource("/install.sh").some((header) => header.key === "Content-Type" && header.value.startsWith("text/plain")),
    "installers stay readable text",
  );
});
