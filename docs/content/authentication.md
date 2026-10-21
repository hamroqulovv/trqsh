# Authentication

The agent uses an **API key** to authenticate to the edge and Control API. Browser dashboard sessions use access and refresh tokens. The local agent also has a separate loopback control token; it is not your cloud API key.

## Browser sign-in

Launch `trqsh` in a terminal and enter:

~~~text
/login
~~~

1. trqsh requests a device code and prints an approval URL.
2. Open that URL in your browser.
3. Sign in with GitHub or Google using a verified email address.
4. Check the displayed code and approve this device.
5. Return to the console and run `/whoami`.

Device approvals expire after **10 minutes**. If the code expires, start `/login` again. OAuth providers appear only when the operator has configured them.

Public sign-in has no email-only form. OAuth uses a stable provider account ID,
PKCE and a browser-bound single-use state. Accounts from an earlier deployment
that lack a provider ID require operator review; an email match never merges
accounts automatically. The isolated development API test shortcut is disabled
by default and is always rejected in production.

## Use an existing API key

Create a key under **API keys** in the dashboard. Copy it immediately: the full value is returned once; later listings show its prefix and metadata.

Inside the console:

~~~text
/login YOUR_API_KEY
/whoami
~~~

Treat direct-key input as sensitive: it can remain in terminal history or screenshots. An environment variable is preferable when another tool supplies the secret.

On macOS/Linux, set the key before launching:

~~~sh
export TRQSH_API_KEY="YOUR_API_KEY"
trqsh
~~~

On Windows PowerShell:

~~~powershell
$env:TRQSH_API_KEY = "YOUR_API_KEY"
trqsh
~~~

`YOUR_API_KEY` is a placeholder, not a working credential. There is no root `--api-key` flag in the current console launcher.

## Storage and precedence

The normal config location is:

- macOS/Linux: `~/.trqsh/trqsh.yml`
- Windows: `%USERPROFILE%\.trqsh\trqsh.yml`

The key is persisted in the YAML `api_key` field, **not an OS keychain**. Config writes use restrictive permissions on Unix; on Windows, protect the user profile using its filesystem permissions.

The loader applies defaults, the config file, then supported environment variables. Root flags override the fields they expose. See [Configuration](/docs/configuration) for the exact list.

For a custom persistent location, set `TRQSH_CONFIG` before launching. Browser/direct-key login persists to that environment-selected path. `--config` alone changes the file read at startup; use `TRQSH_CONFIG` when you also need login persistence at the custom path.

## Check sign-in and connectivity

~~~text
/whoami
/status
~~~

`/whoami` checks your account and effective plan through the Control API. `/status` shows the agent connection to the edge. The agent connects to the edge when a tunnel starts, so an idle agent may be signed in while its edge status is disconnected.

A key from one self-hosted deployment does not authenticate to another. Configure both `api_base` and `server` for the same deployment.

## Rotate or revoke a key

Create a separate key for each computer or automation. To rotate one:

1. Create a replacement key in the dashboard.
2. Update that computer's environment/config or sign in with the replacement.
3. Restart the agent if it was already running.
4. Verify a new tunnel works.
5. Revoke the old key in the dashboard.

Revocation rejects subsequent API authentication and tunnel bind checks. Do not assume it forcibly disconnects every already-established stream immediately.

## Sign out

~~~text
/logout
~~~

The logout action stops the local agent's tunnels and clears the stored key. It does not revoke the cloud key. Revoke that key separately if you no longer trust the machine.

If `TRQSH_API_KEY` remains set, a later agent launch loads it again. Remove the environment variable as well when signing out completely.

## Common failures

- [ERR_AUTH_REQUIRED](/docs/errors#err_auth_required): supply a key or complete device approval.
- [ERR_AUTH_INVALID](/docs/errors#err_auth_invalid): check the key, its revocation state and the selected deployment.
- Browser sign-in works but tunneling fails: verify the edge address/port in [Troubleshooting](/docs/troubleshooting).
