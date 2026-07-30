# Customization Round 2 Implementation Plan (themes + logo)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add light/dark × colorful/muted theme toggles and a crop-based logo upload (desktop layout only) to the live preview customizer.

**Architecture:** Additive fields on the v1 `CustomizeMessage`; panel gains two segmented rows; showcase listener maps axes → one of 4 lowercase theme modes, stores it module-side, and the existing remount re-inits `ThemeProvider` (which sits inside the keyed `<App/>` — verified `App.tsx:86` / `main.tsx:365`); `ThemeContext`'s hardcoded `colorfullight` force is skipped showcase-only. Logo = portal-pattern crop in the website → data-URL message → restaurant store → `DesktopLayout` renders it.

**Tech Stack:** as round 1, plus `react-easy-crop` (website only).

**Spec:** `docs/superpowers/specs/2026-07-30-customization-round-2-design.md` (same repo). Read constraints from it; exact values below are copied from it.

## Global Constraints

- Commit identity `hunter_araujo@msn.com` everywhere; NO Co-Authored-By trailers; push after each commit.
- Checkouts: device-frames worktree `/Users/hunteraraujo/Dev/webeatery-device-frames/.claude/worktrees/device-frames` (branch `mini/device-frames`); TRS `/Users/hunteraraujo/Dev/template_restaurant_react` (branch `customize-round-2` off main); website worktree `/Users/hunteraraujo/Dev/webeatery-website/.claude/worktrees/device-frames` (branch `mini/device-frames`).
- New field validity: `themeBrightness` ∈ {`light`,`dark`}; `themeStyle` ∈ {`colorful`,`muted`}; `logoUrl` matches `^data:image\/(png|jpeg|webp);base64,` AND `length <= 1_500_000`.
- Theme modes are the LOWERCASE strings `'mutedlight' | 'colorfullight' | 'muteddark' | 'colorfuldark'` (`packages/core/src/design-tokens/theme-modes.ts:13`).
- Preview must never crash; apply paths swallow errors; failed applies never advance `lastAppliedHex`/`lastAppliedMode`.
- Real tenants keep the forced `colorfullight` — the unpin is gated on `document.documentElement.dataset.showcase === '1'`.
- Ship order: device-frames tag `v0.3.0` → TRS main → website main.

## File Structure

```
webeatery-device-frames/
  customize/protocol.js + protocol.d.ts    # +validators, +fields, null-rule fix
  customize/index.tsx                      # +two segmented rows
  tests/customize.test.mjs                 # +validator/message tests
  package.json                             # version 0.3.0

template_restaurant_react/
  apps/web/src/showcase/customize.ts       # theme state+apply, logo apply, consolidated remount
  apps/web/src/showcase/customize.test.ts  # extended
  apps/web/src/contexts/ThemeContext.tsx   # showcase-gated unpin
  apps/web/src/contexts/ThemeContext.test.tsx  # NEW (unpin guard)

webeatery-website/
  components/outreach/logo-upload/LogoUpload.tsx   # NEW (portal copy, adapted)
  components/outreach/logo-upload/cropImage.ts     # NEW (portal copy + downscale)
  components/outreach/device-switcher.tsx          # logo control ≥md + dialog wiring
  __tests__/device-switcher.test.tsx               # extended
  __tests__/logo-upload.test.tsx                   # NEW
  package.json                                     # dep v0.3.0 + react-easy-crop
```

---

### Task 1: device-frames — protocol v0.3.0

**Files:**
- Modify: `customize/protocol.js`, `customize/protocol.d.ts`, `package.json` (version 0.3.0)
- Test: `tests/customize.test.mjs` (extend)

**Interfaces:**
- Produces (Tasks 2, 3, 5 consume): `isValidBrightness(v): boolean`, `isValidStyle(v): boolean`, `isValidLogoUrl(v): boolean`, `LOGO_MAX_LENGTH = 1_500_000`; `buildCustomizeMessage({appName?, primaryColor?, themeBrightness?, themeStyle?, logoUrl?})` includes each valid field, null iff none valid.

- [ ] **Step 1: Write the failing tests** — append to `tests/customize.test.mjs`:

```js
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
```

- [ ] **Step 2: Run to verify fail** — `npm test` → FAIL (missing exports).
- [ ] **Step 3: Implement** — in `protocol.js` add:

```js
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
```

