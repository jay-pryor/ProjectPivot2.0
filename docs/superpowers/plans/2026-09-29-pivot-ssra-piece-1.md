# Pivot SSRA Piece 1: Platform Tabs, Four Risk Assessments, SFARP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace each hazard-on-platform's single initial and residual rating with four risk assessments (initial and residual, for personnel and for the environment), each with a likelihood and its justification, a consequence and its justification, and the assessed level; add SFARP considerations per hazard-on-platform; and give the hazard page a tab per platform that reads like the SSRA.

**Architecture:** Two new per-platform record kinds, `assessment` (`ra:<h>:<p>:<stage>:<receptor>`) and `sfarp` (`sf:<h>:<p>`), written through ops in `src/core/ops/assessment.js`. Old `rating` records are converted on load, deterministically, into four assessments (personnel and environment copied alike) and marked deleted. `ratingOf(data, h, p, receptor = 'personnel')` keeps its shape so existing callers keep working, while `ratingsOf` gives both receptors for the screens that now show them side by side. `setRating` stays as a convenience that sets both receptors unless one is named.

**Tech Stack:** Plain ES modules, JSDoc types checked by `tsc --checkJs`, `node:test`, no runtime dependency, no UI framework.

**Spec:** `docs/superpowers/specs/2026-09-29-pivot-ssra-design.md` (this plan is its piece 1).

## Global Constraints

- Stages are `initial`, `residual`; receptors are `personnel`, `environment`. Personnel and environment use the same matrix; the level is always computed, never stored.
- Assessment id `ra:<hazard>:<platform>:<stage>:<receptor>`; SFARP id `sf:<hazard>:<platform>`.
- Converting old ratings is deterministic: same ids, header values copied from the rating, justifications `''`; the rating is then marked deleted (other fields unchanged). Converting twice gives identical data.
- Unlinking a hazard from a platform deletes its assessments and SFARP in the same entry.
- Everywhere a single residual band was shown for a hazard on a platform, show personnel and environment separately (hazards list, hazard page, platform page, dashboard cards, review checklist). Filters and bands that need one value use the worse of the two.
- Controls, phases and safety reports are pieces 2 and 3: the platform tab in this piece holds the overview (shared), references (shared), initial risk, residual risk and SFARP.
- Every piece of user text written into HTML passes through the `html` tagged template.
- Commands: `npm test`, `npm run typecheck`, `npm run build`, all passing at the end of every task.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on the branch `ssra-piece-1`.

## Review Focus

1. **An old data file with ratings is opened by two people at once**, one saves, then the other. Expect no conflicts from the conversion (identical records) and the second save to merge cleanly. Pinned in Task 1.
2. **Two people write different justifications for the same hazard on the same platform** (one personnel, one environment). Expect both kept. Pinned in Task 1.
3. **A justification typed with markup** (`<b>x</b>`) on a platform tab. Expect it shown literally, in the page and in the report. Pinned in Tasks 4 and 5.
4. **A hazard linked to a platform, assessed, unlinked, and linked back.** Expect the assessments and SFARP to start empty again, like control decisions do. Pinned in Task 1.
5. **Choosing only a likelihood (no consequence yet).** Expect it kept, the level shown as *Uncategorised*, and the item still counted as unrated on Home. Pinned in Tasks 1 and 2.

## File Structure

```
src/core/data.js            + assessment, sfarp kinds; converting old ratings on load
src/core/ids.js             + ids.assessment, ids.sfarp
src/core/ops/assessment.js  + RECEPTORS, setAssessment, setSfarp; setRating/setRatingCell write assessments (receptor optional)
src/core/ops/platforms.js   unlinkHazard deletes assessments and SFARP
src/core/rules.js           + assessment and SFARP need a live hazard-on-platform link
src/core/queries.js         + assessmentOf, ratingsOf, sfarpOf, worseBand; ratingOf(receptor); both receptors in platformHazards, hazardRows, reviewRows, openItems, platformCards; platformsReached
src/reports/snapshot.js     + ratings (four), assessments, sfarp per row
src/reports/docgen-host.js  Hazards: four risk columns; + Risk assessments and SFARP sections
src/ui/controller.js        + setAssessment, setSfarp edits
src/ui/screens/common.js    pageTabs takes a first-tab label
src/ui/screens/ssra.js      NEW: platformTab (the SSRA for one platform), riskPanels
src/ui/screens/hazards.js   tabs per platform; Overview; hazards list personnel/environment columns; textTable exported
src/ui/screens/platforms.js four rating dropdowns
src/ui/screens/home.js      two risk bars per card; unrated wording
src/ui/screens/reviews.js   residual personnel and environment columns
src/ui/styles.css           + SSRA sections and risk panels
test/core/assessments.test.js    NEW
test/ui/screens-ssra.test.js     NEW
(existing tests updated where they pin the old rating record or shapes; each task names them)
```

---

### Task 1: Assessments and SFARP in the data, ops and rules

**Files:**
- Modify: `src/core/data.js`, `src/core/ids.js`, `src/core/ops/assessment.js`, `src/core/ops/platforms.js`, `src/core/rules.js`, `src/core/queries.js` (`platformsReached`, `assessmentOf`, `ratingsOf`, `ratingOf`, `sfarpOf`)
- Test: `test/core/assessments.test.js` (create); update `test/core/ops/assessment.test.js`, `test/core/ops/platforms.test.js`, `test/core/rules.test.js`, `test/ui/controller-pages.test.js`, `test/core/random-edits.js`

**Interfaces:**
- Produces:
  - `KINDS` gains `'assessment', 'sfarp'` (after `'referenceLink'`); `rating` stays (old files).
  - `ids.assessment(h, p, stage, receptor)` → `ra:<h>:<p>:<stage>:<receptor>`; `ids.sfarp(h, p)` → `sf:<h>:<p>`.
  - `RECEPTORS = ['personnel', 'environment']` (from `ops/assessment.js`, beside `STAGES`).
  - `setAssessment(data, act, { hazardId, platformId, stage, receptor, likelihood?, consequence?, likelihoodWhy?, consequenceWhy? })` — any field left out keeps its value; `''`/null clears a likelihood or consequence; action `Set <stage> <receptor> risk`; errors `rating.stage`, `rating.receptor`, `rating.likelihood` / `rating.consequence` (off the scale, from `ratingFor`), `not-found` (no live link).
  - `setRating(data, act, { hazardId, platformId, stage, consequence, likelihood, receptor? })` — sets the pair on one receptor, or both when none is named, in one entry; action `Set initial rating` / `Set residual rating` (both) or `Set <stage> <receptor> risk` (one).
  - `setRatingCell(data, act, { hazardId, platformId, stage, receptor?, value })` — as before, via `setRating`.
  - `setSfarp(data, act, { hazardId, platformId, justification?, conclusion?, conditions? })` — action `Edit SFARP considerations`.
  - `assessmentOf(data, h, p, stage, receptor)` → the live record or null.
  - `ratingsOf(data, h, p)` → `{ initial: { personnel, environment }, residual: { personnel, environment } }`, each `{ consequence, likelihood }` or null (null when both are unset).
  - `ratingOf(data, h, p, receptor = 'personnel')` → `{ initial, residual }` for that receptor (the old shape).
  - `sfarpOf(data, h, p)` → `{ justification, conclusion, conditions }` (`''` when none).
  - Rules `assessment-without-platform-link`, `sfarp-without-platform-link` (records `[record, hazardPlatform]`).
  - `platformsReached` for `assessment` and `sfarp` → `[rec.platformId]`.

- [ ] **Step 1: Write the failing test**

