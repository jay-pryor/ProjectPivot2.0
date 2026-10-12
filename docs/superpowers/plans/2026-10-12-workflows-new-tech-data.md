# New Tech Data Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the New Tech Data workflow. It takes a reference (existing or new), scopes it to platforms and their hazards, and gets a Changed or No change answer on four cards per platform-hazard. On Complete, it links the reference to what changed.

**Architecture:**
- A new workflow type, `newTechData`, on the existing `workflow` and `workflowStep` records.
  - Scope and answers are `workflowStep` records keyed `p:<platformId>` or `<platformId>|<hazardId>`.
  - Answers use a new optional `answer` field.
- Pure queries in `src/core/workflows.js` work out scope, progress, the cards touched by stamped changes, and the links to make.
- Ops in `src/core/ops/workflows.js` change the data.
- A new screen, `src/ui/screens/tech-data.js`, renders the open and ended workflow.
- The controller, dashboard tile, reference page and picker gain the ways in.

**Tech Stack:**
- vanilla ES modules with JSDoc types
- tests with `node:test` (`npm test`)
- `npm run typecheck` (tsc)
- `npm run build` writes `dist/pivot.html`.

**Spec:** `docs/superpowers/specs/2026-10-12-workflows-new-tech-data-design.md`

## Global Constraints

- No schema bump: `SCHEMA_VERSION` stays 5.
- Run `npm run build` after every source change.
- Blocks have sharp corners: no `border-radius` on blocks (`corners.test.js`).
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- An edit made from a workflow page is stamped with the workflow (`act.workflowId`). The controller's `act()` already does this for `view.name === 'workflow'`.
- PivotError codes:
  - `techData.open`, `techData.scope`, `techData.onboarding`
  - `reference.retired`, `reference.archived`
  - `workflow.check`, `workflow.answer`, `workflow.unmet`, `workflow.owner`, `workflow.hazard`.
- History actions:
  - "Start workflow"
  - "Start new tech data"
  - "Scope new tech data"
  - "Link hazard to platform"
  - "Create hazard on platform"
  - "Check workflow step"
  - "Work through new tech data".
- Card keys, in order: `controls`, `safetyReports`, `residual`, `sfarp`.
- Answers: `'changed'` or `'none'`, with `''` clearing to `null`.

## Review Focus

1. **A Changed answer on a hazard later unlinked from its platform.** Complete must not link that hazard: it is out of scope. This is pinned in Task 2.
2. **A control touched through the workflow, then retired before Complete.** It must not be linked. This is pinned in Task 2.
3. **A reference already linked to a scoped platform or hazard.** Complete adds no duplicate link and no history item for it. This is pinned in Task 2.
4. **Someone other than the owner viewing an open workflow.** Every tick, radio and note is disabled, and the add-hazard forms are hidden. This is pinned in Task 3.
5. **The four cards' answer radios must be separate groups.** Each card wraps its pair in its own `<form>`, so one card's answer never unsets another's. This is pinned in Task 3.

---

### Task 1: Start, scope, rules and cancelling (core)

**Files:**
- Modify: `src/core/workflows.js`: add `pairKey`, `openTechData`, `techPlatforms`, `techScope`, `techPairs`, and import `onboardingOf` and `ids`.
- Modify: `src/core/ops/workflows.js`:
  - the `startWorkflow` branch
  - `startTechData`, `setTechScope`, `addTechHazard`
  - a `stepRec` helper
  - `covered` for tech.
- Modify: `src/core/ops/references.js`: `updateCancelled` also cancels `newTechData`.
- Modify: `src/core/rules.js`: reference-subject workflows include `newTechData`; add `two-open-techdata`.
- Modify: `test/core/ops/workflows.test.js:35`: the "not available" type becomes `'bogus'`.
- Test: `test/core/ops/tech-data.test.js` (new).

**Interfaces:**
- Produces, in `src/core/workflows.js`:
  - `pairKey(platformId: string, hazardId: string) → string`, giving `'<p>|<h>'`.
  - `openTechData(data, referenceId) → Rec | null`.
  - `techPlatforms(data) → Rec[]`: live platforms not being onboarded, sorted by name.
  - `techScope(data, wf) → { platform: Rec, hazards: { hazard: Rec, reportId: string, key: string, added: boolean }[] }[]`.
  - `techPairs(data, wf) → { platform: Rec, hazard: Rec, reportId: string, key: string, added: boolean }[]`.
- Produces, in `src/core/ops/workflows.js`:
  - `startWorkflow(data, act, { id?, type: 'newTechData', referenceId })`
  - `startTechData(data, act, { id?, referenceId?, title, docNumber?, revision?, url?, path? })`
  - `setTechScope(data, act, { workflowId, platformId, hazardId?, checked })`
  - `addTechHazard(data, act, { workflowId, platformId, hazardId?, title? })`.

- [ ] **Step 1: Write the failing tests**

Create `test/core/ops/tech-data.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { entries } from '../../../src/core/history.js';
import { mergeData } from '../../../src/core/merge.js';
import { ids } from '../../../src/core/ids.js';
import { createReference, setReferenceArchived, retireReference, deleteReference } from '../../../src/core/ops/references.js';
import { retirePlatform, unlinkHazard } from '../../../src/core/ops/platforms.js';
import { checkRules } from '../../../src/core/rules.js';
import { startWorkflow, startTechData, setTechScope, addTechHazard, startOnboarding } from '../../../src/core/ops/workflows.js';
import { techScope, techPairs } from '../../../src/core/workflows.js';
import { act, later, seed } from '../../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
/** Reference r1 (rev A) and New Tech Data t1 on it. The seed has h1 Fire on p1 Alpha and p2 Bravo; h2 Flood on nothing. */
export function started() {
  const d = createReference(seed(), act, { id: 'r1', title: 'Service bulletin 12', revision: 'A', url: 'https://sb12' });
  return startWorkflow(d, act, { id: 't1', type: 'newTechData', referenceId: 'r1' });
}
export const scope = (d, platformId, hazardId, checked = true) => setTechScope(d, act, { workflowId: 't1', platformId, hazardId, checked });
/** t1 with p1|h1 and p2|h1 in scope. */
export const scoped = () => scope(scope(scope(scope(started(), 'p1'), 'p1', 'h1'), 'p2'), 'p2', 'h1');
const pairs = (d) => techPairs(d, d.records.workflow.t1).map((x) => x.key);

test('New Tech Data starts on a live, unarchived reference, opens on its scope, one at a time', () => {
  const d = started();
  const w = d.records.workflow.t1;
  assert.deepEqual([w.type, w.referenceId, w.platformId, w.at.hazardId, w.linked, w.ownerId], ['newTechData', 'r1', null, '@scope', null, 'u1']);
  assert.throws(() => startWorkflow(d, act, { type: 'newTechData', referenceId: 'r1' }), code('techData.open'));
  assert.throws(() => startWorkflow(setReferenceArchived(d, act, { id: 'r1', archived: true }), act, { type: 'newTechData', referenceId: 'r1' }), code('reference.archived'));
  assert.throws(() => startWorkflow(retireReference(d, act, { id: 'r1' }), act, { type: 'newTechData', referenceId: 'r1' }), code('reference.retired'));
});

test('starting on a new reference makes it and the workflow in one change, made through the workflow', () => {
  const d = startTechData(seed(), act, { id: 't2', referenceId: 'r2', title: 'Test report 7', docNumber: 'TR-7', revision: '1', url: 'https://tr7' });
  assert.deepEqual([d.records.reference.r2.title, d.records.reference.r2.docNumber, d.records.workflow.t2.referenceId, d.records.workflow.t2.type], ['Test report 7', 'TR-7', 'r2', 'newTechData']);
  const e = entries(d).at(-1);
  assert.deepEqual([e.action, e.workflow, e.items.map((i) => i.kind).sort()], ['Start new tech data', 't2', ['reference', 'workflow']]);
  assert.throws(() => startTechData(seed(), act, { title: 'Nowhere' }), code('reference.empty'));
});

test('scope: platforms first, then hazards on them; unticking a platform hides its hazards until it is ticked again', () => {
  let d = scope(started(), 'p1');
  assert.throws(() => scope(d, 'p2', 'h1'), code('techData.scope'), 'p2 is not ticked');
  assert.throws(() => scope(d, 'p1', 'h2'), code('workflow.hazard'), 'h2 is not on p1');
  d = scope(d, 'p1', 'h1');
  assert.deepEqual(pairs(d), ['p1|h1']);
  assert.equal(entries(d).at(-1).action, 'Scope new tech data');
  d = scope(d, 'p1', undefined, false);
  assert.deepEqual([pairs(d), techScope(d, d.records.workflow.t1)], [[], []]);
  d = scope(d, 'p1');
  assert.deepEqual(pairs(d), ['p1|h1'], 'its hazard comes back with it');
});

test('a platform being onboarded cannot be scoped, and only the owner scopes', () => {
  const d = startOnboarding(started(), act, { id: 'o1', platformId: 'p9', name: 'Charlie', ownerId: 'u1' });
  assert.throws(() => scope(d, 'p9'), code('techData.onboarding'));
  assert.throws(() => setTechScope(started(), later, { workflowId: 't1', platformId: 'p1', checked: true }), code('workflow.owner'));
});

test('adding a hazard links it to the platform and scopes it as added, in one change; a title creates it', () => {
  let d = scope(started(), 'p1');
  d = addTechHazard(d, act, { workflowId: 't1', platformId: 'p1', hazardId: 'h2' });
  assert.equal(d.records.hazardPlatform[ids.hazardPlatform('h2', 'p1')].status, 'live');
  assert.equal(entries(d).at(-1).action, 'Link hazard to platform');
  d = addTechHazard(d, act, { workflowId: 't1', platformId: 'p1', title: '  Laser glare ' });
  assert.deepEqual([entries(d).at(-1).action, entries(d).at(-1).items.map((i) => i.kind).sort()], ['Create hazard on platform', ['hazard', 'hazardPlatform', 'workflowStep']]);
  // The new hazard's id is random and both are unnumbered, so their order is not fixed: compare sorted.
  assert.deepEqual(techPairs(d, d.records.workflow.t1).map((x) => `${x.hazard.title}:${x.added}`).sort(), ['Flood:true', 'Laser glare:true']);
  assert.throws(() => addTechHazard(d, act, { workflowId: 't1', platformId: 'p2', hazardId: 'h2' }), code('techData.scope'));
  assert.throws(() => addTechHazard(d, act, { workflowId: 't1', platformId: 'p1', title: ' ' }), (e) => e instanceof PivotError);
});

test('a hazard already on the platform, added again, is just scoped: not marked added', () => {
  const d = addTechHazard(scope(started(), 'p1'), act, { workflowId: 't1', platformId: 'p1', hazardId: 'h1' });
  assert.deepEqual(techPairs(d, d.records.workflow.t1).map((x) => [x.key, x.added]), [['p1|h1', false]]);
});

test('a hazard unlinked from its platform, or a retired platform, drops out of scope; the workflow stays open', () => {
  let d = scoped();
  assert.deepEqual(pairs(d), ['p1|h1', 'p2|h1']);
  d = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual(pairs(d), ['p2|h1']);
  d = retirePlatform(d, act, { id: 'p2' });
  assert.deepEqual([pairs(d), d.records.workflow.t1.state], [[], 'open']);
  assert.deepEqual(checkRules(d), []);
});

test('retiring, archiving or deleting the reference cancels its open New Tech Data, keeping what it covered', () => {
  for (const end of [(d) => retireReference(d, act, { id: 'r1' }), (d) => setReferenceArchived(d, act, { id: 'r1', archived: true }), (d) => deleteReference(d, act, { id: 'r1' })]) {
    const d = end(scoped());
    assert.equal(d.records.workflow.t1.state, 'cancelled');
    assert.deepEqual(d.records.workflow.t1.covered, ['p1|h1', 'p2|h1']);
    assert.deepEqual(checkRules(d), []);
  }
});

test('the rules: an open New Tech Data needs a live, unarchived reference, and one per reference', () => {
  const d = started();
  const twice = { ...d, records: { ...d.records, workflow: { ...d.records.workflow, t9: { ...d.records.workflow.t1, id: 't9' } } } };
  assert.deepEqual(checkRules(twice).map((v) => v.rule), ['two-open-techdata']);
  const gone = { ...d, records: { ...d.records, reference: { ...d.records.reference, r1: { ...d.records.reference.r1, archived: true } } } };
  assert.deepEqual(checkRules(gone).map((v) => v.rule), ['workflow-subject-not-live']);
});

test('two people starting New Tech Data on the same reference: mine is kept', () => {
  const base = createReference(seed(), act, { id: 'r1', title: 'Service bulletin 12', url: 'https://sb12' });
  const mine = startWorkflow(base, act, { id: 'mine', type: 'newTechData', referenceId: 'r1' });
  const theirs = startWorkflow(base, later, { id: 'theirs', type: 'newTechData', referenceId: 'r1' });
  const { data } = mergeData(base, mine, theirs, { by: 'u1', at: '2026-09-28T13:00:00+10:00' });
  assert.equal(data.records.workflow.mine.state, 'open');
  assert.equal(data.records.workflow.theirs.status, 'deleted');
});
```

