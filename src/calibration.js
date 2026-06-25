import { CONFIG } from './config.js';
import { LETTERS, ASL_HINTS } from './asl.js';

// Guided 26-letter calibration. The render loop calls feedHand(rightHand)
// each frame; the wizard advances through letters on its own timers.
// The user can Skip a letter or Finish early — only captured letters are
// recognized, so partial calibration is fine.
export function createCalibrationWizard(classifier, onDone) {
  const el = {
    overlay: document.getElementById('calibration'),
    letter: document.getElementById('calib-pose'),
    hint: document.getElementById('calib-instruction'),
    status: document.getElementById('calib-status'),
    count: document.getElementById('calib-count'),
    fill: document.getElementById('calib-fill'),
    cancel: document.getElementById('calib-cancel'),
    skip: document.getElementById('calib-skip'),
    finish: document.getElementById('calib-finish'),
  };

  let active = false;
  let phase = 'idle'; // 'ready' | 'capture' | 'done'
  let index = 0;
  let buffer = [];
  let timer = null;

  el.cancel?.addEventListener('click', () => stop(false));
  el.skip?.addEventListener('click', skip);
  el.finish?.addEventListener('click', () => stop(true));

  function start() {
    active = true;
    index = 0;
    el.overlay.classList.remove('hidden');
    beginLetter();
  }

  function beginLetter() {
    clearTimers();
    phase = 'ready';
    buffer = [];
    const letter = LETTERS[index];
    el.letter.textContent = letter;
    el.hint.textContent = ASL_HINTS[letter];
    el.count.textContent = `${index + 1} / ${LETTERS.length}`;

    let countdown = 3;
    setStatus(`Make the sign — capturing in ${countdown}…`, 0);
    timer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(timer);
        phase = 'capture';
        setStatus('Hold steady — capturing…', 0);
      } else {
        setStatus(`Make the sign — capturing in ${countdown}…`, 0);
      }
    }, 1000);
  }

  function feedHand(hand) {
    if (!active || phase !== 'capture') return;
    buffer.push(hand);
    setStatus('Hold steady — capturing…', buffer.length / CONFIG.CALIBRATION_FRAMES);

    if (buffer.length >= CONFIG.CALIBRATION_FRAMES) {
      classifier.addSamples(LETTERS[index], buffer);
      phase = 'done';
      setStatus('Got it ✓', 1);
      clearTimers();
      timer = setTimeout(advance, 650);
    }
  }

  function advance() {
    index++;
    if (index >= LETTERS.length) stop(true);
    else beginLetter();
  }

  function skip() {
    if (!active) return;
    clearTimers();
    advance();
  }

  function setStatus(text, progress) {
    if (el.status) el.status.textContent = text;
    if (el.fill) el.fill.style.width = `${Math.min(100, progress * 100)}%`;
  }

  function clearTimers() {
    clearInterval(timer);
    clearTimeout(timer);
  }

  function stop(done) {
    active = false;
    phase = 'idle';
    clearTimers();
    el.overlay.classList.add('hidden');
    if (done) onDone?.();
  }

  return { start, feedHand, stop: () => stop(false), isActive: () => active };
}
