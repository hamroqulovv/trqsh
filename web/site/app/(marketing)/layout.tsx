import { SiteFooter } from "@/components/site-footer";
import { PageTransition } from "@/components/page-transition";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <main id="main-content" tabIndex={-1}>
        <PageTransition>{children}</PageTransition>
      </main>
      <SiteFooter />
    </>
  );
}
