import { UNIGRAMS, BIGRAMS } from './words.js';

const EMPTY_LEARNED = () => ({ uni: {}, bi: {} });

// Pure: rank candidate words by prefix + previous-word context + learned data.
export function rankCandidates(prefix, prevWord, learned = EMPTY_LEARNED(), max = 5) {
  prefix = (prefix || '').toLowerCase();
  prevWord = (prevWord || '').toLowerCase();

  const scores = new Map();
  const add = (w, s) => {
    if (!w || w === prefix) return;
    scores.set(w, (scores.get(w) || 0) + s);
  };

  if (prefix.length === 0) {
    // Next-word prediction: only possible with a known previous word.
    if (!prevWord) return [];
    (BIGRAMS[prevWord] || []).forEach((w, i) => add(w, 2 - i * 0.1));
    const lb = learned.bi[prevWord];
    if (lb) Object.entries(lb).forEach(([w, c]) => add(w, Math.min(2.5, c * 0.6)));
  } else {
    // Prefix completion from the base vocabulary.
    UNIGRAMS.forEach((w, i) => {
      if (w.length > prefix.length && w.startsWith(prefix)) {
        add(w, (UNIGRAMS.length - i) / UNIGRAMS.length);
        const biList = BIGRAMS[prevWord];
        if (prevWord && biList && biList.includes(w)) {
          add(w, 3 - biList.indexOf(w) * 0.15);
        }
      }
    });
    // Learned words the user has typed before (may be out-of-vocabulary).
    Object.entries(learned.uni).forEach(([w, c]) => {
      if (w.length > prefix.length && w.startsWith(prefix)) add(w, Math.min(3, 1 + c * 0.4));
    });
    if (prevWord && learned.bi[prevWord]) {
      Object.entries(learned.bi[prevWord]).forEach(([w, c]) => {
        if (w.startsWith(prefix) && w.length > prefix.length) add(w, Math.min(3, c * 0.6));
      });
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

// Pure: fold a block of text into a learned-data structure.
export function learnFromText(text, learned = EMPTY_LEARNED()) {
  const words = (text.toLowerCase().match(/[a-z']+/g) || []);
  words.forEach((w, i) => {
    learned.uni[w] = (learned.uni[w] || 0) + 1;
    if (i > 0) {
      const p = words[i - 1];
      (learned.bi[p] || (learned.bi[p] = {}))[w] = (learned.bi[p][w] || 0) + 1;
    }
  });
  return learned;
}

// Stateful wrapper with persistence. `persist` is called with the learned object.
export function createPredictor(initialLearned, persist = () => {}) {
  const learned = initialLearned && initialLearned.uni ? initialLearned : EMPTY_LEARNED();

  return {
    predict: (prefix, prevWord, max = 5) => rankCandidates(prefix, prevWord, learned, max),
    recordWord(word, prevWord) {
      const w = (word || '').toLowerCase();
      if (!/^[a-z']+$/.test(w)) return;
      learned.uni[w] = (learned.uni[w] || 0) + 1;
      const p = (prevWord || '').toLowerCase();
      if (/^[a-z']+$/.test(p)) {
        (learned.bi[p] || (learned.bi[p] = {}))[w] = (learned.bi[p][w] || 0) + 1;
      }
      persist(learned);
    },
    ingest(text) {
      learnFromText(text, learned);
      persist(learned);
    },
    getLearned: () => learned,
  };
}
