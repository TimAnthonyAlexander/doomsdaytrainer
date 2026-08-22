# Year Code Trainer — Product Spec

## Purpose

A single-purpose trainer for memorizing the 100 year codes (00-99) used in the Doomsday method. Not a weekday calculator, not a full method tutor. Only the lookup table.

## Success criterion

User can produce any of the 100 codes from memory in under 1 second, with 95%+ accuracy, and retain that after 30 days without daily practice.

---

## Data

**The 100 pairs** are fixed content, shipped with the app. Not user-editable.

```
00→0  01→1  02→2  03→3  04→5  05→6  06→0  07→1  08→3  09→4
10→5  11→6  12→1  13→2  14→3  15→4  16→6  17→0  18→1  19→2
20→4  21→5  22→6  23→0  24→2  25→3  26→4  27→5  28→0  29→1
30→2  31→3  32→5  33→6  34→0  35→1  36→3  37→4  38→5  39→6
40→1  41→2  42→3  43→4  44→6  45→0  46→1  47→2  48→4  49→5
50→6  51→0  52→2  53→3  54→4  55→5  56→0  57→1  58→2  59→3
60→5  61→6  62→0  63→1  64→3  65→4  66→5  67→6  68→1  69→2
70→3  71→4  72→6  73→0  74→1  75→2  76→4  77→5  78→6  79→0
80→2  81→3  82→4  83→5  84→0  85→1  86→2  87→3  88→5  89→6
90→0  91→1  92→3  93→4  94→5  95→6  96→1  97→2  98→3  99→4
```

**Per-item state** (persisted per user):
```
yy                 00-99
easeFactor         float, default 2.5
interval           days, default 0
dueAt              timestamp
repetitions        int
lapses             int
attemptHistory[]   { timestamp, correct, latencyMs }
```

---

## Core flows

### 1. Onboarding / first run

Screen sequence:

1. **What this is.** One paragraph. "You're memorizing 100 number pairs. Year → code. That's it."
2. **Why the codes exist.** Optional, skippable, one screen. Shows the formula `(YY + floor(YY/4)) mod 7` and one worked example so the user knows the table isn't arbitrary.
3. **Index choice.** User picks Sunday-indexed (`0=Sun`) or Monday-indexed (`0=Mon`). This does not change the year codes at all. It only changes the weekday names shown in optional context. Default: Sunday-indexed. Changeable in settings.
4. **Scope choice.** Full 100, or a subset (see Scopes below). Default: full 100.

### 2. Learn mode

New items are introduced here before they enter review.

- Takes a **decade block** (e.g. 40-49) and introduces it in **three batches** of three or four years, split by position so that no batch holds two adjacent years: 40, 43, 46, 49 · 41, 44, 47 · 42, 45, 48. A batch that is a contiguous run hands the user the +1 step and lets them produce every code after the first without retrieving a pair.
- Teaches **one pair at a time**: the year and its code alone on screen, both labelled. The user taps the code that is shown, and the same pair comes straight back with the code hidden for them to tap from memory. A pair is never asked for before its first reveal.
- Then a **cued recall pass** over that batch, varied order, each year twice correct in a row. No scoring, unlimited retries, and a wrong tap never advances.
- Then the same over all ten, mixed, with years from other decades mixed in.
- The +1 / +2 structure is shown **once, ever**, after a decade has been learned, as two isolated pairs and framed as a way to check an answer rather than a way to find one. Shown before the pairs it becomes the route the codes are produced by, and a route into a decade can only be entered at its start.
- Completing a block moves those 10 items into the review queue with `interval = 0`.

Rate limit: max 2 new blocks (20 items) per day by default. Adjustable.

### 3. Review mode (the main loop)

One item per screen.

```
┌─────────────┐
│             │
│     73      │
│             │
│  [0][1][2]  │
│  [3][4][5]  │
│     [6]     │
│             │
└─────────────┘
```

- Prompt: the two-digit year, large.
- Input: **seven buttons, 0-6.** Not a text field. No keyboard. One tap = one answer.
- Buttons in fixed positions, always. Position memory is part of the speed.
- On tap: immediate feedback. Correct → green flash, auto-advance after 250ms. Incorrect → red, show correct value, require a second tap to continue.
- **Latency is recorded from prompt render to tap.**

No "show answer / rate your recall" step. The tap *is* the grade. This is a forced-choice task with 7 options, so self-grading adds nothing and doubles the interaction cost.

### 4. Scheduling

SM-2 variant, modified for speed-sensitivity.

Grade is derived, not user-selected:

```
correct   AND latency < 2000ms   → grade 5
correct   AND latency < 5000ms   → grade 4
correct   AND latency >= 5000ms  → grade 3
incorrect                        → grade 1
```

Standard SM-2 interval progression from there. Grade 1 resets `interval` to 0 and increments `lapses`.

Rationale for latency-as-grade: a code you can produce in 4 seconds is not memorized for this use case. The whole point is sub-second recall. Slow-but-correct answers must be scheduled more aggressively than a normal vocab trainer would.

**Leech handling:** after 6 lapses, an item is flagged. Flagged items surface in a dedicated "Trouble spots" drill and are shown with a mnemonic prompt (see Hints).

### 5. Speed drill

Separate from spaced repetition. Does not affect scheduling.

- **Sprint:** 60 seconds, random items from learned pool, count correct.
- **Gauntlet:** all 100 in random order, timed, one pass. Errors counted, not corrected.
- **Decade drill:** all 10 of one decade, timed.

