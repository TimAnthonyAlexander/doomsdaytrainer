import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { ChevronRight } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { Numeral } from '@/components/ui/Numeral';
import { PageTitle } from '@/components/ui/PageTitle';
import type { DrillRecord } from '@/domain/types';
import { DrillLatencyChart } from '@/features/drills/DrillLatencyChart';
import { bestScore, formatScore } from '@/features/drills/drillHistory';
import { DECADE_SIZE, type DecadeOption } from '@/features/drills/drillPlan';
import { palette } from '@/theme/palette';
import { radius } from '@/theme/tokens';
import type { ReviseMode, ReviseStatus } from './revisePlan';

interface ReviseMenuProps {
  statuses: ReviseStatus[];
  decades: DecadeOption[];
  records: readonly DrillRecord[];
  /** How many codes a gauntlet would ask under the current scope. */
  gauntletTotal: number;
  now: number;
  /** One line after an aborted or empty run. */
  notice: string | null;
  /** Flagged items waiting in the trouble drill. Zero hides that row. */
  troubleCount: number;
  mode: ReviseMode;
  onModeChange: (mode: ReviseMode) => void;
  /** 0..9 once a decade has been picked. Null keeps Start closed. */
  decade: number | null;
  onDecadeChange: (decade: number) => void;
  onStart: () => void;
}

function Best({ value }: { value: string | null }) {
  return (
    <Typography variant="caption" component="div" color="text.secondary">
      {value === null ? 'No best yet' : `Best ${value}`}
    </Typography>
  );
}

/**
 * One surface, one mode already chosen, one Start.
 *
 * A row selects rather than launches, so the screen can be read before anything
 * is timed: what is due, what each drill costs, and what your best on it is.
 * The mark on the selected row is the brand tint the navigation rail uses for
 * the destination you are on — the same register, and not a grading colour,
 * which has to stay reserved for the feedback flash.
 *
 * Trouble spots is not a mode and does not sit in the list. It is the only
 * thing here besides Revise that reschedules, it has no personal best, and for
 * a user with nothing flagged it is not on the screen at all.
 */
