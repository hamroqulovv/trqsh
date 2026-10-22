import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";

// Everything on this origin is public. The dashboard and API run on their own
// hosts, and pages that must stay out of results (/upgrade, installer scripts)
// are marked noindex rather than disallowed: a crawler has to fetch a page to
// see that.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
