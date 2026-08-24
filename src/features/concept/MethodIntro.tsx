import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Numeral } from '@/components/ui/Numeral';
import { PageTitle } from '@/components/ui/PageTitle';
import { dur, transition, useReducedMotion } from '@/theme/motion';
import { radius, space, stroke } from '@/theme/tokens';
import { introCenturies, introExample, introGroups, type IntroMonth } from './introContent';

/**
 * Starts drawn (or, under reduced motion, starts already drawn) and reveals on
 * the next frame.
 *
 * This was going to be a scroll-linked reveal via `animation-timeline: view()`
 * — `main` is the app's only scroller, so the timeline would have resolved
 * against it — but `Part` is exactly the element that reasoning has to check
 * and reject: a section here is allowed to fragment across the two-column
 * layout ("A section may split across the two columns" below), and a view()
 * timeline on a box CSS can fragment is undefined — the second fragment can
 * land at a smaller scroll offset than the first, since both columns start at
 * the same top edge. So this animates on mount instead, once, rather than on
 * scroll.
 */
function useHairlineReveal(reducedMotion: boolean): boolean {
  const [drawn, setDrawn] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion || drawn) return;
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion, drawn]);
  return drawn;
}

/**
 * A section of the explainer: a quiet heading, then one idea under it.
 *
 * A section may split across the two columns, which is the point of them: the
 * right column carries on where the left ran out. What may not split is any
 * single row, mnemonic or verdict, and a heading may not be left alone at the
 * foot of a column with its section in the next one.
 *
 * The rule above the heading draws itself in left to right on mount rather
 * than simply being there — see `useHairlineReveal` for why it is mount-timed
 * rather than scroll-timed. It is a background-coloured line rather than the
 * section's own `border-top`, since a border cannot carry a `scaleX`.
 */
function Part({ title, children }: { title: string; children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const drawn = useHairlineReveal(reducedMotion);
  return (
    <Box component="section" sx={{ position: 'relative', pt: `${space[4]}px`, mb: `${space[4]}px` }}>
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '1px',
          bgcolor: 'var(--border)',
          transformOrigin: 'left center',
          opacity: drawn ? 1 : 0,
          transform: drawn ? 'scaleX(1)' : 'scaleX(0)',
          transition: reducedMotion ? 'none' : transition(['transform', 'opacity'], dur.ui),
        }}
      />
      <Typography
        variant="caption"
        component="h2"
        sx={{ color: 'var(--text-secondary)', fontWeight: 500, breakAfter: 'avoid' }}
      >
        {title}
      </Typography>
      <Box sx={{ mt: `${space[3]}px` }}>{children}</Box>
    </Box>
  );
}

/**
 * One line of working: what the number is, how it was got, and what it came out
 * at.
 *
 * The label is not optional and there is no version of this row without one.
 * The first cut of this screen printed `26 + 6` over `32` over `32 − 28` with
 * nothing naming any of it, which is invariant 7 broken on the one screen that
 * is nothing but numbers. Mono and tabular on the right, so the results line up
 * down the column and the chain can be read without reading the sums.
 */
function Working({
  label,
  sum,
  result,
  lead,
}: {
  label: string;
  /** The arithmetic, where there is any. Omitted for a number simply stated. */
  sum?: string;
  result: string;
  /** The number the section is actually after. */
  lead?: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: `${space[3]}px`,
        minHeight: 32,
        breakInside: 'avoid',
      }}
    >
      <Typography
        variant="body2"
        sx={{
          minWidth: 0,
          color: lead ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: lead ? 500 : 400,
        }}
      >
        {label}
      </Typography>
      <Box
        sx={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'baseline',
          gap: `${space[2]}px`,
        }}
      >
        {sum ? (
          <>
            <Numeral size={15} color="var(--text-muted)">
              {sum}
            </Numeral>
            <Numeral size={15} color="var(--text-muted)">
              =
            </Numeral>
          </>
        ) : null}
        <Numeral size={lead ? 22 : 17} weight={500} color="var(--text-primary)">
          {result}
        </Numeral>
      </Box>
    </Box>
  );
}

/**
 * The whole method as three moves, before any of them is explained.
 *
 * This is the first thing on the screen because it is the thing worth carrying
 * away. An opening that states a fact about doomsdays tells the reader
 * something true and leaves them with nothing to do; three numbered moves are
 * a procedure they can hold in one go and recognise in every section below.
 */
