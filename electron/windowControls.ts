import { BrowserWindow, ipcMain } from 'electron';

/**
 * Window behaviour the renderer cannot perform itself.
 *
 * telegram-tt's notification click handler calls `window.focus()`. In a browser that
 * raises the tab; in Electron it does nothing useful — a minimised window stays
 * minimised, and a background window stays behind whatever is in front. Restoring and
 * raising has to happen in the main process.
 */
export function initWindowControls(getWindow: () => BrowserWindow | undefined) {
  ipcMain.on('draht:focus-window', () => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;

    if (window.isMinimized()) window.restore();
    if (!window.isVisible()) window.show();

    // Stop any flashing at the same time — the user has clearly noticed.
    window.flashFrame(false);
    window.focus();
  });

  ipcMain.on('draht:flash-window', () => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;

    // Flashing a window that is already in front would be noise.
    if (window.isFocused()) return;

    window.flashFrame(true);
  });
}
