/**
 * One-off diagnostic: does the chat-tab bar's layout override actually take effect?
 *
 *   npm run mod:diagnose:tabs
 *
 * The bar reserves its space by enlarging `--middle-header-height`, which upstream
 * declares on `html, body`. Overriding a variable at the wrong selector is how the font
 * plugin silently did nothing for weeks, so this asserts the computed value rather than
 * assuming the rule wins.
 */
import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { startWebServer } from './server';
import { initThemes } from './themes';

const WEB_ROOT = resolve(__dirname, '..', '..', 'build');

const SETTINGS = JSON.stringify({ plugins: { ChatTabs: { enabled: true } } });

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
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      preload: join(__dirname, 'preload.cjs'),
    },
  });

  await win.loadURL(`${baseUrl}index.html`);
  await new Promise((r) => { setTimeout(r, 5000); });
  await win.webContents.executeJavaScript(
    `localStorage.setItem('draht-settings', ${JSON.stringify(SETTINGS)}); true`,
  );

  await win.loadURL(`${baseUrl}index.html`);
  await new Promise((r) => { setTimeout(r, 8000); });

  const report = await win.webContents.executeJavaScript(`(() => {
    const body = getComputedStyle(document.body);
    const toPx = (value) => value.trim();

    return {
      bodyClass: document.body.classList.contains('draht-has-tabs'),
      tabsHeight: toPx(body.getPropertyValue('--draht-tabs-height')),
      headerHeight: toPx(body.getPropertyValue('--middle-header-height')),
      // What the stock value is, for comparison.
      rootHeaderHeight: toPx(
        getComputedStyle(document.documentElement).getPropertyValue('--middle-header-height'),
      ),
    };
  })()`);

  console.log('\n--- chat tabs ---');
  console.log(JSON.stringify(report, undefined, 2));

  // 3rem header + 2.25rem bar = 5.25rem, at 16px = 84px.
  const ok = report.bodyClass && report.headerHeight.startsWith('calc')
    ? true
    : report.bodyClass && report.headerHeight !== report.rootHeaderHeight;

  console.log(`\n  ${ok ? 'OK' : 'FAIL'}: the bar ${ok ? 'reserves' : 'does not reserve'} its space.\n`);

  app.exit(ok ? 0 : 1);
});
