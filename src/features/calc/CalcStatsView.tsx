import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Numeral } from '@/components/ui/Numeral';
import { Stat } from '@/components/ui/Stat';
import { CALC_STEP_IDS } from '@/domain/calc';
import {
  calcAnsweredTotal,
  calcStepAccuracy,
  calcStepAnswered,
  calcStepMedian,
  verifyAgreementRate,
  verifyCalculationAccuracy,
  verifyChecked,
  verifyMemoryAccuracy,
  weakestStep,
} from '@/domain/calcStats';
import { formatMs } from '@/domain/time';
import type { CalcTotals, VerifyTotals } from '@/domain/types';
import { space } from '@/theme/tokens';
import { stepLabel, stepProse } from './stepView';

interface CalcStatsViewProps {
  totals: CalcTotals;
  verify: VerifyTotals;
}

/** Three columns at 375px, the two figure columns fixed so the rows line up. */
const COLUMNS = {
  display: 'grid',
  gridTemplateColumns: '1fr 52px 62px',
  columnGap: `${space[3]}px`,
} as const;

function percent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

function Figure({ children }: { children: string }) {
  return (
    <Numeral size={13} color="var(--text-primary)" sx={{ textAlign: 'right' }}>
      {children}
    </Numeral>
  );
}

/**
 * Every step kept apart, because averaging them is exactly what hides the slow
 * one. A user who can see that the sevens cost four of their six seconds knows
 * what to practise; one shown a single "six seconds" figure does not.
 */
export function CalcStatsView({ totals, verify }: CalcStatsViewProps) {
  const answered = calcAnsweredTotal(totals);
  const checked = verifyChecked(verify);

  if (answered === 0 && checked === 0) {
    return (
      <Box>
        <Typography variant="h2" component="h2" sx={{ mb: `${space[2]}px` }}>
          Your steps
        </Typography>
        <Typography variant="body1" sx={{ color: 'var(--text-secondary)' }}>
          Nothing measured yet. Practice and check both time each step on its own.
        </Typography>
      </Box>
    );
  }

  const slowest = weakestStep(totals);
  const slowestMedian = slowest === null ? null : calcStepMedian(totals, slowest);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${space[4]}px` }}>
      <Typography variant="h2" component="h2">
        Your steps
      </Typography>

      {answered === 0 ? null : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          <Box component="li" sx={{ ...COLUMNS, pb: `${space[1]}px` }} aria-hidden>
            <span />
            <Typography component="span" variant="caption" sx={{ color: 'var(--text-secondary)', textAlign: 'right' }}>
              Right
            </Typography>
            <Typography component="span" variant="caption" sx={{ color: 'var(--text-secondary)', textAlign: 'right' }}>
              Median
            </Typography>
          </Box>
          {CALC_STEP_IDS.map((id) => {
            const count = calcStepAnswered(totals, id);
            const median = calcStepMedian(totals, id);
            return (
              <Box
                component="li"
                key={id}
                sx={{ ...COLUMNS, alignItems: 'baseline', py: `${space[1]}px` }}
              >
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ color: count === 0 ? 'var(--text-muted)' : 'var(--text-primary)' }}
                >
                  {stepLabel(id)}
                </Typography>
                <Figure>{count === 0 ? '—' : percent(calcStepAccuracy(totals, id))}</Figure>
                <Figure>{median === null ? '—' : formatMs(median)}</Figure>
              </Box>
            );
          })}
        </Box>
      )}

      {slowest !== null && slowestMedian !== null ? (
        <Typography variant="body1" sx={{ color: 'var(--text-secondary)' }}>
          {'Your slowest step is '}
          {stepProse(slowest)}
          {', at '}
          <Numeral color="inherit">{formatMs(slowestMedian)}</Numeral>
          {' in the middle.'}
        </Typography>
      ) : null}

      {checked === 0 ? null : (
        <Box>
          <Typography variant="h2" component="h3" sx={{ mb: `${space[2]}px` }}>
            Memory against working
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))',
              gap: `${space[2]}px`,
            }}
          >
            <Stat size="sm" label="Checked" value={String(checked)} />
            <Stat size="sm" label="Agreed" value={percent(verifyAgreementRate(verify))} />
            <Stat size="sm" label="Memory right" value={percent(verifyMemoryAccuracy(verify))} />
            <Stat size="sm" label="Working right" value={percent(verifyCalculationAccuracy(verify))} />
          </Box>
        </Box>
      )}
    </Box>
  );
}
