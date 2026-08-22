/**
 * The lesson content for the calculation trainer, built from the domain
 * functions rather than typed out, so a worked example can never disagree with
 * the method it is teaching.
 *
 * Two rules shape all of it.
 *
 * One step per lesson, and a step that contains two ideas is two lessons.
 * "Divide by four and drop the remainder" is the division and then the
 * discarding, so it is `divide` and then `drop`. "Take the remainder after
 * seven" is finding the sevens and then seeing what is left, so it is `sevens`
 * and then `remainder`.
 *
 * Every number carries a label saying what it is. A row reading `73 + 18 = 91`
 * teaches nothing, because nothing on it says the 18 is the leap-day count.
 */

import type { Code, YearKey } from '@/domain/types';
import { leapDays, rawSum, reduce28, sevenStep, CYCLE, CYCLE_SUM_STEP, MAX_RAW_SUM, MAX_REDUCED_SUM } from '@/domain/calc';
import { codeFor, formatYear } from '@/domain/yearCodes';
import type { RunItem } from './runs';

/** The most leap days a two-digit year can hold, reached at 96 through 99. */
const MAX_LEAP_DAYS = leapDays(99);

export type LessonId = 'divide' | 'drop' | 'sum' | 'sevens' | 'remainder';

/** One number with the name of what it is. Never rendered without the label. */
export interface WorkedLine {
  label: string;
  value: string;
}

/** A full example with real numbers in it. Shown before anything is asked. */
export interface Worked {
  /** Names what is being worked, e.g. "Year 73". */
  lead: string;
  lines: WorkedLine[];
  /** The point of the example, in one plain sentence. */
  close: string;
}

export interface DrillItem extends RunItem {
  key: string;
  /** What the user is handed, labelled. */
  givens: WorkedLine[];
  /** The ask. Short, and never carrying a bare number of its own. */
  question: string;
  answer: number;
  /** What the answer is, so the number they type has a name too. */
  answerLabel: string;
  /**
   * The largest answer this kind of question can have — the range, never this
   * question's own answer. It caps the digits the field takes, and a cap set to
   * the answer would tell the user how long the answer is.
   */
  max: number;
  /** The whole thing worked out. Shown only after a wrong answer. */
  working: WorkedLine[];
  /**
   * True when the answer is 0-6 and the seven-button pad can take it. Leap-day
   * counts run to 24 and sums to 123, so most of these are false.
   */
  pad: boolean;
}

export interface Lesson {
  id: LessonId;
  title: string;
  /** What the step is. */
  what: string[];
  /** Why it exists. A user who knows why can rebuild the method after forgetting it. */
  why: string[];
  worked: Worked[];
  items: DrillItem[];
}

/* ------------------------------------------------------------------ */
/* Shared lines                                                        */
/* ------------------------------------------------------------------ */

/** The division, worked. Ends on the leap-day count, whether or not it was clean. */
function fourLines(year: YearKey): WorkedLine[] {
  const count = leapDays(year);
  const over = year % 4;
  const lines: WorkedLine[] = [
    { label: 'The year', value: formatYear(year) },
    { label: 'Whole fours in it', value: String(count) },
    { label: 'Because', value: `${count} × 4 = ${count * 4}` },
  ];
  if (over > 0) lines.push({ label: 'Left over, thrown away', value: String(over) });
  lines.push({ label: 'Leap days', value: String(count) });
  return lines;
}

function sumLines(year: YearKey): WorkedLine[] {
  return [
    { label: 'The year', value: formatYear(year) },
    { label: 'Leap days', value: String(leapDays(year)) },
    { label: 'Year plus leap days', value: String(rawSum(year)) },
  ];
}

/**
 * The last two lessons work on a sum rather than on a year, and a sum that
 * appeared from nowhere is an unlabelled number. So both keep the year it came
 * from on screen, which also means the remainder lesson ends on a real code the
 * user can check against the table.
 */
function sevensLines(year: YearKey): WorkedLine[] {
  const sum = rawSum(year);
  const { multiple } = sevenStep(sum);
  return [
    { label: 'The year', value: formatYear(year) },
    { label: 'Year plus leap days', value: String(sum) },
    { label: 'Biggest seven that fits', value: String(multiple) },
    { label: 'Because', value: `${multiple / 7} × 7 = ${multiple}` },
  ];
}

function remainderLines(year: YearKey): WorkedLine[] {
  const sum = rawSum(year);
  const { multiple, remainder } = sevenStep(sum);
  return [
    { label: 'The year', value: formatYear(year) },
    { label: 'Year plus leap days', value: String(sum) },
    { label: 'Sevens taken off', value: String(multiple) },
    { label: 'Left over', value: String(remainder) },
    { label: `The code for ${formatYear(year)}`, value: String(remainder) },
  ];
}

