const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/api.ts"), "utf8");
// ES2022 keeps `class ApiError extends Error` native, so instanceof behaves as it does in Next.
const result = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

let responses = [];
const requested = [];
const logged = [];
const context = {
  exports: {},
  process: { env: {} },
  require: (id) => {
    assert.equal(id, "./session");
    return { getTokens: async () => ({ access: "access-token" }), setTokens: async () => {} };
  },
  fetch: async (url) => {
    requested.push(new URL(url).pathname);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  },
  Response,
  AbortSignal,
  DOMException,
  console: { error: (...args) => logged.push(args.join(" ")) },
};
vm.runInNewContext(result.outputText, context);
const { api, safe } = context.exports;

function reply(status, body) {
  responses = [new Response(body, { status, headers: { "Content-Type": "application/json" } })];
  requested.length = 0;
  logged.length = 0;
}

test("an empty list sent as null is an empty list, not a failed request", async () => {
  for (const name of ["orgs", "apiKeys", "subdomains", "domains", "tunnels", "plans"]) {
    reply(200, "null\n");
    const list = await safe(api[name]());
    assert.ok(Array.isArray(list), `${name} returned ${JSON.stringify(list)}`);
    assert.equal(list.length, 0, name);
    assert.deepEqual(logged, [], name);
  }
});

test("a list with items comes through unchanged", async () => {
  reply(200, JSON.stringify([{ id: "dom_1", domain: "example.com" }]));
  assert.equal(JSON.stringify(await api.domains()), '[{"id":"dom_1","domain":"example.com"}]');
  assert.deepEqual(requested, ["/v1/domains"]);
});

test("a failed request still resolves to null, and the reason is logged", async () => {
  reply(500, JSON.stringify({ error: "database is unavailable" }));
  assert.equal(await safe(api.domains()), null);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /500 database is unavailable/);

  reply(200, "");
  responses = [new TypeError("fetch failed")];
  assert.equal(await safe(api.subdomains()), null);
  assert.match(logged[0], /503 Can't reach the trqsh API/);
});

test("an expired session resolves to null without a log line", async () => {
  reply(401, JSON.stringify({ error: "unauthorized" }));
  assert.equal(await safe(api.domains()), null);
  assert.deepEqual(logged, []);
});
