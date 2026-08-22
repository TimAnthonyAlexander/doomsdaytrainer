# Doomsday Trainer

A trainer for the Doomsday method: the 100 year codes, the month doomsdays, the
century anchors, and the arithmetic that generates all of them. Local-first,
offline, no server, no accounts, no analytics.

Production: https://doomsday.timanthonyalexander.de

This file is for whoever works on the codebase next. The rest of the writing
lives in `docs/`: `docs/SPEC.md` is the product spec, `docs/BRIEF.md` is the
build contract every contributor works to, and `docs/STYLEGUIDE.md` is the
visual language. `STYLEGUIDE.md` is authoritative on anything visual. `SPEC.md`
and `BRIEF.md` predate a good deal of the code and drift from it; where they
disagree with this file, this file is the one that has been kept current.

Work items live in `docs/tasks/open/` and move to `docs/tasks/done/` when they
ship.

---

## Running it

```bash
bun install
bun run dev        # 127.0.0.1:47318, strictPort, loopback only
bun run test       # Vitest
bun run build      # vite build. The typecheck is separate, on purpose
bun run preview    # 127.0.0.1:47319, the only way to exercise the service worker
```

The dev server usually runs detached in a screen session named `doomsday-web`
(`screen -r doomsday-web`). Check for it before starting another; the port is
strict and a second instance fails rather than drifting.

`bun run build` does not typecheck. Run `bunx tsc -b --noEmit` yourself — it is
a separate command so that a build can be produced while another change is
mid-flight, and it is not optional before anything ships.

`vite-plugin-pwa` has `devOptions.enabled: false`, so the service worker exists
only in a production build. Test it through `preview`, never by loosening the
dev config.

## Stack

Bun, Vite 7, React 19, TypeScript strict, React Router 7, MUI 7, lucide-react,
idb, Vitest with Testing Library and fake-indexeddb.

MUI with inline `sx` throughout. No styled-components, no CSS files beyond
`src/index.css`. Layout is `Box`/`Stack` with CSS grid in `sx`; MUI's `Grid` is
deliberately unused. Icons are lucide only, and there are no emoji anywhere in
the product.

Path alias `@/` points at `src/`.

---

## Architecture

```
src/domain/      pure, framework-free, unit tested. no React, no DOM, no Date.now in logic
src/storage/     one IndexedDB document, migrations, export/import
src/state/       one React context over the document, with actions
src/components/  AnswerPad, the app shell, shared UI primitives
src/features/    one folder per surface, each owning its own logic and tests
src/features/audio/  not a surface: the spoken clips, shared by Learn and Revise
src/routes/      one screen component per route, thin
src/test/        setup and the paint helper the latency tests need
src/theme/       design tokens, MUI theme, light and dark
src/sw.ts        hand-written service worker, built via injectManifest
```

The rule that keeps this honest: **no scheduling, grading, or table maths lives
in a component.** If a screen needs a number derived from the method, the
derivation is a tested function in `src/domain/` and the screen calls it. The
domain layer has no `Math.random` at all, so its ordering is deterministic.

### Navigation

Five destinations, and the whole table is in `src/router.tsx`:

```
/                       Weekday          the index route, and the point of the app
/concept                Concept          one date walked to its weekday, every step asked
/year-codes             the grid         Learn, Revise, Calc, Trouble when flagged
/year-codes/learn       Learn
/year-codes/revise      Revise           the due queue and the three drills
/year-codes/calc        Calc
/year-codes/trouble     Trouble spots    off the nav, and off the grid until flagged
/stats                  Progress
/settings               Settings
/welcome                Onboarding       outside the shell
```

The nesting is load-bearing rather than tidy. `isNavActive` matches a `${path}/`
prefix, so one `/year-codes` entry lights up on all four children with no extra
rule, and the due count hangs off that one entry through `DUE_COUNT_PATH` rather
than being written out in the bottom bar and the rail separately, which is how
the two drifted apart before.

The bottom bar's columns are `minmax(0, 1fr)` rather than `1fr`. Five columns
give each entry 67px on a 375px phone, and "Year codes" with a two-digit due
count beside it measures about 74px. A plain `1fr` grows the column to fit and
pushes the whole bar past the viewport, so the label truncates instead and the
numeral never shrinks. A clipped label is still readable; a clipped number is a
different number.

`screenTitle` has to work the other way round, and this is the part that will
catch the next person. Prefix matching gives the wrong answer for a title: it
would name the phone's top bar "Year codes" while the user is on Learn. So
`SCREEN_TITLES` is consulted first and a child always wins.

`routes` is exported so the table can be asserted without a browser. It had no
test at all until the nav was restructured, which is exactly how that kind of
change ships a dead link.

### The shell is a frame, not a page

`AppShell` is exactly one window tall with `overflow: hidden`, and `main` is the
only scroller in the app. The rail, the phone's title bar, the notice bar and
the bottom bar are rows of that frame, so all four are subtracted from the
scroll area by the layout and none of them can move.

