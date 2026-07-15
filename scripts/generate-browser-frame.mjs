// Generates assets/browser-chrome.png — a browser-window frame with a
// TRANSPARENT screen window at exactly {x:20, y:160, w:2560, h:1600}
// (16:10, 2x the 1280x800 render viewport). Traffic lights + a BLANK URL
// pill are baked; URL text is overlaid by consumers (React component /
// compositor) so one asset serves every consumer. Deterministic; re-run to
// regenerate. Keep in sync with geometry.json's `browser` entry.
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from 'canvas';

const W = 2600, H = 1780;
const SCREEN = { x: 20, y: 160, w: 2560, h: 1600 };
const PILL = { x: 300, y: 40, w: 900, h: 80 };

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// Window body (chrome bar + border)
roundRectPath(ctx, 0, 0, W, H, 36);
ctx.fillStyle = '#1d1d1f';
ctx.fill();

// Traffic lights
for (const [cx, color] of [[70, '#ff5f57'], [124, '#febc2e'], [178, '#28c840']]) {
  ctx.beginPath();
  ctx.arc(cx, 80, 18, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

// Blank URL pill (text overlaid by consumers)
roundRectPath(ctx, PILL.x, PILL.y, PILL.w, PILL.h, PILL.h / 2);
ctx.fillStyle = '#2a2a2e';
ctx.fill();

// Punch the transparent screen window
ctx.save();
ctx.globalCompositeOperation = 'destination-out';
roundRectPath(ctx, SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h, 12);
ctx.fill();
ctx.restore();

const out = path.join(process.cwd(), 'assets', 'browser-chrome.png');
fs.writeFileSync(out, canvas.toBuffer('image/png'));
console.log(`wrote ${out} (${W}x${H}, screen ${JSON.stringify(SCREEN)})`);