and extend `buildCustomizeMessage`:

```js
export function buildCustomizeMessage({ appName, primaryColor, themeBrightness, themeStyle, logoUrl } = {}) {
  const msg = { webeateryCustomize: CUSTOMIZE_VERSION };
  const name = normalizeAppName(appName);
  if (name) msg.appName = name;
  if (isValidHex(primaryColor)) msg.primaryColor = primaryColor;
  if (isValidBrightness(themeBrightness)) msg.themeBrightness = themeBrightness;
  if (isValidStyle(themeStyle)) msg.themeStyle = themeStyle;
  if (isValidLogoUrl(logoUrl)) msg.logoUrl = logoUrl;
  // Null iff NO field is valid — must check all five (a theme-only or
  // logo-only message is a real message).
  return msg.appName || msg.primaryColor || msg.themeBrightness || msg.themeStyle || msg.logoUrl
    ? msg
    : null;
}
```

Mirror in `protocol.d.ts`: extend `CustomizeMessagePayload` with the three optional fields (`themeBrightness?: 'light' | 'dark'`, `themeStyle?: 'colorful' | 'muted'`, `logoUrl?: string`), declare the three validators + `LOGO_MAX_LENGTH: number`, and widen `buildCustomizeMessage`'s param type. Bump `package.json` version to `0.3.0`.

- [ ] **Step 4: Verify pass** — `npm test` all green.
- [ ] **Step 5: Commit + push** — `git add -A && git commit -m "feat(customize): protocol v0.3 — theme axes + logoUrl fields, all-field null rule" && git push origin mini/device-frames`.

---

### Task 2: device-frames — panel theme toggles

**Files:**
- Modify: `customize/index.tsx`

**Interfaces:**
- Consumes: Task 1 validators/fields.
- Produces (Task 5): `CustomizePanel` props gain `initialBrightness?: 'light' | 'dark'` (default `'light'`), `initialStyle?: 'colorful' | 'muted'` (default `'colorful'`); emitted messages now carry all five fields (full-state). Type `CustomizeMessage` extended to match protocol.

Note: no node-side component test (TSX; round-1 precedent) — Task 7's website RTL tests exercise the rows.

- [ ] **Step 1: Implement.** In `customize/index.tsx`:
  1. Extend the `CustomizeMessage` type with the three optional fields (same literal unions as `protocol.d.ts`).
  2. Re-export `isValidBrightness, isValidStyle, isValidLogoUrl, LOGO_MAX_LENGTH` from `./protocol.js`.
  3. Add state + rows. New state: `const [brightness, setBrightness] = useState(initialBrightness ?? 'light')`, `const [style, setStyle] = useState(initialStyle ?? 'colorful')`. Widen `emit` to take the full 4-tuple (name, color, brightness, style) and build with all fields:

```tsx
const emit = (nextName: string, nextColor: string, nextBrightness: string, nextStyle: string) => {
  if (timer.current) clearTimeout(timer.current)
  timer.current = setTimeout(() => {
    const msg = buildCustomizeMessage({
      appName: nextName,
      primaryColor: nextColor,
      themeBrightness: nextBrightness,
      themeStyle: nextStyle,
    })
    if (msg) onChange(msg as CustomizeMessage)
  }, DEBOUNCE_MS)
}
```

(update the three existing `emit(...)` call sites to pass `brightness`/`style`; note `logoUrl` is NOT panel state — consumers merge it themselves.)
  4. Segmented row component (inside the file, below the panel):

```tsx
function SegmentedRow({
  label,
  options,
  value,
  onSelect,
}: {
  label: string
  options: readonly [string, string]
  value: string
  onSelect: (v: string) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
      <span style={{ fontSize: '0.8em', fontWeight: 500, opacity: 0.7, minWidth: 64 }}>{label}</span>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          role="radio"
          aria-checked={value === opt}
          className="wdf-swatch"
          onClick={() => onSelect(opt)}
          style={{
            minHeight: 40,
            padding: '6px 14px',
            borderRadius: 999,
            border: '1px solid rgba(0,0,0,0.15)',
            background: value === opt ? 'rgba(0,0,0,0.08)' : 'none',
            fontWeight: value === opt ? 600 : 400,
            font: 'inherit',
            fontSize: '0.85em',
            cursor: 'pointer',
            textTransform: 'capitalize',
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
```

  5. Render below the color group:

