import { describe, expect, it } from 'vitest';
import { BATCH_COUNT } from './blocks';
import { firstPhase, nextPhase, phaseKey, phaseSequence, type LearnPhase } from './flow';

const kinds = (phases: LearnPhase[]) => phases.map((phase) => phase.kind);

describe('the shape of a block', () => {
  it('teaches a batch, recalls it, and only then moves to the next', () => {
    expect(kinds(phaseSequence({ structureSeen: true }))).toEqual([
      'batch-study',
      'batch-recall',
      'batch-study',
      'batch-recall',
      'batch-study',
      'batch-recall',
      'all-ten',
      'keep-going',
      'done',
    ]);
  });

  it('walks the batches in order and each exactly once', () => {
    const batches = phaseSequence({ structureSeen: true })
      .filter((phase) => phase.kind === 'batch-study')
      .map((phase) => (phase.kind === 'batch-study' ? phase.batch : -1));
    expect(batches).toEqual([0, 1, 2]);
    expect(batches.length).toBe(BATCH_COUNT);
  });

  it('opens on the first batch, never on the structure lesson', () => {
    expect(firstPhase()).toEqual({ kind: 'batch-study', batch: 0 });
  });
});

describe('the structure lesson', () => {
  it('appears exactly once in a block, and only when it has never been shown', () => {
    const fresh = kinds(phaseSequence({ structureSeen: false }));
    expect(fresh.filter((kind) => kind === 'structure')).toHaveLength(1);

    const seen = kinds(phaseSequence({ structureSeen: true }));
    expect(seen).not.toContain('structure');
  });

  it('is not on the path through the ten', () => {
    // The +1/+2 relation is a way to check an answer, and a ruinous way to
    // produce one: shown before the pairs it becomes the route, and a route
    // that starts at the first year of a decade can only be entered there.
    // Everything that asks for a code has to be finished before it appears.
    const phases = kinds(phaseSequence({ structureSeen: false }));
    const at = phases.indexOf('structure');
    expect(at).toBeGreaterThan(-1);
    expect(phases.slice(0, at)).toContain('all-ten');
    // Only the endless pass follows it, and that one asks for codes the user
    // already has rather than teaching any.
    expect(phases.slice(at + 1)).toEqual(['keep-going', 'done']);
  });

  it('leads to the endless pass and to nothing else', () => {
    expect(nextPhase({ kind: 'structure' }, { structureSeen: false })).toEqual({
      kind: 'keep-going',
    });
  });

  it('cannot repeat once the flag is set', () => {
    // The session freezes the flag at mount, so writing it at the end of this
    // block cannot change this block. The next block reads it as seen.
    expect(nextPhase({ kind: 'all-ten' }, { structureSeen: true })).toEqual({ kind: 'keep-going' });
    expect(nextPhase({ kind: 'all-ten' }, { structureSeen: false })).toEqual({ kind: 'structure' });
  });
});

describe('termination', () => {
  it('ends on done and stays there', () => {
    expect(nextPhase({ kind: 'done' }, { structureSeen: false })).toEqual({ kind: 'done' });
  });

  it('handles a single batch without skipping the mixed pass', () => {
    expect(kinds(phaseSequence({ batches: 1, structureSeen: true }))).toEqual([
      'batch-study',
      'batch-recall',
      'all-ten',
      'keep-going',
      'done',
    ]);
  });
});

describe('the endless pass', () => {
  it('is the last phase before the block is over, however the block ran', () => {
    for (const structureSeen of [true, false]) {
      const phases = kinds(phaseSequence({ structureSeen }));
      expect(phases.slice(-2)).toEqual(['keep-going', 'done']);
    }
  });

  it('comes after every phase that introduces anything', () => {
    // It must not be reachable before the block is written, or it would be
    // asking for codes the user has not been shown.
    const phases = kinds(phaseSequence({ structureSeen: false }));
    const at = phases.indexOf('keep-going');
    for (const taught of ['batch-study', 'batch-recall', 'all-ten']) {
      expect(phases.slice(0, at)).toContain(taught);
      expect(phases.slice(at + 1)).not.toContain(taught);
    }
  });

  it('is left rather than finished, so nothing follows it on its own', () => {
    // The sequence terminates for the test's sake; in the session the phase
    // only advances when the user stops it.
    expect(nextPhase({ kind: 'keep-going' }, { structureSeen: true })).toEqual({ kind: 'done' });
  });
});

describe('one key per phase', () => {
  // Every phase is a screen, and two of them in a row can be the same
  // component: the last batch's recall and the mixed pass over the ten are both
  // a `RecallPass`. React reconciles the same component type at the same
  // position by keeping its state, so without a key the mixed pass inherited a
  // finished queue, a green feedback flash and a disabled pad — the block died
  // on "6 of 6" and never wrote its ten.
  it('never repeats a key between one phase and the next', () => {
    for (const structureSeen of [true, false]) {
      const phases = phaseSequence({ structureSeen });
      for (let at = 1; at < phases.length; at += 1) {
        expect(phaseKey(phases[at]), `${phases[at - 1].kind} then ${phases[at].kind}`).not.toBe(
          phaseKey(phases[at - 1]),
        );
      }
    }
  });

  it('gives every phase of a block its own key', () => {
    for (const structureSeen of [true, false]) {
      const keys = phaseSequence({ structureSeen }).map(phaseKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('separates the batches from each other', () => {
    // The batch number is the only thing that differs between them, so a key
    // that dropped it would let batch 2 open on batch 1's leftover state.
    expect(phaseKey({ kind: 'batch-recall', batch: 0 })).not.toBe(
      phaseKey({ kind: 'batch-recall', batch: 1 }),
    );
    expect(phaseKey({ kind: 'batch-study', batch: 0 })).not.toBe(
      phaseKey({ kind: 'batch-recall', batch: 0 }),
    );
  });
});
