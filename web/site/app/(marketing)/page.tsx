import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Code2,
  Download,
  Globe2,
  Layers3,
  Monitor,
  Radio,
  ShieldCheck,
  Terminal,
  Webhook,
} from "lucide-react";
import { TunnelPreview } from "@/components/tunnel-preview";
import { HeroBackground } from "@/components/hero-background";
import { HeroHeadline } from "@/components/hero-headline";
import { HeroMotion } from "@/components/hero-motion";
import { FeatureVignette } from "@/components/feature-vignettes";
import { Magnetic } from "@/components/magnetic";
import { Reveal } from "@/components/reveal";
import { ScrambleText } from "@/components/scramble-text";
import { SpotlightGroup } from "@/components/spotlight";
import { Tilt } from "@/components/tilt";
import { CodeBlock } from "@/components/code-block";
import { buttonVariants } from "@/components/ui/button";
import { planByCode } from "@/lib/plans";
import { formatBytes } from "@/lib/format";
import { signupUrl, site } from "@/lib/site";
import { cn } from "@/lib/utils";
import "@/components/home.css";

const capabilities = [
  {
    icon: Globe2,
    scene: "share",
    title: "Share what you’re building.",
    description:
      "Give your local app a public HTTPS URL. Send a preview to a teammate, test on your phone, or demo your work.",
    href: "/docs/http-tunnels",
    link: "HTTP tunnels",
  },
  {
    icon: Webhook,
    scene: "webhooks",
    title: "Bring webhooks to your desk.",
    description:
      "Receive events on localhost, inspect headers and payloads, and replay requests while you debug.",
    href: "/docs/inspector",
    link: "Request inspector",
  },
  {
    icon: Radio,
    scene: "protocols",
    title: "Go beyond the browser.",
    description:
      "Connect SSH and databases with TCP. Use UDP and TLS tunnels on paid plans for the services your workflow needs.",
    href: "/docs/tcp-udp-tunnels",
    link: "TCP, UDP & TLS",
  },
] as const;

const steps = [
  {
    number: "01",
    title: "Install your way.",
    description:
      "Install the CLI with your package manager or download a native binary.",
    command: "npm install -g @trqsh-uz/trqsh --foreground-scripts",
    label: "Install the CLI",
    href: "/download",
  },
  {
    number: "02",
    title: "Connect your account.",
    description:
      "Sign in through your browser. Your free plan is ready when you are.",
    command: "trqsh login",
    label: "Sign in",
    href: "/docs/authentication",
  },
  {
    number: "03",
    title: "Make localhost public.",
    description:
      "Point trqsh at a running local service and share the URL it gives you.",
    command: "trqsh http 3000",
    label: "Start a tunnel",
    href: "/docs/quickstart",
  },
];

// Headings rise line by line from their own masks (see .mask-line).
function MaskLines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <span key={line} className="mask-line">
          <span
            className="mask-line-inner"
            style={{ "--line": index } as CSSProperties}
          >
            {line}
          </span>
        </span>
      ))}
    </>
  );
}

function Eyebrow({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cn("eyebrow", className)}>
      <ScrambleText text={text} />
    </p>
  );
}