function Recipe({ steps }: { steps: readonly string[] }) {
  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {steps.map((text, index) => (
        <Box
          component="li"
          key={text}
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: `${space[3]}px`,
            py: `${space[2]}px`,
            borderTop: index === 0 ? 'none' : stroke.hairline,
            breakInside: 'avoid',
          }}
        >
          <Box
            aria-hidden
            sx={{
              flexShrink: 0,
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: `${radius.sm}px`,
              bgcolor: 'var(--brand-tint)',
            }}
          >
            <Numeral size={15} weight={500} color="var(--brand-on-tint)">
              {index + 1}
            </Numeral>
          </Box>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            {text}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/** The answer of a section, in the face a word deserves rather than a numeral. */
function Verdict({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        mt: `${space[3]}px`,
        px: `${space[3]}px`,
        py: `${space[2]}px`,
        bgcolor: 'var(--brand-tint)',
        borderRadius: `${radius.md}px`,
        breakInside: 'avoid',
      }}
    >
      <Typography variant="body1" sx={{ color: 'var(--brand-on-tint)', fontWeight: 500 }}>
        {children}
      </Typography>
    </Box>
  );
}

/** A number the app simply looks up, in a row of its siblings. */
function Chip({ name, value, marked }: { name: string; value: string; marked?: boolean }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        gap: `${space[2]}px`,
        px: `${space[2]}px`,
        py: '6px',
        borderRadius: `${radius.sm}px`,
        border: stroke.hairline,
        bgcolor: marked ? 'var(--brand-tint)' : 'transparent',
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: marked ? 'var(--brand-on-tint)' : 'var(--text-secondary)' }}
      >
        {name}
      </Typography>
      <Numeral
        size={17}
        weight={500}
        color={marked ? 'var(--brand-on-tint)' : 'var(--text-primary)'}
      >
        {value}
      </Numeral>
    </Box>
  );
}

/** One month of the doomsday table: the month, and the date it lands on. */
function MonthChip({ entry }: { entry: IntroMonth }) {
  return (
    <Chip
      name={entry.short}
      value={entry.leapDay === null ? String(entry.day) : `${entry.day}/${entry.leapDay}`}
    />
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        my: `${space[2]}px`,
        display: 'flex',
        flexWrap: 'wrap',
        gap: `${space[2]}px`,
        breakInside: 'avoid',
      }}
    >
      {children}
    </Box>
  );
}

export interface MethodIntroProps {
  /**
   * Starts the walkthrough proper, and draws the button that does it.
   *
   * Optional, because the explainer also stands on its own: onboarding shows it
   * as the last step and carries on with the flow's own footer, and two primary
   * buttons on one screen are two different ways forward.
   */
  onStart?: () => void;
}

/**
 * The whole method on one screen, worked on one fixed date, before the user is
 * asked to do anything.
 *
 * On the Concept screen it sits in front of the walkthrough rather than
 * replacing any part of it. The walk proves the method by making somebody
 * produce a weekday; this says what they are about to produce and why it takes
 * so few steps. It is one screen with the way on at the bottom, so a reader who
 * already knows this scrolls past it in a second.
 *
 * Onboarding shows it without a walk behind it. Somebody who has never seen the
 * method should meet it once, read, before anything asks them for a number; the
 * walk is a screen in the app they can go and do, and putting twelve compulsory
 * questions between them and the app made the last step of onboarding the
 * longest thing in it.
 *
 * The date is fixed at 20 March 2026, it is named before the first sum rather
 * than three sections later, and every number on the screen is derived rather
 * than written into the copy. See `introContent.ts`.
 */
