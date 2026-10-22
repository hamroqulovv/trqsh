import { Fragment } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { JsonLd } from "./json-ld";
import { docEntry } from "@/lib/docs-nav";
import { breadcrumbList, docsTrail } from "@/lib/seo";

/** The visible breadcrumb of a documentation page, with matching BreadcrumbList data. */
export function DocsBreadcrumb({ slug }: { slug: string }) {
  const entry = docEntry(slug);
  if (!entry) return null;
  const trail = docsTrail(entry.title, slug);
  return (
    <>
      <nav aria-label="Breadcrumb" className="docs-breadcrumb">
        {trail.slice(0, -1).map((crumb) => (
          <Fragment key={crumb.path}>
            <Link href={crumb.path} className="hover:text-foreground">
              {crumb.name}
            </Link>
            <ChevronRight size={13} aria-hidden="true" />
          </Fragment>
        ))}
        <span aria-current="page">{entry.title}</span>
      </nav>
      <JsonLd data={breadcrumbList(trail)} />
    </>
  );
}
