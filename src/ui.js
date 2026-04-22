import { CONFIG } from './config.js';
import { getHandType, getDistance, ALPHABET_GROUPS } from './gestures.js';

const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const textDisplay = document.getElementById('text-display');
const modeIndicator = document.getElementById('type-mode-display');

let typedText = "", cursorPosition = 0, lastAction = 0;
let activeMenu = { group: ALPHABET_GROUPS.FIST, x: 0, y: 0, modeName: "FIST" };
let smoothY = 0; 
let lastMode = ""; // Track for hue change

export function onResults(results) {
    const now = Date.now();
    if (results.image) {
        canvasElement.width = results.image.width;
        canvasElement.height = results.image.height;
    }

    canvasCtx.save();
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    let lHand = results.leftHandLandmarks;
    let rHand = results.rightHandLandmarks;

    // --- RIGHT HAND: MODE SELECTION & HUE FLASH ---
    if (rHand) {
        const currentType = getHandType(rHand);
        if (currentType && currentType !== lastMode) {
            activeMenu.group = ALPHABET_GROUPS[currentType];
            activeMenu.modeName = currentType;
            lastMode = currentType;
            
            if(modeIndicator) {
                modeIndicator.innerText = `MODE: ${currentType} (${activeMenu.group.join(',')})`;
                // Trigger Hue Flash
                modeIndicator.classList.remove('glow-pulse');
                void modeIndicator.offsetWidth; // Force reflow
                modeIndicator.classList.add('glow-pulse');
            }
        }
        drawHand(rHand, "rgba(255,255,255,0.3)");
    }

    // --- LEFT HAND: ACTIONS & JOYSTICK ---
    if (lHand) {
        const thumb = lHand[4], index = lHand[8], middle = lHand[12], ring = lHand[16], pinky = lHand[20];
        activeMenu.x = lHand[20].x * canvasElement.width;
        
        const targetY = lHand[20].y * canvasElement.height;
        smoothY += (targetY - smoothY) * 0.15; 
        activeMenu.y = smoothY;

        drawFingerLabels(lHand);

        // JOYSTICK NAVIGATION (Pinky Pinch) with Acceleration
        if (getDistance(thumb, pinky) < CONFIG.PINCH_THRESHOLD) {
            const handX = lHand[0].x; 
            const center = 0.5, deadzone = 0.1;
            const distFromCenter = Math.abs(handX - center) - deadzone;

            if (distFromCenter > 0) {
                // Closer to edge = faster movement (50ms vs 200ms)
                const dynamicSpeed = Math.max(50, 200 - (distFromCenter * 500));
                
                if (now - lastAction > dynamicSpeed) {
                    if (handX < center - deadzone) { // Move Right (Mirrored)
                        cursorPosition = Math.min(typedText.length, cursorPosition + 1);
                    } else if (handX > center + deadzone) { // Move Left
                        cursorPosition = Math.max(0, cursorPosition - 1);
                    }
                    lastAction = now;
                }
            }
            drawHand(lHand, CONFIG.CURSOR_COLOR); // Visual feedback for NAV mode
        } else {
            drawHand(lHand, CONFIG.ACCENT_COLOR);
        }

        // Typing Actions
        if (now - lastAction > CONFIG.COOLDOWN) {
            const rPalm = rHand ? { x: rHand[0].x * canvasElement.width, y: rHand[0].y * canvasElement.height } : null;
            if (getDistance(thumb, index) < CONFIG.PINCH_THRESHOLD) {
                const char = getSelectedChar(rPalm);
                if (char) { insertText(char); lastAction = now; }
            } 
            else if (getDistance(thumb, middle) < CONFIG.PINCH_THRESHOLD) {
                insertText(" "); lastAction = now;
            }
            else if (getDistance(thumb, ring) < CONFIG.PINCH_THRESHOLD) {
                if (cursorPosition > 0) {
                    typedText = typedText.slice(0, cursorPosition - 1) + typedText.slice(cursorPosition);
                    cursorPosition--; lastAction = now;
                }
            }
        }
    }

    if (rHand && lHand) {
        const rPalm = { x: rHand[0].x * canvasElement.width, y: rHand[0].y * canvasElement.height };
        const idx = getSelectedIndex(rPalm);
        drawCrystalMenu(activeMenu.group, idx, activeMenu.x, activeMenu.y);
        drawGhostLetter(activeMenu.group[idx], rPalm, "AIM");
    }

    updateHTML();
    canvasCtx.restore();
}