In `test/core/ops/workflows.test.js` line 35, change `type: 'newTechData'` to `type: 'bogus'`, because New Tech Data now starts.

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `node --test test/core/ops/tech-data.test.js`
Expected: FAIL with a SyntaxError that `startTechData` is not exported.

- [ ] **Step 3: Add the queries to `src/core/workflows.js`**

Change the imports at the top:

```js
import { hazardLabel, controlLabel, workflowLabel, ids } from './ids.js';
import { platformHazards, byNumber, causalFactorsOn, platformListOn, controlsOnPlatform, implementedByOf, assessmentOf, sfarpOf, groupsOf, openItems, referenceTargets, targetPlatforms, onboardingOf } from './queries.js';
```

Keep `export { onboardingOf } from './queries.js';` as it is. Append to the end of the file:

```js
/** A platform-hazard as New Tech Data keys it. @param {string} platformId @param {string} hazardId */
export const pairKey = (platformId, hazardId) => `${platformId}|${hazardId}`;

/** The open New Tech Data on a reference, if any. @param {Data} data @param {string} referenceId */
export function openTechData(data, referenceId) {
  return live(data, 'workflow').find((w) => w.type === 'newTechData' && w.referenceId === referenceId && w.state === 'open') ?? null;
}

/** The platforms New Tech Data can take in: live ones not being onboarded, by name. @param {Data} data */
export function techPlatforms(data) {
  return live(data, 'platform').filter((p) => !onboardingOf(data, p.id)).sort((a, b) => String(a.name).localeCompare(b.name));
}

/**
 * What a New Tech Data covers now: each platform ticked that can still be taken in, with the
 * hazards ticked on it that are still live and on it, in number order. A hazard the workflow
 * linked or made is marked added.
 * @param {Data} data @param {Rec} wf
 * @returns {{ platform: Rec, hazards: { hazard: Rec, reportId: string, key: string, added: boolean }[] }[]}
 */
export function techScope(data, wf) {
  const step = (/** @type {string} */ key) => stepOf(data, wf.id, key, 'scope');
  return techPlatforms(data).filter((p) => step(`p:${p.id}`)?.checked).map((platform) => ({
    platform,
    hazards: platformHazards(data, platform.id).filter((ph) => ph.hazard.status === 'live' && step(pairKey(platform.id, ph.hazard.id))?.checked)
      .sort((a, b) => byNumber(a.hazard, b.hazard))
      .map((ph) => {
        const key = pairKey(platform.id, ph.hazard.id);
        return { hazard: ph.hazard, reportId: ph.reportId, key, added: Boolean(step(key)?.added) };
      }),
  }));
}

/** Every platform-hazard in a New Tech Data's scope now, platform by platform. @param {Data} data @param {Rec} wf */
export function techPairs(data, wf) {
  return techScope(data, wf).flatMap((s) => s.hazards.map((x) => ({ platform: s.platform, ...x })));
}
```

- [ ] **Step 4: Add the ops to `src/core/ops/workflows.js`**

Change the imports:

```js
import { CHECKS, NONE_CHECKS, ONBOARDING_POSITIONS, workflowHazards, workflowProgress, openPlatformReview, onboardingOf, onboardingProgress, stepOf, TRANSFER_GROUPS, transferGroups, openTransfer, referenceItems, openReferenceUpdate, openTechData, techPairs, pairKey } from '../workflows.js';
import { createPlatform, linkHazard } from './platforms.js';
import { createHazard } from './hazards.js';
import { createReference } from './references.js';
```

After `needHazard`, add:

```js
/** An open New Tech Data its owner is working on. @param {Data} data @param {Act} act @param {string} workflowId */
function needTech(data, act, workflowId) {
  const wf = needOpen(data, act, workflowId);
  if (wf.type !== 'newTechData') throw new PivotError('workflow.type', 'That is not New Tech Data.');
  return wf;
}

/** A step record, new or changed. @param {Data} data @param {Act} act @param {string} workflowId @param {string} hazardId @param {string} check @param {Record<string, any>} fields */
function stepRec(data, act, workflowId, hazardId, check, fields) {
  const id = ids.workflowStep(workflowId, hazardId, check);
  const existing = get(data, 'workflowStep', id);
  return existing && existing.status === 'live'
    ? changed(existing, act, fields)
    : created(act, id, { workflowId, hazardId, check, checked: false, note: '', ...fields });
}
```

Add a `newTechData` branch at the top of `startWorkflow`, before the `referenceUpdate` branch:

```js
  if (type === 'newTechData') {
    const r = need(data, 'reference', /** @type {string} */ (referenceId));
    if (r.status !== 'live') throw new PivotError('reference.retired', `${r.title} is retired.`);
    if (r.archived) throw new PivotError('reference.archived', `${r.title} is archived.`);
    if (openTechData(data, r.id)) throw new PivotError('techData.open', `${r.title} is being worked through already.`);
    return commit(data, act, 'Start workflow', [{ kind: 'workflow', rec: { ...opening(act, id, type, null, '@scope'), referenceId: r.id, linked: null } }]);
  }
```

After `startWorkflow`, add:

```js
/**
 * New Tech Data on a new reference: the reference and the workflow made together, the reference
 * made through the workflow.
 * @param {Data} data @param {Act} act
 * @param {{ id?: string, referenceId?: string, title: string, docNumber?: string, revision?: string, url?: string, path?: string }} args
 */
export function startTechData(data, act, { id = newId(), referenceId = newId(), title, docNumber, revision, url, path }) {
  const withRef = createReference(data, act, { id: referenceId, title, docNumber, revision, url, path });
  return commit(data, { ...act, workflowId: id }, 'Start new tech data', [
    { kind: 'reference', rec: withRef.records.reference[referenceId] },
    { kind: 'workflow', rec: { ...opening(act, id, 'newTechData', null, '@scope'), referenceId, linked: null } },
  ]);
}

/**
 * Tick or untick a platform, or a hazard on a ticked platform, as something the data affects.
 * Unticked, its answers are kept for if it is ticked again.
 * @param {Data} data @param {Act} act @param {{ workflowId: string, platformId: string, hazardId?: string, checked: boolean | string }} args
 */
export function setTechScope(data, act, { workflowId, platformId, hazardId, checked }) {
  const wf = needTech(data, act, workflowId);
  const on = checked === true || checked === 'true';
  const p = need(data, 'platform', platformId);
  let key = `p:${p.id}`;
  if (hazardId) {
    if (on && !stepOf(data, wf.id, key, 'scope')?.checked) throw new PivotError('techData.scope', `Tick ${p.name} first.`);
    if (on && get(data, 'hazardPlatform', ids.hazardPlatform(hazardId, p.id))?.status !== 'live') throw new PivotError('workflow.hazard', 'That hazard is not on this platform.');
    key = pairKey(p.id, hazardId);
  } else if (on) {
    if (p.status !== 'live') throw new PivotError('platform.retired', `${p.name} is retired.`);
    if (onboardingOf(data, p.id)) throw new PivotError('techData.onboarding', `${p.name} is still being onboarded.`);
  }
  return commit(data, act, 'Scope new tech data', [{ kind: 'workflowStep', rec: stepRec(data, act, wf.id, key, 'scope', { checked: on }) }]);
}

/**
 * A hazard the data brings to a ticked platform: an existing one linked to it, or a new one made
 * from a title, and scoped, all in one change. One the workflow linked or made is marked added.
 * @param {Data} data @param {Act} act @param {{ workflowId: string, platformId: string, hazardId?: string, title?: string }} args
 */
export function addTechHazard(data, act, { workflowId, platformId, hazardId, title }) {
  const wf = needTech(data, act, workflowId);
  const p = need(data, 'platform', platformId);
  if (!stepOf(data, wf.id, `p:${p.id}`, 'scope')?.checked) throw new PivotError('techData.scope', `Tick ${p.name} first.`);
  const hid = hazardId || newId();
  let d = hazardId ? data : createHazard(data, act, { id: hid, title: /** @type {string} */ (title) });
  const linkId = ids.hazardPlatform(hid, p.id);
  const already = get(d, 'hazardPlatform', linkId)?.status === 'live';
  d = linkHazard(d, act, { hazardId: hid, platformId: p.id });
  /** @type {{ kind: string, rec: Rec }[]} */
  const recs = [];
  if (!hazardId) recs.push({ kind: 'hazard', rec: d.records.hazard[hid] });
  if (!already) recs.push({ kind: 'hazardPlatform', rec: d.records.hazardPlatform[linkId] });
  recs.push({ kind: 'workflowStep', rec: stepRec(data, act, wf.id, pairKey(p.id, hid), 'scope', { checked: true, ...(already ? {} : { added: true }) }) });
  return commit(data, act, hazardId ? 'Link hazard to platform' : 'Create hazard on platform', recs);
}
```

