import { Apple, ArrowUpRight, Download, Monitor, Terminal, ChevronDown } from "lucide-react";
import { OS_DOWNLOADS, OS_ORDER, checksumsUrl, releasesUrl } from "@/lib/downloads";
import { site } from "@/lib/site";

const icons = { macos: Apple, windows: Monitor, linux: Terminal };

export function DownloadSection() {
  return <div>
    <div className="grid gap-5 lg:grid-cols-3">
      {OS_ORDER.map(id => {
        const os = OS_DOWNLOADS[id];
        const Icon = icons[id];
        const archives = os.archives.filter(asset => asset.kind === "zip" || asset.kind === "tar.gz");
        const packages = os.archives.filter(asset => asset.kind === "deb" || asset.kind === "rpm");
        return <article key={id} className="cli-platform-card">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2"><Icon size={21} strokeWidth={1.5} aria-hidden="true" /></span>
            <div><h3 className="text-base font-semibold">{os.name}</h3><p className="mt-1 text-xs text-muted">{os.tagline}</p></div>
          </div>
          <ul className="space-y-2">
            {archives.map(asset => <li key={asset.href}><a href={asset.href} className="cli-asset-link">
              <span>{asset.label}<small>.{asset.kind}</small></span><Download size={15} aria-hidden="true" />
            </a></li>)}
          </ul>
          {packages.length > 0 && <details className="group mt-4 border-t border-border pt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-xs font-medium">Linux packages <ChevronDown size={14} className="group-open:rotate-180" aria-hidden="true" /></summary>
            <p className="my-2 text-xs leading-relaxed text-muted">For system package managers. Includes the CLI and the edge server binary.</p>
            <ul>{packages.map(asset => <li key={asset.href}><a href={asset.href} className="flex items-center justify-between gap-2 py-2 text-xs text-secondary hover:text-foreground"><span>{asset.label} · .{asset.kind}</span><Download size={13} aria-hidden="true" /></a></li>)}</ul>
          </details>}
        </article>;
      })}
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
      <p>Binary release v{site.version} · <a href={checksumsUrl} className="text-foreground underline underline-offset-4">Verify SHA-256 checksums</a></p>
      <a href={releasesUrl} className="inline-flex items-center gap-1.5 text-foreground">Release notes & previous versions <ArrowUpRight size={13} aria-hidden="true" /></a>
    </div>
  </div>;
}
