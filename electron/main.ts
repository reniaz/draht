import { app, BrowserWindow, dialog, shell } from 'electron';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { startWebServer, type WebServer } from './server';
import { initUpdater } from './updater';
import { initWindowControls } from './windowControls';

// CommonJS output (see tsup.config.ts), so __dirname is available directly.
const DIR_NAME = __dirname;

// The built web app. `electron/dist/main.cjs` -> repo root -> `build`.
// Not `dist/` — upstream tracks that directory in git, and our builds embed the API
// credentials, so building into it risks committing them. See vite.config.ts.
const WEB_ROOT = resolve(DIR_NAME, '..', '..', 'build');

// Two variants ship: `wire` (Telegram blue, telegraph line — the Draht identity) and
// `caelus` (paper plane recoloured to the caelus palette). Override with DRAHT_ICON.
// Regenerate renders with `npm run mod:icon` after editing the SVGs.
// `.ico` carries the whole size ladder, so Windows picks the right one per context.
const ICON_VARIANT = process.env.DRAHT_ICON || 'wire';
const ICON = resolve(
  DIR_NAME, '..', 'assets',
  process.platform === 'win32' ? `icon-${ICON_VARIANT}.ico` : `icon-${ICON_VARIANT}-512.png`,
);

const DEV_URL = process.env.MOD_DEV_URL;
const IS_DEV = Boolean(DEV_URL);

let webServer: WebServer | undefined;

/**
 * Reports a fatal startup problem and quits.
 *
 * A packaged app has no console attached, so writing to stderr means the user sees the
 * window simply never appear. The dialog is the only way the message actually reaches
 * them.
 */
function fail(title: string, message: string): void {
  console.error(`${title}: ${message}`);
  dialog.showErrorBox(title, message);
  app.exit(1);
}

function isInternalUrl(url: string, appOrigin: string) {
  try {
    return new URL(url).origin === appOrigin;
  } catch {
    return false;
  }
}

function openExternally(url: string) {
  // Only hand plain web content to the OS browser; never custom schemes.
  try {
    if (/^https?:$/.test(new URL(url).protocol)) {
      void shell.openExternal(url);
    }
  } catch { /* malformed URL, ignore */ }
}

function createWindow(startUrl: string, appOrigin: string) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 400,
    minHeight: 500,
    autoHideMenuBar: true,
    // caelus page background, so the window does not flash Telegram grey before paint.
    backgroundColor: '#1e1f1e',
    show: false,
    icon: existsSync(ICON) ? ICON : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(DIR_NAME, 'preload.cjs'),
    },
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url, appOrigin)) {
      event.preventDefault();
      openExternally(url);
    }
  });

  void win.loadURL(startUrl);

  if (IS_DEV) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}

// Single instance: a second launch focuses the existing window rather than starting a
// rival master tab that would fight over the GramJS worker and the message log.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(async () => {
    let startUrl: string;
    let appOrigin: string;

    if (IS_DEV) {
      startUrl = DEV_URL!;
      appOrigin = new URL(DEV_URL!).origin;
    } else {
      if (!existsSync(join(WEB_ROOT, 'index.html'))) {
        fail(
          'No web build found',
          `Expected the built app at ${WEB_ROOT}.\n\n`
          + 'Run `npm run build:production` first (needs TELEGRAM_API_ID / '
          + 'TELEGRAM_API_HASH in .env).',
        );
        return;
      }

      try {
        webServer = await startWebServer(WEB_ROOT);
      } catch (err) {
        fail('Draht could not start', String(err instanceof Error ? err.message : err));
        return;
      }

      startUrl = `${webServer.baseUrl}index.html`;
      appOrigin = webServer.origin;
    }

    const mainWindow = createWindow(startUrl, appOrigin);

    const currentWindow = () => (mainWindow.isDestroyed()
      ? BrowserWindow.getAllWindows()[0]
      : mainWindow);

    initUpdater(currentWindow);
    initWindowControls(currentWindow);

    // Clear any taskbar flash as soon as the window is actually looked at.
    mainWindow.on('focus', () => mainWindow.flashFrame(false));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(startUrl, appOrigin);
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('quit', () => {
    webServer?.server.close();
  });
}
