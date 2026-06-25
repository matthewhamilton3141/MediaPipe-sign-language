// Thin, fault-tolerant localStorage wrapper. Keeps persistence out of the
// pure logic modules so those stay testable.
const KEYS = {
  text: 'handtype.text',
  learned: 'handtype.learned',
  calibration: 'handtype.calibration',
  settings: 'handtype.settings',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or unavailable — non-fatal */
  }
}

export const storage = {
  loadText: () => read(KEYS.text, ''),
  saveText: (t) => write(KEYS.text, t),

  loadLearned: () => read(KEYS.learned, { uni: {}, bi: {} }),
  saveLearned: (l) => write(KEYS.learned, l),

  loadCalibration: () => read(KEYS.calibration, []),
  saveCalibration: (s) => write(KEYS.calibration, s),

  loadSettings: () => read(KEYS.settings, null),
  saveSettings: (s) => write(KEYS.settings, s),
};