Records per-mode personal bests. Shows a running median latency chart over time.

---

## Scopes

User can restrict the pool. Useful because most practical dates cluster.

```
Full             00-99
Living memory    25-99  (covers 1925-2025 birthdays)
Modern           50-99
Current era      00-49
Custom range     user-defined
```

Scope affects review and drill pools. Items outside scope stay in the DB but aren't scheduled.

---

## Hints

Available on demand during review (tapping a hint counts as a grade-3 ceiling for that attempt).

Three hint types, user picks preference in settings:

1. **Structural.** Shows the block the item belongs to. For 73: "block 72-75, starts at 6." User derives 73 = 0.
2. **Arithmetic.** Shows `(73 + 18) mod 7`. The escape hatch, always derivable.
3. **Anchor.** Shows the nearest already-mastered item and the offset. For 73: "72 → 6, so 73 → 0."

Leech items get the structural hint shown automatically after the second consecutive failure.

---

## Stats

Per-user dashboard:

- **Mastery grid.** 10×10 heatmap of all 100 items, colored by current interval. The single most important screen. User sees exactly which decades are weak.
- Median latency, overall and per decade.
- Accuracy over last 100 attempts.
- Items due today / this week.
- Streak (days with at least one review session completed).
- Per-item detail on tap: attempt history, current interval, lapse count.

---

## Notifications

- One daily reminder, user-set time. Default off, prompted after day 3 of use.
- Content: number of items due. No gamified language.
- Optional: a second reminder if the daily session wasn't completed by evening.

---

## Settings

```
Index convention      Sunday-indexed / Monday-indexed
Scope                 (see Scopes)
New items per day     0-40, default 20
Latency thresholds    fast/medium cutoffs, default 2000/5000ms
Hint type             structural / arithmetic / anchor
Auto-advance delay    0-1000ms, default 250ms
Spoken years, Learn   on/off, default on. Nothing in Learn is timed.
Spoken years, Review  on/off, default off. Latency is paint-to-tap, so a
                      spoken cue is inside every latency, grade and mastery
                      bucket it produces. Also toggled from the review screen.
Daily reminder        on/off + time
Reset progress        with confirmation
Export data           JSON
```

---

## Weekday trainer

> Added after the original spec. This reverses two of the original non-goals
> ("no full date-to-weekday calculation", "no month anchors, no century codes").
> The year-code table stays the core of the app; this sits alongside it.

Give the user a full date, they pick the weekday. Seven buttons, weekday names,
fixed positions, same interaction contract as the code pad.

### Modes

1. **Assisted.** The year code for that date's year is shown above the prompt.
   The user supplies the month doomsday and the day arithmetic.
2. **Unassisted.** Nothing is shown. The whole computation.

Both modes are always available. Mode is a toggle on the trainer, not a setting.

### Supporting data

Two more fixed, shipped tables. Both are trainable in their own right, with the
same learn/review machinery as the year codes.

**Month doomsdays** (12 items) — the date in each month that falls on the year's
doomsday:

```
Jan 3 (4 in leap years)   Jul 11
Feb 28 (29 in leap years) Aug 8
Mar 14 ("pi day")         Sep 5
Apr 4                     Oct 10
May 9                     Nov 7
Jun 6                     Dec 12
```

**Century anchors** (4 items, cycling every 400 years):

```
1800s → 5 (Friday)    2000s → 2 (Tuesday)
1900s → 3 (Wednesday) 2100s → 0 (Sunday)
```

### Computation

`weekday = (centuryAnchor + yearCode + dayOfMonth - monthDoomsday) mod 7`,
with the leap-year correction applied to January and February only.

The app must derive the correct answer from the shipped tables, and a test must
check the derivation against a real calendar across the full supported range —
every date, not a sample.

### Range

Dates from 1 Jan 1800 to 31 Dec 2199. Julian/Gregorian transition is out of
scope; 1800 is the floor precisely so it never comes up.

### Prompt generation

- Uniform random date within range by default.
- Range filters: **This century** (2000–2099), **Living memory** (1925–today),
  **Full range**. Independent of the year-code Scope setting.
- Never repeat the same date twice in one session.

### Scheduling

The weekday trainer does **not** feed the year-code SM-2 queue. Dates are not a
fixed item set, so spaced repetition over them is meaningless. It records
attempts, latency and accuracy, and keeps its own personal bests.

Month doomsdays and century anchors **do** enter the SM-2 queue as items, since
they are fixed and small. A wrong weekday answer in unassisted mode does not
punish those items — attribution of the error is unknowable.

### Stats

Accuracy and median latency per mode, and a breakdown by month and by century so
the user can see which month doomsday is costing them time.

---

## Explicit non-goals

- No leaderboards, no accounts, no social.
- No ads, no IAP.
- No streaks-as-pressure mechanics beyond a plain counter.
- No user-authored content.

---

## Platform

Local-first. All state in device storage. No server, no login. Export/import JSON for device transfer.

If a second device is a requirement later, sync is the only thing that would need a backend, and it can be added without changing anything above.

---

## Phasing

**V1 (minimum useful)**
- 100 items, learn mode, review mode with SM-2 + latency grading, 7-button input, mastery grid, local persistence.

**V2**
- Speed drills, scopes, hints, stats detail, notifications.

**V3**
- Export/import, leech handling, custom latency thresholds, index convention toggle.

**V4**
- Weekday trainer, assisted and unassisted. Month doomsdays and century anchors
  as trainable items. Per-month and per-century stats.
