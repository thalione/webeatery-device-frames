# Demo Preview Restaurant — Design

**Date:** 2026-07-30
**Status:** Approved
**Builds on:** live-customization rounds 1–2 (shipped). Repos: `template_restaurant_react` (showcase modifier support), restaurant Supabase (data row + storage), `webeatery-website` (bare-/preview entry). No device-frames change.

## Goal

`webeatery.app/preview` (no token) renders a fully synthetic demo restaurant — name, categorized menu with descriptions and photos, and working option groups/options — indistinguishable in mechanics from a real lead preview, with the full customizer on top. A permanent sales showroom that burns no lead.

## Decisions (from brainstorm)

- **Entry:** bare `/preview` (empty hash) = demo. A present-but-invalid token keeps the generic gone-state — dead real links never morph into a demo.
- **Images:** ~20 curated Unsplash-licensed food photos uploaded once to the outreach Supabase storage bucket under the demo asset's folder (same `{bucket}/{assetId}/{file}` layout, treated as self-hosted). No hotlinking.
- **Modifiers are the new engineering scope:** showcase mode currently hardcodes `customizations: []` (`mapMenu.ts:68`); the payload item shape has no such field. This feature adds optional pass-through so the existing item-detail UI (which already renders customizations for real tenants) just works.
- **Data path:** one synthetic `outreach_assets` row + permanent token, served by the unmodified `get_preview_asset` RPC. No hash-mode enablement (stays fail-safed off).

## 1. Demo fixture — "The Golden Fork"

Hand-written, realistic menu copy (rename freely at implementation; owner may override):
- ~5 categories: Starters, Burgers & Mains, Wood-Fired Pizzas, Desserts, Drinks.
- 20–25 items, each with a 1–2 sentence description, sensible price, and `photo_url` for most (a few text-only items are realistic).
- **Option groups on most mains**, exercising the schema's range: Burger Temperature (required, single), Toppings (optional, multi, priced add-ons, maxSelections), Choice of Side (required, single, one default), Pizza Size (required, priced tiers), Drink Size. Shapes must satisfy `CustomizationItemSchema` (`packages/core/src/models/menu.ts:13-29`): `{ id: uuid, name, description?, isRequired, minSelections, maxSelections?, options: [{ id: uuid, name, price, isDefault, maxQuantity? }] }`.
- Fixture source-of-truth lives as a checked-in JSON (in `mac-mini-builder/outreach/demo/` beside the other outreach tooling) plus an idempotent seed script that (a) uploads the images to storage, (b) upserts the `outreach_assets` row with `menu_json` carrying items + `customizations`. Re-running refreshes the row in place (stable token).

## 2. Showcase modifier support (`template_restaurant_react`)

- `ShowcaseMenuItem` (`apps/web/src/showcase/showcase.ts:9-15`) gains optional `customizations?: unknown[]`.
- `mapMenu.ts`: replace the hardcoded `customizations: []` with a validated pass-through — parse each entry with `CustomizationItemSchema` (already exported from core models); entries that fail validation are DROPPED (never crash a lead-facing preview), absent field → `[]` exactly as today.
- IDs: the fixture provides real uuids; if any real-world payload ever lacks them, validation drops the entry (acceptable — no scraped asset has customizations).
- Item-detail/add-to-cart already render customizations for live tenants; showcase simply stops starving them. No UI change.
- Skew safety: old showcase build ignores the unknown field (flat items, as today); new showcase with old assets sees no field → `[]`.

## 3. Data plumbing (Supabase)

