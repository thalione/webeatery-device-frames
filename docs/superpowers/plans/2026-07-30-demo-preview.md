# Demo Preview Restaurant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `webeatery.app/preview` (no token) serves a fully synthetic demo restaurant — The Golden Fork — with categorized menu, descriptions, photos, and working option groups, through the unchanged preview pipeline.

**Architecture:** (1) showcase learns to pass item `customizations` through (validate-or-drop); (2) a checked-in fixture + idempotent seed script mints one permanent `outreach_assets` row (house lead, hard-excluded from all send paths) with images uploaded to the outreach bucket; (3) the website maps an empty hash to the demo token and skips the view tripwire for it.

**Tech Stack:** as prior rounds; seed script is Node ESM in mac-mini-builder (matches existing outreach tooling).

**Spec:** `docs/superpowers/specs/2026-07-30-demo-preview-design.md` (this repo).

## Global Constraints

- Commit identity `hunter_araujo@msn.com`; NO Co-Authored-By trailers; push after each commit.
- Checkouts: TRS `/Users/hunteraraujo/Dev/template_restaurant_react` (branch `demo-preview` off main); mac-mini-builder `/Users/hunteraraujo/Dev/mac-mini-builder` (branch `demo-preview-seed` off main — NOTE: work in the MAIN checkout, repo has no session worktree); website worktree `/Users/hunteraraujo/Dev/webeatery-website/.claude/worktrees/device-frames` (branch `mini/device-frames`).
- Verified schema facts (do not re-derive): `outreach_assets.lead_id` is `uuid NOT NULL UNIQUE REFERENCES leads(id)` (`007_outreach.sql:13`) → a house lead row is REQUIRED. `leads.suppressed` boolean exists with `suppressed_reason CHECK IN ('existing_merchant','pipeline_deal','chain')` (`001_create_lead_gen_tables.sql:44-45`), and `select_outreach_targets` (`leads/outreach_enroll.py:31-41`) skips `suppressed` leads → **demo lead: `suppressed=true, suppressed_reason='existing_merchant'`**. Demo asset: **`email` NULL**.
- Customization shapes must satisfy `CustomizationItemSchema` (`packages/core/src/models/menu.ts:13-29`): `{ id: uuid, name, description?, isRequired, minSelections, maxSelections?, options: [{ id: uuid, name, price≥0, isDefault, maxQuantity? }] }`. Fixture uses REAL random uuids (generate once, commit them — stable across seed runs).
- The demo must never crash or degrade a real lead's preview: mapMenu validation drops bad customizations silently; all existing flat-menu behavior byte-identical.
- Ship order: TRS → main (inert) → seed run → website → main.

## File Structure

```
template_restaurant_react/
  apps/web/src/showcase/showcase.ts       # ShowcaseMenuItem + customizations?: unknown[]
  apps/web/src/showcase/mapMenu.ts        # validate-or-drop pass-through
  apps/web/src/showcase/mapMenu.test.ts   # extend

mac-mini-builder/
  outreach/demo/golden-fork.json          # fixture (menu + customizations + image manifest)
  outreach/demo/seed-demo-asset.mjs       # idempotent seed script (dry-run default)
  tests/outreach/demo-fixture.test.mjs    # fixture validity tests

webeatery-website/
  app/preview/page.tsx                    # empty hash → demo token; tripwire skip
  lib/demo-preview.ts                     # DEMO_PREVIEW_TOKEN constant
  __tests__/preview-page.test.tsx         # extend
```

---

### Task 1: TRS — showcase customizations pass-through

**Files:**
- Modify: `apps/web/src/showcase/showcase.ts` (~line 9-15), `apps/web/src/showcase/mapMenu.ts`
- Test: `apps/web/src/showcase/mapMenu.test.ts` (extend)

Branch: `git checkout main && git pull && git checkout -b demo-preview`.

**Interfaces:**
- Produces: `ShowcaseMenuItem.customizations?: unknown[]`; mapped items carry validated customizations (schema-parsed, defaults applied) instead of always `[]`.

- [ ] **Step 1: failing tests** — add to `mapMenu.test.ts`:

