/**
 * Generates the spoken year clips into public/audio/<AUDIO_SET>/.
 *
 * Run by hand, never as part of `bun run build`. The clips are shipped content
 * like the hundred year codes themselves: generated once, committed, and served
 * from the app's own origin. The app makes no network call at runtime and this
 * script is the only thing in the repo that talks to anybody.
 *
 *   set -a; source ~/lairner/.env; set +a      # or export it however you like
 *   node scripts/generate-tts.mjs
 *
 * The key is read from ELEVENLABS_API_KEY in the environment and from nowhere
 * else. It is never written to a file, never printed, and never committed.
 *
 * Idempotent and resumable: a clip whose file already exists is skipped, so a
 * rerun after a failure costs nothing and no credits. Failures are reported and
 * the run continues; the exit code is non-zero if anything failed.
 *
 * To change the voice, bump BOTH the AUDIO_SET here and `AUDIO_SET` in
 * src/features/audio/speech.ts. public/ is copied verbatim by Vite, so these
 * filenames are not content-hashed and nginx pins them for a year: a clip
 * regenerated in a different voice under the same name would reach nobody who
 * already has the old one, and the table would end up half in each voice.
 */
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';

/** Must match src/features/audio/speech.ts. */
const AUDIO_SET = 'v1';

/**
 * ElevenLabs voice. Fixed, because the cue has to be identical on every device
 * and every regeneration — a year the user learned in one voice and is tested
 * on in another is a different cue.
 *
 * eXpIbVcVbLo8ZJQDlDnl is "Siren - natural realistic podcast voice", the
 * English voice lairner's TTSService uses as VOICE_ENG. Unhurried, evenly
 * paced, and it reads "oh four" as a year rather than as two digits. The script
 * prints the voice's name at startup so a run always records which one it used.
 */
const VOICE_ID = 'eXpIbVcVbLo8ZJQDlDnl';

/** Fast, cheap, and made for exactly this: short formulaic English. */
const MODEL_ID = 'eleven_flash_v2_5';

/**
 * Mono, 22.05 kHz, 32 kbps. Speech at this bitrate is clean, and the whole set
 * of 200 clips has to stay well under the 1.5 MB the app is willing to ship.
 */
const OUTPUT_FORMAT = 'mp3_22050_32';

/** Politeness between requests, in millis. */
const GAP_MS = 120;

const OUT = new URL(`../public/audio/${AUDIO_SET}/`, import.meta.url);

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
];
const TEENS = [
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/**
 * The year as an English speaker says a two-digit year: "oh four", "twenty-two".
 * Spelled out rather than left as digits, or the model reads 22 as "two two".
 */
function spokenYear(yy) {
  if (yy < 10) return `oh ${yy === 0 ? 'oh' : ONES[yy]}`;
  if (yy < 20) return TEENS[yy - 10];
  const tens = TENS[Math.floor(yy / 10)];
  const ones = yy % 10;
  return ones === 0 ? tens : `${tens}-${ONES[ones]}`;
}

/** The same formula src/domain/yearCodes.ts ships as a literal table. */
function codeFor(yy) {
  return (yy + Math.floor(yy / 4)) % 7;
}

const pad = (yy) => String(yy).padStart(2, '0');

/**
 * The two things the app ever needs to say.
 *
 * The pair is one utterance rather than a year clip and a code clip played back
 * to back. Two files would have halved the payload, and two concatenated clips
 * sound stitched: the join lands exactly between the year and its code, which
 * is the one place a gap teaches the wrong thing. One utterance also gets the
 * prosody right, so "year twenty-two is five" falls the way a person says it.
 */
function clips() {
  const out = [];
  for (let yy = 0; yy < 100; yy += 1) {
    out.push({ name: `cue-${pad(yy)}.mp3`, text: `Year ${spokenYear(yy)}.` });
    out.push({
      name: `pair-${pad(yy)}.mp3`,
      text: `Year ${spokenYear(yy)} is ${ONES[codeFor(yy)]}.`,
    });
  }
  return out;
}

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('ELEVENLABS_API_KEY is not set. See the header of this file.');
  process.exit(2);
}

async function voiceName() {
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${VOICE_ID}`, {
      headers: { 'xi-api-key': key },
    });
    if (!res.ok) return `unknown (${res.status})`;
    const body = await res.json();
    return body?.name ?? 'unnamed';
  } catch {
    return 'unknown';
  }
}

async function speak(text) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=${OUTPUT_FORMAT}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': key },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return new Uint8Array(await res.arrayBuffer());
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

mkdirSync(OUT, { recursive: true });

console.log(`voice\t${VOICE_ID}\t${await voiceName()}`);
console.log(`model\t${MODEL_ID}\t${OUTPUT_FORMAT}`);

let written = 0;
let skipped = 0;
let bytes = 0;
const failed = [];

for (const clip of clips()) {
  const file = new URL(clip.name, OUT);
  if (existsSync(file)) {
    skipped += 1;
    bytes += statSync(file).size;
    continue;
  }
  try {
    const audio = await speak(clip.text);
    // An mp3 frame starts with 0xFF or an ID3 tag. Anything else is an error
    // body that happened to arrive with a 200.
    if (audio[0] !== 0xff && !(audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33)) {
      throw new Error('response is not an mp3');
    }
    writeFileSync(file, audio);
    written += 1;
    bytes += audio.length;
    console.log(`${clip.name}\t${audio.length}\t${clip.text}`);
  } catch (error) {
    failed.push(`${clip.name}: ${error.message}`);
    console.error(`FAILED ${clip.name}\t${error.message}`);
  }
  await wait(GAP_MS);
}

console.log(`written\t${written}`);
console.log(`skipped\t${skipped}`);
console.log(`total\t${bytes}\t(${(bytes / 1024).toFixed(1)} KB)`);

if (failed.length > 0) {
  console.error(`\n${failed.length} clip(s) failed. Rerun to retry only these:`);
  for (const line of failed) console.error(`  ${line}`);
  process.exit(1);
}
