import type { YearKey } from '@/domain/types';
import { formatYear } from '@/domain/yearCodes';

/**
 * Spoken years and codes.
 *
 * The clips are shipped content, generated once by `scripts/generate-tts.mjs`
 * and committed, exactly like the hundred year codes themselves. Nothing here
 * talks to a network: these are same-origin static files under /audio/, and the
 * service worker caches them as they are played rather than precaching them,
 * because a first install should not pay for a hundred clips the user may never
 * reach.
 *
 * Why speak at all: a year and its code are two numbers with nothing about
 * either that suggests the other, and a visual-only route means one cue for one
 * target. Saying "year twenty-two is five" adds a second, and the auditory one
 * is the route that survives not looking at anything.
 *
 * Where it plays is deliberately narrow. Learn only. A spoken prompt runs about
 * a second, people wait for it to finish, and Review measures latency from
 * paint to tap — so speaking in Review would put a second of listening inside
 * every latency the app grades, feeds to `fluency.ts`, and reports as mastery.
 * Nothing in Learn is timed, so nothing in Learn can be corrupted this way.
 */

/**
 * Which generated set the app plays.
 *
 * It is in the path, and it is the reason the path has a version segment at
 * all: `public/` is copied verbatim by Vite, so these filenames are not
 * content-hashed, and nginx pins them for a week. A regeneration with a
 * different voice must therefore land on new URLs, or a returning user hears
 * two voices — half the table in one, half in the other. Bump this and the
 * script's OUT_DIR together, never one alone.
 */
export const AUDIO_SET = 'v1';

/** "Year twenty-two." The cue on its own, for a question. */
export function cueUrl(yy: YearKey): string {
  return `/audio/${AUDIO_SET}/cue-${formatYear(yy)}.mp3`;
}

/** "Year twenty-two is five." The whole pair, for teaching. */
export function pairUrl(yy: YearKey): string {
  return `/audio/${AUDIO_SET}/pair-${formatYear(yy)}.mp3`;
}

/*
 * One element for the life of the page, reused for every clip.
 *
 * Not a pool, on purpose. Browsers gate playback on a user gesture, and Safari
 * gates it per element: an element that has played once inside a gesture stays
 * unlocked, a fresh one does not. Every clip therefore goes through the same
 * element, which the first tap of a block unlocks for the whole session.
 */
let element: HTMLAudioElement | null = null;

function audio(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (element === null) {
    element = new Audio();
    element.preload = 'auto';
  }
  return element;
}

/**
 * Start a clip. Never throws, never returns a promise, never delays anything.
 *
 * A clip that 404s, a codec the browser will not take, an autoplay policy that
 * refuses the first play — all of them mean silence and nothing else. Audio is
 * a second route to the same pairing; it is not allowed to become a thing that
 * has to work for the app to work.
 */
export function playClip(url: string): void {
  try {
    const player = audio();
    if (!player) return;
    player.src = url;
    player.currentTime = 0;
    const started = player.play() as Promise<void> | undefined;
    if (started && typeof started.catch === 'function') started.catch(() => {});
  } catch {
    // Silence is the fallback, and it is a complete one.
  }
}

/**
 * Warm the cache for a clip that is about to be needed.
 *
 * A separate element rather than the shared one, because the shared one is
 * mid-clip: this only has to make the bytes local, and it must never take the
 * unlocked element away from what is currently playing.
 */
export function preloadClip(url: string): void {
  try {
    if (typeof Audio === 'undefined') return;
    const warm = new Audio();
    warm.preload = 'auto';
    warm.src = url;
    warm.load();
  } catch {
    // A cold clip plays a moment later. Nothing else changes.
  }
}

/** Drops the shared element. Tests only; there is no reason to call it in the app. */
export function resetSpeech(): void {
  element = null;
}
