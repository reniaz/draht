import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { type Splash, showSplash } from './splash';

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

/**
 * Beyond this, treat the install as refused and open the app.
 *
 * Generous, because the installers run synchronously and one of them is a password
 * prompt: on an rpm install the user has to answer polkit before electron-updater
 * returns at all.
 */
const INSTALL_TIMEOUT_MS = 120_000;

/**
 * The splash outlives this module's work on purpose.
 *
 * It is the only window during the update check, and closing it before the main window
 * exists leaves Electron with zero windows — which fires `window-all-closed` and quits the
 * app mid-launch. The caller closes it once the main window is up, so the two overlap.
 */
let splash: Splash | undefined;

export function closeStartupSplash() {
  splash?.close();
  splash = undefined;
}

export function setStartupStatus(text: string) {
  splash?.setStatus(text);
}

/**
 * Whether `candidate` is a higher version than `current`.
 *
 * Numeric segments compared left to right, missing segments treated as 0, and any
 * pre-release suffix ignored — the release feed only ever carries plain `x.y.z`, and a
 * comparison that guesses at more than it has to is a comparison that can be wrong in a
 * way nobody notices until an update silently stops arriving.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (value: string) => value.split('-')[0].split('.').map((part) => Number(part) || 0);

  const a = parse(candidate);
  const b = parse(current);

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left > right;
  }

  return false;
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => { setTimeout(() => resolve(undefined), ms); }),
  ]);
}

/**
 * Where electron-updater stages downloads.
 *
 * Mirrors electron-updater's own `getAppCacheDir`, which the package does not export and
 * Electron's `app.getPath` has no equivalent of. Guessing at it instead would mean
 * cleaning a directory the installers were never written to.
 */
function updaterCacheRoot() {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  }

  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches');

  return process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
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
    // The folder name comes from `updaterCacheDirName` in app-update.yml, which
    // electron-builder derives from the package name — "telegram-t-updater" here, not
    // anything matching the product name. Reading it beats guessing.
    const config = join(process.resourcesPath, 'app-update.yml');
    if (!existsSync(config)) return;

    const dirName = readFileSync(config, 'utf8').match(/^updaterCacheDirName:\s*(\S+)/m)?.[1];
    if (!dirName) return;

    const pending = join(updaterCacheRoot(), dirName, 'pending');
    if (!existsSync(pending)) return;

    const currentVersion = app.getVersion();

    // Matched on the version rather than the extension, because the extension is
    // whatever this platform installs from — `.exe`, `.AppImage`, `.rpm`.
    for (const file of readdirSync(pending)) {
      // An installer for the version already running has done its job. Anything else is
      // a genuinely pending update and must be left alone.
      if (!file.includes(`-${currentVersion}.`)) continue;

      const full = join(pending, file);
      if (statSync(full).isFile()) rmSync(full, { force: true });
    }
  } catch {
    // Best-effort housekeeping; never worth failing startup over.
  }
}

/**
 * Starts the install and reports whether the app is really quitting to perform it.
 *
 * `quitAndInstall` returns nothing either way. When the install does not take — a polkit
 * prompt dismissed on Fedora, an AppImage running from an extracted directory — the app
 * simply stays alive, and a caller that assumed otherwise leaves the splash as the only
 * window and no client behind it. Waiting for the quit, or for the error that says there
 * will not be one, is what keeps a refused update from stranding the launch.
 */
function installUpdate(): Promise<boolean> {
  return new Promise((resolve) => {
    // An install that neither quits nor reports an error is not one this can wait on.
    const timer = setTimeout(() => resolve(false), INSTALL_TIMEOUT_MS);

    const settle = (isInstalling: boolean) => {
      clearTimeout(timer);
      resolve(isInstalling);
    };

    app.once('before-quit', () => settle(true));
    autoUpdater.once('error', () => settle(false));

    // isSilent so a Windows installer does not raise its own window over the splash.
    autoUpdater.quitAndInstall(true, true);
  });
}

/**
 * @returns true when an install is starting, so the caller must not open the main window.
 */
export async function runStartupUpdate(iconPath: string): Promise<boolean> {
  // The splash and this whole path only exist in a packaged app. DRAHT_FORCE_SPLASH opens
  // it anyway, so `mod:check:app` can exercise the launch ordering — which is where it
  // broke once, invisibly, because an unpackaged check returns here and never sees it.
  if (!app.isPackaged && !process.env.DRAHT_FORCE_SPLASH) return false;

  cleanUpdaterCache();

  splash = showSplash(iconPath);

  try {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    const result = await withTimeout(autoUpdater.checkForUpdates(), CHECK_TIMEOUT_MS);
    const version = result?.updateInfo?.version;

    // `updateInfo.version` is whatever the feed's latest release is, present or not — it
    // is not a claim that an update applies. Testing it for inequality treats a *newer*
    // local build as an update, and `downloadUpdate()` then throws "Please check update
    // first". Only a genuinely higher version is an update.
    if (!version || !isNewerVersion(version, app.getVersion())) {
      // Left open, and left saying something true, until the main window takes over.
      splash?.setStatus('Starting Draht…');
      return false;
    }

    const shown = splash;

    shown.setStatus(`Downloading ${version}…`);
    autoUpdater.on('download-progress', (progress) => {
      shown.setProgress(progress.percent);
      shown.setStatus(`Downloading ${version}… ${Math.round(progress.percent)}%`);
    });

    await autoUpdater.downloadUpdate();

    shown.setProgress(100);
    shown.setStatus(`Installing ${version}…`);

    // Give the splash a moment to paint the final state before the installer takes over.
    await new Promise((resolve) => { setTimeout(resolve, 400); });

    if (await installUpdate()) return true;

    // Refused or failed: the update stays pending and this launch carries on.
    splash?.setStatus('Starting Draht…');
    return false;
  } catch {
    splash?.setStatus('Starting Draht…');
    return false;
  }
}