Replace the `covered` helper:

```js
/** What an open workflow covers as it ends, kept with it so its record does not change as the platforms do. @param {Data} data @param {Rec} wf */
const covered = (data, wf) => (wf.type === 'newTechData' ? techPairs(data, wf).map((x) => x.key) : workflowHazards(data, wf).map((x) => x.hazard.id));
```

- [ ] **Step 5: Cancel with the reference, in `src/core/ops/references.js`**

Add the import `import { techPairs } from '../workflows.js';` and replace `updateCancelled`:

```js
/**
 * The records that cancel a reference's open update or New Tech Data, for an op that takes the
 * reference out of use.
 * @param {Data} data @param {Act} act @param {string} referenceId
 */
function updateCancelled(data, act, referenceId) {
  return live(data, 'workflow').filter((w) => (w.type === 'referenceUpdate' || w.type === 'newTechData') && w.referenceId === referenceId && w.state === 'open')
    .map((w) => ({ kind: 'workflow', rec: changed(w, act, { state: 'cancelled', endedBy: act.by, endedAt: act.at, covered: w.type === 'newTechData' ? techPairs(data, w).map((x) => x.key) : [] }) }));
}
```

- [ ] **Step 6: The rules, in `src/core/rules.js`**

Make these changes in the open-workflow loop:
- Add `newTechData: ['two-open-techdata', 'New Tech Data workflows']` to `TWO`.
- Replace `const onReference = w.type === 'referenceUpdate';` with `const onReference = w.type === 'referenceUpdate' || w.type === 'newTechData';`.
- Change the reference message to:

```js
        ? { rule: 'workflow-subject-not-live', message: `A ${w.type === 'newTechData' ? 'New Tech Data workflow' : 'reference update'} is in progress on a reference that is not live.`, records: [{ kind: 'workflow', id: w.id }, { kind: 'reference', id: w.referenceId }] }
```

Also change the comment above the loop: "a reference one open update and one open New Tech Data".

- [ ] **Step 7: Run the tests, then the whole suite and the typecheck**

Run: `node --test test/core/ops/tech-data.test.js && npm test 2>&1 | grep -E "ℹ (pass|fail)" && npm run typecheck`
Expected: every tech-data test passes; the suite has `ℹ fail 0`; tsc prints nothing.

- [ ] **Step 8: Build and commit**

```bash
npm run build
git add src/core/workflows.js src/core/ops/workflows.js src/core/ops/references.js src/core/rules.js test/core/ops/tech-data.test.js test/core/ops/workflows.test.js
git commit -m "New Tech Data starts on a reference, or makes one, and scopes platforms and their hazards; a hazard can be added to a scoped platform; retiring, archiving or deleting the reference cancels it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Answers, progress, what was touched, the links, and Complete (core)

**Files:**
- Modify: `src/core/workflows.js`:
  - `TECH_CARDS`, `TECH_WORDS`, `TECH_QUESTIONS`
  - `techTouched`, `techLinks`, `techProgress`
  - a `workflowProgress` branch.
- Modify: `src/core/ops/workflows.js`:
  - `setStep` (the `answer` field and a tech branch)
  - `setWorkflowPosition` (tech positions)
  - `completeWorkflow` (a tech branch).
- Test: `test/core/ops/tech-data-answers.test.js` (new).

**Interfaces:**
- Consumes these from Task 1:
  - `pairKey`, `techPairs`, `techScope`
  - the test helpers `started`, `scope` and `scoped`, exported from `test/core/ops/tech-data.test.js`.
- Produces:
  - `TECH_CARDS: readonly ['controls','safetyReports','residual','sfarp']`
  - `TECH_WORDS: Record<card, string>`
  - `TECH_QUESTIONS: Record<card, string>`
  - `techTouched(data, wf) → { cards: Map<pairKey, Set<card>>, controls: Set<controlId> }`
  - `techLinks(data, wf) → { targetKind: 'platform'|'hazard'|'control', targetId: string }[]`
  - `techProgress(data, wf) → { perHazard: Map<pairKey, number>, done, total }`. `workflowProgress` returns it for `newTechData`.
  - `setStep(data, act, { workflowId, hazardId, check, checked?, note?, answer? })`.

- [ ] **Step 1: Write the failing tests**

Create `test/core/ops/tech-data-answers.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { entries } from '../../../src/core/history.js';
import { ids } from '../../../src/core/ids.js';
import { linkReference } from '../../../src/core/ops/references.js';
import { unlinkHazard } from '../../../src/core/ops/platforms.js';
import { updateControl, retireControl } from '../../../src/core/ops/controls.js';
import { setSfarp, setRating, setControlStatus } from '../../../src/core/ops/assessment.js';
import { createSafetyReport } from '../../../src/core/ops/safety-reports.js';
import { setStep, setWorkflowPosition, completeWorkflow, cancelWorkflow, addTechHazard } from '../../../src/core/ops/workflows.js';
import { TECH_CARDS, techTouched, techLinks, workflowProgress } from '../../../src/core/workflows.js';
import { act, later } from '../../helpers.js';
import { started, scope, scoped } from './tech-data.test.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const via = { ...act, workflowId: 't1' };
const answer = (d, key, check, a, note) => setStep(d, act, { workflowId: 't1', hazardId: key, check, answer: a, note });
const answerAll = (d, key, a = 'none') => TECH_CARDS.reduce((x, c) => answer(x, key, c, a), d);
const wf = (d) => d.records.workflow.t1;
const step = (d, key, check) => d.records.workflowStep[ids.workflowStep('t1', key, check)];

test('each card takes Changed or No change and a note, only on a pair in scope; unticked, answers are kept', () => {
  let d = answer(scoped(), 'p1|h1', 'controls', 'changed', ' New interlock ');
  assert.deepEqual([step(d, 'p1|h1', 'controls').answer, step(d, 'p1|h1', 'controls').note], ['changed', 'New interlock']);
  d = answer(d, 'p1|h1', 'controls', '');
  assert.equal(step(d, 'p1|h1', 'controls').answer, null, 'blank clears it');
  assert.throws(() => answer(d, 'p1|h1', 'controls', 'maybe'), code('workflow.answer'));
  assert.throws(() => answer(d, 'p1|h1', 'references', 'none'), code('workflow.check'));
  assert.throws(() => answer(d, 'p1|h2', 'controls', 'none'), code('workflow.check'), 'h2 is not in scope');
  d = answer(d, 'p1|h1', 'sfarp', 'none');
  d = scope(d, 'p1', 'h1', false);
  assert.throws(() => answer(d, 'p1|h1', 'controls', 'none'), code('workflow.check'));
  d = scope(d, 'p1', 'h1');
  assert.equal(step(d, 'p1|h1', 'sfarp').answer, 'none');
  assert.throws(() => setStep(d, later, { workflowId: 't1', hazardId: 'p1|h1', check: 'sfarp', answer: 'changed' }), code('workflow.owner'));
});

test('progress: one for having a scope, then four cards on each pair', () => {
  assert.deepEqual((({ done, total }) => ({ done, total }))(workflowProgress(started(), wf(started()))), { done: 0, total: 1 });
  let d = scoped();
  assert.deepEqual([workflowProgress(d, wf(d)).done, workflowProgress(d, wf(d)).total], [1, 9]);
  d = answer(answer(d, 'p1|h1', 'controls', 'none'), 'p1|h1', 'sfarp', 'changed');
  const p = workflowProgress(d, wf(d));
  assert.deepEqual([p.done, p.perHazard.get('p1|h1'), p.perHazard.get('p2|h1')], [3, 2, 0]);
});

test('the position is the scope, a pair in scope, or the summary', () => {
  let d = setWorkflowPosition(scoped(), act, { workflowId: 't1', hazardId: 'p2|h1' });
  assert.equal(wf(d).at.hazardId, 'p2|h1');
  d = setWorkflowPosition(d, act, { workflowId: 't1', hazardId: '@scope' });
  assert.equal(wf(d).at.hazardId, '@scope');
  d = setWorkflowPosition(d, act, { workflowId: 't1', hazardId: null });
  assert.equal(wf(d).at.hazardId, null);
  assert.throws(() => setWorkflowPosition(d, act, { workflowId: 't1', hazardId: 'p1|h2' }), code('workflow.hazard'));
});

test('what changes made through it touched: each by its card and pair, and the controls', () => {
  let d = scoped();
  d = setSfarp(d, via, { hazardId: 'h1', platformId: 'p1', justification: 'Per SB12' });
  d = createSafetyReport(d, via, { id: 's1', hazardId: 'h1', platformId: 'p2', summary: 'Smoke seen', date: '2026-09-01' });
  d = setRating(d, via, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'personnel', consequence: 3, likelihood: 'C' });
  d = setRating(d, via, { hazardId: 'h1', platformId: 'p2', stage: 'initial', receptor: 'personnel', consequence: 3, likelihood: 'C' });
  d = setControlStatus(d, via, { hazardId: 'h1', controlId: 'c1', platformId: 'p2', status: 'implemented' });
  d = updateControl(d, via, { id: 'c2', description: 'Twice a year' });
  d = setSfarp(d, act, { hazardId: 'h1', platformId: 'p2', justification: 'Not through the workflow' });
  const { cards, controls } = techTouched(d, wf(d));
  assert.deepEqual([...cards.get('p1|h1')].sort(), ['controls', 'residual', 'sfarp']);
  assert.deepEqual([...cards.get('p2|h1')].sort(), ['controls', 'safetyReports'], 'its initial rating and its SFARP made outside do not count');
  assert.deepEqual([...controls].sort(), ['c1', 'c2']);
});

test('Complete is strict: a scope, and every card on every pair answered', () => {
  assert.throws(() => completeWorkflow(started(), act, { workflowId: 't1' }), code('workflow.unmet'));
  let d = answerAll(scoped(), 'p1|h1');
  assert.throws(() => completeWorkflow(d, act, { workflowId: 't1' }), (e) => e.code === 'workflow.unmet' && /4 things/.test(e.message));
  d = answerAll(d, 'p2|h1');
  assert.doesNotThrow(() => completeWorkflow(d, act, { workflowId: 't1' }));
});

test('Complete links the reference to the scoped platforms, the hazards changed or added, and the controls touched, in one change', () => {
  let d = scope(scoped(), 'p1');
  d = addTechHazard(d, act, { workflowId: 't1', platformId: 'p1', hazardId: 'h2' });
  d = updateControl(d, via, { id: 'c1', description: 'Checked monthly' });
  d = answerAll(answerAll(answerAll(d, 'p1|h1'), 'p2|h1'), 'p1|h2');
  assert.deepEqual(techLinks(d, wf(d)).map((t) => `${t.targetKind}:${t.targetId}`), ['platform:p1', 'platform:p2', 'hazard:h2', 'control:c1'], 'h1 has no Changed answer; h2 was added');
  d = answer(d, 'p2|h1', 'residual', 'changed');
  assert.deepEqual(techLinks(d, wf(d)).map((t) => `${t.targetKind}:${t.targetId}`), ['platform:p1', 'platform:p2', 'hazard:h1', 'hazard:h2', 'control:c1']);
  d = completeWorkflow(d, via, { workflowId: 't1' });
  const e = entries(d).at(-1);
  assert.deepEqual([e.action, e.workflow], ['Work through new tech data', 't1']);
  assert.equal(e.items.filter((i) => i.kind === 'referenceLink').length, 5);
  assert.equal(d.records.referenceLink[ids.referenceLink('r1', 'hazard', 'h1')].status, 'live');
  assert.deepEqual([wf(d).state, wf(d).covered, wf(d).linked.length], ['completed', ['p1|h1', 'p1|h2', 'p2|h1'], 5]);
});

