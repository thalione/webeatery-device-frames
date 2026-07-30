# Live Preview Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a lead on the outreach preview page live-change the app name and primary color of the showcase app running inside both device-frame iframes, with no reload.

**Architecture:** Extend the existing origin-checked postMessage bridge (currently showcase→parent readiness only) with parent→showcase `CustomizeMessage`s. Protocol + `CustomizePanel` UI live in the shared `webeatery-device-frames` package; the showcase app (`template_restaurant_react/apps/web`) gains a guarded listener that re-applies the dathanna brand ramp + store name in place; `webeatery-website` wires the panel to both iframes.

**Tech Stack:** React, postMessage, dathanna palette ramp (via existing `brand.config.ts` chain), node --test (device-frames), vitest (template_restaurant_react), jest + RTL via next/jest (webeatery-website).

**Spec:** `docs/superpowers/specs/2026-07-29-live-customization-design.md` (same repo).

## Global Constraints

- Commit identity `hunter_araujo@msn.com` in every repo (`git config user.email` before first commit). NO `Co-Authored-By` trailers. Push after each commit.
- Repos + checkouts:
  - `webeatery-device-frames` → worktree `/Users/hunteraraujo/Dev/webeatery-device-frames/.claude/worktrees/device-frames` (branch `mini/device-frames`). Edit via worktree path ONLY.
  - `webeatery-website` → worktree `/Users/hunteraraujo/Dev/webeatery-website/.claude/worktrees/device-frames`. Edit via worktree path ONLY.
  - `template_restaurant_react` → main checkout `/Users/hunteraraujo/Dev/template_restaurant_react` (no session worktree; create a feature branch `showcase-live-customize` off main first; repo may need to be added as a working directory).
