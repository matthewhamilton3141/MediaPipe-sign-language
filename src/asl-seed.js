import { extractFeatures } from './classifier.js';
import { LETTERS } from './asl.js';

// A built-in "starter" model. There's no public MediaPipe-landmark ASL dataset
// we can bundle offline, so we synthesize plausible hand poses from a simple
// kinematic model: each finger has an extension value (1 = straight up,
// 0 = curled into the palm) and the thumb has a tip position. Each ASL letter
// is defined as finger + thumb parameters. The poses are approximate — similar
// signs (U/V/K, G/L/Q) overlap — but they give first-run recognition that the
// user's own calibration then overrides per letter.

const MCP = {
  index:  [-0.28, -0.82],
  middle: [-0.02, -0.92],
  ring:   [0.22, -0.86],
  pinky:  [0.42, -0.72],
};
const FAN = { index: -0.18, middle: 0.0, ring: 0.16, pinky: 0.34 };
const SEG = {
  index:  [0.30, 0.22, 0.18],
  middle: [0.33, 0.24, 0.18],
  ring:   [0.30, 0.22, 0.17],
  pinky:  [0.24, 0.17, 0.14],
};
const THUMB_CMC = [-0.5, -0.25];
const THUMB_TIPS = {
  side: [-0.55, -0.62], up: [-0.45, -0.95], out: [-0.72, -0.5], across: [0.1, -0.5],
  tuck: [-0.05, -0.62], tuckT: [-0.18, -0.6], tuck2: [0.0, -0.55], tuck3: [0.15, -0.52],
  touchIndex: [-0.2, -0.62], touchMid: [0.0, -0.5], cup: [-0.4, -0.7], between: [-0.1, -0.68],
};

// Finger + thumb parameters per letter. e = [index, middle, ring, pinky] extension.
const SPECS = {
  A: { e: [0, 0, 0, 0], thumb: 'side' },
  B: { e: [1, 1, 1, 1], thumb: 'across' },
  C: { e: [0.5, 0.5, 0.5, 0.5], thumb: 'cup' },
  D: { e: [1, 0, 0, 0], thumb: 'touchMid' },
  E: { e: [0.15, 0.15, 0.15, 0.15], thumb: 'tuck' },
  F: { e: [0, 1, 1, 1], thumb: 'touchIndex' },
  G: { e: [1, 0, 0, 0], thumb: 'between' },
  H: { e: [1, 1, 0, 0], thumb: 'tuck' },
  I: { e: [0, 0, 0, 1], thumb: 'side' },
  J: { e: [0, 0, 0, 1], thumb: 'up' },
  K: { e: [1, 1, 0, 0], thumb: 'between', spread: true },
  L: { e: [1, 0, 0, 0], thumb: 'out' },
  M: { e: [0, 0, 0, 0], thumb: 'tuck3' },
  N: { e: [0, 0, 0, 0], thumb: 'tuck2' },
  O: { e: [0.3, 0.3, 0.3, 0.3], thumb: 'touchIndex' },
  P: { e: [1, 1, 0, 0], thumb: 'tuck', spread: true },
  Q: { e: [1, 0, 0, 0], thumb: 'touchMid' },
  R: { e: [0.85, 0.85, 0, 0], thumb: 'tuck' },
  S: { e: [0, 0, 0, 0], thumb: 'across' },
  T: { e: [0, 0, 0, 0], thumb: 'tuckT' },
  U: { e: [1, 1, 0, 0], thumb: 'tuck' },
  V: { e: [1, 1, 0, 0], thumb: 'tuck', spread: true },
  W: { e: [1, 1, 1, 0], thumb: 'tuck', spread: true },
  X: { e: [0.4, 0, 0, 0], thumb: 'side' },
  Y: { e: [0, 0, 0, 1], thumb: 'out' },
  Z: { e: [1, 0, 0, 0], thumb: 'side' },
};

const dir = (theta) => [Math.sin(theta), -Math.cos(theta)];

function finger(name, ext, spread) {
  const base = MCP[name];
  const fan = FAN[name] * (spread ? 2.3 : 1);
  const c = 1 - ext;
  const bend = [0.7, 1.7, 2.6]; // progressive fold as curl increases
  const th = bend.map((k) => fan + c * k);
  const L = SEG[name];
  const pip = [base[0] + dir(th[0])[0] * L[0], base[1] + dir(th[0])[1] * L[0]];
  const dip = [pip[0] + dir(th[1])[0] * L[1], pip[1] + dir(th[1])[1] * L[1]];
  const tip = [dip[0] + dir(th[2])[0] * L[2], dip[1] + dir(th[2])[1] * L[2]];
  return [base, pip, dip, tip];
}

function thumb(state) {
  const tip = THUMB_TIPS[state] || THUMB_TIPS.side;
  const cmc = THUMB_CMC;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return [cmc, lerp(cmc, tip, 0.4), lerp(cmc, tip, 0.72), tip];
}

// Build a 21-landmark hand (MediaPipe index order) for a letter.
export function buildSeedHand(letter) {
  const spec = SPECS[letter];
  if (!spec) return null;
  const th = thumb(spec.thumb);
  const idx = finger('index', spec.e[0], spec.spread);
  const mid = finger('middle', spec.e[1], spec.spread);
  const rng = finger('ring', spec.e[2], spec.spread);
  const pky = finger('pinky', spec.e[3], spec.spread);
  return [[0, 0], ...th, ...idx, ...mid, ...rng, ...pky].map(([x, y]) => ({ x, y }));
}

const jitter = (s) => (Math.random() * 2 - 1) * s;

// Labeled feature vectors for every letter — fed into the classifier as a fallback.
export function getSeedSamples(perLetter = 5, sigma = 0.012) {
  const out = [];
  for (const letter of LETTERS) {
    const base = buildSeedHand(letter);
    if (!base) continue;
    for (let n = 0; n < perLetter; n++) {
      const noisy = base.map((p) => ({ x: p.x + jitter(sigma), y: p.y + jitter(sigma) }));
      out.push({ label: letter, features: extractFeatures(noisy) });
    }
  }
  return out;
}
