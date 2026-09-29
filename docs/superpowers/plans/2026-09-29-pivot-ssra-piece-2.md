# Pivot SSRA Piece 2: The Controls Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the SSRA's two control sections into Pivot: existing controls chosen per hazard-on-platform and shown by tier, and the additional control analysis — the hazard's linked controls with a shared recommendation and justification and, per platform, a status of recommended, planned, implemented or rejected (with a reason).

**Architecture:** The `ruling` record keeps its id and its `state` field, whose values become `recommended`/`planned`/`implemented`/`rejected` (no record still means the default, now `recommended`); old `confirmed`/`excluded` convert on load, deterministically. `hazardControl` gains `recommendation` and `justification`. A new `existingControl` kind (`ec:<h>:<p>:<c>`) joins a library control to a hazard on a platform. Everything that read the old three states reads the four new ones; the field names (`state`, `ruling`, `awaiting` in open items) stay, so the change is in values, not shapes.

**Tech Stack:** Plain ES modules, JSDoc types checked by `tsc --checkJs`, `node:test`, no runtime dependency, no UI framework.

**Spec:** `docs/superpowers/specs/2026-09-29-pivot-ssra-design.md` (this plan is its piece 2).

## Global Constraints

- Statuses, in this order everywhere: `recommended`, `planned`, `implemented`, `rejected`. No ruling record means `recommended`. `rejected` needs a non-empty reason.
- Carrying over: `confirmed` → `implemented`, `excluded` → `rejected` (reason kept); nothing else changes on the record. Converting twice gives identical data.
- Existing control id `ec:<hazard>:<platform>:<control>`; fields `hazardId`, `platformId`, `controlId`, `kind` (`preventative` / `mitigating`).
- Unlinking a hazard from a platform deletes its rulings, assessments, SFARP **and existing controls** there in the same entry. Unlinking a control from a hazard deletes its rulings (as today).
- A control cannot be deleted while it is linked to a hazard, as an additional control or as an existing control on any platform. A retired control cannot be newly linked either way; links already made stay and show a Retired tag.
- Recommendation and justification are shared (on the hazard–control link), the status is per platform.
- "Controls awaiting a decision" (Home, Open items, platform cards) counts controls whose status on a platform is `recommended`.
- Every piece of user text written into HTML passes through the `html` tagged template.
- Commands: `npm test`, `npm run typecheck`, `npm run build`, all passing at the end of every task.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on the branch `ssra-piece-2`.

## Review Focus

1. **An old data file with confirmed and excluded decisions is opened by two people at once**, one saves, then the other. Expect identical converted records and a clean merge. Pinned in Task 1.
2. **Choosing Rejected with no reason.** Expect the op refused (`empty`, from `needText`), and in the app the reason box opens instead of anything being written. Pinned in Tasks 1 and 5.
3. **A control used as an existing control is retired, then someone tries to delete it.** Expect it still listed (with a Retired tag) where it is used, not offered in the picker, and the delete refused with a message naming the use. Pinned in Tasks 3 and 5.
4. **A hazard is unlinked from a platform and linked back.** Expect its existing controls and statuses there to start empty again. Pinned in Task 3.
5. **A recommendation typed with markup** (`<b>x</b>`). Expect it shown literally on the page and in the report. Pinned in Tasks 4 and 5.

## File Structure

```
src/core/data.js             + existingControl kind; ruling states convert on load
src/core/ids.js              + ids.existingControl
src/core/ops/assessment.js   + CONTROL_STATUSES, setControlStatus; confirm/exclude/reset become thin wrappers
src/core/ops/controls.js     + setControlAnalysis, linkExistingControl, unlinkExistingControl, setExistingControlKind; deleteControl refuses existing uses; linkControl clears analysis on relink
src/core/ops/platforms.js    unlinkHazard deletes existing controls
src/core/rules.js            rejection-without-reason; existingControl rules
src/core/queries.js          default status recommended; counts by status; existingControlsOn; existingUsage; controlsOnPlatform carries the link; platformsReached
src/reports/snapshot.js      controls: status, description, recommendation, justification; existingControls
src/reports/docgen-host.js   Controls section becomes Additional control analysis; + Existing controls
src/ui/controller.js         edits; setControlStatus handler (Rejected opens the reason box)
src/ui/screens/common.js     stateTag for the four statuses
src/ui/screens/ssra.js       + Existing controls and Additional control analysis sections
src/ui/screens/hazards.js    Overview's controls table becomes Additional controls with recommendation and justification
src/ui/screens/picker.js     + linkExistingControls picker
src/ui/screens/platforms.js  Status column
src/ui/screens/controls.js   status filter; Existing rows in the list; control page lists existing uses
src/ui/screens/reviews.js    counts by status
src/ui/screens/home.js       unchanged wording, counts recommended
src/ui/styles.css            four status colours; table cell text areas
```

---

### Task 1: Four statuses on a platform, converted from the old decisions

**Files:**
- Modify: `src/core/data.js`, `src/core/ops/assessment.js`, `src/core/rules.js`, `src/core/queries.js` (`controlState`, `controlCounts`, `openItems`, `platformCards`), `src/ui/screens/reviews.js` (`controlSummary`), `src/ui/screens/common.js` (`stateTag` doc only), `src/ui/screens/platforms.js`, `src/ui/screens/controls.js` (`STATES`), `src/ui/controller.js` (`setControlState`), `src/ui/styles.css`
- Test: `test/core/control-status.test.js` (create); update every test named below.

**Interfaces:**
- Produces:
  - `CONTROL_STATUSES = ['recommended', 'planned', 'implemented', 'rejected']` (from `ops/assessment.js`).
  - `setControlStatus(data, act, { hazardId, controlId, platformId, status, reason? })`: `recommended` deletes a live ruling (no-op if none); `planned`/`implemented` write the ruling with `reason: ''`; `rejected` needs `reason` (`empty` error, via `needText`). Unknown status → `PivotError('control.status')`. Actions: `Set control to recommended` / `planned` / `implemented` / `rejected` (`Set control to <status>`).
  - `confirmControl(t)` = `setControlStatus({ ...t, status: 'implemented' })`; `excludeControl(t)` = `status: 'rejected'`; `resetControl(t)` = `status: 'recommended'`. (Kept so existing callers and tests keep working; their actions become the new ones.)
  - `controlState(...)` → `{ state: 'recommended', ruling: null }` when no live ruling.
  - `reviewRows` item `counts`: `{ recommended, planned, implemented, rejected }`.
  - Rule `rejection-without-reason` (replaces `exclusion-without-reason`).
  - Editing kind for the reason box: `'rejection'` (replaces `'exclusion'`), id `${hazardId}|${controlId}|${platformId}`.

- [ ] **Step 1: Write the failing test**

