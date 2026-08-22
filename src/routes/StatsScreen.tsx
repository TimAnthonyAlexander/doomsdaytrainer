import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Numeral } from '@/components/ui/Numeral';
import { PageTitle } from '@/components/ui/PageTitle';
import { Screen } from '@/components/ui/Screen';
import { Stat } from '@/components/ui/Stat';
import { spokenShare } from '@/domain/diagnostics';
import { inScope, resolveScope } from '@/domain/scope';
import { formatMs } from '@/domain/time';
import type { YearKey } from '@/domain/types';
import { formatYear } from '@/domain/yearCodes';
import { DecadeLatency } from '@/features/stats/DecadeLatency';
import { ItemDetail } from '@/features/stats/ItemDetail';
import { LatencyChart } from '@/features/stats/LatencyChart';
import { MasteryGrid } from '@/features/stats/MasteryGrid';
import { RouteReport } from '@/features/stats/RouteReport';
import { troubleItems } from '@/features/trouble/troublePool';
import {
  accuracyOverLast,
  dailyLatencySeries,
  dueCounts,
  medianLatencyByDecade,
  medianReviewLatency,
  reviewStreak,
} from '@/features/stats/statsSelectors';
import { useAppState } from '@/state/useAppState';

const ACCURACY_WINDOW = 100;
const CHART_DAYS = 30;

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography variant="h3" component="h2">
          {title}
        </Typography>
        {note ? (
          <Typography variant="caption" component="div" color="text.secondary" sx={{ mt: 0.5 }}>
            {note}
          </Typography>
        ) : null}
      </Box>
      {children}
    </Box>
  );
}

export function StatsScreen() {
  const { data, settings, itemList } = useAppState();
  const [selected, setSelected] = useState<YearKey | null>(null);

  // Frozen for the life of the screen so due counts and the chart's last day
  // cannot drift apart between two renders of the same page.
  const now = useMemo(() => Date.now(), []);

  const scope = useMemo(() => resolveScope(settings), [settings]);
  const overall = useMemo(() => medianReviewLatency(itemList), [itemList]);
  const decades = useMemo(() => medianLatencyByDecade(itemList), [itemList]);
  const accuracy = useMemo(() => accuracyOverLast(itemList, ACCURACY_WINDOW), [itemList]);
  const due = useMemo(() => dueCounts(itemList, scope, now), [itemList, scope, now]);
  const streak = useMemo(() => reviewStreak(data.days, now), [data.days, now]);
  const series = useMemo(() => dailyLatencySeries(itemList, now, CHART_DAYS), [itemList, now]);
  // The same pool the trouble drill queues. The grid marks a leech with a
  // leech foot; this is what the user can do about one.
  const trouble = useMemo(() => troubleItems(itemList, scope), [itemList, scope]);
  // Spoken review prompts put listening time inside the latency. The attempts
  // are graded and scheduled like any other, so the honest thing is not to hide
  // them but to say how many of these numbers contain a clip.
  const spoken = useMemo(() => spokenShare(itemList), [itemList]);

  const selectedItem = useMemo(
    () => (selected === null ? null : (itemList.find((item) => item.yy === selected) ?? null)),
    [itemList, selected],
  );

  const close = useCallback(() => setSelected(null), []);

  const scopeNote =
    scope.id === 'full'
      ? 'All 100 year codes.'
      : `${scope.label} scope, ${formatYear(scope.from)} to ${formatYear(scope.to)}. Years outside it are drawn empty.`;

  const accuracyLabel =
    accuracy.total === 0
      ? 'Accuracy, review attempts'
      : `Accuracy, last ${accuracy.total} review attempt${accuracy.total === 1 ? '' : 's'}`;

  return (
    <Screen gap={5} maxWidth={640}>
      <PageTitle subtitle={scopeNote}>Stats</PageTitle>

      <MasteryGrid items={itemList} scope={scope} selected={selected} onSelect={setSelected} />

      {trouble.length > 0 ? (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {/* Not "flagged codes": the grid keeps the leech foot on every
                code that ever lapsed six times, while the drill drops the ones
                whose interval has recovered. Counting flags here would promise
                a longer drill than the user gets. */}
            {`${trouble.length} ${trouble.length === 1 ? 'code is' : 'codes are'} waiting in the trouble drill. It asks them worst first, with the block on screen.`}
          </Typography>
          <Button component={RouterLink} to="/year-codes/trouble" variant="outlined" color="inherit">
            Trouble spots
          </Button>
        </Box>
      ) : null}

      <Section title="Latency by decade" note="Median of review attempts. Drill times are on Revise.">
        <Stat
          label="Overall median"
          size="lg"
          value={overall === null ? '—' : formatMs(overall)}
        />
        {spoken.spoken > 0 ? (
          <Typography variant="body2" color="text.secondary">
            <Numeral color="inherit">{spoken.spoken}</Numeral>
            {' of the last '}
            <Numeral color="inherit">{spoken.total}</Numeral>
            {
              ' review answers had the year spoken, which puts the length of the clip inside every one of them.'
            }
          </Typography>
        ) : null}
        <DecadeLatency rows={decades} />
      </Section>

      <Section
        title="Recall or working it out"
        note="Speed alone cannot tell these apart — a well-practised procedure can beat recall on the clock. What separates them is whether the time tracks the work, so each figure below is a slope over your own review answers."
      >
        <RouteReport items={itemList} />
      </Section>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' },
          columnGap: 2,
          rowGap: 3,
        }}
      >
        <Stat
          label={accuracyLabel}
          value={accuracy.ratio === null ? '—' : `${Math.round(accuracy.ratio * 100)}%`}
        />
        <Stat label="Streak, days" value={streak} />
        <Stat label="Due today" value={due.today} />
        <Stat label="Due this week" value={due.week} />
      </Box>

      <Section
        title="Last 30 days"
        note="Median review latency per day. Days without reviews are left blank."
      >
        <LatencyChart
          points={series}
          label={(count, withData) =>
            `Median review latency per day for the last ${count} days, ${withData} of them with reviews.`
          }
          emptyText="Not enough data yet. This fills in once you have reviewed on two separate days."
        />
      </Section>

      <ItemDetail
        item={selectedItem}
        outOfScope={selectedItem !== null && !inScope(selectedItem.yy, scope)}
        now={now}
        onClose={close}
      />
    </Screen>
  );
}
