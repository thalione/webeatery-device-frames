'use client'

// Shared customization panel for preview surfaces (outreach page today,
// merchant portal later). Emits debounced CustomizeMessages; the consumer
// posts them into its iframes via sendCustomize. Ephemeral by design — no
// storage. Structure and control styling live here (label stacking, swatch
// geometry, the color-well's swatch pseudo-elements — things every consumer
// would otherwise have to rebuild); theme (card surface, fonts, colors of
// the surrounding chrome) stays with the consumer via className.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CUSTOMIZE_VERSION,
  SWATCHES,
  buildCustomizeMessage,
  isValidHex,
  normalizeAppName,
  sendCustomize,
  isValidBrightness,
  isValidStyle,
  isValidLogoUrl,
  LOGO_MAX_LENGTH,
  ICON_BRANDS,
  ICON_STYLES,
  isValidIconBrand,
  isValidIconStyle,
  type IconBrand,
  type IconStyleName,
} from './protocol.js'

export type CustomizeMessage = {
  webeateryCustomize: typeof CUSTOMIZE_VERSION
  appName?: string
  primaryColor?: string
  themeBrightness?: 'light' | 'dark'
  themeStyle?: 'colorful' | 'muted'
  logoUrl?: string
  iconBrand?: IconBrand
  iconStyle?: IconStyleName
}

export { CUSTOMIZE_VERSION, SWATCHES, buildCustomizeMessage, isValidHex, normalizeAppName, sendCustomize, isValidBrightness, isValidStyle, isValidLogoUrl, LOGO_MAX_LENGTH, ICON_BRANDS, ICON_STYLES, isValidIconBrand, isValidIconStyle }
export type { IconBrand, IconStyleName }

const DEBOUNCE_MS = 150

// Matches the app's own icon-style selector so the vocabulary stays consistent
// across surfaces (ICON_STYLE_LABELS in its ComponentShowcase page).
const ICON_STYLE_LABELS: Record<string, string> = {
  thin: 'Thin',
  regular: 'Regular',
  bold: 'Bold',
  thinDuo: 'Thin Duo',
  regularDuo: 'Regular Duo',
  boldDuo: 'Bold Duo',
  fill: 'Fill',
}

// The panel drives one icon family today; the protocol accepts more.
const PANEL_ICON_BRAND: IconBrand = 'phosphor'

// Swatch geometry: 40×40 hit area (minimum comfortable touch target) with a
// 24px visible dot centered inside. Selection ring is concentric — 2px gap
// then 2px ring — drawn with box-shadows so it adapts to the card surface.
const SWATCH_HIT = 40
const SWATCH_DOT = 24

// input[type=color] swatch pseudo-elements and :active press feedback can't
// be expressed inline — ship one tiny scoped stylesheet with the panel.
// Class-prefixed (wdf-) to stay collision-safe in any consumer.
const PANEL_CSS = `
.wdf-swatch { transition-property: transform; transition-duration: 120ms; }
.wdf-swatch:active { transform: scale(0.96); }
.wdf-colorwell { inline-size: ${SWATCH_DOT + 8}px; block-size: ${SWATCH_DOT + 8}px; padding: 0; border: 1px solid rgba(0,0,0,0.15); border-radius: 50%; background: none; cursor: pointer; }
.wdf-colorwell::-webkit-color-swatch-wrapper { padding: 2px; }
.wdf-colorwell::-webkit-color-swatch { border: none; border-radius: 50%; }
.wdf-colorwell::-moz-color-swatch { border: none; border-radius: 50%; }
`

