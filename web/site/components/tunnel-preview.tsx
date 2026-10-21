"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Globe,
  Laptop,
  Terminal,
} from "lucide-react";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { Tilt } from "./tilt";

const examples = {
  HTTP: {
    command: "trqsh http 3000",
    local: "localhost:3000",
    remote: `https://tidy-otter.${site.tunnelDomain}`,
    detail: "Web apps, APIs, and webhooks.",
    href: "/docs/http-tunnels",
    port: "3000",
  },
  TCP: {
    command: "trqsh tcp 22",
    local: "localhost:22",
    remote: `tcp://tcp.${site.tunnelDomain}:24187`,
    detail: "SSH, databases, and custom services.",
    href: "/docs/tcp-udp-tunnels",
    port: "22",
  },
  UDP: {
    command: "trqsh udp 51820",
    local: "localhost:51820",
    remote: `udp://udp.${site.tunnelDomain}:39912`,
    detail: "Datagram services. Available on paid plans.",
    href: "/docs/tcp-udp-tunnels#udp-tunnels",
    port: "51820",
  },
} as const;
type Protocol = keyof typeof examples;

function TunnelConnection({ port }: { port: string }) {
  return (
    <div className="connection-diagram relative px-4 pb-5 pt-6 sm:px-6">
      <svg
        className="connection-track"
        viewBox="0 0 360 48"
        fill="none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M 60 24 H 300" className="connection-line" />
        <path
          d="M 60 24 H 300"
          pathLength="100"
          className="connection-packet"
        />
      </svg>
      <div className="relative grid grid-cols-3 gap-2 text-center">
        <div className="flex min-w-0 flex-col items-center">
          <span className="connection-node">
            <Laptop className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="mt-3 text-[11px] font-medium">Your machine</p>
          <p className="mt-1 font-mono text-[9px] text-muted sm:text-[10px]">
            localhost:{port}
          </p>
        </div>
        <div className="flex min-w-0 flex-col items-center">
          <span className="connection-node connection-node-center">
            <Terminal className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="mt-3 text-[11px] font-medium">trqsh</p>
          <p className="mt-1 text-[10px] text-muted">Encrypted tunnel</p>
        </div>
        <div className="flex min-w-0 flex-col items-center">
          <span className="connection-node">
            <Globe className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="mt-3 text-[11px] font-medium">The internet</p>
          <p className="mt-1 text-[10px] text-muted">A public endpoint</p>
        </div>
      </div>
    </div>
  );
}

export function TunnelPreview() {
  const [protocol, setProtocol] = React.useState<Protocol>("HTTP");
  const example = examples[protocol];

  return (
    <div className="tunnel-preview min-w-0">
      <div className="tunnel-frame">
        <Tilt
          max={3}
          className="tunnel-card overflow-hidden rounded-2xl border border-border-strong bg-surface"
        >
          <div className="flex items-center gap-2 px-5 py-4 text-xs font-medium text-secondary">
            <Terminal className="h-4 w-4" aria-hidden="true" /> Command example
          </div>
          <div className="border-t border-border px-5 py-3">
            <div
              className="protocol-selector relative isolate grid grid-cols-3 rounded-lg border border-border bg-surface-2 p-1"
              style={
                {
                  "--protocol-index": Object.keys(examples).indexOf(protocol),
                } as React.CSSProperties
              }
              role="group"
              aria-label="Tunnel protocol"
            >
              <span className="protocol-indicator" aria-hidden="true" />
              {(Object.keys(examples) as Protocol[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setProtocol(item)}
                  aria-pressed={protocol === item}
                  className={cn(
                    "relative min-h-9 rounded-md px-5 text-xs font-medium transition-colors",
                    protocol === item
                      ? "text-foreground"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="product-terminal px-5 py-6 sm:px-6">
            <div className="mb-7 flex items-center gap-1.5" aria-hidden="true">
              <span className="h-2 w-2 rounded-full bg-white/30" />
              <span className="h-2 w-2 rounded-full bg-white/20" />
              <span className="h-2 w-2 rounded-full bg-white/10" />
              <span className="ml-2 font-mono text-[10px] text-muted">
                terminal
              </span>
            </div>
            <div className="flex min-h-8 items-center justify-between gap-2">
              <code className="min-w-0 text-[13px] sm:text-sm">
                <span className="mr-2 text-muted" aria-hidden="true">
                  $
                </span>
                <span key={protocol} className="terminal-command">
                  {example.command}
                </span>
                <span className="terminal-caret" aria-hidden="true">
                  ▍
                </span>
              </code>
              <CopyButton key={protocol} value={example.command} />
            </div>
            <div
              className="mt-7 space-y-2 font-mono text-xs leading-6 text-secondary"
              aria-live="polite"
              aria-atomic="true"
            >
              <div key={protocol} className="space-y-2">
                <p className="terminal-row flex flex-wrap items-center gap-x-2">
                  <span className="terminal-status-dot" aria-hidden="true" />
                  session online
                  <span className="text-muted">· transport quic</span>
                </p>
                <p className="terminal-row text-muted">
                  Forwarding to {example.local}
                </p>
                <p className="terminal-row terminal-url break-all rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-foreground sm:text-sm">
                  <ArrowRight
                    className="mr-2 inline h-3.5 w-3.5 text-muted"
                    aria-hidden="true"
                  />
                  {example.remote}
                </p>
              </div>
            </div>
          </div>
          <TunnelConnection port={example.port} />
        </Tilt>
      </div>
      <div className="mt-4 flex items-start justify-between gap-4 px-1 text-xs text-muted">
        <p>{example.detail}</p>
        <Link
          href={example.href}
          className="inline-flex shrink-0 items-center gap-1 text-secondary hover:text-foreground"
        >
          How it works <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