That height is `var(--app-height)`, not `100dvh`, and the difference is a bug
that took an installed app to see. `dvh` is right in a browser tab, where the
toolbar comes and goes. On an iOS home screen it is short by about fifty pixels
— WebKit reports a `dvh` that still allows for a toolbar that is not there — so
the frame ended above the bottom of the screen and the nav bar floated over a
band of background, exactly as though Safari's address bar were still down
there. Nothing showed it while the bar was `position: fixed`, because fixed
pinned it to the window whatever `dvh` claimed; making the bar a row of the
frame handed it the frame's wrong height. So `--app-height` is `100dvh`
normally and `100%` under `display-mode: standalone`, where there is no browser
chrome to be dynamic about and the percentage chain is the window. `html`,
`body` and `#root` all carry a definite height for that percentage to resolve
against.

It used to be a page: `minHeight: 100dvh`, a `sticky` title bar, a `fixed`
bottom bar paid for a second time as bottom padding on the content, and
`AppChrome` rendered above the router entirely. Every one of those is fine on
its own and the combination broke the moment a notice appeared. A 52px "a
reminder was due at 19:00" line added its height to a shell that was already a
full viewport, so the document outgrew the window: a scrollbar came in on
desktop and shifted the centred column sideways, every screen gained 52px of
scroll it did not have a second earlier, and on a phone the bar sat outside the
shell's insets and rendered under the notch. In a frame the same bar takes its
height out of `main` and nothing else on screen moves.

Two things follow that are easy to undo by accident. The window cannot scroll,
so nothing restores scroll position on navigation and `AppShell` resets
`main.scrollTop` itself — without it, arriving on a short screen from a long one
starts halfway down it. And every row of the frame needs `flexShrink: 0`, or the
scroller squeezes it instead of itself.

`AppChrome` mounts inside the frame rather than in `App`, which is why
`startServiceWorker()` is called from `App` directly: registration should not
wait for onboarding to finish.

### The domain layer

- `yearCodes.ts` holds the 100 codes as an explicit literal array, shipped
  content rather than something generated at runtime. A test asserts every one
  of the 100 against `(yy + floor(yy / 4)) mod 7`, so a transcription slip
  cannot survive.
- `scheduler.ts` is an SM-2 variant. Ease floor 1.3, intervals 1 day, then 6,
  then `round(previous * ease)`. Leech at 6 lapses.
- `weekday.ts` computes a weekday from the shipped month doomsdays and century
  anchors the way a person does it, never from `Date.getDay()`. Its test walks
  every date from 1800-01-01 to 2199-12-31 against `Date.UTC`. That is 146,097
  days, which is exactly one full Gregorian cycle: 400 years is 146,097 days and
  divides by 7 with no remainder, so the range is not a large sample, it is every
  distinct case the calendar can produce.
- `dayStep.ts` is the last step of the method on its own: from a month's
  doomsday to another day in that month, `(anchorWeekday + targetDay -
  anchorDay) mod 7`, plus the step size, the direction and the labelled
  working. Its test checks every case the trainer can produce — 707 legal days
  across a common and a leap year, each asked from all seven weekdays the
  doomsday could fall on — against a day-by-day walk of the calendar, and
  against `weekdayFor` on real dates. `dayStepLifetime.ts` is its aggregate.
- `calc.ts` is the calculation trainer's maths: `leapDays`, `rawSum`,
  `reduce28`, `cyclesRemoved`, `sevenStep`, and `stepsFor` / `reducedStepsFor`,
  which return the derivation as labelled steps, each carrying the question, the
  answer, the worked line and the reason the step exists.
- `calcStats.ts` aggregates performance per step, so the app can say which step
  is slow rather than only that the user is slow.
- `rotation.ts` is the varied prompt order: `orderVaried` returns a permutation
  with no neighbours and no same-decade years adjacent, and `nextUnburied` is
  the review queue's version of it. Deterministic given a seed, with a small
  LCG inside for tie-breaking, so the no-`Math.random` rule still holds.
- `fluency.ts` decides whether an answer is recalled or worked out, entirely
  beside SM-2. Two correct, unhinted, sub-threshold answers on different days.
- `diagnostics.ts` measures which route the user is actually taking, by slope
  rather than by speed.
- `guidedDate.ts` is the whole method on one date as nine labelled steps, each
  carrying its question, its givens, its answer, its worked line and the reason
  it exists. It computes nothing itself — the arithmetic is `calc.ts`,
  `dayStep.ts` and `weekday.ts` — and every given names the step whose answer it
  is, so a test can prove the nine screens agree with each other rather than
  only agreeing with `weekdayFor`.
- `scope.ts`, `time.ts`, `weekdayLifetime.ts` round it out.

### Storage

One IndexedDB database, one object store, the whole `AppData` document under a
single key. This is deliberate and commented in `db.ts`: the document is a few
hundred kilobytes at its largest, and per-record stores would buy nothing.

Every write goes through one promise chain, so concurrent `patchAppData` callers
cannot interleave a read-modify-write. There is a test that fires 50 concurrent
patches and asserts the counter lands on exactly 50.

`loadAppData` is defensive by design. `normaliseAppData` fills missing items,
merges stored settings over the defaults so a setting added later gets its
default rather than `undefined`, and repairs corrupt nested data field by field
instead of letting a bad import write `NaN` into a screen.

Schema versions, each with a real migration and each preserving everything
before it:

