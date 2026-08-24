# Build brief — Doomsday Trainer

Every subagent working on this repo reads this file first. It is the contract.
`docs/SPEC.md` is the product spec. Both files predate a good deal of the code;
`CLAUDE.md` in the repo root is the description that has been kept current.

## Stack (fixed, do not change)

Bun · Vite · React 19 · TypeScript (strict) · React Router 7 · MUI 7 · lucide-react ·
idb (IndexedDB) · recharts · Vitest + Testing Library.

- Package manager is **bun**. `bun install`, `bun run dev`, `bun run test`, `bun run build`.
- Never add a dependency without a reason that cannot be met by what is installed.
- Import alias `@/` → `src/`.

## Code rules

- **MUI + inline `sx`.** No styled-components, no `styled()`, no CSS files beyond
  `src/index.css`. Layout with `Box`/`Stack` and CSS grid via `sx`. Do **not** use
  MUI `Grid` — the v7 API is a trap and CSS grid in `sx` is clearer.
- **lucide-react for every icon.** No emojis anywhere in the UI, ever. Not as
  bullets, not as section markers, not in copy.
- TypeScript strict. `noUnusedLocals` and `noUnusedParameters` are on — dead
  variables fail the build.
- Domain logic (scheduling, grading, the code table, scope maths) lives in
  `src/domain/` and must be **pure and framework-free**. It is unit tested.
  React components must not reimplement any of it.
- Shared types live in `src/domain/types.ts`. Import from there. If you genuinely
  need a new shared type, add it there rather than redeclaring locally.
- Every file you create that contains logic gets a colocated `*.test.ts`.
  UI-only components do not need tests unless they contain branching behaviour.
- Do not leave TODOs, placeholder text, lorem ipsum, or commented-out code.

## Design rules (hard)

The brief is **KISS but elegant**. Not decorated, not vibecoded.

- Palette is `src/theme/palette.ts`. Deep pine green dominant, terracotta accent
  (errors/lapses/destructive only), warm off-white ground. **Do not introduce a
  new colour.** If you think you need one, you need contrast or whitespace instead.
- One type family: IBM Plex Sans for text, IBM Plex Mono for **all numerals**
  (years, codes, latencies, counts). Numerals are tabular so the 7-button pad and
  the year prompt never shift width. Two weights only: 400 and 600.
- Group with whitespace and proximity, not with cards. A `Paper`/bordered box is
  only justified when the thing is a bounded interactive object. Never nest
  containers more than two deep.
- Banned outright: gradients as background wash (especially purple/indigo),
  glassmorphism, backdrop-blur, bento grids, neon, drop shadows for decoration,
  decorative status dots, rainbow accent bars, fake 3D mockups, animated
  confetti, streak flames, any gamified pressure language.
- Motion: only where it communicates state (the correct/incorrect flash, the
  auto-advance). 120–200ms, ease-out. Nothing bounces.
- Touch targets ≥ 48px. Must work at 375px wide. The seven answer buttons are
  the primary interface — they get the thumb zone, fixed positions, and they are
  large.

## Copy rules (hard)

Read as a person wrote it. Plain words, specific claims, varied sentence length.

- Banned: delve, leverage, robust, seamless, unleash, empower, streamline,
  innovative, transformative, elevate, unlock, harness, cutting-edge, journey,
  utilize, "in today's world".
- Banned constructions: "not just X, it's Y" and every variant; the rule of three
  by reflex; rhetorical question answered immediately; dramatic fragments;
  "Furthermore/Moreover/Additionally" as openers; soft closers.
- At most one em dash per screen of copy. Prefer a comma or a full stop.
- No exclamation marks. No congratulation theatre. When the user finishes a
  session, state what happened: "18 reviews, 2 wrong." Nothing else.
- No motivational or gamified language anywhere. The streak is a number with a
  label, not a celebration.

## Behavioural invariants (from SPEC.md, do not violate)

1. Answer input is **seven buttons, 0–6, in fixed positions** — 3/3/1 layout.
   Never a text field. Positions never shuffle.
2. There is **no self-grading step**. The tap is the grade.
3. Grade is derived from correctness and latency only:
   correct & `< fastThresholdMs` → 5, correct & `< mediumThresholdMs` → 4,
   correct & slower → 3, incorrect → 1. A hint caps the grade at 3.
4. Latency is measured from **prompt render to tap**, using
   `performance.now()`, not `Date.now()`.
5. Drills (`sprint`/`gauntlet`/`decade`) record attempts but **never** modify
   scheduling state (`interval`, `easeFactor`, `dueAt`, `repetitions`, `lapses`).
6. The 100 year codes are fixed content. They are never user-editable and never
   regenerated at runtime from a config.
7. Sunday is 0. In the shipped tables, in every century anchor, in every year
   code, in every intermediate sum and on every pad. There was a setting
   offering Monday at 0 and it renamed the seven buttons while moving no
   number, so the pad and the rest of the app disagreed about what 0 meant.
   Do not reintroduce a second convention that reaches only the labels.
8. Everything is local. No network calls, no analytics, no accounts, no server.

## What "done" means for your task

- `bun run build` passes (this runs `tsc -b` first).
- `bun run test` passes, including the tests you added.
- No console errors or React key/act warnings in the paths you touched.
- You did the whole task, including the unglamorous parts.

When you finish, report back in a few lines: what you built, the files you
created, anything you deliberately left for another wave, and anything you found
wrong in the spec. Do not write a summary document to disk.
