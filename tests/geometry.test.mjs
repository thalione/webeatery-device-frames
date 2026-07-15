import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const geometry = JSON.parse(fs.readFileSync(new URL('../geometry.json', import.meta.url)));

function pngSize(file) {
  const buf = fs.readFileSync(file);
  // PNG: 8-byte signature, then IHDR: width @16, height @20 (big-endian u32)
  assert.equal(buf.readUInt32BE(12), 0x49484452, `${file} not a PNG (no IHDR)`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

for (const [name, g] of Object.entries(geometry)) {
  test(`${name}: frame PNG exists and matches frameSize`, () => {
    const file = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'assets', g.frameFile);
    const size = pngSize(file);
    assert.deepEqual(size, g.frameSize);
  });

  test(`${name}: screenRegion sits inside the frame`, () => {
    const { x, y, width, height } = g.screenRegion;
    assert.ok(x >= 0 && y >= 0);
    assert.ok(x + width <= g.frameSize.width);
    assert.ok(y + height <= g.frameSize.height);
  });

  test(`${name}: renderViewport aspect matches screenRegion aspect`, () => {
    const va = g.renderViewport.width / g.renderViewport.height;
    const sa = g.screenRegion.width / g.screenRegion.height;
    // phone frame art has a pre-existing ~0.5% mismatch (804/1748 vs 390/844) — 1% tolerance;
    // the browser frame is generated to match exactly.
    const tolerance = name === 'browser' ? 0.001 : 0.01;
    assert.ok(Math.abs(va - sa) / sa < tolerance, `${va} vs ${sa}`);
  });
}

test('browser: urlPill sits inside the chrome bar (above screenRegion)', () => {
  const g = geometry.browser;
  assert.ok(g.urlPill.y + g.urlPill.height <= g.screenRegion.y);
  assert.ok(g.urlPill.x + g.urlPill.width <= g.frameSize.width);
});
