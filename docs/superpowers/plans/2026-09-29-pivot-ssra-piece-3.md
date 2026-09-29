# Pivot SSRA Piece 3: Lifecycle Phases and Safety Reports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the SSRA's Overview: a managed list of lifecycle phases that each hazard ticks (shared across platforms), and safety reports recorded per hazard on a platform, with their report sections.

**Architecture:** Three new kinds. `phase` (uuid, `name`) is a small library with its own page; `hazardPhase` (`hph:<hazard>:<phase>`) links a hazard to a phase; `safetyReport` (uuid) belongs to a hazard on a platform. Safety reports record events, so unlinking a hazard from a platform keeps them (they show again when it is linked back); deleting the hazard or the platform deletes them. A hazard's History gains its phase links and safety reports, via one `hazardOfItem` helper that replaces piece 1's `ssraHazardOf`.

**Tech Stack:** Plain ES modules, JSDoc types checked by `tsc --checkJs`, `node:test`, no runtime dependency, no UI framework.

**Spec:** `docs/superpowers/specs/2026-09-29-pivot-ssra-design.md` (this plan is its piece 3).

## Global Constraints

- Safety report fields: `hazardId`, `platformId`, `number`, `date` (`YYYY-MM-DD` or null), `type` (`Occurrence`, `Near miss`, `Hazard report`, `Other`), `summary` (required), `description`, `location`, `parties`.
- In forms and op arguments the type is passed as `reportType`: a form field named `type` would overwrite the action name the app dispatches.
- Phase names are required and unique among phases that are not deleted, ignoring case. A retired phase keeps its links (shown with a Retired tag) and is not offered for new links; deleting a phase is refused while any hazard uses it.
- Unlinking a hazard from a platform does **not** delete its safety reports there. Deleting a hazard deletes its phase links and safety reports; deleting a platform deletes its safety reports.
- `platformsReached`: `safetyReport` → its platform; `hazardPhase` → the hazard's platforms; `phase` → the platforms of the hazards using it.
- Every piece of user text written into HTML passes through the `html` tagged template.
- Commands: `npm test`, `npm run typecheck`, `npm run build`, all passing at the end of every task.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on the branch `ssra-piece-3`.

## Review Focus

1. **A hazard with safety reports is unlinked from a platform, then linked back.** Expect the reports kept and shown again, and no rule broken in between. Pinned in Task 2.
2. **Two people, one deletes a phase no hazard uses while the other ticks it on a hazard.** Expect the merge to settle without an unresolvable rule (the rule pass keeps the phase or drops the link) and nothing silently half-applied. Pinned in Task 1.
3. **A safety report with markup, a bad date, or no summary.** Expect markup shown literally (page and report), a bad date refused (`safetyReport.date`), no summary refused (`empty`). Pinned in Tasks 2, 3 and 5.
4. **Deleting a platform whose hazards were unlinked but left safety reports behind.** Expect the platform deleted and its reports with it, with no rule broken. Pinned in Task 2.
5. **A phase is retired while hazards use it.** Expect it still shown on those hazards with a Retired tag, absent from the picker, and restorable from the Phases page. Pinned in Tasks 1 and 4.

## File Structure

```
src/core/data.js               + phase, hazardPhase, safetyReport kinds
src/core/ids.js                + ids.hazardPhase
src/core/ops/phases.js         NEW: createPhase, renamePhase, retirePhase, deletePhase, linkPhase, unlinkPhase
src/core/ops/safety-reports.js NEW: SAFETY_REPORT_TYPES, createSafetyReport, updateSafetyReport, deleteSafetyReport
src/core/ops/hazards.js        restoreRecord restores phases; deleteHazard deletes phase links and safety reports
src/core/ops/platforms.js      deletePlatform deletes safety reports
src/core/rules.js              hazardPhase and safetyReport rules
src/core/queries.js            listPhases, phasesOf, phaseUsage, safetyReportsOn; platformsReached
src/core/history.js            hazardOfItem (replaces ssraHazardOf); historyOf uses it
src/reports/snapshot.js        phases, safetyReports per row
src/reports/docgen-host.js     Hazards: Lifecycle phases column; + Safety reports section
src/ui/names.js                labels and names for the new kinds
src/ui/screens/phases.js       NEW: Phases page; phaseChips
src/ui/screens/ssra.js         Safety reports section with its form; phase chips in the shared overview
src/ui/screens/hazards.js      phase chips on the Overview; delete warning names safety reports
src/ui/screens/common.js       Phases in the nav; history labels for the new kinds
src/ui/screens/picker.js       + linkPhases picker
src/ui/render.js               phases view
src/ui/controller.js           edits; linkPhases handler
src/ui/styles.css              chips, report form, delete panel
src/ui/screens/common.js       + deletePanel; the undo offer in messages
```

---

### Task 1: Lifecycle phases in the data

**Files:**
- Create: `src/core/ops/phases.js`, `test/core/phases.test.js`
- Modify: `src/core/data.js` (`KINDS`), `src/core/ids.js`, `src/core/ops/hazards.js` (`RESTORABLE`, `deleteHazard`), `src/core/rules.js`, `src/core/queries.js`, `src/ui/names.js`, `test/core/random-edits.js`

**Interfaces:**
- Produces:
  - `KINDS` gains `'phase', 'hazardPhase', 'safetyReport'` (all three now; Task 2 uses the last).
  - `ids.hazardPhase(h, ph)` → `hph:<h>:<ph>`.
  - `createPhase(data, act, { id?, name })` (action `Create phase`), `renamePhase(data, act, { id, name })` (`Rename phase`), `retirePhase(data, act, { id })` (`Retire phase`), `deletePhase(data, act, { id })` (`Delete phase`; `phase.in-use` while linked), `linkPhase(data, act, { hazardId, phaseId })` (`Add lifecycle phase`; `phase.retired` for a retired phase), `unlinkPhase(data, act, { hazardId, phaseId })` (`Remove lifecycle phase`). Name errors: `empty`, `phase.duplicate`.
  - `restoreRecord` accepts `kind: 'phase'` (action `Restore phase`).
  - `deleteHazard` also deletes the hazard's live `hazardPhase` links.
  - Rules `hazardPhase-hazard-deleted`, `hazardPhase-phase-deleted`.
  - `listPhases(data)` → phases not deleted, in the order created; `phasesOf(data, hazardId)` → `{ link, phase }[]` in phase order; `phaseUsage(data, phaseId)` → hazards (live links), by number.
  - `platformsReached`: `hazardPhase` → `platformsOfHazard(rec.hazardId)`; `phase` → the platforms of the hazards linked to it.
  - `KIND_LABEL`: `phase: 'Lifecycle phase'`, `hazardPhase: 'Lifecycle phase link'`, `safetyReport: 'Safety report'`; `recordName('phase', rec)` → `rec.name`; `recordName('safetyReport', rec)` → `rec.number || rec.summary`.

- [ ] **Step 1: Write the failing test**

