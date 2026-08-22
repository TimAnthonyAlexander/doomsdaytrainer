import { useState } from 'react';
import { useAppState } from '@/state/useAppState';
import { BlockDone } from './BlockDone';
import { RecallPass } from './RecallPass';
import { RecognitionPass } from './RecognitionPass';
import {
  decadeYears,
  learnGroups,
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
 * group, recall that group flawlessly, next group. Ten unfamiliar pairs at once
 * is more than working memory holds, and a user who cannot hold them guesses,
 * which teaches nothing. Only after every group is clean does the block run the
 * full ten, twice.
 *
 * Position inside the block lives here and nowhere else. Leaving mid-block
 * writes nothing, so coming back simply starts the block again — a half-taught
 * decade is not a thing worth persisting.
 */
export function LearnSession({ decade, blocks, allowance, onStart, onExit }: LearnSessionProps) {
  const { items, introduceItems, noteSessionActivity } = useAppState();
  const [phase, setPhase] = useState<Phase>({ kind: 'group-show', group: 0 });
  const [groupWrongTaps, setGroupWrongTaps] = useState(0);

  const years = decadeYears(decade);
  const groups = learnGroups(decade);

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
    return <RecallPass decade={decade} onDone={(wrong) => void finish(wrong)} onExit={onExit} />;
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