```ts
import { CustomizationItemSchema } from '@restaurant/core'  // verify export path; menu.ts models are star-exported from core — adjust import if the symbol lives deeper

const CUSTOMIZATION = {
  id: '7f0a2c9e-1111-4222-8333-944445555666',
  name: 'Temperature',
  isRequired: true,
  minSelections: 1,
  maxSelections: 1,
  options: [
    { id: '7f0a2c9e-aaaa-4bbb-8ccc-9ddddeeeefff', name: 'Medium', price: 0, isDefault: true },
    { id: '7f0a2c9e-bbbb-4ccc-8ddd-9eeeefffff00', name: 'Well Done', price: 0, isDefault: false },
  ],
}

it('passes valid customizations through, schema-parsed', () => {
  const cats = mapShowcaseMenu([{ name: 'Burger', price: 12, description: null, photo_url: null, customizations: [CUSTOMIZATION] }])
  const item = cats[0].items[0] as { customizations: unknown[] }
  expect(item.customizations).toHaveLength(1)
  expect((item.customizations[0] as { name: string }).name).toBe('Temperature')
})

it('drops invalid customization entries, keeps the item flat', () => {
  const cats = mapShowcaseMenu([{ name: 'Burger', price: 12, description: null, photo_url: null, customizations: [{ id: 'not-a-uuid', name: 'X', options: [] }, CUSTOMIZATION] }])
  const item = cats[0].items[0] as { customizations: unknown[] }
  expect(item.customizations).toHaveLength(1)  // only the valid one survives
})

it('absent customizations → [] exactly as before', () => {
  const cats = mapShowcaseMenu([{ name: 'Taco', price: 3, description: null, photo_url: null }])
  expect((cats[0].items[0] as { customizations: unknown[] }).customizations).toEqual([])
})
```

- [ ] **Step 2: verify fail** — `cd apps/web && npx vitest run src/showcase/mapMenu.test.ts`.
- [ ] **Step 3: implement**:

`showcase.ts` — add to `ShowcaseMenuItem`:

```ts
  /** Optional option-groups (demo/synthetic assets). Shape must satisfy
   * core CustomizationItemSchema; mapMenu validates-or-drops per entry. */
  customizations?: unknown[]
```

`mapMenu.ts` — import the schema and add a helper + swap the hardcoded field:

```ts
import { CustomizationItemSchema } from '@restaurant/core'

/** Validate-or-drop: a lead-facing preview must never crash on a bad
 * payload entry; invalid customizations vanish, the item stays flat. */
function mapCustomizations(raw: unknown[] | undefined): unknown[] {
  if (!Array.isArray(raw)) return []
  const out: unknown[] = []
  for (const entry of raw) {
    const parsed = CustomizationItemSchema.safeParse(entry)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}
```

and in the item literal: `customizations: mapCustomizations(raw.customizations),`

- [ ] **Step 4: verify pass** — file suite, then `npx vitest run src/showcase` all green.
- [ ] **Step 5: mutation-check** — make `mapCustomizations` return `raw ?? []` unvalidated → the drops-invalid test must go red; restore.
- [ ] **Step 6: commit + push** — `feat(showcase): validated customizations pass-through for synthetic assets`; controller lands to main after review (full apps/web + core suites first).

---

### Task 2: Fixture + seed script (mac-mini-builder)

**Files:**
- Create: `outreach/demo/golden-fork.json`, `outreach/demo/seed-demo-asset.mjs`
- Test: `tests/outreach/demo-fixture.test.mjs`

Branch: `git checkout main && git pull && git checkout -b demo-preview-seed` in `/Users/hunteraraujo/Dev/mac-mini-builder`.

**Interfaces:**
- Produces: fixture JSON consumed by the seed script; script env: reads `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` from the repo's existing `.env` convention (same as other outreach tooling; builder env lives at `~/builds/.env`). `node outreach/demo/seed-demo-asset.mjs` = DRY RUN (prints intended row + uploads); `--apply` executes.

**Fixture content requirements** (author the copy — style: warm, appetizing, 1–2 sentences per item, no clichés like "mouth-watering"; two fully-worked examples below, match their register):
- `restaurant`: `{ "name": "The Golden Fork", "address": "412 Orchard Lane, Napa, CA 94559", "segment": "no_ordering" }`.
- 5 categories × items = 22 total: Starters (4), Burgers & Mains (6), Wood-Fired Pizzas (4), Desserts (4), Drinks (4).
- Option-group matrix (exactly these; reuse group definitions across items via JSON references being fine to inline-duplicate — ids stay unique PER GROUP INSTANCE):

