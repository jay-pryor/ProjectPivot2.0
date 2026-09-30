# Bow-tie Diagrams (release 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Bow-ties page where a person draws the bow-tie of a hazard on a platform with filtered controls, places up to two diagram windows side by side by dragging, saves the choices as named views that are personal but shareable with chosen profiles, and exports any window as SVG.

**Architecture:** A pure query (`src/core/bowtie.js`) works out what a diagram holds; a pure renderer (`src/ui/bowtie-svg.js`) turns that into one self-contained SVG string used on screen and in the export. Saved views are a new record kind, `bowtieView`, in the shared data file, changed only through owner-checked ops. Window placement is a small pure module (`src/ui/workspace.js`) that the controller calls and mirrors to `localStorage`; the page (`src/ui/screens/bowties.js`) follows the existing render()/wire() pattern, and `src/ui/mount.js` gains native drag and drop.

**Tech Stack:** Plain ES modules, JSDoc types checked by `tsc`, `node:test`, no UI framework, no dependencies. Single-file build (`npm run build` → `dist/pivot.html`) inlines every module reachable from `src/main.js`, so new modules need no build change.

**Spec:** `docs/superpowers/specs/2026-09-30-pivot-bowtie-design.md`

## Global Constraints

- Columns left to right: causal factors, preventative controls, the hazard, mitigating controls, consequences.
- Control box last line: `Existing · <tier>` (or `Existing` with no tier) / `Additional · <Status>`; existing solid border, additional dashed border — colour is never the only difference.
- Default filters: set `all`, statuses `recommended`, `planned`, `implemented` (rejected off).
- Sets: `existing`, `additional`, `all`. Statuses: `CONTROL_STATUSES` from `src/core/ops/assessment.js` = `['recommended', 'planned', 'implemented', 'rejected']`.
- Text is never truncated; boxes wrap at spaces and carry the whole text in `<title>`.
- Caption: `<platform name> · <filters in words>`, e.g. `Frigate · Existing + Additional (Planned, Implemented)`.
- A saved view stores choices, never a picture; drawings are built from the working data every time.
- A view is visible to its owner and to profiles in its `sharedWith`; only the owner changes, renames, shares or deletes it.
- At most two windows. The Bow-ties tab sits between Platforms and References.
- Remembered workspace lives in `localStorage` per folder and profile; every read and write is wrapped so a refusal or bad value falls back to an empty stage.
- Sharp corners (`border-radius: 0`) like the rest of the current UI; colours from the `--p-*` tokens except inside the SVG, which uses its own fixed light palette so an exported file looks the same everywhere.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Markup in stored text** (a hazard titled `<script>`, a view named `A & B`) — drawn as text in the SVG and the list, never as markup. Tests: Task 3 step 1, Task 6 step 1.
2. **A shared view is unshared or deleted while it is open in someone's window** — the window keeps drawing and reads *Unsaved: …*; nothing throws. Test: Task 6 step 1.
3. **A remembered workspace that is garbage, refused, or points at a deleted hazard** — an empty stage, or a window saying why it cannot draw. Tests: Task 4 step 1, Task 6 step 1.
4. **A very long word or title** — the box widens rather than cutting text, and no two boxes overlap. Test: Task 3 step 1.
5. **One control that is both an existing and an additional control on the same wing** — drawn twice, each with its own last line. Test: Task 1 step 1.

## Deviations from the spec's section 6 wording (same behaviour)

- The ops are `createBowtieView` (covers Save as… and Save a copy), `updateBowtieView` (covers Save and Rename), `setBowtieSharing` and `deleteBowtieView`, rather than five separately named ops.
- `NOT_ACKNOWLEDGED` is left unchanged: `platformsReached` returns `[]` for an unknown kind, so view changes reach no platform and never queue for acknowledgement. Task 2 pins this with a test.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/core/bowtie.js` | Create | Filters (defaults, normalising, checking, words), `bowtieOf`, and view visibility (`myViews`, `sharedWithMe`, `canSee`). |
| `src/core/data.js` | Modify | `bowtieView` joins `KINDS`. |
| `src/core/ops/bowtie-views.js` | Create | Owner-checked ops on `bowtieView`. |
| `src/ui/names.js` | Modify | `KIND_LABEL.bowtieView`, `recordName` for it. |
| `src/ui/bowtie-svg.js` | Create | `bowtieSvg(bowtie)` and `wrap(text)`. |
| `src/ui/workspace.js` | Create | Pure window placement plus `readWorkspace`/`writeWorkspace`. |
| `src/ui/controller.js` | Modify | Workspace state, bow-tie handlers, EDITS entries, export. |
| `src/ui/screens/bowties.js` | Create | The page. |
| `src/ui/screens/common.js` | Modify | NAV and SECTION gain `bowties`. |
| `src/ui/render.js` | Modify | Route `bowties`. |
| `src/ui/screens/ssra.js` | Modify | *Open bow-tie* button on a hazard's platform tab. |
| `src/ui/mount.js` | Modify | Drag and drop; list search scoped to the side list. |
| `src/ui/styles.css` | Modify | Page, window and drop-target styles. |
| `test/core/bowtie.test.js` | Create | Task 1. |
| `test/core/bowtie-views.test.js` | Create | Task 2. |
| `test/ui/bowtie-svg.test.js` | Create | Task 3. |
| `test/ui/workspace.test.js` | Create | Task 4. |
| `test/ui/controller-bowties.test.js` | Create | Task 5. |
| `test/ui/screens-bowties.test.js` | Create | Task 6. |

Run everything with `npm test`; one file with `node --test test/core/bowtie.test.js`. Type-check with `npm run typecheck`.

---

### Task 1: What a diagram holds (`src/core/bowtie.js`)

**Files:**
- Create: `src/core/bowtie.js`
- Test: `test/core/bowtie.test.js`

**Interfaces:**
- Consumes: `get`, `live`, `isObject` from `src/core/data.js`; `hazardLabel`, `ids`, `UNNUMBERED` from `src/core/ids.js`; `controlsOnPlatform(data, hazardId, platformId)` → `{ control, kind, state, ruling, link }[]` and `existingControlsOn(data, hazardId, platformId)` → `{ link, control, kind }[]` from `src/core/queries.js` (both already sorted by tier then number); `CONTROL_STATUSES` from `src/core/ops/assessment.js`; `PivotError` from `src/core/errors.js`.
- Produces:
  - `SETS: readonly ['existing', 'additional', 'all']`
  - `DEFAULT_FILTERS: { set: 'all', statuses: ['recommended', 'planned', 'implemented'] }` (frozen)
  - `normalizeFilters(f: unknown) → { set: string, statuses: string[] }` — lenient; anything bad becomes the default part; statuses always in `CONTROL_STATUSES` order.
  - `needFilters(f: unknown) → { set, statuses }` — strict; throws `PivotError('bowtie.filters', …)`.
  - `sameFilters(a, b) → boolean`
  - `filterWords(f) → string`
  - `STATUS_WORD: Record<status, string>` and `SET_WORD: Record<set, string>`
  - `hazardName(h) → string` — `H-0001 Fire`, or just the title while unnumbered.
  - `bowtieOf(data, hazardId, platformId, filters) → Bowtie | Cannot` where
    `Bowtie = { ok: true, hazard, platform, filters, caption: string, causalFactors: Rec[], consequences: Rec[], preventative: Item[], mitigating: Item[] }`,
    `Item = { control: Rec, kind: 'preventative'|'mitigating', source: 'existing'|'additional', state: string|null, line: string }`,
    `Cannot = { ok: false, reason: 'hazard-gone'|'hazard-retired'|'platform-gone'|'not-on-platform', message: string }`.

- [ ] **Step 1: Write the failing tests**

Create `test/core/bowtie.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { assignNumbers, retireHazard, deleteHazard } from '../../src/core/ops/hazards.js';
import { createControl, linkControl, linkExistingControl, updateControl } from '../../src/core/ops/controls.js';
import { setControlStatus } from '../../src/core/ops/assessment.js';
import { unlinkHazard } from '../../src/core/ops/platforms.js';
import { DEFAULT_FILTERS, normalizeFilters, needFilters, sameFilters, filterWords, bowtieOf, hazardName } from '../../src/core/bowtie.js';
import { seed, act } from '../helpers.js';

/**
 * seed(): h1 Fire (cf1, cq1, c1 Sprinklers preventative, c2 Fire drills mitigating) on p1 Alpha and p2 Bravo.
 * Here: c1 implemented on p1; c3 Hot-work permit additional preventative, rejected on p1;
 * c4 Fire doors existing preventative (Engineering) on p1; c1 is also an existing preventative control on p1.
 */
function data() {
  let d = seed();
  d = createControl(d, act, { id: 'c3', title: 'Hot-work permit' });
  d = createControl(d, act, { id: 'c4', title: 'Fire doors' });
  d = updateControl(d, act, { id: 'c4', tier: 'Engineering' });
  d = linkControl(d, act, { hazardId: 'h1', controlId: 'c3', kind: 'preventative' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'implemented' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c3', platformId: 'p1', status: 'rejected', reason: 'Not needed' });
  d = linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c4', kind: 'preventative' });
  d = linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'preventative' });
  return assignNumbers(d);
}
const lines = (items) => items.map((i) => `${i.control.id} ${i.line}`);

test('filters: defaults, lenient normalising, strict checking, comparison and words', () => {
  assert.deepEqual(DEFAULT_FILTERS, { set: 'all', statuses: ['recommended', 'planned', 'implemented'] });
  assert.deepEqual(normalizeFilters(null), { set: 'all', statuses: ['recommended', 'planned', 'implemented'] });
  assert.deepEqual(normalizeFilters({ set: 'nope', statuses: ['rejected', 'bogus', 'planned'] }), { set: 'all', statuses: ['planned', 'rejected'] });
  assert.deepEqual(needFilters({ set: 'existing', statuses: [] }), { set: 'existing', statuses: [] });
  assert.throws(() => needFilters({ set: 'nope', statuses: [] }), (e) => e instanceof PivotError && e.code === 'bowtie.filters');
  assert.throws(() => needFilters({ set: 'all', statuses: ['bogus'] }), (e) => e instanceof PivotError && e.code === 'bowtie.filters');
  assert.ok(sameFilters({ set: 'all', statuses: ['planned', 'recommended'] }, { set: 'all', statuses: ['recommended', 'planned'] }));
  assert.ok(!sameFilters({ set: 'all', statuses: [] }, { set: 'existing', statuses: [] }));
  assert.equal(filterWords({ set: 'existing', statuses: ['planned'] }), 'Existing');
  assert.equal(filterWords({ set: 'additional', statuses: ['implemented', 'planned'] }), 'Additional (Planned, Implemented)');
  assert.equal(filterWords({ set: 'all', statuses: [] }), 'Existing + Additional (none)');
});

test('the default view: existing controls first, then additional ones, rejected hidden; causal factors and consequences whole', () => {
  const b = bowtieOf(data(), 'h1', 'p1', DEFAULT_FILTERS);
  assert.equal(b.ok, true);
  assert.equal(b.hazard.id, 'h1');
  assert.equal(b.platform.id, 'p1');
  assert.equal(b.caption, 'Alpha · Existing + Additional (Recommended, Planned, Implemented)');
  assert.deepEqual(b.causalFactors.map((r) => r.text), ['Hot works']);
  assert.deepEqual(b.consequences.map((r) => r.text), ['Burns']);
  assert.deepEqual(lines(b.preventative), ['c4 Existing · Engineering', 'c1 Existing', 'c1 Additional · Implemented']);
  assert.deepEqual(lines(b.mitigating), ['c2 Additional · Recommended']);
  assert.deepEqual(b.preventative.map((i) => i.source), ['existing', 'existing', 'additional']);
});

test('each set and status filter selects exactly its controls', () => {
  const d = data();
  const pick = (filters) => [...lines(bowtieOf(d, 'h1', 'p1', filters).preventative), ...lines(bowtieOf(d, 'h1', 'p1', filters).mitigating)];
  assert.deepEqual(pick({ set: 'existing', statuses: ['rejected'] }), ['c4 Existing · Engineering', 'c1 Existing']);
  assert.deepEqual(pick({ set: 'additional', statuses: ['rejected'] }), ['c3 Additional · Rejected']);
  assert.deepEqual(pick({ set: 'additional', statuses: ['implemented', 'recommended'] }), ['c1 Additional · Implemented', 'c2 Additional · Recommended']);
  assert.deepEqual(pick({ set: 'all', statuses: [] }), ['c4 Existing · Engineering', 'c1 Existing']);
  assert.deepEqual(pick({ set: 'additional', statuses: ['planned'] }), []);
  // Another platform has its own statuses: nothing is ruled on Bravo, so everything is recommended there.
  assert.deepEqual(lines(bowtieOf(d, 'h1', 'p2', { set: 'additional', statuses: ['recommended'] }).preventative), ['c1 Additional · Recommended', 'c3 Additional · Recommended']);
});