Create `test/core/control-status.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { normalizeData, created } from '../../src/core/data.js';
import { entries } from '../../src/core/history.js';
import { checkRules } from '../../src/core/rules.js';
import { mergeData } from '../../src/core/merge.js';
import { CONTROL_STATUSES, setControlStatus } from '../../src/core/ops/assessment.js';
import { controlState, openItems } from '../../src/core/queries.js';
import { act, later, seed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const t = { hazardId: 'h1', controlId: 'c1', platformId: 'p1' };
const state = (d) => controlState(d, 'h1', 'c1', 'p1').state;

test('a control on a platform is recommended, planned, implemented or rejected (with a reason)', () => {
  assert.deepEqual(CONTROL_STATUSES, ['recommended', 'planned', 'implemented', 'rejected']);
  assert.equal(state(seed()), 'recommended', 'no decision yet means recommended');
  let d = setControlStatus(seed(), act, { ...t, status: 'planned' });
  assert.equal(state(d), 'planned');
  assert.equal(entries(d).at(-1).action, 'Set control to planned');
  d = setControlStatus(d, act, { ...t, status: 'rejected', reason: '  No crew  ' });
  assert.deepEqual([state(d), controlState(d, 'h1', 'c1', 'p1').ruling.reason], ['rejected', 'No crew']);
  d = setControlStatus(d, act, { ...t, status: 'implemented' });
  assert.deepEqual([state(d), controlState(d, 'h1', 'c1', 'p1').ruling.reason], ['implemented', '']);
  d = setControlStatus(d, act, { ...t, status: 'recommended' });
  assert.equal(state(d), 'recommended');
  assert.equal(d.records.ruling['ru:h1:c1:p1'].status, 'deleted');
  assert.equal(setControlStatus(d, act, { ...t, status: 'recommended' }), d, 'already recommended: nothing to do');
  assert.throws(() => setControlStatus(seed(), act, { ...t, status: 'rejected', reason: ' ' }), code('empty'));
  assert.throws(() => setControlStatus(seed(), act, { ...t, status: 'confirmed' }), code('control.status'));
});

test('controls awaiting a decision are the recommended ones', () => {
  let d = setControlStatus(seed(), act, { ...t, status: 'planned' });
  assert.deepEqual(openItems(d, '2026-09-28', 'u1').awaiting.map((x) => x.control.id), ['c2']);
});

test('old decisions convert on load, the same each time, and merge cleanly', () => {
  const old = seed();
  old.records.ruling['ru:h1:c1:p1'] = created(act, 'ru:h1:c1:p1', { ...t, state: 'confirmed', reason: '' });
  old.records.ruling['ru:h1:c2:p1'] = created(act, 'ru:h1:c2:p1', { hazardId: 'h1', controlId: 'c2', platformId: 'p1', state: 'excluded', reason: 'No crew' });
  const d = normalizeData(old);
  assert.equal(state(d), 'implemented');
  assert.deepEqual([controlState(d, 'h1', 'c2', 'p1').state, controlState(d, 'h1', 'c2', 'p1').ruling.reason], ['rejected', 'No crew']);
  assert.equal(d.records.ruling['ru:h1:c1:p1'].updatedAt, act.at, 'headers unchanged');
  assert.deepEqual(normalizeData(structuredClone(old)), d);
  assert.deepEqual(normalizeData(d), d);
  assert.deepEqual(checkRules(d), []);
  const mine = setControlStatus(d, act, { ...t, status: 'planned' });
  const theirs = setControlStatus(normalizeData(structuredClone(old)), later, { hazardId: 'h1', controlId: 'c2', platformId: 'p2', status: 'implemented' });
  const { data, conflicts } = mergeData(d, mine, theirs, { by: 'u1', at: '2026-09-28T13:00:00+10:00' });
  assert.deepEqual(conflicts, []);
  assert.equal(controlState(data, 'h1', 'c1', 'p1').state, 'planned');
  assert.equal(controlState(data, 'h1', 'c2', 'p2').state, 'implemented');
});

test('a rejection with no reason breaks a rule', () => {
  const d = seed();
  d.records.ruling['ru:h1:c1:p1'] = created(act, 'ru:h1:c1:p1', { ...t, state: 'rejected', reason: '' });
  assert.deepEqual(checkRules(d).map((v) => v.rule), ['rejection-without-reason']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/core/control-status.test.js`
Expected: FAIL — `CONTROL_STATUSES` is not exported.

- [ ] **Step 3: Write the implementation**

`src/core/data.js`, in `normalizeData` after the ratings block:

```js
  // Control decisions written before statuses: confirmed is implemented, excluded is rejected.
  const OLD_STATE = { confirmed: 'implemented', excluded: 'rejected' };
  records.ruling = Object.fromEntries(Object.entries(records.ruling).map(([id, r]) => [
    id, isObject(r) && r.state in OLD_STATE ? { ...r, state: OLD_STATE[/** @type {'confirmed'} */ (r.state)] } : r,
  ]));
```

`src/core/ops/assessment.js` — replace `rule`, `confirmControl`, `excludeControl`, `resetControl` with:

```js
export const CONTROL_STATUSES = Object.freeze(['recommended', 'planned', 'implemented', 'rejected']);

/**
 * A control's status on a platform. Recommended is the default and is stored as no record.
 * @param {Data} data @param {Act} act @param {Triple & { status: string, reason?: string }} t
 */
export function setControlStatus(data, act, { hazardId, controlId, platformId, status, reason }) {
  if (!CONTROL_STATUSES.includes(status)) throw new PivotError('control.status', `A control's status is one of ${CONTROL_STATUSES.join(', ')}.`);
  const id = needTriple(data, { hazardId, controlId, platformId });
  const existing = get(data, 'ruling', id);
  const action = `Set control to ${status}`;
  if (status === 'recommended') {
    if (!existing || existing.status !== 'live') return data;
    return commit(data, act, action, [{ kind: 'ruling', rec: changed(existing, act, { status: 'deleted' }) }]);
  }
  const why = status === 'rejected' ? needText(reason, 'A reason for rejecting the control') : '';
  const fields = { hazardId, controlId, platformId, state: status, reason: why };
  const rec = existing ? changed(existing, act, { ...fields, status: 'live' }) : created(act, id, fields);
  return commit(data, act, action, [{ kind: 'ruling', rec }]);
}

/** @param {Data} data @param {Act} act @param {Triple} t */
export const confirmControl = (data, act, t) => setControlStatus(data, act, { ...t, status: 'implemented' });
/** @param {Data} data @param {Act} act @param {Triple & { reason: string }} t */
export const excludeControl = (data, act, t) => setControlStatus(data, act, { ...t, status: 'rejected' });
/** @param {Data} data @param {Act} act @param {Triple} t */
export const resetControl = (data, act, t) => setControlStatus(data, act, { ...t, status: 'recommended' });
```

`src/core/rules.js`: the ruling loop's third check becomes

```js
    if (r.state === 'rejected' && !String(r.reason ?? '').trim()) out.push({ rule: 'rejection-without-reason', message: 'A control is rejected with no reason.', records: [{ kind: 'ruling', id: r.id }] });
```

`src/core/queries.js`:
- `controlState`: the default is `{ state: 'recommended', ruling: null }`.
- `controlCounts`: `const counts = { recommended: 0, planned: 0, implemented: 0, rejected: 0 };`
- `openItems` and `platformCards`: `c.state === 'awaiting'` becomes `c.state === 'recommended'` (two places).

`src/ui/screens/reviews.js`, `controlSummary`:

```js
/** @param {{ recommended: number, planned: number, implemented: number, rejected: number }} c */
function controlSummary(c) {
  const parts = /** @type {[string, number][]} */ ([['implemented', c.implemented], ['planned', c.planned], ['recommended', c.recommended], ['rejected', c.rejected]]).filter(([, n]) => n);
  return parts.length ? parts.map(([s, n]) => `${n} ${s}`).join(' · ') : html`<span class="muted">No controls</span>`;
}
```

`src/ui/screens/common.js`: `stateTag`'s doc becomes `@param {string} state recommended | planned | implemented | rejected`.

`src/ui/screens/controls.js`: `const STATES = /** @type {[string, string][]} */ (CONTROL_STATUSES.map((s) => [s, s]));` (import `CONTROL_STATUSES` from `../../core/ops/assessment.js`).

`src/ui/screens/platforms.js`, the `platformControls` table's `state` and `reason` columns become:

```js
            { key: 'state', label: 'Status', width: 260, minWidth: 150, value: (c) => CONTROL_STATUSES.indexOf(c.state), filter: 'select',
              options: CONTROL_STATUSES.map((s) => /** @type {[string, string]} */ ([s, s])), match: (c, v) => c.state === v,
              render: (c) => html`<select class="quiet state-select state-${c.state}" name="value" aria-label="Status of ${c.control.title}" ${dataAttrs({ change: 'setControlState', 'hazard-id': c.hazard.id, 'control-id': c.control.id, 'platform-id': id })}>
                ${CONTROL_STATUSES.map((s) => option(s, s, c.state))}</select>` },
            { key: 'reason', label: 'Reason rejected, or who set it', width: 640, minWidth: 220, sortable: false, render: (c) => rejectionCell(state, c, c.hazard.id, id, p.name) },
```

and add, above `platformView`, the cell shared with the SSRA tab (Task 5 imports it):

```js
/**
 * The reason a control is rejected (double-click to change), or who set its status and when.
 * @param {any} state @param {any} c a controlsOnPlatform row @param {string} hazardId @param {string} platformId @param {string} platformName
 */
