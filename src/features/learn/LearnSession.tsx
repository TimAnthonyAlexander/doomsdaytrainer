import { useState } from 'react';
import { useAppState } from '@/state/useAppState';
import { BlockDone } from './BlockDone';
import { RecallPass } from './RecallPass';
import { RecognitionPass } from './RecognitionPass';
import { decadeYears, newlyIntroducedCount, nextBlock, type DailyAllowance, type DecadeBlock } from './blocks';

interface LearnSessionProps {
  decade: number;
  blocks: DecadeBlock[];
  allowance: DailyAllowance;
  onStart: (decade: number) => void;
  onExit: () => void;
}

type Phase =
  | { kind: 'recognition' }
  | { kind: 'recall' }
  | { kind: 'done'; wrongTaps: number; introduced: number };

/**
 * One block, start to finish: recognition, then recall, then the result.
 *
 * Position inside the block lives here and nowhere else. Leaving mid-block
 * writes nothing, so coming back simply starts the block again — a half-taught
 * decade is not a thing worth persisting.
 */
export function LearnSession({ decade, blocks, allowance, onStart, onExit }: LearnSessionProps) {
  const { items, introduceItems, noteSessionActivity } = useAppState();
  const [phase, setPhase] = useState<Phase>({ kind: 'recognition' });

  const years = decadeYears(decade);

  const finish = async (wrongTaps: number) => {
    const introduced = newlyIntroducedCount(years, items);
    setPhase({ kind: 'done', wrongTaps, introduced });
    await introduceItems(years);
    if (introduced > 0) await noteSessionActivity('new', introduced);
  };

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