test('a diagram that cannot be drawn says why', () => {
  const d = data();
  // A hazard is retired or deleted only once it is off every platform.
  const off = unlinkHazard(unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' }), act, { hazardId: 'h1', platformId: 'p2' });
  assert.deepEqual(bowtieOf(d, 'nope', 'p1', DEFAULT_FILTERS), { ok: false, reason: 'hazard-gone', message: 'The hazard in this view has been deleted.' });
  assert.equal(bowtieOf(deleteHazard(off, act, { id: 'h1' }), 'h1', 'p1', DEFAULT_FILTERS).reason, 'hazard-gone');
  const retired = bowtieOf(retireHazard(off, act, { id: 'h1' }), 'h1', 'p1', DEFAULT_FILTERS);
  assert.deepEqual(retired, { ok: false, reason: 'hazard-retired', message: 'H-0001 Fire is retired.' });
  assert.equal(bowtieOf(d, 'h1', 'nope', DEFAULT_FILTERS).reason, 'platform-gone');
  const unlinked = bowtieOf(unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p2' }), 'h1', 'p2', DEFAULT_FILTERS);
  assert.deepEqual(unlinked, { ok: false, reason: 'not-on-platform', message: 'H-0001 Fire is no longer on Bravo.' });
  assert.equal(bowtieOf(d, 'h2', 'p1', DEFAULT_FILTERS).reason, 'not-on-platform');
});

test('a hazard is named by its number and title, or its title alone until numbered', () => {
  assert.equal(hazardName(data().records.hazard.h1), 'H-0001 Fire');
  assert.equal(hazardName(seed().records.hazard.h1), 'Fire');
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/core/bowtie.test.js`
Expected: FAIL — `Cannot find module '.../src/core/bowtie.js'`.

The helpers the test uses take these arguments (checked): `updateControl(data, act, { id, title?, description?, tier? })`, `retireHazard`/`deleteHazard(data, act, { id })` — both refuse while the hazard is on a live platform, hence the unlinking — and `unlinkHazard(data, act, { hazardId, platformId })`.

- [ ] **Step 3: Write `src/core/bowtie.js`**

```js
import { PivotError } from './errors.js';
import { get, live, isObject } from './data.js';
import { hazardLabel, ids, UNNUMBERED } from './ids.js';
import { controlsOnPlatform, existingControlsOn } from './queries.js';
import { CONTROL_STATUSES } from './ops/assessment.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Rec} Rec */
/** @typedef {{ set: string, statuses: string[] }} Filters */
/** @typedef {{ control: Rec, kind: string, source: 'existing' | 'additional', state: string | null, line: string }} Item */
/**
 * @typedef {{ ok: true, hazard: Rec, platform: Rec, filters: Filters, caption: string,
 *   causalFactors: Rec[], consequences: Rec[], preventative: Item[], mitigating: Item[] }} Bowtie
 */
/** @typedef {{ ok: false, reason: 'hazard-gone' | 'hazard-retired' | 'platform-gone' | 'not-on-platform', message: string }} Cannot */

/** Which controls a diagram draws: those already in place, the additional ones, or both. */
export const SETS = Object.freeze(['existing', 'additional', 'all']);

export const SET_WORD = Object.freeze({ existing: 'Existing', additional: 'Additional', all: 'All' });
export const STATUS_WORD = Object.freeze({ recommended: 'Recommended', planned: 'Planned', implemented: 'Implemented', rejected: 'Rejected' });

/** Existing and additional controls, rejected ones hidden. */
export const DEFAULT_FILTERS = Object.freeze({ set: 'all', statuses: Object.freeze(['recommended', 'planned', 'implemented']) });

/**
 * Filters as they are kept, whatever was read: an unknown set or a missing list becomes the
 * default's, unknown statuses are dropped, and the rest are in the statuses' own order.
 * @param {unknown} f @returns {Filters}
 */
export function normalizeFilters(f) {
  const set = isObject(f) && SETS.includes(f.set) ? f.set : DEFAULT_FILTERS.set;
  const statuses = isObject(f) && Array.isArray(f.statuses)
    ? CONTROL_STATUSES.filter((s) => f.statuses.includes(s))
    : [...DEFAULT_FILTERS.statuses];
  return { set, statuses };
}

/** Filters an op is asked to store, refused when they are not filters. @param {unknown} f @returns {Filters} */
export function needFilters(f) {
  if (!isObject(f) || !SETS.includes(f.set)) {
    throw new PivotError('bowtie.filters', 'A bow-tie shows existing controls, additional controls, or all.');
  }
  if (!Array.isArray(f.statuses) || f.statuses.some((s) => !CONTROL_STATUSES.includes(s))) {
    throw new PivotError('bowtie.filters', `A bow-tie's statuses are among ${CONTROL_STATUSES.join(', ')}.`);
  }
  return normalizeFilters(f);
}

/** @param {unknown} a @param {unknown} b */
export function sameFilters(a, b) {
  const x = normalizeFilters(a);
  const y = normalizeFilters(b);
  return x.set === y.set && x.statuses.join('|') === y.statuses.join('|');
}

/** The filters in words, for the caption: e.g. "Existing + Additional (Planned, Implemented)". @param {unknown} f */
export function filterWords(f) {
  const { set, statuses } = normalizeFilters(f);
  const additional = `Additional (${statuses.length ? statuses.map((s) => STATUS_WORD[/** @type {keyof typeof STATUS_WORD} */ (s)]).join(', ') : 'none'})`;
  if (set === 'existing') return 'Existing';
  if (set === 'additional') return additional;
  return `Existing + ${additional}`;
}

/** "H-0001 Fire", or just the title until the hazard is numbered. @param {Rec} h */
export function hazardName(h) {
  const label = hazardLabel(h);
  return label === UNNUMBERED ? String(h.title) : `${label} ${h.title}`;
}

/**
 * What the bow-tie of a hazard on a platform holds under these filters, read from the data every
 * time; or why it cannot be drawn.
 * @param {Data} data @param {string} hazardId @param {string} platformId @param {unknown} filters
 * @returns {Bowtie | Cannot}
 */
export function bowtieOf(data, hazardId, platformId, filters) {
  const f = normalizeFilters(filters);
  const hazard = get(data, 'hazard', hazardId);
  if (!hazard || hazard.status === 'deleted') return { ok: false, reason: 'hazard-gone', message: 'The hazard in this view has been deleted.' };
  if (hazard.status === 'retired') return { ok: false, reason: 'hazard-retired', message: `${hazardName(hazard)} is retired.` };
  const platform = get(data, 'platform', platformId);
  if (!platform || platform.status === 'deleted') return { ok: false, reason: 'platform-gone', message: 'The platform in this view has been deleted.' };
  const link = get(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  if (!link || link.status !== 'live') return { ok: false, reason: 'not-on-platform', message: `${hazardName(hazard)} is no longer on ${platform.name}.` };
  /** @type {Item[]} */
  const existing = f.set === 'additional' ? [] : existingControlsOn(data, hazardId, platformId).map((x) => ({
    control: x.control, kind: x.kind, source: 'existing', state: null,
    line: x.control.tier ? `Existing · ${x.control.tier}` : 'Existing',
  }));
  /** @type {Item[]} */
  const additional = f.set === 'existing' ? [] : controlsOnPlatform(data, hazardId, platformId)
    .filter((x) => f.statuses.includes(x.state))
    .map((x) => ({
      control: x.control, kind: /** @type {string} */ (x.kind), source: 'additional', state: x.state,
      line: `Additional · ${STATUS_WORD[/** @type {keyof typeof STATUS_WORD} */ (x.state)]}`,
    }));
  const items = [...existing, ...additional];
  return {
    ok: true, hazard, platform, filters: f, caption: `${platform.name} · ${filterWords(f)}`,
    causalFactors: live(data, 'causalFactor').filter((r) => r.hazardId === hazardId),
    consequences: live(data, 'consequence').filter((r) => r.hazardId === hazardId),
    preventative: items.filter((i) => i.kind === 'preventative'),
    mitigating: items.filter((i) => i.kind === 'mitigating'),
  };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test test/core/bowtie.test.js`
Expected: PASS (5 tests). If the "existing" order differs, check `existingControlsOn` sorts by tier then number (Engineering before no tier) — the test encodes that order.

- [ ] **Step 5: Type-check and commit**

Run: `npm run typecheck` — expected: no errors.

```bash
git add src/core/bowtie.js test/core/bowtie.test.js
git commit -m "Bow-tie contents: filters by set and status, controls per wing with their set and status in words, and why a diagram cannot be drawn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Saved views as records (`bowtieView`)

**Files:**
- Modify: `src/core/data.js` (the `KINDS` list, lines 5-11)
- Modify: `src/core/bowtie.js` (append visibility queries)
- Create: `src/core/ops/bowtie-views.js`
- Modify: `src/ui/names.js` (`KIND_LABEL`, `recordName`)
- Test: `test/core/bowtie-views.test.js`

**Interfaces:**
- Consumes: `needFilters` from Task 1; `need`, `needText`, `created`, `changed`, `get`, `live` from `src/core/data.js`; `commit` from `src/core/apply.js`.
- Produces:
  - Record shape `bowtieView`: `{ id, status, createdBy, createdAt, updatedBy, updatedAt, name: string, ownerId: string, hazardId: string, platformId: string, filters: Filters, sharedWith: string[] }`.
  - `createBowtieView(data, act, { id?, name, hazardId, platformId, filters }) → Data` — action `'Save bow-tie view'`.
  - `updateBowtieView(data, act, { id, name?, filters? }) → Data` — action `'Rename bow-tie view'` when only the name changes, else `'Save bow-tie view'`.
  - `setBowtieSharing(data, act, { id, sharedWith: string[] }) → Data` — action `'Share bow-tie view'`.
  - `deleteBowtieView(data, act, { id }) → Data` — action `'Delete bow-tie view'`.
  - Refusals: `PivotError('bowtie.not-owner')`, `PivotError('bowtie.not-on-platform')`, `PivotError('empty')` for a blank name, `PivotError('not-found')` for a missing or deleted view.
  - In `src/core/bowtie.js`: `canSee(view, profileId) → boolean`, `myViews(data, profileId) → Rec[]`, `sharedWithMe(data, profileId) → Rec[]` (both live only, by name then id).

- [ ] **Step 1: Write the failing tests**

Create `test/core/bowtie-views.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { KINDS, emptyData } from '../../src/core/data.js';
import { entries } from '../../src/core/history.js';
import { mergeData } from '../../src/core/merge.js';
import { startAcks, waitingChanges } from '../../src/core/acks.js';
import { createBowtieView, updateBowtieView, setBowtieSharing, deleteBowtieView } from '../../src/core/ops/bowtie-views.js';
import { myViews, sharedWithMe, canSee } from '../../src/core/bowtie.js';
import { KIND_LABEL, recordName } from '../../src/ui/names.js';
import { seed, act, later } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const F = { set: 'all', statuses: ['planned'] };
/** u1 owns v1 (h1 on p1) and v2 (h1 on p2); v3 belongs to u2. */
function data() {
  let d = createBowtieView(seed(), act, { id: 'v1', name: 'Fire on Alpha', hazardId: 'h1', platformId: 'p1', filters: F });
  d = createBowtieView(d, act, { id: 'v2', name: 'Alpha before', hazardId: 'h1', platformId: 'p2', filters: F });
  return createBowtieView(d, later, { id: 'v3', name: 'Ben view', hazardId: 'h1', platformId: 'p1', filters: F });
}

test('a view is a record owned by whoever saved it, holding its choices and nobody to share with', () => {
  assert.ok(KINDS.includes('bowtieView'));
  assert.equal(KIND_LABEL.bowtieView, 'Bow-tie view');
  const d = data();
  const v = d.records.bowtieView.v1;
  assert.deepEqual({ name: v.name, ownerId: v.ownerId, hazardId: v.hazardId, platformId: v.platformId, filters: v.filters, sharedWith: v.sharedWith, status: v.status },
    { name: 'Fire on Alpha', ownerId: 'u1', hazardId: 'h1', platformId: 'p1', filters: { set: 'all', statuses: ['planned'] }, sharedWith: [], status: 'live' });
  assert.equal(entries(d).at(-1).action, 'Save bow-tie view');
  assert.equal(recordName('bowtieView', v), 'Fire on Alpha');
  assert.throws(() => createBowtieView(d, act, { name: ' ', hazardId: 'h1', platformId: 'p1', filters: F }), code('empty'));
  assert.throws(() => createBowtieView(d, act, { name: 'x', hazardId: 'h2', platformId: 'p1', filters: F }), code('bowtie.not-on-platform'));
  assert.throws(() => createBowtieView(d, act, { name: 'x', hazardId: 'h1', platformId: 'p1', filters: { set: 'nope', statuses: [] } }), code('bowtie.filters'));
});

test('only the owner saves, renames, shares or deletes a view', () => {
  let d = data();
  d = updateBowtieView(d, act, { id: 'v1', filters: { set: 'existing', statuses: [] } });
  assert.equal(entries(d).at(-1).action, 'Save bow-tie view');
  assert.deepEqual(d.records.bowtieView.v1.filters, { set: 'existing', statuses: [] });
  d = updateBowtieView(d, act, { id: 'v1', name: 'Alpha now' });
  assert.equal(entries(d).at(-1).action, 'Rename bow-tie view');
  assert.equal(d.records.bowtieView.v1.name, 'Alpha now');
  for (const op of [
    () => updateBowtieView(d, later, { id: 'v1', name: 'Mine now' }),
    () => setBowtieSharing(d, later, { id: 'v1', sharedWith: ['u2'] }),
    () => deleteBowtieView(d, later, { id: 'v1' }),
  ]) assert.throws(op, code('bowtie.not-owner'));
  d = deleteBowtieView(d, act, { id: 'v1' });
  assert.equal(d.records.bowtieView.v1.status, 'deleted');
  assert.equal(entries(d).at(-1).action, 'Delete bow-tie view');
  assert.throws(() => updateBowtieView(d, act, { id: 'v1', name: 'Back' }), code('not-found'));
});

test('sharing: chosen profiles see it under Shared with me; the owner is never on the list; unsharing takes it away', () => {
  let d = setBowtieSharing(data(), act, { id: 'v1', sharedWith: ['u2', 'u1', 'u3', 'u2', ''] });
  assert.deepEqual(d.records.bowtieView.v1.sharedWith, ['u2', 'u3']);
  assert.equal(entries(d).at(-1).action, 'Share bow-tie view');
  assert.deepEqual(myViews(d, 'u1').map((v) => v.id), ['v2', 'v1'], 'by name');
  assert.deepEqual(sharedWithMe(d, 'u1').map((v) => v.id), []);
  assert.deepEqual(myViews(d, 'u2').map((v) => v.id), ['v3']);
  assert.deepEqual(sharedWithMe(d, 'u2').map((v) => v.id), ['v1']);
  assert.ok(canSee(d.records.bowtieView.v1, 'u3'));
  assert.ok(!canSee(d.records.bowtieView.v2, 'u2'));
  d = setBowtieSharing(d, act, { id: 'v1', sharedWith: ['u3'] });
  assert.deepEqual(sharedWithMe(d, 'u2').map((v) => v.id), []);
  d = deleteBowtieView(d, act, { id: 'v1' });
  assert.deepEqual(sharedWithMe(d, 'u3'), [], 'a deleted view is seen by nobody');
  assert.ok(!canSee(d.records.bowtieView.v1, 'u1'));
});

test('views merge on save like any record, and never wait for acknowledgement', () => {
  const base = startAcks(data(), { by: 'u1', at: '2026-09-28T09:00:00+10:00' });
  const mine = updateBowtieView(base, act, { id: 'v1', name: 'Mine' });
  const theirs = createBowtieView(base, later, { id: 'v4', name: 'Theirs', hazardId: 'h1', platformId: 'p2', filters: F });
  const m = mergeData(base, mine, theirs, act);
  assert.equal(m.data.records.bowtieView.v1.name, 'Mine');
  assert.equal(m.data.records.bowtieView.v4.name, 'Theirs');
  assert.deepEqual(m.conflicts, []);
  const shared = setBowtieSharing(base, act, { id: 'v1', sharedWith: ['u2'] });
  assert.deepEqual(entries(shared).at(-1).platforms, []);
  assert.deepEqual(waitingChanges(shared, 'p1'), waitingChanges(base, 'p1'));
});

test('an empty file gets an empty bowtieView collection', () => {
  assert.deepEqual(emptyData().records.bowtieView, {});
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/core/bowtie-views.test.js`
Expected: FAIL — `Cannot find module '.../src/core/ops/bowtie-views.js'`.

Check `waitingChanges` and `startAcks` are exported from `src/core/acks.js` (`grep -n "export function" src/core/acks.js`); both are.

- [ ] **Step 3: Add the kind**

In `src/core/data.js`, change the `KINDS` list to end with `'bowtieView'`:

```js
export const KINDS = Object.freeze([
  'hazard', 'causalFactor', 'consequence', 'control', 'platform',
  'hazardControl', 'hazardPlatform', 'ruling', 'rating', 'report',
  'review', 'reviewRow',
  'reference', 'referenceLink',
  'assessment', 'sfarp', 'existingControl',
  'phase', 'hazardPhase', 'safetyReport', 'controlPlatform',
  'bowtieView',
]);
```

`normalizeData` already gives every kind a collection, so old files load unchanged.

- [ ] **Step 4: Write `src/core/ops/bowtie-views.js`**

```js
import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';
import { needFilters } from '../bowtie.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

/** A view the acting profile owns; anyone else is told to save a copy. @param {Data} data @param {Act} act @param {string} id */
function mine(data, act, id) {
  const v = need(data, 'bowtieView', id);
  if (v.ownerId !== act.by) throw new PivotError('bowtie.not-owner', `Only its owner can change ${v.name}. Save a copy to make your own.`);
  return v;
}

/** The profiles to share with: each once, in order, never the owner. @param {unknown} list @param {string} owner */
function others(list, owner) {
  const ids = Array.isArray(list) ? list.map(String) : [];
  return [...new Set(ids)].filter((p) => p && p !== owner).sort();
}

/** @param {Data} data @param {Act} act @param {{ id?: string, name: string, hazardId: string, platformId: string, filters: unknown }} args */
export function createBowtieView(data, act, { id = newId(), name, hazardId, platformId, filters }) {
  const link = get(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  if (!link || link.status !== 'live') throw new PivotError('bowtie.not-on-platform', 'That hazard is not on that platform, so its bow-tie cannot be saved.');
  const rec = created(act, id, {
    name: needText(name, 'A view name'), ownerId: act.by, hazardId, platformId, filters: needFilters(filters), sharedWith: [],
  });
  return commit(data, act, 'Save bow-tie view', [{ kind: 'bowtieView', rec }]);
}

/** Save new filters, rename, or both. @param {Data} data @param {Act} act @param {{ id: string, name?: string, filters?: unknown }} args */
export function updateBowtieView(data, act, { id, name, filters }) {
  const v = mine(data, act, id);
  /** @type {Record<string, any>} */
  const fields = {};
  if (name !== undefined) fields.name = needText(name, 'A view name');
  if (filters !== undefined) fields.filters = needFilters(filters);
  const action = name !== undefined && filters === undefined ? 'Rename bow-tie view' : 'Save bow-tie view';
  return commit(data, act, action, [{ kind: 'bowtieView', rec: changed(v, act, fields) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, sharedWith: unknown }} args */
export function setBowtieSharing(data, act, { id, sharedWith }) {
  const v = mine(data, act, id);
  return commit(data, act, 'Share bow-tie view', [{ kind: 'bowtieView', rec: changed(v, act, { sharedWith: others(sharedWith, v.ownerId) }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deleteBowtieView(data, act, { id }) {
  const v = mine(data, act, id);
  return commit(data, act, 'Delete bow-tie view', [{ kind: 'bowtieView', rec: changed(v, act, { status: 'deleted' }) }]);
}
```

- [ ] **Step 5: Append visibility to `src/core/bowtie.js`**

```js
/** A live view its owner, or a profile it is shared with, may open. @param {Rec} view @param {string | null} profileId */
export function canSee(view, profileId) {
  return view.status === 'live' && profileId !== null && (view.ownerId === profileId || (view.sharedWith ?? []).includes(profileId));
}

/** @param {Rec} a @param {Rec} b */
const byName = (a, b) => String(a.name).localeCompare(String(b.name)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The profile's own views, by name. @param {Data} data @param {string} profileId */
export function myViews(data, profileId) {
  return live(data, 'bowtieView').filter((v) => v.ownerId === profileId).sort(byName);
}

/** Other people's views shared with the profile, by name. @param {Data} data @param {string} profileId */
export function sharedWithMe(data, profileId) {
  return live(data, 'bowtieView').filter((v) => v.ownerId !== profileId && (v.sharedWith ?? []).includes(profileId)).sort(byName);
}
```

- [ ] **Step 6: Name the kind in `src/ui/names.js`**

Add `bowtieView: 'Bow-tie view'` to the end of `KIND_LABEL`:

```js
  phase: 'Lifecycle phase', hazardPhase: 'Lifecycle phase link', safetyReport: 'Safety report', controlPlatform: 'Control owner',
  bowtieView: 'Bow-tie view',
});
```

In `recordName`'s second `switch (kind)` (the one after `if (data) {…}`), add a case next to the others that return a field:

```js
    case 'bowtieView': return rec.name;
```

Read the rest of that switch first (`sed -n 40,70p src/ui/names.js`) and put the case before its `default`.

- [ ] **Step 7: Run to see them pass, then the whole suite**

Run: `node --test test/core/bowtie-views.test.js` — expected PASS (5 tests).
Run: `npm test` — expected all pass. A test that counts `KINDS` or snapshots `emptyData()` may need `bowtieView` added; update such a test only by adding the new kind.

- [ ] **Step 8: Type-check and commit**

Run: `npm run typecheck`

```bash
git add src/core/data.js src/core/bowtie.js src/core/ops/bowtie-views.js src/ui/names.js test/core/bowtie-views.test.js
git commit -m "Saved bow-tie views: a record kind owned by whoever saved it, changed only by its owner, shared with chosen profiles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Drawing a bow-tie (`src/ui/bowtie-svg.js`)

**Files:**
- Create: `src/ui/bowtie-svg.js`
- Test: `test/ui/bowtie-svg.test.js`

**Interfaces:**
- Consumes: `Bowtie` from Task 1 (`bowtieOf(...)` with `ok: true`); `hazardLabel`, `controlLabel` from `src/core/ids.js`; `esc` from `src/ui/html.js`.
- Produces: `bowtieSvg(bowtie: Bowtie) → string` (one `<svg xmlns=…>` document) and `wrap(text: string) → string[]`. Markup contract used by tests and the screen:
  - Each box is `<g data-bowtie-node="<kind>" data-record-id="<id>" …>` with kind in `causal-factor | preventative-control | hazard | mitigating-control | consequence`, holding one `<title>`, one `<rect x y width height …>` and one `<text>` of `<tspan>`s. Control boxes also carry `data-source="existing|additional"` and, for additional ones, `data-state="<status>"`.
  - An empty column is `<g data-bowtie-empty="<kind>">` with a `<rect>` and a muted `<text>`.
  - Additional control rects carry `stroke-dasharray="6 4"`; existing ones do not.
  - One `<text data-bowtie-caption="true">` holds `bowtie.caption`.
  - Edges are `<line data-bowtie-edge="<causal factor or consequence id>" …>`.

- [ ] **Step 1: Write the failing tests**

Create `test/ui/bowtie-svg.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignNumbers, updateHazard, addCausalFactor } from '../../src/core/ops/hazards.js';
import { linkExistingControl } from '../../src/core/ops/controls.js';
import { bowtieOf, DEFAULT_FILTERS } from '../../src/core/bowtie.js';
import { bowtieSvg, wrap } from '../../src/ui/bowtie-svg.js';
import { seed, act } from '../helpers.js';

const ORDER = ['causal-factor', 'preventative-control', 'hazard', 'mitigating-control', 'consequence'];
/** Every box and empty-column note, with its rect. @param {string} svg */
function boxes(svg) {
  return [...svg.matchAll(/<g data-bowtie-(node|empty)="([^"]+)"([^>]*)>[\s\S]*?<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"([^>]*)>/g)]
    .map((m) => ({ type: m[1], kind: m[2], attrs: m[3], x: +m[4], y: +m[5], w: +m[6], h: +m[7], rect: m[8] }));
}
function drawn(d, filters = DEFAULT_FILTERS) {
  const b = bowtieOf(d, 'h1', 'p1', filters);
  assert.equal(b.ok, true);
  return bowtieSvg(/** @type {any} */ (b));
}

test('wrap breaks only at spaces and keeps every word, however long', () => {
  assert.deepEqual(wrap('  one two  three '), ['one two three']);
  assert.deepEqual(wrap('a'.repeat(40) + ' b'), ['a'.repeat(40), 'b']);
  assert.equal(wrap('The quick brown fox jumps over the lazy dog again and again').join(' '), 'The quick brown fox jumps over the lazy dog again and again');
  assert.ok(wrap('The quick brown fox jumps over the lazy dog again and again').every((l) => l.length <= 28));
});

test('one box per thing, in five columns left to right, each column in order, nothing overlapping', () => {
  let d = seed();
  d = addCausalFactor(d, act, { id: 'cf2', hazardId: 'h1', text: 'Electrical fault in the switchboard room during maintenance' });
  d = linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'preventative' });
  const svg = drawn(assignNumbers(d));
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+"/);
  const b = boxes(svg);
  assert.deepEqual(b.map((x) => x.kind), ['causal-factor', 'causal-factor', 'preventative-control', 'preventative-control', 'hazard', 'mitigating-control', 'consequence']);
  assert.match(svg, /data-bowtie-node="causal-factor" data-record-id="cf1"/);
  assert.match(svg, /data-bowtie-node="hazard" data-record-id="h1"/);
  for (const a of b) {
    for (const c of b) {
      if (a === c) continue;
      const apart = a.x + a.w < c.x || c.x + c.w < a.x || a.y + a.h < c.y || c.y + c.h < a.y;
      assert.ok(apart, `${a.kind} and ${c.kind} overlap`);
      if (ORDER.indexOf(a.kind) < ORDER.indexOf(c.kind)) assert.ok(a.x + a.w < c.x, `${a.kind} is left of ${c.kind}`);
    }
  }
  const causes = b.filter((x) => x.kind === 'causal-factor');
  assert.ok(causes[0].y + causes[0].h < causes[1].y, 'in the hazard\'s order, top to bottom');
  assert.equal([...svg.matchAll(/data-bowtie-edge=/g)].length, 3, 'two causal factors in, one consequence out');
});

test('existing and additional controls look different and say which they are in words', () => {
  const d = linkExistingControl(seed(), act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'preventative' });
  const svg = drawn(assignNumbers(d));
  const controls = boxes(svg).filter((x) => x.kind.endsWith('-control'));
  const existing = controls.find((x) => x.attrs.includes('data-source="existing"'));
  const additional = controls.find((x) => x.attrs.includes('data-source="additional"'));
  assert.ok(existing && additional);
  assert.doesNotMatch(existing.rect, /stroke-dasharray/);
  assert.match(additional.rect, /stroke-dasharray="6 4"/);
  assert.match(additional.attrs, /data-state="recommended"/);
  assert.match(svg, />Existing<\/tspan>/);
  assert.match(svg, />Additional · Recommended<\/tspan>/);
  assert.match(svg, />C-0001 Sprinklers<\/tspan>/);
  assert.match(svg, /<text data-bowtie-caption="true"[^>]*>Alpha · Existing \+ Additional \(Recommended, Planned, Implemented\)<\/text>/);
});

