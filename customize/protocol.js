// Customize protocol: parent preview page → showcase iframe. Plain ESM (no
// TSX) so node --test can import it directly; customize/index.tsx re-exports.
export const CUSTOMIZE_VERSION = 1;

export const SWATCHES = [
  '#E4572E', '#1E88E5', '#43A047', '#8E24AA',
  '#F4B400', '#00897B', '#D81B60', '#5D4037',
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
