// Loads the site's TypeScript modules into plain Node for tests. Like the
// dashboard tests it transpiles with the `typescript` package, but it also
// follows relative and "@/" imports so modules that import each other work.
// Only data and server-side helpers are loadable: React, Next and anything
// else not listed in `allowed` is refused so tests cannot drift into the UI.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const allowed = new Set(["node:fs", "node:path", "marked"]);

function resolve(request, from) {
  const base = request.startsWith("@/")
    ? path.join(root, request.slice(2))
    : path.resolve(path.dirname(from), request);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Cannot resolve "${request}" imported by ${path.relative(root, from)}`);
}

/**
 * Returns `load(relativePath)` for a fresh module registry whose `process.env`
 * is `env`. Modules such as lib/site.ts read the environment when imported, so
 * each environment needs its own registry.
 */
function createLoader(env = {}) {
  const registry = new Map();
  const fakeProcess = { env, cwd: () => root };

  function load(file) {
    if (registry.has(file)) return registry.get(file).exports;
    const module = { exports: {} };
    registry.set(file, module);
    if (file.endsWith(".json")) {
      module.exports = JSON.parse(fs.readFileSync(file, "utf8"));
      return module.exports;
    }
    const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    const localRequire = (request) => {
      if (request.startsWith(".") || request.startsWith("@/")) return load(resolve(request, file));
      if (allowed.has(request)) return require(request);
      throw new Error(`Test loader does not provide "${request}" (imported by ${path.relative(root, file)})`);
    };
    // Same realm as the tests, so arrays and objects compare with deepStrictEqual.
    const run = vm.runInThisContext(
      `(function (exports, require, module, process) {${outputText}\n})`,
      { filename: file },
    );
    run(module.exports, localRequire, module, fakeProcess);
    return module.exports;
  }

  return (relativePath) => load(path.join(root, relativePath));
}

module.exports = { createLoader, root };
