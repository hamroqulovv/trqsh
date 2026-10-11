# trqsh · Agent sidecar

**The native Go binary bundled by the desktop app.**

Tauri expects an executable named for the Rust target:

| Target example | Filename |
| --- | --- |
| Windows x64 | `trqsh-x86_64-pc-windows-msvc.exe` |
| macOS arm64 | `trqsh-aarch64-apple-darwin` |
| Linux x64 | `trqsh-x86_64-unknown-linux-gnu` |

Use `rustc -vV` to find the host triple. The executable must match the platform
and architecture being built.

For local development, build `cmd/trqsh` from this checkout. CI downloads and
verifies a released CLI before placing it here. Follow the
[desktop sidecar instructions](../../README.md#agent-sidecar) for exact commands.

Generated binaries are build inputs, not source files; keep them out of commits.