```tsx
<SegmentedRow label="Theme" options={['light', 'dark'] as const} value={brightness}
  onSelect={(v) => { setBrightness(v as 'light' | 'dark'); emit(name, color, v, style) }} />
<SegmentedRow label="Style" options={['colorful', 'muted'] as const} value={style}
  onSelect={(v) => { setStyle(v as 'colorful' | 'muted'); emit(name, color, brightness, v) }} />
```

- [ ] **Step 2: Verify** — `npm test` (protocol tests still green; no TSX runner).
- [ ] **Step 3: Commit + push** — `git commit -m "feat(customize): theme + style segmented rows in CustomizePanel"`.
- [ ] **Step 4 (controller): land + tag** — fast-forward main, `git tag v0.3.0 && git push origin v0.3.0`.

---

### Task 3: TRS — listener theme/logo apply + consolidated remount

**Files:**
- Modify: `apps/web/src/showcase/customize.ts`
- Test: `apps/web/src/showcase/customize.test.ts` (extend)

Branch setup (first TRS task): `git checkout main && git pull && git checkout -b customize-round-2`.

**Interfaces:**
- Consumes: existing `applyColor(hex, lastApplied, remount?)`, `applyName`, `installCustomizeListener` internals.
- Produces (Task 4 consumes): `getShowcaseThemeMode(): ThemeMode` and `setShowcaseThemeMode(mode: ThemeMode): void` exported from `customize.ts`; extended `isCustomizeMessage`. Listener behavior: apply order name → logo → theme → color, single tail remount iff theme-dirty OR color-dirty.

- [ ] **Step 1: Write the failing tests** — extend `customize.test.ts` (existing vi-mock arrangement; `remount` spy passed via options):

```ts
// New: theme + logo + consolidated remount
it('theme fields map to a lowercase mode, stored + single remount', () => {
  post({ webeateryCustomize: 1, themeBrightness: 'dark', themeStyle: 'muted' })
  expect(getShowcaseThemeMode()).toBe('muteddark')
  expect(remount).toHaveBeenCalledTimes(1)
})

it('one axis merges with stored state', () => {
  post({ webeateryCustomize: 1, themeStyle: 'muted' })   // light + muted
  expect(getShowcaseThemeMode()).toBe('mutedlight')
  post({ webeateryCustomize: 1, themeBrightness: 'dark' }) // keeps muted
  expect(getShowcaseThemeMode()).toBe('muteddark')
})

it('identical resulting mode does not remount again', () => {
  post({ webeateryCustomize: 1, themeBrightness: 'dark' })
  post({ webeateryCustomize: 1, themeBrightness: 'dark' })
  expect(remount).toHaveBeenCalledTimes(1)
})

it('invalid axis values are ignored', () => {
  post({ webeateryCustomize: 1, themeBrightness: 'DARK', themeStyle: 'neon' })
  expect(getShowcaseThemeMode()).toBe('colorfullight')
  expect(remount).not.toHaveBeenCalled()
})

it('theme + color in one message = ONE remount', () => {
  post({ webeateryCustomize: 1, themeBrightness: 'dark', primaryColor: '#1E88E5' })
  expect(remount).toHaveBeenCalledTimes(1)
})

it('valid logoUrl lands in the restaurant store, no remount', () => {
  const logo = 'data:image/png;base64,AAAA'
  post({ webeateryCustomize: 1, logoUrl: logo })
  expect(useRestaurantStore.getState().currentRestaurant?.logoUrl).toBe(logo)
  expect(remount).not.toHaveBeenCalled()
})

it('rejects logo: wrong scheme, oversize', () => {
  post({ webeateryCustomize: 1, logoUrl: 'https://x/logo.png' })
  post({ webeateryCustomize: 1, logoUrl: 'data:image/png;base64,' + 'A'.repeat(1_500_001) })
  expect(useRestaurantStore.getState().currentRestaurant?.logoUrl).toBeUndefined()
})

it('a remount-heavy message preserves name and logo (store survives)', () => {
  post({ webeateryCustomize: 1, appName: 'Kept', logoUrl: 'data:image/png;base64,AAAA' })
  post({ webeateryCustomize: 1, themeBrightness: 'dark' })
  expect(useRestaurantStore.getState().currentRestaurant?.name).toBe('Kept')
  expect(useRestaurantStore.getState().currentRestaurant?.logoUrl).toBe('data:image/png;base64,AAAA')
})
```