| Group | Type | On items |
|---|---|---|
| Temperature (Rare→Well Done, 5 opts, $0) | required, min1/max1, default Medium | all 3 burgers |
| Add-Ons (Bacon +2.50, Avocado +2, Fried Egg +1.50, Extra Patty +4) | optional, max 3 | all burgers + chicken sandwich |
| Choice of Side (Fries default $0, Side Salad +1, Soup +2.50) | required, min1/max1 | all 6 mains |
| Pizza Size (12" $0 default, 16" +6) | required, min1/max1 | all 4 pizzas |
| Gluten-Free Crust (+3) | optional, max1 | all 4 pizzas |
| Size (Regular $0 default, Large +1.50) | required, min1/max1 | all 4 drinks |

- Example items (copy these verbatim into the fixture, then author the rest in the same register):

```json
{ "name": "Crispy Brussels Sprouts", "price": 11, "category": "Starters",
  "description": "Flash-fried and tossed with hot honey, lemon zest, and shaved pecorino.",
  "photo_url": "__IMG__/brussels.jpg", "customizations": [] },
{ "name": "The Golden Burger", "price": 16, "category": "Burgers & Mains",
  "description": "Double smashed patties, aged cheddar, caramelized onion, and house sauce on a toasted brioche bun.",
  "photo_url": "__IMG__/golden-burger.jpg", "customizations": [ /* Temperature, Add-Ons, Choice of Side — full objects with uuids */ ] }
```

- `photo_url` values use the literal placeholder prefix `__IMG__/` + filename; the seed script rewrites them to the real public storage URLs at apply time.
- `images` manifest in the fixture: `[{ "file": "brussels.jpg", "source": "<unsplash CDN url>" }, ...]` — ~16 entries (most but not all items; Drinks can share 2 photos; 4–5 items deliberately photo-less). Sourcing procedure: pick Unsplash food photos (Unsplash License permits this use), record the `https://images.unsplash.com/photo-...` CDN URL, and VERIFY each with `curl -fsSI` → HTTP 200 + `content-type: image/*` before committing the manifest. Any URL that fails verification gets replaced, not shipped.
- All customization/option `id`s: real uuids, generated once (e.g. `node -e "console.log(crypto.randomUUID())"`), committed in the fixture — stable across seed re-runs.

**Seed script behavior** (`seed-demo-asset.mjs`, plain Node ESM, no new deps — use global `fetch` like existing tooling):
1. Load fixture; zod-less sanity checks (every `customizations[].id` unique + uuid-regex, every option price ≥ 0, photo placeholders resolve to manifest entries).
2. Find-or-create house lead: `leads` row **`name='The Golden Fork'`** (the RPC serves the LEAD's name/address as the preview's display name — `011_preview_address.sql:27`; a "WebEatery Demo Restaurant" lead name would leak into the page header), `address='412 Orchard Lane, Napa, CA 94559'` if leads carries address fields the RPC reads, `suppressed=true, suppressed_reason='existing_merchant'`, no email; idempotent by name lookup.
3. Find-or-create `outreach_assets` row keyed by `lead_id` (UNIQUE): `status='ready'`, `email=null`, **`segment` from `fixture.restaurant.segment` ('no_ordering')** — the RPC returns segment and it drives the page's CTA copy, `menu_json` = fixture items with rewritten photo URLs, `brand_colors=null`, `logo_url=null`, `images=[]`. Supply any other NOT-NULL-without-default columns discovered from the live schema at write time (print them in the dry-run plan). Token: generate 192-bit on first insert; NEVER rotate on re-run (update must not touch `preview_token`).
4. Images: for each manifest entry, download source → upload to `outreach-renders/${assetId}/${file}` via the existing storage endpoint pattern (`outreach/outreach-store.mjs:91` layout); skip-if-exists.
5. Dry run (default): print the would-be lead/asset payloads + image plan, ZERO writes. `--apply`: execute, then print the resulting preview token + URL.
6. **Send-path acceptance check** (runs in BOTH modes, read-only): re-implement the `select_outreach_targets` predicate client-side (suppressed/pre_open/closed filter per `outreach_enroll.py:31-41`) against the demo lead row and assert it's excluded; query outreach draft targeting shape (`email is null`) and assert no email path. Exit non-zero if either fails.

