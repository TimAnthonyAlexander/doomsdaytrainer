import type { Code, YearKey } from './types';

/**
 * The 100 year codes, index === yy. Fixed shipped content: never generated at
 * runtime, never user-editable. `deriveCode` exists to explain the table and to
 * verify it in tests, not to build it.
 */
export const YEAR_CODES: readonly Code[] = [
  0, 1, 2, 3, 5, 6, 0, 1, 3, 4, // 00-09
  5, 6, 1, 2, 3, 4, 6, 0, 1, 2, // 10-19
  4, 5, 6, 0, 2, 3, 4, 5, 0, 1, // 20-29
  2, 3, 5, 6, 0, 1, 3, 4, 5, 6, // 30-39
  1, 2, 3, 4, 6, 0, 1, 2, 4, 5, // 40-49
  6, 0, 2, 3, 4, 5, 0, 1, 2, 3, // 50-59
  5, 6, 0, 1, 3, 4, 5, 6, 1, 2, // 60-69
  3, 4, 6, 0, 1, 2, 4, 5, 6, 0, // 70-79
  2, 3, 4, 5, 0, 1, 2, 3, 5, 6, // 80-89
  0, 1, 3, 4, 5, 6, 1, 2, 3, 4, // 90-99
];

function assertYear(yy: YearKey): void {
  if (!Number.isInteger(yy) || yy < 0 || yy > 99) {
    throw new RangeError(`Year key out of range: ${yy}`);
  }
}

/** Table lookup. Throws for anything that is not an integer 0..99. */
export function codeFor(yy: YearKey): Code {
  assertYear(yy);
  return YEAR_CODES[yy];
}

/** The rule the table encodes: (yy + floor(yy / 4)) mod 7. */
export function deriveCode(yy: YearKey): Code {
  assertYear(yy);
  return ((yy + Math.floor(yy / 4)) % 7) as Code;
}

/** 0..9. */
export function decadeOf(yy: YearKey): number {
  assertYear(yy);
  return Math.floor(yy / 10);
}

export function allYears(): YearKey[] {
  return Array.from({ length: 100 }, (_, i) => i);
}

/** Zero-padded two-digit form: 7 → "07". */
export function formatYear(yy: YearKey): string {
  assertYear(yy);
  return yy < 10 ? `0${yy}` : String(yy);
}

/**
 * The run of 4 years sharing a leap cycle: 72, 73, 74, 75 for yy = 73.
 * Inside a block the code steps by 1; crossing a boundary it jumps by 2.
 */
export function blockOf(yy: YearKey): { start: YearKey; end: YearKey; startCode: Code } {
  assertYear(yy);
  const start = yy - (yy % 4);
  return { start, end: start + 3, startCode: codeFor(start) };
}

/**
 * Nearest year below `yy` whose code the user already knows, for the anchor
 * hint. Null when nothing below it is known.
 */
export function anchorFor(yy: YearKey, known: (yy: YearKey) => boolean): YearKey | null {
  assertYear(yy);
  for (let candidate = yy - 1; candidate >= 0; candidate--) {
    if (known(candidate)) return candidate;
  }
  return null;
}

/*
 * The weekday names moved to src/domain/weekday.ts, which is where naming a
 * weekday belongs and where every caller already imports from. They lived here
 * while a code could be read under two conventions and the pairing mattered to
 * the table; there is one convention now, so they are just the seven names.
 */
