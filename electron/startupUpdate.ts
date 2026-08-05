import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { showSplash } from './splash';

/**
 * Checks for, downloads and installs updates at launch, behind a splash screen.
 *
 * Doing this at startup rather than mid-session removes a whole class of problem. An
 * update downloaded during a session goes stale the moment a newer one is published, and
 * whatever was staged is what gets installed — so a user could sit on an open "restart to
 * update" prompt and end up installing a version that had already been superseded.
 * Checking at launch means the answer is always "whatever is newest right now".
 *
 * Everything here fails open: no network, a slow server, or any error at all closes the
 * splash and starts the app normally. An updater must never be the reason the client
 * will not open.
 */

/** Beyond this, start the app and leave the update for next time. */
const CHECK_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => { setTimeout(() => resolve(undefined), ms); }),
  ]);
}

/**
 * Removes installers left in the updater's cache.
 *
 * electron-updater stages a full installer — around 160 MB — and the copy for a version
 * you are already running is dead weight. Cleaning at startup means the disk cost is one
 * pending update rather than one per update ever downloaded.
 */
export function cleanUpdaterCache() {
  try {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) return;

    // The folder name comes from `updaterCacheDirName` in app-update.yml, which
    // electron-builder derives from the package name — "telegram-t-updater" here, not
    // anything matching the product name. Reading it beats guessing.
    const config = join(process.resourcesPath, 'app-update.yml');
    if (!existsSync(config)) return;

    const dirName = readFileSync(config, 'utf8').match(/^updaterCacheDirName:\s*(\S+)/m)?.[1];
    if (!dirName) return;

    const pending = join(localAppData, dirName, 'pending');
    if (!existsSync(pending)) return;

    const currentVersion = app.getVersion();

    for (const file of readdirSync(pending)) {
      if (!file.endsWith('.exe')) continue;
      // An installer for the version already running has done its job. Anything else is
      // a genuinely pending update and must be left alone.
      if (!file.includes(`-${currentVersion}.exe`)) continue;

      const full = join(pending, file);
      if (statSync(full).isFile()) rmSync(full, { force: true });
    }
  } catch {
    // Best-effort housekeeping; never worth failing startup over.
  }
}

/**
 * @returns true when an install is starting, so the caller must not open the main window.
 */
export async function runStartupUpdate(iconPath: string): Promise<boolean> {
  if (!app.isPackaged) return false;

  cleanUpdaterCache();

  const splash = showSplash(iconPath);

  try {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    const result = await withTimeout(autoUpdater.checkForUpdates(), CHECK_TIMEOUT_MS);
    const version = result?.updateInfo?.version;

    if (!version || version === app.getVersion()) {
      splash.close();
      return false;
    }

    splash.setStatus(`Downloading ${version}…`);
    autoUpdater.on('download-progress', (progress) => {
      splash.setProgress(progress.percent);
      splash.setStatus(`Downloading ${version}… ${Math.round(progress.percent)}%`);
    });

    await autoUpdater.downloadUpdate();

    splash.setProgress(100);
    splash.setStatus(`Installing ${version}…`);

    // Give the splash a moment to paint the final state before the installer takes over.
    await new Promise((resolve) => { setTimeout(resolve, 400); });

    // isSilent so NSIS does not raise its own window on top of the splash.
    autoUpdater.quitAndInstall(true, true);
    return true;
  } catch {
    splash.close();
    return false;
  }
}
