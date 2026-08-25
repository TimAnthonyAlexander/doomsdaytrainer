import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { Check, X } from 'lucide-react';
import { Numeral } from '@/components/ui/Numeral';
import { Stat } from '@/components/ui/Stat';
import { isLeech, masteryBucket } from '@/domain/scheduler';
import { formatInterval, formatMs } from '@/domain/time';
import type { Attempt, ItemState } from '@/domain/types';
import { formatYear } from '@/domain/yearCodes';
import { palette } from '@/theme/palette';
import { bucketColor, bucketLabel, readableInk } from './masteryColor';
import { dueLabel, medianItemLatency, recentAttempts } from './statsSelectors';

/**
 * Per-item detail for one grid cell. A bottom sheet on a phone, a dialog from
 * 900px up, the same body in both. The year's code is deliberately not shown —
 * this is the diagnostic map, and Learn mode is where the answer lives.
 */

const SOURCE_LABEL: Record<Attempt['source'], string> = {
  review: 'Revise',
  learn: 'Learn',
  sprint: 'Sprint',
  gauntlet: 'Gauntlet',
  decade: 'Decade drill',
  endless: 'Endless',
  trouble: 'Trouble spots',
  // Month and century items live in their own maps, so these two never label a
  // year's history. The map is total because the type is.
  month: 'Month doomsday',
  century: 'Century anchor',
};

interface ItemDetailProps {
  item: ItemState | null;
  outOfScope: boolean;
  now: number;
  onClose: () => void;
}

export function ItemDetail({ item, outOfScope, now, onClose }: ItemDetailProps) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const open = item !== null;

  if (wide) {
    return (
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="item-detail-year">
        <Box sx={{ p: 3 }}>{item ? <Body item={item} outOfScope={outOfScope} now={now} onClose={onClose} /> : null}</Box>
      </Dialog>
    );
  }

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            borderRadius: '12px 12px 0 0',
            borderBottom: 'none',
            maxHeight: '82dvh',
            px: '20px',
            pt: 2.5,
            pb: 'calc(20px + var(--safe-bottom, 0px))',
          },
        },
      }}
    >
      {item ? <Body item={item} outOfScope={outOfScope} now={now} onClose={onClose} /> : null}
    </Drawer>
  );
}

function Body({ item, outOfScope, now, onClose }: { item: ItemState; outOfScope: boolean; now: number; onClose: () => void }) {
  const bucket = masteryBucket(item);
  const fill = bucketColor(bucket);
  const latency = medianItemLatency(item);
  const attempts = recentAttempts(item);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          aria-hidden
          sx={{
            width: 48,
            height: 48,
            flexShrink: 0,
            borderRadius: '6px',
            bgcolor: fill,
            color: readableInk(fill),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Numeral size={18} weight={600}>
            {formatYear(item.yy)}
          </Numeral>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id="item-detail-year" variant="h2" component="h2">
            Year {formatYear(item.yy)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {bucketLabel(bucket)}
            {outOfScope ? ' · outside your scope' : ''}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close" size="small" sx={{ color: 'text.secondary' }}>
          <X size={20} strokeWidth={1.75} aria-hidden />
        </IconButton>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          columnGap: 2,
          rowGap: 2.5,
        }}
      >
        <Stat size="sm" label="Interval" value={formatInterval(item.interval)} />
        <Stat size="sm" label="Next due" value={dueLabel(item, now)} />
        <Stat size="sm" label="Ease" value={item.easeFactor.toFixed(2)} />
        <Stat
          size="sm"
          label="Lapses"
          value={item.lapses}
          tone={item.lapses > 0 ? 'error' : 'default'}
        />
        <Stat size="sm" label="Median latency" value={latency === null ? '—' : formatMs(latency)} />
        <Stat size="sm" label="Reviews" value={item.repetitions} />
      </Box>

      {isLeech(item) ? (
        <Typography variant="body2" sx={{ color: palette.ink }}>
          Flagged as a leech after {item.lapses} lapses. It shows up in the Trouble spots drill.
        </Typography>
      ) : null}

      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" component="div" color="text.secondary" sx={{ mb: 1 }}>
          {attempts.length === 0
            ? 'Attempts'
            : `Last ${attempts.length} attempt${attempts.length === 1 ? '' : 's'}, newest first`}
        </Typography>
        {attempts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No attempts yet.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {attempts.map((attempt) => (
              <AttemptRow key={`${attempt.timestamp}-${attempt.latencyMs}`} attempt={attempt} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function AttemptRow({ attempt }: { attempt: Attempt }) {
  const when = new Date(attempt.timestamp);
  const Icon = attempt.correct ? Check : X;
  // Neutral on purpose. The Check/X icon already carries correct-versus-wrong,
  // so this does not need a colour, and grading hues belong to the feedback
  // flash rather than a history list (STYLEGUIDE.md §2). A wrong attempt takes
  // the stronger ink so the eye still finds the failures first.
  const tone = attempt.correct ? palette.inkMuted : palette.ink;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 0.75,
        borderTop: `1px solid ${palette.rule}`,
        '&:first-of-type': { borderTop: 'none' },
      }}
    >
      <Icon size={15} strokeWidth={2} color={tone} aria-hidden />
      <Typography component="span" variant="caption" sx={{ color: tone, width: 58, flexShrink: 0 }}>
        {attempt.correct ? 'Correct' : 'Wrong'}
      </Typography>
      <Numeral size={12} color={palette.inkMuted} sx={{ flex: 1, minWidth: 0 }}>
        {when.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
      </Numeral>
      {attempt.source === 'review' ? null : (
        <Typography component="span" variant="caption" color="text.disabled" noWrap>
          {SOURCE_LABEL[attempt.source]}
        </Typography>
      )}
      <Numeral size={12} weight={600} sx={{ width: 52, textAlign: 'right', flexShrink: 0 }}>
        {formatMs(attempt.latencyMs)}
      </Numeral>
    </Box>
  );
}