```
v1  the 100 year-code items, settings, drills, session days
v2  month doomsdays, century anchors, weekday attempts and runs
v3  the weekday lifetime aggregate, built from existing attempts on upgrade
v4  calculation-trainer attempts and per-step totals
v5  per-item fluency, rebuilt from each item's stored attempts on upgrade
v6  the day-step log and its aggregate, by step size and by direction
```

Migrations that introduce an aggregate rebuild it from whatever raw history the
document already holds. A user who has been practising never gets reset to zero.

### The trim-proof aggregate pattern

A median cannot be recovered from a running sum. Raw attempt logs are bounded,
because an unbounded array in a single-document store eventually makes every
write slow. So anywhere the app reports a lifetime median, it keeps a bounded
raw log **and** a lifetime aggregate holding counts plus a latency histogram
with fixed bucket edges. Trimming the log cannot change the lifetime numbers.

The buckets are dense below 2 seconds, because that is where sub-second recall
lives and where improvement actually shows, and coarse above 10, because a
20-second answer is a distraction rather than a recall. The histogram doubles as
the data for a latency histogram in the UI.

---

## Invariants

These are load-bearing. Several have tests written specifically to catch their
violation, and several were bugs before they were rules.

1. **Answer input is seven buttons, 0 to 6, in fixed 3/3/1 positions.** Never a
   text field, never reordered. Position memory is part of the speed being
   trained.
2. **There is no self-grading step.** The tap is the grade. Grade is derived
   from correctness and latency only: correct under the fast threshold is 5,
   under the medium threshold is 4, slower is 3, wrong is 1. A hint caps it at 3
   whether or not the user asked for it.
3. **Latency is measured from paint to tap**, via `performance.now()` in
   `useAnswerTimer`, started in a `useLayoutEffect` then a `requestAnimationFrame`
   so the clock begins after the browser has actually painted the prompt. The pad
   refuses a tap that arrives before the first paint. Without that, a double tap
   landing between auto-advance and the new prompt recorded 0 ms, which
   `gradeFor` reads as a perfect grade 5.
4. **Drills never touch scheduling.** Sprint, gauntlet and decade record
   attempts through `recordDrillAttempt`, which appends history and leaves
   `interval`, `easeFactor`, `dueAt`, `repetitions` and `lapses` untouched.
   `applyReview` throws if handed a drill source. Drill attempts are also
   buffered in memory and flushed only when a run completes, so an aborted run
   writes nothing and IndexedDB writes stay out of the latency being measured.
5. **Trouble spots do schedule**, always with `hintUsed: true` and therefore
   capped at grade 3. An item you can only get with the block in front of you has
   not been recovered.
6. **A wrong answer never advances.** Not on review, not on trouble, not on
   learn. The way forward is tapping the code the year actually has, so the last
   thing the hand does before the next prompt is the correct pairing.
   Learn used to break this by restarting the block instead — see invariant 10.
7. **Every number on screen carries a label saying what it is.** Two numbers
   stacked with nothing naming them cannot teach a pairing, and hints that print
   bare arithmetic teach nothing about where the values came from. This is the
   single most common regression in this codebase. If you add a number, label it.
8. **The index convention changes weekday names only.** It never changes a year
   code. Onboarding demonstrates that rather than asserting it.
9. **No network calls.** Fonts are self-hosted, there is no analytics, no
   accounts, no server. A build with a third-party reference in `dist/` is a bug.
10. **Nothing may ask the 100 codes in ascending order twice.** Ordered
    presentation is allowed exactly once per year, while it is being acquired;
    everything after that is varied. This covers Learn's recall passes, the due
    queue's tie-break, and any surface added later. The reason is the whole
    point of `rotation.ts`: ascending practice teaches the run as one sequence,
    and a sequence can only be entered at its start.
11. **A hard answer window never scores a tap.** It may reveal a hint and it may
    count a miss on a surface that writes no scheduling. It may not turn "no
    answer" into an answer, because a forced guess on seven buttons is wrong
    85.7% of the time and the wrong answer is what gets reinforced.
12. **Mastery requires speed, not just survival.** `masteryBucket` reads
    fluency for the middle of the ramp and the interval only above it. An item
    the user works out every time cannot report as mastered, however long its
    interval grows.
13. **The due queue has to be finishable.** A correct answer always moves the
    item at least one day out, so it cannot come back in the same session, and
    `introduce` is idempotent so redoing a learn block cannot reset a schedule.
    Those are two halves of one rule: `applyReview`'s multiplying branch reads
    the *stored* interval, so a stored 0 beside repetitions past two multiplies
    out to 0, which is `dueAt: now`, which is a queue that hands the year
    straight back forever. Learn writes all ten years of a block when it
    finishes rather than only the new ones, and the old `introduce` wiped the
    interval without resetting the repetitions, so redoing a decade wrote
    exactly that pair. Reported as "47 / 49, and it keeps alternating 00 and
    01"; the redo had also silently thrown away the whole decade's intervals.

---

## Surfaces

**Weekday** is the index route and the primary destination. Give it a full date,
pick the weekday, seven buttons. Unassisted is the default. Assisted hands over
the year code, which is the part ten decade blocks exist to teach, so a primary
screen that opened in assisted mode would skip the thing it is for.

