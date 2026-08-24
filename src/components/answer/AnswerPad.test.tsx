import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerPad, type AnswerFeedback, type AnswerOption } from './AnswerPad';

const OPTIONS: AnswerOption[] = Array.from({ length: 7 }, (_unused, value) => ({
  value,
  label: String(value),
}));

/** Lets the rAF the timer waits on run, so the latency clock starts. */
function paint(): void {
  act(() => {
    vi.advanceTimersByTime(32);
  });
}

function button(label: string): HTMLElement {
  return screen.getByRole('button', { name: label });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
      'Date',
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AnswerPad', () => {
  it('refuses anything other than seven options in dev', () => {
    const onAnswer = vi.fn();
    expect(() =>
      render(<AnswerPad options={OPTIONS.slice(0, 6)} onAnswer={onAnswer} promptKey="a" />),
    ).toThrow(/exactly 7 options/);
  });

  it('renders seven buttons and puts the seventh on its own row', () => {
    render(<AnswerPad options={OPTIONS} onAnswer={vi.fn()} promptKey="a" />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(7);
    expect(buttons.map((element) => element.textContent?.trim().charAt(0))).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
    expect(getComputedStyle(buttons[6]).gridColumn).toBe('2');
    expect(getComputedStyle(buttons[0]).gridColumn).toBe('');
  });

  it('reports the latency from paint to tap', () => {
    const onAnswer = vi.fn();
    render(<AnswerPad options={OPTIONS} onAnswer={onAnswer} promptKey="a" />);
    paint();

    act(() => {
      vi.advanceTimersByTime(750);
    });
    fireEvent.click(button('3'));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    const [value, latency] = onAnswer.mock.calls[0];
    expect(value).toBe(3);
    expect(latency).toBeGreaterThanOrEqual(750);
    expect(latency).toBeLessThan(800);
  });

  it('refuses a tap that lands before the prompt is painted', () => {
    const onAnswer = vi.fn();
    render(<AnswerPad options={OPTIONS} onAnswer={onAnswer} promptKey="a" />);

    // No paint yet. Nobody has seen this prompt, so nothing here is an answer
    // to it — scoring it would record 0ms and grade a double tap a 5.
    fireEvent.click(button('3'));
    fireEvent.keyDown(window, { key: '3', code: 'Digit3' });
    expect(onAnswer).not.toHaveBeenCalled();

    paint();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.click(button('3'));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer.mock.calls[0][1]).toBeGreaterThanOrEqual(600);
  });

  it('refuses a tap while the prompt is still arriving, and times from when it settles', () => {
    const onAnswer = vi.fn();
    const { rerender } = render(
      <AnswerPad options={OPTIONS} onAnswer={onAnswer} promptKey="a" armed={false} />,
    );

    // Painted, but not readable. A prompt that flips into place spends the
    // flip saying half of the old value, so paint is not the moment the user
    // could first see it. Scoring here would add the flip's duration to the
    // latency, which crosses the thresholds in Settings and quietly changes the
    // grade, the fluency decision and every median on Stats.
    paint();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.click(button('3'));
    fireEvent.keyDown(window, { key: '3', code: 'Digit3' });
    expect(onAnswer).not.toHaveBeenCalled();

    rerender(<AnswerPad options={OPTIONS} onAnswer={onAnswer} promptKey="a" armed />);
    paint();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.click(button('3'));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    // 400, not 900: the 500ms spent unreadable is not time the user had the
    // prompt in front of them, so it is not part of the answer.
    const [, latency] = onAnswer.mock.calls[0];
    expect(latency).toBeGreaterThanOrEqual(400);
    expect(latency).toBeLessThan(900);
  });

  it('never reports a zero latency, even across a prompt change', () => {
    const onAnswer = vi.fn();
    const view = render(<AnswerPad options={OPTIONS} onAnswer={onAnswer} promptKey="a" />);
    paint();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.click(button('1'));

    // The second tap of a double tap: the new prompt has committed but has not
    // been painted.
    view.rerender(<AnswerPad options={OPTIONS} onAnswer={onAnswer} promptKey="b" />);
    fireEvent.click(button('1'));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    for (const [, latency] of onAnswer.mock.calls) {
      expect(latency).toBeGreaterThan(0);
    }
  });

  it('answers once per prompt', () => {
    const onAnswer = vi.fn();
    render(<AnswerPad options={OPTIONS} onAnswer={onAnswer} promptKey="a" />);
    paint();

    fireEvent.click(button('3'));
    fireEvent.click(button('4'));

    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('restarts the clock and clears the pressed state when promptKey changes', () => {
    const onAnswer = vi.fn();
    const view = render(<AnswerPad options={OPTIONS} onAnswer={onAnswer} promptKey="a" />);
    paint();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    fireEvent.click(button('2'));
    const first = onAnswer.mock.calls[0][1] as number;
    expect(first).toBeGreaterThanOrEqual(4000);

    const pressedClass = button('2').className;

    view.rerender(<AnswerPad options={OPTIONS} onAnswer={onAnswer} promptKey="b" />);
    paint();

    // Same prompt shape, so the pressed button must look like every other one.
    expect(button('2').className).toBe(button('5').className);
    expect(button('2').className).not.toBe(pressedClass);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.click(button('6'));

    expect(onAnswer).toHaveBeenCalledTimes(2);
    const second = onAnswer.mock.calls[1][1] as number;
    expect(second).toBeGreaterThanOrEqual(300);
    expect(second).toBeLessThan(400);
  });

  it('selects with the number row and with the numpad', () => {
    const onAnswer = vi.fn();
    render(<AnswerPad options={OPTIONS} onAnswer={onAnswer} promptKey="a" />);
    paint();
    fireEvent.keyDown(window, { key: '4', code: 'Digit4' });
    expect(onAnswer).toHaveBeenCalledWith(4, expect.any(Number));

    onAnswer.mockClear();
    render(<AnswerPad options={OPTIONS} onAnswer={onAnswer} promptKey="b" />);
    paint();
    // Numlock off: the browser reports a navigation key, only `code` identifies it.
    fireEvent.keyDown(window, { key: 'End', code: 'Numpad1' });
    expect(onAnswer).toHaveBeenCalledWith(1, expect.any(Number));
  });

  it('ignores keys outside the map, held modifiers and typing in a field', () => {
    const onAnswer = vi.fn();
    render(
      <>
        <input aria-label="Somewhere to type" />
        <AnswerPad options={OPTIONS} onAnswer={onAnswer} promptKey="a" />
      </>,
    );
    paint();

    fireEvent.keyDown(window, { key: '7', code: 'Digit7' });
    fireEvent.keyDown(window, { key: '3', code: 'Digit3', ctrlKey: true });
    fireEvent.keyDown(window, { key: '3', code: 'Digit3', metaKey: true });
    fireEvent.keyDown(window, { key: '3', code: 'Digit3', altKey: true });
    fireEvent.keyDown(window, { key: '3', code: 'Digit3', shiftKey: true });
    fireEvent.keyDown(screen.getByLabelText('Somewhere to type'), { key: '3', code: 'Digit3' });

    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('honours a custom key map and takes keyboard input away when asked', () => {
    const onAnswer = vi.fn();
    const view = render(
      <AnswerPad
        options={OPTIONS}
        onAnswer={onAnswer}
        promptKey="a"
        keys={['a', 's', 'd', 'f', 'g', 'h', 'j']}
      />,
    );
    paint();
    fireEvent.keyDown(window, { key: 'd', code: 'KeyD' });
    expect(onAnswer).toHaveBeenCalledWith(2, expect.any(Number));

    onAnswer.mockClear();
    view.rerender(
      <AnswerPad options={OPTIONS} onAnswer={onAnswer} promptKey="b" keyboard={false} />,
    );
    paint();
    fireEvent.keyDown(window, { key: '2', code: 'Digit2' });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('blocks taps and keys while disabled', () => {
    const onAnswer = vi.fn();
    render(<AnswerPad options={OPTIONS} onAnswer={onAnswer} promptKey="a" disabled />);
    paint();

    fireEvent.click(button('3'));
    fireEvent.keyDown(window, { key: '3', code: 'Digit3' });

    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('paints a correct answer and announces it', () => {
    const feedback: AnswerFeedback = { chosen: 5, correct: 5 };
    render(
      <AnswerPad options={OPTIONS} onAnswer={vi.fn()} promptKey="a" feedback={feedback} disabled />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Correct.');
    expect(button('5').className).not.toBe(button('4').className);
  });

  /**
   * The corner hint is a second number the same key answers to: an 8 is a 1
   * once the sevens come off. It must never reach the accessible name, or the
   * key that answers 1 starts announcing itself as "1 8" and every
   * `getByRole('button', { name: '1' })` in the suite stops finding it.
   */
  describe('the corner hint', () => {
    const HINTED: AnswerOption[] = Array.from({ length: 7 }, (_unused, value) => ({
      value,
      label: String(value),
      hint: String(value + 7),
    }));

    it('draws it without touching the accessible name', () => {
      render(<AnswerPad options={HINTED} onAnswer={vi.fn()} promptKey="a" />);

      for (let value = 0; value <= 6; value += 1) {
        const key = button(String(value));
        expect(key).toHaveTextContent(String(value + 7));
        expect(key.getAttribute('aria-label')).toBe(String(value));
      }
    });

    it('hides it from the accessibility tree', () => {
      render(<AnswerPad options={HINTED} onAnswer={vi.fn()} promptKey="a" />);
      // The 13 on the 6 key is the clearest case: nothing else on the pad
      // renders that text, so a query for it can only be the hint. The
      // attribute is on the wrapper rather than on the glyph, so this asks
      // whether the hint sits inside a hidden subtree, which is the thing that
      // actually matters.
      expect(screen.getByText('13').closest('[aria-hidden="true"]')).not.toBeNull();
    });

    it('still answers with the key value, not the hint', () => {
      const onAnswer = vi.fn();
      render(<AnswerPad options={HINTED} onAnswer={onAnswer} promptKey="a" />);
      paint();

      fireEvent.click(button('1'));
      expect(onAnswer).toHaveBeenCalledTimes(1);
      expect(onAnswer.mock.calls[0][0]).toBe(1);
    });

    it('draws nothing when an option has no hint', () => {
      render(<AnswerPad options={OPTIONS} onAnswer={vi.fn()} promptKey="a" />);
      expect(button('0')).toHaveTextContent('0');
      expect(screen.queryByText('7')).toBeNull();
    });
  });

  it('paints the mistake and the right answer together', () => {
    const feedback: AnswerFeedback = { chosen: 2, correct: 6 };
    render(
      <AnswerPad options={OPTIONS} onAnswer={vi.fn()} promptKey="a" feedback={feedback} disabled />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Incorrect. The answer is 6.');

    const chosen = button('2');
    const answer = button('6');
    const untouched = button('3');
    expect(chosen.className).not.toBe(untouched.className);
    expect(answer.className).not.toBe(untouched.className);
    expect(chosen.className).not.toBe(answer.className);
  });
});
