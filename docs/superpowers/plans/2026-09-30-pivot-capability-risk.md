# Pivot: Capability Risk and Calculated Levels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add capability as a third risk type everywhere risk appears, and make every risk level calculated from a likelihood and a consequence (no picking matrix cells).

**Architecture:** A new `src/core/receptors.js` holds the one list of receptors and how each is named; every place that shows, counts, filters or reports per-receptor risk is built by iterating it. The platform page's cell dropdowns and `setRatingCell` go; that table shows calculated levels and links to the hazard's platform tab, where likelihood and consequence are set.

**Tech Stack:** Plain ES modules, JSDoc types checked by `tsc --checkJs`, `node:test`, no runtime dependency, no UI framework.

**Spec:** `docs/superpowers/specs/2026-09-30-pivot-capability-risk-design.md`.

## Global Constraints

- `RECEPTORS = ['personnel', 'environment', 'capability']`, in that order everywhere (panels, columns, report rows, the missing list).
- Words: Personnel, Environment, Capability; letters P, E, C; report/snapshot keys `initialPersonnel` … `residualCapability` (`${stage}${Word}`).
- The same matrix for all three. Old `rating` records still convert to personnel and environment only.
- Where one band is needed, it is the worst over all three receptors.
- Existing report column ids are unchanged; capability adds `initialCapability`, `residualCapability`.
- Commands: `npm test`, `npm run typecheck`, `npm run build`, passing at the end of every task. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `capability`.

## Review Focus

1. **An existing file** (personnel and environment set, no capability): opens with capability unassessed, the tab badge and hazards list still show the worst of the assessed ones, and Home lists the capability assessments as missing. Pinned in Task 1.
2. **Only a capability likelihood chosen**: kept, level "Not yet assessed", still counted as missing. Pinned in Task 1.
3. **Two people assess different receptors of the same hazard on a platform**: both kept on merge. Pinned in Task 1.
4. **The platform page**: no dropdown lists matrix cells; six read-only levels; each hazard opens its platform tab. Pinned in Task 3.
5. **Markup in a capability justification**: shown literally on the page and in the report. Pinned in Tasks 2 and 3.

---

### Task 1: Capability in the core

**Files:** Create `src/core/receptors.js`; modify `src/core/ops/assessment.js` (RECEPTORS from receptors.js, message, remove `setRatingCell`), `src/core/queries.js` (`ratingsOf`, `worseResidual`, `hazardRows`, `openItems`, `platformCards`), `src/ui/controller.js` (drop `setRatingCell` from EDITS); tests: create `test/core/capability.test.js`; update tests that pin two-receptor shapes or use `setRatingCell`.

**Interfaces — Produces:**
- `receptors.js`: `RECEPTORS`, `RECEPTOR_WORD` (`{ personnel: 'Personnel', environment: 'Environment', capability: 'Capability' }`), `RECEPTOR_LETTER` (`P`/`E`/`C`), `stageKey(stage, receptor)` → e.g. `residualCapability`.
- `ratingsOf` → `{ initial: { personnel, environment, capability }, residual: { … } }`.
- `hazardRows` platform entries `{ platform, band, personnel, environment, capability }`; rows `worst`, `worstPersonnel`, `worstEnvironment`, `worstCapability`.
- `openItems().unrated[].missing` lists `'initial capability'`, `'residual capability'` in order among the others.
- `platformCards()[].bands` has `capability`.
- `setRating` with no receptor sets every receptor (tests and conversions only). `setRatingCell` is removed.

