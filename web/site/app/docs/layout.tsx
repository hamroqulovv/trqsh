import { DocsSidebar } from "@/components/docs-sidebar";
import { SiteFooter } from "@/components/site-footer";
import { DocsMobileNav } from "@/components/docs-mobile-nav";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="shell">
        <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-12">
          {/* Desktop sidebar */}
          <aside className="sticky top-[72px] hidden max-h-[calc(100vh-72px)] self-start overflow-y-auto py-10 pr-2 lg:block">
            <DocsSidebar />
          </aside>

          {/* Mobile disclosure nav */}
          <DocsMobileNav />

          <main id="main-content" tabIndex={-1} className="min-w-0">
            {children}
          </main>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
