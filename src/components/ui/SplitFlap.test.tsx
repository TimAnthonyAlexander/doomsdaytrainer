import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLIP_MS, SplitFlap, SplitFlapText, useFlipSettled } from './SplitFlap';
import { duration } from '@/theme/tokens';

/** Matches the shape `src/test/setup.ts` installs for every test by default. */
function stubReducedMotion(matches: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  // Every other test in this file, and every test after it, wants the
  // default: reduced motion off.
  stubReducedMotion(false);
});

describe('SplitFlap', () => {
  it('renders a single glyph with no flap layers on first render', () => {
    const { container } = render(<SplitFlap value="5" size={24} mono />);
    // getByText throws on more than one match, so this is also the assertion
    // that nothing duplicated the glyph.
    expect(screen.getByText('5')).toBeInTheDocument();
    const clipped = Array.from(container.querySelectorAll('*')).some((el) => {
      const style = getComputedStyle(el).clipPath;
      return style !== '' && style !== 'none';
    });
    expect(clipped).toBe(false);
  });

  it('shows the new value once a change lands', () => {
    const view = render(<SplitFlap value="5" size={24} mono />);
    view.rerender(<SplitFlap value="6" size={24} mono />);
    // getAllByText rather than getByText: mid-flip the old glyph is
    // legitimately on screen too, in its own layer.
    expect(screen.getAllByText('6').length).toBeGreaterThan(0);
  });

  it('drops back to a single glyph once the flip settles', () => {
    vi.useFakeTimers();
    const view = render(<SplitFlap value="5" size={24} mono />);
    view.rerender(<SplitFlap value="6" size={24} mono />);

    act(() => {
      vi.advanceTimersByTime(FLIP_MS);
    });

    expect(screen.getByText('6')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('renders the plain glyph with no flap structure under reduced motion', () => {
    stubReducedMotion(true);
    const view = render(<SplitFlap value="5" size={24} mono />);
    expect(screen.getByText('5')).toBeInTheDocument();

    // A zeroed keyframe still runs — this has to be a structural absence, not
    // just a fast one, or the static layers land on the correct glyph for
    // 0.01ms rather than showing the old one at all.
    view.rerender(<SplitFlap value="6" size={24} mono />);
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.queryByText('5')).toBeNull();
  });

  it('keeps the accessible name off the flap itself', () => {
    const { container } = render(<SplitFlap value="5" size={24} mono />);
    const wrapper = container.firstElementChild;
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveAttribute('aria-hidden');
  });
});

describe('SplitFlapText', () => {
  it('renders each character once, with no flap layers, on first render', () => {
    render(<SplitFlapText text="1987" size={24} mono />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders a space as a plain gap rather than a cell', () => {
    const { container } = render(<SplitFlapText text="1 2" size={24} mono />);
    // Two digit cells only — the space contributes no glyph of its own.
    expect(container.querySelectorAll('[aria-hidden]').length).toBe(2);
  });

  it('animates only the character that actually changed', () => {
    const view = render(<SplitFlapText text="1987" size={24} mono />);
    view.rerender(<SplitFlapText text="1988" size={24} mono />);

    // '1' and '9' appear nowhere else in either string, so each staying at a
    // single match proves those two cells never entered a transition.
    expect(screen.getAllByText('1')).toHaveLength(1);
    expect(screen.getAllByText('9')).toHaveLength(1);
    // '7' only ever appears as the old glyph of the one cell that changed, in
    // its two old-glyph layers (the static bottom half and the top half
    // folding away) — two live copies rather than the many a whole second
    // cell restarting from scratch would produce.
    expect(screen.getAllByText('7')).toHaveLength(2);
  });
});

describe('useFlipSettled', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is true on mount', () => {
    const { result } = renderHook(() => useFlipSettled('a'));
    expect(result.current).toBe(true);
  });

  it('goes false the render a key changes, and true again after FLIP_MS', () => {
    const { result, rerender } = renderHook(({ key }: { key: string }) => useFlipSettled(key), {
      initialProps: { key: 'a' },
    });
    expect(result.current).toBe(true);

    rerender({ key: 'b' });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(FLIP_MS);
    });
    expect(result.current).toBe(true);
  });

  it('is always true under reduced motion, even mid-transition', () => {
    stubReducedMotion(true);
    const { result, rerender } = renderHook(({ key }: { key: string }) => useFlipSettled(key), {
      initialProps: { key: 'a' },
    });
    rerender({ key: 'b' });
    expect(result.current).toBe(true);
  });
});

/**
 * `FLIP_MS` is the one number in the app duplicated out of the motion tokens,
 * because a JS timer cannot read a CSS custom property and this clock has to
 * agree with the keyframe's own duration. Duplicated and unguarded, the two
 * would drift the first time §7 changed: the keyframe would follow the token
 * and the arming window would not, so a pad would go live partway through its
 * own flip and start timing a prompt that was still resolving.
 */
it('keeps the arming window and the flip token in step', () => {
  expect(FLIP_MS).toBe(duration.flip);
});

/**
 * The flip is drawn in two halves, so its own duration is what each half
 * actually gets, and that is what decides whether the arc reads as motion or
 * as a handful of positions. At 60Hz a half needs to be worth about ten
 * frames; `advance`, which this was first tied to, is 120ms and gives it
 * under four.
 */
it('gives each half of the flip enough frames to read as motion', () => {
  const halfMs = duration.flip / 2;
  const framesPerHalf = halfMs / (1000 / 60);
  expect(framesPerHalf).toBeGreaterThanOrEqual(9);
});
