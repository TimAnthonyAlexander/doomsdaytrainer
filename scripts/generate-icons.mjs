/**
 * The app's mark, everywhere it is shipped as a file.
 *
 * Run by hand, like `generate-tts.mjs`, and its output is committed:
 *
 *   node scripts/generate-icons.mjs
 *
 * Needs `rsvg-convert` on PATH (`brew install librsvg`). The Open Graph image
 * carries type, so it also needs IBM Plex Sans; the script downloads the
 * variable font to a temp directory the first time and renders through a
 * throwaway fontconfig, rather than asking anyone to install a face.
 *
 * The mark is the answer pad: three, three, one. Seven keys because there are
 * seven weekdays, which is the one shape the whole app is built on — the same
 * geometry as `Mark` in `src/components/shell/AppShell.tsx`.
 *
 * Colours are the light-mode tokens from `src/theme/tokens.ts`, copied rather
 * than imported because this runs outside the bundle. They were the old green
 * for a while after the palette moved to purple, which is exactly the drift
 * this script exists to make cheap to fix: change the four values below and
 * re-run.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

/** Light-mode tokens. Keep in step with src/theme/tokens.ts. */
const GROUND = '#FAF9F6'; // --bg
const MARK = '#534AB7'; // --brand-deep
const INK = '#2C2C2A'; // --text-primary
const INK_MUTED = '#5F5E5A'; // --text-secondary

const FONT_URL =
  'https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsans/IBMPlexSans%5Bwdth,wght%5D.ttf';

/**
 * The seven keys, laid into a content box.
 *
 * One function for every size, because the proportions are the thing that has
 * to hold: a cell is 24 wide on a 30 pitch with a radius of 7, which is where
 * `favicon.svg` started and what every other file here is a scale of.
 */
function keys(x, y, content) {
  const cell = content / 3.5;
  const pitch = content / 2.8;
  const rx = cell * (7 / 24);
  const columns = [0, 1, 2];
  const cells = [
    ...columns.map((c) => [c, 0]),
    ...columns.map((c) => [c, 1]),
    [1, 2],
  ];
  return cells
    .map(
      ([c, r]) =>
        `<rect x="${round(x + c * pitch)}" y="${round(y + r * pitch)}" ` +
        `width="${round(cell)}" height="${round(cell)}" rx="${round(rx)}"/>`,
    )
    .join('\n    ');
}

/** Two decimals, and no trailing zeros: the files are read by people. */
function round(value) {
  return Number(value.toFixed(2));
}

/**
 * A square icon. `ratio` is how much of the edge the seven keys span, and
 * `rounded` is whether the ground carries the corner radius itself.
 *
 * Maskable and Apple both apply their own mask, so their ground runs to the
 * edge and the keys pull in to clear it. A maskable icon's safe area is a
 * circle 80% of the edge, so a square inside it is about 56%; 53 is that with
 * room to spare. Apple's mask is a rounded square, which takes far less, so
 * the keys stay closer to the size they are in the browser tab.
 */
function squareSvg(size, { ratio, rounded }) {
  const content = size * ratio;
  const offset = (size - content) / 2;
  const ground = rounded
    ? `<rect width="${size}" height="${size}" rx="${round(size * 0.2)}" fill="${GROUND}"/>`
    : `<rect width="${size}" height="${size}" fill="${GROUND}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Doomsday Trainer">
  <title>Doomsday Trainer</title>
  ${ground}
  <g fill="${MARK}">
    ${keys(offset, offset, content)}
  </g>
</svg>
`;
}

/**
 * The Open Graph card: the mark, the name, and one line saying what the app
 * does. The line is the product's own sentence, not a feature list — it used
 * to read "the 100 year codes", which named one step of the method as though
 * it were the whole thing.
 */
function ogSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="${GROUND}"/>
  <g fill="${MARK}">
    ${keys(100, 118, 200)}
  </g>
  <text x="100" y="435" font-family="IBM Plex Sans" font-weight="700" font-size="80" fill="${INK}">Doomsday Trainer</text>
  <text x="100" y="503" font-family="IBM Plex Sans" font-weight="400" font-size="38" fill="${INK_MUTED}">any date to its weekday, in your head</text>
</svg>
`;
}

/**
 * `-w`/`-h` are given explicitly rather than left to the SVG's intrinsic size:
 * the browser icon is drawn in a 100-unit box and shipped at 192 and at 512,
 * so the file's own dimensions are never the ones wanted.
 */
function render(svg, outFile, { width, height, fontconfig } = {}) {
  const work = mkdtempSync(path.join(tmpdir(), 'doomsday-icon-'));
  const svgFile = path.join(work, 'in.svg');
  writeFileSync(svgFile, svg);
  const size = width ? ['-w', String(width), '-h', String(height ?? width)] : [];
  execFileSync('rsvg-convert', [...size, '-o', outFile, svgFile], {
    env: fontconfig ? { ...process.env, FONTCONFIG_FILE: fontconfig } : process.env,
  });
}

/**
 * A fontconfig that can see one downloaded face and nothing else, so the card
 * cannot silently render in whatever the machine happens to have installed.
 */
async function fontConfig() {
  const work = mkdtempSync(path.join(tmpdir(), 'doomsday-font-'));
  const fonts = path.join(work, 'fonts');
  const cache = path.join(work, 'cache');
  mkdirSync(fonts);
  mkdirSync(cache);

  const response = await fetch(FONT_URL);
  if (!response.ok) throw new Error(`Font download failed: ${response.status}`);
  writeFileSync(path.join(fonts, 'IBMPlexSans.ttf'), Buffer.from(await response.arrayBuffer()));

  const file = path.join(work, 'fonts.conf');
  writeFileSync(
    file,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>${fonts}</dir>
  <cachedir>${cache}</cachedir>
</fontconfig>
`,
  );
  return file;
}

const browser = squareSvg(100, { ratio: 0.84, rounded: true });
writeFileSync(path.join(PUBLIC, 'favicon.svg'), browser);
render(browser, path.join(PUBLIC, 'icon-192.png'), { width: 192 });
render(browser, path.join(PUBLIC, 'icon-512.png'), { width: 512 });
render(squareSvg(180, { ratio: 0.66, rounded: false }), path.join(PUBLIC, 'apple-touch-icon.png'), {
  width: 180,
});
render(squareSvg(512, { ratio: 0.53, rounded: false }), path.join(PUBLIC, 'icon-512-maskable.png'), {
  width: 512,
});
render(ogSvg(), path.join(PUBLIC, 'og.png'), { fontconfig: await fontConfig() });

console.log('favicon.svg, icon-192, icon-512, icon-512-maskable, apple-touch-icon, og.png');