Also reset the module theme state between tests: export a test-only reset or re-derive per-install (see Step 3 — axes are closure state per install, so the existing per-test `installCustomizeListener` in `beforeEach` gives a fresh default; `getShowcaseThemeMode` module state must be reset in `beforeEach` via `setShowcaseThemeMode('colorfullight')`).

- [ ] **Step 2: Verify fail** — `cd apps/web && npx vitest run src/showcase/customize.test.ts` → new tests FAIL.
- [ ] **Step 3: Implement** in `customize.ts`:

```ts
import type { ThemeMode } from '@restaurant/core'   // from design-tokens/theme-modes (star-exported); verify the exact export path and adjust

// Module-level showcase theme mode — read by ThemeContext's init when
// data-showcase="1" (spec §3 unpin). Default matches the tenant force.
let showcaseThemeMode: ThemeMode = 'colorfullight'
export function getShowcaseThemeMode(): ThemeMode { return showcaseThemeMode }
export function setShowcaseThemeMode(mode: ThemeMode): void { showcaseThemeMode = mode }

const LOGO_MAX_LENGTH = 1_500_000
function isValidLogoUrl(v: string): boolean {
  return v.length <= LOGO_MAX_LENGTH && /^data:image\/(png|jpeg|webp);base64,/.test(v)
}

function applyLogo(logoUrl: string): void {
  if (!isValidLogoUrl(logoUrl)) return
  try {
    const { currentRestaurant, setRestaurant } = useRestaurantStore.getState()
    if (currentRestaurant) setRestaurant({ ...currentRestaurant, logoUrl })
  } catch { /* never break the preview */ }
}
```

Extend the type + guard:

```ts
type CustomizeMessage = {
  webeateryCustomize: 1
  appName?: string
  primaryColor?: string
  themeBrightness?: string
  themeStyle?: string
  logoUrl?: string
}
// isCustomizeMessage: add the three `!== undefined && typeof !== 'string' → false` checks.
```

Rework the listener body (closure state per install: `lastAppliedHex`, `lastAppliedMode = showcaseThemeMode`, `brightness: 'light' | 'dark' = 'light'`, `style: 'colorful' | 'muted' = 'colorful'`; note `applyColor` loses its internal `remount?.()` call — remove it there — and returns `{ applied: boolean, lastApplied }` OR keep signature and compare returned value to detect change: `colorDirty = newLast !== prevLast`):

```ts
const onMessage = (event: MessageEvent) => {
  if (event.origin !== embedderOrigin) return
  if (event.source !== win.parent) return
  if (!isCustomizeMessage(event.data)) return
  const d = event.data
  if (d.appName !== undefined) applyName(d.appName)
  if (d.logoUrl !== undefined) applyLogo(d.logoUrl)

  let themeDirty = false
  if (d.themeBrightness === 'light' || d.themeBrightness === 'dark') brightness = d.themeBrightness
  if (d.themeStyle === 'colorful' || d.themeStyle === 'muted') style = d.themeStyle
  const candidate = `${style}${brightness}` as ThemeMode  // colorfullight | colorfuldark | mutedlight | muteddark
  if (candidate !== lastAppliedMode) {
    try {
      setShowcaseThemeMode(candidate)
      lastAppliedMode = candidate
      themeDirty = true
    } catch { /* keep previous mode */ }
  }

  let colorDirty = false
  if (d.primaryColor !== undefined) {
    const prev = lastAppliedHex
    lastAppliedHex = applyColor(d.primaryColor, lastAppliedHex)
    colorDirty = lastAppliedHex !== prev
  }

  if (themeDirty || colorDirty) remount?.()
}
```

`applyColor` change: remove the `remount?.()` line and the `remount` parameter (still applies config + CSS vars + status-bar glyphs; returns new lastApplied as today). Update its doc comment: remount decision now lives in the listener tail.

- [ ] **Step 4: Verify pass** — `npx vitest run src/showcase/customize.test.ts` all green; then `npx vitest run src/showcase` (existing remount tests will need updating to the tail semantics — the round-1 "color apply invokes remount once / name-only doesn't / same-hex doesn't" tests must still hold and be adapted, not deleted).
- [ ] **Step 5: Mutation-test** — (a) make the tail fire on every message (`if (true)`) → name-only/no-op tests go red; (b) drop `candidate !== lastAppliedMode` → identical-mode test red; (c) drop the logo size cap → oversize test red. Restore, all green.
- [ ] **Step 6: Commit + push** — `git commit -m "feat(showcase): theme-mode + logo customize applies, consolidated single-remount tail"`, `git push -u origin customize-round-2`.