test('Complete leaves alone links already there, and a control retired since it was touched', () => {
  let d = linkReference(scoped(), act, { referenceId: 'r1', targetKind: 'platform', targetId: 'p1' });
  d = updateControl(d, via, { id: 'c2', description: 'Twice a year' });
  d = retireControl(d, act, { id: 'c2' });
  d = answerAll(answerAll(d, 'p1|h1'), 'p2|h1');
  assert.deepEqual(techLinks(d, wf(d)).map((t) => `${t.targetKind}:${t.targetId}`), ['platform:p2']);
  d = completeWorkflow(d, act, { workflowId: 't1' });
  assert.deepEqual(entries(d).at(-1).items.filter((i) => i.kind === 'referenceLink').map((i) => i.id), [ids.referenceLink('r1', 'platform', 'p2')]);
});

test('a Changed answer on a hazard since unlinked from its platform links nothing for it', () => {
  let d = answer(answerAll(answerAll(scoped(), 'p1|h1'), 'p2|h1'), 'p1|h1', 'sfarp', 'changed');
  d = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual(techLinks(d, wf(d)).map((t) => `${t.targetKind}:${t.targetId}`), ['platform:p1', 'platform:p2']);
});

test('cancelling keeps its answers and links nothing', () => {
  const d = cancelWorkflow(answerAll(scoped(), 'p1|h1', 'changed'), act, { workflowId: 't1' });
  assert.deepEqual([wf(d).state, wf(d).covered, wf(d).linked], ['cancelled', ['p1|h1', 'p2|h1'], null]);
  assert.equal(Object.values(d.records.referenceLink ?? {}).length, 0);
});
```

Before writing the implementation, check two things:
- `updateControl` accepts only `{ id, description }` (`src/core/ops/controls.js:61`). It takes `{ id, title, description, tier, origin, kind }` with each one optional.
- `retireControl` exists (`src/core/ops/controls.js:85`).

If `updateControl` needs a title, pass `title: 'Fire drills'` (c2) and `title: 'Sprinklers'` (c1).

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `node --test test/core/ops/tech-data-answers.test.js`
Expected: FAIL. `TECH_CARDS` is not exported.

- [ ] **Step 3: Add the queries to `src/core/workflows.js`**

Append:

```js
/** New Tech Data's four cards on each platform-hazard, in order. */
export const TECH_CARDS = Object.freeze(['controls', 'safetyReports', 'residual', 'sfarp']);

/** @type {Readonly<Record<string, string>>} */
export const TECH_WORDS = Object.freeze({ controls: 'Controls', safetyReports: 'Safety reports', residual: 'Residual rating & justification', sfarp: 'SFARP' });

/** @type {Readonly<Record<string, string>>} */
export const TECH_QUESTIONS = Object.freeze({
  controls: 'Does it add, change or remove a control?',
  safetyReports: 'Does it report a safety occurrence?',
  residual: 'Does it change the residual rating or its justification?',
  sfarp: 'Does it change the SFARP?',
});

/**
 * What the changes made through a New Tech Data touched: for each pair in scope, the cards whose
 * records changed, and every control changed (the control itself, its link to a hazard, its kind
 * or status on a platform, how it is implemented, or who implements it).
 * @param {Data} data @param {Rec} wf
 * @returns {{ cards: Map<string, Set<string>>, controls: Set<string> }}
 */
export function techTouched(data, wf) {
  const pairs = techPairs(data, wf);
  const keys = new Set(pairs.map((x) => x.key));
  /** @type {Map<string, Set<string>>} */
  const cards = new Map();
  /** @type {Set<string>} */
  const controls = new Set();
  const mark = (/** @type {string} */ key, /** @type {string} */ card) => {
    if (!keys.has(key)) return;
    if (!cards.has(key)) cards.set(key, new Set());
    /** @type {Set<string>} */ (cards.get(key)).add(card);
  };
  const on = (/** @type {any} */ x, /** @type {string} */ controlId) => controlsOnPlatform(data, x.hazard.id, x.platform.id).some((c) => c.control.id === controlId);
  for (const e of workflowChanges(data, wf.id)) {
    for (const i of e.items) {
      const r = get(data, i.kind, i.id);
      if (!r) continue;
      switch (i.kind) {
        case 'safetyReport': mark(pairKey(r.platformId, r.hazardId), 'safetyReports'); break;
        case 'sfarp': mark(pairKey(r.platformId, r.hazardId), 'sfarp'); break;
        case 'assessment': if (r.stage === 'residual') mark(pairKey(r.platformId, r.hazardId), 'residual'); break;
        case 'ruling': case 'controlOn': case 'implementationStatus':
          // Adding a new control to one platform turns it off on the hazard's others: not a change there.
          if (!(i.kind === 'controlOn' && i.change === 'created' && r.off)) mark(pairKey(r.platformId, r.hazardId), 'controls');
          controls.add(r.controlId); break;
        case 'hazardControl': for (const x of pairs) if (x.hazard.id === r.hazardId && on(x, r.controlId)) mark(x.key, 'controls'); controls.add(r.controlId); break;
        case 'implementer': for (const x of pairs) if (x.platform.id === r.platformId && on(x, r.controlId)) mark(x.key, 'controls'); controls.add(r.controlId); break;
        case 'control': for (const x of pairs) if (on(x, r.id)) mark(x.key, 'controls'); controls.add(r.id); break;
        default: break;
      }
    }
  }
  return { cards, controls };
}

/**
 * The links Complete gives the reference: each scoped platform, each scoped hazard answered
 * Changed somewhere or added through the workflow, and each live control touched. Links already
 * there are left out.
 * @param {Data} data @param {Rec} wf
 * @returns {{ targetKind: string, targetId: string }[]}
 */
export function techLinks(data, wf) {
  const scope = techScope(data, wf);
  const changedHazards = new Set(scope.flatMap((s) => s.hazards.filter((x) => x.added || TECH_CARDS.some((c) => stepOf(data, wf.id, x.key, c)?.answer === 'changed')).map((x) => x.hazard.id)));
  const hazards = live(data, 'hazard').filter((h) => changedHazards.has(h.id)).sort(byNumber);
  const controls = [...techTouched(data, wf).controls].map((id) => get(data, 'control', id)).filter((c) => c && c.status === 'live').sort((a, b) => byNumber(/** @type {Rec} */ (a), /** @type {Rec} */ (b)));
  const want = [
    ...scope.map((s) => ({ targetKind: 'platform', targetId: s.platform.id })),
    ...hazards.map((h) => ({ targetKind: 'hazard', targetId: h.id })),
    ...controls.map((c) => ({ targetKind: 'control', targetId: /** @type {Rec} */ (c).id })),
  ];
  return want.filter((t) => get(data, 'referenceLink', ids.referenceLink(wf.referenceId, t.targetKind, t.targetId))?.status !== 'live');
}

/** How far a New Tech Data is: one for having a scope, then each card answered on each pair. @param {Data} data @param {Rec} wf */
export function techProgress(data, wf) {
  const pairs = techPairs(data, wf);
  /** @type {Map<string, number>} */
  const perHazard = new Map(pairs.map((x) => [x.key, TECH_CARDS.filter((c) => stepOf(data, wf.id, x.key, c)?.answer).length]));
  const done = Number(pairs.length > 0) + [...perHazard.values()].reduce((a, b) => a + b, 0);
  return { perHazard, done, total: pairs.length * TECH_CARDS.length + 1 };
}
```

In `workflowProgress`, add this as the first line of the body:

```js
  if (wf.type === 'newTechData') return techProgress(data, wf);
```

- [ ] **Step 4: Answers, position and Complete, in `src/core/ops/workflows.js`**

Add `TECH_CARDS, techLinks` to the `../workflows.js` import.

Replace `setStep` with:

```js
/**
 * Tick or untick one check, or change its note or (New Tech Data) its answer; any may be left
 * out. A tick may arrive as the text a checkbox sends; a blank answer clears it.
 * @param {Data} data @param {Act} act
 * @param {{ workflowId: string, hazardId: string, check: string, checked?: boolean | string, note?: string, answer?: string }} args
 */
export function setStep(data, act, { workflowId, hazardId, check, checked, note, answer }) {
  const wf = needOpen(data, act, workflowId);
  if (wf.type === 'transferOwner') {
    if (hazardId !== '-' || !TRANSFER_GROUPS.some(([k]) => `group:${k}` === check)) throw new PivotError('workflow.check', 'That is not one of this transfer’s groups.');
  } else if (wf.type === 'referenceUpdate') {
    if (check !== 'item' || !referenceItems(data, wf.referenceId).some((i) => i.key === hazardId)) throw new PivotError('workflow.check', 'That is not one of the items this reference informs.');
  } else if (wf.type === 'newTechData') {
    if (!TECH_CARDS.includes(check) || !techPairs(data, wf).some((x) => x.key === hazardId)) throw new PivotError('workflow.check', 'That is not in this workflow’s scope.');
  } else {
    const allowed = wf.type === 'platformOnboarding' ? NONE_CHECKS : CHECKS;
    if (!allowed.includes(check)) throw new PivotError('workflow.check', 'That is not one of this workflow’s checks.');
    needHazard(data, wf, hazardId);
  }
  if (answer !== undefined && answer !== '' && answer !== 'changed' && answer !== 'none') throw new PivotError('workflow.answer', 'An answer is Changed or No change.');
  const fields = {
    ...(checked === undefined ? {} : { checked: checked === true || checked === 'true' }),
    ...(note === undefined ? {} : { note: String(note).trim() }),
    ...(answer === undefined ? {} : { answer: answer || null }),
  };
  return commit(data, act, 'Check workflow step', [{ kind: 'workflowStep', rec: stepRec(data, act, workflowId, hazardId, check, fields) }]);
}
```

In `setWorkflowPosition`, replace the `to` line:

```js
  const to = !hazardId ? null
    : wf.type === 'platformOnboarding' && ONBOARDING_POSITIONS.includes(hazardId) ? hazardId
    : wf.type === 'newTechData' ? needPosition(data, wf, hazardId)
    : needHazard(data, wf, hazardId);
