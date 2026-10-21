import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ffmpeg = require('ffmpeg-static');
const probe = require('ffprobe-static').path;
mkdirSync(join(root, '.cache', 'tmp'), { recursive: true });
const chrome = process.env.HYPERFRAMES_BROWSER_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const env = {
  ...process.env,
  HYPERFRAMES_FFMPEG_PATH: ffmpeg,
  HYPERFRAMES_FFPROBE_PATH: probe,
  HYPERFRAMES_NO_UPDATE_CHECK: '1',
  HYPERFRAMES_NO_AUTO_INSTALL: '1',
  HYPERFRAMES_NO_TELEMETRY: '1',
  HYPERFRAMES_EXTRACT_CACHE_DIR: join(root, '.cache', 'frames'),
  TEMP: join(root, '.cache', 'tmp'), TMP: join(root, '.cache', 'tmp'),
  PATH: `${dirname(ffmpeg)};${dirname(probe)};${process.env.PATH}`,
};
if (existsSync(chrome)) env.HYPERFRAMES_BROWSER_PATH = chrome;
const bin = join(dirname(require.resolve('hyperframes/package.json')), 'bin', 'hyperframes.mjs');
const child = spawn(process.execPath, [bin, ...process.argv.slice(2)], { cwd: root, env, stdio: 'inherit', windowsHide: true });
child.on('exit', (code) => process.exit(code ?? 1));
