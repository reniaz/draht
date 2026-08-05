/**
 * One-off diagnostic: does a saved theme actually get applied on a cold start?
 *
 *   npm run mod:diagnose
 *
 * The unit tests say the boot path works, so the failure must come from something the
 * real renderer does that jsdom does not. This writes the settings a user would have,
 * reloads, and reports what the DOM actually ends up with.
 */
import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { startWebServer } from './server';

const WEB_ROOT = resolve(__dirname, '..', '..', 'build');

const SETTINGS = JSON.stringify({
  plugins: { Themes: { enabled: true, theme: 'caelus' } },
});

void app.whenReady().then(async () => {
  if (!existsSync(join(WEB_ROOT, 'index.html'))) {
    console.error('No build found.');
    app.exit(1);
    return;
  }

  const { baseUrl } = await startWebServer(WEB_ROOT);

  const win = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  const logs: string[] = [];
  win.webContents.on('console-message', (e) => {
    if (e.message.includes('Draht') || e.level === 'error') {
      logs.push(`[${e.level}] ${e.message.slice(0, 160)}`);
    }
  });

  // First load, just to get an origin we can write localStorage on.
  await win.loadURL(`${baseUrl}index.html`);
  await win.webContents.executeJavaScript(
    `localStorage.setItem('draht-settings', ${JSON.stringify(SETTINGS)}); true`,
  );

  logs.length = 0;

  // Second load is the one under test: settings already present, cold boot.
  await win.loadURL(`${baseUrl}index.html`);
  await new Promise((r) => { setTimeout(r, 8000); });

  const fonts = await win.webContents.executeJavaScript(`(async () => {
    if (typeof queryLocalFonts !== 'function') return { available: false };
    try {
      const list = await queryLocalFonts();
      return {
        available: true,
        count: list.length,
        sample: [...new Set(list.map((f) => f.family))].slice(0, 8),
      };
    } catch (e) { return { available: true, error: e.name + ': ' + e.message }; }
  })()`);

  console.log('\n--- local font access ---');
  console.log(JSON.stringify(fonts, undefined, 2));

  const result = await win.webContents.executeJavaScript(`({
    storedSettings: localStorage.getItem('draht-settings'),
    inlineStyle: document.documentElement.getAttribute('style'),
    backgroundVar: getComputedStyle(document.documentElement).getPropertyValue('--color-background'),
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    htmlClasses: document.documentElement.className,
    bodyClasses: document.body.className,
  })`);

  console.log('\n--- after a cold start with Themes enabled ---\n');
  console.log('stored settings :', result.storedSettings);
  console.log('inline style    :', result.inlineStyle
    ? `${result.inlineStyle.slice(0, 200)}${result.inlineStyle.length > 200 ? '…' : ''}`
    : '(none)  <-- theme was NOT applied');
  console.log('--color-background:', result.backgroundVar.trim() || '(unset)');
  console.log('body background :', result.bodyBackground);
  console.log('html classes    :', result.htmlClasses || '(none)');
  console.log('body classes    :', result.bodyClasses || '(none)');

  if (logs.length) {
    console.log('\nrelevant console output:');
    logs.slice(0, 20).forEach((l) => console.log(`  ${l}`));
  } else {
    console.log('\n(no Draht console output at all — the mod may not have run)');
  }

  console.log('');
  app.exit(0);
});
