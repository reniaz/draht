#!/usr/bin/env node
/**
 * Rasterises the icon variants in electron/assets into the formats the shell needs.
 *
 *   npm run mod:icon
 *
 * For each `icon-<variant>.svg` it produces:
 *   icon-<variant>-256.png  - BrowserWindow icon / taskbar
 *   icon-<variant>-512.png  - packaging, Linux
 *   icon-<variant>.ico      - multi-resolution, electron-builder on Windows
 */
import pngToIco from 'png-to-ico';
import sharp from 'sharp';
import { readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'electron', 'assets');

// Windows expects this ladder; a missing size gets scaled badly by the shell.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function render(svgPath, size) {
  return sharp(svgPath, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

const variants = (await readdir(ASSETS))
  .filter((file) => /^icon-[a-z0-9]+\.svg$/i.test(file));

if (!variants.length) {
  console.error(`No icon-*.svg files found in ${ASSETS}`);
  process.exit(1);
}

for (const file of variants) {
  const name = file.replace(/\.svg$/, '');
  const svgPath = join(ASSETS, file);

  const [png256, png512] = await Promise.all([
    render(svgPath, 256),
    render(svgPath, 512),
  ]);

  await writeFile(join(ASSETS, `${name}-256.png`), png256);
  await writeFile(join(ASSETS, `${name}-512.png`), png512);

  const icoBuffers = await Promise.all(ICO_SIZES.map((size) => render(svgPath, size)));
  await writeFile(join(ASSETS, `${name}.ico`), await pngToIco(icoBuffers));

  console.log(`  ${name}: 256.png, 512.png, .ico (${ICO_SIZES.join(', ')})`);
}

console.log(`\nBuilt ${variants.length} icon variant(s) in electron/assets`);
