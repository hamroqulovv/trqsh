"use client";

import * as React from "react";
import {
  Apple,
  ArrowUpRight,
  Download,
  Monitor,
  Plus,
  Terminal,
} from "lucide-react";
import {
  OS_DOWNLOADS,
  OS_ORDER,
  checksumsUrl,
  releasesUrl,
  desktopVersion,
  type OSId,
} from "@/lib/downloads";
import { detectOS } from "@/lib/detect";
import { site } from "@/lib/site";
import { CodeBlock } from "./code-block";
import { buttonVariants } from "./ui/button";
import { cn } from "@/lib/utils";

const icons = { macos: Apple, windows: Monitor, linux: Terminal };

export function DownloadSection() {
  const [detected, setDetected] = React.useState<OSId | null>(null);
  React.useEffect(() => setDetected(detectOS()), []);

  return (
    <div>
      <div className="grid gap-5 lg:grid-cols-3">
        {OS_ORDER.map((platform) => {
          const os = OS_DOWNLOADS[platform];
          const Icon = icons[platform];
          const recommended =
            os.cli.find((snippet) => snippet.recommended) ?? os.cli[0];
          const other = os.cli.filter((snippet) => snippet !== recommended);
          return (
            <article
              key={platform}
              className="min-w-0 rounded-xl border border-border p-6"
            >
              <div className="mb-6 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <h3 className="text-lg font-semibold tracking-tight">
                    {os.name}
                  </h3>
                </div>
                <span
                  className={cn(
                    "rounded-full bg-accent px-2 py-1 text-[10px] text-secondary",
                    detected !== platform && "invisible",
                  )}
                >
                  Your platform
                </span>
              </div>
              <p className="eyebrow mb-3 tracking-[0.1em]">Desktop app</p>
              <div className="space-y-2">
                {os.desktop.map((asset, index) => (
                  <a
                    key={asset.href}
                    href={asset.href}
                    className={cn(
                      buttonVariants({
                        variant: index === 0 ? "default" : "outline",
                      }),
                      "w-full justify-between text-xs",
                    )}
                  >
                    <span>{asset.label}</span>
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Desktop v{desktopVersion} · unsigned preview
              </p>
              <div className="mt-7 border-t border-border pt-6">
                <p className="eyebrow mb-3 tracking-[0.1em]">Command line</p>
                <CodeBlock
                  code={recommended.command}
                  label={recommended.label}
                  prompt
                />
                <details className="group mt-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-xs font-medium text-secondary">
                    More install options{" "}
                    <Plus
                      className="h-3.5 w-3.5 transition-transform group-open:rotate-45"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="mt-2 space-y-3">
                    {other.map((snippet) => (
                      <CodeBlock
                        key={snippet.label}
                        code={snippet.command}
                        label={snippet.label}
                        prompt
                      />
                    ))}
                  </div>
                </details>
              </div>
              <div className="mt-5 border-t border-border pt-5">
                <p className="mb-3 text-xs font-medium text-secondary">
                  CLI archives & packages
                </p>
                <ul className="space-y-2">
                  {os.archives.map((asset) => (
                    <li key={asset.href}>
                      <a
                        href={asset.href}
                        className="flex items-center justify-between gap-2 rounded py-1.5 text-xs text-secondary hover:text-foreground"
                      >
                        <span>
                          {asset.label}{" "}
                          <span className="text-muted">.{asset.kind}</span>
                        </span>
                        <ArrowUpRight
                          className="h-3.5 w-3.5 shrink-0"
                          aria-hidden="true"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-muted">
        <p>
          CLI v{site.version} ·{" "}
          <a
            href={checksumsUrl}
            className="text-foreground underline underline-offset-4"
          >
            Release checksums
          </a>
        </p>
        <a href={releasesUrl} className="text-link text-xs">
          All releases{" "}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
