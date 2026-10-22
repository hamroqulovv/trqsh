## CLI 0.2.8 — see what's running on localhost

- trqsh scans your machine's localhost ports as soon as the console opens and
  works out what is behind each one: a Vite or Next.js dev server, a Django or
  Express API, a database, a Docker-published container.
- The scan takes milliseconds. It reads the operating system's listening-socket
  table (no port guessing), then sends one short `GET /` to each candidate in
  parallel. Databases, SSH and OS services are recognised from the process and
  port and are never sent a request. Nothing leaves your machine.
- New `/ports` command shows the result as a card: port, detected app, page
  title, owning process, whether it is already shared (`↗`) and whether it
  listens on your whole network (`lan`). `/ports all` also lists OS services.
- The welcome screen and the `/http` picker now name what they found
  ("Share Vite · “My App”") instead of showing bare port numbers.
- Works on Windows, Linux and macOS; falls back to checking common dev ports if
  the socket table can't be read.

Update with `trqsh update`, your package manager, or the installers at
https://trqsh.uz/docs/installation.