Create `test/core/assessments.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { KINDS, emptyData, normalizeData, put, created } from '../../src/core/data.js';
import { ids } from '../../src/core/ids.js';
import { entries } from '../../src/core/history.js';
import { checkRules } from '../../src/core/rules.js';
import { mergeData } from '../../src/core/merge.js';
import { RECEPTORS, STAGES, setAssessment, setRating, setRatingCell, setSfarp } from '../../src/core/ops/assessment.js';
import { unlinkHazard, linkHazard } from '../../src/core/ops/platforms.js';
import { assessmentOf, ratingsOf, ratingOf, sfarpOf, platformsReached, bandOf } from '../../src/core/queries.js';
import { act, later, seed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const A = (d, stage, receptor) => assessmentOf(d, 'h1', 'p1', stage, receptor);

test('four assessments per hazard on a platform, and SFARP, are records built from what they join', () => {
  assert.ok(KINDS.includes('assessment') && KINDS.includes('sfarp'));
  assert.deepEqual([STAGES, RECEPTORS], [['initial', 'residual'], ['personnel', 'environment']]);
  assert.equal(ids.assessment('h1', 'p1', 'initial', 'personnel'), 'ra:h1:p1:initial:personnel');
  assert.equal(ids.sfarp('h1', 'p1'), 'sf:h1:p1');
});

test('an assessment: likelihood and consequence with their justifications; each part kept when another changes', () => {
  let d = setAssessment(seed(), act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihood: 'C' });
  assert.deepEqual([A(d, 'initial', 'personnel').likelihood, A(d, 'initial', 'personnel').consequence], ['C', null]);
  assert.equal(bandOf(ratingsOf(d, 'h1', 'p1').initial.personnel), 'Uncategorised', 'half an assessment has no level yet');
  d = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', consequence: '2', likelihoodWhy: '  Seen twice a year  ' });
  const a = A(d, 'initial', 'personnel');
  assert.deepEqual([a.likelihood, a.consequence, a.likelihoodWhy, a.consequenceWhy], ['C', 2, 'Seen twice a year', '']);
  assert.equal(bandOf(ratingsOf(d, 'h1', 'p1').initial.personnel), 'Serious');
  assert.equal(entries(d).at(-1).action, 'Set initial personnel risk');
  assert.equal(A(d, 'initial', 'environment'), null, 'environment is its own record');
  assert.equal(setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihood: '' }).records.assessment['ra:h1:p1:initial:personnel'].likelihood, null);
  assert.throws(() => setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'final', receptor: 'personnel' }), code('rating.stage'));
  assert.throws(() => setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'plants' }), code('rating.receptor'));
  assert.throws(() => setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihood: 'Z' }), code('rating.likelihood'));
  assert.throws(() => setAssessment(d, act, { hazardId: 'h2', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihood: 'A' }), code('not-found'));
});

test('setRating sets both receptors unless one is named; setRatingCell likewise', () => {
  let d = setRating(seed(), act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 2, likelihood: 'C' });
  assert.deepEqual(ratingsOf(d, 'h1', 'p1').residual, { personnel: { consequence: 2, likelihood: 'C' }, environment: { consequence: 2, likelihood: 'C' } });
  assert.equal(entries(d).at(-1).action, 'Set residual rating');
  assert.deepEqual(ratingOf(d, 'h1', 'p1'), { initial: null, residual: { consequence: 2, likelihood: 'C' } });
  d = setRatingCell(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'environment', value: '4D' });
  assert.deepEqual(ratingOf(d, 'h1', 'p1', 'environment').residual, { consequence: 4, likelihood: 'D' });
  assert.deepEqual(ratingOf(d, 'h1', 'p1').residual, { consequence: 2, likelihood: 'C' });
  assert.equal(entries(d).at(-1).action, 'Set residual environment risk');
});

test('SFARP considerations per hazard on a platform', () => {
  assert.deepEqual(sfarpOf(seed(), 'h1', 'p1'), { justification: '', conclusion: '', conditions: '' });
  let d = setSfarp(seed(), act, { hazardId: 'h1', platformId: 'p1', justification: 'All reasonable controls in place', conclusion: 'SFARP' });
  d = setSfarp(d, act, { hazardId: 'h1', platformId: 'p1', conditions: 'Valid while crew trained' });
  assert.deepEqual(sfarpOf(d, 'h1', 'p1'), { justification: 'All reasonable controls in place', conclusion: 'SFARP', conditions: 'Valid while crew trained' });
  assert.equal(entries(d).at(-1).action, 'Edit SFARP considerations');
  assert.deepEqual(sfarpOf(d, 'h1', 'p2'), { justification: '', conclusion: '', conditions: '' });
});

test('unlinking clears assessments and SFARP; linking back starts empty; the rules hold', () => {
  let d = setRating(seed(), act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', consequence: 1, likelihood: 'A' });
  d = setSfarp(d, act, { hazardId: 'h1', platformId: 'p1', conclusion: 'x' });
  assert.deepEqual(platformsReached(d, 'assessment', d.records.assessment['ra:h1:p1:initial:personnel']), ['p1']);
  assert.deepEqual(platformsReached(d, 'sfarp', d.records.sfarp['sf:h1:p1']), ['p1']);
  d = unlinkHazard(d, later, { hazardId: 'h1', platformId: 'p1' });
  assert.equal(d.records.assessment['ra:h1:p1:initial:personnel'].status, 'deleted');
  assert.equal(d.records.sfarp['sf:h1:p1'].status, 'deleted');
  assert.deepEqual(checkRules(d), []);
  d = linkHazard(d, later, { hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual(ratingsOf(d, 'h1', 'p1').initial, { personnel: null, environment: null });
  assert.deepEqual(sfarpOf(d, 'h1', 'p1').conclusion, '');
  const orphan = put(seed(), 'assessment', created(act, 'ra:h2:p1:initial:personnel', { hazardId: 'h2', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihood: 'A', consequence: 1, likelihoodWhy: '', consequenceWhy: '' }));
  assert.deepEqual(checkRules(orphan).map((v) => v.rule), ['assessment-without-platform-link']);
});

test('old ratings become four assessments on load, the same each time, and the rating is retired', () => {
  const old = seed();
  old.records.rating['rt:h1:p1'] = created(act, 'rt:h1:p1', { hazardId: 'h1', platformId: 'p1', initial: { consequence: 1, likelihood: 'B' }, residual: { consequence: 3, likelihood: 'D' } });
  const d = normalizeData(old);
  assert.deepEqual(ratingsOf(d, 'h1', 'p1'), {
    initial: { personnel: { consequence: 1, likelihood: 'B' }, environment: { consequence: 1, likelihood: 'B' } },
    residual: { personnel: { consequence: 3, likelihood: 'D' }, environment: { consequence: 3, likelihood: 'D' } },
  });
  const a = d.records.assessment['ra:h1:p1:initial:personnel'];
  assert.deepEqual([a.createdBy, a.createdAt, a.likelihoodWhy, a.consequenceWhy], [act.by, act.at, '', '']);
  assert.equal(d.records.rating['rt:h1:p1'].status, 'deleted');
  assert.deepEqual(normalizeData(structuredClone(old)), d, 'converting again gives identical data');
  assert.deepEqual(normalizeData(d), d, 'converting converted data changes nothing');
  assert.deepEqual(checkRules(d), []);
  const mine = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihoodWhy: 'Mine' });
  const theirs = setAssessment(normalizeData(structuredClone(old)), later, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'environment', likelihoodWhy: 'Theirs' });
  const { data, conflicts } = mergeData(d, mine, theirs, { by: 'u1', at: '2026-09-28T13:00:00+10:00' });
  assert.deepEqual(conflicts, []);
  assert.equal(data.records.assessment['ra:h1:p1:initial:personnel'].likelihoodWhy, 'Mine');
  assert.equal(data.records.assessment['ra:h1:p1:initial:environment'].likelihoodWhy, 'Theirs');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/core/assessments.test.js`
Expected: FAIL — `RECEPTORS` is not exported.

- [ ] **Step 3: Write the implementation**

`src/core/data.js`:
- `KINDS`: add `'assessment', 'sfarp',` after `'reference', 'referenceLink',`.
- In `normalizeData`, after the control-tier block, add:

```js
  // Ratings written before assessments existed become four assessments, personnel and
  // environment alike, and the rating is retired. The same file always converts the same way,
  // so two people opening it write identical records.
  const assessment = { ...records.assessment };
  const rating = { ...records.rating };
  for (const [rid, r] of Object.entries(rating)) {
    if (!isObject(r) || r.status === 'deleted') continue;
    for (const stage of ['initial', 'residual']) {
      for (const receptor of ['personnel', 'environment']) {
        const id = `ra:${r.hazardId}:${r.platformId}:${stage}:${receptor}`;
        if (assessment[id]) continue;
        const pair = isObject(r[stage]) ? r[stage] : null;
        assessment[id] = {
          id, status: r.status, createdBy: r.createdBy, createdAt: r.createdAt, updatedBy: r.updatedBy, updatedAt: r.updatedAt,
          hazardId: r.hazardId, platformId: r.platformId, stage, receptor,
          likelihood: pair?.likelihood ?? null, consequence: pair?.consequence ?? null, likelihoodWhy: '', consequenceWhy: '',
        };
      }
    }
    rating[rid] = { ...r, status: 'deleted' };
  }
  records.assessment = assessment;
  records.rating = rating;
```

