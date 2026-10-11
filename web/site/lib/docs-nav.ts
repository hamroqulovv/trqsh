// Client-safe docs navigation data + types. This file must NOT import node:fs /
// node:path / marked, because it's pulled into the browser bundle by the sidebar
// and TOC. The server-only Markdown pipeline (fs, marked) lives in ./docs.ts,
// which re-exports everything here.

export interface DocEntry {
  slug: string;
  title: string;
  description?: string;
  type: "md" | "route";
}
export interface DocCategory {
  title: string;
  items: DocEntry[];
}
export interface TocItem {
  level: 2 | 3;
  text: string;
  id: string;
}

export const docsNav: DocCategory[] = [
  {
    title: "Getting started",
    items: [
      { slug: "quickstart", title: "Quickstart", description: "Start an app, sign in, create a URL and verify it.", type: "md" },
      { slug: "installation", title: "Installation", description: "npm, Python, shell installer and platform downloads.", type: "md" },
      { slug: "authentication", title: "Authentication", description: "Device approval, API keys, storage and revocation.", type: "md" },
      { slug: "dashboard", title: "Dashboard", description: "Account resources, tunnel history, usage and plans.", type: "md" },
    ],
  },
  {
    title: "Tunnels",
    items: [
      { slug: "http-tunnels", title: "HTTP tunnels", description: "Expose web apps and APIs.", type: "md" },
      { slug: "tcp-udp-tunnels", title: "TCP & UDP tunnels", description: "Raw services, assigned ports and protocol limitations.", type: "md" },
      { slug: "reserved-subdomains", title: "Reserved subdomains", description: "Keep the same URL every time.", type: "md" },
      { slug: "custom-domains", title: "Custom domains", description: "Bring your own domain with DNS setup.", type: "md" },
    ],
  },
  {
    title: "Tools",
    items: [
      { slug: "cli-reference", title: "CLI reference", description: "Slash commands, root flags, shortcuts and lifecycle.", type: "md" },
      { slug: "configuration", title: "Configuration", description: "The ~/.trqsh/trqsh.yml schema, overrides and reloads.", type: "md" },
      { slug: "inspector", title: "Request inspector", description: "Local captures, replay, body limits and retention.", type: "md" },
      { slug: "desktop-gui", title: "Desktop app (planned)", description: "Future desktop workspace; use the CLI today.", type: "md" },
      { slug: "remote-control", title: "QR remote control", description: "Pair a phone, send commands and end access.", type: "md" },
    ],
  },
  {
    title: "Guides",
    items: [
      { slug: "webhooks-ci", title: "Webhooks & CI", description: "Webhook testing and a headless, job-owned agent.", type: "md" },
      { slug: "self-hosting", title: "Self-hosting", description: "Full local stack, ports, networking and production.", type: "md" },
      { slug: "troubleshooting", title: "Troubleshooting", description: "Diagnose app, credentials, transport and Docker issues.", type: "md" },
    ],
  },
  {
    title: "Reference",
    items: [
      { slug: "api", title: "Control API", description: "Cloud endpoints, authentication, schemas and examples.", type: "route" },
      { slug: "local-api", title: "Local agent API", description: "Start/stop tunnels and stream events on loopback.", type: "md" },
      { slug: "errors", title: "Error reference", description: "Stable edge error codes and specific next steps.", type: "route" },
      { slug: "security", title: "Security & privacy", description: "Encryption boundaries, local secrets and reporting.", type: "md" },
    ],
  },
];

const allEntries = docsNav.flatMap((c) => c.items);

/** Slugs backed by a Markdown file — the only ones the [slug] route renders. */
export const mdSlugs = allEntries.filter((e) => e.type === "md").map((e) => e.slug);

export function docEntry(slug: string): DocEntry | undefined {
  return allEntries.find((e) => e.slug === slug);
}

/** The first Markdown doc — used as the "Start here" target. */
export const firstDocSlug = mdSlugs[0];
