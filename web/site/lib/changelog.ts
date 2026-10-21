import snapshot from "./changelog.generated.json";
export { formatReleaseDate } from "./release-date";

export type ReleaseProduct = "cli" | "desktop";
export interface ChangelogEntry {
  id: string;
  product: ReleaseProduct;
  version: string;
  publishedAt: string;
  url: string;
  prerelease: boolean;
  preview: boolean;
  title: string;
  summary: string;
  highlights: string[];
  searchText: string;
}

// Editorial descriptions summarize the linked, unmodified release notes.
// Future releases get a useful fallback until an editorial description is added.
const descriptions: Record<string, { title: string; summary: string; highlights?: string[] }> = {
  "cli-0.2.5": {
    title: "A smoother upgrade, from package to tunnel.",
    summary: "Package updates now replace older cached binaries and restart older CLI daemons, so your next console uses the version you installed.",
    highlights: ["Detect conflicting Windows launchers with guidance to switch installations.", "Migrate saved hosted defaults to the new HTTPS and WebSocket endpoints while preserving custom settings."],
  },
  "cli-0.2.4": {
    title: "Your tunnels, over WebSocket.",
    summary: "Authenticated WebSocket transport connects through Cloudflare HTTP tunnels over standard HTTPS on port 443.",
    highlights: ["New hosted defaults use tunnel.trqsh.uz; direct QUIC and TCP remain available.", "CLI downloads and signature verification recognize the trqsh-tunnel release repositories."],
  },
  "cli-0.2.3": {
    title: "A clearer first run. A stronger foundation.",
    summary: "Refreshed onboarding, installation feedback, marketing, and documentation arrive alongside reconnect, session, and usage-accounting fixes.",
    highlights: ["Preserve reconnect state and invalidate logged-out sessions.", "Harden route ownership, retryable usage reporting, and billing retry handling."],
  },
  "cli-0.2.2": {
    title: "More reliable remote sessions.",
    summary: "QR sessions stay alive beyond the REST timeout, and streams register before signaling that they are ready.",
    highlights: ["Update the public API and device-login defaults used by this release.", "Support the current release signing identity and historical signatures. Older clients should upgrade using their package manager or an archive."],
  },
  "cli-0.2.1": {
    title: "Verified updates. Fewer setup hurdles.",
    summary: "Self-updates verify the Sigstore bundle before installation. npm and Python installers also improve PATH setup on Windows.",
    highlights: ["Ctrl+A selects the complete console input.", "Keep the welcome banner after /clear and publish checksums in the standard Sigstore bundle format."],
  },
  "cli-0.2.0": {
    title: "Take your console with you.",
    summary: "Pair your console with a browser using /qr. This release also adds tunnel history, usage series, location endpoints, and a desktop terminal panel.",
    highlights: ["The QR relay mirrors console state and accepts an allowlisted set of commands.", "Tunnel open and close events feed history and fleet views."],
  },
  "cli-0.1.9": {
    title: "Meet the interactive console.",
    summary: "A slash-command interface brings responsive panels, command history, live traffic views, and a redesigned welcome screen to the terminal.",
    highlights: ["Use /qr, /copy, and /requests from the console.", "Input grows across lines and pinned panels adapt to the terminal width."],
  },
  "cli-0.1.8": {
    title: "HTTP/2 and HTTP/3 at the edge.",
    summary: "Optional HTTP/2 and QUIC-based HTTP/3 ingress join the edge, including Alt-Svc advertising and deployment configuration.",
    highlights: ["Check the installed CLI with --version or -v.", "Improve Python cache removal and unknown-length request usage accounting."],
  },
  "cli-0.1.7": {
    title: "A dedicated home for CLI releases.",
    summary: "CLI releases move into their own download repository. The site drift check also handles an unreachable Control API.",
  },
  "cli-0.1.6": {
    title: "Self-updates with signed checksums.",
    summary: "A working self-updater and keyless checksum signing arrive with installer, dependency, and deployment hardening.",
    highlights: ["Add health checks to the five container images.", "Fix browser Basic Auth prompts and reduce repeated CLI error output."],
  },
  "cli-0.1.5": {
    title: "Packaging and documentation refinements.",
    summary: "Refresh wrapper packages, improve the Python package guide, update desktop download links, and add the dashboard favicon.",
  },
  "cli-0.1.4": {
    title: "A clean way to remove local data.",
    summary: "The uninstall command clears local trqsh data, with updated package instructions and the corrected npm package name.",
  },
  "cli-0.1.3": {
    title: "Background tunnels and a native desktop app.",
    summary: "Browser login, account commands, background tunnels, and the Tauri desktop app join improvements to edge forwarding and deployment.",
    highlights: ["Publish the public plan catalog and add distributed rate limiting.", "Improve desktop tray behavior, update checks, and local inspector controls."],
  },
  "cli-0.1.2": {
    title: "Connecting the account experience.",
    summary: "Connect OAuth sign-in to the dashboard, store profile avatars, and improve session handling, reserved-host routing, and download pages.",
  },
  "cli-0.1.1": {
    title: "Separate downloads for the CLI and edge.",
    summary: "Split CLI and edge archives so each download contains the intended component.",
  },
  "desktop-0.3.1": {
    title: "Desktop preview 0.3.1.",
    summary: "A published desktop preview build. The original notes identify it as unsigned and do not list individual feature changes.",
  },
  "desktop-0.3.0": {
    title: "Desktop preview 0.3.0.",
    summary: "A published desktop preview build. See the original notes for signing and first-launch information; no individual changes were published.",
  },
  "desktop-0.2.3": {
    title: "The little desktop details, fixed.",
    summary: "Fix new-tunnel input focus, add a working update check and launch banner, and keep tunnels running when the window closes to the tray.",
    highlights: ["Inspector Clear removes retained history and tunnel uptime survives reloads.", "The installer stops the running agent before updating to avoid file-in-use errors."],
  },
  "desktop-0.2.0": {
    title: "Desktop preview 0.2.0.",
    summary: "An unsigned desktop preview release. Its published notes cover first launch without a detailed feature changelog.",
  },
  "desktop-0.1.2": {
    title: "An early desktop preview.",
    summary: "An early unsigned desktop build. The published notes describe the Windows first-launch warning and contain no individual feature changes.",
  },
};

export const changelogCheckedOn = snapshot.checkedOn;
export const publishedReleases = snapshot.releases;
export const changelogEntries: ChangelogEntry[] = publishedReleases.map((release) => {
  const description = descriptions[release.id] ?? {
    title: release.name,
    summary: release.body ? "Read the published release notes below for the full changes." : "No release notes were published for this version.",
  };
  return {
    id: release.id,
    product: release.product as ReleaseProduct,
    version: release.version,
    publishedAt: release.publishedAt,
    url: release.url,
    prerelease: release.prerelease,
    preview: release.preview,
    title: description.title,
    summary: description.summary,
    highlights: description.highlights ?? [],
    searchText: `${release.name} ${release.version} ${description.title} ${description.summary} ${release.body}`.toLowerCase(),
  };
});

