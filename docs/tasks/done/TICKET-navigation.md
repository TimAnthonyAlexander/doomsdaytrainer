# Navigation and labelling restructure

**Raised by:** Tim (PM)
**Status:** Done, 22 August 2026

## The problem

The navigation annoys me. Things are at the top that aren't that important, and
things are named weirdly.

This app is a **doomsday teacher**, not a year-code teacher. The year code is an
important part of it — yes — but it is not the only thing. The fact that "Learn"
only teaches year codes shows that this is miscommunicated. The labelling needs
work.

Review, Learn and Drills all mean similar things. Nothing makes sense.

## What I want

### Weekday comes first

Weekday should be the main and the first one.

### Unassisted is the default

Unassisted should be the default, not assisted.

### A Year code page

I want a Year code page that has several options on it, like apps on a grid:

- **Learn** — the current Learn page
- **Revise**
- **Calc** — this is also an app for year codes and belongs on that grid

### Review and Drills become one thing

Review and Drills should be simplified into a UI where there is a default mode.
Just like Assisted/Unassisted and Century/Living Memory are options — but all in
one ready-to-start UI.

## Acceptance

- Weekday is the first and primary destination.
- Unassisted is what a run starts in unless the user changes it.
- Year codes is one destination holding Learn, Revise and Calc as a grid.
- Review and Drills are no longer separate destinations. One surface, one
  default mode, the rest as options chosen before starting.
- The names tell a person who has never used the app what each screen does, and
  no two names mean the same thing.

## What shipped

The nav went from seven entries to four: Weekday, Year codes, Progress,
Settings. Weekday is the index route.

`/` is Weekday. `/year-codes` is a grid of Learn, Revise and Calc, with Trouble
spots joining them when something is flagged; each tile carries one line of real
status, so the grid answers "what is there to do" without being entered. Review
and Drills are gone as names and as destinations, merged into Revise: one
surface, the due queue preselected, sprint, gauntlet and decade as the other
modes, one Start button.

Reviewing costs one tap it did not cost before, since the screen used to be the
run and began timing on mount. That was accepted deliberately.

Unassisted is the Weekday default. Both of that screen's pickers are remembered
in `localStorage`, so it comes back on whatever was last chosen.

Two things fell out of the work rather than being asked for. The route table had
no test at all, which is how a restructure like this ships a dead link, so
`routes` is exported and asserted. And `localStorage` was not being cleared
between tests, so a file's first case started on whatever the file above it left
behind.
