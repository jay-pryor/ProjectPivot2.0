# Pivot Release 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build release 1 of Pivot: a shared-folder hazard register (hazards, controls, platforms, rulings, ratings, history, filters) with a per-record merge on save, backups and crash recovery, and DocGen reports, shipped as one self-contained `pivot.html`.

**Architecture:** Pure, synchronous domain code in `src/core/` (each op is `(data, act, args) -> data`); all file and browser-storage IO in `src/storage/`; reports in `src/reports/` built on the existing `DocGen/` module; a Node-testable controller plus string-rendering screens in `src/ui/`, following DocGen's `render()`/`wire()` pattern. `scripts/build.js` inlines every module into `dist/pivot.html`.

**Tech Stack:** Plain ES modules, JSDoc types checked by `tsc --checkJs` (dev only), `node:test`, the browser File System Access API, no runtime dependencies, no UI framework.

**Spec:** `docs/superpowers/specs/2026-09-28-pivot-rebuild-design.md`

## Global Constraints

- Runtime: a Chromium-based browser on a locked-down Windows machine; nothing installed; `pivot.html` is opened from a file path (null origin), so the build must inline every module.
- No runtime dependency. TypeScript `5.9.3` is the only development dependency.
- Node `>=22` for development (`node --test` with glob patterns).
- All times are AEST, `YYYY-MM-DDTHH:mm:ss+10:00`; dates `YYYY-MM-DD`. Nothing in `src/` calls `Date.now()` except `systemClock` in `src/core/time.js`.
- Core ops never mutate their input and never read the clock; they receive `act = { by: profileId, at: AEST timestamp }`.
- Data file schema version is `2`; the envelope marker is `"pivot"`.
- Nothing is removed from `data.json`: delete sets `status: 'deleted'`.
- Backups: newest `72` kept in `backups/`, one written when the newest is more than one hour old.
- Folder names: `data.json`, `profiles.json`, `backups/`, `Superseded Saves/`, `files/`.
- The risk matrix is fixed (DEC-002); bands are always computed, never stored.
- Classification markings: `OFFICIAL`, `OFFICIAL: Sensitive`, `PROTECTED`; a new report design starts at none.
- DocGen's subject noun for Pivot is `'platform'`.
- Every piece of user text written into HTML passes through `esc()` in `src/ui/html.js` (or DocGen's own escaping).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on a branch, not `main`.

## Review Focus

1. **Two copies save within the same moment.** Between reading the disk stamp and writing, another copy saves. Expect the save to notice (stamp re-check) and merge again, never overwrite silently. Pinned in Task 13.
2. **`data.json` disappears after loading** (moved or deleted by someone on the share). Expect the save to write this user's data without treating the missing file as "someone deleted everything". Pinned in Task 13.
3. **The browser's storage is full or blocked.** Expect editing and saving to carry on, with a warning that unsaved work is not being kept. Pinned in Task 14.
4. **Titles and text with markup characters** (`<script>`, `&`, `"`, `|`, `*`). Expect them shown literally on every screen and in both report formats. Pinned in Tasks 17 and 20.
5. **Recovering unsaved work after someone else saved.** Expect the recovered work to merge with their save (base kept in the mirror), not overwrite it. Pinned in Task 18.

## File Structure

```
package.json, tsconfig.json, .gitignore
scripts/build.js                   single-file build (ported)
src/main.js                        browser entry: builds env, mounts the app
src/core/errors.js                 PivotError
src/core/time.js                   AEST formatting, clocks
src/core/ids.js                    uuids, link ids, H-number label
src/core/json.js                   canonical JSON, sameJson
src/core/matrix.js                 risk matrix, ratingFor, formatRating
src/core/data.js                   data shape, validation, record helpers
src/core/history.js                change items, entries, override notices
src/core/apply.js                  commit(): put records + append history
src/core/queries.js                every derived view
src/core/rules.js                  cross-record rules
src/core/merge.js                  three-way merge
src/core/ops/hazards.js            hazards, causal factors, consequences, numbering, restore
src/core/ops/controls.js           control library, hazard-control links
src/core/ops/platforms.js          platforms, hazard-platform links, report ids
src/core/ops/assessment.js         rulings and ratings
src/core/ops/reports.js            report records, report design
src/storage/envelope.js            seal/open, stamps, file names
src/storage/folder.js              File System Access helpers
src/storage/store.js               check, profiles, load, save, backups, restore, export
src/storage/mirror.js              localStorage copy of unsaved work
src/reports/classifications.js     marking list
src/reports/snapshot.js            platform -> report snapshot
src/reports/docgen-host.js         DocGen host and report production
src/ui/html.js                     esc, html tagged template
src/ui/controller.js               app state and actions (no DOM)
src/ui/render.js                   state -> HTML string
src/ui/screens/start.js            open, check, profile, recover, notices
src/ui/screens/hazards.js          hazard list and detail
src/ui/screens/controls.js         control library and detail
src/ui/screens/platforms.js        platform list, platform, assessment
src/ui/screens/reports.js          reports and backups views, history block
src/ui/mount.js                    DOM wiring, DocGen designer mount
src/ui/styles.css
test/...                           mirrors src/; test/fakes/ holds folder + storage fakes
DocGen/                            existing; edited in Task 16
```

---
### Task 1: Project scaffold and core basics

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`
- Create: `src/core/errors.js`, `src/core/time.js`, `src/core/ids.js`, `src/core/json.js`
- Test: `test/core/basics.test.js`

**Interfaces:**
- Produces: `PivotError(code, message, details?)` with `.code`, `.details`; `formatAest(epochMs)`, `epochOf(ts)`, `aestDate(ts)`, `compactStamp(ts)`, `toIsoUtc(ts)`, `systemClock`, `fixedClock(ts) -> { now(), advance(ms) }` (type `Clock = { now(): string }`); `newId()`, `hazardLabel(hazard)`, `ids.hazardControl(h,c)`, `ids.hazardPlatform(h,p)`, `ids.ruling(h,c,p)`, `ids.rating(h,p)`; `canonicalJson(v)`, `sameJson(a,b)`.

- [ ] **Step 1: Create a branch and the project files**

```bash
git checkout -b release-1
```

`package.json`:

```json
{
  "name": "pivot",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "node --test \"test/**/*.test.js\" && node DocGen/doc-designer.test.js",
    "build": "node scripts/build.js",
    "typecheck": "tsc -p tsconfig.json"
  },
  "devDependencies": { "typescript": "5.9.3" }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "strict": false,
    "noImplicitAny": false,
    "target": "es2022",
    "module": "es2022",
    "moduleResolution": "bundler",
    "lib": ["es2022", "dom", "dom.iterable"],
    "types": [],
    "skipLibCheck": true
  },
  "include": ["src/**/*.js"]
}
```

`.gitignore`:

```
node_modules/
dist/
.playwright-mcp/
```

Run: `npm install`
Expected: installs typescript; creates `package-lock.json`.

- [ ] **Step 2: Write the failing test**

`test/core/basics.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { formatAest, epochOf, aestDate, compactStamp, toIsoUtc, fixedClock } from '../../src/core/time.js';
import { newId, hazardLabel, ids } from '../../src/core/ids.js';
import { canonicalJson, sameJson } from '../../src/core/json.js';

test('PivotError carries a code and details', () => {
  const e = new PivotError('empty', 'A title cannot be empty', { field: 'title' });
  assert.ok(e instanceof Error);
  assert.equal(e.name, 'PivotError');
  assert.equal(e.code, 'empty');
  assert.deepEqual(e.details, { field: 'title' });
});

test('formatAest shows an instant in AEST, UTC+10 with no daylight saving', () => {
  assert.equal(formatAest(Date.UTC(2026, 8, 28, 14, 0, 0)), '2026-09-29T00:00:00+10:00');
  assert.equal(formatAest(Date.UTC(2026, 0, 15, 3, 4, 5)), '2026-01-15T13:04:05+10:00');
});

test('epochOf reads an AEST timestamp back and refuses anything else', () => {
  assert.equal(epochOf('2026-09-29T00:00:00+10:00'), Date.UTC(2026, 8, 28, 14));
  assert.throws(() => epochOf('2026-09-29T00:00:00Z'), RangeError);
});

test('aestDate, compactStamp and toIsoUtc', () => {
  assert.equal(aestDate('2026-09-29T00:30:00+10:00'), '2026-09-29');
  assert.equal(compactStamp('2026-09-29T08:07:06+10:00'), '20260929-080706');
  assert.equal(toIsoUtc('2026-09-29T00:00:00+10:00'), '2026-09-28T14:00:00.000Z');
});

test('fixedClock holds the time until advanced', () => {
  const c = fixedClock('2026-09-28T10:00:00+10:00');
  assert.equal(c.now(), '2026-09-28T10:00:00+10:00');
  c.advance(61_000);
  assert.equal(c.now(), '2026-09-28T10:01:01+10:00');
});

