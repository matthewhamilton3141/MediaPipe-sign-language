import { CONFIG, DEFAULT_SETTINGS } from './config.js';
import { createSmoother, getDistance } from './gestures.js';
import { createClassifier } from './classifier.js';
import { createPredictor } from './predictor.js';
import { createEditor } from './editor.js';
import { createCalibrationWizard } from './calibration.js';
import { getSeedSamples } from './asl-seed.js';
import { storage } from './storage.js';

// ── DOM refs ─────────────────────────────────────────────────────
const canvas = document.querySelector('.output_canvas');
const ctx = canvas.getContext('2d');
const textDisplay = document.getElementById('text-display');
const letterNameEl = document.getElementById('mode-name');
const letterSubEl = document.getElementById('mode-letters');
const letterDisplayEl = document.getElementById('mode-display');
const suggestionsBar = document.getElementById('suggestions-bar');
const suggestionsList = document.getElementById('suggestions-list');
const charCountEl = document.getElementById('char-count');
const wpmEl = document.getElementById('wpm-display');
const calibBadge = document.getElementById('calib-badge');

// ── App state ────────────────────────────────────────────────────
let editor, predictor, classifier, smoother, wizard, settings;
let lastAction = 0;
let sessionStart = null, lastWpmUpdate = 0;

// Letter-commit dwell state.
let dwellLabel = null, dwellStart = 0, dwellArmed = true;

// On-screen backspace button (screen-space, drawn after the mirror restore).
const BS_BTN = { w: 156, h: 58, margin: 22, leftFrac: 0.16 };
const BS_REPEAT_MS = 160;
let bsDwellStart = 0, bsLastFire = 0;

// ── Main per-frame callback ──────────────────────────────────────
export function onResults(results) {
  const now = Date.now();

  if (results.image) {
    canvas.width = results.image.width;
    canvas.height = results.image.height;
  }

  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

  let lHand = null, rHand = null;
  if (results.multiHandLandmarks && results.multiHandedness) {
    results.multiHandedness.forEach((h, i) => {
      const isRight = settings.swapHands ? h.label === 'Right' : h.label === 'Left';
      if (isRight) rHand = results.multiHandLandmarks[i];
      else lHand = results.multiHandLandmarks[i];
    });
  }

  // Calibration intercept — feed frames, skip typing.
  if (wizard && wizard.isActive()) {
    if (rHand) { drawSkeleton(rHand, CONFIG.ACCENT + '88'); wizard.feedHand(rHand); }
    ctx.restore();
    return;
  }

  // Right hand → ASL letter recognition.
  let recognized = null, recogConf = 0, dwellProgress = 0;
  if (rHand) {
    const { label, confidence } = smoother.update(rHand);
    recognized = label;
    recogConf = confidence;
    drawSkeleton(rHand, label ? CONFIG.ACCENT + '66' : 'rgba(255,255,255,0.28)');
    drawConfidenceRing(rHand[0], confidence, CONFIG.ACCENT);

    if (settings.inputMode === 'dwell') {
      dwellProgress = handleLetterDwell(label, confidence, now);
    }
    drawCandidateLetter(label, rHand[0], dwellProgress);
  } else {
    smoother.reset();
    dwellLabel = null; dwellArmed = true;
  }

  // Left hand → editing actions (space / backspace / navigate).
  if (lHand) {
    const thumb = lHand[4], index = lHand[8], middle = lHand[12], ring = lHand[16], pinky = lHand[20];
    const navPinch = getDistance(thumb, pinky) < CONFIG.PINCH_THRESHOLD;

    if (navPinch) {
      handleNav(lHand, now);
      drawSkeleton(lHand, CONFIG.CURSOR_COLOR + 'aa');
      drawPinchDot(thumb, pinky, CONFIG.CURSOR_COLOR, 'NAV');
    } else {
      drawSkeleton(lHand, 'rgba(255,255,255,0.4)');
      drawFingerLabels(lHand);

      if (now - lastAction > CONFIG.COOLDOWN) {
        if (getDistance(thumb, middle) < CONFIG.PINCH_THRESHOLD) {
          editor.insertSpace(); afterEdit(); lastAction = now;
        } else if (getDistance(thumb, ring) < CONFIG.PINCH_THRESHOLD) {
          if (editor.backspace()) { afterEdit(); lastAction = now; }
        } else if (settings.inputMode === 'pinch' && recognized &&
                   getDistance(thumb, index) < CONFIG.PINCH_THRESHOLD) {
          editor.insertLetter(recognized); afterEdit(); lastAction = now;
        }
      }
    }
    drawCooldownArc(lHand[8], now, lastAction);
  }

  ctx.restore();
  drawBackspaceButton(lHand, rHand, now);
  updateLetterDisplay(recognized, recogConf);
  updateStats(now);
}

