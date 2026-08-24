import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Numeral } from '@/components/ui/Numeral';
import { createItem, isLeech, masteryBucket } from '@/domain/scheduler';
import { inScope } from '@/domain/scope';
import type { ItemState, Scope, YearKey } from '@/domain/types';
import { formatYear } from '@/domain/yearCodes';
import { dur, stagger, transition, useReducedMotion } from '@/theme/motion';
import { masteryBuckets, palette } from '@/theme/palette';
import { bucketColor, bucketLabel, contrastRatio, readableInk } from './masteryColor';

/**
 * The map of the whole table: rows are decades, columns are the unit digit.
 *
 * Cells are square at every width because the ten columns are equal fractions
 * of the row and each cell fixes its own aspect ratio, so the block scales down
 * to a 375px phone without a horizontal scrollbar and without going oblong.
 * The year inside is sized in container-query units off the grid's own width.
 */

/** Width of the decade-label gutter, in px. Sized for two mono digits. */
const AXIS = 22;
const GAP = '2px';
const CELL_FONT = 'clamp(8px, 2.7cqi, 12px)';
const AXIS_FONT = 'clamp(8px, 2.5cqi, 11px)';
const UNITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

interface MasteryGridProps {
  items: ItemState[];
  scope: Scope;
  /** Year whose detail is open, outlined so the sheet has a visible origin. */
  selected: YearKey | null;
  onSelect: (yy: YearKey) => void;
}

export function MasteryGrid({ items, scope, selected, onSelect }: MasteryGridProps) {
  const byYear = useMemo(() => {
    const map = new Map<YearKey, ItemState>();
    for (const item of items) map.set(item.yy, item);
    return map;
  }, [items]);

  // The grid ramps in from the empty step on mount, per STYLEGUIDE.md §7 — the
  // one place decorative motion is sanctioned. Two committed frames are needed
  // to get a transition at all: the first paints every cell at the empty step,
  // then this flips true and the real colours ramp in from there.
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setMounted(true);
      return;
    }
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  return (
    <Box sx={{ containerType: 'inline-size' }}>
      <Box
        role="group"
        aria-label="Mastery grid, all 100 year codes"
        sx={{
          display: 'grid',
          gridTemplateColumns: `${AXIS}px repeat(10, minmax(0, 1fr))`,
          columnGap: GAP,
          rowGap: GAP,
          alignItems: 'center',
        }}
      >
        <Box aria-hidden />
        {UNITS.map((unit) => (
          <Numeral
            key={`unit-${unit}`}
            size={AXIS_FONT}
            color={palette.inkFaint}
            sx={{ display: 'block', textAlign: 'center', pb: '2px' }}
          >
            {unit}
          </Numeral>
        ))}

        {UNITS.map((decade) => (
          <Box key={`row-${decade}`} sx={{ display: 'contents' }}>
            <Numeral
              size={AXIS_FONT}
              color={palette.inkFaint}
              sx={{ display: 'block', textAlign: 'right', pr: '6px' }}
            >
              {formatYear(decade * 10)}
            </Numeral>
            {UNITS.map((unit) => {
              const yy = decade * 10 + unit;
              return (
                <Cell
                  key={yy}
                  item={byYear.get(yy) ?? createItem(yy)}
                  outOfScope={!inScope(yy, scope)}
                  selected={selected === yy}
                  onSelect={onSelect}
                  rowIndex={decade}
                  mounted={mounted}
                  reducedMotion={reducedMotion}
                />
              );
            })}
          </Box>
        ))}
      </Box>

      <MasteryLegend />
    </Box>
  );
}

interface CellProps {
  item: ItemState;
  outOfScope: boolean;
  selected: boolean;
  onSelect: (yy: YearKey) => void;
  /** Decade row, 0–9. Cells in the same row start their ramp together. */
  rowIndex: number;
  mounted: boolean;
  reducedMotion: boolean;
}

