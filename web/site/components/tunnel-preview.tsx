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
import { SpotlightGroup } from "./spotlight";
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

const URL_GLYPHS = "abcdefghijklmnopqrstuvwxyz0123456789";

const wait = (ms: number, timers: number[]) =>
  new Promise<void>((resolve) => {
    timers.push(window.setTimeout(resolve, ms));
  });

// Plays one terminal session: the command is typed with a human cadence, the
// output rows rise in, and the public URL decodes from noise. The server
// render (and reduced motion) shows the finished session. The first session
// waits until the terminal scrolls into view; later ones start on click.
function useTerminalPlayback(
  command: string,
  remote: string,
  ref: React.RefObject<HTMLElement | null>,
  waitForView: boolean,
) {
  const [typed, setTyped] = React.useState(command.length);
  const [stage, setStage] = React.useState<"typing" | "done">("done");
  const [url, setUrl] = React.useState<string | null>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    const timers: number[] = [];
    let frame = 0;
    let io: IntersectionObserver | undefined;
    setTyped(0);
    setStage("typing");

    const inView = new Promise<void>((resolve) => {
      if (!waitForView || !("IntersectionObserver" in window)) return resolve();
      io = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            io?.disconnect();
            resolve();
          }
        },
        { threshold: 0.4 },
      );
      io.observe(el);
    });

    const decode = () =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        const tick = (now: number) => {
          if (cancelled) return resolve();
          const progress = Math.min((now - start) / 750, 1);
          const locked = Math.floor(progress * remote.length);
          setUrl(
            Array.from(remote, (char, index) =>
              index < locked || !/[a-z0-9]/i.test(char)
                ? char
                : URL_GLYPHS[Math.floor(Math.random() * URL_GLYPHS.length)],
            ).join(""),
          );
          if (progress < 1) frame = requestAnimationFrame(tick);
          else {
            setUrl(null);
            resolve();
          }
        };
        frame = requestAnimationFrame(tick);
      });

    (async () => {
      await inView;
      await wait(waitForView ? 450 : 120, timers);
      for (let i = 1; i <= command.length; i++) {
        if (cancelled) return;
        // Spaces land a beat slower, like a person pausing between words.
        const pause = command[i - 1] === " " ? 110 : 34 + Math.random() * 46;
        await wait(pause, timers);
        if (cancelled) return;
        setTyped(i);
      }
      await wait(240, timers);
      if (cancelled) return;
      setStage("done");
      await wait(380, timers);
      if (cancelled) return;
      await decode();
    })();

    return () => {
      cancelled = true;
      io?.disconnect();
      cancelAnimationFrame(frame);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [command, remote, ref, waitForView]);

  return { typed, stage, url };
}

function TerminalSession({
  example,
  waitForView,
}: {
  example: (typeof examples)[Protocol];
  waitForView: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { typed, stage, url } = useTerminalPlayback(
    example.command,
    example.remote,
    ref,
    waitForView,
  );

  return (
    <div ref={ref} className="terminal-session" data-stage={stage}>
      <div className="flex min-h-8 items-center justify-between gap-2">
        <code className="min-w-0 text-[13px] sm:text-sm">
          <span className="mr-2 text-muted" aria-hidden="true">
            $
          </span>
          <span className="sr-only">{example.command}</span>
          <span className="terminal-command" aria-hidden="true">
            {example.command.slice(0, typed)}
          </span>
          <span className="terminal-caret" aria-hidden="true">
            ▍
          </span>
        </code>
        <CopyButton value={example.command} />
      </div>
      <div
        className="mt-7 space-y-2 font-mono text-xs leading-6 text-secondary"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="space-y-2">
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
            {url === null ? (
              example.remote
            ) : (
              <>
                <span className="sr-only">{example.remote}</span>
                <span aria-hidden="true">{url}</span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

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
        <path
          d="M 60 24 H 300"
          pathLength="100"
          className="connection-line"
        />
        <path
          d="M 60 24 H 300"
          pathLength="100"
          className="connection-packet"
        />
        <path
          d="M 300 24 H 60"
          pathLength="100"
          className="connection-packet connection-packet-back"
        />
      </svg>
      <div className="relative grid grid-cols-3 gap-2 text-center">
        <div className="flex min-w-0 flex-col items-center">
          <span className="connection-node connection-node-local">
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
          <span className="connection-node connection-node-remote">
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
  const [interacted, setInteracted] = React.useState(false);
  const example = examples[protocol];

  return (
    <div className="tunnel-preview min-w-0">
      <SpotlightGroup className="tunnel-frame">
        <Tilt
          max={3}
          className="tunnel-card spotlight overflow-hidden rounded-md border border-border bg-surface"
        >
          <span className="spotlight-fill" aria-hidden="true" />
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
                  onClick={() => {
                    setInteracted(true);
                    setProtocol(item);
                  }}
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
            <TerminalSession
              key={protocol}
              example={example}
              waitForView={!interacted}
            />
          </div>
          <TunnelConnection port={example.port} />
        </Tilt>
      </SpotlightGroup>
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
