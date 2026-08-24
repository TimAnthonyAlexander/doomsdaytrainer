import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NUMERIC_MS,
  NUMERIC_SETTLE_MS,
  NumericText,
  NumericValue,
  useNumericSettled,
} from './NumericText';
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
  // Every other test in this file, and every test after it, wants the default:
  // reduced motion off.
  stubReducedMotion(false);
});

describe('NumericValue', () => {
  it('renders one glyph and nothing else on first render', () => {
    render(<NumericValue value="5" size={24} mono />);
    // getByText throws on more than one match, so this is also the assertion
    // that nothing rendered a second copy to transition from.
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('holds both glyphs while the value is changing', () => {
    const view = render(<NumericValue value="5" size={24} mono />);
    view.rerender(<NumericValue value="6" size={24} mono />);

    // Mid-transition both are legitimately on screen at partial opacity: the
    // old one leaving, the new one arriving. That is the effect, not a leak.
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('drops back to a single glyph once the transition is over', () => {
    vi.useFakeTimers();
    const view = render(<NumericValue value="5" size={24} mono />);
    view.rerender(<NumericValue value="6" size={24} mono />);

    act(() => {
      vi.advanceTimersByTime(NUMERIC_MS);
    });

    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.queryByText('5')).toBeNull();
    vi.useRealTimers();
  });

  it('does not re-trigger when handed the value it already shows', () => {
    const view = render(<NumericValue value="5" size={24} mono />);
    view.rerender(<NumericValue value="5" size={24} mono />);
    // A second copy would mean it had started transitioning from itself.
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  /**
   * A zeroed keyframe still runs, so reduced motion has to remove the
   * structure rather than only the duration — otherwise the outgoing glyph is
   * still mounted, just for 0.01ms.
   */
  it('renders one static glyph under reduced motion', () => {
    stubReducedMotion(true);
    const view = render(<NumericValue value="5" size={24} mono />);
    view.rerender(<NumericValue value="6" size={24} mono />);

    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.queryByText('5')).toBeNull();
  });

  it('keeps the accessible name off the cell itself', () => {
    const { container } = render(<NumericValue value="5" size={24} mono />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden');
  });
});

describe('NumericText', () => {
  it('renders each character once on first render', () => {
    render(<NumericText text="1987" size={24} mono />);
    for (const char of ['1', '9', '8', '7']) {
      expect(screen.getByText(char)).toBeInTheDocument();
    }
  });

  it('renders a space as a plain gap rather than a cell', () => {
    const { container } = render(<NumericText text="1 2" size={24} mono />);
    // Two cells only — the space contributes no glyph of its own.
    expect(container.querySelectorAll('[aria-hidden]').length).toBe(2);
  });

  it('moves only the character that actually changed', () => {
    const view = render(<NumericText text="1987" size={24} mono />);
    view.rerender(<NumericText text="1988" size={24} mono />);

    // '1' and '9' appear nowhere else in either string, so each staying at a
    // single match proves those cells never entered a transition. '7' is the
    // outgoing glyph of the one cell that did, so it is still on screen.
    expect(screen.getAllByText('1')).toHaveLength(1);
    expect(screen.getAllByText('9')).toHaveLength(1);
    expect(screen.getAllByText('7')).toHaveLength(1);
    expect(screen.getAllByText('8')).toHaveLength(2);
  });
});

describe('useNumericSettled', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is true on mount', () => {
    const { result } = renderHook(() => useNumericSettled('a'));
    expect(result.current).toBe(true);
  });

  it('goes false the render a key changes, and true again after the settle', () => {
    const { result, rerender } = renderHook(({ key }: { key: string }) => useNumericSettled(key), {
      initialProps: { key: 'a' },
    });
    expect(result.current).toBe(true);

    rerender({ key: 'b' });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(NUMERIC_SETTLE_MS);
    });
    expect(result.current).toBe(true);
  });

  it('is always true under reduced motion, even mid-transition', () => {
    stubReducedMotion(true);
    const { result, rerender } = renderHook(({ key }: { key: string }) => useNumericSettled(key), {
      initialProps: { key: 'a' },
    });
    rerender({ key: 'b' });
    expect(result.current).toBe(true);
  });
});

/**
 * Both constants are duplicated out of the motion tokens, because a JS timer
 * cannot read a CSS custom property. Unguarded, they drift the first time §7
 * changes: the keyframe follows the token, the arming window does not, and a
 * pad goes live against a prompt that is still resolving.
 */
describe('the constants and the tokens', () => {
  it('keeps the transition length in step', () => {
    expect(NUMERIC_MS).toBe(duration.numeric);
  });

  it('keeps the arming window in step', () => {
    expect(NUMERIC_SETTLE_MS).toBe(duration.numericSettle);
  });

  /**
   * The pad waits on the settle, not on the whole transition. If those were
   * ever made equal, every answer would be charged the full animation, and the
   * outgoing glyph finishing its exit says nothing about what the prompt asks.
   */
  it('arms before the motion finishes', () => {
    expect(NUMERIC_SETTLE_MS).toBeLessThan(NUMERIC_MS);
  });
});
