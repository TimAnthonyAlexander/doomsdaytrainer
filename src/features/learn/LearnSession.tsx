import { useMemo, useState } from 'react';
import { resolveScope } from '@/domain/scope';
import { useAppState } from '@/state/useAppState';
import { BlockDone } from './BlockDone';
import { RecallPass } from './RecallPass';
import { RecognitionPass } from './RecognitionPass';
import {
  decadeYears,
  learnGroups,
  mixInYears,
  newlyIntroducedCount,
  nextBlock,
  type DailyAllowance,
  type DecadeBlock,
} from './blocks';

interface LearnSessionProps {
  decade: number;
  blocks: DecadeBlock[];
  allowance: DailyAllowance;
  onStart: (decade: number) => void;
  onExit: () => void;
}

type Phase =
  | { kind: 'group-show'; group: number }
  | { kind: 'group-recall'; group: number }
  | { kind: 'recognition' }
  | { kind: 'recall' }
  | { kind: 'done'; wrongTaps: number; introduced: number };

/**
 * One block, start to finish.
 *
 * The decade is taught in groups before it is ever asked for whole: show a
 * group, recall that group, next group. Ten unfamiliar pairs at once is more
 * than working memory holds, and a user who cannot hold them guesses, which
 * teaches nothing. That much is unchanged, and the evidence backs it — pure
 * interleaving of arbitrary pairs from the start comes out behind blocking
 * (Hwang 2025), and blocked-then-varied comes out ahead of both.
 *
 * What changed is what "recall" means. Each pass now runs ascending only until
 * every year has been produced once, then switches to varied order, per
 * `recall.ts`. The final pass over all ten also mixes in years from other
 * decades, because ten years of one decade practised against each other can be
 * recited, however they are shuffled.
 *
 * Position inside the block lives here and nowhere else. Leaving mid-block
 * writes nothing, so coming back simply starts the block again — a half-taught
 * decade is not a thing worth persisting.
 */
export function LearnSession({ decade, blocks, allowance, onStart, onExit }: LearnSessionProps) {
  const { items, settings, introduceItems, noteSessionActivity } = useAppState();
  const [phase, setPhase] = useState<Phase>({ kind: 'group-show', group: 0 });
  const [groupWrongTaps, setGroupWrongTaps] = useState(0);

  const years = decadeYears(decade);
  const groups = learnGroups(decade);
  const scope = useMemo(() => resolveScope(settings), [settings]);
  // Frozen for the life of the block: recomputing it as answers land would swap
  // the spacers out mid-pass.
  const [mixIn] = useState(() => mixInYears(years, items, scope));
  // Two runs of the same block should not be the same rotation, and the domain
  // layer takes its randomness from the caller.
  const [seed] = useState(() => Date.now() % 100_000);

  const finish = async (wrongTaps: number) => {
    const introduced = newlyIntroducedCount(years, items);
    setPhase({ kind: 'done', wrongTaps: groupWrongTaps + wrongTaps, introduced });
    await introduceItems(years);
    if (introduced > 0) await noteSessionActivity('new', introduced);
  };

  if (phase.kind === 'group-show') {
    const group = phase.group;
    return (
      <RecognitionPass
        decade={decade}
        years={groups[group]}
        stepLabel={`Group ${group + 1} of ${groups.length}`}
        onDone={() => setPhase({ kind: 'group-recall', group })}
        onExit={onExit}
      />
    );
  }

  if (phase.kind === 'group-recall') {
    const group = phase.group;
    return (
      <RecallPass
        decade={decade}
        years={groups[group]}
        seed={seed + group}
        stepLabel={`Group ${group + 1} of ${groups.length} · recall`}
        onDone={(wrong) => {
          setGroupWrongTaps((total) => total + wrong);
          setPhase(
            group + 1 < groups.length
              ? { kind: 'group-show', group: group + 1 }
              : { kind: 'recognition' },
          );
        }}
        onExit={onExit}
      />
    );
  }

  if (phase.kind === 'recognition') {
    return (
      <RecognitionPass decade={decade} onDone={() => setPhase({ kind: 'recall' })} onExit={onExit} />
    );
  }

  if (phase.kind === 'recall') {
    return (
      <RecallPass
        decade={decade}
        mixIn={mixIn}
        seed={seed}
        // Every one of the ten was produced correctly in its group pass, so the
        // ordered ask is spent and this one opens mixed.
        alreadyProduced
        stepLabel="All ten, mixed"
        onDone={(wrong) => void finish(wrong)}
        onExit={onExit}
      />
    );
  }

  return (
    <BlockDone
      decade={decade}
      introduced={phase.introduced}
      wrongTaps={phase.wrongTaps}
      next={nextBlock(blocks)}
      allowance={allowance}
      onStart={onStart}
      onExit={onExit}
    />
  );
}
