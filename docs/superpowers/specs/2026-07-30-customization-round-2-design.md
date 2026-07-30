# Live Preview Customization — Round 2 Design (themes + logo)

**Date:** 2026-07-30
**Status:** Approved
**Builds on:** `2026-07-29-live-customization-design.md` (name + primary color, shipped). Same repos: `webeatery-device-frames` (protocol + panel), `template_restaurant_react` (showcase apply), `webeatery-website` (wiring + logo UX).

## Goal

Extend the live preview customizer with (a) theme toggles — light/dark × colorful/muted — and (b) logo upload with a portal-style crop, shown in the desktop layout only.

## Decisions (from brainstorm)

- **Theme infrastructure already exists** in template_restaurant_react (both axes + 4 variants in `packages/core` theme-system/color-modes, `ThemeContext`, toggles in dev ThemeShowcase) but is pinned: `ThemeContext.tsx` force-sets `colorfullight` on every init behind an explicit TODO ("visually verify all four variants first"). This round unpins **showcase-only**; real tenants keep the forced `colorfullight` unchanged.
- **All 4 variants ship unverified** (owner's call, accepting the TODO's parked risk). Verification screenshots are taken during implementation and visual breakage is *surfaced*, not a blocker.
- **Logo uploader lives in the website**, copied from merchant-portal-react's `ImageUpload` + `cropToBlob` (react-easy-crop, 1:1 aspect, PNG out) and skinned with site tokens. The device-frames package stays dependency-free; the portal keeps its own uploader, so a shared package version buys nothing.
- **Merged dialog UX:** one dialog — pick file → crop/zoom → Apply → the same dialog flips to a confirmation: "Your logo appears in the desktop view" with **View on desktop** (switches the device tab) and **Done**.
- **No logo UI on mobile browsers** (below `md`): the desktop frame is unmounted there, so there is nothing to show a logo in.
- Logos render **only** in the desktop layout (`DesktopLayout` → `NavigationDesktop`); the mobile layout has no logo slot. The showcase currently forces `logoUrl: undefined` in fixtures (round-3 "name-not-logo") — this feature re-enables the logo path via the store only when a lead uploads one; the initial render remains logo-less.

## 1. Protocol (`webeatery-device-frames`, v0.3.0)

`CustomizeMessage` gains three optional fields; the discriminator stays `webeateryCustomize: 1` (additive change):

```ts
themeBrightness?: 'light' | 'dark'
themeStyle?: 'colorful' | 'muted'
logoUrl?: string   // data:image/(png|jpeg|webp);base64,… only; string length ≤ 1_500_000
```

`customize/protocol.js` (+ matching `protocol.d.ts`) adds:
- `isValidBrightness(v)`, `isValidStyle(v)` — exact-string checks.
- `isValidLogoUrl(v)` — regex `^data:image/(png|jpeg|webp);base64,` AND `v.length <= 1_500_000`. No http(s) URLs in v1.
- `buildCustomizeMessage` includes each field only when valid; message is null when NO field is valid (unchanged rule).

Full-state emit stays: every panel change re-sends all valid fields, so resend-on-ready and fallback-upgrade deliver the complete customization.

## 2. Panel (`webeatery-device-frames`)

Below the swatch row, two segmented control rows in the same visual language (40px hit areas, `role="radiogroup"`, `aria-checked` per option):
- **Theme:** `Light | Dark` (default Light)
- **Style:** `Colorful | Muted` (default Colorful)

Selections feed the same debounced full-state emit. `CustomizePanel` props gain `initialBrightness?` / `initialStyle?` (defaults as above). No logo UI in the package.

## 3. Showcase apply (`template_restaurant_react`)

### Unpin (showcase-only)
- New module state beside the customize listener (`apps/web/src/showcase/customize.ts`): `getShowcaseThemeMode(): ThemeMode` defaulting `'colorfullight'`; the listener updates it.
- `ThemeContext.tsx` init effect: when `document.documentElement.dataset.showcase === '1'`, skip the hardcoded `setGlobalThemeMode('colorfullight')` and initialize from `getShowcaseThemeMode()` instead. Non-showcase (real tenants): the force stays byte-identical. The TODO comment is updated to note the showcase carve-out.

