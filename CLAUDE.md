# Doomsday Trainer

A trainer for the Doomsday method: the 100 year codes, the month doomsdays, the
century anchors, and the arithmetic that generates all of them. Local-first,
offline, no server, no accounts, no analytics.

Production: https://doomsday.timanthonyalexander.de

This file is for whoever works on the codebase next. `SPEC.md` is the product
spec, `BRIEF.md` is the build contract every contributor works to, and
`STYLEGUIDE.md` is the visual language. Where this file and those disagree,
they win.

---

## Running it

```bash
bun install
bun run dev        # 127.0.0.1:47318, strictPort, loopback only
bun run test       # Vitest
bun run build      # tsc -b, then vite build
bun run preview    # 127.0.0.1:47319, the only way to exercise the service worker
```

The dev server usually runs detached in a screen session named `doomsday-web`
(`screen -r doomsday-web`). Check for it before starting another; the port is
strict and a second instance fails rather than drifting.

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
src/routes/      one screen component per route, thin
src/theme/       design tokens, MUI theme, light and dark
src/sw.ts        hand-written service worker, built via injectManifest
```

The rule that keeps this honest: **no scheduling, grading, or table maths lives
in a component.** If a screen needs a number derived from the method, the
derivation is a tested function in `src/domain/` and the screen calls it. The
domain layer has no `Math.random` at all, so its ordering is deterministic.

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
- `calc.ts` is the calculation trainer's maths: `leapDays`, `rawSum`,
  `reduce28`, `cyclesRemoved`, `sevenStep`, and `stepsFor` / `reducedStepsFor`,
  which return the derivation as labelled steps, each carrying the question, the
  answer, the worked line and the reason the step exists.
- `calcStats.ts` aggregates performance per step, so the app can say which step
  is slow rather than only that the user is slow.
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
7. **Every number on screen carries a label saying what it is.** Two numbers
   stacked with nothing naming them cannot teach a pairing, and hints that print
   bare arithmetic teach nothing about where the values came from. This is the
   single most common regression in this codebase. If you add a number, label it.
8. **The index convention changes weekday names only.** It never changes a year
   code. Onboarding demonstrates that rather than asserting it.
9. **No network calls.** Fonts are self-hosted, there is no analytics, no
   accounts, no server. A build with a third-party reference in `dist/` is a bug.

---

## Surfaces

**Review** is the main loop: the due queue, one year at a time, seven buttons,
hints behind a button and shown unasked after two consecutive failures.

**Learn** teaches the table. A decade is split at its leap-run boundaries into
groups, taught one group at a time before the full ten is ever asked for, because
ten unfamiliar pairs at once is past what working memory holds and a user who
cannot hold them guesses. A wrong tap restarts the current group, so finishing a
block means a clean run and "introduced" cannot mean "guessed through it". Blocks
unlock in order; a finished block can always be redone, and redoing it is not
charged against the daily new-item cap.

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

**Weekday** trains full dates, assisted (the year code is given) and unassisted.
Dates never enter spaced repetition, because they are not a fixed item set. Month
doomsdays and century anchors do, because they are 12 and 4 fixed items. A wrong
weekday answer does not punish either, since which step failed is unknowable.

**Drills** are sprint, gauntlet and decade, outside spaced repetition entirely.

**Progress** centres on the mastery grid, a 10x10 heatmap on a single-hue ramp so
mastery reads as one thing getting stronger. Cell text colour is chosen by
computing WCAG contrast against the actual ramp value, not by eye, and a test
asserts every step clears 4.5:1. The latency chart is hand-rolled SVG rather than
a chart library, because the one thing it must do is break the line on days with
no reviews. Drawing a zero there would claim the user got instantly fast.

All latency and accuracy figures on Progress are review-sourced only. Mixing
drill attempts in would make both numbers meaningless, and the labels say so.

**Settings**, **Onboarding** and **Trouble spots** round it out. Notifications
are handled honestly: a local-first app with no server cannot do Web Push, the
Notification Triggers API was removed from Chrome, and iOS gives nothing when the
app is closed. So the capability layer reports what the browser can actually do,
in a sentence meant to be rendered as-is, and the settings screen shows that
rather than a switch that quietly does nothing.

---

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
- the learn groups never spanning a leap boundary
- import rejection paths, each with the message the UI will show

Do not weaken or delete a test to make a change pass. If a test breaks because
behaviour genuinely changed, update it to assert the new behaviour and say so.

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

Note that `/fonts/` filenames are not content-hashed, since Vite copies `public/`
verbatim. They are cached long, which is correct while the fonts do not change.
If a face is ever replaced, rename the file rather than changing the cache
header.

Lighthouse on the preview build: 100 across the board on desktop, 90 on mobile
performance with the rest at 100. The mobile gap is CLS from the `font-display:
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
