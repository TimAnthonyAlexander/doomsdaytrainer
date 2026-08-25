# Doomsday Trainer

A teacher and trainer for the Doomsday method: given any date, name the weekday
it falls on, in your head. The method is walked end to end and every step of it
is drilled on its own — the century anchors, the month doomsdays, the 100 year
codes, and the count from a doomsday to the day actually asked for. It is a
memorisation tool, not a calculator: the target is a weekday in under a second,
which means each step has to be recalled rather than worked out.

Everything runs on the device. No account, no server, no analytics, no network
calls at all. Progress moves between devices through a JSON export.

## Running it

```
bun install
bun run dev        # 127.0.0.1:47318, strictPort, loopback only
bun run test       # vitest
bun run build      # vite build. The typecheck is separate, on purpose
bun run preview    # 127.0.0.1:47319, the only way to exercise the service worker
```

`bun run build` does not typecheck. That is deliberate — it lets a build be
produced while another change is mid-flight — so run `bunx tsc -b --noEmit`
yourself, and do it before anything ships.

Stack: Bun, Vite, React 19, TypeScript (strict), React Router 7, MUI 7,
lucide-react, idb, Vitest with Testing Library and fake-indexeddb. `@/` resolves
to `src/`.

## Writing

`CLAUDE.md` describes the codebase as it currently stands and is the file kept
current. `docs/` holds the rest: `SPEC.md` (product spec), `BRIEF.md` (the build
contract), `STYLEGUIDE.md` (the visual language, authoritative). Work items sit
in `docs/tasks/open/` and move to `docs/tasks/done/` when they ship.

## Layout

```
src/domain/      pure, framework-free: the code table, SM-2, scopes, weekday maths
src/storage/     IndexedDB, defaults, migrations, export/import
src/state/       the one provider every screen reads
src/components/  the answer pad, the app shell and the shared UI primitives
src/features/    one folder per surface: onboarding, concept, learn, revise,
                 review, drills, trouble, calc, yearCodes, doomsdays, weekday,
                 stats, settings, notifications, pwa
src/features/audio/  not a surface: the spoken year clips, shared by Learn and Revise
src/routes/      one file per screen, each one a thin assembly of feature parts
src/theme/       the design tokens, the motion tokens, the MUI theme, light and dark
src/test/        Vitest setup and the paint helper the latency tests need
src/sw.ts        the hand-written service worker, built via injectManifest
```

`src/domain/` is the only place scheduling, grading and the tables live, and it
holds no React and no randomness. Components must not reimplement any of it.

## Three decisions worth knowing before you change anything

**The whole store is one document under one IndexedDB key.** A fresh document is
about 34 KB, and every log inside it is capped, so it cannot grow without bound:
saturate all of them — 200 attempts on each of the 116 items, plus the full
weekday, day-step, calculation and verify logs — and it comes to about 3.6 MB,
most of that the per-item history. Splitting it into per-record stores would
buy nothing and cost transactions, indexes and merge logic. Every read and write
goes through `src/storage/db.ts`, which serialises them behind a promise chain so
two answers a millisecond apart cannot clobber each other. `patchAppData` is the
only way to write. This is deliberate; please do not normalise it.

**The grade comes from latency, not from the user.** There is no "rate your
recall" step — a seven-option forced choice makes self-grading pure interaction
cost. The tap is the grade: correct under the fast cutoff is a 5, under the
medium cutoff a 4, slower a 3, wrong a 1, and any hint on screen caps it at 3.
Because the grade depends on time, the zero point has to be the moment the user
could first *see* the prompt. `useAnswerTimer` therefore starts on the frame
after the commit, using `performance.now()`, and the pads refuse a tap that
arrives before that frame — such a tap is the tail end of the previous answer,
not a response to a prompt nobody has looked at yet.

Since prompts animate their value, paint is no longer quite that moment: a
changed number is on screen briefly before it is readable. Pads take an `armed`
prop that holds the clock until it settles, which is deliberately shorter than
the motion itself. Anything adding animation to a prompt has to arm it, or the
animation ends up inside every recorded latency and the grades move with it.

**Drills sit outside SM-2 on purpose.** Sprint, gauntlet and decade runs record
attempt history and personal bests and never touch `interval`, `easeFactor`,
`dueAt`, `repetitions` or `lapses`. A timed sprint is a different task from a
scheduled review, and letting it move intervals would wreck the schedule with
noise. The rule is enforced twice: `recordDrillAttempt` copies the scheduling
fields across untouched, and `applyReview` throws outright if it is handed a
drill-sourced attempt. Trouble spots is the one drill that *does* reschedule,
always at a grade-3 ceiling, because the block is on screen the whole time.

## Changing the schema

`SCHEMA_VERSION` lives in `src/storage/defaults.ts`; migrations are keyed by the
version they migrate *to* in `src/storage/db.ts`. Every migration is additive and
carries the whole document forward. `normaliseAppData` runs after it on every
load, so a document missing a field gets a sane one rather than an `undefined`.
