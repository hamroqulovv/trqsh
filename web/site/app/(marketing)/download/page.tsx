import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Terminal, Radio, ScanLine, Monitor, ChevronDown } from "lucide-react";
import { DownloadSection } from "@/components/download-section";
import { SmartDownload } from "@/components/smart-download";
import { CodeBlock } from "@/components/code-block";
import { site } from "@/lib/site";
import { releasesUrl } from "@/lib/downloads";
import { AnimatedText } from "@/components/animated-text";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "Download the CLI",
  description: "Install the trqsh CLI on Windows, macOS or Linux. Use npm, Python or the shell installer, download a native binary and start your first tunnel.",
};
const features = [
  { icon: Terminal, title: "An interactive console", text: "Sign in, start tunnels and manage them from one terminal." },
  { icon: Radio, title: "HTTP, TCP & UDP", text: "Connect local apps and services with the protocols your plan supports." },
  { icon: ScanLine, title: "Inspect local requests", text: "See HTTP requests reaching your app and replay them while debugging." },
];
const faqs = [
  { question: "Which architecture should I choose?", answer: "On macOS, choose Apple Silicon for an M-series chip or Intel for an Intel Mac. On Windows, check Settings → System → About → System type. On Linux, run uname -m: x86_64 means x64, while aarch64 means ARM64." },
  { question: "Do I need Node.js or Python?", answer: "Only for the corresponding package-manager install. The standalone archives contain a native CLI binary. The shell installer also installs that native binary directly." },
  { question: "What if the terminal cannot find trqsh?", answer: "Open a new terminal first. For a manual install, add the directory containing trqsh (trqsh.exe on Windows) to PATH. The shell installer prints its destination; npm and pipx use their own binary directories." },
  { question: "How do I update the CLI?", answer: "Inside the trqsh console, use /update check to check for an update. For npm or Python installs, update through the same package manager. Restart trqsh afterward. The installation guide covers each method." },
];

export default function DownloadPage() {
  return (
    <div className="shell pb-20 pt-14 sm:pb-24 sm:pt-20">
      <header className="cli-download-header">
        <div>
          <p className="eyebrow">trqsh / Command line</p>
          <h1 className="page-heading mt-5"><AnimatedText text="Your terminal. Now connected." delay={80} /></h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-secondary sm:text-lg">
            Bring your local apps to the internet. Install the CLI, connect your account,
            and create a public URL without leaving your terminal.
          </p>
        </div>
        <a href={releasesUrl} className="cli-release-badge"><Terminal size={15} aria-hidden="true" /><span>CLI v{site.version}</span><ArrowUpRight size={13} aria-hidden="true" /></a>
      </header>
      <Reveal><SmartDownload /></Reveal>
      <div className="cli-feature-strip">
        {features.map(feature => <div key={feature.title} className="flex items-start gap-3">
          <feature.icon size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
          <div><h2 className="text-sm font-medium">{feature.title}</h2><p className="mt-1.5 text-xs leading-relaxed text-secondary">{feature.text}</p></div>
        </div>)}
      </div>
      <section className="mt-16 sm:mt-20" aria-labelledby="first-tunnel">
        <Reveal className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div><p className="eyebrow">After installation</p><h2 id="first-tunnel" className="section-heading mt-3">From install to your first URL.</h2><p className="mt-4 max-w-2xl text-sm leading-relaxed text-secondary">Keep your local app running. Open another terminal and follow these steps.</p></div>
          <Link href="/docs/quickstart" className="text-link text-sm">Full quickstart <ArrowRight size={15} aria-hidden="true" /></Link>
        </Reveal>
        <div className="grid gap-5 lg:grid-cols-3">
          {[
            { number: "01", title: "Open the CLI", description: "Check the installation, then launch the interactive console.", code: "trqsh --version\ntrqsh", label: "In your terminal", note: "New installs open the welcome guide. Follow it, or use the console steps below." },
            { number: "02", title: "Connect your account", description: "Approve the sign-in request in your browser and return to the console.", code: "/login", label: "Inside the trqsh console", note: "Already connected through the welcome guide? You can skip this step." },
            { number: "03", title: "Start a tunnel", description: "Expose your running local app. Replace 3000 with its port.", code: "/http 3000", label: "Inside the trqsh console", note: "Copy the public URL printed by trqsh. Keep the agent running while you share it." },
          ].map(step => <article key={step.number} className="cli-next-step">
            <span className="font-mono text-xs text-muted">{step.number}</span><h3 className="mt-4 text-base font-semibold">{step.title}</h3>
            <p className="mb-5 mt-2 text-sm leading-relaxed text-secondary">{step.description}</p>
            <CodeBlock code={step.code} label={step.label} wrap />
            <p className="mt-4 text-xs leading-relaxed text-muted">{step.note}</p>
          </article>)}
        </div>
      </section>
      <section id="all-platforms" className="mt-16 sm:mt-20" aria-labelledby="platform-downloads">
        <Reveal className="mb-8"><p className="eyebrow">Direct downloads</p><h2 id="platform-downloads" className="section-heading mt-3">Native binaries. Your platform.</h2><p className="mt-4 text-sm leading-relaxed text-secondary">Choose the operating system and processor where the CLI will run. Extract the archive and add the binary to PATH.</p></Reveal>
        <DownloadSection />
      </section>
      <section className="mt-16 grid gap-8 border-t border-border pt-12 lg:grid-cols-[0.7fr_1fr] lg:gap-16" aria-labelledby="install-help">
        <div><p className="eyebrow">Good to know</p><h2 id="install-help" className="mt-3 text-2xl font-semibold tracking-tight">A smooth first run.</h2><p className="mt-4 text-sm leading-relaxed text-secondary">Architecture, requirements, PATH and updates — the essentials before you connect.</p><Link href="/docs/installation" className="text-link mt-5 text-sm">Installation guide <ArrowRight size={15} aria-hidden="true" /></Link></div>
        <div>{faqs.map(faq => <details key={faq.question} className="cli-download-faq group"><summary>{faq.question}<ChevronDown size={16} className="shrink-0 group-open:rotate-180" aria-hidden="true" /></summary><p>{faq.answer}</p></details>)}</div>
      </section>
      <aside className="cli-desktop-notice">
        <Monitor size={20} strokeWidth={1.5} className="shrink-0 text-muted" aria-hidden="true" />
        <div><p className="text-sm font-medium">Desktop app <span className="ml-2 rounded border border-border px-2 py-0.5 text-[10px] font-normal text-muted">Planned</span></p><p className="mt-2 text-xs leading-relaxed text-secondary">A desktop app will be added in a future release. For now, get started with the CLI on macOS, Windows or Linux.</p></div>
      </aside>
    </div>
  );
}
