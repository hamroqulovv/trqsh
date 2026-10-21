![trqsh — Localhost, online.](../assets/readme-banner.svg)

# trqsh · Windows Package Manager

**Portable CLI manifests for winget distribution.**

[Installer manifest](trqsh.trqsh.installer.yaml) · [Distribution guide](../README.md) · [CLI releases](https://github.com/trqsh-tunnel/trqshcli/releases)

## Status

These manifests describe the published CLI **0.2.7** release, with its asset URLs
and SHA-256 values from `checksums.txt`. They have not been submitted to the
`microsoft/winget-pkgs` catalog yet, so `winget install trqsh.trqsh` does not
work until that submission is accepted.

Until then, use `irm https://trqsh.uz/install.ps1 | iex`, the
[npm](../npm/README.md) wrapper, or the [Python](../pypi/README.md) wrapper.

## Manifest set

| File | Responsibility |
| --- | --- |
| [trqsh.trqsh.yaml](trqsh.trqsh.yaml) | Package identity, version and default locale. |
| [trqsh.trqsh.installer.yaml](trqsh.trqsh.installer.yaml) | x64/arm64 archive URLs, checksums and portable command alias. |
| [trqsh.trqsh.locale.en-US.yaml](trqsh.trqsh.locale.en-US.yaml) | Publisher, description, license and support links. |

## Prepare and validate

1. Set the same published native release version in all three files.
2. Replace download URLs and checksum placeholders with the exact asset values.
3. Review publisher, source, license and support links.
4. Confirm each ZIP contains `trqsh.exe` at the configured relative path.

With winget installed, validate from this directory:

```powershell
winget validate --manifest .
```

Test the completed manifests on the target Windows architectures before catalog
submission. The intended path is `manifests/t/trqsh/trqsh/<version>/`.

## After catalog publication

Once the package is accepted and available in the configured source:

```powershell
winget install --id trqsh.trqsh --exact
trqsh --version
trqsh
```

Update or remove it through the same manager:

```powershell
winget upgrade --id trqsh.trqsh --exact
winget uninstall --id trqsh.trqsh --exact
```

To also clear local credentials and configuration, run `/uninstall` inside the
CLI and press `Y` before package removal. The cloud account is
unaffected.

---

[Manifest source](trqsh.trqsh.yaml) · [License](../../LICENSE)
