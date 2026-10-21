## CLI 0.2.7 — a friendlier console

- Destructive commands (`/uninstall`, `/down`, `/stop all`, `/logout`) ask for a
  Y/N confirmation instead of requiring `/uninstall yes`; `/uninstall yes` still
  skips the question.
- One-key shortcuts for common tunnel actions, a `?` shortcut sheet, a
  Tab-filled suggested next step, and Ctrl+C that clears the prompt before it
  quits.
- Command results appear as framed cards, with the logo mark and highlighted key
  hints in the header.
- Suggests tunnel targets by detecting popular dev servers already running on
  localhost.
- Shows "Waiting for sign-in" while the browser approval is pending, and says
  why an agent was rejected instead of "session closed".

Update with `trqsh update`, your package manager, or the installers at
https://trqsh.uz/docs/installation.
