import { BATCH_COUNT } from './blocks';

/**
 * The order of the steps in one learn block, with no React in it.
 *
 * It is here rather than inline in `LearnSession` for one reason: where the
 * structure lesson sits is a claim about how the table gets learned, and a
 * claim like that should be assertable without walking sixty taps through a
 * rendered block.
 *
 * The block is:
 *
 *   batch 1 taught  →  batch 1 recalled
 *   batch 2 taught  →  batch 2 recalled
 *   batch 3 taught  →  batch 3 recalled
 *   all ten, mixed, with years from other decades mixed in
 *   the +1/+2 structure, once ever
 *   keep going, which does not end
 *
 * `keep-going` is the one phase the user leaves rather than finishes. The block
 * is complete before it starts — every year is introduced and written — so it
 * introduces nothing and stopping it costs nothing. It exists because the
 * criterion that ends a block is the right place to stop *teaching* and the
 * wrong place to stop *practising*.
 *
 * Structure comes last of the taught phases, and only the first time. Put first, it is the route the
 * ten get produced by and every later question is answered by climbing it. Put
 * after, the only thing it can be is an explanation of a table the user already
 * has. It is a way to check an answer, never a way to find one, and where it
 * sits in the block is most of what decides which of those it becomes.
 */

export type LearnPhase =
  | { kind: 'batch-study'; batch: number }
  | { kind: 'batch-recall'; batch: number }
  | { kind: 'all-ten' }
  | { kind: 'structure' }
  | { kind: 'keep-going' }
  | { kind: 'done' };

export interface FlowOptions {
  /** How many batches the decade is introduced in. */
  batches?: number;
  /** True once the structure lesson has been shown, ever. */
  structureSeen: boolean;
}

export function firstPhase(): LearnPhase {
  return { kind: 'batch-study', batch: 0 };
}

export function nextPhase(phase: LearnPhase, options: FlowOptions): LearnPhase {
  const batches = options.batches ?? BATCH_COUNT;

  switch (phase.kind) {
    case 'batch-study':
      return { kind: 'batch-recall', batch: phase.batch };
    case 'batch-recall':
      return phase.batch + 1 < batches
        ? { kind: 'batch-study', batch: phase.batch + 1 }
        : { kind: 'all-ten' };
    case 'all-ten':
      return options.structureSeen ? { kind: 'keep-going' } : { kind: 'structure' };
    case 'structure':
      return { kind: 'keep-going' };
    default:
      return { kind: 'done' };
  }
}

/** Every phase of one block, in order, ending on `done`. */
export function phaseSequence(options: FlowOptions): LearnPhase[] {
  const out: LearnPhase[] = [firstPhase()];
  // Two phases per batch, plus the mixed pass, plus at most the lesson and the
  // terminator. The bound only exists so a future edit cannot loop forever.
  const limit = (options.batches ?? BATCH_COUNT) * 2 + 4;
  while (out[out.length - 1].kind !== 'done' && out.length < limit) {
    out.push(nextPhase(out[out.length - 1], options));
  }
  return out;
}