Create `test/core/phases.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { KINDS, put, created } from '../../src/core/data.js';
import { ids } from '../../src/core/ids.js';
import { entries } from '../../src/core/history.js';
import { checkRules } from '../../src/core/rules.js';
import { mergeData } from '../../src/core/merge.js';
import { createPhase, renamePhase, retirePhase, deletePhase, linkPhase, unlinkPhase } from '../../src/core/ops/phases.js';
import { restoreRecord, deleteHazard } from '../../src/core/ops/hazards.js';
import { unlinkHazard } from '../../src/core/ops/platforms.js';
import { listPhases, phasesOf, phaseUsage, platformsReached } from '../../src/core/queries.js';
import { act, later, seed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const withPhases = () => {
  let d = createPhase(seed(), act, { id: 'ph1', name: 'Design' });
  d = createPhase(d, later, { id: 'ph2', name: 'Operation' });
  return d;
};
const names = (d, h = 'h1') => phasesOf(d, h).map((x) => x.phase.name);

test('phases are a managed list: named, unique, renamed, retired, restored, deleted when unused', () => {
  assert.ok(['phase', 'hazardPhase', 'safetyReport'].every((k) => KINDS.includes(k)));
  assert.equal(ids.hazardPhase('h1', 'ph1'), 'hph:h1:ph1');
  let d = withPhases();
  assert.deepEqual(listPhases(d).map((p) => p.name), ['Design', 'Operation']);
  assert.equal(entries(d).at(-1).action, 'Create phase');
  assert.throws(() => createPhase(d, act, { name: ' design ' }), code('phase.duplicate'));
  assert.throws(() => createPhase(d, act, { name: ' ' }), code('empty'));
  d = renamePhase(d, act, { id: 'ph2', name: 'In service' });
  assert.equal(d.records.phase.ph2.name, 'In service');
  assert.throws(() => renamePhase(d, act, { id: 'ph2', name: 'DESIGN' }), code('phase.duplicate'));
  d = retirePhase(d, act, { id: 'ph2' });
  assert.equal(d.records.phase.ph2.status, 'retired');
  d = restoreRecord(d, act, { kind: 'phase', id: 'ph2' });
  assert.equal(d.records.phase.ph2.status, 'live');
  d = deletePhase(d, act, { id: 'ph1' });
  assert.deepEqual(listPhases(d).map((p) => p.id), ['ph2']);
  d = createPhase(d, act, { name: 'Design' });
  assert.equal(listPhases(d).length, 2, 'a deleted name can be used again');
});

test('a hazard ticks phases; a retired phase stays on it but cannot be newly ticked; a phase in use cannot be deleted', () => {
  let d = linkPhase(withPhases(), act, { hazardId: 'h1', phaseId: 'ph2' });
  d = linkPhase(d, act, { hazardId: 'h1', phaseId: 'ph1' });
  assert.equal(entries(d).at(-1).action, 'Add lifecycle phase');
  assert.deepEqual(names(d), ['Design', 'Operation'], 'in the list\'s order');
  assert.deepEqual(phaseUsage(d, 'ph1').map((h) => h.id), ['h1']);
  assert.deepEqual(platformsReached(d, 'hazardPhase', d.records.hazardPhase['hph:h1:ph1']), ['p1', 'p2']);
  assert.deepEqual(platformsReached(d, 'phase', d.records.phase.ph1), ['p1', 'p2']);
  assert.throws(() => deletePhase(d, act, { id: 'ph1' }), code('phase.in-use'));
  d = retirePhase(d, act, { id: 'ph1' });
  assert.deepEqual(names(d), ['Design', 'Operation']);
  assert.throws(() => linkPhase(d, act, { hazardId: 'h2', phaseId: 'ph1' }), code('phase.retired'));
  d = unlinkPhase(d, act, { hazardId: 'h1', phaseId: 'ph2' });
  assert.equal(entries(d).at(-1).action, 'Remove lifecycle phase');
  assert.deepEqual(names(d), ['Design']);
  assert.deepEqual(checkRules(d), []);
});

test('deleting a hazard removes its phase links; a link to a deleted phase breaks a rule', () => {
  let d = linkPhase(withPhases(), act, { hazardId: 'h2', phaseId: 'ph1' });
  d = deleteHazard(d, act, { id: 'h2' });
  assert.equal(d.records.hazardPhase['hph:h2:ph1'].status, 'deleted');
  assert.deepEqual(checkRules(d), []);
  const bad = put(withPhases(), 'hazardPhase', created(act, 'hph:h1:gone', { hazardId: 'h1', phaseId: 'gone' }));
  assert.deepEqual(checkRules(bad).map((v) => v.rule), ['hazardPhase-phase-deleted']);
});

test('one person deletes an unused phase while another ticks it: the merge settles', () => {
  const base = withPhases();
  const mine = deletePhase(base, act, { id: 'ph1' });
  const theirs = linkPhase(base, later, { hazardId: 'h1', phaseId: 'ph1' });
  const { data } = mergeData(base, mine, theirs, { by: 'u1', at: '2026-09-28T13:00:00+10:00' });
  assert.deepEqual(checkRules(data), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/core/phases.test.js`
Expected: FAIL — cannot find `src/core/ops/phases.js`.

- [ ] **Step 3: Write the implementation**

`src/core/data.js`: `KINDS` gains `'phase', 'hazardPhase', 'safetyReport',` after `'existingControl',`.

`src/core/ids.js`, after `existingControl`:

```js
  /** @param {string} h @param {string} ph a phase id */
  hazardPhase: (h, ph) => `hph:${h}:${ph}`,
```

Create `src/core/ops/phases.js`:

```js
import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, all, live, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

/** A phase name, trimmed, not blank, and not another phase's (ignoring case). @param {Data} data @param {unknown} name @param {string | null} self */
function needName(data, name, self) {
  const n = needText(name, 'A phase name');
  const clash = all(data, 'phase').find((p) => p.status !== 'deleted' && p.id !== self && String(p.name).toLowerCase() === n.toLowerCase());
  if (clash) throw new PivotError('phase.duplicate', `There is already a phase called ${clash.name}.`);
  return n;
}

/** @param {Data} data @param {Act} act @param {{ id?: string, name: string }} args */
export function createPhase(data, act, { id = newId(), name }) {
  return commit(data, act, 'Create phase', [{ kind: 'phase', rec: created(act, id, { name: needName(data, name, null) }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, name: string }} args */
export function renamePhase(data, act, { id, name }) {
  const p = need(data, 'phase', id);
  return commit(data, act, 'Rename phase', [{ kind: 'phase', rec: changed(p, act, { name: needName(data, name, id) }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function retirePhase(data, act, { id }) {
  const p = need(data, 'phase', id);
  if (p.status === 'retired') return data;
  return commit(data, act, 'Retire phase', [{ kind: 'phase', rec: changed(p, act, { status: 'retired' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deletePhase(data, act, { id }) {
  const p = need(data, 'phase', id);
  const uses = live(data, 'hazardPhase').filter((l) => l.phaseId === id);
  if (uses.length) {
    throw new PivotError('phase.in-use', `${p.name} is ticked on ${uses.length === 1 ? 'a hazard' : `${uses.length} hazards`}. Remove it there first, or retire it.`, { hazardIds: uses.map((u) => u.hazardId) });
  }
  return commit(data, act, 'Delete phase', [{ kind: 'phase', rec: changed(p, act, { status: 'deleted' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, phaseId: string }} args */
export function linkPhase(data, act, { hazardId, phaseId }) {
  need(data, 'hazard', hazardId);
  const p = need(data, 'phase', phaseId);
  if (p.status !== 'live') throw new PivotError('phase.retired', `${p.name} is retired, so it cannot be added to a hazard.`);
  const id = ids.hazardPhase(hazardId, phaseId);
  const existing = get(data, 'hazardPhase', id);
  if (existing && existing.status === 'live') return data;
  const rec = existing ? changed(existing, act, { status: 'live' }) : created(act, id, { hazardId, phaseId });
  return commit(data, act, 'Add lifecycle phase', [{ kind: 'hazardPhase', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, phaseId: string }} args */
export function unlinkPhase(data, act, { hazardId, phaseId }) {
  const l = need(data, 'hazardPhase', ids.hazardPhase(hazardId, phaseId));
  return commit(data, act, 'Remove lifecycle phase', [{ kind: 'hazardPhase', rec: changed(l, act, { status: 'deleted' }) }]);
}
```

`src/core/ops/hazards.js`:
- `RESTORABLE` gains `phase: 'phase'`.
- `deleteHazard`: after the `hazardControl` loop add
  `for (const l of live(data, 'hazardPhase')) if (l.hazardId === id) recs.push({ kind: 'hazardPhase', rec: changed(l, act, { status: 'deleted' }) });`

`src/core/rules.js`, after the `existingControl` loop:

```js
  for (const l of live(data, 'hazardPhase')) {
    const h = get(data, 'hazard', l.hazardId);
    if (!h || h.status === 'deleted') out.push({ rule: 'hazardPhase-hazard-deleted', message: 'A lifecycle phase is ticked on a hazard that has been deleted.', records: [{ kind: 'hazardPhase', id: l.id }, { kind: 'hazard', id: l.hazardId }] });
    const p = get(data, 'phase', l.phaseId);
    if (!p || p.status === 'deleted') out.push({ rule: 'hazardPhase-phase-deleted', message: 'A hazard has a lifecycle phase that has been deleted.', records: [{ kind: 'hazardPhase', id: l.id }, { kind: 'phase', id: l.phaseId }] });
  }
```

`src/core/queries.js`:
- `platformsReached`: add

```js
    case 'hazardPhase': return platformsOfHazard(data, rec.hazardId);
    case 'phase':
      return sortedUnique(live(data, 'hazardPhase').filter((l) => l.phaseId === rec.id).flatMap((l) => platformsOfHazard(data, l.hazardId)));
```

- add

```js
/** The phases that are not deleted, in the order they were added. @param {Data} data */
export function listPhases(data) {
  return all(data, 'phase').filter((p) => p.status !== 'deleted').sort(byCreated);
}

/** A hazard's lifecycle phases, in the list's order. @param {Data} data @param {string} hazardId */
export function phasesOf(data, hazardId) {
  return live(data, 'hazardPhase').filter((l) => l.hazardId === hazardId)
    .map((link) => ({ link, phase: /** @type {Rec} */ (get(data, 'phase', link.phaseId)) }))
    .sort((a, b) => byCreated(a.phase, b.phase));
}

/** The hazards a phase is ticked on. @param {Data} data @param {string} phaseId */
export function phaseUsage(data, phaseId) {
  return live(data, 'hazardPhase').filter((l) => l.phaseId === phaseId).map((l) => /** @type {Rec} */ (get(data, 'hazard', l.hazardId))).sort(byNumber);
}
```

`src/ui/names.js`: `KIND_LABEL` gains `phase: 'Lifecycle phase', hazardPhase: 'Lifecycle phase link', safetyReport: 'Safety report',`; `recordName`'s plain switch gains `case 'phase': return rec.name;` and `case 'safetyReport': return rec.number || rec.summary;`, and its with-data switch gains `case 'hazardPhase': return `${data.records.phase?.[rec.phaseId]?.name ?? ''} for ${hazard}`;` and `case 'safetyReport': return `${rec.number || rec.summary} for ${hazard} on ${platform}`;`.