- [ ] **Step 1: failing tests** — `tests/outreach/demo-fixture.test.mjs` (**vitest** — the repo's `test` script is `vitest run` and existing `tests/outreach/*.test.mjs` import from `'vitest'`; run this file with `npx vitest run tests/outreach/demo-fixture.test.mjs`). node:assert works fine inside vitest `it` blocks — keep the assertions as written:

```js
import { it } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const fixture = JSON.parse(fs.readFileSync(new URL('../../outreach/demo/golden-fork.json', import.meta.url)));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

it('fixture shape: 5 categories, 22 items, name+segment set', () => {
  assert.equal(fixture.restaurant.name, 'The Golden Fork');
  const cats = new Set(fixture.menu.map((i) => i.category));
  assert.equal(cats.size, 5);
  assert.equal(fixture.menu.length, 22);
});

it('all customization + option ids are unique uuids, prices nonnegative', () => {
  const ids = [];
  for (const item of fixture.menu) {
    for (const c of item.customizations ?? []) {
      ids.push(c.id);
      assert.match(c.id, UUID_RE);
      assert.equal(typeof c.isRequired, 'boolean');
      for (const o of c.options) { ids.push(o.id); assert.match(o.id, UUID_RE); assert.ok(o.price >= 0); }
    }
  }
  assert.equal(new Set(ids).size, ids.length);
});

it('required groups have a default and min/max 1', () => {
  for (const item of fixture.menu) {
    for (const c of item.customizations ?? []) {
      if (!c.isRequired) continue;
      assert.equal(c.minSelections, 1);
      assert.equal(c.maxSelections, 1);
      assert.equal(c.options.filter((o) => o.isDefault).length, 1);
    }
  }
});

it('every photo placeholder resolves to a manifest entry', () => {
  const files = new Set(fixture.images.map((i) => i.file));
  for (const item of fixture.menu) {
    if (!item.photo_url) continue;
    assert.ok(item.photo_url.startsWith('__IMG__/'));
    assert.ok(files.has(item.photo_url.slice('__IMG__/'.length)), item.photo_url);
  }
});

it('option-group coverage matches the plan matrix', () => {
  const byCat = (cat) => fixture.menu.filter((i) => i.category === cat);
  for (const p of byCat('Wood-Fired Pizzas')) {
    const names = (p.customizations ?? []).map((c) => c.name);
    assert.ok(names.includes('Pizza Size'), p.name);
  }
  for (const d of byCat('Drinks')) {
    assert.ok((d.customizations ?? []).some((c) => c.name === 'Size'), d.name);
  }
});
```

- [ ] **Step 2: verify fail** (fixture absent) — `npx vitest run tests/outreach/demo-fixture.test.mjs`.
- [ ] **Step 3: author fixture** per requirements (write all 22 items; verify every manifest URL with `curl -fsSI` as specified).
- [ ] **Step 4: tests pass.**
- [ ] **Step 5: write seed script** per behavior spec above. Include `--help`. No unit test for the network paths; the dry-run IS the test surface — run `node outreach/demo/seed-demo-asset.mjs` (dry) and eyeball the printed plan; the send-path acceptance check must PASS against… nothing yet (lead doesn't exist) — it must handle "lead not yet created" by validating the WOULD-BE row it prints.
- [ ] **Step 6: full repo test run** — `npx vitest run tests/` (existing outreach/compositor tests stay green).
- [ ] **Step 7: commit + push** — `feat(outreach): Golden Fork demo fixture + idempotent seed script (dry-run default)`.

---

### Task 3 (controller + implementer): seed run + verification

- [ ] Land Task 1 (TRS → main after review; full suites) and Task 2 (mac-mini-builder → main after review).
- [ ] Wait for prod showcase redeploy (deploy-engine `webeatery-preview-app` success ≥ the Task-1 merge commit).
- [ ] Run seed DRY: `node outreach/demo/seed-demo-asset.mjs` — review printed plan.
- [ ] Run `--apply`; capture the printed demo token. Re-run `--apply` → second run must report no-op/idempotent (same token, no duplicate rows).
- [ ] Acceptance: script's send-path check green; manual spot: `curl` the anon RPC with the demo token → JSON includes a customized item; open `https://webeatery.app/preview/#<demo-token>` in the shared Chrome → menu + option groups render in the phone frame (item tap).
- [ ] Record the token in the ledger (it also gets baked into the website in Task 4).

---

### Task 4: website — bare /preview serves the demo

**Files:**
- Create: `lib/demo-preview.ts`
- Modify: `app/preview/page.tsx`
- Test: `__tests__/preview-page.test.tsx` (extend)

**Interfaces:**
- Consumes: the real demo token from Task 3 (controller passes it in the dispatch).
- Produces: empty hash → demo asset renders; invalid token → gone-state unchanged; no tripwire for demo.

- [ ] **Step 1: failing tests** — extend `__tests__/preview-page.test.tsx` (it already mocks `preview-data`; follow its existing arrangement):

```tsx
it("bare /preview (no hash) serves the demo token", async () => {
  window.location.hash = "";
  (fetchPreviewAsset as jest.Mock).mockResolvedValue(demoAsset);
  render(<PreviewPage />);
  await waitFor(() => expect(fetchPreviewAsset).toHaveBeenCalledWith(DEMO_PREVIEW_TOKEN));
  expect(screen.queryByText(/no longer available/i)).not.toBeInTheDocument();
});

it("does NOT fire the view tripwire for the demo token", async () => {
  window.location.hash = "";
  (fetchPreviewAsset as jest.Mock).mockResolvedValue(demoAsset);
  render(<PreviewPage />);
  await waitFor(() => expect(fetchPreviewAsset).toHaveBeenCalled());
  expect(firePreviewView).not.toHaveBeenCalled();
});

it("still fires the tripwire for a real token", async () => { /* existing behavior — assert firePreviewView called once after ready */ });

it("a present-but-bad token still shows the gone-state", async () => {
  window.location.hash = "#deadtoken";
  (fetchPreviewAsset as jest.Mock).mockResolvedValue(null);
  render(<PreviewPage />);
  await waitFor(() => expect(screen.getByText(/no longer available/i)).toBeInTheDocument());
});
```

- [ ] **Step 2: verify fail.**
- [ ] **Step 3: implement**:

`lib/demo-preview.ts`:

```ts
/** Permanent token of the synthetic "The Golden Fork" outreach asset
 * (docs: webeatery-device-frames spec 2026-07-30-demo-preview-design.md).
 * Public by design — the token is anon-readable anyway. Bare /preview
 * serves this so the page doubles as a zero-lead sales showroom. */
export const DEMO_PREVIEW_TOKEN = "<token from Task 3>";
```

`app/preview/page.tsx` — in the first effect:

```ts
const raw = window.location.hash.slice(1);
const isDemo = raw === "";
const t = isDemo ? DEMO_PREVIEW_TOKEN : raw;
setToken(t);
// (remove the early `if (!t) gone` return — DEMO_PREVIEW_TOKEN is never empty;
// fetch failure still lands in the gone-state.)
```

and gate the tripwire effect: `if (state !== "ready" || tripwireFired.current || token === DEMO_PREVIEW_TOKEN) return;`

- [ ] **Step 4: verify** — file suite, `npx jest --silent` full, `npx tsc --noEmit` (baseline only), `npm run build`.
- [ ] **Step 5: commit + push** (branch `mini/device-frames`); controller lands + deploys.

---

### Task 5 (controller): visual pass + deploy verification

- [ ] Land website → main; wait for deploy-engine success; hard-refresh `https://webeatery.app/preview` (bare).
- [ ] Visual pass in shared Chrome: menu renders with photos; tap a burger → Temperature/Add-Ons/Side groups render and enforce required/min/max; pizza size prices show; customizer (name/color/theme/style/app icon) works on top; `#<bad-token>` still shows gone-state; a real lead token still works and still fires its tripwire (network tab).
- [ ] Update the project memory file (demo asset + token + seed script location).

## Rollout

TRS main (inert) → mac-mini-builder main → seed `--apply` (token born) → website main (token baked). Each intermediate state safe per spec §Rollout.

## Out of scope

Per spec: demo banner/CTA variants, multiple cuisines, hash mode, checkout beyond existing showcase behavior, preview TTLs.
