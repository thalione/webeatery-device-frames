// Type declarations for protocol.js — kept as plain ESM (see protocol.js
// header comment) so node --test can import it directly; this file gives
// TypeScript consumers (customize/index.tsx and downstream packages) real
// types instead of tripping TS7016 under strict/noImplicitAny.

export const CUSTOMIZE_VERSION: 1;

export const SWATCHES: string[];

export function normalizeAppName(raw: unknown): string | null;

export function isValidHex(hex: unknown): boolean;

export function isValidBrightness(v: unknown): boolean;

export function isValidStyle(v: unknown): boolean;

export const LOGO_MAX_LENGTH: number;

export function isValidLogoUrl(v: unknown): boolean;

export type IconBrand = 'phosphor';

export type IconStyleName =
  | 'thin'
  | 'regular'
  | 'bold'
  | 'thinDuo'
  | 'regularDuo'
  | 'boldDuo'
  | 'fill';

export const ICON_BRANDS: readonly IconBrand[];

export const ICON_STYLES: readonly IconStyleName[];

export function isValidIconBrand(v: unknown): boolean;

export function isValidIconStyle(v: unknown): boolean;

export type CustomizeMessagePayload = {
  webeateryCustomize: 1;
  appName?: string;
  primaryColor?: string;
  themeBrightness?: 'light' | 'dark';
  themeStyle?: 'colorful' | 'muted';
  logoUrl?: string;
  iconBrand?: IconBrand;
  iconStyle?: IconStyleName;
};

export function buildCustomizeMessage(fields?: {
  appName?: unknown;
  primaryColor?: unknown;
  themeBrightness?: unknown;
  themeStyle?: unknown;
  logoUrl?: unknown;
  iconBrand?: unknown;
  iconStyle?: unknown;
}): CustomizeMessagePayload | null;

export function sendCustomize(
  iframes: Array<
    | {
        contentWindow: { postMessage(msg: unknown, targetOrigin: string): void } | null;
      }
    | null
  >,
  msg: CustomizeMessagePayload,
  targetOrigin: string,
): void;
