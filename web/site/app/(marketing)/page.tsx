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
      "Use the CLI with your package manager, or get the desktop app.",
    command: "npm install -g @trqsh-uz/trqsh",
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
      <section className="shell grid items-center gap-12 pb-16 pt-16 sm:pb-20 sm:pt-20 lg:grid-cols-[1.02fr_1fr] lg:gap-16 lg:pb-24 lg:pt-24">
        <div>
          <p className="eyebrow mb-7 flex items-center gap-2">
            <span className="h-1.5 w-1.5 bg-foreground" aria-hidden="true" />{" "}
            Local development, connected
          </p>
          <h1 className="text-[clamp(3.1rem,5.2vw,4.5rem)] font-semibold leading-[1.06] tracking-[-0.065em]">
            Your localhost.
            <br />
            <span className="text-muted">Now everywhere.</span>
          </h1>
          <p className="mt-7 max-w-md text-base leading-relaxed text-secondary sm:text-lg">
            Share your work, receive webhooks, and connect your services. One
            command brings your local environment to the internet.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
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
          <p className="mt-5 flex items-center gap-2 text-xs text-muted">
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Free to start.
            No credit card required.
          </p>
        </div>
        <TunnelPreview />
      </section>

      <div className="border-y border-border">
        <div className="shell grid gap-6 py-7 sm:grid-cols-3 sm:gap-8">
          {[
            {
              icon: Terminal,
              title: "CLI or desktop",
              body: "Work the way you want.",
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
          ].map((item) => (
            <div key={item.title} className="flex items-center gap-3.5">
              <item.icon
                className="h-5 w-5 shrink-0 text-secondary"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <section
        id="product"
        className="shell section grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24"
      >
        <div>
          <p className="eyebrow">Made for your workflow</p>
          <h2 className="section-heading mt-5">
            Stay in your flow.
            <br />
            Open up your work.
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-secondary">
            Keep your tools, your code, and your environment. trqsh handles the
            connection between your machine and everyone else.
          </p>
          <Link href="/docs" className="text-link mt-7">
            Explore the documentation{" "}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <div className="mt-10 inline-flex items-center gap-3 rounded-md border border-border px-4 py-3 text-xs text-secondary">
            <Code2 className="h-4 w-4" aria-hidden="true" />
            <span>No deployment needed to share a preview.</span>
          </div>
        </div>
        <div className="divide-y divide-border">
          {capabilities.map((feature, index) => (
            <div
              key={feature.title}
              className={cn("flex gap-5 py-7", index === 0 && "pt-0")}
            >
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2">
                <feature.icon
                  className="h-5 w-5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </span>
              <div>
                <h3 className="text-lg font-semibold tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-secondary">
                  {feature.description}
                </p>
                <Link href={feature.href} className="text-link mt-4 text-xs">
                  {feature.link}{" "}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface-2">
        <div className="shell section">
          <div className="mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow">From local to live</p>
              <h2 className="section-heading mt-4">
                Three steps. You’re connected.
              </h2>
            </div>
            <Link href="/docs/quickstart" className="text-link shrink-0">
              Follow the guide{" "}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <ol className="grid gap-8 lg:grid-cols-3">
            {steps.map((step) => (
              <li key={step.number} className="min-w-0">
                <span className="font-mono text-xs text-muted">
                  {step.number} /
                </span>
                <h3 className="mt-3 text-lg font-semibold tracking-tight">
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
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="shell section grid items-center gap-10 lg:grid-cols-2 lg:gap-24">
        <div>
          <p className="eyebrow">Room to get started</p>
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
        </div>
        <div className="rounded-xl border border-border p-7 sm:p-8">
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
                <Check className="h-4 w-4 text-foreground" aria-hidden="true" />
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
        </div>
      </section>

      <section className="shell pb-16 sm:pb-24">
        <div className="inverse-surface flex flex-col items-start justify-between gap-8 rounded-xl bg-primary px-7 py-10 text-primary-foreground sm:px-12 sm:py-12 lg:flex-row lg:items-center">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-white/60">
              Ready when you are
            </p>
            <h2 className="text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">
              Your next idea.
              <br />
              One command away.
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-5">
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
        </div>
      </section>
    </>
  );
}