test('an empty wing says so rather than vanishing', () => {
  const svg = drawn(assignNumbers(seed()), { set: 'existing', statuses: [] });
  assert.match(svg, /data-bowtie-empty="preventative-control"[\s\S]*?No preventative controls in this view/);
  assert.match(svg, /data-bowtie-empty="mitigating-control"[\s\S]*?No mitigating controls in this view/);
  assert.equal(boxes(svg).filter((x) => x.type === 'empty').length, 2);
});

test('stored text is drawn as text, whole, never as markup; a long word widens its box', () => {
  let d = updateHazard(seed(), act, { id: 'h1', title: '<script>alert("x")</script> & fire' });
  d = addCausalFactor(d, act, { id: 'cf2', hazardId: 'h1', text: 'Supercalifragilisticexpialidociousnessness-of-wiring' });
  const svg = drawn(assignNumbers(d));
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /<title>&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; fire<\/title>/);
  assert.match(svg, />Supercalifragilisticexpialidociousnessness-of-wiring<\/tspan>/);
  const long = boxes(svg).find((x) => x.attrs.includes('data-record-id="cf2"'));
  assert.ok(long && long.w >= 52 * 7, 'the box is as wide as the word');
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/ui/bowtie-svg.test.js`
Expected: FAIL — `Cannot find module '.../src/ui/bowtie-svg.js'`. Check `updateHazard` accepts `{ id, title }` (`grep -n "export function updateHazard" -A6 src/core/ops/hazards.js`).

- [ ] **Step 3: Write `src/ui/bowtie-svg.js`**

```js
import { esc } from './html.js';
import { hazardLabel, controlLabel } from '../core/ids.js';

/** @typedef {import('../core/bowtie.js').Bowtie} Bowtie */
/** @typedef {import('../core/bowtie.js').Item} Item */
/**
 * @typedef {{ kind: string, id: string | null, title: string, lines: string[], style: 'plain' | 'hazard' | 'existing' | 'additional' | 'empty',
 *   item: Item | null, x: number, y: number, width: number, height: number }} Box
 */

// The grid, in user units. A box is sized from its text's length, never measured, so the same
// data always draws the same picture.
const CHARS_PER_LINE = 28;
const CHAR_WIDTH = 7;
const LINE_HEIGHT = 16;
const PAD = 8;
const COLUMN_GAP = 48;
const ROW_GAP = 16;
const MARGIN = 24;
const CAPTION_HEIGHT = 32;
const FONT_SIZE = 12;
const FONT = 'Atkinson Hyperlegible, Segoe UI, system-ui, sans-serif';
// Its own light palette, so an exported file reads the same in any viewer.
const PAPER = '#ffffff';
const INK = '#1b1f24';
const MUTED = '#5d6673';
const EDGE = '#8a93a0';
const ACCENT = '#fa9a26';

const COLUMNS = ['causal-factor', 'preventative-control', 'hazard', 'mitigating-control', 'consequence'];
const EMPTY = ['No causal factors recorded', 'No preventative controls in this view', '', 'No mitigating controls in this view', 'No consequences recorded'];

/**
 * The text's words, broken only at whitespace into lines of at most CHARS_PER_LINE characters
 * where a word allows; a longer word is a line of its own, never split.
 * @param {string} text @returns {string[]}
 */
export function wrap(text) {
  const words = String(text).trim().split(/\s+/).filter((w) => w !== '');
  /** @type {string[]} */
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= CHARS_PER_LINE) line = `${line} ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** @param {string} kind @param {string | null} id @param {string} title @param {string[]} lines @param {Box['style']} style @param {Item | null} [item] @returns {Box} */
function box(kind, id, title, lines, style, item = null) {
  return { kind, id, title, lines, style, item, x: 0, y: 0, width: 0, height: lines.length * LINE_HEIGHT + 2 * PAD };
}

/** @param {Item} i @param {string} kind */
function controlBox(i, kind) {
  const name = `${controlLabel(i.control)} ${i.control.title}`;
  return box(kind, i.control.id, name, [...wrap(name), i.line], i.source, i);
}

/** @param {Box} b @returns {string} */
function drawBox(b) {
  if (b.style === 'empty') {
    return `<g data-bowtie-empty="${b.kind}"><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="none" stroke="none"/>`
      + `<text font-family="${FONT}" font-size="${FONT_SIZE}" font-style="italic" fill="${MUTED}">${tspans(b)}</text></g>`;
  }
  const i = b.item;
  const attrs = i ? ` data-source="${i.source}"${i.state ? ` data-state="${esc(i.state)}"` : ''}` : '';
  const stroke = b.style === 'hazard' ? `stroke="${ACCENT}" stroke-width="3"` : `stroke="${INK}" stroke-width="1.5"`;
  const dash = b.style === 'additional' ? ' stroke-dasharray="6 4"' : '';
  const ink = i?.state === 'rejected' ? MUTED : INK;
  const weight = b.style === 'hazard' ? ' font-weight="700"' : '';
  return `<g data-bowtie-node="${b.kind}" data-record-id="${esc(b.id)}"${attrs}><title>${esc(b.title)}</title>`
    + `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${PAPER}" ${stroke}${dash}/>`
    + `<text font-family="${FONT}" font-size="${FONT_SIZE}" fill="${ink}"${weight}>${tspans(b)}</text></g>`;
}