- Message discriminator is exactly `webeateryCustomize: 1`. Name valid = trimmed length 1–40. Color valid = `/^#[0-9A-Fa-f]{6}$/`.
- Preview must never crash in front of a lead: every apply path swallows its own errors.
- Ship order: device-frames tag `v0.2.0` → template_restaurant_react listener → website wiring (sender-before-listener skew is a safe no-op, but don't do it).

## File Structure

```
webeatery-device-frames/
  customize/protocol.js        # plain ESM: validation, message build, sendCustomize (node-testable)
  customize/index.tsx          # CustomizePanel + re-exports of protocol (consumers import this)
  tests/customize.test.mjs     # node --test units for protocol.js
  package.json                 # + "./customize" export, version 0.2.0

template_restaurant_react/
  packages/core/src/config/brand.config.ts        # + export applyPrimaryColor(hex)
  packages/core/src/config/brand.config.test.ts   # NEW
  apps/web/src/config/brand.ts                    # extract + export injectBrandTokens()
  apps/web/src/showcase/customize.ts              # NEW: guarded listener
  apps/web/src/showcase/customize.test.ts         # NEW
  apps/web/src/showcase/boot.ts                   # install listener in bootShowcase
  apps/web/src/showcase/boot.test.ts              # + install-before-ready assertion

webeatery-website/
  components/outreach/device-switcher.tsx         # iframe refs, customize state, panel, resend-on-ready
  __tests__/device-switcher.test.tsx              # + panel/post/resend tests
  package.json                                    # dep tag → v0.2.0
```

---

### Task 1: device-frames — customize protocol (`protocol.js`)

**Files:**
- Create: `customize/protocol.js`
- Test: `tests/customize.test.mjs`
- Modify: `package.json` (exports map)

**Interfaces:**
- Produces (used by Tasks 2 and 8):
  - `CUSTOMIZE_VERSION = 1`
  - `SWATCHES: string[]` (8 hex strings)
  - `normalizeAppName(raw: unknown): string | null` — trimmed 1–40 chars or null
  - `isValidHex(hex: unknown): boolean` — `#RRGGBB`
  - `buildCustomizeMessage({ appName, primaryColor }): object | null` — only valid fields included; null when neither valid
  - `sendCustomize(iframes, msg, targetOrigin): void` — posts to every non-null iframe's contentWindow

- [ ] **Step 1: Write the failing test**

`tests/customize.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run (in device-frames worktree): `npm test`
Expected: FAIL — `Cannot find module '../customize/protocol.js'`

- [ ] **Step 3: Write implementation**

`customize/protocol.js`:

```js
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

/** Build a versioned message carrying only the valid fields; null if none. */
export function buildCustomizeMessage({ appName, primaryColor } = {}) {
  const msg = { webeateryCustomize: CUSTOMIZE_VERSION };
  const name = normalizeAppName(appName);
  if (name) msg.appName = name;
  if (isValidHex(primaryColor)) msg.primaryColor = primaryColor;
  return msg.appName || msg.primaryColor ? msg : null;
}

/** Post msg to every live iframe. targetOrigin is REQUIRED — never '*'. */
export function sendCustomize(iframes, msg, targetOrigin) {
  for (const frame of iframes) {
    frame?.contentWindow?.postMessage(msg, targetOrigin);
  }
}
```

Add to `package.json` exports (keep existing entries):

```json
"./customize": "./customize/index.tsx",
"./customize/protocol.js": "./customize/protocol.js"
```

(`./customize` resolves in Task 2; tests import `protocol.js` directly so `npm test` is green now.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all tests PASS (existing geometry/layout tests still green).

- [ ] **Step 5: Commit + push**

```bash
git add customize/protocol.js tests/customize.test.mjs package.json
git commit -m "feat(customize): versioned parent→showcase message protocol + sendCustomize"
git push origin mini/device-frames
```

---

### Task 2: device-frames — `CustomizePanel` component

**Files:**
- Create: `customize/index.tsx`
- Modify: `package.json` (version → 0.2.0)

**Interfaces:**
- Consumes: everything from `customize/protocol.js` (Task 1).
- Produces (used by Task 8): `webeatery-device-frames/customize` exporting `CustomizePanel`, `sendCustomize`, `buildCustomizeMessage`, `SWATCHES`, `CUSTOMIZE_VERSION`, and type `CustomizeMessage`.
  - `CustomizePanel({ initialName, initialColor, onChange, className }: { initialName?: string; initialColor?: string; onChange: (msg: CustomizeMessage) => void; className?: string })`
  - `onChange` fires debounced (150 ms), with the FULL current message (all valid fields), never null.

Note: node --test cannot parse TSX (see `tests/layout.test.mjs` header comment), so this component gets no test in this repo — Task 8's RTL tests exercise it through the website (next/jest transpiles the package via `transpilePackages`). All logic worth unit-testing already lives in `protocol.js`.

- [ ] **Step 1: Write the component**

`customize/index.tsx`:

```tsx
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
```

Bump `package.json` `"version"` to `"0.2.0"`.

- [ ] **Step 2: Verify package still green + TSX parses**

Run: `npm test` (protocol/geometry/layout tests — expect PASS).
Run: `npx tsc --noEmit --jsx react-jsx --module esnext --moduleResolution bundler --target es2020 --skipLibCheck customize/index.tsx` — expect no errors (react types come from the consumer; if `tsc`/types unavailable here, skip — Task 8's website typecheck covers it).

- [ ] **Step 3: Commit + push**

```bash
git add customize/index.tsx package.json
git commit -m "feat(customize): CustomizePanel component; v0.2.0"
git push origin mini/device-frames
```

- [ ] **Step 4: Land + tag v0.2.0**

Per repo practice (merge directly, no PR ceremony): merge `mini/device-frames` to `main`, push, then:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

STOP and confirm with the user before merging to main if anything else unexpected sits on the branch.

---

### Task 3: template_restaurant_react core — `applyPrimaryColor`

**Files:**
- Modify: `packages/core/src/config/brand.config.ts`
- Test: `packages/core/src/config/brand.config.test.ts` (create)

**Interfaces:**
- Consumes: internal `generateBrandFromPrimaryColor` (line ~35), `buildNewBrandConfig` (line ~66), `setBrandConfig`/`getBrandConfig` (design-tokens/tokens), `setNewBrandConfig` (tokens/brand).
- Produces (used by Task 5): `applyPrimaryColor(primaryColor: string): void` exported from `@restaurant/core` (brand.config is star-exported from core index line 38). Pure config: NO DOM access.

Branch setup (first template_restaurant_react task): `cd /Users/hunteraraujo/Dev/template_restaurant_react && git checkout main && git pull && git checkout -b showcase-live-customize && git config user.email` (must be `hunter_araujo@msn.com`).

- [ ] **Step 1: Write the failing test**

`packages/core/src/config/brand.config.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { applyPrimaryColor } from './brand.config'
import { setBrandConfig, getBrandConfig, sampleBrandConfigs } from '../design-tokens/tokens'
import { getBrandConfig as getNewBrandConfig } from '../tokens/brand'

describe('applyPrimaryColor', () => {
  beforeEach(() => {
    setBrandConfig({ ...sampleBrandConfigs.woodfire, restaurantName: 'Taco Loco', logoUrl: 'https://x/logo.png' })
  })

  it('rebuilds the brand ramp from the new primary', () => {
    applyPrimaryColor('#1E88E5')
    const cfg = getBrandConfig()
    expect(cfg.brand[500].toUpperCase()).toBe('#1E88E5')
    expect(cfg.appBackground).toBe(cfg.brand[700])
  })

  it('preserves restaurantName and logoUrl', () => {
    applyPrimaryColor('#1E88E5')
    const cfg = getBrandConfig()
    expect(cfg.restaurantName).toBe('Taco Loco')
    expect(cfg.logoUrl).toBe('https://x/logo.png')
  })

  it('updates the new token system too', () => {
    applyPrimaryColor('#43A047')
    expect(getNewBrandConfig().brandColor.toUpperCase()).toBe('#43A047')
  })
})
```

Adjust the `cfg.brand[500]` assertion if `generateBrandFromPrimaryColor` normalizes case — assert case-insensitively as shown.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/config/brand.config.test.ts`
Expected: FAIL — `applyPrimaryColor` is not exported.

- [ ] **Step 3: Implement**

In `brand.config.ts`: add `getBrandConfig` to the existing import from `'../design-tokens/tokens'` (line 13), then append:

```ts
/**
 * Live re-theme: rebuild both token systems from a new primary color,
 * preserving everything else in the current config (name, logo, accent).
 * Pure config — DOM (CSS var re-injection) is the web app's job; callers on
 * web must follow with injectBrandTokens(). Used by the showcase customize
 * listener.
 */
export function applyPrimaryColor(primaryColor: string): void {
  const current = getBrandConfig()
  const brand = generateBrandFromPrimaryColor(primaryColor)
  const next: BrandConfig = { ...current, brand, appBackground: brand[700] }
  setBrandConfig(next)
  setNewBrandConfig(buildNewBrandConfig(primaryColor, next))
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/core && npx vitest run src/config`
Expected: new tests PASS, nothing else breaks.

- [ ] **Step 5: Commit + push**

```bash
git add packages/core/src/config/brand.config.ts packages/core/src/config/brand.config.test.ts
git commit -m "feat(core): applyPrimaryColor — live brand re-ramp for showcase customization"
git push -u origin showcase-live-customize
```

---

### Task 4: template_restaurant_react web — extract `injectBrandTokens`

**Files:**
- Modify: `apps/web/src/config/brand.ts`
- Test: `apps/web/src/config/brand.test.ts` (create)

**Interfaces:**
- Produces (used by Task 5): `injectBrandTokens(): void` exported from `apps/web/src/config/brand.ts` — regenerates CSS vars (`generateCSSVariables()` from `@restaurant/core`) and writes them into the `#brand-tokens` `<style>` element (creating it if absent).

- [ ] **Step 1: Write the failing test**

`apps/web/src/config/brand.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { injectBrandTokens } from './brand'
import { setBrandConfig, sampleBrandConfigs } from '@restaurant/core'

describe('injectBrandTokens', () => {
  beforeEach(() => {
    document.getElementById('brand-tokens')?.remove()
    setBrandConfig(sampleBrandConfigs.woodfire)
  })

  it('creates #brand-tokens style element with CSS variables', () => {
    injectBrandTokens()
    const el = document.getElementById('brand-tokens')
    expect(el).toBeTruthy()
    expect(el!.textContent).toContain('--')
  })

  it('overwrites in place on second call (no duplicate elements)', () => {
    injectBrandTokens()
    injectBrandTokens()
    expect(document.querySelectorAll('#brand-tokens')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/config/brand.test.ts`
Expected: FAIL — `injectBrandTokens` not exported.

- [ ] **Step 3: Implement**

In `apps/web/src/config/brand.ts`, add the exported function and replace BOTH inline copies inside `initializeWebBrand` (main path lines ~27–38 and catch-fallback path ~70–80) with calls to it:

```ts
/** Regenerate CSS variables from the current brand config and (re)inject
 * them into the #brand-tokens style element. Safe to call repeatedly —
 * used at boot and by the showcase live-customize listener. */
export function injectBrandTokens(): void {
  const cssVariables = generateCSSVariables()
  let styleElement = document.getElementById('brand-tokens')
  if (!styleElement) {
    styleElement = document.createElement('style')
    styleElement.id = 'brand-tokens'
    document.head.appendChild(styleElement)
  }
  styleElement.textContent = cssVariables
}
```

The fallback path keeps its own try/catch around the call.

- [ ] **Step 4: Run tests**

Run: `cd apps/web && npx vitest run src/config`
Expected: PASS.

- [ ] **Step 5: Commit + push**

```bash
git add apps/web/src/config/brand.ts apps/web/src/config/brand.test.ts
git commit -m "refactor(web): extract injectBrandTokens from initializeWebBrand"
git push origin showcase-live-customize
```

---

### Task 5: template_restaurant_react web — customize listener

**Files:**
- Create: `apps/web/src/showcase/customize.ts`
- Test: `apps/web/src/showcase/customize.test.ts` (create)

**Interfaces:**
- Consumes: `applyPrimaryColor` (Task 3, from `@restaurant/core`), `injectBrandTokens` (Task 4), `useRestaurantStore` (from `@restaurant/core`).
- Produces (used by Task 6): `installCustomizeListener(win?: Window, getReferrer?: () => string): (() => void) | null` — null when referrer empty/unparseable (listener NOT installed); otherwise returns an uninstall function.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/showcase/customize.test.ts` (follow `guard.test.ts` vi-mock style):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const applyPrimaryColor = vi.fn()
const injectBrandTokens = vi.fn()
vi.mock('@restaurant/core', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  applyPrimaryColor: (hex: string) => applyPrimaryColor(hex),
}))
vi.mock('../config/brand', () => ({ injectBrandTokens: () => injectBrandTokens() }))

const { installCustomizeListener } = await import('./customize')
const { useRestaurantStore } = await import('@restaurant/core')

const EMBEDDER = 'https://webeatery.app'
let uninstall: (() => void) | null = null

function post(data: unknown, origin = EMBEDDER, source: unknown = window.parent) {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }))
}

function seedRestaurant(name = 'Original') {
  useRestaurantStore.getState().setRestaurant({ id: 'r1', name, locations: [] } as never)
}

describe('installCustomizeListener', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seedRestaurant()
    uninstall = installCustomizeListener(window, () => `${EMBEDDER}/preview?x=1`)
  })
  afterEach(() => { uninstall?.() })

  it('returns null and installs nothing when referrer empty', () => {
    uninstall?.(); uninstall = null
    expect(installCustomizeListener(window, () => '')).toBeNull()
  })

  it('returns null when referrer is unparseable', () => {
    uninstall?.(); uninstall = null
    expect(installCustomizeListener(window, () => '::not a url::')).toBeNull()
  })

  it('ignores messages from a different origin', () => {
    post({ webeateryCustomize: 1, appName: 'Evil' }, 'https://attacker.example')
    expect(useRestaurantStore.getState().restaurant?.name).toBe('Original')
  })

  it('ignores messages whose source is not window.parent', () => {
    post({ webeateryCustomize: 1, appName: 'Evil' }, EMBEDDER, null)
    expect(useRestaurantStore.getState().restaurant?.name).toBe('Original')
  })

  it('ignores wrong-shape messages', () => {
    post({ showcase: 'ready' })
    post({ webeateryCustomize: 2, appName: 'Nope' })
    post('string')
    expect(useRestaurantStore.getState().restaurant?.name).toBe('Original')
  })

  it('applies a valid appName to store and document.title', () => {
    post({ webeateryCustomize: 1, appName: '  New Name  ' })
    expect(useRestaurantStore.getState().restaurant?.name).toBe('New Name')
    expect(document.title).toBe('New Name')
  })

  it('rejects out-of-range names', () => {
    post({ webeateryCustomize: 1, appName: 'x'.repeat(41) })
    post({ webeateryCustomize: 1, appName: '   ' })
    expect(useRestaurantStore.getState().restaurant?.name).toBe('Original')
  })

  it('applies a valid primaryColor: applyPrimaryColor then injectBrandTokens', () => {
    post({ webeateryCustomize: 1, primaryColor: '#1E88E5' })
    expect(applyPrimaryColor).toHaveBeenCalledWith('#1E88E5')
    expect(injectBrandTokens).toHaveBeenCalledOnce()
  })

  it('rejects bad hex without touching brand', () => {
    post({ webeateryCustomize: 1, primaryColor: 'red' })
    post({ webeateryCustomize: 1, primaryColor: '#FFF' })
    expect(applyPrimaryColor).not.toHaveBeenCalled()
  })

  it('applies fields independently — bad color does not block good name', () => {
    post({ webeateryCustomize: 1, appName: 'Both', primaryColor: 'nope' })
    expect(useRestaurantStore.getState().restaurant?.name).toBe('Both')
    expect(applyPrimaryColor).not.toHaveBeenCalled()
  })

  it('a throwing apply never propagates', () => {
    applyPrimaryColor.mockImplementation(() => { throw new Error('boom') })
    expect(() => post({ webeateryCustomize: 1, primaryColor: '#1E88E5' })).not.toThrow()
  })

  it('uninstall stops listening', () => {
    uninstall?.(); uninstall = null
    post({ webeateryCustomize: 1, appName: 'After' })
    expect(useRestaurantStore.getState().restaurant?.name).toBe('Original')
  })
})
```

If jsdom's `window.parent === window` makes the `source: window.parent` default fail the source check, dispatch with explicit `source: window.parent` as shown (jsdom sets parent to window itself — the check `event.source === win.parent` then passes).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/showcase/customize.test.ts`
Expected: FAIL — module `./customize` does not exist.

- [ ] **Step 3: Implement**

`apps/web/src/showcase/customize.ts`:

```ts
import { useRestaurantStore, applyPrimaryColor } from '@restaurant/core'
import { injectBrandTokens } from '../config/brand'

/**
 * Parent→showcase live customization (spec §2,
 * webeatery-device-frames docs/superpowers/specs/2026-07-29-live-customization-design.md).
 * The embedding preview page posts { webeateryCustomize: 1, appName?, primaryColor? };
 * we re-theme in place. Guards mirror markShowcaseState's outbound rules:
 * the embedder origin comes from document.referrer, and we only ever listen
 * to window.parent. The preview must never crash in front of a lead — every
 * apply path swallows its own errors.
 */

type CustomizeMessage = { webeateryCustomize: 1; appName?: string; primaryColor?: string }

export function isCustomizeMessage(data: unknown): data is CustomizeMessage {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  if (d.webeateryCustomize !== 1) return false
  if (d.appName !== undefined && typeof d.appName !== 'string') return false
  if (d.primaryColor !== undefined && typeof d.primaryColor !== 'string') return false
  return true
}

function applyName(raw: string): void {
  const name = raw.trim()
  if (name.length < 1 || name.length > 40) return
  try {
    const { restaurant, setRestaurant } = useRestaurantStore.getState()
    if (restaurant) setRestaurant({ ...restaurant, name })
    document.title = name
  } catch { /* never break the preview */ }
}

function applyColor(hex: string): void {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return
  try {
    applyPrimaryColor(hex)
    injectBrandTokens()
  } catch { /* never break the preview */ }
}

/**
 * Install the listener. Returns an uninstall fn, or null when the embedder
 * origin cannot be established (empty/unparseable referrer — direct or
 * worker load): customization is then inert, the preview still works.
 * getReferrer is injectable for tests, same pattern as boot.ts getParent.
 */
export function installCustomizeListener(
  win: Window = window,
  getReferrer: () => string = () => document.referrer,
): (() => void) | null {
  const referrer = getReferrer()
  if (!referrer) return null
  let embedderOrigin: string
  try {
    embedderOrigin = new URL(referrer).origin
  } catch {
    return null
  }
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== embedderOrigin) return
    if (event.source !== win.parent) return
    if (!isCustomizeMessage(event.data)) return
    if (event.data.appName !== undefined) applyName(event.data.appName)
    if (event.data.primaryColor !== undefined) applyColor(event.data.primaryColor)
  }
  win.addEventListener('message', onMessage)
  return () => win.removeEventListener('message', onMessage)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/showcase/customize.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation-test the guards**

One at a time, break each guard, confirm the named test FAILS, restore:
1. Delete the `event.origin !== embedderOrigin` return → "ignores messages from a different origin" must fail.
2. Delete the `event.source !== win.parent` return → "ignores messages whose source is not window.parent" must fail.
3. Change `d.webeateryCustomize !== 1` to `!== 2` → shape/apply tests must fail.
4. Delete the `if (!referrer) return null` guard → empty-referrer test must fail (throws).

All four mutations must flip a test red. Restore the code, re-run, all green. A mutation that stays green = dead guard or dead test — fix before proceeding.

- [ ] **Step 6: Commit + push**

```bash
git add apps/web/src/showcase/customize.ts apps/web/src/showcase/customize.test.ts
git commit -m "feat(showcase): guarded parent→showcase live-customize listener (name + primary color)"
git push origin showcase-live-customize
```

---

### Task 6: template_restaurant_react web — wire listener into `bootShowcase`

**Files:**
- Modify: `apps/web/src/showcase/boot.ts`
- Test: `apps/web/src/showcase/boot.test.ts` (extend)

**Interfaces:**
- Consumes: `installCustomizeListener` (Task 5).
- Produces: listener installed during showcase boot, after store seeding and strictly before `markShowcaseState('ready')`.

- [ ] **Step 1: Write the failing test**

In `boot.test.ts`, add (adapting to the file's existing mock/setup style — it already mocks heavy deps to drive `bootShowcase`):

```ts
const installCustomizeListener = vi.fn()
vi.mock('./customize', () => ({
  installCustomizeListener: (...a: unknown[]) => installCustomizeListener(...a),
}))
```

and a test inside the existing `bootShowcase` describe block:

```ts
it('installs the customize listener during boot, before ready marker', async () => {
  await bootWithValidPayload() // reuse the suite's existing happy-path helper/arrangement
  expect(installCustomizeListener).toHaveBeenCalledOnce()
  // ready ordering: the listener must exist by the time the ready state is stamped
  expect(document.documentElement.dataset.showcaseState).toBe('ready')
})
```

If the suite has no happy-path boot helper, replicate the arrangement its existing success-path test uses (same mocks for `initializeWebBrand`, payload, renderApp).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/showcase/boot.test.ts`
Expected: new test FAILS (`installCustomizeListener` not called).

- [ ] **Step 3: Implement**

In `boot.ts`: `import { installCustomizeListener } from './customize'` and inside `bootShowcase`, immediately after `seedShowcaseStores(payload, restaurant)`:

```ts
seedShowcaseStores(payload, restaurant)
// Live customization from the embedding preview page (no-op when unframed).
installCustomizeListener()
renderAppFn(root)
```

- [ ] **Step 4: Run the whole showcase suite**

Run: `cd apps/web && npx vitest run src/showcase`
Expected: ALL PASS.

- [ ] **Step 5: Commit + push**

```bash
git add apps/web/src/showcase/boot.ts apps/web/src/showcase/boot.test.ts
git commit -m "feat(showcase): install customize listener in bootShowcase before ready marker"
git push origin showcase-live-customize
```

- [ ] **Step 6: Full repo verification + land**

Run: `cd apps/web && npm test` and `cd packages/core && npm test` — all green.
Then merge `showcase-live-customize` → `main` directly (repo practice: no PR ceremony), push. Showcase deploys via the normal preview app pipeline; the listener is inert until the website ships.

---

### Task 7: website — bump device-frames dep to v0.2.0

**Files:**
- Modify: `package.json` (line ~76), lockfile

**Interfaces:**
- Produces: `webeatery-device-frames/customize` importable in the website (Task 8). `transpilePackages` already lists the package in `next.config.ts:10` — no change needed there.

Precondition: Task 2 Step 4 done (tag `v0.2.0` exists on GitHub).

- [ ] **Step 1: Bump + install**

In the website worktree `package.json`, change the dep to:

```json
"webeatery-device-frames": "https://github.com/thalione/webeatery-device-frames/archive/refs/tags/v0.2.0.tar.gz",
```

Run: `npm install` (regenerates lockfile; verify `node_modules/webeatery-device-frames/customize/protocol.js` exists).

- [ ] **Step 2: Sanity check**

Run: `npx tsc --noEmit` — expect no NEW errors (pre-existing errors, if any, are not yours).

- [ ] **Step 3: Commit + push**

```bash
git add package.json package-lock.json
git commit -m "chore: bump webeatery-device-frames to v0.2.0 (customize protocol + panel)"
git push origin HEAD
```

---

### Task 8: website — wire `CustomizePanel` into `DeviceSwitcher`

**Files:**
- Modify: `components/outreach/device-switcher.tsx`
- Test: `__tests__/device-switcher.test.tsx` (extend)

**Interfaces:**
- Consumes: `CustomizePanel`, `sendCustomize`, type `CustomizeMessage` from `webeatery-device-frames/customize` (Tasks 1–2); existing `PREVIEW_ORIGIN`, `frameStates`, `DeviceView`.
- Produces: user-visible feature. Panel below the device tabs; changes post to both live iframes; full state re-sent to a frame when it flips to `ready`.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/device-switcher.test.tsx` (reuse the file's existing `asset`, `activeView`, `postShowcaseMessage` helpers):

```tsx
describe("customization", () => {
  function getIframePosts() {
    // Collect postMessage spies on both iframes' contentWindows.
    const frames = Array.from(document.querySelectorAll("iframe"));
    return frames.map((f) => {
      const cw = (f as HTMLIFrameElement).contentWindow!;
      const spy = jest.spyOn(cw, "postMessage");
      return spy;
    });
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("renders the customize panel", () => {
    render(<DeviceSwitcher token="tok123" asset={asset} />);
    expect(screen.getByTestId("customize-panel")).toBeInTheDocument();
  });

  it("posts a debounced customize message to BOTH iframes on name change", () => {
    render(<DeviceSwitcher token="tok123" asset={asset} />);
    const spies = getIframePosts();
    fireEvent.change(screen.getByTestId("customize-name"), { target: { value: "New Name" } });
    act(() => { jest.advanceTimersByTime(200); });
    for (const spy of spies) {
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ webeateryCustomize: 1, appName: "New Name" }),
        PREVIEW_ORIGIN,
      );
    }
  });

  it("re-sends full customization state to a frame when it becomes ready", () => {
    render(<DeviceSwitcher token="tok123" asset={asset} />);
    fireEvent.change(screen.getByTestId("customize-name"), { target: { value: "Kept Name" } });
    act(() => { jest.advanceTimersByTime(200); });
    const spies = getIframePosts();
    spies.forEach((s) => s.mockClear());
    postShowcaseMessage({ showcase: "ready", device: "phone" }, PREVIEW_ORIGIN);
    expect(spies[0]).toHaveBeenCalledWith(
      expect.objectContaining({ appName: "Kept Name" }),
      PREVIEW_ORIGIN,
    );
  });
});
```

Note: jsdom gives every iframe an about:blank `contentWindow`, so the spies attach fine. If `getIframePosts` ordering is ambiguous, key frames by their `title` attribute (`Live preview — phone` / `Live preview — desktop`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/device-switcher.test.tsx`
Expected: new tests FAIL (`customize-panel` not found).

