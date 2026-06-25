export const CONFIG = {
  COOLDOWN: 360,
  PINCH_THRESHOLD: 0.055,
  GESTURE_SMOOTH_FRAMES: 7,
  DWELL_MS: 650,

  // Letter recognition
  KNN_K: 5,
  CALIBRATION_FRAMES: 30,
  ABSTAIN_DISTANCE: 2.8, // nearest-neighbor distance above this → no letter
  MIN_CONFIDENCE: 0.55,  // smoothed vote share required to commit a letter

  ACCENT: '#00ff88',
  CURSOR_COLOR: '#4488ff',
  BACKSPACE_COLOR: '#ff5d5d',
};

export const DEFAULT_SETTINGS = {
  inputMode: 'dwell', // 'dwell' | 'pinch'
  swapHands: false,
  dwellMs: CONFIG.DWELL_MS,
};
