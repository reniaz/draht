import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';

/**
 * Auto-update against GitHub Releases.
 *
 * The feed is configured by the `publish` block in electron-builder.yml, which writes an
 * `app-update.yml` into the packaged resources — that file is what electron-updater reads
 * at runtime, so nothing is hardcoded here.
 *
 * electron-updater is bundled into this file by tsup rather than shipped in
 * node_modules. The package deliberately excludes node_modules (Vite bundles the renderer
 * and upstream's ~14.5k dependency files are dead weight), so an external require would
 * not resolve in the installed app.
 */

const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

export function initUpdater(getWindow: () => BrowserWindow | undefined) {
  // Unpackaged runs have no app-update.yml, and checking throws.
  if (!app.isPackaged) return;

  // Downloads happen in the background; installation waits for the user to agree, so a
  // restart is never forced mid-conversation.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => {
    // Being offline, or rate-limited by GitHub, is normal and must stay silent.
    console.error('[updater]', err instanceof Error ? err.message : err);
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] downloading ${info.version}`);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    const window = getWindow();

    const { response } = await dialog.showMessageBox(window!, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Draht ${info.version} is ready to install.`,
      detail: 'The update installs when you restart. Your login and message log are kept.',
    });

    if (response === 0) {
      // isSilent=false so the NSIS installer still shows progress; isForceRunAfter
      // relaunches the app once it finishes.
      autoUpdater.quitAndInstall(false, true);
    }
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch(() => {
      // Already reported through the 'error' handler.
    });
  };

  check();
  setInterval(check, CHECK_INTERVAL);
}