/** @param {Box} b */
function tspans(b) {
  return b.lines.map((l, n) => `<tspan x="${b.x + PAD}" y="${b.y + PAD + (n + 1) * LINE_HEIGHT - 4}">${esc(l)}</tspan>`).join('');
}

/**
 * The bow-tie as one self-contained SVG document: the same string is shown and exported.
 * @param {Bowtie} w @returns {string}
 */
export function bowtieSvg(w) {
  const hazard = box('hazard', w.hazard.id, String(w.hazard.title), [hazardLabel(w.hazard), ...wrap(w.hazard.title)], 'hazard');
  /** @type {Box[][]} */
  const columns = [
    w.causalFactors.map((f) => box('causal-factor', f.id, String(f.text), wrap(f.text), 'plain')),
    w.preventative.map((i) => controlBox(i, 'preventative-control')),
    [hazard],
    w.mitigating.map((i) => controlBox(i, 'mitigating-control')),
    w.consequences.map((q) => box('consequence', q.id, String(q.text), wrap(q.text), 'plain')),
  ].map((col, n) => (col.length ? col : [box(COLUMNS[n], null, EMPTY[n], wrap(EMPTY[n]), 'empty')]));

  const heights = columns.map((col) => col.reduce((sum, b) => sum + b.height, 0) + (col.length - 1) * ROW_GAP);
  const contentHeight = Math.max(...heights);
  const top = MARGIN + CAPTION_HEIGHT;
  let x = MARGIN;
  columns.forEach((col, n) => {
    const width = Math.max(1, ...col.flatMap((b) => b.lines.map((l) => l.length))) * CHAR_WIDTH + 2 * PAD;
    let y = top + Math.floor((contentHeight - heights[n]) / 2);
    for (const b of col) {
      b.x = x;
      b.y = y;
      b.width = width;
      y += b.height + ROW_GAP;
    }
    x += width + COLUMN_GAP;
  });
  const width = x - COLUMN_GAP + MARGIN;
  const height = top + contentHeight + MARGIN;

  // One line from each causal factor into the hazard, one from the hazard to each consequence;
  // controls sit on those lines as barriers.
  const midY = hazard.y + Math.floor(hazard.height / 2);
  const edges = [
    ...columns[0].filter((b) => b.style !== 'empty').map((b) => `<line data-bowtie-edge="${esc(b.id)}" x1="${b.x + b.width}" y1="${b.y + Math.floor(b.height / 2)}" x2="${hazard.x}" y2="${midY}" stroke="${EDGE}" stroke-width="1.5"/>`),
    ...columns[4].filter((b) => b.style !== 'empty').map((b) => `<line data-bowtie-edge="${esc(b.id)}" x1="${hazard.x + hazard.width}" y1="${midY}" x2="${b.x}" y2="${b.y + Math.floor(b.height / 2)}" stroke="${EDGE}" stroke-width="1.5"/>`),
  ];
  const caption = `<text data-bowtie-caption="true" x="${MARGIN}" y="${MARGIN + FONT_SIZE + 2}" font-family="${FONT}" font-size="${FONT_SIZE + 2}" font-weight="700" fill="${INK}">${esc(w.caption)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(`Bow-tie: ${w.hazard.title}, ${w.caption}`)}">`
    + `<rect width="${width}" height="${height}" fill="${PAPER}"/>`
    + caption
    + edges.join('')
    + columns.flat().map(drawBox).join('')
    + '</svg>';
}
```

- [ ] **Step 4: Run to see them pass**

Run: `node --test test/ui/bowtie-svg.test.js` — expected PASS (5 tests).

Note the `boxes()` helper matches the first `<rect x=…` after each `<g data-bowtie-…>`; the background `<rect width=… height=…>` has no `x`, so it is never mistaken for a box.

- [ ] **Step 5: Type-check and commit**

Run: `npm run typecheck`

```bash
git add src/ui/bowtie-svg.js test/ui/bowtie-svg.test.js
git commit -m "Bow-tie drawing: one self-contained SVG, five columns, whole text, existing solid and additional dashed with their set and status in words

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Placing windows (`src/ui/workspace.js`)

**Files:**
- Create: `src/ui/workspace.js`
- Test: `test/ui/workspace.test.js`

**Interfaces:**
- Consumes: `normalizeFilters`, `sameFilters`, `DEFAULT_FILTERS` from Task 1.
- Produces:
  - `Pane = { viewId: string | null, hazardId: string, platformId: string, filters: Filters }`
  - `Workspace = { panes: [Pane | null, Pane | null], lastUsed: 0 | 1 }` — one open window is always in slot 0.
  - `Side = 0 | 1 | 'last'`
  - `emptyWorkspace() → Workspace`
  - `paneCount(ws) → number`
  - `replacedBy(ws, side: Side) → 0 | 1 | null` — which window a placement would replace.
  - `placePane(ws, side: Side, pane) → Workspace`
  - `movePane(ws, from: 0|1, to: 0|1) → Workspace`
  - `swapPanes(ws) → Workspace`
  - `closePane(ws, i: 0|1) → Workspace`
  - `updatePane(ws, i: 0|1, patch: Partial<Pane>) → Workspace`
  - `paneDirty(pane, data) → boolean` — its filters differ from its live view's, or from the defaults when it has no live view.
  - `workspaceKey(folderName, profileId) → string` = `` `pivot.bowtieWorkspace:${folderName}:${profileId}` ``
  - `readWorkspace(storage, key) → Workspace` (never throws) and `writeWorkspace(storage, key, ws) → void` (never throws).

- [ ] **Step 1: Write the failing tests**

Create `test/ui/workspace.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../fakes/storage.js';
import { emptyWorkspace, paneCount, replacedBy, placePane, movePane, swapPanes, closePane, updatePane, paneDirty, workspaceKey, readWorkspace, writeWorkspace } from '../../src/ui/workspace.js';
import { createBowtieView, deleteBowtieView } from '../../src/core/ops/bowtie-views.js';
import { seed, act } from '../helpers.js';

const F = { set: 'all', statuses: ['recommended', 'planned', 'implemented'] };
const A = { viewId: null, hazardId: 'h1', platformId: 'p1', filters: F };
const B = { viewId: null, hazardId: 'h1', platformId: 'p2', filters: F };
const C = { viewId: 'v1', hazardId: 'h1', platformId: 'p1', filters: F };
const ids = (ws) => ws.panes.map((p) => (p ? p.platformId + (p.viewId ?? '') : null));

test('the first window fills the stage wherever it is dropped', () => {
  for (const side of [0, 1, 'last']) {
    const ws = placePane(emptyWorkspace(), side, A);
    assert.deepEqual(ws, { panes: [A, null], lastUsed: 0 });
    assert.equal(paneCount(ws), 1);
  }
  assert.equal(replacedBy(emptyWorkspace(), 'last'), null);
});

test('dropping beside one window splits the stage; the other window takes the other half', () => {
  const one = placePane(emptyWorkspace(), 'last', A);
  assert.equal(replacedBy(one, 0), null);
  assert.deepEqual(ids(placePane(one, 0, B)), ['p2', 'p1']);
  assert.deepEqual(ids(placePane(one, 1, B)), ['p1', 'p2']);
  assert.equal(placePane(one, 1, B).lastUsed, 1);
  assert.equal(replacedBy(one, 'last'), 0, 'a click replaces the only window');
  assert.deepEqual(ids(placePane(one, 'last', B)), ['p2', null]);
});

test('with two windows, a drop replaces its half and a click replaces the window used last', () => {
  const two = placePane(placePane(emptyWorkspace(), 'last', A), 1, B);
  assert.equal(replacedBy(two, 0), 0);
  assert.deepEqual(ids(placePane(two, 0, C)), ['p1v1', 'p2']);
  assert.equal(replacedBy(two, 'last'), 1);
  assert.deepEqual(ids(placePane(two, 'last', C)), ['p1', 'p1v1']);
  assert.deepEqual(ids(updatePane(two, 0, { filters: { set: 'existing', statuses: [] } })), ['p1', 'p2']);
  assert.equal(updatePane(two, 0, { platformId: 'p9' }).lastUsed, 0);
});

test('moving, swapping and closing windows', () => {
  const two = placePane(placePane(emptyWorkspace(), 'last', A), 1, B);
  assert.deepEqual(ids(movePane(two, 0, 1)), ['p2', 'p1']);
  assert.equal(movePane(two, 0, 1).lastUsed, 1);
  assert.deepEqual(ids(movePane(two, 1, 1)), ['p1', 'p2'], 'dropped where it already is');
  assert.deepEqual(ids(swapPanes(two)), ['p2', 'p1']);
  const one = placePane(emptyWorkspace(), 'last', A);
  assert.deepEqual(movePane(one, 0, 1), one, 'one window has nowhere to move');
  assert.deepEqual(closePane(two, 0), { panes: [B, null], lastUsed: 0 });
  assert.deepEqual(closePane(two, 1), { panes: [A, null], lastUsed: 0 });
  assert.deepEqual(closePane(one, 0), emptyWorkspace());
});

test('a window is unsaved when its filters differ from its view, or from the defaults with no view', () => {
  let d = createBowtieView(seed(), act, { id: 'v1', name: 'Fire', hazardId: 'h1', platformId: 'p1', filters: { set: 'existing', statuses: [] } });
  assert.equal(paneDirty({ ...C, filters: { set: 'existing', statuses: [] } }, d), false);
  assert.equal(paneDirty(C, d), true);
  assert.equal(paneDirty(A, d), false);
  assert.equal(paneDirty({ ...A, filters: { set: 'additional', statuses: [] } }, d), true);
  d = deleteBowtieView(d, act, { id: 'v1' });
  assert.equal(paneDirty({ ...C, filters: { set: 'existing', statuses: [] } }, d), true, 'its view is gone');
});

test('the workspace is remembered per folder and profile, and anything unreadable starts empty', () => {
  const s = new MemoryStorage();
  const key = workspaceKey('Pivot', 'u1');
  assert.equal(key, 'pivot.bowtieWorkspace:Pivot:u1');
  const two = placePane(placePane(emptyWorkspace(), 'last', A), 1, C);
  writeWorkspace(s, key, two);
  assert.deepEqual(readWorkspace(s, key), two);
  assert.deepEqual(readWorkspace(s, workspaceKey('Pivot', 'u2')), emptyWorkspace());
  s.setItem(key, 'not json');
  assert.deepEqual(readWorkspace(s, key), emptyWorkspace());
  s.setItem(key, JSON.stringify({ panes: [{ hazardId: 3 }, null], lastUsed: 0 }));
  assert.deepEqual(readWorkspace(s, key), emptyWorkspace());
  s.setItem(key, JSON.stringify({ panes: [null, { ...A, filters: { set: 'bogus' } }], lastUsed: 7 }));
  assert.deepEqual(readWorkspace(s, key), { panes: [{ ...A, filters: F }, null], lastUsed: 0 }, 'a lone window moves to the first slot');
  s.refuseReads();
  assert.deepEqual(readWorkspace(s, key), emptyWorkspace());
  const full = new MemoryStorage();
  full.fill();
  assert.doesNotThrow(() => writeWorkspace(full, key, two));
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/ui/workspace.test.js`
Expected: FAIL — `Cannot find module '.../src/ui/workspace.js'`.

- [ ] **Step 3: Write `src/ui/workspace.js`**