`test/core/random-edits.js`: add phase ids to the pools the generator picks from (seed two phases `ph1`, `ph2` if the generator builds its own base; otherwise pick from `Object.keys(d.records.phase)` with a fallback id), and add `() => linkPhase(d, act, { hazardId: pick(rand, hz), phaseId: pick(rand, ['ph1', 'ph2']) })`, `() => unlinkPhase(d, act, { hazardId: pick(rand, hz), phaseId: pick(rand, ['ph1', 'ph2']) })`, `() => createPhase(d, act, { id: pick(rand, ['ph1', 'ph2']), name: `Phase ${n()}` })`, `() => deletePhase(d, act, { id: pick(rand, ['ph1', 'ph2']) })` (import them). Errors from these are expected and already caught by the generator (it tolerates `PivotError`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/core/phases.test.js`
Expected: PASS. If the merge test's rule pass cannot settle (`merge.rules` thrown), read `src/core/merge.js`'s rule resolution: a deleted phase with a live link must resolve by reverting one side (mine wins: the phase stays deleted and their link is marked deleted, or the phase is revived). Fix in the merge's generic resolution, not by special-casing phases, and ledger the ruling.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass (the section-list and KINDS-shaped tests are unaffected; `validateData` accepts the new kinds through `KINDS`).

```bash
git add src test
git commit -m "Lifecycle phases: a managed list that each hazard ticks; a retired phase stays where it is used, and a phase in use cannot be deleted

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Safety reports in the data, and in the hazard's History

**Files:**
- Create: `src/core/ops/safety-reports.js`, `test/core/safety-reports.test.js`
- Modify: `src/core/ops/hazards.js` (`deleteHazard`), `src/core/ops/platforms.js` (`deletePlatform`), `src/core/rules.js`, `src/core/queries.js`, `src/core/history.js`, `src/ui/screens/common.js` (history labels), `test/core/random-edits.js`

**Interfaces:**
- Produces:
  - `SAFETY_REPORT_TYPES = ['Occurrence', 'Near miss', 'Hazard report', 'Other']`.
  - `createSafetyReport(data, act, { id?, hazardId, platformId, number?, date?, reportType?, summary, description?, location?, parties? })` — needs a live hazard-on-platform link; `reportType` defaults to `Occurrence`; action `Add safety report`.
  - `updateSafetyReport(data, act, { id, ...same fields })` — fields left out keep their value; action `Edit safety report`.
  - `deleteSafetyReport(data, act, { id })` — action `Delete safety report`.
  - Errors: `empty` (summary), `safetyReport.date`, `safetyReport.type`, `not-found`.
  - `deleteHazard` and `deletePlatform` delete their live safety reports; `unlinkHazard` does not.
  - Rules `safetyReport-hazard-deleted`, `safetyReport-platform-deleted`.
  - `safetyReportsOn(data, hazardId, platformId)` → live reports, newest date first (undated last), then by number.
  - `platformsReached`: `safetyReport` → `[rec.platformId]`.
  - `hazardOfItem(data, item)` (history.js) → the hazard an `assessment`, `sfarp`, `hazardPhase` or `safetyReport` item belongs to, else null; replaces `ssraHazardOf`. `historyOf(data, 'hazard', id)` includes those items' entries.
  - History labels (common.js `itemLabel`): `hazardPhase` → `Phase <name>`; `safetyReport` → `<platform> · Safety report <number or summary>`.

- [ ] **Step 1: Write the failing test**

Create `test/core/safety-reports.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { entries, historyOf } from '../../src/core/history.js';
import { checkRules } from '../../src/core/rules.js';
import { SAFETY_REPORT_TYPES, createSafetyReport, updateSafetyReport, deleteSafetyReport } from '../../src/core/ops/safety-reports.js';
import { unlinkHazard, linkHazard, deletePlatform } from '../../src/core/ops/platforms.js';
import { deleteHazard } from '../../src/core/ops/hazards.js';
import { createPhase, linkPhase } from '../../src/core/ops/phases.js';
import { safetyReportsOn, platformsReached } from '../../src/core/queries.js';
import { act, later, seed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const base = { hazardId: 'h1', platformId: 'p1' };
const two = () => {
  let d = createSafetyReport(seed(), act, { ...base, id: 'sr1', number: 'SR-10', date: '2026-03-04', reportType: 'Near miss', summary: 'Rotor <b>strike</b>', location: 'Hangar 3', parties: 'Crew A' });
  return createSafetyReport(d, act, { ...base, id: 'sr2', number: 'SR-11', date: '2026-05-01', summary: 'Fuel spill' });
};

test('a safety report records an event for a hazard on a platform', () => {
  assert.deepEqual(SAFETY_REPORT_TYPES, ['Occurrence', 'Near miss', 'Hazard report', 'Other']);
  let d = two();
  assert.equal(entries(d).at(-1).action, 'Add safety report');
  const r = d.records.safetyReport.sr1;
  assert.deepEqual([r.number, r.date, r.type, r.summary, r.description, r.location, r.parties], ['SR-10', '2026-03-04', 'Near miss', 'Rotor <b>strike</b>', '', 'Hangar 3', 'Crew A']);
  assert.equal(d.records.safetyReport.sr2.type, 'Occurrence', 'the default type');
  assert.deepEqual(safetyReportsOn(d, 'h1', 'p1').map((x) => x.id), ['sr2', 'sr1'], 'newest first');
  assert.deepEqual(safetyReportsOn(d, 'h1', 'p2'), []);
  assert.deepEqual(platformsReached(d, 'safetyReport', r), ['p1']);
  d = updateSafetyReport(d, later, { id: 'sr1', description: 'Blade tip hit a stand', date: '' });
  assert.deepEqual([d.records.safetyReport.sr1.description, d.records.safetyReport.sr1.date, d.records.safetyReport.sr1.summary], ['Blade tip hit a stand', null, 'Rotor <b>strike</b>']);
  assert.equal(entries(d).at(-1).action, 'Edit safety report');
  assert.deepEqual(safetyReportsOn(d, 'h1', 'p1').map((x) => x.id), ['sr2', 'sr1'], 'undated last');
  assert.throws(() => createSafetyReport(seed(), act, { ...base, summary: ' ' }), code('empty'));
  assert.throws(() => createSafetyReport(seed(), act, { ...base, summary: 'x', date: '2026-02-30' }), code('safetyReport.date'));
  assert.throws(() => createSafetyReport(seed(), act, { ...base, summary: 'x', reportType: 'Rumour' }), code('safetyReport.type'));
  assert.throws(() => createSafetyReport(seed(), act, { hazardId: 'h2', platformId: 'p1', summary: 'x' }), code('not-found'));
  d = deleteSafetyReport(d, act, { id: 'sr2' });
  assert.deepEqual(safetyReportsOn(d, 'h1', 'p1').map((x) => x.id), ['sr1']);
});

test('unlinking keeps safety reports and they show again on relinking; deleting the hazard or platform removes them', () => {
  let d = unlinkHazard(two(), later, { hazardId: 'h1', platformId: 'p1' });
  assert.equal(d.records.safetyReport.sr1.status, 'live');
  assert.deepEqual(checkRules(d), []);
  d = linkHazard(d, later, { hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual(safetyReportsOn(d, 'h1', 'p1').map((x) => x.id), ['sr2', 'sr1']);
  let gone = unlinkHazard(two(), later, { hazardId: 'h1', platformId: 'p1' });
  gone = deletePlatform(gone, later, { id: 'p1' });
  assert.equal(gone.records.safetyReport.sr1.status, 'deleted');
  assert.deepEqual(checkRules(gone), []);
  let noHazard = unlinkHazard(two(), later, { hazardId: 'h1', platformId: 'p1' });
  noHazard = unlinkHazard(noHazard, later, { hazardId: 'h1', platformId: 'p2' });
  noHazard = deleteHazard(noHazard, later, { id: 'h1' });
  assert.equal(noHazard.records.safetyReport.sr2.status, 'deleted');
  assert.deepEqual(checkRules(noHazard), []);
});

test('a hazard\'s History includes its phase links and safety reports', () => {
  let d = createPhase(two(), act, { id: 'ph1', name: 'Operation' });
  d = linkPhase(d, act, { hazardId: 'h1', phaseId: 'ph1' });
  const actions = historyOf(d, 'hazard', 'h1').map((e) => e.action);
  assert.ok(actions.includes('Add safety report'));
  assert.ok(actions.includes('Add lifecycle phase'));
  assert.ok(!historyOf(d, 'hazard', 'h2').some((e) => e.action === 'Add safety report'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/core/safety-reports.test.js`
Expected: FAIL — cannot find `src/core/ops/safety-reports.js`.

- [ ] **Step 3: Write the implementation**

Create `src/core/ops/safety-reports.js`:

```js
import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */
/**
 * @typedef {{ number?: unknown, date?: unknown, reportType?: unknown, summary?: unknown, description?: unknown,
 *   location?: unknown, parties?: unknown }} ReportFields
 */

export const SAFETY_REPORT_TYPES = Object.freeze(['Occurrence', 'Near miss', 'Hazard report', 'Other']);

const BLANK = { number: '', date: null, type: 'Occurrence', summary: '', description: '', location: '', parties: '' };

/** @param {string} s */
function isDay(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** A report's fields after a change; any left out keep their value. @param {ReportFields} a @param {any} cur */
function fieldsOf(a, cur) {
  const text = (/** @type {unknown} */ v, /** @type {string} */ was) => (v === undefined ? was : String(v ?? '').trim());
  const date = a.date === undefined ? cur.date : String(a.date ?? '').trim() || null;
  if (date !== null && !isDay(date)) throw new PivotError('safetyReport.date', `${date} is not a date (YYYY-MM-DD).`);
  const type = a.reportType === undefined ? cur.type : String(a.reportType);
  if (!SAFETY_REPORT_TYPES.includes(type)) throw new PivotError('safetyReport.type', `A safety report is one of ${SAFETY_REPORT_TYPES.join(', ')}.`);
  return {
    number: text(a.number, cur.number), date, type,
    summary: needText(a.summary === undefined ? cur.summary : a.summary, 'A safety report summary'),
    description: text(a.description, cur.description), location: text(a.location, cur.location), parties: text(a.parties, cur.parties),
  };
}

/** @param {Data} data @param {Act} act @param {ReportFields & { id?: string, hazardId: string, platformId: string }} args */
export function createSafetyReport(data, act, { id = newId(), hazardId, platformId, ...rest }) {
  need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  const rec = created(act, id, { hazardId, platformId, ...fieldsOf(rest, BLANK) });
  return commit(data, act, 'Add safety report', [{ kind: 'safetyReport', rec }]);
}

/** @param {Data} data @param {Act} act @param {ReportFields & { id: string }} args */
export function updateSafetyReport(data, act, { id, ...rest }) {
  const r = need(data, 'safetyReport', id);
  return commit(data, act, 'Edit safety report', [{ kind: 'safetyReport', rec: changed(r, act, fieldsOf(rest, r)) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deleteSafetyReport(data, act, { id }) {
  const r = need(data, 'safetyReport', id);
  return commit(data, act, 'Delete safety report', [{ kind: 'safetyReport', rec: changed(r, act, { status: 'deleted' }) }]);
}
```

(Form submissions also carry `action` and other dataset keys; `...rest` only reads the named fields, so they are ignored.)

`src/core/ops/hazards.js`, `deleteHazard`: also `for (const r of live(data, 'safetyReport')) if (r.hazardId === id) recs.push({ kind: 'safetyReport', rec: changed(r, act, { status: 'deleted' }) });`.

`src/core/ops/platforms.js`, `deletePlatform`: build the list with the platform's live safety reports deleted too:

```js
  const reports = live(data, 'safetyReport').filter((r) => r.platformId === id).map((r) => ({ kind: 'safetyReport', rec: changed(r, act, { status: 'deleted' }) }));
  return commit(data, act, 'Delete platform', [{ kind: 'platform', rec: changed(p, act, { status: 'deleted' }) }, ...reports, ...(open ? abandonRecs(data, act, open) : []), ...linksTo(data, act, [{ kind: 'platform', id }])]);
```

`src/core/rules.js`, after the `hazardPhase` loop:

```js
  for (const r of live(data, 'safetyReport')) {
    const h = get(data, 'hazard', r.hazardId);
    if (!h || h.status === 'deleted') out.push({ rule: 'safetyReport-hazard-deleted', message: 'A safety report belongs to a hazard that has been deleted.', records: [{ kind: 'safetyReport', id: r.id }, { kind: 'hazard', id: r.hazardId }] });
    const p = get(data, 'platform', r.platformId);
    if (!p || p.status === 'deleted') out.push({ rule: 'safetyReport-platform-deleted', message: 'A safety report belongs to a platform that has been deleted.', records: [{ kind: 'safetyReport', id: r.id }, { kind: 'platform', id: r.platformId }] });
  }
```

`src/core/queries.js`: `case 'safetyReport':` joins the `[rec.platformId]` group in `platformsReached`; add

```js
/** A hazard's safety reports on a platform: newest first, undated last, then by number. @param {Data} data @param {string} hazardId @param {string} platformId */
export function safetyReportsOn(data, hazardId, platformId) {
  return live(data, 'safetyReport').filter((r) => r.hazardId === hazardId && r.platformId === platformId).sort((a, b) => {
    if (a.date !== b.date) return a.date == null ? 1 : b.date == null ? -1 : a.date < b.date ? 1 : -1;
    return String(a.number).localeCompare(String(b.number));
  });
}
```

`src/core/history.js`: replace `ssraHazardOf` with

```js
/**
 * The hazard a history item belongs to, when it is one of the hazard's per-platform or linked
 * records (an assessment, SFARP, existing control, control status, control link, lifecycle phase
 * link or safety report), so the hazard's History includes it; null for any other item.
 * @param {Data} data @param {{ kind: string, id: string }} item
 */
export function hazardOfItem(data, item) {
  switch (item.kind) {
    case 'assessment':
    case 'sfarp':
    case 'existingControl':
    case 'ruling':
    case 'hazardControl':
    case 'hazardPhase': return String(item.id).split(':')[1];
    case 'safetyReport': return data.records.safetyReport?.[item.id]?.hazardId ?? null;
    default: return null;
  }
}
```

and `historyOf`'s test becomes `(i.kind === kind && i.id === id) || (kind === 'hazard' && hazardOfItem(data, i) === id)`.

`src/ui/screens/common.js`: import `hazardOfItem` instead of `ssraHazardOf`; in `historyTable` the check becomes `e.items.every((/** @type {any} */ i) => hazardOfItem(data, i) !== null)`; in `itemLabel`, after the `const name = …` line (keep its existing `hazardControl`, `ruling` and `existingControl` branches), add

```js
  if (item.kind === 'hazardPhase') return `Phase ${data.records.phase?.[parts[2]]?.name ?? ''}`;
  if (item.kind === 'safetyReport') {
    const r = data.records.safetyReport?.[item.id];
    return `${name('platform', r?.platformId)} · Safety report ${r?.number || r?.summary || ''}`;
  }
```

`test/core/random-edits.js`: add `() => createSafetyReport(d, act, { hazardId: pick(rand, hz), platformId: pick(rand, pl), summary: `S ${n()}` })` (import it).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/core/safety-reports.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass (piece 1's hazard-History test still passes through `hazardOfItem`).

```bash
git add src test
git commit -m "Safety reports per hazard on a platform, kept when the hazard is unlinked; a hazard's History includes its phases and safety reports

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Reports — Lifecycle phases column and Safety reports section

**Files:**
- Modify: `src/reports/snapshot.js`, `src/reports/docgen-host.js`
- Test: `test/reports/snapshot.test.js`, `test/reports/docgen-host.test.js` (append; update the section list)

**Interfaces:**
- Consumes: `phasesOf`, `safetyReportsOn` (Tasks 1–2).
- Produces: snapshot row `phases: string[]` (names, retired included), `safetyReports: { number, date, type, summary, description, location, parties }[]` (in `safetyReportsOn` order). Designer: Hazards gains optional column `phases` (*Lifecycle phases*, joined with `, `); new section `safetyReports` (*Safety reports*) with columns `number` (*Report*), `date`, `type`, `summary`, `location`, `parties` (*Parties involved*), `description` (optional), appended last.

- [ ] **Step 1: Write the failing tests**

Append to `test/reports/snapshot.test.js` (import `createPhase`, `linkPhase` from `../../src/core/ops/phases.js`, `createSafetyReport` from `../../src/core/ops/safety-reports.js`):

```js
test('a snapshot carries the hazard\'s lifecycle phases and its safety reports on the platform', () => {
  let d = createPhase(assessed(), act, { id: 'ph1', name: 'Operation' });
  d = linkPhase(d, act, { hazardId: 'h1', phaseId: 'ph1' });
  d = createSafetyReport(d, act, { hazardId: 'h1', platformId: 'p1', number: 'SR-1', date: '2026-03-04', reportType: 'Near miss', summary: 'Rotor <strike>', location: 'Hangar', parties: 'Crew' });
  d = createSafetyReport(d, act, { hazardId: 'h1', platformId: 'p2', summary: 'Elsewhere' });
  const row = buildSnapshot(d, 'p1', opts).rows[0];
  assert.deepEqual(row.phases, ['Operation']);
  assert.deepEqual(row.safetyReports, [{ number: 'SR-1', date: '2026-03-04', type: 'Near miss', summary: 'Rotor <strike>', description: '', location: 'Hangar', parties: 'Crew' }]);
});
```

In `test/reports/docgen-host.test.js`, the section list becomes `['hazards', 'controls', 'existing', 'causes', 'references', 'assessments', 'sfarp', 'safetyReports']`, and append:

```js
test('Hazards has a Lifecycle phases column; a Safety reports section; markup stays literal in the output', async () => {
  const { createPhase, linkPhase } = await import('../../src/core/ops/phases.js');
  const { createSafetyReport } = await import('../../src/core/ops/safety-reports.js');
  let data = assignHazardNumbers(seed());
  data = createPhase(data, act, { id: 'ph1', name: 'Design' });
  data = createPhase(data, act, { id: 'ph2', name: 'Operation' });
  data = linkPhase(data, act, { hazardId: 'h1', phaseId: 'ph1' });
  data = linkPhase(data, act, { hazardId: 'h1', phaseId: 'ph2' });
  data = createSafetyReport(data, act, { hazardId: 'h1', platformId: 'p1', number: 'SR-7', date: '2026-04-01', summary: 'Spill <b>x</b>' });
  const docs = createDocHost({ getData: () => data, setDesign: () => {}, clock: fixedClock('2026-09-28T10:00:00+10:00'), profileName: (id) => id });
  const secs = docs.host.sections({ subjectId: 'p1' });
  const hz = secs.find((s) => s.id === 'hazards');
  assert.equal(hz.columns.find((c) => c.id === 'phases').get(hz.rows()[0]), 'Design, Operation');
  const sr = secs.find((s) => s.id === 'safetyReports');
  assert.equal(sr.label, 'Safety reports');
  assert.deepEqual(sr.columns.map((c) => c.id), ['number', 'date', 'type', 'summary', 'location', 'parties', 'description']);
  assert.deepEqual(['number', 'date', 'type', 'summary'].map((id) => sr.columns.find((c) => c.id === id).get(sr.rows()[0])), ['SR-7', '2026-04-01', 'Occurrence', 'Spill <b>x</b>']);
});
```

(If the file already has a produced-output test that builds markdown through `docs.produce` or similar, add to it an assertion that `Spill <b>x</b>` appears escaped — `\<b\>` in markdown, `&lt;b&gt;` in HTML — using whatever produce call that test uses. If there is none, skip this; the browser check covers it.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/reports/snapshot.test.js test/reports/docgen-host.test.js`
Expected: FAIL — `row.phases` is undefined; the section list differs.

- [ ] **Step 3: Write the implementation**

`src/reports/snapshot.js` (import `phasesOf`, `safetyReportsOn`; extend the `SnapshotRow` typedef with `phases: string[]` and `safetyReports: { number: string, date: string | null, type: string, summary: string, description: string, location: string, parties: string }[]`), in the row mapping:

```js
      phases: phasesOf(data, r.hazard.id).map((x) => x.phase.name),
      safetyReports: safetyReportsOn(data, r.hazard.id, platformId).map((s) => ({
        number: s.number, date: s.date, type: s.type, summary: s.summary, description: s.description, location: s.location, parties: s.parties,
      })),
```

`src/reports/docgen-host.js`: in the `hazards` section, before `description`, add
`{ id: 'phases', label: 'Lifecycle phases', w: 4, optional: true, get: (/** @type {any} */ r) => (r.phases ?? []).join(', ') },`
and append the section:

```js
    {
      id: 'safetyReports', label: 'Safety reports',
      keyColumn: hazardKey,
      columns: [
        { id: 'number', label: 'Report', w: 2, get: (/** @type {any} */ r) => r.number },
        { id: 'date', label: 'Date', w: 2, get: (/** @type {any} */ r) => r.date ?? '' },
        { id: 'type', label: 'Type', w: 2, get: (/** @type {any} */ r) => r.type },
        { id: 'summary', label: 'Summary', w: 5, get: (/** @type {any} */ r) => r.summary },
        { id: 'location', label: 'Location', w: 3, get: (/** @type {any} */ r) => r.location },
        { id: 'parties', label: 'Parties involved', w: 3, get: (/** @type {any} */ r) => r.parties },
        { id: 'description', label: 'Description', w: 5, optional: true, get: (/** @type {any} */ r) => r.description },
      ],
      rows: rows((x) => x.rows.flatMap((h) => (h.safetyReports ?? []).map((s) => ({ reportId: h.reportId, ...s })))),
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/reports/snapshot.test.js test/reports/docgen-host.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass (update any test that pins the Hazards columns list to include `phases` before `description`).

```bash
git add src/reports test/reports
git commit -m "Reports: a Lifecycle phases column in Hazards and a Safety reports section

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Phases page, and phases on the hazard page

**Files:**
- Create: `src/ui/screens/phases.js`
- Modify: `src/ui/screens/common.js` (`NAV`, `SECTION`), `src/ui/render.js`, `src/ui/screens/picker.js`, `src/ui/screens/hazards.js` (Overview), `src/ui/screens/ssra.js` (platform tab's shared overview), `src/ui/controller.js`, `src/ui/styles.css`
- Test: `test/ui/screens-phases.test.js` (create)

**Interfaces:**
- Produces:
  - Nav gains `['phases', 'Phases']` after References; `SECTION.phases = 'phases'`; `render.js` case `'phases'` → `phasesView(state, data)`.
  - `phasesView(state, data)`: heading *Lifecycle phases* with a `newRecord(state, 'newPhase', 'createPhase', 'name', 'New phase name')`; table `data-table="phases"`: `name` (double-click to rename: editing kind `phaseName`, input `data-change="renamePhase" data-id`), `used` (*Used by*, `N hazard(s)`), `status` (`statusTag` or `live`), `actions` (live: *Retire* `data-action="retirePhase"`, plus *Delete…* `confirmButton` → `data-action="deletePhase"` when unused; retired: *Restore* `data-action="restoreRecord" data-kind="phase"`).
  - `phaseChips(data, h)`: `<div class="phases">` with label *Lifecycle phases*, one `<span class="chip">` per phase (name, `statusTag`, a `✕` button `data-action="unlinkPhase" data-hazard-id data-phase-id` labelled `Remove <name>`), *None yet* when empty, and a `plus` opening picker `linkPhases` (`data-hazard-id`).
  - Picker `linkPhases`: `<form data-action="linkPhases" data-hazard-id>` with checkboxes `name="phaseId"` for live phases not already ticked.
  - Controller `EDITS` gain `createPhase`, `renamePhase`, `retirePhase`, `deletePhase`, `linkPhase`, `unlinkPhase`; handler `linkPhases(args)` links each ticked phase, then closes the picker.

- [ ] **Step 1: Write the failing test**

Create `test/ui/screens-phases.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phasesView } from '../../src/ui/screens/phases.js';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { pickerView } from '../../src/ui/screens/picker.js';
import { shell } from '../../src/ui/screens/common.js';
import { html } from '../../src/ui/html.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { createPhase, linkPhase, retirePhase } from '../../src/core/ops/phases.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };
/** Design (ticked on h1, then retired), Operation (ticked on h1), Disposal (unused), <Test> (unused, markup). */
function data() {
  let d = assignNumbers(seed());
  d = createPhase(d, act, { id: 'ph1', name: 'Design' });
  d = createPhase(d, act, { id: 'ph2', name: 'Operation' });
  d = createPhase(d, act, { id: 'ph3', name: 'Disposal' });
  d = createPhase(d, act, { id: 'ph4', name: '<Test>' });
  d = linkPhase(d, act, { hazardId: 'h1', phaseId: 'ph1' });
  d = linkPhase(d, act, { hazardId: 'h1', phaseId: 'ph2' });
  return retirePhase(d, act, { id: 'ph1' });
}

test('the Phases page lists phases with their use, renames in place, retires, restores, and deletes only unused ones', () => {
  const out = phasesView(state, data()).toString();
  assert.match(out, /<h1>Lifecycle phases<\/h1>/);
  assert.match(out, /data-table="phases"/);
  assert.match(out, /data-row="ph2"[\s\S]*?Operation[\s\S]*?1 hazard[\s\S]*?data-action="retirePhase" data-id="ph2"/);
  assert.match(out, /data-row="ph1"[\s\S]*?retired[\s\S]*?data-action="restoreRecord" data-kind="phase" data-id="ph1"/);
  assert.match(out, /data-row="ph3"[\s\S]*?data-action="deletePhase" data-id="ph3"/);
  assert.doesNotMatch(out.slice(out.indexOf('data-row="ph2"'), out.indexOf('data-row="ph3"')), /deletePhase/, 'in use: no delete');
  assert.match(out, /&lt;Test&gt;/);
  const renaming = phasesView({ ...state, editing: { kind: 'phaseName', id: 'ph3' } }, data()).toString();
  assert.match(renaming, /<input class="cell-edit" name="name" value="Disposal"[^>]*data-change="renamePhase" data-id="ph3"/);
});

test('the nav has Phases', () => {
  assert.match(shell({ ...state, view: { name: 'phases' } }, html``).toString(), /class="nav on" data-action="go" data-view="phases">Phases</);
});

test('the hazard page shows its phases as chips, a retired one tagged, with + to add and ✕ to remove, on the Overview and on each platform tab', () => {
  for (const tab of [undefined, 'p:p1']) {
    const out = hazardView({ ...state, view: { name: 'hazard', id: 'h1', tab } }, data(), 'h1').toString();
    assert.match(out, /class="phases"[\s\S]*?Lifecycle phases[\s\S]*?Design <span class="tag tag-retired">retired<\/span>[\s\S]*?Operation/);
    assert.match(out, /data-action="unlinkPhase" data-hazard-id="h1" data-phase-id="ph2"/);
    assert.match(out, /data-action="openPicker" data-picker="linkPhases" data-hazard-id="h1"/);
  }
});

test('the phase picker offers live phases not already ticked', () => {
  const out = pickerView({ ...state, picker: { picker: 'linkPhases', hazardId: 'h1' } }, data()).toString();
  assert.match(out, /<form data-action="linkPhases" data-hazard-id="h1"/);
  assert.match(out, /value="ph3"/);
  assert.doesNotMatch(out, /value="ph1"|value="ph2"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/screens-phases.test.js`
Expected: FAIL — cannot find `src/ui/screens/phases.js`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/screens/phases.js`:

```js
import { html } from '../html.js';
import { dataAttrs, statusTag, confirmButton, plus } from './common.js';
import { dataTable } from './table.js';
import { newRecord } from './hazards.js';
import { listPhases, phaseUsage, phasesOf } from '../../core/queries.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** The managed list of lifecycle phases. @param {any} state @param {Data} data */
export function phasesView(state, data) {
  const renaming = (/** @type {string} */ id) => state.editing?.kind === 'phaseName' && state.editing.id === id;
  return html`<div class="head"><h1>Lifecycle phases</h1>${newRecord(state, 'newPhase', 'createPhase', 'name', 'New phase name')}</div>
    <p class="muted">The stages of a platform's life a hazard can arise in. Each hazard ticks its phases on its page.</p>
    ${dataTable(state, {
      id: 'phases',
      rowKey: (p) => p.id,
      rows: listPhases(data),
      empty: 'No phases yet.',
      columns: [
        { key: 'name', label: 'Phase', width: 520, minWidth: 200, value: (p) => p.name,
          render: (p) => (renaming(p.id)
            ? html`<input class="cell-edit" name="name" value="${p.name}" required aria-label="Phase name" autofocus ${dataAttrs({ change: 'renamePhase', id: p.id })}>`
            : html`<span class="cell-text" ${dataAttrs({ dblclick: 'startEdit', kind: 'phaseName', id: p.id })} title="Double-click to rename">${p.name}</span>`) },
        { key: 'used', label: 'Used by', width: 240, minWidth: 120, value: (p) => phaseUsage(data, p.id).length,
          render: (p) => { const n = phaseUsage(data, p.id).length; return `${n} ${n === 1 ? 'hazard' : 'hazards'}`; } },
        { key: 'status', label: 'Status', width: 200, minWidth: 110, value: (p) => p.status, render: (p) => statusTag(p.status) || 'live' },
        { key: 'actions', label: '', width: 300, minWidth: 160, sortable: false, render: (p) => (p.status === 'live'
          ? html`<div class="row-actions"><button type="button" ${dataAttrs({ action: 'retirePhase', id: p.id })}>Retire</button>${phaseUsage(data, p.id).length ? '' : confirmButton('Delete…', `Delete ${p.name}`, dataAttrs({ action: 'deletePhase', id: p.id }))}</div>`
          : html`<div class="row-actions"><button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'phase', id: p.id })}>Restore</button></div>`) },
      ],
    })}`;
}