Both the help toggle and the date range are remembered in `localStorage`, beside
the theme preference. A picker that resets on every visit is a picker the user
sets on every visit. They are device state rather than user data, so neither is
in `AppData` and neither needed a schema bump, and an unrecognised stored value
falls back to the default rather than reaching the screen. That last part is not
defensive habit: `rangeById` resolves an unknown id to the full range, so a
corrupt value would quietly widen the pool instead of failing.

Dates never enter spaced repetition, because they are not a fixed item set. Month
doomsdays and century anchors do, because they are 12 and 4 fixed items. A wrong
weekday answer does not punish either, since which step failed is unknowable.

**Day step** is the last step of that method timed on its own, and it sits on
the Weekday screen beside the dates and the tables. "In March, the 14th is a
Tuesday. What is the 5th?" — one addition, seven buttons. It exists because a
whole date cannot say where the time went: an answer that took six seconds spent
them on the century anchor, the year code, the month doomsday or this final
count, and the full-date trainer cannot tell those apart. David Turner's
doomsday writeup memorises day-of-month mod 7 for 1 to 31 outright, precisely
because this step is done while the rest of the date is still being read out.

The anchor is always the real doomsday of the month named, so the step drilled
is the step the method needs, and January and February get their leap case drawn
too since those are the only two doomsdays that move. The weekday of that
doomsday is stated rather than taken from a real year: a real year would let the
answer be recalled instead of counted, and the count is what is being timed.

Nothing here schedules anything. A (doomsday, day) pair is not a fixed item set,
and the month doomsday is handed over rather than recalled, so the answer says
nothing about that item either. The totals are cut by step size and by
direction, because "I am slow at this" is not actionable and "the +5 steps cost
twice what the +1 steps do" is. Both cuts cover every attempt, so either one
sums to the overall figures and there is no third stored copy of them.

**Concept** is the method on one date, start to finish, with the user answering
every step. Pick a date, and nine screens hand over the two tables and ask for
each piece of arithmetic: which century anchor, take the 28s off, count the leap
days, take the sevens off, add the anchor, which month doomsday, how many days
on, the final number, and which day that is. It ends by stating what the date
actually was.

The year code is **derived, never given**. That is the whole point of the
screen. Handing it over would make the demonstration a magic trick performed at
the user rather than by them, and the four steps that produce it are the ones
worth watching a person do.

Steps a date makes trivial become a line to read rather than a question with a
forced answer: a year under 28 has no 28s to take off, and a date that is itself
the month's doomsday is zero days on. The count stays nine either way, so the
walk never quietly shortens.

Nothing on it is timed and nothing is written. A test walks the whole sequence
and asserts the stored document is unchanged, because a demonstration that
recorded attempts would put untimed taps inside the numbers Progress reports.

In front of the walk, on every mount, is `MethodIntro`: the whole method read
rather than done, worked on one fixed date, every number on it derived through
`introContent.ts` rather than written into the copy. It is one screen with the
way on at the bottom, so somebody who already knows this scrolls past it in a
second, and it is not remembered as seen — a flag in storage would buy a second
and cost a setting.

That explainer, and only that explainer, is also the last step of onboarding.
The guided walk used to be bolted behind it there and answering its twelve
questions was the only way out of the flow, which made the last step of
onboarding the longest thing in it. Somebody who has just been told what a
doomsday is should reach the app after reading; the walk is a screen they can go
and do. `MethodIntro`'s `onStart` is optional for exactly that reason — without
it the component draws no button of its own, and onboarding's own footer is the
single way forward.

This screen is also where invariant 8 is easiest to see. Every number in the
first eight steps is Sunday-indexed whatever the user picked; the convention
only decides which weekday sits in position 0 of the last pad.

### Year codes

The 100 codes are one step of the method, not the subject of the app, so
everything that teaches or keeps them sits behind a single destination presented
as a grid: Learn, Revise and Calc, with Trouble spots joining them when
something is flagged. Each tile carries one line of real status, so the grid
answers "what is there to do" without being entered.

They used to be three top-level entries called Review, Learn and Drills. All
three names meant roughly "practise", they sat above the thing being practised
for, and the first one the app opened on was Review.

**Learn** teaches the table one decade at a time, and it teaches pairs rather
than the run. A decade is introduced in three batches split by position mod
three — 40, 43, 46, 49 · 41, 44, 47 · 42, 45, 48 — so no batch holds two
adjacent years and no batch is a run of anything. Blocks unlock in order; a
finished block can always be redone, and redoing it is not charged against the
daily new-item cap.

Inside a batch, one pair is on screen at a time: the year and its code, both
labelled, the user taps the code they can see, and the same pair comes straight
back with the code hidden. That order is not an accident. Seabrooke et al.
(2019, JML 104) found that guessing before feedback on pairs with no
pre-existing association improves memory for the items and *impairs* cued recall
of the link, and the link is the only thing this app builds. So a pair is never
asked for before its first reveal, and the show trial still takes a tap, because
a tap on a code that is on screen cannot be wrong and makes the pairing a motor
act.

Then the batch is recalled in varied order, twice clean each, then all ten mixed
with years from other decades. The mix-in count is fixed, so the tenth block is
no longer than the first; what widens with progress is the review queue.

The switch from ordered to varied is per item, at first correct — Battig, Brown
& Nelson (1963) compared constant and varied presentation across five
experiments and found that moving to varied order **after the first correct
response to each pair** kept the entire benefit of constant order. Because the
study trial is what spends each pair's first correct, every learn pass now opens
varied; `recall.ts` keeps its ordered phase as the module's general contract.

