import { contextBridge } from 'electron';

/**
 * Deliberately tiny. The mod persists everything through IndexedDB in the renderer,
 * so it needs nothing from the main process. Every capability added here is a hole
 * punched through contextIsolation, so add only what genuinely cannot live renderer-side.
 */
contextBridge.exposeInMainWorld('modNative', {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
