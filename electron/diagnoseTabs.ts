/**
 * One-off diagnostic: are the chat-tab styles loaded and in effect on a cold start?
 *
 *   npm run mod:diagnose:tabs
 *
 * The bar itself lives in MiddleColumn, which is inside the lazily-loaded Main chunk, so
 * it does not exist at the login screen where this can reach. What can be checked, and
 * what actually broke, is whether the plugin's stylesheet is present at startup at all:
 * the rules first shipped only alongside MiddleColumn, so the column had no layout for
 * the bar until the first chat was opened. A probe element answers that without needing a
 * logged-in session.
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
    // A stand-in for the real column, so the rules can be measured where they apply.
    // The layout override only applies while the bar is on screen, which the component
    // signals with this class; the probe has to stand in for that too.
    document.body.classList.add('draht-tabs-visible');

    const column = document.createElement('div');
    column.id = 'MiddleColumn';
    const bar = document.createElement('div');
    bar.className = 'draht-tabbar';
    // With a tab in it: the bar's height comes from its content, so an empty probe
    // measures 0 and says nothing about whether the rules loaded.
    const scroll = document.createElement('div');
    scroll.className = 'draht-tabbar-scroll';
    const tab = document.createElement('div');
    tab.className = 'draht-tab';
    tab.textContent = 'Chat';
    scroll.appendChild(tab);
    bar.appendChild(scroll);
    column.appendChild(bar);
    document.body.appendChild(column);

    const barStyle = getComputedStyle(bar);
    const columnStyle = getComputedStyle(column);
    const result = {
      bodyClass: document.body.classList.contains('draht-has-tabs'),
      barHeight: barStyle.height,
      barVisible: barStyle.display !== 'none',
      // Styled as an island, like the header it sits above.
      tabRadius: getComputedStyle(tab).borderRadius,
      tabShadow: getComputedStyle(tab).boxShadow !== 'none',
      columnIsFlexColumn: columnStyle.display === 'flex' && columnStyle.flexDirection === 'column',
      // Upstream's header metrics must be untouched: enlarging them inflated the header
      // island the first time round.
      headerHeight: getComputedStyle(document.body)
        .getPropertyValue('--middle-header-height').trim(),
    };

    column.remove();
    document.body.classList.remove('draht-tabs-visible');
    return result;
  })()`);

  console.log('\n--- chat tabs ---');
  console.log(JSON.stringify(report, undefined, 2));

  const ok = report.bodyClass
    && report.barVisible
    && report.barHeight !== '0px'
    && report.tabRadius !== '0px'
    && report.tabShadow
    && report.columnIsFlexColumn
    && report.headerHeight === '3rem';

  console.log(`\n  ${ok ? 'OK' : 'FAIL'}: styles ${ok ? 'load at startup and leave the header alone' : 'are wrong'}.\n`);

  app.exit(ok ? 0 : 1);
});