function updateHTML() {
    textDisplay.innerHTML = `${typedText.slice(0, cursorPosition)}<span class="cursor"></span>${typedText.slice(cursorPosition)}`;
    textDisplay.scrollTop = textDisplay.scrollHeight;
}

function getSelectedIndex(rPalm) {
    const range = 220; 
    const diffY = rPalm.y - activeMenu.y;
    const idx = Math.floor(((diffY + (range/2)) / range) * activeMenu.group.length);
    return Math.max(0, Math.min(activeMenu.group.length - 1, idx));
}

function getSelectedChar(rPalm) { return rPalm ? activeMenu.group[getSelectedIndex(rPalm)] : null; }

function drawCrystalMenu(group, idx, anchorX, anchorY) {
    const itemS = 80, h = group.length * itemS, w = 95, offsetX = 140, offsetY = -h/2;
    canvasCtx.fillStyle = "rgba(255, 255, 255, 0.12)";
    canvasCtx.beginPath(); canvasCtx.roundRect(anchorX + offsetX - (w/2), anchorY + offsetY, w, h, 20); canvasCtx.fill();
    canvasCtx.strokeStyle = "rgba(255, 255, 255, 0.25)"; canvasCtx.stroke();

    group.forEach((char, i) => {
        const x = anchorX + offsetX, y = (anchorY + offsetY) + (i * itemS) + (itemS/2);
        if (i === idx) {
            canvasCtx.fillStyle = "rgba(255, 255, 255, 0.35)";
            canvasCtx.beginPath(); canvasCtx.arc(x, y, 35, 0, Math.PI * 2); canvasCtx.fill();
        }
        canvasCtx.save(); canvasCtx.translate(x, y); canvasCtx.scale(-1, 1);
        canvasCtx.fillStyle = i === idx ? "#fff" : "rgba(255,255,255,0.4)";
        canvasCtx.font = i === idx ? "bold 32px sans-serif" : "22px sans-serif";
        canvasCtx.textAlign = "center"; canvasCtx.textBaseline = "middle";
        canvasCtx.fillText(char, 0, 0); canvasCtx.restore();
    });
}

function drawGhostLetter(char, pos, label) {
    canvasCtx.save(); canvasCtx.translate(pos.x, pos.y - 100); canvasCtx.scale(-1, 1);
    canvasCtx.fillStyle = "rgba(255, 255, 255, 0.15)";
    canvasCtx.beginPath(); canvasCtx.arc(0, 0, 38, 0, Math.PI * 2); canvasCtx.fill();
    canvasCtx.strokeStyle = "rgba(255, 255, 255, 0.3)"; canvasCtx.stroke();
    canvasCtx.fillStyle = "#fff"; canvasCtx.font = "bold 28px sans-serif"; canvasCtx.textAlign = "center";
    canvasCtx.fillText(char, 0, 0); canvasCtx.font = "10px sans-serif"; canvasCtx.fillText(label, 0, 30); canvasCtx.restore();
}

function drawFingerLabels(lHand) {
    const labels = [{ id: 8, text: "TYPE" }, { id: 12, text: "SPACE" }, { id: 16, text: "BACK" }, { id: 20, text: "NAV" }];
    labels.forEach(l => {
        const x = lHand[l.id].x * canvasElement.width, y = lHand[l.id].y * canvasElement.height;
        canvasCtx.save(); canvasCtx.translate(x, y - 35); canvasCtx.scale(-1, 1);
        canvasCtx.fillStyle = "rgba(255,255,255,0.2)";
        canvasCtx.beginPath(); canvasCtx.roundRect(-25, -10, 50, 20, 6); canvasCtx.fill();
        canvasCtx.fillStyle = "#fff"; canvasCtx.font = "bold 9px monospace"; canvasCtx.textAlign = "center";
        canvasCtx.textBaseline = "middle"; canvasCtx.fillText(l.text, 0, 0); canvasCtx.restore();
    });
}

function insertText(c) {
    typedText = typedText.slice(0, cursorPosition) + c + typedText.slice(cursorPosition);
    cursorPosition++;
}

function drawHand(h, c) { window.drawConnectors(canvasCtx, h, window.HAND_CONNECTIONS, {color: c, lineWidth: 2}); }

(function init() {
    const toggle = document.getElementById('settings-toggle');
    const menu = document.getElementById('settings-menu');
    if(toggle) toggle.onclick = () => menu.classList.toggle('hidden');
    const clearBtn = document.getElementById('clear-text');
    if(clearBtn) clearBtn.onclick = () => { typedText = ""; cursorPosition = 0; updateHTML(); };
})();