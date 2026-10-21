# Dependency security updates — 2026-10-16

The security update replaces dependencies behind 62 open Dependabot alerts and
29 Trivy code-scanning alerts on the default branch. Alerts must be closed by
GitHub's dependency analysis and a fresh scan after merge; they are not dismissed.

| Dependency | Patched version used |
| --- | --- |
| Next.js (site and dashboard) | 15.5.27 |
| Vite (desktop build) | 6.4.3 |
| esbuild (through Vite) | 0.25.12 |
| sharp | 0.35.5 |
| js-yaml | 4.3.2 |
| postcss-selector-parser | 7.1.6 |
| source-map-js | 1.2.2 |
| browserslist | 4.28.7 |
| baseline-browser-mapping | 2.11.0 |
| nanoid | 3.3.18 or newer in the 3.x series |
| golang.org/x/net | 0.60.0 |
| golang.org/x/crypto | 0.57.0 |
| golang.org/x/mod | 0.41.0 |
| golang.org/x/text | 0.42.0 |
| google.golang.org/grpc | 1.83.2 |

The Go module and workspace now require Go 1.26, as required by the patched
dependency graph. CI, release workflows and Docker builders already use Go 1.26.

The pnpm overrides establish patched minimum versions for transitive CSS, image
and browser tooling dependencies. Tailwind 3 still requests selector-parser 6;
the override selects 7.1.6 because earlier versions remain affected by
[GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).
All three frontend production builds must pass when changing these overrides.
Next.js and Vite keep their current major versions.

## Remaining upstream issue

`pnpm audit` also reports Tailwind 3's transitive `braces@3.0.3` dependency
([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)).
The advisory and npm registry list no patched release as of 2026-10-16. It affects
parsing deeply nested glob patterns in the build/watch toolchain. The projects
use repository-controlled Tailwind content globs; do not pass untrusted patterns
to these tools. This finding remains visible in `pnpm audit` and is not suppressed.

Follow up when upstream publishes a fix, or migrate the Tailwind toolchain with
separate styling and watch-mode compatibility validation. The existing Trivy
workflow reports vulnerabilities with available fixes (`ignore-unfixed: true`);
its scanning settings are unchanged by this update.
