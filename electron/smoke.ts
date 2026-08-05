/**
 * Transport smoke test: does telegram-tt's runtime actually work under the shell's
 * loopback origin?
 *
 * This exists because the obvious choice (`file://`) blocks Workers and gives an opaque
 * origin, and the next-most-obvious (a privileged `app://` scheme) silently breaks the
 * Cache API that all media caching runs through. Both failures are invisible until
 * something probes for them, so this asserts the transport rather than assuming it.
 *
 *   npm run mod:smoke
 *
 * Exits 0 if every probe passes, 1 otherwise.
 */
import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startWebServer } from './server';

const DIR_NAME = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(DIR_NAME, '..', '..', 'build');

const PROBE = `(async () => {
  const result = {
    origin: location.origin,
    isSecureContext,
    hasWorker: typeof Worker === 'function',
    hasSharedWorker: typeof SharedWorker === 'function',
    hasServiceWorker: 'serviceWorker' in navigator,
    idbWrite: null,
    moduleWorker: null,
    cacheApi: null,
    rootChildren: document.getElementById('root')?.children.length ?? -1,
  };

  // A working \`indexedDB\` global is not the same as a usable one, so round-trip a value.
  try {
    result.idbWrite = await new Promise((res) => {
      const req = indexedDB.open('mod-smoke', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('s');
      req.onerror = () => res('open failed: ' + req.error?.name);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('s', 'readwrite');
        tx.objectStore('s').put('ok', 'k');
        tx.oncomplete = () => {
          const rtx = db.transaction('s', 'readonly').objectStore('s').get('k');
          rtx.onsuccess = () => res(rtx.result === 'ok' ? true : 'readback mismatch');
          rtx.onerror = () => res('read failed');
        };
        tx.onerror = () => res('write failed: ' + tx.error?.name);
      };
    });
  } catch (e) { result.idbWrite = 'threw: ' + e.message; }

  // GramJS runs as \`new Worker(url, { type: 'module' })\`. The CSP is \`worker-src 'self'\`,
  // so the probe must load from a real same-origin path.
  try {
    result.moduleWorker = await new Promise((res) => {
      const w = new Worker('__mod_smoke_worker.js', { type: 'module' });
      const t = setTimeout(() => res('timeout'), 3000);
      w.onmessage = (e) => { clearTimeout(t); w.terminate(); res(e.data === 'pong'); };
      w.onerror = (e) => { clearTimeout(t); res('error: ' + (e.message || 'unknown')); };
    });
  } catch (e) { result.moduleWorker = 'threw: ' + e.message; }

  // The probe that rules out custom schemes: telegram-tt caches all media through the
  // Cache API, which refuses non-HTTP(S) request schemes.
  try {
    result.cacheApi = await (async () => {
      const cache = await caches.open('mod-smoke');
      await cache.put(new Request(location.origin + '/probe'), new Response('ok'));
      const hit = await cache.match(location.origin + '/probe');
      return hit ? (await hit.text()) === 'ok' : 'miss';
    })();
  } catch (e) { result.cacheApi = 'threw: ' + e.message; }

  return result;
})()`;

void app.whenReady().then(async () => {
  if (!existsSync(join(WEB_ROOT, 'index.html'))) {
    console.error(`FAIL: no build at ${WEB_ROOT}. Run a build first.`);
    app.exit(1);
    return;
  }

  let baseUrl: string;
  let origin: string;

  try {
    ({ baseUrl, origin } = await startWebServer(WEB_ROOT, {
      '/__mod_smoke_worker.js': {
        body: 'self.postMessage("pong");',
        type: 'text/javascript',
      },
    }));
  } catch (err) {
    // Most often a previous run still holding the fixed port. Report it as a plain
    // failure rather than an unhandled rejection buried in Chromium teardown noise.
    console.error(`\nFAIL: ${err instanceof Error ? err.message : String(err)}\n`);
    app.exit(1);
    return;
  }

  const win = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  const rendererErrors: string[] = [];
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') rendererErrors.push(e.message);
  });

  await win.loadURL(`${baseUrl}index.html`);

  // Give the app a moment to boot its bundles and mount.
  await new Promise((res) => { setTimeout(res, 6000); });

  const r = await win.webContents.executeJavaScript(PROBE);

  const checks: [string, boolean, unknown][] = [
    ['secure context', r.isSecureContext === true, r.isSecureContext],
    ['Worker constructor', r.hasWorker, r.hasWorker],
    ['SharedWorker constructor', r.hasSharedWorker, r.hasSharedWorker],
    ['module Worker spawn', r.moduleWorker === true, r.moduleWorker],
    ['IndexedDB read/write', r.idbWrite === true, r.idbWrite],
    ['Cache API put/match', r.cacheApi === true, r.cacheApi],
    ['app mounted into #root', r.rootChildren > 0, r.rootChildren],
  ];

  console.log(`\n  origin: ${r.origin}  (stable across launches: ${r.origin === origin})`);
  console.log(`  serviceWorker available: ${r.hasServiceWorker}\n`);

  let failed = 0;
  for (const [name, ok, actual] of checks) {
    if (!ok) failed++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (got: ${JSON.stringify(actual)})`}`);
  }

  if (rendererErrors.length) {
    console.log(`\n  renderer errors (${rendererErrors.length}):`);
    rendererErrors.slice(0, 10).forEach((e) => console.log(`    ${e.slice(0, 200)}`));
  }

  console.log(failed ? `\n${failed} check(s) failed.\n` : '\nAll checks passed.\n');
  app.exit(failed ? 1 : 0);
});