Full interleaving from the start would be worse, not better. Interleaving's wins
are in category induction, and for arbitrary paired associates it is
null-to-negative — Hwang (2025) ran blocked, interleaved and blocked-then-
interleaved over word pairs and pure interleaving came last of the three. That
licenses *blocked* practice, not *ordered* presentation: decades stay as the
unit, ascending order does not.

The +1/+2 structure is taught once, ever, on its own screen, after a decade has
been learned, as two isolated pairs. Placed first it becomes the route the ten
are produced by, and a route into a decade can only be entered at its start.
Placed last it can only be an explanation of a table the user already has.
`flow.ts` holds the block's phase order as a pure function for exactly that
reason: where the structure lesson sits is a claim about how the table gets
learned, and a claim like that should be assertable without walking sixty taps.

After all of it comes a pass that does not end. The block's criterion — every
year clean twice in varied order — is the right place to stop *teaching* and
the wrong place to stop *practising*, and the first user to finish a decade
said so straight away: the codes were nearly there and the screen took them
away. So the block finishes, writes its ten and charges the daily cap, and then
keeps asking. It introduces nothing, it draws from every introduced year in
scope so it widens as blocks are finished, and the user leaves it rather than
completing it. Leaving shows the block's summary.

Every phase of a block is rendered with a key from `phaseKey`, and that is not
housekeeping. Two phases in a row can be the same component — the last batch's
recall and the mixed pass over the ten are both `RecallPass` — and React
reconciles the same type at the same position by keeping its state. Unkeyed, the
mixed pass opened on the finished batch's empty queue, behind the green flash
and the disabled pad the batch had ended on, so the block stopped dead on "6 of
6" with no way forward and never reached the line that writes its ten. The
decade then read as unlearned on the picker, because it was. One missing key
cost both halves of the block.

**Calculate** is the other path to the same 100 codes, and does not replace
memorisation. It teaches `(yy + floor(yy / 4)) mod 7` one step at a time with the
reason attached to each: divide by four because a leap day lands every fourth
year, take the remainder after seven because the week has seven days. It then
teaches the 28-year cycle as its own lesson, once there is something to shorten.

That cycle is exact. `code(yy + 28) === code(yy)` for every year, because 28
years hold exactly 7 leap days, so the sum advances by 35, and 35 is 0 mod 7. So
there are only 28 distinct year codes and 00 to 27 generates all 100. It also
makes the last step much easier: reduce first and the sum can never pass 33, so
the only multiples of 7 ever needed are 7, 14, 21 and 28, where the unreduced sum
reaches 123.

The 28 base codes need no storage of their own. They are year codes 00 to 27,
which already exist as items, and the existing custom scope restricts the review
queue to them.

The method is taught in five lessons rather than three, because two of the three
steps hide a second idea inside them. "Divide by four and drop the remainder" is
two things to a beginner: the division, and the discarding. They get a lesson
each, and the discarding is drilled only on years that actually leave something.
The same split separates finding the multiple of seven from reading off what is
left.

Practice runs the whole derivation with each step answered and timed separately,
which is what makes the per-step stats worth having: "six seconds for a code"
is not actionable, "four of those six went on taking the sevens off" is.

Verify mode asks for the code from memory, then makes the user derive it, then
reports whether the two agreed. Two things make that comparison mean something.
It records five outcomes rather than two accuracy figures, because a pair of
percentages cannot answer "when they disagreed, which one was right" — and
`agreed-wrong`, both paths landing on the same wrong code, is the one worth
surfacing, since it means the error is in what was learned rather than a slip.
And the derivation carries the user's own answers forward via
`stepsFromAnswers`, rather than asking each step from the true intermediate
value. Without that, a miscounted leap day is silently replaced by the correct
sum at the next question, the derivation can only fail on its last step, and
"calculation was right" stops meaning anything.

**Revise** is where the codes are kept, and it is one surface with a mode
already chosen. The default mode is the due queue: one year at a time, seven
buttons, hints behind a button and shown unasked after two consecutive failures.
The other three are sprint, gauntlet and decade, timed and outside spaced
repetition entirely. A row selects, and one Start button begins the run.

That costs reviewing a tap it did not cost before, when the screen was the run
and began timing on mount. The tap is the price of a screen that can be read
before it starts measuring you, and it was chosen knowingly rather than
inherited from the merge.

Only two things here write to the schedule, and both say so on screen: the due
queue, and Trouble spots. Trouble spots is not a mode and is not in the list. It
has no best to beat, it always runs with the block on screen and therefore
always at a grade-3 ceiling, and for a user with nothing flagged it is not on
the screen at all.

**Progress** centres on the mastery grid, a 10x10 heatmap on a single-hue ramp so
mastery reads as one thing getting stronger. Cell text colour is chosen by
computing WCAG contrast against the actual ramp value, not by eye, and a test
asserts every step clears 4.5:1. The latency chart is hand-rolled SVG rather than
a chart library, because the one thing it must do is break the line on days with
no reviews. Drawing a zero there would claim the user got instantly fast.

