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
 *
 * It runs twice, because a second bug shipped through the first version of this check.
 * The launch splash only opens in a packaged app, so an unpackaged run skipped it — and
 * with it the window that briefly exists alone at startup. Closing that window fired
 * `window-all-closed` before the main window was created, and the app quit mid-launch,
 * with status 0 and no error. DRAHT_FORCE_SPLASH opens the splash regardless so the
 * ordering is exercised here rather than by whoever installs the release.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A free ephemeral port, passed to the app via DRAHT_PORT.
 *
 * The app's real port is fixed (the origin has to stay stable for IndexedDB), but using
 * it here would make this check unrunnable whenever Draht is open — and refusing to run
 * is not much better than a false pass.
 */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}
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

function isListening(PORT) {
  return new Promise((resolve) => {
    const socket = connect({ port: PORT, host: '127.0.0.1' })
      .on('connect', () => { socket.destroy(); resolve(true); })
      .on('error', () => resolve(false));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

async function boot(label, extraEnv) {
  // A port per run, because reusing one lets the next run's `isListening` answer true
  // against the previous instance that has not finished exiting — and that instance still
  // holds the single-instance lock, so the new one quits on the spot. That combination
  // reported a passing app as a failure and would just as easily hide a real one.
  const PORT = await freePort();

  // Electron's single-instance lock is keyed on the user data directory, so each run gets
  // its own. Sharing one means the second app quits the moment it starts, which looks
  // exactly like a failure to boot.
  const userData = mkdtempSync(join(tmpdir(), 'draht-check-'));

  console.log(`Launching the built app on port ${PORT} (${label})...`);

  const child = spawn('npx', ['electron', ENTRY, `--user-data-dir=${userData}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    env: { ...process.env, DRAHT_PORT: String(PORT), ...extraEnv },
  });

  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });

  const deadline = Date.now() + TIMEOUT_MS;
  let booted = false;

  while (Date.now() < deadline) {
    if (await isListening(PORT)) { booted = true; break; }
    if (child.exitCode !== null) break;
    await new Promise((r) => { setTimeout(r, 500); });
  }

  // Serving is necessary but not sufficient: the splash bug quit the app *after* the
  // server was already up. Wait, then confirm it is still running.
  if (booted) {
    await new Promise((r) => { setTimeout(r, 4000); });

    if (child.exitCode !== null) {
      console.error(`\n  FAIL (${label}): the app started serving, then quit on its own.\n`);
      console.error('  A window closing before the main window exists will do this.\n');
      process.exit(1);
    }
  }

  // `shell: true` means the child is cmd.exe, and killing that leaves Electron running —
  // still holding its port and its lock. The whole tree has to go.
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill();
  }

  await new Promise((resolve) => {
    if (child.exitCode !== null) { resolve(); return; }
    child.once('exit', resolve);
    setTimeout(resolve, 5000);
  });

  try { rmSync(userData, { recursive: true, force: true }); } catch { /* best effort */ }

  // The dynamic-require failure prints this exact phrase before the dialog appears.
  const fatal = /Dynamic require of|Uncaught Exception|Cannot find module/.exec(output);

  if (!booted || fatal) {
    console.error(`\n  FAIL (${label}): the app did not start serving.\n`);
    if (fatal) console.error(`  Fatal error: ${fatal[0]}\n`);
    const trimmed = output.trim().split('\n').slice(0, 15).map((l) => `    ${l}`).join('\n');
    if (trimmed) console.error(`${trimmed}\n`);
    process.exit(1);
  }

  console.log(`  OK (${label}): main process booted and is serving.`);
}

await boot('plain', {});
await boot('launch splash', { DRAHT_FORCE_SPLASH: '1' });