```

Add next to `needHazard`:

```js
/** Where New Tech Data can stand: its scope, or a pair in scope. @param {Data} data @param {Rec} wf @param {string} at */
function needPosition(data, wf, at) {
  if (at !== '@scope' && !techPairs(data, wf).some((x) => x.key === at)) throw new PivotError('workflow.hazard', 'That hazard is not in this workflow’s scope.');
  return at;
}
```

In `completeWorkflow`, add this branch before the `transferOwner` branch:

```js
  if (wf.type === 'newTechData') {
    const r = need(data, 'reference', wf.referenceId);
    const { done, total } = workflowProgress(data, wf);
    const left = total - done;
    if (left) throw new PivotError('workflow.unmet', `${left} thing${left === 1 ? ' is' : 's are'} still needed.`);
    const links = techLinks(data, wf);
    const recs = links.map((t) => {
      const lid = ids.referenceLink(r.id, t.targetKind, t.targetId);
      const was = get(data, 'referenceLink', lid);
      return { kind: 'referenceLink', rec: was ? changed(was, act, { status: 'live' }) : created(act, lid, { referenceId: r.id, targetKind: t.targetKind, targetId: t.targetId }) };
    });
    return commit(data, act, 'Work through new tech data', [
      ...recs,
      { kind: 'workflow', rec: changed(wf, act, { state: 'completed', endedBy: act.by, endedAt: act.at, covered: covered(data, wf), linked: links }) },
    ]);
  }
```

- [ ] **Step 5: Run the tests, the suite and the typecheck**

Run: `node --test test/core/ops/tech-data-answers.test.js test/core/ops/tech-data.test.js && npm test 2>&1 | grep -E "ℹ (pass|fail)" && npm run typecheck`
Expected: all pass, with `ℹ fail 0`, and tsc clean.

If the touched-cards test fails on `p2|h1` lacking `controls`, print `entries(d).at(-2).items` to see the kind `setControlStatus` wrote, and adjust the `case` list. Today it writes `ruling`.

- [ ] **Step 6: Build and commit**

```bash
npm run build
git add src/core/workflows.js src/core/ops/workflows.js test/core/ops/tech-data-answers.test.js
git commit -m "New Tech Data: each card on each scoped pair answered Changed or No change; what changes through it touched, by card; Complete, once all are answered, links the reference to the scoped platforms, the hazards changed or added and the controls touched

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The workflow page

**Files:**
- Create: `src/ui/screens/tech-data.js` (`techBody`, `techEnded`).
- Modify: `src/ui/screens/workflow.js`: route `newTechData`; add a `CANCEL_WORDS` entry; the title links to the reference for `newTechData` too.
- Modify: `src/ui/screens/workflows.js`: `workflowSubject` names the reference for `newTechData`.
- Test: `test/ui/screens-tech-data.test.js` (new).

**Interfaces:**
- Consumes these from Tasks 1 and 2:
  - `techScope`, `techPairs`, `techPlatforms`, `pairKey`
  - `TECH_CARDS`, `TECH_WORDS`, `TECH_QUESTIONS`
  - `techTouched`, `techLinks`, `workflowProgress`, `stepOf`.
- Consumes these from existing screens:
  - `controlsSection(state, data, h, platformId, platformName)`
  - `safetyReportsSection(state, data, h, platformId)`
  - `riskPanels(state, data, h, platformId, 'residual', 'both')`
  - `sfarpArea(data, h, platformId)`
  - `changesList(state, data, wf)` from `workflow.js`
  - `plus(attrs, label)` and `go(label, view, extra)` from `common.js`.
- Produces:
  - `techBody(state, data, wf, mine) → Raw`
  - `techEnded(state, data, wf) → Raw`.
  - These actions:
    - `setTechScope` (change: `workflow-id`, `platform-id`, `hazard-id?`, `checked`)
    - `addTechHazard` (form: `workflow-id`, `platform-id`, `title`)
    - `openPicker` with `picker: 'linkHazards'`, `platform-id` and `workflow-id`
    - `setStep` (change: `workflow-id`, `hazard-id` = pair key, `check`, with `answer` or `note`)
    - `showWorkflowHazard` (`hazard-id` = `'@scope'`, a pair key, or `''` for the summary)
    - `setWorkflowOutcome`, `completeWorkflow`.

- [ ] **Step 1: Write the failing tests**

Create `test/ui/screens-tech-data.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowView } from '../../src/ui/screens/workflow.js';
import { createReference } from '../../src/core/ops/references.js';
import { startWorkflow, setTechScope, setStep, completeWorkflow, addTechHazard } from '../../src/core/ops/workflows.js';
import { setSfarp } from '../../src/core/ops/assessment.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { TECH_CARDS } from '../../src/core/workflows.js';
import { state } from './screens-workflows.test.js';
import { seed, act } from '../helpers.js';

const at = (hazardId) => ({ ...state, view: { name: 'workflow', id: 't1', ...(hazardId === undefined ? {} : { hazardId }) } });
const scope = (d, platformId, hazardId) => setTechScope(d, act, { workflowId: 't1', platformId, hazardId, checked: true });
function started() {
  const d = createReference(seed(), act, { id: 'r1', title: 'Service bulletin 12', revision: 'A', url: 'https://sb12' });
  return assignNumbers(startWorkflow(d, act, { id: 't1', type: 'newTechData', referenceId: 'r1' }));
}
const scoped = () => assignNumbers(scope(scope(started(), 'p1'), 'p1', 'h1'));
const answerAll = (d, key, a = 'none') => TECH_CARDS.reduce((x, c) => setStep(x, act, { workflowId: 't1', hazardId: key, check: c, answer: a }), d);

test('it opens on the scope: every platform as a tick, a ticked one with its hazards, Add hazard… and a new hazard title', () => {
  const out = workflowView(at(), scoped(), 't1').toString();
  assert.match(out, /New Tech Data · <button[^>]*data-view="reference"[^>]*>Service bulletin 12/);
  assert.match(out, /<h2>Scope<\/h2>/);
  assert.match(out, /data-change="setTechScope"[^>]*data-platform-id="p1"/);
  assert.match(out, /data-change="setTechScope"[^>]*data-platform-id="p2"/);
  assert.match(out, /data-hazard-id="h1"[^>]*>[^<]*HAZ-001[^<]*Fire|HAZ-001<\/span> Fire/);
  assert.match(out, /data-picker="linkHazards"[^>]*data-workflow-id="t1"|data-workflow-id="t1"[^>]*data-picker="linkHazards"/);
  assert.match(out, /data-action="addTechHazard"[\s\S]*?name="title"/);
  assert.ok(out.indexOf('data-platform-id="p1"') < out.indexOf('data-platform-id="p2"'), 'the ticked platform first');
});

test('the rail: Scope, each platform with its hazards and their answers out of 4, then the summary', () => {
  const d = setStep(scoped(), act, { workflowId: 't1', hazardId: 'p1|h1', check: 'controls', answer: 'none' });
  const out = workflowView(at(), d, 't1').toString();
  assert.match(out, /class="wf-rail"[\s\S]*?Scope[\s\S]*?Alpha[\s\S]*?Fire[\s\S]*?1\/4[\s\S]*?Summary &amp; complete/);
  assert.match(out, /data-hazard-id="p1\|h1"/);
});

test('a pair page: four cards, each with its editor, Changed / No change in its own form, and a note', () => {
  const d = setStep(scoped(), act, { workflowId: 't1', hazardId: 'p1|h1', check: 'sfarp', answer: 'changed' });
  const out = workflowView(at('p1|h1'), d, 't1').toString();
  for (const w of ['Controls', 'Safety reports', 'Residual rating &amp; justification', 'SFARP']) assert.match(out, new RegExp(`aria-label="${w}"`));
  assert.equal((out.match(/<form class="wf-answer"/g) ?? []).length, 4, 'each card’s radios are their own group');
  assert.match(out, /type="radio" name="answer" value="changed" checked[^>]*data-check="sfarp"/);
  assert.match(out, /No changes recorded here yet/, 'Changed, with nothing made through it on SFARP');
  assert.match(out, /← Scope[\s\S]*?Summary &amp; complete →/);
});

test('the soft warning goes once a change made through it touches the card', () => {
  let d = setStep(scoped(), act, { workflowId: 't1', hazardId: 'p1|h1', check: 'sfarp', answer: 'changed' });
  d = setSfarp(d, { ...act, workflowId: 't1' }, { hazardId: 'h1', platformId: 'p1', justification: 'Per SB12' });
  assert.doesNotMatch(workflowView(at('p1|h1'), d, 't1').toString(), /No changes recorded here yet/);
});

test('the summary: the grid, what Complete will link, the outcome, and Complete held until all is answered', () => {
  let d = scoped();
  let out = workflowView(at('summary'), d, 't1').toString();
  assert.match(out, /Complete — 4 still needed/);
  assert.match(out, /Platform: Alpha/);
  d = answerAll(d, 'p1|h1');
  d = setStep(d, act, { workflowId: 't1', hazardId: 'p1|h1', check: 'residual', answer: 'changed' });
  out = workflowView(at('summary'), d, 't1').toString();
  assert.match(out, /Hazard: HAZ-001 Fire/);
  assert.match(out, /data-change="setWorkflowOutcome"/);
  assert.match(out, /data-action="completeWorkflow"[^>]*>Complete</);
  assert.match(out, /<td class="yes">Changed/);
});

test('someone else sees it read-only: no add-hazard forms, every input disabled', () => {
  const out = workflowView({ ...at(), profileId: 'u2' }, scoped(), 't1').toString();
  assert.doesNotMatch(out, /data-action="addTechHazard"/);
  assert.match(out, /<fieldset class="wf-fields" disabled>/);
  assert.match(out, /Take over…/);
});

test('completed: the grid, what it linked, the outcome and the changes made through it; an added hazard is tagged in the scope', () => {
  let d = addTechHazard(scoped(), act, { workflowId: 't1', platformId: 'p1', hazardId: 'h2' });
  assert.match(workflowView(at('@scope'), assignNumbers(d), 't1').toString(), /Flood<\/label> <span class="tag">Added<\/span>/);
  d = answerAll(answerAll(d, 'p1|h1'), 'p1|h2');
  d = setStep(d, act, { workflowId: 't1', hazardId: 'p1|h1', check: 'controls', answer: 'none', note: 'Nothing for us' });
  d = completeWorkflow(assignNumbers(d), { ...act, workflowId: 't1' }, { workflowId: 't1' });
  const out = workflowView(at(), d, 't1').toString();
  assert.match(out, /tag wf-completed/);
  assert.match(out, /Linked to[\s\S]*?Platform: Alpha[\s\S]*?Hazard: HAZ-002 Flood/);
  assert.match(out, /Nothing for us/);
  assert.match(out, /Changes made through WF-/);
});
```

