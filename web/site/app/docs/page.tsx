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
    "Learn to connect your local environment with trqsh. Installation, tunnels, debugging, and the API reference.",
};

const guides = [
  {
    icon: Terminal,
    title: "HTTP tunnels",
    description: "Connect web apps, APIs, and webhooks.",
    href: "/docs/http-tunnels",
  },
  {
    icon: Globe2,
    title: "Your own domain",
    description: "Make a custom domain your endpoint.",
    href: "/docs/custom-domains",
  },
  {
    icon: KeyRound,
    title: "API reference",
    description: "Build trqsh into your own workflow.",
    href: "/docs/api",
  },
];

export default function DocsIndexPage() {
  return (
    <div className="py-10 sm:py-12">
      <header>
        <p className="eyebrow">Documentation</p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.05em] sm:text-5xl">
          Build with trqsh.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-secondary">
          From your first tunnel to your everyday workflow. Find a guide,
          connect your environment, and keep building.
        </p>
      </header>
      <section className="inverse-surface mt-8 rounded-xl bg-primary p-7 text-primary-foreground sm:p-8">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/60">
          A good place to start
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">
          Your first tunnel.
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/70">
          Install the CLI, connect your account, and give your local app a
          public URL. We’ll walk you through each step.
        </p>
        <Link
          href="/docs/quickstart"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "mt-5 border-white bg-white text-primary hover:border-white hover:bg-white/90",
          )}
        >
          Open the quickstart{" "}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {guides.map((guide) => (
          <Link
            key={guide.href}
            href={guide.href}
            className="group rounded-xl border border-border p-5 transition-colors hover:border-border-strong"
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
