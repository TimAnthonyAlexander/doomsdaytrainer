import { useMemo } from 'react';
import type { DrillRecord } from '@/domain/types';
import { LatencyChart } from '@/features/stats/LatencyChart';
import { drillLatencySeries } from './drillHistory';

interface DrillLatencyChartProps {
  records: readonly DrillRecord[];
  now: number;
  days?: number;
}

/** The drill median chart. Same drawing as Stats, different subject. */
export function DrillLatencyChart({ records, now, days = 30 }: DrillLatencyChartProps) {
  const points = useMemo(() => drillLatencySeries(records, now, days), [records, now, days]);

  return (
    <LatencyChart
      points={points}
      label={(count, withData) =>
        `Median drill latency per day for the last ${count} days, ${withData} of them with a drill.`
      }
      emptyText="Not enough data yet. This fills in once you have run drills on two separate days."
    />
  );
}
