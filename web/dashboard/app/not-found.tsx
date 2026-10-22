import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Link href="/" aria-label="trqsh overview" className="rise-sm mb-12">
        <Logo />
      </Link>
      <p className="eyebrow rise-sm flex items-center gap-2.5" style={{ "--i": 1 } as React.CSSProperties}>
        <span className="h-px w-6 bg-foreground/50" aria-hidden="true" />
        Error 404
      </p>
      <h1 className="mt-4 text-5xl font-semibold tracking-[-0.06em] sm:text-6xl">
        <span className="title-mask">
          <span className="title-line">Nothing here.</span>
        </span>
      </h1>
      <p className="rise-sm mt-4 max-w-sm text-sm leading-relaxed text-secondary" style={{ "--i": 3 } as React.CSSProperties}>
        The page you were looking for doesn&apos;t exist, or it moved.
      </p>
      <Link
        href="/"
        className={buttonVariants({ className: "rise-sm mt-8" })}
        style={{ "--i": 4 } as React.CSSProperties}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to overview
      </Link>
    </main>
  );
}
