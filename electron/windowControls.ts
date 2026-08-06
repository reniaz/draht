import { app, BrowserWindow, ipcMain } from 'electron';

/**
 * Window behaviour the renderer cannot perform itself.
 *
 * telegram-tt's notification click handler calls `window.focus()`. In a browser that
 * raises the tab; in Electron it does nothing useful — a minimised window stays
 * minimised, and a background window stays behind whatever is in front. Restoring and
 * raising has to happen in the main process.
 */
export function initWindowControls(getWindow: () => BrowserWindow | undefined) {
  // The version of the app that is actually running, which is the honest answer for an
  // install. Unpackaged there is no installed version to report — `app.getVersion()` finds
  // no app manifest and answers with Electron's own version — so the renderer is left to
  // fall back to the constant baked in at build time.
  ipcMain.handle('draht:app-version', () => (app.isPackaged ? app.getVersion() : undefined));

  ipcMain.on('draht:focus-window', () => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;

    if (window.isMinimized()) window.restore();
    if (!window.isVisible()) window.show();

    // Stop any flashing at the same time — the user has clearly noticed.
    window.flashFrame(false);
    window.focus();
  });

  /**
   * The window buttons, which the page draws and therefore has to operate.
   *
   * Toggling rather than separate maximise and restore messages: the button is one control
   * with two states, and having the renderer decide which to send would mean it holding a
   * copy of the window state that can drift from the real one.
   */
  ipcMain.on('draht:window-minimize', () => getWindow()?.minimize());

  ipcMain.on('draht:window-toggle-maximize', () => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;

    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });

  ipcMain.on('draht:window-close', () => getWindow()?.close());

  ipcMain.handle('draht:window-is-maximized', () => Boolean(getWindow()?.isMaximized()));

  ipcMain.on('draht:flash-window', () => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;

    // Flashing a window that is already in front would be noise.
    if (window.isFocused()) return;

    window.flashFrame(true);
  });
}
