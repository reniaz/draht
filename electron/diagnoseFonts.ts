/**
 * One-off diagnostic: does a saved font actually reach the interface?
 *
 *   npm run mod:diagnose:fonts
 *
 * Same reasoning as `diagnose.ts`. The unit tests cannot answer this, because the thing
 * under test is the CSS cascade in a real browser against upstream's real stylesheet —
 * exactly what jsdom does not do. This writes the settings a user would have, loads cold,
 * and reports what the DOM computes.
 */
import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { startWebServer } from './server';
import { initThemes } from './themes';

const WEB_ROOT = resolve(__dirname, '..', '..', 'build');

// Georgia ships with Windows and looks nothing like the default, so a wrong result is
// obvious rather than a subtle metric difference.
const FONT = 'Georgia';

const SETTINGS = JSON.stringify({
  plugins: { Fonts: { enabled: true, fontFamily: FONT } },
});

void app.whenReady().then(async () => {
  if (!existsSync(join(WEB_ROOT, 'index.html'))) {
    console.error('No build found — run `npm run build:production` first.');
    app.exit(1);
    return;
  }

  initThemes();

  const { baseUrl } = await startWebServer(WEB_ROOT);

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, 'preload.cjs'),
    },
  });

  const logs: string[] = [];
  win.webContents.on('console-message', (e) => {
    if (e.message.includes('Draht') || e.level === 'error') {
      logs.push(`[${e.level}] ${e.message.slice(0, 200)}`);
    }
  });

  // First load only to get an origin we are allowed to write localStorage on.
  await win.loadURL(`${baseUrl}index.html`);
  await new Promise((r) => { setTimeout(r, 5000); });
  await win.webContents.executeJavaScript(
    `localStorage.setItem('draht-settings', ${JSON.stringify(SETTINGS)}); true`,
  );

  logs.length = 0;

  // The load under test: settings already saved, cold boot.
  await win.loadURL(`${baseUrl}index.html`);
  await new Promise((r) => { setTimeout(r, 8000); });

  const report = await win.webContents.executeJavaScript(`(() => {
    const style = document.getElementById('draht-font');
    const saved = JSON.parse(localStorage.getItem('draht-settings') || '{}');
    const pick = (selector) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el).fontFamily.slice(0, 70) : 'element not present';
    };

    return {
      settingsRead: saved.plugins?.Fonts,
      styleElementPresent: Boolean(style),
      styleRules: style ? style.textContent.slice(0, 200) : undefined,
      variableAtRoot: getComputedStyle(document.documentElement)
        .getPropertyValue('--font-family').trim().slice(0, 70),
      computed: {
        body: pick('body'),
        leftColumn: pick('#LeftColumn'),
        button: pick('button'),
      },
    };
  })()`);

  console.log('\n--- fonts ---');
  console.log(JSON.stringify(report, undefined, 2));

  const applied = String(report?.computed?.body || '').toLowerCase().includes(FONT.toLowerCase());
  console.log(`\n  ${applied ? 'OK' : 'FAIL'}: body ${applied ? 'uses' : 'does not use'} ${FONT}.`);

  if (logs.length) {
    console.log('\n--- console ---');
    logs.slice(0, 12).forEach((line) => console.log(`  ${line}`));
  }

  app.exit(applied ? 0 : 1);
});