`src/core/ids.js`, in `ids` after `rating`:

```js
  /** @param {string} h @param {string} p @param {string} s stage @param {string} r receptor */
  assessment: (h, p, s, r) => `ra:${h}:${p}:${s}:${r}`,
  /** @param {string} h @param {string} p */
  sfarp: (h, p) => `sf:${h}:${p}`,
```

`src/core/ops/assessment.js` — replace everything from `export const STAGES` to the end of the file with:

```js
export const STAGES = Object.freeze(['initial', 'residual']);
export const RECEPTORS = Object.freeze(['personnel', 'environment']);

/** @param {unknown} v */
const blank = (v) => v === '' || v == null;

/** @param {unknown} consequence @param {unknown} likelihood */
function readPair(consequence, likelihood) {
  const c = blank(consequence) ? null : Number(consequence);
  const l = blank(likelihood) ? null : String(likelihood);
  ratingFor(c, l); // throws rating.consequence or rating.likelihood when either is off its scale
  return { consequence: c, likelihood: l };
}

/** @param {string} stage @param {string} receptor */
function needScope(stage, receptor) {
  if (!STAGES.includes(stage)) throw new PivotError('rating.stage', 'A risk assessment is initial or residual.');
  if (!RECEPTORS.includes(receptor)) throw new PivotError('rating.receptor', 'A risk assessment is for personnel or the environment.');
}

/**
 * The record one assessment becomes after a change; fields left out keep their value.
 * @param {Data} data @param {Act} act
 * @param {{ hazardId: string, platformId: string, stage: string, receptor: string, likelihood?: unknown, consequence?: unknown, likelihoodWhy?: unknown, consequenceWhy?: unknown }} a
 */
function assessmentRec(data, act, a) {
  needScope(a.stage, a.receptor);
  need(data, 'hazardPlatform', ids.hazardPlatform(a.hazardId, a.platformId));
  const id = ids.assessment(a.hazardId, a.platformId, a.stage, a.receptor);
  const existing = get(data, 'assessment', id);
  const cur = existing && existing.status === 'live' ? existing : { likelihood: null, consequence: null, likelihoodWhy: '', consequenceWhy: '' };
  const pair = readPair(a.consequence === undefined ? cur.consequence : a.consequence, a.likelihood === undefined ? cur.likelihood : a.likelihood);
  const fields = {
    likelihood: pair.likelihood, consequence: pair.consequence,
    likelihoodWhy: a.likelihoodWhy === undefined ? cur.likelihoodWhy : String(a.likelihoodWhy ?? '').trim(),
    consequenceWhy: a.consequenceWhy === undefined ? cur.consequenceWhy : String(a.consequenceWhy ?? '').trim(),
  };
  if (!existing) return created(act, id, { hazardId: a.hazardId, platformId: a.platformId, stage: a.stage, receptor: a.receptor, ...fields });
  return changed(existing, act, { ...fields, status: 'live' });
}

/**
 * One of the four risk assessments of a hazard on a platform.
 * @param {Data} data @param {Act} act
 * @param {{ hazardId: string, platformId: string, stage: string, receptor: string, likelihood?: unknown, consequence?: unknown, likelihoodWhy?: unknown, consequenceWhy?: unknown }} args
 */
export function setAssessment(data, act, args) {
  return commit(data, act, `Set ${args.stage} ${args.receptor} risk`, [{ kind: 'assessment', rec: assessmentRec(data, act, args) }]);
}

/**
 * A stage's likelihood and consequence for one receptor, or for both when none is named.
 * @param {Data} data @param {Act} act
 * @param {{ hazardId: string, platformId: string, stage: string, consequence: unknown, likelihood: unknown, receptor?: string }} args
 */
export function setRating(data, act, { hazardId, platformId, stage, consequence, likelihood, receptor }) {
  const receptors = receptor ? [receptor] : RECEPTORS;
  const recs = receptors.map((r) => ({ kind: 'assessment', rec: assessmentRec(data, act, { hazardId, platformId, stage, receptor: r, consequence, likelihood }) }));
  const action = receptor ? `Set ${stage} ${receptor} risk` : stage === 'initial' ? 'Set initial rating' : 'Set residual rating';
  return commit(data, act, action, recs);
}

/**
 * A stage's rating from a matrix cell as a single dropdown gives it: `2C`, or blank.
 * @param {Data} data @param {Act} act
 * @param {{ hazardId: string, platformId: string, stage: string, receptor?: string, value: string }} args
 */
export function setRatingCell(data, act, { hazardId, platformId, stage, receptor, value }) {
  const v = String(value ?? '').trim();
  if (v === '') return setRating(data, act, { hazardId, platformId, stage, receptor, consequence: null, likelihood: null });
  const m = /^([1-5])([A-G])$/.exec(v);
  if (!m) throw new PivotError('rating.cell', `${v} is not a cell of the risk matrix.`);
  return setRating(data, act, { hazardId, platformId, stage, receptor, consequence: Number(m[1]), likelihood: m[2] });
}

/**
 * SFARP considerations for a hazard on a platform; fields left out keep their value.
 * @param {Data} data @param {Act} act
 * @param {{ hazardId: string, platformId: string, justification?: unknown, conclusion?: unknown, conditions?: unknown }} args
 */
export function setSfarp(data, act, { hazardId, platformId, justification, conclusion, conditions }) {
  need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  const id = ids.sfarp(hazardId, platformId);
  const existing = get(data, 'sfarp', id);
  const cur = existing && existing.status === 'live' ? existing : { justification: '', conclusion: '', conditions: '' };
  const text = (/** @type {unknown} */ v, /** @type {string} */ was) => (v === undefined ? was : String(v ?? '').trim());
  const fields = { justification: text(justification, cur.justification), conclusion: text(conclusion, cur.conclusion), conditions: text(conditions, cur.conditions) };
  const rec = existing ? changed(existing, act, { ...fields, status: 'live' }) : created(act, id, { hazardId, platformId, ...fields });
  return commit(data, act, 'Edit SFARP considerations', [{ kind: 'sfarp', rec }]);
}
```

(The old `readPair` returned null for an all-blank pair; nothing else uses it.)

`src/core/ops/platforms.js`, in `unlinkHazard` replace the `rating` lines with:

```js
  for (const kind of ['assessment', 'sfarp', 'rating']) {
    for (const r of live(data, kind)) {
      if (r.hazardId === hazardId && r.platformId === platformId) recs.push({ kind, rec: changed(r, act, { status: 'deleted' }) });
    }
  }
```

`src/core/rules.js`, replace the `rating` loop with:

```js
  for (const kind of ['rating', 'assessment', 'sfarp']) {
    for (const r of live(data, kind)) {
      const hp = ids.hazardPlatform(r.hazardId, r.platformId);
      if (!liveRec('hazardPlatform', hp)) out.push({ rule: `${kind}-without-platform-link`, message: `A ${kind === 'sfarp' ? 'SFARP record' : 'risk assessment'} exists for a platform the hazard is not on.`, records: [{ kind, id: r.id }, { kind: 'hazardPlatform', id: hp }] });
    }
  }
```

`src/core/queries.js`:
- import `STAGES`, `RECEPTORS`? No — queries must not import ops (cycle risk); define locally `const STAGE_LIST = ['initial', 'residual']; const RECEPTOR_LIST = ['personnel', 'environment'];`.
- `platformsReached`: add `case 'assessment':` and `case 'sfarp':` to the `hazardPlatform`/`ruling`/`rating`/`report` group returning `[rec.platformId]`.
- Replace `ratingOf` with:

