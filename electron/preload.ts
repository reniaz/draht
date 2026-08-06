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

  /** The running app's version, as installed — not the build-time constant. */
  appVersion(): Promise<string | undefined> {
    return ipcRenderer.invoke('draht:app-version');
  },

  /** The window buttons, drawn by the page and so operated from it. */
  minimizeWindow() {
    ipcRenderer.send('draht:window-minimize');
  },

  toggleMaximizeWindow() {
    ipcRenderer.send('draht:window-toggle-maximize');
  },

  closeWindow() {
    ipcRenderer.send('draht:window-close');
  },

  isWindowMaximized(): Promise<boolean> {
    return ipcRenderer.invoke('draht:window-is-maximized');
  },

  onMaximizeChange(callback: (isMaximized: boolean) => void) {
    const handler = (_event: unknown, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on('draht:window-maximized', handler);

    return () => ipcRenderer.off('draht:window-maximized', handler);
  },

  /** Restores and raises the window. `window.focus()` alone cannot do this in Electron. */
  focusWindow() {
    ipcRenderer.send('draht:focus-window');
  },

  /** Flashes the taskbar entry until the window is looked at. */
  flashWindow() {
    ipcRenderer.send('draht:flash-window');
  },

  /** Theme files the user has dropped into the themes folder. */
  listThemes(): Promise<{ file: string; content: string }[]> {
    return ipcRenderer.invoke('draht:list-themes');
  },

  /** Writes an export folder — transcript plus media — and reveals it. */
  saveExport(
    folder: string,
    files: { name: string; text?: string; bytes?: Uint8Array }[],
  ): Promise<string | undefined> {
    return ipcRenderer.invoke('draht:save-export', { folder, files });
  },

  /** Saves any file the renderer has produced, through the OS save dialog. */
  saveFile(name: string, content: string, title?: string): Promise<string | undefined> {
    return ipcRenderer.invoke('draht:save-file', { name, content, title });
  },

  /** Saves a theme file, with the save dialog starting in the themes folder. */
  exportTheme(name: string, content: string): Promise<string | undefined> {
    return ipcRenderer.invoke('draht:export-theme', { name, content });
  },

  themesDir(): Promise<string> {
    return ipcRenderer.invoke('draht:themes-dir');
  },

  openThemesFolder() {
    ipcRenderer.send('draht:open-themes-folder');
  },
});
