# Installation

Install the CLI on Windows, macOS or Linux, then run it in an interactive terminal. Supported release architectures are **amd64/x64** and **arm64**.

The CLI is available now. A desktop app is planned for a future release.

## npm: Windows, macOS and Linux

Requires Node.js 16 or later and npm. The package installs the native trqsh binary for your platform.

~~~sh
npm install -g @trqsh-uz/trqsh --foreground-scripts
trqsh --version
trqsh
~~~

For a one-off launch:

~~~sh
npx @trqsh-uz/trqsh
~~~

Use the scoped package name `@trqsh-uz/trqsh`. The wrapper downloads a release artifact during installation, so it needs access to GitHub.

`--foreground-scripts` makes the installer's platform, download, checksum and ready steps visible. It never asks for input during package installation. Without this flag, npm may hide those messages. If install scripts were skipped, the launcher prepares the binary on first use.

On a fresh configuration, running `trqsh` opens a welcome guide. Choose browser sign-in, enter an API key in a masked field, or select **Set up later**. After sign-in, choose a local HTTP port to expose or open the console. A tunnel starts only when you choose to start it. Existing configurations and explicit commands such as `trqsh http 3000` keep their normal startup behavior.

Run `trqsh setup`, or `/setup` inside the console, to reopen the guide. `Esc` skips the guide and cancels pending setup sign-in; you can use `/login` later.

## Python package

Requires Python 3.8 or later. If you use pipx:

~~~sh
pipx install trqsh
trqsh --version
~~~

Alternatively:

~~~sh
python -m pip install --user trqsh
python -m trqsh --version
python -m trqsh
~~~

The Python wrapper downloads the native CLI on first use. If `trqsh` is not on PATH, the `python -m trqsh` form still works with the same Python environment.

## Shell installer: macOS and Linux

~~~sh
curl -fsSL https://trqsh.uz/install.sh | sh
~~~

The script chooses `/usr/local/bin` when writable; otherwise it uses `~/.local/bin`. If necessary, add the printed installation directory to PATH and open a new terminal.

To read the script before running it:

~~~sh
curl -fsSL https://trqsh.uz/install.sh -o trqsh-install.sh
sh trqsh-install.sh
~~~

You can choose a directory or release explicitly:

~~~sh
TRQSH_BINDIR="$HOME/.local/bin" sh trqsh-install.sh
TRQSH_VERSION=X.Y.Z sh trqsh-install.sh
~~~

Replace `X.Y.Z` with a published CLI version. Avoid installing the same binary through several package managers.

## Manual archive

Open [Downloads](/download), then select your operating system and processor architecture in the manual download panel or direct downloads section.

| Platform | Archive | Binary |
| --- | --- | --- |
| Windows | `trqsh_VERSION_windows_ARCH.zip` | `trqsh.exe` |
| macOS | `trqsh_VERSION_darwin_ARCH.tar.gz` | `trqsh` |
| Linux | `trqsh_VERSION_linux_ARCH.tar.gz` | `trqsh` |

Extract the archive, place the binary in a directory on PATH, and reopen your terminal. On macOS/Linux, make it executable with `chmod +x trqsh`.

Release pages include `checksums.txt`. Compare the SHA-256 for the exact archive you downloaded:

~~~powershell
# Windows PowerShell
Get-FileHash .\YOUR-ARCHIVE.zip -Algorithm SHA256
~~~

~~~sh
# macOS
shasum -a 256 YOUR-ARCHIVE.tar.gz

# Linux
sha256sum YOUR-ARCHIVE.tar.gz
~~~

A checksum confirms that the file matches the release's checksum list. Release signature bundles provide an additional origin check; see the repository packaging guide for that procedure.

## Desktop app

The desktop app is planned for a future release and is not currently offered on the download page. Use the CLI installation methods above to start and manage tunnels today.

## Verify installation

~~~sh
trqsh --version
trqsh --help
trqsh
~~~

Inside the console, run `/version` and `/help`. If the shell cannot find the command, check PATH. On Windows, `Get-Command trqsh` shows which executable or wrapper is selected; on macOS/Linux, use `command -v trqsh`.

## Update and uninstall

Inside the console:

~~~text
/update check
/update
~~~

Restart the console after a successful update. For package-managed installs, updating through the original manager keeps its records consistent:

~~~sh
npm install -g @trqsh-uz/trqsh@latest
python -m pip install --upgrade trqsh
~~~

`/uninstall` explains local-data removal and requires `/uninstall yes` to proceed. It stops tunnels and removes local credentials/configuration/cache; it does not delete your cloud account. Remove the package itself with its installer or package manager, for example `npm uninstall -g @trqsh-uz/trqsh` or `python -m pip uninstall trqsh`.

Next: [Create your first tunnel](/docs/quickstart).
