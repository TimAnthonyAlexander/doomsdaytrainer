import { describe, expect, it } from 'vitest';
import { VERIFY_OUTCOMES, classifyVerify } from '@/domain/calcStats';
import { verifyAgreed, verifyCopy } from './verifyCopy';

describe('verifyCopy', () => {
  it('has words for every outcome the domain can produce', () => {
    for (const outcome of VERIFY_OUTCOMES) {
      const copy = verifyCopy(outcome);
      expect(copy.title.trim()).not.toBe('');
      expect(copy.note.trim()).not.toBe('');
    }
  });

  it('never repeats a title, so the verdict is readable at a glance', () => {
    const titles = VERIFY_OUTCOMES.map((outcome) => verifyCopy(outcome).title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('states the three cases the trainer is built around', () => {
    // Memory right, working right.
    expect(verifyCopy(classifyVerify(0, 0, 0)).title).toBe('Both agreed');
    // Memory wrong, working right — the reason the calculation is worth having.
    expect(verifyCopy(classifyVerify(3, 0, 0)).title).toBe('The working caught it');
    // Both wrong, and differently.
    expect(verifyCopy(classifyVerify(3, 5, 0)).title).toBe('Both wrong');
  });

  it('separates the two ways of being wrong together', () => {
    expect(classifyVerify(3, 3, 0)).toBe('agreed-wrong');
    expect(verifyCopy('agreed-wrong').title).not.toBe(verifyCopy('both-wrong').title);
    expect(verifyAgreed('agreed-wrong')).toBe(true);
    expect(verifyAgreed('both-wrong')).toBe(false);
    expect(verifyAgreed('agreed-right')).toBe(true);
  });

  it('congratulates nobody and shouts at nobody', () => {
    for (const outcome of VERIFY_OUTCOMES) {
      const copy = verifyCopy(outcome);
      const text = `${copy.title} ${copy.note}`;
      expect(text).not.toMatch(/!/);
      expect(text).not.toMatch(/\b(Great|Nice|Well done|Oops|Try again|Almost)\b/i);
    }
  });
});