Before writing the tests into the file, check these:
- How `idTag` renders (`src/ui/screens/common.js`). Adjust the HAZ-001 regexes to its real markup, for example `<span class="id">HAZ-001</span>`.
- The exact disabled fieldset markup used in `workflow.js`.
- That `assignNumbers` gives h1 `HAZ-001` and h2 `HAZ-002`. The other screen tests rely on this.
- Whether `wf.number` is set. If `assignNumbers` doesn't number workflows, `workflowLabel` shows `TBC`. In that case the last test's `/Changes made through WF-/` must be `/Changes made through (WF-|TBC)/`, so check `screens-reference-update.test.js`'s ended test for the form it uses.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/ui/screens-tech-data.test.js`
Expected: FAIL. The scope markup is missing, because the page falls through to the Platform Review layout.

- [ ] **Step 3: Write `src/ui/screens/tech-data.js`**

```js
import { html, raw } from '../html.js';
import { dataAttrs, go, idTag, plus } from './common.js';
import { controlsSection, safetyReportsSection, riskPanels, sfarpArea } from './ssra.js';
import { changesList } from './workflow.js';
import { get } from '../../core/data.js';
import { platformHazards, byNumber } from '../../core/queries.js';
import { hazardLabel, controlLabel, workflowLabel } from '../../core/ids.js';
import { TECH_CARDS, TECH_WORDS, TECH_QUESTIONS, techScope, techPairs, techPlatforms, techTouched, techLinks, workflowProgress, stepOf, pairKey } from '../../core/workflows.js';
import { profileName, when } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** The editor each card shows: the same one the platform page uses. */
const EDITOR = Object.freeze({
  controls: (/** @type {any} */ state, /** @type {Data} */ data, /** @type {any} */ x) => controlsSection(state, data, x.hazard, x.platform.id, x.platform.name),
  safetyReports: (/** @type {any} */ state, /** @type {Data} */ data, /** @type {any} */ x) => safetyReportsSection(state, data, x.hazard, x.platform.id),
  residual: (/** @type {any} */ state, /** @type {Data} */ data, /** @type {any} */ x) => riskPanels(state, data, x.hazard, x.platform.id, 'residual', 'both'),
  sfarp: (/** @type {any} */ _state, /** @type {Data} */ data, /** @type {any} */ x) => sfarpArea(data, x.hazard, x.platform.id),
});

const KIND_WORD = Object.freeze({ platform: 'Platform', hazard: 'Hazard', control: 'Control' });

/** A link Complete makes, as a person reads it. @param {Data} data @param {{ targetKind: string, targetId: string }} t */
function linkName(data, t) {
  const r = get(data, t.targetKind, t.targetId);
  const name = !r ? 'deleted' : t.targetKind === 'platform' ? r.name : t.targetKind === 'hazard' ? `${hazardLabel(r)} ${r.title}` : `${controlLabel(r)} ${r.title}`;
  return `${KIND_WORD[/** @type {keyof typeof KIND_WORD} */ (t.targetKind)] ?? t.targetKind}: ${name}`;
}

/** @param {Data} data @param {{ targetKind: string, targetId: string }[]} links */
const linkList = (data, links) => (links.length
  ? html`<ul class="plain wf-links">${links.map((t) => html`<li>${linkName(data, t)}</li>`)}</ul>`
  : html`<p class="muted">No new links.</p>`);

/** A row of the grid for a pair key: its platform and hazard as they are now, or as they were. @param {Data} data @param {string} key */
function rowLabel(data, key) {
  const [pid, hid] = key.split('|');
  const p = get(data, 'platform', pid);
  const h = get(data, 'hazard', hid);
  return `${p?.name ?? 'A deleted platform'} · ${h ? `${hazardLabel(h)} ${h.title}` : 'a deleted hazard'}`;
}

/** Each pair against each card: Changed, No change, or blank, with its note. @param {Data} data @param {any} wf @param {string[]} keys */
function grid(data, wf, keys) {
  if (!keys.length) return html`<p class="muted">Nothing in scope.</p>`;
  return html`<div class="wf-grid-wrap"><table class="wf-grid"><thead><tr><th scope="col">Platform · hazard</th>${TECH_CARDS.map((c) => html`<th scope="col">${TECH_WORDS[c]}</th>`)}</tr></thead>
    <tbody>${keys.map((k) => html`<tr><th scope="row">${rowLabel(data, k)}</th>${TECH_CARDS.map((c) => {
      const s = stepOf(data, wf.id, k, c);
      return html`<td class="${s?.answer === 'changed' ? 'yes' : 'no'}">${s?.answer === 'changed' ? 'Changed' : s?.answer === 'none' ? 'No change' : ''}${s?.note ? html`<div class="wf-note">${s.note}</div>` : ''}</td>`;
    })}</tr>`)}</tbody></table></div>`;
}

/** @param {any} wf @param {string} pos @param {any} body @param {boolean} done @param {string} current */
const railItem = (wf, pos, body, done, current) => html`<button type="button" class="wf-rail-item${current === pos ? ' on' : ''}${done ? ' done' : ''}" ${dataAttrs({ action: 'showWorkflowHazard', 'workflow-id': wf.id, 'hazard-id': pos })}>${body}</button>`;

/** The scope, each platform with its hazards and how many of their cards are answered, and the summary. @param {Data} data @param {any} wf @param {string} current */
function rail(data, wf, current) {
  const prog = workflowProgress(data, wf);
  const scope = techScope(data, wf);
  const scoped = scope.some((s) => s.hazards.length);
  const n = TECH_CARDS.length;
  return html`<nav class="wf-rail" aria-label="Scope and hazards"><div class="wf-rail-h">New tech data <span class="muted">${prog.done}/${prog.total}</span></div>
    ${railItem(wf, '@scope', html`<span class="wf-mark" aria-hidden="true">${scoped ? '✓' : ''}</span><span class="wf-name">Scope</span><span class="wf-count"></span>`, scoped, current)}
    ${scope.map((s) => html`<div class="wf-rail-group">${s.platform.name}</div>${s.hazards.map((x) => {
      const k = prog.perHazard.get(x.key) ?? 0;
      return railItem(wf, x.key, html`<span class="wf-mark" aria-hidden="true">${k === n ? '✓' : ''}</span><span class="wf-name">${idTag(x.reportId)} ${x.hazard.title}</span><span class="wf-count">${k}/${n}</span>`, k === n, current);
    })}`)}
    ${railItem(wf, '', html`<span class="wf-mark" aria-hidden="true"></span><span class="wf-name">Summary &amp; complete</span>`, false, current)}</nav>`;
}

/** Ticking the platforms the data affects, then their hazards; a ticked one can gain a hazard. @param {Data} data @param {any} wf @param {boolean} mine */
function scopeStep(data, wf, mine) {
  const step = (/** @type {string} */ key) => stepOf(data, wf.id, key, 'scope');
  // Ticked platforms first; a stable sort keeps the name order within each.
  const ps = techPlatforms(data).sort((a, b) => Number(Boolean(step(`p:${b.id}`)?.checked)) - Number(Boolean(step(`p:${a.id}`)?.checked)));
  const card = (/** @type {any} */ p) => {
    const on = Boolean(step(`p:${p.id}`)?.checked);
    const at = { change: 'setTechScope', 'workflow-id': wf.id, 'platform-id': p.id };
    const hazards = on ? platformHazards(data, p.id).filter((ph) => ph.hazard.status === 'live').sort((a, b) => byNumber(a.hazard, b.hazard)) : [];
    return html`<section class="wf-check wf-scope${on ? ' done' : ''}" aria-label="${p.name}">
      <label class="wf-scope-p"><input type="checkbox" name="checked"${on ? raw(' checked') : ''} ${dataAttrs(at)}> <strong>${p.name}</strong></label>
      ${on ? html`<ul class="plain wf-scope-h">${hazards.map((ph) => {
        const s = step(pairKey(p.id, ph.hazard.id));
        return html`<li><label><input type="checkbox" name="checked"${s?.checked ? raw(' checked') : ''} ${dataAttrs({ ...at, 'hazard-id': ph.hazard.id })}> ${idTag(ph.reportId)} ${ph.hazard.title}</label>${s?.added ? html` <span class="tag">Added</span>` : ''}</li>`;
      })}</ul>${hazards.length ? '' : html`<p class="muted">No hazards on ${p.name} yet.</p>`}
      ${mine ? html`<div class="wf-scope-add">${plus({ action: 'openPicker', picker: 'linkHazards', 'platform-id': p.id, 'workflow-id': wf.id }, 'Add hazard…')} <span class="muted">Add hazard…</span>
        <form class="inline" data-action="addTechHazard" ${dataAttrs({ 'workflow-id': wf.id, 'platform-id': p.id })}><input name="title" required placeholder="New hazard title" aria-label="New hazard title on ${p.name}"><button type="submit" class="small">Add</button></form></div>` : ''}` : ''}
    </section>`;
  };
  return html`<h2>Scope</h2><p class="muted">Tick the platforms this data affects, then the hazards on each.</p>
    <fieldset class="wf-fields"${mine ? '' : raw(' disabled')}>${ps.map(card)}</fieldset>${ps.length ? '' : html`<p class="muted">No live platforms.</p>`}`;
}

/** One card on a pair: its question, the editor, Changed or No change, and a note. @param {any} state @param {Data} data @param {any} wf @param {any} x @param {string} card @param {number} n @param {Map<string, Set<string>>} touched */
function techCard(state, data, wf, x, card, n, touched) {
  const s = stepOf(data, wf.id, x.key, card);
  const at = { change: 'setStep', 'workflow-id': wf.id, 'hazard-id': x.key, check: card };
  const radio = (/** @type {string} */ value, /** @type {string} */ label) => html`<label class="wf-tick"><input type="radio" name="answer" value="${value}"${s?.answer === value ? raw(' checked') : ''} ${dataAttrs(at)}> ${label}</label>`;
  const warn = s?.answer === 'changed' && !touched.get(x.key)?.has(card);
  return html`<section class="wf-check${s?.answer ? ' done' : ''}" aria-label="${TECH_WORDS[card]}">
    <h3 class="wf-check-h"><span class="wf-n">${n}</span> ${TECH_WORDS[card]} <span class="muted wf-q">${TECH_QUESTIONS[card]}</span></h3>
    <div class="wf-check-body">${EDITOR[/** @type {keyof typeof EDITOR} */ (card)](state, data, x)}</div>
    <div class="wf-check-foot">
      <input class="grow" name="note" value="${s?.note ?? ''}" placeholder="Note (optional)…" aria-label="Note on ${TECH_WORDS[card]}" ${dataAttrs(at)}>
      <form class="wf-answer" role="radiogroup" aria-label="${TECH_WORDS[card]}: changed?">${radio('changed', 'Changed')}${radio('none', 'No change')}</form>
    </div>${warn ? html`<p class="wf-warn">No changes recorded here yet.</p>` : ''}</section>`;
}

/** @param {any} wf @param {string} label @param {string} pos */
const navButton = (wf, label, pos) => html`<button type="button" ${dataAttrs({ action: 'showWorkflowHazard', 'workflow-id': wf.id, 'hazard-id': pos })}>${label}</button>`;

/** @param {any} state @param {Data} data @param {any} wf @param {any} x @param {boolean} mine */
function pairPage(state, data, wf, x, mine) {
  const pairs = techPairs(data, wf);
  const i = pairs.findIndex((y) => y.key === x.key);
  const n = workflowProgress(data, wf).perHazard.get(x.key) ?? 0;
  const { cards } = techTouched(data, wf);
  return html`<div class="wf-hazard-h"><h2>${idTag(x.reportId)} ${go(x.hazard.title, 'hazard', { id: x.hazard.id, tab: `p:${x.platform.id}` })} <span class="muted">on</span> ${go(x.platform.name, 'platform', { id: x.platform.id })}</h2><span class="muted">${n}/${TECH_CARDS.length} answered</span></div>
    <fieldset class="wf-fields"${mine ? '' : raw(' disabled')}>${TECH_CARDS.map((c, k) => techCard(state, data, wf, x, c, k + 1, cards))}</fieldset>
    <div class="actions wf-nav">${i > 0 ? navButton(wf, '← Previous hazard', pairs[i - 1].key) : navButton(wf, '← Scope', '@scope')}${i < pairs.length - 1 ? navButton(wf, 'Next hazard →', pairs[i + 1].key) : navButton(wf, 'Summary & complete →', '')}</div>`;
}

/** @param {Data} data @param {any} wf @param {boolean} mine */
function summary(data, wf, mine) {
  const { done, total } = workflowProgress(data, wf);
  const left = total - done;
  const ref = get(data, 'reference', wf.referenceId);
  return html`<h2>Summary</h2>${grid(data, wf, techPairs(data, wf).map((x) => x.key))}
    <h3>Completing links ${ref?.title ?? 'the reference'} to</h3>${linkList(data, techLinks(data, wf))}
    <fieldset class="wf-fields"${mine ? '' : raw(' disabled')}>
      <label class="outcome">Outcome<textarea name="outcome" rows="3" placeholder="What the data changed, and anything to follow up…" ${dataAttrs({ change: 'setWorkflowOutcome', 'workflow-id': wf.id })}>${wf.outcome}</textarea></label>
      <div class="actions"><button type="button" class="primary" ${dataAttrs({ action: 'completeWorkflow', 'workflow-id': wf.id })}${left ? raw(' disabled') : ''}>${left ? `Complete — ${left} still needed` : 'Complete'}</button></div>
    </fieldset>`;
}

/**
 * An open New Tech Data: the rail, and the scope, a pair's cards, or the summary. Where it opens:
 * what the rail last chose, else where its owner left it, else the summary.
 * @param {any} state @param {Data} data @param {any} wf @param {boolean} mine
 */
export function techBody(state, data, wf, mine) {
  const v = state.view?.hazardId;
  const want = v === 'summary' ? null : v !== undefined ? v : (wf.at?.hazardId ?? null);
  const x = want && want !== '@scope' ? techPairs(data, wf).find((y) => y.key === want) ?? null : null;
  const page = want === '@scope' || (want && !x) ? '@scope' : x ? x.key : '';
  const main = page === '@scope' ? scopeStep(data, wf, mine) : x ? pairPage(state, data, wf, x, mine) : summary(data, wf, mine);
  return html`<div class="wf-layout">${rail(data, wf, page)}<div class="wf-main">${main}</div></div>`;
}

/** A completed or cancelled New Tech Data: its answers, what it linked, and the changes made through it. @param {any} state @param {Data} data @param {any} wf */
export function techEnded(state, data, wf) {
  const done = wf.state === 'completed';
  const keys = Array.isArray(wf.covered) ? wf.covered : [];
  return html`<p class="doc-meta"><span class="tag wf-${wf.state}">${done ? 'Completed' : 'Cancelled'}</span> by ${profileName(state, wf.endedBy)}, ${when(wf.endedAt)}.${done ? '' : ' The reference was not linked to anything.'}</p>
    <article class="doc">${grid(data, wf, keys)}
      ${done ? html`<h3>Linked to</h3>${linkList(data, wf.linked ?? [])}` : ''}
      ${wf.outcome ? html`<h3>Outcome</h3><p class="outcome-text">${wf.outcome}</p>` : ''}
      <h2>Changes made through ${workflowLabel(wf)}</h2>${changesList(state, data, wf)}</article>`;
}
```

