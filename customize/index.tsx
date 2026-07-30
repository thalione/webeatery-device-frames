'use client'

// Shared customization panel for preview surfaces (outreach page today,
// merchant portal later). Emits debounced CustomizeMessages; the consumer
// posts them into its iframes via sendCustomize. Ephemeral by design — no
// storage. Styling is deliberately minimal: consumers skin via className.
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
      <label style={{ display: 'block' }}>
        <span>App name</span>
        <input
          type="text"
          value={name}
          maxLength={40}
          placeholder="Your restaurant's name"
          onChange={(e) => { setName(e.target.value); emit(e.target.value, color) }}
          data-testid="customize-name"
        />
      </label>
      <div role="group" aria-label="Primary color" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {SWATCHES.map((hex: string) => (
          <button
            key={hex}
            type="button"
            aria-label={`Use color ${hex}`}
            aria-pressed={color === hex}
            style={{ background: hex, width: 24, height: 24, borderRadius: '50%', border: color === hex ? '2px solid currentColor' : 'none' }}
            onClick={() => { setColor(hex); emit(name, hex) }}
          />
        ))}
        <input
          type="color"
          value={isValidHex(color) ? color : '#FF0000'}
          aria-label="Custom color"
          onChange={(e) => { setColor(e.target.value); emit(name, e.target.value) }}
          data-testid="customize-color"
        />
      </div>
    </div>
  )
}
