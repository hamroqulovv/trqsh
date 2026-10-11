import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { PricingTable } from "@/components/pricing-table";
import { AnimatedText } from "@/components/animated-text";
import { Reveal } from "@/components/reveal";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start free with trqsh. Compare Free, Pro, Team, and metered plans for your tunnels, bandwidth, and domains.",
};

const questions = [
  {
    question: "Can I start without a credit card?",
    answer:
      "Yes. Create an account and use the Free plan without entering payment details. You can move to a paid plan when you need more tunnels, bandwidth, or protocols.",
  },
  {
    question: "What counts toward my bandwidth?",
    answer:
      "Traffic passing through your tunnels counts toward your monthly allowance, including requests and responses. Check your current usage in the dashboard.",
  },
  {
    question: "How do paid upgrades work?",
    answer:
      "Choose Pro or Team to see your plan and billing period, then contact us on Telegram with your account email. We handle activation directly and confirm the details with you.",
  },
  {
    question: "Which protocols can I use?",
    answer:
      "HTTP, HTTPS, and TCP are available on every plan. Pro and Team also include UDP and TLS tunnels.",
  },
  {
    question: "What happens when I reach a limit?",
    answer:
      "trqsh reports a clear error when an operation exceeds your plan’s limits. You can check usage in the dashboard, reduce your usage, or choose a plan with more capacity.",
  },
  {
    question: "Can I use my own domain?",
    answer:
      "Custom domains are included with Pro and Team. The documentation walks you through DNS setup and verification.",
  },
];

export default function PricingPage() {
  return (
    <div className="shell pb-20 pt-16 sm:pb-24 sm:pt-20">
      <header className="mx-auto mb-10 max-w-2xl text-center">
        <p className="eyebrow">Simple plans. Space to grow.</p>
        <h1 className="page-heading mt-5">
          <AnimatedText text="Build at your pace." delay={100} />
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-secondary sm:text-lg">
          Start with the essentials, free. Add more tunnels, bandwidth, and
          control as your work grows.
        </p>
      </header>
      <PricingTable />
      <Reveal
        as="section"
        className="mt-20 grid gap-9 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24 sm:mt-24"
      >
        <div>
          <p className="eyebrow">Good to know</p>
          <h2 className="section-heading mt-4">A few answers.</h2>
          <p className="mt-4 text-sm leading-relaxed text-secondary">
            Need a hand choosing a plan?
          </p>
          <a
            href={site.telegramUrl}
            target="_blank"
            rel="noreferrer"
            className="text-link mt-3"
          >
            Talk to us <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
        <div className="divide-y divide-border border-y border-border">
          {questions.map((item) => (
            <details key={item.question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-sm font-medium">
                <span>{item.question}</span>
                <Plus
                  className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-45"
                  aria-hidden="true"
                />
              </summary>
              <p className="mt-3 pr-8 text-sm leading-relaxed text-secondary">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </Reveal>
      <p className="mt-12 text-center text-xs text-muted">
        New to tunneling?{" "}
        <Link
          href="/docs/quickstart"
          className="text-foreground underline underline-offset-4"
        >
          Start with the quickstart.
        </Link>
      </p>
    </div>
  );
}