Check that `platformHazards` and `byNumber` are exported from `src/core/queries.js`; they are used by `core/workflows.js`. Also check that `sfarpArea`, `riskPanels`, `controlsSection` and `safetyReportsSection` are exported from `ssra.js` (lines 60, 116, 182 and 206).

- [ ] **Step 4: Route it in `src/ui/screens/workflow.js` and name its subject in `src/ui/screens/workflows.js`**

In `workflow.js`:
- Add `import { techBody, techEnded } from './tech-data.js';`.
- Add to `CANCEL_WORDS`:

```js
  newTechData: (/** @type {string} */ n) => `Cancel ${n}: it is kept in History as cancelled; changes made through it stay, and the reference is linked to nothing`,
```

- In `workflowView`, make the title link to the reference for both reference types. Replace `wf.type === 'referenceUpdate' ? (get(data, 'reference', …` with `(wf.type === 'referenceUpdate' || wf.type === 'newTechData') ? (get(data, 'reference', …`.
- Route the ended view: replace `wf.type === 'referenceUpdate' ? updateEnded(state, data, wf) : endedBody(state, data, wf)` with `wf.type === 'referenceUpdate' ? updateEnded(state, data, wf) : wf.type === 'newTechData' ? techEnded(state, data, wf) : endedBody(state, data, wf)`.
- After the `referenceUpdate` body line, add `if (wf.type === 'newTechData') return html`${head}${techBody(state, data, wf, mine)}`;`.

In `workflows.js`, make `workflowSubject` read:

```js
  if (wf.type === 'referenceUpdate' || wf.type === 'newTechData') return get(data, 'reference', wf.referenceId)?.title ?? 'A deleted reference';
```

- [ ] **Step 5: Run the tests, the suite and the typecheck**

Run: `node --test test/ui/screens-tech-data.test.js && npm test 2>&1 | grep -E "ℹ (pass|fail)" && npm run typecheck`
Expected: all pass and tsc is clean. If a regex misses on markup only (such as `idTag`'s wrapper), fix the regex to the real markup. Don't change behaviour to fit a regex.

- [ ] **Step 6: Build and commit**

```bash
npm run build
git add src/ui/screens/tech-data.js src/ui/screens/workflow.js src/ui/screens/workflows.js test/ui/screens-tech-data.test.js
git commit -m "New Tech Data page: the scope with a tick per platform and its hazards, a hazard added or made there; a page per pair with four cards, each answered Changed or No change and warning when nothing was changed through it; the summary with what Complete will link; once ended, the answers, the links and the changes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ways in (dashboard tile, reference page, picker, controller)

**Files:**
- Modify: `src/core/workflows.js`: `WORKFLOW_TYPES`'s newTechData `ready: true`.
- Modify: `src/ui/screens/workflows.js`: `techCard` and route it in `startCards`.
- Modify: `src/ui/screens/references.js:131`: the **Work through as new tech data…** button.
- Modify: `src/ui/screens/picker.js`: `linkHazards` carries `workflow-id` when given.
- Modify: `src/ui/controller.js`:
  - EDITS gains `startTechData`, `setTechScope`, `addTechHazard`
  - `openPicker` takes `workflowId`
  - `linkHazards` dispatches `addTechHazard` when given a workflow
  - new handlers `beginTechData` and `beginTechDataNew`
  - import `openTechData`.
- Modify these tests:
  - `test/core/workflows-queries.test.js:46`: newTechData is ready.
  - `test/ui/screens-workflows.test.js:39-44`: nothing is coming soon.
  - `test/ui/screens-transfer-reference-elsewhere.test.js:20`: drop the Coming soon assertion.
- Test: `test/ui/controller-tech-data.test.js` (new), and `test/ui/screens-tech-data-elsewhere.test.js` (new).

**Interfaces:**
- Consumes these from Tasks 1–3:
  - `openTechData`
  - the ops `startWorkflow`, `startTechData`, `setTechScope`, `addTechHazard`
  - `techBody`, through `workflowView`.
- Produces these controller actions:
  - `beginTechData({ referenceId })`
  - `beginTechDataNew({ title, docNumber, revision, url, path })`
  - `linkHazards({ platformId, hazardId, workflowId? })`.

The handler names are `begin…`, not `start…`, because `startTechData` is an EDIT. The dispatcher sends any type found in `EDITS` straight to the op.

- [ ] **Step 1: Write the failing tests**

Create `test/ui/screens-tech-data-elsewhere.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowsView } from '../../src/ui/screens/workflows.js';
import { referenceView } from '../../src/ui/screens/references.js';
import { pickerView } from '../../src/ui/screens/picker.js';
import { createReference, setReferenceArchived } from '../../src/core/ops/references.js';
import { state } from './screens-workflows.test.js';
import { seed, act } from '../helpers.js';

test('the dashboard starts New Tech Data on a reference, or on a new one', () => {
  const d = createReference(seed(), act, { id: 'r1', title: 'Service bulletin 12', url: 'x' });
  const out = workflowsView({ ...state, view: { name: 'workflows' } }, d).toString();
  assert.doesNotMatch(out, /Coming soon/);
  assert.match(out, /data-action="beginTechData"[\s\S]*?Select reference…[\s\S]*?Service bulletin 12/);
  assert.match(out, /<summary>New reference…<\/summary>[\s\S]*?data-action="beginTechDataNew"[\s\S]*?name="title"[\s\S]*?name="docNumber"[\s\S]*?name="revision"[\s\S]*?name="url"[\s\S]*?name="path"/);
});

test('the reference page offers Work through as new tech data… while it is live and not archived', () => {
  const d = createReference(seed(), act, { id: 'r1', title: 'Service bulletin 12', url: 'x' });
  const view = (x) => referenceView({ ...state, view: { name: 'reference', id: 'r1' } }, x, 'r1').toString();
  assert.match(view(d), /data-action="beginTechData"[^>]*>Work through as new tech data…/);
  assert.doesNotMatch(view(setReferenceArchived(d, act, { id: 'r1', archived: true })), /beginTechData/);
});

test('the link-hazards picker carries the workflow it was opened from', () => {
  const out = pickerView({ ...state, picker: { picker: 'linkHazards', platformId: 'p1', workflowId: 't1' } }, seed()).toString();
  assert.match(out, /data-action="linkHazards"[^>]*data-workflow-id="t1"|data-workflow-id="t1"[^>]*data-action="linkHazards"/);
});
```

Create `test/ui/controller-tech-data.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { entries } from '../../src/core/history.js';

const env = (f, storage = new MemoryStorage()) => ({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage, minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });
const W = (c) => c.getState().session.working;

async function ready() {
  const c = createController(env(new MemoryFolder()));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const ada = c.getState().profiles[0].id;
  await c.dispatch({ type: 'selectProfile', id: ada });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createHazard', id: 'h2', title: 'Flood' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: ada });
  await c.dispatch({ type: 'linkHazard', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'createReference', id: 'r1', title: 'Service bulletin 12', url: 'https://sb12' });
  return c;
}