// ── Input handlers ───────────────────────────────────────────────
function handleLetterDwell(label, confidence, now) {
  if (!label || confidence < CONFIG.MIN_CONFIDENCE) {
    if (!label) { dwellLabel = null; dwellArmed = true; }
    return 0;
  }
  if (label !== dwellLabel) { dwellLabel = label; dwellStart = now; dwellArmed = true; return 0; }
  if (!dwellArmed) return 1;
  const progress = (now - dwellStart) / settings.dwellMs;
  if (progress >= 1) {
    editor.insertLetter(label);
    afterEdit();
    dwellArmed = false;
    return 1;
  }
  return progress;
}

function handleNav(lHand, now) {
  const handX = lHand[0].x, center = 0.5, deadzone = 0.08;
  const dist = Math.abs(handX - center) - deadzone;
  if (dist <= 0) return;
  const speed = Math.max(60, 220 - dist * 600);
  if (now - lastAction > speed) {
    editor.moveCursor(handX < center - deadzone ? 1 : -1);
    lastAction = now;
  }
}

// ── Post-edit side effects ───────────────────────────────────────
function afterEdit() {
  if (!sessionStart && editor.serialize().length) {
    sessionStart = Date.now(); lastWpmUpdate = Date.now();
  }
  storage.saveText(editor.serialize());
  updateHTML();
  updateSuggestions();
}

// ── DOM rendering ────────────────────────────────────────────────
function updateHTML() {
  const { text, cursor } = editor.getState();
  textDisplay.innerHTML =
    `${esc(text.slice(0, cursor))}<span class="cursor"></span>${esc(text.slice(cursor))}`;
  textDisplay.setAttribute('aria-label', `Typed text: ${text || 'empty'}`);
  textDisplay.scrollTop = textDisplay.scrollHeight;
}

function updateStats(now) {
  charCountEl.textContent = `${editor.serialize().length} ch`;
  if (!sessionStart || now - lastWpmUpdate < 1000) return;
  const mins = (now - sessionStart) / 60000;
  const words = editor.serialize().trim().split(/\s+/).filter(Boolean).length;
  wpmEl.textContent = `${mins > 0 ? Math.round(words / mins) : 0} WPM`;
  lastWpmUpdate = now;
}

function updateSuggestions() {
  const results = predictor.predict(editor.currentWord(), editor.previousWord());
  if (!results.length) { suggestionsBar.classList.add('hidden'); return; }
  suggestionsBar.classList.remove('hidden');
  suggestionsList.innerHTML = results
    .map((w, i) => `<button class="suggestion-chip" data-word="${esc(w)}"><span class="sug-num">${i + 1}</span>${esc(w)}</button>`)
    .join('');
  suggestionsList.querySelectorAll('.suggestion-chip').forEach((btn) => {
    btn.onclick = () => { editor.acceptSuggestion(btn.dataset.word); afterEdit(); };
  });
}

function updateLetterDisplay(label, confidence) {
  if (!classifier.isCalibrated()) {
    letterNameEl.textContent = '—';
    letterSubEl.textContent = 'calibrate to start';
    return;
  }
  letterNameEl.textContent = label || '—';
  letterSubEl.textContent = label ? `${Math.round(confidence * 100)}% confident` : 'show a sign';
}