```js
/** One assessment's live record, or null. @param {Data} data @param {string} hazardId @param {string} platformId @param {string} stage @param {string} receptor */
export function assessmentOf(data, hazardId, platformId, stage, receptor) {
  const r = get(data, 'assessment', ids.assessment(hazardId, platformId, stage, receptor));
  return r && r.status === 'live' ? r : null;
}

/**
 * Both stages for both receptors, each as `{ consequence, likelihood }` (the matrix's input), or
 * null when neither is set.
 * @param {Data} data @param {string} hazardId @param {string} platformId
 */
export function ratingsOf(data, hazardId, platformId) {
  /** @param {string} stage @param {string} receptor */
  const pair = (stage, receptor) => {
    const a = assessmentOf(data, hazardId, platformId, stage, receptor);
    return a && (a.likelihood != null || a.consequence != null) ? { consequence: a.consequence, likelihood: a.likelihood } : null;
  };
  return {
    initial: { personnel: pair('initial', 'personnel'), environment: pair('initial', 'environment') },
    residual: { personnel: pair('residual', 'personnel'), environment: pair('residual', 'environment') },
  };
}

/** One receptor's initial and residual (personnel unless named): the shape callers had before assessments. @param {Data} data @param {string} hazardId @param {string} platformId @param {'personnel' | 'environment'} [receptor] */
export function ratingOf(data, hazardId, platformId, receptor = 'personnel') {
  const r = ratingsOf(data, hazardId, platformId);
  return { initial: r.initial[receptor], residual: r.residual[receptor] };
}

/** @param {Data} data @param {string} hazardId @param {string} platformId */
export function sfarpOf(data, hazardId, platformId) {
  const r = get(data, 'sfarp', ids.sfarp(hazardId, platformId));
  return r && r.status === 'live'
    ? { justification: r.justification ?? '', conclusion: r.conclusion ?? '', conditions: r.conditions ?? '' }
    : { justification: '', conclusion: '', conditions: '' };
}
```

Update the existing tests that pinned the old record:
- `test/core/ops/assessment.test.js`: every `d.records.rating[ids.rating('h1', 'p1')].<stage>` becomes `ratingOf(d, 'h1', 'p1').<stage>` (import `ratingOf` from queries); a `.residual` of `{ consequence: 4, likelihood: null }` stays that shape; `toBeNull` checks stay.
- `test/ui/controller-pages.test.js:71`: `assert.deepEqual(ratingOf(W(c), 'h1', 'p1').initial, { consequence: 1, likelihood: 'C' });` (import `ratingOf`); the action stays `Set initial rating`.
- `test/core/ops/platforms.test.js:51-55`: set the rating with `setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 2, likelihood: 'C' })` and assert `d.records.assessment['ra:h1:p1:residual:personnel'].status === 'deleted'`.
- `test/core/rules.test.js:48-49`: put an `assessment` record (as in the new test's `orphan`) and expect `['assessment-without-platform-link']`.
- `test/core/random-edits.js`: add `() => setAssessment(d, act, { hazardId: pick(rand, hz), platformId: pick(rand, pl), stage: pick(rand, ['initial', 'residual']), receptor: pick(rand, ['personnel', 'environment']), likelihood: pick(rand, [...'ABCDEFG']), likelihoodWhy: `Why ${n()}` })` and `() => setSfarp(d, act, { hazardId: pick(rand, hz), platformId: pick(rand, pl), conclusion: `C ${n()}` })` (import both).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/core/assessments.test.js test/core/ops/assessment.test.js test/core/merge.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src/core test/core test/ui/controller-pages.test.js
git commit -m "Four risk assessments per hazard on a platform (initial and residual, personnel and environment, each with justifications) and SFARP considerations; old ratings convert on load

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Both receptors in the derived views

**Files:**
- Modify: `src/core/queries.js` (`platformHazards`, `filterHazards`, `filterControls`, `hazardRows`, `reviewRows`, `openItems`, `platformCards`; add `worseBand`)
- Test: `test/core/assessments.test.js` (append); update `test/core/open-items.test.js`, `test/core/dashboard.test.js`

**Interfaces:**
- Produces:
  - `worseBand(a, b)` → the higher of two bands (BANDS order).
  - `platformHazards` rows gain `ratings` (from `ratingsOf`); `rating` stays (personnel).
  - `filterHazards` and `filterControls` rows' `band` is the worse of the residual personnel and environment bands.
  - `hazardRows` platforms entries: `{ platform, band, personnel, environment }` (residual bands; `band` the worse); rows gain `worstPersonnel`, `worstEnvironment`; `worst` is the worse of both.
  - `reviewRows` items gain `ratings` (null where `rating` is null).
  - `openItems().unrated[].missing` becomes a list, in order, of the incomplete assessments: `'initial personnel'`, `'initial environment'`, `'residual personnel'`, `'residual environment'` (an assessment is incomplete without both a likelihood and a consequence).
  - `platformCards()[].bands` becomes `{ personnel: Record<band, number>, environment: Record<band, number> }`.

- [ ] **Step 1: Write the failing test**

Append to `test/core/assessments.test.js` (import `platformHazards`, `hazardRows`, `openItems`, `platformCards`, `worseBand`, `filterHazards` from queries):

```js
test('derived views carry personnel and environment separately; one-value views take the worse', () => {
  let d = setRatingCell(seed(), act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'personnel', value: '4D' });
  d = setRatingCell(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'environment', value: '2C' });
  assert.equal(worseBand('Low', 'Serious'), 'Serious');
  assert.deepEqual(platformHazards(d, 'p1')[0].ratings.residual, { personnel: { consequence: 4, likelihood: 'D' }, environment: { consequence: 2, likelihood: 'C' } });
  const row = hazardRows(d).find((r) => r.hazard.id === 'h1');
  const p1 = row.platforms.find((p) => p.platform.id === 'p1');
  assert.deepEqual([p1.personnel, p1.environment, p1.band], ['Low', 'Serious', 'Serious']);
  assert.deepEqual([row.worstPersonnel, row.worstEnvironment, row.worst], ['Low', 'Serious', 'Serious']);
  assert.deepEqual(filterHazards(d, { band: 'Serious' }).map((r) => r.platform.id), ['p1']);
  const u = openItems(d, '2026-09-28', 'u1').unrated;
  assert.deepEqual(u.map((x) => x.missing), [['initial personnel', 'initial environment']]);
  const half = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihood: 'B' });
  assert.deepEqual(openItems(half, '2026-09-28', 'u1').unrated[0].missing, ['initial personnel', 'initial environment'], 'a likelihood alone is not complete');
  assert.deepEqual(platformCards(d, '2026-09-28', 'u1')[0].bands, { personnel: { Low: 1 }, environment: { Serious: 1 } });
});
```

Update expectations:
- `test/core/open-items.test.js`: `names(o.unrated)` used `missing` as the last part; change the helper `names` to use `x.missing?.join?.('+') ?? x.missing` and the expectations to `'p1:h1:initial personnel+initial environment'` (p1 had initial set only: `'p1:h1:residual personnel+residual environment'` — use whichever the test's data leaves unset) and `'p2:h1:initial personnel+initial environment+residual personnel+residual environment'`.
- `test/core/dashboard.test.js`: `bands: { Serious: 1 }` → `bands: { personnel: { Serious: 1 }, environment: { Serious: 1 } }`; `{ Uncategorised: 1 }` → `{ personnel: { Uncategorised: 1 }, environment: { Uncategorised: 1 } }`; `bands: {}` → `bands: { personnel: {}, environment: {} }`; the rating `missing` pairs become lists: `['p1', ['initial personnel', 'initial environment']]`, `['p2', [all four]]`, `['p3', [all four]]`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/core/assessments.test.js`
Expected: FAIL — `worseBand` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/core/queries.js`:

```js
/** The higher of two bands. @param {string} a @param {string} b */
export function worseBand(a, b) {
  return BANDS[Math.min(BANDS.indexOf(a), BANDS.indexOf(b))];
}

/** The worse residual band of a hazard on a platform, over personnel and environment. @param {Data} data @param {string} hazardId @param {string} platformId */
function worseResidual(data, hazardId, platformId) {
  const r = ratingsOf(data, hazardId, platformId).residual;
  return worseBand(bandOf(r.personnel), bandOf(r.environment));
}
```

- `platformHazards`: add `ratings: ratingsOf(data, hazard.id, platformId),` beside `rating`.
- `filterHazards` and `filterControls`: `const band = worseResidual(data, hazard.id, <platformId>);`.
- `hazardRows`:

```js
    const platforms = live(data, 'hazardPlatform').filter((l) => l.hazardId === hazard.id).map((l) => {
      const r = ratingsOf(data, hazard.id, l.platformId).residual;
      const personnel = bandOf(r.personnel);
      const environment = bandOf(r.environment);
      return { platform: /** @type {Rec} */ (get(data, 'platform', l.platformId)), band: worseBand(personnel, environment), personnel, environment };
    });
    /** @param {'band' | 'personnel' | 'environment'} k */
    const worstOf = (k) => (platforms.length ? BANDS[Math.min(...platforms.map((p) => BANDS.indexOf(p[k])))] : null);
    return { hazard, platforms, worst: worstOf('band'), worstPersonnel: worstOf('personnel'), worstEnvironment: worstOf('environment') };
```

- `reviewRows` item: add `ratings: ph ? ph.ratings : null,`.
- `openItems`, replace the unrated lines with:

```js
      const incomplete = (/** @type {any} */ pair) => !pair || pair.consequence == null || pair.likelihood == null;
      const missing = [];
      for (const stage of ['initial', 'residual']) for (const receptor of ['personnel', 'environment']) {
        if (incomplete(ph.ratings[stage][receptor])) missing.push(`${stage} ${receptor}`);
      }
      if (missing.length) out.unrated.push({ platform, hazard: ph.hazard, missing });
```

  and change the typedef's `missing: string` to `missing: string[]`; delete `unratedPair`.
- `platformCards`: `const bands = { personnel: {}, environment: {} };` and for each hazard count `bandOf(h.ratings.residual.personnel)` into `bands.personnel` and `bandOf(h.ratings.residual.environment)` into `bands.environment`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/core/assessments.test.js test/core/open-items.test.js test/core/dashboard.test.js test/core/queries.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: failures only in screen tests that render `missing` or `bands` (Task 6 fixes the screens); if any core test fails, fix it here. To keep the suite green at this commit, make the two screen call sites tolerant now: in `src/ui/screens/home.js` render `missing` with `Array.isArray(item.missing) ? item.missing.join(', ') : item.missing` and call `riskBar(c.bands.personnel)`; in the Open items "Missing" column render the list joined with `, `. Then all pass.

```bash
git add src/core/queries.js src/ui/screens/home.js test/core
git commit -m "Derived views carry personnel and environment residual risk separately, and the worse of the two where one value is needed; unrated items name the incomplete assessments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Reports — four risk columns, Risk assessments, SFARP

**Files:**
- Modify: `src/reports/snapshot.js`, `src/reports/docgen-host.js`
- Test: `test/reports/snapshot.test.js`, `test/reports/docgen-host.test.js` (append; update pinned shapes and the section list)

**Interfaces:**
- Produces: snapshot rows gain `ratings: { initialPersonnel, initialEnvironment, residualPersonnel, residualEnvironment }` (pairs), `assessments: { stage, receptor, likelihood, likelihoodWhy, consequence, consequenceWhy, level }[]` (four, in stage then receptor order; `level` from `formatRating`), `sfarp: { justification, conclusion, conditions }`; `initial`/`residual` stay (personnel). Designer: Hazards has columns `initialPersonnel`, `initialEnvironment`, `residualPersonnel`, `residualEnvironment` (labels *Initial risk (personnel)* …) instead of `initial`/`residual`; new sections `assessments` (*Risk assessments*) and `sfarp` (*SFARP considerations*).

- [ ] **Step 1: Write the failing tests**

Append to `test/reports/snapshot.test.js` (import `setAssessment`, `setSfarp` from `../../src/core/ops/assessment.js`):

```js
test('a snapshot carries the four assessments with their justifications, and SFARP', () => {
  let d = setAssessment(assessed(), act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'environment', likelihood: 'E', consequence: 4, likelihoodWhy: 'Rare <spill>', consequenceWhy: 'Contained' });
  d = setSfarp(d, act, { hazardId: 'h1', platformId: 'p1', justification: 'J', conclusion: 'C', conditions: 'V' });
  const row = buildSnapshot(d, 'p1', opts).rows[0];
  assert.deepEqual(row.ratings.initialEnvironment, { consequence: 4, likelihood: 'E' });
  assert.deepEqual(row.assessments.map((a) => [a.stage, a.receptor]), [['initial', 'personnel'], ['initial', 'environment'], ['residual', 'personnel'], ['residual', 'environment']]);
  assert.deepEqual(row.assessments[1], { stage: 'initial', receptor: 'environment', likelihood: 'E', likelihoodWhy: 'Rare <spill>', consequence: 4, consequenceWhy: 'Contained', level: '4E = Low' });
  assert.deepEqual(row.sfarp, { justification: 'J', conclusion: 'C', conditions: 'V' });
});
```

(In the company matrix 4E is Low and 2C is Serious.)

In `test/reports/docgen-host.test.js`, change the section list to `['hazards', 'controls', 'causes', 'references', 'assessments', 'sfarp']`, and append:

```js
test('Hazards has four risk columns; Risk assessments and SFARP sections', async () => {
  const { setAssessment, setSfarp } = await import('../../src/core/ops/assessment.js');
  let data = assignHazardNumbers(seed());
  data = setAssessment(data, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'environment', likelihood: 'C', consequence: 2, consequenceWhy: 'Large spill' });
  data = setSfarp(data, act, { hazardId: 'h1', platformId: 'p1', conclusion: 'SFARP achieved' });
  const docs = createDocHost({ getData: () => data, setDesign: () => {}, clock: fixedClock('2026-09-28T10:00:00+10:00'), profileName: (id) => id });
  const secs = docs.host.sections({ subjectId: 'p1' });
  const hz = secs.find((s) => s.id === 'hazards');
  assert.deepEqual(hz.columns.map((c) => c.id), ['title', 'initialPersonnel', 'initialEnvironment', 'residualPersonnel', 'residualEnvironment', 'description']);
  assert.equal(hz.columns.find((c) => c.id === 'residualEnvironment').get(hz.rows()[0]), '2C = Serious');
  const ra = secs.find((s) => s.id === 'assessments');
  assert.equal(ra.label, 'Risk assessments');
  const envResidual = ra.rows().find((r) => r.stage === 'residual' && r.receptor === 'environment');
  assert.deepEqual(ra.columns.map((c) => c.get(envResidual)), ['Residual', 'Environment', 'C', '', '2', 'Large spill', '2C = Serious']);
  const sf = secs.find((s) => s.id === 'sfarp');
  assert.deepEqual(sf.columns.map((c) => c.label), ['Justification', 'Conclusion', 'Conditions of validity']);
  assert.equal(sf.columns[1].get(sf.rows()[0]), 'SFARP achieved');
});
```

Also update any existing test in these two files that pins a whole row or the Hazards columns to include the new fields.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/reports/snapshot.test.js test/reports/docgen-host.test.js`
Expected: FAIL — `row.ratings` is undefined; section list differs.

