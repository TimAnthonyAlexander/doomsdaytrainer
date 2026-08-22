import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Numeral } from '@/components/ui/Numeral';
import { PageTitle } from '@/components/ui/PageTitle';
import type { DrillMode, DrillRecord } from '@/domain/types';
import { palette } from '@/theme/palette';
import { DrillLatencyChart } from './DrillLatencyChart';
import { bestScore, formatScore } from './drillHistory';
import { DECADE_SIZE, type DecadeOption, type ModeStatus } from './drillPlan';

interface DrillMenuProps {
  statuses: ModeStatus[];
  decades: DecadeOption[];
  records: readonly DrillRecord[];
  /** How many codes a gauntlet would ask under the current scope. */
  gauntletTotal: number;
  now: number;
  /** One line after an aborted or empty run. */
  notice: string | null;
  /** Flagged items waiting in the trouble drill. Zero hides that row. */
  troubleCount: number;
  onStart: (mode: DrillMode, decade: number | null) => void;
}

function Best({ value }: { value: string | null }) {
  return (
    <Typography variant="caption" component="div" color="text.secondary">
      {value === null ? 'No best yet' : `Best ${value}`}
    </Typography>
  );
}

/**
 * Three modes are three choices, plus trouble spots when there are any. A row
 * per mode with its one line and its personal best; no cards, no icons, no
 * descriptions of what a drill is for.
 *
 * Trouble spots is the odd one out and reads as one: it is the only row that
 * reschedules, it has no personal best, and it is not there at all for a user
 * with nothing flagged. That is also why it is not in the nav.
 */
export function DrillMenu({
  statuses,
  decades,
  records,
  gauntletTotal,
  now,
  notice,
  troubleCount,
  onStart,
}: DrillMenuProps) {
  const [decadesOpen, setDecadesOpen] = useState(false);

  const bestFor = (mode: DrillMode): string | null => {
    const total = mode === 'gauntlet' ? gauntletTotal : 0;
    const score = bestScore(records, mode, null, total);
    return score === null ? null : formatScore(mode, score);
  };

  return (
    <>
      <PageTitle subtitle="Timed practice. Drills record what you answer and never change your review schedule.">
        Drills
      </PageTitle>

      {notice ? (
        <Typography variant="body2" color="text.secondary">
          {notice}
        </Typography>
      ) : null}

      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {statuses.map((status, index) => {
          const isDecade = status.mode === 'decade';
          const open = isDecade && decadesOpen;
          const Chevron = open ? ChevronDown : ChevronRight;

          return (
            <Box
              component="li"
              key={status.mode}
              sx={{ borderTop: index === 0 ? 'none' : `1px solid ${palette.rule}` }}
            >
              <ButtonBase
                disabled={!status.canRun}
                onClick={() =>
                  isDecade ? setDecadesOpen((value) => !value) : onStart(status.mode, null)
                }
                aria-expanded={isDecade ? open : undefined}
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
                  '&.Mui-disabled': { opacity: 0.55 },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h3" component="span" sx={{ display: 'block' }}>
                    {status.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {status.canRun ? status.detail : status.reason}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                  {isDecade ? null : <Best value={bestFor(status.mode)} />}
                  <Chevron size={18} strokeWidth={1.75} color={palette.inkFaint} aria-hidden />
                </Box>
              </ButtonBase>

              {open ? (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' },
                    gap: 1,
                    px: 1,
                    pb: 2,
                  }}
                >
                  {decades.map((option) => {
                    const score = bestScore(records, 'decade', option.decade, DECADE_SIZE);
                    return (
                      <ButtonBase
                        key={option.decade}
                        disabled={!option.available}
                        onClick={() => onStart('decade', option.decade)}
                        aria-label={`Decade ${option.label}`}
                        sx={{
                          minHeight: 56,
                          px: 1,
                          py: 1,
                          borderRadius: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          justifyContent: 'center',
                          boxShadow: `inset 0 0 0 1px ${palette.rule}`,
                          '&.Mui-disabled': { opacity: 0.45 },
                          '@media (hover: hover)': {
                            '&:hover': { backgroundColor: palette.greenSoft },
                          },
                        }}
                      >
                        <Numeral size={16} weight={600}>
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
            </Box>
          );
        })}

        {troubleCount > 0 ? (
          <Box component="li" sx={{ borderTop: `1px solid ${palette.rule}` }}>
            <ButtonBase
              component={RouterLink}
              to="/trouble"
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
      </Box>

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
