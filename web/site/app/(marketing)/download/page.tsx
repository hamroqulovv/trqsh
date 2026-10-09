import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Terminal } from "lucide-react";
import { DownloadSection } from "@/components/download-section";
import { SmartDownload } from "@/components/smart-download";
import { CodeBlock } from "@/components/code-block";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Download",
  description:
    "Get the trqsh CLI or desktop app for macOS, Windows, and Linux. Choose your platform, architecture, and preferred installation method.",
};

export default function DownloadPage() {
  return (
    <div className="shell pb-20 pt-16 sm:pb-24 sm:pt-20">
      <header className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Your tools. Your platform.</p>
          <h1 className="page-heading mt-5">Get trqsh.</h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-secondary sm:text-lg">
            A command line when you want precision.
            <br className="hidden sm:block" /> A desktop app when you want a
            workspace.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-md border border-border px-3 py-2 font-mono text-xs text-secondary">
          <Terminal className="h-3.5 w-3.5" aria-hidden="true" /> CLI v
          {site.version}
        </span>
      </header>
      <SmartDownload />
      <section id="all-platforms" className="mt-16 sm:mt-24">
        <div className="mb-8">
          <p className="eyebrow">The complete toolkit</p>
          <h2 className="section-heading mt-4">
            Every platform. Every option.
          </h2>
          <p className="mt-3 text-sm text-secondary">
            Desktop installers, package managers, and direct CLI downloads.
          </p>
        </div>
        <DownloadSection />
      </section>
      <section className="mt-16 grid gap-8 border-t border-border pt-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Check className="h-4 w-4" aria-hidden="true" /> Make sure you’re
            ready.
          </div>
          <p className="mb-5 text-sm leading-relaxed text-secondary">
            After installing the CLI, check your version. Then sign in and open
            your first tunnel.
          </p>
          <CodeBlock
            code="trqsh version"
            label="Check your installation"
            prompt
          />
        </div>
        <div className="flex flex-col justify-center">
          <p className="eyebrow">What comes next</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            Your first public URL.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-secondary">
            The quickstart takes you through signing in, starting a tunnel, and
            inspecting the requests reaching your local app.
          </p>
          <Link href="/docs/quickstart" className="text-link mt-5">
            Open the quickstart{" "}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