```js
import { normalizeFilters, sameFilters, DEFAULT_FILTERS } from '../core/bowtie.js';

/** @typedef {import('../core/bowtie.js').Filters} Filters */
/** @typedef {{ viewId: string | null, hazardId: string, platformId: string, filters: Filters }} Pane */
/** @typedef {{ panes: [Pane | null, Pane | null], lastUsed: 0 | 1 }} Workspace */
/** @typedef {0 | 1 | 'last'} Side */

/** No windows. One open window is always kept in the first slot, and fills the stage. @returns {Workspace} */
export function emptyWorkspace() {
  return { panes: [null, null], lastUsed: 0 };
}

/** @param {Workspace} ws */
export function paneCount(ws) {
  return ws.panes.filter(Boolean).length;
}

/** The window a placement would replace, or null when it replaces none. @param {Workspace} ws @param {Side} side @returns {0 | 1 | null} */
export function replacedBy(ws, side) {
  const n = paneCount(ws);
  if (n === 0) return null;
  if (side === 'last') return n === 1 ? 0 : ws.lastUsed;
  return n === 2 ? side : null;
}

/**
 * Put a window on the stage. Onto an empty stage it fills it; dropped beside one window it takes
 * that half and the other window the other; with two it replaces its half. A click ('last')
 * replaces the only window, or the one used last.
 * @param {Workspace} ws @param {Side} side @param {Pane} pane @returns {Workspace}
 */
export function placePane(ws, side, pane) {
  const n = paneCount(ws);
  const [a, b] = ws.panes;
  if (n === 0) return { panes: [pane, null], lastUsed: 0 };
  if (side === 'last') {
    if (n === 1) return { panes: [pane, null], lastUsed: 0 };
    return ws.lastUsed === 0 ? { panes: [pane, b], lastUsed: 0 } : { panes: [a, pane], lastUsed: 1 };
  }
  if (n === 1) return side === 0 ? { panes: [pane, a], lastUsed: 0 } : { panes: [a, pane], lastUsed: 1 };
  return side === 0 ? { panes: [pane, b], lastUsed: 0 } : { panes: [a, pane], lastUsed: 1 };
}

/** Drag a window to the other half: the two change places. @param {Workspace} ws @param {0 | 1} from @param {0 | 1} to @returns {Workspace} */
export function movePane(ws, from, to) {
  if (paneCount(ws) < 2 || from === to) return ws;
  return { panes: [ws.panes[1], ws.panes[0]], lastUsed: to };
}

/** @param {Workspace} ws @returns {Workspace} */
export function swapPanes(ws) {
  if (paneCount(ws) < 2) return ws;
  return { panes: [ws.panes[1], ws.panes[0]], lastUsed: ws.lastUsed === 0 ? 1 : 0 };
}

/** Close a window; the other, if any, fills the stage. @param {Workspace} ws @param {0 | 1} i @returns {Workspace} */
export function closePane(ws, i) {
  const other = ws.panes[i === 0 ? 1 : 0];
  return other ? { panes: [other, null], lastUsed: 0 } : emptyWorkspace();
}

/** @param {Workspace} ws @param {0 | 1} i @param {Partial<Pane>} patch @returns {Workspace} */
export function updatePane(ws, i, patch) {
  const p = ws.panes[i];
  if (!p) return ws;
  const panes = /** @type {[Pane | null, Pane | null]} */ ([...ws.panes]);
  panes[i] = { ...p, ...patch };
  return { panes, lastUsed: i };
}

/**
 * Whether replacing the window would lose choices: its filters differ from its live view's, or
 * from the defaults when it has none.
 * @param {Pane} pane @param {import('../core/data.js').Data} data
 */
export function paneDirty(pane, data) {
  if (!pane.viewId) return !sameFilters(pane.filters, DEFAULT_FILTERS);
  const v = data.records.bowtieView?.[pane.viewId];
  return !v || v.status !== 'live' || !sameFilters(pane.filters, v.filters);
}

/** @param {string} folderName @param {string} profileId */
export function workspaceKey(folderName, profileId) {
  return `pivot.bowtieWorkspace:${folderName}:${profileId}`;
}

/** @param {unknown} p @returns {Pane | null} */
function readPane(p) {
  if (!p || typeof p !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (p);
  if (typeof o.hazardId !== 'string' || typeof o.platformId !== 'string') return null;
  return { viewId: typeof o.viewId === 'string' ? o.viewId : null, hazardId: o.hazardId, platformId: o.platformId, filters: normalizeFilters(o.filters) };
}

/**
 * The windows this browser last had open for the folder and profile. A convenience only: a
 * missing, refused or unreadable value is an empty stage.
 * @param {Storage} storage @param {string} key @returns {Workspace}
 */
export function readWorkspace(storage, key) {
  try {
    const v = JSON.parse(storage.getItem(key) ?? 'null');
    if (!v || !Array.isArray(v.panes) || v.panes.length !== 2) return emptyWorkspace();
    const kept = v.panes.map(readPane).filter(Boolean);
    if (kept.length !== v.panes.filter(Boolean).length) return emptyWorkspace();
    if (kept.length === 2) return { panes: [kept[0], kept[1]], lastUsed: v.lastUsed === 1 ? 1 : 0 };
    return kept.length === 1 ? { panes: [kept[0], null], lastUsed: 0 } : emptyWorkspace();
  } catch {
    return emptyWorkspace();
  }
}

/** @param {Storage} storage @param {string} key @param {Workspace} ws */
export function writeWorkspace(storage, key, ws) {
  try {
    storage.setItem(key, JSON.stringify(ws));
  } catch {
    // Remembering the windows is a convenience; a full or refused storage just forgets them.
  }
}
```

- [ ] **Step 4: Run to see them pass**