- [ ] **Step 1: Write the failing test** — `test/core/capability.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { RECEPTORS, RECEPTOR_WORD, RECEPTOR_LETTER, stageKey } from '../../src/core/receptors.js';
import { setAssessment } from '../../src/core/ops/assessment.js';
import * as assessmentOps from '../../src/core/ops/assessment.js';
import { mergeData } from '../../src/core/merge.js';
import { ratingsOf, hazardRows, openItems, platformCards, bandOf } from '../../src/core/queries.js';
import { act, later, seed } from '../helpers.js';

const set = (d, stage, receptor, likelihood, consequence, a = act) => setAssessment(d, a, { hazardId: 'h1', platformId: 'p1', stage, receptor, likelihood, consequence });

test('three receptors, one list, named once', () => {
  assert.deepEqual(RECEPTORS, ['personnel', 'environment', 'capability']);
  assert.equal(RECEPTOR_WORD.capability, 'Capability');
  assert.equal(RECEPTOR_LETTER.capability, 'C');
  assert.equal(stageKey('residual', 'capability'), 'residualCapability');
  assert.equal('setRatingCell' in assessmentOps, false, 'no picking a matrix cell');
});

test('capability is assessed like the others; half an assessment is kept but not a level', () => {
  let d = set(seed(), 'initial', 'capability', 'C', null);
  assert.equal(bandOf(ratingsOf(d, 'h1', 'p1').initial.capability), 'Uncategorised');
  d = set(d, 'initial', 'capability', undefined, '2');
  assert.deepEqual(ratingsOf(d, 'h1', 'p1').initial.capability, { consequence: 2, likelihood: 'C' });
  assert.throws(() => set(d, 'initial', 'morale', 'A', 1), (e) => e instanceof PivotError && e.code === 'rating.receptor');
});

test('the worst band is over all three; an unassessed receptor is listed as missing', () => {
  let d = set(seed(), 'residual', 'personnel', 'D', 4);
  d = set(d, 'residual', 'environment', 'E', 4);
  d = set(d, 'residual', 'capability', 'C', 2);
  const row = hazardRows(d).find((r) => r.hazard.id === 'h1');
  const p1 = row.platforms.find((p) => p.platform.id === 'p1');
  assert.deepEqual([p1.personnel, p1.environment, p1.capability, p1.band], ['Low', 'Low', 'Serious', 'Serious']);
  assert.equal(row.worstCapability, 'Serious');
  const u = openItems(d, '2026-09-28', 'u1').unrated.find((x) => x.platform.id === 'p1');
  assert.deepEqual(u.missing, ['initial personnel', 'initial environment', 'initial capability']);
  assert.deepEqual(platformCards(d, '2026-09-28', 'u1')[0].bands.capability, { Serious: 1 });
});

test('two people assessing different receptors of the same hazard on a platform both keep theirs', () => {
  const base = seed();
  const mine = set(base, 'residual', 'personnel', 'D', 4);
  const theirs = set(base, 'residual', 'capability', 'C', 2, later);
  const { data, conflicts } = mergeData(base, mine, theirs, { by: 'u1', at: '2026-09-28T13:00:00+10:00' });
  assert.deepEqual(conflicts, []);
  const r = ratingsOf(data, 'h1', 'p1').residual;
  assert.deepEqual([r.personnel, r.capability], [{ consequence: 4, likelihood: 'D' }, { consequence: 2, likelihood: 'C' }]);
});
```

- [ ] **Step 2: Run it** — `node --test test/core/capability.test.js`. Expected: FAIL, `receptors.js` not found.

- [ ] **Step 3: Implement**

`src/core/receptors.js`:

```js
/** Whom or what a risk falls on: one list, so every screen, count and report covers each. */
export const RECEPTORS = Object.freeze(['personnel', 'environment', 'capability']);
export const RECEPTOR_WORD = Object.freeze({ personnel: 'Personnel', environment: 'Environment', capability: 'Capability' });
export const RECEPTOR_LETTER = Object.freeze({ personnel: 'P', environment: 'E', capability: 'C' });
/** e.g. `residualCapability`, the key reports use. @param {string} stage @param {string} receptor */
export const stageKey = (stage, receptor) => `${stage}${RECEPTOR_WORD[/** @type {keyof typeof RECEPTOR_WORD} */ (receptor)]}`;
```

`ops/assessment.js`: `import { RECEPTORS } from '../receptors.js'; export { RECEPTORS };` in place of its own constant; the receptor error reads `A risk assessment is for personnel, the environment or capability.`; delete `setRatingCell`. `controller.js`: drop `setRatingCell` from `EDITS`.

`queries.js` (import `RECEPTORS` from `./receptors.js`):
- `ratingsOf`: `Object.fromEntries(['initial','residual'].map((stage) => [stage, Object.fromEntries(RECEPTORS.map((r) => [r, pair(stage, r)]))]))` (keep the JSDoc return shape).
- `worseResidual`: reduce `worseBand` over `RECEPTORS.map((r) => bandOf(ratings.residual[r]))`.
- `hazardRows`: each platform entry spreads `Object.fromEntries(RECEPTORS.map((r) => [r, bandOf(res[r])]))` plus `band` = worst of them; the row adds `worst${RECEPTOR_WORD[r]}` for each receptor via `worstOf(r)`.
- `openItems`: the missing loop iterates `RECEPTORS`.
- `platformCards`: `bands` is `Object.fromEntries(RECEPTORS.map((r) => [r, {}]))`, counted per receptor.

Tests to update (values, not intent): any `deepEqual` of a `ratingsOf(...).initial/.residual` object or a `bands` object gains `capability` (`null` / `{ Uncategorised: n }`); `missing` lists gain the capability entries in order; tests using `setRatingCell(d, act, { …, receptor, value: '4D' })` use `setAssessment(d, act, { …, receptor, likelihood: 'D', consequence: 4 })`; the piece-1 test asserting `setRatingCell` behaviour is replaced by the Step 1 assertion that it is gone.

