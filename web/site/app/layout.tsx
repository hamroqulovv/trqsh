import type { Metadata } from "next";
import "./globals.css";
import { site } from "@/lib/site";
import { SiteHeader } from "@/components/site-header";
import { themeBootScript } from "@/lib/theme";

export const metadata: Metadata = {
  metadataBase: new URL(site.siteUrl),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  keywords: [
    "tunnel",
    "localhost",
    "ngrok alternative",
    "cloudflare tunnel alternative",
    "QUIC",
    "HTTP/3",
    "reverse proxy",
    "webhook testing",
    "expose localhost",
  ],
  authors: [{ name: "trqsh" }],
  // "./" resolves against each route, so every page names itself as its own
  // canonical URL (query strings dropped) and shares it as og:url. Social card
  // titles and descriptions are left unset on purpose: Next inherits them from
  // each page's own title and description. A page that defines its own
  // `openGraph` replaces this block, including the generated share image.
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    url: "./",
    siteName: site.name,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport = {
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
