import { onResults } from './ui.js';

const videoElement = document.querySelector('.input_video');
const holistic = new window.Holistic({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
});

holistic.setOptions({
  modelComplexity: 1,
  minDetectionConfidence: 0.75,
  minTrackingConfidence: 0.75
});

holistic.onResults(onResults);

const camera = new window.Camera(videoElement, {
  onFrame: async () => { await holistic.send({image: videoElement}); },
  width: 1280, height: 720
});
camera.start();