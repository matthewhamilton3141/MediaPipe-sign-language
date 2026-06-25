import { CONFIG } from './config.js';
export { getDistance } from './util.js';

// Temporal smoothing over a letter classifier that may abstain (return null).
// Produces a stable letter only when a clear majority of recent frames agree.
export function createSmoother(classifier, frames = CONFIG.GESTURE_SMOOTH_FRAMES) {
  const history = []; // (letter | null) per frame
  let stable = null;

  const tally = () => {
    const counts = {};
    history.forEach((l) => { if (l) counts[l] = (counts[l] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top || null;
  };

  return {
    update(hand) {
      const r = classifier.classify(hand);
      history.push(r ? r.label : null);
      if (history.length > frames) history.shift();

      const top = tally();
      const need = Math.ceil(frames * 0.6);
      if (top && top[1] >= need) stable = top[0];
      else if (history.every((l) => l === null)) stable = null;

      return { label: stable, confidence: this.confidence(), raw: r };
    },
    confidence() {
      const top = tally();
      return top ? Math.min(1, top[1] / Math.ceil(frames * 0.6)) : 0;
    },
    current: () => stable,
    reset() { history.length = 0; stable = null; },
  };
}