export function ReviseMenu({
  statuses,
  decades,
  records,
  gauntletTotal,
  now,
  notice,
  troubleCount,
  mode,
  onModeChange,
  decade,
  onDecadeChange,
  onStart,
}: ReviseMenuProps) {
  const selected = statuses.find((status) => status.mode === mode) ?? statuses[0];
  const needsDecade = mode === 'decade' && decade === null;
  const canStart = selected.canRun && !needsDecade;

  const bestFor = (which: 'sprint' | 'gauntlet'): string | null => {
    // Sprint scores are counts and comparable across runs; a gauntlet time is
    // only comparable to a gauntlet of the same length, so the scope's size is
    // part of the lookup.
    const total = which === 'gauntlet' ? gauntletTotal : 0;
    const score = bestScore(records, which, null, total);
    return score === null ? null : formatScore(which, score);
  };

  return (
    <>
      <PageTitle subtitle="Revise is the scheduled queue. The three drills are timed and leave your schedule alone.">
        Revise
      </PageTitle>

      {notice ? (
        <Typography variant="body2" color="text.secondary">
          {notice}
        </Typography>
      ) : null}

      <Box component="ul" role="radiogroup" aria-label="Mode" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {statuses.map((status, index) => {
          const current = status.mode === mode;
          return (
            <Box
              component="li"
              // The list carries the radiogroup, so the items must not also
              // announce themselves as list items inside it.
              role="none"
              key={status.mode}
              sx={{ borderTop: index === 0 ? 'none' : `1px solid ${palette.rule}` }}
            >
              <ButtonBase
                role="radio"
                aria-checked={current}
                disabled={!status.canRun}
                onClick={() => onModeChange(status.mode)}
                sx={{
                  width: '100%',
                  minHeight: 64,
                  px: 1,
                  py: 1.5,
                  gap: 2,
                  borderRadius: `${radius.md}px`,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  bgcolor: current ? palette.brandTint : 'transparent',
                  '&.Mui-disabled': { opacity: 0.55 },
                  '&:focus-visible': {
                    outline: `2px solid ${palette.brandDeep}`,
                    outlineOffset: 2,
                  },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="h3"
                    component="span"
                    sx={{
                      display: 'block',
                      fontWeight: current ? 500 : 400,
                      color: current ? palette.brandOnTint : 'text.primary',
                    }}
                  >
                    {status.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {status.canRun ? status.detail : status.reason}
                  </Typography>
                </Box>
                {/* Revise has no run to beat, and a decade's best belongs on
                    the decade rather than on the row that holds all ten. */}
                {status.mode === 'sprint' || status.mode === 'gauntlet' ? (
                  <Box sx={{ flexShrink: 0 }}>
                    <Best value={bestFor(status.mode)} />
                  </Box>
                ) : null}
              </ButtonBase>
            </Box>
          );
        })}
      </Box>

      {mode === 'decade' ? (
        <Box
          role="radiogroup"
          aria-label="Decade"
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              sm: 'repeat(5, minmax(0, 1fr))',
            },
            gap: 1,
          }}
        >
          {decades.map((option) => {
            const score = bestScore(records, 'decade', option.decade, DECADE_SIZE);
            const current = option.decade === decade;
            return (
              <ButtonBase
                key={option.decade}
                role="radio"
                aria-checked={current}
                disabled={!option.available}
                onClick={() => onDecadeChange(option.decade)}
                aria-label={`Decade ${option.label}`}
                sx={{
                  minHeight: 56,
                  px: 1,
                  py: 1,
                  borderRadius: `${radius.md}px`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  bgcolor: current ? palette.brandTint : 'transparent',
                  boxShadow: `inset 0 0 0 1px ${current ? palette.brandDeep : palette.rule}`,
                  '&.Mui-disabled': { opacity: 0.45 },
                  '&:focus-visible': {
                    outline: `2px solid ${palette.brandDeep}`,
                    outlineOffset: 2,
                  },
                  '@media (hover: hover)': {
                    '&:hover': { bgcolor: current ? palette.brandTint : palette.surface },
                  },
                }}
              >
                <Numeral size={16} weight={500} color={current ? palette.brandOnTint : 'inherit'}>
                  {option.label}
                </Numeral>
                <Typography variant="caption" color="text.secondary">
                  {option.available
                    ? score === null
                      ? 'No best yet'
                      : `Best ${formatScore('decade', score)}`
                    : 'Outside scope'}
                </Typography>
              </ButtonBase>
            );
          })}
        </Box>
      ) : null}

      <Button
        variant="contained"
        onClick={onStart}
        disabled={!canStart}
        sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' }, minWidth: 160 }}
      >
        Start
      </Button>

      {troubleCount > 0 ? (
        <Box sx={{ borderTop: `1px solid ${palette.rule}` }}>
          <ButtonBase
            component={RouterLink}
            to="/year-codes/trouble"
            sx={{
              width: '100%',
              minHeight: 64,
              px: 1,
              py: 1.5,
              gap: 2,
              borderRadius: 1,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              textAlign: 'left',
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h3" component="span" sx={{ display: 'block' }}>
                Trouble spots
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {`${troubleCount} ${troubleCount === 1 ? 'code' : 'codes'} flagged after six lapses, block shown. This one does change your schedule.`}
              </Typography>
            </Box>
            <ChevronRight size={18} strokeWidth={1.75} color={palette.inkFaint} aria-hidden />
          </ButtonBase>
        </Box>
      ) : null}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography variant="h3" component="h2">
            Drill latency
          </Typography>
          <Typography variant="caption" component="div" color="text.secondary" sx={{ mt: 0.5 }}>
            Median of each drill, per day. Review latency is a separate number, on Stats.
          </Typography>
        </Box>
        <DrillLatencyChart records={records} now={now} />
      </Box>
    </>
  );
}
