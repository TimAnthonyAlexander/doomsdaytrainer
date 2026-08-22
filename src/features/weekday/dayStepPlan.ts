import type { Code } from '@/domain/types';
import { monthLength, type DayStepQuestion } from '@/domain/dayStep';
import { monthDoomsday } from '@/domain/weekday';
import { systemRng, type Rng } from '@/features/drills/drillPlan';

/**
 * What the day-step trainer asks, and in what order.
 *
 * Pure, but deliberately *not* deterministic, which is the one thing
 * `src/domain/` is not allowed to be. The randomness lives here for exactly
 * that reason, and every function takes an injectable `rng` so the tests can
 * pin it — the same arrangement `src/features/drills/drillPlan.ts` uses, and
 * the same `systemRng` behind it.
 *
 * Two rules shape a prompt:
 *
 * The anchor is always the real doomsday of the month named, never an invented
 * day, because the step being drilled has to be the step the method asks for.
 * January and February get their leap-year case drawn too, since those are the
 * only two doomsdays that move; for every other month the flag changes nothing
 * and is left off.
 *
 * The weekday of that doomsday is drawn rather than taken from a real year. A
 * year would let the answer be recalled instead of counted, and counting is the
 * whole skill being timed.
 */

/** Uniform integer in [0, n). Clamped: an rng returning exactly 1 would run off the end. */
function pick(n: number, rng: Rng): number {
  return Math.min(n - 1, Math.max(0, Math.floor(rng() * n)));
}

/** Identity of a prompt within one session. Also the pad's latency-clock key. */
export function questionKey(question: DayStepQuestion): string {
  const leap = question.leapYear ? 'L' : '';
  return `${question.month}${leap}-${question.anchorWeekday}-${question.targetDay}`;
}

/**
 * One prompt, drawn uniformly.
 *
 * The target is drawn out of the month's days with the doomsday removed rather
 * than drawn and rejected, so every legal day is equally likely and the draw
 * always terminates. Nothing walks the month in order at any point: an ordered
 * set of prompts teaches the run rather than the step, which is the failure
 * invariant 10 exists to prevent.
 */
export function drawDayStepQuestion(rng: Rng = systemRng): DayStepQuestion {
  const month = pick(12, rng) + 1;
  // Only January and February have a doomsday that moves, so only they need the
  // leap case drawn. For the other ten it would be a coin flip nothing reads.
  const leapYear = month <= 2 ? rng() < 0.5 : false;
  const anchorDay = monthDoomsday(month, leapYear);
  const anchorWeekday = pick(7, rng) as Code;

  const length = monthLength(month, leapYear);
  // Draw over the length minus the doomsday, then step past the doomsday. The
  // target can therefore never be the anchor, and never leave the month.
  const drawn = pick(length - 1, rng) + 1;
  const targetDay = drawn >= anchorDay ? drawn + 1 : drawn;

  return { month, leapYear, anchorDay, anchorWeekday, targetDay };
}

/** How many redraws before a repeat is accepted rather than hunted for. */
const MAX_DRAWS = 8;

/**
 * The next prompt, never the one just answered.
 *
 * Asking the same month and day twice in a row would be testing the memory of
 * the answer just given rather than the step. Anything further back is fair:
 * there are around two and a half thousand prompts, and chasing a longer
 * history would cost a set for a collision that barely happens.
 */
export function nextDayStepQuestion(
  previous: DayStepQuestion | null,
  rng: Rng = systemRng,
): DayStepQuestion {
  let drawn = drawDayStepQuestion(rng);
  for (let draw = 1; draw < MAX_DRAWS && repeats(previous, drawn); draw += 1) {
    drawn = drawDayStepQuestion(rng);
  }
  return drawn;
}

function repeats(previous: DayStepQuestion | null, drawn: DayStepQuestion): boolean {
  if (previous === null) return false;
  return previous.month === drawn.month && previous.targetDay === drawn.targetDay;
}