- [ ] **Step 3: Write the implementation**

`src/reports/snapshot.js`: import `ratingsOf`, `assessmentOf`, `sfarpOf` from queries and `formatRating` from `../core/matrix.js`; extend the `SnapshotRow` typedef; in the row mapping add:

```js
      ratings: {
        initialPersonnel: r.ratings.initial.personnel, initialEnvironment: r.ratings.initial.environment,
        residualPersonnel: r.ratings.residual.personnel, residualEnvironment: r.ratings.residual.environment,
      },
      assessments: ['initial', 'residual'].flatMap((stage) => ['personnel', 'environment'].map((receptor) => {
        const a = assessmentOf(data, r.hazard.id, platformId, stage, receptor);
        return {
          stage, receptor, likelihood: a?.likelihood ?? null, likelihoodWhy: a?.likelihoodWhy ?? '',
          consequence: a?.consequence ?? null, consequenceWhy: a?.consequenceWhy ?? '',
          level: formatRating(r.ratings[stage][receptor]),
        };
      })),
      sfarp: sfarpOf(data, r.hazard.id, platformId),
```

`src/reports/docgen-host.js`: in the `hazards` section replace the `initial` and `residual` columns with:

```js
        { id: 'initialPersonnel', label: 'Initial risk (personnel)', w: 3, get: (/** @type {any} */ r) => formatRating(r.ratings?.initialPersonnel ?? r.initial) },
        { id: 'initialEnvironment', label: 'Initial risk (environment)', w: 3, get: (/** @type {any} */ r) => formatRating(r.ratings?.initialEnvironment ?? null) },
        { id: 'residualPersonnel', label: 'Residual risk (personnel)', w: 3, get: (/** @type {any} */ r) => formatRating(r.ratings?.residualPersonnel ?? r.residual) },
        { id: 'residualEnvironment', label: 'Residual risk (environment)', w: 3, get: (/** @type {any} */ r) => formatRating(r.ratings?.residualEnvironment ?? null) },
```

and append two sections:

