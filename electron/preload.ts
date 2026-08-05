import { contextBridge, ipcRenderer } from 'electron';

export type UpdateInfo = { version: string };
export type UpdateProgress = { percent: number };

/**
 * Deliberately tiny. Everything else the mod needs it does in the renderer, so the only
 * capabilities here are the ones that genuinely cannot live there: update notifications,
 * which originate in the main process.
 *
 * Listeners are wrapped rather than exposing `ipcRenderer` itself — handing the renderer
 * a raw IPC object would let any page script send arbitrary messages to the main process.
 */
contextBridge.exposeInMainWorld('draht', {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },

  onUpdateProgress(callback: (progress: UpdateProgress) => void) {
    const handler = (_event: unknown, progress: UpdateProgress) => callback(progress);
    ipcRenderer.on('draht:update-progress', handler);
    return () => ipcRenderer.off('draht:update-progress', handler);
  },

  onUpdateReady(callback: (info: UpdateInfo) => void) {
    const handler = (_event: unknown, info: UpdateInfo) => callback(info);
    ipcRenderer.on('draht:update-ready', handler);
    return () => ipcRenderer.off('draht:update-ready', handler);
  },

  installUpdate() {
    ipcRenderer.send('draht:install-update');
  },

  /** Restores and raises the window. `window.focus()` alone cannot do this in Electron. */
  focusWindow() {
    ipcRenderer.send('draht:focus-window');
  },

  /** Flashes the taskbar entry until the window is looked at. */
  flashWindow() {
    ipcRenderer.send('draht:flash-window');
  },
});