export function rejectionCell(state, c, hazardId, platformId, platformName) {
  const key = `${hazardId}|${c.control.id}|${platformId}`;
  if (state.editing?.kind === 'rejection' && state.editing.id === key) {
    return html`<input class="cell-edit" name="reason" value="${c.ruling?.state === 'rejected' ? c.ruling.reason : ''}" required placeholder="Why this control is not used on ${platformName}…" aria-label="Reason for rejecting ${c.control.title}" autofocus ${dataAttrs({ change: 'rejectControl', 'hazard-id': hazardId, 'control-id': c.control.id, 'platform-id': platformId })}>`;
  }
  if (c.state === 'rejected') return html`<span class="cell-text reason" ${dataAttrs({ dblclick: 'startEdit', kind: 'rejection', id: key })} title="Double-click to change">${c.ruling.reason}</span>`;
  if (c.ruling) return html`<span class="muted">${profileName(state, c.ruling.updatedBy)}, ${when(c.ruling.updatedAt)}</span>`;
  return '';
}
```

(import `CONTROL_STATUSES` there too).

`src/ui/controller.js`:
- `EDITS`: replace `confirmControl`, `excludeControl`, `resetControl` with `setControlStatus: assessment.setControlStatus,`.
- `setControlState` becomes:

```js
    async setControlState({ hazardId, controlId, platformId, value }) {
      if (value === 'rejected') set({ editing: { kind: 'rejection', id: `${hazardId}|${controlId}|${platformId}` } });
      else await applyEdit('setControlStatus', { hazardId, controlId, platformId, status: value });
    },
    async rejectControl({ hazardId, controlId, platformId, reason }) {
      await applyEdit('setControlStatus', { hazardId, controlId, platformId, status: 'rejected', reason });
    },