- [ ] **Step 3: Implement**

In `device-switcher.tsx`:

1. Imports:

```tsx
import { useEffect, useRef, useState } from "react";
import { CustomizePanel, sendCustomize, type CustomizeMessage } from "webeatery-device-frames/customize";
```

2. Inside `DeviceSwitcher`, add refs + state:

```tsx
const phoneFrameRef = useRef<HTMLIFrameElement | null>(null);
const desktopFrameRef = useRef<HTMLIFrameElement | null>(null);
// Ephemeral by design (spec): lives only as long as the page.
const customizationRef = useRef<CustomizeMessage | null>(null);

const liveFrames = () => [phoneFrameRef.current, desktopFrameRef.current];

const handleCustomize = (msg: CustomizeMessage) => {
  customizationRef.current = msg;
  sendCustomize(liveFrames(), msg, PREVIEW_ORIGIN);
};
```

3. Resend-on-ready: inside the existing `onMessage` readiness handler, after `setFrameStates`, add — for each target that just flipped to `ready` — a resend. Concretely, extend the `setFrameStates` updater's enclosing scope:

```tsx
setFrameStates((prev) => {
  const out = { ...prev };
  for (const t of targets) {
    if (out[t] === "loading") {
      out[t] = next;
      if (next === "ready" && customizationRef.current) {
        const frame = t === "phone" ? phoneFrameRef.current : desktopFrameRef.current;
        sendCustomize([frame], customizationRef.current, PREVIEW_ORIGIN);
      }
    }
  }
  return out;
});
```

