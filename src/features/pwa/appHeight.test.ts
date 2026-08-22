import { describe, expect, it } from 'vitest';
import { measuredAppHeight, type WindowMetrics } from './appHeight';

/** An iPhone 16 Pro, installed to the home screen and reporting honestly. */
const HONEST: WindowMetrics = {
  standalone: true,
  screenWidth: 402,
  screenHeight: 874,
  innerWidth: 402,
  innerHeight: 874,
};

const metrics = (overrides: Partial<WindowMetrics> = {}): WindowMetrics => ({
  ...HONEST,
  ...overrides,
});

describe('measuredAppHeight', () => {
  it('leaves an honest window alone', () => {
    // The case on every device with no bug: nothing to correct, so nothing is
    // written and the stylesheet's unit stands.
    expect(measuredAppHeight(HONEST)).toBeNull();
  });

  it('gives back the screen when the app is short by a toolbar', () => {
    // The bug: a home-screen app reporting a viewport that still allows for
    // chrome it does not have.
    expect(measuredAppHeight(metrics({ innerHeight: 823 }))).toBe(874);
  });

  it('leaves a browser tab alone, however short it reports', () => {
    // There the toolbar is real, `dvh` is the right answer, and it changes as
    // the toolbar goes.
    expect(measuredAppHeight(metrics({ standalone: false, innerHeight: 823 }))).toBeNull();
  });

  it('ignores a shortfall the size of a keyboard', () => {
    expect(measuredAppHeight(metrics({ innerHeight: 480 }))).toBeNull();
  });

  it('ignores a window narrower than the screen', () => {
    // iPadOS split view: the window is part of the screen, so the screen's
    // height says nothing about how tall the window is.
    expect(measuredAppHeight(metrics({ innerWidth: 320, innerHeight: 823 }))).toBeNull();
  });

  it('allows a pixel or two of rounding on the width', () => {
    expect(measuredAppHeight(metrics({ innerWidth: 401, innerHeight: 823 }))).toBe(874);
  });

  it('never reports a height taller than the window already is', () => {
    // An unrotated `screen.height` in landscape reads as a huge shortfall, and
    // a window taller than the screen as a negative one. Neither is a toolbar.
    expect(measuredAppHeight(metrics({ innerWidth: 874, innerHeight: 402 }))).toBeNull();
    expect(measuredAppHeight(metrics({ innerHeight: 900 }))).toBeNull();
  });
});
