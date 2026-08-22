import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useEffect, useRef } from 'react';
import { monoFontFamily } from '@/theme/theme';
import { formatClock } from './drillHistory';

interface DrillClockProps {
  /** `performance.now()` origin of the run, or null before it starts. */
  startedAt: number | null;
  /** Seconds allowed. Set for a sprint, which counts down; null counts up. */
  limitSeconds: number | null;
}

/**
 * The one genuinely dynamic number in the app.
 *
 * It writes straight to the DOM node on an interval instead of holding the time
 * in React state. Ten renders a second of a screen that also holds the answer
 * pad is work the drill cannot afford, and the pad's own latency clock is the
 * thing being measured. That ref is also why the numeral is styled here rather
 * than through `<Numeral>`, which has no ref to give.
 *
 * Figures are tabular, so the digits change without the number moving. There is
 * no ring, no pulse and no colour shift as the time runs out: a clock that
 * changes appearance is a clock the user watches instead of the year.
 */
export function DrillClock({ startedAt, limitSeconds }: DrillClockProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const paint = () => {
      const elapsed = startedAt === null ? 0 : Math.max(0, performance.now() - startedAt);
      node.textContent =
        limitSeconds === null
          ? formatClock(elapsed)
          : String(Math.max(0, Math.ceil((limitSeconds * 1000 - elapsed) / 1000)));
    };

    paint();
    if (startedAt === null) return;
    const id = setInterval(paint, 100);
    return () => clearInterval(id);
  }, [startedAt, limitSeconds]);

  return (
    <Box>
      <Typography variant="caption" component="div" color="text.secondary">
        {limitSeconds === null ? 'Elapsed' : 'Seconds left'}
      </Typography>
      <Box
        component="span"
        ref={ref}
        sx={{
          display: 'block',
          fontFamily: monoFontFamily,
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum" 1, "zero" 1',
          fontSize: 34,
          fontWeight: 600,
          lineHeight: 1.1,
          letterSpacing: 0,
        }}
      />
    </Box>
  );
}
