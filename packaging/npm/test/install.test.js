"use strict";
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "trqsh-install-test-"));
const originalExec = cp.execFileSync;
// Fixture binaries are inert bytes. Only --version is simulated; archive
// extraction, downloads, checksum and publication use real implementation.
cp.execFileSync = function (file, args, options) {
  if (args[0] === "--version") {
    const content = fs.readFileSync(file, "utf8");
    if (content.startsWith("fixture:")) return `trqsh ${content.slice(8)}\n`;
    throw new Error("broken binary");
  }
  return originalExec(file, args, options);
};
const C = require("../lib/common");
const installer = require("../lib/install");
cp.execFileSync = originalExec;
C.vendorDir = path.join(temp, "vendor");
C.binPath = path.join(C.vendorDir, C.binName);
const archive = C.target().archive;
const source = path.join(temp, "source"); fs.mkdirSync(source);
fs.writeFileSync(path.join(source, C.binName), `fixture:${C.VERSION}`);
const archivePath = path.join(temp, archive);
if (process.platform === "win32") {
  originalExec("powershell", ["-NoProfile", "-NonInteractive", "-Command", "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:TEST_SRC, $env:TEST_ZIP)"],
    { env: { ...process.env, TEST_SRC: source, TEST_ZIP: archivePath }, windowsHide: true });
} else {
  originalExec("tar", ["-czf", archivePath, "-C", source, C.binName]);
}
const data = fs.readFileSync(archivePath);
let checksumMode = "ok";
const server = http.createServer((req, res) => {
  if (req.url === "/abort") { res.writeHead(200, {"Content-Length":1000}); res.write("partial"); setImmediate(()=>res.destroy()); return; }
  if (req.url === "/missing") { res.writeHead(404); res.end(); return; }
  if (req.url === "/checksums.txt") {
    if (checksumMode === "missing") { res.writeHead(404); res.end(); return; }
    res.end(`${checksumMode === "bad" ? "0".repeat(64) : crypto.createHash("sha256").update(data).digest("hex")}  ${archive}\n`); return;
  }
  res.setHeader("Content-Length", data.length); res.end(data);
});
after(async()=>{ await new Promise(r=>server.close(r)); fs.rmSync(temp,{recursive:true,force:true}); });

test("installer verifies, stages, retries and honors explicit pins", async()=>{
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  const base=`http://127.0.0.1:${server.address().port}`;
  C.archiveUrl=()=>`${base}/${archive}`; C.checksumsUrl=`${base}/checksums.txt`;
  await assert.rejects(installer.fetch(`${base}/missing`), /HTTP 404/);
  await assert.rejects(installer.fetch(`${base}/abort`), /interrupted|aborted/);
  checksumMode="missing";
  await assert.rejects(installer.install(), /checksums.txt/);
  assert.throws(() => fs.readFileSync(C.binPath), { code: "ENOENT" });
  checksumMode="bad";
  await assert.rejects(installer.install(), /checksum mismatch/);
  checksumMode="ok";
  await installer.install();
  assert.equal(fs.readFileSync(C.binPath,"utf8"),`fixture:${C.VERSION}`);
  assert.deepEqual(fs.readdirSync(C.vendorDir),[C.binName]);
  fs.writeFileSync(C.binPath,"fixture:0.2.1");
  assert.equal(installer.cachedBinaryOK(),false,"older cached binary must be replaced");
  checksumMode="bad";
  await assert.rejects(installer.install(), /checksum mismatch/);
  assert.equal(fs.readFileSync(C.binPath,"utf8"),"fixture:0.2.1","failed upgrade preserves the old binary");
  checksumMode="ok";
  await installer.install();
  assert.equal(fs.readFileSync(C.binPath,"utf8"),`fixture:${C.VERSION}`,"upgrade replaces old binary without an explicit pin");
  fs.writeFileSync(C.binPath,"fixture:99.0.0");
  assert.equal(installer.cachedBinaryOK(),true,"self-update preserved");
  const oldPin=process.env.TRQSH_VERSION;
  process.env.TRQSH_VERSION=C.VERSION;
  assert.equal(installer.cachedBinaryOK(),false,"explicit pin honored");
  checksumMode="bad";
  await assert.rejects(installer.install(), /checksum mismatch/);
  assert.equal(fs.readFileSync(C.binPath,"utf8"),"fixture:99.0.0","old binary intact");
  checksumMode="ok"; await installer.install();
  if(oldPin===undefined) delete process.env.TRQSH_VERSION; else process.env.TRQSH_VERSION=oldPin;
});

test("cached versions use semantic ordering",()=>{
  for (const [current, required, want] of [
    ["0.2.1", "0.2.5", false], ["0.2.10", "0.2.9", true],
    ["0.2.5-beta.10", "0.2.5-beta.2", true], ["0.2.5-beta", "0.2.5", false],
    ["0.2.5", "0.2.5-beta", true], ["0.2.5+build", "0.2.5", true],
    ["0.2.5-1", "0.2.5-beta", false], ["broken", "0.2.5", false],
  ]) assert.equal(installer.versionAtLeast(current, required),want,`${current} >= ${required}`);
});

test("global PATH check detects an earlier Python launcher",()=>{
  const python = path.join(temp,"python-scripts"), npm = path.join(temp,"npm-bin");
  fs.mkdirSync(python); fs.mkdirSync(npm);
  const old = path.join(python,"trqsh.exe"); fs.writeFileSync(old,"old launcher");
  assert.equal(installer.findShadowingCommand(npm,[python,npm]),old);
  assert.equal(installer.findShadowingCommand(npm,[npm,python]),null);
  assert.equal(installer.findShadowingCommand(npm,[source,npm]),path.join(source,C.binName));
});

test("plain installer output has no animation or false global-install claim",()=>{
  let output="";
  const ui=require("../lib/ui")({write:s=>output+=s,isTTY:false},{});
  ui.title("1.2.3","windows / amd64"); ui.progress(50,100); ui.finish("test/binary");
  assert.match(output,/trqsh \/ install/);
  assert.match(output,/Run: trqsh/);
  assert.doesNotMatch(output,/[\x1b\r]|globally/);
});
