import { site } from "./site";

const v = site.version;
const base = `${site.cliGithubUrl}/releases/download/v${v}`;
export const releasesUrl = `${site.cliGithubUrl}/releases/latest`;
export const checksumsUrl = `${base}/checksums.txt`;
export const installShCommand = `curl -fsSL ${site.installShUrl} | sh`;

export type OSId = "macos" | "windows" | "linux";
export type Arch = "arm64" | "amd64";
export interface Asset { label: string; href: string; arch: Arch; kind: string; }
export interface InstallSnippet {
  label: string;
  command: string;
  requirement: string;
  description: string;
  recommended?: boolean;
}
export interface OSDownload {
  id: OSId; name: string; tagline: string;
  cli: InstallSnippet[];
  archives: Asset[];
}
const npm: InstallSnippet = {
  label: "npm",
  command: "npm install -g @trqsh-uz/trqsh --foreground-scripts",
  requirement: "Requires Node.js 16+ and npm.",
  description: "Installs the native CLI and makes it available through your npm binary directory.",
};
const python: InstallSnippet = {
  label: "Python",
  command: "pipx install trqsh",
  requirement: "Requires Python 3.8+ and pipx.",
  description: "Installs an isolated Python wrapper that downloads the native CLI on first launch.",
};
const script: InstallSnippet = {
  label: "Shell",
  command: installShCommand,
  requirement: "Requires curl, tar and a SHA-256 tool.",
  description: "Detects your platform, verifies the archive checksum and installs the native CLI.",
  recommended: true,
};
const archive = (os: string, arch: Arch, label: string, kind = "tar.gz"): Asset => ({
  label, arch, kind, href: `${base}/trqsh_${v}_${os}_${arch}.${kind}`,
});
export const OS_DOWNLOADS: Record<OSId, OSDownload> = {
  macos: {
    id: "macos", name: "macOS", tagline: "Apple Silicon and Intel",
    cli: [script, npm, python],
    archives: [archive("darwin", "arm64", "Apple Silicon"), archive("darwin", "amd64", "Intel")],
  },
  windows: {
    id: "windows", name: "Windows", tagline: "x64 and ARM64",
    cli: [{ ...npm, recommended: true }, python],
    archives: [archive("windows", "amd64", "Windows x64", "zip"), archive("windows", "arm64", "Windows ARM64", "zip")],
  },
  linux: {
    id: "linux", name: "Linux", tagline: "x64 and ARM64",
    cli: [script, npm, python],
    archives: [
      archive("linux", "amd64", "Linux x64"), archive("linux", "arm64", "Linux ARM64"),
      archive("linux", "amd64", "Debian / Ubuntu · x64", "deb"), archive("linux", "arm64", "Debian / Ubuntu · ARM64", "deb"),
      archive("linux", "amd64", "Fedora / RHEL · x64", "rpm"), archive("linux", "arm64", "Fedora / RHEL · ARM64", "rpm"),
    ],
  },
};
export const OS_ORDER: OSId[] = ["macos", "windows", "linux"];
export const OS_LABEL: Record<OSId, string> = { macos: "macOS", windows: "Windows", linux: "Linux" };
export const ARCH_LABEL: Record<Arch, string> = { arm64: "Apple Silicon / ARM64", amd64: "Intel / x64" };

/** Standalone CLI archives precede the Linux packages in each platform list. */
export function archiveFor(os: OSId, arch: Arch | null): Asset {
  const list = OS_DOWNLOADS[os].archives;
  return list.find((asset) => asset.arch === arch) ?? list[0];
}
export const primaryDownload = archiveFor;
export function primaryCli(os: OSId): InstallSnippet {
  return OS_DOWNLOADS[os].cli.find((snippet) => snippet.recommended) ?? OS_DOWNLOADS[os].cli[0];
}
