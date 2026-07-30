'use client'

// Shared customization panel for preview surfaces (outreach page today,
// merchant portal later). Emits debounced CustomizeMessages; the consumer
// posts them into its iframes via sendCustomize. Ephemeral by design — no
// storage. Structure and control styling live here (label stacking, swatch
// geometry, the color-well's swatch pseudo-elements — things every consumer
// would otherwise have to rebuild); theme (card surface, fonts, colors of
// the surrounding chrome) stays with the consumer via className.
import { useEffect, useRef, useState } from 'react'
import {
  CUSTOMIZE_VERSION,
  SWATCHES,
  buildCustomizeMessage,
  isValidHex,
  normalizeAppName,
  sendCustomize,
} from './protocol.js'

export type CustomizeMessage = {
  webeateryCustomize: typeof CUSTOMIZE_VERSION
  appName?: string
  primaryColor?: string
}

export { CUSTOMIZE_VERSION, SWATCHES, buildCustomizeMessage, isValidHex, normalizeAppName, sendCustomize }

const DEBOUNCE_MS = 150

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
  onChange,
  className,
}: {
  initialName?: string
  initialColor?: string
  onChange: (msg: CustomizeMessage) => void
  className?: string
}) {
  const [name, setName] = useState(initialName ?? '')
  const [color, setColor] = useState(initialColor ?? SWATCHES[0])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  // Full-state emit: every change re-sends name AND color so a consumer can
  // treat the latest message as the whole customization state.
  const emit = (nextName: string, nextColor: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const msg = buildCustomizeMessage({ appName: nextName, primaryColor: nextColor })
      if (msg) onChange(msg as CustomizeMessage)
    }, DEBOUNCE_MS)
  }

  return (
    <div className={className} data-testid="customize-panel">
      <style>{PANEL_CSS}</style>
      <label style={{ display: 'block' }}>
        <span style={{ display: 'block', fontSize: '0.8em', fontWeight: 500, opacity: 0.7, marginBottom: 6 }}>
          App name
        </span>
        <input
          type="text"
          value={name}
          maxLength={40}
          placeholder="Your restaurant's name"
          onChange={(e) => { setName(e.target.value); emit(e.target.value, color) }}
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
      <div
        role="group"
        aria-label="Primary color"
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}
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
            onClick={() => { setColor(hex); emit(name, hex) }}
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
          onChange={(e) => { setColor(e.target.value); emit(name, e.target.value) }}
          data-testid="customize-color"
        />
      </div>
    </div>
  )
}
