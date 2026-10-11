![trqsh — Localhost, online.](../assets/readme-banner.svg)

# trqsh · Scoop

**Windows CLI distribution through a Scoop manifest.**

[Manifest](trqsh.json) · [Distribution guide](../README.md) · [CLI releases](https://github.com/algorithco/trqshcli/releases)

## Status

The manifest supports x64 and arm64, but still pins **0.1.2** and legacy
`uzcreator/trqshcli` URLs. Refresh it before publishing a bucket update. This
guide does not assert availability of an up-to-date public bucket.

For the current wrapper flow, use the [npm](../npm/README.md) or
[Python](../pypi/README.md) package.

## Prepare a release

| Field | Required update |
| --- | --- |
| `version` | Match the native CLI release. |
| Architecture `url` values | Use the exact published Windows archive URLs. |
| Architecture `hash` values | Copy the SHA-256 values for those exact archives. |
| `autoupdate` URLs | Align archive and checksum templates with the release repository. |
| `checkver` | Verify that discovery tracks CLI releases. |

The `bin` entry remains `trqsh.exe`. Test both architecture entries before
publishing a bucket update.

## Local validation

After updating the manifest, run from this directory in PowerShell:

```powershell
scoop install .\trqsh.json
trqsh --version
trqsh
```

Confirm the version, executable discovery and first-run setup with a release
that includes the welcome guide.

## Update and removal

After the manifest is published to your configured bucket:

```powershell
scoop update trqsh
scoop uninstall trqsh
```

To also clear local credentials and configuration, run `/uninstall` and then
`/uninstall yes` inside the CLI before package removal. The cloud account is
unaffected.

---

[Manifest source](trqsh.json) · [License](../../LICENSE)
