import { describe, it, expect } from 'vitest';
import { getSeedSamples, buildSeedHand } from '../asl-seed.js';
import { createClassifier } from '../classifier.js';
import { LETTERS } from '../asl.js';

describe('getSeedSamples', () => {
  it('produces samples for every letter', () => {
    const s = getSeedSamples(4);
    expect(s.length).toBe(LETTERS.length * 4);
    expect(new Set(s.map((x) => x.label)).size).toBe(LETTERS.length);
  });

  it('emits 40-dim feature vectors', () => {
    expect(getSeedSamples(1)[0].features).toHaveLength(40);
  });
});

describe('buildSeedHand', () => {
  it('builds a 21-landmark hand', () => {
    const h = buildSeedHand('B');
    expect(h).toHaveLength(21);
    expect(h[0]).toHaveProperty('x');
  });

  it('returns null for an unknown letter', () => {
    expect(buildSeedHand('1')).toBe(null);
  });
});

describe('classifier with the seed model', () => {
  const seed = getSeedSamples();

  it('recognizes without any user calibration', () => {
    const c = createClassifier([], () => {}, seed);
    expect(c.isCalibrated()).toBe(true);
    expect(c.isTuned()).toBe(false);
    // Distinctive handshapes should map to themselves.
    expect(c.classify(buildSeedHand('B')).label).toBe('B');
    expect(c.classify(buildSeedHand('A')).label).toBe('A');
  });

  it('lets user calibration override the seed for a letter', () => {
    const c = createClassifier([], () => {}, seed);
    c.addSamples('B', [buildSeedHand('B')]);
    expect(c.isTuned()).toBe(true);
    expect(c.calibratedLetters()).toEqual(['B']);
    // Untuned letters still fall back to the seed.
    expect(c.classify(buildSeedHand('A')).label).toBe('A');
  });

  it('keeps persisting only user samples, not the seed', () => {
    let saved = null;
    const c = createClassifier([], (s) => { saved = s; }, seed);
    c.addSamples('Y', [buildSeedHand('Y')]);
    expect(saved.length).toBe(1);
    expect(saved.every((s) => s.label === 'Y')).toBe(true);
  });
});
