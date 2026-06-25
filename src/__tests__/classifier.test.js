import { describe, it, expect } from 'vitest';
import { extractFeatures, knnClassify, createClassifier } from '../classifier.js';

// Build a 21-landmark hand; `over` maps landmark index → {x,y}.
function makeHand(over = {}) {
  const pts = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  pts[0] = { x: 0.5, y: 0.95, z: 0 }; // wrist
  pts[9] = { x: 0.5, y: 0.55, z: 0 }; // middle MCP (scale + rotation ref)
  for (const [i, p] of Object.entries(over)) pts[i] = { ...pts[i], ...p };
  return pts;
}

// Two clearly different "signs": fingers up vs. fingers curled down.
const OPEN = makeHand({
  8: { y: 0.15 }, 12: { y: 0.1 }, 16: { y: 0.15 }, 20: { y: 0.2 }, 4: { x: 0.25, y: 0.5 },
});
const CLOSED = makeHand({
  8: { y: 0.75 }, 12: { y: 0.78 }, 16: { y: 0.76 }, 20: { y: 0.74 }, 4: { x: 0.55, y: 0.8 },
});

describe('extractFeatures', () => {
  it('produces a 40-dim vector (20 non-wrist points × 2)', () => {
    expect(extractFeatures(OPEN)).toHaveLength(40);
  });

  it('is translation-invariant', () => {
    const shifted = OPEN.map((p) => ({ x: p.x + 0.2, y: p.y - 0.1, z: 0 }));
    extractFeatures(OPEN).forEach((v, i) =>
      expect(extractFeatures(shifted)[i]).toBeCloseTo(v, 5));
  });

  it('is scale-invariant', () => {
    const scaled = OPEN.map((p) => ({ x: p.x * 1.7, y: p.y * 1.7, z: 0 }));
    extractFeatures(OPEN).forEach((v, i) =>
      expect(extractFeatures(scaled)[i]).toBeCloseTo(v, 5));
  });

  it('is rotation-invariant', () => {
    const a = 0.6, cos = Math.cos(a), sin = Math.sin(a);
    const rotated = OPEN.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos, z: 0 }));
    extractFeatures(OPEN).forEach((v, i) =>
      expect(extractFeatures(rotated)[i]).toBeCloseTo(v, 4));
  });
});

describe('knnClassify', () => {
  const samples = [
    { label: 'B', features: extractFeatures(OPEN) },
    { label: 'S', features: extractFeatures(CLOSED) },
  ];

  it('returns null with no samples', () => {
    expect(knnClassify(extractFeatures(OPEN), [])).toBe(null);
  });

  it('classifies to the nearest labeled sign', () => {
    expect(knnClassify(extractFeatures(OPEN), samples, 1).label).toBe('B');
    expect(knnClassify(extractFeatures(CLOSED), samples, 1).label).toBe('S');
  });

  it('reports a confidence in [0,1]', () => {
    const r = knnClassify(extractFeatures(OPEN), samples);
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});

describe('createClassifier', () => {
  it('is uncalibrated and abstains with no samples', () => {
    const c = createClassifier();
    expect(c.isCalibrated()).toBe(false);
    expect(c.classify(OPEN)).toBe(null);
  });

  it('recognizes signs after calibration and tracks calibrated letters', () => {
    let persisted = null;
    const c = createClassifier([], (s) => { persisted = s; });
    c.addSamples('B', [OPEN, OPEN]);
    c.addSamples('S', [CLOSED, CLOSED]);
    expect(c.isCalibrated()).toBe(true);
    expect(c.calibratedLetters()).toEqual(['B', 'S']);
    expect(c.classify(OPEN).label).toBe('B');
    expect(persisted.length).toBe(4);
  });

  it('re-calibrating a letter replaces its old samples', () => {
    const c = createClassifier();
    c.addSamples('B', [OPEN, OPEN, OPEN]);
    c.addSamples('B', [OPEN]);
    expect(c.getSamples().filter((s) => s.label === 'B').length).toBe(1);
  });
});
