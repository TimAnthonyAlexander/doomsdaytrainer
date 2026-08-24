import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { YearPartReveal } from './YearPartReveal';

/**
 * The reveal's own motion, isolated from the trainer that mounts it.
 * `methodPartFlow.test.tsx` already pins the three verdicts' colours and
 * sentence; this only checks the one thing added on top of that: the anchor
 * and the operator arrive a beat late, and only on the one verdict where the
 * omission is the point.
 */

function anchor(): HTMLElement {
  return screen.getByTestId('year-part-anchor');
}

describe('YearPartReveal motion', () => {
  it('delays the anchor only on the century-forgotten verdict', () => {
    const { rerender, unmount } = render(
      <YearPartReveal centuryAnchor={2} yearCode={0} verdict="century-forgotten" />,
    );
    expect(getComputedStyle(anchor()).transitionDelay).toBe('var(--dur-advance)');

    rerender(<YearPartReveal centuryAnchor={2} yearCode={5} verdict="correct" />);
    expect(getComputedStyle(anchor()).transitionDelay).not.toBe('var(--dur-advance)');

    rerender(<YearPartReveal centuryAnchor={2} yearCode={5} verdict="wrong" />);
    expect(getComputedStyle(anchor()).transitionDelay).not.toBe('var(--dur-advance)');

    unmount();
  });

  it('leaves both figures readable once mounted, on every verdict', () => {
    for (const verdict of ['correct', 'century-forgotten', 'wrong'] as const) {
      const { unmount } = render(
        <YearPartReveal centuryAnchor={2} yearCode={0} verdict={verdict} />,
      );
      // Nothing here is asserting the mid-flight frame — jsdom flushes the
      // mount effect before `render` returns, and an unset `opacity` reads as
      // '' rather than '1' — only that the delay never strands the anchor at
      // opacity 0.
      expect(getComputedStyle(anchor()).opacity).not.toBe('0');
      expect(screen.getByTestId('year-part-code')).toHaveTextContent('0');
      unmount();
    }
  });
});
