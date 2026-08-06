'use client'

// Shared customization panel for preview surfaces (outreach page today,
// merchant portal later). Emits debounced CustomizeMessages; the consumer
// posts them into its iframes via sendCustomize. Ephemeral by design — no
// storage. Renders as a pill menu bar (Details / Color / Icons / Random)
// whose first three tabs open popovers positioned below the bar, floating
// over whatever the consumer renders underneath (the device preview). The
// panel ships its own chrome (surfaces, borders, glyphs) with a light/dark
// scheme; the consumer positions it and picks the scheme via colorScheme.
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
  randomizeCustomization,
  type IconBrand,
  type IconStyleName,
} from './protocol.js'
import {
  IconInfo,
  IconColor,
  IconIcons,
  IconRandom,
  IconPop,
  IconCool,
  IconLightMode,
  IconDarkMode,
  SwatchCircle,
  SwatchSelected,
  SwatchCustom,
  SwatchCustomSelected,
  ICON_STYLE_GLYPHS,
} from './icons'

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
  thinDuo: 'Thin Duotone',
  regularDuo: 'Regular Duotone',
  boldDuo: 'Bold Duotone',
  fill: 'Fill',
}

// The panel drives one icon family today; the protocol accepts more.
const PANEL_ICON_BRAND: IconBrand = 'phosphor'

// Display order for the Icons popover — the design interleaves each weight
// with its duotone variant, unlike the wire-order ICON_STYLES groups them.
const ICON_STYLE_ORDER: readonly IconStyleName[] = ['thin', 'thinDuo', 'regular', 'regularDuo', 'bold', 'boldDuo', 'fill']

// Menu geometry. Tab widths are fixed, so each popover's anchor point — the
// horizontal center of its tab — is arithmetic, not measurement:
// center(i) = MENU_PAD + i * (TAB_W + MENU_GAP) + TAB_W / 2.
const TAB_W = 96
const MENU_PAD = 4
const MENU_GAP = 4
const POPOVER_GAP = 8
const tabCenter = (i: number) => MENU_PAD + i * (TAB_W + MENU_GAP) + TAB_W / 2

// Chrome palette as custom properties so the dark override is one CSS block.
// Dark values live in one string reused by both the prefers-color-scheme
// media query and the forced data-wdf-scheme selector so they can't drift.
const DARK_VARS = `
  --wdf-bg: #27272a; --wdf-border: #3f3f46; --wdf-raised: #3f3f46;
  --wdf-press: #313135; --wdf-sel-border: #71717b; --wdf-pop-border: #9f9fa9;
  --wdf-text: #f4f4f5; --wdf-shadow: rgba(0,0,0,0.5);
`

// Hover/press/selected states can't be expressed inline — ship one tiny
// scoped stylesheet with the panel. Class-prefixed (wdf-) to stay
// collision-safe in any consumer.
const PANEL_CSS = `
.wdf-root {
  --wdf-bg: #f4f4f5; --wdf-border: #e4e4e7; --wdf-raised: #fdfdfd;
  --wdf-press: #fafafa; --wdf-sel-border: #9f9fa9; --wdf-pop-border: #71717b;
  --wdf-text: #18181b; --wdf-shadow: rgba(0,0,0,0.25);
}
@media (prefers-color-scheme: dark) { .wdf-root:not([data-wdf-scheme="light"]) { ${DARK_VARS} } }
.wdf-root[data-wdf-scheme="dark"] { ${DARK_VARS} }
.wdf-tab, .wdf-row { background: transparent; transition: background 120ms, border-color 120ms; cursor: pointer; }
.wdf-tab:hover, .wdf-row:hover { background: var(--wdf-raised); }
.wdf-tab:active, .wdf-row:active { background: var(--wdf-press); }
.wdf-tab[data-selected="true"], .wdf-row[data-selected="true"] { background: var(--wdf-raised); border-color: var(--wdf-sel-border); }
.wdf-swatch { transition: transform 120ms; }
.wdf-swatch:active { transform: scale(0.96); }
.wdf-customwell { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; }
`

type TabId = 'details' | 'color' | 'icons'

