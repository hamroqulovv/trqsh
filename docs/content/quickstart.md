# Quickstart

Create a public HTTPS URL for a service running on your computer. Your app keeps running locally; trqsh forwards traffic from the edge to its local port.

## Before you begin

You need an installed CLI, a trqsh account and a local HTTP server. Follow [Installation](/docs/installation) if the `trqsh` command is not available.

These examples describe the current interactive console. Shell commands start with `trqsh`; commands beginning with `/` are typed **inside the trqsh console**. Use `trqsh --version` to identify your build and `/help` to see its commands.

## 1. Start your local app

Run your usual development command in a separate terminal. For example, start your app on port 3000 and confirm that it opens at `http://localhost:3000`.

If you need a simple test server and have Python installed:

~~~sh
python -m http.server 3000 --bind 127.0.0.1
~~~

Run this in a directory containing only files you intend to share. Keep the server terminal open.

## 2. Open trqsh and sign in

In another terminal:

~~~sh
trqsh
~~~

Then, inside the console:

~~~text
/login
~~~

Open the approval URL printed by trqsh, sign in and approve the displayed device code. If the browser does not open automatically, copy the printed URL. Return to the console after approval.

Already have an API key? See [Authentication](/docs/authentication) for the environment variable and direct-key options.

## 3. Start the tunnel

Inside the console:

~~~text
/http 3000
~~~

trqsh prints the assigned public URL and local destination. Copy the **actual URL from your console**; example hostnames in these docs are placeholders.

You can also start the console with the first command prefilled:

~~~sh
trqsh http 3000
~~~

The local target is HTTP even though visitors use HTTPS. No certificate is required on your local development server.

## 4. Check the full path

Open the printed HTTPS URL in a browser, or test it from another terminal:

~~~sh
curl -i https://YOUR-ASSIGNED-HOST/
~~~

Replace `YOUR-ASSIGNED-HOST` with the hostname trqsh printed. A successful request should return the same application content as your local URL.

Watch requests inside the console:

~~~text
/pin traffic
/requests
~~~

For headers, captured bodies and replay, open `http://127.0.0.1:4040` on the computer running trqsh. See [Request inspector](/docs/inspector).

## 5. Manage the tunnel

~~~text
/ls
/copy
/open
/stop all
~~~

`/ls` shows tunnel IDs. Use `/stop <id>` to stop one tunnel, or `/stop all` to stop every tunnel on this local agent.

**Closing the console does not stop the background agent.** `/quit` exits the console and leaves tunnels running. Use `/down` when you want to stop the agent and all its tunnels.

## If the URL does not work

First check the local app, then `/status`, then the [troubleshooting guide](/docs/troubleshooting). Signing in to the website and connecting to the edge are separate operations: the agent must also be able to reach the edge transport port.

For a local Docker deployment, use the addresses and configuration in [Self-hosting](/docs/self-hosting), rather than the hosted defaults.

## Continue

- [HTTP tunnels](/docs/http-tunnels): access protection, Host headers and WebSockets.
- [CLI reference](/docs/cli-reference): commands, shortcuts and lifecycle.
- [Reserved subdomains](/docs/reserved-subdomains): a stable URL across restarts.
- [Configuration](/docs/configuration): saved definitions and advanced options.
- [Dashboard](/docs/dashboard): API keys, usage and account resources.
