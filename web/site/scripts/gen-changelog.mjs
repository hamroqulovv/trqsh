// Refresh the checked-in release history. Normal builds never contact GitHub.
// Usage: node scripts/gen-changelog.mjs [--github-cli]
// Use --github-cli for an existing authenticated gh session, or GITHUB_TOKEN
// for private repositories. Tokens are never written into the snapshot.
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const repositories = [
  { repository: "trqsh-tunnel/trqshcli", product: "cli" },
  { repository: "trqsh-tunnel/trqsh", product: "source" },
];
const useCLI = process.argv.includes("--github-cli");

async function getPage(repository, page) {
  const endpoint = `repos/${repository}/releases?per_page=100&page=${page}`;
  if (useCLI) {
    return JSON.parse(execFileSync("gh", ["api", endpoint], {
      encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    }));
  }
  const response = await fetch(`https://api.github.com/${endpoint}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub ${repository}: HTTP ${response.status}`);
  return response.json();
}

const records = [];
for (const { repository, product } of repositories) {
  for (let page = 1; ; page++) {
    const releases = await getPage(repository, page);
    for (const release of releases) {
      // Drafts are private working notes, not published changelogs.
      if (release.draft || !release.published_at) continue;
      const desktop = /^desktop-v\d/.test(release.tag_name);
      if (!desktop && !/^v\d/.test(release.tag_name)) continue;
      const version = release.tag_name.replace(/^(?:desktop-)?v/, "");
      const url = new URL(release.html_url);
      if (url.origin !== "https://github.com") throw new Error("Unexpected release URL");
      records.push({
        id: `${desktop ? "desktop" : "cli"}-${version}`,
        product: desktop ? "desktop" : "cli",
        version,
        tag: release.tag_name,
        name: release.name || release.tag_name,
        publishedAt: release.published_at,
        url: url.href,
        repository,
        prerelease: Boolean(release.prerelease),
        preview: desktop && /preview build/i.test(release.body || ""),
        body: (release.body || "").trim(),
        // When a historical CLI release exists in both repositories, keep
        // the CLI release repository's copy as the canonical record.
        priority: product === "cli" ? 1 : 0,
      });
    }
    if (releases.length < 100) break;
  }
}

const unique = new Map();
for (const record of records) {
  if (!unique.has(record.id) || unique.get(record.id).priority < record.priority) {
    unique.set(record.id, record);
  }
}
const releases = [...unique.values()]
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id))
  .map(({ priority, ...release }) => release);
if (!releases.some((release) => release.product === "cli")) {
  throw new Error("No CLI releases returned; leaving the existing snapshot untouched");
}
const snapshot = {
  schemaVersion: 1,
  checkedOn: new Date().toISOString().slice(0, 10),
  sources: repositories.map(({ repository }) => `https://github.com/${repository}/releases`),
  releases,
};
await writeFile(new URL("../lib/changelog.generated.json", import.meta.url),
  JSON.stringify(snapshot, null, 2) + "\n");
console.log(`Saved ${releases.length} published CLI and desktop releases.`);