---

### Task 4: TRS — ThemeContext showcase-gated unpin

**Files:**
- Modify: `apps/web/src/contexts/ThemeContext.tsx` (init effect, lines ~126-133)
- Test: `apps/web/src/contexts/ThemeContext.test.tsx` (create)

**Interfaces:**
- Consumes: `getShowcaseThemeMode` (Task 3).
- Produces: showcase documents init from stored mode; tenants unchanged.

- [ ] **Step 1: Write the failing test** (jsdom; mock heavyweight core imports like the showcase suites do if needed):

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { ThemeProvider } from './ThemeContext'
import { setShowcaseThemeMode } from '../showcase/customize'

describe('ThemeProvider init pin', () => {
  afterEach(() => { delete document.documentElement.dataset.showcase; setShowcaseThemeMode('colorfullight') })

  it('tenant (no showcase flag): forces colorfullight', () => {
    setShowcaseThemeMode('muteddark') // must be ignored
    render(<ThemeProvider><div /></ThemeProvider>)
    expect(document.documentElement.getAttribute('data-theme')).toBe('colorfullight')
  })

  it('showcase: initializes from the stored showcase mode', () => {
    document.documentElement.dataset.showcase = '1'
    setShowcaseThemeMode('muteddark')
    render(<ThemeProvider><div /></ThemeProvider>)
    expect(document.documentElement.getAttribute('data-theme')).toBe('muteddark')
  })
})
```

- [ ] **Step 2: Verify fail** — `npx vitest run src/contexts/ThemeContext.test.tsx` (second test FAILS).
- [ ] **Step 3: Implement** — replace the init effect:

```ts
import { getShowcaseThemeMode } from '../showcase/customize'

// Force colorful light mode while theme system is being hardened.
// TODO: Restore user/system preference support once all four theme
// variants are visually verified across desktop and mobile.
// Showcase carve-out (round-2 customizer): the outreach preview initializes
// from the lead's live selection instead — real tenants keep the force.
useEffect(() => {
  const isShowcase = document.documentElement.dataset.showcase === '1'
  setGlobalThemeMode(isShowcase ? getShowcaseThemeMode() : 'colorfullight')
  updateTheme()
}, [updateTheme])
```

- [ ] **Step 4: Verify pass** — both tests green; `npx vitest run src/showcase src/contexts` green.
- [ ] **Step 5: Mutation-test the guard** — invert `isShowcase` → BOTH tests red; restore green.
- [ ] **Step 6: Commit + push**, then (controller) full `apps/web` + `packages/core` suites → merge `customize-round-2` → main → push.

---

### Task 5: website — deps + logo uploader components

**Files:**
- Modify: `package.json` (dep tag v0.3.0; add `react-easy-crop`)
- Create: `components/outreach/logo-upload/cropImage.ts`, `components/outreach/logo-upload/LogoUpload.tsx`
- Test: `__tests__/logo-upload.test.tsx` (create)

Precondition: Task 2 Step 4 done (tag v0.3.0 on GitHub).

**Interfaces:**
- Produces (Task 6): `<LogoUpload currentLogo={string | null} onApplied(dataUrl: string): void onViewDesktop(): void />` — full merged-dialog flow; calls `onApplied` with a validated data URL when the lead confirms the crop, then shows the desktop notice with **View on desktop** (`onViewDesktop`) and **Done**.

- [ ] **Step 1: bump + install** — dep URL → `v0.3.0.tar.gz`; `npm i react-easy-crop`; `npm install`; verify `node_modules/webeatery-device-frames/package.json` version 0.3.0.
- [ ] **Step 2: copy + adapt `cropImage.ts`** from `merchant-portal-react/apps/portal/src/components/cropImage.ts` — keep `loadImage` + PNG output verbatim, add downscaling (a native-resolution crop from a phone photo would blow the 1.5MB data-URL cap):

```ts
/** Longest output edge. 512px is plenty for the desktop nav logo slot and
 * keeps the PNG data URL far under the protocol's 1.5MB cap. */
