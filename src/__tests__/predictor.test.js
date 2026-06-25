import { describe, it, expect } from 'vitest';
import { rankCandidates, learnFromText, createPredictor } from '../predictor.js';

describe('rankCandidates', () => {
  it('returns nothing for an empty prefix without context', () => {
    expect(rankCandidates('', '')).toEqual([]);
  });

  it('completes a prefix from the base vocabulary', () => {
    const out = rankCandidates('th', '');
    expect(out).toContain('the');
    expect(out.every((w) => w.startsWith('th'))).toBe(true);
  });

  it('never returns the prefix itself', () => {
    const out = rankCandidates('the', '');
    expect(out).not.toContain('the');
  });

  it('uses previous-word context to reorder completions', () => {
    // After "thank", "you" should be the top "yo..." completion.
    const out = rankCandidates('yo', 'thank');
    expect(out[0]).toBe('you');
  });

  it('predicts next word from a known previous word when prefix is empty', () => {
    const out = rankCandidates('', 'thank');
    expect(out).toContain('you');
  });

  it('respects the max limit', () => {
    expect(rankCandidates('t', '', { uni: {}, bi: {} }, 3).length).toBeLessThanOrEqual(3);
  });
});

describe('learnFromText', () => {
  it('counts unigrams and bigrams', () => {
    const learned = learnFromText('hello hello world');
    expect(learned.uni.hello).toBe(2);
    expect(learned.bi.hello.world).toBe(1);
  });
});

describe('createPredictor', () => {
  it('surfaces learned out-of-vocabulary words', () => {
    const p = createPredictor();
    p.recordWord('zephyrium');
    p.recordWord('zephyrium');
    expect(p.predict('zep', '')).toContain('zephyrium');
  });

  it('persists via the provided callback', () => {
    let saved = null;
    const p = createPredictor({ uni: {}, bi: {} }, (l) => { saved = l; });
    p.recordWord('test', 'a');
    expect(saved.uni.test).toBe(1);
    expect(saved.bi.a.test).toBe(1);
  });

  it('ignores non-alphabetic input', () => {
    const p = createPredictor();
    p.recordWord('123!@#');
    expect(p.getLearned().uni['123!@#']).toBeUndefined();
  });
});
