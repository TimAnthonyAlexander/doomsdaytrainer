import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { formatMs } from '@/domain/time';
import { monoFontFamily } from '@/theme/theme';
import { palette } from '@/theme/palette';
import { contiguousRuns, niceLatencyCeiling, type LatencyPoint } from './statsSelectors';

/**
 * A median-per-day line, hand-drawn in SVG.
 *
 * Recharts is installed but this needs the opposite of what it is good at: no
 * gridlines, no legend, no tooltip, one hairline axis, and a line that must
 * *break* on days with no data rather than interpolate through them. That is a
 * dozen prop overrides against its defaults, or twenty lines of path maths.
 *
 * The chart plots review latency on Stats and drill latency on Drills, so the
 * two strings a screen reader and an empty screen depend on are props. `label`
 * is a function because only this component knows how many of the days it was
 * handed actually carry a number.
 */

const W = 320;
const H = 128;
const PAD_L = 38;
const PAD_R = 4;
const PAD_T = 10;
const PAD_B = 20;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

interface LatencyChartProps {
  points: LatencyPoint[];
  /**
   * The chart's accessible name, given the width of the window in days and how
   * many of those days have a median.
   */
  label: (days: number, withData: number) => string;
  /** Stands in for the chart until two separate days carry a number. */
  emptyText: string;
}

export function LatencyChart({ points, label, emptyText }: LatencyChartProps) {
  const geometry = useMemo(() => {
    const values = points.map((p) => p.medianMs);
    const withData = values.filter((v): v is number => v !== null);
    const ceiling = niceLatencyCeiling(Math.max(0, ...withData));
    const x = (index: number) =>
      points.length <= 1 ? PAD_L : PAD_L + (index / (points.length - 1)) * PLOT_W;
    const y = (value: number) => PAD_T + PLOT_H * (1 - value / ceiling);
    return { runs: contiguousRuns(values), ceiling, x, y, count: withData.length };
  }, [points]);

  if (geometry.count < 2) {
    return (
      <Typography variant="body2" color="text.secondary">
        {emptyText}
      </Typography>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <Box
      component="svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label(points.length, geometry.count)}
      sx={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
    >
      <line
        x1={PAD_L}
        y1={PAD_T + PLOT_H}
        x2={PAD_L + PLOT_W}
        y2={PAD_T + PLOT_H}
        stroke={palette.rule}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />

      <text
        x={PAD_L - 6}
        y={PAD_T + 4}
        textAnchor="end"
        fontFamily={monoFontFamily}
        fontSize={9}
        fill={palette.inkFaint}
      >
        {formatMs(geometry.ceiling)}
      </text>
      <text
        x={PAD_L - 6}
        y={PAD_T + PLOT_H + 3}
        textAnchor="end"
        fontFamily={monoFontFamily}
        fontSize={9}
        fill={palette.inkFaint}
      >
        0
      </text>

      {geometry.runs.map((run) => {
        const d = run
          .map((index, position) => {
            const value = points[index].medianMs as number;
            return `${position === 0 ? 'M' : 'L'}${geometry.x(index).toFixed(2)} ${geometry.y(value).toFixed(2)}`;
          })
          .join(' ');
        return run.length > 1 ? (
          <path
            key={`run-${run[0]}`}
            d={d}
            fill="none"
            stroke={palette.brandDeep}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          // A lone day has no segment to draw. Without the dot it would read as
          // a day with no reviews, which is the one thing this chart must not say.
          <circle
            key={`run-${run[0]}`}
            cx={geometry.x(run[0])}
            cy={geometry.y(points[run[0]].medianMs as number)}
            r={2}
            fill={palette.brandDeep}
          />
        );
      })}

      <text
        x={PAD_L}
        y={H - 5}
        textAnchor="start"
        fontFamily={monoFontFamily}
        fontSize={9}
        fill={palette.inkFaint}
      >
        {shortDate(first.ts)}
      </text>
      <text
        x={PAD_L + PLOT_W}
        y={H - 5}
        textAnchor="end"
        fontFamily={monoFontFamily}
        fontSize={9}
        fill={palette.inkFaint}
      >
        {shortDate(last.ts)}
      </text>
    </Box>
  );
}