/** A hazard's lifecycle phases as chips, with + to add and ✕ to remove. @param {Data} data @param {any} h the hazard */
export function phaseChips(data, h) {
  const list = phasesOf(data, h.id);
  return html`<div class="phases"><span class="phases-label">Lifecycle phases</span>
    ${list.map(({ phase }) => html`<span class="chip">${phase.name}${statusTag(phase.status)}<button type="button" class="chip-x" ${dataAttrs({ action: 'unlinkPhase', 'hazard-id': h.id, 'phase-id': phase.id })} title="Remove ${phase.name}" aria-label="Remove ${phase.name}">✕</button></span>`)}
    ${list.length ? '' : html`<span class="muted">None yet</span>`}
    ${plus({ action: 'openPicker', picker: 'linkPhases', 'hazard-id': h.id }, 'Add lifecycle phases')}</div>`;
}
```

(`statusTag('retired')` renders ` <span class="tag tag-retired">retired</span>` with a leading space, which the test's `Design <span…` relies on.)

`src/ui/screens/common.js`: `NAV` gains `['phases', 'Phases']` after `['references', 'References']`; `SECTION` gains `phases: 'phases'`.

`src/ui/render.js`: import `phasesView` from `./screens/phases.js`; add `case 'phases': return phasesView(state, data);`.

`src/ui/screens/hazards.js`: import `phaseChips` from `./phases.js`; in the Overview, directly after the description textarea, add `${phaseChips(data, h)}`.

`src/ui/screens/ssra.js`: import `phaseChips`; in `platformTab`'s Overview section, directly after the description textarea, add `${phaseChips(data, h)}`.

`src/ui/screens/picker.js` (import `phasesOf`, and `live` is already imported), before `linkReferences`:

```js
  if (p.picker === 'linkPhases') {
    const ticked = new Set(phasesOf(data, p.hazardId).map((x) => x.phase.id));
    const phases = live(data, 'phase').filter((ph) => !ticked.has(ph.id)).sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    return frame('Add lifecycle phases', html`<form data-action="linkPhases" ${dataAttrs({ 'hazard-id': p.hazardId })} class="picker-form">
      ${search()}
      <ul class="pick-list">${phases.map((ph) => html`<li data-pick-text="${String(ph.name).toLowerCase()}"><label><input type="checkbox" name="phaseId" value="${ph.id}"> ${ph.name}</label></li>`)}</ul>
      ${phases.length ? '' : html`<p class="muted">${live(data, 'phase').length ? 'Every live phase is already ticked.' : 'No phases yet: add them on the Phases page.'}</p>`}
      ${buttons('Add')}</form>`);
  }
