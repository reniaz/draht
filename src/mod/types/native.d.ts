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
};

interface Window {
  draht?: DrahtNative;
}
