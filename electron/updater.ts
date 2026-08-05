import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';

/**
 * Auto-update against GitHub Releases.
 *
 * The feed is configured by the `publish` block in electron-builder.yml, which writes an
 * `app-update.yml` into the packaged resources — that file is what electron-updater reads
 * at runtime, so nothing is hardcoded here.
 *
 * The update prompt is rendered by the app itself (src/mod/components/UpdateModal.tsx)
 * rather than with `dialog.showMessageBox`. Electron's dialog is an OS-native message box
 * that cannot be styled, so it appears as a stock Windows dialog in the middle of an
 * otherwise themed client. The main process only reports state over IPC; the renderer
 * decides how to present it.
 *
 * electron-updater is bundled into this file by tsup rather than shipped in node_modules.
 * The package excludes node_modules, so an external require would not resolve — and it
 * must be bundled as CommonJS, since its fs-extra dependency uses dynamic `require()`.
 */

/**
 * How often to look for a new release while the app is running.
 *
 * Was six hours, which meant a release published mid-session effectively went unnoticed
 * until the next restart — the startup check was doing all the work.
 *
 * Ten minutes is cheap: the GitHub provider fetches `latest.yml` from the releases
 * download URL, which is CDN-served static content rather than a REST API call, so this
 * does not consume the API rate limit. At 144 fetches a day of a ~350-byte file, the cost
 * is nil.
 */
const CHECK_INTERVAL = 10 * 60 * 1000;

let timer: NodeJS.Timeout | undefined;

export function initUpdater(getWindow: () => BrowserWindow | undefined) {
  // Unpackaged runs have no app-update.yml, and checking throws.
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (channel: string, payload?: unknown) => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  };

  autoUpdater.on('error', (err) => {
    // Being offline, or rate-limited by GitHub, is normal and must stay silent.
    console.error('[updater]', err instanceof Error ? err.message : err);
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] downloading ${info.version}`);
  });

  autoUpdater.on('download-progress', (progress) => {
    send('draht:update-progress', { percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    // Stop polling once something is ready to install. Otherwise dismissing the prompt
    // with "Later" would just bring it back ten minutes later, and again after that.
    // The update still installs on quit via autoInstallOnAppQuit.
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }

    send('draht:update-ready', { version: info.version });
  });

  ipcMain.on('draht:install-update', () => {
    // isSilent: true so the NSIS installer runs without showing its own progress window —
    // the app has already told the user what is happening, and a second, unstyled window
    // appearing on top of that is exactly what this replaces.
    // isForceRunAfter: true relaunches once it finishes.
    autoUpdater.quitAndInstall(true, true);
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch(() => {
      // Already reported through the 'error' handler.
    });
  };

  // Immediately, so a release published while the app was closed is picked up at once,
  // then on the interval so one published mid-session is noticed without a restart.
  check();
  timer = setInterval(check, CHECK_INTERVAL);
}
