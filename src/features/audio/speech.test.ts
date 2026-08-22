import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_SET, cueUrl, pairUrl, playClip, preloadClip, resetSpeech } from './speech';

afterEach(() => {
  resetSpeech();
  vi.restoreAllMocks();
});

describe('clip urls', () => {
  it('zero-pads the year and carries the set version', () => {
    expect(cueUrl(4)).toBe(`/audio/${AUDIO_SET}/cue-04.mp3`);
    expect(pairUrl(4)).toBe(`/audio/${AUDIO_SET}/pair-04.mp3`);
    expect(cueUrl(99)).toBe(`/audio/${AUDIO_SET}/cue-99.mp3`);
  });

  it('is same-origin and absolute, so nothing here can reach a third party', () => {
    for (let yy = 0; yy < 100; yy += 1) {
      for (const url of [cueUrl(yy), pairUrl(yy)]) {
        expect(url.startsWith('/audio/')).toBe(true);
        expect(url).not.toContain('//');
      }
    }
  });

  it('gives every year its own two clips', () => {
    const all = new Set<string>();
    for (let yy = 0; yy < 100; yy += 1) {
      all.add(cueUrl(yy));
      all.add(pairUrl(yy));
    }
    expect(all.size).toBe(200);
  });
});

describe('playback failure', () => {
  it('swallows a rejected play and returns nothing', () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValue(new Error('NotAllowedError'));
    expect(() => playClip(cueUrl(12))).not.toThrow();
    expect(playClip(cueUrl(12))).toBeUndefined();
    expect(play).toHaveBeenCalled();
  });

  it('swallows a play that throws outright', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      throw new Error('no media stack');
    });
    expect(() => playClip(cueUrl(12))).not.toThrow();
  });

  it('swallows a play that returns no promise at all', () => {
    // Old WebKit returns undefined from play(). Calling .catch on it would be
    // the failure mode that takes the whole screen down with it.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockReturnValue(
      undefined as unknown as Promise<void>,
    );
    expect(() => playClip(cueUrl(12))).not.toThrow();
  });

  it('swallows a failed preload', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {
      throw new Error('nope');
    });
    expect(() => preloadClip(cueUrl(12))).not.toThrow();
  });
});

describe('the shared element', () => {
  it('reuses one element for every clip, so one unlock covers the session', () => {
    // Safari gates playback per element: an element that has played once inside
    // a user gesture stays unlocked and a fresh one does not.
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const created: unknown[] = [];
    const contexts = new Set<unknown>();
    play.mockImplementation(function (this: unknown) {
      contexts.add(this);
      created.push(this);
      return Promise.resolve();
    });

    playClip(cueUrl(1));
    playClip(cueUrl(2));
    playClip(cueUrl(3));

    expect(created).toHaveLength(3);
    expect(contexts.size).toBe(1);
  });
});
