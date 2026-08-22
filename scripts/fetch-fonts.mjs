/**
 * Pulls the four latin-subset IBM Plex faces the app uses out of the Google
 * Fonts CSS API and writes them into public/fonts/. IBM Plex is OFL, so the
 * files are committed and the app never talks to a CDN.
 *
 * `bun scripts/fetch-fonts.mjs`, only when the faces need refreshing. The
 * browser User-Agent matters: without it the API answers with ttf.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const OUT = new URL('../public/fonts/', import.meta.url);

/**
 * 400 and 500 only. STYLEGUIDE.md §3 uses exactly two weights, and a weight the
 * stylesheet declares but nothing asks for is dead bytes in the precache.
 */
const FACES = [
  ['ibm-plex-sans-400.woff2', 'IBM+Plex+Sans:wght@400'],
  ['ibm-plex-sans-500.woff2', 'IBM+Plex+Sans:wght@500'],
  ['ibm-plex-mono-400.woff2', 'IBM+Plex+Mono:wght@400'],
  ['ibm-plex-mono-500.woff2', 'IBM+Plex+Mono:wght@500'],
];

/** Faces from an earlier weight choice, removed so they cannot be precached. */
const STALE = ['ibm-plex-sans-600.woff2', 'ibm-plex-mono-600.woff2'];

/** The latin subset is the block whose unicode-range starts at U+0000-00FF. */
async function latinUrl(spec) {
  const res = await fetch(`https://fonts.googleapis.com/css2?family=${spec}&display=swap`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`${spec}: ${res.status}`);
  const css = await res.text();
  for (const part of css.split('@font-face').slice(1)) {
    const range = /unicode-range: ([^;]+);/.exec(part)?.[1];
    if (!range?.startsWith('U+0000-00FF')) continue;
    const url = /src: url\(([^)]+)\)/.exec(part)?.[1];
    if (url) return url;
  }
  throw new Error(`${spec}: no latin subset in the response`);
}

mkdirSync(OUT, { recursive: true });

let total = 0;
for (const [name, spec] of FACES) {
  const url = await latinUrl(spec);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] !== 0x77 || bytes[1] !== 0x4f || bytes[2] !== 0x46 || bytes[3] !== 0x32) {
    throw new Error(`${name}: not a woff2 (magic ${[...bytes.slice(0, 4)].join(',')})`);
  }
  writeFileSync(new URL(name, OUT), bytes);
  total += bytes.length;
  console.log(`${name}\t${bytes.length}\t${url}`);
}
for (const name of STALE) {
  rmSync(new URL(name, OUT), { force: true });
}
console.log(`total\t${total}`);
