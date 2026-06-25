import { CONFIG } from './config.js';

// Turn 21 hand landmarks into a pose-descriptive feature vector that is
// invariant to translation, scale, and in-plane rotation — so the same sign
// recognizes regardless of where the hand is or how it's tilted.
//   1. Make every point relative to the wrist (landmark 0).
//   2. Rotate so the wrist→middle-MCP axis points "up" (removes hand tilt).
//   3. Scale by hand size (wrist→middle-MCP distance).
//   4. Flatten the 20 non-wrist points → 40 features.
export function extractFeatures(hand) {
  const o = hand[0];
  let pts = hand.map((p) => [p.x - o.x, p.y - o.y]);

  const ang = Math.atan2(pts[9][1], pts[9][0]);
  const rot = -Math.PI / 2 - ang;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  pts = pts.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);

  const scale = Math.hypot(pts[9][0], pts[9][1]) || 1e-6;
  const f = [];
  for (let i = 1; i < pts.length; i++) f.push(pts[i][0] / scale, pts[i][1] / scale);
  return f;
}

function euclidean(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

// Distance-weighted KNN with an abstain threshold.
// Returns { label, confidence, distance } or null when nothing is close.
export function knnClassify(features, samples, k = CONFIG.KNN_K) {
  if (!samples.length) return null;
  const sorted = samples
    .map((s) => ({ label: s.label, d: euclidean(features, s.features) }))
    .sort((a, b) => a.d - b.d);

  if (sorted[0].d > CONFIG.ABSTAIN_DISTANCE) return null;

  const nearest = sorted.slice(0, Math.min(k, sorted.length));
  const votes = {};
  let total = 0;
  nearest.forEach(({ label, d }) => {
    const w = 1 / (d + 1e-6);
    votes[label] = (votes[label] || 0) + w;
    total += w;
  });
  const [label, score] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return { label, confidence: score / total, distance: sorted[0].d };
}

// Stateful classifier. Recognizes from a pool of user-calibrated samples plus
// a built-in seed (starter) model. A user-calibrated letter fully replaces the
// seed samples for that letter; untuned letters fall back to the seed.
export function createClassifier(userSamples = [], persist = () => {}, seedSamples = []) {
  let user = Array.isArray(userSamples) ? userSamples : [];
  const seed = Array.isArray(seedSamples) ? seedSamples : [];

  const pool = () => {
    if (!seed.length) return user;
    const tuned = new Set(user.map((s) => s.label));
    return user.concat(seed.filter((s) => !tuned.has(s.label)));
  };

  return {
    classify(hand) {
      return knnClassify(extractFeatures(hand), pool());
    },
    isCalibrated() {
      return pool().length > 0; // can recognize anything (seed counts)
    },
    isTuned() {
      return user.length > 0; // user has personalized at least one letter
    },
    calibratedLetters() {
      return [...new Set(user.map((s) => s.label))].sort();
    },
    addSamples(label, handFrames) {
      user = user.filter((s) => s.label !== label); // re-calibrating replaces
      handFrames.forEach((hand) => user.push({ label, features: extractFeatures(hand) }));
      persist(user);
    },
    reset() {
      user = [];
      persist(user);
    },
    getSamples: () => user,
  };
}