export function CustomizePanel({
  initialName,
  initialColor,
  initialBrightness,
  initialStyle,
  initialIconStyle,
  onChange,
  className,
  appIconSlot,
  colorScheme,
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
   * under an "App icon" label in the Details popover. Omit to hide it (e.g.
   * on mobile, where there's no desktop frame to show an icon in). */
  appIconSlot?: ReactNode
  /** Chrome scheme for the panel itself. Wire this to the consumer site's
   * theme toggle; when omitted the panel follows the OS prefers-color-scheme.
   * Independent of the preview's own Light/Dark mode control. */
  colorScheme?: 'light' | 'dark'
}) {
  const [name, setName] = useState(initialName ?? '')
  const [color, setColor] = useState(initialColor ?? SWATCHES[0])
  const [brightness, setBrightness] = useState(initialBrightness ?? 'light')
  const [style, setStyle] = useState(initialStyle ?? 'colorful')
  const [iconStyle, setIconStyle] = useState<string>(initialIconStyle ?? 'fill')
  const [openTab, setOpenTab] = useState<TabId | null>(null)
  // Last custom-picked color; seeded when initialColor isn't a preset so the
  // custom cell renders it (selected) on mount.
  const [customColor, setCustomColor] = useState<string | null>(
    initialColor && !SWATCHES.includes(initialColor) ? initialColor : null,
  )
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  // Dismissal: outside pointerdown or Escape closes the open popover.
  // pointerdown rather than click so the native OS color-picker dialog (which
  // dispatches no in-page pointer events) can't dismiss the popover under it.
  useEffect(() => {
    if (!openTab) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenTab(null)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenTab(null)
        tabRefs.current[openTab]?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openTab])

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

  // Details fields (name, logo) are the coded exception — randomizeCustomization
  // only ever returns the option-set fields. customColor is untouched too:
  // Random picks presets, so a previously picked custom color stays available.
  const onRandom = () => {
    const r = randomizeCustomization()
    setColor(r.primaryColor)
    setBrightness(r.themeBrightness)
    setStyle(r.themeStyle)
    setIconStyle(r.iconStyle)
    emit(name, r.primaryColor, r.themeBrightness, r.themeStyle, r.iconStyle)
  }

  const toggleTab = (id: TabId) => setOpenTab((prev) => (prev === id ? null : id))

  const menuTabs: Array<{ id: TabId; label: string; icon: ReactNode }> = [
    { id: 'details', label: 'Details', icon: <IconInfo /> },
    { id: 'color', label: 'Color', icon: <IconColor /> },
    { id: 'icons', label: 'Icons', icon: <IconIcons /> },
  ]

  return (
    <div
      ref={rootRef}
      className={className ? `wdf-root ${className}` : 'wdf-root'}
      data-wdf-scheme={colorScheme}
      data-testid="customize-panel"
      style={{ color: 'var(--wdf-text)' }}
    >
      <style>{PANEL_CSS}</style>
      <div style={{ position: 'relative', width: 'fit-content', margin: '0 auto' }}>
        <div
          role="toolbar"
          aria-label="Customize"
          style={{
            display: 'flex',
            gap: MENU_GAP,
            padding: MENU_PAD,
            background: 'var(--wdf-bg)',
            border: '1px solid var(--wdf-border)',
            borderRadius: 28,
            width: 'fit-content',
          }}
        >
          {menuTabs.map((tab) => (
            <TabButton
              key={tab.id}
              icon={tab.icon}
              label={tab.label}
              selected={openTab === tab.id}
              hasPopup
              onClick={() => toggleTab(tab.id)}
              testId={`customize-tab-${tab.id}`}
              buttonRef={(el) => { tabRefs.current[tab.id] = el }}
            />
          ))}
          <TabButton
            icon={<IconRandom />}
            label="Random"
            ariaLabel="Randomize colors and icons"
            onClick={onRandom}
            testId="customize-tab-random"
          />
        </div>

        {openTab === 'details' && (
          <Popover anchorIndex={0} label="Details">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 12px 12px', width: 258, boxSizing: 'border-box' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <SectionHeader>App name</SectionHeader>
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
                    border: '1px solid var(--wdf-sel-border)',
                    background: 'var(--wdf-raised)',
                    color: 'inherit',
                  }}
                />
              </label>
              {appIconSlot != null && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                  <SectionHeader>App icon</SectionHeader>
                  {appIconSlot}
                </div>
              )}
            </div>
          </Popover>
        )}

        {openTab === 'color' && (
          <Popover anchorIndex={1} label="Color">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center', padding: '8px 4px 4px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', width: 196 }}>
                <SectionHeader>Brand color</SectionHeader>
                <div
                  role="group"
                  aria-label="Brand color"
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 32px)', gap: 4, justifyContent: 'center' }}
                >
                  {SWATCHES.map((hex: string) => (
                    <button
                      key={hex}
                      type="button"
                      className="wdf-swatch"
                      aria-label={`Use color ${hex}`}
                      aria-pressed={color === hex}
                      onClick={() => { setColor(hex); emit(name, hex, brightness, style, iconStyle) }}
                      style={{ width: 32, height: 32, padding: 0, border: 'none', background: 'none', cursor: 'pointer', color: hex, display: 'inline-flex' }}
                    >
                      {color === hex ? <SwatchSelected /> : <SwatchCircle />}
                    </button>
                  ))}
                  {/* Custom cell: the palette glyph, tinted with the picked
                      color once there is one (ringed variant while active).
                      The native input sits invisibly on top so the whole cell
                      opens the OS picker. */}
                  <div className="wdf-swatch" style={{ position: 'relative', width: 32, height: 32, color: customColor ?? 'inherit' }}>
                    {customColor != null && color === customColor ? <SwatchCustomSelected /> : <SwatchCustom />}
                    <input
                      type="color"
                      value={customColor ?? (isValidHex(color) ? color : '#FF0000')}
                      aria-label="Custom color"
                      className="wdf-customwell"
                      onChange={(e) => { setCustomColor(e.target.value); setColor(e.target.value); emit(name, e.target.value, brightness, style, iconStyle) }}
                      data-testid="customize-color"
                    />
                  </div>
                </div>
              </div>
              <OptionPair
                header="Theme"
                options={[
                  { value: 'colorful', label: 'Pop', icon: <IconPop /> },
                  { value: 'muted', label: 'Cool', icon: <IconCool /> },
                ]}
                value={style}
                onSelect={(v) => { setStyle(v as 'colorful' | 'muted'); emit(name, color, brightness, v, iconStyle) }}
              />
              <OptionPair
                header="Mode"
                options={[
                  { value: 'light', label: 'Light', icon: <IconLightMode /> },
                  { value: 'dark', label: 'Dark', icon: <IconDarkMode /> },
                ]}
                value={brightness}
                onSelect={(v) => { setBrightness(v as 'light' | 'dark'); emit(name, color, v, style, iconStyle) }}
              />
            </div>
          </Popover>
        )}

        {openTab === 'icons' && (
          <Popover anchorIndex={2} label="Icons">
            <div role="radiogroup" aria-label="Icon style" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 4 }}>
              {ICON_STYLE_ORDER.map((s) => {
                const Glyph = ICON_STYLE_GLYPHS[s]
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={iconStyle === s}
                    className="wdf-row"
                    data-selected={iconStyle === s ? 'true' : undefined}
                    onClick={() => { setIconStyle(s); emit(name, color, brightness, style, s) }}
                    style={{
                      width: 250,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 0 8px 8px',
                      borderRadius: 24,
                      border: '1px solid transparent',
                      font: 'inherit',
                      fontSize: 16,
                      fontWeight: 500,
                      color: 'inherit',
                      textAlign: 'left',
                    }}
                  >
                    <Glyph />
                    {ICON_STYLE_LABELS[s]}
                  </button>
                )
              })}
            </div>
          </Popover>
        )}
      </div>
    </div>
  )
}

