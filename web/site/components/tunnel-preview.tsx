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

export function TunnelPreview() {
  const [protocol, setProtocol] = React.useState<Protocol>("HTTP");
  const example = examples[protocol];

  return (
    <div className="min-w-0">
      <div className="overflow-hidden rounded-xl border border-border bg-page shadow-[0_18px_60px_-25px_rgb(0_0_0/0.16)]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-2 text-xs font-medium text-secondary">
            <Terminal className="h-4 w-4" aria-hidden="true" /> Your next tunnel
          </div>
          <span className="rounded border border-border px-2 py-1 font-mono text-[10px] text-muted">
            INTERACTIVE EXAMPLE
          </span>
        </div>
        <div className="border-t border-border px-5 py-3">
          <div
            className="inline-flex gap-1 rounded-lg bg-surface-2 p-1"
            role="group"
            aria-label="Tunnel protocol"
          >
            {(Object.keys(examples) as Protocol[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setProtocol(item)}
                aria-pressed={protocol === item}
                className={cn(
                  "min-h-9 rounded-md px-5 text-xs font-medium transition-colors",
                  protocol === item
                    ? "bg-page text-foreground shadow-sm"
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
          <div className="flex items-center justify-between gap-2">
            <code className="text-[13px] sm:text-sm">
              <span className="mr-2 text-muted" aria-hidden="true">
                $
              </span>
              {example.command}
            </code>
            <CopyButton key={protocol} value={example.command} />
          </div>
          <div
            className="mt-7 space-y-2 font-mono text-xs leading-6 text-secondary"
            aria-live="polite"
            aria-atomic="true"
          >
            <p>
              <span className="mr-2 text-foreground" aria-hidden="true">
                ●
              </span>
              session online{" "}
              <span className="ml-2 text-muted">transport quic</span>
            </p>
            <p className="text-muted">Forwarding to {example.local}</p>
            <p className="break-all text-sm text-foreground">
              {example.remote}
            </p>
          </div>
          <div className="mt-7 border-t border-border pt-3 font-mono text-[10px] text-muted">
            Sample output · run the command to create your own URL
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-5">
          <div className="flex items-center gap-2.5">
            <Laptop
              className="h-4 w-4 shrink-0 text-secondary"
              aria-hidden="true"
            />
            <div>
              <p className="text-xs font-medium">Your machine</p>
              <p className="mt-0.5 font-mono text-[10px] text-muted">
                localhost:{example.port}
              </p>
            </div>
          </div>
          <div className="flex items-center text-muted" aria-hidden="true">
            <span className="h-px w-5 bg-border" />
            <ArrowRight className="h-3.5 w-3.5" />
            <span className="h-px w-5 bg-border" />
          </div>
          <div className="flex items-center justify-end gap-2.5">
            <Globe
              className="h-4 w-4 shrink-0 text-secondary"
              aria-hidden="true"
            />
            <div>
              <p className="text-xs font-medium">The internet</p>
              <p className="mt-0.5 text-[10px] text-muted">A public endpoint</p>
            </div>
          </div>
        </div>
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