function reduceLines(yy: YearKey): WorkedLine[] {
  const reduced = reduce28(yy);
  const lines: WorkedLine[] = [{ label: 'The year', value: formatYear(yy) }];
  let running = yy;
  while (running >= CYCLE) {
    lines.push({ label: 'Take off 28', value: `${running} − 28 = ${running - CYCLE}` });
    running -= CYCLE;
  }
  lines.push({ label: 'Year to work with', value: formatYear(reduced) });
  return lines;
}

/* ------------------------------------------------------------------ */
/* The three-step method, split into five lessons                      */
/* ------------------------------------------------------------------ */

function divideItem(year: YearKey): DrillItem {
  return {
    key: `divide-${year}`,
    givens: [{ label: 'Year', value: formatYear(year) }],
    question: 'How many whole fours fit in it?',
    answer: leapDays(year),
    answerLabel: 'Leap days',
    max: MAX_LEAP_DAYS,
    working: fourLines(year),
    pad: false,
  };
}

function sumItem(year: YearKey): DrillItem {
  return {
    key: `sum-${year}`,
    givens: [
      { label: 'Year', value: formatYear(year) },
      { label: 'Leap days', value: String(leapDays(year)) },
    ],
    question: 'Add the two together.',
    answer: rawSum(year),
    answerLabel: 'Year plus leap days',
    max: MAX_RAW_SUM,
    working: sumLines(year),
    pad: false,
  };
}

function sevensItem(year: YearKey): DrillItem {
  return {
    key: `sevens-${year}`,
    givens: [
      { label: 'Year', value: formatYear(year) },
      { label: 'Year plus leap days', value: String(rawSum(year)) },
    ],
    question: 'What is the biggest seven times table number that is not past that sum?',
    answer: sevenStep(rawSum(year)).multiple,
    answerLabel: 'Biggest seven that fits',
    max: sevenStep(MAX_RAW_SUM).multiple,
    working: sevensLines(year),
    pad: false,
  };
}

function remainderItem(year: YearKey): DrillItem {
  const { multiple, remainder } = sevenStep(rawSum(year));
  return {
    key: `remainder-${year}`,
    givens: [
      { label: 'Year', value: formatYear(year) },
      { label: 'Year plus leap days', value: String(rawSum(year)) },
      { label: 'Sevens that fit', value: String(multiple) },
    ],
    question: 'What is left over? That is the code.',
    answer: remainder,
    answerLabel: 'The code',
    max: 6,
    working: remainderLines(year),
    pad: true,
  };
}

/** Years that divide by four exactly, so nothing is left over to think about. */
const DIVIDE_YEARS: readonly YearKey[] = [24, 40, 60, 12];
/** Years that do not, so something has to be thrown away. */
const DROP_YEARS: readonly YearKey[] = [27, 38, 99, 45];
const SUM_YEARS: readonly YearKey[] = [73, 45, 99, 12];
/** Years whose sums spread across the seven times table, including an exact one. */
const SEVENS_YEARS: readonly YearKey[] = [19, 45, 80, 36];
/** Years whose codes cover a leftover of nothing as well as ordinary ones. */
const REMAINDER_YEARS: readonly YearKey[] = [24, 66, 15, 73];

