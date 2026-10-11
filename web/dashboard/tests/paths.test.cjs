const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/paths.ts"), "utf8");
const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const context = { exports: {}, process: { env: {} } };
vm.runInNewContext(result.outputText, context);
const { safeDashboardNextPath } = context.exports;

test("OAuth destinations cannot change origin after URL normalization", () => {
  for (const value of ["//attacker.test", "/\\attacker.test", "/\t/attacker.test", "/\r\n/attacker.test", "https://attacker.test", "/path\\suffix"]) {
    const safe = safeDashboardNextPath(value);
    assert.equal(safe, "/", JSON.stringify(value));
    assert.equal(new URL(safe, "https://app.example.test").origin, "https://app.example.test");
  }
});

test("OAuth destinations preserve device approvals and encoded paths", () => {
  for (const value of ["/", "/device?code=ABCD", "/settings?next=%2Ffoo", "/path%20with%20spaces"]) {
    assert.equal(safeDashboardNextPath(value), value);
  }
});
