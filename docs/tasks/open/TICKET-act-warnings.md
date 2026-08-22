# Intermittent act() warnings in the weekday tests

**Raised by:** found during the navigation restructure, 22 August 2026
**Status:** Open

## The problem

`src/features/weekday/weekdayFlow.test.tsx` and
`src/features/weekday/dayStepFlow.test.tsx` print React "not wrapped in act(...)"
warnings on some runs and not others. Measured over six runs of the two files
together, four runs printed two warnings each and two printed none.

The suite is green either way. The warnings come from `MonthPad` in "Tables >
drills a month doomsday" and from `AnswerPad` in "counts an answer into both the
session and the lifetime totals".

This is pre-existing. It was checked against the commit before the restructure
landed, with the same six-run comparison, and reproduces there at the same rate.
It is not caused by the merged Revise surface, the route move, or the weekday
preference work.

## Likely cause

An IndexedDB write resolving after the test that started it has finished, so the
state update lands outside any `act()`. Both failing cases record an attempt and
then assert on rendered totals, which is exactly the shape that leaves a write
in flight.

## Why it matters

`docs/BRIEF.md` makes "no console errors or React act warnings in the paths you
touched" part of what done means. A warning that appears in two runs out of three
trains the next person to ignore the ones that are real.

## Acceptance

- Six consecutive runs of both files print no act warnings.
- The fix is in how the test awaits the write, or in the hook's cleanup. It is
  not silencing the warning, and it is not a `waitFor` wrapped around an
  assertion that was already passing.