Run: `node --test test/ui/workspace.test.js` — expected PASS (6 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npm run typecheck`

```bash
git add src/ui/workspace.js test/ui/workspace.test.js
git commit -m "Bow-tie windows: place, split, replace, move, swap and close up to two, remembered per folder and profile in this browser

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Controller: bow-tie actions

**Files:**
- Modify: `src/ui/controller.js` (imports; `EDITS`; `QUIET`; `initialState`; `finishOpening`; `closePicker`; new handlers; one helper)
- Test: `test/ui/controller-bowties.test.js`

**Interfaces:**
- Consumes: Tasks 1, 2, 4; `store.writeExport(fileHandle, text)`; `env.pickSaveFile(name)`; existing `applyEdit`, `set`, `list`, `handlers.startEdit`.
- Produces (state): `state.workspace: Workspace` (initially `emptyWorkspace()`), `state.bowtieReplace: { side: Side, pane: Pane, index: 0 | 1 } | null`.
- Produces (actions — dispatched by the screen in Task 6 and drag code in Task 7; sides arrive as the strings `'0'`/`'1'` from `data-*` attributes):
  - `openBowtie({ hazardId, platformId })` — a new default window in the last-used place; goes to the Bow-ties view.
  - `newBowtie({ pair })` — `pair` is `"<hazardId>|<platformId>"`.
  - `openBowtieView({ id, side? })` — `side` `'0'`/`'1'`, or absent for the last-used window.
  - `dropBowtie({ side, viewId?, pane? })` — `pane` is `'0'`/`'1'` when a window was dragged.
  - `swapBowtiePanes()`, `closeBowtiePane({ side })`
  - `setPaneSet({ side, value })`, `setPaneStatus({ side, status, on })` (`on` is `'true'`/`'false'`)
  - `confirmBowtieReplace()`, `cancelBowtieReplace()`
  - `saveBowtiePane({ side })` — owner with a live view: saves the filters; otherwise opens the name box (`editing: { kind: 'bowtieName', id: side }`).
  - `saveBowtiePaneAs({ side, name })` — a new view owned by the active profile; the window now shows it.
  - `shareBowtieView({ id, profileId })` — `profileId` a string, an array, or absent (nobody).
  - `renameBowtieView({ id, name })`
  - `removeBowtieView({ id })` — deletes with the Undo offer.
  - `exportBowtie({ side })`
  - EDITS: `createBowtieView`, `updateBowtieView`, `setBowtieSharing`, `deleteBowtieView`.

- [ ] **Step 1: Write the failing tests**

Create `test/ui/controller-bowties.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { workspaceKey, emptyWorkspace } from '../../src/ui/workspace.js';
import { myViews, sharedWithMe } from '../../src/core/bowtie.js';

const env = (f, storage) => ({ clock: fixedClock('2026-09-30T10:00:00+10:00'), storage, minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

/** Open the folder as `name`, creating the profile if it is new. */
async function open(folder, name, storage = new MemoryStorage()) {
  const c = createController(env(folder, storage));
  await c.dispatch({ type: 'chooseFolder' });
  if (!c.getState().profiles.some((p) => p.name === name)) await c.dispatch({ type: 'createProfile', name });
  await c.dispatch({ type: 'selectProfile', id: c.getState().profiles.find((p) => p.name === name).id });
  return c;
}
/** Ben's profile exists; Ada has h1 Fire on p1 Alpha and p2 Bravo with a preventative control, unsaved. */
async function ready() {
  const folder = new MemoryFolder();
  const ben = await open(folder, 'Ben');
  const c = await open(folder, 'Ada');
  const me = c.getState().profileId;
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createControl', id: 'c1', title: 'Sprinklers' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: me });
  await c.dispatch({ type: 'createPlatform', id: 'p2', name: 'Bravo', ownerId: me });
  await c.dispatch({ type: 'linkHazards', platformId: 'p1', hazardId: ['h1'] });
  await c.dispatch({ type: 'linkHazards', platformId: 'p2', hazardId: ['h1'] });
  await c.dispatch({ type: 'linkControls', hazardId: 'h1', controlId: 'c1', 'kind:c1': 'preventative' });
  return { folder, c, me, benId: ben.getState().profileId };
}
const S = (c) => c.getState();
const W = (c) => S(c).session.working;
const panes = (c) => S(c).workspace.panes.map((p) => (p ? `${p.platformId}${p.viewId ? `:${p.viewId}` : ''}` : null));

test('opening diagrams: from a hazard\'s platform tab, from New diagram, and dropped beside one another', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  assert.equal(S(c).view.name, 'bowties');
  assert.deepEqual(panes(c), ['p1', null]);
  await c.dispatch({ type: 'newBowtie', pair: 'h1|p2' });
  assert.deepEqual(panes(c), ['p2', null], 'a click replaces the only window');
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'saveBowtiePaneAs', side: '0', name: 'Alpha' });
  const v = myViews(W(c), S(c).profileId)[0];
  await c.dispatch({ type: 'dropBowtie', side: '1', viewId: v.id });
  assert.deepEqual(panes(c), [`p1:${v.id}`, `p1:${v.id}`]);
  await c.dispatch({ type: 'setPaneSet', side: '1', value: 'existing' });
  await c.dispatch({ type: 'dropBowtie', side: '0', pane: '1' });
  assert.equal(S(c).workspace.panes[0].filters.set, 'existing', 'dragging a window across swaps the two');
  await c.dispatch({ type: 'swapBowtiePanes' });
  assert.equal(S(c).workspace.panes[1].filters.set, 'existing');
  await c.dispatch({ type: 'closeBowtiePane', side: '0' });
  assert.equal(S(c).workspace.panes[0].filters.set, 'existing');
  assert.equal(S(c).workspace.panes[1], null);
  await c.dispatch({ type: 'newBowtie', pair: 'nonsense' });
  assert.equal(S(c).message.kind, 'error');
});

test('filters change per window; replacing an unsaved window asks first', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'setPaneStatus', side: '0', status: 'rejected', on: 'true' });
  await c.dispatch({ type: 'setPaneStatus', side: '0', status: 'planned', on: 'false' });
  assert.deepEqual(S(c).workspace.panes[0].filters.statuses, ['recommended', 'implemented', 'rejected']);
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p2' });
  assert.equal(S(c).bowtieReplace?.index, 0, 'the only window has unsaved filters');
  assert.equal(S(c).workspace.panes[0].platformId, 'p1', 'nothing replaced yet');
  await c.dispatch({ type: 'cancelBowtieReplace' });
  assert.equal(S(c).bowtieReplace, null);
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p2' });
  await c.dispatch({ type: 'confirmBowtieReplace' });
  assert.equal(S(c).workspace.panes[0].platformId, 'p2');
  assert.equal(S(c).bowtieReplace, null);
});

test('saving: Save on an unsaved window asks for a name; Save on your own view saves its filters; rename and delete with Undo', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'saveBowtiePane', side: '0' });
  assert.deepEqual(S(c).editing, { kind: 'bowtieName', id: '0' });
  await c.dispatch({ type: 'saveBowtiePaneAs', side: '0', name: 'Alpha now' });
  const id = S(c).workspace.panes[0].viewId;
  assert.equal(W(c).records.bowtieView[id].name, 'Alpha now');
  assert.equal(S(c).editing, null);
  await c.dispatch({ type: 'setPaneSet', side: '0', value: 'additional' });
  await c.dispatch({ type: 'saveBowtiePane', side: '0' });
  assert.equal(W(c).records.bowtieView[id].filters.set, 'additional');
  await c.dispatch({ type: 'renameBowtieView', id, name: 'Alpha later' });
  assert.equal(W(c).records.bowtieView[id].name, 'Alpha later');
  await c.dispatch({ type: 'removeBowtieView', id });
  assert.equal(W(c).records.bowtieView[id].status, 'deleted');
  assert.match(S(c).undo.text, /Deleted Alpha later/);
  await c.dispatch({ type: 'undoDelete' });
  assert.equal(W(c).records.bowtieView[id].status, 'live');
});

test('sharing reaches the chosen profile through Save; they can open and copy it but not change it', async () => {
  const { folder, c, benId } = await ready();
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'saveBowtiePaneAs', side: '0', name: 'Fire on Alpha' });
  const id = S(c).workspace.panes[0].viewId;
  await c.dispatch({ type: 'shareBowtieView', id, profileId: benId });
  assert.deepEqual(W(c).records.bowtieView[id].sharedWith, [benId]);
  await c.dispatch({ type: 'save' });
  const ben = await open(folder, 'Ben');
  assert.deepEqual(sharedWithMe(W(ben), benId).map((v) => v.id), [id]);
  await ben.dispatch({ type: 'renameBowtieView', id, name: 'Mine now' });
  assert.equal(S(ben).message.kind, 'error');
  assert.match(S(ben).message.text, /Only its owner can change Fire on Alpha/);
  await ben.dispatch({ type: 'openBowtieView', id });
  await ben.dispatch({ type: 'saveBowtiePane', side: '0' });
  assert.deepEqual(S(ben).editing, { kind: 'bowtieName', id: '0' }, 'not the owner: Save a copy asks for a name');
  await ben.dispatch({ type: 'saveBowtiePaneAs', side: '0', name: 'Ben copy' });
  assert.deepEqual(myViews(W(ben), benId).map((v) => v.name), ['Ben copy']);
  await c.dispatch({ type: 'shareBowtieView', id });
  assert.deepEqual(W(c).records.bowtieView[id].sharedWith, [], 'unticking everyone shares with nobody');
  await ben.dispatch({ type: 'openBowtieView', id: 'not-a-view' });
  assert.equal(S(ben).message.kind, 'error');
});

test('the windows are remembered for the folder and profile, and export writes the drawn SVG', async () => {
  const storage = new MemoryStorage();
  const folder = new MemoryFolder();
  const c = await open(folder, 'Ada', storage);
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: S(c).profileId });
  await c.dispatch({ type: 'linkHazards', platformId: 'p1', hazardId: ['h1'] });
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'save' });
  const key = workspaceKey(S(c).folderName, S(c).profileId);
  assert.equal(JSON.parse(storage.getItem(key)).panes[0].platformId, 'p1');
  const again = await open(folder, 'Ada', storage);
  assert.equal(S(again).workspace.panes[0].platformId, 'p1');
  await again.dispatch({ type: 'exportBowtie', side: '0' });
  assert.equal(S(again).message.kind, 'info');
  const name = S(again).message.text.replace(/^Saved (.*)\.$/, '$1');
  assert.match(name, /\.svg$/);
  const file = await (await folder.handle.getFileHandle(name)).getFile();
  assert.match(await file.text(), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[\s\S]*data-bowtie-node="hazard"/);
  storage.setItem(key, '{broken');
  const third = await open(folder, 'Ada', storage);
  assert.deepEqual(S(third).workspace, emptyWorkspace());
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/ui/controller-bowties.test.js`
Expected: FAIL — `unknown action: openBowtie` surfaces as an error message, and `S(c).view.name` is not `'bowties'`.

- [ ] **Step 3: Imports, EDITS, QUIET, initial state**

At the top of `src/ui/controller.js`, after the `safetyReports` import, add:

```js
import * as bowtieViews from '../core/ops/bowtie-views.js';
import { bowtieOf, canSee, normalizeFilters, DEFAULT_FILTERS, hazardName } from '../core/bowtie.js';
import { bowtieSvg } from './bowtie-svg.js';
import { emptyWorkspace, placePane, movePane, swapPanes, closePane, updatePane, replacedBy, paneDirty, workspaceKey, readWorkspace, writeWorkspace } from './workspace.js';
```

In `EDITS`, before `addComment,` add:

```js
  createBowtieView: bowtieViews.createBowtieView, updateBowtieView: bowtieViews.updateBowtieView,
  setBowtieSharing: bowtieViews.setBowtieSharing, deleteBowtieView: bowtieViews.deleteBowtieView,
```

Add the screen-only bow-tie actions to `QUIET` (extend the array inside `new Set([...])`):

```js
'openBowtie', 'newBowtie', 'openBowtieView', 'dropBowtie', 'swapBowtiePanes', 'closeBowtiePane', 'setPaneSet', 'setPaneStatus', 'confirmBowtieReplace', 'cancelBowtieReplace',
```

In `initialState()`, add to the returned object: `workspace: emptyWorkspace(), bowtieReplace: null,`.

- [ ] **Step 4: Load the workspace when the data opens, and let the overlay close the question**

In `finishOpening()`, change the final `set(...)` to include the remembered windows:

```js
  function finishOpening() {
    openedAt = env.clock.now();
    DocGen.docHost.set(docs.host);
    const notices = unseenOverrides(state.session.working, /** @type {string} */ (state.profileId));
    const workspace = readWorkspace(env.storage, workspaceKey(state.folderName, /** @type {string} */ (state.profileId)));
    set({ notices, screen: notices.length ? 'notices' : 'main', view: { name: 'home' }, workspace, bowtieReplace: null });
  }
```

Change the existing `closePicker` handler so a click on the dimmed page or Escape also dismisses the replace question (both reuse the picker overlay):

```js
    async closePicker() {
      set({ picker: null, bowtieReplace: null });
    },
```

- [ ] **Step 5: Add the helpers inside `createController`, just above `const handlers = {`**

```js
  /** Show and remember the bow-tie windows. @param {import('./workspace.js').Workspace} ws */
  function setWorkspace(ws) {
    set({ workspace: ws });
    writeWorkspace(env.storage, workspaceKey(state.folderName, /** @type {string} */ (state.profileId)), ws);
  }

  /** A side from a data attribute: '0' or '1', or the last-used window when absent. @param {unknown} s @returns {0 | 1 | 'last'} */
  const sideOf = (s) => (s === '0' || s === 0 ? 0 : s === '1' || s === 1 ? 1 : 'last');

  /** @param {unknown} s @returns {0 | 1} */
  const paneIndex = (s) => (s === '1' || s === 1 ? 1 : 0);

  /** The window at a side, or an error when there is none. @param {unknown} s */
  function paneAt(s) {
    const p = state.workspace.panes[paneIndex(s)];
    if (!p) throw new PivotError('not-found', 'That window is closed.');
    return p;
  }

  /**
   * Put a window on the Bow-ties stage; if it would replace a window with unsaved choices, ask first.
   * @param {0 | 1 | 'last'} side @param {import('./workspace.js').Pane} pane
   */
  function place(side, pane) {
    const index = replacedBy(state.workspace, side);
    const existing = index === null ? null : state.workspace.panes[index];
    if (existing && state.session && paneDirty(existing, state.session.working)) {
      set({ bowtieReplace: { side, pane, index }, view: { name: 'bowties' } });
      return;
    }
    setWorkspace(placePane(state.workspace, side, pane));
    set({ view: { name: 'bowties' }, bowtieReplace: null, message: null });
  }

  /** A window for a view the active profile may open. @param {string} id */
  function paneForView(id) {
    const v = state.session?.working.records.bowtieView?.[id];
    if (!v || !canSee(v, state.profileId)) throw new PivotError('not-found', 'That view no longer exists or is not shared with you.');
    return { viewId: v.id, hazardId: v.hazardId, platformId: v.platformId, filters: normalizeFilters(v.filters) };
  }
```

- [ ] **Step 6: Add the handlers to `handlers` (after `cancelRestore`)**

```js
    async openBowtie({ hazardId, platformId }) {
      place('last', { viewId: null, hazardId, platformId, filters: normalizeFilters(DEFAULT_FILTERS) });
    },
    async newBowtie({ pair }) {
      const [hazardId, platformId] = String(pair ?? '').split('|');
      const d = state.session?.working;
      if (!d || !hazardId || !platformId || !bowtieOf(d, hazardId, platformId, DEFAULT_FILTERS).ok) {
        throw new PivotError('not-found', 'Choose a hazard and a platform it is on.');
      }
      place('last', { viewId: null, hazardId, platformId, filters: normalizeFilters(DEFAULT_FILTERS) });
    },
    async openBowtieView({ id, side }) {
      place(sideOf(side), paneForView(id));
    },
    async dropBowtie({ side, viewId, pane }) {
      const to = paneIndex(side);
      if (pane !== undefined) { setWorkspace(movePane(state.workspace, paneIndex(pane), to)); return; }
      if (viewId) { place(to, paneForView(viewId)); return; }
    },
    async swapBowtiePanes() {
      setWorkspace(swapPanes(state.workspace));
    },
    async closeBowtiePane({ side }) {
      setWorkspace(closePane(state.workspace, paneIndex(side)));
    },
    async setPaneSet({ side, value }) {
      const p = paneAt(side);
      setWorkspace(updatePane(state.workspace, paneIndex(side), { filters: normalizeFilters({ ...p.filters, set: value }) }));
    },
    async setPaneStatus({ side, status, on }) {
      const p = paneAt(side);
      const rest = p.filters.statuses.filter((s) => s !== status);
      const statuses = on === 'true' ? [...rest, status] : rest;
      setWorkspace(updatePane(state.workspace, paneIndex(side), { filters: normalizeFilters({ ...p.filters, statuses }) }));
    },
    async confirmBowtieReplace() {
      const r = state.bowtieReplace;
      if (!r) return;
      setWorkspace(placePane(state.workspace, r.side, r.pane));
      set({ bowtieReplace: null });
    },
    async cancelBowtieReplace() {
      set({ bowtieReplace: null });
    },
    async saveBowtiePane({ side }) {
      const p = paneAt(side);
      const v = p.viewId ? state.session?.working.records.bowtieView?.[p.viewId] : null;
      if (v && v.status === 'live' && v.ownerId === state.profileId) {
        await applyEdit('updateBowtieView', { id: v.id, filters: p.filters });
        return;
      }
      set({ editing: { kind: 'bowtieName', id: String(paneIndex(side)) } });
    },
    async saveBowtiePaneAs({ side, name }) {
      const p = paneAt(side);
      const id = newId();
      await applyEdit('createBowtieView', { id, name, hazardId: p.hazardId, platformId: p.platformId, filters: p.filters });
      setWorkspace(updatePane(state.workspace, paneIndex(side), { viewId: id }));
    },
    async shareBowtieView({ id, profileId }) {
      const known = new Set(state.profiles.map((p) => p.id));
      await applyEdit('setBowtieSharing', { id, sharedWith: list(profileId).filter((p) => known.has(p)) });
    },
    async renameBowtieView({ id, name }) {
      await applyEdit('updateBowtieView', { id, name });
    },
    async removeBowtieView({ id }) {
      const before = state.session?.working;
      const v = before?.records.bowtieView?.[id];
      if (!before || !v) throw new PivotError('not-found', 'That view no longer exists.');
      await applyEdit('deleteBowtieView', { id });
      set({ undo: { text: `Deleted ${v.name}.`, before, after: state.session?.working, base: state.session?.base } });
    },
    async exportBowtie({ side }) {
      const p = paneAt(side);
      const d = state.session?.working;
      const b = d ? bowtieOf(d, p.hazardId, p.platformId, p.filters) : null;
      if (!b || !b.ok) throw new PivotError('bowtie.cannot-draw', b ? b.message : 'There is no data to draw.');
      const base = `${hazardName(b.hazard)} ${b.platform.name} bow-tie`.replace(/[^A-Za-z0-9._-]+/g, '-');
      const file = await env.pickSaveFile(`${base}.svg`);
      await store.writeExport(file, bowtieSvg(b));
      set({ message: { kind: 'info', text: `Saved ${file.name}.` } });
    },
```

Note: `saveBowtiePaneAs` calls `applyEdit`, which already sets `editing: null` and `message: null`. An `applyEdit` that throws (blank name, not the owner) is caught by `dispatch` and becomes the error message, leaving the workspace unchanged, because `setWorkspace` runs only after the edit succeeds.

- [ ] **Step 7: Run to see them pass, then the whole suite**

Run: `node --test test/ui/controller-bowties.test.js` — expected PASS (5 tests).
Run: `npm test` — expected all pass.

If the export test fails on the file name: the fake folder's root handle has the name `''`, so `folderName` is `''` and the key is `pivot.bowtieWorkspace::<id>`; the test reads the key through `workspaceKey`, so that is fine. Check only that `pickSaveFile` created the file in the fake folder.

- [ ] **Step 8: Type-check and commit**

Run: `npm run typecheck`

```bash
git add src/ui/controller.js test/ui/controller-bowties.test.js
git commit -m "Bow-tie actions: open, drop, swap and close windows, per-window filters, save, save a copy, share, rename, delete with Undo, export SVG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The Bow-ties page

**Files:**
- Create: `src/ui/screens/bowties.js`
- Modify: `src/ui/screens/common.js` (`NAV`, `SECTION`)
- Modify: `src/ui/render.js` (import and route)
- Modify: `src/ui/screens/ssra.js` (`platformTab`, an *Open bow-tie* button)
- Modify: `src/ui/styles.css` (append a bow-tie block)
- Test: `test/ui/screens-bowties.test.js`

**Interfaces:**
- Consumes: Tasks 1–5; `html`, `raw` from `src/ui/html.js`; `dataAttrs`, `option`, `confirmButton`, `go` from `src/ui/screens/common.js`; `profileName` from `src/ui/names.js`; `get`, `live` from `src/core/data.js`; `byNumber` from `src/core/queries.js`; `CONTROL_STATUSES` from `src/core/ops/assessment.js`.
- Produces: `bowtiesView(state, data) → Raw`. DOM hooks Task 7 relies on:
  - the side list `<aside class="bt-side" data-filter-scope>` with `<input … data-filter-list>` and items `<li … draggable="true" data-drag-view="<viewId>" data-pick-text="…">`;
  - the stage `<section class="bt-stage">` holding `<div class="bt-drop" data-drop-side="0">` and `data-drop-side="1"`;
  - each window's title bar `<header class="bt-bar" draggable="true" data-drag-pane="<0|1>">`.

- [ ] **Step 1: Write the failing tests**

Create `test/ui/screens-bowties.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bowtiesView } from '../../src/ui/screens/bowties.js';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { shell } from '../../src/ui/screens/common.js';
import { renderApp } from '../../src/ui/render.js';
import { html } from '../../src/ui/html.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers, updateHazard, deleteHazard } from '../../src/core/ops/hazards.js';
import { createBowtieView, setBowtieSharing, deleteBowtieView } from '../../src/core/ops/bowtie-views.js';
import { unlinkHazard } from '../../src/core/ops/platforms.js';
import { placePane, emptyWorkspace } from '../../src/ui/workspace.js';
import { seed, act, later } from '../helpers.js';

