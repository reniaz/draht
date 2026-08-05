import { app, ipcMain, shell } from 'electron';
import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/**
 * Themes dropped into a folder on disk.
 *
 * Kept in userData rather than next to the executable so it survives updates, and so it
 * is writable without administrator rights.
 *
 * The folder is seeded with a worked example on first run. An empty folder tells you
 * nothing about the format, and a file you can open and edit is a better explanation than
 * documentation.
 */
function themesDir() {
  return join(app.getPath('userData'), 'themes');
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

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

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
