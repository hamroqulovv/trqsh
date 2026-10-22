const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/remote.ts"), "utf8");
const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const context = { exports: {}, URL };
vm.runInNewContext(result.outputText, context);
const { normalizePairingCode, safeHttpURL } = context.exports;

test("pairing codes are canonicalized from any case, with or without dashes", () => {
  for (const value of ["WDJB-MJHT-QP7K", "wdjb-mjht-qp7k", "WDJBMJHTQP7K", " wdjb mjht qp7k "]) {
    assert.equal(normalizePairingCode(value), "WDJB-MJHT-QP7K", JSON.stringify(value));
  }
});

test("anything that is not a pairing code is rejected before reaching a URL", () => {
  for (const value of ["", "..", "../../v1/account", "WDJB-MJHT-QP7", "WDJB-MJHT-QP7KK", "AEIU-AEIU-AEIU", "WDJB/MJHT/QP7K", "WDJB-MJHT-QP7K?x=1", "A".repeat(500)]) {
    assert.equal(normalizePairingCode(value), null, JSON.stringify(value));
  }
});

test("only http(s) tunnel addresses become links", () => {
  assert.equal(safeHttpURL("https://demo.trqsh.uz"), "https://demo.trqsh.uz/");
  for (const value of ["javascript:alert(1)", "data:text/html,<script>1</script>", "//evil.test", "not a url", ""]) {
    assert.equal(safeHttpURL(value), null, JSON.stringify(value));
  }
});