(Posting from inside the updater is a side effect React strict-mode may double-fire; sending the same message twice is idempotent, so this is acceptable. If the reviewer objects, move it to a `useEffect` keyed on `frameStates`.)

4. Render the panel under the tablist (inside the top-level flex column, after the tablist div):

```tsx
<CustomizePanel
  initialName={asset.name}
  initialColor="#FF0000"
  onChange={handleCustomize}
  className="flex w-full max-w-md flex-col gap-space-2xs rounded-2xl border border-border bg-card p-space-sm"
/>
```

5. Thread refs into `DeviceView` → iframe: add prop `iframeRef?: React.Ref<HTMLIFrameElement>` to `DeviceView`, pass `iframeRef={phoneFrameRef}` / `iframeRef={desktopFrameRef}` at the two call sites, and set `ref={iframeRef}` on the `<iframe>`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/device-switcher.test.tsx`
Expected: ALL pass (old + new).

- [ ] **Step 5: Full verification**

Run: `npm test` and `npx tsc --noEmit` and `npm run build`.
Expected: green / no new errors.

- [ ] **Step 6: Visual check (web-ui-verification skill)**

Boot the site dev server, open `/preview?token=<any dev token>` (or the page's dev/test path per `app/preview/page.tsx`), verify: panel renders under tabs; typing a name updates the phone frame header live; picking a swatch re-themes the app inside the frame; toggling to Desktop shows the same customization. Screenshot for the user.

- [ ] **Step 7: Commit + push**

```bash
git add components/outreach/device-switcher.tsx __tests__/device-switcher.test.tsx
git commit -m "feat(preview): live customize panel — name + primary color into both device frames"
git push origin HEAD
```

---

## Rollout / Landing order

1. Task 2 Step 4: device-frames `main` + tag `v0.2.0`.
2. Task 6 Step 6: template_restaurant_react `main` → preview app deploys (listener inert).
3. Tasks 7–8: website branch → land per repo practice → deploy.

Skew safety: old showcase + new website = messages ignored (no-op). New showcase + old website = listener never hears anything. Both fine.

## Explicitly out of scope (spec)

- Light/dark, colorful/muted schemes (future optional fields on `CustomizeMessage`).
- Any persistence (localStorage, backend, lead record).
- merchant-portal-react integration (future consumer of the same package exports).