test('ids: uuids, link ids, and the hazard label', () => {
  assert.match(newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(ids.hazardControl('h', 'c'), 'hc:h:c');
  assert.equal(ids.hazardPlatform('h', 'p'), 'hp:h:p');
  assert.equal(ids.ruling('h', 'c', 'p'), 'ru:h:c:p');
  assert.equal(ids.rating('h', 'p'), 'rt:h:p');
  assert.equal(hazardLabel({ number: 7 }), 'H-0007');
  assert.equal(hazardLabel({ number: 12345 }), 'H-12345');
  assert.equal(hazardLabel({ number: null }), 'New');
});

test('canonicalJson sorts keys at every level and keeps array order', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [2, 1], c: null } }), '{"a":{"c":null,"d":[2,1]},"b":1}');
  assert.ok(sameJson({ a: 1, b: 2 }, { b: 2, a: 1 }));
  assert.ok(sameJson(undefined, undefined));
  assert.ok(!sameJson(undefined, { a: 1 }));
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test test/core/basics.test.js`
Expected: FAIL with `Cannot find module '.../src/core/errors.js'`.

- [ ] **Step 4: Write the implementation**

`src/core/errors.js`:

```js
/** The one error type Pivot's own code throws. The UI shows `message`; `code` is for tests and branching. */
export class PivotError extends Error {
  /**
   * @param {string} code
   * @param {string} message one plain sentence a user can read
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PivotError';
    this.code = code;
    this.details = details;
  }
}
```

`src/core/time.js`:

```js
/** AEST is UTC+10 with no daylight saving; every time Pivot stores is written in it. */
const OFFSET_MS = 10 * 60 * 60 * 1000;
const TS_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+10:00$/;

/** @typedef {{ now: () => string }} Clock */

/** @param {number} epochMs @returns {string} `YYYY-MM-DDTHH:mm:ss+10:00` */
export function formatAest(epochMs) {
  return `${new Date(epochMs + OFFSET_MS).toISOString().slice(0, 19)}+10:00`;
}

/** @param {string} ts @returns {number} */
export function epochOf(ts) {
  if (typeof ts !== 'string' || !TS_RE.test(ts)) throw new RangeError(`not an AEST timestamp: ${String(ts)}`);
  return Date.parse(ts);
}

/** @param {string} ts @returns {string} `YYYY-MM-DD` */
export function aestDate(ts) {
  epochOf(ts);
  return ts.slice(0, 10);
}

/** @param {string} ts @returns {string} `YYYYMMDD-HHMMSS`, safe in a Windows file name */
export function compactStamp(ts) {
  const m = TS_RE.exec(ts);
  if (!m) throw new RangeError(`not an AEST timestamp: ${String(ts)}`);
  return `${m[1]}${m[2]}${m[3]}-${m[4]}${m[5]}${m[6]}`;
}

/** @param {string} ts @returns {string} the same instant as an ISO UTC string (DocGen's clock format) */
export function toIsoUtc(ts) {
  return new Date(epochOf(ts)).toISOString();
}

/** @type {Clock} */
export const systemClock = { now: () => formatAest(Date.now()) };

/** A clock for tests: holds `start` until advanced. @param {string} start */
export function fixedClock(start) {
  let t = epochOf(start);
  return {
    now: () => formatAest(t),
    /** @param {number} ms */
    advance(ms) { t += ms; },
  };
}
```

`src/core/ids.js`:

```js
/** @returns {string} a random UUID */
export function newId() {
  return globalThis.crypto.randomUUID();
}

/**
 * The id a person reads: `H-0042`, or `New` until the hazard is first saved and numbered.
 * @param {{ number?: number | null, [field: string]: any }} hazard
 */
export function hazardLabel(hazard) {
  return hazard.number == null ? 'New' : `H-${String(hazard.number).padStart(4, '0')}`;
}

/**
 * Link, ruling and rating ids are built from what they join, so two users who make the same
 * link write the same record and the merge sees one record, not two that disagree.
 */
export const ids = Object.freeze({
  /** @param {string} h @param {string} c */
  hazardControl: (h, c) => `hc:${h}:${c}`,
  /** @param {string} h @param {string} p */
  hazardPlatform: (h, p) => `hp:${h}:${p}`,
  /** @param {string} h @param {string} c @param {string} p */
  ruling: (h, c, p) => `ru:${h}:${c}:${p}`,
  /** @param {string} h @param {string} p */
  rating: (h, p) => `rt:${h}:${p}`,
});
```

`src/core/json.js`:

```js
/**
 * JSON with object keys sorted at every level: the same value always gives the same text,
 * which is what the integrity hash and every "did this change?" comparison need.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = v[k];
      return out;
    }
    return v;
  });
}

/** @param {unknown} a @param {unknown} b */
export function sameJson(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `node --test test/core/basics.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore src/core test/core
git commit -m "Scaffold the project and add core basics: errors, AEST time, ids, canonical JSON

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The risk matrix

**Files:**
- Create: `src/core/matrix.js`
- Test: `test/core/matrix.test.js` (ported from `archive/hyperion/validation/reference/dec-002-matrix.test.js`)

**Interfaces:**
- Consumes: `PivotError` (Task 1).
- Produces: `CONSEQUENCES` (`[{ level, label }]`), `LIKELIHOODS` (`[{ letter, label }]`), `BANDS` (ordered band names), `isConsequence(v)`, `isLikelihood(v)`, `ratingFor(consequence, likelihood) -> { band, cell }`, `formatRating(pair) -> string` where `pair` is `{ consequence, likelihood } | null`.

- [ ] **Step 1: Write the failing test**

`test/core/matrix.test.js`. The fixture is DEC-002's table, copied as the decision writes it.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratingFor, formatRating, CONSEQUENCES, LIKELIHOODS } from '../../src/core/matrix.js';
import { PivotError } from '../../src/core/errors.js';

const COLUMNS = ['Catastrophic (1)', 'Critical (2)', 'Marginal (3)', 'Negligible (4)', 'None (5)', 'Uncategorised'];
const ROWS = [
  ['Frequent (A)', ['High (1A)', 'High (2A)', 'Serious (3A)', 'Medium (4A)', 'Not Credible (5G)', 'Uncategorised']],
  ['Probable (B)', ['High (1B)', 'High (2B)', 'Serious (3B)', 'Medium (4B)', 'Not Credible (5G)', 'Uncategorised']],
  ['Occasional (C)', ['High (1C)', 'Serious (2C)', 'Medium (3C)', 'Low (4C)', 'Not Credible (5G)', 'Uncategorised']],
  ['Remote (D)', ['Serious (1D)', 'Medium (2D)', 'Medium (3D)', 'Low (4D)', 'Not Credible (5G)', 'Uncategorised']],
  ['Improbable (E)', ['Medium (1E)', 'Medium (2E)', 'Medium (3E)', 'Low (4E)', 'Not Credible (5G)', 'Uncategorised']],
  ['Eliminated (F)', ['Eliminated', 'Eliminated', 'Eliminated', 'Eliminated', 'Not Credible (5G)', 'Uncategorised']],
  ['Not Credible (G)', ['Not Credible (5G)', 'Not Credible (5G)', 'Not Credible (5G)', 'Not Credible (5G)', 'Not Credible (5G)', 'Uncategorised']],
  ['Uncategorised', ['Uncategorised', 'Uncategorised', 'Uncategorised', 'Uncategorised', 'Uncategorised', 'Uncategorised']],
];
const valueOf = (h) => { const m = /\(([^)]+)\)$/.exec(h); return m ? m[1] : null; };
const bandOf = (t) => t.replace(/\s*\([^)]*\)$/, '');
const CASES = ROWS.flatMap(([row, cells]) => cells.map((text, i) => ({
  consequence: valueOf(COLUMNS[i]) === null ? null : Number(valueOf(COLUMNS[i])),
  likelihood: valueOf(row),
  band: bandOf(text),
})));

test('the fixture is the whole of DEC-002: 35 entered cells and 13 uncategorised', () => {
  assert.equal(CASES.filter((k) => k.consequence !== null && k.likelihood !== null).length, 35);
  assert.equal(CASES.filter((k) => k.consequence === null || k.likelihood === null).length, 13);
});

test('every one of the 35 cells rates as DEC-002 says, with the cell written level then letter', () => {
  const wrong = [];
  for (const k of CASES.filter((x) => x.consequence !== null && x.likelihood !== null)) {
    const r = ratingFor(k.consequence, k.likelihood);
    if (r.band !== k.band || r.cell !== `${k.consequence}${k.likelihood}`) wrong.push(`${k.consequence}${k.likelihood}: ${r.band}`);
  }
  assert.deepEqual(wrong, []);
});

test('a value not entered, as null or undefined, rates Uncategorised with no cell', () => {
  for (const k of CASES.filter((x) => x.consequence === null || x.likelihood === null)) {
    for (const absent of [null, undefined]) {
      const r = ratingFor(k.consequence ?? absent, k.likelihood ?? absent);
      assert.deepEqual(r, { band: 'Uncategorised', cell: null });
    }
  }
});

test('a value outside the scales is refused, not rated', () => {
  assert.throws(() => ratingFor(0, 'A'), PivotError);
  assert.throws(() => ratingFor(6, 'A'), PivotError);
  assert.throws(() => ratingFor(2, 'H'), PivotError);
  assert.throws(() => ratingFor(2, 'c'), PivotError);
  assert.throws(() => ratingFor('2', 'C'), PivotError);
});

test('formatRating writes a rating the way DEC-002 locks in', () => {
  assert.equal(formatRating({ consequence: 2, likelihood: 'C' }), '2C = Serious');
  assert.equal(formatRating({ consequence: 2, likelihood: null }), 'Uncategorised');
  assert.equal(formatRating(null), 'Uncategorised');
});

test('the scales carry their DEC-002 labels', () => {
  assert.deepEqual(CONSEQUENCES.map((c) => c.label), ['Catastrophic', 'Critical', 'Marginal', 'Negligible', 'None']);
  assert.deepEqual(LIKELIHOODS.map((l) => `${l.letter} ${l.label}`), ['A Frequent', 'B Probable', 'C Occasional', 'D Remote', 'E Improbable', 'F Eliminated', 'G Not Credible']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/core/matrix.test.js`
Expected: FAIL with `Cannot find module '.../src/core/matrix.js'`.

- [ ] **Step 3: Write the implementation**

`src/core/matrix.js`:

```js
import { PivotError } from './errors.js';

/** The company risk matrix, fixed in Pivot (DEC-002). Never user-editable data. */
export const CONSEQUENCES = Object.freeze([
  { level: 1, label: 'Catastrophic' },
  { level: 2, label: 'Critical' },
  { level: 3, label: 'Marginal' },
  { level: 4, label: 'Negligible' },
  { level: 5, label: 'None' },
]);

export const LIKELIHOODS = Object.freeze([
  { letter: 'A', label: 'Frequent' },
  { letter: 'B', label: 'Probable' },
  { letter: 'C', label: 'Occasional' },
  { letter: 'D', label: 'Remote' },
  { letter: 'E', label: 'Improbable' },
  { letter: 'F', label: 'Eliminated' },
  { letter: 'G', label: 'Not Credible' },
]);

/** Bands from worst to least, for filters and sorting. */
export const BANDS = Object.freeze(['High', 'Serious', 'Medium', 'Low', 'Eliminated', 'Not Credible', 'Uncategorised']);

const LETTERS = 'ABCDEFG';

/** One row per consequence level, one column per likelihood letter A to G. */
const MATRIX = Object.freeze({
  1: ['High', 'High', 'High', 'Serious', 'Medium', 'Eliminated', 'Not Credible'],
  2: ['High', 'High', 'Serious', 'Medium', 'Medium', 'Eliminated', 'Not Credible'],
  3: ['Serious', 'Serious', 'Medium', 'Medium', 'Medium', 'Eliminated', 'Not Credible'],
  4: ['Medium', 'Medium', 'Low', 'Low', 'Low', 'Eliminated', 'Not Credible'],
  5: ['Not Credible', 'Not Credible', 'Not Credible', 'Not Credible', 'Not Credible', 'Not Credible', 'Not Credible'],
});

/** @param {unknown} v */
export function isConsequence(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
}

/** @param {unknown} v */
export function isLikelihood(v) {
  return typeof v === 'string' && v.length === 1 && LETTERS.includes(v);
}

/** @param {unknown} v */
const absent = (v) => v === null || v === undefined;

/**
 * @param {unknown} consequence 1 to 5, or null when not entered
 * @param {unknown} likelihood A to G, or null when not entered
 * @returns {{ band: string, cell: string | null }}
 */
export function ratingFor(consequence, likelihood) {
  if (!absent(consequence) && !isConsequence(consequence)) {
    throw new PivotError('rating.consequence', `A consequence must be a whole number from 1 to 5, not ${String(consequence)}.`);
  }
  if (!absent(likelihood) && !isLikelihood(likelihood)) {
    throw new PivotError('rating.likelihood', `A likelihood must be a letter from A to G, not ${String(likelihood)}.`);
  }
  if (absent(consequence) || absent(likelihood)) return { band: 'Uncategorised', cell: null };
  const c = /** @type {1|2|3|4|5} */ (consequence);
  const l = /** @type {string} */ (likelihood);
  return { band: MATRIX[c][LETTERS.indexOf(l)], cell: `${c}${l}` };
}

/**
 * @param {{ consequence: number | null, likelihood: string | null } | null | undefined} pair
 * @returns {string} `2C = Serious`, or `Uncategorised`
 */
export function formatRating(pair) {
  const r = ratingFor(pair?.consequence ?? null, pair?.likelihood ?? null);
  return r.cell ? `${r.cell} = ${r.band}` : r.band;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/core/matrix.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/matrix.js test/core/matrix.test.js
git commit -m "Add the fixed company risk matrix with the DEC-002 reference test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The data model

**Files:**
- Create: `src/core/data.js`
- Test: `test/core/data.test.js`

**Interfaces:**
- Consumes: `PivotError` (Task 1).
- Produces:
  - `SCHEMA_VERSION = 2`, `KINDS` (array of the ten record kinds), `STATUSES`.
  - Types (JSDoc): `Act = { by: string, at: string }`; `Rec` = header `{ id, status, createdBy, createdAt, updatedBy, updatedAt }` plus fields; `Data = { records: Record<kind, Record<id, Rec>>, nextHazardNumber: number, history: Record<id, Entry>, reportDesign: object }`.
  - `emptyData()`, `validateData(value) -> string[]`, `isObject(v)`, `get(data, kind, id)`, `all(data, kind)` (sorted by `createdAt` then `id`), `live(data, kind)`, `byCreated(a, b)`, `put(data, kind, rec)`, `created(act, id, fields)`, `changed(rec, act, fields)`, `need(data, kind, id)` (throws unless present and not deleted), `needText(value, what)` (trimmed, throws if empty).

- [ ] **Step 1: Write the failing test**

`test/core/data.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, emptyData, validateData, put, get, all, live, created, changed, need, needText } from '../../src/core/data.js';
import { PivotError } from '../../src/core/errors.js';

const act = { by: 'u1', at: '2026-09-28T10:00:00+10:00' };
const later = { by: 'u2', at: '2026-09-28T11:00:00+10:00' };

test('emptyData has every kind, starts hazard numbers at 1, and validates', () => {
  const d = emptyData();
  assert.deepEqual(Object.keys(d.records).sort(), [...KINDS].sort());
  assert.equal(d.nextHazardNumber, 1);
  assert.deepEqual(validateData(d), []);
});

test('validateData names what is wrong', () => {
  const d = emptyData();
  d.records.hazard.x = { id: 'y', status: 'live' };
  d.records.control.c = { id: 'c', status: 'gone', createdBy: 'u', createdAt: 't', updatedBy: 'u', updatedAt: 't' };
  delete d.records.platform;
  d.nextHazardNumber = 0;
  const problems = validateData(d);
  assert.ok(problems.some((p) => p.includes('hazard x')));
  assert.ok(problems.some((p) => p.includes('control c')));
  assert.ok(problems.some((p) => p.includes('records.platform')));
  assert.ok(problems.some((p) => p.includes('nextHazardNumber')));
  assert.deepEqual(validateData(null), ['the data is not an object']);
});

test('put returns new data and leaves its input alone', () => {
  const d = emptyData();
  const rec = created(act, 'h1', { title: 'Fire' });
  const d2 = put(d, 'hazard', rec);
  assert.equal(get(d, 'hazard', 'h1'), undefined);
  assert.equal(get(d2, 'hazard', 'h1'), rec);
  assert.equal(d2.records.control, d.records.control);
});

test('created and changed stamp the header', () => {
  const rec = created(act, 'h1', { title: 'Fire' });
  assert.deepEqual(rec, { id: 'h1', status: 'live', createdBy: 'u1', createdAt: act.at, updatedBy: 'u1', updatedAt: act.at, title: 'Fire' });
  const edited = changed(rec, later, { title: 'Flood' });
  assert.equal(edited.title, 'Flood');
  assert.equal(edited.createdBy, 'u1');
  assert.equal(edited.updatedBy, 'u2');
  assert.equal(edited.updatedAt, later.at);
});

test('all sorts by creation time then id; live leaves out retired and deleted', () => {
  let d = emptyData();
  d = put(d, 'hazard', created(later, 'b', {}));
  d = put(d, 'hazard', created(act, 'z', {}));
  d = put(d, 'hazard', created(act, 'a', {}));
  d = put(d, 'hazard', { ...created(act, 'r', {}), status: 'retired' });
  assert.deepEqual(all(d, 'hazard').map((r) => r.id), ['a', 'r', 'z', 'b']);
  assert.deepEqual(live(d, 'hazard').map((r) => r.id), ['a', 'z', 'b']);
});

test('need refuses a missing or deleted record; needText refuses blank text', () => {
  let d = put(emptyData(), 'hazard', { ...created(act, 'gone', {}), status: 'deleted' });
  assert.throws(() => need(d, 'hazard', 'nope'), (e) => e instanceof PivotError && e.code === 'not-found');
  assert.throws(() => need(d, 'hazard', 'gone'), (e) => e instanceof PivotError && e.code === 'not-found');
  assert.equal(needText('  Fire  ', 'A title'), 'Fire');
  assert.throws(() => needText('   ', 'A title'), (e) => e instanceof PivotError && e.code === 'empty' && /A title/.test(e.message));
  assert.throws(() => needText(undefined, 'A title'), PivotError);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/core/data.test.js`
Expected: FAIL with `Cannot find module '.../src/core/data.js'`.

- [ ] **Step 3: Write the implementation**

`src/core/data.js`:

```js
import { PivotError } from './errors.js';

export const SCHEMA_VERSION = 2;

export const KINDS = Object.freeze([
  'hazard', 'causalFactor', 'consequence', 'control', 'platform',
  'hazardControl', 'hazardPlatform', 'ruling', 'rating', 'report',
]);

export const STATUSES = Object.freeze(['live', 'retired', 'deleted']);

const HEADER_TEXT = ['createdBy', 'createdAt', 'updatedBy', 'updatedAt'];

/** @typedef {{ by: string, at: string }} Act who is acting, and when (AEST) */
/**
 * @typedef {{ id: string, status: 'live' | 'retired' | 'deleted', createdBy: string, createdAt: string,
 *   updatedBy: string, updatedAt: string, [field: string]: any }} Rec
 */
/**
 * @typedef {{ records: Record<string, Record<string, Rec>>, nextHazardNumber: number,
 *   history: Record<string, any>, reportDesign: Record<string, any> }} Data
 */

/** @returns {Data} */
export function emptyData() {
  /** @type {Record<string, Record<string, Rec>>} */
  const records = {};
  for (const k of KINDS) records[k] = {};
  return { records, nextHazardNumber: 1, history: {}, reportDesign: {} };
}

/** @param {unknown} v @returns {v is Record<string, any>} */
export function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Checked once, when a file is opened. After that, ops trust the data they are given.
 * @param {unknown} value
 * @returns {string[]} one line per problem; empty means the data is sound
 */
export function validateData(value) {
  if (!isObject(value)) return ['the data is not an object'];
  const problems = [];
  if (!isObject(value.records)) {
    problems.push('records is missing');
  } else {
    for (const kind of KINDS) {
      const coll = value.records[kind];
      if (!isObject(coll)) { problems.push(`records.${kind} is missing`); continue; }
      for (const [id, rec] of Object.entries(coll)) {
        if (!isObject(rec) || rec.id !== id) { problems.push(`${kind} ${id}: its id does not match its key`); continue; }
        if (!STATUSES.includes(rec.status)) problems.push(`${kind} ${id}: unknown status ${String(rec.status)}`);
        for (const f of HEADER_TEXT) if (typeof rec[f] !== 'string') problems.push(`${kind} ${id}: ${f} is missing`);
      }
    }
    for (const k of Object.keys(value.records)) if (!KINDS.includes(k)) problems.push(`records.${k} is not a record kind`);
  }
  if (!Number.isInteger(value.nextHazardNumber) || value.nextHazardNumber < 1) problems.push('nextHazardNumber is not a whole number from 1');
  if (!isObject(value.history)) problems.push('history is missing');
  if (!isObject(value.reportDesign)) problems.push('reportDesign is missing');
  return problems;
}

/** @param {Data} data @param {string} kind @param {string} id @returns {Rec | undefined} */
export function get(data, kind, id) {
  return data.records[kind][id];
}

/** @param {Rec} a @param {Rec} b */
export function byCreated(a, b) {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Every record of a kind, whatever its status, oldest first. @param {Data} data @param {string} kind */
export function all(data, kind) {
  return Object.values(data.records[kind]).sort(byCreated);
}

/** @param {Data} data @param {string} kind */
export function live(data, kind) {
  return all(data, kind).filter((r) => r.status === 'live');
}

/** @param {Data} data @param {string} kind @param {Rec} rec @returns {Data} */
export function put(data, kind, rec) {
  return { ...data, records: { ...data.records, [kind]: { ...data.records[kind], [rec.id]: rec } } };
}

/** @param {Act} act @param {string} id @param {Record<string, any>} fields @returns {Rec} */
export function created(act, id, fields) {
  return { id, status: 'live', createdBy: act.by, createdAt: act.at, updatedBy: act.by, updatedAt: act.at, ...fields };
}

/** @param {Rec} rec @param {Act} act @param {Record<string, any>} fields @returns {Rec} */
export function changed(rec, act, fields) {
  return { ...rec, ...fields, updatedBy: act.by, updatedAt: act.at };
}

/** @param {Data} data @param {string} kind @param {string} id @returns {Rec} */
export function need(data, kind, id) {
  const r = get(data, kind, id);
  if (!r || r.status === 'deleted') throw new PivotError('not-found', `That ${kind} no longer exists.`, { kind, id });
  return r;
}

/** @param {unknown} value @param {string} what e.g. "A hazard title" @returns {string} */
export function needText(value, what) {
  const t = typeof value === 'string' ? value.trim() : '';
  if (!t) throw new PivotError('empty', `${what} cannot be empty.`);
  return t;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/core/data.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/data.js test/core/data.test.js
git commit -m "Add the data model: record kinds, validation at load, record helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: History and the commit helper

**Files:**
- Create: `src/core/history.js`, `src/core/apply.js`, `src/core/queries.js` (first function only)
- Test: `test/core/history.test.js`

**Interfaces:**
- Consumes: `data.js` (Task 3), `ids.js`, `json.js` (Task 1).
- Produces:
  - `history.js`: `changeOf(before, after)`; `itemOf(kind, before, after) -> { kind, id, change, fields: [{ field, before, after }] }`; `recordChange(data, act, action, pairs, platforms) -> Data` (pairs are `{ kind, before, after }`); `entries(data)` (all entries, oldest first); `historyOf(data, kind, id)` (change entries naming that record); `recordOverride(data, act, conflicts)`; `unseenOverrides(data, profileId)`; `markNoticesSeen(data, act, entryIds)`. Entry types: `change` `{ id, type, at, by, action, items, platforms }`, `override` `{ id, type, at, by, items: [{ kind, id, reason, overriddenBy, theirs, mine }] }`, `noticeSeen` `{ id, type, at, by, entryId }`.
  - `apply.js`: `commit(data, act, action, recs) -> Data` where `recs` is `[{ kind, rec }]`. It puts each record, skips any whose only differences are `updatedBy`/`updatedAt`, and appends one change entry. The entry's `platforms` are those the records reach before or after the change. If nothing changed it returns `data` itself.
  - `queries.js`: `platformsReached(data, kind, rec) -> string[]` (sorted platform ids).

- [ ] **Step 1: Write the failing test**

`test/core/history.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, put, created, changed } from '../../src/core/data.js';
import { itemOf, entries, historyOf, recordOverride, unseenOverrides, markNoticesSeen } from '../../src/core/history.js';
import { commit } from '../../src/core/apply.js';
import { platformsReached } from '../../src/core/queries.js';
import { ids } from '../../src/core/ids.js';

const act = { by: 'u1', at: '2026-09-28T10:00:00+10:00' };
const later = { by: 'u2', at: '2026-09-28T11:00:00+10:00' };

/** A hazard h1 on platforms p1 and p2, with control c1 linked to it. */
function seeded() {
  let d = emptyData();
  d = put(d, 'hazard', created(act, 'h1', { number: 1, title: 'Fire', description: '' }));
  d = put(d, 'platform', created(act, 'p1', { name: 'Alpha', ownerId: 'u1' }));
  d = put(d, 'platform', created(act, 'p2', { name: 'Bravo', ownerId: 'u2' }));
  d = put(d, 'hazardPlatform', created(act, ids.hazardPlatform('h1', 'p1'), { hazardId: 'h1', platformId: 'p1', reportId: null }));
  d = put(d, 'hazardPlatform', created(act, ids.hazardPlatform('h1', 'p2'), { hazardId: 'h1', platformId: 'p2', reportId: null }));
  d = put(d, 'control', created(act, 'c1', { title: 'Sprinklers', description: '' }));
  d = put(d, 'hazardControl', created(act, ids.hazardControl('h1', 'c1'), { hazardId: 'h1', controlId: 'c1', kind: 'preventative' }));
  d = put(d, 'causalFactor', created(act, 'cf1', { hazardId: 'h1', text: 'Heat' }));
  return d;
}

test('itemOf: a creation lists every field but the restamp fields', () => {
  const rec = created(act, 'h9', { number: null, title: 'Flood' });
  const item = itemOf('hazard', null, rec);
  assert.equal(item.change, 'created');
  assert.deepEqual(item.fields.map((f) => f.field), ['createdAt', 'createdBy', 'id', 'number', 'status', 'title']);
  assert.deepEqual(item.fields.find((f) => f.field === 'title'), { field: 'title', before: null, after: 'Flood' });
});

test('itemOf: an edit lists only what changed; delete, retire and restore are told apart', () => {
  const rec = created(act, 'h9', { title: 'Flood', description: 'x' });
  const edit = itemOf('hazard', rec, changed(rec, later, { title: 'Flash flood' }));
  assert.equal(edit.change, 'edited');
  assert.deepEqual(edit.fields, [{ field: 'title', before: 'Flood', after: 'Flash flood' }]);
  const del = itemOf('hazard', rec, changed(rec, later, { status: 'deleted' }));
  assert.equal(del.change, 'deleted');
  assert.ok(del.fields.some((f) => f.field === 'description'));
  assert.equal(itemOf('hazard', rec, changed(rec, later, { status: 'retired' })).change, 'retired');
  const retired = { ...rec, status: 'retired' };
  assert.equal(itemOf('hazard', retired, changed(retired, later, { status: 'live' })).change, 'restored');
});

test('platformsReached follows the links for every kind', () => {
  const d = seeded();
  assert.deepEqual(platformsReached(d, 'hazard', d.records.hazard.h1), ['p1', 'p2']);
  assert.deepEqual(platformsReached(d, 'causalFactor', d.records.causalFactor.cf1), ['p1', 'p2']);
  assert.deepEqual(platformsReached(d, 'control', d.records.control.c1), ['p1', 'p2']);
  assert.deepEqual(platformsReached(d, 'hazardControl', d.records.hazardControl['hc:h1:c1']), ['p1', 'p2']);
  assert.deepEqual(platformsReached(d, 'platform', d.records.platform.p1), ['p1']);
  assert.deepEqual(platformsReached(d, 'hazardPlatform', d.records.hazardPlatform['hp:h1:p2']), ['p2']);
  assert.deepEqual(platformsReached(d, 'ruling', { platformId: 'p1' }), ['p1']);
  assert.deepEqual(platformsReached(d, 'rating', { platformId: 'p2' }), ['p2']);
  assert.deepEqual(platformsReached(d, 'report', { platformId: 'p2' }), ['p2']);
});

test('commit puts the records and appends one entry naming the platforms reached', () => {
  const d = seeded();
  const h = d.records.hazard.h1;
  const next = commit(d, later, 'Edit hazard', [{ kind: 'hazard', rec: changed(h, later, { title: 'Big fire' }) }]);
  assert.equal(next.records.hazard.h1.title, 'Big fire');
  const [entry] = entries(next);
  assert.equal(entry.type, 'change');
  assert.equal(entry.by, 'u2');
  assert.equal(entry.at, later.at);
  assert.equal(entry.action, 'Edit hazard');
  assert.deepEqual(entry.platforms, ['p1', 'p2']);
  assert.deepEqual(entry.items[0].fields, [{ field: 'title', before: 'Fire', after: 'Big fire' }]);
  assert.equal(d.records.hazard.h1.title, 'Fire', 'the input is untouched');
});

test('commit of an unlink still names the platform the link was on', () => {
  const d = seeded();
  const link = d.records.hazardPlatform['hp:h1:p2'];
  const next = commit(d, later, 'Unlink', [{ kind: 'hazardPlatform', rec: changed(link, later, { status: 'deleted' }) }]);
  assert.deepEqual(entries(next)[0].platforms, ['p2']);
});

test('commit that changes nothing but the stamp returns the same data and writes no entry', () => {
  const d = seeded();
  const h = d.records.hazard.h1;
  assert.equal(commit(d, later, 'Edit hazard', [{ kind: 'hazard', rec: changed(h, later, { title: 'Fire' }) }]), d);
});

test('historyOf gives the change entries that name a record, oldest first', () => {
  let d = seeded();
  d = commit(d, act, 'Edit hazard', [{ kind: 'hazard', rec: changed(d.records.hazard.h1, act, { title: 'A' }) }]);
  d = commit(d, later, 'Edit control', [{ kind: 'control', rec: changed(d.records.control.c1, later, { title: 'B' }) }]);
  d = commit(d, later, 'Edit hazard', [{ kind: 'hazard', rec: changed(d.records.hazard.h1, later, { title: 'C' }) }]);
  assert.deepEqual(historyOf(d, 'hazard', 'h1').map((e) => e.items[0].fields[0].after), ['A', 'C']);
});

test('an override is shown once to each user whose edit it overrode', () => {
  let d = seeded();
  d = recordOverride(d, act, [
    { kind: 'hazard', id: 'h1', reason: 'both-changed', overriddenBy: 'u2', theirs: { title: 'Theirs' }, mine: { title: 'Mine' } },
    { kind: 'control', id: 'c1', reason: 'both-changed', overriddenBy: 'u3', theirs: { title: 'T' }, mine: { title: 'M' } },
  ]);
  const forU2 = unseenOverrides(d, 'u2');
  assert.equal(forU2.length, 1);
  assert.deepEqual(forU2[0].items.map((i) => i.id), ['h1'], 'u2 sees only their own overridden edits');
  d = markNoticesSeen(d, later, forU2.map((e) => e.id));
  assert.deepEqual(unseenOverrides(d, 'u2'), []);
  assert.equal(unseenOverrides(d, 'u3').length, 1, 'seeing it for u2 does not clear it for u3');
  assert.deepEqual(unseenOverrides(d, 'u1'), []);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/core/history.test.js`
Expected: FAIL with `Cannot find module '.../src/core/history.js'`.

- [ ] **Step 3: Write the implementation**

`src/core/history.js`:

```js
import { newId } from './ids.js';
import { canonicalJson } from './json.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Rec} Rec */
/** @typedef {import('./data.js').Act} Act */

/** Restamped on every edit, and the entry's own `by` and `at` already say who and when. */
export const RESTAMP = Object.freeze(['updatedBy', 'updatedAt']);

/** @param {Rec | null} before @param {Rec} after */
export function changeOf(before, after) {
  if (!before) return 'created';
  if (after.status !== before.status) {
    if (after.status === 'deleted') return 'deleted';
    if (after.status === 'retired') return 'retired';
    return 'restored';
  }
  return 'edited';
}

/**
 * @param {string} kind @param {Rec | null} before @param {Rec} after
 * @returns {{ kind: string, id: string, change: string, fields: { field: string, before: any, after: any }[] }}
 */
export function itemOf(kind, before, after) {
  const change = changeOf(before, after);
  const b = before ?? /** @type {Record<string, any>} */ ({});
  const names = [...new Set([...Object.keys(b), ...Object.keys(after)])].filter((f) => !RESTAMP.includes(f)).sort();
  const everything = change === 'created' || change === 'deleted';
  const fields = [];
  for (const field of names) {
    if (!everything && canonicalJson(b[field]) === canonicalJson(after[field])) continue;
    fields.push({
      field,
      before: field in b ? structuredClone(b[field]) : null,
      after: field in after ? structuredClone(after[field]) : null,
    });
  }
  return { kind, id: after.id, change, fields };
}

/** @param {Data} data @param {any} entry @returns {Data} */
function append(data, entry) {
  return { ...data, history: { ...data.history, [entry.id]: entry } };
}

/**
 * @param {Data} data @param {Act} act @param {string} action what the user did, e.g. "Edit hazard"
 * @param {{ kind: string, before: Rec | null, after: Rec }[]} pairs
 * @param {string[]} platforms every platform the action reaches
 * @returns {Data}
 */
export function recordChange(data, act, action, pairs, platforms) {
  const items = pairs.map((p) => itemOf(p.kind, p.before, p.after));
  if (items.length === 0) return data;
  return append(data, {
    id: newId(), type: 'change', at: act.at, by: act.by, action, items,
    platforms: [...new Set(platforms)].sort(),
  });
}

/**
 * Every entry, oldest first. Entries made in the same second keep the order they were made in:
 * the history object keeps insertion order, and the sort is stable.
 * @param {Data} data
 */
export function entries(data) {
  return Object.values(data.history).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** @param {Data} data @param {string} kind @param {string} id */
export function historyOf(data, kind, id) {
  return entries(data).filter((e) => e.type === 'change' && e.items.some((/** @type {any} */ i) => i.kind === kind && i.id === id));
}

/**
 * @param {Data} data @param {Act} act the saving user
 * @param {{ kind: string, id: string, reason: string, overriddenBy: string | null, theirs: any, mine: any }[]} conflicts
 */
export function recordOverride(data, act, conflicts) {
  return append(data, {
    id: newId(), type: 'override', at: act.at, by: act.by,
    items: conflicts.map((c) => ({ kind: c.kind, id: c.id, reason: c.reason, overriddenBy: c.overriddenBy, theirs: c.theirs, mine: c.mine })),
  });
}

/**
 * The override entries naming this profile that it has not yet seen, each cut down to that
 * profile's own items.
 * @param {Data} data @param {string} profileId
 */
export function unseenOverrides(data, profileId) {
  const all = entries(data);
  const seen = new Set(all.filter((e) => e.type === 'noticeSeen' && e.by === profileId).map((e) => e.entryId));
  return all
    .filter((e) => e.type === 'override' && !seen.has(e.id))
    .map((e) => ({ ...e, items: e.items.filter((/** @type {any} */ i) => i.overriddenBy === profileId) }))
    .filter((e) => e.items.length > 0);
}

/** @param {Data} data @param {Act} act @param {string[]} entryIds */
export function markNoticesSeen(data, act, entryIds) {
  let d = data;
  for (const entryId of entryIds) d = append(d, { id: newId(), type: 'noticeSeen', at: act.at, by: act.by, entryId });
  return d;
}
```

`src/core/queries.js` (more functions are added in Task 9):

```js
import { live } from './data.js';

/** @typedef {import('./data.js').Data} Data */

/** @param {string[]} xs */
function sortedUnique(xs) {
  return [...new Set(xs)].sort();
}

/** @param {Data} data @param {string} hazardId @returns {string[]} */
export function platformsOfHazard(data, hazardId) {
  return sortedUnique(live(data, 'hazardPlatform').filter((l) => l.hazardId === hazardId).map((l) => l.platformId));
}

/**
 * Every platform a record reaches through the live links: the list an edit is warned about
 * and (in release 2) queued for acknowledgement on.
 * @param {Data} data @param {string} kind @param {Record<string, any>} rec
 * @returns {string[]}
 */
export function platformsReached(data, kind, rec) {
  switch (kind) {
    case 'hazard': return platformsOfHazard(data, rec.id);
    case 'causalFactor':
    case 'consequence':
    case 'hazardControl': return platformsOfHazard(data, rec.hazardId);
    case 'control':
      return sortedUnique(live(data, 'hazardControl').filter((l) => l.controlId === rec.id).flatMap((l) => platformsOfHazard(data, l.hazardId)));
    case 'platform': return [rec.id];
    case 'hazardPlatform':
    case 'ruling':
    case 'rating':
    case 'report': return [rec.platformId];
    default: return [];
  }
}
```

`src/core/apply.js`:

```js
import { get, put } from './data.js';
import { recordChange, RESTAMP } from './history.js';
import { canonicalJson } from './json.js';
import { platformsReached } from './queries.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Rec} Rec */
/** @typedef {import('./data.js').Act} Act */

/** @param {Rec} r */
function withoutStamp(r) {
  const copy = { ...r };
  for (const f of RESTAMP) delete copy[f];
  return canonicalJson(copy);
}

/**
 * Put the records one user action changed, and record that action in the history. A record
 * whose only difference is its restamp is left as it was; if none changed, `data` comes back.
 * @param {Data} data @param {Act} act @param {string} action
 * @param {{ kind: string, rec: Rec }[]} recs
 * @returns {Data}
 */
export function commit(data, act, action, recs) {
  let next = data;
  /** @type {{ kind: string, before: Rec | null, after: Rec }[]} */
  const pairs = [];
  for (const { kind, rec } of recs) {
    const before = get(data, kind, rec.id) ?? null;
    if (before && withoutStamp(before) === withoutStamp(rec)) continue;
    pairs.push({ kind, before, after: rec });
    next = put(next, kind, rec);
  }
  if (pairs.length === 0) return data;
  const platforms = new Set();
  for (const p of pairs) {
    for (const pl of platformsReached(data, p.kind, p.before ?? p.after)) platforms.add(pl);
    for (const pl of platformsReached(next, p.kind, p.after)) platforms.add(pl);
  }
  return recordChange(next, act, action, pairs, [...platforms]);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/core/history.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/history.js src/core/apply.js src/core/queries.js test/core/history.test.js
git commit -m "Add the change history, override notices, and the commit helper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Hazard operations

**Files:**
- Create: `src/core/ops/hazards.js`
- Test: `test/core/ops/hazards.test.js`

**Interfaces:**
- Consumes: `data.js`, `apply.commit`, `queries.platformsOfHazard`, `ids`, `PivotError`.
- Produces (all `(data, act, args) -> Data`): `createHazard({ id?, title, description? })`, `updateHazard({ id, title?, description? })`, `retireHazard({ id })`, `deleteHazard({ id })`, `restoreRecord({ kind, id })` (retired → live, for `hazard`, `control`, `platform`), `addCausalFactor({ id?, hazardId, text })`, `updateCausalFactor({ id, text })`, `deleteCausalFactor({ id })`, `addConsequence(...)`, `updateConsequence(...)`, `deleteConsequence(...)`. Also `assignHazardNumbers(data) -> Data`, which is pure, takes no act and writes no history.
- Error codes: `empty`, `not-found`, `hazard.on-platforms` (details `{ platformIds }`), `not-retired`.

- [ ] **Step 1: Write the failing test**

`test/core/ops/hazards.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, put, created } from '../../../src/core/data.js';
import { entries } from '../../../src/core/history.js';
import { ids } from '../../../src/core/ids.js';
import {
  createHazard, updateHazard, retireHazard, deleteHazard, restoreRecord, assignHazardNumbers,
  addCausalFactor, updateCausalFactor, deleteCausalFactor, addConsequence,
} from '../../../src/core/ops/hazards.js';

const act = { by: 'u1', at: '2026-09-28T10:00:00+10:00' };
const later = { by: 'u2', at: '2026-09-28T11:00:00+10:00' };
const code = (c) => (e) => e.code === c;

test('createHazard stores the trimmed title with no number yet, and records it', () => {
  const d = createHazard(emptyData(), act, { id: 'h1', title: '  Fire  ', description: ' hot ' });
  assert.deepEqual(d.records.hazard.h1, { ...created(act, 'h1', {}), number: null, title: 'Fire', description: 'hot' });
  assert.equal(entries(d)[0].action, 'Create hazard');
  assert.throws(() => createHazard(emptyData(), act, { title: '  ' }), code('empty'));
});

test('updateHazard changes only what is given; the same title writes nothing', () => {
  const d = createHazard(emptyData(), act, { id: 'h1', title: 'Fire', description: 'a' });
  const d2 = updateHazard(d, later, { id: 'h1', title: 'Big fire' });
  assert.equal(d2.records.hazard.h1.title, 'Big fire');
  assert.equal(d2.records.hazard.h1.description, 'a');
  assert.equal(d2.records.hazard.h1.updatedBy, 'u2');
  assert.equal(updateHazard(d, later, { id: 'h1', title: 'Fire' }), d);
});

test('a hazard on a platform cannot be retired or deleted; the refusal names the platforms', () => {
  let d = createHazard(emptyData(), act, { id: 'h1', title: 'Fire' });
  d = put(d, 'platform', created(act, 'p1', { name: 'Alpha', ownerId: 'u1' }));
  d = put(d, 'hazardPlatform', created(act, ids.hazardPlatform('h1', 'p1'), { hazardId: 'h1', platformId: 'p1', reportId: null }));
  for (const op of [retireHazard, deleteHazard]) {
    assert.throws(() => op(d, act, { id: 'h1' }), (e) => e.code === 'hazard.on-platforms' && /Alpha/.test(e.message) && e.details.platformIds[0] === 'p1');
  }
});

test('retire and restore', () => {
  const d = retireHazard(createHazard(emptyData(), act, { id: 'h1', title: 'Fire' }), act, { id: 'h1' });
  assert.equal(d.records.hazard.h1.status, 'retired');
  const back = restoreRecord(d, later, { kind: 'hazard', id: 'h1' });
  assert.equal(back.records.hazard.h1.status, 'live');
  assert.throws(() => restoreRecord(back, later, { kind: 'hazard', id: 'h1' }), code('not-retired'));
});

test('deleting a hazard deletes its causal factors, consequences and control links with it', () => {
  let d = createHazard(emptyData(), act, { id: 'h1', title: 'Fire' });
  d = addCausalFactor(d, act, { id: 'cf1', hazardId: 'h1', text: 'Hot works' });
  d = addConsequence(d, act, { id: 'cq1', hazardId: 'h1', text: 'Burns' });
  d = put(d, 'hazardControl', created(act, ids.hazardControl('h1', 'c1'), { hazardId: 'h1', controlId: 'c1', kind: 'preventative' }));
  d = deleteHazard(d, later, { id: 'h1' });
  assert.equal(d.records.hazard.h1.status, 'deleted');
  assert.equal(d.records.causalFactor.cf1.status, 'deleted');
  assert.equal(d.records.consequence.cq1.status, 'deleted');
  assert.equal(d.records.hazardControl['hc:h1:c1'].status, 'deleted');
  const last = entries(d).at(-1);
  assert.equal(last.action, 'Delete hazard');
  assert.equal(last.items.length, 4, 'one entry for the whole delete');
});

test('causal factors: add, edit, delete; blank text refused; a missing hazard refused', () => {
  let d = createHazard(emptyData(), act, { id: 'h1', title: 'Fire' });
  d = addCausalFactor(d, act, { id: 'cf1', hazardId: 'h1', text: ' Hot works ' });
  assert.equal(d.records.causalFactor.cf1.text, 'Hot works');
  d = updateCausalFactor(d, later, { id: 'cf1', text: 'Welding' });
  assert.equal(d.records.causalFactor.cf1.text, 'Welding');
  d = deleteCausalFactor(d, later, { id: 'cf1' });
  assert.equal(d.records.causalFactor.cf1.status, 'deleted');
  assert.throws(() => addCausalFactor(d, act, { hazardId: 'h1', text: ' ' }), code('empty'));
  assert.throws(() => addCausalFactor(d, act, { hazardId: 'nope', text: 'x' }), code('not-found'));
});

test('assignHazardNumbers numbers unnumbered hazards in creation order and never reuses a number', () => {
  let d = emptyData();
  d = createHazard(d, { by: 'u1', at: '2026-09-28T10:00:02+10:00' }, { id: 'b', title: 'B' });
  d = createHazard(d, { by: 'u1', at: '2026-09-28T10:00:01+10:00' }, { id: 'a', title: 'A' });
  d = createHazard(d, act, { id: 'gone', title: 'Gone' });
  d = deleteHazard(d, act, { id: 'gone' });
  const before = Object.keys(d.history).length;
  d = { ...d, nextHazardNumber: 41 };
  d = assignHazardNumbers(d);
  assert.equal(d.records.hazard.a.number, 41);
  assert.equal(d.records.hazard.b.number, 42);
  assert.equal(d.records.hazard.gone.number, null, 'a hazard deleted before its first save gets no number');
  assert.equal(d.nextHazardNumber, 43);
  assert.equal(Object.keys(d.history).length, before, 'numbering is not a user action');
  assert.equal(assignHazardNumbers(d), d, 'nothing to number: the same data back');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/core/ops/hazards.test.js`
Expected: FAIL with `Cannot find module '.../src/core/ops/hazards.js'`.

- [ ] **Step 3: Write the implementation**

`src/core/ops/hazards.js`:

```js
import { PivotError } from '../errors.js';
import { newId, hazardLabel } from '../ids.js';
import { get, put, all, live, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';
import { platformsOfHazard } from '../queries.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

/** @param {Data} data @param {Act} act @param {{ id?: string, title: string, description?: string }} args */
export function createHazard(data, act, { id = newId(), title, description = '' }) {
  const rec = created(act, id, { number: null, title: needText(title, 'A hazard title'), description: String(description ?? '').trim() });
  return commit(data, act, 'Create hazard', [{ kind: 'hazard', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, title?: string, description?: string }} args */
export function updateHazard(data, act, { id, title, description }) {
  const h = need(data, 'hazard', id);
  /** @type {Record<string, string>} */
  const fields = {};
  if (title !== undefined) fields.title = needText(title, 'A hazard title');
  if (description !== undefined) fields.description = String(description).trim();
  return commit(data, act, 'Edit hazard', [{ kind: 'hazard', rec: changed(h, act, fields) }]);
}

/** @param {Data} data @param {import('../data.js').Rec} hazard @param {string} verb */
function refuseOnPlatforms(data, hazard, verb) {
  const on = platformsOfHazard(data, hazard.id);
  if (on.length === 0) return;
  const names = on.map((p) => get(data, 'platform', p)?.name ?? p).join(', ');
  throw new PivotError(
    'hazard.on-platforms',
    `${hazardLabel(hazard)} is still on ${names}. Unlink it from ${on.length === 1 ? 'that platform' : 'those platforms'} before you ${verb} it.`,
    { platformIds: on },
  );
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function retireHazard(data, act, { id }) {
  const h = need(data, 'hazard', id);
  if (h.status === 'retired') return data;
  refuseOnPlatforms(data, h, 'retire');
  return commit(data, act, 'Retire hazard', [{ kind: 'hazard', rec: changed(h, act, { status: 'retired' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deleteHazard(data, act, { id }) {
  const h = need(data, 'hazard', id);
  refuseOnPlatforms(data, h, 'delete');
  const recs = [{ kind: 'hazard', rec: changed(h, act, { status: 'deleted' }) }];
  for (const kind of ['causalFactor', 'consequence']) {
    for (const r of live(data, kind)) if (r.hazardId === id) recs.push({ kind, rec: changed(r, act, { status: 'deleted' }) });
  }
  for (const l of live(data, 'hazardControl')) if (l.hazardId === id) recs.push({ kind: 'hazardControl', rec: changed(l, act, { status: 'deleted' }) });
  return commit(data, act, 'Delete hazard', recs);
}

const RESTORABLE = { hazard: 'hazard', control: 'control', platform: 'platform' };

/** @param {Data} data @param {Act} act @param {{ kind: string, id: string }} args */
export function restoreRecord(data, act, { kind, id }) {
  if (!(kind in RESTORABLE)) throw new PivotError('not-retired', `A ${kind} cannot be restored.`);
  const r = need(data, kind, id);
  if (r.status !== 'retired') throw new PivotError('not-retired', `That ${kind} is not retired.`);
  return commit(data, act, `Restore ${kind}`, [{ kind, rec: changed(r, act, { status: 'live' }) }]);
}

/**
 * @param {'causalFactor' | 'consequence'} kind
 * @param {string} label e.g. "Causal factor"
 */
function childOps(kind, label) {
  const lower = label.toLowerCase();
  return {
    /** @param {Data} data @param {Act} act @param {{ id?: string, hazardId: string, text: string }} args */
    add(data, act, { id = newId(), hazardId, text }) {
      need(data, 'hazard', hazardId);
      const rec = created(act, id, { hazardId, text: needText(text, `${label} text`) });
      return commit(data, act, `Add ${lower}`, [{ kind, rec }]);
    },
    /** @param {Data} data @param {Act} act @param {{ id: string, text: string }} args */
    update(data, act, { id, text }) {
      const r = need(data, kind, id);
      return commit(data, act, `Edit ${lower}`, [{ kind, rec: changed(r, act, { text: needText(text, `${label} text`) }) }]);
    },
    /** @param {Data} data @param {Act} act @param {{ id: string }} args */
    remove(data, act, { id }) {
      const r = need(data, kind, id);
      return commit(data, act, `Delete ${lower}`, [{ kind, rec: changed(r, act, { status: 'deleted' }) }]);
    },
  };
}

const causal = childOps('causalFactor', 'Causal factor');
export const addCausalFactor = causal.add;
export const updateCausalFactor = causal.update;
export const deleteCausalFactor = causal.remove;

const conseq = childOps('consequence', 'Consequence');
export const addConsequence = conseq.add;
export const updateConsequence = conseq.update;
export const deleteConsequence = conseq.remove;

/**
 * Give each hazard that has no number the next one, oldest first. Run at save time, after the
 * merge, so two users creating hazards at once never take the same number.
 * @param {Data} data
 * @returns {Data}
 */
export function assignHazardNumbers(data) {
  const fresh = all(data, 'hazard').filter((h) => h.number == null && h.status !== 'deleted');
  if (fresh.length === 0) return data;
  let n = data.nextHazardNumber;
  let d = data;
  for (const h of fresh) d = put(d, 'hazard', { ...h, number: n++ });
  return { ...d, nextHazardNumber: n };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/core/ops/hazards.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/ops/hazards.js test/core/ops/hazards.test.js
git commit -m "Add hazard, causal factor and consequence operations and save-time numbering

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Control operations

**Files:**
- Create: `src/core/ops/controls.js`
- Test: `test/core/ops/controls.test.js`

**Interfaces:**
- Consumes: as Task 5.
- Produces: `CONTROL_KINDS = ['preventative', 'mitigating']`; `createControl({ id?, title, description? })`, `updateControl({ id, title?, description? })`, `retireControl({ id })`, `deleteControl({ id })`, `linkControl({ hazardId, controlId, kind })`, `setControlKind({ hazardId, controlId, kind })`, `unlinkControl({ hazardId, controlId })`.
- Error codes: `control.in-use` (details `{ hazardIds }`), `control.kind`, `control.retired`.
- Retiring a control takes it out of the library and off nothing. Unlinking a control from a hazard deletes every ruling that control had for that hazard on any platform.

- [ ] **Step 1: Write the failing test**

`test/core/ops/controls.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, put, created } from '../../../src/core/data.js';
import { ids } from '../../../src/core/ids.js';
import { createHazard } from '../../../src/core/ops/hazards.js';
import {
  createControl, updateControl, retireControl, deleteControl, linkControl, setControlKind, unlinkControl,
} from '../../../src/core/ops/controls.js';

const act = { by: 'u1', at: '2026-09-28T10:00:00+10:00' };
const later = { by: 'u2', at: '2026-09-28T11:00:00+10:00' };
const code = (c) => (e) => e.code === c;

function base() {
  let d = createHazard(emptyData(), act, { id: 'h1', title: 'Fire' });
  d = createControl(d, act, { id: 'c1', title: ' Sprinklers ', description: 'wet pipe' });
  return d;
}

test('createControl stores one library control with no hazard, platform or kind', () => {
  const c = base().records.control.c1;
  assert.equal(c.title, 'Sprinklers');
  assert.equal(c.description, 'wet pipe');
  assert.equal('kind' in c, false);
  assert.equal('hazardId' in c, false);
});

test('updateControl renames; blank refused', () => {
  const d = updateControl(base(), later, { id: 'c1', title: 'Deluge' });
  assert.equal(d.records.control.c1.title, 'Deluge');
  assert.throws(() => updateControl(d, later, { id: 'c1', title: ' ' }), code('empty'));
});

test('linkControl links as preventative or mitigating, one link id per pair, and relinking revives it', () => {
  let d = linkControl(base(), act, { hazardId: 'h1', controlId: 'c1', kind: 'preventative' });
  const id = ids.hazardControl('h1', 'c1');
  assert.equal(d.records.hazardControl[id].kind, 'preventative');
  assert.throws(() => linkControl(base(), act, { hazardId: 'h1', controlId: 'c1', kind: 'both' }), code('control.kind'));
  d = setControlKind(d, later, { hazardId: 'h1', controlId: 'c1', kind: 'mitigating' });
  assert.equal(d.records.hazardControl[id].kind, 'mitigating');
  d = unlinkControl(d, later, { hazardId: 'h1', controlId: 'c1' });
  assert.equal(d.records.hazardControl[id].status, 'deleted');
  d = linkControl(d, later, { hazardId: 'h1', controlId: 'c1', kind: 'preventative' });
  assert.equal(d.records.hazardControl[id].status, 'live');
  assert.equal(d.records.hazardControl[id].createdBy, 'u1', 'the same record, revived');
});

test('unlinking a control from a hazard deletes its rulings for that hazard on every platform', () => {
  let d = linkControl(base(), act, { hazardId: 'h1', controlId: 'c1', kind: 'preventative' });
  for (const p of ['p1', 'p2']) {
    d = put(d, 'ruling', created(act, ids.ruling('h1', 'c1', p), { hazardId: 'h1', controlId: 'c1', platformId: p, state: 'confirmed', reason: '' }));
  }
  d = unlinkControl(d, later, { hazardId: 'h1', controlId: 'c1' });
  assert.equal(d.records.ruling['ru:h1:c1:p1'].status, 'deleted');
  assert.equal(d.records.ruling['ru:h1:c1:p2'].status, 'deleted');
});

test('a control linked to a hazard cannot be deleted; retiring it keeps its links', () => {
  let d = linkControl(base(), act, { hazardId: 'h1', controlId: 'c1', kind: 'preventative' });
  assert.throws(() => deleteControl(d, later, { id: 'c1' }), (e) => e.code === 'control.in-use' && e.details.hazardIds[0] === 'h1');
  d = retireControl(d, later, { id: 'c1' });
  assert.equal(d.records.control.c1.status, 'retired');
  assert.equal(d.records.hazardControl['hc:h1:c1'].status, 'live');
  assert.throws(() => linkControl(d, later, { hazardId: 'h1', controlId: 'c1', kind: 'mitigating' }), code('control.retired'));
});

test('an unlinked control can be deleted', () => {
  const d = deleteControl(base(), later, { id: 'c1' });
  assert.equal(d.records.control.c1.status, 'deleted');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/core/ops/controls.test.js`
Expected: FAIL with `Cannot find module '.../src/core/ops/controls.js'`.

- [ ] **Step 3: Write the implementation**

`src/core/ops/controls.js`:

```js
import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, live, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

export const CONTROL_KINDS = Object.freeze(['preventative', 'mitigating']);

/** @param {unknown} kind @returns {string} */
function needKind(kind) {
  if (typeof kind !== 'string' || !CONTROL_KINDS.includes(kind)) {
    throw new PivotError('control.kind', 'A control is linked to a hazard as either preventative or mitigating.');
  }
  return kind;
}

/** @param {Data} data @param {Act} act @param {{ id?: string, title: string, description?: string }} args */
export function createControl(data, act, { id = newId(), title, description = '' }) {
  const rec = created(act, id, { title: needText(title, 'A control title'), description: String(description ?? '').trim() });
  return commit(data, act, 'Create control', [{ kind: 'control', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, title?: string, description?: string }} args */
export function updateControl(data, act, { id, title, description }) {
  const c = need(data, 'control', id);
  /** @type {Record<string, string>} */
  const fields = {};
  if (title !== undefined) fields.title = needText(title, 'A control title');
  if (description !== undefined) fields.description = String(description).trim();
  return commit(data, act, 'Edit control', [{ kind: 'control', rec: changed(c, act, fields) }]);
}

/** Takes the control out of the library and off nothing. @param {Data} data @param {Act} act @param {{ id: string }} args */
export function retireControl(data, act, { id }) {
  const c = need(data, 'control', id);
  if (c.status === 'retired') return data;
  return commit(data, act, 'Retire control', [{ kind: 'control', rec: changed(c, act, { status: 'retired' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deleteControl(data, act, { id }) {
  const c = need(data, 'control', id);
  const uses = live(data, 'hazardControl').filter((l) => l.controlId === id);
  if (uses.length) {
    throw new PivotError('control.in-use', `${c.title} is still linked to ${uses.length === 1 ? 'a hazard' : `${uses.length} hazards`}. Unlink it first.`, { hazardIds: uses.map((u) => u.hazardId) });
  }
  return commit(data, act, 'Delete control', [{ kind: 'control', rec: changed(c, act, { status: 'deleted' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, controlId: string, kind: string }} args */
export function linkControl(data, act, { hazardId, controlId, kind }) {
  need(data, 'hazard', hazardId);
  const c = need(data, 'control', controlId);
  if (c.status !== 'live') throw new PivotError('control.retired', `${c.title} is retired, so it cannot be linked to a hazard.`);
  const k = needKind(kind);
  const id = ids.hazardControl(hazardId, controlId);
  const existing = get(data, 'hazardControl', id);
  const rec = existing ? changed(existing, act, { status: 'live', kind: k }) : created(act, id, { hazardId, controlId, kind: k });
  return commit(data, act, 'Link control to hazard', [{ kind: 'hazardControl', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, controlId: string, kind: string }} args */
export function setControlKind(data, act, { hazardId, controlId, kind }) {
  const l = need(data, 'hazardControl', ids.hazardControl(hazardId, controlId));
  return commit(data, act, 'Change control kind', [{ kind: 'hazardControl', rec: changed(l, act, { kind: needKind(kind) }) }]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, controlId: string }} args */
export function unlinkControl(data, act, { hazardId, controlId }) {
  const l = need(data, 'hazardControl', ids.hazardControl(hazardId, controlId));
  const recs = [{ kind: 'hazardControl', rec: changed(l, act, { status: 'deleted' }) }];
  for (const r of live(data, 'ruling')) {
    if (r.hazardId === hazardId && r.controlId === controlId) recs.push({ kind: 'ruling', rec: changed(r, act, { status: 'deleted' }) });
  }
  return commit(data, act, 'Unlink control from hazard', recs);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/core/ops/controls.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/ops/controls.js test/core/ops/controls.test.js
git commit -m "Add the control library and hazard-control links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Platform operations and the shared test seed

**Files:**
- Create: `src/core/ops/platforms.js`, `test/helpers.js`
- Test: `test/core/ops/platforms.test.js`

**Interfaces:**
- Consumes: as Task 5; `createHazard`, `addCausalFactor`, `addConsequence` (Task 5); `createControl`, `linkControl` (Task 6).
- Produces: `createPlatform({ id?, name, ownerId })`, `updatePlatform({ id, name })`, `setOwner({ id, ownerId })`, `retirePlatform({ id })`, `deletePlatform({ id })`, `linkHazard({ hazardId, platformId })`, `unlinkHazard({ hazardId, platformId })`, `setReportId({ hazardId, platformId, reportId })` (blank → `null`, meaning "use the global ID").
- Error codes: `platform.has-hazards`, `hazard.retired`, `platform.retired`.
- `test/helpers.js` exports `act`, `later` and `seed()`. The seed holds hazards `h1` "Fire" and `h2` "Flood"; causal factor `cf1` and consequence `cq1` on `h1`; controls `c1` "Sprinklers" (preventative on `h1`) and `c2` "Fire drills" (mitigating on `h1`); platforms `p1` "Alpha" (owner `u1`) and `p2` "Bravo" (owner `u2`); and `h1` linked to both platforms.

- [ ] **Step 1: Write the shared seed**

`test/helpers.js`:

```js
import { emptyData } from '../src/core/data.js';
import { createHazard, addCausalFactor, addConsequence } from '../src/core/ops/hazards.js';
import { createControl, linkControl } from '../src/core/ops/controls.js';
import { createPlatform, linkHazard } from '../src/core/ops/platforms.js';

export const act = { by: 'u1', at: '2026-09-28T10:00:00+10:00' };
export const later = { by: 'u2', at: '2026-09-28T11:00:00+10:00' };

/** h1 Fire (cf1, cq1, c1 preventative, c2 mitigating) on p1 Alpha and p2 Bravo; h2 Flood on nothing. */
export function seed() {
  let d = emptyData();
  d = createHazard(d, act, { id: 'h1', title: 'Fire' });
  d = createHazard(d, act, { id: 'h2', title: 'Flood' });
  d = addCausalFactor(d, act, { id: 'cf1', hazardId: 'h1', text: 'Hot works' });
  d = addConsequence(d, act, { id: 'cq1', hazardId: 'h1', text: 'Burns' });
  d = createControl(d, act, { id: 'c1', title: 'Sprinklers' });
  d = createControl(d, act, { id: 'c2', title: 'Fire drills' });
  d = linkControl(d, act, { hazardId: 'h1', controlId: 'c1', kind: 'preventative' });
  d = linkControl(d, act, { hazardId: 'h1', controlId: 'c2', kind: 'mitigating' });
  d = createPlatform(d, act, { id: 'p1', name: 'Alpha', ownerId: 'u1' });
  d = createPlatform(d, act, { id: 'p2', name: 'Bravo', ownerId: 'u2' });
  d = linkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  d = linkHazard(d, act, { hazardId: 'h1', platformId: 'p2' });
  return d;
}
```

- [ ] **Step 2: Write the failing test**

`test/core/ops/platforms.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { put, created } from '../../../src/core/data.js';
import { ids } from '../../../src/core/ids.js';
import { entries } from '../../../src/core/history.js';
import { retireHazard } from '../../../src/core/ops/hazards.js';
import {
  createPlatform, updatePlatform, setOwner, retirePlatform, deletePlatform, linkHazard, unlinkHazard, setReportId,
} from '../../../src/core/ops/platforms.js';
import { act, later, seed } from '../../helpers.js';

const code = (c) => (e) => e.code === c;

test('a platform has a name and exactly one owner', () => {
  const d = seed();
  assert.equal(d.records.platform.p1.ownerId, 'u1');
  assert.throws(() => createPlatform(d, act, { name: 'X', ownerId: '' }), code('empty'));
  assert.throws(() => createPlatform(d, act, { name: ' ', ownerId: 'u1' }), code('empty'));
  const d2 = setOwner(updatePlatform(d, later, { id: 'p1', name: 'Alpha 2' }), later, { id: 'p1', ownerId: 'u3' });
  assert.equal(d2.records.platform.p1.name, 'Alpha 2');
  assert.equal(d2.records.platform.p1.ownerId, 'u3');
});

test('adding a platform changes nothing that already exists', () => {
  const d = seed();
  const d2 = createPlatform(d, later, { id: 'p9', name: 'New', ownerId: 'u1' });
  for (const kind of Object.keys(d.records)) {
    if (kind === 'platform') continue;
    assert.equal(d2.records[kind], d.records[kind], `${kind} untouched`);
  }
});

test('linkHazard links once, copies nothing, and starts the report id at the global id (null)', () => {
  const d = seed();
  const link = d.records.hazardPlatform[ids.hazardPlatform('h1', 'p1')];
  assert.equal(link.reportId, null);
  assert.equal(linkHazard(d, later, { hazardId: 'h1', platformId: 'p1' }), d, 'linking again changes nothing');
});

test('a retired hazard, or a retired platform, cannot be linked', () => {
  let d = retireHazard(seed(), act, { id: 'h2' });
  assert.throws(() => linkHazard(d, act, { hazardId: 'h2', platformId: 'p1' }), code('hazard.retired'));
  d = retirePlatform(seed(), act, { id: 'p1' });
  assert.throws(() => linkHazard(d, act, { hazardId: 'h2', platformId: 'p1' }), code('platform.retired'));
});

test('unlinking a hazard from a platform deletes its rulings and rating there, and then it can be retired', () => {
  let d = seed();
  d = put(d, 'ruling', created(act, ids.ruling('h1', 'c1', 'p1'), { hazardId: 'h1', controlId: 'c1', platformId: 'p1', state: 'confirmed', reason: '' }));
  d = put(d, 'ruling', created(act, ids.ruling('h1', 'c1', 'p2'), { hazardId: 'h1', controlId: 'c1', platformId: 'p2', state: 'confirmed', reason: '' }));
  d = put(d, 'rating', created(act, ids.rating('h1', 'p1'), { hazardId: 'h1', platformId: 'p1', initial: null, residual: { consequence: 2, likelihood: 'C' } }));
  d = unlinkHazard(d, later, { hazardId: 'h1', platformId: 'p1' });
  assert.equal(d.records.hazardPlatform['hp:h1:p1'].status, 'deleted');
  assert.equal(d.records.ruling['ru:h1:c1:p1'].status, 'deleted');
  assert.equal(d.records.rating['rt:h1:p1'].status, 'deleted');
  assert.equal(d.records.ruling['ru:h1:c1:p2'].status, 'live', 'the other platform keeps its ruling');
  assert.deepEqual(entries(d).at(-1).platforms, ['p1']);
  d = unlinkHazard(d, later, { hazardId: 'h1', platformId: 'p2' });
  d = retireHazard(d, later, { id: 'h1' });
  assert.equal(d.records.hazard.h1.status, 'retired');
});

test('setReportId sets a platform-specific id; blank goes back to the global id', () => {
  let d = setReportId(seed(), later, { hazardId: 'h1', platformId: 'p1', reportId: '  ALPHA-7 ' });
  assert.equal(d.records.hazardPlatform['hp:h1:p1'].reportId, 'ALPHA-7');
  assert.equal(d.records.hazardPlatform['hp:h1:p2'].reportId, null);
  d = setReportId(d, later, { hazardId: 'h1', platformId: 'p1', reportId: '' });
  assert.equal(d.records.hazardPlatform['hp:h1:p1'].reportId, null);
});

test('a platform with hazards on it cannot be deleted; an empty one can', () => {
  assert.throws(() => deletePlatform(seed(), later, { id: 'p1' }), code('platform.has-hazards'));
  const d = createPlatform(seed(), later, { id: 'p9', name: 'Spare', ownerId: 'u1' });
  assert.equal(deletePlatform(d, later, { id: 'p9' }).records.platform.p9.status, 'deleted');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test test/core/ops/platforms.test.js`
Expected: FAIL with `Cannot find module '.../src/core/ops/platforms.js'`.

- [ ] **Step 4: Write the implementation**

`src/core/ops/platforms.js`:

```js
import { PivotError } from '../errors.js';
import { newId, ids, hazardLabel } from '../ids.js';
import { get, live, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

/** @param {Data} data @param {Act} act @param {{ id?: string, name: string, ownerId: string }} args */
export function createPlatform(data, act, { id = newId(), name, ownerId }) {
  const rec = created(act, id, { name: needText(name, 'A platform name'), ownerId: needText(ownerId, 'A platform owner') });
  return commit(data, act, 'Create platform', [{ kind: 'platform', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, name: string }} args */
export function updatePlatform(data, act, { id, name }) {
  const p = need(data, 'platform', id);
  return commit(data, act, 'Rename platform', [{ kind: 'platform', rec: changed(p, act, { name: needText(name, 'A platform name') }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, ownerId: string }} args */
export function setOwner(data, act, { id, ownerId }) {
  const p = need(data, 'platform', id);
  return commit(data, act, 'Change platform owner', [{ kind: 'platform', rec: changed(p, act, { ownerId: needText(ownerId, 'A platform owner') }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function retirePlatform(data, act, { id }) {
  const p = need(data, 'platform', id);
  if (p.status === 'retired') return data;
  return commit(data, act, 'Retire platform', [{ kind: 'platform', rec: changed(p, act, { status: 'retired' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deletePlatform(data, act, { id }) {
  const p = need(data, 'platform', id);
  const on = live(data, 'hazardPlatform').filter((l) => l.platformId === id);
  if (on.length) {
    throw new PivotError('platform.has-hazards', `${p.name} still has ${on.length === 1 ? 'a hazard' : `${on.length} hazards`} on it. Unlink them first.`, { hazardIds: on.map((l) => l.hazardId) });
  }
  return commit(data, act, 'Delete platform', [{ kind: 'platform', rec: changed(p, act, { status: 'deleted' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string }} args */
export function linkHazard(data, act, { hazardId, platformId }) {
  const h = need(data, 'hazard', hazardId);
  if (h.status !== 'live') throw new PivotError('hazard.retired', `${hazardLabel(h)} is retired, so it cannot be linked to a platform.`);
  const p = need(data, 'platform', platformId);
  if (p.status !== 'live') throw new PivotError('platform.retired', `${p.name} is retired, so no hazard can be linked to it.`);
  const id = ids.hazardPlatform(hazardId, platformId);
  const existing = get(data, 'hazardPlatform', id);
  if (existing && existing.status === 'live') return data;
  const rec = existing
    ? changed(existing, act, { status: 'live', reportId: null })
    : created(act, id, { hazardId, platformId, reportId: null });
  return commit(data, act, 'Link hazard to platform', [{ kind: 'hazardPlatform', rec }]);
}

/**
 * Also deletes the hazard's rulings and rating on that platform, so relinking starts every
 * control at awaiting.
 * @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string }} args
 */
export function unlinkHazard(data, act, { hazardId, platformId }) {
  const l = need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  const recs = [{ kind: 'hazardPlatform', rec: changed(l, act, { status: 'deleted' }) }];
  for (const r of live(data, 'ruling')) {
    if (r.hazardId === hazardId && r.platformId === platformId) recs.push({ kind: 'ruling', rec: changed(r, act, { status: 'deleted' }) });
  }
  const rating = get(data, 'rating', ids.rating(hazardId, platformId));
  if (rating && rating.status === 'live') recs.push({ kind: 'rating', rec: changed(rating, act, { status: 'deleted' }) });
  return commit(data, act, 'Unlink hazard from platform', recs);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string, reportId: string | null }} args */
export function setReportId(data, act, { hazardId, platformId, reportId }) {
  const l = need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  const v = String(reportId ?? '').trim();
  return commit(data, act, 'Set report ID', [{ kind: 'hazardPlatform', rec: changed(l, act, { reportId: v === '' ? null : v }) }]);
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `node --test test/core/ops/platforms.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/core/ops/platforms.js test/core/ops/platforms.test.js test/helpers.js
git commit -m "Add platforms, hazard-platform links and report IDs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Assessment operations and the cross-record rules

**Files:**
- Create: `src/core/ops/assessment.js`, `src/core/rules.js`
- Test: `test/core/ops/assessment.test.js`, `test/core/rules.test.js`

**Interfaces:**
- Consumes: as Task 5; `ratingFor` (Task 2); `test/helpers.seed`.
- Produces:
  - `assessment.js`: `confirmControl({ hazardId, controlId, platformId })`, `excludeControl({ hazardId, controlId, platformId, reason })`, `resetControl({ hazardId, controlId, platformId })`, `STAGES = ['initial', 'residual']`, `setRating({ hazardId, platformId, stage, consequence, likelihood })`. Form input arrives as strings, so `''` means not entered and the consequence is parsed as a number.
  - `rules.js`: `checkRules(data) -> [{ rule, message, records: [{ kind, id }] }]`.
- Error codes: `empty` (exclusion without a reason), `not-found` (no hazard-control or hazard-platform link), `rating.stage`, `rating.consequence`, `rating.likelihood`.

- [ ] **Step 1: Write the failing tests**

`test/core/ops/assessment.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ids } from '../../../src/core/ids.js';
import { entries } from '../../../src/core/history.js';
import { confirmControl, excludeControl, resetControl, setRating } from '../../../src/core/ops/assessment.js';
import { act, later, seed } from '../../helpers.js';

const code = (c) => (e) => e.code === c;
const triple = { hazardId: 'h1', controlId: 'c1', platformId: 'p1' };

test('confirm records who and when; exclude needs a reason; each replaces the other; reset returns to awaiting', () => {
  let d = confirmControl(seed(), later, triple);
  const id = ids.ruling('h1', 'c1', 'p1');
  assert.equal(d.records.ruling[id].state, 'confirmed');
  assert.equal(d.records.ruling[id].updatedBy, 'u2');
  assert.throws(() => excludeControl(d, later, { ...triple, reason: '  ' }), code('empty'));
  d = excludeControl(d, act, { ...triple, reason: ' Not fitted on this hull ' });
  assert.equal(d.records.ruling[id].state, 'excluded');
  assert.equal(d.records.ruling[id].reason, 'Not fitted on this hull');
  d = confirmControl(d, later, triple);
  assert.equal(d.records.ruling[id].reason, '');
  d = resetControl(d, later, triple);
  assert.equal(d.records.ruling[id].status, 'deleted');
  assert.equal(resetControl(d, later, triple), d, 'resetting an awaiting control changes nothing');
});

test('a ruling needs both links: the control on the hazard and the hazard on the platform', () => {
  assert.throws(() => confirmControl(seed(), act, { hazardId: 'h2', controlId: 'c1', platformId: 'p1' }), code('not-found'));
  assert.throws(() => confirmControl(seed(), act, { hazardId: 'h1', controlId: 'c1', platformId: 'nope' }), code('not-found'));
});

test('a ruling on one platform reaches that platform only', () => {
  const d = confirmControl(seed(), act, triple);
  assert.deepEqual(entries(d).at(-1).platforms, ['p1']);
});

test('setRating stores each stage exactly as entered, form strings included', () => {
  let d = setRating(seed(), act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', consequence: '2', likelihood: 'C' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 3, likelihood: 'D' });
  const r = d.records.rating[ids.rating('h1', 'p1')];
  assert.deepEqual(r.initial, { consequence: 2, likelihood: 'C' });
  assert.deepEqual(r.residual, { consequence: 3, likelihood: 'D' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: '', likelihood: '' });
  assert.equal(d.records.rating[ids.rating('h1', 'p1')].residual, null);
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: '4', likelihood: '' });
  assert.deepEqual(d.records.rating[ids.rating('h1', 'p1')].residual, { consequence: 4, likelihood: null });
});

test('setRating refuses values off the scales, an unknown stage, or a hazard not on the platform', () => {
  const d = seed();
  assert.throws(() => setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: '6', likelihood: 'A' }), code('rating.consequence'));
  assert.throws(() => setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: '2.5', likelihood: 'A' }), code('rating.consequence'));
  assert.throws(() => setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: '2', likelihood: 'Z' }), code('rating.likelihood'));
  assert.throws(() => setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'final', consequence: '2', likelihood: 'A' }), code('rating.stage'));
  assert.throws(() => setRating(d, act, { hazardId: 'h2', platformId: 'p1', stage: 'initial', consequence: '2', likelihood: 'A' }), code('not-found'));
});
```

`test/core/rules.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { put, created, changed } from '../../src/core/data.js';
import { ids } from '../../src/core/ids.js';
import { checkRules } from '../../src/core/rules.js';
import { confirmControl, excludeControl, setRating } from '../../src/core/ops/assessment.js';
import { act, seed } from '../helpers.js';

const rulesOf = (d) => checkRules(d).map((v) => v.rule).sort();

test('data built through the ops keeps every rule', () => {
  let d = seed();
  d = confirmControl(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  d = excludeControl(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', reason: 'n/a' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p2', stage: 'residual', consequence: 2, likelihood: 'C' });
  assert.deepEqual(checkRules(d), []);
});

test('each broken rule is found and names the records involved', () => {
  let d = seed();
  d = put(d, 'hazard', changed(d.records.hazard.h1, act, { status: 'retired' }));
  let v = checkRules(d).find((x) => x.rule === 'hazard-not-live-on-platform');
  assert.ok(v);
  assert.deepEqual(v.records.map((r) => r.kind).sort(), ['hazard', 'hazardPlatform']);

  d = seed();
  d = put(d, 'platform', changed(d.records.platform.p1, act, { status: 'deleted' }));
  assert.deepEqual(rulesOf(d), ['platform-deleted']);

  d = seed();
  d = put(d, 'control', changed(d.records.control.c1, act, { status: 'deleted' }));
  assert.deepEqual(rulesOf(d), ['control-deleted']);

  d = seed();
  d = put(d, 'hazard', changed(d.records.hazard.h2, act, { status: 'deleted' }));
  d = put(d, 'causalFactor', created(act, 'cfx', { hazardId: 'h2', text: 'x' }));
  assert.deepEqual(rulesOf(d), ['parent-deleted']);

  d = seed();
  d = put(d, 'ruling', created(act, ids.ruling('h2', 'c1', 'p1'), { hazardId: 'h2', controlId: 'c1', platformId: 'p1', state: 'confirmed', reason: '' }));
  assert.deepEqual(rulesOf(d), ['ruling-without-control-link', 'ruling-without-platform-link']);

  d = seed();
  d = put(d, 'ruling', created(act, ids.ruling('h1', 'c1', 'p1'), { hazardId: 'h1', controlId: 'c1', platformId: 'p1', state: 'excluded', reason: ' ' }));
  assert.deepEqual(rulesOf(d), ['exclusion-without-reason']);

  d = seed();
  d = put(d, 'rating', created(act, ids.rating('h2', 'p1'), { hazardId: 'h2', platformId: 'p1', initial: null, residual: null }));
  assert.deepEqual(rulesOf(d), ['rating-without-platform-link']);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/core/ops/assessment.test.js test/core/rules.test.js`
Expected: FAIL with `Cannot find module` for `assessment.js` and `rules.js`.

- [ ] **Step 3: Write the implementation**

`src/core/ops/assessment.js`:

```js
import { PivotError } from '../errors.js';
import { ids } from '../ids.js';
import { get, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';
import { ratingFor } from '../matrix.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */
/** @typedef {{ hazardId: string, controlId: string, platformId: string }} Triple */

/** @param {Data} data @param {Triple} t @returns {string} the ruling id */
function needTriple(data, t) {
  need(data, 'hazardControl', ids.hazardControl(t.hazardId, t.controlId));
  need(data, 'hazardPlatform', ids.hazardPlatform(t.hazardId, t.platformId));
  return ids.ruling(t.hazardId, t.controlId, t.platformId);
}

/** @param {Data} data @param {Act} act @param {Triple} t @param {'confirmed' | 'excluded'} state @param {string} reason @param {string} action */
function rule(data, act, t, state, reason, action) {
  const id = needTriple(data, t);
  const existing = get(data, 'ruling', id);
  const fields = { hazardId: t.hazardId, controlId: t.controlId, platformId: t.platformId, state, reason };
  const rec = existing ? changed(existing, act, { ...fields, status: 'live' }) : created(act, id, fields);
  return commit(data, act, action, [{ kind: 'ruling', rec }]);
}

/** @param {Data} data @param {Act} act @param {Triple} t */
export function confirmControl(data, act, t) {
  return rule(data, act, t, 'confirmed', '', 'Confirm control on platform');
}

/** @param {Data} data @param {Act} act @param {Triple & { reason: string }} t */
export function excludeControl(data, act, t) {
  return rule(data, act, t, 'excluded', needText(t.reason, 'A reason for excluding the control'), 'Exclude control from platform');
}

/** @param {Data} data @param {Act} act @param {Triple} t */
export function resetControl(data, act, t) {
  const id = needTriple(data, t);
  const r = get(data, 'ruling', id);
  if (!r || r.status !== 'live') return data;
  return commit(data, act, 'Reset control to awaiting', [{ kind: 'ruling', rec: changed(r, act, { status: 'deleted' }) }]);
}

export const STAGES = Object.freeze(['initial', 'residual']);

/** @param {unknown} consequence @param {unknown} likelihood */
function readPair(consequence, likelihood) {
  const c = consequence === '' || consequence == null ? null : Number(consequence);
  const l = likelihood === '' || likelihood == null ? null : String(likelihood);
  ratingFor(c, l); // throws when either is off its scale
  return c === null && l === null ? null : { consequence: c, likelihood: l };
}

/**
 * @param {Data} data @param {Act} act
 * @param {{ hazardId: string, platformId: string, stage: string, consequence: unknown, likelihood: unknown }} args
 */
export function setRating(data, act, { hazardId, platformId, stage, consequence, likelihood }) {
  if (!STAGES.includes(stage)) throw new PivotError('rating.stage', 'A rating is either initial or residual.');
  need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  const value = readPair(consequence, likelihood);
  const id = ids.rating(hazardId, platformId);
  const existing = get(data, 'rating', id);
  let rec;
  if (existing && existing.status === 'live') rec = changed(existing, act, { [stage]: value });
  else if (existing) rec = changed(existing, act, { status: 'live', initial: null, residual: null, [stage]: value });
  else rec = created(act, id, { hazardId, platformId, initial: null, residual: null, [stage]: value });
  return commit(data, act, stage === 'initial' ? 'Set initial rating' : 'Set residual rating', [{ kind: 'rating', rec }]);
}
```

`src/core/rules.js`:

```js
import { get, live } from './data.js';
import { ids, hazardLabel } from './ids.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {{ rule: string, message: string, records: { kind: string, id: string }[] }} Violation */

/**
 * The rules that span records. Every op keeps them; the merge re-checks them, because two
 * users' changes that were each fine can break one together.
 * @param {Data} data
 * @returns {Violation[]}
 */
export function checkRules(data) {
  /** @type {Violation[]} */
  const out = [];
  /** @param {string} kind @param {string} id */
  const liveRec = (kind, id) => {
    const r = get(data, kind, id);
    return r && r.status === 'live' ? r : null;
  };
  const gone = (/** @type {any} */ r) => !r || r.status === 'deleted';

  for (const l of live(data, 'hazardPlatform')) {
    const h = get(data, 'hazard', l.hazardId);
    const p = get(data, 'platform', l.platformId);
    if (!h || h.status !== 'live') {
      out.push({ rule: 'hazard-not-live-on-platform', message: `${h ? hazardLabel(h) : l.hazardId} is on a platform but is not live.`, records: [{ kind: 'hazard', id: l.hazardId }, { kind: 'hazardPlatform', id: l.id }] });
    }
    if (gone(p)) {
      out.push({ rule: 'platform-deleted', message: 'A hazard is linked to a deleted platform.', records: [{ kind: 'platform', id: l.platformId }, { kind: 'hazardPlatform', id: l.id }] });
    }
  }
  for (const l of live(data, 'hazardControl')) {
    if (gone(get(data, 'hazard', l.hazardId))) {
      out.push({ rule: 'parent-deleted', message: 'A control is linked to a deleted hazard.', records: [{ kind: 'hazard', id: l.hazardId }, { kind: 'hazardControl', id: l.id }] });
    }
    if (gone(get(data, 'control', l.controlId))) {
      out.push({ rule: 'control-deleted', message: 'A deleted control is still linked to a hazard.', records: [{ kind: 'control', id: l.controlId }, { kind: 'hazardControl', id: l.id }] });
    }
  }
  for (const kind of ['causalFactor', 'consequence']) {
    for (const r of live(data, kind)) {
      if (gone(get(data, 'hazard', r.hazardId))) {
        out.push({ rule: 'parent-deleted', message: `A ${kind === 'causalFactor' ? 'causal factor' : 'consequence'} belongs to a deleted hazard.`, records: [{ kind: 'hazard', id: r.hazardId }, { kind, id: r.id }] });
      }
    }
  }
  for (const r of live(data, 'ruling')) {
    const hc = ids.hazardControl(r.hazardId, r.controlId);
    const hp = ids.hazardPlatform(r.hazardId, r.platformId);
    if (!liveRec('hazardControl', hc)) out.push({ rule: 'ruling-without-control-link', message: 'A control is ruled on for a hazard it is not linked to.', records: [{ kind: 'ruling', id: r.id }, { kind: 'hazardControl', id: hc }] });
    if (!liveRec('hazardPlatform', hp)) out.push({ rule: 'ruling-without-platform-link', message: 'A control is ruled on for a platform the hazard is not on.', records: [{ kind: 'ruling', id: r.id }, { kind: 'hazardPlatform', id: hp }] });
    if (r.state === 'excluded' && !String(r.reason ?? '').trim()) out.push({ rule: 'exclusion-without-reason', message: 'A control is excluded with no reason.', records: [{ kind: 'ruling', id: r.id }] });
  }
  for (const r of live(data, 'rating')) {
    const hp = ids.hazardPlatform(r.hazardId, r.platformId);
    if (!liveRec('hazardPlatform', hp)) out.push({ rule: 'rating-without-platform-link', message: 'A rating exists for a platform the hazard is not on.', records: [{ kind: 'rating', id: r.id }, { kind: 'hazardPlatform', id: hp }] });
  }
  return out;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test test/core/ops/assessment.test.js test/core/rules.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/ops/assessment.js src/core/rules.js test/core/ops/assessment.test.js test/core/rules.test.js
git commit -m "Add control rulings, ratings, and the cross-record rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Queries

**Files:**
- Modify: `src/core/queries.js` (add the functions below, keeping `platformsOfHazard` and `platformsReached`)
- Test: `test/core/queries.test.js`

**Interfaces:**
- Consumes: `data.js`, `ids`, `matrix.ratingFor`.
- Produces:
  - `controlState(data, h, c, p) -> { state: 'confirmed' | 'excluded' | 'awaiting', ruling }`
  - `ratingOf(data, h, p) -> { initial, residual }` and `bandOf(pair) -> string`
  - `hazardDetail(data, hazardId) -> { hazard, causalFactors, consequences, controls: [{ link, control }], platforms: [{ link, platform, reportId }] } | null`
  - `controlsOnPlatform(data, h, p) -> [{ control, kind, state, ruling }]`
  - `platformHazards(data, platformId) -> [{ hazard, link, reportId, rating, controls }]`, sorted by hazard number with new ones last
  - `controlUsage(data, controlId) -> [{ hazard, kind, platforms: [{ platform, state, ruling }] }]`
  - `hazardsNotOn(data, platformId)` (live hazards to offer for linking) and `listHazards(data, status)`
  - `filterHazards(data, f) -> [{ hazard, platform, band }]` and `filterControls(data, f) -> [{ control, hazard, platform, kind, state, band }]`. The filter `f` is `{ platformId?, band?, status? ('live' default | 'retired' | 'deleted' | 'any'), controlState? }`.

- [ ] **Step 1: Write the failing test**

`test/core/queries.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  controlState, ratingOf, bandOf, hazardDetail, platformHazards, controlUsage, hazardsNotOn, listHazards,
  filterHazards, filterControls,
} from '../../src/core/queries.js';
import { assignHazardNumbers, retireHazard, createHazard } from '../../src/core/ops/hazards.js';
import { confirmControl, excludeControl, setRating } from '../../src/core/ops/assessment.js';
import { setReportId } from '../../src/core/ops/platforms.js';
import { act, seed } from '../helpers.js';

function assessed() {
  let d = assignHazardNumbers(seed());
  d = confirmControl(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  d = excludeControl(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', reason: 'No crew' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 2, likelihood: 'C' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p2', stage: 'residual', consequence: 4, likelihood: 'D' });
  return d;
}

test('controlState: confirmed, excluded, or awaiting', () => {
  const d = assessed();
  assert.equal(controlState(d, 'h1', 'c1', 'p1').state, 'confirmed');
  assert.equal(controlState(d, 'h1', 'c2', 'p1').state, 'excluded');
  assert.equal(controlState(d, 'h1', 'c2', 'p1').ruling.reason, 'No crew');
  assert.deepEqual(controlState(d, 'h1', 'c1', 'p2'), { state: 'awaiting', ruling: null });
});

test('ratingOf and bandOf', () => {
  const d = assessed();
  assert.deepEqual(ratingOf(d, 'h1', 'p1'), { initial: null, residual: { consequence: 2, likelihood: 'C' } });
  assert.equal(bandOf(ratingOf(d, 'h1', 'p1').residual), 'Serious');
  assert.equal(bandOf(null), 'Uncategorised');
  assert.deepEqual(ratingOf(d, 'h2', 'p1'), { initial: null, residual: null });
});

test('hazardDetail gathers a hazard and what hangs off it', () => {
  const d = setReportId(assessed(), act, { hazardId: 'h1', platformId: 'p2', reportId: 'B-1' });
  const det = hazardDetail(d, 'h1');
  assert.equal(det.hazard.title, 'Fire');
  assert.deepEqual(det.causalFactors.map((r) => r.text), ['Hot works']);
  assert.deepEqual(det.consequences.map((r) => r.text), ['Burns']);
  assert.deepEqual(det.controls.map((c) => `${c.control.title}:${c.link.kind}`), ['Sprinklers:preventative', 'Fire drills:mitigating']);
  assert.deepEqual(det.platforms.map((p) => `${p.platform.name}:${p.reportId}`), ['Alpha:H-0001', 'Bravo:B-1']);
  assert.equal(hazardDetail(d, 'nope'), null);
});

test('platformHazards is the one list of a platform\'s hazards, with ratings and control states', () => {
  const rows = platformHazards(assessed(), 'p1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hazard.id, 'h1');
  assert.equal(rows[0].reportId, 'H-0001');
  assert.deepEqual(rows[0].rating.residual, { consequence: 2, likelihood: 'C' });
  assert.deepEqual(rows[0].controls.map((c) => `${c.control.title}:${c.kind}:${c.state}`), ['Sprinklers:preventative:confirmed', 'Fire drills:mitigating:excluded']);
});

test('controlUsage shows where a control is used and its state on each platform', () => {
  const u = controlUsage(assessed(), 'c1');
  assert.equal(u.length, 1);
  assert.equal(u[0].hazard.id, 'h1');
  assert.deepEqual(u[0].platforms.map((p) => `${p.platform.name}:${p.state}`), ['Alpha:confirmed', 'Bravo:awaiting']);
});

test('hazardsNotOn and listHazards', () => {
  const d = assessed();
  assert.deepEqual(hazardsNotOn(d, 'p1').map((h) => h.id), ['h2']);
  const d2 = retireHazard(d, act, { id: 'h2' });
  assert.deepEqual(listHazards(d2, 'live').map((h) => h.id), ['h1']);
  assert.deepEqual(listHazards(d2, 'retired').map((h) => h.id), ['h2']);
  assert.deepEqual(listHazards(d2, 'any').map((h) => h.id), ['h1', 'h2']);
});

test('filterHazards: by platform, band and status, singly and together; a subset of the unfiltered list', () => {
  let d = createHazard(assessed(), act, { id: 'h3', title: 'Wind' });
  const allRows = filterHazards(d, {});
  assert.deepEqual(allRows.map((r) => `${r.hazard.id}@${r.platform?.id ?? '-'}`), ['h1@p1', 'h1@p2', 'h2@-', 'h3@-']);
  assert.deepEqual(filterHazards(d, { platformId: 'p2' }).map((r) => r.hazard.id), ['h1']);
  assert.deepEqual(filterHazards(d, { band: 'Serious' }).map((r) => r.platform.id), ['p1']);
  assert.deepEqual(filterHazards(d, { band: 'Serious', platformId: 'p2' }), []);
  d = retireHazard(d, act, { id: 'h3' });
  assert.deepEqual(filterHazards(d, { status: 'retired' }).map((r) => r.hazard.id), ['h3']);
});

test('filterControls: by platform, band, status and control state', () => {
  const d = assessed();
  const rows = filterControls(d, {});
  assert.deepEqual(rows.map((r) => `${r.control.id}@${r.platform.id}:${r.state}`), ['c1@p1:confirmed', 'c1@p2:awaiting', 'c2@p1:excluded', 'c2@p2:awaiting']);
  assert.deepEqual(filterControls(d, { controlState: 'awaiting' }).map((r) => r.platform.id), ['p2', 'p2']);
  assert.deepEqual(filterControls(d, { platformId: 'p1', controlState: 'excluded' }).map((r) => r.control.id), ['c2']);
  assert.deepEqual(filterControls(d, { band: 'Low' }).map((r) => r.control.id), ['c1', 'c2']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/core/queries.test.js`
Expected: FAIL with `does not provide an export named 'controlState'`.

- [ ] **Step 3: Write the implementation**

Replace `src/core/queries.js` with:

```js
import { get, all, live, byCreated } from './data.js';
import { ids, hazardLabel } from './ids.js';
import { ratingFor } from './matrix.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Rec} Rec */

/** @param {string[]} xs */
function sortedUnique(xs) {
  return [...new Set(xs)].sort();
}

/** @param {Data} data @param {string} hazardId @returns {string[]} */
export function platformsOfHazard(data, hazardId) {
  return sortedUnique(live(data, 'hazardPlatform').filter((l) => l.hazardId === hazardId).map((l) => l.platformId));
}

/**
 * Every platform a record reaches through the live links: the list an edit is warned about
 * and (in release 2) queued for acknowledgement on.
 * @param {Data} data @param {string} kind @param {Record<string, any>} rec
 * @returns {string[]}
 */
export function platformsReached(data, kind, rec) {
  switch (kind) {
    case 'hazard': return platformsOfHazard(data, rec.id);
    case 'causalFactor':
    case 'consequence':
    case 'hazardControl': return platformsOfHazard(data, rec.hazardId);
    case 'control':
      return sortedUnique(live(data, 'hazardControl').filter((l) => l.controlId === rec.id).flatMap((l) => platformsOfHazard(data, l.hazardId)));
    case 'platform': return [rec.id];
    case 'hazardPlatform':
    case 'ruling':
    case 'rating':
    case 'report': return [rec.platformId];
    default: return [];
  }
}

/** @param {Rec} a @param {Rec} b numbered hazards by number, new ones after them oldest first */
export function byNumber(a, b) {
  if (a.number != null && b.number != null) return a.number - b.number;
  if (a.number != null) return -1;
  if (b.number != null) return 1;
  return byCreated(a, b);
}

/** @param {Data} data @param {string} hazardId @param {string} controlId @param {string} platformId */
export function controlState(data, hazardId, controlId, platformId) {
  const r = get(data, 'ruling', ids.ruling(hazardId, controlId, platformId));
  return r && r.status === 'live' ? { state: /** @type {string} */ (r.state), ruling: r } : { state: 'awaiting', ruling: null };
}

/** @param {Data} data @param {string} hazardId @param {string} platformId */
export function ratingOf(data, hazardId, platformId) {
  const r = get(data, 'rating', ids.rating(hazardId, platformId));
  return r && r.status === 'live' ? { initial: r.initial ?? null, residual: r.residual ?? null } : { initial: null, residual: null };
}

/** @param {{ consequence: number | null, likelihood: string | null } | null | undefined} pair */
export function bandOf(pair) {
  return ratingFor(pair?.consequence ?? null, pair?.likelihood ?? null).band;
}

/** @param {Data} data @param {string} hazardId */
export function hazardDetail(data, hazardId) {
  const hazard = get(data, 'hazard', hazardId);
  if (!hazard) return null;
  return {
    hazard,
    causalFactors: live(data, 'causalFactor').filter((r) => r.hazardId === hazardId),
    consequences: live(data, 'consequence').filter((r) => r.hazardId === hazardId),
    controls: live(data, 'hazardControl').filter((l) => l.hazardId === hazardId)
      .map((link) => ({ link, control: /** @type {Rec} */ (get(data, 'control', link.controlId)) })),
    platforms: live(data, 'hazardPlatform').filter((l) => l.hazardId === hazardId)
      .map((link) => ({ link, platform: /** @type {Rec} */ (get(data, 'platform', link.platformId)), reportId: link.reportId ?? hazardLabel(hazard) })),
  };
}

/** @param {Data} data @param {string} hazardId @param {string} platformId */
export function controlsOnPlatform(data, hazardId, platformId) {
  return live(data, 'hazardControl').filter((l) => l.hazardId === hazardId).map((link) => {
    const s = controlState(data, hazardId, link.controlId, platformId);
    return { control: /** @type {Rec} */ (get(data, 'control', link.controlId)), kind: link.kind, state: s.state, ruling: s.ruling };
  });
}

/**
 * The one list of a platform's hazards. The platform screen, the assessment and reports are all
 * built from it, so no two of them can disagree about what the platform holds.
 * @param {Data} data @param {string} platformId
 */
export function platformHazards(data, platformId) {
  return live(data, 'hazardPlatform').filter((l) => l.platformId === platformId).map((link) => {
    const hazard = /** @type {Rec} */ (get(data, 'hazard', link.hazardId));
    return {
      hazard, link,
      reportId: link.reportId ?? hazardLabel(hazard),
      rating: ratingOf(data, hazard.id, platformId),
      controls: controlsOnPlatform(data, hazard.id, platformId),
    };
  }).sort((a, b) => byNumber(a.hazard, b.hazard));
}

/** @param {Data} data @param {string} controlId */
export function controlUsage(data, controlId) {
  return live(data, 'hazardControl').filter((l) => l.controlId === controlId).map((link) => {
    const hazard = /** @type {Rec} */ (get(data, 'hazard', link.hazardId));
    const platforms = live(data, 'hazardPlatform').filter((l) => l.hazardId === hazard.id).map((hp) => ({
      platform: /** @type {Rec} */ (get(data, 'platform', hp.platformId)),
      ...controlState(data, hazard.id, controlId, hp.platformId),
    }));
    return { hazard, kind: link.kind, platforms };
  });
}

/** @param {Data} data @param {string} platformId live hazards not yet on the platform */
export function hazardsNotOn(data, platformId) {
  const on = new Set(live(data, 'hazardPlatform').filter((l) => l.platformId === platformId).map((l) => l.hazardId));
  return live(data, 'hazard').filter((h) => !on.has(h.id)).sort(byNumber);
}

/** @param {Rec} rec @param {string | undefined} status */
function statusMatches(rec, status) {
  const s = status || 'live';
  return s === 'any' || rec.status === s;
}

/** @param {Data} data @param {string} [status] 'live' (default), 'retired', 'deleted' or 'any' */
export function listHazards(data, status) {
  return all(data, 'hazard').filter((h) => statusMatches(h, status)).sort(byNumber);
}

/**
 * @typedef {{ platformId?: string, band?: string, status?: string, controlState?: string }} Filter
 */

/** One row per hazard per platform it is on; a hazard on no platform is one row with none. @param {Data} data @param {Filter} f */
export function filterHazards(data, f = {}) {
  const rows = [];
  for (const hazard of listHazards(data, f.status)) {
    const links = live(data, 'hazardPlatform').filter((l) => l.hazardId === hazard.id && (!f.platformId || l.platformId === f.platformId));
    if (links.length === 0) {
      if (!f.platformId && !f.band) rows.push({ hazard, platform: null, band: null });
      continue;
    }
    for (const l of links) {
      const band = bandOf(ratingOf(data, hazard.id, l.platformId).residual);
      if (f.band && band !== f.band) continue;
      rows.push({ hazard, platform: /** @type {Rec} */ (get(data, 'platform', l.platformId)), band });
    }
  }
  return rows;
}

/**
 * One row per control per hazard-on-platform it serves; a control used nowhere is one row with
 * none. A control's band is the residual band of the hazard row it appears on.
 * @param {Data} data @param {Filter} f
 */
export function filterControls(data, f = {}) {
  const rows = [];
  const narrowed = Boolean(f.platformId || f.band || f.controlState);
  for (const control of all(data, 'control').filter((c) => statusMatches(c, f.status))) {
    let used = false;
    for (const hc of live(data, 'hazardControl').filter((l) => l.controlId === control.id)) {
      const hazard = /** @type {Rec} */ (get(data, 'hazard', hc.hazardId));
      for (const hp of live(data, 'hazardPlatform').filter((l) => l.hazardId === hazard.id)) {
        used = true;
        if (f.platformId && hp.platformId !== f.platformId) continue;
        const { state } = controlState(data, hazard.id, control.id, hp.platformId);
        const band = bandOf(ratingOf(data, hazard.id, hp.platformId).residual);
        if (f.band && band !== f.band) continue;
        if (f.controlState && state !== f.controlState) continue;
        rows.push({ control, hazard, platform: /** @type {Rec} */ (get(data, 'platform', hp.platformId)), kind: hc.kind, state, band });
      }
    }
    if (!used && !narrowed) rows.push({ control, hazard: null, platform: null, kind: null, state: null, band: null });
  }
  return rows;
}
```

- [ ] **Step 4: Run all core tests to verify they pass**

Run: `node --test "test/core/**/*.test.js"`
Expected: PASS, every test (Tasks 1 to 9).

- [ ] **Step 5: Commit**

```bash
git add src/core/queries.js test/core/queries.test.js
git commit -m "Add the queries every view is built from, including hazard and control filters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: The three-way merge

**Files:**
- Create: `src/core/merge.js`
- Test: `test/core/merge.test.js`, `test/core/random-edits.js` (a test helper, not a test file)

**Interfaces:**
- Consumes: `KINDS`, `put` (Task 3); `sameJson` (Task 1); `checkRules` (Task 8); every op (Tasks 5 to 8) in the random helper.
- Produces: `mergeData(base, mine, theirs, act) -> { data, conflicts }`. Each conflict is `{ kind, id, reason, mine, theirs, overriddenBy }`, where `reason` is `'both-changed'` or `'rule:<rule name>'` and `overriddenBy` is the profile whose edit lost, or `null` if unknown. It throws `PivotError('merge.rules')` if the rules still fail after resolution; that should not happen.
- Resolution: a record only one side changed takes that side's version. A record both sides changed differently takes mine and is a conflict. After merging, any record named in a broken rule takes mine; if I don't have that record, it is marked `deleted`. That is also a conflict. History is the union of both sides; `nextHazardNumber` is the larger of the two; `reportDesign` merges as a single value.

- [ ] **Step 1: Write the random-edit helper**

`test/core/random-edits.js`:

```js
import { PivotError } from '../../src/core/errors.js';
import { createHazard, updateHazard, retireHazard, deleteHazard, restoreRecord, addCausalFactor, deleteCausalFactor } from '../../src/core/ops/hazards.js';
import { createControl, updateControl, retireControl, deleteControl, linkControl, unlinkControl } from '../../src/core/ops/controls.js';
import { createPlatform, linkHazard, unlinkHazard, setReportId, retirePlatform } from '../../src/core/ops/platforms.js';
import { confirmControl, excludeControl, resetControl, setRating } from '../../src/core/ops/assessment.js';

/** A small, seeded pseudo-random generator (mulberry32), so a failure can be replayed. @param {number} seed */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @template T @param {() => number} rand @param {T[]} xs @returns {T} */
const pick = (rand, xs) => xs[Math.floor(rand() * xs.length)];

/**
 * One random user action through the real ops. An action the ops refuse leaves the data as it was.
 * @param {import('../../src/core/data.js').Data} d @param {() => number} rand @param {{ by: string, at: string }} act
 */
export function randomEdit(d, rand, act) {
  const hz = Object.keys(d.records.hazard);
  const ct = Object.keys(d.records.control);
  const pl = Object.keys(d.records.platform);
  const cf = Object.keys(d.records.causalFactor);
  const n = () => String(Math.floor(rand() * 1000));
  const triple = () => ({ hazardId: pick(rand, hz), controlId: pick(rand, ct), platformId: pick(rand, pl) });
  const actions = [
    () => createHazard(d, act, { title: `Hazard ${n()}` }),
    () => updateHazard(d, act, { id: pick(rand, hz), title: `Title ${n()}` }),
    () => retireHazard(d, act, { id: pick(rand, hz) }),
    () => deleteHazard(d, act, { id: pick(rand, hz) }),
    () => restoreRecord(d, act, { kind: 'hazard', id: pick(rand, hz) }),
    () => addCausalFactor(d, act, { hazardId: pick(rand, hz), text: `Cause ${n()}` }),
    () => deleteCausalFactor(d, act, { id: pick(rand, cf) }),
    () => createControl(d, act, { title: `Control ${n()}` }),
    () => updateControl(d, act, { id: pick(rand, ct), title: `Control ${n()}` }),
    () => retireControl(d, act, { id: pick(rand, ct) }),
    () => deleteControl(d, act, { id: pick(rand, ct) }),
    () => linkControl(d, act, { hazardId: pick(rand, hz), controlId: pick(rand, ct), kind: pick(rand, ['preventative', 'mitigating']) }),
    () => unlinkControl(d, act, { hazardId: pick(rand, hz), controlId: pick(rand, ct) }),
    () => createPlatform(d, act, { name: `Platform ${n()}`, ownerId: act.by }),
    () => retirePlatform(d, act, { id: pick(rand, pl) }),
    () => linkHazard(d, act, { hazardId: pick(rand, hz), platformId: pick(rand, pl) }),
    () => unlinkHazard(d, act, { hazardId: pick(rand, hz), platformId: pick(rand, pl) }),
    () => setReportId(d, act, { hazardId: pick(rand, hz), platformId: pick(rand, pl), reportId: `R-${n()}` }),
    () => confirmControl(d, act, triple()),
    () => excludeControl(d, act, { ...triple(), reason: `Reason ${n()}` }),
    () => resetControl(d, act, triple()),
    () => setRating(d, act, { hazardId: pick(rand, hz), platformId: pick(rand, pl), stage: pick(rand, ['initial', 'residual']), consequence: 1 + Math.floor(rand() * 5), likelihood: pick(rand, [...'ABCDEFG']) }),
  ];
  try {
    return pick(rand, actions)();
  } catch (e) {
    if (e instanceof PivotError) return d;
    throw e;
  }
}
```

- [ ] **Step 2: Write the failing test**

`test/core/merge.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS } from '../../src/core/data.js';
import { sameJson } from '../../src/core/json.js';
import { mergeData } from '../../src/core/merge.js';
import { checkRules } from '../../src/core/rules.js';
import { updateHazard, retireHazard, createHazard, assignHazardNumbers } from '../../src/core/ops/hazards.js';
import { updateControl } from '../../src/core/ops/controls.js';
import { linkHazard } from '../../src/core/ops/platforms.js';
import { seed } from '../helpers.js';
import { prng, randomEdit } from './random-edits.js';

const me = { by: 'me', at: '2026-09-28T12:00:00+10:00' };
const them = { by: 'them', at: '2026-09-28T12:30:00+10:00' };
const saveAct = { by: 'me', at: '2026-09-28T13:00:00+10:00' };

test('changes to different records are all kept, with no conflict', () => {
  const base = assignHazardNumbers(seed());
  const mine = updateHazard(base, me, { id: 'h1', title: 'Mine' });
  const theirs = updateControl(base, them, { id: 'c1', title: 'Theirs' });
  const { data, conflicts } = mergeData(base, mine, theirs, saveAct);
  assert.equal(data.records.hazard.h1.title, 'Mine');
  assert.equal(data.records.control.c1.title, 'Theirs');
  assert.deepEqual(conflicts, []);
});

test('the same record changed by both: mine wins, and the conflict names whose edit lost', () => {
  const base = assignHazardNumbers(seed());
  const mine = updateHazard(base, me, { id: 'h1', title: 'Mine' });
  const theirs = updateHazard(base, them, { id: 'h1', title: 'Theirs' });
  const { data, conflicts } = mergeData(base, mine, theirs, saveAct);
  assert.equal(data.records.hazard.h1.title, 'Mine');
  assert.equal(conflicts.length, 1);
  assert.deepEqual({ ...conflicts[0], mine: undefined, theirs: undefined }, { kind: 'hazard', id: 'h1', reason: 'both-changed', overriddenBy: 'them', mine: undefined, theirs: undefined });
  assert.equal(conflicts[0].theirs.title, 'Theirs');
});

test('the same change made by both is not a conflict', () => {
  const base = assignHazardNumbers(seed());
  const mine = updateHazard(base, me, { id: 'h1', title: 'Same' });
  const theirs = updateHazard(base, { ...me, by: 'me' }, { id: 'h1', title: 'Same' });
  assert.deepEqual(mergeData(base, mine, theirs, saveAct).conflicts, []);
});

test('changes that break a rule together: mine wins, and their record is marked deleted', () => {
  const base = assignHazardNumbers(seed());
  const mine = retireHazard(base, me, { id: 'h2' });
  const theirs = linkHazard(base, them, { hazardId: 'h2', platformId: 'p1' });
  const { data, conflicts } = mergeData(base, mine, theirs, saveAct);
  assert.equal(data.records.hazard.h2.status, 'retired');
  assert.equal(data.records.hazardPlatform['hp:h2:p1'].status, 'deleted');
  assert.deepEqual(checkRules(data), []);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].reason, 'rule:hazard-not-live-on-platform');
  assert.equal(conflicts[0].kind, 'hazardPlatform');
  assert.equal(conflicts[0].overriddenBy, 'them');
});

test('history is the union of both sides; the hazard counter takes the larger', () => {
  const base = assignHazardNumbers(seed());
  const mine = createHazard(base, me, { id: 'mine-h', title: 'Mine' });
  const theirs = assignHazardNumbers(createHazard(base, them, { id: 'their-h', title: 'Theirs' }));
  const { data } = mergeData(base, mine, theirs, saveAct);
  for (const id of [...Object.keys(mine.history), ...Object.keys(theirs.history)]) assert.ok(data.history[id]);
  assert.equal(data.nextHazardNumber, theirs.nextHazardNumber);
  const numbered = assignHazardNumbers(data);
  assert.equal(numbered.records.hazard['their-h'].number, 3);
  assert.equal(numbered.records.hazard['mine-h'].number, 4);
});

test('the report design merges as one value', () => {
  const base = seed();
  const mine = { ...base, reportDesign: { a: 1 } };
  const theirs = { ...base, reportDesign: { b: 2 } };
  const { data, conflicts } = mergeData(base, mine, theirs, saveAct);
  assert.deepEqual(data.reportDesign, { a: 1 });
  assert.deepEqual(conflicts.map((c) => c.kind), ['reportDesign']);
  assert.deepEqual(mergeData(base, base, theirs, saveAct).data.reportDesign, { b: 2 });
});

test('random edits on both sides: the rules hold, one-sided changes survive, conflicts resolve to mine, numbers never repeat', () => {
  for (let s = 1; s <= 150; s++) {
    const rand = prng(s);
    let base = seed();
    for (let i = 0; i < 20; i++) base = randomEdit(base, rand, { by: 'setup', at: '2026-09-28T11:00:00+10:00' });
    base = assignHazardNumbers(base);
    let mine = base;
    for (let i = 0; i < 12; i++) mine = randomEdit(mine, rand, me);
    let theirs = base;
    for (let i = 0; i < 12; i++) theirs = randomEdit(theirs, rand, them);
    theirs = assignHazardNumbers(theirs);

    const { data, conflicts } = mergeData(base, mine, theirs, saveAct);
    assert.deepEqual(checkRules(data), [], `seed ${s}: rules`);
    const conflicted = new Set(conflicts.map((c) => `${c.kind}:${c.id}`));
    for (const kind of KINDS) {
      const ids = new Set([...Object.keys(base.records[kind]), ...Object.keys(mine.records[kind]), ...Object.keys(theirs.records[kind])]);
      for (const id of ids) {
        const b = base.records[kind][id]; const m = mine.records[kind][id]; const t = theirs.records[kind][id]; const r = data.records[kind][id];
        if (conflicted.has(`${kind}:${id}`)) {
          assert.ok(sameJson(r, m) || (!m && r.status === 'deleted'), `seed ${s}: ${kind} ${id} resolves to mine`);
        } else if (sameJson(b, m)) {
          assert.ok(sameJson(r, t), `seed ${s}: ${kind} ${id} takes theirs`);
        } else {
          assert.ok(sameJson(r, m), `seed ${s}: ${kind} ${id} takes mine`);
        }
      }
    }
    for (const id of [...Object.keys(mine.history), ...Object.keys(theirs.history)]) assert.ok(data.history[id], `seed ${s}: history kept`);
    const numbers = Object.values(assignHazardNumbers(data).records.hazard).map((h) => h.number).filter((x) => x != null);
    assert.equal(new Set(numbers).size, numbers.length, `seed ${s}: no hazard number repeats`);
  }
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test test/core/merge.test.js`
Expected: FAIL with `Cannot find module '.../src/core/merge.js'`.

- [ ] **Step 4: Write the implementation**

`src/core/merge.js`:

```js
import { KINDS, put } from './data.js';
import { PivotError } from './errors.js';
import { sameJson } from './json.js';
import { checkRules } from './rules.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Act} Act */
/**
 * @typedef {{ kind: string, id: string, reason: string, mine: any, theirs: any, overriddenBy: string | null }} Conflict
 */

/**
 * @template T
 * @param {T} b base @param {T} m mine @param {T} t theirs
 * @param {() => void} onConflict called when both sides changed it differently
 * @returns {T}
 */
function choose(b, m, t, onConflict) {
  const iChanged = !sameJson(b, m);
  const theyChanged = !sameJson(b, t);
  if (!iChanged) return t;
  if (!theyChanged || sameJson(m, t)) return m;
  onConflict();
  return m;
}

/**
 * Merge my working data with what another save put on disk since I loaded `base`. The
 * current save (mine) wins every conflict.
 * @param {Data} base the data as I loaded it @param {Data} mine my working data
 * @param {Data} theirs the data now on disk @param {Act} act the save being made
 * @returns {{ data: Data, conflicts: Conflict[] }}
 */
export function mergeData(base, mine, theirs, act) {
  /** @type {Map<string, Conflict>} */
  const conflicts = new Map();
  /** @type {Data['records']} */
  const records = {};
  for (const kind of KINDS) {
    const b = base.records[kind];
    const m = mine.records[kind];
    const t = theirs.records[kind];
    /** @type {Record<string, any>} */
    const out = {};
    for (const id of new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(t)])) {
      const picked = choose(b[id], m[id], t[id], () => conflicts.set(`${kind}:${id}`, {
        kind, id, reason: 'both-changed', mine: m[id] ?? null, theirs: t[id] ?? null, overriddenBy: t[id]?.updatedBy ?? null,
      }));
      if (picked !== undefined) out[id] = picked;
    }
    records[kind] = out;
  }
  const reportDesign = choose(base.reportDesign, mine.reportDesign, theirs.reportDesign, () => conflicts.set('reportDesign:reportDesign', {
    kind: 'reportDesign', id: 'reportDesign', reason: 'both-changed', mine: mine.reportDesign, theirs: theirs.reportDesign, overriddenBy: null,
  }));

  /** @type {Data} */
  let data = {
    records,
    nextHazardNumber: Math.max(theirs.nextHazardNumber, mine.nextHazardNumber),
    history: { ...theirs.history, ...mine.history },
    reportDesign: reportDesign ?? {},
  };

  // Two changes that were each fine can break a rule together. Each record in a broken rule
  // takes my version; a record I do not have is marked deleted. Repeat, since one fix can
  // expose another (a deleted hazard, then its causal factor).
  for (let pass = 0; pass < 10; pass++) {
    const violations = checkRules(data);
    if (violations.length === 0) return { data, conflicts: [...conflicts.values()] };
    for (const v of violations) {
      for (const { kind, id } of v.records) {
        const m = mine.records[kind][id];
        const cur = data.records[kind][id];
        if (sameJson(m, cur)) continue;
        if (!m && (!cur || cur.status === 'deleted')) continue;
        const key = `${kind}:${id}`;
        if (!conflicts.has(key)) {
          conflicts.set(key, { kind, id, reason: `rule:${v.rule}`, mine: m ?? null, theirs: cur ?? null, overriddenBy: cur?.updatedBy ?? null });
        }
        data = put(data, kind, m ?? { ...cur, status: 'deleted', updatedBy: act.by, updatedAt: act.at });
      }
    }
  }
  throw new PivotError('merge.rules', 'Your changes and the other saves could not be combined without breaking a rule. Nothing was saved.', { violations: checkRules(data) });
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `node --test test/core/merge.test.js`
Expected: PASS, 7 tests. If the random test fails, its message names the seed; replay that seed alone to debug it.

- [ ] **Step 6: Commit**

```bash
git add src/core/merge.js test/core/merge.test.js test/core/random-edits.js
git commit -m "Add the three-way merge: one-sided changes kept, conflicts to the current save, rules re-checked

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: File envelope, folder helpers and the test fakes

**Files:**
- Create: `test/fakes/folder.js` (copied from the archive), `test/fakes/storage.js`
- Create: `src/storage/envelope.js`, `src/storage/folder.js`
- Test: `test/storage/envelope.test.js`, `test/storage/folder.test.js`

**Interfaces:**
- Consumes: `canonicalJson` (Task 1), `SCHEMA_VERSION` (Task 3), `compactStamp`, `epochOf` (Task 1), `PivotError`.
- Produces:
  - `envelope.js`: `MARKER = 'pivot'`; `sha256Hex(text)`; `newStamp(profileId, at) -> { savedBy, savedAt, token }`; `sameStamp(a, b)`; `seal(kind, body, stamp, at)`; `serialize(envelope)`; `openEnvelope(text, kind) -> { ok: true, envelope } | { ok: false, reason, detail }`, with reasons `unreadable | not-pivot | wrong-version | wrong-kind | integrity`; `backupName(at)`; `BACKUP_RE`; `backupTime(name) -> epoch ms`; `supersededName(stamp)`.
  - `folder.js`: `readText(root, path) -> string | null`; `writeWhole(root, path, text)`, which creates folders and throws `PivotError('write-failed')` leaving any previous file intact; `listNames(root, dirPath) -> string[]`; `removeFile(root, path)`. Paths are `/`-separated and relative to the data folder.
  - `test/fakes/folder.js`: `MemoryFolder`, with `.handle`, `.read(rel)`, `.write(rel, text)`, `.exists(rel)`, `.list()`, `.remove(rel)`, `.failWrite(fn)`, `.denyRead(fn)`.
  - `test/fakes/storage.js`: `MemoryStorage`, with `getItem`, `setItem`, `removeItem`, `.fill()`, `.refuseReads()`.

- [ ] **Step 1: Copy the in-memory folder fake from the archive**

```bash
mkdir -p test/fakes
sed -n '60,518p' archive/hyperion/modules/store/conformance/harness.js > test/fakes/folder.js
node -e "import('./test/fakes/folder.js').then(m => console.log(typeof m.MemoryFolder))"
```
Expected output: `function`.

`test/fakes/storage.js`:

```js
/** An in-memory `localStorage` that can be made full, or refuse reads, as a real one can. */
export class MemoryStorage {
  constructor() {
    /** @type {Map<string, string>} */
    this.items = new Map();
    /** @type {Error | null} */
    this.setError = null;
    /** @type {Error | null} */
    this.getError = null;
  }
  /** @param {string} key */
  getItem(key) {
    if (this.getError) throw this.getError;
    return this.items.has(key) ? /** @type {string} */ (this.items.get(key)) : null;
  }
  /** @param {string} key @param {string} value */
  setItem(key, value) {
    if (this.setError) throw this.setError;
    this.items.set(key, String(value));
  }
  /** @param {string} key */
  removeItem(key) {
    this.items.delete(key);
  }
  fill() {
    this.setError = new DOMException('the quota has been exceeded', 'QuotaExceededError');
  }
  refuseReads() {
    this.getError = new DOMException('access to storage is denied', 'SecurityError');
  }
}
```

- [ ] **Step 2: Write the failing tests**

`test/storage/envelope.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seal, serialize, openEnvelope, newStamp, sameStamp, backupName, backupTime, BACKUP_RE, supersededName, sha256Hex } from '../../src/storage/envelope.js';
import { epochOf } from '../../src/core/time.js';

const at = '2026-09-28T10:00:00+10:00';

test('seal then open gives the body back', async () => {
  const stamp = newStamp('u1', at);
  const text = serialize(await seal('data', { b: 1, a: [2, 1] }, stamp, at));
  const opened = await openEnvelope(text, 'data');
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.envelope.body, { b: 1, a: [2, 1] });
  assert.deepEqual(opened.envelope.stamp, stamp);
  assert.equal(opened.envelope.schemaVersion, 2);
});

test('a file changed outside Pivot fails its integrity check', async () => {
  const text = serialize(await seal('data', { title: 'Fire' }, null, at));
  const opened = await openEnvelope(text.replace('Fire', 'Flood'), 'data');
  assert.deepEqual([opened.ok, opened.reason], [false, 'integrity']);
});

test('every other bad file is named for what is wrong with it', async () => {
  assert.equal((await openEnvelope('{not json', 'data')).reason, 'unreadable');
  assert.equal((await openEnvelope('{"hello":1}', 'data')).reason, 'not-pivot');
  const profiles = serialize(await seal('profiles', { profiles: {} }, null, at));
  assert.equal((await openEnvelope(profiles, 'data')).reason, 'wrong-kind');
  const old = JSON.parse(serialize(await seal('data', {}, null, at)));
  old.schemaVersion = 1;
  const r = await openEnvelope(JSON.stringify(old), 'data');
  assert.equal(r.reason, 'wrong-version');
  assert.match(r.detail, /earlier Pivot/);
  old.schemaVersion = 3;
  assert.match((await openEnvelope(JSON.stringify(old), 'data')).detail, /newer Pivot/);
});

test('stamps: fresh token each time; compared by all three parts', () => {
  const a = newStamp('u1', at);
  const b = newStamp('u1', at);
  assert.match(a.token, /^[0-9a-f]{32}$/);
  assert.notEqual(a.token, b.token);
  assert.ok(sameStamp(a, { ...a }));
  assert.ok(!sameStamp(a, b));
  assert.ok(sameStamp(null, null));
  assert.ok(!sameStamp(a, null));
});

test('file names sort by time and are legal on Windows', () => {
  assert.equal(backupName(at), 'data-20260928-100000.json');
  assert.ok(BACKUP_RE.test(backupName(at)));
  assert.equal(backupTime('data-20260928-100000.json'), epochOf(at));
  const s = { savedBy: 'u1', savedAt: at, token: 'abcdef0123456789abcdef0123456789' };
  assert.equal(supersededName(s), 'data-20260928-100000-abcdef01.json');
});

test('sha256Hex', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
```

`test/storage/folder.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { readText, writeWhole, listNames, removeFile } from '../../src/storage/folder.js';
import { PivotError } from '../../src/core/errors.js';

test('writeWhole creates folders as needed; readText reads back; missing is null', async () => {
  const f = new MemoryFolder();
  await writeWhole(f.handle, 'backups/a.json', 'one');
  assert.equal(await readText(f.handle, 'backups/a.json'), 'one');
  assert.equal(await readText(f.handle, 'nope.json'), null);
  assert.equal(await readText(f.handle, 'missing/dir.json'), null);
});

test('a failed write leaves the previous file whole, and no empty new file', async () => {
  const f = new MemoryFolder();
  f.write('data.json', 'before');
  f.failWrite((rel) => rel === 'data.json' || rel === 'new.json');
  await assert.rejects(() => writeWhole(f.handle, 'data.json', 'after'), (e) => e instanceof PivotError && e.code === 'write-failed');
  assert.equal(f.read('data.json'), 'before');
  await assert.rejects(() => writeWhole(f.handle, 'new.json', 'x'), PivotError);
  assert.equal(f.exists('new.json'), false);
});

test('listNames lists files in a folder, sorted; a missing folder is empty; removeFile removes', async () => {
  const f = new MemoryFolder();
  f.write('backups/b.json', '');
  f.write('backups/a.json', '');
  assert.deepEqual(await listNames(f.handle, 'backups'), ['a.json', 'b.json']);
  assert.deepEqual(await listNames(f.handle, 'Superseded Saves'), []);
  await removeFile(f.handle, 'backups/a.json');
  assert.deepEqual(await listNames(f.handle, 'backups'), ['b.json']);
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `node --test test/storage/envelope.test.js test/storage/folder.test.js`
Expected: FAIL with `Cannot find module '.../src/storage/envelope.js'`.

- [ ] **Step 4: Write the implementation**

`src/storage/envelope.js`:

```js
import { canonicalJson } from '../core/json.js';
import { SCHEMA_VERSION } from '../core/data.js';
import { compactStamp, epochOf } from '../core/time.js';

export const MARKER = 'pivot';

/** @typedef {{ savedBy: string, savedAt: string, token: string }} SaveStamp */
/** @typedef {'data' | 'profiles'} FileKind */
/**
 * @typedef {{ pivot: string, schemaVersion: number, kind: FileKind, writtenAt: string,
 *   stamp: SaveStamp | null, integrity: string, body: any }} Envelope
 */

/** @param {Uint8Array} bytes */
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** @param {string} text @returns {Promise<string>} */
export async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return hex(new Uint8Array(digest));
}

/** @param {string} profileId @param {string} at @returns {SaveStamp} */
export function newStamp(profileId, at) {
  return { savedBy: profileId, savedAt: at, token: hex(globalThis.crypto.getRandomValues(new Uint8Array(16))) };
}

/** @param {SaveStamp | null} a @param {SaveStamp | null} b */
export function sameStamp(a, b) {
  if (a === null || b === null) return a === b;
  return a.token === b.token && a.savedAt === b.savedAt && a.savedBy === b.savedBy;
}

/** @param {FileKind} kind @param {any} body @param {SaveStamp | null} stamp @param {string} at @returns {Promise<Envelope>} */
export async function seal(kind, body, stamp, at) {
  return { pivot: MARKER, schemaVersion: SCHEMA_VERSION, kind, writtenAt: at, stamp, integrity: await sha256Hex(canonicalJson(body)), body };
}

/** @param {Envelope} envelope */
export function serialize(envelope) {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

/**
 * Never throws for bad content: the caller names the file to the user.
 * @param {string} text @param {FileKind} kind
 * @returns {Promise<{ ok: boolean, envelope?: Envelope, reason?: string, detail?: string }>}
 */
export async function openEnvelope(text, kind) {
  let env;
  try {
    env = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'unreadable', detail: `it is not readable JSON (${e instanceof Error ? e.message : String(e)})` };
  }
  if (!env || typeof env !== 'object' || env.pivot !== MARKER) {
    return { ok: false, reason: 'not-pivot', detail: 'it is not a Pivot file' };
  }
  if (env.schemaVersion !== SCHEMA_VERSION) {
    const detail = typeof env.schemaVersion === 'number' && env.schemaVersion < SCHEMA_VERSION
      ? `it was written by an earlier Pivot (schema ${env.schemaVersion}), which this version does not read`
      : `it was written by a newer Pivot (schema ${String(env.schemaVersion)}); use that version`;
    return { ok: false, reason: 'wrong-version', detail };
  }
  if (env.kind !== kind) return { ok: false, reason: 'wrong-kind', detail: `it holds ${String(env.kind)}, not ${kind}` };
  if (!('body' in env) || typeof env.integrity !== 'string' || (await sha256Hex(canonicalJson(env.body))) !== env.integrity) {
    return { ok: false, reason: 'integrity', detail: 'it has been changed since Pivot wrote it' };
  }
  return { ok: true, envelope: env };
}

export const BACKUP_RE = /^data-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/;

/** @param {string} at */
export function backupName(at) {
  return `data-${compactStamp(at)}.json`;
}

/** @param {string} name a backup file name @returns {number} epoch ms */
export function backupTime(name) {
  const m = BACKUP_RE.exec(name);
  if (!m) throw new RangeError(`not a backup file name: ${name}`);
  return epochOf(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+10:00`);
}

/** The name another user's save is kept under: their save time and token. @param {SaveStamp} stamp */
export function supersededName(stamp) {
  return `data-${compactStamp(stamp.savedAt)}-${stamp.token.slice(0, 8)}.json`;
}
```

`src/storage/folder.js`:

```js
import { PivotError } from '../core/errors.js';

/** @typedef {FileSystemDirectoryHandle} Dir */

/** @param {unknown} e */
export function isNotFound(e) {
  return Boolean(e && typeof e === 'object' && /** @type {{ name?: string }} */ (e).name === 'NotFoundError');
}

/** @param {string} path */
function split(path) {
  const parts = path.split('/');
  return { dirs: parts.slice(0, -1), name: /** @type {string} */ (parts.at(-1)) };
}

/** @param {Dir} root @param {string[]} dirs @param {boolean} create @returns {Promise<Dir>} */
async function dirFor(root, dirs, create) {
  let d = root;
  for (const n of dirs) d = await d.getDirectoryHandle(n, { create });
  return d;
}

/** @param {Dir} root @param {string} path @returns {Promise<string | null>} null when there is no such file */
export async function readText(root, path) {
  const { dirs, name } = split(path);
  try {
    const d = await dirFor(root, dirs, false);
    const h = await d.getFileHandle(name);
    return await (await h.getFile()).text();
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

/**
 * Replace a file whole or not at all: the browser commits a writable stream on `close` and
 * discards it on `abort`. A file this call created is removed again if the write fails.
 * @param {Dir} root @param {string} path @param {string} text
 */
export async function writeWhole(root, path, text) {
  const { dirs, name } = split(path);
  /** @type {FileSystemWritableFileStream | null} */
  let w = null;
  let existed = true;
  /** @type {Dir | null} */
  let d = null;
  try {
    d = await dirFor(root, dirs, true);
    try {
      await d.getFileHandle(name);
    } catch (e) {
      if (!isNotFound(e)) throw e;
      existed = false;
    }
    const h = await d.getFileHandle(name, { create: true });
    w = await h.createWritable();
    await w.write(text);
    await w.close();
  } catch (e) {
    if (w) {
      try { await w.abort(); } catch { /* already closed or failed; nothing was committed */ }
    }
    if (d && !existed) {
      try { await d.removeEntry(name); } catch { /* the caller is told the write failed either way */ }
    }
    throw new PivotError('write-failed', `${path} could not be written.`, { path, cause: e instanceof Error ? e.message : String(e) });
  }
}

/** @param {Dir} root @param {string} dirPath @returns {Promise<string[]>} file names, sorted */
export async function listNames(root, dirPath) {
  try {
    const d = await dirFor(root, dirPath.split('/'), false);
    const out = [];
    for await (const [name, h] of /** @type {any} */ (d).entries()) if (h.kind === 'file') out.push(name);
    return out.sort();
  } catch (e) {
    if (isNotFound(e)) return [];
    throw e;
  }
}

/** @param {Dir} root @param {string} path */
export async function removeFile(root, path) {
  const { dirs, name } = split(path);
  const d = await dirFor(root, dirs, false);
  await d.removeEntry(name);
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `node --test test/storage/envelope.test.js test/storage/folder.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add test/fakes src/storage/envelope.js src/storage/folder.js test/storage
git commit -m "Add the sealed file envelope, whole-or-nothing folder writes, and the folder and storage fakes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Store: folder check, profiles and load

**Files:**
- Create: `src/storage/store.js`
- Test: `test/storage/store-open.test.js`

**Interfaces:**
- Consumes: Tasks 3 and 11.
- Produces:
  - `FILES = { data: 'data.json', profiles: 'profiles.json', backups: 'backups', superseded: 'Superseded Saves', files: 'files' }`.
  - `checkFolder(handle) -> { failed: [{ file, reason, detail }] }`. It checks `data.json` and `profiles.json` when present; reason `invalid` means `validateData` found problems.
  - `readProfiles(handle) -> Profile[]`, sorted by name ignoring case. A profile is `{ id, name, createdAt }`.
  - `createProfile(handle, name, clock) -> Profile`. It re-reads the file first; `PivotError('profile.duplicate')` if the name exists ignoring case.
  - `load(handle) -> { data, stamp }`. An empty folder gives `emptyData()` and `stamp: null`.
  - `dataFromText(text) -> Promise<Data>`.
  - The internal `readDisk(handle) -> { text, data, stamp }` is used by Task 13.
  - Error codes: `data.unreadable`, `data.invalid`, `profiles.unreadable`, `profile.duplicate`, `empty`.

- [ ] **Step 1: Write the failing test**

`test/storage/store-open.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { checkFolder, readProfiles, createProfile, load, FILES } from '../../src/storage/store.js';
import { seal, serialize, newStamp } from '../../src/storage/envelope.js';
import { emptyData } from '../../src/core/data.js';
import { fixedClock } from '../../src/core/time.js';

const at = '2026-09-28T10:00:00+10:00';
const clock = () => fixedClock(at);

test('an empty folder passes the check and loads as empty data with no stamp', async () => {
  const f = new MemoryFolder();
  assert.deepEqual(await checkFolder(f.handle), { failed: [] });
  const { data, stamp } = await load(f.handle);
  assert.deepEqual(data, emptyData());
  assert.equal(stamp, null);
});

test('the check names each file that fails, and why', async () => {
  const f = new MemoryFolder();
  f.write(FILES.data, serialize(await seal('data', { ...emptyData(), nextHazardNumber: 0 }, newStamp('u1', at), at)));
  f.write(FILES.profiles, '{ broken');
  const { failed } = await checkFolder(f.handle);
  assert.deepEqual(failed.map((x) => `${x.file}:${x.reason}`), ['data.json:invalid', 'profiles.json:unreadable']);
  await assert.rejects(() => load(f.handle), (e) => e.code === 'data.invalid');
});

test('load gives back the stored data and its stamp', async () => {
  const f = new MemoryFolder();
  const stamp = newStamp('u1', at);
  const body = { ...emptyData(), nextHazardNumber: 5 };
  f.write(FILES.data, serialize(await seal('data', body, stamp, at)));
  assert.deepEqual(await load(f.handle), { data: body, stamp });
});

test('profiles: created, listed by name, duplicates refused ignoring case, blank refused', async () => {
  const f = new MemoryFolder();
  assert.deepEqual(await readProfiles(f.handle), []);
  const zoe = await createProfile(f.handle, '  Zoe ', clock());
  await createProfile(f.handle, 'adam', clock());
  assert.equal(zoe.name, 'Zoe');
  assert.equal(zoe.createdAt, at);
  assert.deepEqual((await readProfiles(f.handle)).map((p) => p.name), ['adam', 'Zoe']);
  await assert.rejects(() => createProfile(f.handle, 'ZOE', clock()), (e) => e.code === 'profile.duplicate');
  await assert.rejects(() => createProfile(f.handle, '  ', clock()), (e) => e.code === 'empty');
});

test('a profile created by another copy since this one read the list is kept', async () => {
  const f = new MemoryFolder();
  await createProfile(f.handle, 'A', clock());
  const seenByB = await readProfiles(f.handle);
  await createProfile(f.handle, 'C', clock()); // another copy of Pivot, after B read the list
  await createProfile(f.handle, 'B', clock()); // B's create re-reads, so C survives
  assert.equal(seenByB.length, 1);
  assert.deepEqual((await readProfiles(f.handle)).map((p) => p.name), ['A', 'B', 'C']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/storage/store-open.test.js`
Expected: FAIL with `Cannot find module '.../src/storage/store.js'`.

- [ ] **Step 3: Write the implementation**

`src/storage/store.js` (first part; Tasks 13 and 14 add to this file):

```js
import { emptyData, validateData, needText } from '../core/data.js';
import { PivotError } from '../core/errors.js';
import { newId } from '../core/ids.js';
import { seal, serialize, openEnvelope } from './envelope.js';
import { readText, writeWhole } from './folder.js';

/** @typedef {import('../core/data.js').Data} Data */
/** @typedef {import('./envelope.js').SaveStamp} SaveStamp */
/** @typedef {import('../core/time.js').Clock} Clock */
/** @typedef {{ id: string, name: string, createdAt: string }} Profile */
/** @typedef {FileSystemDirectoryHandle} Dir */

export const FILES = Object.freeze({
  data: 'data.json',
  profiles: 'profiles.json',
  backups: 'backups',
  superseded: 'Superseded Saves',
  files: 'files',
});

/** @param {Dir} handle @returns {Promise<{ failed: { file: string, reason: string, detail: string }[] }>} */
export async function checkFolder(handle) {
  const failed = [];
  for (const [file, kind] of /** @type {const} */ ([[FILES.data, 'data'], [FILES.profiles, 'profiles']])) {
    let text;
    try {
      text = await readText(handle, file);
    } catch (e) {
      failed.push({ file, reason: 'unreadable', detail: e instanceof Error ? e.message : String(e) });
      continue;
    }
    if (text === null) continue;
    const opened = await openEnvelope(text, kind);
    if (!opened.ok) {
      failed.push({ file, reason: opened.reason, detail: opened.detail });
      continue;
    }
    if (kind === 'data') {
      const problems = validateData(opened.envelope.body);
      if (problems.length) failed.push({ file, reason: 'invalid', detail: problems.slice(0, 5).join('; ') });
    }
  }
  return { failed };
}

/** @param {string} text @returns {Promise<{ data: Data, stamp: SaveStamp | null }>} */
async function openData(text) {
  const opened = await openEnvelope(text, 'data');
  if (!opened.ok) throw new PivotError('data.unreadable', `This data file cannot be used: ${opened.detail}.`, { reason: opened.reason });
  const problems = validateData(opened.envelope.body);
  if (problems.length) throw new PivotError('data.invalid', `This data file cannot be used: ${problems[0]}.`, { problems });
  return { data: opened.envelope.body, stamp: opened.envelope.stamp };
}

/** A data file's text as a restore source: checked like data.json. @param {string} text */
export async function dataFromText(text) {
  return (await openData(text)).data;
}

/** @param {Dir} handle @returns {Promise<{ text: string | null, data: Data, stamp: SaveStamp | null }>} */
export async function readDisk(handle) {
  const text = await readText(handle, FILES.data);
  if (text === null) return { text: null, data: emptyData(), stamp: null };
  return { text, ...(await openData(text)) };
}

/** @param {Dir} handle */
export async function load(handle) {
  const { data, stamp } = await readDisk(handle);
  return { data, stamp };
}

/** @param {Dir} handle @returns {Promise<Profile[]>} */
export async function readProfiles(handle) {
  const text = await readText(handle, FILES.profiles);
  if (text === null) return [];
  const opened = await openEnvelope(text, 'profiles');
  if (!opened.ok) throw new PivotError('profiles.unreadable', `profiles.json cannot be used: ${opened.detail}.`);
  /** @type {Profile[]} */
  const profiles = Object.values(opened.envelope.body.profiles ?? {});
  return profiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/**
 * Re-reads the file and adds to it, so a profile someone else created a moment ago is kept.
 * @param {Dir} handle @param {string} name @param {Clock} clock @returns {Promise<Profile>}
 */
export async function createProfile(handle, name, clock) {
  const clean = needText(name, 'A profile name');
  const profiles = await readProfiles(handle);
  if (profiles.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
    throw new PivotError('profile.duplicate', `There is already a profile called ${clean}.`);
  }
  const at = clock.now();
  const profile = { id: newId(), name: clean, createdAt: at };
  const body = { profiles: Object.fromEntries([...profiles, profile].map((p) => [p.id, p])) };
  await writeWhole(handle, FILES.profiles, serialize(await seal('profiles', body, null, at)));
  return profile;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/storage/store-open.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/storage/store.js test/storage/store-open.test.js
git commit -m "Add the folder check, profiles, and loading the data file

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Store: saving with merge

**Files:**
- Modify: `src/storage/store.js` (add `save`)
- Test: `test/storage/store-save.test.js`

**Interfaces:**
- Consumes: `mergeData` (Task 10), `assignHazardNumbers` (Task 5), `recordOverride` (Task 4), `readDisk` (Task 12), envelope helpers (Task 11).
- Produces: `save(handle, session, profileId, clock, hooks?) -> SaveResult`.
  - `session = { base, working, loadedStamp }`.
  - `SaveResult = { data, stamp, merged: boolean, lastSavedBy: string | null, conflicts, supersededFile: string | null }`. After it returns, the caller sets `session = { base: data, working: data, loadedStamp: stamp }`.
  - `hooks.beforeWrite` is an optional async function called just before the final stamp re-check. It exists for tests only.
  - Error codes: `save.busy` after 3 attempts, plus anything `readDisk` or `writeWhole` throws. When `save` throws, nothing has been written to `data.json`.

- [ ] **Step 1: Write the failing test**

`test/storage/store-save.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { load, save, FILES } from '../../src/storage/store.js';
import { openEnvelope } from '../../src/storage/envelope.js';
import { fixedClock } from '../../src/core/time.js';
import { createHazard, updateHazard } from '../../src/core/ops/hazards.js';
import { createControl } from '../../src/core/ops/controls.js';
import { unseenOverrides } from '../../src/core/history.js';

const clock = () => fixedClock('2026-09-28T10:00:00+10:00');
const actOf = (by) => ({ by, at: '2026-09-28T10:00:00+10:00' });

/** @param {MemoryFolder} f */
async function open(f) {
  const { data, stamp } = await load(f.handle);
  return { base: data, working: data, loadedStamp: stamp };
}
/** @param {{ base: any }} s @param {any} result */
const after = (result) => ({ base: result.data, working: result.data, loadedStamp: result.stamp });

test('the first save writes data.json, numbers new hazards, and supersedes nothing', async () => {
  const f = new MemoryFolder();
  const s = await open(f);
  s.working = createHazard(s.working, actOf('a'), { id: 'h1', title: 'Fire' });
  const r = await save(f.handle, s, 'a', clock());
  assert.equal(r.merged, false);
  assert.equal(r.supersededFile, null);
  assert.equal(r.data.records.hazard.h1.number, 1);
  assert.equal(r.stamp.savedBy, 'a');
  const opened = await openEnvelope(/** @type {string} */ (f.read(FILES.data)), 'data');
  assert.ok(opened.ok);
  assert.deepEqual(opened.envelope.body, r.data);
  assert.deepEqual(f.list(), ['data.json']);
});

test('two users: both sets of changes are kept, and the older file goes to Superseded Saves', async () => {
  const f = new MemoryFolder();
  let a = await open(f);
  a.working = createHazard(a.working, actOf('a'), { id: 'h1', title: 'Fire' });
  a = after(await save(f.handle, a, 'a', clock()));
  let b = await open(f);

  b.working = createControl(b.working, actOf('b'), { id: 'c1', title: 'Sprinklers' });
  const bResult = await save(f.handle, b, 'b', clock());
  const bText = f.read(FILES.data);

  a.working = updateHazard(a.working, actOf('a'), { id: 'h1', title: 'Big fire' });
  const r = await save(f.handle, a, 'a', clock());
  assert.equal(r.merged, true);
  assert.equal(r.lastSavedBy, 'b');
  assert.deepEqual(r.conflicts, []);
  assert.equal(r.data.records.hazard.h1.title, 'Big fire');
  assert.equal(r.data.records.control.c1.title, 'Sprinklers');
  assert.equal(r.supersededFile, `Superseded Saves/data-20260928-100000-${bResult.stamp.token.slice(0, 8)}.json`);
  assert.equal(f.read(r.supersededFile), bText, 'the superseded copy is the file exactly as b left it');
});

test('a conflict: the current save wins, the saver is told, and the overridden user gets a notice', async () => {
  const f = new MemoryFolder();
  let a = await open(f);
  a.working = createHazard(a.working, actOf('a'), { id: 'h1', title: 'Fire' });
  a = after(await save(f.handle, a, 'a', clock()));
  const b = await open(f);
  b.working = updateHazard(b.working, actOf('b'), { id: 'h1', title: 'B title' });
  await save(f.handle, b, 'b', clock());
  a.working = updateHazard(a.working, actOf('a'), { id: 'h1', title: 'A title' });
  const r = await save(f.handle, a, 'a', clock());
  assert.equal(r.data.records.hazard.h1.title, 'A title');
  assert.deepEqual(r.conflicts.map((c) => `${c.kind}:${c.id}:${c.overriddenBy}`), ['hazard:h1:b']);
  const notices = unseenOverrides((await load(f.handle)).data, 'b');
  assert.equal(notices.length, 1);
  assert.equal(notices[0].items[0].theirs.title, 'B title');
});

test('hazards created by two users at once get different numbers', async () => {
  const f = new MemoryFolder();
  const a = await open(f);
  const b = await open(f);
  a.working = createHazard(a.working, actOf('a'), { id: 'ha', title: 'A' });
  b.working = createHazard(b.working, actOf('b'), { id: 'hb', title: 'B' });
  await save(f.handle, b, 'b', clock());
  const r = await save(f.handle, a, 'a', clock());
  assert.equal(r.data.records.hazard.hb.number, 1);
  assert.equal(r.data.records.hazard.ha.number, 2);
  assert.equal(r.data.nextHazardNumber, 3);
});

test('Review focus 1: another save lands between the merge and the write; the save notices and merges it too', async () => {
  const f = new MemoryFolder();
  let a = await open(f);
  a.working = createHazard(a.working, actOf('a'), { id: 'h1', title: 'Fire' });
  a = after(await save(f.handle, a, 'a', clock()));
  const b = await open(f);
  b.working = createControl(b.working, actOf('b'), { id: 'c-late', title: 'Late control' });
  a.working = updateHazard(a.working, actOf('a'), { id: 'h1', title: 'Big fire' });
  let planted = false;
  const r = await save(f.handle, a, 'a', clock(), {
    beforeWrite: async () => {
      if (planted) return;
      planted = true;
      await save(f.handle, b, 'b', clock());
    },
  });
  assert.equal(r.data.records.control['c-late'].title, 'Late control', 'the late save is merged, not overwritten');
  assert.equal(r.data.records.hazard.h1.title, 'Big fire');
  assert.equal((await load(f.handle)).stamp.token, r.stamp.token);
});

test('Review focus 2: data.json removed after loading does not read as "everything deleted"', async () => {
  const f = new MemoryFolder();
  let a = await open(f);
  a.working = createHazard(a.working, actOf('a'), { id: 'h1', title: 'Fire' });
  a = after(await save(f.handle, a, 'a', clock()));
  f.remove(FILES.data);
  a.working = updateHazard(a.working, actOf('a'), { id: 'h1', title: 'Big fire' });
  const r = await save(f.handle, a, 'a', clock());
  assert.equal(r.merged, false);
  assert.equal(r.data.records.hazard.h1.title, 'Big fire');
  assert.equal((await load(f.handle)).data.records.hazard.h1.title, 'Big fire');
});

test('a failed write leaves data.json exactly as it was', async () => {
  const f = new MemoryFolder();
  let a = await open(f);
  a.working = createHazard(a.working, actOf('a'), { id: 'h1', title: 'Fire' });
  a = after(await save(f.handle, a, 'a', clock()));
  const before = f.read(FILES.data);
  f.failWrite((rel) => rel === FILES.data);
  a.working = updateHazard(a.working, actOf('a'), { id: 'h1', title: 'Big fire' });
  await assert.rejects(() => save(f.handle, a, 'a', clock()), (e) => e.code === 'write-failed');
  assert.equal(f.read(FILES.data), before);
});

test('a data.json damaged on disk stops the save with nothing written', async () => {
  const f = new MemoryFolder();
  let a = await open(f);
  a = after(await save(f.handle, a, 'a', clock()));
  f.write(FILES.data, /** @type {string} */ (f.read(FILES.data)).replace('"nextHazardNumber": 1', '"nextHazardNumber": 9'));
  const damaged = f.read(FILES.data);
  await assert.rejects(() => save(f.handle, a, 'a', clock()), (e) => e.code === 'data.unreadable');
  assert.equal(f.read(FILES.data), damaged);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/storage/store-save.test.js`
Expected: FAIL with `does not provide an export named 'save'`.

- [ ] **Step 3: Write the implementation**

Add these imports to the top of `src/storage/store.js`, merging them with the existing import lines:

```js
import { mergeData } from '../core/merge.js';
import { assignHazardNumbers } from '../core/ops/hazards.js';
import { recordOverride } from '../core/history.js';
import { newStamp, sameStamp, supersededName } from './envelope.js';
```

Append to `src/storage/store.js`:

```js
/** @typedef {{ base: Data, working: Data, loadedStamp: SaveStamp | null }} Session */
/**
 * @typedef {{ data: Data, stamp: SaveStamp, merged: boolean, lastSavedBy: string | null,
 *   conflicts: import('../core/merge.js').Conflict[], supersededFile: string | null }} SaveResult
 */

const SAVE_ATTEMPTS = 3;

/**
 * Save the working data. If someone else saved since this session loaded, merge with what
 * they saved (the current save wins conflicts), keep their file under Superseded Saves, and
 * record any overridden edits for their owners to see.
 * @param {Dir} handle @param {Session} session @param {string} profileId @param {Clock} clock
 * @param {{ beforeWrite?: () => Promise<void> }} [hooks] tests only
 * @returns {Promise<SaveResult>}
 */
export async function save(handle, session, profileId, clock, hooks = {}) {
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
    const at = clock.now();
    const act = { by: profileId, at };
    const disk = await readDisk(handle);
    // A data.json that has vanished since loading is not "the other user deleted everything".
    const changedOnDisk = disk.text !== null && !sameStamp(disk.stamp, session.loadedStamp);
    let merged = session.working;
    /** @type {import('../core/merge.js').Conflict[]} */
    let conflicts = [];
    if (changedOnDisk) ({ data: merged, conflicts } = mergeData(session.base, session.working, disk.data, act));
    merged = assignHazardNumbers(merged);
    if (conflicts.length) merged = recordOverride(merged, act, conflicts);
    const stamp = newStamp(profileId, at);
    const text = serialize(await seal('data', merged, stamp, at));

    if (hooks.beforeWrite) await hooks.beforeWrite();
    const now = await readDisk(handle);
    if (!sameStamp(now.stamp, disk.stamp)) continue;

    let supersededFile = null;
    if (changedOnDisk && disk.stamp) {
      supersededFile = `${FILES.superseded}/${supersededName(disk.stamp)}`;
      await writeWhole(handle, supersededFile, /** @type {string} */ (disk.text));
    }
    await writeWhole(handle, FILES.data, text);
    return { data: merged, stamp, merged: changedOnDisk, lastSavedBy: changedOnDisk ? disk.stamp?.savedBy ?? null : null, conflicts, supersededFile };
  }
  throw new PivotError('save.busy', 'Other people kept saving while Pivot was saving. Nothing was saved; save again.');
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/storage/store-save.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/storage/store.js test/storage/store-save.test.js
git commit -m "Save with a per-record merge: other users' changes kept, conflicts to the current save, superseded copy kept

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Store: backups, restore and export; the unsaved-work mirror

**Files:**
- Modify: `src/storage/store.js` (add the functions below)
- Create: `src/storage/mirror.js`
- Test: `test/storage/store-backups.test.js`, `test/storage/mirror.test.js`

**Interfaces:**
- Consumes: Tasks 11 to 13; `MemoryStorage` fake.
- Produces:
  - `store.js`: `BACKUP_KEEP = 72`; `BACKUP_INTERVAL_MS = 3600000`; `backupIfDue(handle, data, clock) -> string | null` (the backup's name, or `null` if not due); `listBackups(handle) -> [{ name, at }]`, newest first, with `at` as an AEST timestamp; `readBackup(handle, name) -> Data`; `restore(handle, data, profileId, clock) -> { data, stamp, supersededFile }`, which replaces the data without merging; `writeExport(fileHandle, text)`, which throws `PivotError('export-failed')`.
  - `mirror.js`: `MIRROR_KEY = 'pivot.unsaved.v2'`; `writeMirror(storage, { folderName, base, working, loadedStamp }) -> string | null` (a warning message, or `null` on success); `readMirror(storage, folderName) -> mirror | null`; `clearMirror(storage)`; `hasUnsaved(session) -> boolean`.

- [ ] **Step 1: Write the failing tests**

`test/storage/store-backups.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { backupIfDue, listBackups, readBackup, restore, load, save, writeExport, FILES, BACKUP_KEEP } from '../../src/storage/store.js';
import { fixedClock } from '../../src/core/time.js';
import { emptyData } from '../../src/core/data.js';
import { createHazard } from '../../src/core/ops/hazards.js';

const HOUR = 3600_000;
const act = { by: 'a', at: '2026-09-28T10:00:00+10:00' };

test('a backup is written when none exists or the newest is more than an hour old, and not otherwise', async () => {
  const f = new MemoryFolder();
  const clock = fixedClock('2026-09-28T10:00:00+10:00');
  const data = createHazard(emptyData(), act, { id: 'h1', title: 'Fire' });
  assert.equal(await backupIfDue(f.handle, data, clock), 'data-20260928-100000.json');
  clock.advance(HOUR);
  assert.equal(await backupIfDue(f.handle, data, clock), null, 'exactly an hour: not yet');
  clock.advance(1000);
  assert.equal(await backupIfDue(f.handle, data, clock), 'data-20260928-110001.json');
  assert.deepEqual((await readBackup(f.handle, 'data-20260928-100000.json')).records.hazard.h1.title, 'Fire');
});

test('writing the 73rd backup deletes the oldest and only the oldest', async () => {
  const f = new MemoryFolder();
  const clock = fixedClock('2026-09-01T00:00:00+10:00');
  for (let i = 0; i < BACKUP_KEEP + 1; i++) {
    await backupIfDue(f.handle, emptyData(), clock);
    clock.advance(HOUR + 1000);
  }
  const names = f.list().filter((n) => n.startsWith('backups/'));
  assert.equal(names.length, BACKUP_KEEP);
  assert.ok(!names.includes('backups/data-20260901-000000.json'));
  const listed = await listBackups(f.handle);
  assert.equal(listed.length, BACKUP_KEEP);
  assert.ok(listed[0].at > listed[1].at, 'newest first');
});

test('restore replaces the stored data whole, keeps the replaced file, and loads back equal', async () => {
  const f = new MemoryFolder();
  const clock = fixedClock('2026-09-28T10:00:00+10:00');
  let s = { base: emptyData(), working: createHazard(emptyData(), act, { id: 'h1', title: 'Current' }), loadedStamp: null };
  const saved = await save(f.handle, s, 'a', clock);
  const current = f.read(FILES.data);
  const old = createHazard(emptyData(), act, { id: 'h0', title: 'Old' });
  const r = await restore(f.handle, old, 'a', clock);
  assert.equal(f.read(/** @type {string} */ (r.supersededFile)), current);
  assert.ok(r.supersededFile.includes(saved.stamp.token.slice(0, 8)));
  const back = await load(f.handle);
  assert.deepEqual(back.data, old);
  assert.equal(back.stamp.token, r.stamp.token);
});

test('writeExport writes the text to the chosen file', async () => {
  const f = new MemoryFolder();
  const h = await f.handle.getFileHandle('report.md', { create: true });
  await writeExport(h, '# Report\n');
  assert.equal(f.read('report.md'), '# Report\n');
});
```

`test/storage/mirror.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../fakes/storage.js';
import { writeMirror, readMirror, clearMirror, hasUnsaved, hasUnsavedRecords, MIRROR_KEY } from '../../src/storage/mirror.js';
import { emptyData } from '../../src/core/data.js';
import { createHazard } from '../../src/core/ops/hazards.js';

const act = { by: 'a', at: '2026-09-28T10:00:00+10:00' };
const base = emptyData();
const working = createHazard(base, act, { id: 'h1', title: 'Fire' });

test('the mirror keeps base, working and stamp for one folder', () => {
  const s = new MemoryStorage();
  assert.equal(writeMirror(s, { folderName: 'Pivot Data', base, working, loadedStamp: null }), null);
  const m = readMirror(s, 'Pivot Data');
  assert.deepEqual(m.working, working);
  assert.deepEqual(m.base, base);
  assert.equal(readMirror(s, 'Other Folder'), null);
  clearMirror(s);
  assert.equal(s.getItem(MIRROR_KEY), null);
});

test('Review focus 3: full or blocked storage gives a warning, never an exception', () => {
  const s = new MemoryStorage();
  s.fill();
  assert.match(writeMirror(s, { folderName: 'x', base, working, loadedStamp: null }), /not being kept/);
  s.refuseReads();
  assert.equal(readMirror(s, 'x'), null);
});

test('hasUnsaved compares working with base; hasUnsavedRecords ignores the report design', () => {
  assert.equal(hasUnsaved({ base, working: base }), false);
  assert.equal(hasUnsaved({ base, working }), true);
  const designed = { ...base, reportDesign: { titleBlock: true } };
  assert.equal(hasUnsaved({ base, working: designed }), true);
  assert.equal(hasUnsavedRecords({ base, working: designed }), false);
  assert.equal(hasUnsavedRecords({ base, working }), true);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/storage/store-backups.test.js test/storage/mirror.test.js`
Expected: FAIL with missing exports and a missing module.

- [ ] **Step 3: Write the implementation**

Add these imports to `src/storage/store.js`, merging them with the existing import lines:

```js
import { epochOf, formatAest, compactStamp } from '../core/time.js';
import { backupName, backupTime, BACKUP_RE } from './envelope.js';
import { listNames, removeFile } from './folder.js';
```

Append to `src/storage/store.js`:

```js
export const BACKUP_KEEP = 72;
export const BACKUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Write a backup of `data` if the newest backup is more than an hour old or there is none,
 * then keep only the newest 72.
 * @param {Dir} handle @param {Data} data @param {Clock} clock @returns {Promise<string | null>}
 */
export async function backupIfDue(handle, data, clock) {
  const names = (await listNames(handle, FILES.backups)).filter((n) => BACKUP_RE.test(n));
  const now = clock.now();
  const newest = names.at(-1);
  if (newest && epochOf(now) - backupTime(newest) <= BACKUP_INTERVAL_MS) return null;
  const name = backupName(now);
  await writeWhole(handle, `${FILES.backups}/${name}`, serialize(await seal('data', data, null, now)));
  const kept = [...new Set([...names, name])].sort();
  for (const old of kept.slice(0, Math.max(0, kept.length - BACKUP_KEEP))) await removeFile(handle, `${FILES.backups}/${old}`);
  return name;
}

/** @param {Dir} handle @returns {Promise<{ name: string, at: string }[]>} newest first */
export async function listBackups(handle) {
  const names = (await listNames(handle, FILES.backups)).filter((n) => BACKUP_RE.test(n));
  return names.reverse().map((name) => ({ name, at: formatAest(backupTime(name)) }));
}

/** @param {Dir} handle @param {string} name */
export async function readBackup(handle, name) {
  const text = await readText(handle, `${FILES.backups}/${name}`);
  if (text === null) throw new PivotError('not-found', `The backup ${name} is no longer there.`);
  return dataFromText(text);
}

/**
 * Replace the stored data with `data` (from a backup or a chosen file). The file it replaces
 * is kept under Superseded Saves first. Restore replaces; it does not merge.
 * @param {Dir} handle @param {Data} data @param {string} profileId @param {Clock} clock
 */
export async function restore(handle, data, profileId, clock) {
  const at = clock.now();
  const current = await readText(handle, FILES.data);
  let supersededFile = null;
  if (current !== null) {
    let stamp = null;
    try { stamp = (await readDisk(handle)).stamp; } catch { /* a damaged file is still kept, under a restore name */ }
    supersededFile = `${FILES.superseded}/${stamp ? supersededName(stamp) : `data-${compactStamp(at)}-restore.json`}`;
    await writeWhole(handle, supersededFile, current);
  }
  const stamp = newStamp(profileId, at);
  await writeWhole(handle, FILES.data, serialize(await seal('data', data, stamp, at)));
  return { data, stamp, supersededFile };
}

/** @param {FileSystemFileHandle} fileHandle @param {string} text */
export async function writeExport(fileHandle, text) {
  /** @type {FileSystemWritableFileStream | null} */
  let w = null;
  try {
    w = await fileHandle.createWritable();
    await w.write(text);
    await w.close();
  } catch (e) {
    if (w) {
      try { await w.abort(); } catch { /* nothing was committed */ }
    }
    throw new PivotError('export-failed', `${fileHandle.name} could not be written.`, { cause: e instanceof Error ? e.message : String(e) });
  }
}
```

`src/storage/mirror.js`:

```js
import { sameJson } from '../core/json.js';

/** One key per machine: one person uses Pivot per machine. */
export const MIRROR_KEY = 'pivot.unsaved.v2';

/**
 * @typedef {{ folderName: string, base: import('../core/data.js').Data, working: import('../core/data.js').Data,
 *   loadedStamp: import('./envelope.js').SaveStamp | null }} Mirror
 */

/** @param {Storage} storage @param {Mirror} mirror @returns {string | null} a warning, or null */
export function writeMirror(storage, mirror) {
  try {
    storage.setItem(MIRROR_KEY, JSON.stringify(mirror));
    return null;
  } catch (e) {
    return `Unsaved changes are not being kept in the browser (${e instanceof Error ? e.message : String(e)}). Save often.`;
  }
}

/** @param {Storage} storage @param {string} folderName @returns {Mirror | null} */
export function readMirror(storage, folderName) {
  try {
    const text = storage.getItem(MIRROR_KEY);
    if (!text) return null;
    const m = JSON.parse(text);
    return m && m.folderName === folderName ? m : null;
  } catch {
    return null;
  }
}

/** @param {Storage} storage */
export function clearMirror(storage) {
  try { storage.removeItem(MIRROR_KEY); } catch { /* nothing to clear */ }
}

/** @param {{ base: unknown, working: unknown }} session */
export function hasUnsaved(session) {
  return !sameJson(session.base, session.working);
}

/**
 * Whether any record differs from what is stored, leaving out the report design (a design
 * change does not make a report differ from the stored data it is produced from).
 * @param {{ base: { records: unknown }, working: { records: unknown } }} session
 */
export function hasUnsavedRecords(session) {
  return !sameJson(session.base.records, session.working.records);
}
```

- [ ] **Step 4: Run all storage tests to verify they pass**

Run: `node --test "test/storage/**/*.test.js"`
Expected: PASS, every storage test.

- [ ] **Step 5: Commit**

```bash
git add src/storage test/storage
git commit -m "Add hourly backups with a ring of 72, restore, export, and the unsaved-work mirror

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 15: Report snapshots and report records

**Files:**
- Create: `src/reports/classifications.js`, `src/reports/snapshot.js`, `src/core/ops/reports.js`
- Test: `test/reports/snapshot.test.js`

**Interfaces:**
- Consumes: `platformHazards`, `hazardDetail` (Task 9), `commit` (Task 4), `created`, `get` (Task 3), `sameJson` (Task 1).
- Produces:
  - `CLASSIFICATIONS = ['OFFICIAL', 'OFFICIAL: Sensitive', 'PROTECTED']`.
  - `buildSnapshot(data, platformId, { profileName, at, by, title, classification }) -> Snapshot`, a deep copy holding values only:
    `{ platformId, platformName, ownerName, producedAt, producedBy, title, classification, rows: [{ hazardId, number, reportId, title, description, causalFactors: string[], consequences: string[], controls: [{ title, kind, state, reason }], initial, residual }] }`.
  - `createReport(data, act, { id?, report }) -> Data`, where `report` is a Snapshot plus `markdown` and `html`.
  - `setReportDesign(data, design) -> Data`. A report design edit is not a record and writes no history; `data` comes back unchanged if the design is the same.

- [ ] **Step 1: Write the failing test**

`test/reports/snapshot.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot } from '../../src/reports/snapshot.js';
import { CLASSIFICATIONS } from '../../src/reports/classifications.js';
import { createReport, setReportDesign } from '../../src/core/ops/reports.js';
import { assignHazardNumbers, updateHazard } from '../../src/core/ops/hazards.js';
import { confirmControl, excludeControl, setRating } from '../../src/core/ops/assessment.js';
import { entries } from '../../src/core/history.js';
import { act, seed } from '../helpers.js';

const names = { u1: 'Ada', u2: 'Grace' };
const opts = { profileName: (id) => names[id] ?? id, at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'Alpha hazards', classification: 'OFFICIAL' };

function assessed() {
  let d = assignHazardNumbers(seed());
  d = confirmControl(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  d = excludeControl(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', reason: 'No crew' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', consequence: 1, likelihood: 'C' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 2, likelihood: 'C' });
  return d;
}

test('the marking list', () => {
  assert.deepEqual(CLASSIFICATIONS, ['OFFICIAL', 'OFFICIAL: Sensitive', 'PROTECTED']);
});

test('a snapshot holds the platform, and each of its hazards with everything a report shows', () => {
  const s = buildSnapshot(assessed(), 'p1', opts);
  assert.equal(s.platformName, 'Alpha');
  assert.equal(s.ownerName, 'Ada');
  assert.equal(s.producedAt, opts.at);
  assert.equal(s.classification, 'OFFICIAL');
  assert.equal(s.rows.length, 1);
  const r = s.rows[0];
  assert.deepEqual(
    { reportId: r.reportId, title: r.title, causalFactors: r.causalFactors, consequences: r.consequences, initial: r.initial, residual: r.residual },
    { reportId: 'H-0001', title: 'Fire', causalFactors: ['Hot works'], consequences: ['Burns'], initial: { consequence: 1, likelihood: 'C' }, residual: { consequence: 2, likelihood: 'C' } },
  );
  assert.deepEqual(r.controls, [
    { title: 'Sprinklers', kind: 'preventative', state: 'confirmed', reason: '' },
    { title: 'Fire drills', kind: 'mitigating', state: 'excluded', reason: 'No crew' },
  ]);
});

test('a snapshot does not change when the data does', () => {
  const d = assessed();
  const s = buildSnapshot(d, 'p1', opts);
  const copy = structuredClone(s);
  updateHazard(d, act, { id: 'h1', title: 'Renamed' });
  assert.deepEqual(s, copy);
  assert.notEqual(s.rows[0].controls, undefined);
});

test('a missing or deleted platform is refused', () => {
  assert.throws(() => buildSnapshot(assessed(), 'nope', opts), (e) => e.code === 'not-found');
});

test('createReport stores the report as a record reaching its platform; setReportDesign writes no history', () => {
  const d = assessed();
  const report = { ...buildSnapshot(d, 'p1', opts), markdown: '# x', html: '<p>x</p>' };
  const d2 = createReport(d, act, { id: 'r1', report });
  assert.equal(d2.records.report.r1.markdown, '# x');
  assert.equal(d2.records.report.r1.createdBy, 'u1');
  assert.deepEqual(entries(d2).at(-1).platforms, ['p1']);
  const d3 = setReportDesign(d2, { titleBlock: true });
  assert.deepEqual(d3.reportDesign, { titleBlock: true });
  assert.equal(Object.keys(d3.history).length, Object.keys(d2.history).length);
  assert.equal(setReportDesign(d3, { titleBlock: true }), d3);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/reports/snapshot.test.js`
Expected: FAIL with `Cannot find module '.../src/reports/snapshot.js'`.

- [ ] **Step 3: Write the implementation**

`src/reports/classifications.js`:

```js
/**
 * The protective markings a report design can carry, chosen from this list only (no free text,
 * so a marking cannot be mistyped). Change the list here.
 */
export const CLASSIFICATIONS = Object.freeze(['OFFICIAL', 'OFFICIAL: Sensitive', 'PROTECTED']);
```

`src/reports/snapshot.js`:

```js
import { get } from '../core/data.js';
import { PivotError } from '../core/errors.js';
import { platformHazards, hazardDetail } from '../core/queries.js';

/** @typedef {import('../core/data.js').Data} Data */
/**
 * @typedef {{ platformId: string, platformName: string, ownerName: string, producedAt: string, producedBy: string,
 *   title: string, classification: string, rows: SnapshotRow[] }} Snapshot
 * @typedef {{ hazardId: string, number: number | null, reportId: string, title: string, description: string,
 *   causalFactors: string[], consequences: string[], controls: { title: string, kind: string, state: string, reason: string }[],
 *   initial: any, residual: any }} SnapshotRow
 */

/**
 * A platform as a report shows it, as values rather than references, so a report stays what it
 * was when produced.
 * @param {Data} data @param {string} platformId
 * @param {{ profileName: (id: string) => string, at: string, by: string, title: string, classification: string }} o
 * @returns {Snapshot}
 */
export function buildSnapshot(data, platformId, o) {
  const platform = get(data, 'platform', platformId);
  if (!platform || platform.status === 'deleted') throw new PivotError('not-found', 'That platform no longer exists.');
  const rows = platformHazards(data, platformId).map((r) => {
    const d = /** @type {NonNullable<ReturnType<typeof hazardDetail>>} */ (hazardDetail(data, r.hazard.id));
    return {
      hazardId: r.hazard.id,
      number: r.hazard.number,
      reportId: r.reportId,
      title: r.hazard.title,
      description: r.hazard.description ?? '',
      causalFactors: d.causalFactors.map((x) => x.text),
      consequences: d.consequences.map((x) => x.text),
      controls: r.controls.map((c) => ({ title: c.control.title, kind: c.kind, state: c.state, reason: c.state === 'excluded' ? c.ruling?.reason ?? '' : '' })),
      initial: r.rating.initial,
      residual: r.rating.residual,
    };
  });
  return structuredClone({
    platformId, platformName: platform.name, ownerName: o.profileName(platform.ownerId),
    producedAt: o.at, producedBy: o.by, title: o.title, classification: o.classification, rows,
  });
}
```

`src/core/ops/reports.js`:

```js
import { newId } from '../ids.js';
import { created } from '../data.js';
import { commit } from '../apply.js';
import { sameJson } from '../json.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

/** @param {Data} data @param {Act} act @param {{ id?: string, report: Record<string, any> }} args */
export function createReport(data, act, { id = newId(), report }) {
  return commit(data, act, 'Produce report', [{ kind: 'report', rec: created(act, id, structuredClone(report)) }]);
}

/**
 * The DocGen design everyone shares. Not a record: saved, merged and backed up with the data,
 * but its edits (every tick in the designer) are not written to the history.
 * @param {Data} data @param {Record<string, any>} design
 */
export function setReportDesign(data, design) {
  const next = structuredClone(design ?? {});
  return sameJson(data.reportDesign, next) ? data : { ...data, reportDesign: next };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/reports/snapshot.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/reports/classifications.js src/reports/snapshot.js src/core/ops/reports.js test/reports/snapshot.test.js
git commit -m "Add report snapshots, report records, the shared report design, and the marking list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: DocGen: markings from the host, and default subject context

**Files:**
- Modify: `DocGen/doc-designer.js` (seven edits, each shown as old and new text)
- Modify: `DocGen/doc-designer.test.js` (three tests added)

**Interfaces:**
- Produces (DocGen host contract):
  - optional `host.classifications: string[]`;
  - `App.docStore.setClassification(marking)`, which takes a marking string, `''` for none, and refuses one not in the host's list;
  - `App.docSession.options().classification` is now the marking string or `''` (it was a boolean);
  - `App.docHost.context(subjectId, generatedUtc)` and `App.docHost.chosenMeta(subjectId, generatedUtc)` fall back to sensible defaults when the host doesn't define `subject.context` or `subject.chosenMeta`. Until now the designer's per-section preview failed with "subject.context is not a function" for any such host, the example page included.

- [ ] **Step 1: Write the failing tests**

In `DocGen/doc-designer.test.js`, inside the `CONF-1 a minimal foreign host generates a document` suite, add these three tests after the test named `'a host may name its subject, and the name must be a string'`:

```js
      s.test('CLS-2 the classification marking is one of the host\'s, chosen per design', function () {
        var host = mockHost();
        host.classifications = ['OFFICIAL', 'PROTECTED'];
        withHost(host, function () {
          T.assertDeepEqual(App.docHost.validate(host), []);
          T.assert(App.docStore.setClassification('PROTECTED').ok, 'a listed marking is accepted');
          T.assertEqual(App.docSession.options().classification, 'PROTECTED');
          T.assert(!App.docStore.setClassification('SECRET').ok, 'an unlisted marking is refused');
          T.assertEqual(App.docSession.options().classification, 'PROTECTED');
          T.assert(App.docStore.setClassification('').ok);
          T.assertEqual(App.docSession.options().classification, '');
        });
        host.classifications = ['OK', 3];
        T.assert(App.docHost.validate(host).some(function (e) { return /classifications/.test(e); }), 'a bad list is refused');
      });

      s.test('CLS-2 the designer offers None and each marking, with the saved one selected', function () {
        var host = mockHost();
        host.classifications = ['OFFICIAL', 'OFFICIAL: Sensitive'];
        withHost(host, function () {
          App.docStore.setClassification('OFFICIAL: Sensitive');
          var RD = App.ui.views.reportDesign;
          RD.open(); RD.pane('headerfooter');
          var html = RD.render(host.getState());
          RD.close();
          T.assert(/<select data-rd-classification/.test(html), 'no marking select');
          T.assert(/<option value="">None<\/option>/.test(html), 'no None option');
          T.assert(/<option value="OFFICIAL: Sensitive" selected>/.test(html), 'the saved marking is not selected');
        });
      });

      s.test('HOST-2 the section preview works for a host with no subject.context or chosenMeta', function () {
        var host = mockHost();
        withHost(host, function () {
          var RD = App.ui.views.reportDesign;
          RD.open(); RD.pane('section'); RD.select('staff');
          var html = RD.render(host.getState());
          RD.close();
          T.assertEqual(html.indexOf('Preview failed'), -1, 'the preview failed');
          T.assert(html.indexOf('Ada') !== -1, 'the preview does not show the rows');
        });
      });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node DocGen/doc-designer.test.js`
Expected: `FAIL` lines for the three new tests (`setClassification('PROTECTED')` stores `true`, no `<select data-rd-classification`, and `Preview failed: H(...).subject.context is not a function`), ending `FAIL 146 passed, 3 failed`.

- [ ] **Step 3: Make the seven edits**

1. First line of `DocGen/doc-designer.js`: add a line before everything else, so the type check of `src/` does not try to type-check DocGen:

```js
// @ts-nocheck
```

2. In `App.docHost`'s `validate`, find:

```js
        if (host.subject.noun !== undefined && typeof host.subject.noun !== 'string') {
          errs.push('host.subject.noun must be a string');
        }
      }
```

and replace it with:

```js
        if (host.subject.noun !== undefined && typeof host.subject.noun !== 'string') {
          errs.push('host.subject.noun must be a string');
        }
      }
      // CLS-2: the markings a design may carry. The host's vocabulary, never free text.
      if (host.classifications !== undefined && !(Array.isArray(host.classifications) &&
          host.classifications.every(function (c) { return typeof c === 'string' && c.trim() !== ''; }))) {
        errs.push('host.classifications must be an array of non-empty strings');
      }
```

3. In the same module, find:

```js
    App.docHost = { set: set, get: get, validate: validate, sections: sections, log: log };
```

and replace it with:

```js
    /** HOST-2: the run context a section is filled with: the host's, or the subject and the time. */
    function subjectContext(subjectId, generatedUtc) {
      var sj = _host && _host.subject;
      if (sj && typeof sj.context === 'function') return sj.context(subjectId, generatedUtc);
      return { subjectId: subjectId, generatedUtc: generatedUtc };
    }

    /** HOST-2 / META-1: the subject's metadata rows this design keeps: the host's, or meta() less the unticked. */
    function chosenMeta(subjectId, generatedUtc) {
      var sj = _host && _host.subject;
      if (sj && typeof sj.chosenMeta === 'function') return sj.chosenMeta(subjectId, generatedUtc);
      if (!sj || typeof sj.meta !== 'function') return [];
      var chosen = (((_host.getState() || {}).report) || {}).meta || {};
      return (sj.meta(subjectId) || []).filter(function (r) { return chosen[r.id] !== false; });
    }

    App.docHost = { set: set, get: get, validate: validate, sections: sections, log: log,
                    context: subjectContext, chosenMeta: chosenMeta };
```

4. In `sessionOptions`, find:

```js
        classification: bag.classification === true
```

and replace it with:

```js
        classification: typeof bag.classification === 'string' ? bag.classification : ''
```

5. In `App.docStore`, find:

```js
     * CLS-1: whether the report carries the OFFICIAL: Sensitive banner on every page.
```

and replace it with:

```js
     * CLS-1 / CLS-2: the classification marking the report carries on every page: one of the
     * host's `classifications`, or none ('').
```

Then find:

```js
    function setClassification(on) { return setReportSwitch('classification', on); }
```

and replace it with:

```js
    function setClassification(marking) {
      if (!P()) return errNoProject();
      var text = marking == null ? '' : String(marking);
      var allowed = App.docHost.get().classifications || [];
      if (text && allowed.indexOf(text) === -1) {
        return err('"' + text + '" is not one of the classification markings this application offers.', 'classification');
      }
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        if (text) b.classification = text; else delete b.classification;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }
```

6. In `paneHeaderFooter`, find:

```js
      var banner = '<div class="rd-fieldset"><strong>Classification banner</strong>' +
        // CLS-1: read from the project, like the title block — not from the session.
        cb('data-rd-classification', 'OFFICIAL: Sensitive on every page',
          ((project.report || {}).classification === true)) +
```

and replace it with:

```js
      var marking = (project.report || {}).classification;
      var markings = H().classifications || [];
      var banner = '<div class="rd-fieldset"><strong>Classification banner</strong>' +
        // CLS-1: read from the project, like the title block, not from the session. CLS-2: the
        // choices are the host's; there is no free text, so a marking cannot be mistyped.
        '<label class="rd-lab">Marking on every page <select data-rd-classification aria-label="Classification marking">' +
          '<option value=""' + (marking ? '' : ' selected') + '>None</option>' +
          markings.map(function (m) {
            return '<option value="' + esc(m) + '"' + (m === marking ? ' selected' : '') + '>' + esc(m) + '</option>';
          }).join('') +
        '</select></label>' +
```

In the wiring for that select, find:

```js
        quietly(function () { logIssues(App.docStore.setClassification(el.checked)); });
```

and replace it with:

```js
        quietly(function () { logIssues(App.docStore.setClassification(el.value)); });
```

In `pagedPaper`, find:

```js
      var hf = App.docFormat.headerFooter(f, { classification: opts().classification ? 'OFFICIAL: Sensitive' : '' });
```

and replace it with:

```js
      var hf = App.docFormat.headerFooter(f, { classification: opts().classification || '' });
```

7. Replace both occurrences of `H().subject.context(selId, generatedUtc)` with `App.docHost.context(selId, generatedUtc)`, and both occurrences of `H().subject.chosenMeta(selId, generatedUtc)` with `App.docHost.chosenMeta(selId, generatedUtc)`:

```bash
sed -i 's/H()\.subject\.context(selId, generatedUtc)/App.docHost.context(selId, generatedUtc)/g; s/H()\.subject\.chosenMeta(selId, generatedUtc)/App.docHost.chosenMeta(selId, generatedUtc)/g' DocGen/doc-designer.js
grep -c 'App.docHost.context(selId\|App.docHost.chosenMeta(selId' DocGen/doc-designer.js
```

Expected output: `4`.

- [ ] **Step 4: Run the DocGen suite to verify it passes**

Run: `node DocGen/doc-designer.test.js`
Expected: `OK 149 passed, 0 failed, 22 suites`.

- [ ] **Step 5: Update the example host**

In `DocGen/example.html`, add a marking list to the host so the new select has choices. Find:

```js
    clock: { nowIso: function () { return new Date().toISOString(); } },
```

and replace it with:

```js
    clock: { nowIso: function () { return new Date().toISOString(); } },
    // The markings the designer offers (none is always an option too).
    classifications: ['OFFICIAL', 'OFFICIAL: Sensitive', 'PROTECTED'],
```

In the same file's `build`, find:

```js
        filename: o.filename, tags: o.tags,
```

and replace it with:

```js
        filename: o.filename, tags: o.tags, classification: o.classification,
```

In `generate(format)`, find:

```js
    if (format === 'html') doc = App.docGen.emitHtml(host, doc, { title: 'Platform team roster' });
```

and replace it with:

```js
    if (format === 'html') doc = App.docGen.emitHtml(host, doc, { title: 'Platform team roster', classification: App.docSession.options().classification });
```

- [ ] **Step 6: Commit**

```bash
git add DocGen
git commit -m "DocGen: markings chosen per design from the host's list; default subject context so section previews work for any host

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: The DocGen host and report production

**Files:**
- Create: `src/reports/docgen-host.js`
- Test: `test/reports/docgen-host.test.js`

**Interfaces:**
- Consumes: `App` from `DocGen/doc-designer.js` (Task 16 contract), `buildSnapshot`, `CLASSIFICATIONS` (Task 15), `live` (Task 3), `formatRating` (Task 2), `toIsoUtc`, `aestDate` (Task 1).
- Produces: `createDocHost({ getData, setDesign, clock, profileName }) -> { host, produce(platformId, { at, by, title }) }`.
  - `host` is a valid DocGen host. It has `subject.noun = 'platform'`; the three sections `hazards`, `controls` and `causes`; and `classifications` set to Pivot's list.
  - `produce` makes `host` the active DocGen host, builds a snapshot with the design's current marking, renders both documents, and returns `{ report: Snapshot & { markdown, html }, markdownName, htmlName }`.
  - `reportFileBase(report) -> string` gives a safe file name stem.

- [ ] **Step 1: Write the failing test**

`test/reports/docgen-host.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';
import { createDocHost, reportFileBase } from '../../src/reports/docgen-host.js';
import { fixedClock } from '../../src/core/time.js';
import { assignHazardNumbers, updateHazard } from '../../src/core/ops/hazards.js';
import { confirmControl, setRating } from '../../src/core/ops/assessment.js';
import { setReportDesign } from '../../src/core/ops/reports.js';
import { act, seed } from '../helpers.js';

function setup(mutate = (d) => d) {
  let data = assignHazardNumbers(seed());
  data = confirmControl(data, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  data = setRating(data, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 2, likelihood: 'C' });
  data = mutate(data);
  const box = { data };
  const docs = createDocHost({
    getData: () => box.data,
    setDesign: (design) => { box.data = setReportDesign(box.data, design); },
    clock: fixedClock('2026-09-28T15:00:00+10:00'),
    profileName: (id) => ({ u1: 'Ada', u2: 'Grace' })[id] ?? id,
  });
  App.docHost.set(docs.host);
  return { box, docs };
}

test('the host is a valid DocGen host about platforms, offering Pivot\'s markings', () => {
  const { docs } = setup();
  assert.deepEqual(App.docHost.validate(docs.host), []);
  assert.equal(docs.host.subject.noun, 'platform');
  assert.deepEqual(docs.host.subject.list().map((p) => p.label), ['Alpha', 'Bravo']);
  assert.deepEqual(docs.host.classifications, ['OFFICIAL', 'OFFICIAL: Sensitive', 'PROTECTED']);
  assert.deepEqual(docs.host.sections(null).map((s) => s.id), ['hazards', 'controls', 'causes']);
});

test('design changes made in the designer land in Pivot\'s data', () => {
  const { box } = setup();
  assert.ok(App.docStore.setClassification('PROTECTED').ok);
  assert.equal(box.data.reportDesign.classification, 'PROTECTED');
});

test('produce: a report with its markdown and html, carrying the marking and the platform\'s hazards', () => {
  const { box, docs } = setup();
  App.docStore.setClassification('OFFICIAL: Sensitive');
  const { report, markdownName, htmlName } = docs.produce('p1', { at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'Alpha hazards' });
  assert.equal(report.classification, 'OFFICIAL: Sensitive');
  assert.equal(report.rows.length, 1);
  for (const text of ['H-0001', 'Fire', 'Sprinklers', '2C = Serious', 'Hot works', 'Burns']) {
    assert.ok(report.markdown.includes(text), `markdown lacks ${text}`);
    assert.ok(report.html.includes(text), `html lacks ${text}`);
  }
  assert.ok(report.markdown.includes('OFFICIAL: Sensitive'), 'the marking reaches the PDF header');
  assert.match(report.html, /class="doc-banner">OFFICIAL: Sensitive</);
  assert.equal(markdownName, 'Alpha-2026-09-28.md');
  assert.equal(htmlName, 'Alpha-2026-09-28.html');
  assert.equal(reportFileBase(report), 'Alpha-2026-09-28');
  assert.ok(box.data, 'data untouched by producing');
});

test('Review focus 4: markup in a hazard title is shown literally in the html, never run', () => {
  const { docs } = setup((d) => updateHazard(d, act, { id: 'h1', title: '<script>alert(1)</script> & "quotes" | *stars*' }));
  const { report } = docs.produce('p1', { at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'T' });
  assert.equal(report.html.includes('<script>alert(1)</script>'), false);
  assert.ok(report.html.includes('&lt;script&gt;'));
  assert.equal(report.rows[0].title, '<script>alert(1)</script> & "quotes" | *stars*');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/reports/docgen-host.test.js`
Expected: FAIL with `Cannot find module '.../src/reports/docgen-host.js'`.

- [ ] **Step 3: Write the implementation**

`src/reports/docgen-host.js`:

```js
import { App } from '../../DocGen/doc-designer.js';
import { CLASSIFICATIONS } from './classifications.js';
import { buildSnapshot } from './snapshot.js';
import { live } from '../core/data.js';
import { formatRating } from '../core/matrix.js';
import { toIsoUtc, aestDate } from '../core/time.js';

/** @typedef {import('./snapshot.js').Snapshot} Snapshot */

/** @param {{ platformName: string, producedAt: string }} s */
export function reportFileBase(s) {
  return `${s.platformName}-${aestDate(s.producedAt)}`.replace(/[^A-Za-z0-9._-]+/g, '-');
}

/** @param {Snapshot} s */
function metaRows(s) {
  const rows = [
    { id: 'platform', label: 'Platform', value: s.platformName, code: false },
    { id: 'owner', label: 'Owner', value: s.ownerName, code: false },
    { id: 'hazards', label: 'Hazards', value: String(s.rows.length), code: false },
  ];
  if (s.producedBy) rows.push({ id: 'produced', label: 'Produced', value: aestDate(s.producedAt), code: false });
  return rows;
}

/**
 * The report's tables, declared for DocGen. Unbound (no snapshot) they have no rows, which is
 * all the designer needs to draw a section it is not generating.
 * @param {Snapshot | null} s
 */
function sectionsFor(s) {
  /** @param {(s: Snapshot) => any[]} f */
  const rows = (f) => () => (s ? f(s) : []);
  const hazardKey = { id: '_key', label: 'Hazard', w: 3, get: (/** @type {any} */ r) => r.reportId };
  return [
    {
      id: 'hazards', label: 'Hazards',
      keyColumn: { id: '_key', label: 'ID', w: 3, get: (/** @type {any} */ r) => r.reportId },
      columns: [
        { id: 'title', label: 'Hazard', w: 6, get: (/** @type {any} */ r) => r.title },
        { id: 'initial', label: 'Initial risk', w: 3, get: (/** @type {any} */ r) => formatRating(r.initial) },
        { id: 'residual', label: 'Residual risk', w: 3, get: (/** @type {any} */ r) => formatRating(r.residual) },
        { id: 'description', label: 'Description', w: 6, optional: true, get: (/** @type {any} */ r) => r.description },
      ],
      rows: rows((x) => x.rows),
    },
    {
      id: 'controls', label: 'Controls',
      keyColumn: hazardKey,
      columns: [
        { id: 'control', label: 'Control', w: 5, get: (/** @type {any} */ r) => r.title },
        { id: 'kind', label: 'Kind', w: 2, get: (/** @type {any} */ r) => r.kind },
        { id: 'state', label: 'State', w: 2, get: (/** @type {any} */ r) => r.state },
        { id: 'reason', label: 'Reason excluded', w: 4, optional: true, get: (/** @type {any} */ r) => r.reason },
      ],
      rows: rows((x) => x.rows.flatMap((h) => h.controls.map((c) => ({ reportId: h.reportId, ...c })))),
    },
    {
      id: 'causes', label: 'Causal factors and consequences',
      keyColumn: hazardKey,
      columns: [
        { id: 'type', label: 'Type', w: 2, get: (/** @type {any} */ r) => r.type },
        { id: 'text', label: 'Description', w: 8, get: (/** @type {any} */ r) => r.text },
      ],
      rows: rows((x) => x.rows.flatMap((h) => [
        ...h.causalFactors.map((text) => ({ reportId: h.reportId, type: 'Causal factor', text })),
        ...h.consequences.map((text) => ({ reportId: h.reportId, type: 'Consequence', text })),
      ])),
    },
  ];
}

/**
 * @param {{ getData: () => import('../core/data.js').Data, setDesign: (design: Record<string, any>) => void,
 *   clock: import('../core/time.js').Clock, profileName: (id: string) => string }} ctx
 */
export function createDocHost(ctx) {
  /** @type {Snapshot | null} set only while a report is being produced */
  let producing = null;
  /** @param {string} platformId */
  const snapshotFor = (platformId) => (producing && producing.platformId === platformId
    ? producing
    : buildSnapshot(ctx.getData(), platformId, { profileName: ctx.profileName, at: ctx.clock.now(), by: '', title: '', classification: '' }));

  const host = {
    getState: () => ({ report: structuredClone(ctx.getData().reportDesign) }),
    /** @param {(state: { report?: Record<string, any> }) => void} mutator */
    commit(mutator) {
      const state = { report: structuredClone(ctx.getData().reportDesign) };
      mutator(state);
      ctx.setDesign(state.report ?? {});
    },
    clock: { nowIso: () => toIsoUtc(ctx.clock.now()) },
    classifications: [...CLASSIFICATIONS],
    subject: {
      noun: 'platform',
      metaLabel: 'About this platform',
      list: () => live(ctx.getData(), 'platform').map((p) => ({ id: p.id, label: p.name })),
      ready: () => true,
      /** @param {string} id */
      meta: (id) => metaRows(snapshotFor(id)),
    },
    /** @param {{ subjectId?: string } | null} run */
    sections: (run) => sectionsFor(run && run.subjectId ? snapshotFor(run.subjectId) : null),
  };

  return {
    host,
    /**
     * @param {string} platformId @param {{ at: string, by: string, title: string }} o
     */
    produce(platformId, { at, by, title }) {
      App.docHost.set(host);
      const options = App.docSession.options();
      const snapshot = buildSnapshot(ctx.getData(), platformId, { profileName: ctx.profileName, at, by, title, classification: options.classification || '' });
      producing = snapshot;
      try {
        const o = { ...options, subjectId: platformId };
        const utc = toIsoUtc(at);
        const blocks = App.docGen.reportBlocks(host, o).filter((/** @type {any} */ b) => b.included);
        const meta = App.docHost.chosenMeta(platformId, utc);
        const prepared = blocks.map((/** @type {any} */ b) => App.docGen.sectionContent(host, b, o, App.docHost.context(platformId, utc), meta));
        const base = reportFileBase(snapshot);
        const md = App.docGen.emitDocument(host, prepared, {
          title, date: aestDate(at), classification: snapshot.classification,
          filename: o.filename, tags: o.tags, logicalName: `${base}.md`, fallbackName: `${base}.md`,
        });
        const html = App.docGen.emitHtml(host, md, { title, classification: snapshot.classification });
        return { report: { ...snapshot, markdown: md.text, html: html.text }, markdownName: md.name, htmlName: html.name };
      } finally {
        producing = null;
      }
    },
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/reports/docgen-host.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/reports/docgen-host.js test/reports/docgen-host.test.js
git commit -m "Add the DocGen host: platform subject, report tables, marking list, and report production

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 18: The app controller: opening, profiles, recovery, notices, edits, saving

**Files:**
- Create: `src/ui/names.js`, `src/ui/controller.js`
- Test: `test/ui/controller.test.js`

**Interfaces:**
- Consumes: `store` (Tasks 12 to 14), `mirror` (Task 14), every op (Tasks 5 to 8), `unseenOverrides`, `markNoticesSeen`, `entries` (Task 4), `setReportDesign` (Task 15), `createDocHost` (Task 17), DocGen `App`.
- Produces:
  - `names.js`: `KIND_LABEL`, `recordName(kind, rec)`, `profileName(state, id)`, `when(ts)` (`YYYY-MM-DD HH:mm`).
  - `controller.js`: `createController(env) -> { getState(), dispatch(action) -> Promise<void>, subscribe(fn) }`.
    - `env = { clock, storage, pickFolder(), pickSaveFile(name), pickOpenFile() -> text }`.
    - Actions are `{ type, ...args }`. Every op in `EDITS` is an action, with the same argument names as the op.
    - Other actions: `chooseFolder`, `continueFromCheck`, `createProfile { name }`, `selectProfile { id }`, `recover`, `discardRecovery`, `dismissNotices`, `dismissMessage`, `go { view, id?, hazardId?, platformId? }`, `save`, `setFilter { list, field, value }`. Task 19 adds `openDesigner`, `produceReport`, `downloadReport`, `generateFromDesigner`, `showBackups`, `prepareRestore`, `prepareRestoreFromFile`, `confirmRestore` and `cancelRestore`.
  - State shape: `{ screen: 'open'|'check'|'profile'|'recover'|'notices'|'main', folderName, check, profiles, profileId, dataBlocked, session, recoverable, notices, view: { name, id?, hazardId?, platformId? }, filters: { hazards, controls }, backups, pendingRestore, message: { kind, text, items? } | null, warnings: string[], busy, designerRevision }`.
  - Errors: a `PivotError` becomes `message = { kind: 'error', text }`. A picker the user cancels (`AbortError`) shows nothing. Anything else is shown as a bug message, and the working data is kept.

- [ ] **Step 1: Write the failing test**

`test/ui/controller.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { load, FILES } from '../../src/storage/store.js';

/** @param {MemoryFolder} folder @param {MemoryStorage} [storage] */
function env(folder, storage = new MemoryStorage()) {
  return {
    clock: fixedClock('2026-09-28T10:00:00+10:00'),
    storage,
    pickFolder: async () => folder.handle,
    pickSaveFile: async (name) => folder.handle.getFileHandle(name, { create: true }),
    pickOpenFile: async () => { throw new DOMException('cancelled', 'AbortError'); },
  };
}

/** Open the folder as `name`, creating the profile if needed. */
async function openAs(c, name) {
  await c.dispatch({ type: 'chooseFolder' });
  let p = c.getState().profiles.find((x) => x.name === name);
  if (!p) {
    await c.dispatch({ type: 'createProfile', name });
    p = c.getState().profiles.find((x) => x.name === name);
  }
  await c.dispatch({ type: 'selectProfile', id: p.id });
  return p.id;
}

test('open an empty folder, create a profile, add a hazard, save', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  assert.equal(c.getState().screen, 'open');
  await c.dispatch({ type: 'chooseFolder' });
  assert.equal(c.getState().screen, 'profile');
  assert.equal(c.getState().folderName, 'Pivot Data');
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const ada = c.getState().profiles[0];
  assert.equal(c.getState().profileId, null, 'creating a profile selects nobody');
  await c.dispatch({ type: 'selectProfile', id: ada.id });
  assert.equal(c.getState().screen, 'main');
  await c.dispatch({ type: 'createHazard', title: 'Fire' });
  const { view, session } = c.getState();
  assert.equal(view.name, 'hazard');
  assert.equal(session.working.records.hazard[view.id].title, 'Fire');
  await c.dispatch({ type: 'save' });
  assert.equal(c.getState().message.text, 'Saved.');
  const stored = await load(f.handle);
  assert.equal(stored.data.records.hazard[view.id].number, 1);
});

test('nothing can be changed before a profile is selected', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createHazard', title: 'Fire' });
  assert.equal(c.getState().message.kind, 'error');
  assert.equal(f.exists(FILES.data), false);
});

test('a refused edit shows its message and changes nothing', async () => {
  const c = createController(env(new MemoryFolder()));
  await openAs(c, 'Ada');
  const before = c.getState().session.working;
  await c.dispatch({ type: 'createHazard', title: '   ' });
  assert.deepEqual(c.getState().message, { kind: 'error', text: 'A hazard title cannot be empty.' });
  assert.equal(c.getState().session.working, before);
});

test('every change is mirrored to the browser, and an hourly backup is taken', async () => {
  const f = new MemoryFolder();
  const storage = new MemoryStorage();
  const c = createController(env(f, storage));
  await openAs(c, 'Ada');
  await c.dispatch({ type: 'createHazard', title: 'Fire' });
  assert.ok(storage.getItem('pivot.unsaved.v2'));
  assert.deepEqual(f.list().filter((p) => p.startsWith('backups/')), ['backups/data-20260928-100000.json']);
  await c.dispatch({ type: 'save' });
  assert.equal(storage.getItem('pivot.unsaved.v2'), null, 'a save clears the unsaved copy');
});

test('a full browser storage gives a warning, and work carries on', async () => {
  const storage = new MemoryStorage();
  storage.fill();
  const c = createController(env(new MemoryFolder(), storage));
  await openAs(c, 'Ada');
  await c.dispatch({ type: 'createHazard', title: 'Fire' });
  assert.match(c.getState().warnings[0], /not being kept/);
  await c.dispatch({ type: 'save' });
  assert.equal(c.getState().message.text, 'Saved.');
});

test('Review focus 5: recovered work merges with a save made by someone else since', async () => {
  const f = new MemoryFolder();
  const storage = new MemoryStorage();
  const a = createController(env(f, storage));
  await openAs(a, 'Ada');
  await a.dispatch({ type: 'save' });
  await a.dispatch({ type: 'createHazard', id: 'ha', title: 'From Ada' });
  // Ada's browser crashes here. Meanwhile Grace saves a change from her own machine.
  const g = createController(env(f));
  await openAs(g, 'Grace');
  await g.dispatch({ type: 'createControl', id: 'cg', title: 'From Grace' });
  await g.dispatch({ type: 'save' });
  // Ada reopens Pivot on her machine.
  const a2 = createController(env(f, storage));
  await a2.dispatch({ type: 'chooseFolder' });
  await a2.dispatch({ type: 'selectProfile', id: a2.getState().profiles.find((p) => p.name === 'Ada').id });
  assert.equal(a2.getState().screen, 'recover');
  await a2.dispatch({ type: 'recover' });
  assert.equal(a2.getState().screen, 'main');
  await a2.dispatch({ type: 'save' });
  const stored = (await load(f.handle)).data;
  assert.equal(stored.records.hazard.ha.title, 'From Ada');
  assert.equal(stored.records.control.cg.title, 'From Grace');
  assert.match(a2.getState().message.text, /Grace had saved/);
});

test('discarding recovered work leaves the folder as it was', async () => {
  const f = new MemoryFolder();
  const storage = new MemoryStorage();
  const a = createController(env(f, storage));
  await openAs(a, 'Ada');
  await a.dispatch({ type: 'createHazard', title: 'Unsaved' });
  const a2 = createController(env(f, storage));
  await a2.dispatch({ type: 'chooseFolder' });
  await a2.dispatch({ type: 'selectProfile', id: a2.getState().profiles[0].id });
  await a2.dispatch({ type: 'discardRecovery' });
  assert.equal(a2.getState().screen, 'main');
  assert.deepEqual(Object.keys(a2.getState().session.working.records.hazard), []);
  assert.equal(storage.getItem('pivot.unsaved.v2'), null);
});

test('an overridden user is told on their next open, once', async () => {
  const f = new MemoryFolder();
  const a = createController(env(f));
  await openAs(a, 'Ada');
  await a.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await a.dispatch({ type: 'save' });
  const g = createController(env(f));
  await openAs(g, 'Grace');
  await g.dispatch({ type: 'updateHazard', id: 'h1', title: 'Grace title' });
  await a.dispatch({ type: 'updateHazard', id: 'h1', title: 'Ada title' });
  await g.dispatch({ type: 'save' });
  await a.dispatch({ type: 'save' });
  assert.equal(a.getState().message.kind, 'warning');
  assert.match(a.getState().message.text, /1 of Grace's changes/);

  const g2 = createController(env(f));
  await openAs(g2, 'Grace');
  assert.equal(g2.getState().screen, 'notices');
  assert.equal(g2.getState().notices[0].items[0].theirs.title, 'Grace title');
  await g2.dispatch({ type: 'dismissNotices' });
  assert.equal(g2.getState().screen, 'main');
  await g2.dispatch({ type: 'save' });
  const g3 = createController(env(f));
  await openAs(g3, 'Grace');
  assert.equal(g3.getState().screen, 'main', 'shown once');
});

test('a folder whose data.json fails its check opens to the backups, with nothing from it shown', async () => {
  const f = new MemoryFolder();
  const a = createController(env(f));
  await openAs(a, 'Ada');
  await a.dispatch({ type: 'createHazard', title: 'Fire' });
  await a.dispatch({ type: 'save' });
  f.write(FILES.data, /** @type {string} */ (f.read(FILES.data)).replace('Fire', 'Flood'));
  const b = createController(env(f));
  await b.dispatch({ type: 'chooseFolder' });
  assert.equal(b.getState().screen, 'check');
  assert.deepEqual(b.getState().check.failed.map((x) => x.file), ['data.json']);
  await b.dispatch({ type: 'continueFromCheck' });
  await b.dispatch({ type: 'selectProfile', id: b.getState().profiles[0].id });
  assert.equal(b.getState().screen, 'main');
  assert.equal(b.getState().session, null);
  assert.equal(b.getState().view.name, 'backups');
});

test('filters and navigation', async () => {
  const c = createController(env(new MemoryFolder()));
  await openAs(c, 'Ada');
  await c.dispatch({ type: 'setFilter', list: 'hazards', field: 'status', value: 'retired' });
  assert.deepEqual(c.getState().filters.hazards, { status: 'retired' });
  await c.dispatch({ type: 'setFilter', list: 'hazards', field: 'status', value: '' });
  assert.deepEqual(c.getState().filters.hazards, {});
  await c.dispatch({ type: 'go', view: 'assessment', hazardId: 'h', platformId: 'p' });
  assert.deepEqual(c.getState().view, { name: 'assessment', id: undefined, hazardId: 'h', platformId: 'p' });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/ui/controller.test.js`
Expected: FAIL with `Cannot find module '.../src/ui/controller.js'`.

- [ ] **Step 3: Write the implementation**

`src/ui/names.js`:

```js
import { hazardLabel } from '../core/ids.js';

export const KIND_LABEL = Object.freeze({
  hazard: 'Hazard', causalFactor: 'Causal factor', consequence: 'Consequence', control: 'Control',
  platform: 'Platform', hazardControl: 'Control link', hazardPlatform: 'Platform link',
  ruling: 'Control decision', rating: 'Rating', report: 'Report', reportDesign: 'Report design',
});

/** How a record is named to a person. @param {string} kind @param {any} rec */
export function recordName(kind, rec) {
  if (kind === 'reportDesign') return 'the report design';
  if (!rec) return KIND_LABEL[kind] ?? kind;
  switch (kind) {
    case 'hazard': return `${hazardLabel(rec)} ${rec.title}`;
    case 'control':
    case 'report': return rec.title;
    case 'platform': return rec.name;
    case 'causalFactor':
    case 'consequence': return rec.text;
    default: return KIND_LABEL[kind] ?? kind;
  }
}

/** @param {{ profiles: { id: string, name: string }[] }} state @param {string | null | undefined} id */
export function profileName(state, id) {
  return state.profiles.find((p) => p.id === id)?.name ?? 'someone';
}

/** @param {string} ts an AEST timestamp @returns {string} `YYYY-MM-DD HH:mm` */
export function when(ts) {
  return ts.slice(0, 16).replace('T', ' ');
}
```

`src/ui/controller.js`:

```js
import * as store from '../storage/store.js';
import { writeMirror, readMirror, clearMirror, hasUnsaved, hasUnsavedRecords } from '../storage/mirror.js';
import { PivotError } from '../core/errors.js';
import { newId } from '../core/ids.js';
import { emptyData } from '../core/data.js';
import { epochOf } from '../core/time.js';
import { entries, unseenOverrides, markNoticesSeen } from '../core/history.js';
import * as hazards from '../core/ops/hazards.js';
import * as controls from '../core/ops/controls.js';
import * as platforms from '../core/ops/platforms.js';
import * as assessment from '../core/ops/assessment.js';
import { setReportDesign } from '../core/ops/reports.js';
import { createDocHost } from '../reports/docgen-host.js';
import { App as DocGen } from '../../DocGen/doc-designer.js';
import { recordName, profileName, KIND_LABEL } from './names.js';

/** Every edit is an op called with the working data, the act, and the action's own fields. */
const EDITS = {
  createHazard: hazards.createHazard, updateHazard: hazards.updateHazard, retireHazard: hazards.retireHazard,
  deleteHazard: hazards.deleteHazard, restoreRecord: hazards.restoreRecord,
  addCausalFactor: hazards.addCausalFactor, updateCausalFactor: hazards.updateCausalFactor, deleteCausalFactor: hazards.deleteCausalFactor,
  addConsequence: hazards.addConsequence, updateConsequence: hazards.updateConsequence, deleteConsequence: hazards.deleteConsequence,
  createControl: controls.createControl, updateControl: controls.updateControl, retireControl: controls.retireControl,
  deleteControl: controls.deleteControl, linkControl: controls.linkControl, setControlKind: controls.setControlKind,
  unlinkControl: controls.unlinkControl,
  createPlatform: platforms.createPlatform, updatePlatform: platforms.updatePlatform, setOwner: platforms.setOwner,
  retirePlatform: platforms.retirePlatform, deletePlatform: platforms.deletePlatform, linkHazard: platforms.linkHazard,
  unlinkHazard: platforms.unlinkHazard, setReportId: platforms.setReportId,
  confirmControl: assessment.confirmControl, excludeControl: assessment.excludeControl,
  resetControl: assessment.resetControl, setRating: assessment.setRating,
};

/** After creating one of these, show it. */
const SHOW_CREATED = { createHazard: 'hazard', createControl: 'control', createPlatform: 'platform' };

const BACKUP_CHECK_MS = 60_000;

export function initialState() {
  return {
    screen: 'open', folderName: '', check: { failed: [] }, profiles: [], profileId: null, dataBlocked: false,
    session: null, recoverable: null, notices: [], view: { name: 'hazards' },
    filters: { hazards: {}, controls: {} }, backups: [], pendingRestore: null,
    message: null, warnings: [], busy: false, designerRevision: 0,
  };
}

/**
 * @param {{ clock: import('../core/time.js').Clock, storage: Storage,
 *   pickFolder: () => Promise<FileSystemDirectoryHandle>,
 *   pickSaveFile: (name: string) => Promise<FileSystemFileHandle>,
 *   pickOpenFile: () => Promise<string> }} env
 */
export function createController(env) {
  let state = initialState();
  /** @type {FileSystemDirectoryHandle | null} */
  let handle = null;
  let lastBackupCheck = -Infinity;
  /** @type {Set<(s: any) => void>} */
  const listeners = new Set();

  /** @param {Record<string, any>} patch */
  function set(patch) {
    state = { ...state, ...patch };
    for (const f of listeners) f(state);
  }
  const act = () => ({ by: /** @type {string} */ (state.profileId), at: env.clock.now() });
  const nameOf = (/** @type {string | null} */ id) => profileName(state, id);

  const docs = createDocHost({
    getData: () => state.session?.working ?? emptyData(),
    setDesign: (design) => {
      if (!state.session) return;
      const working = setReportDesign(state.session.working, design);
      if (working !== state.session.working) {
        set({ session: { ...state.session, working } });
        void afterChange();
      }
    },
    clock: env.clock,
    profileName: nameOf,
  });

  /** Mirror the working state, and take a backup if one is due. Never throws. */
  async function afterChange() {
    const warnings = [];
    const mirrorWarning = writeMirror(env.storage, { folderName: state.folderName, ...state.session });
    if (mirrorWarning) warnings.push(mirrorWarning);
    const nowMs = epochOf(env.clock.now());
    if (handle && nowMs - lastBackupCheck >= BACKUP_CHECK_MS) {
      lastBackupCheck = nowMs;
      try {
        await store.backupIfDue(handle, state.session.working, env.clock);
      } catch (e) {
        warnings.push(`A backup could not be written (${e instanceof Error ? e.message : String(e)}).`);
      }
    }
    set({ warnings });
  }

  function finishOpening() {
    DocGen.docHost.set(docs.host);
    const notices = unseenOverrides(state.session.working, /** @type {string} */ (state.profileId));
    set({ notices, screen: notices.length ? 'notices' : 'main', view: { name: 'hazards' } });
  }

  /** The actions made since the last save, for the restore warning. */
  function unsavedActions() {
    if (!state.session) return [];
    return entries(state.session.working).filter((e) => e.type === 'change' && !state.session.base.history[e.id]).map((e) => e.action);
  }

  /** @param {import('../storage/store.js').SaveResult} r */
  function saveMessage(r) {
    if (!r.merged) return { kind: 'info', text: 'Saved.' };
    const who = nameOf(r.lastSavedBy);
    const kept = r.supersededFile ? [`Their previous file is kept as ${r.supersededFile}.`] : [];
    if (r.conflicts.length === 0) {
      return { kind: 'info', text: `Saved. ${who} had saved since you opened Pivot; their changes are merged in.`, items: kept };
    }
    return {
      kind: 'warning',
      text: `Saved, but ${r.conflicts.length} of ${who}'s changes ${r.conflicts.length === 1 ? 'was' : 'were'} replaced by yours.`,
      items: [...r.conflicts.map((c) => `${KIND_LABEL[c.kind] ?? c.kind}: ${recordName(c.kind, c.theirs ?? c.mine)}`), ...kept],
    };
  }

  /** @type {Record<string, (args: any) => Promise<void>>} */
  const handlers = {
    async chooseFolder() {
      handle = await env.pickFolder();
      const check = await store.checkFolder(handle);
      const profilesBad = check.failed.some((x) => x.file === store.FILES.profiles);
      const dataBlocked = check.failed.some((x) => x.file === store.FILES.data);
      set({
        folderName: handle.name, check, dataBlocked, message: null,
        profiles: profilesBad ? [] : await store.readProfiles(handle),
        screen: check.failed.length ? 'check' : 'profile',
      });
    },
    async continueFromCheck() {
      if (state.check.failed.some((x) => x.file === store.FILES.profiles)) return;
      set({ screen: 'profile' });
    },
    async createProfile({ name }) {
      const p = await store.createProfile(/** @type {any} */ (handle), name, env.clock);
      set({ profiles: await store.readProfiles(/** @type {any} */ (handle)), message: { kind: 'info', text: `Profile ${p.name} created. Select it to continue.` } });
    },
    async selectProfile({ id }) {
      if (!state.profiles.some((p) => p.id === id)) throw new PivotError('not-found', 'That profile no longer exists.');
      set({ profileId: id, message: null });
      if (state.dataBlocked) {
        DocGen.docHost.set(docs.host);
        set({ screen: 'main', view: { name: 'backups' }, backups: await store.listBackups(/** @type {any} */ (handle)) });
        return;
      }
      const { data, stamp } = await store.load(/** @type {any} */ (handle));
      set({ session: { base: data, working: data, loadedStamp: stamp } });
      const m = readMirror(env.storage, state.folderName);
      if (m && hasUnsaved(m)) {
        set({ recoverable: m, screen: 'recover' });
        return;
      }
      finishOpening();
    },
    async recover() {
      const m = state.recoverable;
      set({ session: { base: m.base, working: m.working, loadedStamp: m.loadedStamp }, recoverable: null });
      await afterChange();
      finishOpening();
    },
    async discardRecovery() {
      clearMirror(env.storage);
      set({ recoverable: null });
      finishOpening();
    },
    async dismissNotices() {
      const working = markNoticesSeen(state.session.working, act(), state.notices.map((n) => n.id));
      set({ session: { ...state.session, working }, notices: [], screen: 'main' });
      await afterChange();
    },
    async dismissMessage() {
      set({ message: null });
    },
    async go({ view, id, hazardId, platformId }) {
      set({ view: { name: view, id, hazardId, platformId }, message: null });
      if (view === 'backups' && handle) set({ backups: await store.listBackups(handle) });
    },
    async save() {
      if (!state.session) throw new PivotError('no-data', 'There is nothing to save yet.');
      const r = await store.save(/** @type {any} */ (handle), state.session, /** @type {string} */ (state.profileId), env.clock);
      clearMirror(env.storage);
      // Someone who saved in between may have created their profile since this copy read the list.
      if (r.merged) set({ profiles: await store.readProfiles(/** @type {any} */ (handle)) });
      set({ session: { base: r.data, working: r.data, loadedStamp: r.stamp }, message: saveMessage(r), warnings: [] });
    },
    async setFilter({ list, field, value }) {
      const next = { ...state.filters[list] };
      if (value) next[field] = value; else delete next[field];
      set({ filters: { ...state.filters, [list]: next } });
    },
  };

  /** @param {{ type: string, [k: string]: any }} action */
  async function dispatch(action) {
    const { type, ...args } = action;
    try {
      if (type in EDITS) {
        if (!state.session || !state.profileId) throw new PivotError('no-data', 'Select your profile before changing anything.');
        const shows = SHOW_CREATED[type];
        if (shows && !args.id) args.id = newId();
        const working = EDITS[type](state.session.working, act(), args);
        set({ session: { ...state.session, working }, message: null });
        if (shows) set({ view: { name: shows, id: args.id } });
        await afterChange();
        return;
      }
      const h = handlers[type];
      if (!h) throw new Error(`unknown action: ${type}`);
      set({ busy: true });
      await h(args);
    } catch (e) {
      if (e && typeof e === 'object' && /** @type {any} */ (e).name === 'AbortError') return;
      set({
        message: e instanceof PivotError
          ? { kind: 'error', text: e.message }
          : { kind: 'error', text: `Something went wrong: ${e instanceof Error ? e.message : String(e)}`, items: ['This is a fault in Pivot. Your unsaved changes are still here; save them if you can.'] },
      });
    } finally {
      if (state.busy) set({ busy: false });
    }
  }

  return {
    getState: () => state,
    dispatch,
    /** @param {(s: any) => void} fn */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/ui/controller.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/names.js src/ui/controller.js test/ui/controller.test.js
git commit -m "Add the app controller: opening, profiles, recovery, override notices, edits and saving

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Controller: reports, backups and restore

**Files:**
- Modify: `src/ui/controller.js` (add handlers)
- Test: `test/ui/controller-reports.test.js`

**Interfaces:**
- Consumes: Task 18's controller; `store.listBackups`, `readBackup`, `dataFromText`, `restore`, `writeExport` (Task 14); `createReport` (Task 15); `reportFileBase` (Task 17).
- Produces actions:
  - `openDesigner`: opens DocGen's designer and bumps `designerRevision`.
  - `produceReport { platformId, title? }`: refused while there are unsaved changes; creates the report record and returns to the Reports view.
  - `downloadReport { id, format: 'md' | 'html' }`.
  - `generateFromDesigner { format }`: produces a report for the designer's selected platform, then downloads it.
  - `showBackups`, `prepareRestore { name }` and `prepareRestoreFromFile` set `pendingRestore = { label, data, lost: string[] }`.
  - `confirmRestore` and `cancelRestore`.

- [ ] **Step 1: Write the failing test**

`test/ui/controller-reports.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { load, FILES } from '../../src/storage/store.js';
import { App as DocGen } from '../../DocGen/doc-designer.js';

const HOUR = 3600_000;

function env(folder, clock = fixedClock('2026-09-28T10:00:00+10:00'), openText = null) {
  return {
    clock, storage: new MemoryStorage(),
    pickFolder: async () => folder.handle,
    pickSaveFile: async (name) => folder.handle.getFileHandle(name, { create: true }),
    pickOpenFile: async () => openText,
  };
}

async function ready(c) {
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const id = c.getState().profiles[0].id;
  await c.dispatch({ type: 'selectProfile', id });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: id });
  await c.dispatch({ type: 'linkHazard', hazardId: 'h1', platformId: 'p1' });
  return id;
}

test('a report cannot be produced over unsaved changes', async () => {
  const c = createController(env(new MemoryFolder()));
  await ready(c);
  await c.dispatch({ type: 'produceReport', platformId: 'p1' });
  assert.match(c.getState().message.text, /Save your changes before producing a report/);
});

test('produce a report, save it, and download it as .md and .html', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await ready(c);
  await c.dispatch({ type: 'save' });
  await c.dispatch({ type: 'produceReport', platformId: 'p1' });
  const reports = Object.values(c.getState().session.working.records.report);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].title, 'Alpha hazard report');
  assert.ok(reports[0].markdown.includes('Fire'));
  assert.equal(c.getState().view.name, 'reports');
  await c.dispatch({ type: 'save' });
  await c.dispatch({ type: 'downloadReport', id: reports[0].id, format: 'md' });
  await c.dispatch({ type: 'downloadReport', id: reports[0].id, format: 'html' });
  assert.equal(f.read('Alpha-2026-09-28.md'), reports[0].markdown);
  assert.equal(f.read('Alpha-2026-09-28.html'), reports[0].html);
  assert.equal((await load(f.handle)).data.records.report[reports[0].id].title, 'Alpha hazard report');
});

test('the designer\'s Generate buttons produce and download for the designer\'s platform', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await ready(c);
  await c.dispatch({ type: 'save' });
  await c.dispatch({ type: 'openDesigner' });
  assert.equal(c.getState().designerRevision, 1);
  assert.ok(DocGen.ui.views.reportDesign.isOpen());
  await c.dispatch({ type: 'generateFromDesigner', format: 'html' });
  assert.ok(f.read('Alpha-2026-09-28.html').includes('Fire'));
  DocGen.ui.views.reportDesign.close();
});

test('a design change is an unsaved change of the data, but does not block producing a report', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await ready(c);
  await c.dispatch({ type: 'save' });
  DocGen.docStore.setClassification('PROTECTED');
  assert.equal(c.getState().session.working.reportDesign.classification, 'PROTECTED');
  assert.notEqual(c.getState().session.working, c.getState().session.base);
  await c.dispatch({ type: 'generateFromDesigner', format: 'html' });
  assert.match(f.read('Alpha-2026-09-28.html'), /class="doc-banner">PROTECTED</);
});

test('restore from a backup warns with the unsaved changes it would discard, then replaces the data', async () => {
  const f = new MemoryFolder();
  const clock = fixedClock('2026-09-28T10:00:00+10:00');
  const c = createController(env(f, clock));
  await ready(c);
  await c.dispatch({ type: 'save' });
  clock.advance(2 * HOUR);
  await c.dispatch({ type: 'createHazard', id: 'h2', title: 'Flood' });
  await c.dispatch({ type: 'showBackups' });
  const backups = c.getState().backups;
  assert.equal(backups.length, 2);
  const oldest = backups.at(-1).name;
  await c.dispatch({ type: 'prepareRestore', name: oldest });
  const pending = c.getState().pendingRestore;
  assert.deepEqual(pending.lost, ['Create hazard']);
  await c.dispatch({ type: 'confirmRestore' });
  assert.equal(c.getState().pendingRestore, null);
  assert.equal(c.getState().session.working.records.hazard.h2, undefined);
  assert.match(c.getState().message.text, /Restored/);
  assert.ok(f.list().some((p) => p.startsWith('Superseded Saves/')));
});

test('restore from a chosen file goes through the same check; a bad file is refused', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f, undefined, '{ not a data file'));
  await ready(c);
  await c.dispatch({ type: 'prepareRestoreFromFile' });
  assert.match(c.getState().message.text, /cannot be used/);
  assert.equal(c.getState().pendingRestore, null);
});

test('a data folder whose data.json fails is recovered by restoring a backup', async () => {
  const f = new MemoryFolder();
  const clock = fixedClock('2026-09-28T10:00:00+10:00');
  const a = createController(env(f, clock));
  await ready(a);
  await a.dispatch({ type: 'save' });
  f.write(FILES.data, 'garbage');
  const b = createController(env(f, clock));
  await b.dispatch({ type: 'chooseFolder' });
  await b.dispatch({ type: 'continueFromCheck' });
  await b.dispatch({ type: 'selectProfile', id: b.getState().profiles[0].id });
  await b.dispatch({ type: 'prepareRestore', name: b.getState().backups[0].name });
  await b.dispatch({ type: 'confirmRestore' });
  assert.equal(b.getState().session.working.records.hazard.h1.title, 'Fire');
  assert.equal(b.getState().dataBlocked, false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/ui/controller-reports.test.js`
Expected: FAIL. `produceReport` is unknown, so the first test's message reads `Something went wrong: unknown action: produceReport`.

- [ ] **Step 3: Write the implementation**

In `src/ui/controller.js`, add to the imports:

```js
import { createReport } from '../core/ops/reports.js';
import { reportFileBase } from '../reports/docgen-host.js';
import { when } from './names.js';
```

Merge `when` into the existing `./names.js` import line, and `createReport` into the existing `../core/ops/reports.js` line.

Inside `createController`, add these entries to the `handlers` object, after `setFilter`:

```js
    async openDesigner() {
      if (!state.session) throw new PivotError('no-data', 'Open the data before designing reports.');
      DocGen.docHost.set(docs.host);
      DocGen.ui.views.reportDesign.open();
      set({ designerRevision: state.designerRevision + 1 });
    },
    async produceReport({ platformId, title }) {
      if (!state.session) throw new PivotError('no-data', 'There is no data to report on.');
      if (hasUnsavedRecords(state.session)) {
        throw new PivotError('report.unsaved', 'Save your changes before producing a report, so the report matches what is stored.');
      }
      const at = env.clock.now();
      const platform = state.session.working.records.platform[platformId];
      if (!platform) throw new PivotError('not-found', 'Choose a platform to report on.');
      const t = String(title ?? '').trim() || `${platform.name} hazard report`;
      const { report } = docs.produce(platformId, { at, by: /** @type {string} */ (state.profileId), title: t });
      const id = newId();
      const working = createReport(state.session.working, { by: /** @type {string} */ (state.profileId), at }, { id, report });
      set({ session: { ...state.session, working }, view: { name: 'reports' }, lastReportId: id, message: { kind: 'info', text: `Report produced for ${platform.name}. Save to keep it.` } });
      await afterChange();
    },
    async downloadReport({ id, format }) {
      const r = state.session?.working.records.report[id];
      if (!r) throw new PivotError('not-found', 'That report no longer exists.');
      const ext = format === 'html' ? 'html' : 'md';
      const file = await env.pickSaveFile(`${reportFileBase(r)}.${ext}`);
      await store.writeExport(file, ext === 'html' ? r.html : r.markdown);
      set({ message: { kind: 'info', text: `Saved ${file.name}.` } });
    },
    async generateFromDesigner({ format }) {
      const platformId = DocGen.docSession.selectedSubjectId();
      if (!platformId) throw new PivotError('not-found', 'Choose a platform in the designer first.');
      await handlers.produceReport({ platformId });
      if (state.message?.kind === 'error') return;
      await handlers.downloadReport({ id: state.lastReportId, format });
    },
    async showBackups() {
      set({ view: { name: 'backups' }, backups: await store.listBackups(/** @type {any} */ (handle)) });
    },
    async prepareRestore({ name }) {
      const data = await store.readBackup(/** @type {any} */ (handle), name);
      const b = state.backups.find((x) => x.name === name);
      set({ pendingRestore: { label: `the backup from ${b ? when(b.at) : name}`, data, lost: unsavedActions() } });
    },
    async prepareRestoreFromFile() {
      const text = await env.pickOpenFile();
      const data = await store.dataFromText(text);
      set({ pendingRestore: { label: 'the chosen file', data, lost: unsavedActions() } });
    },
    async confirmRestore() {
      const pending = state.pendingRestore;
      if (!pending) return;
      const r = await store.restore(/** @type {any} */ (handle), pending.data, /** @type {string} */ (state.profileId), env.clock);
      clearMirror(env.storage);
      set({
        session: { base: r.data, working: r.data, loadedStamp: r.stamp }, pendingRestore: null, dataBlocked: false,
        message: { kind: 'info', text: `Restored from ${pending.label}.`, items: r.supersededFile ? [`The data it replaced is kept as ${r.supersededFile}.`] : [] },
      });
      DocGen.docHost.set(docs.host);
    },
    async cancelRestore() {
      set({ pendingRestore: null });
    },
```

Also add `lastReportId: null` to `initialState()`.

- [ ] **Step 4: Run both controller tests to verify they pass**

Run: `node --test test/ui/controller.test.js test/ui/controller-reports.test.js`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/controller.js test/ui/controller-reports.test.js
git commit -m "Controller: produce and download reports, the designer's Generate buttons, backups and restore

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 20: HTML helpers, the shell and the opening screens

**Files:**
- Create: `src/ui/html.js`, `src/ui/screens/common.js`, `src/ui/screens/start.js`
- Test: `test/ui/screens-start.test.js`

**Interfaces:**
- Consumes: `initialState` (Task 18), `names.js` (Task 18), `hasUnsaved` (Task 14), `historyOf` (Task 4), `BANDS` (Task 2), `live` (Task 3).
- Produces:
  - `html.js`: `esc(v)`; `raw(s)`; `` html`...` ``, a tagged template that escapes every value unless it is already `html`/`raw`. Arrays are joined, and `null`, `false` and `true` render as nothing. The result's `.toString()` is the HTML.
  - `common.js`: `dataAttrs(obj)` (keys in kebab case, e.g. `{ action: 'go', 'hazard-id': h }`), `option(value, label, current?)`, `statusTag(status)`, `bandTag(band)`, `stateTag(state)`, `go(label, view, extra?)`, `confirmButton(summary, text, attrs)`, `messages(state)`, `shell(state, body)`, `filterBar(state, data, list, withControlState)`, `historyBlock(state, data, kind, id)`.
  - `start.js`: `openScreen`, `checkScreen`, `profileScreen`, `recoverScreen`, `noticesScreen`, each `(state) -> Raw`.
- DOM wiring convention, used by `mount.js` in Task 23:
  - a click on an element with `data-action` (not a form) dispatches `{ type: action, ...dataset }`;
  - submitting a `form[data-action]` dispatches `{ type, ...dataset, ...formFields }`;
  - a `change` on an element with `data-change` dispatches `{ type: change, ...dataset, [name || 'value']: value }`.

- [ ] **Step 1: Write the failing test**

`test/ui/screens-start.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, raw, esc } from '../../src/ui/html.js';
import { shell, messages, dataAttrs, historyBlock, filterBar } from '../../src/ui/screens/common.js';
import { openScreen, checkScreen, profileScreen, recoverScreen, noticesScreen } from '../../src/ui/screens/start.js';
import { initialState } from '../../src/ui/controller.js';
import { emptyData } from '../../src/core/data.js';
import { updateHazard } from '../../src/core/ops/hazards.js';
import { seed, act } from '../helpers.js';

const evil = '<img src=x onerror=alert(1)>&"';

test('html escapes values, keeps nested html, joins arrays, and drops null and booleans', () => {
  assert.equal(esc(evil), '&lt;img src=x onerror=alert(1)&gt;&amp;&quot;');
  const out = html`<p title="${evil}">${evil}${html`<b>${'x'}</b>`}${[1, 2]}${null}${false}${raw('<i>ok</i>')}</p>`.toString();
  assert.equal(out, `<p title="${esc(evil)}">${esc(evil)}<b>x</b>12<i>ok</i></p>`);
  assert.equal(dataAttrs({ action: 'go', 'hazard-id': 'a"b' }).toString(), 'data-action="go" data-hazard-id="a&quot;b"');
});

test('Review focus 4: every opening screen shows user text literally', () => {
  const state = { ...initialState(), folderName: evil, profiles: [{ id: 'p', name: evil, createdAt: '' }], check: { failed: [{ file: 'data.json', reason: 'integrity', detail: evil }] } };
  for (const screen of [openScreen, checkScreen, profileScreen, recoverScreen]) {
    const out = screen(state).toString();
    assert.equal(out.includes('<img'), false, `${screen.name} leaks markup`);
  }
});

test('the open screen offers the folder picker; the profile screen lists profiles and a create form', () => {
  assert.match(openScreen(initialState()).toString(), /data-action="chooseFolder"/);
  const out = profileScreen({ ...initialState(), profiles: [{ id: 'p1', name: 'Ada', createdAt: '' }] }).toString();
  assert.match(out, /data-action="selectProfile" data-id="p1"/);
  assert.match(out, /<form data-action="createProfile"/);
});

test('the check screen offers to continue only when profiles.json is sound', () => {
  const s = (file) => ({ ...initialState(), check: { failed: [{ file, reason: 'integrity', detail: 'changed' }] } });
  assert.match(checkScreen(s('data.json')).toString(), /data-action="continueFromCheck"/);
  assert.doesNotMatch(checkScreen(s('profiles.json')).toString(), /continueFromCheck/);
});

test('the notices screen says what replaced each of the user\'s edits', () => {
  const state = {
    ...initialState(), profiles: [{ id: 'u2', name: 'Grace', createdAt: '' }],
    notices: [{ id: 'n1', at: '2026-09-28T10:00:00+10:00', by: 'u2', items: [{ kind: 'hazard', id: 'h1', theirs: { number: 1, title: 'Mine' }, mine: { number: 1, title: 'Grace\'s' } }] }],
  };
  const out = noticesScreen(state).toString();
  assert.match(out, /H-0001 Mine/);
  assert.match(out, /H-0001 Grace&#39;s/);
  assert.match(out, /Grace/);
  assert.match(out, /data-action="dismissNotices"/);
});

test('the shell shows the active profile prominently, an unsaved marker, and Save', () => {
  const data = emptyData();
  const base = { ...initialState(), screen: 'main', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }], profileId: 'u1' };
  const clean = shell({ ...base, session: { base: data, working: data, loadedStamp: null } }, html`<p>body</p>`).toString();
  assert.match(clean, /class="profile"[^>]*>Ada</);
  assert.doesNotMatch(clean, /Unsaved changes/);
  assert.match(clean, /data-action="save"/);
  const dirty = shell({ ...base, session: { base: data, working: seed(), loadedStamp: null } }, html``).toString();
  assert.match(dirty, /Unsaved changes/);
});

test('messages show kind, text and items, escaped', () => {
  const out = messages({ ...initialState(), message: { kind: 'warning', text: evil, items: [evil] }, warnings: ['w'] }).toString();
  assert.match(out, /msg-warning/);
  assert.equal(out.includes('<img'), false);
  assert.match(out, />w</);
});

test('filterBar and historyBlock', () => {
  const d = updateHazard(seed(), act, { id: 'h1', title: 'Big fire' });
  const state = { ...initialState(), profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };
  const bar = filterBar(state, d, 'controls', true).toString();
  assert.match(bar, /data-change="setFilter" data-list="controls" data-field="platformId"/);
  assert.match(bar, /data-field="controlState"/);
  assert.match(bar, /<option value="p1">Alpha<\/option>/);
  const hist = historyBlock(state, d, 'hazard', 'h1').toString();
  assert.match(hist, /Edit hazard/);
  assert.match(hist, /title: Fire → Big fire/);
  assert.match(hist, /Ada/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/ui/screens-start.test.js`
Expected: FAIL with `Cannot find module '.../src/ui/html.js'`.

- [ ] **Step 3: Write the implementation**

`src/ui/html.js`:

```js
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** @param {unknown} v */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ESC[/** @type {keyof typeof ESC} */ (c)]);
}

/** Markup that is already safe. */
export class Raw {
  /** @param {string} s */
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

/** @param {string} s trusted markup (never user text) */
export function raw(s) {
  return new Raw(String(s));
}

/** @param {unknown} v @returns {string} */
function part(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
}

/**
 * Every interpolated value is escaped unless it is itself `html` or `raw`, so user text can
 * never become markup.
 * @param {TemplateStringsArray} strings @param {...unknown} values @returns {Raw}
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new Raw(out);
}
```

`src/ui/screens/common.js`:

```js
import { html, raw, esc } from '../html.js';
import { live } from '../../core/data.js';
import { BANDS } from '../../core/matrix.js';
import { historyOf } from '../../core/history.js';
import { hasUnsaved } from '../../storage/mirror.js';
import { profileName, when } from '../names.js';

/** @param {Record<string, unknown>} obj kebab-case keys @returns {import('../html.js').Raw} */
export function dataAttrs(obj) {
  return raw(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' '));
}

/** @param {string} value @param {unknown} label @param {string} [current] */
export function option(value, label, current) {
  return html`<option value="${value}"${value === current ? raw(' selected') : ''}>${label}</option>`;
}

/** @param {string} status */
export function statusTag(status) {
  return status === 'live' ? '' : html` <span class="tag tag-${status}">${status}</span>`;
}

/** @param {string} band */
export function bandTag(band) {
  return html`<span class="band band-${band.toLowerCase().replace(/\s+/g, '-')}">${band}</span>`;
}

/** @param {string} state confirmed | excluded | awaiting */
export function stateTag(state) {
  return html`<span class="tag state-${state}">${state}</span>`;
}

/** A link-styled button that navigates. @param {unknown} label @param {string} view @param {Record<string, unknown>} [extra] */
export function go(label, view, extra = {}) {
  return html`<button type="button" class="link" ${dataAttrs({ action: 'go', view, ...extra })}>${label}</button>`;
}

/**
 * A destructive action behind one extra click, with its consequence spelled out.
 * @param {string} summary @param {string} text @param {import('../html.js').Raw} attrs
 */
export function confirmButton(summary, text, attrs) {
  return html`<details class="confirm"><summary>${summary}</summary><button type="button" class="danger" ${attrs}>${text}</button></details>`;
}

/** @param {any} state */
export function messages(state) {
  const m = state.message;
  const warnings = state.warnings ?? [];
  return html`${m ? html`<div class="msg msg-${m.kind}" role="${m.kind === 'error' ? 'alert' : 'status'}">
      <strong>${m.text}</strong>${m.items?.length ? html`<ul>${m.items.map((/** @type {string} */ i) => html`<li>${i}</li>`)}</ul>` : ''}
      <button type="button" class="link" ${dataAttrs({ action: 'dismissMessage' })}>Dismiss</button></div>` : ''}${warnings.map((/** @type {string} */ w) => html`<div class="msg msg-warning" role="status">${w}</div>`)}`;
}

const NAV = [['hazards', 'Hazards'], ['controls', 'Controls'], ['platforms', 'Platforms'], ['reports', 'Reports'], ['backups', 'Backups']];

/** @param {any} state @param {import('../html.js').Raw} body */
export function shell(state, body) {
  const unsaved = state.session ? hasUnsaved(state.session) : false;
  const current = String(state.view?.name ?? '');
  return html`<header class="topbar">
    <span class="brand">Pivot</span><span class="folder">${state.folderName}</span>
    <nav>${NAV.map(([view, label]) => html`<button type="button" class="nav${current.startsWith(view.slice(0, -1)) ? ' on' : ''}" ${dataAttrs({ action: 'go', view })}>${label}</button>`)}</nav>
    <span class="spacer"></span>
    ${unsaved ? html`<span class="unsaved">Unsaved changes</span>` : ''}
    <button type="button" class="primary" ${dataAttrs({ action: 'save' })}${state.busy ? raw(' disabled') : ''}>Save</button>
    <span class="profile" title="Active profile">${profileName(state, state.profileId)}</span>
  </header>
  <div class="messages">${messages(state)}</div>
  <main class="view">${body}</main>`;
}

/** @param {any} state @param {import('../../core/data.js').Data} data @param {'hazards' | 'controls'} list @param {boolean} withControlState */
export function filterBar(state, data, list, withControlState) {
  const f = state.filters[list] ?? {};
  const attrs = (/** @type {string} */ field) => dataAttrs({ change: 'setFilter', list, field });
  return html`<div class="filters">
    <label>Platform <select ${attrs('platformId')}><option value="">Any</option>${live(data, 'platform').map((p) => option(p.id, p.name, f.platformId))}</select></label>
    <label>Residual risk <select ${attrs('band')}><option value="">Any</option>${BANDS.map((b) => option(b, b, f.band))}</select></label>
    <label>Status <select ${attrs('status')}>${[['live', 'Live'], ['retired', 'Retired'], ['deleted', 'Deleted'], ['any', 'Any']].map(([v, l]) => option(v, l, f.status || 'live'))}</select></label>
    ${withControlState ? html`<label>Control state <select ${attrs('controlState')}><option value="">Any</option>${['confirmed', 'excluded', 'awaiting'].map((s) => option(s, s, f.controlState))}</select></label>` : ''}
  </div>`;
}

/** @param {unknown} v */
const show = (v) => (v == null ? '(none)' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** @param {any} state @param {import('../../core/data.js').Data} data @param {string} kind @param {string} id */
export function historyBlock(state, data, kind, id) {
  const list = historyOf(data, kind, id).slice().reverse();
  return html`<details class="history"><summary>History (${list.length})</summary>
    ${list.length ? html`<ol>${list.map((e) => {
      const item = e.items.find((/** @type {any} */ i) => i.kind === kind && i.id === id);
      const fields = item && item.change === 'edited'
        ? html`<ul>${item.fields.map((/** @type {any} */ f) => html`<li>${f.field}: ${show(f.before)} → ${show(f.after)}</li>`)}</ul>`
        : '';
      return html`<li><span class="when">${when(e.at)}</span> ${profileName(state, e.by)}: ${e.action}${fields}</li>`;
    })}</ol>` : html`<p class="muted">No changes recorded.</p>`}
  </details>`;
}
```

`src/ui/screens/start.js`:

```js
import { html } from '../html.js';
import { dataAttrs, messages } from './common.js';
import { profileName, recordName, when, KIND_LABEL } from '../names.js';

/** @param {any} state */
export function openScreen(state) {
  return html`<div class="start"><h1>Pivot</h1>
    <p>Choose the shared data folder. A new, empty folder starts an empty register.</p>
    <button type="button" class="primary" ${dataAttrs({ action: 'chooseFolder' })}>Choose data folder…</button>
    ${messages(state)}</div>`;
}

/** @param {any} state */
export function checkScreen(state) {
  const profilesBad = state.check.failed.some((/** @type {any} */ f) => f.file === 'profiles.json');
  return html`<div class="start"><h1>Some files in ${state.folderName} cannot be used</h1>
    <ul class="failed">${state.check.failed.map((/** @type {any} */ f) => html`<li><strong>${f.file}</strong>: ${f.detail}</li>`)}</ul>
    ${profilesBad
      ? html`<p>Replace profiles.json with a copy you trust, then open the folder again.</p>`
      : html`<p>Nothing from data.json is shown. Pick your profile, then restore from a backup.</p>
         <button type="button" class="primary" ${dataAttrs({ action: 'continueFromCheck' })}>Continue</button>`}
    ${messages(state)}</div>`;
}

/** @param {any} state */
export function profileScreen(state) {
  return html`<div class="start"><h1>Who are you?</h1><p class="muted">${state.folderName}</p>
    ${messages(state)}
    ${state.profiles.length
      ? html`<ul class="profiles">${state.profiles.map((/** @type {any} */ p) => html`<li><button type="button" ${dataAttrs({ action: 'selectProfile', id: p.id })}>${p.name}</button></li>`)}</ul>`
      : html`<p>No profiles yet. Create yours.</p>`}
    <form data-action="createProfile" class="row"><label>New profile <input name="name" required autocomplete="off"></label><button type="submit">Create</button></form>
  </div>`;
}

/** @param {any} state */
export function recoverScreen(state) {
  return html`<div class="start"><h1>Unsaved changes were found</h1>
    <p>This browser kept changes to ${state.folderName} that were never saved.</p>
    <p>Recovering puts them back on screen. Nothing is written to the folder until you save, and anything others saved since is merged in then.</p>
    <button type="button" class="primary" ${dataAttrs({ action: 'recover' })}>Recover them</button>
    <button type="button" ${dataAttrs({ action: 'discardRecovery' })}>Discard them</button>
    ${messages(state)}</div>`;
}

/** @param {any} state */
export function noticesScreen(state) {
  return html`<div class="start"><h1>Some of your saved changes were replaced</h1>
    <p>Someone saved over them after you. What they saved is what is stored now.</p>
    ${state.notices.map((/** @type {any} */ n) => html`<section class="notice"><h2>${when(n.at)}, by ${profileName(state, n.by)}</h2><ul>
      ${n.items.map((/** @type {any} */ i) => html`<li>${KIND_LABEL[/** @type {keyof typeof KIND_LABEL} */ (i.kind)] ?? i.kind}: your “${recordName(i.kind, i.theirs)}” was replaced ${i.mine ? html`by “${recordName(i.kind, i.mine)}”` : 'and removed'}</li>`)}
    </ul></section>`)}
    <button type="button" class="primary" ${dataAttrs({ action: 'dismissNotices' })}>OK</button></div>`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/ui/screens-start.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/html.js src/ui/screens/common.js src/ui/screens/start.js test/ui/screens-start.test.js
git commit -m "Add escaping HTML templates, the app shell, and the opening screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Hazard and control screens

**Files:**
- Create: `src/ui/screens/hazards.js`, `src/ui/screens/controls.js`
- Test: `test/ui/screens-register.test.js`

**Interfaces:**
- Consumes: Task 20's `common.js` and `html.js`; queries (Task 9); `hazardLabel` (Task 1); `CONTROL_KINDS` (Task 6).
- Produces: `hazardsView(state, data)`, `hazardView(state, data, id)`, `controlsView(state, data)`, `controlView(state, data, id)`, each returning `Raw`. The forms and buttons carry the action names and fields of the ops in Task 18's `EDITS`.

- [ ] **Step 1: Write the failing test**

`test/ui/screens-register.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hazardsView, hazardView } from '../../src/ui/screens/hazards.js';
import { controlsView, controlView } from '../../src/ui/screens/controls.js';
import { initialState } from '../../src/ui/controller.js';
import { assignHazardNumbers, retireHazard } from '../../src/core/ops/hazards.js';
import { confirmControl } from '../../src/core/ops/assessment.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }], profileId: 'u1' };
const data = () => confirmControl(assignHazardNumbers(seed()), act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });

test('the hazard list: one row per hazard per platform, filters, and an add form', () => {
  const out = hazardsView(state, data()).toString();
  assert.match(out, /<form data-action="createHazard"/);
  assert.match(out, /data-change="setFilter" data-list="hazards"/);
  assert.equal((out.match(/data-view="hazard" data-id="h1"/g) || []).length, 2, 'h1 is on two platforms');
  assert.match(out, /H-0002/);
});

test('the hazard list honours the status filter', () => {
  const d = retireHazard(data(), act, { id: 'h2' });
  const out = hazardsView({ ...state, filters: { hazards: { status: 'retired' }, controls: {} } }, d).toString();
  assert.match(out, /H-0002/);
  assert.doesNotMatch(out, /H-0001/);
});

test('a hazard\'s page: editable fields, causal factors, consequences, controls, platforms, history, and the shared note', () => {
  const out = hazardView(state, data(), 'h1').toString();
  assert.match(out, /<form data-action="updateHazard" data-id="h1"/);
  assert.match(out, /value="Hot works"/);
  assert.match(out, /data-action="addConsequence" data-hazard-id="h1"/);
  assert.match(out, /Sprinklers/);
  assert.match(out, /data-change="setControlKind"/);
  assert.match(out, /data-view="assessment" data-hazard-id="h1" data-platform-id="p1"/);
  assert.match(out, /Changes to this hazard reach 2 platforms: Alpha, Bravo/);
  assert.match(out, /History \(\d+\)/);
  assert.match(out, /data-action="deleteHazard"/);
});

test('the control library and a control\'s page show where it is used and its state on each platform', () => {
  const list = controlsView({ ...state, filters: { hazards: {}, controls: { controlState: 'confirmed' } } }, data()).toString();
  assert.match(list, /<form data-action="createControl"/);
  assert.match(list, /Sprinklers/);
  assert.doesNotMatch(list, /Fire drills/, 'filtered to confirmed');
  const page = controlView(state, data(), 'c1').toString();
  assert.match(page, /<form data-action="updateControl" data-id="c1"/);
  assert.match(page, /state-confirmed/);
  assert.match(page, /state-awaiting/);
  assert.match(page, /data-action="retireControl"/);
});

test('an unknown id shows a not-found note, not a crash', () => {
  assert.match(hazardView(state, data(), 'nope').toString(), /no longer exists/);
  assert.match(controlView(state, data(), 'nope').toString(), /no longer exists/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/ui/screens-register.test.js`
Expected: FAIL with `Cannot find module '.../src/ui/screens/hazards.js'`.

- [ ] **Step 3: Write the implementation**

`src/ui/screens/hazards.js`:

```js
import { html } from '../html.js';
import { dataAttrs, option, statusTag, bandTag, go, confirmButton, filterBar, historyBlock } from './common.js';
import { live } from '../../core/data.js';
import { hazardLabel } from '../../core/ids.js';
import { filterHazards, hazardDetail } from '../../core/queries.js';
import { CONTROL_KINDS } from '../../core/ops/controls.js';

/** @typedef {import('../../core/data.js').Data} Data */

export function notFound() {
  return html`<p class="muted">That record no longer exists.</p><p>${go('← Hazards', 'hazards')}</p>`;
}

/** @param {any} state @param {Data} data */
export function hazardsView(state, data) {
  const rows = filterHazards(data, state.filters.hazards);
  return html`<div class="head"><h1>Hazards</h1>
    <form data-action="createHazard" class="row"><input name="title" required placeholder="New hazard title" aria-label="New hazard title"><button type="submit">Add hazard</button></form></div>
    ${filterBar(state, data, 'hazards', false)}
    <table class="grid"><thead><tr><th>ID</th><th>Hazard</th><th>Platform</th><th>Residual risk</th><th>Status</th></tr></thead><tbody>
    ${rows.map((r) => html`<tr><td>${go(hazardLabel(r.hazard), 'hazard', { id: r.hazard.id })}</td><td>${r.hazard.title}</td>
      <td>${r.platform ? r.platform.name : '—'}</td><td>${r.band ? bandTag(r.band) : '—'}</td><td>${statusTag(r.hazard.status) || 'live'}</td></tr>`)}
    </tbody></table>${rows.length ? '' : html`<p class="muted">No hazards match.</p>`}`;
}

/** @param {'CausalFactor' | 'Consequence'} name @param {any[]} items @param {string} hazardId */
function textList(name, items, hazardId) {
  const what = name === 'CausalFactor' ? 'causal factor' : 'consequence';
  return html`<ul class="texts">${items.map((r) => html`<li><form data-action="update${name}" ${dataAttrs({ id: r.id })} class="row">
      <input name="text" value="${r.text}" required aria-label="${what}"><button type="submit">Apply</button>
      <button type="button" ${dataAttrs({ action: `delete${name}`, id: r.id })}>Delete</button></form></li>`)}</ul>
    <form data-action="add${name}" ${dataAttrs({ 'hazard-id': hazardId })} class="row"><input name="text" required placeholder="Add a ${what}…" aria-label="Add a ${what}"><button type="submit">Add</button></form>`;
}

/** @param {any} state @param {Data} data @param {string} id */
export function hazardView(state, data, id) {
  const d = hazardDetail(data, id);
  if (!d) return notFound();
  const h = d.hazard;
  const linkable = live(data, 'control').filter((c) => !d.controls.some((x) => x.control.id === c.id));
  const actions = h.status === 'live'
    ? html`<button type="button" ${dataAttrs({ action: 'retireHazard', id: h.id })}>Retire</button>
       ${confirmButton('Delete…', 'Delete this hazard, its causal factors, consequences and control links', dataAttrs({ action: 'deleteHazard', id: h.id }))}`
    : h.status === 'retired' ? html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'hazard', id: h.id })}>Restore</button>` : '';
  return html`<p>${go('← Hazards', 'hazards')}</p>
    <h1>${hazardLabel(h)} ${h.title}${statusTag(h.status)}</h1>
    ${d.platforms.length > 1 ? html`<p class="note">Changes to this hazard reach ${d.platforms.length} platforms: ${d.platforms.map((p) => p.platform.name).join(', ')}.</p>` : ''}
    <form data-action="updateHazard" ${dataAttrs({ id: h.id })} class="stack">
      <label>Title <input name="title" value="${h.title}" required></label>
      <label>Description <textarea name="description" rows="3">${h.description}</textarea></label>
      <div><button type="submit">Apply</button></div></form>
    <div class="actions">${actions}</div>
    <section><h2>Causal factors</h2>${textList('CausalFactor', d.causalFactors, h.id)}</section>
    <section><h2>Consequences</h2>${textList('Consequence', d.consequences, h.id)}</section>
    <section><h2>Controls</h2>
      <table class="grid"><thead><tr><th>Control</th><th>Kind</th><th></th></tr></thead><tbody>
      ${d.controls.map((c) => html`<tr><td>${go(c.control.title, 'control', { id: c.control.id })}${statusTag(c.control.status)}</td>
        <td><select name="kind" aria-label="Kind of ${c.control.title}" ${dataAttrs({ change: 'setControlKind', 'hazard-id': h.id, 'control-id': c.control.id })}>${CONTROL_KINDS.map((k) => option(k, k, c.link.kind))}</select></td>
        <td>${confirmButton('Unlink…', 'Unlink, clearing its decisions on every platform', dataAttrs({ action: 'unlinkControl', 'hazard-id': h.id, 'control-id': c.control.id }))}</td></tr>`)}
      </tbody></table>
      ${linkable.length
        ? html`<form data-action="linkControl" ${dataAttrs({ 'hazard-id': h.id })} class="row">
            <select name="controlId" aria-label="Control">${linkable.map((c) => option(c.id, c.title))}</select>
            <select name="kind" aria-label="Kind">${CONTROL_KINDS.map((k) => option(k, k))}</select>
            <button type="submit">Link control</button></form>`
        : html`<p class="muted">${live(data, 'control').length ? 'Every control in the library is linked.' : 'The control library is empty.'} Add controls on the Controls page.</p>`}
    </section>
    <section><h2>Platforms</h2>
      ${d.platforms.length
        ? html`<ul>${d.platforms.map((p) => html`<li>${go(p.platform.name, 'assessment', { 'hazard-id': h.id, 'platform-id': p.platform.id })} as ${p.reportId}</li>`)}</ul>`
        : html`<p class="muted">On no platform. Link it from a platform's page.</p>`}
    </section>
    ${historyBlock(state, data, 'hazard', h.id)}`;
}
```

`src/ui/screens/controls.js`:

```js
import { html } from '../html.js';
import { dataAttrs, statusTag, bandTag, stateTag, go, confirmButton, filterBar, historyBlock } from './common.js';
import { get } from '../../core/data.js';
import { hazardLabel } from '../../core/ids.js';
import { filterControls, controlUsage } from '../../core/queries.js';
import { notFound } from './hazards.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** @param {any} state @param {Data} data */
export function controlsView(state, data) {
  const rows = filterControls(data, state.filters.controls);
  return html`<div class="head"><h1>Controls</h1>
    <form data-action="createControl" class="row"><input name="title" required placeholder="New control title" aria-label="New control title"><button type="submit">Add control</button></form></div>
    ${filterBar(state, data, 'controls', true)}
    <table class="grid"><thead><tr><th>Control</th><th>Hazard</th><th>Platform</th><th>Kind</th><th>State</th><th>Residual risk</th></tr></thead><tbody>
    ${rows.map((r) => html`<tr><td>${go(r.control.title, 'control', { id: r.control.id })}${statusTag(r.control.status)}</td>
      <td>${r.hazard ? go(`${hazardLabel(r.hazard)} ${r.hazard.title}`, 'hazard', { id: r.hazard.id }) : '—'}</td>
      <td>${r.platform ? r.platform.name : '—'}</td><td>${r.kind ?? '—'}</td>
      <td>${r.state ? stateTag(r.state) : '—'}</td><td>${r.band ? bandTag(r.band) : '—'}</td></tr>`)}
    </tbody></table>${rows.length ? '' : html`<p class="muted">No controls match.</p>`}`;
}

/** @param {any} state @param {Data} data @param {string} id */
export function controlView(state, data, id) {
  const c = get(data, 'control', id);
  if (!c) return notFound();
  const usage = controlUsage(data, id);
  const actions = c.status === 'live'
    ? html`<button type="button" ${dataAttrs({ action: 'retireControl', id })}>Retire</button>
       ${usage.length ? '' : confirmButton('Delete…', 'Delete this control', dataAttrs({ action: 'deleteControl', id }))}`
    : c.status === 'retired' ? html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'control', id })}>Restore</button>` : '';
  return html`<p>${go('← Controls', 'controls')}</p>
    <h1>${c.title}${statusTag(c.status)}</h1>
    <form data-action="updateControl" ${dataAttrs({ id })} class="stack">
      <label>Title <input name="title" value="${c.title}" required></label>
      <label>Description <textarea name="description" rows="3">${c.description}</textarea></label>
      <div><button type="submit">Apply</button></div></form>
    <div class="actions">${actions}</div>
    <section><h2>Used by</h2>
      ${usage.length ? html`<table class="grid"><thead><tr><th>Hazard</th><th>Kind</th><th>Platforms</th></tr></thead><tbody>
        ${usage.map((u) => html`<tr><td>${go(`${hazardLabel(u.hazard)} ${u.hazard.title}`, 'hazard', { id: u.hazard.id })}</td><td>${u.kind}</td>
          <td>${u.platforms.length ? u.platforms.map((p) => html`<span class="onplat">${p.platform.name} ${stateTag(p.state)}</span> `) : '—'}</td></tr>`)}
      </tbody></table>` : html`<p class="muted">Not linked to any hazard.</p>`}
    </section>
    ${historyBlock(state, data, 'control', id)}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/ui/screens-register.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/hazards.js src/ui/screens/controls.js test/ui/screens-register.test.js
git commit -m "Add the hazard and control screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Platform and assessment screens

**Files:**
- Create: `src/ui/screens/platforms.js`
- Test: `test/ui/screens-platforms.test.js`

**Interfaces:**
- Consumes: Task 20's helpers; queries (Task 9); `CONSEQUENCES`, `LIKELIHOODS`, `formatRating` (Task 2); `ids` (Task 1); `profileName`, `when` (Task 18).
- Produces: `platformsView(state, data)`, `platformView(state, data, id)`, `assessmentView(state, data, hazardId, platformId)`.

- [ ] **Step 1: Write the failing test**

`test/ui/screens-platforms.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformsView, platformView, assessmentView } from '../../src/ui/screens/platforms.js';
import { initialState } from '../../src/ui/controller.js';
import { assignHazardNumbers } from '../../src/core/ops/hazards.js';
import { confirmControl, excludeControl, setRating } from '../../src/core/ops/assessment.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }], profileId: 'u1' };
function data() {
  let d = assignHazardNumbers(seed());
  d = confirmControl(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  d = excludeControl(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', reason: 'No crew <aboard>' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 2, likelihood: 'C' });
  return d;
}

test('the platform list names each owner and offers a create form with an owner choice', () => {
  const out = platformsView(state, data()).toString();
  assert.match(out, /Alpha/);
  assert.match(out, /Grace/);
  assert.match(out, /<form data-action="createPlatform"/);
  assert.match(out, /<select name="ownerId"/);
});

test('a platform\'s page: its hazards with report IDs, risk and control states; link and unlink; owner', () => {
  const out = platformView(state, data(), 'p1').toString();
  assert.match(out, /data-action="setReportId" data-hazard-id="h1" data-platform-id="p1"/);
  assert.match(out, /placeholder="H-0001"/);
  assert.match(out, /band-serious/);
  assert.match(out, /state-confirmed/);
  assert.match(out, /state-excluded/);
  assert.match(out, /data-action="unlinkHazard"/);
  assert.match(out, /<form data-action="linkHazard" data-platform-id="p1"/);
  assert.match(out, /<option value="h2">H-0002 Flood<\/option>/);
  assert.match(out, /data-change="setOwner" data-id="p1"/);
});

test('the assessment: both ratings with their bands, and each control with confirm, exclude and reset', () => {
  const out = assessmentView(state, data(), 'h1', 'p1').toString();
  assert.match(out, /data-stage="initial"/);
  assert.match(out, /data-stage="residual"/);
  assert.match(out, /2C = Serious/);
  assert.match(out, /Uncategorised/);
  assert.match(out, /<option value="2" selected>2 Critical<\/option>/);
  assert.match(out, /No crew &lt;aboard&gt;/);
  assert.match(out, /by Ada/);
  assert.match(out, /data-action="excludeControl"/);
  assert.match(out, /data-action="resetControl"/);
});

test('an assessment of a hazard not on the platform shows a not-found note', () => {
  assert.match(assessmentView(state, data(), 'h2', 'p1').toString(), /not on this platform/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/ui/screens-platforms.test.js`
Expected: FAIL with `Cannot find module '.../src/ui/screens/platforms.js'`.

- [ ] **Step 3: Write the implementation**

`src/ui/screens/platforms.js`:

```js
import { html } from '../html.js';
import { dataAttrs, option, statusTag, bandTag, stateTag, go, confirmButton, historyBlock } from './common.js';
import { all, get, live } from '../../core/data.js';
import { hazardLabel, ids } from '../../core/ids.js';
import { platformHazards, hazardsNotOn, bandOf } from '../../core/queries.js';
import { CONSEQUENCES, LIKELIHOODS, formatRating, ratingFor } from '../../core/matrix.js';
import { profileName, when } from '../names.js';
import { notFound } from './hazards.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** @param {any} state @param {Data} data */
export function platformsView(state, data) {
  const platforms = all(data, 'platform').filter((p) => p.status !== 'deleted');
  const count = (/** @type {string} */ id) => live(data, 'hazardPlatform').filter((l) => l.platformId === id).length;
  return html`<div class="head"><h1>Platforms</h1>
    <form data-action="createPlatform" class="row"><input name="name" required placeholder="New platform name" aria-label="New platform name">
      <select name="ownerId" aria-label="Owner">${state.profiles.map((/** @type {any} */ p) => option(p.id, p.name, state.profileId))}</select>
      <button type="submit">Add platform</button></form></div>
    <table class="grid"><thead><tr><th>Platform</th><th>Owner</th><th>Hazards</th></tr></thead><tbody>
    ${platforms.map((p) => html`<tr><td>${go(p.name, 'platform', { id: p.id })}${statusTag(p.status)}</td><td>${profileName(state, p.ownerId)}</td><td>${count(p.id)}</td></tr>`)}
    </tbody></table>${platforms.length ? '' : html`<p class="muted">No platforms yet.</p>`}`;
}

/** @param {any} state @param {Data} data @param {string} id */
export function platformView(state, data, id) {
  const p = get(data, 'platform', id);
  if (!p) return notFound();
  const rows = platformHazards(data, id);
  const addable = hazardsNotOn(data, id);
  const actions = p.status === 'live'
    ? html`<button type="button" ${dataAttrs({ action: 'retirePlatform', id })}>Retire</button>
       ${rows.length ? '' : confirmButton('Delete…', 'Delete this platform', dataAttrs({ action: 'deletePlatform', id }))}`
    : p.status === 'retired' ? html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'platform', id })}>Restore</button>` : '';
  return html`<p>${go('← Platforms', 'platforms')}</p>
    <h1>${p.name}${statusTag(p.status)}</h1>
    <div class="row">
      <form data-action="updatePlatform" ${dataAttrs({ id })} class="row"><input name="name" value="${p.name}" required aria-label="Platform name"><button type="submit">Rename</button></form>
      <label>Owner <select name="ownerId" ${dataAttrs({ change: 'setOwner', id })}>${state.profiles.map((/** @type {any} */ pr) => option(pr.id, pr.name, p.ownerId))}</select></label>
      <div class="actions">${actions}</div>
    </div>
    <section><h2>Hazards on ${p.name}</h2>
      <table class="grid"><thead><tr><th>Report ID</th><th>Hazard</th><th>Residual risk</th><th>Controls</th><th></th></tr></thead><tbody>
      ${rows.map((r) => {
        const counts = { confirmed: 0, excluded: 0, awaiting: 0 };
        for (const c of r.controls) counts[/** @type {'confirmed'} */ (c.state)] += 1;
        const at = { 'hazard-id': r.hazard.id, 'platform-id': id };
        return html`<tr>
          <td><form data-action="setReportId" ${dataAttrs(at)} class="row inline"><input name="reportId" value="${r.link.reportId ?? ''}" placeholder="${hazardLabel(r.hazard)}" size="10" aria-label="Report ID"><button type="submit">Set</button></form></td>
          <td>${go(`${hazardLabel(r.hazard)} ${r.hazard.title}`, 'hazard', { id: r.hazard.id })}</td>
          <td>${bandTag(bandOf(r.rating.residual))}</td>
          <td>${Object.entries(counts).filter(([, n]) => n > 0).map(([s, n]) => html`${stateTag(s)} ${n} `)}</td>
          <td>${go('Assess', 'assessment', at)} ${confirmButton('Unlink…', 'Unlink, clearing its ratings and control decisions here', dataAttrs({ action: 'unlinkHazard', ...at }))}</td></tr>`;
      })}
      </tbody></table>${rows.length ? '' : html`<p class="muted">No hazards on this platform yet.</p>`}
      ${p.status === 'live' && addable.length
        ? html`<form data-action="linkHazard" ${dataAttrs({ 'platform-id': id })} class="row"><select name="hazardId" aria-label="Hazard">${addable.map((h) => option(h.id, `${hazardLabel(h)} ${h.title}`))}</select><button type="submit">Link hazard</button></form>`
        : ''}
    </section>
    ${historyBlock(state, data, 'platform', id)}`;
}

/** @param {string} hazardId @param {string} platformId @param {'initial' | 'residual'} stage @param {any} pair */
function ratingForm(hazardId, platformId, stage, pair) {
  const c = pair?.consequence == null ? '' : String(pair.consequence);
  const l = pair?.likelihood ?? '';
  return html`<form data-action="setRating" ${dataAttrs({ 'hazard-id': hazardId, 'platform-id': platformId, stage })} class="row">
    <strong class="stage">${stage === 'initial' ? 'Initial' : 'Residual'}</strong>
    <label>Consequence <select name="consequence"><option value="">Not entered</option>${CONSEQUENCES.map((x) => option(String(x.level), `${x.level} ${x.label}`, c))}</select></label>
    <label>Likelihood <select name="likelihood"><option value="">Not entered</option>${LIKELIHOODS.map((x) => option(x.letter, `${x.letter} ${x.label}`, l))}</select></label>
    <button type="submit">Apply</button> ${bandTag(bandOf(pair))}${ratingFor(pair?.consequence ?? null, pair?.likelihood ?? null).cell ? html` <span class="cell">${formatRating(pair)}</span>` : ''}</form>`;
}

/** @param {any} state @param {Data} data @param {string} hazardId @param {string} platformId */
export function assessmentView(state, data, hazardId, platformId) {
  const row = platformHazards(data, platformId).find((r) => r.hazard.id === hazardId);
  const p = get(data, 'platform', platformId);
  if (!row || !p) return html`<p class="muted">That hazard is not on this platform.</p><p>${go('← Platforms', 'platforms')}</p>`;
  const h = row.hazard;
  return html`<p>${go(`← ${p.name}`, 'platform', { id: platformId })}</p>
    <h1>${hazardLabel(h)} ${h.title} <span class="muted">on ${p.name}</span></h1>
    <section><h2>Risk</h2>
      ${ratingForm(h.id, platformId, 'initial', row.rating.initial)}
      ${ratingForm(h.id, platformId, 'residual', row.rating.residual)}
    </section>
    <section><h2>Controls on ${p.name}</h2>
      <table class="grid"><thead><tr><th>Control</th><th>Kind</th><th>State</th><th></th></tr></thead><tbody>
      ${row.controls.map((c) => {
        const t = { 'hazard-id': h.id, 'control-id': c.control.id, 'platform-id': platformId };
        return html`<tr><td>${c.control.title}${statusTag(c.control.status)}</td><td>${c.kind}</td>
          <td>${stateTag(c.state)}
            ${c.state === 'confirmed' ? html` <span class="muted">by ${profileName(state, c.ruling.updatedBy)}, ${when(c.ruling.updatedAt)}</span>` : ''}
            ${c.state === 'excluded' ? html` <span class="reason">${c.ruling.reason}</span>` : ''}</td>
          <td><div class="actions">
            ${c.state !== 'confirmed' ? html`<button type="button" ${dataAttrs({ action: 'confirmControl', ...t })}>Confirm</button>` : ''}
            <form data-action="excludeControl" ${dataAttrs(t)} class="row inline"><input name="reason" required placeholder="Reason for excluding" aria-label="Reason for excluding ${c.control.title}"><button type="submit">Exclude</button></form>
            ${c.state !== 'awaiting' ? html`<button type="button" ${dataAttrs({ action: 'resetControl', ...t })}>Reset</button>` : ''}
          </div></td></tr>`;
      })}
      </tbody></table>${row.controls.length ? '' : html`<p class="muted">This hazard has no controls. Link them on the hazard's page.</p>`}
    </section>
    ${historyBlock(state, data, 'rating', ids.rating(h.id, platformId))}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/ui/screens-platforms.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/platforms.js test/ui/screens-platforms.test.js
git commit -m "Add the platform and assessment screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Reports and backups screens, rendering, mounting, styles

**Files:**
- Create: `src/ui/screens/reports.js`, `src/ui/render.js`, `src/ui/mount.js`, `src/main.js`, `src/ui/styles.css`
- Test: `test/ui/render.test.js`

**Interfaces:**
- Consumes: every screen (Tasks 20 to 22); the controller (Tasks 18 and 19); DocGen `App`.
- Produces:
  - `reportsView(state, data)` and `backupsView(state)`.
  - `renderApp(state) -> string`.
  - `wire(el, dispatch)`, the DOM convention from Task 20.
  - `mount(root, controller)`.
  - `src/main.js`, the browser entry.
  - `styles.css`, which also maps DocGen's `--c-*` tokens onto Pivot's.

- [ ] **Step 1: Write the failing test**

`test/ui/render.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderApp } from '../../src/ui/render.js';
import { reportsView, backupsView } from '../../src/ui/screens/reports.js';
import { initialState } from '../../src/ui/controller.js';
import { emptyData } from '../../src/core/data.js';
import { createReport } from '../../src/core/ops/reports.js';
import { assignHazardNumbers } from '../../src/core/ops/hazards.js';
import { seed, act } from '../helpers.js';

const main = (data, extra = {}) => ({
  ...initialState(), screen: 'main', folderName: 'Pivot Data', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }], profileId: 'u1',
  session: { base: data, working: data, loadedStamp: null }, ...extra,
});

test('renderApp routes each screen and view', () => {
  assert.match(renderApp(initialState()), /chooseFolder/);
  const d = assignHazardNumbers(seed());
  assert.match(renderApp(main(d)), /<h1>Hazards<\/h1>/);
  assert.match(renderApp(main(d, { view: { name: 'controls' } })), /<h1>Controls<\/h1>/);
  assert.match(renderApp(main(d, { view: { name: 'platform', id: 'p1' } })), /<h1>Alpha/);
  assert.match(renderApp(main(d, { view: { name: 'assessment', hazardId: 'h1', platformId: 'p1' } })), /on Alpha/);
  assert.match(renderApp(main(d, { view: { name: 'reports' } })), /<h1>Reports<\/h1>/);
  assert.match(renderApp(main(null, { session: null, view: { name: 'hazards' } })), /<h1>Backups<\/h1>/, 'no data: only backups');
});

test('the reports view: produce form (disabled while unsaved), designer button, and produced reports with downloads', () => {
  const d = createReport(assignHazardNumbers(seed()), act, { id: 'r1', report: { platformId: 'p1', platformName: 'Alpha', producedAt: '2026-09-28T15:00:00+10:00', producedBy: 'u1', title: 'Alpha hazards', classification: 'PROTECTED', rows: [], markdown: '', html: '' } });
  const clean = reportsView(main(d), d).toString();
  assert.match(clean, /<form data-action="produceReport"/);
  assert.match(clean, /data-action="openDesigner"/);
  assert.match(clean, /data-action="downloadReport" data-id="r1" data-format="md"/);
  assert.match(clean, /data-action="downloadReport" data-id="r1" data-format="html"/);
  assert.match(clean, /PROTECTED/);
  assert.doesNotMatch(clean, /Save your changes first/);
  const dirty = reportsView({ ...main(d), session: { base: emptyData(), working: d, loadedStamp: null } }, d).toString();
  assert.match(dirty, /Save your changes first/);
  assert.match(dirty, /type="submit" class="primary" disabled/);
});

test('the backups view warns before a restore, listing the changes that would be lost', () => {
  const s = main(emptyData(), {
    backups: [{ name: 'data-20260928-100000.json', at: '2026-09-28T10:00:00+10:00' }],
    pendingRestore: { label: 'the backup from 2026-09-28 10:00', data: emptyData(), lost: ['Create hazard'] },
  });
  const out = backupsView(s).toString();
  assert.match(out, /replaces the stored data for everyone/);
  assert.match(out, /<li>Create hazard<\/li>/);
  assert.match(out, /data-action="confirmRestore"/);
  assert.match(out, /data-action="prepareRestore" data-name="data-20260928-100000.json"/);
  assert.match(out, /data-action="prepareRestoreFromFile"/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/ui/render.test.js`
Expected: FAIL with `Cannot find module '.../src/ui/render.js'`.

- [ ] **Step 3: Write the implementation**

`src/ui/screens/reports.js`:

```js
import { html, raw } from '../html.js';
import { dataAttrs, option } from './common.js';
import { all, live } from '../../core/data.js';
import { hasUnsavedRecords } from '../../storage/mirror.js';
import { profileName, when } from '../names.js';

/** @param {any} state @param {import('../../core/data.js').Data} data */
export function reportsView(state, data) {
  const unsaved = state.session ? hasUnsavedRecords(state.session) : false;
  const platforms = live(data, 'platform');
  const reports = all(data, 'report').slice().reverse();
  return html`<div class="head"><h1>Reports</h1><button type="button" ${dataAttrs({ action: 'openDesigner' })}>Open the report designer</button></div>
    <section><h2>Produce a report</h2>
      ${unsaved ? html`<p class="note">Save your changes first: a report is produced from what is stored.</p>` : ''}
      ${platforms.length
        ? html`<form data-action="produceReport" class="row">
            <label>Platform <select name="platformId">${platforms.map((p) => option(p.id, p.name))}</select></label>
            <label>Title <input name="title" placeholder="Platform hazard report"></label>
            <button type="submit" class="primary"${unsaved ? raw(' disabled') : ''}>Produce</button></form>`
        : html`<p class="muted">Add a platform first.</p>`}
      <p class="muted">Sections, wording, layout and the classification marking are set in the report designer, and are shared by everyone using this folder.</p>
    </section>
    <section><h2>Produced reports</h2>
      ${reports.length ? html`<table class="grid"><thead><tr><th>Produced</th><th>Platform</th><th>Title</th><th>Marking</th><th>By</th><th>Download</th></tr></thead><tbody>
        ${reports.map((r) => html`<tr><td>${when(r.producedAt)}</td><td>${r.platformName}</td><td>${r.title}</td><td>${r.classification || '—'}</td>
          <td>${profileName(state, r.producedBy)}</td>
          <td><button type="button" ${dataAttrs({ action: 'downloadReport', id: r.id, format: 'md' })}>.md</button>
              <button type="button" ${dataAttrs({ action: 'downloadReport', id: r.id, format: 'html' })}>.html</button></td></tr>`)}
      </tbody></table>` : html`<p class="muted">No reports yet.</p>`}
    </section>`;
}

/** @param {any} state */
export function backupsView(state) {
  const p = state.pendingRestore;
  return html`<h1>Backups</h1>
    ${p ? html`<div class="msg msg-warning" role="alert"><strong>Restoring ${p.label} replaces the stored data for everyone using this folder.</strong>
        <p>The data it replaces is kept under Superseded Saves.</p>
        ${p.lost.length ? html`<p>These unsaved changes would be lost:</p><ul>${p.lost.map((/** @type {string} */ a) => html`<li>${a}</li>`)}</ul>` : ''}
        <button type="button" class="danger" ${dataAttrs({ action: 'confirmRestore' })}>Restore</button>
        <button type="button" ${dataAttrs({ action: 'cancelRestore' })}>Cancel</button></div>` : ''}
    <p class="muted">A backup is taken when something changes and the newest backup is more than an hour old. The newest 72 are kept.</p>
    <p><button type="button" ${dataAttrs({ action: 'prepareRestoreFromFile' })}>Restore from a file…</button></p>
    ${state.backups.length ? html`<table class="grid"><thead><tr><th>Taken</th><th></th></tr></thead><tbody>
      ${state.backups.map((/** @type {any} */ b) => html`<tr><td>${when(b.at)}</td><td><button type="button" ${dataAttrs({ action: 'prepareRestore', name: b.name })}>Restore…</button></td></tr>`)}
    </tbody></table>` : html`<p class="muted">No backups yet.</p>`}`;
}
```

`src/ui/render.js`:

```js
import * as start from './screens/start.js';
import { shell } from './screens/common.js';
import { hazardsView, hazardView } from './screens/hazards.js';
import { controlsView, controlView } from './screens/controls.js';
import { platformsView, platformView, assessmentView } from './screens/platforms.js';
import { reportsView, backupsView } from './screens/reports.js';

/** @param {any} state */
function mainView(state) {
  const data = state.session?.working;
  const v = state.view;
  if (!data || v.name === 'backups' || state.pendingRestore) return backupsView(state);
  switch (v.name) {
    case 'hazard': return hazardView(state, data, v.id);
    case 'controls': return controlsView(state, data);
    case 'control': return controlView(state, data, v.id);
    case 'platforms': return platformsView(state, data);
    case 'platform': return platformView(state, data, v.id);
    case 'assessment': return assessmentView(state, data, v.hazardId, v.platformId);
    case 'reports': return reportsView(state, data);
    default: return hazardsView(state, data);
  }
}

/** @param {any} state @returns {string} */
export function renderApp(state) {
  switch (state.screen) {
    case 'open': return start.openScreen(state).toString();
    case 'check': return start.checkScreen(state).toString();
    case 'profile': return start.profileScreen(state).toString();
    case 'recover': return start.recoverScreen(state).toString();
    case 'notices': return start.noticesScreen(state).toString();
    default: return shell(state, mainView(state)).toString();
  }
}
```

`src/ui/mount.js`:

```js
import { renderApp } from './render.js';
import { App as DocGen } from '../../DocGen/doc-designer.js';

/**
 * Event delegation on a root that stays put, as DocGen's designer does.
 * @param {HTMLElement} el @param {(action: any) => Promise<void>} dispatch
 */
export function wire(el, dispatch) {
  el.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-action]'));
    if (!t || t.tagName === 'FORM' || !el.contains(t)) return;
    e.preventDefault();
    void dispatch({ type: t.dataset.action, ...t.dataset });
  });
  el.addEventListener('submit', (e) => {
    const f = /** @type {HTMLFormElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('form[data-action]'));
    if (!f) return;
    e.preventDefault();
    void dispatch({ type: f.dataset.action, ...f.dataset, ...Object.fromEntries(new FormData(f)) });
  });
  el.addEventListener('change', (e) => {
    const t = /** @type {HTMLSelectElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-change]'));
    if (!t) return;
    void dispatch({ type: t.dataset.change, ...t.dataset, [t.name || 'value']: t.value });
  });
}

/** @param {HTMLElement} root @param {ReturnType<typeof import('./controller.js').createController>} controller */
export function mount(root, controller) {
  root.innerHTML = '<div class="pivot-app"></div><div class="pivot-designer"></div>';
  const appEl = /** @type {HTMLElement} */ (root.querySelector('.pivot-app'));
  const designerEl = /** @type {HTMLElement} */ (root.querySelector('.pivot-designer'));
  const RD = DocGen.ui.views.reportDesign;
  const paintDesigner = () => {
    const host = DocGen.docHost.get();
    designerEl.innerHTML = host && RD.isOpen() ? RD.render(host.getState()) : '';
  };
  let designerRevision = 0;
  /** @param {any} state */
  const paint = (state) => {
    appEl.innerHTML = renderApp(state);
    // The designer repaints itself as it is edited; the app repaints it only when asked to open it.
    if (state.designerRevision !== designerRevision) {
      designerRevision = state.designerRevision;
      paintDesigner();
    }
  };
  wire(appEl, controller.dispatch);
  RD.wire({ root: designerEl, refreshMain: paintDesigner, quietEdit: (/** @type {() => void} */ fn) => fn() });
  designerEl.addEventListener('click', (e) => {
    const b = /** @type {HTMLButtonElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-generate-action]'));
    if (!b || b.disabled) return;
    void controller.dispatch({ type: 'generateFromDesigner', format: b.getAttribute('data-generate-format') });
  });
  controller.subscribe(paint);
  paint(controller.getState());
}
```

`src/main.js`:

```js
import { createController } from './ui/controller.js';
import { mount } from './ui/mount.js';
import { systemClock } from './core/time.js';

/** localStorage can be missing or refused by policy; the mirror reports that as a warning. */
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return /** @type {Storage} */ (/** @type {unknown} */ ({
      getItem: () => null,
      setItem: () => { throw new Error('the browser refuses storage on this page'); },
      removeItem: () => {},
    }));
  }
}

const w = /** @type {any} */ (window);
const controller = createController({
  clock: systemClock,
  storage: browserStorage(),
  pickFolder: () => w.showDirectoryPicker({ mode: 'readwrite', id: 'pivot-data' }),
  pickSaveFile: (suggestedName) => w.showSaveFilePicker({ suggestedName }),
  pickOpenFile: async () => {
    const [h] = await w.showOpenFilePicker({ types: [{ description: 'Pivot data file', accept: { 'application/json': ['.json'] } }] });
    return (await h.getFile()).text();
  },
});
mount(/** @type {HTMLElement} */ (document.getElementById('pivot')), controller);
```

`src/ui/styles.css`:

```css
:root {
  --p-font: system-ui, "Segoe UI", sans-serif;
  --p-fg: #1b1f23; --p-bg: #f6f7f9; --p-surface: #ffffff; --p-muted: #59636e; --p-line: #d0d7de;
  --p-accent: #1f5fb0; --p-accent-fg: #ffffff; --p-danger: #b3261e;
  --p-bar: #24292f; --p-bar-fg: #ffffff;
  --p-warn-bg: #fff5e0; --p-error-bg: #fdecea; --p-info-bg: #e7eefa;
}
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.45 var(--p-font); color: var(--p-fg); background: var(--p-bg); }
button { font: inherit; cursor: pointer; border: 1px solid var(--p-line); background: var(--p-surface); color: var(--p-fg); border-radius: 5px; padding: 4px 10px; }
button:disabled { opacity: .5; cursor: not-allowed; }
button.primary { background: var(--p-accent); border-color: var(--p-accent); color: var(--p-accent-fg); }
button.danger { border-color: var(--p-danger); color: var(--p-danger); }
button.link { border: 0; background: none; color: var(--p-accent); padding: 0; text-decoration: underline; }
input, select, textarea { font: inherit; padding: 3px 6px; border: 1px solid var(--p-line); border-radius: 4px; background: var(--p-surface); color: var(--p-fg); }
textarea { width: 100%; }
h1 { font-size: 20px; margin: 8px 0 12px; }
h2 { font-size: 15px; margin: 18px 0 8px; }

.topbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 12px; padding: 8px 16px; background: var(--p-bar); color: var(--p-bar-fg); flex-wrap: wrap; }
.topbar .brand { font-weight: 700; }
.topbar .folder { opacity: .75; }
.topbar nav { display: flex; gap: 4px; }
.topbar .nav { background: transparent; color: var(--p-bar-fg); border-color: transparent; }
.topbar .nav.on { border-color: var(--p-bar-fg); }
.topbar .spacer { flex: 1; }
.topbar .unsaved { background: #9a6700; color: #fff; padding: 1px 8px; border-radius: 10px; font-size: 12px; }
.topbar .profile { font-weight: 700; font-size: 16px; }

.view, .start { max-width: 1100px; margin: 0 auto; padding: 12px 16px 40px; }
.start { max-width: 640px; padding-top: 48px; }
/* A toast at the bottom, above the report designer's modal, so a message is never hidden. */
.messages { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 1100; width: min(720px, calc(100vw - 32px)); }
.messages:empty { display: none; }
.messages .msg { box-shadow: 0 4px 16px rgba(0,0,0,.2); }
.msg { margin: 10px 0; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--p-line); }
.msg-info { background: var(--p-info-bg); }
.msg-warning { background: var(--p-warn-bg); }
.msg-error { background: var(--p-error-bg); border-color: var(--p-danger); }
.note { background: var(--p-info-bg); padding: 6px 10px; border-radius: 6px; }
.muted { color: var(--p-muted); }

.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 6px 0; }
.row.inline { display: inline-flex; margin: 0; }
.stack { display: grid; gap: 8px; max-width: 700px; }
.stack label { display: grid; gap: 2px; }
.actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
.filters { display: flex; gap: 12px; flex-wrap: wrap; margin: 8px 0 12px; }
.texts { list-style: none; padding: 0; margin: 0; }
.texts input { min-width: 360px; }
.profiles { list-style: none; padding: 0; display: grid; gap: 6px; }
.profiles button { width: 100%; text-align: left; padding: 8px 12px; }

.grid { border-collapse: collapse; width: 100%; background: var(--p-surface); }
.grid th, .grid td { border: 1px solid var(--p-line); padding: 5px 8px; text-align: left; vertical-align: top; }
.grid th { background: #eef1f4; font-weight: 600; }

.tag { display: inline-block; padding: 0 6px; border-radius: 3px; font-size: 12px; font-weight: 600; background: #eef1f4; }
.tag-retired { background: #eee; color: #555; }
.tag-deleted { background: var(--p-error-bg); color: var(--p-danger); }
.state-confirmed { background: #e7f5ec; color: #1d7a46; }
.state-excluded { background: #f1eafa; color: #6b3fa0; }
.state-awaiting { background: #ddf4ff; color: #0a3069; }
.band { display: inline-block; padding: 0 6px; border-radius: 3px; font-size: 12px; font-weight: 600; }
.band-high { background: #b3261e; color: #fff; }
.band-serious { background: #e8710a; color: #fff; }
.band-medium { background: #f9d94a; color: #3b3000; }
.band-low { background: #1d7a46; color: #fff; }
.band-eliminated, .band-not-credible, .band-uncategorised { background: #eee; color: #444; }
.reason { font-style: italic; }
.onplat { white-space: nowrap; margin-right: 8px; }

details.confirm { display: inline-block; }
details.confirm > summary { display: inline-block; cursor: pointer; border: 1px solid var(--p-line); border-radius: 5px; padding: 4px 10px; background: var(--p-surface); }
details.confirm[open] > summary { margin-bottom: 4px; }
details.history { margin-top: 20px; }

/* The DocGen designer, in Pivot's colours. */
.docgen { --c-accent: var(--p-accent); --c-accent-text: var(--p-accent-fg); --c-text: var(--p-fg); --c-border: var(--p-line); --font: var(--p-font); }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/ui/render.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui src/main.js test/ui/render.test.js
git commit -m "Add the reports and backups views, app rendering, DOM wiring with the DocGen designer, and styles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 24: The single-file build, type check, and a check in a real browser

**Files:**
- Create: `scripts/build.js` (ported from `archive/hyperion/baseline/scripts/build.js`)
- Test: `test/build.test.js`

**Interfaces:**
- Consumes: every source file under `src/`, and `DocGen/doc-designer.js` and `.css`.
- Produces: `collectSources(root)`, `rewriteImports(source, fileRel, known)`, `inCommentOrString(source, offset)`, `build({ root?, builtAt? }) -> string`. `node scripts/build.js` writes `dist/pivot.html`.

- [ ] **Step 1: Write the failing test**

`test/build.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, collectSources, rewriteImports } from '../scripts/build.js';

test('the page embeds every module behind one import map and the styles inline', () => {
  const page = build({ builtAt: 'test' });
  const map = JSON.parse(/<script type="importmap">(.*?)<\/script>/s.exec(page)[1]);
  assert.ok(map.imports['src/main.js']);
  assert.ok(map.imports['DocGen/doc-designer.js']);
  assert.ok(map.imports['src/storage/store.js']);
  assert.match(page, /<script type="module">import "src\/main.js";<\/script>/);
  assert.match(page, /\.docgen \.modal/, 'DocGen styles inlined');
  assert.match(page, /\.topbar/, 'Pivot styles inlined');
  assert.match(page, /<div id="pivot"><\/div>/);
  const controller = Buffer.from(map.imports['src/ui/controller.js'].split(',')[1], 'base64').toString('utf8');
  assert.match(controller, /from 'src\/storage\/store.js'/, 'relative imports are rewritten to project paths');
  assert.match(controller, /from 'DocGen\/doc-designer.js'/);
});

test('sources are src/**/*.js and DocGen', () => {
  const s = collectSources(new URL('..', import.meta.url).pathname);
  assert.ok(s.includes('src/core/merge.js'));
  assert.ok(s.includes('DocGen/doc-designer.js'));
  assert.ok(!s.some((x) => x.startsWith('test/')));
});

test('a bare import is refused: the product has no dependencies', () => {
  assert.throws(() => rewriteImports("import x from 'lodash';", 'src/a.js', new Set(['src/a.js'])), /no dependenc/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/build.test.js`
Expected: FAIL with `Cannot find module '.../scripts/build.js'`.

- [ ] **Step 3: Write the implementation**

`scripts/build.js`:

```js
#!/usr/bin/env node
/**
 * The whole build: embed every module as an inline `data:` module and resolve the imports
 * between them with an inline import map, so dist/pivot.html opens from a file path (a null
 * origin cannot import a second file) with no fetch of anything. No bundler, no dependency.
 *
 *     node scripts/build.js            # -> dist/pivot.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
const ENTRY = 'src/main.js';
const EXTRA_SOURCES = ['DocGen/doc-designer.js'];
const STYLES = ['DocGen/doc-designer.css', 'src/ui/styles.css'];
const IMPORT_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\2/g;

/** @param {string} dir @returns {string[]} */
function jsFilesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFilesUnder(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** @param {string} root @returns {string[]} project-relative posix paths */
export function collectSources(root) {
  const rel = (/** @type {string} */ abs) => path.relative(root, abs).split(path.sep).join('/');
  return [...jsFilesUnder(path.join(root, 'src')).map(rel), ...EXTRA_SOURCES].sort();
}

/**
 * Whether an import-shaped match sits in a comment line or inside a string opened earlier on
 * its line. Line-local, as the sources are written knowing.
 * @param {string} source @param {number} offset
 */
export function inCommentOrString(source, offset) {
  const lineStart = source.lastIndexOf('\n', offset) + 1;
  const before = source.slice(lineStart, offset);
  const lead = before.trimStart();
  if (lead.startsWith('*') || lead.startsWith('//')) return true;
  for (const quote of ["'", '"', '`']) {
    let count = 0;
    for (let i = 0; i < before.length; i += 1) if (before[i] === quote && before[i - 1] !== '\\') count += 1;
    if (count % 2 === 1) return true;
  }
  return false;
}

/**
 * Rewrite relative imports to project-relative specifiers, because a data: module has no base
 * to resolve `./x.js` against.
 * @param {string} source @param {string} fileRel @param {Set<string>} known
 */
export function rewriteImports(source, fileRel, known) {
  return source.replace(IMPORT_RE, (whole, lead, quote, spec, offset) => {
    if (inCommentOrString(source, offset)) return whole;
    let target;
    if (spec.startsWith('./') || spec.startsWith('../')) target = path.posix.normalize(path.posix.join(path.posix.dirname(fileRel), spec));
    else if (known.has(spec)) target = spec;
    else throw new Error(`${fileRel}: imports "${spec}"; Pivot has no dependencies, so every import is a file in this project`);
    if (!known.has(target)) throw new Error(`${fileRel}: imports "${spec}", which resolves to ${target}, not a source file`);
    return `${lead}${quote}${target}${quote}`;
  });
}

/** @param {{ root?: string, builtAt?: string }} [o] @returns {string} */
export function build({ root = ROOT, builtAt = new Date().toISOString() } = {}) {
  const sources = collectSources(root);
  const known = new Set(sources);
  if (!known.has(ENTRY)) throw new Error(`the entry ${ENTRY} is missing`);
  /** @type {Record<string, string>} */
  const imports = {};
  for (const rel of sources) {
    const text = rewriteImports(fs.readFileSync(path.join(root, rel), 'utf8'), rel, known);
    imports[rel] = `data:text/javascript;base64,${Buffer.from(text, 'utf8').toString('base64')}`;
  }
  const css = STYLES.map((s) => fs.readFileSync(path.join(root, s), 'utf8')).join('\n').replace(/<\/style/gi, '<\\/style');
  const importMap = JSON.stringify({ imports }).replace(/</g, '\\u003c');
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="pivot-build" content="${builtAt}">`,
    '<title>Pivot</title>',
    `<style>\n${css}</style>`,
    `<script type="importmap">${importMap}</script>`,
    '</head>',
    '<body>',
    '<div id="pivot"></div>',
    `<script type="module">import ${JSON.stringify(ENTRY)};</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const page = build();
    const out = path.join(ROOT, 'dist', 'pivot.html');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, page);
    console.log(`OK wrote ${out} (${page.length} bytes)`);
  } catch (e) {
    console.error(`FAIL ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 4: Run the build test, then the whole suite, the build and the type check**

Run: `node --test test/build.test.js`
Expected: PASS, 3 tests.

Run: `npm test`
Expected: every `node:test` file passes, then `OK 149 passed, 0 failed, 22 suites` from DocGen.

Run: `npm run build`
Expected: `OK wrote .../dist/pivot.html (... bytes)`.

Run: `npm run typecheck`
Expected: no output, exit code 0. If it reports errors, fix them in `src/` by correcting the JSDoc type or the code; do not loosen `tsconfig.json`. Commit the fixes with this task.

- [ ] **Step 5: Check the built page in a real browser**

This uses the Playwright browser tools as a development aid; nothing about it goes into the repository. They need a Chrome install; if the tools report that Chrome is missing, ask jay before running `npx playwright install chrome` (it installs system packages). Serve `dist/` over HTTP so the browser's private file system can stand in for the shared folder. The native folder picker cannot be automated, so the step replaces the pickers with that private file system.

```bash
cd dist && python3 -m http.server 8765 &
```

Then, with the Playwright tools:
1. Navigate to `http://localhost:8765/pivot.html?v=1` (change the number after each rebuild: the browser caches the page). Read the console messages; expected: no errors other than a missing `favicon.ico`, which is the test server's.
2. Evaluate:
   ```js
   window.showDirectoryPicker = async () => navigator.storage.getDirectory();
   window.showSaveFilePicker = async ({ suggestedName }) => (await navigator.storage.getDirectory()).getFileHandle(suggestedName, { create: true });
   ```
3. Click "Choose data folder…", create the profile "Ada", and select it. Expected: the top bar shows **Ada**.
4. Add a hazard "Fire". Expected: its page opens as "New Fire". Add a causal factor. Save. Expected: "Saved.", and the heading reads "H-0001 Fire".
5. Add a control "Sprinklers" on the Controls page. Link it to the hazard as preventative. Add a platform "Alpha". On Alpha, link the hazard. Open "Assess", set the residual rating to 2 / C (expected "2C = Serious"), and confirm the control.
6. Save. On Reports, click "Open the report designer". Expected: the designer opens with Alpha selected, and choosing a marking under Header & Footer works. Close it, produce a report for Alpha, save, and click `.html`. Expected: a message "Saved Alpha-<date>.html.".
7. Take a screenshot of the Alpha platform page and of the assessment page, and look at them: the layout is readable, the tags and bands are coloured, and no raw markup is visible.
8. Stop the server: `kill %1`.

Record anything that did not behave as expected, and fix it before committing.

- [ ] **Step 6: Commit**

```bash
git add scripts/build.js test/build.test.js src
git commit -m "Add the single-file build and check the app end to end in a browser

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Update the README**

Replace `README.md` with:

````markdown
# Pivot

A hazard register for platforms: hazards stored once and linked to many platforms, a shared
control library, per-platform control decisions and risk ratings on the company matrix, full
change history, and reports produced through the DocGen document designer.

Pivot is one file, `pivot.html`, opened from the shared data folder in a Chromium-based
browser. Nothing is installed.

```
npm install        # TypeScript, for the type check only
npm test           # every test, including DocGen's own suite
npm run build      # -> dist/pivot.html
npm run typecheck
```

- Design: `docs/superpowers/specs/2026-09-28-pivot-rebuild-design.md`
- The earlier build, for reference only: `archive/hyperion/`
````

```bash
git add README.md
git commit -m "Describe the project and its commands in the README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