/** Pill tab: menu trigger/action by default, radio option inside popovers. */
function TabButton({
  icon,
  label,
  selected = false,
  onClick,
  radio = false,
  hasPopup = false,
  ariaLabel,
  testId,
  buttonRef,
}: {
  icon: ReactNode
  label: string
  selected?: boolean
  onClick: () => void
  radio?: boolean
  hasPopup?: boolean
  ariaLabel?: string
  testId?: string
  buttonRef?: (el: HTMLButtonElement | null) => void
}) {
  return (
    <button
      type="button"
      ref={buttonRef}
      className="wdf-tab"
      data-selected={selected ? 'true' : undefined}
      data-testid={testId}
      role={radio ? 'radio' : undefined}
      aria-checked={radio ? selected : undefined}
      aria-haspopup={hasPopup ? 'dialog' : undefined}
      aria-expanded={hasPopup ? selected : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        width: TAB_W,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '8px 0',
        borderRadius: 24,
        // Transparent baseline so the selected border causes no layout shift.
        border: '1px solid transparent',
        font: 'inherit',
        fontSize: 16,
        fontWeight: 500,
        color: 'inherit',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

/** Popover shell, centered under the menu tab at anchorIndex. */
function Popover({ anchorIndex, label, children }: { anchorIndex: number; label: string; children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-label={label}
      style={{
        position: 'absolute',
        top: `calc(100% + ${POPOVER_GAP}px)`,
        left: tabCenter(anchorIndex),
        transform: 'translateX(-50%)',
        zIndex: 50,
        background: 'var(--wdf-bg)',
        border: '1px solid var(--wdf-pop-border)',
        borderRadius: 28,
        boxShadow: '0 2px 2px var(--wdf-shadow)',
      }}
    >
      {children}
    </div>
  )
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
      {children}
    </span>
  )
}

/** Header + two-option radio row (Theme and Mode in the Color popover). */
function OptionPair({
  header,
  options,
  value,
  onSelect,
}: {
  header: string
  options: Array<{ value: string; label: string; icon: ReactNode }>
  value: string
  onSelect: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <SectionHeader>{header}</SectionHeader>
      <div role="radiogroup" aria-label={header} style={{ display: 'flex', gap: 4 }}>
        {options.map((opt) => (
          <TabButton
            key={opt.value}
            radio
            icon={opt.icon}
            label={opt.label}
            selected={value === opt.value}
            onClick={() => onSelect(opt.value)}
          />
        ))}
      </div>
    </div>
  )
}
