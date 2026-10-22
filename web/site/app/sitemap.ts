import type { MetadataRoute } from "next";
import { changelogCheckedOn } from "@/lib/changelog";
import { docsNav } from "@/lib/docs-nav";
import { policyLinks, policyUpdatedOn } from "@/lib/policy-meta";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";

// Every public, indexable page, as its canonical URL. Left out on purpose:
// /upgrade (noindex) and the installer and OpenAPI downloads (not pages).
//
// `lastModified` is set only where the page shows its own date. A build-time
// stamp on every URL would say nothing about the content and teach crawlers to
// ignore the field.
const pages: { path: string; lastModified?: string }[] = [
  { path: "/" },
  { path: "/docs" },
  // Guides and references, straight from the docs navigation.
  ...docsNav.flatMap((group) => group.items).map((item) => ({ path: `/docs/${item.slug}` })),
  { path: "/download" },
  { path: "/pricing" },
  { path: "/changelog", lastModified: changelogCheckedOn },
  ...policyLinks.map((link) => ({ path: link.href, lastModified: policyUpdatedOn })),
];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map(({ path, lastModified }) => ({
    url: absoluteUrl(path),
    ...(lastModified && { lastModified }),
  }));
}