- [ ] **Step 4: Run** — `node --test test/core/capability.test.js`; then `npm test && npm run typecheck`. Expected: PASS (screen tests that render the platform page's cell dropdowns are updated in Task 3; if they fail here because `setRatingCell` is gone from EDITS, leave the UI render untouched and update only data set-up to `setAssessment`).

- [ ] **Step 5: Commit** — `Capability as a third risk type in the core: one receptor list; levels only from likelihood and consequence`.

---

### Task 2: Capability in reports

**Files:** `src/reports/snapshot.js`, `src/reports/docgen-host.js`; tests `test/reports/snapshot.test.js`, `test/reports/docgen-host.test.js`.

**Produces:** snapshot `ratings` keys `stageKey(stage, r)` for each stage × receptor; `assessments` six entries (stage, then receptor order); Hazards columns generated `initialPersonnel, initialEnvironment, initialCapability, residualPersonnel, residualEnvironment, residualCapability` (labels `Initial risk (capability)` …); the Risk assessments Receptor column reads `RECEPTOR_WORD[r.receptor]`.

- [ ] **Step 1: Failing tests** — snapshot: a capability assessment with `consequenceWhy: 'Mission <lost>'` appears as `row.ratings.initialCapability` and `row.assessments[2]` (`{ stage: 'initial', receptor: 'capability', …, consequenceWhy: 'Mission <lost>' }`), `row.assessments.length === 6`. Docgen: the Hazards column ids equal the list above plus `title`, `phases`, `description` in their places; a capability row in Risk assessments reads `Capability`; the produced HTML shows `Mission &lt;lost&gt;`.
- [ ] **Step 2: Run** — fail.
- [ ] **Step 3: Implement** with `RECEPTORS`/`stageKey`/`RECEPTOR_WORD` (keep the `?? r.initial` / `?? r.residual` fallbacks on the personnel columns).
- [ ] **Step 4: Run** — pass; `npm test && npm run typecheck`.
- [ ] **Step 5: Commit** — `Reports: initial and residual capability columns, and capability in Risk assessments`.

---

### Task 3: Capability on every screen; the platform page shows calculated levels

**Files:** `src/ui/screens/ssra.js` (`WORD` from `RECEPTOR_WORD`, panels over `RECEPTORS`), `src/ui/screens/hazards.js` (tab badge worst of three; Overview Platforms columns per receptor; hazards list letters and worst columns per receptor), `src/ui/screens/platforms.js` (remove `ratingCell`/`ratingOptions`; six read-only `bandTag` level columns with the cell text, e.g. `2C Serious`, else `Not yet assessed`), `src/ui/screens/home.js` (a bar per receptor), `src/ui/screens/reviews.js` (a residual column per receptor, labels `Residual (P)` …); `src/ui/styles.css` (risk panels fit three); tests: `test/ui/screens-ssra.test.js` and the screen tests that pin two-receptor markup.

**Produces:** the platform page Hazards table columns `initialPersonnel … residualCapability` render `<span class="band band-…">2C Serious</span>` (or a muted `Not yet assessed`), sortable by band; no `data-change="setRatingCell"` anywhere.

- [ ] **Step 1: Failing tests** (append to `test/ui/screens-ssra.test.js`):
  - the platform tab has `aria-label="Initial capability likelihood"` and `aria-label="Residual capability consequence"` selects, and three `.risk-panel`s per stage;
  - with only personnel and environment assessed, the tab badge is their worst; after capability residual `2C`, it is `Serious`;
  - the platform page has six `<th data-col="…">` level columns, contains `2C Serious`, and does not match `setRatingCell` or `<option value="2C"`;
  - the hazards list shows `<span class="rx">C</span>` and has `<th data-col="riskCapability"`; filtering `riskCapability: 'Serious'` keeps h1;
  - Home shows `<span class="rx">Capability</span><span class="riskbar">`;
  - the review checklist has `<th data-col="residualCapability"`;
  - a capability justification `<b>x</b>` renders as `&lt;b&gt;x&lt;/b&gt;`.
- [ ] **Step 2: Run** — fail.
- [ ] **Step 3: Implement** each screen from `RECEPTORS`, `RECEPTOR_WORD`, `RECEPTOR_LETTER`, `stageKey`. `.risk-panels` uses `repeat(auto-fit, minmax(300px, 1fr))`.
- [ ] **Step 4: Run** — pass; update screen tests pinning the old two-receptor or cell-dropdown markup; `npm test && npm run typecheck`.
- [ ] **Step 5: Commit** — `Capability on every screen; the platform page shows calculated levels and links to the SSRA tab for editing`.

---

### Task 4: Build and browser check

- [ ] `npm test && npm run typecheck && npm run build`.
- [ ] In the browser, from an existing-style folder (personnel and environment only): the hazard's platform tab shows three panels per stage; setting a capability likelihood alone shows *Not yet assessed*, then with a consequence the level; the badge and hazards list include capability; the platform page shows six calculated levels with no cell pickers and links to the tab; Home shows three bars and names missing capability assessments; the review checklist shows Residual (C); a report has the capability columns and rows; both themes; a narrow window stacks the panels.
- [ ] Commit any fixes, with tests where the fault is in rendering or the controller.
