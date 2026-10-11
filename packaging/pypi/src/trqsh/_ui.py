"""Dependency-free installer presentation; never reads stdin."""
import os
import sys
import time


class InstallUI:
    def __init__(self):
        self.live = (sys.stderr.isatty() and not os.environ.get("CI")
                     and os.environ.get("TERM") != "dumb"
                     and not os.environ.get("NO_COLOR")
                     and not os.environ.get("TRQSH_NO_COLOR"))
        self.active = False
        self.last = 0

    def end(self):
        if self.active:
            print(file=sys.stderr)
        self.active = False

    def step(self, name, detail, status="ok"):
        self.end()
        clean = "".join(c if c.isprintable() else " " for c in str(detail))
        print(f"  [{status}] {name}  {clean}", file=sys.stderr)

    def progress(self, received, total):
        if not self.live or time.monotonic() - self.last < .1:
            return
        self.last = time.monotonic()
        detail = f"{received / 1048576:.1f}"
        if total > 0:
            detail += f" / {total / 1048576:.1f}"
        print(f"\r  [..] Downloading  {detail} MB", end="", file=sys.stderr, flush=True)
        self.active = True

    def title(self, version, platform):
        print("\n  trqsh / install\n  Localhost, online.\n", file=sys.stderr)
        self.step("Platform", platform)
        self.step("Release", f"v{version}")