export function MethodIntro({ onStart }: MethodIntroProps) {
  const example = useMemo(introExample, []);
  const groups = useMemo(introGroups, []);
  const centuries = useMemo(introCenturies, []);

  return (
    <Box>
      {/*
        Everything reads as one column that happens to be set in two, so the
        heading and the recipe are inside the flow rather than sitting across
        the top of it. A full-width block above two columns is a hero with
        columns under it, which is a different thing and looked like one.

        `columnWidth` rather than a breakpoint, because what decides this is the
        width of this container and not the width of the viewport: the same
        component is mounted inside onboarding's narrower column, where a
        viewport-keyed rule would have given it two cramped ones.

        Column heights are balanced by the browser. What makes that come out
        even is keeping the unbreakable units small: a row, a mnemonic with its
        months, a verdict. A section is free to break, and the right column
        picking up mid-section is the point of setting it this way.
      */}
      <Box
        sx={{ columnWidth: '340px', columnGap: `${space[7]}px`, columnFill: 'balance' }}
      >
        <Box sx={{ mb: `${space[5]}px`, breakInside: 'avoid' }}>
          <PageTitle subtitle="Each year has 12 doomsdays with the same weekday. To figure out a date's weekday, you simply find out the doomsday's weekday of that year, then select the nearest doomsday, and now you are always less than a month away and can calculate the rest.">
            How it works
          </PageTitle>
        </Box>

        <Box sx={{ mb: `${space[5]}px` }}>
          <Recipe
            steps={[
              'Work out that weekday for the year.',
              'Take the doomsday nearest your date.',
              'Count the days between and take the sevens off.',
            ]}
          />
        </Box>

        <Box sx={{ mb: `${space[5]}px`, breakInside: 'avoid' }}>
          <Typography variant="caption" component="p" sx={{ color: 'var(--text-secondary)' }}>
            Those three moves, on one date
          </Typography>
          <Typography variant="h1" component="p" sx={{ mt: `${space[1]}px` }}>
            {example.dateLabel}
          </Typography>
        </Box>

        <Part title={`Step 1 · The doomsday of ${example.fullYear}`}>
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: `${space[2]}px` }}>
          Two numbers, added and then reduced. The first comes from the year on its own.
        </Typography>
        <Working label="Year, last two digits" result={example.yy} />
        <Working
          label="A quarter of it, remainder dropped"
          sum={`${example.yyValue} ÷ 4`}
          result={String(example.quarters)}
        />
        <Working
          label="The two added"
          sum={`${example.yy} + ${example.quarters}`}
          result={String(example.rawSum)}
        />
        <Working
          label="Year code"
          sum={`${example.rawSum} − ${example.sevensOff}`}
          result={String(example.yearCode)}
          lead
        />

        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mt: `${space[4]}px` }}>
          The second is what the century starts from. There are only four, and they come round
          again every 400 years.
        </Typography>
        <Row>
          {centuries.map((century) => (
            <Chip
              key={century.label}
              name={century.label}
              value={String(century.anchor)}
              marked={century.current}
            />
          ))}
        </Row>
        <Working label={`Century anchor, ${example.century}`} result={String(example.anchor)} />
        {/* The intro date is chosen so this sum stays under seven and there is
            no reducing step to print after it. `introContent.test.ts` pins
            that, so moving the date fails loudly rather than printing a lie. */}
        <Working
          label="Doomsday number"
          sum={`${example.anchor} + ${example.yearCode}`}
          result={String(example.doomsdaySum)}
          lead
        />
        <Verdict>
          Every doomsday in {example.fullYear} is a {example.doomsdayName}.
        </Verdict>
      </Part>

      <Part title="Step 2 · Which dates are doomsdays">
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: `${space[3]}px` }}>
          The same dates every year, and almost all of them are one of three tricks.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${space[4]}px` }}>
          {groups.map((group) => (
            // A mnemonic and the months it covers stay together. Split across a
            // column break they are two halves that mean nothing apart.
            <Box key={group.id} sx={{ breakInside: 'avoid' }}>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {group.title}
              </Typography>
              <Typography variant="caption" component="p" sx={{ color: 'var(--text-secondary)' }}>
                {group.hint}
              </Typography>
              <Typography
                variant="body2"
                sx={{ mt: `${space[1]}px`, color: 'var(--text-secondary)' }}
              >
                {group.detail}
              </Typography>
              <Row>
                {group.months.map((entry) => (
                  <MonthChip key={entry.month} entry={entry} />
                ))}
              </Row>
            </Box>
          ))}
        </Box>
      </Part>

      <Part title={`Step 3 · From a doomsday to ${example.dateLabel}`}>
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: `${space[2]}px` }}>
          {example.month}&apos;s doomsday is the {example.monthDoomsdayOrdinal}. So in{' '}
          {example.fullYear} that date is a {example.doomsdayName}. Count on from it to the{' '}
          {example.dayOrdinal} and take the sevens off.
        </Typography>
        <Working
          label={`Doomsday of ${example.fullYear}`}
          result={String(example.doomsday)}
        />
        <Working
          label={`${example.month}'s doomsday date`}
          result={String(example.monthDoomsday)}
        />
        <Working label="Your date" result={String(example.day)} />
        <Working
          label="Days on"
          sum={`${example.day} − ${example.monthDoomsday}`}
          result={String(example.daysOn)}
        />
        <Working
          label="Doomsday plus days on"
          sum={`${example.doomsday} + ${example.daysOn}`}
          result={String(example.finalSum)}
        />
        <Working
          label="Weekday number"
          sum={`${example.finalSum} − ${example.finalSevensOff}`}
          result={String(example.weekday)}
          lead
        />
        <Verdict>
          {example.dateLabel} is a {example.weekdayName}.
        </Verdict>
        </Part>
      </Box>

      {/* Outside the columns, so it is the one thing under both of them rather
          than the tail of whichever column happened to end lower. */}
      {onStart ? (
        <Button
          variant="contained"
          onClick={onStart}
          sx={{
            mt: `${space[5]}px`,
            display: { xs: 'flex', sm: 'inline-flex' },
            width: { xs: '100%', sm: 'auto' },
            minHeight: 48,
            minWidth: 200,
          }}
        >
          Try one yourself
        </Button>
      ) : null}
    </Box>
  );
}