const MAX_EDGE = 512

export async function cropToDataUrl(src: string, areaPixels: CropAreaPixels): Promise<string> {
  const image = await loadImage(src)
  const scale = Math.min(1, MAX_EDGE / Math.max(areaPixels.width, areaPixels.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(areaPixels.width * scale)
  canvas.height = Math.round(areaPixels.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('cropToDataUrl: canvas 2d context unavailable')
  ctx.drawImage(image, areaPixels.x, areaPixels.y, areaPixels.width, areaPixels.height, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}
```

(keep the portal's `CropAreaPixels` interface + `loadImage`; export both.)
- [ ] **Step 3: write failing tests** — `__tests__/logo-upload.test.tsx`, mocking `cropToDataUrl` (jsdom has no canvas — portal precedent) and `react-easy-crop` (render a stub div exposing an "area picked" trigger):

```tsx
jest.mock("@/components/outreach/logo-upload/cropImage", () => ({
  cropToDataUrl: jest.fn().mockResolvedValue("data:image/png;base64,CROPPED"),
}));
jest.mock("react-easy-crop", () => ({
  __esModule: true,
  default: ({ onCropComplete }: { onCropComplete: (a: unknown, b: unknown) => void }) => (
    <button data-testid="pick-area" onClick={() => onCropComplete(null, { x: 0, y: 0, width: 100, height: 100 })} />
  ),
}));

it("full flow: pick file → crop → apply → desktop notice → view on desktop", async () => {
  const onApplied = jest.fn();
  const onViewDesktop = jest.fn();
  render(<LogoUpload currentLogo={null} onApplied={onApplied} onViewDesktop={onViewDesktop} />);
  const file = new File(["x"], "logo.png", { type: "image/png" });
  fireEvent.change(screen.getByTestId("logo-file-input"), { target: { files: [file] } });
  fireEvent.click(screen.getByTestId("pick-area"));
  fireEvent.click(screen.getByRole("button", { name: /apply logo/i }));
  await screen.findByText(/appears in the desktop view/i);
  expect(onApplied).toHaveBeenCalledWith("data:image/png;base64,CROPPED");
  fireEvent.click(screen.getByRole("button", { name: /view on desktop/i }));
  expect(onViewDesktop).toHaveBeenCalled();
});

it("rejects a non-image file with inline copy, applies nothing", () => {
  const onApplied = jest.fn();
  render(<LogoUpload currentLogo={null} onApplied={onApplied} onViewDesktop={() => {}} />);
  const file = new File(["x"], "menu.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByTestId("logo-file-input"), { target: { files: [file] } });
  expect(screen.getByText(/png, jpg, or webp/i)).toBeInTheDocument();
  expect(onApplied).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: implement `LogoUpload.tsx`** — structure copied from the portal's `ImageUpload` (file input → crop dialog → confirm) with these adaptations: site `Dialog`/`Button` primitives from `components/ui/`; `aspect` hardcoded `1`; file-type guard (`image/png|jpeg|webp`, reject others with inline error); `handleConfirm` → `cropToDataUrl` → guard with `isValidLogoUrl` from `webeatery-device-frames/customize` → `onApplied(dataUrl)` → **stay in the dialog** and flip an internal `stage: 'crop' | 'confirmed'` to render the notice ("Your logo appears in the desktop view") with **View on desktop** and **Done** buttons; `data-testid="logo-file-input"` on the input. Trigger button shows current logo thumb when `currentLogo` set ("Replace logo").
- [ ] **Step 5: verify** — `npx jest __tests__/logo-upload.test.tsx` green; `npx tsc --noEmit` no NEW errors.
- [ ] **Step 6: Commit + push** — `git commit -m "feat(preview): logo upload with portal-style crop + desktop notice dialog; deps v0.3.0"`.

---

### Task 6: website — DeviceSwitcher wiring

**Files:**
- Modify: `components/outreach/device-switcher.tsx`
- Test: `__tests__/device-switcher.test.tsx` (extend)

**Interfaces:**
- Consumes: `LogoUpload` (Task 5), panel v0.3.0 (theme rows arrive automatically — `handleCustomize` already forwards whatever the panel emits).

- [ ] **Step 1: failing tests** (append to the customization describe):

```tsx
it("theme toggles post themeBrightness/themeStyle to both frames", () => {
  render(<DeviceSwitcher token="tok123" asset={asset} />);
  const spies = getIframePosts();
  fireEvent.click(screen.getByRole("radio", { name: "dark" }));
  act(() => { jest.advanceTimersByTime(200); });
  for (const spy of spies) {
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ themeBrightness: "dark", themeStyle: "colorful" }),
      PREVIEW_ORIGIN,
    );
  }
});

it("logo apply posts logoUrl and view-on-desktop switches tabs", async () => {
  render(<DeviceSwitcher token="tok123" asset={asset} />);
  const spies = getIframePosts();
  const file = new File(["x"], "logo.png", { type: "image/png" });
  fireEvent.change(screen.getByTestId("logo-file-input"), { target: { files: [file] } });
  fireEvent.click(screen.getByTestId("pick-area"));
  fireEvent.click(screen.getByRole("button", { name: /apply logo/i }));
  await screen.findByText(/appears in the desktop view/i);
  for (const spy of spies) {
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ logoUrl: "data:image/png;base64,CROPPED" }),
      PREVIEW_ORIGIN,
    );
  }
  fireEvent.click(screen.getByRole("button", { name: /view on desktop/i }));
  expect(screen.getByRole("tab", { name: "Desktop" })).toHaveAttribute("aria-selected", "true");
});

it("logo control is not rendered below md", () => {
  window.matchMedia = mobileMatchMedia; // reuse the suite's existing mobile matchMedia helper pattern
  render(<DeviceSwitcher token="tok123" asset={asset} />);
  expect(screen.queryByTestId("logo-file-input")).not.toBeInTheDocument();
});
```

(reuse the suite's existing mobile-viewport arrangement from the "mobile browsers" describe — copy its matchMedia setup rather than inventing `mobileMatchMedia` if the helper doesn't exist; move the cropImage/react-easy-crop jest.mocks to the top of the file so both suites share them.)

- [ ] **Step 2: verify fail.**
- [ ] **Step 3: implement** — in `DeviceSwitcher`: merge logo into the full-state ref so later panel emits don't drop it:

```tsx
const handleCustomize = (msg: CustomizeMessage) => {
  // Panel messages don't know about the logo — carry it forward so
  // resend-on-ready and later sends stay full-state.
  const merged = customizationRef.current?.logoUrl && !msg.logoUrl
    ? { ...msg, logoUrl: customizationRef.current.logoUrl }
    : msg;
  customizationRef.current = merged;
  sendCustomize(liveFrames(), merged, PREVIEW_ORIGIN);
};

const handleLogoApplied = (logoUrl: string) => {
  handleCustomize({ ...(customizationRef.current ?? { webeateryCustomize: 1 }), logoUrl });
};
```

Render beside the panel (inside the same card container, after `CustomizePanel`):

```tsx
{!isMobile && (
  <LogoUpload
    currentLogo={customizationRef.current?.logoUrl ?? null}
    onApplied={handleLogoApplied}
    onViewDesktop={() => setDevice("desktop")}
  />
)}
```

- [ ] **Step 4: verify** — file suite green, then `npm test`, `npx tsc --noEmit` (no new), `npm run build` green.
- [ ] **Step 5: Commit + push** — `git commit -m "feat(preview): wire theme toggles + logo upload into DeviceSwitcher (logo ≥ md only)"`.

---

### Task 7 (controller): verification + land + deploy

- [ ] Land TRS (Task 4 Step 6 if not done), website branch → main after visual pass.
- [ ] Visual pass (web-ui-verification): local dev site + local showcase (remember: rebuild `packages/core` dist first — stale-dist gotcha — and warm vite before the 8s window matters). Screenshot: 4 theme variants × phone + desktop; logo upload flow end-to-end; logo visible in desktop nav; mobile-width page hides logo control. Surface any broken variant to the owner (ship regardless — owner's gating call).
- [ ] Land website → deploy; verify deploy-engine `webeatery-website` deploy success for the landing commit; smoke prod.

## Rollout

1. device-frames main + tag `v0.3.0` (after Task 2).
2. TRS `customize-round-2` → main (after Task 4).
3. website → main (after Task 6 + visual pass).

Skew at any intermediate point is a per-field no-op.

## Explicitly out of scope

- Persistence/telemetry of customizations (candidate round 3).
- Restoring theme preference for real tenants (TODO stays pinned for them).
- Mobile-layout logo slot.