### Listener
- `themeBrightness`/`themeStyle` validated (exact strings) → merged with the currently-stored axes → one of `colorfullight | colorfuldark | mutedlight | muteddark` → stored via the module state → **remount** (the round-1 remount callback), deduped: identical resulting mode does not remount. Remount re-runs ThemeProvider init → reads showcase mode → `updateTheme()` regenerates theme + brand CSS vars.
- `logoUrl` validated (same rule as protocol) → `setRestaurant({ ...currentRestaurant, logoUrl })`. Store subscription re-renders `DesktopLayout`; **no remount**. Mobile layout untouched.
- **Apply order within one message:** name → logo → theme mode → primary color, then a **single remount at the end** if (and only if) theme mode or primary color actually changed. The round-1 per-color remount call moves into this consolidated tail.
- All apply paths keep swallowing their own errors (lead-facing invariant).

### Fields interplay
- Initial render: forced red + `colorfullight` + no logo — the round-3 nudge posture is untouched until the lead acts.
- Status-bar glyph retint (round 1) keys off primary color only; dark mode's status strip inherits the themed header behind it — acceptable v1, surface in verification if it reads badly.

## 4. Website (`webeatery-website`)

- Copy `ImageUpload` + `cropToBlob` from `merchant-portal-react/apps/portal/src/components/` into `components/outreach/logo-upload/`, adapted: site tokens, 1:1 aspect, PNG out, client-only (`react-easy-crop` added to website deps). File-type/size validation with inline error copy before any message is sent.
- **"Add your logo"** control beside the CustomizePanel, rendered only when NOT `isMobile` (same state that unmounts the desktop frame).
- Merged dialog flow: pick → crop/zoom → **Apply logo** → `cropToBlob` → blob → data URL (FileReader) → guard with the package's `isValidLogoUrl` → merge into customization state → `sendCustomize` to both frames → dialog flips to confirmation ("Your logo appears in the desktop view") with **View on desktop** (`setDevice("desktop")`, close) and **Done** (close). Re-opening later starts at pick with the current logo previewed.
- Theme toggles arrive for free via the panel; `DeviceSwitcher` just forwards the richer messages. Resend-on-ready and fallback-upgrade already send full state.
- Dep bump to the v0.3.0 tag.

## 5. Edge cases

- **Deploy skew:** old showcase ignores unknown fields — per-field no-op, safe both directions.
- **Oversized/wrong-type logo:** rejected in the uploader with visible copy; nothing posted. Showcase re-validates anyway (defense in depth).
- **Remount preservation:** name/logo live in the restaurant store, which survives remount (same store instance) — a theme flip must not lose an uploaded logo or renamed app. Covered by an explicit test.
- **Mobile visitor:** no logo control, desktop frame unmounted; theme + color + name all still work on the phone frame.
- **zod note:** `restaurant.logoUrl` schema is `z.string().url().optional()` — data: URLs parse as valid URLs, and the store never re-validates on set; no schema change needed.

## 6. Testing

- **device-frames (node --test):** validators (brightness/style exact-match, logoUrl type/size boundary at 1_500_000), message building with new fields, full-state behavior.
- **template_restaurant_react (vitest):** 4-combo mode mapping; unpin guard (showcase init uses stored mode / tenant init still forces colorfullight); logo apply + reject (bad scheme, oversize); apply-order with single tail remount; per-axis dedupe (same mode twice → one remount); remount preserves store name/logo. **Mutation-test:** the unpin guard (remove showcase check → tenant test must fail), the logo size cap, and the single-remount consolidation.
- **webeatery-website (jest):** logo control absent below md; crop→apply posts a valid `logoUrl` to both frames; dialog confirmation's View-on-desktop switches tabs; theme toggles post fields; full-state resend includes logo/theme.
- **Controller verification pass:** live browser screenshots of all 4 theme variants × both frames + logo-on-desktop; visual breakage surfaced to the owner, not silently shipped and not a rollout blocker (owner's gating decision).

## Rollout

1. device-frames → main, tag `v0.3.0`.
2. template_restaurant_react → main (listener additions inert until fields arrive; unpin guard is showcase-scoped).
3. website → main (dep bump + uploader + toggles ship together).

Skew in any intermediate state is a safe no-op, but land in this order.