- One `outreach_assets` row: `status='ready'`, permanent `preview_token`, `menu_json` = fixture, `images` array as usual (raw/render kinds optional — fallback images can be skipped for the demo since it should never fall back long-term; acceptable to include none and rely on the live frame), `logo_url` null (forced-red + name-nudge posture applies to the demo too, letting the customizer demo shine).
- `lead_id`: if the column is non-nullable, create one house lead ("WebEatery Demo Restaurant") — exact shape pinned at plan time against the schema.
- **Hard constraint — unreachable by all send paths** (blocking acceptance criterion). Concrete mechanism (verified against the real queries in review):
  1. **Demo lead status** set to a value the enrollment job never selects (`outreach_enroll.py:31-41` only enrolls leads in eligible statuses — spec review confirmed "no email + suppression + segment" alone would NOT stop enrollment from creating a fresh asset for an operating lead). Exact status value (`suppressed`/`closed`-class per the lead-status enum) pinned at plan time; the RPC/preview never reads lead status, so the demo page is unaffected.
  2. **`outreach_assets.email` explicitly NULL** on the demo row — draft targeting (`outreach_draft.py:70-77`) builds email drafts from that field; NULL removes the demo from the email path by construction.
  3. Belt-and-braces suppression row keyed to the house lead if it ever acquires an email.
  - Acceptance test at plan time: run the enrollment + draft target selections (read-only) and assert the demo lead/asset appears in neither.
- View tripwire noise: the website skips `firePreviewView` for the demo token (below); `view_count` on the row is therefore ~0 and stats stay clean.

## 4. Website entry (`webeatery-website`)

- Demo token baked as a public constant (`lib/` or env `NEXT_PUBLIC_DEMO_PREVIEW_TOKEN`; it's anon-readable by design either way).
- `app/preview/page.tsx`: empty hash → use the demo token (state machine otherwise unchanged); non-empty invalid token → gone-state exactly as today.
- `firePreviewView` is not called when the served token is the demo token.
- Everything else — device frames, slow-boot fallback, full customizer (name/color/theme/style/app icon) — works unchanged on the demo.
- Copy: the page renders exactly like a lead preview ("The Golden Fork — Built for you by WebEatery"). No special demo banner in v1; CTA stays.

## 5. Edge cases

- Demo token revoked/broken in DB → bare `/preview` falls into the gone-state (fail-safe, no crash); a monitoring-free acceptable failure given the seed script can restore it idempotently.
- Fixture item with malformed customization → dropped by validation, item still renders flat.
- Fallback images: if omitted, an 8s-fallback on the demo shows the copy-only card until the late-ready upgrade lands (round-1 slow-boot recovery makes this self-healing). Optionally include render images later.
- The demo asset must survive outreach sweepers (scratch cleanup targets `is_scratch=true` only — the demo row is NOT scratch; verified predicate at plan time).

## 6. Testing

- **TRS (vitest):** mapMenu — customizations pass-through (valid), dropped (invalid), absent → `[]`; showcase boot with a customized fixture renders item detail with option groups (existing detail-page test pattern); flat legacy payload unchanged.
- **Website (jest):** empty hash serves demo token (iframes get `#token=<demo>`); invalid hash → gone-state; `firePreviewView` not fired for demo token, still fired for real tokens.
- **Seed script:** dry-run mode printing the row diff; idempotency (run twice → one row, same token); image upload skip-if-exists.
- **Controller visual pass:** bare `/preview` on prod — tap into items with option groups on both frames, exercise required/multi selections, run the customizer on top.

## Rollout

1. TRS mapMenu/payload support → main (inert: no asset carries customizations yet).
2. Seed script run (tier-1 read/scratch DML does NOT cover this — the insert into `outreach_assets` is a plain service-key write via the seed script from the Mini, same as existing outreach tooling writes).
3. Website bare-`/preview` entry → main → deploy → visual pass.

Skew safe at every step: showcase-without-fixture = no change; fixture-without-website = reachable only by direct token URL; website-without-fixture = bare `/preview` shows gone-state (current behavior).

## Out of scope

- Demo banner/special CTA copy, multiple demo cuisines, hash-mode enablement, cart/checkout beyond what showcase already allows, TTL expiry for real previews (separate idea).
