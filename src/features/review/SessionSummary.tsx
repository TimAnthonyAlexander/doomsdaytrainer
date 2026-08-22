import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Numeral } from '@/components/ui/Numeral';
import { formatMs } from '@/domain/time';
import { nextDueLabel, type SessionSummary as Summary } from './summary';

interface SessionSummaryProps {
  summary: Summary;
  nextDueAt: number | null;
  /** Where to go next. Rendered under the line, never above it. */
  actions?: ReactNode;
}

/**
 * What happened, stated. No praise, no score, no streak: the numbers are the
 * whole message and the user reads them in under a second.
 */
export function SessionSummary({ summary, nextDueAt, actions }: SessionSummaryProps) {
  const next = nextDueLabel(nextDueAt, Date.now());

  return (
    <Box>
      <Typography variant="h1" component="h1">
        <Numeral size="inherit" weight={600}>
          {summary.total}
        </Numeral>
        {summary.total === 1 ? ' review, ' : ' reviews, '}
        <Numeral size="inherit" weight={600}>
          {summary.wrong}
        </Numeral>
        {' wrong, median '}
        <Numeral size="inherit" weight={600}>
          {formatMs(summary.medianLatencyMs)}
        </Numeral>
      </Typography>

      <EmptyState icon={Check} action={actions}>
        {next === null ? 'Nothing else is scheduled.' : `Next code due ${next}.`}
      </EmptyState>
    </Box>
  );
}