const F = { set: 'all', statuses: ['recommended', 'planned', 'implemented'] };
const profiles = [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Ben', createdAt: '' }, { id: 'u3', name: 'Cy', createdAt: '' }];
/** u1 owns v1 "Alpha & now" (h1 on p1); u2 owns v2 (h1 on p2), shared with u1; u2 owns v3, not shared. */
function data() {
  let d = assignNumbers(seed());
  d = createBowtieView(d, act, { id: 'v1', name: 'Alpha & now', hazardId: 'h1', platformId: 'p1', filters: F });
  d = createBowtieView(d, later, { id: 'v2', name: 'Bravo base', hazardId: 'h1', platformId: 'p2', filters: F });
  d = setBowtieSharing(d, later, { id: 'v2', sharedWith: ['u1'] });
  return createBowtieView(d, later, { id: 'v3', name: 'Private to Ben', hazardId: 'h1', platformId: 'p1', filters: F });
}
const state = (d, extra = {}) => ({ ...initialState(), screen: 'main', today: '2026-09-30', profileId: 'u1', profiles,
  session: { base: d, working: d, loadedStamp: null }, view: { name: 'bowties' }, ...extra });
const one = (pane) => placePane(emptyWorkspace(), 'last', pane);
const two = (a, b) => placePane(one(a), 1, b);
const A = { viewId: 'v1', hazardId: 'h1', platformId: 'p1', filters: F };
const B = { viewId: null, hazardId: 'h1', platformId: 'p2', filters: { set: 'existing', statuses: [] } };

test('the side list: New diagram, my views, views shared with me by their owner, and nobody else\'s', () => {
  const out = bowtiesView(state(data()), data()).toString();
  assert.match(out, /<h1>Bow-ties<\/h1>/);
  assert.match(out, /<form data-action="newBowtie"[\s\S]*?<option value="h1\|p1">H-0001 Fire — Alpha<\/option><option value="h1\|p2">H-0001 Fire — Bravo<\/option>/);
  const mine = out.slice(out.indexOf('My views'), out.indexOf('Shared with me'));
  const shared = out.slice(out.indexOf('Shared with me'));
  assert.match(mine, /data-drag-view="v1"[\s\S]*?Alpha &amp; now[\s\S]*?H-0001 Fire · Alpha/);
  assert.match(shared, /data-drag-view="v2"[\s\S]*?Bravo base[\s\S]*?from Ben/);
  assert.doesNotMatch(out, /Private to Ben/);
  assert.match(mine, /data-action="openBowtieView" data-id="v1" data-side="0">Open left/);
  assert.match(mine, /data-action="removeBowtieView" data-id="v1"/);
  assert.doesNotMatch(shared, /removeBowtieView|bowtieShare|bowtieRename/, 'only the owner manages a view');
  assert.match(out, /<aside class="bt-side" data-filter-scope>[\s\S]*?data-filter-list/);
});

test('an empty stage invites a diagram; drop targets are always in the stage for dragging', () => {
  const out = bowtiesView(state(data()), data()).toString();
  assert.match(out, /class="bt-empty"/);
  assert.match(out, /<div class="bt-drop" data-drop-side="0">Left<\/div><div class="bt-drop" data-drop-side="1">Right<\/div>/);
});

test('one window fills the stage; two split it; each has its filters, diagram, and buttons', () => {
  const d = data();
  const single = bowtiesView(state(d, { workspace: one(A) }), d).toString();
  assert.match(single, /<section class="bt-stage"/);
  assert.match(single, /<header class="bt-bar" draggable="true" data-drag-pane="0">[\s\S]*?<h2>Alpha &amp; now<\/h2>/);
  assert.match(single, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(single, /data-change="setPaneSet" data-side="0"/);
  assert.match(single, /name="on" data-change="setPaneStatus" data-side="0" data-status="rejected">/, 'rejected is off');
  assert.match(single, /data-status="planned" checked>/);
  assert.match(single, /data-action="saveBowtiePane" data-side="0" disabled>Saved/);
  assert.match(single, /data-action="startEdit" data-kind="bowtieShare" data-id="v1">Share…/);
  assert.match(single, /data-action="exportBowtie" data-side="0">Export SVG/);
  assert.doesNotMatch(single, /swapBowtiePanes/);
  const split = bowtiesView(state(d, { workspace: two(A, B) }), d).toString();
  assert.match(split, /<section class="bt-stage split"/);
  assert.match(split, /<h2>Unsaved: H-0001 Fire on Bravo<\/h2>/);
  assert.match(split, /data-action="swapBowtiePanes"/);
  assert.match(split, /data-drag-pane="1"/);
});

test('saving a copy of a shared view, naming a view, and sharing it with ticks', () => {
  const d = data();
  const sharedPane = { viewId: 'v2', hazardId: 'h1', platformId: 'p2', filters: F };
  const out = bowtiesView(state(d, { workspace: one(sharedPane), editing: { kind: 'bowtieName', id: '0' } }), d).toString();
  const win = out.slice(out.indexOf('<article class="bt-window"'));
  assert.match(win, /Save a copy/);
  assert.doesNotMatch(win, /bowtieShare/, 'not the owner: no Share in the window');
  assert.match(out, /<form data-action="saveBowtiePaneAs" data-side="0"[\s\S]*?value="Bravo base \(copy\)"/);
  const sharing = bowtiesView(state(d, { editing: { kind: 'bowtieShare', id: 'v1' } }), d).toString();
  assert.match(sharing, /<form data-action="shareBowtieView" data-id="v1"/);
  assert.match(sharing, /value="u2"> Ben/);
  assert.match(sharing, /value="u3"> Cy/);
  assert.doesNotMatch(sharing, /value="u1"/, 'not yourself');
  const shared = setBowtieSharing(d, act, { id: 'v1', sharedWith: ['u3'] });
  assert.match(bowtiesView(state(shared, { editing: { kind: 'bowtieShare', id: 'v1' } }), shared).toString(), /value="u3" checked> Cy/);
});

test('what goes wrong stays readable: a deleted hazard, a view unshared or deleted while open, markup in names', () => {
  let d = data();
  d = updateHazard(d, act, { id: 'h1', title: '<b>Fire</b>' });
  const markup = bowtiesView(state(d, { workspace: one(A) }), d).toString();
  assert.doesNotMatch(markup, /<b>Fire<\/b>/);
  assert.match(markup, /&lt;b&gt;Fire&lt;\/b&gt;/);
  const sharedPane = { viewId: 'v2', hazardId: 'h1', platformId: 'p2', filters: F };
  const unshared = setBowtieSharing(data(), later, { id: 'v2', sharedWith: [] });
  const out1 = bowtiesView(state(unshared, { workspace: one(sharedPane) }), unshared).toString();
  assert.match(out1, /<h2>Unsaved: H-0001 Fire on Bravo<\/h2>/);
  assert.match(out1, /<svg/);
  const gone = deleteBowtieView(data(), act, { id: 'v1' });
  assert.match(bowtiesView(state(gone, { workspace: one(A) }), gone).toString(), /<h2>Unsaved: H-0001 Fire on Alpha<\/h2>/);
  const noHazard = deleteHazard(unlinkHazard(unlinkHazard(data(), act, { hazardId: 'h1', platformId: 'p1' }), act, { hazardId: 'h1', platformId: 'p2' }), act, { id: 'h1' });
  const out2 = bowtiesView(state(noHazard, { workspace: one(A) }), noHazard).toString();
  assert.match(out2, /class="bt-cannot">The hazard in this view has been deleted\./);
  assert.doesNotMatch(out2, /exportBowtie/);
  assert.match(out2.slice(out2.indexOf('My views')), /data-drag-view="v1"[\s\S]*?Cannot draw/);
});

test('the replace question, the nav, the route, and Open bow-tie on a hazard\'s platform tab', () => {
  const d = data();
  const asking = bowtiesView(state(d, { workspace: one(B), bowtieReplace: { side: 'last', pane: A, index: 0 } }), d).toString();
  assert.match(asking, /class="picker-overlay"[\s\S]*?Replace the unsaved diagram\?[\s\S]*?data-action="confirmBowtieReplace"[\s\S]*?data-action="cancelBowtieReplace"/);
  assert.match(shell(state(d), html``).toString(), /data-view="platforms">Platforms<\/button><button type="button" class="nav on" data-action="go" data-view="bowties">Bow-ties<\/button><button[^>]*data-view="references"/);
  assert.match(renderApp(state(d)), /<h1>Bow-ties<\/h1>/);
  const tab = hazardView(state(d, { view: { name: 'hazard', id: 'h1', tab: 'p:p1' } }), d, 'h1').toString();
  assert.match(tab, /data-action="openBowtie" data-hazard-id="h1" data-platform-id="p1"/);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/ui/screens-bowties.test.js`
Expected: FAIL — `Cannot find module '.../src/ui/screens/bowties.js'`.

The dataset of `data-hazard-id` arrives in the controller as `hazardId` (the browser camel-cases `data-*` names), which is what `openBowtie({ hazardId, platformId })` reads.

- [ ] **Step 3: Write `src/ui/screens/bowties.js`**

```js
import { html, raw } from '../html.js';
import { dataAttrs, option, confirmButton } from './common.js';
import { profileName } from '../names.js';
import { get, live } from '../../core/data.js';
import { byNumber } from '../../core/queries.js';
import { CONTROL_STATUSES } from '../../core/ops/assessment.js';
import { SETS, SET_WORD, STATUS_WORD, bowtieOf, canSee, myViews, sharedWithMe, hazardName } from '../../core/bowtie.js';
import { bowtieSvg } from '../bowtie-svg.js';
import { paneCount, paneDirty } from '../workspace.js';

/** @typedef {import('../../core/data.js').Data} Data */
/** @typedef {import('../../core/data.js').Rec} Rec */
/** @typedef {import('../workspace.js').Pane} Pane */

const SET_LABEL = { existing: 'Existing only', additional: 'Additional only', all: 'Existing and additional' };

/** @param {Data} data @param {string} id */
function hazardText(data, id) {
  const h = get(data, 'hazard', id);
  return h ? hazardName(h) : 'a deleted hazard';
}

/** @param {Data} data @param {string} id */
function platformText(data, id) {
  return get(data, 'platform', id)?.name ?? 'a deleted platform';
}

/** @param {unknown} label @param {Record<string, unknown>} attrs @param {boolean} [disabled] */
function button(label, attrs, disabled = false) {
  return html`<button type="button" ${dataAttrs(attrs)}${disabled ? raw(' disabled') : ''}>${label}</button>`;
}

/**
 * Saved views on the left, one or two diagram windows on the stage.
 * @param {any} state @param {Data} data
 */
export function bowtiesView(state, data) {
  const ws = state.workspace;
  const n = paneCount(ws);
  return html`<div class="head"><h1>Bow-ties</h1></div>
  <div class="bowties">
    <aside class="bt-side" data-filter-scope>${sideList(state, data)}</aside>
    <section class="bt-stage${n === 2 ? ' split' : ''}" aria-label="Bow-tie diagrams">
      ${n === 0
        ? html`<div class="bt-empty"><p><strong>Open a saved view, or start a new diagram.</strong></p><p class="muted">Drag a view or a window to the left or right to compare two side by side.</p></div>`
        : ws.panes.map((/** @type {Pane | null} */ p, /** @type {number} */ i) => (p ? paneView(state, data, p, i, n === 2) : ''))}
      <div class="bt-drop" data-drop-side="0">Left</div><div class="bt-drop" data-drop-side="1">Right</div>
    </section>
  </div>
  ${state.bowtieReplace ? replaceQuestion(state.bowtieReplace.index) : ''}`;
}

/** @param {any} state @param {Data} data */
function sideList(state, data) {
  const pairs = live(data, 'hazardPlatform')
    .map((l) => ({ h: get(data, 'hazard', l.hazardId), p: get(data, 'platform', l.platformId) }))
    .filter((x) => x.h && x.h.status === 'live' && x.p && x.p.status !== 'deleted')
    .sort((a, b) => byNumber(/** @type {Rec} */ (a.h), /** @type {Rec} */ (b.h)) || String(a.p?.name).localeCompare(String(b.p?.name)));
  const me = state.profileId;
  return html`<form data-action="newBowtie" class="bt-new">
      <label>New diagram<select name="pair" required aria-label="Hazard and platform"><option value="">Choose a hazard and platform…</option>
        ${pairs.map((x) => option(`${x.h?.id}|${x.p?.id}`, `${hazardName(/** @type {Rec} */ (x.h))} — ${x.p?.name}`))}</select></label>
      <button type="submit" class="primary">Open</button></form>
    <input class="bt-search" data-filter-list placeholder="Search views…" aria-label="Search views">
    <h2>My views</h2>${viewList(state, data, myViews(data, me), true, 'You have no saved views yet.')}
    <h2>Shared with me</h2>${viewList(state, data, sharedWithMe(data, me), false, 'Nothing is shared with you.')}`;
}

/** @param {any} state @param {Data} data @param {Rec[]} views @param {boolean} own @param {string} none */
function viewList(state, data, views, own, none) {
  if (!views.length) return html`<p class="muted">${none}</p>`;
  return html`<ul class="bt-list">${views.map((v) => {
    const where = `${hazardText(data, v.hazardId)} · ${platformText(data, v.platformId)}`;
    const broken = !bowtieOf(data, v.hazardId, v.platformId, v.filters).ok;
    const renaming = own && state.editing?.kind === 'bowtieRename' && state.editing.id === v.id;
    const sharing = own && state.editing?.kind === 'bowtieShare' && state.editing.id === v.id;
    return html`<li class="bt-item${broken ? ' broken' : ''}" draggable="true" ${dataAttrs({ 'drag-view': v.id, 'pick-text': `${v.name} ${where}`.toLowerCase() })}>
      <button type="button" class="bt-open" ${dataAttrs({ action: 'openBowtieView', id: v.id })}>
        <strong>${v.name}</strong><span class="muted">${where}</span>${own ? '' : html`<span class="muted">from ${profileName(state, v.ownerId)}</span>`}${broken ? html`<span class="tag tag-warn">Cannot draw</span>` : ''}</button>
      <details class="bt-menu"><summary aria-label="More for ${v.name}" title="More">⋯</summary><div class="bt-menu-body">
        ${button('Open left', { action: 'openBowtieView', id: v.id, side: '0' })}
        ${button('Open right', { action: 'openBowtieView', id: v.id, side: '1' })}
        ${own ? html`${button('Rename', { action: 'startEdit', kind: 'bowtieRename', id: v.id })}
          ${button('Share…', { action: 'startEdit', kind: 'bowtieShare', id: v.id })}
          ${confirmButton('Delete…', `Delete ${v.name}`, dataAttrs({ action: 'removeBowtieView', id: v.id }))}` : ''}
      </div></details>
      ${renaming ? html`<form data-action="renameBowtieView" ${dataAttrs({ id: v.id })} class="row inline fill"><input name="name" required class="grow" aria-label="View name" value="${v.name}" autofocus><button type="submit" class="primary">Rename</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></form>` : ''}
      ${sharing ? shareForm(state, v) : ''}
    </li>`;
  })}</ul>`;
}

/** @param {any} state @param {Rec} v */
function shareForm(state, v) {
  const others = state.profiles.filter((/** @type {any} */ p) => p.id !== v.ownerId);
  return html`<form data-action="shareBowtieView" ${dataAttrs({ id: v.id })} class="bt-share"><p><strong>Share ${v.name} with</strong></p>
    ${others.map((/** @type {any} */ p) => html`<label><input type="checkbox" name="profileId" value="${p.id}"${(v.sharedWith ?? []).includes(p.id) ? raw(' checked') : ''}> ${p.name}</label>`)}
    ${others.length ? '' : html`<p class="muted">There are no other profiles yet.</p>`}
    <div class="actions"><button type="submit" class="primary">Share</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></div></form>`;
}

/** @param {any} state @param {Data} data @param {Pane} pane @param {number} side @param {boolean} split */
function paneView(state, data, pane, side, split) {
  const rec = pane.viewId ? get(data, 'bowtieView', pane.viewId) : null;
  const view = rec && canSee(rec, state.profileId) ? rec : null;
  const own = Boolean(view && view.ownerId === state.profileId);
  const b = bowtieOf(data, pane.hazardId, pane.platformId, pane.filters);
  const title = view ? view.name : `Unsaved: ${hazardText(data, pane.hazardId)} on ${platformText(data, pane.platformId)}`;
  const dirty = paneDirty(pane, data);
  const s = String(side);
  const naming = state.editing?.kind === 'bowtieName' && state.editing.id === s;
  const f = pane.filters;
  return html`<article class="bt-window" aria-label="${title}">
    <header class="bt-bar" draggable="true" ${dataAttrs({ 'drag-pane': s })}>
      <span class="bt-grip" aria-hidden="true">⠿</span><h2>${title}</h2>${view && dirty ? html`<span class="tag">Changed</span>` : ''}
      <span class="spacer"></span>
      ${split ? button('Swap sides', { action: 'swapBowtiePanes' }) : ''}
      ${button('Close', { action: 'closeBowtiePane', side: s })}
    </header>
    <div class="bt-filters">
      <label>Controls <select name="value" aria-label="Which controls" ${dataAttrs({ change: 'setPaneSet', side: s })}>${SETS.map((x) => option(x, SET_LABEL[/** @type {keyof typeof SET_LABEL} */ (x)], f.set))}</select></label>
      <fieldset${f.set === 'existing' ? raw(' disabled') : ''}><legend>${SET_WORD.additional}</legend>
        ${CONTROL_STATUSES.map((st) => html`<label><input type="checkbox" name="on" ${dataAttrs({ change: 'setPaneStatus', side: s, status: st })}${f.statuses.includes(st) ? raw(' checked') : ''}> ${STATUS_WORD[/** @type {keyof typeof STATUS_WORD} */ (st)]}</label>`)}
      </fieldset>
    </div>
    <div class="bt-diagram">${b.ok ? raw(bowtieSvg(b)) : html`<p class="bt-cannot">${b.message}</p>`}</div>
    <div class="actions bt-actions">
      ${own ? button(dirty ? 'Save' : 'Saved', { action: 'saveBowtiePane', side: s }, !dirty) : button(view ? 'Save a copy' : 'Save', { action: 'saveBowtiePane', side: s })}
      ${button('Save as…', { action: 'startEdit', kind: 'bowtieName', id: s })}
      ${own && view ? button('Share…', { action: 'startEdit', kind: 'bowtieShare', id: view.id }) : ''}
      ${b.ok ? button('Export SVG', { action: 'exportBowtie', side: s }) : ''}
    </div>
    ${naming ? html`<form data-action="saveBowtiePaneAs" ${dataAttrs({ side: s })} class="row inline fill bt-name"><input name="name" required class="grow" aria-label="View name" placeholder="Name this view…" value="${view ? `${view.name} (copy)` : ''}" autofocus><button type="submit" class="primary">Save</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></form>` : ''}
  </article>`;
}

/** @param {0 | 1} index the window that would be replaced */
function replaceQuestion(index) {
  return html`<div class="picker-overlay"><div class="picker" role="alertdialog" aria-modal="true" aria-label="Replace diagram">
    <h2>Replace the unsaved diagram?</h2>
    <p>The ${index === 0 ? 'left' : 'right'} window has choices that are not saved as a view. Replacing it loses them.</p>
    <div class="actions"><button type="button" class="danger" ${dataAttrs({ action: 'confirmBowtieReplace' })}>Replace it</button>
      <button type="button" ${dataAttrs({ action: 'cancelBowtieReplace' })}>Keep it</button></div></div></div>`;
}
```

Note on *Save as…* on your own view: the name box pre-fills `<name> (copy)`, and saving makes a new view, so the original is never overwritten by *Save as…*.

When there is one window, `bowtieReplace.index` is `0`, so the question says *left*; with one window it fills the stage. That wording is acceptable (the window is also the leftmost). No change is needed.

- [ ] **Step 4: Nav, section, and route**

In `src/ui/screens/common.js`:

```js
const NAV = [['home', 'Home'], ['hazards', 'Hazards'], ['controls', 'Controls'], ['platforms', 'Platforms'], ['bowties', 'Bow-ties'], ['references', 'References'], ['phases', 'Phases'], ['reports', 'Reports'], ['backups', 'Backups']];

/** The top-bar section each view belongs to. */
const SECTION = { home: 'home', openItems: 'home', hazards: 'hazards', hazard: 'hazards', controls: 'controls', control: 'controls', platforms: 'platforms', platform: 'platforms', bowties: 'bowties', references: 'references', reference: 'references', phases: 'phases', reports: 'reports', backups: 'backups' };
```

In `src/ui/render.js`, add `import { bowtiesView } from './screens/bowties.js';` beside the other screen imports, and in `mainView`'s switch add `case 'bowties': return bowtiesView(state, data);` before `default`.

- [ ] **Step 5: *Open bow-tie* on a hazard's platform tab**

In `src/ui/screens/ssra.js`, `platformTab` returns `<article class="doc ssra">` whose first section heading is `<h2>Overview ${SHARED}</h2>`. Put the button at the start of the article, before the Overview section:

```js
  return html`<article class="doc ssra">
    <div class="actions ssra-tools"><button type="button" ${dataAttrs({ action: 'openBowtie', 'hazard-id': h.id, 'platform-id': platformId })}>Open bow-tie</button></div>
    <section class="ssra-sec"><h2>Overview ${SHARED}</h2>
```

(`dataAttrs` is already imported in `ssra.js`; check with `grep -n "import.*dataAttrs" src/ui/screens/ssra.js`, and add it to the `./common.js` import if not.)

- [ ] **Step 6: Styles — append to `src/ui/styles.css`**

```css
/* Bow-ties: saved views on the left; one or two diagram windows on the stage, dropped left or right. */
.bowties { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 16px; align-items: start; }
.bt-side { display: grid; gap: 10px; }
.bt-side h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--p-muted); margin: 10px 0 0; }
.bt-new { display: grid; gap: 6px; }
.bt-new label { display: grid; gap: 4px; font-weight: 700; }
.bt-new select, .bt-search { width: 100%; }
.bt-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.bt-item { position: relative; background: var(--p-surface); border: 1px solid var(--p-line); cursor: grab; }
.bt-item.broken { border-color: var(--p-warn); }
.bt-item form { padding: 6px 10px 10px; }
.bt-open { display: grid; gap: 2px; width: 100%; text-align: left; background: transparent; border: 0; border-radius: 0; padding: 8px 40px 8px 10px; color: inherit; }
.bt-open:hover { background: var(--p-row-hover); }
.bt-menu { position: absolute; top: 4px; right: 4px; }
.bt-menu > summary { list-style: none; cursor: pointer; padding: 2px 8px; font-weight: 800; }
.bt-menu > summary::-webkit-details-marker { display: none; }
.bt-menu-body { position: absolute; right: 0; z-index: 20; display: grid; gap: 4px; min-width: 160px; padding: 6px; background: var(--p-bg); border: 1px solid var(--p-line); box-shadow: 0 8px 24px rgba(0, 0, 0, .35); }
.bt-menu-body button, .bt-menu-body summary { text-align: left; }
.bt-share { display: grid; gap: 4px; }
.bt-share label { display: flex; gap: 6px; align-items: center; }
.bt-stage { position: relative; display: grid; gap: 16px; min-height: 60vh; align-content: start; }
.bt-stage.split { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.bt-empty { display: grid; place-content: center; gap: 4px; text-align: center; min-height: 60vh; border: 1px dashed var(--p-line); }
.bt-window { display: flex; flex-direction: column; min-width: 0; background: var(--p-surface); border: 1px solid var(--p-line); }
.bt-bar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--p-surface-2); border-bottom: 1px solid var(--p-line); cursor: grab; }
.bt-bar h2 { font-size: 16px; margin: 0; overflow-wrap: anywhere; }
.bt-bar .spacer { flex: 1; }
.bt-grip { color: var(--p-muted); }
.bt-filters { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 8px 10px; }
.bt-filters fieldset { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; border: 0; margin: 0; padding: 0; }
.bt-filters fieldset[disabled] { opacity: .5; }
.bt-filters legend { float: left; margin-right: 4px; color: var(--p-muted); }
.bt-filters label { display: inline-flex; gap: 6px; align-items: center; }
.bt-diagram { overflow: auto; padding: 10px; background: #ffffff; border-block: 1px solid var(--p-line); }
.bt-diagram svg { display: block; max-width: 100%; height: auto; margin: 0 auto; }
.bt-cannot { margin: 0; padding: 32px 16px; text-align: center; color: #5d6673; }
.bt-actions, .bt-name { padding: 0 10px; }
.bt-drop { position: absolute; top: 0; bottom: 0; width: calc(50% - 8px); z-index: 30; display: none; place-items: center; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; color: var(--p-accent); background: color-mix(in srgb, var(--p-accent) 10%, transparent); border: 2px dashed var(--p-accent); }
.bt-drop[data-drop-side="0"] { left: 0; }
.bt-drop[data-drop-side="1"] { right: 0; }
.bt-stage.dragging .bt-drop { display: grid; }
.bt-drop.over { background: color-mix(in srgb, var(--p-accent) 28%, transparent); }
.ssra-tools { justify-content: flex-end; }
@media (max-width: 1100px) {
  .bowties { grid-template-columns: minmax(0, 1fr); }
  .bt-stage.split { grid-template-columns: minmax(0, 1fr); }
}
```

`.tag-warn` does not exist yet: add `.tag-warn { background: var(--p-warn-bg); color: var(--p-warn); }` next to `.tag-deleted` (styles.css is already in this task's commit).

- [ ] **Step 7: Run to see them pass, then the whole suite**

Run: `node --test test/ui/screens-bowties.test.js` — expected PASS (6 tests).
Run: `npm test` — expected all pass. An existing test that matches the whole NAV (e.g. `test/ui/screens-*.test.js` checking the top bar) may need `Bow-ties` added; update it only for that.

- [ ] **Step 8: Type-check and commit**

Run: `npm run typecheck`

```bash
git add src/ui/screens/bowties.js src/ui/screens/common.js src/ui/render.js src/ui/screens/ssra.js src/ui/styles.css test/ui/screens-bowties.test.js
git commit -m "Bow-ties page: my views and shared with me, New diagram, one or two windows with filters, save, share, export; Open bow-tie on a hazard's platform tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Drag and drop, list search, and checking it in the browser

**Files:**
- Modify: `src/ui/mount.js` (the picker-search handler in `wire`; a new `bowtieDrag` function called from `mount`)
- Test: `test/ui/wire.test.js` (read it first: `sed -n 1,60p test/ui/wire.test.js`, and follow how it builds a DOM; if it has no DOM harness, this task's checks are the browser steps only)

**Interfaces:**
- Consumes: the DOM hooks from Task 6; the `dropBowtie({ side, viewId?, pane? })` action from Task 5.
- Produces: nothing new for other tasks.

- [ ] **Step 1: Scope the list search to the side list**

In `wire` in `src/ui/mount.js`, the picker search narrows items inside `t.closest('form')`. The side list's search box is not in a form, so widen that lookup:

```js
  // A picker's search narrows its list on screen only, so nothing ticked is lost. The Bow-ties side
  // list works the same way, scoped to its aside.
  el.addEventListener('input', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (!t.matches?.('[data-filter-list]')) return;
    const q = t.value.trim().toLowerCase();
    for (const li of /** @type {NodeListOf<HTMLElement>} */ (t.closest('form, [data-filter-scope]')?.querySelectorAll('[data-pick-text]') ?? [])) {
      li.hidden = q !== '' && !String(li.dataset.pickText).includes(q);
    }
  });
```

- [ ] **Step 2: Add `bowtieDrag` at the end of `src/ui/mount.js`**

```js
/**
 * Drag a saved view, or a window by its title bar, onto the left or right half of the Bow-ties
 * stage. Nothing is dispatched until the drop, so nothing redraws mid-drag.
 * @param {HTMLElement} el @param {(action: any) => Promise<void>} dispatch
 */
function bowtieDrag(el, dispatch) {
  /** @type {{ viewId?: string, pane?: string } | null} */
  let dragging = null;
  const stage = () => el.querySelector('.bt-stage');
  const end = () => {
    stage()?.classList.remove('dragging');
    for (const o of el.querySelectorAll('.bt-drop.over')) o.classList.remove('over');
  };
  el.addEventListener('dragstart', (e) => {
    const t = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('[data-drag-view], [data-drag-pane]'));
    if (!t) return;
    dragging = t.dataset.dragView ? { viewId: t.dataset.dragView } : { pane: t.dataset.dragPane };
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', t.dataset.dragView ?? `window ${t.dataset.dragPane}`);
      e.dataTransfer.effectAllowed = 'move';
    }
    // A frame later, so the browser takes the drag image before the targets cover the stage.
    requestAnimationFrame(() => { if (dragging) stage()?.classList.add('dragging'); });
  });
  el.addEventListener('dragover', (e) => {
    const z = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('[data-drop-side]'));
    if (!z || !dragging) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    for (const o of el.querySelectorAll('[data-drop-side]')) o.classList.toggle('over', o === z);
  });
  el.addEventListener('drop', (e) => {
    const z = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('[data-drop-side]'));
    if (!z || !dragging) return;
    e.preventDefault();
    const d = dragging;
    dragging = null;
    end();
    void dispatch({ type: 'dropBowtie', side: z.dataset.dropSide, ...d });
  });
  el.addEventListener('dragend', () => { dragging = null; end(); });
}
```

In `mount`, after `resizableColumns(appEl, controller.dispatch);`, add:

```js
  bowtieDrag(appEl, controller.dispatch);
