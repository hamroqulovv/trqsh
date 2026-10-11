import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Globe2,
  KeyRound,
  Terminal,
} from "lucide-react";
import { docsNav } from "@/lib/docs";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Step-by-step trqsh guides: installation, interactive CLI, HTTP/TCP/UDP tunnels, configuration, local automation, self-hosting and API schemas.",
};

const guides = [
  {
    icon: Terminal,
    title: "Console commands",
    description: "Every command, option and stop/exit behavior.",
    href: "/docs/cli-reference",
  },
  {
    icon: Globe2,
    title: "Run the full stack",
    description: "Local Docker ports, networking and deployment.",
    href: "/docs/self-hosting",
  },
  {
    icon: KeyRound,
    title: "Automate an agent",
    description: "Create tunnels from scripts with the local API.",
    href: "/docs/local-api",
  },
];

export default function DocsIndexPage() {
  return (
    <div className="docs-overview py-10 sm:py-12">
      <header>
        <p className="eyebrow">Documentation</p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.05em] sm:text-5xl">
          Build with trqsh.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-secondary">
          Start with a working local app, create its public URL, then learn
          how to manage tunnels, inspect requests and automate your workflow.
        </p>
      </header>
      <section className="docs-start-card mt-8">
        <div>
        <p className="text-xs font-medium text-muted">
          Getting started
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">
          Your first tunnel.
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-secondary">
          Install the CLI, connect your account, and give your local app a
          public URL. We’ll walk you through each step.
        </p>
        <Link
          href="/docs/quickstart"
          className={cn(
            buttonVariants({ variant: "default" }),
            "mt-5",
          )}
        >
          Open the quickstart{" "}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        </div>
        <div className="docs-start-steps">
          {[ ["Install", "Choose your platform and install the CLI."], ["Connect", "Sign in to link the agent to your account."], ["Share", "Start a tunnel and open its public URL."] ].map(([title, description], index) => (
            <div key={title}><span>{index + 1}</span><p><strong>{title}</strong><small>{description}</small></p></div>
          ))}
        </div>
      </section>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {guides.map((guide) => (
          <Link
            key={guide.href}
            href={guide.href}
            className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-2"
          >
            <guide.icon
              className="mb-5 h-5 w-5 text-secondary"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <h2 className="flex items-center justify-between gap-2 text-sm font-semibold">
              {guide.title}
              <ArrowUpRight
                className="h-3.5 w-3.5 text-muted group-hover:text-foreground"
                aria-hidden="true"
              />
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-secondary">
              {guide.description}
            </p>
          </Link>
        ))}
      </div>
      <section className="mt-12 space-y-10">
        {docsNav.map((group) => (
          <div key={group.title}>
            <h2 className="mb-4 text-lg font-semibold tracking-tight">
              {group.title}
            </h2>
            <ul className="grid gap-x-7 sm:grid-cols-2">
              {group.items.map((item) => (
                <li key={item.slug} className="border-t border-border">
                  <Link
                    href={`/docs/${item.slug}`}
                    className="group flex items-start justify-between gap-3 py-4"
                  >
                    <span>
                      <span className="text-sm font-medium">{item.title}</span>
                      {item.description && (
                        <span className="mt-1 block text-xs leading-relaxed text-secondary">
                          {item.description}
                        </span>
                      )}
                    </span>
                    <ArrowRight
                      className="mt-1 h-3.5 w-3.5 shrink-0 text-muted group-hover:text-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
