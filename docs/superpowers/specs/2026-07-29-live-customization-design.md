# Live Preview Customization — Design

**Date:** 2026-07-29
**Status:** Approved
**Repos touched:** `webeatery-device-frames` (protocol + UI), `template_restaurant_react` (showcase apply), `webeatery-website` (wiring). `merchant-portal-react` is a future consumer, not in scope.

## Goal

Let a lead viewing the outreach preview page live-customize the app running inside the device frames — starting with **app name** and **primary color**. Changes apply instantly (no iframe reload) to both the phone and desktop frames. This is the foundation; more options (color schemes, etc.) come later as new optional message fields.

## Decisions (from brainstorm)

- **Scope v1:** app name + primary color only. Light/dark and colorful/muted schemes explicitly deferred.
- **Persistence:** ephemeral — React state on the preview page only. No localStorage, no backend writes.
- **Placement:** protocol + customization UI live in the shared `webeatery-device-frames` package so `merchant-portal-react` reuses both later.
- **Forced red:** the showcase keeps booting with the forced `#FF0000` primary (the "not picked" nudge). The color picker then overrides it live — the lead choosing their color is the engagement moment.
- **Mechanism:** extend the existing origin-checked postMessage bridge (currently one-way, showcase → parent readiness) with parent → showcase customization messages. Rejected alternatives: URL-param + iframe reload (flicker per change, reload storm on color drag); hybrid live+params (two code paths, iframes never reload in practice — YAGNI).

## 1. Protocol (`webeatery-device-frames`)

New package export `webeatery-device-frames/customize`:

```ts
export type CustomizeMessage = {
  webeateryCustomize: 1            // versioned discriminator
  appName?: string                 // trimmed, 1–40 chars
  primaryColor?: string            // #RRGGBB
}
```

- `sendCustomize(iframes: (HTMLIFrameElement | null)[], msg: CustomizeMessage, targetOrigin: string): void` — posts to every non-null iframe's `contentWindow` with the explicit `targetOrigin`. Never `'*'`.
- `CustomizePanel` React component — controlled: text input for app name, `<input type="color">` plus ~8 curated swatches for primary color. Debounced (~150 ms) `onChange(msg: CustomizeMessage)` callback. Minimal styling with `className` passthrough; consumers skin it to their design system.
- Package version bumps to `0.2.0`; consumers pin the new tag tarball.

Adding future options (e.g. scheme toggles) = new optional fields on `CustomizeMessage`. The discriminator stays `1` until a breaking shape change.

## 2. Showcase-side apply (`template_restaurant_react/apps/web`)

New module `apps/web/src/showcase/customize.ts`, installed only in showcase mode, **before** `markShowcaseState('ready')` fires:

- **Origin check:** accept messages only from the embedding page's origin, derived from `new URL(document.referrer).origin` — the same source of truth `markShowcaseState` uses for outbound posts. Shape-validate against `CustomizeMessage` (discriminator + field types). Silently ignore anything else.
- **appName** → trim; if 1–40 chars: `useRestaurantStore` `setRestaurant({ ...restaurant, name })` (re-renders header/name everywhere) and `document.title = name`. Otherwise ignore the field.
- **primaryColor** → validate `#RRGGBB`; rebuild the brand config through the existing chain. Refactor `brand.config.ts` to export `applyPrimaryColor(hex: string): void` that runs `generateBrandFromPrimaryColor` → `buildNewBrandConfig` → `setBrandConfig`, then regenerates and re-injects the `#brand-tokens` CSS variables (same injection path `initializeWebBrand` uses). CSS vars swap in place — no reload.
- A message may carry one or both fields; each field is validated and applied independently (one bad field never blocks the other).
- Boot behavior unchanged: forced red + payload name until a customize message arrives.

## 3. Website wiring (`webeatery-website`)

- `DeviceSwitcher` holds refs to both iframes and owns customization state (`{ appName?, primaryColor? }`).
- Renders `CustomizePanel` (skinned with site tokens) below the device tabs.
- Panel `onChange` → merge into state → `sendCustomize([phoneRef.current, desktopRef.current], msg, PREVIEW_ORIGIN)`.
- `onChange` sends to both frames unconditionally — a frame still booting may miss the message, which is fine because of the resend below. (The showcase installs its listener before posting `ready`, so a `ready` frame can never miss one.)
- **Late-frame resend:** whenever a frame's state flips to `ready`, resend the full current customization state to that frame — covers the slow desktop iframe arriving after the lead already customized.
- Bump the `webeatery-device-frames` dependency tag to `v0.2.0` in `package.json` (stays in `transpilePackages`).

## 4. Edge cases and error handling

- **Deploy skew:** an older showcase build ignores unknown messages — safe no-op. No feature-detection round-trip in v1.
- **Invalid input:** bad hex or out-of-range name → showcase ignores that field. The preview must never crash in front of a lead.
- **Empty name in panel:** panel does not emit empty names; last valid name stands.
- **Mobile visitors:** desktop iframe is unmounted below `md`; `sendCustomize` skips null refs.

## 5. Testing

- **device-frames:** `node --test` units for message shape validation and `sendCustomize` (posts to all non-null frames, correct targetOrigin) — function-level, following the repo's existing test style.
- **template_restaurant_react:** units for the listener alongside existing `showcase/*.test.ts`: rejects wrong origin, rejects bad shape, applies name (store + title), applies color (brand config set + `#brand-tokens` re-injected), applies independently when one field invalid.
- **webeatery-website:** extend `__tests__/device-switcher.test.tsx`: panel renders, change posts to both iframes with `PREVIEW_ORIGIN`, resend-on-ready fires with full state.
- **Mutation-test the guards** (per standing practice): break the origin check and the shape check, watch the corresponding tests fail, restore.

## Rollout

1. Ship `template_restaurant_react` showcase listener first (inert without a sender; deploys via the normal preview app pipeline).
2. Tag `webeatery-device-frames` `v0.2.0`.
3. Ship `webeatery-website` wiring pinned to the new tag.

Order matters only in that the website sender should not ship before the showcase listener; skew in that direction is still a safe no-op.
