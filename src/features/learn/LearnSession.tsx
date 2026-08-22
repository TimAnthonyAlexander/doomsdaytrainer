import { useMemo, useState } from 'react';
import { inScope, resolveScope } from '@/domain/scope';
import { useAppState } from '@/state/useAppState';
import { BlockDone } from './BlockDone';
import { KeepGoing } from './KeepGoing';
import { RecallPass } from './RecallPass';
import { StructureCheck } from './StructureCheck';
import { StudyPass } from './StudyPass';
import {
  decadeYears,
  introBatches,
  mixInYears,
  newlyIntroducedCount,
  nextBlock,
  type DailyAllowance,
  type DecadeBlock,
} from './blocks';
import { firstPhase, nextPhase, phaseKey, type LearnPhase } from './flow';

interface LearnSessionProps {
  decade: number;
  blocks: DecadeBlock[];
  allowance: DailyAllowance;
  onStart: (decade: number) => void;
  onExit: () => void;
}

/**
 * One block, start to finish. The order of the steps is `flow.ts`; this file
 * renders them and carries the tally.
 *
 * The decade is introduced in three batches of three or four, and a batch is
 * never a run of consecutive years. That is the correction the previous pass at
 * this problem missed: it fixed the order the codes were *asked* in and left
 * the order they were *taught* in untouched, so the app was still handing over
 * the string 00, 01, 02 with a `+1` drawn between each pair and then shuffling
 * the questions. Shuffled questions over a memorised run are answered by
 * walking the run.
 *
 * Inside a batch, `StudyPass` shows one pair and immediately asks for that same
 * pair. Then `RecallPass` takes the batch in varied order, twice clean each.
 * Then the whole ten, varied, with years from other decades mixed in. The
 * structure lesson comes after all of that and only once, ever.
 *
 * Position inside the block lives here and nowhere else. Leaving mid-block
 * writes nothing, so coming back simply starts the block again.
 *
 * Every phase is keyed by `phaseKey`, and that is not decoration: two phases in
 * a row can be the same component, and React keeps a component's state when it
 * reconciles the same type at the same position. See `flow.ts`.
 */
export function LearnSession({ decade, blocks, allowance, onStart, onExit }: LearnSessionProps) {
  const { items, itemList, settings, introduceItems, noteSessionActivity, updateSettings } =
    useAppState();
  const [phase, setPhase] = useState<LearnPhase>(firstPhase);
  const [wrongTaps, setWrongTaps] = useState(0);
  const [introduced, setIntroduced] = useState(0);

  const years = decadeYears(decade);
  const batches = useMemo(() => introBatches(decade), [decade]);
  const scope = useMemo(() => resolveScope(settings), [settings]);
  // Frozen for the life of the block: recomputing it as answers land would swap
  // the spacers out mid-pass.
  const [mixIn] = useState(() => mixInYears(years, items, scope));
  // Two runs of the same block should not be the same rotation, and the domain
  // layer takes its randomness from the caller.
  const [seed] = useState(() => Date.now() % 100_000);
  // Frozen too. Marking the lesson seen at the end of this block must not make
  // the block it is inside behave as though it had already happened.
  const [structureSeen] = useState(() => settings.structureLessonSeen);

  /** The ten are learned. Everything after this point is explanation. */
  const commitBlock = async () => {
    const count = newlyIntroducedCount(years, items);
    setIntroduced(count);
    await introduceItems(years);
    if (count > 0) await noteSessionActivity('new', count);
  };

  const advance = (wrong: number) => {
    setWrongTaps((total) => total + wrong);
    if (phase.kind === 'all-ten') void commitBlock();
    if (phase.kind === 'structure') void updateSettings({ structureLessonSeen: true });
    setPhase(nextPhase(phase, { batches: batches.length, structureSeen }));
  };

  if (phase.kind === 'batch-study') {
    return (
      <StudyPass
        key={phaseKey(phase)}
        decade={decade}
        years={batches[phase.batch]}
        stepLabel={`Batch ${phase.batch + 1} of ${batches.length}`}
        onDone={advance}
        onExit={onExit}
      />
    );
  }

  if (phase.kind === 'batch-recall') {
    return (
      <RecallPass
        key={phaseKey(phase)}
        decade={decade}
        years={batches[phase.batch]}
        seed={seed + phase.batch}
        // Every pair in the batch was produced once, on its own ask, moments
        // ago. Battig's switch point is per pair, so this pass opens varied.
        alreadyProduced
        stepLabel={`Batch ${phase.batch + 1} of ${batches.length} · recall`}
        onDone={advance}
        onExit={onExit}
      />
    );
  }

  if (phase.kind === 'all-ten') {
    return (
      <RecallPass
        key={phaseKey(phase)}
        decade={decade}
        mixIn={mixIn}
        seed={seed}
        alreadyProduced
        stepLabel="All ten, mixed"
        onDone={advance}
        onExit={onExit}
      />
    );
  }

  if (phase.kind === 'structure') {
    return <StructureCheck key={phaseKey(phase)} decade={decade} onDone={() => advance(0)} />;
  }

  if (phase.kind === 'keep-going') {
    // Everything introduced and in scope, which by now includes this block's
    // ten. It widens as blocks are finished, so the pass gets better the more
    // of the table the user has, and it never introduces anything: `advance`
    // has already written the block and charged the daily cap.
    const pool = itemList
      .filter((item) => item.introduced && inScope(item.yy, scope))
      .map((item) => item.yy);
    return (
      <KeepGoing
        key={phaseKey(phase)}
        decade={decade}
        pool={pool.length > 0 ? pool : years}
        seed={seed}
        onStop={advance}
      />
    );
  }

  return (
    <BlockDone
      key={phaseKey(phase)}
      decade={decade}
      introduced={introduced}
      wrongTaps={wrongTaps}
      next={nextBlock(blocks)}
      allowance={allowance}
      onStart={onStart}
      onExit={onExit}
    />
  );
}
