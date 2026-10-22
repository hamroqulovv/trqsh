"use client";

import * as React from "react";
import Link from "next/link";
import { Apple, ArrowRight, ArrowUpRight, Download, Monitor, Terminal } from "lucide-react";
import { OS_DOWNLOADS, OS_LABEL, OS_ORDER, primaryCli, archiveFor, checksumsUrl, type Arch, type OSId } from "@/lib/downloads";
import { detectArch, detectOS } from "@/lib/detect";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";
import { buttonVariants } from "./ui/button";

const icons = { macos: Apple, windows: Monitor, linux: Terminal };

export function SmartDownload({ variant = "card", className }: { variant?: "hero" | "card"; className?: string }) {
  const [os, setOs] = React.useState<OSId>("macos");
  const [arch, setArch] = React.useState<Arch>("arm64");
  const [method, setMethod] = React.useState("Shell");
  const [suggested, setSuggested] = React.useState(false);
  const request = React.useRef(0);
  const archId = React.useId();

  React.useEffect(() => {
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (mobile) return;
    const platform = detectOS();
    const current = ++request.current;
    setOs(platform);
    setArch(platform === "macos" ? "arm64" : "amd64");
    setMethod(primaryCli(platform).label);
    setSuggested(true);
    detectArch(platform).then(result => {
      if (current === request.current) setArch(result);
    });
    return () => { request.current++; };
  }, []);

  const selectOS = (platform: OSId) => {
    request.current++;
    setOs(platform);
    // Changing the target platform must not reuse the host machine's CPU hint.
    setArch(platform === "macos" ? "arm64" : "amd64");
    setMethod(primaryCli(platform).label);
    setSuggested(false);
  };
  const platform = OS_DOWNLOADS[os];
  const install = platform.cli.find(snippet => snippet.label === method) ?? primaryCli(os);
  const archive = archiveFor(os, arch);

  if (variant === "hero") return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <Link href="/download" className={buttonVariants({ size: "xl" })}><Terminal size={16} aria-hidden="true" /> Get the CLI</Link>
      <Link href="/docs/quickstart" className={buttonVariants({ variant: "outline", size: "xl" })}>Quickstart <ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
  );

  return (
    <section id="install-cli" aria-label="CLI installer" className={cn("cli-installer", className)}>
      <div className="cli-platform-bar">
        <div role="group" aria-label="Operating system" className="flex flex-wrap gap-5 sm:gap-8">
          {OS_ORDER.map(id => {
            const Icon = icons[id];
            return <button type="button" key={id} aria-pressed={os === id} onClick={() => selectOS(id)} className={cn("cli-platform-button", os === id && "is-selected")}>
              <Icon size={16} aria-hidden="true" />{OS_LABEL[id]}
            </button>;
          })}
        </div>
        <span className="text-xs text-muted">{suggested ? "Suggested for your device" : "Choose your platform"}</span>
      </div>
      <div className="cli-install-grid">
        <div className="cli-install-intro">
          <p className="eyebrow">From your terminal</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">One command to get started.</h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-secondary">Choose an installer for {platform.name}, then paste the command into your terminal.</p>
          <p className="mt-5 text-xs leading-relaxed text-muted">Already installed? Check with <code className="text-foreground">trqsh --version</code>.</p>
        </div>
        <div className="min-w-0">
          <div className="cli-methods" role="group" aria-label="Installation method">
            {platform.cli.map(snippet => <button key={snippet.label} type="button" onClick={() => setMethod(snippet.label)} aria-pressed={install.label === snippet.label} className={cn("cli-method-button", install.label === snippet.label && "is-selected")}>
              {snippet.label}{snippet.recommended && <span className="text-[10px] text-muted">Recommended</span>}
            </button>)}
          </div>
          <CodeBlock code={install.command} label={os === "windows" ? "PowerShell" : "Terminal"} wrap compact />
          <p className="mt-3 text-xs leading-relaxed text-secondary">{install.requirement} {install.description}</p>
          {install.scriptUrl && <a href={install.scriptUrl} className="mt-3 inline-flex items-center gap-1 text-xs text-secondary underline underline-offset-4">Read the install script <ArrowUpRight size={12} aria-hidden="true" /></a>}
        </div>
      </div>
      <div className="cli-manual-download">
        <div>
          <h3 className="text-base font-semibold">Or download the binary.</h3>
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-secondary">No runtime needed. Extract the archive and add trqsh to your PATH.</p>
        </div>
        <div className="min-w-0">
          <label htmlFor={archId} className="mb-2 block text-xs text-muted">Processor architecture</label>
          <div className="cli-download-controls">
            <select id={archId} value={arch} onChange={event => { request.current++; setArch(event.target.value as Arch); }} className="h-11 min-w-0 flex-1 rounded-md border border-border bg-page px-3 text-sm">
              <option value="arm64">{os === "macos" ? "Apple Silicon · ARM64" : "ARM64"}</option>
              <option value="amd64">{os === "macos" ? "Intel · x64" : "Intel / AMD · x64"}</option>
            </select>
            <a href={archive.href} className={buttonVariants({ size: "lg" })} data-cli-download>
              <Download size={16} aria-hidden="true" /> Download for {platform.name}
            </a>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted">
            <span className="font-mono">v{site.version} · {archive.label} · .{archive.kind}</span>
            <a href={checksumsUrl} className="underline underline-offset-4">SHA-256 checksums</a>
            <Link href="/docs/installation#manual-archive" className="underline underline-offset-4">Manual setup guide</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
