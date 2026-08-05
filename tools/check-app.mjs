#!/usr/bin/env node
/**
 * Launches the built main process and proves it actually booted.
 *
 *   npm run mod:check:app
 *
 * This exists because of a bug that shipped: electron-updater was bundled into an ESM
 * main process, where esbuild rewrites the dynamic `require()` calls inside fs-extra into
 * a shim that throws. The app died at import time with a JavaScript error dialog.
 *
 * It got through because "the process is still running" was treated as proof it worked —
 * but a modal error dialog *keeps the process running*. The only honest check is whether
 * the app reached the point of doing its job, so this waits for the loopback server to
 * accept a connection. That can only happen after the main module has fully imported and
 * `app.whenReady` has fired.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';

const PORT = 48764;
const TIMEOUT_MS = 45_000;
const ENTRY = 'electron/dist/main.cjs';

if (!existsSync(ENTRY)) {
  console.error(`\n  ${ENTRY} not found — run \`npm run mod:shell\` first.\n`);
  process.exit(1);
}

if (!existsSync('build/index.html')) {
  console.error('\n  No web build — run `npm run build:production` first.\n');
  process.exit(1);
}

function isListening() {
  return new Promise((resolve) => {
    const socket = connect({ port: PORT, host: '127.0.0.1' })
      .on('connect', () => { socket.destroy(); resolve(true); })
      .on('error', () => resolve(false));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

if (await isListening()) {
  console.error(
    `\n  Port ${PORT} is already in use, so this check cannot tell whether the app `
    + 'started.\n  Close any running Draht instance and retry.\n',
  );
  process.exit(1);
}

console.log('Launching the built app...');

const child = spawn('npx', ['electron', ENTRY], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
});

let output = '';
child.stdout.on('data', (d) => { output += d; });
child.stderr.on('data', (d) => { output += d; });

const deadline = Date.now() + TIMEOUT_MS;
let booted = false;

while (Date.now() < deadline) {
  if (await isListening()) { booted = true; break; }
  if (child.exitCode !== null) break;
  await new Promise((r) => { setTimeout(r, 500); });
}

child.kill();

// The dynamic-require failure prints this exact phrase before the dialog appears.
const fatal = /Dynamic require of|Uncaught Exception|Cannot find module/.exec(output);

if (!booted || fatal) {
  console.error('\n  FAIL: the app did not start serving.\n');
  if (fatal) console.error(`  Fatal error: ${fatal[0]}\n`);
  const trimmed = output.trim().split('\n').slice(0, 15).map((l) => `    ${l}`).join('\n');
  if (trimmed) console.error(`${trimmed}\n`);
  process.exit(1);
}

console.log(`  OK: main process booted and is serving on ${PORT}.`);