```

`src/ui/controller.js`: import `* as phases from '../core/ops/phases.js'`; `EDITS` gain `createPhase: phases.createPhase, renamePhase: phases.renamePhase, retirePhase: phases.retirePhase, deletePhase: phases.deletePhase, linkPhase: phases.linkPhase, unlinkPhase: phases.unlinkPhase,`; after `linkExistingControls` add

```js
    async linkPhases(args) {
      for (const phaseId of list(args.phaseId)) await applyEdit('linkPhase', { hazardId: args.hazardId, phaseId });
      set({ picker: null });
    },
```

`src/ui/styles.css`, append:

```css
/* Lifecycle phases as chips */
.phases { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 10px 0 14px; }
.phases-label { font-weight: 700; margin-right: 4px; }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 10px; border-radius: 999px; background: var(--p-surface-2); border: 1px solid var(--p-line); }
.chip-x { border: 0; background: transparent; color: var(--p-muted); padding: 0 4px; line-height: 1; cursor: pointer; }
.chip-x:hover { color: var(--p-danger); }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/screens-phases.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass (a test pinning the nav's buttons gains Phases).

```bash
git add src/ui test/ui
git commit -m "A Phases page to manage lifecycle phases, and each hazard's phases as chips on its Overview and platform tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Safety reports on the platform tab

**Files:**
- Modify: `src/ui/screens/ssra.js`, `src/ui/screens/hazards.js` (delete warning), `src/ui/screens/platforms.js` (delete warning), `src/ui/controller.js`, `src/ui/styles.css`
- Test: `test/ui/screens-ssra.test.js` (append)

**Interfaces:**
- Consumes: Task 2 (`safetyReportsOn`, ops, `SAFETY_REPORT_TYPES`).
- Produces:
  - Platform tab section *Safety reports* (`data-table="safetyReports"`), placed after the Overview and before Existing controls: columns `number` (*Report*), `date`, `type`, `summary`, `location`, `parties` (*Parties involved*), `actions` (✕ `data-action="deleteSafetyReport" data-id`); each text cell is `<span class="cell-text" data-dblclick="startEdit" data-kind="safetyReport" data-id="<id>">`; `+` starts `editing: { kind: 'safetyReport', id: 'new:<platformId>' }`.
  - The form (`class="report-form"`): new → `data-action="createSafetyReport" data-hazard-id data-platform-id`; edit → `data-action="updateSafetyReport" data-id`; fields `number`, `date` (`type="date"`), `reportType` (select), `summary` (required), `location`, `parties`, `description` (textarea); *Add* / *Save*, *Cancel*.
  - Controller `EDITS` gain `createSafetyReport`, `updateSafetyReport`, `deleteSafetyReport`.
  - The hazard's Delete confirmation reads `Delete this hazard, its causal factors, consequences, control links, lifecycle phases and safety reports`; the platform's reads `Delete this platform and its safety reports`.

- [ ] **Step 1: Write the failing test**

Append to `test/ui/screens-ssra.test.js` (import `createSafetyReport` from `../../src/core/ops/safety-reports.js`):

```js
function reported() {
  let d = data();
  d = createSafetyReport(d, act, { id: 'sr1', hazardId: 'h1', platformId: 'p1', number: 'SR-10', date: '2026-03-04', reportType: 'Near miss', summary: 'Rotor <b>strike</b>', location: 'Hangar 3', parties: 'Crew A', description: 'Blade tip hit a stand' });
  return createSafetyReport(d, act, { id: 'sr2', hazardId: 'h1', platformId: 'p2', summary: 'On Bravo' });
}

test('a platform tab lists that platform\'s safety reports after the overview, + to add, double-click to edit, ✕ to delete', () => {
  const out = hazardView(on('p:p1'), reported(), 'h1').toString();
  const order = ['Overview', 'Safety reports', 'Existing controls'].map((h) => out.indexOf(`<h2>${h}`));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), `sections in SSRA order: ${order}`);
  assert.match(out, /data-table="safetyReports"[\s\S]*?SR-10[\s\S]*?4 Mar 2026[\s\S]*?Near miss[\s\S]*?Rotor &lt;b&gt;strike&lt;\/b&gt;[\s\S]*?Hangar 3[\s\S]*?Crew A/);
  assert.doesNotMatch(out, /On Bravo/);
  assert.match(out, /data-dblclick="startEdit" data-kind="safetyReport" data-id="sr1"/);
  assert.match(out, /data-action="deleteSafetyReport" data-id="sr1"/);
  assert.match(out, /data-action="startEdit" data-kind="safetyReport" data-id="new:p1"/);
  assert.doesNotMatch(out, /<b>strike<\/b>/);
});

