import { describe, expect, it } from 'vitest';
import {
  LATENCY_GAP_MS,
  LATENCY_MAX_MS,
  LATENCY_MIN_MS,
  hintChoices,
  isReminderTime,
  msFromText,
  sanitiseMsText,
  withFastThreshold,
  withMediumThreshold,
} from './settingsModel';

const DEFAULTS = { fastThresholdMs: 2000, mediumThresholdMs: 5000 };

describe('latency thresholds', () => {
  it('leaves a valid pair alone', () => {
    expect(withFastThreshold(DEFAULTS, 1500)).toEqual({
      fastThresholdMs: 1500,
      mediumThresholdMs: 5000,
    });
    expect(withMediumThreshold(DEFAULTS, 6000)).toEqual({
      fastThresholdMs: 2000,
      mediumThresholdMs: 6000,
    });
  });

  it('pushes medium up when fast is raised past it', () => {
    const next = withFastThreshold(DEFAULTS, 7000);
    expect(next.fastThresholdMs).toBe(7000);
    expect(next.mediumThresholdMs).toBe(7000 + LATENCY_GAP_MS);
  });

  it('pulls fast down when medium is lowered below it', () => {
    const next = withMediumThreshold(DEFAULTS, 900);
    expect(next.mediumThresholdMs).toBe(900);
    expect(next.fastThresholdMs).toBe(900 - LATENCY_GAP_MS);
    expect(next.fastThresholdMs).toBeLessThan(next.mediumThresholdMs);
  });

  it('never lets the two meet', () => {
    expect(withMediumThreshold(DEFAULTS, 2000).fastThresholdMs).toBe(2000 - LATENCY_GAP_MS);
    expect(withFastThreshold(DEFAULTS, 5000).mediumThresholdMs).toBe(5000 + LATENCY_GAP_MS);
  });

  it('clamps to the allowed range and keeps room for the other cutoff', () => {
    expect(withFastThreshold(DEFAULTS, 0).fastThresholdMs).toBe(LATENCY_MIN_MS);
    expect(withMediumThreshold(DEFAULTS, 5).mediumThresholdMs).toBe(LATENCY_MIN_MS + LATENCY_GAP_MS);
    expect(withFastThreshold(DEFAULTS, 999_999).fastThresholdMs).toBe(
      LATENCY_MAX_MS - LATENCY_GAP_MS,
    );
    expect(withMediumThreshold(DEFAULTS, 999_999).mediumThresholdMs).toBe(LATENCY_MAX_MS);
  });

  it('survives a field that was cleared', () => {
    expect(msFromText('', 2000)).toBe(2000);
    expect(msFromText('3400', 2000)).toBe(3400);
    expect(sanitiseMsText('1a2b3c4d5e6')).toBe('12345');
  });
});

describe('reminder time', () => {
  it('accepts a full 24h time and nothing else', () => {
    expect(isReminderTime('19:00')).toBe(true);
    expect(isReminderTime('00:00')).toBe(true);
    expect(isReminderTime('23:59')).toBe(true);
    expect(isReminderTime('24:00')).toBe(false);
    expect(isReminderTime('19:60')).toBe(false);
    expect(isReminderTime('9:00')).toBe(false);
    expect(isReminderTime('')).toBe(false);
  });
});

describe('hint previews', () => {
  it('renders one real, distinct example per type', () => {
    const choices = hintChoices();
    expect(choices.map((choice) => choice.type)).toEqual(['structural', 'arithmetic', 'anchor']);
    expect(choices[0].hint.text).toBe('Block 72–75, starts at 6.');
    expect(choices[1].hint.text).toBe('73 + 18 = 91');
    expect(choices[2].hint.text).toBe('72 → 6, so 73 → ?');
  });

  it('does not let the anchor example collapse into the structural one', () => {
    const [structural, , anchor] = hintChoices();
    expect(anchor.hint.type).toBe('anchor');
    expect(anchor.hint.text).not.toBe(structural.hint.text);
  });
});