```

- [ ] **Step 3: Run the suite, type-check and build**

Run: `npm test` — expected all pass.
Run: `npm run typecheck` — expected no errors.
Run: `npm run build` — expected `dist/pivot.html` written with no error.

- [ ] **Step 4: Check it in the browser**

Use the `run` skill (or open `dist/pivot.html` in Chrome through the Playwright or Chrome DevTools tools) with a scratch data folder. Check each of these and note anything that fails:

1. Create a hazard with two causal factors, two consequences, preventative and mitigating controls (one existing with a tier, one additional set to Planned, one Rejected), on two platforms.
2. On the hazard's platform tab, *Open bow-tie* goes to Bow-ties with the diagram: five columns, the rejected control hidden, existing solid, additional dashed, last lines in words, caption naming the platform and filters.
3. Tick Rejected: it appears, greyed, reading *Additional · Rejected*. Choose *Existing only*: the additional ticks grey out and only existing controls show.
4. *Save* asks for a name; save it. Start a *New diagram* for the other platform. Drag the saved view from the list onto **Right**: two windows side by side. Drag the left window's title bar onto **Right**: they swap. *Swap sides* and *Close* work.
5. Change a window's filters, then click another view in the list: the replace question appears; *Keep it* keeps, *Replace it* replaces; clicking the dimmed page or pressing Escape dismisses it.
6. From the list menu (⋯): *Open left*, *Open right*, *Rename*, *Share…* (tick another profile), *Delete…* then *Undo*. Tab through the menu with the keyboard only.
7. Save the file; open the folder as the other profile: the view is under *Shared with me* with the owner's name, opens, cannot be renamed (error message), and *Save a copy* lands in My views.
8. *Export SVG*; open the file on its own in the browser: it matches the window, caption included.
9. Switch to light theme and back: the page reads in both; the diagram stays on white.
10. Narrow the window below 1100px: the side list goes above and the two windows stack. Reload: the open windows and their filters come back.
11. Search the side list: items narrow as you type.

Fix what fails, re-run `npm test`, and include the fixes in this task's commit.

- [ ] **Step 5: Commit**

```bash
git add src/ui/mount.js
git commit -m "Bow-ties: drag views and windows to the left or right of the stage; the side list's search narrows it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`dist/pivot.html` is not tracked in this repo; don't add it.)
