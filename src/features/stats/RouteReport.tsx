import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Numeral } from '@/components/ui/Numeral';
import type { ItemState } from '@/domain/types';
import { MIN_ITEMS, routeReport, type AdjacencyEffect, type Slope } from '@/domain/diagnostics';
import { palette } from '@/theme/palette';

interface RouteReportProps {
  items: ItemState[];
}

/**
 * Whether the codes are being recalled or worked out.
 *
 * Every figure here is a slope or a difference over attempts the app already
 * stores, and each is a specific claim the data can refuse. That matters
 * because the obvious measure does not work: Uittenhove, Thevenot &
 * Barrouillet (2016) found response times still tracking operand size on
 * problems adults *reported* as retrieved, so a fast median proves nothing
 * about the route. A slope does — recall has no reason to cost more for a year
 * further into its decade, or for a year whose arithmetic is bigger.
 *
 * Read as diagnosis, not as a score. Nothing here feeds the scheduler and
 * nothing here is a target to beat.
 */
export function RouteReport({ items }: RouteReportProps) {
  const report = routeReport(items);

  if (!report.hasData) {
    return (
      <Typography variant="body2" color="text.secondary">
        {`Not enough review history yet. This needs at least ${MIN_ITEMS} years with three or more correct, unhinted review answers each.`}
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <SlopeRow
        label="Cost per step into the decade"
        unit="ms per position"
        note="How much slower a year is for each place it sits past the start of its decade. Recall is flat here. A number in the region of 200 is the cost of reciting the decade to reach it."
        slope={report.decadePosition}
      />
      <SlopeRow
        label="Cost per unit of the sum"
        unit="ms per unit"
        note="How much slower a year is as the arithmetic behind it grows. Flat means the pair is remembered. Anything else means it is being worked out, however fast the answers are."
        slope={report.derivation}
      />
      <AdjacencyRow effect={report.adjacency} />
    </Box>
  );
}

function value(slope: Slope): string {
  if (slope.msPerUnit === null) return '—';
  const rounded = Math.round(slope.msPerUnit);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

/** A slope is only worth reading when the fit behind it is worth reading. */
function strength(slope: Slope): string {
  if (slope.r === null) return `From ${slope.items} years. Too few to say anything yet.`;
  const fit = Math.abs(slope.r);
  const read =
    fit < 0.3
      ? 'No real pattern, which is what recall looks like.'
      : fit < 0.6
        ? 'A weak pattern.'
        : 'A strong pattern, so this is a route rather than noise.';
  return `From ${slope.items} years. Correlation ${fit.toFixed(2)}. ${read}`;
}

function SlopeRow({
  label,
  unit,
  note,
  slope,
}: {
  label: string;
  unit: string;
  note: string;
  slope: Slope;
}) {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="body2">{label}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexShrink: 0 }}>
          <Numeral size={22} weight={600}>
            {value(slope)}
          </Numeral>
          <Typography variant="caption" color="text.secondary">
            {unit}
          </Typography>
        </Box>
      </Box>
      <Typography variant="caption" component="div" color="text.secondary" sx={{ mt: 0.25 }}>
        {note}
      </Typography>
      <Typography variant="caption" component="div" color="text.disabled" sx={{ mt: 0.25 }}>
        {strength(slope)}
      </Typography>
    </Box>
  );
}

function AdjacencyRow({ effect }: { effect: AdjacencyEffect }) {
  const has = effect.differenceMs !== null;
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="body2">Help from the year before</Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexShrink: 0 }}>
          <Numeral size={22} weight={600}>
            {has ? `${Math.round(effect.differenceMs as number)}` : '—'}
          </Numeral>
          <Typography variant="caption" color="text.secondary">
            ms faster
          </Typography>
        </Box>
      </Box>
      <Typography variant="caption" component="div" color="text.secondary" sx={{ mt: 0.25 }}>
        How much quicker an answer is when the year just before it was a neighbour or from the same
        decade. Recall gains nothing from that. Stepping gains everything.
      </Typography>
      {has ? (
        <Typography variant="caption" component="div" color="text.disabled" sx={{ mt: 0.25 }}>
          <Numeral size={11} color={palette.inkFaint}>
            {String(Math.round(effect.afterCousinMs as number))}
          </Numeral>
          {'ms median after a neighbour, against '}
          <Numeral size={11} color={palette.inkFaint}>
            {String(Math.round(effect.afterOtherMs as number))}
          </Numeral>
          {`ms otherwise. From ${effect.afterCousinCount} and ${effect.afterOtherCount} answers.`}
        </Typography>
      ) : (
        <Typography variant="caption" component="div" color="text.disabled" sx={{ mt: 0.25 }}>
          {`Not enough of both kinds yet: ${effect.afterCousinCount} after a neighbour, ${effect.afterOtherCount} otherwise.`}
        </Typography>
      )}
    </Box>
  );
}