test('the safety report form adds a new one, or edits one with its values filled in', () => {
  const adding = hazardView({ ...on('p:p1'), editing: { kind: 'safetyReport', id: 'new:p1' } }, reported(), 'h1').toString();
  assert.match(adding, /<form data-action="createSafetyReport" data-hazard-id="h1" data-platform-id="p1" class="report-form">/);
  assert.match(adding, /<select name="reportType"[^>]*>[\s\S]*?<option value="Occurrence" selected>/);
  assert.match(adding, /<input name="summary" required/);
  const editing = hazardView({ ...on('p:p1'), editing: { kind: 'safetyReport', id: 'sr1' } }, reported(), 'h1').toString();
  assert.match(editing, /<form data-action="updateSafetyReport" data-id="sr1" class="report-form">/);
  assert.match(editing, /<input type="date" name="date" value="2026-03-04"/);
  assert.match(editing, /<option value="Near miss" selected>/);
  assert.match(editing, /<textarea name="description"[^>]*>Blade tip hit a stand<\/textarea>/);
});

test('deleting a hazard or a platform warns that its safety reports go too', async () => {
  const { platformView } = await import('../../src/ui/screens/platforms.js');
  assert.match(hazardView(state, reported(), 'h2').toString(), /lifecycle phases and safety reports/);
  let d = reported();
  const { createPlatform } = await import('../../src/core/ops/platforms.js');
  d = createPlatform(d, act, { id: 'p3', name: 'Charlie', ownerId: 'u1' });
  assert.match(platformView(state, d, 'p3').toString(), /Delete this platform and its safety reports/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/screens-ssra.test.js`
Expected: FAIL — no Safety reports section.

- [ ] **Step 3: Write the implementation**

`src/ui/screens/ssra.js` (import `safetyReportsOn` from queries, `SAFETY_REPORT_TYPES` from `../../core/ops/safety-reports.js`, `day` from `../names.js`):

```js
/** The form to add a safety report, or to edit one. @param {any} h the hazard @param {string} platformId @param {any} r the report, or null to add */
function safetyReportForm(h, platformId, r) {
  const at = r ? { action: 'updateSafetyReport', id: r.id } : { action: 'createSafetyReport', 'hazard-id': h.id, 'platform-id': platformId };
  const v = r ?? { number: '', date: '', type: 'Occurrence', summary: '', description: '', location: '', parties: '' };
  return html`<form ${dataAttrs(at)} class="report-form">
    <label>Report number<input name="number" value="${v.number}" autocomplete="off"></label>
    <label>Date<input type="date" name="date" value="${v.date ?? ''}"></label>
    <label>Type<select name="reportType" aria-label="Type">${SAFETY_REPORT_TYPES.map((t) => option(t, t, v.type))}</select></label>
    <label class="wide">Summary<input name="summary" required value="${v.summary}" autocomplete="off"></label>
    <label>Location<input name="location" value="${v.location}" autocomplete="off"></label>
    <label>Parties involved<input name="parties" value="${v.parties}" autocomplete="off"></label>
    <label class="wide">Description<textarea name="description" rows="4">${v.description}</textarea></label>
    <div class="actions wide"><button type="submit" class="primary">${r ? 'Save' : 'Add'}</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></div>
  </form>`;
}

/** This platform's safety reports for the hazard. @param {any} state @param {Data} data @param {any} h @param {string} platformId */
function safetyReportsSection(state, data, h, platformId) {
  const rows = safetyReportsOn(data, h.id, platformId);
  const editing = state.editing?.kind === 'safetyReport' ? state.editing.id : null;
  /** @param {any} r @param {unknown} text */
  const cell = (r, text) => html`<span class="cell-text" ${dataAttrs({ dblclick: 'startEdit', kind: 'safetyReport', id: r.id })} title="Double-click to edit">${text}</span>`;
  const edited = editing && rows.find((r) => r.id === editing);
  return html`${dataTable(state, {
    id: 'safetyReports',
    rowKey: (r) => r.id,
    rows,
    empty: 'No safety reports for this platform yet.',
    tools: plus({ action: 'startEdit', kind: 'safetyReport', id: `new:${platformId}` }, 'Add a safety report'),
    columns: [
      { key: 'number', label: 'Report', width: 200, minWidth: 110, value: (r) => r.number, render: (r) => cell(r, r.number || '—') },
      { key: 'date', label: 'Date', width: 190, minWidth: 120, value: (r) => r.date ?? '', render: (r) => cell(r, r.date ? day(r.date) : '—') },
      { key: 'type', label: 'Type', width: 210, minWidth: 120, value: (r) => r.type, render: (r) => cell(r, r.type) },
      { key: 'summary', label: 'Summary', width: 560, minWidth: 200, value: (r) => r.summary, render: (r) => cell(r, r.summary) },
      { key: 'location', label: 'Location', width: 260, minWidth: 120, value: (r) => r.location, render: (r) => cell(r, r.location) },
      { key: 'parties', label: 'Parties involved', width: 300, minWidth: 140, value: (r) => r.parties, render: (r) => cell(r, r.parties) },
      { key: 'actions', label: '', width: 110, minWidth: 80, sortable: false,
        render: (r) => html`<div class="row-actions">${confirmButton('✕', 'Delete this safety report', dataAttrs({ action: 'deleteSafetyReport', id: r.id }))}</div>` },
    ],
  })}
  ${editing === `new:${platformId}` ? safetyReportForm(h, platformId, null) : edited ? safetyReportForm(h, platformId, edited) : ''}`;
}
```

In `platformTab`, after the Overview section add
`<section class="ssra-sec"><h2>Safety reports</h2><section class="block">${safetyReportsSection(state, data, h, platformId)}</section></section>`.

`src/ui/screens/hazards.js`: the delete confirmation becomes `'Delete this hazard, its causal factors, consequences, control links, lifecycle phases and safety reports'`.

`src/ui/screens/platforms.js`: the delete confirmation becomes `'Delete this platform and its safety reports'`.

`src/ui/controller.js`: import `* as safetyReports from '../core/ops/safety-reports.js'`; `EDITS` gain `createSafetyReport: safetyReports.createSafetyReport, updateSafetyReport: safetyReports.updateSafetyReport, deleteSafetyReport: safetyReports.deleteSafetyReport,`.

`src/ui/styles.css`, append:

```css
/* The safety report form */
.report-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px 14px; margin: 12px 0; padding: 12px 14px; background: var(--p-surface); border: 1px solid var(--p-line); border-radius: 10px; max-width: 1100px; }
.report-form label { display: grid; gap: 4px; font-weight: 700; }
.report-form input, .report-form select, .report-form textarea { font-weight: 400; }
.report-form .wide { grid-column: 1 / -1; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/screens-ssra.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass (update any test pinning the old delete confirmation texts; piece 1's SSRA section-order test still holds since it checks relative order only).

```bash
git add src/ui test/ui
git commit -m "Safety reports on each platform tab: + to add, double-click to edit, with number, date, type, summary, location, parties and description

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Deleting a hazard or platform takes three clicks, and can be undone

(jay's request at plan review: deleting a hazard or platform must not happen by accident, and an Undo must appear in case it does.)

**Files:**
- Modify: `src/ui/screens/common.js` (`deletePanel`, the undo message in `messages`), `src/ui/screens/hazards.js`, `src/ui/screens/platforms.js`, `src/ui/controller.js`, `src/ui/styles.css`
- Test: `test/ui/delete-undo.test.js` (create)

**Interfaces:**
- Produces:
  - Click 1 opens the *Delete…* disclosure; click 2 (its red button) dispatches `askDelete` (`data-action="askDelete" data-kind="hazard|platform" data-id`), which sets `state.confirmDelete = { kind, id }` and deletes nothing; click 3 is *Yes, delete …* in the panel that replaces the page's actions (`data-action="confirmDelete" data-kind data-id`), beside *Keep it* (`data-action="cancelDelete"`).
  - `deleteName(kind, rec)` (common.js) names what is deleted: a platform's name; a hazard as `H-0001 Fire`, or just its title while it is unnumbered (`hazardLabel` gives `TBC`).
  - `confirmDelete` runs `deleteHazard`/`deletePlatform`, goes to the list, and sets `state.undo = { text: 'Deleted <name>.', before, after }` (the working data before and after).
  - While `state.undo` is set and the working data is still `after`, the message area shows `Deleted <name>.` with an *Undo* button (`data-action="undoDelete"`); another change or a save replaces the working data, and the offer disappears.
  - `undoDelete` puts `before` back as the working data (the delete leaves no trace: the edit was never saved) and says `Restored <name>.`.
  - `go` clears `confirmDelete`; `askDelete` and `cancelDelete` are quiet (in `QUIET`).

- [ ] **Step 1: Write the failing test**

Create `test/ui/delete-undo.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController, initialState } from '../../src/ui/controller.js';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { platformView } from '../../src/ui/screens/platforms.js';
import { messages } from '../../src/ui/screens/common.js';
import { seed } from '../helpers.js';

const env = (f) => ({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

async function ready() {
  const c = createController(env(new MemoryFolder()));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  await c.dispatch({ type: 'selectProfile', id: c.getState().profiles[0].id });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: c.getState().profileId });
  return c;
}
const W = (c) => c.getState().session.working;
const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };

test('the second click only asks; the third deletes; Undo puts it back', async () => {
  const c = await ready();
  await c.dispatch({ type: 'askDelete', kind: 'hazard', id: 'h1' });
  assert.deepEqual(c.getState().confirmDelete, { kind: 'hazard', id: 'h1' });
  assert.equal(W(c).records.hazard.h1.status, 'live', 'nothing deleted yet');
  await c.dispatch({ type: 'cancelDelete' });
  assert.equal(c.getState().confirmDelete, null);
  await c.dispatch({ type: 'askDelete', kind: 'hazard', id: 'h1' });
  const before = W(c);
  await c.dispatch({ type: 'confirmDelete', kind: 'hazard', id: 'h1' });
  assert.equal(W(c).records.hazard.h1.status, 'deleted');
  assert.equal(c.getState().view.name, 'hazards');
  assert.equal(c.getState().confirmDelete, null);
  assert.match(messages(c.getState()).toString(), /Deleted Fire\.[\s\S]*?data-action="undoDelete"/);
  await c.dispatch({ type: 'undoDelete' });
  assert.equal(W(c), before, 'exactly as before the delete');
  assert.equal(W(c).records.hazard.h1.status, 'live');
  assert.doesNotMatch(messages(c.getState()).toString(), /undoDelete/);
  assert.match(c.getState().message.text, /Restored Fire/);
});

test('Undo is offered only until the next change', async () => {
  const c = await ready();
  await c.dispatch({ type: 'askDelete', kind: 'platform', id: 'p1' });
  await c.dispatch({ type: 'confirmDelete', kind: 'platform', id: 'p1' });
  assert.equal(c.getState().view.name, 'platforms');
  assert.match(messages(c.getState()).toString(), /Deleted Alpha\./);
  await c.dispatch({ type: 'createHazard', id: 'h9', title: 'Later' });
  assert.doesNotMatch(messages(c.getState()).toString(), /undoDelete/);
  await c.dispatch({ type: 'undoDelete' });
  assert.equal(W(c).records.platform.p1.status, 'deleted', 'too late: nothing is undone');
  assert.ok(W(c).records.hazard.h9);
});

test('the pages ask before deleting: the red button asks, and the final panel deletes or keeps', () => {
  const d = seed();
  const h = hazardView({ ...state, view: { name: 'hazard', id: 'h2' } }, d, 'h2').toString();
  assert.match(h, /<summary>Delete…<\/summary><button type="button" class="danger" data-action="askDelete" data-kind="hazard" data-id="h2">/);
  assert.doesNotMatch(h, /data-action="deleteHazard"/);
  const asking = hazardView({ ...state, view: { name: 'hazard', id: 'h2' }, confirmDelete: { kind: 'hazard', id: 'h2' } }, d, 'h2').toString();
  assert.match(asking, /class="delete-panel"[\s\S]*?data-action="confirmDelete" data-kind="hazard" data-id="h2"[^>]*>Yes, delete Flood<\/button>[\s\S]*?data-action="cancelDelete"[^>]*>Keep it</);
  const p = platformView({ ...state, confirmDelete: { kind: 'platform', id: 'p3' } }, (() => { const x = structuredClone(d); x.records.platform.p3 = { ...x.records.platform.p1, id: 'p3', name: 'Charlie' }; return x; })(), 'p3').toString();
  assert.match(p, /data-action="confirmDelete" data-kind="platform" data-id="p3"[^>]*>Yes, delete Charlie</);
});
```

(An unnumbered hazard is named by its title alone; a numbered one as `H-0001 Fire`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/delete-undo.test.js`
Expected: FAIL — `askDelete` is not a known action (or no `confirmDelete` state).

- [ ] **Step 3: Write the implementation**

`src/ui/screens/common.js` (import `UNNUMBERED` and `hazardLabel` from `../../core/ids.js` if not already):

```js
/** How a hazard or platform is named when deleting it. @param {'hazard' | 'platform'} kind @param {any} rec */
export function deleteName(kind, rec) {
  if (kind === 'platform') return rec.name;
  const label = hazardLabel(rec);
  return label === UNNUMBERED ? rec.title : `${label} ${rec.title}`;
}

/**
 * The last step before deleting a hazard or platform: it replaces the page's actions, so the
 * delete takes three deliberate clicks.
 * @param {'hazard' | 'platform'} kind @param {string} id @param {string} what e.g. "H-0001 Fire"
 */
export function deletePanel(kind, id, what) {
  return html`<div class="delete-panel" role="alertdialog" aria-label="Confirm delete">
    <p><strong>Delete ${what}?</strong> You can undo it straight after, until you make another change or save.</p>
    <div class="actions"><button type="button" class="danger" ${dataAttrs({ action: 'confirmDelete', kind, id })}>Yes, delete ${what}</button>
      <button type="button" ${dataAttrs({ action: 'cancelDelete' })}>Keep it</button></div></div>`;
}
```

and in `messages(state)`, before the warnings, add the undo offer:

```js
  const u = state.undo && state.session?.working === state.undo.after ? state.undo : null;
```

rendering, when `u` is set, `html`<div class="msg msg-info" role="status"><strong>${u.text}</strong> <button type="button" ${dataAttrs({ action: 'undoDelete' })}>Undo</button></div>``.

`src/ui/screens/hazards.js`, `hazardView`: the Delete confirmation button's attributes become `dataAttrs({ action: 'askDelete', kind: 'hazard', id: h.id })`; and where the page's actions are rendered, show `deletePanel('hazard', h.id, deleteName('hazard', h))` instead when `state.confirmDelete?.kind === 'hazard' && state.confirmDelete.id === h.id`.

`src/ui/screens/platforms.js`, `platformView`: likewise with `dataAttrs({ action: 'askDelete', kind: 'platform', id })` and `deletePanel('platform', id, deleteName('platform', p))`.

`src/ui/controller.js` (import `deleteName` from `./screens/common.js`):
- `initialState()` gains `confirmDelete: null, undo: null`.
- `QUIET` gains `'askDelete', 'cancelDelete'`.
- `go` also sets `confirmDelete: null`.
- handlers:

```js
    async askDelete({ kind, id }) {
      if (kind !== 'hazard' && kind !== 'platform') throw new PivotError('not-found', 'Only a hazard or a platform is deleted this way.');
      set({ confirmDelete: { kind, id } });
    },
    async cancelDelete() {
      set({ confirmDelete: null });
    },
    async confirmDelete({ kind, id }) {
      const before = state.session?.working;
      const rec = before?.records[kind]?.[id];
      if (!before || !rec || (kind !== 'hazard' && kind !== 'platform')) throw new PivotError('not-found', 'That record no longer exists.');
      await applyEdit(kind === 'hazard' ? 'deleteHazard' : 'deletePlatform', { id });
      const name = deleteName(kind, rec);
      set({ confirmDelete: null, undo: { text: `Deleted ${name}.`, before, after: state.session?.working }, view: { name: kind === 'hazard' ? 'hazards' : 'platforms' } });
    },
    async undoDelete() {
      const u = state.undo;
      if (!u || !state.session || state.session.working !== u.after) { set({ undo: null }); return; }
      set({ session: { ...state.session, working: u.before }, undo: null, message: { kind: 'info', text: u.text.replace(/^Deleted/, 'Restored') } });
      await afterChange();
    },
```

(If `applyEdit` throws — e.g. the hazard is still on a platform — the handler stops there, the error shows as usual, and no undo is offered.)

`src/ui/styles.css`, append:

```css
.delete-panel { border: 1px solid var(--p-danger); border-radius: 10px; padding: 12px 14px; margin: 12px 0; background: var(--p-error-bg); }
.delete-panel p { margin: 0 0 10px; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/delete-undo.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass (update tests that pinned `data-action="deleteHazard"` / `"deletePlatform"` on the pages, or dispatched those directly through the page's button, to the new flow; tests dispatching the `deleteHazard` edit directly still work).

```bash
git add src/ui test/ui
git commit -m "Deleting a hazard or platform takes three clicks, and an Undo is offered until the next change

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Build, and a check in the browser

- [ ] **Step 1: Build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass; `OK wrote …/dist/pivot.html`.

- [ ] **Step 2: Check it in a real browser**

Serve `dist/` and drive it with the Playwright MCP tools (folder picker stubbed with the browser's private file system; seed a folder the way pieces 1 and 2 did). Check:

1. The nav has Phases. Add *Design*, *Operation*, *Disposal*; a duplicate name is refused with a message; rename one by double-click.
2. On a hazard's Overview, + opens the phase picker; tick two; the chips show on the Overview and on every platform tab; ✕ removes one.
3. Retire a ticked phase on the Phases page: the chip shows *retired*, the picker no longer offers it, Delete is not offered while it is in use; Restore brings it back.
4. On a platform tab: + opens the safety report form; add one with markup in the summary, a date and a type; it appears (markup literal); double-click it, change the location, Save; ✕ deletes another. The other platform's tab does not show it.
5. Unlink the hazard from that platform and link it back: the safety report is there again.
6. The hazard's History shows the phase and safety report entries, labelled.
7. Save, produce a report: the Markdown has a Lifecycle phases column (if the design shows optional columns) and a Safety reports table with the markup escaped.
8. Delete a hazard: *Delete…*, the red button, then *Yes, delete*; it is gone from the list and *Undo* brings it back; delete it again, make another change, and the Undo offer has gone.
9. Both themes.

Fix anything that does not behave as described, with a test where the fault is in rendering or the controller.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A src test
git commit -m "SSRA piece 3: fixes from the browser check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
