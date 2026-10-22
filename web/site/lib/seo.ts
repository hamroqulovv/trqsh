// Search-engine helpers: canonical URLs, JSON-LD builders and snippet text.
//
// Per-page metadata stays in `app/layout.tsx` and each page's `metadata`. The
// root layout resolves `canonical` and `og:url` as "./" against every route, so
// a page only needs a title and description of its own.

import { site } from "./site";

export interface Crumb {
  name: string;
  path: string;
}

/**
 * Canonical absolute URL for a site path. The home page has no trailing slash
 * ("https://trqsh.uz"), the form Next prints in `<link rel="canonical">`, so the
 * sitemap and structured data match the tag exactly.
 */
export function absoluteUrl(path = "/"): string {
  const url = new URL(path, site.siteUrl);
  return url.pathname === "/" && !url.search ? url.origin : url.href;
}

/** Home > Documentation > guide, matching the visible docs breadcrumb. */
export function docsTrail(title: string, slug: string): Crumb[] {
  return [
    { name: "Home", path: "/" },
    { name: "Documentation", path: "/docs" },
    { name: title, path: `/docs/${slug}` },
  ];
}

export function breadcrumbList(trail: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/** Organization and WebSite for the home page, linked by @id in one block. */
export function siteGraph() {
  const home = absoluteUrl("/");
  const organization = `${home}/#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organization,
        name: site.structuredName,
        alternateName: site.name,
        url: home,
        logo: absoluteUrl("/trqsh-logo.png"),
        sameAs: [site.githubOrgUrl, site.npmUrl, site.pypiUrl],
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: site.supportEmail,
        },
      },
      {
        "@type": "WebSite",
        "@id": `${home}/#website`,
        url: home,
        name: site.structuredName,
        alternateName: [site.name, new URL(home).hostname],
        description: site.description,
        inLanguage: "en",
        publisher: { "@id": organization },
      },
    ],
  };
}

/**
 * Meta-description text: whole sentences that fit in `max` characters, or a cut
 * at a word boundary with an ellipsis when the first sentences are too short or
 * too long to be a useful description.
 */
export function snippet(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  let sentences = "";
  for (const sentence of clean.split(/(?<=[.!?])\s+/)) {
    const next = sentences ? `${sentences} ${sentence}` : sentence;
    if (next.length > max) break;
    sentences = next;
  }
  if (sentences.length >= 70) return sentences;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:.—-]+$/, "")}…`;
}
