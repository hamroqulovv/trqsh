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
import { Reveal } from "@/components/reveal";
import { Tilt } from "@/components/tilt";
import { CodeBlock } from "@/components/code-block";
import { buttonVariants } from "@/components/ui/button";
import { planByCode } from "@/lib/plans";
import { formatBytes } from "@/lib/format";
import { signupUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

const capabilities = [
  {
    icon: Globe2,
    title: "Share what you’re building.",
    description:
      "Give your local app a public HTTPS URL. Send a preview to a teammate, test on your phone, or demo your work.",
    href: "/docs/http-tunnels",
    link: "HTTP tunnels",
  },
  {
    icon: Webhook,
    title: "Bring webhooks to your desk.",
    description:
      "Receive events on localhost, inspect headers and payloads, and replay requests while you debug.",
    href: "/docs/inspector",
    link: "Request inspector",
  },
  {
    icon: Radio,
    title: "Go beyond the browser.",
    description:
      "Connect SSH and databases with TCP. Use UDP and TLS tunnels on paid plans for the services your workflow needs.",
    href: "/docs/tcp-udp-tunnels",
    link: "TCP, UDP & TLS",
  },
];

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

export default function HomePage() {
  const free = planByCode("free")!;
  return (
    <>
      <section className="hero-section">
        <HeroBackground />
        <div className="shell relative grid items-center gap-12 pb-16 pt-16 sm:pb-20 sm:pt-20 lg:grid-cols-[1.04fr_1fr] lg:gap-14 lg:pb-24 lg:pt-24">
          <div className="min-w-0">
            <HeroHeadline />
            <p className="hero-enter hero-enter-description mt-7 max-w-md text-base leading-relaxed text-secondary sm:text-lg">
              Share your work, receive webhooks, and connect your services. One
              command brings your local environment to the internet.
            </p>
            <div className="hero-enter hero-enter-actions mt-8 flex flex-wrap gap-3">
              <Link href="/download" className={buttonVariants({ size: "xl" })}>
                <Download className="h-4 w-4" aria-hidden="true" /> Get trqsh
              </Link>
              <Link
                href="/docs/quickstart"
                className={buttonVariants({ variant: "outline", size: "xl" })}
              >
                Read the quickstart{" "}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
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
              className="flex items-center gap-3.5"
            >
              <item.icon
                className="h-5 w-5 shrink-0 text-secondary"
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
          <p className="eyebrow">A small command. A bigger world.</p>
          <h2 className="section-heading mt-5">
            Local to live.
            <br />
            In a single step.
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
            className="mt-8 flex flex-wrap gap-2"
            aria-label="Supported tunnel protocols"
          >
            {["HTTP", "HTTPS", "TCP", "UDP", "TLS"].map((protocol) => (
              <span
                key={protocol}
                className="rounded-md border border-border bg-surface-2 px-3 py-1.5 font-mono text-[10px] text-secondary"
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
            <p className="eyebrow">01 / Made for your workflow</p>
            <h2 className="section-heading mt-5">
              Stay in your flow.
              <br />
              Open up your work.
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
        <div className="grid gap-5 md:grid-cols-3">
          {capabilities.map((feature, index) => (
            <Reveal
              key={feature.title}
              as="article"
              delay={index * 100}
              className="feature-card group flex flex-col"
            >
              <div className="mb-8 flex items-center justify-between">
                <span className="feature-icon inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-2">
                  <feature.icon
                    className="h-5 w-5 text-foreground"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </span>
                <span className="font-mono text-[10px] tracking-wider text-muted">
                  0{index + 1}
                </span>
              </div>
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
        </div>
        <Reveal className="mt-7 flex items-center justify-center gap-2 text-xs text-muted">
          <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
          No deployment needed to share a preview.
        </Reveal>
      </section>

      <section className="border-y border-border bg-surface-2">
        <div className="shell section">
          <Reveal className="mb-12 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow">02 / From local to live</p>
              <h2 className="section-heading mt-4">
                Three steps. You’re connected.
              </h2>
            </div>
            <Link href="/docs/quickstart" className="text-link shrink-0">
              Follow the guide{" "}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Reveal>
          <ol className="steps-grid relative grid gap-9 lg:grid-cols-3">
            {steps.map((step, index) => (
              <Reveal
                as="li"
                key={step.number}
                delay={index * 120}
                className="step-card min-w-0"
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
                  className="bg-page"
                />
                <Link
                  href={step.href}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-secondary hover:text-foreground"
                >
                  Learn more{" "}
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="shell section grid items-center gap-10 lg:grid-cols-2 lg:gap-24">
        <Reveal>
          <p className="eyebrow">03 / Room to get started</p>
          <h2 className="section-heading mt-4">
            Start small.
            <br />
            Keep building.
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
          <Tilt
            max={3}
            className="free-plan-card rounded-2xl border border-border p-7 sm:p-9"
          >
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-sm font-medium">{free.name} plan</p>
                <p className="mt-2 text-5xl font-semibold tracking-[-0.055em]">
                  $0
                  <span className="ml-2 text-sm font-normal tracking-normal text-muted">
                    forever
                  </span>
                </p>
              </div>
              <Layers3
                className="h-6 w-6 text-muted"
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
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-2.5">
                  <Check
                    className="h-4 w-4 text-foreground"
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
        </Reveal>
      </section>

      <section className="shell pb-16 sm:pb-24">
        <Reveal className="cta-panel inverse-surface relative isolate flex flex-col items-start justify-between gap-8 overflow-hidden rounded-2xl px-7 py-10 sm:px-12 sm:py-14 lg:flex-row lg:items-center">
          <div className="cta-orbits" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="relative">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-white/60">
              Ready when you are
            </p>
            <h2 className="text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">
              Your next idea.
              <br />
              One command away.
            </h2>
          </div>
          <div className="relative flex flex-wrap items-center gap-5">
            <Link
              href="/download"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "border-white bg-white text-primary hover:border-white hover:bg-white/90",
              )}
            >
              Download trqsh <Download className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/docs/quickstart"
              className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white"
            >
              Quickstart <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