export function CustomizePanel({
  initialName,
  initialColor,
  initialBrightness,
  initialStyle,
  initialIconStyle,
  onChange,
  className,
  appIconSlot,
}: {
  initialName?: string
  initialColor?: string
  initialBrightness?: 'light' | 'dark'
  initialStyle?: 'colorful' | 'muted'
  /** Defaults to 'fill' — the style the showcase itself boots on, so the
   * panel's first emit doesn't silently restyle a preview already on screen. */
  initialIconStyle?: IconStyleName
  onChange: (msg: CustomizeMessage) => void
  className?: string
  /** Consumer-supplied app-icon control (e.g. an upload trigger), rendered
   * as the third column of the Theme/Style row under an "App icon" label.
   * Omit to hide the column (e.g. on mobile, where there's no desktop frame
   * to show an icon in). */
  appIconSlot?: ReactNode
}) {
  const [name, setName] = useState(initialName ?? '')
  const [color, setColor] = useState(initialColor ?? SWATCHES[0])
  const [brightness, setBrightness] = useState(initialBrightness ?? 'light')
  const [style, setStyle] = useState(initialStyle ?? 'colorful')
  const [iconStyle, setIconStyle] = useState<string>(initialIconStyle ?? 'fill')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  // Full-state emit: every change re-sends name, color, brightness, style and
  // icon style so a consumer can treat the latest message as the whole
  // customization state. Re-sending an unchanged icon style costs nothing —
  // the showcase early-returns on an unchanged style id, and icons subscribe
  // to its store rather than remounting.
  const emit = (nextName: string, nextColor: string, nextBrightness: string, nextStyle: string, nextIconStyle: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const msg = buildCustomizeMessage({
        appName: nextName,
        primaryColor: nextColor,
        themeBrightness: nextBrightness,
        themeStyle: nextStyle,
        iconBrand: PANEL_ICON_BRAND,
        iconStyle: nextIconStyle,
      })
      if (msg) onChange(msg as CustomizeMessage)
    }, DEBOUNCE_MS)
  }

  return (
    <div className={className} data-testid="customize-panel">
      <style>{PANEL_CSS}</style>
      <label style={{ display: 'block' }}>
        <FieldLabel>App name</FieldLabel>
        <input
          type="text"
          value={name}
          maxLength={40}
          placeholder="Your restaurant's name"
          onChange={(e) => { setName(e.target.value); emit(e.target.value, color, brightness, style, iconStyle) }}
          data-testid="customize-name"
          className="wdf-name"
          style={{
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            font: 'inherit',
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid rgba(0,0,0,0.15)',
            background: 'transparent',
            color: 'inherit',
          }}
        />
      </label>
      <div style={{ marginTop: 12 }}>
        <FieldLabel>Color scheme</FieldLabel>
      </div>
      <div
        role="group"
        aria-label="Color scheme"
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}
      >
        {SWATCHES.map((hex: string) => (
          <button
            key={hex}
            type="button"
            className="wdf-swatch"
            aria-label={`Use color ${hex}`}
            aria-pressed={color === hex}
            style={{
              width: SWATCH_HIT,
              height: SWATCH_HIT,
              padding: 0,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => { setColor(hex); emit(name, hex, brightness, style, iconStyle) }}
          >
            <span
              aria-hidden
              style={{
                width: SWATCH_DOT,
                height: SWATCH_DOT,
                borderRadius: '50%',
                background: hex,
                // Concentric selection ring: 2px surface-colored gap, then a
                // 2px ring in the swatch's own color.
                boxShadow: color === hex ? `0 0 0 2px rgba(255,255,255,0.9), 0 0 0 4px ${hex}` : 'none',
              }}
            />
          </button>
        ))}
        <input
          type="color"
          value={isValidHex(color) ? color : '#FF0000'}
          aria-label="Custom color"
          className="wdf-colorwell"
          onChange={(e) => { setColor(e.target.value); emit(name, e.target.value, brightness, style, iconStyle) }}
          data-testid="customize-color"
        />
      </div>
      {/* Theme above Style in a left column; App icon on the right. The
          stacked groups share one column width, and each button is flex:1,
          so all four Theme/Style buttons render the same size. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16, marginTop: 12 }}>
        <div style={{ flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SegmentedGroup label="Theme" options={['light', 'dark'] as const} value={brightness}
            onSelect={(v) => { setBrightness(v as 'light' | 'dark'); emit(name, color, v, style, iconStyle) }} />
          <SegmentedGroup label="Style" options={['colorful', 'muted'] as const} value={style}
            onSelect={(v) => { setStyle(v as 'colorful' | 'muted'); emit(name, color, brightness, v, iconStyle) }} />
        </div>
        {appIconSlot != null && (
          <div style={{ flexShrink: 0 }}>
            <FieldLabel>App icon</FieldLabel>
            {appIconSlot}
          </div>
        )}
      </div>
      {/* Full-width row of its own: seven pills need to wrap, which they can't
          do inside the two-column Theme/Style/App icon block above. */}
      <div style={{ marginTop: 12 }}>
        <SegmentedGroup label="Icon style" options={ICON_STYLES} value={iconStyle} wrap
          labels={ICON_STYLE_LABELS}
          onSelect={(v) => { setIconStyle(v); emit(name, color, brightness, style, v) }} />
      </div>
    </div>
  )
}

/** Shared section label — same treatment above every control group. */
function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: 'block', fontSize: '0.8em', fontWeight: 500, opacity: 0.7, marginBottom: 6 }}>
      {children}
    </span>
  )
}

function SegmentedGroup({
  label,
  options,
  value,
  onSelect,
  labels,
  wrap = false,
}: {
  label: string
  options: readonly string[]
  value: string
  onSelect: (v: string) => void
  /** Display text per option; the option value itself is used when absent. */
  labels?: Record<string, string>
  /** Let the row wrap and size buttons to their content — for groups with more
   * options than fit on one line (the icon-style row). */
  wrap?: boolean
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 8, flexWrap: wrap ? 'wrap' : 'nowrap' }}>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={value === opt}
            className="wdf-swatch"
            onClick={() => onSelect(opt)}
            style={{
              // flex:1 inside equal-width groups → all four Theme/Style
              // buttons render the same size regardless of label length.
              // A wrapping row sizes to content instead, or the last line
              // stretches its one or two pills across the full width.
              flex: wrap ? '0 0 auto' : 1,
              minHeight: 40,
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid rgba(0,0,0,0.15)',
              background: value === opt ? 'rgba(0,0,0,0.08)' : 'none',
              fontWeight: value === opt ? 600 : 400,
              fontFamily: 'inherit',
              fontSize: '0.85em',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {labels?.[opt] ?? opt}
          </button>
        ))}
      </div>
    </div>
  )
}
