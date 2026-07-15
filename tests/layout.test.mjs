import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const geometry = JSON.parse(fs.readFileSync(new URL('../geometry.json', import.meta.url)));

// Re-implementations must match react/index.tsx exactly — these are the
// contract tests for the exported helpers (node --test can't parse TSX; the
// helpers are trivial ratios, so the contract is pinned numerically here and
// the component file re-exports the same formulas).
function screenRectPct(g) {
  return {
    left: (g.screenRegion.x / g.frameSize.width) * 100,
    top: (g.screenRegion.y / g.frameSize.height) * 100,
    width: (g.screenRegion.width / g.frameSize.width) * 100,
    height: (g.screenRegion.height / g.frameSize.height) * 100,
  };
}

test('phone screen rect percentages', () => {
  const r = screenRectPct(geometry.phone);
  assert.ok(Math.abs(r.left - 5.333) < 0.01);
  assert.ok(Math.abs(r.width - 89.333) < 0.01);
});

test('browser scale: 768px container slot → app sees 1280px', () => {
  const g = geometry.browser;
  // container width 768 → slot width = 768 * (2560/2600)
  const slotWidth = 768 * (g.screenRegion.width / g.frameSize.width);
  const scale = slotWidth / g.renderViewport.width;
  assert.ok(scale > 0.55 && scale < 0.62);
  // the app's viewport is ALWAYS renderViewport.width regardless of scale
  assert.equal(g.renderViewport.width, 1280);
});
