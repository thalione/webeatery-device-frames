// Customize protocol: parent preview page → showcase iframe. Plain ESM (no
// TSX) so node --test can import it directly; customize/index.tsx re-exports.
export const CUSTOMIZE_VERSION = 1;

// Figma order — reads left-to-right, top-to-bottom in the panel's 5×2 grid;
// the grid's 10th cell is the custom color picker, not a swatch.
export const SWATCHES = [
  '#FF0000', '#E4572E', '#F4B400', '#43A047', '#00897B',
  '#1E88E5', '#8E24AA', '#D81B60', '#5D4037',
];

export function normalizeAppName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  return name.length >= 1 && name.length <= 40 ? name : null;
}

export function isValidHex(hex) {
  return typeof hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hex);
}

export function isValidBrightness(v) {
  return v === 'light' || v === 'dark';
}

export function isValidStyle(v) {
  return v === 'colorful' || v === 'muted';
}

export const LOGO_MAX_LENGTH = 1_500_000;

export function isValidLogoUrl(v) {
  return typeof v === 'string'
    && v.length <= LOGO_MAX_LENGTH
    && /^data:image\/(png|jpeg|webp);base64,/.test(v);
}

// The wire carries the human-facing pair (brand + style name), not the
// showcase's resolved registry id (`phosThin`) — so a second icon family later
// is a value change, not a protocol change. Hardcoded rather than imported:
// this package must stay dependency-free of the app, and the showcase
// re-validates against its own copy of these lists anyway.
export const ICON_BRANDS = ['phosphor'];
export const ICON_STYLES = ['thin', 'regular', 'bold', 'thinDuo', 'regularDuo', 'boldDuo', 'fill'];

export function isValidIconBrand(v) {
  return ICON_BRANDS.includes(v);
}

export function isValidIconStyle(v) {
  return ICON_STYLES.includes(v);
}

// Details-tab fields: NEVER randomized. Every other wire field with a finite
// option set goes in RANDOM_OPTION_SETS — new fields are randomized by
// default; list them here to exempt them.
export const DETAILS_FIELDS = ['appName', 'logoUrl'];

export const RANDOM_OPTION_SETS = {
  primaryColor: SWATCHES,
  themeBrightness: ['light', 'dark'],
  themeStyle: ['colorful', 'muted'],
  iconBrand: ICON_BRANDS,
  iconStyle: ICON_STYLES,
};

/** Pure: pass a random source (0 ≤ r < 1) for deterministic tests. */
export function randomizeCustomization(random = Math.random) {
  const out = {};
  for (const [field, options] of Object.entries(RANDOM_OPTION_SETS)) {
    out[field] = options[Math.floor(random() * options.length)];
  }
  return out;
}

/** Build a versioned message carrying only the valid fields; null if none. */
export function buildCustomizeMessage({ appName, primaryColor, themeBrightness, themeStyle, logoUrl, iconBrand, iconStyle } = {}) {
  const msg = { webeateryCustomize: CUSTOMIZE_VERSION };
  const name = normalizeAppName(appName);
  if (name) msg.appName = name;
  if (isValidHex(primaryColor)) msg.primaryColor = primaryColor;
  if (isValidBrightness(themeBrightness)) msg.themeBrightness = themeBrightness;
  if (isValidStyle(themeStyle)) msg.themeStyle = themeStyle;
  if (isValidLogoUrl(logoUrl)) msg.logoUrl = logoUrl;
  if (isValidIconBrand(iconBrand)) msg.iconBrand = iconBrand;
  if (isValidIconStyle(iconStyle)) msg.iconStyle = iconStyle;
  // Null iff NO field is valid. Key count rather than an OR chain over every
  // field, so a new field is covered automatically instead of silently making
  // theme-only / logo-only / icon-only messages return null.
  return Object.keys(msg).length > 1 ? msg : null;
}

/** Post msg to every live iframe. targetOrigin is REQUIRED — never '*'. */
export function sendCustomize(iframes, msg, targetOrigin) {
  for (const frame of iframes) {
    frame?.contentWindow?.postMessage(msg, targetOrigin);
  }
}
