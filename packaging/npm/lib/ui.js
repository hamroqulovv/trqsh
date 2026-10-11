"use strict";

// Install hooks never read stdin. Progress is measured bytes, not a timer.
module.exports = function installerUI(out = process.stderr, env = process.env) {
  const live = !!out.isTTY && !env.CI && env.TERM !== "dumb" && !env.NO_COLOR && !env.TRQSH_NO_COLOR;
  let active = false;
  let last = 0;
  const clean = (s) => String(s).replace(/[\x00-\x1f\x7f]/g, " ");
  function end() {
    if (active) out.write("\n");
    active = false;
  }
  return {
    title(version, platform) {
      out.write(`\n  trqsh / install\n  Localhost, online.\n\n`);
      this.step("Platform", platform);
      this.step("Release", `v${version}`);
    },
    step(label, detail, status = "ok") {
      end();
      out.write(`  [${status}] ${clean(label)}  ${clean(detail)}\n`);
    },
    progress(bytes, total) {
      if (!live || Date.now() - last < 100) return;
      last = Date.now();
      const mb = (n) => (n / 1048576).toFixed(1);
      let line = `  [..] Downloading  ${mb(bytes)}${total > 0 ? ` / ${mb(total)}` : ""} MB`;
      line = line.slice(0, Math.max(1, (out.columns || 80) - 1));
      out.write(`\r\x1b[2K${line}`);
      active = true;
    },
    finish(binary) {
      this.step("Ready", binary);
      out.write("\n  Ready to launch. Run: trqsh\n\n");
    },
    end,
  };
};
