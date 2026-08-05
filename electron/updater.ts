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

const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

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

  check();
  setInterval(check, CHECK_INTERVAL);
}
