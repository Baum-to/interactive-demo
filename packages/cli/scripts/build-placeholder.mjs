/**
 * Rasterise the starter placeholder into `src/template/placeholder.png`.
 *
 * The design lives in `placeholderSvg()` in scripts/placeholder.mjs; the PNG
 * is what ships and what `init` copies into a new demo. SVG is deliberately
 * not the scaffolded asset — the hosted service refuses it, so a scaffold
 * that shipped one could never be published.
 *
 * Run after changing the design:
 *   npm run build:placeholder -w @inkly-org/interactive-demo-cli
 *
 * Not wired into `build`: this needs sharp's native binary, the output is
 * committed, and the design changes about once a year.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEIGHT, WIDTH, placeholderSvg } from './placeholder.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const out = join(pkgRoot, 'src', 'template', 'placeholder.png');

// The starter demo declares the image's natural size; keep the two in step.
const src = readFileSync(join(pkgRoot, 'src', 'starter.ts'), 'utf8');
const width = Number(src.match(/const PLACEHOLDER_WIDTH = (\d+);/)?.[1]);
const height = Number(src.match(/const PLACEHOLDER_HEIGHT = (\d+);/)?.[1]);
if (width !== WIDTH || height !== HEIGHT) {
  throw new Error(
    `src/starter.ts declares ${width}x${height} but scripts/placeholder.mjs draws ${WIDTH}x${HEIGHT}`,
  );
}

const { default: sharp } = await import('sharp');
// A flat UI in a few dozen greys: a 256-colour palette is visually lossless
// and a fraction of the bytes of truecolour.
const png = await sharp(Buffer.from(placeholderSvg()))
  .png({ compressionLevel: 9, palette: true, quality: 100 })
  .toBuffer();
writeFileSync(out, png);

const meta = await sharp(png).metadata();
if (meta.width !== width || meta.height !== height) {
  throw new Error(`Rasterised ${meta.width}x${meta.height}, expected ${width}x${height}`);
}
console.log(`wrote ${out} (${meta.width}x${meta.height}, ${png.length} bytes)`);
