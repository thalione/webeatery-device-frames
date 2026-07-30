import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOMIZE_VERSION, SWATCHES, normalizeAppName, isValidHex,
  buildCustomizeMessage, sendCustomize,
} from '../customize/protocol.js';

test('normalizeAppName trims and bounds 1-40', () => {
  assert.equal(normalizeAppName('  Taco Loco  '), 'Taco Loco');
  assert.equal(normalizeAppName(''), null);
  assert.equal(normalizeAppName('   '), null);
  assert.equal(normalizeAppName('x'.repeat(41)), null);
  assert.equal(normalizeAppName('x'.repeat(40)), 'x'.repeat(40));
  assert.equal(normalizeAppName(42), null);
});

test('isValidHex accepts #RRGGBB only', () => {
  assert.equal(isValidHex('#1E88E5'), true);
  assert.equal(isValidHex('#1e88e5'), true);
  assert.equal(isValidHex('1E88E5'), false);
  assert.equal(isValidHex('#FFF'), false);
  assert.equal(isValidHex('#GG0000'), false);
  assert.equal(isValidHex(null), false);
});

test('buildCustomizeMessage includes only valid fields, versioned', () => {
  assert.deepEqual(buildCustomizeMessage({ appName: ' A ', primaryColor: '#112233' }),
    { webeateryCustomize: CUSTOMIZE_VERSION, appName: 'A', primaryColor: '#112233' });
  assert.deepEqual(buildCustomizeMessage({ appName: '', primaryColor: '#112233' }),
    { webeateryCustomize: CUSTOMIZE_VERSION, primaryColor: '#112233' });
  assert.equal(buildCustomizeMessage({ appName: '', primaryColor: 'red' }), null);
});

test('sendCustomize posts to every non-null frame with targetOrigin', () => {
  const posts = [];
  const frame = (id) => ({ contentWindow: { postMessage: (m, o) => posts.push([id, m, o]) } });
  const msg = { webeateryCustomize: 1, appName: 'A' };
  sendCustomize([frame('a'), null, frame('b')], msg, 'https://p.example');
  assert.deepEqual(posts, [['a', msg, 'https://p.example'], ['b', msg, 'https://p.example']]);
});

test('sendCustomize survives a frame with no contentWindow', () => {
  assert.doesNotThrow(() => sendCustomize([{ contentWindow: null }], { webeateryCustomize: 1, appName: 'A' }, 'https://p.example'));
});

test('SWATCHES are 8 valid hexes', () => {
  assert.equal(SWATCHES.length, 8);
  for (const s of SWATCHES) assert.equal(isValidHex(s), true);
});
