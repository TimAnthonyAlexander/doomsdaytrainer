import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom has no media stack at all: `HTMLMediaElement.play` is a stub that
// reports "not implemented" to the virtual console. Spoken prompts are on by
// default in Learn, so without this every learn test would print that. The stub
// resolves rather than rejects, so a test that wants the failing case has to
// ask for it — `speech.test.ts` and the study-pass test both do.
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.load = () => {};
}

// jsdom has no matchMedia; MUI's useMediaQuery calls it.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