All latency and accuracy figures on Progress are review-sourced only. Mixing
drill attempts in would make both numbers meaningless, and the labels say so.

Progress also carries the route report, which answers "am I recalling this or
working it out?" — the one question a latency median cannot. Uittenhove,
Thevenot & Barrouillet (2016) found response times still tracking operand size
on problems adults *reported* as retrieved, so speed alone does not identify a
route. Shape does. The report regresses per-item median latency against the
year's position inside its decade (counting), against the size of the
derivation's sum (calculating), and compares answers that followed a neighbour
against answers that did not. Recall is flat on all three. Nothing there feeds
the scheduler.

**Settings** and **Onboarding** round it out. Notifications
are handled honestly: a local-first app with no server cannot do Web Push, the
Notification Triggers API was removed from Chrome, and iOS gives nothing when the
app is closed. So the capability layer reports what the browser can actually do,
in a sentence meant to be rendered as-is, and the settings screen shows that
rather than a switch that quietly does nothing.

---


## Audio

Spoken years are shipped content: 200 mp3 clips under `/audio/v2/`, generated by
`scripts/generate-tts.mjs` and committed like the year codes themselves. The
script is run by hand and reads `ELEVENLABS_API_KEY` from the environment; the
key is never in the repo, the bundle or a committed file. At runtime the app
fetches nothing but same-origin static files, so invariant 9 holds.

Two utterances per year, a cue and the whole pair, rather than composing from
107 clips. Composition would halve the payload and put the seam exactly between
the year and its code, which is the one place a gap teaches the wrong thing.

`eleven_v3` at `mp3_44100_128`. Not flash, and the reasoning matters because the
first cut got it wrong: flash is right for runtime TTS, where latency and cost
per call are the constraint, and pointless here, where the set is generated once.
The API reports v3's character multiplier as 1.0, the same as multilingual v2 —
flash is the cheap one at 0.5 — so v3 costs nothing extra. The whole set is under
4,000 characters. The first cut also ran at `mp3_22050_32` to satisfy a size
budget that was invented rather than required, and 32kbps at 22kHz is audible as
crunch on every clip.

Years under ten read as plain cardinals: `00` is "Year zero", `06` is "Year six".
Reading them as years — "oh oh", "oh six" — is right for a year and wrong for
what these are, which are labels on a lookup table. A comma separates the halves,
because without it "Year six is zero" elides into one noun phrase and arrives as
"yearsixiszero".

Every clip is faded over its last 35ms and padded with 150ms of silence, inside
the generator rather than as a pass over its output. The model leaves a faint
synthetic noise floor under the speech and stops it dead at the end of the file
instead of letting it decay; the noise is inaudible and the discontinuity is a
click. It was audible on 44 of the 200 clips, worst where the final 50ms was
still at 48% of the clip's peak. Measured across the set: 48% before, 0% after.
No audio is cut — the words were always complete.

The clips are runtime-cached in `sw.ts` and never precached — a hundred years
met ten at a time over weeks should not cost six megabytes at first install.
Filenames carry the set version because `public/` is copied verbatim and nginx
pins it a year; a regeneration in a different voice, model or wording bumps
`AUDIO_SET` in both the script and `speech.ts`, or a returning user is stuck on
the old set for a year.

Learn speaks by default because nothing there is timed. Review is off by
default, and it is the one setting in the app that changes what a number means:
latency is paint-to-tap, a clip runs about a second, and that second lands
inside the grade, the fluency decision and the mastery bucket. The clock was
**not** moved to the end of the clip — an answer given while the year was still
being spoken would measure negative, clamp to zero and take a free grade 5,
which is the exact bug invariant 3 exists to prevent. Instead the attempt
carries `audioPlayed` (optional, so absent reads as false and no migration was
needed) and Stats says how many of the recent review answers have it. The review
screen's speaker button and the Settings row write the same field.

## Design

`STYLEGUIDE.md` is authoritative and its values are fixed.

The palette is constrained by the product: latency grading already spends green,
amber, orange and red, so the brand has to sit outside that range or feedback
stops reading pre-attentively. It is purple. Grading colours appear only in the
feedback flash and the latency histogram, never tinting a card, a header or the
mastery grid, and the brand never appears on a control tapped during a rep.

Dark and light, dark by default, because the app is used late. The mode lives in
`localStorage` rather than `AppData`, since it is device state rather than user
data, and an inline script in `index.html` stamps the theme before first paint so
a dark load never flashes white.

One type family: IBM Plex Sans for text, IBM Plex Mono for every numeral, weights
400 and 500 only, self-hosted latin-subset woff2 at about 56 KB total. The choice
is functional rather than aesthetic: the answer set 0 to 6 contains the two pairs
geometric sans faces collapse, 0 against 6 and 3 against 5, and Plex Mono's 6 has
a straight stem. Mono is also tabular by default, which the grid and the prompt
need so nothing shifts width between renders.

Copy rules are in BRIEF.md and they are enforced in review. No exclamation marks,
no congratulation, no gamified language, no streak theatre. When a session ends
the app states what happened: "24 reviews, 3 wrong, median 1.4s".

---

## Testing

```bash
bun run test
bunx vitest run src/domain/          # the layer worth running alone
bunx tsc -b --noEmit
```

`strict` is on, with `noUnusedLocals` and `noUnusedParameters`, so dead
variables fail the build rather than accumulating.