test('Work through as new tech data starts one on the reference, or opens the one under way', async () => {
  const c = await ready();
  await c.dispatch({ type: 'beginTechData', referenceId: 'r1' });
  const id = c.getState().view.id;
  assert.deepEqual([c.getState().view.name, W(c).records.workflow[id].type], ['workflow', 'newTechData']);
  await c.dispatch({ type: 'go', view: 'references' });
  await c.dispatch({ type: 'beginTechData', referenceId: 'r1' });
  assert.equal(c.getState().view.id, id);
});

test('New reference… makes the reference and the workflow, and opens it', async () => {
  const c = await ready();
  await c.dispatch({ type: 'beginTechDataNew', title: 'Test report 7', docNumber: 'TR-7', revision: '1', url: 'https://tr7', path: '' });
  const wf = W(c).records.workflow[c.getState().view.id];
  assert.equal(W(c).records.reference[wf.referenceId].title, 'Test report 7');
});

test('the picker opened from the scope adds through the workflow; an edit on its page is made through it', async () => {
  const c = await ready();
  await c.dispatch({ type: 'beginTechData', referenceId: 'r1' });
  const id = c.getState().view.id;
  await c.dispatch({ type: 'setTechScope', workflowId: id, platformId: 'p1', checked: 'true' });
  await c.dispatch({ type: 'openPicker', picker: 'linkHazards', platformId: 'p1', workflowId: id });
  assert.equal(c.getState().picker.workflowId, id);
  await c.dispatch({ type: 'linkHazards', platformId: 'p1', workflowId: id, hazardId: 'h2' });
  const step = W(c).records.workflowStep[`ws:${id}:p1|h2:scope`];
  assert.deepEqual([step.checked, step.added, c.getState().picker], [true, true, null]);
  await c.dispatch({ type: 'setSfarp', hazardId: 'h2', platformId: 'p1', justification: 'Per TR-7' });
  assert.equal(entries(W(c)).at(-1).workflow, id);
});
```

Check `controller-transfer-reference.test.js` `ready()` for how a platform is created in the controller tests. If `createPlatform` dispatched with `id` isn't how they do it, copy theirs.

Make these updates to the existing tests:
- `test/core/workflows-queries.test.js:46`: `['newTechData', false]` becomes `['newTechData', true]`.
- `test/ui/screens-workflows.test.js:39-44`:
  - rename the test to `'start a workflow: Platform Review with a platform picker, overdue first; nothing still coming soon'`
  - replace the two Coming soon assertions with `assert.doesNotMatch(out, /Coming soon/);`.
- `test/ui/screens-transfer-reference-elsewhere.test.js:20`: delete the line `assert.match(out, /New Tech Data[\s\S]*?Coming soon/);`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/ui/screens-tech-data-elsewhere.test.js test/ui/controller-tech-data.test.js`
Expected: FAIL, because there is no `beginTechData` tile or handler.

- [ ] **Step 3: The tile, in `src/ui/screens/workflows.js`**

In `src/core/workflows.js`, set the `newTechData` entry of `WORKFLOW_TYPES` to `ready: true`.

In `workflows.js`, after `updateCard`, add:

```js
/** The card that works new tech data through: a live reference not archived, or a new one. @param {Data} data */
function techCard(data) {
  const rs = live(data, 'reference').filter((r) => !r.archived).sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  return html`<form class="wf-start" data-action="beginTechData"><div class="wf-fields-col"><select name="referenceId" aria-label="Reference holding the tech data" required>${NEUTRAL('Select reference…')}${rs.map((r) => option(r.id, `${referenceLabel(r)} ${r.title}${r.revision ? ` (rev ${r.revision})` : ''}`, ''))}</select></div>${GO}</form>
    <details class="wf-new-ref"><summary>New reference…</summary><form class="wf-start" data-action="beginTechDataNew"><div class="wf-fields-col">
      <input name="title" required placeholder="Title" aria-label="Title"><input name="docNumber" placeholder="Doc number" aria-label="Doc number"><input name="revision" placeholder="Revision" aria-label="Revision">
      <input name="url" placeholder="Link" aria-label="Link"><input name="path" placeholder="Path" aria-label="Path"></div>${GO}</form></details>`;
}
```

In `startCards`, extend the chain: `… : t.type === 'referenceUpdate' ? updateCard(data) : t.type === 'newTechData' ? techCard(data) : ''`.

- [ ] **Step 4: The reference page button, in `src/ui/screens/references.js:131`**

After the Update revision… button, inside the same `r.status === 'live' && !r.archived ?` branch, add:

```js
<button type="button" class="small" ${dataAttrs({ action: 'beginTechData', 'reference-id': id })}>Work through as new tech data…</button>
```

The branch becomes `html`<button …>Update revision…</button><button …>Work through as new tech data…</button>``.

- [ ] **Step 5: The picker, in `src/ui/screens/picker.js:19`**

Change the `linkHazards` form's attributes to:

```js
    return frame('Link hazards', html`<form data-action="linkHazards" ${dataAttrs({ 'platform-id': p.platformId, ...(p.workflowId ? { 'workflow-id': p.workflowId } : {}) })} class="picker-form">
```

- [ ] **Step 6: The controller, in `src/ui/controller.js`**

- Change the import at line 20 to `import { openTransfer, openReferenceUpdate, openTechData } from '../core/workflows.js';`.
- Add `startTechData: workflows.startTechData, setTechScope: workflows.setTechScope, addTechHazard: workflows.addTechHazard,` to `EDITS`, after `markTransferReviewed`.
- In `openPicker`, add `workflowId` to the destructured parameters and to `extra`:

```js
    async openPicker({ picker, hazardId, platformId, referenceId, targetKind, targetId, stage, receptor, field, controlId, part, existing, workflowId }) {
      const extra = { hazardId, platformId, referenceId, targetKind, targetId, stage, receptor, field, controlId, part, existing, workflowId };
```

- Replace `linkHazards`:

```js
    // From New Tech Data's scope, each hazard is added through the workflow, so it is scoped as added.
    async linkHazards(args) {
      for (const hazardId of list(args.hazardId)) {
        if (args.workflowId) await applyEdit('addTechHazard', { workflowId: args.workflowId, platformId: args.platformId, hazardId });
        else await applyEdit('linkHazard', { hazardId, platformId: args.platformId });
      }
      set({ picker: null });
    },
```

- After `startReferenceUpdate`, add:

```js
    // Work through as new tech data: the reference's one under way, or a new one.
    async beginTechData({ referenceId }) {
      const w = state.session ? openTechData(state.session.working, referenceId) : null;
      if (w) return handlers.go({ view: 'workflow', id: w.id });
      const id = newId();
      await applyEdit('startWorkflow', { id, type: 'newTechData', referenceId });
      await handlers.go({ view: 'workflow', id });
    },
    // New Tech Data on a new reference: the two made together, the workflow opened.
    async beginTechDataNew({ title, docNumber, revision, url, path }) {
      const id = newId();
      await applyEdit('startTechData', { id, referenceId: newId(), title, docNumber, revision, url, path });
      await handlers.go({ view: 'workflow', id });
    },
```

Check how `applyEdit` reports a refused edit, for example by reading `beginReview` and `startTransfer`. If a refused `startWorkflow` doesn't throw, `handlers.go` opens a workflow id that doesn't exist. Match whatever `startTransfer` does, since it has the same shape.

- [ ] **Step 7: Run the tests, the suite and the typecheck**

Run: `node --test test/ui/screens-tech-data-elsewhere.test.js test/ui/controller-tech-data.test.js && npm test 2>&1 | grep -E "ℹ (pass|fail)" && npm run typecheck`
Expected: all pass, with `ℹ fail 0`, and tsc clean.

- [ ] **Step 8: Build and commit**

```bash
npm run build
git add src/core/workflows.js src/ui/screens/workflows.js src/ui/screens/references.js src/ui/screens/picker.js src/ui/controller.js test/ui/screens-tech-data-elsewhere.test.js test/ui/controller-tech-data.test.js test/core/workflows-queries.test.js test/ui/screens-workflows.test.js test/ui/screens-transfer-reference-elsewhere.test.js
git commit -m "New Tech Data starts from the dashboard, on a reference or a new one, and from the reference page; the link-hazards picker opened from its scope adds through it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Styles and a browser walkthrough

**Files:**
- Modify: `src/ui/styles.css`, beside the other `.wf-*` rules (around line 1259).

- [ ] **Step 1: Add the styles**

```css
.wf-rail-group { font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.04em; color: var(--p-muted); padding: 8px 8px 2px; }
.wf-scope-p { display: flex; gap: 8px; align-items: center; }
.wf-scope-h { margin: 8px 0 0 24px; display: grid; gap: 4px; }
.wf-scope-add { display: flex; gap: 8px; align-items: center; margin: 8px 0 0 24px; flex-wrap: wrap; }
.wf-answer { display: flex; gap: 12px; margin: 0; }
.wf-warn { margin: 8px 0 0; color: var(--p-warn); }
.wf-links { margin: 4px 0 12px; }
.wf-new-ref { margin-top: 8px; }
.wf-new-ref > summary { cursor: pointer; color: var(--p-muted); }
```

Check that `--p-muted` exists in `:root`; if it doesn't, use the variable `.muted` uses. Don't add `border-radius`.

- [ ] **Step 2: Run the suite (including `corners.test.js`), the typecheck and the build**

Run: `npm test 2>&1 | grep -E "ℹ (pass|fail)" && npm run typecheck && npm run build`
Expected: `ℹ fail 0`, tsc clean, and `OK wrote …/dist/pivot.html`.

- [ ] **Step 3: Walk through it in the browser**

Serve `dist/` with `python3 -m http.server 8765`, seed an OPFS folder the way earlier parts did, and drive the page with the Playwright tools.

Walk through:
1. Workflows dashboard: the New Tech Data tile shows the reference picker and **New reference…**, with no Coming soon. Start one on a new reference.
2. **Scope:** tick a platform, then a hazard. Add a second hazard with **Add hazard…** (the picker) and a third by title. Both show **Added**.
3. **A pair page:** edit the SFARP and answer it Changed. The warning goes. Answer Controls Changed without editing, and the warning stays. Answer the rest, and check that each card's radios act alone.
4. **Summary:** the grid and the links match, and Complete is enabled once everything is answered. Complete it.
5. **Completed view:** Linked to, the outcome, and Changes made through WF-n. The reference page's supports list shows the new links.
6. **Reference page:** **Work through as new tech data…** starts or opens one.

Take a screenshot of each of the scope, pair page and summary. Fix any layout problem, then rerun Step 2.

Afterwards, stop the server (`pkill -f "m http.server 876[5]"`) and remove `dist/_seed.json` and `.playwright-mcp`.

- [ ] **Step 4: Commit**

```bash
git add src/ui/styles.css
git commit -m "New Tech Data styles: the scope's platforms and hazards, the rail's platform headings, the answers, the warning and the New reference toggle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