function Cell({ item, outOfScope, selected, onSelect, rowIndex, mounted, reducedMotion }: CellProps) {
  const bucket = masteryBucket(item);
  const fill = bucketColor(bucket);
  const leech = isLeech(item);

  // The aria-label always reads the true value, from the first frame. Only the
  // fill is ever transitional.
  const parts = [formatYear(item.yy), bucketLabel(bucket)];
  if (leech) parts.push(`${item.lapses} lapses`);
  if (outOfScope) parts.push('outside scope');

  // Out-of-scope cells are drawn as absence, not as progress, so they never
  // ramp in — they are transparent on the first frame and every frame after.
  // In-scope cells hold at the empty step until `mounted` flips, then ramp to
  // their real colour, staggered by decade row.
  const showFinal = reducedMotion || mounted;
  const displayFill = showFinal ? fill : bucketColor(0);
  const animate = !outOfScope && !reducedMotion;

  return (
    <ButtonBase
      onClick={() => onSelect(item.yy)}
      aria-label={parts.join(', ')}
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1 / 1',
        borderRadius: '3px',
        overflow: 'hidden',
        // Out of scope is drawn as absence: the ground shows through and only a
        // dashed rule marks the cell, so the chosen scope reads as a shape.
        bgcolor: outOfScope ? 'transparent' : displayFill,
        border: outOfScope ? `1px dashed ${palette.rule}` : 'none',
        color: outOfScope ? palette.inkFaint : readableInk(displayFill),
        transition: animate ? transition(['background-color', 'color'], dur.ui) : 'none',
        transitionDelay: animate ? stagger(rowIndex, 12) : undefined,
        outline: selected ? `2px solid ${palette.ink}` : 'none',
        outlineOffset: '1px',
        zIndex: selected ? 1 : 0,
        '&:focus-visible': { outline: `2px solid ${palette.ink}`, outlineOffset: '1px' },
      }}
    >
      <Numeral size={CELL_FONT} weight={outOfScope ? 400 : 600} lineHeight={1}>
        {formatYear(item.yy)}
      </Numeral>
      {leech ? (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '3px',
            // The cell's own ink, not a grading colour. A leech means "this
            // one keeps lapsing", which is not the same thing as "you just got
            // it wrong", and STYLEGUIDE.md §2 keeps grading hues off this grid
            // entirely. Reusing the ink also guarantees it reads on every step
            // of the ramp, light end and dark.
            bgcolor: 'currentColor',
          }}
        />
      ) : null}
    </ButtonBase>
  );
}

/**
 * The palest step of the ramp is nearly the ground colour, so at 11px it would
 * vanish. Whether a swatch needs an outline is measured, not guessed.
 */
function swatchBorder(fill: string | undefined, dashed: boolean): string {
  if (dashed) return `1px dashed ${palette.rule}`;
  if (fill && contrastRatio(fill, palette.ground) < 1.2) return `1px solid ${palette.rule}`;
  return 'none';
}

function Swatch({ fill, dashed = false, leech = false }: { fill?: string; dashed?: boolean; leech?: boolean }) {
  return (
    <Box
      aria-hidden
      sx={{
        position: 'relative',
        width: 11,
        height: 11,
        flexShrink: 0,
        borderRadius: '2px',
        overflow: 'hidden',
        bgcolor: fill ?? 'transparent',
        border: swatchBorder(fill, dashed),
      }}
    >
      {leech ? (
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '3px',
            // The cell's own ink, not a grading colour. A leech means "this
            // one keeps lapsing", which is not the same thing as "you just got
            // it wrong", and STYLEGUIDE.md §2 keeps grading hues off this grid
            // entirely. Reusing the ink also guarantees it reads on every step
            // of the ramp, light end and dark.
            bgcolor: 'currentColor',
          }}
        />
      ) : null}
    </Box>
  );
}

function LegendRow({ children, swatch }: { children: string; swatch: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
      {swatch}
      <Typography variant="caption" color="text.secondary" noWrap>
        {children}
      </Typography>
    </Box>
  );
}

function MasteryLegend() {
  return (
    <Box
      sx={{
        mt: 2,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))',
        columnGap: 2,
        rowGap: 0.5,
      }}
    >
      {masteryBuckets.map((bucket, index) => (
        <LegendRow key={bucket.label} swatch={<Swatch fill={bucketColor(index)} />}>
          {bucket.label}
        </LegendRow>
      ))}
      <LegendRow swatch={<Swatch fill={bucketColor(3)} leech />}>Leech, 6+ lapses</LegendRow>
      <LegendRow swatch={<Swatch dashed />}>Outside your scope</LegendRow>
    </Box>
  );
}