```js
    {
      id: 'assessments', label: 'Risk assessments',
      keyColumn: hazardKey,
      columns: [
        { id: 'stage', label: 'Stage', w: 2, get: (/** @type {any} */ r) => (r.stage === 'initial' ? 'Initial' : 'Residual') },
        { id: 'receptor', label: 'Receptor', w: 2, get: (/** @type {any} */ r) => (r.receptor === 'personnel' ? 'Personnel' : 'Environment') },
        { id: 'likelihood', label: 'Likelihood', w: 2, get: (/** @type {any} */ r) => r.likelihood ?? '' },
        { id: 'likelihoodWhy', label: 'Likelihood justification', w: 5, get: (/** @type {any} */ r) => r.likelihoodWhy },
        { id: 'consequence', label: 'Consequence', w: 2, get: (/** @type {any} */ r) => (r.consequence == null ? '' : String(r.consequence)) },
        { id: 'consequenceWhy', label: 'Consequence justification', w: 5, get: (/** @type {any} */ r) => r.consequenceWhy },
        { id: 'level', label: 'Assessed level', w: 3, get: (/** @type {any} */ r) => r.level },
      ],
      rows: rows((x) => x.rows.flatMap((h) => (h.assessments ?? []).map((a) => ({ reportId: h.reportId, ...a })))),
    },
    {
      id: 'sfarp', label: 'SFARP considerations',
      keyColumn: hazardKey,
      columns: [
        { id: 'justification', label: 'Justification', w: 5, get: (/** @type {any} */ r) => r.justification },
        { id: 'conclusion', label: 'Conclusion', w: 4, get: (/** @type {any} */ r) => r.conclusion },
        { id: 'conditions', label: 'Conditions of validity', w: 5, get: (/** @type {any} */ r) => r.conditions },
      ],
      rows: rows((x) => x.rows.map((h) => ({ reportId: h.reportId, ...(h.sfarp ?? { justification: '', conclusion: '', conditions: '' }) }))),
    },
```

