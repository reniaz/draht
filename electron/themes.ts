import { app, dialog, ipcMain, shell } from 'electron';
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Themes dropped into a folder on disk.
 *
 * Under a folder named after this app rather than in userData. userData is named for the
 * upstream package — `telegram-t` — which is the right home for the session and the
 * caches, and a baffling place to be told to put your themes. This is the one directory
 * users are asked to open by hand, so it is the one that has to be findable.
 *
 * Beside userData rather than inside it, and deliberately not `app.setPath('userData')`:
 * moving userData would strand the existing session and message log, which live there.
 *
 * The folder is seeded with a worked example on first run. An empty folder tells you
 * nothing about the format, and a file you can open and edit is a better explanation than
 * documentation.
 */
function themesDir() {
  return join(dirname(app.getPath('userData')), 'Draht', 'themes');
}

/** Where themes lived before, so an existing collection is not left behind. */
function legacyThemesDir() {
  return join(app.getPath('userData'), 'themes');
}

/**
 * Copies any themes from the old location on first run in the new one.
 *
 * Copied rather than moved: if anything here is wrong, the originals are still where they
 * were. The example is skipped, since the new folder writes its own.
 */
function migrateThemes(dir: string) {
  try {
    const legacy = legacyThemesDir();
    if (!existsSync(legacy)) return;

    for (const file of readdirSync(legacy)) {
      if (!file.endsWith('.json') || file === EXAMPLE_FILE) continue;

      const target = join(dir, file);
      if (!existsSync(target)) copyFileSync(join(legacy, file), target);
    }
  } catch {
    // Best-effort: a themes folder that starts empty is recoverable by hand.
  }
}

const EXAMPLE_FILE = 'example.json';

const EXAMPLE = `{
  "name": "Example",
  "author": "you",

  "//": "Ten colours describe a whole theme; everything else is derived from them.",
  "//  Edit this file, restart Draht, and it appears in Settings > Plugins > Themes.": "",
  "//  Copy it to make your own — the file name does not matter, the name above does.": "",

  "colors": {
    "background":  "#1b1d21",
    "surface":     "#23262b",
    "raised":      "#2f333a",
    "border":      "#2f333a",
    "text":        "#d7dce3",
    "textMuted":   "#8b93a1",
    "accent":      "#6ea8fe",
    "link":        "#6ea8fe",
    "error":       "#e06c75",
    "success":     "#77c17d",

    "//deleted": "Colour of messages MessageLogger kept after someone deleted them.",
    "deleted":     "#c678dd"
  }
}
`;

function ensureThemesDir() {
  const dir = themesDir();
  const isNew = !existsSync(dir);

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (isNew) migrateThemes(dir);

  const example = join(dir, EXAMPLE_FILE);
  // Only written when missing, so deleting it is respected rather than undone every launch.
  if (!existsSync(example) && !readdirSync(dir).some((f) => f.endsWith('.json'))) {
    writeFileSync(example, EXAMPLE, 'utf8');
  }

  return dir;
}

function readThemes() {
  const dir = ensureThemesDir();

  return readdirSync(dir)
    .filter((file) => file.toLowerCase().endsWith('.json'))
    .map((file) => {
      try {
        return { file, content: readFileSync(join(dir, file), 'utf8') };
      } catch {
        return undefined;
      }
    })
    .filter(Boolean);
}

export function initThemes() {
  // Parsing happens in the renderer, which owns the theme format; the main process only
  // does what the renderer cannot — reach the filesystem.
  ipcMain.handle('draht:list-themes', () => {
    try {
      return readThemes();
    } catch {
      return [];
    }
  });

  ipcMain.handle('draht:themes-dir', () => themesDir());

  /**
   * Writes a theme out, offering the themes folder first.
   *
   * A browser download would put it in Downloads, from where it does nothing until it is
   * moved by hand. Starting the dialog in the themes folder means the obvious answer —
   * pressing Save — leaves the theme somewhere it actually takes effect, while still
   * allowing it to be put anywhere for sharing.
   */
  ipcMain.handle('draht:export-theme', async (_event, payload: { name: string; content: string }) => {
    try {
      const dir = ensureThemesDir();
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export theme',
        defaultPath: join(dir, payload.name),
        filters: [{ name: 'Theme', extensions: ['json'] }],
      });

      if (canceled || !filePath) return undefined;

      writeFileSync(filePath, payload.content, 'utf8');

      return filePath;
    } catch {
      return undefined;
    }
  });

  /**
   * Saves whatever the renderer produced, wherever the user chooses.
   *
   * Defaults to Documents rather than the themes folder: this is for exports that are not
   * themes, and dropping a chat transcript among the theme files would be a surprise.
   */
  ipcMain.handle('draht:save-file', async (
    _event,
    payload: { name: string; content: string; title?: string },
  ) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: payload.title || 'Save',
        defaultPath: join(app.getPath('documents'), payload.name),
      });

      if (canceled || !filePath) return undefined;

      writeFileSync(filePath, payload.content, 'utf8');

      return filePath;
    } catch {
      return undefined;
    }
  });

  ipcMain.on('draht:open-themes-folder', () => {
    void shell.openPath(ensureThemesDir());
  });

  // Created at startup so the folder exists before anyone goes looking for it.
  try {
    ensureThemesDir();
  } catch {
    // A read-only userData is unusual and not worth failing startup over.
  }
}
