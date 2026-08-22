/**
 * Local-time date maths and small formatters.
 *
 * Everything here is pure and synchronous. Day boundaries are LOCAL, because
 * the user's streak and "due today" are about their day, not UTC's.
 */

const MS_PER_DAY = 86_400_000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "YYYY-MM-DD" for the local calendar day containing `ts`. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local midnight at the start of the day containing `ts`. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Calendar-aware day shift: keeps the local wall-clock time, so adding a day
 * across a DST change still lands at the same hour of the next day.
 */
export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/**
 * Whole local calendar days from `a` to `b`. Negative when `b` is earlier.
 * DST-safe: a 23h or 25h day still counts as one.
 */
export function daysBetween(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / MS_PER_DAY);
}

/** Median of the values. 0 for an empty list. Does not mutate the input. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Latency in seconds, with precision that shrinks as the number grows:
 * "0.84s", "1.2s", "12s".
 */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0.00s';
  const s = ms / 1000;
  let value: number;
  if (s < 1) {
    value = Number(s.toFixed(2));
    if (value >= 1) return `${value.toFixed(1)}s`;
    return `${value.toFixed(2)}s`;
  }
  if (s < 10) {
    value = Number(s.toFixed(1));
    if (value >= 10) return `${value.toFixed(0)}s`;
    return `${value.toFixed(1)}s`;
  }
  return `${Math.round(s)}s`;
}

/** Interval in days as a short human string: "new", "1 day", "12 days", "3 months". */
export function formatInterval(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return 'new';
  const d = Math.round(days);
  if (d === 0) return 'new';
  if (d < 30) return d === 1 ? '1 day' : `${d} days`;
  if (d < 365) {
    const months = Math.round(d / 30);
    return months === 1 ? '1 month' : `${months} months`;
  }
  const years = Math.round(d / 365);
  return years === 1 ? '1 year' : `${years} years`;
}
