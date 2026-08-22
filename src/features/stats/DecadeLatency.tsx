import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Numeral } from '@/components/ui/Numeral';
import { formatMs } from '@/domain/time';
import { palette } from '@/theme/palette';
import type { DecadeLatency as DecadeLatencyRow } from './statsSelectors';

/**
 * Ten numbers under the grid, answering the same question it does: which
 * decades cost time. Values are right-aligned in a fixed column so the digits
 * stack, which is the only reason this reads faster than ten sentences.
 */
export function DecadeLatency({ rows }: { rows: DecadeLatencyRow[] }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' },
        columnGap: 3,
        rowGap: 1,
      }}
    >
      {rows.map((row) => (
        <Box
          key={row.decade}
          sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}
        >
          <Numeral size={12} color={palette.inkMuted}>
            {row.label}
          </Numeral>
          {row.medianMs === null ? (
            <Typography component="span" variant="caption" color="text.disabled">
              —
            </Typography>
          ) : (
            <Numeral size={15} weight={600}>
              {formatMs(row.medianMs)}
            </Numeral>
          )}
        </Box>
      ))}
    </Box>
  );
}