// ── Canvas rendering ─────────────────────────────────────────────
function drawCandidateLetter(char, palm, dwellProgress) {
  const x = palm.x * canvas.width, y = palm.y * canvas.height - 96;
  const color = CONFIG.ACCENT;

  ctx.save();
  ctx.translate(x, y); ctx.scale(-1, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeStyle = char ? color + 'cc' : 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (char) { ctx.shadowColor = color; ctx.shadowBlur = 18; }
  ctx.fillStyle = char ? '#fff' : 'rgba(255,255,255,0.35)';
  ctx.font = 'bold 34px Inter, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(char || '?', 0, 0);
  ctx.restore();

  if (dwellProgress > 0) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, 47, -Math.PI / 2, -Math.PI / 2 + dwellProgress * Math.PI * 2);
    ctx.stroke(); ctx.restore();
  }
}

function drawSkeleton(hand, color) {
  window.drawConnectors(ctx, hand, window.HAND_CONNECTIONS, { color, lineWidth: 2 });
}

function drawFingerLabels(lHand) {
  const labels = [{ id: 8, text: 'TYPE' }, { id: 12, text: 'SPACE' }, { id: 16, text: 'BACK' }, { id: 20, text: 'NAV' }];
  labels.forEach(({ id, text }) => {
    const x = lHand[id].x * canvas.width, y = lHand[id].y * canvas.height;
    ctx.save(); ctx.translate(x, y - 30); ctx.scale(-1, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath(); ctx.roundRect(-23, -9, 46, 18, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 8px JetBrains Mono, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0); ctx.restore();
  });
}

function drawConfidenceRing(landmark, confidence, color) {
  const x = landmark.x * canvas.width, y = landmark.y * canvas.height;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.globalAlpha = 0.55; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + confidence * Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawCooldownArc(tip, now, last) {
  const progress = Math.min(1, (now - last) / CONFIG.COOLDOWN);
  if (progress >= 1) return;
  const x = tip.x * canvas.width, y = tip.y * canvas.height;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y, 13, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawPinchDot(thumb, finger, color, label) {
  const mx = ((thumb.x + finger.x) / 2) * canvas.width, my = ((thumb.y + finger.y) / 2) * canvas.height;
  ctx.save(); ctx.translate(mx, my); ctx.scale(-1, 1);
  ctx.fillStyle = color + '28'; ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 0); ctx.restore();
}

// On-screen backspace: hover either index fingertip over it and hold. Auto-repeats.
function drawBackspaceButton(lHand, rHand, now) {
  const { w, h, margin, leftFrac } = BS_BTN;
  const x = canvas.width * leftFrac;
  const y = canvas.height - h - margin;

  const hits = (hand) => {
    if (!hand) return false;
    const px = canvas.width * (1 - hand[8].x);
    const py = canvas.height * hand[8].y;
    return px >= x && px <= x + w && py >= y && py <= y + h;
  };
  const hovering = hits(lHand) || hits(rHand);

  let progress = 0;
  if (hovering) {
    if (bsDwellStart === 0) { bsDwellStart = now; bsLastFire = 0; }
    progress = Math.min(1, (now - bsDwellStart) / settings.dwellMs);
    if (now - bsDwellStart >= settings.dwellMs && now - bsLastFire >= BS_REPEAT_MS) {
      if (editor.backspace()) afterEdit();
      bsLastFire = now;
    }
  } else {
    bsDwellStart = 0;
  }

  const color = CONFIG.BACKSPACE_COLOR;
  ctx.save();
  ctx.fillStyle = hovering ? 'rgba(255,93,93,0.16)' : 'rgba(0,0,0,0.5)';
  ctx.strokeStyle = hovering ? color : 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill(); ctx.stroke();

  if (progress > 0) {
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.clip();
    ctx.fillStyle = color + '45';
    ctx.fillRect(x, y, w * progress, h);
    ctx.restore();
  }

  ctx.fillStyle = hovering ? '#fff' : 'rgba(255,255,255,0.7)';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⌫  Backspace', x + w / 2, y + h / 2 - 7);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '8px JetBrains Mono, monospace';
  ctx.fillText('HOVER TO DELETE', x + w / 2, y + h / 2 + 11);
  ctx.restore();
}

// ── Public actions ───────────────────────────────────────────────
export function copyText() {
  const t = editor.serialize();
  if (t) navigator.clipboard?.writeText(t).then(() => toast('Copied to clipboard'));
}

export function exportText() {
  const t = editor.serialize();
  if (!t) return;
  const blob = new Blob([t], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `handtype-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Exported .txt');
}

export function clearText() {
  editor.clear();
  sessionStart = null; lastWpmUpdate = 0;
  wpmEl.textContent = '— WPM';
  afterEdit();
}

export function undo() { if (editor.undo()) afterEdit(); }

function toggleSwap() {
  settings.swapHands = !settings.swapHands;
  storage.saveSettings(settings);
  toast(settings.swapHands ? 'Hands swapped' : 'Hands restored');
}

function setInputMode(mode) {
  settings.inputMode = mode;
  storage.saveSettings(settings);
  document.querySelectorAll('[data-mode]').forEach((b) =>
    b.classList.toggle('active', b.dataset.mode === mode));
}

// ── Utilities ────────────────────────────────────────────────────
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function toast(msg) {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg; el.setAttribute('role', 'status');
  c.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-show'));
  setTimeout(() => { el.classList.remove('toast-show'); setTimeout(() => el.remove(), 300); }, 2200);
}

function updateCalibBadge() {
  if (!calibBadge) return;
  const n = classifier.calibratedLetters().length;
  calibBadge.textContent = n ? `${n}/26 tuned` : 'starter model';
  calibBadge.classList.toggle('on', n > 0);
}

// ── Init ─────────────────────────────────────────────────────────
(function init() {
  settings = { ...DEFAULT_SETTINGS, ...(storage.loadSettings() || {}) };

  predictor = createPredictor(storage.loadLearned(), storage.saveLearned);
  classifier = createClassifier(storage.loadCalibration(), storage.saveCalibration, getSeedSamples());
  smoother = createSmoother(classifier);

  editor = createEditor(storage.loadText());
  editor.setWordCompleteHandler((w, prev) => predictor.recordWord(w, prev));
  if (editor.serialize()) predictor.ingest(editor.serialize());

  wizard = createCalibrationWizard(classifier, () => {
    updateCalibBadge();
    toast('Calibration saved');
  });

  updateHTML();
  updateSuggestions();
  updateCalibBadge();
  updateLetterDisplay(null, 0);
  setInputMode(settings.inputMode);

  const on = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
  on('help-btn', () => document.getElementById('tutorial').classList.remove('hidden'));
  on('start-btn', () => document.getElementById('tutorial').classList.add('hidden'));
  on('copy-btn', copyText);
  on('export-btn', exportText);
  on('clear-btn', clearText);
  on('swap-btn', toggleSwap);
  on('calibrate-btn', () => { document.getElementById('tutorial').classList.add('hidden'); wizard.start(); });
  on('recalibrate-btn', () => { document.getElementById('settings-panel').classList.add('hidden'); wizard.start(); });
  on('settings-btn', () => document.getElementById('settings-panel').classList.toggle('hidden'));
  document.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => setInputMode(b.dataset.mode)));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const first = document.querySelector('.suggestion-chip');
      if (first) { editor.acceptSuggestion(first.dataset.word); afterEdit(); }
    } else if (e.key >= '1' && e.key <= '5') {
      const chip = document.querySelectorAll('.suggestion-chip')[+e.key - 1];
      if (chip) { editor.acceptSuggestion(chip.dataset.word); afterEdit(); }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault(); undo();
    } else if (e.key === 'h' || e.key === 'H') {
      document.getElementById('tutorial')?.classList.toggle('hidden');
    }
  });
})();
