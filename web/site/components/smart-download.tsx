"use client";

import * as React from "react";
import Link from "next/link";
import { Apple, ArrowRight, Download, Monitor, Terminal } from "lucide-react";
import {
  OS_DOWNLOADS,
  OS_LABEL,
  OS_ORDER,
  primaryCli,
  primaryDownload,
  desktopVersion,
  type Arch,
  type OSId,
} from "@/lib/downloads";
import { detectArch, detectOS } from "@/lib/detect";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";
import { buttonVariants } from "./ui/button";

const icons = { macos: Apple, windows: Monitor, linux: Terminal };

export function SmartDownload({
  variant = "card",
  className,
}: {
  variant?: "hero" | "card";
  className?: string;
}) {
  const [os, setOs] = React.useState<OSId>("macos");
  const [arch, setArch] = React.useState<Arch | null>(null);
  const [auto, setAuto] = React.useState(true);
  const [ready, setReady] = React.useState(false);
  const request = React.useRef(0);
  const archId = React.useId();

  React.useEffect(() => {
    const platform = detectOS();
    const current = ++request.current;
    setOs(platform);
    setReady(true);
    detectArch(platform).then((result) => {
      if (current === request.current) setArch(result);
    });
    return () => {
      request.current++;
    };
  }, []);

  const selectOS = (platform: OSId) => {
    const current = ++request.current;
    setOs(platform);
    setArch(null);
    setAuto(false);
    detectArch(platform).then((result) => {
      if (current === request.current) setArch(result);
    });
  };

  const primary = primaryDownload(os, arch);
  const isDesktop = OS_DOWNLOADS[os].desktop.some(
    (asset) => asset.href === primary.href,
  );
  const cli = primaryCli(os);
  const architecture =
    arch === "arm64"
      ? os === "macos"
        ? "Apple Silicon"
        : "ARM64"
      : arch === "amd64"
        ? os === "macos"
          ? "Intel"
          : "x64"
        : "";
  const Icon = icons[os];

  if (variant === "hero")
    return (
      <div className={cn("flex flex-wrap gap-3", className)}>
        <a href={primary.href} className={buttonVariants({ size: "xl" })}>
          <Download className="h-4 w-4" aria-hidden="true" /> Get trqsh for{" "}
          {OS_LABEL[os]}
        </a>
        <Link
          href="/download"
          className={buttonVariants({ variant: "outline", size: "xl" })}
        >
          All downloads <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-page",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface-2 px-5 py-4 sm:px-7">
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label="Operating system"
        >
          {OS_ORDER.map((platform) => {
            const OsIcon = icons[platform];
            return (
              <button
                key={platform}
                type="button"
                aria-pressed={os === platform}
                onClick={() => selectOS(platform)}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                  os === platform
                    ? "bg-page text-foreground shadow-sm"
                    : "text-muted hover:text-foreground",
                )}
              >
                <OsIcon className="h-4 w-4" aria-hidden="true" />
                {OS_LABEL[platform]}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor={archId} className="text-xs text-muted">
            Architecture
          </label>
          <select
            id={archId}
            value={arch ?? ""}
            onChange={(event) => {
              request.current++;
              setArch(event.target.value as Arch);
              setAuto(false);
            }}
            className="h-10 rounded-md border border-border bg-page px-3 text-xs"
          >
            {!arch && (
              <option value="" disabled>
                Detecting…
              </option>
            )}
            <option value="amd64">{os === "macos" ? "Intel" : "x64"}</option>
            <option value="arm64">
              {os === "macos" ? "Apple Silicon" : "ARM64"}
            </option>
          </select>
        </div>
      </div>
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-2 lg:gap-14">
        <div>
          <div className="mb-5 flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-base font-semibold">
                trqsh for {OS_LABEL[os]}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {ready
                  ? auto
                    ? "Suggested for your machine"
                    : "Your selected platform"
                  : "Choose your platform"}
                {architecture && ` · ${architecture}`}
              </p>
            </div>
          </div>
          <p className="mb-5 text-sm leading-relaxed text-secondary">
            {isDesktop
              ? "Manage your tunnels from a desktop workspace. Download the installer for your platform."
              : "Get the CLI binary for this architecture. Unpack it, add it to your PATH, and you’re ready to connect."}
          </p>
          <a
            href={primary.href}
            className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {isDesktop ? "Download desktop app" : "Download CLI archive"}
          </a>
          <p className="mt-3 text-xs text-muted">
            {isDesktop
              ? `Desktop v${desktopVersion} · unsigned preview`
              : `CLI v${site.version} · ${primary.kind ?? "archive"}`}
          </p>
          <p className="mt-1 text-xs text-muted">
            {primary.label}
            {primary.kind && isDesktop ? ` · .${primary.kind}` : ""}
          </p>
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-base font-semibold">Prefer the terminal?</p>
          <p className="mb-5 text-sm leading-relaxed text-secondary">
            Install the CLI with{" "}
            {cli.label === "Install script" ? "a single command" : cli.label},
            then run it from your usual shell.
          </p>
          <CodeBlock code={cli.command} label={cli.label} prompt />
          <Link
            href="/download#all-platforms"
            className="text-link mt-4 text-xs"
          >
            All downloads & package managers{" "}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
