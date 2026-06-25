import { onResults } from './ui.js';

const video = document.querySelector('.input_video');
const loadingEl = document.getElementById('loading-indicator');
const permissionEl = document.getElementById('permission-error');

const hands = new window.Hands({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
});

hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.65,
});

let modelReady = false;
hands.onResults(results => {
  if (!modelReady) {
    modelReady = true;
    if (loadingEl) loadingEl.style.display = 'none';
  }
  onResults(results);
});

const camera = new window.Camera(video, {
  onFrame: async () => { await hands.send({ image: video }); },
  width: 1280,
  height: 720,
});

camera.start().catch(() => {
  if (permissionEl) permissionEl.classList.remove('hidden');
  if (loadingEl) loadingEl.style.display = 'none';
});
