<div align="center">

<img src="https://raw.githubusercontent.com/trqsh-tunnel/trqsh/main/assets/brand/trqsh-logo-rounded.svg?v=41c1715b161a" width="160" height="160" alt="trqsh logo" />

# trqsh

**Your localhost, live on the internet.**

Open-source tunneling tools for developers: a QUIC-first agent, a self-hosted edge and control plane, and web and desktop interfaces.

[Source](https://github.com/trqsh-tunnel/trqsh) · [CLI releases](https://github.com/trqsh-tunnel/trqshcli/releases) · [Documentation](https://github.com/trqsh-tunnel/trqsh/tree/main/docs) · [Contributing](https://github.com/trqsh-tunnel/trqsh/blob/main/CONTRIBUTING.md)

</div>

Expose a local HTTP service, test webhooks, share a development app or run your own tunnel platform. trqsh supports HTTP, TCP and UDP workflows, with QUIC, TCP and WebSocket agent transports subject to the selected deployment and plan.

| Repository | Purpose |
| --- | --- |
| [trqsh](https://github.com/trqsh-tunnel/trqsh) | Agent/CLI, edge, Control API, dashboard, desktop app and self-hosting infrastructure |
| [trqshcli](https://github.com/trqsh-tunnel/trqshcli) | CLI release artifacts and packages |
| [.github](https://github.com/trqsh-tunnel/.github) | Organization profile and community information |

**Start with the [CLI guide](https://github.com/trqsh-tunnel/trqsh/blob/main/docs/content/quickstart.md)** to use an existing service, or the [self-hosting guide](https://github.com/trqsh-tunnel/trqsh/blob/main/docs/content/self-hosting.md) to operate the platform yourself. Availability of the website does not imply that every tunnel protocol is publicly reachable.

Built with Go, QUIC, PostgreSQL, Redis, Next.js and Tauri. Created and maintained by [Otabek Hamroqulov](https://github.com/Hamroqulovv); contributions are welcome.

Report vulnerabilities through the [security policy](https://github.com/trqsh-tunnel/trqsh/blob/main/SECURITY.md).

**License status:** the current published source remains [Apache-2.0](https://github.com/trqsh-tunnel/trqsh/blob/main/LICENSE). An AGPLv3 transition is planned; it takes effect only when the license change is released. Commercial use remains allowed under the planned AGPLv3 terms.

<!-- Publishing order: merge the logo asset into the main source repository first,
then update trqsh-tunnel/.github/profile/README.md. Remove this comment when published.
This file is a local draft; it has not changed the public organization profile. -->
