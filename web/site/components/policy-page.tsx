import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, Clock3, Mail, ShieldCheck } from "lucide-react";
import { AnimatedText } from "./animated-text";
import { Reveal } from "./reveal";
import { policyLinks, policyUpdatedOn, type PolicyDocument } from "@/lib/policies";
import { site } from "@/lib/site";
import "./policy-page.css";

export function PolicyPage({ document }: { document: PolicyDocument }) {
  const contents = <ol className="policy-contents">{document.sections.map((section, index) => <li key={section.id}><a href={`#${section.id}`}><span className="font-mono tabular">{String(index + 1).padStart(2, "0")}</span>{section.title}</a></li>)}</ol>;
  return (
    <div className="shell policy-page">
      <nav aria-label="Policy navigation" className="policy-nav">{policyLinks.map((link) => <Link key={link.href} href={link.href} aria-current={link.href === document.href ? "page" : undefined}>{link.label}</Link>)}<Link href="/docs/security" className="ml-auto">Security <ArrowUpRight className="h-3 w-3" aria-hidden="true" /></Link></nav>
      <header className="policy-hero">
        <p className="eyebrow flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Clarity comes first</p>
        <h1 aria-label={document.title} className="page-heading mt-5"><AnimatedText text={document.title} delay={70} /></h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-secondary sm:text-lg">{document.introduction}</p>
        <div className="policy-meta"><span>Updated <time dateTime={policyUpdatedOn}>October 20, 2026</time></span><span aria-hidden="true">/</span><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{document.readingTime}</span></div>
      </header>
      <div className="policy-summary" aria-label="At a glance">{document.summary.map((item, index) => <Reveal key={item.label} delay={index * 70}><Check className="h-4 w-4 text-muted" aria-hidden="true" /><h2 className="mt-4 text-sm font-medium">{item.label}</h2><p className="mt-2 text-sm leading-relaxed text-secondary">{item.text}</p></Reveal>)}</div>
      <details className="policy-mobile-contents lg:hidden"><summary>On this page <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /></summary>{contents}</details>
      <div className="policy-body">
        <aside className="hidden lg:block"><nav className="policy-sidebar" aria-label="On this page"><p className="eyebrow mb-5">On this page</p>{contents}<a href={`mailto:${site.supportEmail}`} className="mt-8 inline-flex items-center gap-2 text-xs text-secondary hover:text-foreground"><Mail className="h-3.5 w-3.5" aria-hidden="true" />{site.supportEmail}</a></nav></aside>
        <article className="policy-article prose" aria-label={document.title.replace(/\.$/, "")}>
          {document.sections.map((section, index) => <section key={section.id} id={section.id}><h2><span className="policy-section-number">{String(index + 1).padStart(2, "0")}</span>{section.title}</h2>{section.content}</section>)}
        </article>
      </div>
      <Reveal className="policy-contact"><div><p className="eyebrow">An open line</p><h2 className="mt-3 text-2xl font-medium tracking-tight">Questions deserve a real answer.</h2><p className="mt-3 text-sm leading-relaxed text-secondary">Policy questions, account requests, or something that needs a closer look.</p></div><a href={`mailto:${site.supportEmail}`} className="text-link shrink-0">{site.supportEmail}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a></Reveal>
    </div>
  );
}