(The `?? r.initial` fallbacks let reports produced before this piece still render in the designer preview.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/reports/snapshot.test.js test/reports/docgen-host.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src/reports test/reports
git commit -m "Reports: initial and residual risk for personnel and environment, a Risk assessments section with justifications, and SFARP considerations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The hazard page's platform tabs

**Files:**
- Create: `src/ui/screens/ssra.js`
- Modify: `src/ui/screens/common.js` (`pageTabs` first-tab label), `src/ui/screens/hazards.js` (tabs, export `textTable`, Overview's Platforms table), `src/ui/controller.js` (edits), `src/ui/styles.css`
- Test: `test/ui/screens-ssra.test.js` (create)

**Interfaces:**
- Consumes: Tasks 1–2 (`ratingsOf`, `assessmentOf`, `sfarpOf`, `worseBand`, ops `setAssessment`, `setSfarp`).
- Produces:
  - `pageTabs(view, where, tab, changes, extra = [], first = 'Details')`.
  - The hazard view's tab values: `undefined`/`'details'` → Overview; `'p:<platformId>'` → that platform's SSRA; `'history'`.
  - `platformTab(state, data, hazard, platformId)` and `riskPanels(state, data, hazard, platformId, stage)` in `src/ui/screens/ssra.js`.
  - Controller edits `setAssessment`, `setSfarp`.
  - Change attributes: the likelihood and consequence selects and the two justification textareas use `data-change="setAssessment" data-hazard-id data-platform-id data-stage data-receptor` with `name` `likelihood` / `consequence` / `likelihoodWhy` / `consequenceWhy`; SFARP textareas use `data-change="setSfarp" data-hazard-id data-platform-id` with `name` `justification` / `conclusion` / `conditions`.

- [ ] **Step 1: Write the failing test**

Create `test/ui/screens-ssra.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { setAssessment, setRatingCell, setSfarp } from '../../src/core/ops/assessment.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }] };
const on = (tab) => ({ ...state, view: { name: 'hazard', id: 'h1', tab } });
/** h1 on p1 (Alpha) and p2 (Bravo); Alpha residual: personnel 4D, environment 2C; an initial personnel likelihood with a justification; SFARP written. */
function data(why = 'Seen twice a year') {
  let d = assignNumbers(seed());
  d = setRatingCell(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'personnel', value: '4D' });
  d = setRatingCell(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'environment', value: '2C' });
  d = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihood: 'C', likelihoodWhy: why });
  return setSfarp(d, act, { hazardId: 'h1', platformId: 'p1', conclusion: 'Risk is SFARP' });
}

test('the hazard page has an Overview tab, a tab per platform (with its worst residual), and History', () => {
  const out = hazardView(state, data(), 'h1').toString();
  assert.match(out, /<nav class="tabs">[\s\S]*?>Overview<\/button>/);
  assert.match(out, /data-tab="p:p1">Alpha <span class="band band-serious">Serious<\/span>/);
  assert.match(out, /data-tab="p:p2">Bravo/);
  assert.match(out, /History \(/);
  assert.match(out, /data-table="hazardPlatforms"[\s\S]*?<th data-col="personnel"[\s\S]*?<th data-col="environment"/, 'Overview: residual personnel and environment per platform');
  assert.match(out, /data-action="go" data-view="hazard" data-id="h1" data-tab="p:p1"/, 'each platform row opens its tab');
});

test('a platform tab reads like the SSRA: shared overview, references, initial risk, residual risk, SFARP', () => {
  const out = hazardView(on('p:p1'), data(), 'h1').toString();
  const order = ['Overview', 'References', 'Initial risk', 'Residual risk', 'SFARP considerations'].map((h) => out.indexOf(`<h2>${h}`));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), `sections in SSRA order: ${order}`);
  assert.match(out, /class="shared-mark">Shared across platforms/);
  assert.match(out, /<textarea class="doc-text" name="description"[^>]*data-change="updateHazard"/);
  assert.match(out, /data-table="causalFactor"/);
});

test('risk panels: personnel and environment side by side, each with likelihood, consequence, justifications and the level', () => {
  const out = hazardView(on('p:p1'), data(), 'h1').toString();
  assert.match(out, /<select name="likelihood" aria-label="Initial personnel likelihood" data-change="setAssessment" data-hazard-id="h1" data-platform-id="p1" data-stage="initial" data-receptor="personnel">[\s\S]*?<option value="C" selected>C · Occasional<\/option>/);
  assert.match(out, /<textarea name="likelihoodWhy"[^>]*data-change="setAssessment" data-hazard-id="h1" data-platform-id="p1" data-stage="initial" data-receptor="personnel">Seen twice a year<\/textarea>/);
  assert.match(out, /<select name="consequence" aria-label="Residual environment consequence"[\s\S]*?<option value="2" selected>2 · Critical<\/option>/);
  assert.match(out, /Residual risk[\s\S]*?Personnel[\s\S]*?<span class="band band-low">4D Low<\/span>[\s\S]*?Environment[\s\S]*?<span class="band band-serious">2C Serious<\/span>/);
  assert.match(out, /Initial risk[\s\S]*?<span class="band band-uncategorised">Not yet assessed<\/span>/, 'a likelihood alone has no level');
});

test('SFARP considerations, and text shown literally', () => {
  const out = hazardView(on('p:p1'), data('<b>x</b>'), 'h1').toString();
  assert.match(out, /<textarea name="conclusion"[^>]*data-change="setSfarp" data-hazard-id="h1" data-platform-id="p1">Risk is SFARP<\/textarea>/);
  assert.match(out, /name="justification"[\s\S]*?name="conditions"/);
  assert.match(out, /&lt;b&gt;x&lt;\/b&gt;<\/textarea>/);
  assert.doesNotMatch(out, /<b>x<\/b>/);
});

test('a tab for a platform the hazard is not on shows a note, not a crash', () => {
  assert.match(hazardView(on('p:nope'), data(), 'h1').toString(), /not on that platform/);
});
```

(The matrix's words: C · Occasional and 2 · Critical, from `LIKELIHOODS` and `CONSEQUENCES` in `src/core/matrix.js`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/screens-ssra.test.js`
Expected: FAIL — no Overview tab.

- [ ] **Step 3: Write the implementation**

`src/ui/screens/common.js`: add a `first = 'Details'` parameter to `pageTabs` and use it as the first tab's label.

`src/ui/screens/hazards.js`: `export function textTable` (it is already a named function; add `export`). Then in `hazardView`:
- build `const platformTabs = d.platforms.map((p) => { const r = ratingsOf(data, h.id, p.platform.id).residual; const worst = worseBand(bandOf(r.personnel), bandOf(r.environment)); return [`p:${p.platform.id}`, html`${p.platform.name} ${bandTag(worst)}`]; });` (import `ratingsOf`, `worseBand`);
- `pageTabs('hazard', { id: h.id }, tab, historyCount(...), platformTabs, 'Overview')`;
- after the history line: `if (tab && tab.startsWith('p:')) return html`${head}${platformTab(state, data, h, tab.slice(2))}`;` (import `platformTab` from `./ssra.js`);
- in the Overview's `hazardPlatforms` table replace the `risk` column with:

```js
            { key: 'personnel', label: 'Residual (personnel)', width: 260, minWidth: 150, value: (p) => BANDS.indexOf(bandOf(ratingsOf(data, h.id, p.platform.id).residual.personnel)),
              render: (p) => bandTag(bandOf(ratingsOf(data, h.id, p.platform.id).residual.personnel)) },
            { key: 'environment', label: 'Residual (environment)', width: 260, minWidth: 150, value: (p) => BANDS.indexOf(bandOf(ratingsOf(data, h.id, p.platform.id).residual.environment)),
              render: (p) => bandTag(bandOf(ratingsOf(data, h.id, p.platform.id).residual.environment)) },
            { key: 'ssra', label: '', width: 170, minWidth: 120, sortable: false, render: (p) => go('Open SSRA →', 'hazard', { id: h.id, tab: `p:${p.platform.id}` }) },
```

Create `src/ui/screens/ssra.js`:

```js
import { html } from '../html.js';
import { dataAttrs, option, go, bandTag } from './common.js';
import { referencesCard } from './references.js';
import { textTable } from './hazards.js';
import { get } from '../../core/data.js';
import { ids } from '../../core/ids.js';
import { assessmentOf, ratingsOf, sfarpOf, hazardDetail } from '../../core/queries.js';
import { CONSEQUENCES, LIKELIHOODS, ratingFor } from '../../core/matrix.js';

/** @typedef {import('../../core/data.js').Data} Data */

const WORD = { initial: 'Initial', residual: 'Residual', personnel: 'Personnel', environment: 'Environment' };

/** The assessed level of a pair, as a band tag; a half-entered one says so. @param {any} pair */
function level(pair) {
  const r = ratingFor(pair?.consequence ?? null, pair?.likelihood ?? null);
  return r.cell ? html`<span class="band band-${r.band.toLowerCase().replace(/\s+/g, '-')}">${r.cell} ${r.band}</span>` : html`<span class="band band-uncategorised">Not yet assessed</span>`;
}

/**
 * Initial or residual risk: personnel and environment side by side, each with likelihood and
 * consequence dropdowns, their justifications, and the assessed level.
 * @param {any} state @param {Data} data @param {any} h the hazard @param {string} platformId @param {'initial' | 'residual'} stage
 */
export function riskPanels(state, data, h, platformId, stage) {
  const ratings = ratingsOf(data, h.id, platformId);
  const panel = (/** @type {'personnel' | 'environment'} */ receptor) => {
    const a = assessmentOf(data, h.id, platformId, stage, receptor);
    const at = { change: 'setAssessment', 'hazard-id': h.id, 'platform-id': platformId, stage, receptor };
    const label = `${WORD[stage]} ${receptor}`;
    return html`<div class="risk-panel"><h3>${WORD[receptor]}</h3>
      <label class="risk-field">Likelihood <select name="likelihood" aria-label="${label} likelihood" ${dataAttrs(at)}>${option('', '—', a?.likelihood ?? '')}${LIKELIHOODS.map((l) => option(l.letter, `${l.letter} · ${l.label}`, a?.likelihood ?? ''))}</select></label>
      <textarea name="likelihoodWhy" rows="3" placeholder="Why this likelihood…" aria-label="${label} likelihood justification" ${dataAttrs(at)}>${a?.likelihoodWhy ?? ''}</textarea>
      <label class="risk-field">Consequence <select name="consequence" aria-label="${label} consequence" ${dataAttrs(at)}>${option('', '—', a?.consequence == null ? '' : String(a.consequence))}${CONSEQUENCES.map((c) => option(String(c.level), `${c.level} · ${c.label}`, a?.consequence == null ? '' : String(a.consequence)))}</select></label>
      <textarea name="consequenceWhy" rows="3" placeholder="Why this consequence…" aria-label="${label} consequence justification" ${dataAttrs(at)}>${a?.consequenceWhy ?? ''}</textarea>
      <div class="risk-level">Assessed level ${level(ratings[stage][receptor])}</div>
    </div>`;
  };
  return html`<div class="risk-panels">${panel('personnel')}${panel('environment')}</div>`;
}

const SHARED = html`<span class="shared-mark">Shared across platforms</span>`;

/**
 * One platform's SSRA for a hazard, in the document's order.
 * @param {any} state @param {Data} data @param {any} h the hazard @param {string} platformId
 */
export function platformTab(state, data, h, platformId) {
  const link = get(data, 'hazardPlatform', ids.hazardPlatform(h.id, platformId));
  const p = get(data, 'platform', platformId);
  if (!link || link.status !== 'live' || !p) return html`<p class="muted">This hazard is not on that platform. ${go('Back to the overview', 'hazard', { id: h.id })}</p>`;
  const d = /** @type {NonNullable<ReturnType<typeof hazardDetail>>} */ (hazardDetail(data, h.id));
  const sf = sfarpOf(data, h.id, platformId);
  const sfAt = { change: 'setSfarp', 'hazard-id': h.id, 'platform-id': platformId };
  return html`<article class="doc ssra">
    <section class="ssra-sec"><h2>Overview ${SHARED}</h2>
      <textarea class="doc-text" name="description" rows="3" placeholder="Add a description…" aria-label="Description" ${dataAttrs({ change: 'updateHazard', id: h.id })}>${h.description}</textarea>
      <section class="block">${textTable(state, 'CausalFactor', d.causalFactors, h.id)}</section>
      <section class="block">${textTable(state, 'Consequence', d.consequences, h.id)}</section>
    </section>
    <section class="ssra-sec"><h2>References ${SHARED}</h2><section class="block">${referencesCard(state, data, { kind: 'hazard', id: h.id })}</section></section>
    <section class="ssra-sec"><h2>Initial risk</h2>${riskPanels(state, data, h, platformId, 'initial')}</section>
    <section class="ssra-sec"><h2>Residual risk</h2>${riskPanels(state, data, h, platformId, 'residual')}</section>
    <section class="ssra-sec"><h2>SFARP considerations</h2>
      <div class="sfarp">
        <label>SFARP justification<textarea name="justification" rows="4" aria-label="SFARP justification" ${dataAttrs(sfAt)}>${sf.justification}</textarea></label>
        <label>SFARP conclusion<textarea name="conclusion" rows="2" aria-label="SFARP conclusion" ${dataAttrs(sfAt)}>${sf.conclusion}</textarea></label>
        <label>Conditions of validity<textarea name="conditions" rows="3" aria-label="Conditions of validity" ${dataAttrs(sfAt)}>${sf.conditions}</textarea></label>
      </div>
    </section>
  </article>`;
}
```


`src/ui/controller.js`: add to `EDITS` `setAssessment: assessment.setAssessment, setSfarp: assessment.setSfarp,`.

`src/ui/styles.css`, append:

```css
/* The SSRA on a platform tab */
.ssra-sec { margin: 0 0 26px; }
.ssra-sec > h2 { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; }
.shared-mark { font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 4px; background: var(--p-info-bg); color: var(--p-link); }
.risk-panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 14px; }
.risk-panel { display: grid; gap: 8px; align-content: start; background: var(--p-surface); border: 1px solid var(--p-line); border-radius: 10px; padding: 12px 14px; }
.risk-panel h3 { margin: 0; font-size: 15px; }
.risk-field { display: flex; align-items: center; gap: 8px; font-weight: 700; }
.risk-field select { font-weight: 400; border: 1px solid var(--p-muted); background: var(--p-surface-2); }
.risk-panel textarea, .sfarp textarea { width: 100%; resize: vertical; }
.risk-level { display: flex; align-items: center; gap: 8px; color: var(--p-muted); }
.sfarp { display: grid; gap: 12px; max-width: 1100px; }
.sfarp label { display: grid; gap: 4px; font-weight: 700; }
.sfarp textarea { font-weight: 400; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/screens-ssra.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass. The existing hazard-page tests expecting a `Residual risk` column in `hazardPlatforms` change to the personnel/environment columns; the tabs test expecting `Details` changes to `Overview` for hazards only.

```bash
git add src/ui test/ui
git commit -m "The hazard page gets an Overview tab and a tab per platform that reads like the SSRA: shared overview and references, initial and residual risk for personnel and environment with justifications, and SFARP considerations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Personnel and environment across the other screens

**Files:**
- Modify: `src/ui/screens/platforms.js` (four rating dropdowns), `src/ui/screens/hazards.js` (hazards list), `src/ui/screens/home.js` (two bars; unrated wording; Open items Missing column), `src/ui/screens/reviews.js` (checklist columns)
- Test: `test/ui/screens-ssra.test.js` (append); update existing screen tests that pin the old columns

**Interfaces:**
- Produces: platform page Hazards columns `initialPersonnel`, `initialEnvironment`, `residualPersonnel`, `residualEnvironment` (each a `setRatingCell` dropdown with `data-receptor`), and each hazard linking to `p:<platform>`; hazards list columns `platforms` (each platform with a *P* and an *E* band), `riskPersonnel`, `riskEnvironment` (filters); dashboard cards with two labelled bars; review checklist columns `residualPersonnel`, `residualEnvironment`.

- [ ] **Step 1: Write the failing test**

Append to `test/ui/screens-ssra.test.js` (import `platformView`, `hazardsView` / `homeView`, `platformView`, and `startReview` from reviews ops as needed):

```js
test('the platform page sets all four ratings from the table, and each hazard opens its SSRA tab', async () => {
  const { platformView } = await import('../../src/ui/screens/platforms.js');
  const out = platformView(state, data(), 'p1').toString();
  for (const k of ['initialPersonnel', 'initialEnvironment', 'residualPersonnel', 'residualEnvironment']) assert.match(out, new RegExp(`<th data-col="${k}"`));
  assert.match(out, /data-change="setRatingCell" data-hazard-id="h1" data-platform-id="p1" data-stage="residual" data-receptor="environment"[\s\S]*?<option value="2C" selected>/);
  assert.match(out, /data-action="go" data-view="hazard" data-id="h1" data-tab="p:p1"/);
});

test('the hazards list shows residual personnel and environment separately, each with a filter', async () => {
  const { hazardsView } = await import('../../src/ui/screens/hazards.js');
  const out = hazardsView(state, data()).toString();
  assert.match(out, /Alpha <span class="rx">P<\/span> <span class="band band-low">Low<\/span> <span class="rx">E<\/span> <span class="band band-serious">Serious<\/span>/);
  assert.match(out, /<th data-col="riskPersonnel"/);
  assert.match(out, /<th data-col="riskEnvironment"/);
  const env = hazardsView({ ...state, tables: { hazards: { filters: { riskEnvironment: 'Serious' } } } }, data()).toString();
  assert.match(env, /data-row="h1"/);
  const pers = hazardsView({ ...state, tables: { hazards: { filters: { riskPersonnel: 'Serious' } } } }, data()).toString();
  assert.doesNotMatch(pers, /data-row="h1"/);
});

test('dashboard cards show a personnel and an environment bar; unrated items name what is missing', async () => {
  const { homeView } = await import('../../src/ui/screens/home.js');
  const out = homeView(state, data()).toString();
  assert.match(out, /<span class="rx">Personnel<\/span><span class="riskbar">[\s\S]*?band-low/);
  assert.match(out, /<span class="rx">Environment<\/span><span class="riskbar">[\s\S]*?band-serious/);
  assert.match(out, /no initial personnel, initial environment rating/);
});
```

Update `test/ui/screens-reviews.test.js` / `test/ui/screens-pages.test.js` / `test/ui/screens-register.test.js` / `test/ui/screens-home.test.js` where they pin `data-col="initial"`, `data-col="residual"`, `data-col="risk"`, `data-stage="residual"` without a receptor, or the old riskbar/`missing` wording, to the new columns and wording.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/screens-ssra.test.js`
Expected: FAIL — no `initialPersonnel` column.

- [ ] **Step 3: Write the implementation**

`src/ui/screens/platforms.js`: replace the `initial` and `residual` columns with four, generated:

```js
            ...['initial', 'residual'].flatMap((stage) => ['personnel', 'environment'].map((receptor) => {
              const key = `${stage}${receptor === 'personnel' ? 'Personnel' : 'Environment'}`;
              return { key, label: `${stage === 'initial' ? 'Initial' : 'Residual'} (${receptor})`, width: 250, minWidth: 170,
                value: (/** @type {any} */ r) => BANDS.indexOf(bandOf(r.ratings[stage][receptor])),
                render: (/** @type {any} */ r) => ratingCell(r.ratings[stage][receptor], { 'hazard-id': r.hazard.id, 'platform-id': id, stage, receptor }) };
            })),
```

and make `ratingCell`'s aria-label read `${attrs.stage} ${attrs.receptor} rating`; the hazard column's link becomes `go(r.hazard.title, 'hazard', { id: r.hazard.id, tab: `p:${id}` })`.

`src/ui/screens/hazards.js` (`hazardsView`): the `platforms` column renders each platform as `html`<li>${p.platform.name} <span class="rx">P</span> ${bandTag(p.personnel)} <span class="rx">E</span> ${bandTag(p.environment)}</li>``; replace the `risk` column with two:

```js
        ...[['riskPersonnel', 'personnel', 'worstPersonnel', 'Worst residual (personnel)'], ['riskEnvironment', 'environment', 'worstEnvironment', 'Worst residual (environment)']].map(([key, field, worst, label]) => ({
          key, label, width: 300, minWidth: 150, value: (/** @type {any} */ r) => (r[worst] ? BANDS.indexOf(r[worst]) : null),
          filter: /** @type {const} */ ('select'), options: BANDS.map((b) => /** @type {[string, string]} */ ([b, b])),
          match: (/** @type {any} */ r, /** @type {string} */ v, /** @type {any} */ f) => r.platforms.some((/** @type {any} */ p) => p[field] === v && (!f.platforms || p.platform.id === f.platforms)),
          render: (/** @type {any} */ r) => (r[worst] ? bandTag(r[worst]) : '—'),
        })),
```

`src/ui/screens/home.js`: in the card, replace `${riskBar(c.bands.personnel)}` with

```js
        <span class="rx">Personnel</span>${riskBar(c.bands.personnel)}
        <span class="rx">Environment</span>${riskBar(c.bands.environment)}
```

and the rating attention row's wording with `no ${item.missing.join(', ')} rating`; the Open items *Missing* column renders `r.missing.join(', ')`.

`src/ui/screens/reviews.js`: in the open review's columns replace `initial`/`residual` with `residualPersonnel` (*Residual (P)*) and `residualEnvironment` (*Residual (E)*) reading `i.ratings?.residual.personnel` / `.environment`.

`src/ui/styles.css`: `.rx { font-size: 11px; font-weight: 700; color: var(--p-muted); margin-right: 2px; }`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/screens-ssra.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass (after updating the pinned expectations named in Step 1).

```bash
git add src/ui test/ui
git commit -m "Personnel and environment everywhere risk shows: four rating dropdowns on the platform page, separate columns and filters in the hazards list, two bars per dashboard card, and the review checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Build, and a check in the browser

- [ ] **Step 1: Build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass; `OK wrote …/dist/pivot.html`.

- [ ] **Step 2: Check it in a real browser**

Serve `dist/` and drive it with the Playwright MCP tools (pickers replaced with the browser's private file system). Check:

1. Put an old-format `data.json` (with a `rating` record) into the private file system before opening, or create data, save, and edit the file to the old shape: on opening, the platform tab shows the old rating in both personnel and environment.
2. Create a hazard on two platforms. The hazard page shows Overview, Alpha, Bravo, History. On Alpha: choose likelihood and consequence for each of the four assessments and type justifications (tab away to apply); the level badges update; Bravo's tab stays empty.
3. Edit the description on Alpha's tab: the Overview and Bravo's tab show it (shared).
4. Write SFARP text; reload; it is kept.
5. The platform page shows four dropdowns; the hazards list shows P and E bands and filters on each; the Home card shows two bars.
6. Save, produce a report: the Markdown contains Risk assessments and SFARP considerations tables and four risk columns in Hazards.
7. Both themes.

Fix anything that does not behave as described, with a test where the fault is in rendering or the controller.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A src test
git commit -m "SSRA piece 1: fixes from the browser check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
