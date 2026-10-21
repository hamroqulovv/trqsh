import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Command, GitBranch, Terminal } from "lucide-react";
import { AnimatedText } from "@/components/animated-text";
import { ChangelogList } from "@/components/changelog-list";
import { changelogCheckedOn, changelogEntries, formatReleaseDate, publishedReleases } from "@/lib/changelog";
import { ReleaseMarkdown } from "@/lib/release-markdown";
import "@/components/changelog.css";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Every published trqsh CLI and desktop release, with verified release notes, dates, fixes, and improvements.",
  alternates: { canonical: "/changelog" },
};

export default function ChangelogPage() {
  const cli = changelogEntries.find((entry) => entry.product === "cli" && !entry.prerelease)!;
  const desktop = changelogEntries.find((entry) => entry.product === "desktop" && !entry.prerelease);
  return (
    <div className="shell changelog-page">
      <header className="changelog-hero">
        <div>
          <p className="eyebrow flex items-center gap-2"><GitBranch className="h-3.5 w-3.5" aria-hidden="true" /> The changelog</p>
          <h1 className="changelog-heading"><AnimatedText text="Good things" delay={70} /><br /><span className="text-muted"><AnimatedText text="keep shipping." delay={200} /></span></h1>
          <p className="changelog-intro">New capabilities. Thoughtful refinements. Fewer rough edges.<br className="hidden sm:block" /> Every published release, with the details that matter.</p>
          <a href="#releases" className="text-link mt-7">Explore the updates <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /></a>
        </div>
        <div className="release-visual" aria-hidden="true">
          <div className="release-visual-grid" />
          <div className="release-orbit release-orbit-one" /><div className="release-orbit release-orbit-two" />
          <div className="release-visual-core"><Terminal className="h-7 w-7" /><span className="mt-3 font-mono text-sm">v{cli.version}</span></div>
          <div className="release-visual-label"><span className="release-status-dot" /> Latest CLI release<span className="ml-auto font-mono">{formatReleaseDate(cli.publishedAt)}</span></div>
          <div className="release-visual-caption font-mono"><span>git log --oneline</span><span>always forward ↗</span></div>
        </div>
      </header>
      <div className="changelog-stats">
        <div><GitBranch className="h-4 w-4" aria-hidden="true" /><span><strong>{changelogEntries.length}</strong> published releases</span></div>
        <a href={`#${cli.id}`}><Terminal className="h-4 w-4" aria-hidden="true" /><span>Latest CLI <strong className="font-mono">v{cli.version}</strong></span><ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></a>
        {desktop && <a href={`#${desktop.id}`}><Command className="h-4 w-4" aria-hidden="true" /><span>Desktop preview <strong className="font-mono">v{desktop.version}</strong></span><ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></a>}
      </div>
      <ChangelogList entries={changelogEntries}>
        {publishedReleases.map((release) => <ReleaseMarkdown key={release.id} body={release.body || "No release notes were published for this version."} />)}
      </ChangelogList>
      <div className="changelog-provenance">
        <p>Release dates and full notes come from the official CLI and source repositories. Historical notes describe the software at that release; use the <Link href="/docs">current docs</Link> for today’s setup.</p>
        <p>History checked <time dateTime={changelogCheckedOn}>{formatReleaseDate(changelogCheckedOn)}</time>. <a href="https://github.com/trqsh-tunnel/trqshcli/releases" target="_blank" rel="noopener noreferrer">CLI releases ↗</a> · <a href="https://github.com/trqsh-tunnel/trqsh/releases" target="_blank" rel="noopener noreferrer">Desktop &amp; earlier releases ↗</a></p>
      </div>
    </div>
  );
}
