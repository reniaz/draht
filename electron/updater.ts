import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';

/**
 * Watches for updates while the app is running.
 *
 * Deliberately does not download anything. Installing happens at launch behind the splash
 * (startupUpdate.ts), which re-checks at that moment — so whatever gets installed is
 * always the newest available, not whatever happened to be staged earlier.
 *
 * Staging mid-session was the old behaviour and had a nasty property: leave the prompt
 * open long enough for another release and clicking "Restart now" would install the older,
 * already-superseded version it had downloaded. Checking here and downloading there
 * removes that entirely.
 *
 * It also means no 160 MB installer sits on disk between sessions.
 */

const CHECK_INTERVAL = 10 * 60 * 1000;

let timer: NodeJS.Timeout | undefined;
let announced: string | undefined;

export function initUpdater(getWindow: () => BrowserWindow | undefined) {
  // Unpackaged runs have no app-update.yml, and checking throws.
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('error', (err) => {
    // Being offline, or rate-limited by GitHub, is normal and must stay silent.
    console.error('[updater]', err instanceof Error ? err.message : err);
  });

  autoUpdater.on('update-available', (info) => {
    // Announce each version once. Re-prompting every ten minutes for something already
    // declined would be nagging, but a genuinely newer release still gets through.
    if (info.version === announced || info.version === app.getVersion()) return;
    announced = info.version;

    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('draht:update-ready', {});
  });

  ipcMain.on('draht:install-update', () => {
    // Restart and let the splash do the work. It re-checks first, so this picks up
    // anything published since the prompt appeared.
    app.relaunch();
    app.quit();
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch(() => {
      // Already reported through the 'error' handler.
    });
  };

  check();
  timer = setInterval(check, CHECK_INTERVAL);

  app.on('before-quit', () => {
    if (timer) clearInterval(timer);
  });
}
