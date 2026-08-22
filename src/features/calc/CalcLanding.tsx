import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { ChevronRight } from 'lucide-react';
import { PageTitle } from '@/components/ui/PageTitle';
import type { CalcTotals, VerifyTotals } from '@/domain/types';
import { space } from '@/theme/tokens';
import { CalcStatsView } from './CalcStatsView';

export type CalcView = 'landing' | 'method' | 'shortcut' | 'practice' | 'verify';

interface PathRow {
  id: Exclude<CalcView, 'landing'>;
  title: string;
  detail: string;
}

const PATHS: readonly PathRow[] = [
  {
    id: 'method',
    title: 'Learn the method',
    detail: 'Five short lessons, one thing to do in each.',
  },
  {
    id: 'shortcut',
    title: 'The 28-year shortcut',
    detail: 'Why every code comes back around, and what that saves.',
  },
  {
    id: 'practice',
    title: 'Practice the whole thing',
    detail: 'One year, worked all the way through, every step timed on its own.',
  },
  {
    id: 'verify',
    title: 'Check against memory',
    detail: 'Say the code, then work it out, then see whether the two agree.',
  },
];

interface CalcLandingProps {
  totals: CalcTotals;
  verify: VerifyTotals;
  onOpen: (view: CalcView) => void;
}

/**
 * Four ways in, listed flat. No wizard, no carousel, no ring: they are four
 * things to do, and a list is what four things to do look like.
 */
export function CalcLanding({ totals, verify, onOpen }: CalcLandingProps) {
  return (
    <>
      <PageTitle subtitle="Any year code can be worked out from scratch. It takes three steps, and knowing them means never being stuck on a code you have forgotten.">
        Calculate
      </PageTitle>

      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {PATHS.map((path, index) => (
          <Box
            component="li"
            key={path.id}
            sx={{ borderTop: index === 0 ? 'none' : '1px solid var(--border)' }}
          >
            <ButtonBase
              onClick={() => onOpen(path.id)}
              sx={{
                width: '100%',
                minHeight: 64,
                px: `${space[2]}px`,
                py: `${space[3]}px`,
                gap: `${space[4]}px`,
                borderRadius: `${space[2]}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'left',
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography component="span" variant="body1" sx={{ display: 'block' }}>
                  {path.title}
                </Typography>
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ display: 'block', color: 'var(--text-secondary)' }}
                >
                  {path.detail}
                </Typography>
              </Box>
              <ChevronRight size={18} strokeWidth={1.75} color="var(--text-muted)" aria-hidden />
            </ButtonBase>
          </Box>
        ))}
      </Box>

      <CalcStatsView totals={totals} verify={verify} />
    </>
  );
}