Tests to know about, because they encode decisions rather than behaviour:

- every one of the 100 year codes against the formula
- every date in a full 400-year Gregorian cycle against the real calendar
- 50 concurrent storage patches losing no writes
- a full drill run asserting every scheduling field is untouched, one by one
- the grade cap at 3 when a hint is on screen, asserted through the resulting
  ease factor rather than through a flag
- an aborted drill writing nothing at all
- every legal day of every month, from all seven weekdays its doomsday could
  fall on, against a day-by-day calendar walk and against `weekdayFor`
- the endless pass never handing back a neighbour across a cycle seam, which is
  the join `orderVaried` does not constrain
- the varied rotation never stepping to a neighbour or repeating a decade, over
  every seed, and not being one fixed order wearing different entry points
- the review queue refusing to hand back a decade in ascending order
- a long interval alone never reaching the top of the mastery ramp
- a fluency run refusing to advance twice in one sitting
- the answer window expiring without writing an attempt
- no two adjacent years ever sharing a teaching batch, over all ten decades
- the structure lesson appearing once, and after every phase that teaches
  anything, asserted against `flow.ts` rather than by walking sixty taps
- no two phases of a block sharing a React key, and — the one place the sixty
  taps are worth paying for — a whole block walked to the endless pass, which
  is where the joins between phases are the only thing that can break
- a missing or failed audio clip never blocking an answer or changing what is
  recorded, asserted both as a unit and through a rendered pass
- import rejection paths, each with the message the UI will show
- every nav path and every linked path resolving to a real route, and the paths
  the restructure retired falling through to the catch-all
- `screenTitle('/year-codes/learn')` being `Learn` rather than `Year codes`,
  which is the one way the prefix matching goes wrong and the one way it goes
  wrong silently
- a stored weekday preference that is not a legal value falling back to the
  default instead of reaching the screen
- the shell holding exactly one scroller, with the notice bar and the bottom bar
  outside it. jsdom has no layout, so the frame's height cannot be asserted —
  but the structure that produces it can, and the structure is what regressed
- the guided walk agreeing with itself across all nine steps, over 750-odd
  dates, rather than only agreeing with `weekdayFor` at the end
- no step before the fourth naming a number the year code, which is the one way
  that screen could quietly stop teaching anything
- the whole walk leaving the stored document byte for byte unchanged

Do not weaken or delete a test to make a change pass. If a test breaks because
behaviour genuinely changed, update it to assert the new behaviour and say so.

`localStorage` is cleared in the global `afterEach` in `src/test/setup.ts`. It
was not, so a file's first case started on whatever the file above it had left
behind, and the weekday preference tests would have passed or failed by file
order. If you add device state, it belongs behind that reset.

One test draws real randomness: `datePool.test.ts` checks that a 31-day month is
sampled more often than February. Its bound is deliberately loose — the true
ratio is 1.097 and the bound is 1.02 — because at 60,000 draws the standard
error is about 0.022, and a tighter bound failed roughly one run in fifty. Widen
bounds like that rather than adding retries.

**Do not verify by driving a browser unless asked.** The typechecker and the
suite are the verification, and a browser walkthrough is slow and usually proves
less.

---

## Deployment

Static build, served by nginx from `/var/www/doomsday/dist`. The config lives in
`config/nginx/doomsday.conf`.

Content-hashed files under `/assets/` are pinned for a year as immutable. The
service worker is served `no-store`, because a client that caches `sw.js` can pin
itself to an old precache manifest and stop taking updates. `index.html` is
`no-cache`, since it carries the asset hashes. Missing files under `/assets/`
return 404 rather than falling back to `index.html`.

**A new build applies itself, and the app never says so.** `sw.ts` calls
`skipWaiting()` during install and claims its clients, so the worker that
installed is the worker the next load gets. There is no update prompt, and
there is nothing to accept: the bar that used to ask could not be cleared by a
refresh, because the old worker was still controlling the page and still
serving the old precache, so the same "a new version is ready" line came back
after every reload the user did themselves. Its Reload button was the only
thing that applied an update, which made a reload look like a decision.

Nothing reloads a live page either. `registerType` stays `'prompt'` — not
`'autoUpdate'`, whose generated registration reloads the window the moment a
new worker activates — and `onNeedReload` is passed as an empty function, which
is what stops a second tab reloading itself when this one installs an update.
Old code runs until the user navigates or refreshes. That is safe here only
because the bundle is not code-split: there is no chunk a live page could ask
for after `cleanupOutdatedCaches` removed the cache holding it. Introduce
`React.lazy` and this needs thinking about again.

Note that `/fonts/` and `/audio/` filenames are not content-hashed, since Vite
copies `public/` verbatim. Both are cached a year as immutable, which is correct
while the files do not change. If a font face is ever replaced, rename the file
rather than changing the cache header. The clips carry a set version in their
path instead — `/audio/v2/` — so replacing them means bumping `AUDIO_SET` in
both `scripts/generate-tts.mjs` and `src/features/audio/speech.ts`. Reusing the
path would strand anyone who had already cached the old set, for a year.

The clips are runtime-cached by `sw.ts` and deliberately kept out of the
precache manifest, which stays around 870 KiB and is all code. Six megabytes of
audio at first install, most of it for years the user has not reached, would be
paid by everyone and used by few.

