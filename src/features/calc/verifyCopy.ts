/**
 * What each verify verdict is called on screen.
 *
 * The verdict itself is the domain's — `classifyVerify` in
 * `src/domain/calcStats.ts` decides it from the two answers and the shipped
 * table, and the screen renders whatever came back from the write, so the words
 * on screen and the counter that was incremented can never disagree.
 *
 * Five outcomes, not three. Two answers against one truth gives five cases, and
 * the two the brief does not name are the two most worth naming: memory and
 * working landing on the *same wrong* code, which is the failure a safety net
 * is supposed to catch and did not, and memory being right while the working
 * slipped, which says the arithmetic needs the practice rather than the table.
 */

import type { VerifyOutcome } from '@/domain/types';

export interface VerifyCopy {
  /** What happened, in a few words. */
  title: string;
  /** What it means, plainly. One sentence, sometimes two. */
  note: string;
}

const COPY: Record<VerifyOutcome, VerifyCopy> = {
  'agreed-right': {
    title: 'Both agreed',
    note: 'Memory gave the code and working it out gave the same one. Nothing to look at here.',
  },
  'agreed-wrong': {
    title: 'Both wrong, and they agreed',
    note: 'Memory and the working landed on the same code, and it was the wrong one. Agreement is not proof: read the steps below and find where it went.',
  },
  'memory-right': {
    title: 'Memory was right',
    note: 'The code came back correctly, but the working reached a different one. A step of the arithmetic slipped.',
  },
  'calculation-right': {
    title: 'The working caught it',
    note: 'Memory gave the wrong code and working it out gave the right one. This is what the calculation is for.',
  },
  'both-wrong': {
    title: 'Both wrong',
    note: 'Memory gave one wrong code and the working gave a different wrong one. Neither is safe on this year yet.',
  },
};

export function verifyCopy(outcome: VerifyOutcome): VerifyCopy {
  return COPY[outcome];
}

/** True when the two answers matched each other, right or wrong. */
export function verifyAgreed(outcome: VerifyOutcome): boolean {
  return outcome === 'agreed-right' || outcome === 'agreed-wrong';
}
