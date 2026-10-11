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
      <div className="docs-shell">
        <div className="docs-layout">
          {/* Desktop sidebar */}
          <aside className="docs-sidebar-rail">
            <DocsSidebar />
          </aside>

          {/* Mobile disclosure nav */}
          <DocsMobileNav />

          <main id="main-content" tabIndex={-1} className="docs-main min-w-0">
            {children}
          </main>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
