'use client'

// Shared device-preview frame: real bezel art around any children (a live
// <iframe> or a static <img>). Geometry comes from ../geometry.json — never
// hardcode positions here; the compositor reads the same manifest.
//
// Consumers using Next.js must add 'webeatery-device-frames' to
// `transpilePackages` (this file ships as TSX + static image imports).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import geometry from '../geometry.json'
import phoneFrame from '../assets/iphone-17-pro-max.png'
import browserFrame from '../assets/browser-chrome.png'

export type DeviceKind = 'phone' | 'browser'

type Geometry = (typeof geometry)['phone'] & { urlPill?: { x: number; y: number; width: number; height: number } }

const FRAME_SRC: Record<DeviceKind, unknown> = { phone: phoneFrame, browser: browserFrame }

function srcOf(mod: unknown): string {
  // Next static image imports are {src,...}; Vite's are plain strings.
  return typeof mod === 'string' ? mod : (mod as { src: string }).src
}

export function screenRectPct(device: DeviceKind) {
  const g = geometry[device] as Geometry
  return {
    left: (g.screenRegion.x / g.frameSize.width) * 100,
    top: (g.screenRegion.y / g.frameSize.height) * 100,
    width: (g.screenRegion.width / g.frameSize.width) * 100,
    height: (g.screenRegion.height / g.frameSize.height) * 100,
  }
}

export function browserScale(slotWidthPx: number): number {
  return slotWidthPx / geometry.browser.renderViewport.width
}

export function DevicePreview({
  device,
  urlText,
  fixedViewport = false,
  children,
  className,
}: {
  device: DeviceKind
  urlText?: string
  /** Render children in a literal renderViewport-sized box (390×844 phone,
   * 1280×800 browser) scaled to fill the screen slot — an embedded app then
   * lays out at real-device width instead of whatever the slot happens to be,
   * so breakpoints and text truncation match a real device. */
  fixedViewport?: boolean
  children: ReactNode
  className?: string
}) {
  const g = geometry[device] as Geometry
  const wrapRef = useRef<HTMLDivElement>(null)
  const [wrapWidth, setWrapWidth] = useState(0)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    // offsetWidth, NOT getBoundingClientRect(): the latter reports the
    // POST-transform size, so an ancestor mid-animation (e.g. a crossfade
    // holding the inactive view at scale(.98)) yields a too-small reading —
    // and ResizeObserver never re-fires when that transform settles, because
    // the layout size never changed. The stale scale then sticks forever and
    // the app renders short of the bezel.
    const measure = () => setWrapWidth(el.offsetWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = wrapWidth / g.frameSize.width // frame-art px → CSS px
  const rect = screenRectPct(device)
  const slotWidthPx = g.screenRegion.width * scale
  const slotHeightPx = g.screenRegion.height * scale

  const slotStyle: CSSProperties = {
    position: 'absolute',
    left: `${rect.left}%`,
    top: `${rect.top}%`,
    width: `${rect.width}%`,
    height: `${rect.height}%`,
    overflow: 'hidden',
    borderRadius: g.cornerRadius * scale,
    zIndex: 1,
  }

  const viewport = g.renderViewport
  // Cover, not contain: the phone's screen region and its 390×844 viewport
  // differ by ~0.5% in aspect, and a contain-fit would leave a visible sliver
  // of bare frame at the bottom. Centring the overflow splits the (sub-pixel
  // to ~1px) crop evenly instead of taking it all off one edge.
  const coverScale = Math.max(slotWidthPx / viewport.width, slotHeightPx / viewport.height)
  const inner: ReactNode =
    fixedViewport ? (
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: viewport.width,
          height: viewport.height,
          transform: `translate(-50%, -50%) scale(${coverScale})`,
          transformOrigin: 'center',
        }}
      >
        {children}
      </div>
    ) : (
      children
    )

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ position: 'relative', width: '100%', aspectRatio: `${g.frameSize.width} / ${g.frameSize.height}` }}
    >
      <div style={slotStyle}>{inner}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={srcOf(FRAME_SRC[device])}
        alt=""
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}
      />
      {device === 'browser' && urlText && g.urlPill && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: `${(g.urlPill.x / g.frameSize.width) * 100}%`,
            top: `${(g.urlPill.y / g.frameSize.height) * 100}%`,
            width: `${(g.urlPill.width / g.frameSize.width) * 100}%`,
            height: `${(g.urlPill.height / g.frameSize.height) * 100}%`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#d4d4d8',
            fontSize: g.urlPill.height * 0.42 * scale,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            pointerEvents: 'none',
            zIndex: 3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {urlText}
        </div>
      )}
    </div>
  )
}
