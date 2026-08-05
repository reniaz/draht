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
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Needed so the update modal can receive its IPC message below.
      preload: join(__dirname, 'preload.cjs'),
    },
  });

  const logs: string[] = [];
  win.webContents.on('console-message', (e) => {
    if (e.message.includes('Draht') || e.level === 'error') {
      logs.push(`[${e.level}] ${e.message.slice(0, 160)}`);
    }
  });

  // First load, just to get an origin we can write localStorage on.
  await win.loadURL(`${baseUrl}index.html`);

  // What the real app sees: one load, under a path prefix never used before.
  await new Promise((r) => { setTimeout(r, 6000); });
  const firstLoad = await win.webContents.executeJavaScript(
    `({ hasController: Boolean(navigator.serviceWorker.controller), path: location.pathname })`,
  );
  console.log('\n--- first load under a fresh prefix (what the app actually does) ---');
  console.log(JSON.stringify(firstLoad, undefined, 2));
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

  const notifications = await win.webContents.executeJavaScript(`(async () => {
    if (!('Notification' in window)) return { supported: false };
    const before = Notification.permission;
    let afterRequest;
    try { afterRequest = await Notification.requestPermission(); } catch (e) { afterRequest = 'threw: ' + e.message; }
    let shown = false;
    try { new Notification('Draht test'); shown = true; } catch (e) { shown = 'threw: ' + e.message; }
    return { supported: true, before, afterRequest, canConstruct: shown };
  })()`);

  const sw = await win.webContents.executeJavaScript(`(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const regs = await navigator.serviceWorker.getRegistrations();
    return {
      supported: true,
      // The branch that decides push-vs-direct notifications.
      pushSupported: 'showNotification' in ServiceWorkerRegistration.prototype,
      // If this is null while pushSupported is true, notifications are dropped silently.
      hasController: Boolean(navigator.serviceWorker.controller),
      registrations: regs.map((r) => ({
        scope: r.scope,
        active: Boolean(r.active),
        state: r.active?.state,
      })),
    };
  })()`);

  console.log('\n--- service worker (decides notification path) ---');
  console.log(JSON.stringify(sw, undefined, 2));

  // Mirrors upstream's `checkIfPushSupported()`. When this is true, notifications are
  // routed to the service worker — whose showNotification never resolves in Electron, so
  // they vanish. The DesktopNotifications plugin removes the method to force the direct
  // path, so this must read false once the mod has started.
  const notifyPath = await win.webContents.executeJavaScript(`({
    pushBranchTaken: 'showNotification' in ServiceWorkerRegistration.prototype,
  })`);

  console.log('\n--- which notification path upstream will take ---');
  console.log(JSON.stringify(notifyPath, undefined, 2));
  console.log(notifyPath.pushBranchTaken
    ? '  service worker  <-- silently drops notifications in Electron'
    : '  direct Notification  <-- works');

  console.log('\n--- notifications ---');
  console.log(JSON.stringify(notifications, undefined, 2));

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

  // Does the in-app update prompt actually pick up the active theme, rather than looking
  // like the OS dialog it replaced?
  win.webContents.send('draht:update-ready', { version: '9.9.9' });
  await new Promise((r) => { setTimeout(r, 1500); });

  const modal = await win.webContents.executeJavaScript(`(() => {
    const root = document.querySelector('.draht-update-modal');
    if (!root) return { rendered: false };
    const dialog = root.querySelector('.modal-dialog') || root;
    const text = root.querySelector('.draht-update-text');
    return {
      rendered: true,
      dialogBackground: getComputedStyle(dialog).backgroundColor,
      textColour: text ? getComputedStyle(text).color : '(no text node)',
      themeBackground: getComputedStyle(document.documentElement)
        .getPropertyValue('--color-background').trim(),
    };
  })()`);

  console.log('\n--- update modal theming ---');
  console.log(JSON.stringify(modal, undefined, 2));

  console.log('');
  app.exit(0);
});