```

(`data-change` names reach handlers the same way `setControlState` does; `applyEdit` clears `editing` after a change, as it did for the old reason box.)

`src/ui/styles.css`: replace the three `.state-*` rules, their light-theme rules and the `select.state-select…` rule with:

```css
.state-recommended { background: #16304a; color: #8cc8ff; }
.state-planned { background: #3a2e12; color: #f2c14e; }
.state-implemented { background: #1c3a28; color: #6fdc9b; }
.state-rejected { background: #2e2342; color: #c9a8ff; }
:root[data-theme="light"] .state-recommended { background: #ddf4ff; color: #0a3069; }
:root[data-theme="light"] .state-planned { background: #fff4d6; color: #7a5200; }
:root[data-theme="light"] .state-implemented { background: #e7f5ec; color: #1d7a46; }
:root[data-theme="light"] .state-rejected { background: #f1eafa; color: #6b3fa0; }
select.state-select { font-weight: 700; }
```

(Keep whatever dark-mode media-query duplication the file uses for the old rules, if any, with the new names.)

Update existing tests (a mechanical mapping — wherever a test pins a value, not where it only calls the ops):
- state strings: `'confirmed'` → `'implemented'`, `'excluded'` → `'rejected'`, `'awaiting'` → `'recommended'` (in `controlState`/`controlsOnPlatform`/`controlUsage` expectations, filter values, `stateTag` markup such as `state-confirmed`).
- counts objects `{ confirmed, excluded, awaiting }` → `{ recommended, planned, implemented, rejected }` with the same numbers moved across (`reviews-queries.test.js`, and the review checklist's rendered text: `1 confirmed · 1 excluded` → `1 implemented · 1 rejected`).
- actions: `'Confirm control on platform'` → `'Set control to implemented'`, `'Exclude control from platform'` → `'Set control to rejected'`, `'Reset control to awaiting'` → `'Set control to recommended'`.
- `test/core/rules.test.js:45`: `['exclusion-without-reason']` → `['rejection-without-reason']`, with the record's state `'rejected'`.
- `test/ui/controller-pages.test.js:60` and `test/ui/screens-pages.test.js:53`: editing kind `'exclusion'` → `'rejection'`; a test that changed the select to `excluded` changes it to `rejected`; a test that typed the reason into `data-change="excludeControl"` now expects `data-change="rejectControl"`.
- `test/core/random-edits.js`: add `() => setControlStatus(d, act, { ...triple(), status: pick(rand, ['recommended', 'planned', 'implemented', 'rejected']), reason: `R ${n()}` })` (import it).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/core/control-status.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src test
git commit -m "A control on a platform is recommended, planned, implemented or rejected (with a reason); old confirmed and excluded decisions convert on load

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Recommendation and justification on each additional control

**Files:**
- Modify: `src/core/ops/controls.js` (`linkControl`, + `setControlAnalysis`), `src/core/queries.js` (`controlsOnPlatform` carries `link`)
- Test: `test/core/control-analysis.test.js` (create)

**Interfaces:**
- Produces:
  - `setControlAnalysis(data, act, { hazardId, controlId, recommendation?, justification? })` — fields left out keep their value; trimmed; action `Edit control analysis`; `not-found` when the link is not live.
  - `linkControl` writes `recommendation: ''`, `justification: ''`, also when re-linking a deleted link (so re-linking starts empty, like its statuses).
  - `controlsOnPlatform(...)` rows: `{ control, kind, state, ruling, link }`.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { entries } from '../../src/core/history.js';
import { linkControl, unlinkControl, setControlAnalysis } from '../../src/core/ops/controls.js';
import { controlsOnPlatform } from '../../src/core/queries.js';
import { act, seed } from '../helpers.js';

const link = (d) => d.records.hazardControl['hc:h1:c1'];

test('an additional control has a shared recommendation and justification', () => {
  let d = setControlAnalysis(seed(), act, { hazardId: 'h1', controlId: 'c1', recommendation: '  Fit sprinklers in bay 2 ' });
  d = setControlAnalysis(d, act, { hazardId: 'h1', controlId: 'c1', justification: 'Cuts fire spread' });
  assert.deepEqual([link(d).recommendation, link(d).justification], ['Fit sprinklers in bay 2', 'Cuts fire spread']);
  assert.equal(entries(d).at(-1).action, 'Edit control analysis');
  const onP2 = controlsOnPlatform(d, 'h1', 'p2').find((c) => c.control.id === 'c1');
  assert.equal(onP2.link.recommendation, 'Fit sprinklers in bay 2', 'the same on every platform');
  assert.throws(() => setControlAnalysis(d, act, { hazardId: 'h2', controlId: 'c1', recommendation: 'x' }), (e) => e instanceof PivotError && e.code === 'not-found');
});

test('re-linking a control starts its analysis empty', () => {
  let d = setControlAnalysis(seed(), act, { hazardId: 'h1', controlId: 'c1', recommendation: 'R', justification: 'J' });
  d = unlinkControl(d, act, { hazardId: 'h1', controlId: 'c1' });
  d = linkControl(d, act, { hazardId: 'h1', controlId: 'c1', kind: 'preventative' });
  assert.deepEqual([link(d).recommendation, link(d).justification], ['', '']);
});
```

Save as `test/core/control-analysis.test.js`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/core/control-analysis.test.js`
Expected: FAIL — `setControlAnalysis` is not exported.

- [ ] **Step 3: Write the implementation**

`src/core/ops/controls.js`, in `linkControl` the record line becomes:

```js
  const fields = { kind: k, recommendation: '', justification: '' };
  const rec = existing ? changed(existing, act, { status: 'live', ...fields }) : created(act, id, { hazardId, controlId, ...fields });
```

and add after `setControlKind`:

```js
/**
 * The additional control analysis for a control on a hazard, shared by every platform; fields
 * left out keep their value.
 * @param {Data} data @param {Act} act @param {{ hazardId: string, controlId: string, recommendation?: unknown, justification?: unknown }} args
 */
export function setControlAnalysis(data, act, { hazardId, controlId, recommendation, justification }) {
  const l = need(data, 'hazardControl', ids.hazardControl(hazardId, controlId));
  /** @type {Record<string, string>} */
  const fields = {};
  if (recommendation !== undefined) fields.recommendation = String(recommendation ?? '').trim();
  if (justification !== undefined) fields.justification = String(justification ?? '').trim();
  return commit(data, act, 'Edit control analysis', [{ kind: 'hazardControl', rec: changed(l, act, fields) }]);
}
```

(`need` throws `not-found` for a missing or deleted link.)

`src/core/queries.js`, `controlsOnPlatform` returns `{ control, kind: link.kind, state: s.state, ruling: s.ruling, link }`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/core/control-analysis.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass (a test that pinned a `hazardControl` record exactly gains `recommendation: ''`, `justification: ''`).

```bash
git add src test
git commit -m "Each additional control has a recommendation and justification, shared across platforms

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Existing controls per hazard on a platform

**Files:**
- Modify: `src/core/data.js` (`KINDS`), `src/core/ids.js`, `src/core/ops/controls.js`, `src/core/ops/platforms.js` (`unlinkHazard`), `src/core/rules.js`, `src/core/queries.js` (`platformsReached`, + `existingControlsOn`, `existingUsage`), `src/ui/names.js` (`KIND_LABEL`)
- Test: `test/core/existing-controls.test.js` (create); `test/core/random-edits.js`

**Interfaces:**
- Produces:
  - `KINDS` gains `'existingControl'`; `ids.existingControl(h, p, c)` → `ec:<h>:<p>:<c>`; `KIND_LABEL.existingControl = 'Existing control'`.
  - `linkExistingControl(data, act, { hazardId, platformId, controlId, kind })` — needs a live hazard-on-platform link and a live control (`control.retired` if retired); action `Link existing control`.
  - `unlinkExistingControl(data, act, { hazardId, platformId, controlId })` — action `Unlink existing control`.
  - `setExistingControlKind(data, act, { hazardId, platformId, controlId, kind })` — action `Change existing control kind`.
  - `existingControlsOn(data, hazardId, platformId)` → `{ link, control, kind }[]` sorted by tier (`tierRank`), then control number, then title.
  - `existingUsage(data, controlId)` → `{ hazard, platform, kind }[]` for live links.
  - `deleteControl` refuses (`control.in-use`) while any live `existingControl` uses it, as it does for `hazardControl`.
  - Rules: `existingControl-without-platform-link`, `existingControl-control-deleted`.
  - `platformsReached`: `existingControl` → `[rec.platformId]`; `control` also reaches the platforms of its live existing links.

- [ ] **Step 1: Write the failing test**

Create `test/core/existing-controls.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { KINDS, put, created } from '../../src/core/data.js';
import { ids } from '../../src/core/ids.js';
import { entries } from '../../src/core/history.js';
import { checkRules } from '../../src/core/rules.js';
import { mergeData } from '../../src/core/merge.js';
import { createControl, updateControl, retireControl, deleteControl, linkExistingControl, unlinkExistingControl, setExistingControlKind } from '../../src/core/ops/controls.js';
import { unlinkHazard, linkHazard } from '../../src/core/ops/platforms.js';
import { existingControlsOn, existingUsage, platformsReached } from '../../src/core/queries.js';
import { act, later, seed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const on = (d, p = 'p1') => existingControlsOn(d, 'h1', p).map((x) => x.control.id);

test('existing controls are chosen per hazard on a platform, listed by tier', () => {
  assert.ok(KINDS.includes('existingControl'));
  assert.equal(ids.existingControl('h1', 'p1', 'c1'), 'ec:h1:p1:c1');
  let d = updateControl(seed(), act, { id: 'c1', tier: 'Administrative' });
  d = updateControl(d, act, { id: 'c2', tier: 'Engineering' });
  d = linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'mitigating' });
  d = linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c2', kind: 'preventative' });
  assert.equal(entries(d).at(-1).action, 'Link existing control');
  assert.deepEqual(on(d), ['c2', 'c1'], 'Engineering before Administrative');
  assert.deepEqual(on(d, 'p2'), [], 'another platform has its own');
  d = setExistingControlKind(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'preventative' });
  assert.equal(existingControlsOn(d, 'h1', 'p1')[1].kind, 'preventative');
  assert.deepEqual(existingUsage(d, 'c1').map((u) => [u.hazard.id, u.platform.id, u.kind]), [['h1', 'p1', 'preventative']]);
  assert.deepEqual(platformsReached(d, 'existingControl', d.records.existingControl['ec:h1:p1:c1']), ['p1']);
  d = unlinkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1' });
  assert.deepEqual(on(d), ['c2']);
  assert.throws(() => linkExistingControl(d, act, { hazardId: 'h2', platformId: 'p1', controlId: 'c1', kind: 'preventative' }), code('not-found'));
  assert.throws(() => linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'sideways' }), code('control.kind'));
});

test('a control used only as an existing control reaches that platform, cannot be deleted, and when retired stays listed but cannot be newly linked', () => {
  let d = createControl(seed(), act, { id: 'c9', title: 'Hot work permit' });
  d = linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p2', controlId: 'c9', kind: 'preventative' });
  assert.deepEqual(platformsReached(d, 'control', d.records.control.c9), ['p2']);
  assert.throws(() => deleteControl(d, act, { id: 'c9' }), code('control.in-use'));
  d = retireControl(d, act, { id: 'c9' });
  assert.deepEqual(on(d, 'p2'), ['c9']);
  assert.throws(() => linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c9', kind: 'preventative' }), code('control.retired'));
});

test('unlinking the hazard clears its existing controls there; linking back starts empty; the rules hold', () => {
  let d = linkExistingControl(seed(), act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'preventative' });
  d = unlinkHazard(d, later, { hazardId: 'h1', platformId: 'p1' });
  assert.equal(d.records.existingControl['ec:h1:p1:c1'].status, 'deleted');
  assert.deepEqual(checkRules(d), []);
  d = linkHazard(d, later, { hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual(on(d), []);
  const orphan = put(seed(), 'existingControl', created(act, 'ec:h2:p1:c1', { hazardId: 'h2', platformId: 'p1', controlId: 'c1', kind: 'preventative' }));
  assert.deepEqual(checkRules(orphan).map((v) => v.rule), ['existingControl-without-platform-link']);
});

test('two people adding different existing controls to the same hazard on a platform both keep theirs', () => {
  const base = seed();
  const mine = linkExistingControl(base, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'preventative' });
  const theirs = linkExistingControl(base, later, { hazardId: 'h1', platformId: 'p1', controlId: 'c2', kind: 'mitigating' });
  const { data, conflicts } = mergeData(base, mine, theirs, { by: 'u1', at: '2026-09-28T13:00:00+10:00' });
  assert.deepEqual(conflicts, []);
  assert.deepEqual(on(data).sort(), ['c1', 'c2']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/core/existing-controls.test.js`
Expected: FAIL — `linkExistingControl` is not exported.

- [ ] **Step 3: Write the implementation**

`src/core/data.js`: `KINDS` gains `'existingControl'` after `'assessment', 'sfarp',`.

`src/core/ids.js`, after `sfarp`:

```js
  /** @param {string} h @param {string} p @param {string} c */
  existingControl: (h, p, c) => `ec:${h}:${p}:${c}`,
```

`src/core/ops/controls.js` (import `get` is already there; add the three ops after `unlinkControl`):

```js
/** @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string, controlId: string, kind: string }} args */
export function linkExistingControl(data, act, { hazardId, platformId, controlId, kind }) {
  need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  const c = need(data, 'control', controlId);
  if (c.status !== 'live') throw new PivotError('control.retired', `${c.title} is retired, so it cannot be linked to a hazard.`);
  const k = needKind(kind);
  const id = ids.existingControl(hazardId, platformId, controlId);
  const existing = get(data, 'existingControl', id);
  const rec = existing ? changed(existing, act, { status: 'live', kind: k }) : created(act, id, { hazardId, platformId, controlId, kind: k });
  return commit(data, act, 'Link existing control', [{ kind: 'existingControl', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string, controlId: string }} args */
export function unlinkExistingControl(data, act, { hazardId, platformId, controlId }) {
  const l = need(data, 'existingControl', ids.existingControl(hazardId, platformId, controlId));
  return commit(data, act, 'Unlink existing control', [{ kind: 'existingControl', rec: changed(l, act, { status: 'deleted' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string, controlId: string, kind: string }} args */
export function setExistingControlKind(data, act, { hazardId, platformId, controlId, kind }) {
  const l = need(data, 'existingControl', ids.existingControl(hazardId, platformId, controlId));
  return commit(data, act, 'Change existing control kind', [{ kind: 'existingControl', rec: changed(l, act, { kind: needKind(kind) }) }]);
}
```

(`need` throws `not-found` for a missing or deleted record.)

`deleteControl`: after the `hazardControl` check, add

```js
  const existingUses = live(data, 'existingControl').filter((l) => l.controlId === id);
  if (existingUses.length) {
    throw new PivotError('control.in-use', `${c.title} is an existing control on ${existingUses.length === 1 ? 'a hazard' : `${existingUses.length} hazards`}. Remove it there first.`, { hazardIds: existingUses.map((u) => u.hazardId) });
  }
```

`src/core/ops/platforms.js`, `unlinkHazard`: the kinds loop becomes `for (const kind of ['assessment', 'sfarp', 'rating', 'existingControl'])`, and its doc says it also deletes existing controls.

`src/core/rules.js`, after the assessment loop:

```js
  for (const r of live(data, 'existingControl')) {
    const hp = ids.hazardPlatform(r.hazardId, r.platformId);
    if (!liveRec('hazardPlatform', hp)) out.push({ rule: 'existingControl-without-platform-link', message: 'An existing control is listed for a platform the hazard is not on.', records: [{ kind: 'existingControl', id: r.id }, { kind: 'hazardPlatform', id: hp }] });
    const c = get(data, 'control', r.controlId);
    if (!c || c.status === 'deleted') out.push({ rule: 'existingControl-control-deleted', message: 'An existing control is a control that has been deleted.', records: [{ kind: 'existingControl', id: r.id }, { kind: 'control', id: r.controlId }] });
  }
```

(Import `get` from `./data.js` if `rules.js` does not already.)

`src/core/queries.js`:
- `platformsReached`: add `case 'existingControl':` to the `[rec.platformId]` group; `case 'control'` becomes

```js
    case 'control':
      return sortedUnique([
        ...live(data, 'hazardControl').filter((l) => l.controlId === rec.id).flatMap((l) => platformsOfHazard(data, l.hazardId)),
        ...live(data, 'existingControl').filter((l) => l.controlId === rec.id).map((l) => l.platformId),
      ]);
```

- add (import `tierRank` from `./ops/controls.js`; that module and `./references.js` import nothing from `queries.js`, so there is no cycle):

```js
/** A hazard's existing controls on a platform, by tier (most effective first), then number. @param {Data} data @param {string} hazardId @param {string} platformId */
export function existingControlsOn(data, hazardId, platformId) {
  return live(data, 'existingControl').filter((l) => l.hazardId === hazardId && l.platformId === platformId)
    .map((link) => ({ link, control: /** @type {Rec} */ (get(data, 'control', link.controlId)), kind: /** @type {string} */ (link.kind) }))
    .sort((a, b) => tierRank(a.control.tier) - tierRank(b.control.tier) || byNumber(a.control, b.control) || String(a.control.title).localeCompare(String(b.control.title)));
}

/** Where a control is an existing control. @param {Data} data @param {string} controlId */
export function existingUsage(data, controlId) {
  return live(data, 'existingControl').filter((l) => l.controlId === controlId).map((l) => ({
    hazard: /** @type {Rec} */ (get(data, 'hazard', l.hazardId)), platform: /** @type {Rec} */ (get(data, 'platform', l.platformId)), kind: /** @type {string} */ (l.kind),
  }));
}
```

`src/ui/names.js`: `KIND_LABEL` gains `existingControl: 'Existing control'`.

`test/core/random-edits.js`: add `() => linkExistingControl(d, act, { hazardId: pick(rand, hz), platformId: pick(rand, pl), controlId: pick(rand, ct), kind: pick(rand, ['preventative', 'mitigating']) })` and `() => unlinkExistingControl(d, act, { hazardId: pick(rand, hz), platformId: pick(rand, pl), controlId: pick(rand, ct) })` (import both).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/core/existing-controls.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src test
git commit -m "Existing controls per hazard on a platform, listed by tier; unlinking the hazard clears them, and a control in use as one cannot be deleted

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reports — Additional control analysis and Existing controls

**Files:**
- Modify: `src/reports/snapshot.js`, `src/reports/docgen-host.js`
- Test: `test/reports/snapshot.test.js`, `test/reports/docgen-host.test.js` (append; update the section list)

**Interfaces:**
- Consumes: `controlsOnPlatform` rows with `link` (Task 2); `existingControlsOn` (Task 3).
- Produces: snapshot row `controls[]` entries `{ title, number, description, kind, tier, state, reason, recommendation, justification }` (`state` is the status; `number` is the control label, e.g. `C-0001`); row `existingControls: { number, title, description, kind, tier }[]`. Designer: section `controls` keeps its id (saved designs keep working), is labelled *Additional control analysis*, columns `number` (*ID*), `control`, `tier`, `description` (optional), `kind`, `recommendation`, `justification`, `state` (*Status*), `reason` (*Reason rejected*, optional). New section `existing` (*Existing controls*): `tier`, `number`, `control`, `description` (optional), `kind`.

- [ ] **Step 1: Write the failing tests**

Append to `test/reports/snapshot.test.js` (import `setControlAnalysis`, `linkExistingControl`, `updateControl` from `../../src/core/ops/controls.js`, `setControlStatus` from `../../src/core/ops/assessment.js`, `assignNumbers` from `../../src/core/ops/hazards.js` if not already imported):

```js
test('a snapshot carries each additional control\'s analysis and status, and the existing controls', () => {
  let d = assignNumbers(assessed());
  d = setControlAnalysis(d, act, { hazardId: 'h1', controlId: 'c1', recommendation: 'Fit in <bay 2>', justification: 'Cuts spread' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'planned' });
  d = updateControl(d, act, { id: 'c2', tier: 'Administrative', description: 'Twice a year' });
  d = linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c2', kind: 'mitigating' });
  const row = buildSnapshot(d, 'p1', opts).rows[0];
  const c1 = row.controls.find((c) => c.title === 'Sprinklers');
  assert.deepEqual([c1.state, c1.recommendation, c1.justification], ['planned', 'Fit in <bay 2>', 'Cuts spread']);
  assert.match(c1.number, /^C-\d{4}$/);
  assert.deepEqual(row.existingControls, [{ number: row.existingControls[0].number, title: 'Fire drills', description: 'Twice a year', kind: 'mitigating', tier: 'Administrative' }]);
});
```

(If `assessed()` already numbers the data, drop the `assignNumbers` call. Use whichever of `assignNumbers` / `assignHazardNumbers` the file already imports that numbers controls too; check `src/core/ops/hazards.js`.)

In `test/reports/docgen-host.test.js`, the section list becomes `['hazards', 'controls', 'existing', 'causes', 'references', 'assessments', 'sfarp']`, and append:

```js
test('Additional control analysis and Existing controls sections', async () => {
  const { setControlAnalysis, linkExistingControl } = await import('../../src/core/ops/controls.js');
  const { setControlStatus } = await import('../../src/core/ops/assessment.js');
  let data = assignHazardNumbers(seed());
  data = setControlAnalysis(data, act, { hazardId: 'h1', controlId: 'c1', recommendation: 'Fit', justification: 'Because' });
  data = setControlStatus(data, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'rejected', reason: 'No water' });
  data = linkExistingControl(data, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c2', kind: 'mitigating' });
  const docs = createDocHost({ getData: () => data, setDesign: () => {}, clock: fixedClock('2026-09-28T10:00:00+10:00'), profileName: (id) => id });
  const secs = docs.host.sections({ subjectId: 'p1' });
  const ctl = secs.find((s) => s.id === 'controls');
  assert.equal(ctl.label, 'Additional control analysis');
  assert.deepEqual(ctl.columns.map((c) => c.id), ['number', 'control', 'tier', 'description', 'kind', 'recommendation', 'justification', 'state', 'reason']);
  const sprinklers = ctl.rows().find((r) => r.title === 'Sprinklers');
  assert.deepEqual(['recommendation', 'justification', 'state', 'reason'].map((id) => ctl.columns.find((c) => c.id === id).get(sprinklers)), ['Fit', 'Because', 'Rejected', 'No water']);
  const ex = secs.find((s) => s.id === 'existing');
  assert.equal(ex.label, 'Existing controls');
  assert.deepEqual(ex.columns.map((c) => c.id), ['tier', 'number', 'control', 'description', 'kind']);
  assert.equal(ex.columns.find((c) => c.id === 'control').get(ex.rows()[0]), 'Fire drills');
});
```

Also update the existing test that pins the `controls` section's columns or a whole snapshot `controls` entry to the new fields and labels.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/reports/snapshot.test.js test/reports/docgen-host.test.js`
Expected: FAIL — `recommendation` is undefined; section list differs.

- [ ] **Step 3: Write the implementation**

`src/reports/snapshot.js` (import `existingControlsOn` from queries and `controlLabel` from `../core/ids.js`; extend the `SnapshotRow` typedef with the new fields):

```js
      controls: r.controls.map((c) => ({
        number: controlLabel(c.control), title: c.control.title, description: c.control.description ?? '',
        kind: c.kind, tier: c.control.tier ?? '', state: c.state, reason: c.state === 'rejected' ? c.ruling?.reason ?? '' : '',
        recommendation: c.link?.recommendation ?? '', justification: c.link?.justification ?? '',
      })),
      existingControls: existingControlsOn(data, r.hazard.id, platformId).map((x) => ({
        number: controlLabel(x.control), title: x.control.title, description: x.control.description ?? '', kind: x.kind, tier: x.control.tier ?? '',
      })),
```

`src/reports/docgen-host.js`: a helper above the sections, `const STATUS_WORD = { recommended: 'Recommended', planned: 'Planned', implemented: 'Implemented', rejected: 'Rejected', confirmed: 'Implemented', excluded: 'Rejected', awaiting: 'Recommended' };` (the old words let reports produced before this piece still preview). The `controls` section becomes:

```js
    {
      id: 'controls', label: 'Additional control analysis',
      keyColumn: hazardKey,
      columns: [
        { id: 'number', label: 'ID', w: 2, get: (/** @type {any} */ r) => r.number ?? '' },
        { id: 'control', label: 'Control measure', w: 4, get: (/** @type {any} */ r) => r.title },
        { id: 'tier', label: 'Tier', w: 3, optional: true, get: (/** @type {any} */ r) => r.tier ?? '' },
        { id: 'description', label: 'Description', w: 5, optional: true, get: (/** @type {any} */ r) => r.description ?? '' },
        { id: 'kind', label: 'Kind', w: 2, get: (/** @type {any} */ r) => r.kind },
        { id: 'recommendation', label: 'Recommendation', w: 5, get: (/** @type {any} */ r) => r.recommendation ?? '' },
        { id: 'justification', label: 'Justification', w: 5, get: (/** @type {any} */ r) => r.justification ?? '' },
        { id: 'state', label: 'Status', w: 2, get: (/** @type {any} */ r) => STATUS_WORD[/** @type {keyof typeof STATUS_WORD} */ (r.state)] ?? r.state },
        { id: 'reason', label: 'Reason rejected', w: 4, optional: true, get: (/** @type {any} */ r) => r.reason },
      ],
      rows: rows((x) => x.rows.flatMap((h) => h.controls.map((c) => ({ reportId: h.reportId, ...c })))),
    },
    {
      id: 'existing', label: 'Existing controls',
      keyColumn: hazardKey,
      columns: [
        { id: 'tier', label: 'Tier', w: 3, get: (/** @type {any} */ r) => r.tier || 'Not set' },
        { id: 'number', label: 'ID', w: 2, get: (/** @type {any} */ r) => r.number },
        { id: 'control', label: 'Control', w: 5, get: (/** @type {any} */ r) => r.title },
        { id: 'description', label: 'Description', w: 5, optional: true, get: (/** @type {any} */ r) => r.description },
        { id: 'kind', label: 'Kind', w: 2, get: (/** @type {any} */ r) => r.kind },
      ],
      rows: rows((x) => x.rows.flatMap((h) => (h.existingControls ?? []).map((c) => ({ reportId: h.reportId, ...c })))),
    },
```

placed so the section order is `hazards, controls, existing, causes, references, assessments, sfarp`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/reports/snapshot.test.js test/reports/docgen-host.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src/reports test/reports
git commit -m "Reports: the Controls section becomes the Additional control analysis (recommendation, justification, status, reason), and a new Existing controls section

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The SSRA's control sections on the hazard page

**Files:**
- Modify: `src/ui/screens/ssra.js`, `src/ui/screens/hazards.js` (Overview's controls table), `src/ui/screens/picker.js`, `src/ui/controller.js`, `src/ui/styles.css`
- Test: `test/ui/screens-ssra.test.js` (append)

**Interfaces:**
- Consumes: Tasks 1–3 (`CONTROL_STATUSES`, `rejectionCell`, `existingControlsOn`, `controlsOnPlatform` rows with `link`, ops).
- Produces:
  - Platform tab sections in order: Overview (shared), **Existing controls** (`data-table="existingControls"`), References (shared), Initial risk, **Additional control analysis** (`data-table="controlAnalysis"`, marked *Recommendation and justification shared across platforms*), Residual risk, SFARP.
  - Existing controls table: `+` opens picker `linkExistingControls` (`data-hazard-id`, `data-platform-id`); columns `tier`, `control`, `kind` (select, `data-change="setExistingControlKind"`), actions (✕ `data-action="unlinkExistingControl"`).
  - Additional control analysis table: columns `control`, `tier`, `kind`, `recommendation` and `justification` (each a `<textarea class="cell-area" name="recommendation|justification" data-change="setControlAnalysis" data-hazard-id data-control-id>`), `state` (Status select, `data-change="setControlState"`), `reason` (`rejectionCell`).
  - Overview's `hazardControls` table gains `recommendation` and `justification` columns (the same text areas) and is headed *Additional controls*.
  - Controller: `EDITS` gains `setControlAnalysis`, `linkExistingControl`, `unlinkExistingControl`, `setExistingControlKind`; handler `linkExistingControls(args)` links each ticked control with its chosen kind; `openPicker` passes `platformId` along with `hazardId` (it already forwards both).

- [ ] **Step 1: Write the failing test**

Append to `test/ui/screens-ssra.test.js` (import `setControlAnalysis`, `linkExistingControl`, `updateControl`, `retireControl` from controls ops, `setControlStatus` from assessment ops, and `pickerView` from `../../src/ui/screens/picker.js`):

```js
function controlled() {
  let d = data();
  d = setControlAnalysis(d, act, { hazardId: 'h1', controlId: 'c1', recommendation: 'Fit <b>now</b>', justification: 'Cuts spread' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'rejected', reason: 'No water main' });
  d = updateControl(d, act, { id: 'c2', tier: 'Administrative' });
  return linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c2', kind: 'mitigating' });
}

test('a platform tab has Existing controls and the Additional control analysis, in SSRA order', () => {
  const out = hazardView(on('p:p1'), controlled(), 'h1').toString();
  const order = ['Overview', 'Existing controls', 'References', 'Initial risk', 'Additional control analysis', 'Residual risk', 'SFARP considerations'].map((h) => out.indexOf(`<h2>${h}`));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), `sections in SSRA order: ${order}`);
  assert.match(out, /data-table="existingControls"[\s\S]*?Administrative[\s\S]*?Fire drills/);
  assert.match(out, /data-action="openPicker" data-picker="linkExistingControls" data-hazard-id="h1" data-platform-id="p1"/);
  assert.match(out, /data-action="unlinkExistingControl" data-hazard-id="h1" data-platform-id="p1" data-control-id="c2"/);
  assert.match(out, /data-table="controlAnalysis"[\s\S]*?<textarea class="cell-area" name="recommendation"[^>]*data-change="setControlAnalysis" data-hazard-id="h1" data-control-id="c1">Fit &lt;b&gt;now&lt;\/b&gt;<\/textarea>/);
  assert.match(out, /aria-label="Status of Sprinklers"[\s\S]*?<option value="rejected" selected>rejected<\/option>/);
  assert.match(out, /No water main/);
  assert.doesNotMatch(out, /<b>now<\/b>/);
});

test('the Overview lists additional controls with their shared recommendation and justification', () => {
  const out = hazardView(state, controlled(), 'h1').toString();
  assert.match(out, /data-table="hazardControls"[\s\S]*?<th data-col="recommendation"[\s\S]*?<th data-col="justification"/);
  assert.match(out, />Cuts spread<\/textarea>/);
  assert.match(out, /<th data-col="description"/);
});

test('the existing-controls picker offers live controls not already listed there', () => {
  let d = controlled();
  d = retireControl(d, act, { id: 'c1' });
  const out = pickerView({ ...state, picker: { picker: 'linkExistingControls', hazardId: 'h1', platformId: 'p1' } }, d).toString();
  assert.match(out, /<form data-action="linkExistingControls" data-hazard-id="h1" data-platform-id="p1"/);
  assert.doesNotMatch(out, /value="c2"/, 'already an existing control here');
  assert.doesNotMatch(out, /value="c1"/, 'retired');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/screens-ssra.test.js`
Expected: FAIL — no Existing controls section.

- [ ] **Step 3: Write the implementation**

`src/ui/screens/ssra.js` (imports: `dataTable` from `./table.js`, `plus`, `confirmButton`, `statusTag`, `idTag` from `./common.js`, `tierColumn` from `./controls.js`, `rejectionCell` from `./platforms.js`, `controlLabel` from ids, `existingControlsOn`, `controlsOnPlatform` from queries, `CONTROL_KINDS`, `tierRank` from `../../core/ops/controls.js`, `byNumber` from queries, `CONTROL_STATUSES` from `../../core/ops/assessment.js`):

```js
/** A shared text in a table cell, applied when left. @param {'recommendation' | 'justification'} name @param {any} row a controlsOnPlatform or hazardDetail control row @param {string} hazardId */
export function analysisArea(name, row, hazardId) {
  const word = name === 'recommendation' ? 'Recommendation' : 'Justification';
  return html`<textarea class="cell-area" name="${name}" rows="2" placeholder="${word}…" aria-label="${word} for ${row.control.title}" ${dataAttrs({ change: 'setControlAnalysis', 'hazard-id': hazardId, 'control-id': row.control.id })}>${row.link?.[name] ?? ''}</textarea>`;
}

/** @param {any} c */
const controlCell = (c) => html`<span class="id">${idTag(controlLabel(c.control))}</span> ${go(c.control.title, 'control', { id: c.control.id })}${statusTag(c.control.status)}`;

/** The controls already in place for the hazard on this platform, by tier. @param {any} state @param {Data} data @param {any} h @param {string} platformId */
function existingSection(state, data, h, platformId) {
  const rows = existingControlsOn(data, h.id, platformId);
  return dataTable(state, {
    id: 'existingControls',
    rowKey: (x) => x.control.id,
    rows,
    empty: 'No existing controls recorded for this platform yet.',
    tools: plus({ action: 'openPicker', picker: 'linkExistingControls', 'hazard-id': h.id, 'platform-id': platformId }, 'Add existing controls'),
    columns: [
      tierColumn((x) => x.control, false),
      { key: 'control', label: 'Existing controls', width: 720, minWidth: 200, value: (x) => `${controlLabel(x.control)} ${x.control.title}`, render: controlCell },
      { key: 'kind', label: 'Kind', width: 300, minWidth: 150, value: (x) => x.kind,
        render: (x) => html`<select class="quiet" name="kind" aria-label="Kind of ${x.control.title}" ${dataAttrs({ change: 'setExistingControlKind', 'hazard-id': h.id, 'platform-id': platformId, 'control-id': x.control.id })}>${CONTROL_KINDS.map((k) => option(k, k, x.kind))}</select>` },
      { key: 'actions', label: '', width: 120, minWidth: 80, sortable: false,
        render: (x) => html`<div class="row-actions">${confirmButton('✕', 'Remove this existing control from the platform', dataAttrs({ action: 'unlinkExistingControl', 'hazard-id': h.id, 'platform-id': platformId, 'control-id': x.control.id }))}</div>` },
    ],
  });
}

/** The hazard's additional controls: shared analysis, and this platform's status. @param {any} state @param {Data} data @param {any} h @param {string} platformId @param {string} platformName */
function analysisSection(state, data, h, platformId, platformName) {
  const rows = controlsOnPlatform(data, h.id, platformId).sort((a, b) => tierRank(a.control.tier) - tierRank(b.control.tier) || byNumber(a.control, b.control));
  return dataTable(state, {
    id: 'controlAnalysis',
    rowKey: (c) => c.control.id,
    rows,
    empty: 'No additional controls. Link them on the Overview tab.',
    columns: [
      { key: 'control', label: 'Additional controls', width: 480, minWidth: 200, value: (c) => `${controlLabel(c.control)} ${c.control.title}`, render: controlCell },
      tierColumn((c) => c.control, false),
      { key: 'kind', label: 'Kind', width: 220, minWidth: 120, value: (c) => c.kind },
      { key: 'recommendation', label: 'Recommendation', width: 520, minWidth: 200, sortable: false, render: (c) => analysisArea('recommendation', c, h.id) },
      { key: 'justification', label: 'Justification', width: 520, minWidth: 200, sortable: false, render: (c) => analysisArea('justification', c, h.id) },
      { key: 'state', label: `Status on ${platformName}`, width: 260, minWidth: 150, value: (c) => CONTROL_STATUSES.indexOf(c.state),
        render: (c) => html`<select class="quiet state-select state-${c.state}" name="value" aria-label="Status of ${c.control.title}" ${dataAttrs({ change: 'setControlState', 'hazard-id': h.id, 'control-id': c.control.id, 'platform-id': platformId })}>${CONTROL_STATUSES.map((s) => option(s, s, c.state))}</select>` },
      { key: 'reason', label: 'Reason rejected, or who set it', width: 480, minWidth: 200, sortable: false, render: (c) => rejectionCell(state, c, h.id, platformId, platformName) },
    ],
  });
}
```

In `platformTab`, after the Overview section add
`<section class="ssra-sec"><h2>Existing controls</h2><section class="block">${existingSection(state, data, h, platformId)}</section></section>`,
and between Initial risk and Residual risk add
`<section class="ssra-sec"><h2>Additional control analysis <span class="shared-mark">Recommendation and justification shared across platforms</span></h2><section class="block">${analysisSection(state, data, h, platformId, p.name)}</section></section>`.

Import-cycle check: `ssra.js` already imports `hazards.js`, which imports `ssra.js`; `platforms.js` and `controls.js` must not import `ssra.js` at module top level in a way that uses its exports during evaluation. Only functions are used at render time, so ES module cycles resolve; confirm with the tests.

`src/ui/screens/hazards.js`, the Overview's `hazardControls` table: its rows are `d.controls` sorted by tier then number (`[...d.controls].sort((a, b) => tierRank(a.control.tier) - tierRank(b.control.tier) || byNumber(a.control, b.control))`, importing `tierRank` and `byNumber`); the first column's label becomes `Additional controls`; and after the `kind` column add

```js
            { key: 'description', label: 'Description', width: 440, minWidth: 160, value: (c) => c.control.description ?? '', render: (c) => html`<span class="muted">${c.control.description ?? ''}</span>` },
            { key: 'recommendation', label: 'Recommendation', width: 520, minWidth: 200, sortable: false, render: (c) => analysisArea('recommendation', c, h.id) },
            { key: 'justification', label: 'Justification', width: 520, minWidth: 200, sortable: false, render: (c) => analysisArea('justification', c, h.id) },
```

(import `analysisArea` from `./ssra.js`; `hazardDetail`'s control rows already carry `link`).

`src/ui/screens/picker.js`, before `linkReferences` (import `existingControlsOn`):

```js
  if (p.picker === 'linkExistingControls') {
    const listed = new Set(existingControlsOn(data, p.hazardId, p.platformId).map((x) => x.control.id));
    const controls = live(data, 'control').filter((c) => !listed.has(c.id));
    return frame('Add existing controls', html`<form data-action="linkExistingControls" ${dataAttrs({ 'hazard-id': p.hazardId, 'platform-id': p.platformId })} class="picker-form">
      ${search()}
      <ul class="pick-list">${controls.map((c) => html`<li data-pick-text="${`${controlLabel(c)} ${c.title}`.toLowerCase()}"><label><input type="checkbox" name="controlId" value="${c.id}"> <span class="id">${idTag(controlLabel(c))}</span> ${c.title}</label>
        <select name="kind:${c.id}" aria-label="Kind of ${c.title}">${CONTROL_KINDS.map((k) => option(k, k))}</select></li>`)}</ul>
      ${controls.length ? '' : html`<p class="muted">${live(data, 'control').length ? 'Every live control is already listed here.' : 'The control library is empty: add controls on the Controls page.'}</p>`}
      ${buttons('Add')}</form>`);
  }
```

`src/ui/controller.js`: `EDITS` gains `setControlAnalysis: controls.setControlAnalysis, linkExistingControl: controls.linkExistingControl, unlinkExistingControl: controls.unlinkExistingControl, setExistingControlKind: controls.setExistingControlKind,`; after `linkControls` add

```js
    async linkExistingControls(args) {
      for (const controlId of list(args.controlId)) {
        await applyEdit('linkExistingControl', { hazardId: args.hazardId, platformId: args.platformId, controlId, kind: args[`kind:${controlId}`] || 'preventative' });
      }
      set({ picker: null });
    },
```

`src/ui/styles.css`, append:

```css
/* Text areas inside table cells */
.cell-area { width: 100%; min-height: 2.6em; resize: vertical; border: 1px solid transparent; background: transparent; color: inherit; font: inherit; padding: 3px 6px; border-radius: 6px; }
.cell-area:hover, .cell-area:focus { border-color: var(--p-muted); background: var(--p-surface-2); }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/screens-ssra.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass (the tier test's `hazardControls` expectations still hold; update any test pinning the Overview controls column label `Controls` to `Additional controls`).

```bash
git add src/ui test/ui
git commit -m "The platform tab gets Existing controls by tier and the Additional control analysis with shared recommendation and justification and this platform's status; the Overview shows the analysis too

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Statuses and existing controls across the other screens

**Files:**
- Modify: `src/core/queries.js` (`filterControls`: existing rows), `src/ui/screens/controls.js` (list role column; control page existing uses)
- Test: `test/ui/screens-ssra.test.js` (append)

**Interfaces:**
- Consumes: `existingUsage` (Task 3).
- Produces: `filterControls` rows gain `role: 'additional' | 'existing' | null`; one row per live existing control (`state: null`, `kind` from the link, `band` of that hazard on that platform); the Controls list has a `role` column (*Role*: Additional / Existing, filter); the control page has a second table `data-table="controlExisting"` (*Existing control on*: hazard, platform, kind); the control page's Delete button is hidden while there are existing uses too.

- [ ] **Step 1: Write the failing test**

```js
test('the Controls list shows existing uses as their own rows, and a control page lists them', async () => {
  const { controlsView, controlView } = await import('../../src/ui/screens/controls.js');
  const d = controlled();
  const list = controlsView(state, d).toString();
  assert.match(list, /<th data-col="role"/);
  assert.match(list, /data-row="c2:h1:p1:existing"/);
  const only = controlsView({ ...state, tables: { controls: { filters: { role: 'existing' } } } }, d).toString();
  assert.match(only, /data-row="c2:h1:p1:existing"/);
  assert.doesNotMatch(only, /data-row="c1:/);
  const page = controlView(state, d, 'c2').toString();
  assert.match(page, /data-table="controlExisting"[\s\S]*?Fire[\s\S]*?Alpha[\s\S]*?mitigating/);
  assert.doesNotMatch(page, /Delete this control/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/screens-ssra.test.js`
Expected: FAIL — no role column.

- [ ] **Step 3: Write the implementation**

`src/core/queries.js`, `filterControls`: each pushed additional row gains `role: 'additional'`; the unused row `role: null`; count a control as `used` when it has existing links too; after the `hazardControl` loop add

```js
    for (const ec of live(data, 'existingControl').filter((l) => l.controlId === control.id)) {
      used = true;
      if (f.platformId && ec.platformId !== f.platformId) continue;
      if (f.controlState) continue;
      const hazard = /** @type {Rec} */ (get(data, 'hazard', ec.hazardId));
      const band = worseResidual(data, hazard.id, ec.platformId);
      if (f.band && band !== f.band) continue;
      rows.push({ control, hazard, platform: /** @type {Rec} */ (get(data, 'platform', ec.platformId)), kind: ec.kind, state: null, band, role: 'existing' });
    }
```

(the `used` flag must be declared before both loops).

`src/ui/screens/controls.js`:
- `rowKey`: `` (r) => `${r.control.id}:${r.hazard?.id ?? ''}:${r.platform?.id ?? ''}${r.role === 'existing' ? ':existing' : ''}` ``.
- after the `platform` column add

```js
        { key: 'role', label: 'Role', width: 220, minWidth: 110, value: (r) => r.role ?? '', filter: 'select',
          options: /** @type {[string, string][]} */ ([['additional', 'Additional'], ['existing', 'Existing']]),
          render: (r) => (r.role === 'existing' ? 'Existing' : r.role === 'additional' ? 'Additional' : '—') },
```

- `controlView`: `const existing = existingUsage(data, id);` (import it); the Delete button shows only when `!usage.length && !existing.length`; after the `controlUsage` block add

```js
      <section class="block">
        ${dataTable(state, {
          id: 'controlExisting',
          rowKey: (u) => `${u.hazard.id}:${u.platform.id}`,
          rows: existing,
          empty: 'Not an existing control anywhere.',
          columns: [
            { key: 'hazard', label: 'Existing control on', width: 600, minWidth: 200, value: (u) => `${hazardLabel(u.hazard)} ${u.hazard.title}`,
              render: (u) => html`<span class="id">${idTag(hazardLabel(u.hazard))}</span> ${go(u.hazard.title, 'hazard', { id: u.hazard.id, tab: `p:${u.platform.id}` })}` },
            { key: 'platform', label: 'Platform', width: 360, minWidth: 140, value: (u) => u.platform.name },
            { key: 'kind', label: 'Kind', width: 260, minWidth: 130, value: (u) => u.kind },
          ],
        })}
      </section>
```

- the `controlUsage` table's first column label becomes `Additional control for hazards`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/screens-ssra.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass (update tests pinning the Controls list `rowKey`/row count or the `Used by hazards` label).

```bash
git add src test
git commit -m "Existing controls show in the Controls list (Role column) and on each control's page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Build, and a check in the browser

- [ ] **Step 1: Build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass; `OK wrote …/dist/pivot.html`.

- [ ] **Step 2: Check it in a real browser**

Serve `dist/` and drive it with the Playwright MCP tools (folder picker stubbed with the browser's private file system; seed an old-format folder the way piece 1's check did, with a `confirmed` and an `excluded` ruling). Check:

1. On opening, the platform page's Status column shows *implemented* and *rejected* (with its reason).
2. On a platform tab: add two existing controls from the picker (kinds chosen), see them ordered by tier; change a kind; remove one.
3. In the Additional control analysis, type a recommendation and justification (tab away), see them on the Overview and on the other platform's tab; set Status to planned, then to rejected — the reason box opens; enter a reason; it shows.
4. Retire a control used as an existing control: it stays listed with a Retired tag and is not in the picker; Delete is not offered on its page.
5. Home's "controls awaiting" counts recommended ones.
6. Save, produce a report: Additional control analysis and Existing controls tables are in the Markdown.
7. Both themes.

Fix anything that does not behave as described, with a test where the fault is in rendering or the controller.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A src test
git commit -m "SSRA piece 2: fixes from the browser check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
