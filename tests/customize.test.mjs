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

import {
  isValidBrightness, isValidStyle, isValidLogoUrl, LOGO_MAX_LENGTH,
} from '../customize/protocol.js';

test('brightness/style validators are exact-string', () => {
  assert.equal(isValidBrightness('light'), true);
  assert.equal(isValidBrightness('dark'), true);
  assert.equal(isValidBrightness('Dark'), false);
  assert.equal(isValidBrightness(undefined), false);
  assert.equal(isValidStyle('colorful'), true);
  assert.equal(isValidStyle('muted'), true);
  assert.equal(isValidStyle('mutedlight'), false);
});

test('logoUrl validator: data-image base64 only, capped', () => {
  const png = 'data:image/png;base64,AAAA';
  assert.equal(isValidLogoUrl(png), true);
  assert.equal(isValidLogoUrl('data:image/webp;base64,AAAA'), true);
  assert.equal(isValidLogoUrl('data:image/svg+xml;base64,AAAA'), false);
  assert.equal(isValidLogoUrl('https://x/logo.png'), false);
  assert.equal(isValidLogoUrl('data:image/png;base64,' + 'A'.repeat(LOGO_MAX_LENGTH)), false);
  assert.equal(isValidLogoUrl(null), false);
});

test('buildCustomizeMessage carries new fields; theme-only message is NOT null', () => {
  assert.deepEqual(buildCustomizeMessage({ themeBrightness: 'dark', themeStyle: 'muted' }),
    { webeateryCustomize: 1, themeBrightness: 'dark', themeStyle: 'muted' });
  assert.deepEqual(buildCustomizeMessage({ logoUrl: 'data:image/png;base64,AA' }),
    { webeateryCustomize: 1, logoUrl: 'data:image/png;base64,AA' });
  assert.equal(buildCustomizeMessage({ themeBrightness: 'DARK', logoUrl: 'nope' }), null);
});

import {
  ICON_BRANDS, ICON_STYLES, isValidIconBrand, isValidIconStyle,
} from '../customize/protocol.js';

test('icon allowlists: 7 distinct styles, one brand', () => {
  assert.equal(ICON_STYLES.length, 7);
  assert.equal(new Set(ICON_STYLES).size, 7);
  assert.deepEqual(ICON_BRANDS, ['phosphor']);
});

test('isValidIconBrand is exact-string', () => {
  assert.equal(isValidIconBrand('phosphor'), true);
  assert.equal(isValidIconBrand('Phosphor'), false);
  assert.equal(isValidIconBrand(''), false);
  assert.equal(isValidIconBrand(undefined), false);
  assert.equal(isValidIconBrand(null), false);
  assert.equal(isValidIconBrand(42), false);
});

test('isValidIconStyle accepts the 7 names, not resolved registry ids', () => {
  for (const s of ICON_STYLES) assert.equal(isValidIconStyle(s), true);
  // The wire carries the style NAME; 'phosThin'/'phosFill' are the showcase's
  // internal ids and must never be accepted here.
  assert.equal(isValidIconStyle('phosFill'), false);
  assert.equal(isValidIconStyle('phosThin'), false);
  assert.equal(isValidIconStyle('Fill'), false);
  assert.equal(isValidIconStyle('duo'), false);
  assert.equal(isValidIconStyle(''), false);
  assert.equal(isValidIconStyle(null), false);
});

test('buildCustomizeMessage carries icon fields; icon-only message is NOT null', () => {
  assert.deepEqual(buildCustomizeMessage({ iconBrand: 'phosphor', iconStyle: 'boldDuo' }),
    { webeateryCustomize: 1, iconBrand: 'phosphor', iconStyle: 'boldDuo' });
  // Both are sticky axes on the showcase side, so either alone is meaningful.
  assert.deepEqual(buildCustomizeMessage({ iconStyle: 'thin' }),
    { webeateryCustomize: 1, iconStyle: 'thin' });
  assert.deepEqual(buildCustomizeMessage({ iconBrand: 'phosphor' }),
    { webeateryCustomize: 1, iconBrand: 'phosphor' });
});

test('buildCustomizeMessage drops invalid icon fields without dropping the message', () => {
  assert.deepEqual(buildCustomizeMessage({ primaryColor: '#112233', iconStyle: 'phosFill' }),
    { webeateryCustomize: 1, primaryColor: '#112233' });
  assert.deepEqual(buildCustomizeMessage({ iconBrand: 'lucide', iconStyle: 'bold' }),
    { webeateryCustomize: 1, iconStyle: 'bold' });
  assert.equal(buildCustomizeMessage({ iconBrand: 'lucide', iconStyle: 'Bold' }), null);
});
