# Doomsday Trainer

A trainer for the 100 year codes of the Doomsday method, plus the month
doomsdays, the century anchors, and a full date-to-weekday drill built on top of
them. It is a memorisation tool, not a calculator: the target is producing any
of the hundred codes from memory in under a second.

Everything runs on the device. No account, no server, no analytics, no network
calls at all. Progress moves between devices through a JSON export.

## Running it

```
bun install
bun run dev        # vite dev server
bun run test       # vitest, 750 tests
bun run build      # tsc -b, then vite build
bun run preview    # serve the production build
```

Stack: Bun, Vite, React 19, TypeScript (strict), React Router 7, MUI 7,
lucide-react, idb, Vitest with Testing Library. `@/` resolves to `src/`.

## Writing

`CLAUDE.md` describes the codebase as it currently stands and is the file kept
current. `docs/` holds the rest: `SPEC.md` (product spec), `BRIEF.md` (the build
contract), `STYLEGUIDE.md` (the visual language, authoritative). Work items sit
in `docs/tasks/open/` and move to `docs/tasks/done/` when they ship.

## Layout

```
src/domain/      pure, framework-free: the code table, SM-2, scopes, weekday maths
src/storage/     IndexedDB, defaults, export/import
src/state/       the one provider every screen reads
src/features/    onboarding, learn, review, drills, trouble, weekday, stats,
                 settings, notifications, pwa
src/routes/      one file per screen, each one a thin assembly of feature parts
src/components/  the answer pad and the shared UI primitives
```

`src/domain/` is the only place scheduling, grading and the tables live, and it
holds no React and no randomness. Components must not reimplement any of it.

## Three decisions worth knowing before you change anything

**The whole store is one document under one IndexedDB key.** A hundred items
plus a drill log is a few kilobytes. Splitting it into per-record stores would
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