export function methodLessons(): Lesson[] {
  return [
    {
      id: 'divide',
      title: 'How many fours fit',
      what: [
        'Take the two-digit year. Count how many whole fours fit inside that number.',
        'That count is the first thing the method needs.',
      ],
      why: [
        'A leap day is added every fourth year. Each leap day pushes the weekday on by one extra day.',
        'So counting the fours is counting the extra days that have piled up since the year 00.',
      ],
      worked: [
        {
          lead: 'Year 24',
          lines: fourLines(24),
          close: 'Twenty-four years hold six leap days, because six fours make 24.',
        },
        {
          lead: 'Year 40',
          lines: fourLines(40),
          close: 'Ten fours make 40, so 40 holds ten leap days.',
        },
      ],
      items: DIVIDE_YEARS.map(divideItem),
    },
    {
      id: 'drop',
      title: 'Throw the leftover away',
      what: [
        'Most years do not divide by four exactly. One, two or three years are left over.',
        'Throw the leftover away. Keep only the count of whole fours.',
      ],
      why: [
        'A leftover year has not reached the next leap day yet.',
        'A year that sits one past a leap year has had no new extra day, so it adds nothing to the count. 73 has the same 18 leap days as 72.',
      ],
      worked: [
        {
          lead: 'Year 73',
          lines: fourLines(73),
          close: 'Eighteen fours make 72, and the 1 left over is thrown away. So 18.',
        },
        {
          lead: 'Year 51',
          lines: fourLines(51),
          close: 'Twelve fours make 48, and the 3 left over goes. So 12.',
        },
      ],
      items: DROP_YEARS.map(divideItem),
    },
    {
      id: 'sum',
      title: 'Add the leap days to the year',
      what: ['Add the leap-day count to the year number. One number, made of two.'],
      why: [
        'Each year moves the weekday on by one day. Each leap day moves it on by one more.',
        'Added together they say how far the doomsday has walked since the year 00.',
      ],
      worked: [
        {
          lead: 'Year 73, which has 18 leap days',
          lines: sumLines(73),
          close: 'So 73 gives 91.',
        },
      ],
      items: SUM_YEARS.map(sumItem),
    },
    {
      id: 'sevens',
      title: 'Take the sevens off',
      what: [
        'Now look at the seven times table: 7, 14, 21, 28, 35 and so on.',
        'Find the biggest one of those that is not past your sum.',
      ],
      why: [
        'A week is seven days long. Move on by seven days and you land on the same weekday you started on.',
        'So every whole seven in the sum changes nothing, and can be taken off.',
      ],
      worked: [
        {
          lead: 'Year 73, whose sum is 91',
          lines: sevensLines(73),
          close: '91 is thirteen sevens exactly, so all 91 comes off.',
        },
        {
          lead: 'Year 66, whose sum is 82',
          lines: sevensLines(66),
          close: 'Eleven sevens make 77, and twelve would make 84, which is past 82. So 77.',
        },
      ],
      items: SEVENS_YEARS.map(sevensItem),
    },
    {
      id: 'remainder',
      title: 'What is left is the code',
      what: [
        'Take the sevens off your sum. Whatever is left is the code for that year.',
        'It is always a number from 0 to 6.',
      ],
      why: [
        'Nothing bigger than 6 can be left. If 7 or more were still there, one more seven would fit and would come off too.',
        'That is why every year code is a number the seven-button pad can hold.',
      ],
      worked: [
        {
          lead: 'Year 73, whose sum is 91',
          lines: remainderLines(73),
          close: 'Nothing is left, so the code for 73 is 0.',
        },
        {
          lead: 'Year 66, whose sum is 82',
          lines: remainderLines(66),
          close: 'Five is left, so the code for 66 is 5.',
        },
      ],
      items: REMAINDER_YEARS.map(remainderItem),
    },
  ];
}

/* ------------------------------------------------------------------ */
/* The 28-year shortcut                                                */
/* ------------------------------------------------------------------ */

export interface RepeatPair {
  high: YearKey;
  low: YearKey;
  code: Code;
}

export interface ShortcutLesson {
  title: string;
  /** The repeat shown with years the user may already know. */
  pairs: RepeatPair[];
  /** Why the repeat happens. */
  reason: WorkedLine[];
  /** What it saves, in plain lines. */
  payoff: string[];
  worked: Worked[];
  items: DrillItem[];
}

/** 28 apart, so the same code. Real pairs, checked against the shipped table. */
const REPEAT_HIGH: readonly YearKey[] = [44, 99];

const SHORTCUT_YEARS: readonly YearKey[] = [73, 44, 99, 60];

function reduceItem(yy: YearKey): DrillItem {
  return {
    key: `reduce-${yy}`,
    givens: [{ label: 'Year', value: formatYear(yy) }],
    question: 'Take whole 28s off. What is left?',
    answer: reduce28(yy),
    answerLabel: 'Year to work with',
    max: CYCLE - 1,
    working: reduceLines(yy),
    pad: false,
  };
}

export function shortcutLesson(): ShortcutLesson {
  return {
    title: 'The codes repeat every 28 years',
    pairs: REPEAT_HIGH.map((high) => ({
      high,
      low: high - CYCLE,
      code: codeFor(high),
    })),
    reason: [
      { label: 'Years in the cycle', value: String(CYCLE) },
      { label: 'Leap days inside those years', value: String(leapDays(CYCLE)) },
      { label: 'So the sum goes up by', value: `${CYCLE} + ${leapDays(CYCLE)} = ${CYCLE_SUM_STEP}` },
      { label: 'And 35 is whole weeks', value: `5 × 7 = ${CYCLE_SUM_STEP}` },
      { label: 'Left over', value: '0' },
    ],
    payoff: [
      'Nothing left over means the code does not move. After 28 years it is back where it started.',
      `So there are only ${CYCLE} different codes, not 100. The years 00 to 27 make every one of them.`,
      `Take the 28s off first and your sum never passes ${MAX_REDUCED_SUM}, so the only sevens you ever need are 7, 14, 21 and 28.`,
      `Left alone, the sum climbs to ${MAX_RAW_SUM} and the sevens run past a hundred.`,
    ],
    worked: [
      {
        lead: 'Year 73',
        lines: reduceLines(73),
        close: 'Two 28s come off 73 and 17 is left. 17 and 73 share a code.',
      },
      {
        lead: 'Year 17, the same year reduced',
        lines: [...sumLines(17), ...remainderLines(17).slice(2)],
        close: 'The sum is 21 rather than 91, and three sevens clear it. Same code, smaller numbers.',
      },
    ],
    items: SHORTCUT_YEARS.map(reduceItem),
  };
}