Lighthouse on the preview build, measured before the audio and the day-step
trainer landed and not re-run since: 100 across the board on desktop, 90 on
mobile performance with the rest at 100. Treat those as the last known figures
rather than as current. The mobile gap is CLS from the `font-display:
swap` reflow, kept deliberately in preference to showing a fallback face for an
entire first visit.

---

## A trap that has already been sprung once

When the palette moved to tokens, the old names were kept and re-pointed so
nothing broke. `green` began returning `brand-deep` and `terracotta` began
returning `grade-wrong`. Nothing looked wrong, because the replacement hues sit
near the originals, so neither the build nor a visual check caught it. What had
actually happened is that two roles were merged into one symbol, and every
component still reading the old name silently changed meaning.

The damage was on the keypad. `AnswerPad`'s correct, pressed and hover states
were painting the **brand** colour onto the control the user taps during a rep,
which the styleguide forbids and which meant a correct answer flashed purple
instead of green. The grading hues were not reading against each other at all.
The leech marker on the mastery grid had the mirror problem: a grading colour on
the one surface the styleguide names as off-limits.

All of it is fixed, and the deprecated aliases are gone rather than renamed. That
matters more than the fix: renaming `terracotta` to `gradeWrong` would have
compiled and would have frozen every non-semantic call site as a grading colour
forever. Each site needed a decision, and they came out three different ways.
Correct answers and wrong answers keep the grading colours because they *are* the
feedback flash. Focus rings, emphasis and the step indicator take the brand,
because that is what the brand is for. The leech marker takes the cell's own ink,
and attempt history in the item sheet went neutral, because "this keeps lapsing"
and "you just got that wrong" are different statements and only one of them is
feedback.

The lesson for the next person: when a colour changes role, do not rename the
export. Delete it and let the compiler list every place that has to be thought
about.

---

## The second trap: the app taught the order, not the pairs

The symptom, reported by the only user: "ask me 66 and I count on my fingers and
sing the decade to myself." The 100 codes were being learned as one string, so
they could only be entered at the start of a decade and walked to — the same way
a literate adult who has sung the alphabet daily for twenty years still cannot
answer "what is the 18th letter" without reciting from a chunk boundary. Klahr,
Chase & Lovelace (1983) found 90-95% of adults report exactly that covert
recitation, from entry points that match the Alphabet Song's phrasing, at
170-310ms per step.

Nothing looked broken. Every test passed, accuracy was fine, the mastery grid
was filling in. Four separate mechanisms were causing it and each one read as
reasonable on its own:

1. `RecallPass` asked ascending and sent a wrong tap back to the **first year of
   the block**. That is Ebbinghaus's serial anticipation method: the run gets
   rehearsed from position zero over and over and the interior years are never
   retrieved cold. It was written to mean "finishing proves a clean run".
2. `introduceItems` stamped all ten years of a block with the same `dueAt`, and
   `dueItems` broke ties on ascending `yy`. So the decade came back as 00, 01,
   02 on its first review, and since the ten then moved through identical
   intervals, it kept arriving in that order for months.
3. The **default** hint was `structural`, which says "count up from the start of
   the block". The app was offering the counting strategy as the strategy.
   `anchor` is the same shape. Only `arithmetic` can be entered at any year.
4. `gradeFor` gives a six-second correct answer a grade 3, a grade 3 advances
   the interval, and `masteryBucket` read the interval. So "I counted and got
   there" was scored as knowing it, and the item graduated to a 90-day interval
   while the user was still reciting. **This is the one that mattered most**: the
   first three built the chain, the fourth meant the app could never notice.

The fixes are invariants 10, 11 and 12, plus `rotation.ts`, `fluency.ts` and
`diagnostics.ts`. What is worth carrying forward is the shape of the mistake
rather than the mistake: every one of those four was a local decision that was
defensible where it sat, and the damage only existed in the combination. The
grid said mastery and meant survival; the queue said due and meant alphabetical;
the hint said help and meant procedure.

Two rules follow from that, and they are why `diagnostics.ts` exists at all.
**Measure the thing you claim, not a proxy for it** — a latency median cannot
distinguish recall from a fast procedure, and a slope can. And **when a metric
and a user disagree, the user is the measurement.** The grid was green for
months. One sentence from the person using it was worth more than all of it.

### The same trap's second half

That fix corrected how the app *asked* for the codes and left how it *taught*
them untouched. `RecognitionPass` (since deleted) still laid a decade out as its leap runs in a
grid, drew a `+1` between every adjacent pair and a ruled `+2` across each
boundary, and made the user tap the ten in ascending order — and `learnGroups`
split the decade into those same runs, so even the sub-groups were runs.
Shuffled questions over a run that has just been handed to the user are answered
by walking the run.

The reasoning error was conflating two axes. Battig and Hwang licence *blocked*
practice, not *ordered* presentation, and the difference only vanishes for
arbitrary pairs where ascending order affords nothing. Consecutive years differ
by one, so it affords everything. Blocked stayed: decades are still the unit.
Ordered went, including from teaching.

The lesson, again, is that a half-fix passes every test. The suite was green
across the first change, and the screen that caused the problem was never once
touched by it.