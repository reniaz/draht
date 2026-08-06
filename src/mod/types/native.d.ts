/**
 * The API exposed by the Electron preload (electron/preload.ts).
 *
 * Absent when the web app runs outside the desktop shell, so every use must be guarded.
 */
type DrahtNative = {
  isElectron: true;
  platform: string;
  versions: { electron: string; chrome: string; node: string };
  /** Returns an unsubscribe function. */
  onUpdateProgress: (cb: (progress: { percent: number }) => void) => () => void;
  /** Returns an unsubscribe function. */
  onUpdateReady: (cb: (info: { version: string }) => void) => () => void;
  installUpdate: () => void;
  focusWindow: () => void;
  flashWindow: () => void;
  appVersion?: () => Promise<string | undefined>;
  setTitleBar?: (color: string, symbolColor: string) => void;
  exportTheme?: (name: string, content: string) => Promise<string | undefined>;
  saveFile?: (name: string, content: string, title?: string) => Promise<string | undefined>;
  saveExport?: (
    folder: string,
    files: { name: string; text?: string; bytes?: Uint8Array }[],
  ) => Promise<string | undefined>;
  listThemes: () => Promise<{ file: string; content: string }[]>;
  themesDir: () => Promise<string>;
  openThemesFolder: () => void;
};

interface Window {
  draht?: DrahtNative;
}
