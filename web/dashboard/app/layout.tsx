import type { Metadata, Viewport } from "next";
import { themeBootScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "trqsh Dashboard",
  description:
    "Manage your trqsh tunnels, domains, API keys, usage, and billing.",
};

export const viewport: Viewport = { colorScheme: "light dark" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <noscript>
          <style>{".count-pending{opacity:1!important}"}</style>
        </noscript>
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