export default function HomePage() {
  const free = planByCode("free")!;
  return (
    <>
      <section className="hero-section">
        <HeroBackground />
        <HeroMotion />
        <div className="shell relative grid items-center gap-12 pb-16 pt-16 sm:pb-20 sm:pt-20 lg:grid-cols-[1.04fr_1fr] lg:gap-14 lg:pb-24 lg:pt-24">
          <div className="hero-copy min-w-0">
            <Link href="/changelog" className="hero-badge hero-enter">
              <span className="hero-badge-tag">Latest</span>
              CLI v{site.version} release notes
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
            <HeroHeadline />
            <p className="hero-enter hero-enter-description mt-7 max-w-md text-base leading-relaxed text-secondary sm:text-lg">
              Share your work, receive webhooks, and connect your services. One
              command brings your local environment to the internet.
            </p>
            <div className="hero-enter hero-enter-actions mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Magnetic className="w-full sm:w-auto">
                <Link
                  href="/download"
                  className={cn(buttonVariants({ size: "xl" }), "w-full sm:w-auto")}
                >
                  <Download className="h-4 w-4" aria-hidden="true" /> Get trqsh
                </Link>
              </Magnetic>
              <Magnetic strength={0.2} className="w-full sm:w-auto">
                <Link
                  href="/docs/quickstart"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "xl" }),
                    "w-full sm:w-auto",
                  )}
                >
                  Read the quickstart{" "}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Magnetic>
            </div>
            <p className="hero-enter hero-enter-note mt-5 flex items-center gap-2 text-xs text-muted">
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Free to
              start. No credit card required.
            </p>
          </div>
          <div
            className="hero-portal min-h-[340px] sm:min-h-[380px]"
            aria-hidden="true"
          />
        </div>
      </section>

      <div className="platform-strip border-y border-border">
        <div className="shell grid gap-6 py-7 sm:grid-cols-3 sm:gap-8">
          {[
            {
              icon: Terminal,
              title: "Built for your terminal",
              body: "Start and manage tunnels with the CLI.",
            },
            {
              icon: Monitor,
              title: "On your platform",
              body: "macOS, Windows, and Linux.",
            },
            {
              icon: ShieldCheck,
              title: "QUIC with TCP fallback",
              body: "Built for real-world networks.",
            },
          ].map((item, index) => (
            <Reveal
              key={item.title}
              delay={index * 90}
              className="platform-item flex items-center gap-3.5"
            >
              <item.icon
                className="draw-icon h-5 w-5 shrink-0 text-secondary"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <section className="shell section grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24">
        <Reveal>
          <Eyebrow text="A small command. A bigger world." />
          <h2 className="section-heading mt-5">
            <MaskLines lines={["Local to live.", "In a single step."]} />
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-secondary">
            Your web app, your SSH session, your next integration. Choose a
            protocol and see the command that connects it to the world.
          </p>
          <Link href="/docs/quickstart" className="text-link mt-7">
            Open your first tunnel{" "}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <div
            className="protocol-chips mt-8 flex flex-wrap gap-2"
            aria-label="Supported tunnel protocols"
          >
            {["HTTP", "HTTPS", "TCP", "UDP", "TLS"].map((protocol, index) => (
              <span
                key={protocol}
                className="protocol-chip rounded-md border border-border bg-surface-2 px-3 py-1.5 font-mono text-[10px] text-secondary"
                style={{ "--i": index } as CSSProperties}
              >
                {protocol}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted">
            UDP and TLS are available on paid plans.
          </p>
        </Reveal>
        <Reveal delay={100} className="min-w-0">
          <TunnelPreview />
        </Reveal>
      </section>

      <section id="product" className="shell section">
        <div className="mb-12 grid gap-7 lg:grid-cols-2 lg:items-end lg:gap-24">
          <Reveal>
            <Eyebrow text="01 / Made for your workflow" />
            <h2 className="section-heading mt-5">
              <MaskLines lines={["Stay in your flow.", "Open up your work."]} />
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="max-w-md text-base leading-relaxed text-secondary">
              Keep your tools, your code, and your environment. trqsh handles
              the connection between your machine and everyone else.
            </p>
            <Link href="/docs" className="text-link mt-5">
              Explore the documentation{" "}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
        <SpotlightGroup className="grid gap-5 md:grid-cols-3">
          {capabilities.map((feature, index) => (
            <Reveal
              key={feature.title}
              as="article"
              delay={index * 100}
              className="feature-card spotlight group flex flex-col"
            >
              <span className="spotlight-fill" aria-hidden="true" />
              <div className="mb-6 flex items-center justify-between">
                <span className="feature-icon inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-2">
                  <feature.icon
                    className="h-5 w-5 text-foreground"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </span>
                <span className="feature-index font-mono text-[10px] tracking-wider text-muted">
                  0{index + 1}
                </span>
              </div>
              <FeatureVignette kind={feature.scene} />
              <div className="relative flex flex-1 flex-col">
                <h3 className="text-lg font-semibold tracking-tight">
                  {feature.title}
                </h3>
                <p className="mb-7 mt-3 text-sm leading-relaxed text-secondary">
                  {feature.description}
                </p>
                <Link
                  href={feature.href}
                  className="text-link mt-auto w-fit text-xs"
                >
                  {feature.link}{" "}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </Reveal>
          ))}
        </SpotlightGroup>
        <Reveal className="mt-7 flex items-center justify-center gap-2 text-xs text-muted">
          <Code2 className="draw-icon h-3.5 w-3.5" aria-hidden="true" />
          No deployment needed to share a preview.
        </Reveal>
      </section>

      <section className="border-y border-border bg-surface-2">
        <div className="shell section">
          <Reveal className="mb-12 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <Eyebrow text="02 / From local to live" />
              <h2 className="section-heading mt-4">
                <MaskLines lines={["Three steps. You’re connected."]} />
              </h2>
            </div>
            <Link href="/docs/quickstart" className="text-link shrink-0">
              Follow the guide{" "}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Reveal>
          <Reveal stage className="relative">
            <span className="steps-rail" aria-hidden="true">
              <span className="steps-rail-fill" />
              <span className="steps-rail-packet" />
            </span>
            <ol className="steps-grid relative grid gap-9 lg:grid-cols-3">
              {steps.map((step, index) => (
                <li
                  key={step.number}
                  className="step-card min-w-0"
                  style={{ "--i": index } as CSSProperties}
                >
                  <span className="step-number relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border-strong bg-surface-2 font-mono text-xs text-secondary">
                    {step.number}
                  </span>
                  <h3 className="mt-6 text-lg font-semibold tracking-tight">
                    {step.title}
                  </h3>
                  <p className="mb-5 mt-2 min-h-[3rem] text-sm leading-relaxed text-secondary">
                    {step.description}
                  </p>
                  <CodeBlock
                    code={step.command}
                    label={step.label}
                    prompt
                    wrap
                    className="bg-page"
                  />
                  <Link
                    href={step.href}
                    className="text-link mt-3 text-xs font-normal text-secondary hover:text-foreground"
                  >
                    Learn more{" "}
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      <section className="shell section grid items-center gap-10 lg:grid-cols-2 lg:gap-24">
        <Reveal>
          <Eyebrow text="03 / Room to get started" />
          <h2 className="section-heading mt-4">
            <MaskLines lines={["Start small.", "Keep building."]} />
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-secondary">
            Try your first tunnel or build your next side project. The free plan
            gives you space to work, with paid plans when you need more.
          </p>
          <Link href="/pricing" className="text-link mt-6">
            Find the right plan{" "}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Reveal>
        <Reveal delay={120}>
          <SpotlightGroup>
            <Tilt
              max={3}
              className="free-plan-card spotlight rounded-2xl border border-border p-7 sm:p-9"
            >
              <span className="spotlight-fill" aria-hidden="true" />
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-sm font-medium">{free.name} plan</p>
                  <p className="mt-2 text-5xl font-semibold tracking-[-0.055em]">
                    <span className="sr-only">$0</span>
                    <span aria-hidden="true">
                      $
                      <span className="price-roll">
                        <span className="price-roll-strip">
                          {[9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((digit) => (
                            <span key={digit}>{digit}</span>
                          ))}
                        </span>
                      </span>
                    </span>
                    <span className="ml-2 text-sm font-normal tracking-normal text-muted">
                      forever
                    </span>
                  </p>
                </div>
                <Layers3
                  className="draw-icon h-6 w-6 text-muted"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </div>
              <ul className="my-6 space-y-3 border-t border-border pt-6 text-sm text-secondary">
                {[
                  `${free.max_concurrent_tunnels} concurrent tunnels`,
                  `${formatBytes(free.max_bandwidth_bytes_mo)} bandwidth per month`,
                  "HTTP, HTTPS, and TCP",
                  `${free.max_reserved_subdomains} reserved subdomain`,
                ].map((feature, index) => (
                  <li
                    key={feature}
                    className="plan-feature flex items-center gap-2.5"
                    style={{ "--i": index } as CSSProperties}
                  >
                    <Check
                      className="draw-icon h-4 w-4 text-foreground"
                      aria-hidden="true"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              <a
                href={signupUrl}
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              >
                Create your free account{" "}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </Tilt>
          </SpotlightGroup>
        </Reveal>
      </section>

      <section className="shell pb-16 sm:pb-24">
        <SpotlightGroup>
          <Reveal className="cta-panel inverse-surface spotlight relative isolate flex flex-col items-start justify-between gap-8 overflow-hidden rounded-2xl px-7 py-10 sm:px-12 sm:py-14 lg:flex-row lg:items-center">
            <span className="spotlight-fill" aria-hidden="true" />
            <div className="cta-orbits" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="relative">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-white/60">
                <ScrambleText text="Ready when you are" />
              </p>
              <h2 className="text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">
                <MaskLines lines={["Your next idea.", "One command away."]} />
              </h2>
            </div>
            <div className="relative flex w-full flex-col items-stretch gap-4 sm:w-auto sm:flex-row sm:items-center sm:gap-5">
              <Magnetic className="w-full sm:w-auto">
                <Link
                  href="/download"
                  className={cn(
                    buttonVariants({ size: "lg", variant: "outline" }),
                    "w-full border-white bg-white text-primary hover:border-white hover:bg-white/90 sm:w-auto",
                  )}
                >
                  Download trqsh <Download className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Magnetic>
              <Link
                href="/docs/quickstart"
                className="text-link justify-center font-normal text-white/80 hover:text-white sm:justify-start"
              >
                Quickstart <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
        </SpotlightGroup>
      </section>
    </>
  );
}
