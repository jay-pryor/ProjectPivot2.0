# Workflows, part 1 (framework + Platform Review) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Workflows tab whose first workflow, Platform Review, replaces the Reviews tab's inline checklist. The workflow is numbered (WF-n), owned, saved with the data and resumable. Every edit made through a workflow is traceable to its number.

**Architecture:**

- **Record kinds.** Two new kinds: `workflow`, which is numbered on save like hazards, and `workflowStep`, one record per hazard × check.
- **Completing a review.** The open workflow *is* the in-progress review. `completeWorkflow` writes the completed `review` record, which keeps the schedule code unchanged. The `reviewRow` kind and the old review ops go.
- **Tracing.** The controller stamps `act.workflowId` on edits made on a workflow page the current profile owns, and `recordChange` stores it on the history entry.

**Tech Stack:** Vanilla ES modules, JSDoc types (`npm run typecheck`), `node:test` (`npm test`), `npm run build`.

**Spec:** `docs/superpowers/specs/2026-10-08-workflows-platform-review-design.md`

## Global Constraints

- `SCHEMA_VERSION` goes from 4 to 5. There are no in-app conversions: a throwaway script in `scripts/` converts practice data.
- Workflow label: `WF-` followed by the number padded to 3 digits (as `HAZ-042`). It reads `TBC` until the workflow is first saved.
- The six checks, in this order, with these keys: `safetyReports`, `references`, `controls`, `residualRatings`, `residualJustifications`, `sfarp`.
- Complete is strict. It is refused while any check on any hazard currently on the platform is unticked, and while the platform has no review schedule.
- Only the owner may tick, note, move, complete or cancel. Anyone may Take over, which takes two clicks.
- Cancel takes two clicks (`confirmButton`). Its text says that ticks and notes are kept and that changes made to hazards stay.
- One open Platform Review per platform.
- The Workflows tab owner filter defaults to **Everyone**. The Recently completed range is 7, 30, 90 or 365 days, with a default of 30. Both are remembered per browser, folder and profile.
- The tab order is `… Platforms, Workflows, Reviews, …`.
- Run `npm run build` after every source change. This is a project rule.
- Commit with a message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage only the files the task touches: the working tree has unrelated uncommitted changes that must not be swept in.

## Review Focus

1. **A non-owner viewing someone's open workflow.** They can move between hazards in the rail, but nothing is written: no unsaved change, no position change. The check editors are disabled, and edits they make elsewhere are not stamped with the workflow. Covered in Task 6.
2. **A hazard unlinked from the platform mid-review after some of its checks were ticked.** Its ticks no longer count toward the total, and Complete is not blocked by it. Covered in Task 2.
3. **A platform retired or deleted while its review is open.** The workflow becomes *cancelled* (it is kept, not deleted). It leaves In progress and shows in History. Covered in Task 3.
4. **A workflow not yet saved (number TBC).** The dashboard, chip and confirm texts read sensibly ("this workflow", a TBC tag), never "Cancel TBC". Covered in Task 8.
5. **A platform with no hazards.** The workflow opens on Summary at 0/0, and Complete is allowed when a schedule exists. Covered in Task 2.

---

## File map

| File | Responsibility |
|---|---|
| `src/core/data.js` | KINDS (+`workflow`, `workflowStep`, −`reviewRow`), NUMBERED (+workflow), counter, `Act` typedef, SCHEMA_VERSION 5 |
| `src/core/ids.js` | `workflowLabel`, `ids.workflowStep`, `ids.workflowReview`; drop `ids.reviewRow` |
| `src/core/history.js` | stamp `workflow` on change entries; export `deletedEntries` |
| `src/core/workflows.js` (new) | workflow constants (types, checks, words) and queries |
| `src/core/ops/workflows.js` (new) | workflow ops |
| `src/core/ops/reviews.js` | drop old review ops; export `seenRec` |
| `src/core/ops/platforms.js` | retire/delete cancels the open workflow |
| `src/core/queries.js` | `openReview` → workflow; `completedReviews`, `hazardLastReviewed`; drop `reviewRows`; `platformsReached` |
| `src/core/rules.js` | review rules on workflows and their steps |
| `src/core/merge.js` | `keepEndedWorkflows` replaces `keepCompletedReviews`; new counter |
| `src/core/acks.js` | drop the three review-row actions from NOT_ACKNOWLEDGED |
| `scripts/convert-to-v5.mjs` (new) | throwaway conversion |
| `src/ui/workflows-prefs.js` (new) | the Workflows tab owner and range, per browser |
| `src/ui/controller.js` | EDITS, act stamping, handlers, prefs |
| `src/ui/render.js` | routes `workflows`, `workflow` |
| `src/ui/names.js` | KIND_LABEL |
| `src/ui/screens/common.js` | NAV, SECTION, PAGE_WORD, history chip |
| `src/ui/screens/ssra.js` | export `controlsSection`, new `sfarpArea`, `riskPanels` part option |
| `src/ui/screens/workflows.js` (new) | dashboard + History sub-tab, `progressBar` |
| `src/ui/screens/workflow.js` (new) | the workflow page, `checkGrid` |
| `src/ui/screens/reviews.js` | remove checklist; Start/Resume; past reviews with WF column |
| `src/ui/screens/home.js` | Workflows in progress panel; Continue review → workflow |
| `src/ui/screens/platforms.js` | drop REVIEW_DETAIL_ACTIONS filter |
| `src/ui/styles.css` | workflow styles |
| `test/helpers.js` | `beginPlatformReview`, `finishPlatformReview` |

---

### Task 1: Data foundation: kinds, numbering, labels, history stamping

**Files:**
- Modify: `src/core/data.js`, `src/core/ids.js`, `src/core/history.js`, `src/core/merge.js:88-96`, `src/ui/names.js:11`
- Test: `test/core/workflows-data.test.js` (new)

**Interfaces:**
- Produces:
  - `workflowLabel(rec) → string`
  - `ids.workflowStep(workflowId, hazardId, check) → 'ws:…'`
  - `ids.workflowReview(workflowId) → 'wr:…'`
  - `Act = { by, at, workflowId? }`
  - change entries gain `workflow?: string`
  - `deletedEntries(data) → Set<string>` exported from history.js
  - `data.nextWorkflowNumber`

`reviewRow` stays in KINDS until Task 3 removes it, so the old code keeps working until then.

- [ ] **Step 1: Write the failing test.**

```js
// test/core/workflows-data.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, KINDS, NUMBERED, normalizeData, created } from '../../src/core/data.js';
import { ids, workflowLabel } from '../../src/core/ids.js';
import { recordChange, entries } from '../../src/core/history.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { KIND_LABEL } from '../../src/ui/names.js';
import { act } from '../helpers.js';

test('workflows and their steps are record kinds; workflows are numbered WF-001 on save', () => {
  assert.ok(KINDS.includes('workflow') && KINDS.includes('workflowStep'));
  assert.ok(NUMBERED.some((n) => n.kind === 'workflow' && n.counter === 'nextWorkflowNumber'));
  assert.equal(emptyData().nextWorkflowNumber, 1);
  const old = emptyData();
  delete old.nextWorkflowNumber;
  assert.equal(normalizeData(old).nextWorkflowNumber, 1);
  let d = emptyData();
  d = { ...d, records: { ...d.records, workflow: { w1: created(act, 'w1', { number: null, type: 'platformReview' }) } } };
  assert.equal(workflowLabel(d.records.workflow.w1), 'TBC');
  d = assignNumbers(d);
  assert.equal(workflowLabel(d.records.workflow.w1), 'WF-001');
  assert.equal(d.nextWorkflowNumber, 2);
  assert.equal(ids.workflowStep('w1', 'h1', 'sfarp'), 'ws:w1:h1:sfarp');
  assert.equal(ids.workflowReview('w1'), 'wr:w1');
  assert.equal(KIND_LABEL.workflow, 'Workflow');
  assert.equal(KIND_LABEL.workflowStep, 'Workflow check');
});

test('a change made through a workflow carries the workflow; any other does not', () => {
  const rec = created(act, 'h9', { title: 'x' });
  let d = recordChange(emptyData(), { ...act, workflowId: 'w1' }, 'Edit hazard', [{ kind: 'hazard', before: null, after: rec }], []);
  d = recordChange(d, act, 'Edit hazard', [{ kind: 'hazard', before: rec, after: { ...rec, title: 'y' } }], []);
  const [a, b] = entries(d);
  assert.equal(a.workflow, 'w1');
  assert.ok(!('workflow' in b));
});
```

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/core/workflows-data.test.js`
Expected: FAIL (`workflowLabel` is not exported, and `workflow` is not in KINDS).

- [ ] **Step 3: Implement.**

`src/core/data.js`:

```js
export const SCHEMA_VERSION = 5;
// in KINDS, after 'review', 'reviewRow', 'reviewPolicy', 'reviewSeen',:
  'workflow', 'workflowStep',
// in NUMBERED, last entry:
  { kind: 'workflow', counter: 'nextWorkflowNumber' },
// Act typedef:
/** @typedef {{ by: string, at: string, workflowId?: string }} Act who is acting, and when (AEST), and the workflow it is done through, if any */
// Data typedef: add `nextWorkflowNumber: number,` after nextReferenceNumber
// emptyData(): add `nextWorkflowNumber: 1,` after nextReferenceNumber: 1,
```

`src/core/ids.js`:

```js
/** A workflow reads WF-001. @param {{ number?: number | null, [field: string]: any }} workflow */
export function workflowLabel(workflow) {
  return numberLabel('WF', workflow);
}
// in ids:
  /** @param {string} w a workflow id @param {string} h a hazard id @param {string} c a check */
  workflowStep: (w, h, c) => `ws:${w}:${h}:${c}`,
  /** The review a Platform Review workflow completes: one id, so two saves completing it write one record. @param {string} w */
  workflowReview: (w) => `wr:${w}`,
```

`src/core/history.js`: in `recordChange`, build the entry as:

```js
  return append(data, {
    id: newId(), type: 'change', at: act.at, by: act.by, action, items,
    platforms: [...new Set(platforms)].sort(),
    ...(act.workflowId ? { workflow: act.workflowId } : {}),
  });
```

Also change `function deletedEntries(data)` to `export function deletedEntries(data)`.

`src/core/merge.js`: in the `data` object literal add `nextWorkflowNumber: counters.nextWorkflowNumber,` after `nextReferenceNumber`.

`src/ui/names.js`: in KIND_LABEL add `workflow: 'Workflow', workflowStep: 'Workflow check',`.

Bumping SCHEMA_VERSION makes the envelope refuse any fixture stamped `schemaVersion: 4`. Fix it like this:

```bash
grep -rln "schemaVersion: 4\|schemaVersion\":4\|schemaVersion === 4" test src
```

In each test fixture found, write `SCHEMA_VERSION` (imported from `src/core/data.js`) in place of the literal 4.

- [ ] **Step 4: Run the tests.**

Run: `node --test test/core/workflows-data.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/core/data.js src/core/ids.js src/core/history.js src/core/merge.js src/ui/names.js test/core/workflows-data.test.js
git commit -m "Workflows: workflow and workflowStep kinds, numbered WF-001 on save; changes made through a workflow carry it; schema 5

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Also add any test fixtures changed for the schema bump.)

---

### Task 2: Workflow constants, queries and ops

**Files:**
- Create: `src/core/workflows.js`, `src/core/ops/workflows.js`
- Modify: `src/core/ops/reviews.js` (export `seenRec` only, in this task)
- Test: `test/core/ops/workflows.test.js`, `test/core/workflows-queries.test.js` (new). Modify `test/helpers.js`.

**Interfaces:**
- Consumes (from Task 1): `ids.workflowStep`, `ids.workflowReview`, `workflowLabel`, `deletedEntries`, `entries`
- Produces in `src/core/workflows.js`:
  - `CHECKS: readonly string[]`, `CHECK_WORDS: Record<check,string>`, `CHECK_QUESTIONS: Record<check,string>`
  - `WORKFLOW_TYPES: { type, name, blurb, ready }[]`, `typeName(type) → string`
  - `workflowHazards(data, wf) → { hazard, reportId }[]`
  - `stepOf(data, workflowId, hazardId, check) → Rec | null`
  - `workflowProgress(data, wf) → { perHazard: Map<string,number>, done: number, total: number }`
  - `lastActivity(data, wf) → string`
  - `openWorkflows(data, ownerId|null) → Rec[]`
  - `endedWorkflows(data, { since?: string|null, ownerId?: string|null }) → Rec[]`
  - `workflowChanges(data, workflowId) → entry[]`
- Produces in `src/core/ops/workflows.js`:
  - `startWorkflow(data, act, { id?, type, platformId })`
  - `setWorkflowPosition(data, act, { workflowId, hazardId })`
  - `setStep(data, act, { workflowId, hazardId, check, checked?, note? })`
  - `setWorkflowOutcome(data, act, { workflowId, outcome })`
  - `setWorkflowNotes(data, act, { workflowId, notes })`
  - `takeOverWorkflow(data, act, { workflowId })`
  - `cancelWorkflow(data, act, { workflowId })`
  - `cancelRecs(data, act, wf) → {kind, rec}[]`
  - `completeWorkflow(data, act, { workflowId })`
- Produces in `test/helpers.js`:
  - `beginPlatformReview(d, by, { id, platformId })`
  - `finishPlatformReview(d, by, { workflowId })`, which takes the workflow over if needed, ticks every check and completes it.

`openReview` in queries.js still reads `review` until Task 3. So in this task, `startWorkflow` checks for an open workflow itself through `openPlatformReview` (defined in `workflows.js`). Task 3 makes `openReview` delegate the same way.

- [ ] **Step 1: Write the failing ops test.**

```js
// test/core/ops/workflows.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { ids } from '../../../src/core/ids.js';
import { entries } from '../../../src/core/history.js';
import { linkHazard, unlinkHazard, createPlatform, retirePlatform } from '../../../src/core/ops/platforms.js';
import { startWorkflow, setWorkflowPosition, setStep, setWorkflowOutcome, setWorkflowNotes, takeOverWorkflow, cancelWorkflow, completeWorkflow } from '../../../src/core/ops/workflows.js';
import { CHECKS, workflowProgress, openPlatformReview } from '../../../src/core/workflows.js';
import { scheduleOf, seenOf } from '../../../src/core/schedule.js';
import { act, later, seed, scheduleFixed, finishPlatformReview } from '../../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
/** p1 Alpha (h1 on it), every 6 months, next due 2026-10-30. */
const scheduled = () => scheduleFixed(seed(), 'p1', 6, '2026-10-30');
const dueNow = (d, id = 'p1') => scheduleOf(d, id, '2026-09-28').due;
const started = () => startWorkflow(scheduled(), act, { id: 'w1', type: 'platformReview', platformId: 'p1' });
const tickAll = (d, by = act, workflowId = 'w1', hazards = ['h1']) => {
  for (const hazardId of hazards) for (const check of CHECKS) d = setStep(d, by, { workflowId, hazardId, check, checked: true });
  return d;
};

test('starting a Platform Review: open, owned by its starter, on the first hazard, one per live platform', () => {
  const d = started();
  const w = d.records.workflow.w1;
  assert.deepEqual(
    { number: w.number, type: w.type, platformId: w.platformId, ownerId: w.ownerId, state: w.state, at: w.at, outcome: w.outcome, notes: w.notes, endedBy: w.endedBy, endedAt: w.endedAt },
    { number: null, type: 'platformReview', platformId: 'p1', ownerId: 'u1', state: 'open', at: { hazardId: 'h1' }, outcome: '', notes: '', endedBy: null, endedAt: null },
  );
  assert.equal(openPlatformReview(d, 'p1')?.id, 'w1');
  assert.equal(entries(d).at(-1).action, 'Start workflow');
  assert.deepEqual(entries(d).at(-1).platforms, [], 'workflow bookkeeping reaches no platform: no acknowledgement, not in platform History');
  assert.throws(() => startWorkflow(d, later, { type: 'platformReview', platformId: 'p1' }), code('review.open'));
  assert.doesNotThrow(() => startWorkflow(d, later, { type: 'platformReview', platformId: 'p2' }));
  assert.throws(() => startWorkflow(retirePlatform(scheduled(), act, { id: 'p2' }), act, { type: 'platformReview', platformId: 'p2' }), code('platform.retired'));
  assert.throws(() => startWorkflow(scheduled(), act, { type: 'referenceUpdate', platformId: 'p1' }), code('workflow.type'));
});

test('a platform with no hazards opens on the summary at 0 of 0 and can be completed', () => {
  let d = createPlatform(seed(), act, { id: 'p9', name: 'Empty', ownerId: 'u1' });
  d = scheduleFixed(d, 'p9', 12, '2026-12-01');
  d = startWorkflow(d, act, { id: 'w9', type: 'platformReview', platformId: 'p9' });
  assert.deepEqual(d.records.workflow.w9.at, { hazardId: null });
  assert.deepEqual([workflowProgress(d, d.records.workflow.w9).done, workflowProgress(d, d.records.workflow.w9).total], [0, 0]);
  d = completeWorkflow(d, act, { workflowId: 'w9' });
  assert.equal(d.records.workflow.w9.state, 'completed');
  assert.equal(dueNow(d, 'p9'), '2027-12-01');
});

test('ticking and noting a check, which must be one of the six, on a hazard on the platform', () => {
  let d = setStep(started(), act, { workflowId: 'w1', hazardId: 'h1', check: 'controls', checked: 'true' });
  const id = ids.workflowStep('w1', 'h1', 'controls');
  assert.deepEqual([d.records.workflowStep[id].checked, d.records.workflowStep[id].note], [true, '']);
  d = setStep(d, act, { workflowId: 'w1', hazardId: 'h1', check: 'controls', note: '  Added C-004  ' });
  assert.deepEqual([d.records.workflowStep[id].checked, d.records.workflowStep[id].note], [true, 'Added C-004'], 'a note keeps the tick');
  d = setStep(d, act, { workflowId: 'w1', hazardId: 'h1', check: 'controls', checked: 'false' });
  assert.equal(d.records.workflowStep[id].checked, false);
  assert.throws(() => setStep(d, act, { workflowId: 'w1', hazardId: 'h1', check: 'bogus', checked: true }), code('workflow.check'));
  assert.throws(() => setStep(d, act, { workflowId: 'w1', hazardId: 'h2', check: 'sfarp', checked: true }), code('workflow.hazard'));
  assert.equal(workflowProgress(d, d.records.workflow.w1).perHazard.get('h1'), 0);
});

test('only the owner acts on it; anyone can take it over, which is recorded', () => {
  const d = started();
  assert.throws(() => setStep(d, later, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true }), code('workflow.owner'));
  assert.throws(() => setWorkflowPosition(d, later, { workflowId: 'w1', hazardId: null }), code('workflow.owner'));
  assert.throws(() => setWorkflowOutcome(d, later, { workflowId: 'w1', outcome: 'x' }), code('workflow.owner'));
  assert.throws(() => cancelWorkflow(d, later, { workflowId: 'w1' }), code('workflow.owner'));
  assert.throws(() => completeWorkflow(d, later, { workflowId: 'w1' }), code('workflow.owner'));
  const taken = takeOverWorkflow(d, later, { workflowId: 'w1' });
  assert.equal(taken.records.workflow.w1.ownerId, 'u2');
  assert.equal(entries(taken).at(-1).action, 'Take over workflow');
  assert.equal(takeOverWorkflow(taken, later, { workflowId: 'w1' }), taken, 'taking over your own changes nothing');
  assert.doesNotThrow(() => setStep(taken, later, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true }));
});

test('position, outcome and notes are kept for resuming', () => {
  let d = setWorkflowPosition(started(), act, { workflowId: 'w1', hazardId: null });
  assert.deepEqual(d.records.workflow.w1.at, { hazardId: null });
  d = setWorkflowPosition(d, act, { workflowId: 'w1', hazardId: 'h1' });
  assert.deepEqual(d.records.workflow.w1.at, { hazardId: 'h1' });
  assert.throws(() => setWorkflowPosition(d, act, { workflowId: 'w1', hazardId: 'h2' }), code('workflow.hazard'));
  d = setWorkflowNotes(setWorkflowOutcome(d, act, { workflowId: 'w1', outcome: ' All current ' }), act, { workflowId: 'w1', notes: ' Crew briefed ' });
  assert.deepEqual([d.records.workflow.w1.outcome, d.records.workflow.w1.notes], ['All current', 'Crew briefed']);
});

test('complete is strict: refused while any check is unticked, then writes the review and moves the schedule on', () => {
  let d = setWorkflowOutcome(started(), act, { workflowId: 'w1', outcome: 'All current' });
  d = setStep(d, act, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true });
  assert.throws(() => completeWorkflow(d, act, { workflowId: 'w1' }), (e) => e instanceof PivotError && e.code === 'workflow.unchecked' && /5 checks/.test(e.message));
  d = completeWorkflow(tickAll(d), act, { workflowId: 'w1' });
  const r = d.records.review[ids.workflowReview('w1')];
  assert.deepEqual(
    { state: r.state, workflowId: r.workflowId, platformId: r.platformId, outcome: r.outcome, dueBefore: r.dueBefore, dueAfter: r.dueAfter, completedBy: r.completedBy },
    { state: 'completed', workflowId: 'w1', platformId: 'p1', outcome: 'All current', dueBefore: '2026-10-30', dueAfter: '2027-04-30', completedBy: 'u1' },
  );
  assert.deepEqual([d.records.workflow.w1.state, d.records.workflow.w1.endedBy], ['completed', 'u1']);
  assert.equal(dueNow(d), '2027-04-30');
  assert.equal(d.records.platform.p1.reviewStart, '2026-10-30');
  assert.equal(seenOf(d, 'p1'), '2027-04-30');
  assert.equal(entries(d).at(-1).action, 'Complete review');
  assert.equal(openPlatformReview(d, 'p1'), null);
  assert.throws(() => setStep(d, act, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: false }), code('workflow.ended'));
  assert.throws(() => completeWorkflow(d, act, { workflowId: 'w1' }), code('workflow.ended'));
});

test('completing needs a schedule', () => {
  const d = tickAll(startWorkflow(seed(), act, { id: 'w1', type: 'platformReview', platformId: 'p1' }));
  assert.throws(() => completeWorkflow(d, act, { workflowId: 'w1' }), code('review.no-schedule'));
});

test('a hazard linked mid-review must be checked too; one unlinked mid-review no longer counts or blocks', () => {
  let d = tickAll(started());
  d = linkHazard(d, act, { hazardId: 'h2', platformId: 'p1' });
  assert.deepEqual([workflowProgress(d, d.records.workflow.w1).done, workflowProgress(d, d.records.workflow.w1).total], [6, 12]);
  assert.throws(() => completeWorkflow(d, act, { workflowId: 'w1' }), code('workflow.unchecked'));
  d = tickAll(d, act, 'w1', ['h2']);
  d = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual([workflowProgress(d, d.records.workflow.w1).done, workflowProgress(d, d.records.workflow.w1).total], [6, 6]);
  assert.doesNotThrow(() => completeWorkflow(d, act, { workflowId: 'w1' }));
});

test('cancelling keeps the workflow and its ticks as cancelled; another review can then start', () => {
  let d = setStep(started(), act, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true, note: 'ok' });
  d = cancelWorkflow(d, act, { workflowId: 'w1' });
  assert.deepEqual([d.records.workflow.w1.status, d.records.workflow.w1.state, d.records.workflow.w1.endedBy], ['live', 'cancelled', 'u1']);
  assert.equal(d.records.workflowStep[ids.workflowStep('w1', 'h1', 'sfarp')].note, 'ok');
  assert.equal(entries(d).at(-1).action, 'Cancel workflow');
  assert.equal(openPlatformReview(d, 'p1'), null);
  assert.doesNotThrow(() => startWorkflow(d, later, { type: 'platformReview', platformId: 'p1' }));
});

test('the schedule rules carried over: early, very late, month-end', () => {
  let d = scheduleFixed(seed(), 'p1', 1, '2027-01-31');
  d = finishPlatformReview(startWorkflow(d, act, { id: 'a', type: 'platformReview', platformId: 'p1' }), act, { workflowId: 'a' });
  assert.equal(dueNow(d), '2027-02-28', 'completed early, still one period on from the due date');
  d = finishPlatformReview(startWorkflow(d, act, { id: 'b', type: 'platformReview', platformId: 'p1' }), act, { workflowId: 'b' });
  assert.equal(dueNow(d), '2027-03-28');
  let e = scheduleFixed(seed(), 'p1', 6, '2025-01-31');
  e = finishPlatformReview(startWorkflow(e, act, { id: 'c', type: 'platformReview', platformId: 'p1' }), act, { workflowId: 'c' });
  assert.equal(dueNow(e), '2027-01-31', 'more than a period late: whole periods until after the completion');
});
```

- [ ] **Step 2: Write the failing queries test.**

```js
// test/core/workflows-queries.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startWorkflow, setStep, cancelWorkflow } from '../../src/core/ops/workflows.js';
import { updateHazard } from '../../src/core/ops/hazards.js';
import { openWorkflows, endedWorkflows, workflowChanges, workflowHazards, lastActivity, WORKFLOW_TYPES, CHECKS } from '../../src/core/workflows.js';
import { act, later, seed, scheduleFixed, finishPlatformReview } from '../helpers.js';

const at = (iso) => ({ by: 'u1', at: iso });

test('open workflows, newest activity first, filtered by owner', () => {
  let d = startWorkflow(seed(), act, { id: 'w1', type: 'platformReview', platformId: 'p1' });
  d = startWorkflow(d, later, { id: 'w2', type: 'platformReview', platformId: 'p2' });
  assert.deepEqual(openWorkflows(d, null).map((w) => w.id), ['w2', 'w1']);
  assert.deepEqual(openWorkflows(d, 'u1').map((w) => w.id), ['w1']);
  d = setStep(d, at('2026-09-28T12:00:00+10:00'), { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true });
  assert.equal(lastActivity(d, d.records.workflow.w1), '2026-09-28T12:00:00+10:00');
  assert.deepEqual(openWorkflows(d, null).map((w) => w.id), ['w1', 'w2'], 'a tick is activity');
});

test('ended workflows: completed and cancelled, newest first, since a date and by owner', () => {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  d = startWorkflow(d, act, { id: 'w1', type: 'platformReview', platformId: 'p1' });
  d = finishPlatformReview(d, at('2026-09-01T10:00:00+10:00'), { workflowId: 'w1' });
  d = startWorkflow(d, later, { id: 'w2', type: 'platformReview', platformId: 'p2' });
  d = cancelWorkflow(d, { by: 'u2', at: '2026-09-20T10:00:00+10:00' }, { workflowId: 'w2' });
  assert.deepEqual(endedWorkflows(d, {}).map((w) => w.id), ['w2', 'w1']);
  assert.deepEqual(endedWorkflows(d, { since: '2026-09-10' }).map((w) => w.id), ['w2']);
  assert.deepEqual(endedWorkflows(d, { ownerId: 'u1' }).map((w) => w.id), ['w1']);
});

test('the changes made through a workflow leave out its own bookkeeping', () => {
  let d = startWorkflow(seed(), act, { id: 'w1', type: 'platformReview', platformId: 'p1' });
  d = setStep(d, { ...act, workflowId: 'w1' }, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true });
  d = updateHazard(d, { ...act, workflowId: 'w1' }, { id: 'h1', title: 'Fire on board' });
  d = updateHazard(d, act, { id: 'h1', title: 'Fire' });
  assert.deepEqual(workflowChanges(d, 'w1').map((e) => e.action), ['Edit hazard']);
});

test('a finished workflow lists the hazards it checked, even after they leave the platform', () => {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  d = finishPlatformReview(startWorkflow(d, act, { id: 'w1', type: 'platformReview', platformId: 'p1' }), act, { workflowId: 'w1' });
  assert.deepEqual(workflowHazards(d, d.records.workflow.w1).map((x) => x.hazard.id), ['h1']);
  assert.equal(CHECKS.length, 6);
  assert.deepEqual(WORKFLOW_TYPES.map((t) => [t.type, t.ready]), [['platformReview', true], ['platformOnboarding', false], ['newTechData', false], ['transferOwner', false], ['referenceUpdate', false]]);
});
```

Check the `updateHazard` arguments against `src/core/ops/hazards.js` before running. If its action name is not `'Edit hazard'`, use the action it records.

- [ ] **Step 3: Run both tests and check they fail.**

Run: `node --test test/core/ops/workflows.test.js test/core/workflows-queries.test.js`
Expected: FAIL (cannot find module `src/core/ops/workflows.js`).

- [ ] **Step 4: Write `src/core/workflows.js`.**

```js
import { get, live } from './data.js';
import { hazardLabel } from './ids.js';
import { platformHazards, byNumber } from './queries.js';
import { entries, deletedEntries } from './history.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Rec} Rec */

/** The workflows, in the order the dashboard offers them; only those ready can be started. */
export const WORKFLOW_TYPES = Object.freeze([
  { type: 'platformReview', name: 'Platform Review', blurb: 'Walk each hazard on a platform through six checks, then complete its review.', ready: true },
  { type: 'platformOnboarding', name: 'Platform Onboarding', blurb: 'Set up a new platform: its groups, hazards, facets and controls.', ready: false },
  { type: 'newTechData', name: 'New Tech Data', blurb: 'Work new technical data through the platforms, controls and ratings it affects.', ready: false },
  { type: 'transferOwner', name: 'Transfer Platform Owner', blurb: 'Hand a platform and everything open on it to a new owner.', ready: false },
  { type: 'referenceUpdate', name: 'Reference Update', blurb: 'Take a reference to a new revision and check everything that cites it.', ready: false },
]);

/** @param {string} type */
export const typeName = (type) => WORKFLOW_TYPES.find((t) => t.type === type)?.name ?? type;

/** A Platform Review's six checks on each hazard, in order. */
export const CHECKS = Object.freeze(['safetyReports', 'references', 'controls', 'residualRatings', 'residualJustifications', 'sfarp']);

/** @type {Readonly<Record<string, string>>} */
export const CHECK_WORDS = Object.freeze({
  safetyReports: 'Safety reports', references: 'References', controls: 'Controls',
  residualRatings: 'Residual risk ratings', residualJustifications: 'Residual risk justifications', sfarp: 'SFARP',
});

/** @type {Readonly<Record<string, string>>} */
export const CHECK_QUESTIONS = Object.freeze({
  safetyReports: 'Any safety reports that fit but are not included?',
  references: 'Any references changed or updated and not represented?',
  controls: 'Any controls implemented that are not included?',
  residualRatings: 'Any changes to the residual ratings because of the above?',
  residualJustifications: 'Do the residual justifications still make sense?',
  sfarp: 'Does the SFARP still make sense?',
});

/** The open Platform Review on a platform, if any. @param {Data} data @param {string} platformId @returns {Rec | null} */
export function openPlatformReview(data, platformId) {
  return live(data, 'workflow').find((w) => w.type === 'platformReview' && w.platformId === platformId && w.state === 'open') ?? null;
}

/**
 * The hazards a workflow covers. Open: those on its platform now, in number order. Ended: those it
 * has checks for, as it left them.
 * @param {Data} data @param {{ platformId: string, state?: string, id?: string }} wf
 * @returns {{ hazard: Rec, reportId: string }[]}
 */
export function workflowHazards(data, wf) {
  const onNow = platformHazards(data, wf.platformId);
  if (!wf.state || wf.state === 'open') return onNow.map((ph) => ({ hazard: ph.hazard, reportId: ph.reportId })).sort((a, b) => byNumber(a.hazard, b.hazard));
  const ids = new Set(live(data, 'workflowStep').filter((s) => s.workflowId === wf.id).map((s) => s.hazardId));
  const reportIds = new Map(onNow.map((ph) => [ph.hazard.id, ph.reportId]));
  return [...ids].map((id) => get(data, 'hazard', id)).filter((h) => h && h.status !== 'deleted')
    .map((h) => ({ hazard: /** @type {Rec} */ (h), reportId: reportIds.get(/** @type {Rec} */ (h).id) ?? hazardLabel(/** @type {Rec} */ (h)) }))
    .sort((a, b) => byNumber(a.hazard, b.hazard));
}

/** @param {Data} data @param {string} workflowId @param {string} hazardId @param {string} check @returns {Rec | null} */
export function stepOf(data, workflowId, hazardId, check) {
  const s = get(data, 'workflowStep', `ws:${workflowId}:${hazardId}:${check}`);
  return s && s.status === 'live' ? s : null;
}

/** How many checks are ticked on each hazard the workflow covers, and in all. @param {Data} data @param {Rec} wf */
export function workflowProgress(data, wf) {
  /** @type {Map<string, number>} */
  const perHazard = new Map();
  for (const { hazard } of workflowHazards(data, wf)) perHazard.set(hazard.id, CHECKS.filter((c) => stepOf(data, wf.id, hazard.id, c)?.checked).length);
  const done = [...perHazard.values()].reduce((a, b) => a + b, 0);
  return { perHazard, done, total: perHazard.size * CHECKS.length };
}

/** When anything last happened to a workflow or its checks. @param {Data} data @param {Rec} wf */
export function lastActivity(data, wf) {
  return live(data, 'workflowStep').filter((s) => s.workflowId === wf.id).reduce((m, s) => (s.updatedAt > m ? s.updatedAt : m), wf.updatedAt);
}

/** Open workflows of one owner (everyone's for null), most recently active first. @param {Data} data @param {string | null} ownerId */
export function openWorkflows(data, ownerId) {
  return live(data, 'workflow').filter((w) => w.state === 'open' && (ownerId == null || w.ownerId === ownerId))
    .map((w) => ({ w, t: lastActivity(data, w) })).sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0)).map(({ w }) => w);
}

/**
 * Completed and cancelled workflows, most recently ended first; `since` a date (YYYY-MM-DD) keeps
 * those ended on or after it; `ownerId` those owned by that profile.
 * @param {Data} data @param {{ since?: string | null, ownerId?: string | null }} opts
 */
export function endedWorkflows(data, { since = null, ownerId = null }) {
  return live(data, 'workflow').filter((w) => w.state !== 'open' && (ownerId == null || w.ownerId === ownerId) && (!since || String(w.endedAt).slice(0, 10) >= since))
    .sort((a, b) => (a.endedAt < b.endedAt ? 1 : a.endedAt > b.endedAt ? -1 : 0));
}

/** The changes made through a workflow, oldest first, leaving out its own ticks and moves. @param {Data} data @param {string} workflowId */
export function workflowChanges(data, workflowId) {
  const gone = deletedEntries(data);
  return entries(data).filter((e) => e.type === 'change' && e.workflow === workflowId && !gone.has(e.id)
    && e.items.some((/** @type {any} */ i) => i.kind !== 'workflow' && i.kind !== 'workflowStep'));
}
```

`endedAt` is an AEST ISO string (for example `2026-09-20T10:00:00+10:00`), so its first 10 characters are the AEST date.

Check that `byNumber` is exported from `queries.js` (`grep -n "export function byNumber" src/core/queries.js`). Also check that `platformHazards` rows carry `hazard` and `reportId`.

- [ ] **Step 5: Write `src/core/ops/workflows.js`, and export `seenRec` from `src/core/ops/reviews.js`.**

In `src/core/ops/reviews.js`, change `function seenRec(` to `export function seenRec(`.

```js
// src/core/ops/workflows.js
import { PivotError } from '../errors.js';
import { newId, ids, workflowLabel, UNNUMBERED } from '../ids.js';
import { get, created, changed, need, put } from '../data.js';
import { commit } from '../apply.js';
import { dueOf } from '../schedule.js';
import { seenRec } from './reviews.js';
import { CHECKS, workflowHazards, workflowProgress, openPlatformReview } from '../workflows.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */
/** @typedef {import('../data.js').Rec} Rec */

/** @param {Rec} wf */
const named = (wf) => (workflowLabel(wf) === UNNUMBERED ? 'This workflow' : workflowLabel(wf));

/**
 * A workflow that is still open and, unless `owner` is false, owned by whoever is acting.
 * @param {Data} data @param {Act} act @param {string} workflowId @param {boolean} [owner]
 */
function needOpen(data, act, workflowId, owner = true) {
  const wf = need(data, 'workflow', workflowId);
  if (wf.state !== 'open') throw new PivotError('workflow.ended', `${named(wf)} is ${wf.state} and can no longer be changed.`);
  if (owner && wf.ownerId !== act.by) throw new PivotError('workflow.owner', `${named(wf)} belongs to someone else. Take it over to work on it.`);
  return wf;
}

/** @param {Data} data @param {Rec} wf @param {unknown} hazardId */
function needHazard(data, wf, hazardId) {
  if (!workflowHazards(data, wf).some((x) => x.hazard.id === hazardId)) throw new PivotError('workflow.hazard', 'That hazard is not on this platform.');
  return /** @type {string} */ (hazardId);
}

/**
 * Start a workflow, owned by whoever starts it. A Platform Review needs a live platform with no
 * review open, and opens on its first hazard (on the summary when it has none).
 * @param {Data} data @param {Act} act @param {{ id?: string, type: string, platformId: string }} args
 */
export function startWorkflow(data, act, { id = newId(), type, platformId }) {
  if (type !== 'platformReview') throw new PivotError('workflow.type', 'That workflow is not available yet.');
  const p = need(data, 'platform', platformId);
  if (p.status !== 'live') throw new PivotError('platform.retired', `${p.name} is retired, so it cannot be reviewed.`);
  if (openPlatformReview(data, platformId)) throw new PivotError('review.open', `${p.name} already has a review in progress.`);
  const first = workflowHazards(data, { platformId })[0]?.hazard.id ?? null;
  const rec = created(act, id, { number: null, type, platformId, ownerId: act.by, state: 'open', at: { hazardId: first }, outcome: '', notes: '', endedBy: null, endedAt: null });
  return commit(data, act, 'Start workflow', [{ kind: 'workflow', rec }]);
}

/** Where the owner is in it, kept for resuming: a hazard, or null for the summary. @param {Data} data @param {Act} act @param {{ workflowId: string, hazardId: string | null }} args */
export function setWorkflowPosition(data, act, { workflowId, hazardId }) {
  const wf = needOpen(data, act, workflowId);
  const to = hazardId ? needHazard(data, wf, hazardId) : null;
  return commit(data, act, 'Move in workflow', [{ kind: 'workflow', rec: changed(wf, act, { at: { hazardId: to } }) }]);
}

/**
 * Tick or untick one check on a hazard, or change its note; either may be left out. A tick may
 * arrive as the text a checkbox sends.
 * @param {Data} data @param {Act} act
 * @param {{ workflowId: string, hazardId: string, check: string, checked?: boolean | string, note?: string }} args
 */
export function setStep(data, act, { workflowId, hazardId, check, checked, note }) {
  const wf = needOpen(data, act, workflowId);
  if (!CHECKS.includes(check)) throw new PivotError('workflow.check', 'That is not one of the review checks.');
  needHazard(data, wf, hazardId);
  const id = ids.workflowStep(workflowId, hazardId, check);
  const fields = {
    ...(checked === undefined ? {} : { checked: checked === true || checked === 'true' }),
    ...(note === undefined ? {} : { note: String(note).trim() }),
  };
  const existing = get(data, 'workflowStep', id);
  const rec = existing && existing.status === 'live'
    ? changed(existing, act, fields)
    : created(act, id, { workflowId, hazardId, check, checked: false, note: '', ...fields });
  return commit(data, act, 'Check workflow step', [{ kind: 'workflowStep', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ workflowId: string, outcome: string }} args */
export function setWorkflowOutcome(data, act, { workflowId, outcome }) {
  const wf = needOpen(data, act, workflowId);
  return commit(data, act, 'Set workflow outcome', [{ kind: 'workflow', rec: changed(wf, act, { outcome: String(outcome ?? '').trim() }) }]);
}

/** @param {Data} data @param {Act} act @param {{ workflowId: string, notes: string }} args */
export function setWorkflowNotes(data, act, { workflowId, notes }) {
  const wf = needOpen(data, act, workflowId);
  return commit(data, act, 'Set workflow notes', [{ kind: 'workflow', rec: changed(wf, act, { notes: String(notes ?? '').trim() }) }]);
}

/** Make whoever is acting its owner. Anyone may, while it is open. @param {Data} data @param {Act} act @param {{ workflowId: string }} args */
export function takeOverWorkflow(data, act, { workflowId }) {
  const wf = needOpen(data, act, workflowId, false);
  if (wf.ownerId === act.by) return data;
  return commit(data, act, 'Take over workflow', [{ kind: 'workflow', rec: changed(wf, act, { ownerId: act.by }) }]);
}

/** The records that cancel an open workflow: it, marked cancelled. Its checks are kept. @param {Data} _data @param {Act} act @param {Rec} wf */
export function cancelRecs(_data, act, wf) {
  return [{ kind: 'workflow', rec: changed(wf, act, { state: 'cancelled', endedBy: act.by, endedAt: act.at }) }];
}

/** @param {Data} data @param {Act} act @param {{ workflowId: string }} args */
export function cancelWorkflow(data, act, { workflowId }) {
  return commit(data, act, 'Cancel workflow', cancelRecs(data, act, needOpen(data, act, workflowId)));
}

/**
 * Complete a Platform Review, once every check on every hazard now on the platform is ticked. It
 * writes the completed review (one id per workflow, so two saves completing it write one record)
 * the way reviews always have: the schedule counts on from the date the review answered, stepping
 * in whole periods past today, and the new date is marked seen.
 * @param {Data} data @param {Act} act @param {{ workflowId: string }} args
 */
export function completeWorkflow(data, act, { workflowId }) {
  const wf = needOpen(data, act, workflowId);
  const p = need(data, 'platform', wf.platformId);
  const { done, total } = workflowProgress(data, wf);
  const left = total - done;
  if (left) throw new PivotError('workflow.unchecked', `${left} check${left === 1 ? ' is' : 's are'} not ticked yet.`);
  const dueBefore = dueOf(data, p.id);
  if (!dueBefore) throw new PivotError('review.no-schedule', `Set a review schedule for ${p.name} first.`);
  const review = created(act, ids.workflowReview(wf.id), {
    platformId: p.id, workflowId: wf.id, state: 'completed', outcome: wf.outcome, notes: wf.notes,
    dueBefore, dueAfter: null, completedBy: act.by, completedAt: act.at,
  });
  const counted = changed(p, act, { reviewStart: dueBefore });
  const dueAfter = /** @type {string} */ (dueOf(put(put(data, 'review', review), 'platform', counted), p.id));
  return commit(data, act, 'Complete review', [
    { kind: 'review', rec: { ...review, dueAfter } },
    { kind: 'platform', rec: counted },
    seenRec(data, act, p.id, dueAfter),
    { kind: 'workflow', rec: changed(wf, act, { state: 'completed', endedBy: act.by, endedAt: act.at }) },
  ]);
}
```

- [ ] **Step 6: Add the test helpers to `test/helpers.js`.**

```js
import { startWorkflow, setStep, completeWorkflow, takeOverWorkflow } from '../src/core/ops/workflows.js';
import { CHECKS, workflowHazards } from '../src/core/workflows.js';

/** Start a Platform Review on a platform. @param {import('../src/core/data.js').Data} d @param {{ by: string, at: string }} by @param {{ id: string, platformId: string }} args */
export function beginPlatformReview(d, by, { id, platformId }) {
  return startWorkflow(d, by, { id, type: 'platformReview', platformId });
}

/** Take the review over if need be, tick every check on every hazard, and complete it. @param {import('../src/core/data.js').Data} d @param {{ by: string, at: string }} by @param {{ workflowId: string }} args */
export function finishPlatformReview(d, by, { workflowId }) {
  if (d.records.workflow[workflowId].ownerId !== by.by) d = takeOverWorkflow(d, by, { workflowId });
  for (const { hazard } of workflowHazards(d, d.records.workflow[workflowId])) {
    for (const check of CHECKS) d = setStep(d, by, { workflowId, hazardId: hazard.id, check, checked: true });
  }
  return completeWorkflow(d, by, { workflowId });
}
```

- [ ] **Step 7: Run the tests.**

Run: `node --test test/core/ops/workflows.test.js test/core/workflows-queries.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS. The old review code still exists and is untouched.

- [ ] **Step 8: Commit.**

```bash
git add src/core/workflows.js src/core/ops/workflows.js src/core/ops/reviews.js test/helpers.js test/core/ops/workflows.test.js test/core/workflows-queries.test.js
git commit -m "Workflows: Platform Review ops (start, check, move, outcome, take over, cancel, strict complete writing the review) and queries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Reviews run on workflows (remove `reviewRow` and the old review ops)

**Files:**
- Modify:
  - `src/core/data.js` (remove `'reviewRow'` from KINDS)
  - `src/core/ids.js` (remove `ids.reviewRow`)
  - `src/core/ops/reviews.js`
  - `src/core/ops/platforms.js:5-6,48-61`
  - `src/core/queries.js:131-134,421-487`
  - `src/core/rules.js:111-132`
  - `src/core/merge.js:119-156,79`
  - `src/core/acks.js:13`
  - `src/ui/names.js` (remove `reviewRow`)
  - `src/ui/controller.js` (EDITS: remove old review ops; `beginReview` stub; remove `tickReviewRow`)
  - `src/ui/screens/reviews.js` (temporary: the open block becomes a Resume line; past reviews without the tick counts)
  - `src/ui/screens/platforms.js:4,136`
  - `src/ui/screens/home.js` (`reviewButton`)
- Test:
  - Create `test/core/workflows-merge.test.js`.
  - Delete `test/core/reviews-merge.test.js`.
  - Rewrite the old review uses in: `test/core/ops/reviews.test.js`, `reviews-data.test.js`, `reviews-queries.test.js`, `acks.test.js`, `dashboard.test.js`, `open-items.test.js`, `timeline.test.js`, `random-edits.js`, `test/reports/snapshot.test.js`, `test/ui/screens-home.test.js`, `screens-ssra.test.js`, `screens-reviews.test.js`, `controller.test.js`, `controller-review-moved.test.js`, `controller-reviews.test.js`.

**Interfaces:**
- Consumes (from Task 2): `openPlatformReview`, `cancelRecs`, `beginPlatformReview`, `finishPlatformReview`
- Produces:
  - `openReview(data, platformId) → workflow Rec | null`
  - `completedReviews(data, platformId) → { review, workflow: Rec|null }[]`
  - the rules `review-on-platform-not-live`, `two-open-reviews`, `workflow-step-orphaned` and `ended-workflow-changed`
  - merge keeps an ended workflow whole.

- [ ] **Step 1: Write the failing merge and rules test.**

```js
// test/core/workflows-merge.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeData } from '../../src/core/merge.js';
import { checkRules } from '../../src/core/rules.js';
import { ids } from '../../src/core/ids.js';
import { put, changed } from '../../src/core/data.js';
import { retirePlatform, deletePlatform, linkHazard } from '../../src/core/ops/platforms.js';
import { setStep, cancelWorkflow, takeOverWorkflow } from '../../src/core/ops/workflows.js';
import { openReview } from '../../src/core/queries.js';
import { openWorkflows, endedWorkflows } from '../../src/core/workflows.js';
import { seed, scheduleFixed, beginPlatformReview, finishPlatformReview } from '../helpers.js';
import { scheduleOf } from '../../src/core/schedule.js';

const setup = { by: 'u1', at: '2026-09-28T09:00:00+10:00' };
const me = { by: 'u1', at: '2026-09-28T12:00:00+10:00' };
const them = { by: 'u2', at: '2026-09-28T12:30:00+10:00' };
const saveAct = { by: 'u1', at: '2026-09-28T13:00:00+10:00' };

/** p1 with h1 and h2, 6-monthly due 2026-10-30, and review w1 open, owned by u1. */
function base() {
  let d = linkHazard(seed(), setup, { hazardId: 'h2', platformId: 'p1' });
  d = scheduleFixed(d, 'p1', 6, '2026-10-30', setup);
  return beginPlatformReview(d, setup, { id: 'w1', platformId: 'p1' });
}
const names = (violations) => violations.map((v) => v.rule).sort();

test('the rules: an open review needs a live platform, one per platform, steps follow their workflow', () => {
  const d = base();
  assert.deepEqual(checkRules(d), []);
  assert.deepEqual(names(checkRules(put(d, 'platform', { ...d.records.platform.p1, status: 'retired' }))), ['review-on-platform-not-live']);
  assert.deepEqual(names(checkRules(put(d, 'workflow', { ...d.records.workflow.w1, id: 'w2' }))), ['two-open-reviews']);
  const ticked = setStep(d, me, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true });
  assert.deepEqual(names(checkRules(put(ticked, 'workflow', { ...ticked.records.workflow.w1, status: 'deleted' }))), ['workflow-step-orphaned']);
  const done = finishPlatformReview(ticked, me, { workflowId: 'w1' });
  assert.deepEqual(checkRules(done), []);
  const sid = ids.workflowStep('w1', 'h1', 'sfarp');
  assert.deepEqual(names(checkRules(put(done, 'workflowStep', changed(done.records.workflowStep[sid], them, { note: 'after' })))), ['ended-workflow-changed']);
});

test('ticks on different hazards in two saves are both kept', () => {
  const b = base();
  const mine = setStep(b, me, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true });
  const theirs = setStep(b, { ...them, by: 'u1' }, { workflowId: 'w1', hazardId: 'h2', check: 'sfarp', checked: true, note: 'Seen' });
  const { data, conflicts } = mergeData(b, mine, theirs, saveAct);
  assert.deepEqual(conflicts, []);
  assert.equal(data.records.workflowStep[ids.workflowStep('w1', 'h1', 'sfarp')].checked, true);
  assert.equal(data.records.workflowStep[ids.workflowStep('w1', 'h2', 'sfarp')].note, 'Seen');
});

test('a take-over in one save and a tick in another both land', () => {
  const b = base();
  const mine = setStep(b, me, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true });
  const theirs = takeOverWorkflow(b, them, { workflowId: 'w1' });
  const { data } = mergeData(b, mine, theirs, saveAct);
  assert.equal(data.records.workflow.w1.ownerId, 'u2');
  assert.equal(data.records.workflowStep[ids.workflowStep('w1', 'h1', 'sfarp')].checked, true);
});

test('both completing the same review: one completed review, the date moved on once', () => {
  const b = base();
  const { data } = mergeData(b, finishPlatformReview(b, me, { workflowId: 'w1' }), finishPlatformReview(b, them, { workflowId: 'w1' }), saveAct);
  assert.equal(Object.values(data.records.review).filter((r) => r.status === 'live' && r.state === 'completed').length, 1);
  assert.equal(data.records.review[ids.workflowReview('w1')].completedBy, 'u1', 'mine wins when both completed');
  assert.equal(scheduleOf(data, 'p1', '2026-09-28').due, '2027-04-30');
  assert.deepEqual(checkRules(data), []);
});

test('I cancel a review they completed: it stays completed with all its checks', () => {
  const b = base();
  const { data, conflicts } = mergeData(b, cancelWorkflow(b, me, { workflowId: 'w1' }), finishPlatformReview(b, them, { workflowId: 'w1' }), saveAct);
  assert.equal(data.records.workflow.w1.state, 'completed');
  assert.equal(data.records.review[ids.workflowReview('w1')].state, 'completed');
  assert.ok(conflicts.some((c) => c.kind === 'workflow' && c.reason === 'workflow-ended'));
  assert.deepEqual(checkRules(data), []);
});

test('both starting a review on one platform: mine stays open, theirs is dropped and they are told', () => {
  let b = linkHazard(seed(), setup, { hazardId: 'h2', platformId: 'p1' });
  b = scheduleFixed(b, 'p1', 6, '2026-10-30', setup);
  const { data, conflicts } = mergeData(b, beginPlatformReview(b, me, { id: 'mine', platformId: 'p1' }), beginPlatformReview(b, them, { id: 'theirs', platformId: 'p1' }), saveAct);
  assert.equal(openReview(data, 'p1')?.id, 'mine');
  assert.equal(data.records.workflow.theirs.status, 'deleted');
  assert.ok(conflicts.some((c) => c.id === 'theirs'));
});

test('retiring or deleting a platform cancels its open review, which is then in History, not In progress', () => {
  const d = retirePlatform(setStep(base(), me, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true }), me, { id: 'p1' });
  assert.deepEqual([d.records.workflow.w1.status, d.records.workflow.w1.state], ['live', 'cancelled']);
  assert.equal(d.records.workflowStep[ids.workflowStep('w1', 'h1', 'sfarp')].checked, true);
  assert.deepEqual(openWorkflows(d, null), []);
  assert.deepEqual(endedWorkflows(d, {}).map((w) => w.id), ['w1']);
  const e = deletePlatform(base(), me, { id: 'p1' });
  assert.equal(e.records.workflow.w1.state, 'cancelled');
  assert.deepEqual(checkRules(e), []);
});
```

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/core/workflows-merge.test.js`
Expected: FAIL. `openReview` still reads `review`, `retirePlatform` uses `abandonRecs`, and the rules are still on reviews.

- [ ] **Step 3: Implement the core changes.**

`src/core/queries.js`:

```js
// openReview: the open Platform Review workflow
/** The Platform Review in progress on a platform, if any: an open workflow. @param {Data} data @param {string} platformId @returns {Rec | null} */
export function openReview(data, platformId) {
  return live(data, 'workflow').find((w) => w.type === 'platformReview' && w.platformId === platformId && w.state === 'open') ?? null;
}
```

- Delete `reviewRows` and `controlCounts`, after checking that `controlCounts` has no other users: `grep -n controlCounts src -r`.
- In `platformsReached`, delete the `case 'reviewRow'` block. `workflow` and `workflowStep` fall to `default: return []` on purpose.

```js
/** A platform's completed reviews, newest first, each with the workflow that completed it (none before workflows). @param {Data} data @param {string} platformId */
export function completedReviews(data, platformId) {
  return live(data, 'review').filter((r) => r.platformId === platformId && r.state === 'completed')
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0))
    .map((review) => ({ review, workflow: review.workflowId ? get(data, 'workflow', review.workflowId) ?? null : null }));
}

/** @param {Data} data @param {string} hazardId @param {string} platformId @returns {string | null} */
export function hazardLastReviewed(data, hazardId, platformId) {
  // Completing is strict, so a hazard the completed review has a ticked check for was reviewed.
  const hit = completedReviews(data, platformId).find(({ review }) => {
    const s = review.workflowId ? get(data, 'workflowStep', ids.workflowStep(review.workflowId, hazardId, 'safetyReports')) : null;
    return Boolean(s && s.status === 'live' && s.checked);
  });
  return hit?.review.completedAt ?? null;
}
```

`src/core/rules.js`: replace the two review blocks (from `// Reviews: an open review…` up to the end of the `reviewRow` loop) with:

```js
  // Platform Reviews: an open one needs a live platform, and there is one at a time per platform.
  /** @type {Map<string, any>} */
  const openOn = new Map();
  for (const w of live(data, 'workflow')) {
    if (w.state !== 'open' || w.type !== 'platformReview') continue;
    const p = get(data, 'platform', w.platformId);
    if (!p || p.status !== 'live') {
      out.push({ rule: 'review-on-platform-not-live', message: 'A review is in progress on a platform that is not live.', records: [{ kind: 'workflow', id: w.id }, { kind: 'platform', id: w.platformId }] });
    }
    const first = openOn.get(w.platformId);
    if (first) out.push({ rule: 'two-open-reviews', message: 'A platform has two reviews in progress.', records: [{ kind: 'workflow', id: first.id }, { kind: 'workflow', id: w.id }] });
    else openOn.set(w.platformId, w);
  }
  // A workflow's checks go with it, and an ended workflow is never changed again.
  for (const s of live(data, 'workflowStep')) {
    const w = get(data, 'workflow', s.workflowId);
    if (!w || w.status !== 'live') {
      out.push({ rule: 'workflow-step-orphaned', message: 'A workflow check belongs to a workflow that no longer exists.', records: [{ kind: 'workflow', id: s.workflowId }, { kind: 'workflowStep', id: s.id }] });
    } else if (w.state !== 'open' && s.updatedAt > w.endedAt) {
      out.push({ rule: 'ended-workflow-changed', message: 'A workflow was changed after it ended.', records: [{ kind: 'workflowStep', id: s.id }] });
    }
  }
```

`src/core/merge.js`: replace `keepCompletedReviews` (its function and its call at line 79) with `keepEndedWorkflows(records, mine, theirs, act, conflicts)`. Add `import { ids } from './ids.js';` if it is not already imported.

```js
/**
 * An ended workflow is never changed again, whichever side saved last. If either side completed it,
 * that side's workflow, its checks and the review it wrote are kept (mine, if both did); failing
 * that, a side that cancelled it. A check only the other side has is dropped. Each record this
 * replaces is a conflict naming whose edit was lost.
 * @param {Data['records']} records the merged records, changed in place
 * @param {Data} mine @param {Data} theirs @param {Act} act
 * @param {Map<string, Conflict>} conflicts
 */
function keepEndedWorkflows(records, mine, theirs, act, conflicts) {
  const is = (/** @type {any} */ w, /** @type {string} */ state) => Boolean(w && w.status === 'live' && w.state === state);
  for (const id of new Set([...Object.keys(mine.records.workflow), ...Object.keys(theirs.records.workflow)])) {
    const m = mine.records.workflow[id];
    const t = theirs.records.workflow[id];
    const src = is(m, 'completed') ? mine : is(t, 'completed') ? theirs : is(m, 'cancelled') ? mine : is(t, 'cancelled') ? theirs : null;
    if (!src) continue;
    const loser = src === mine ? t?.updatedBy ?? null : act.by;
    /** @param {string} kind @param {string} rid @param {any} want */
    const keep = (kind, rid, want) => {
      const cur = records[kind][rid];
      if (sameJson(cur, want)) return;
      records[kind][rid] = want;
      conflicts.set(`${kind}:${rid}`, { kind, id: rid, reason: 'workflow-ended', overriddenBy: loser, mine: mine.records[kind][rid] ?? null, theirs: theirs.records[kind][rid] ?? null });
    };
    keep('workflow', id, src.records.workflow[id]);
    const rid = ids.workflowReview(id);
    if (src.records.review[rid]) keep('review', rid, src.records.review[rid]);
    const stepIds = new Set([...Object.keys(mine.records.workflowStep), ...Object.keys(theirs.records.workflowStep)]
      .filter((sid) => (mine.records.workflowStep[sid] ?? theirs.records.workflowStep[sid]).workflowId === id));
    for (const sid of stepIds) {
      const want = src.records.workflowStep[sid];
      const cur = records.workflowStep[sid];
      if (want) keep('workflowStep', sid, want);
      else if (cur && cur.status !== 'deleted') keep('workflowStep', sid, { ...cur, status: 'deleted', updatedBy: act.by, updatedAt: act.at });
    }
  }
}
```

`src/core/ops/platforms.js`: replace `import { abandonRecs } from './reviews.js';` with `import { cancelRecs } from './workflows.js';`. In `retirePlatform` and `deletePlatform`, replace `abandonRecs(data, act, open)` with `cancelRecs(data, act, open)`.

`src/core/ops/reviews.js`: delete `REVIEW_DETAIL_ACTIONS`, `needOpen`, `startReview`, `markRow`, `setReviewOutcome`, `setReviewNotes`, `completeReview`, `abandonRecs` and `abandonReview`. Drop any imports that become unused (`openReview`, `live`, `ids`, `newId` if unused).

Remove these:
- `src/core/data.js`: `'reviewRow'` from KINDS
- `src/core/ids.js`: `reviewRow`
- `src/ui/names.js`: `reviewRow: 'Review row',`
- `src/core/acks.js`: `'Mark review row', 'Set review outcome', 'Set review notes',` from NOT_ACKNOWLEDGED. Keep the rest.

- [ ] **Step 4: Make the UI compile on the new shapes. Each screen is finished in Task 9; this step only keeps them working.**

`src/ui/controller.js`:
- In EDITS, remove `startReview`, `markRow`, `setReviewOutcome`, `setReviewNotes`, `completeReview` and `abandonReview`.
- Delete the `tickReviewRow` handler.
- Replace `beginReview` with the following, and add `import { openReview } from '../core/queries.js'` to the existing queries import:

```js
    // Start review opens the platform's Platform Review: the one in progress, or a new one.
    async beginReview({ platformId }) {
      const open = state.session ? openReview(state.session.working, platformId) : null;
      if (open) return handlers.go({ view: 'workflow', id: open.id });
      const id = newId();
      await applyEdit('startWorkflow', { id, type: 'platformReview', platformId });
      await handlers.go({ view: 'workflow', id });
    },
```

Add `import * as workflows from '../core/ops/workflows.js';` and these EDITS entries:

```js
  startWorkflow: workflows.startWorkflow, setStep: workflows.setStep, setWorkflowOutcome: workflows.setWorkflowOutcome, setWorkflowNotes: workflows.setWorkflowNotes,
  takeOverWorkflow: workflows.takeOverWorkflow, cancelWorkflow: workflows.cancelWorkflow, completeWorkflow: workflows.completeWorkflow,
```

In `QUIET_DATES`, replace `'completeReview'` with `'completeWorkflow'`.

`src/ui/screens/reviews.js`:
- Delete `openReviewBlock`.
- In `reviewsTab`, replace `const top = open ? openReviewBlock(state, data, p, open)` with:

```js
  const top = open ? html`<p>${idTag(workflowLabel(open))} is in progress, owned by ${profileName(state, open.ownerId)}. ${go('Resume →', 'workflow', { id: open.id })}</p>`
```

- Replace `completedReview`'s `dataTable` with a placeholder for Task 9: `${c.workflow ? go('Open the workflow →', 'workflow', { id: c.workflow.id }) : html`<p class="muted">Recorded before workflows.</p>`}`. Here `c` is the `completedReviews` entry: change the function to take `(state, data, p, review)` and look up `review.workflowId`.
- In `pastReviews`, delete the `ticked` and `notTicked` columns.
- In `reviewLine`, the in-progress branch becomes:

```js
html`<span class="tag">${workflowLabel(inProgress)} in progress</span> ${go('Resume →', 'workflow', { id: inProgress.id })}`
```

- Fix the imports: drop `reviewRows`, and add `workflowLabel` from `../../core/ids.js`.

`src/ui/screens/platforms.js`: delete the `REVIEW_DETAIL_ACTIONS` import. At line 136, use `const reaching = historyReaching(data, id);`. Workflow bookkeeping reaches no platform now, so there is nothing to filter.

`src/ui/screens/home.js`: `reviewButton(r)` becomes `reviewButton(data, r)`:

```js
/** Start a platform's review, or carry on with the one under way. @param {Data} data @param {{ platform: any }} r */
function reviewButton(data, r) {
  const open = openReview(data, r.platform.id);
  return open
    ? html`<button type="button" class="small" title="A review is under way" ${dataAttrs({ action: 'go', view: 'workflow', id: open.id })}>Continue review →</button>`
    : html`<button type="button" class="small" ${dataAttrs({ action: 'beginReview', 'platform-id': r.platform.id })}>Start review</button>`;
}
```

Update every caller (`grep -n "reviewButton(" src/ui/screens/home.js`). `comingUp(state, rows)` becomes `comingUp(state, data, rows)`. Add `openReview` to the queries import.

Add a temporary `case 'workflow': return html`<p class="muted">Workflow page coming in Task 8.</p>`;` to `src/ui/render.js`, so a Start review never lands on an unknown view. Task 8 replaces it.

- [ ] **Step 5: Port the old tests.**

Use this mapping in every listed test file:

| Old | New |
|---|---|
| `import { startReview, … } from '…/ops/reviews.js'` | `import { beginPlatformReview, finishPlatformReview } from '…/helpers.js'`, plus ops from `…/ops/workflows.js` as needed |
| `startReview(d, a, { id: 'r1', platformId })` | `beginPlatformReview(d, a, { id: 'r1', platformId })` |
| `completeReview(d, a, { reviewId: 'r1' })` | `finishPlatformReview(d, a, { workflowId: 'r1' })` |
| `markRow(d, a, { reviewId, hazardId, reviewed, note })` | `setStep(d, a, { workflowId: reviewId, hazardId, check: 'safetyReports', checked: reviewed, note })` (the actor must own the workflow) |
| `setReviewOutcome(d, a, { reviewId, outcome })` | `setWorkflowOutcome(d, a, { workflowId: reviewId, outcome })` |
| `abandonReview(d, a, { reviewId })` | `cancelWorkflow(d, a, { workflowId: reviewId })` |
| `d.records.review.r1` *after completion* | `d.records.review[ids.workflowReview('r1')]` |
| `d.records.review.r1` *while open* | `d.records.workflow.r1` |
| `openReview(...)` result `.state === 'open'` | unchanged (it is the workflow) |
| assertions on `reviewRow` records or `ticked`/`notTicked` | delete them; Task 2's tests cover the replacement |

Per file:
- `test/core/ops/reviews.test.js`: delete the tests from line 58 to the end (the review lifecycle). Their replacements are in `test/core/ops/workflows.test.js`. Remove the now-unused imports.
- `test/core/reviews-merge.test.js`: delete the file (`git rm`). It is replaced by `workflows-merge.test.js`.
- `test/core/reviews-queries.test.js`:
  - Delete the first three tests (they cover `reviewRows`).
  - Add: `completedReviews` returns `{ review, workflow }`, with `workflow.id === 'w1'` after `finishPlatformReview`.
  - Add: `hazardLastReviewed(d, 'h1', 'p1')` equals that completion's `at`.
- `test/core/reviews-data.test.js`: in the first test, assert `KINDS.includes('workflow')` and `!KINDS.includes('reviewRow')`. In the last, `openReview` returns the workflow (`.type === 'platformReview'`), and the workflow reaches no platform.
- `test/core/random-edits.js`: replace the review generators with `beginPlatformReview`, `setStep` (owner `act.by`, a random check from `CHECKS`), `setWorkflowOutcome`, `finishPlatformReview` and `cancelWorkflow` on a random open workflow. Keep the same random-selection style.
- `test/ui/screens-reviews.test.js`:
  - Delete the tests at lines 117, 137, 152, 166, 199, 210 and 226 (the checklist, completed-review rows and notes); Task 9 adds the replacements.
  - Line 91: "with a review open, the page shows the rule and a Resume link to the workflow, and no Start button". Assert `/data-view="workflow"/` and `/in progress/`.
- `test/ui/controller-reviews.test.js` line 156: replace with "Start review opens the workflow; Start review again resumes it". Dispatch `beginReview`, assert `view.name === 'workflow'`, dispatch `beginReview` again, and assert the same `view.id` with only one workflow in the data.
- The remaining files (`acks`, `dashboard`, `open-items`, `timeline`, `snapshot`, `screens-home`, `screens-ssra`, `controller`, `controller-review-moved`): mechanical mapping only.

- [ ] **Step 6: Run everything.**

Run: `node --test test/core/workflows-merge.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS. If `grep -rn "reviewRow\|markRow\|abandonReview\|REVIEW_DETAIL_ACTIONS\|reviewRows" src test` prints anything, finish porting it.

- [ ] **Step 7: Commit.**

```bash
git add -A src/core src/ui/controller.js src/ui/names.js src/ui/render.js src/ui/screens/reviews.js src/ui/screens/platforms.js src/ui/screens/home.js test
git commit -m "Reviews run on workflows: an open review is an open Platform Review; retiring a platform cancels it; an ended workflow is kept whole in a merge; review rows gone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Before committing, check with `git status` that `git add -A test` did not pick up unrelated files. The `test/` changes from the start of the session were already modified; stage only the hunks from this task (`git add -p`) when a file holds both.

---

### Task 4: Throwaway conversion script, schema 4 → 5

**Files:**
- Create: `scripts/convert-to-v5.mjs`, `test/scripts/convert-to-v5.test.js`

- [ ] **Step 1: Write the failing test.**

```js
// test/scripts/convert-to-v5.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertBody } from '../../scripts/convert-to-v5.mjs';
import { emptyData, created, validateData } from '../../src/core/data.js';
import { act } from '../helpers.js';

/** A schema 4 body: p1 with an open review r1 and a completed one r0, and their rows. */
function v4() {
  const d = /** @type {any} */ (emptyData());
  delete d.records.workflow; delete d.records.workflowStep; delete d.nextWorkflowNumber;
  d.records.platform.p1 = created(act, 'p1', { number: 1, name: 'A', ownerId: 'u1', reviewRule: null, reviewStart: null });
  d.records.review.r0 = created(act, 'r0', { platformId: 'p1', state: 'completed', outcome: 'Fine', notes: '', dueBefore: '2026-04-30', dueAfter: '2026-10-30', completedBy: 'u1', completedAt: act.at });
  d.records.review.r1 = created(act, 'r1', { platformId: 'p1', state: 'open', outcome: '', notes: '', dueBefore: null, dueAfter: null, completedBy: null, completedAt: null });
  d.records.reviewRow = { 'rr:r0:h1': created(act, 'rr:r0:h1', { reviewId: 'r0', hazardId: 'h1', reviewed: true, note: '' }) };
  return d;
}

test('open reviews and every review row go; completed reviews stay, with no workflow; the workflow kinds arrive', () => {
  const out = convertBody(v4());
  assert.deepEqual(Object.keys(out.records.review), ['r0']);
  assert.equal(out.records.review.r0.workflowId, null);
  assert.ok(!('reviewRow' in out.records));
  assert.deepEqual([out.records.workflow, out.records.workflowStep, out.nextWorkflowNumber], [{}, {}, 1]);
  assert.deepEqual(validateData(out), []);
});
```

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/scripts/convert-to-v5.test.js`
Expected: FAIL (cannot find the module).

- [ ] **Step 3: Write the script.** It is a copy of `scripts/convert-to-v4.mjs` with a new `convertBody`, version numbers 4→5 and file names `data.v4.json` and `profiles.v4.json`:

```js
#!/usr/bin/env node
/**
 * Throwaway: converts a practice folder's data.json from schema 4 to 5 (workflows). Not part of
 * the app; delete once nobody has schema 4 data.
 *
 *     node scripts/convert-to-v5.mjs <folder>     # keeps the old file as data.v4.json
 *
 * Open reviews are dropped (start them again as workflows); completed reviews are kept, marked as
 * recorded before workflows; review rows are dropped. Backups in the folder stay schema 4.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seal, serialize } from '../src/storage/envelope.js';

/** @param {any} body the data inside a schema 4 envelope */
export function convertBody(body) {
  const { reviewRow: _rows, ...records } = body.records;
  const review = Object.fromEntries(Object.entries(records.review ?? {})
    .filter(([, r]) => /** @type {any} */ (r).state === 'completed')
    .map(([id, r]) => [id, { ...r, workflowId: null }]));
  return { ...body, records: { ...records, review, workflow: {}, workflowStep: {} }, nextWorkflowNumber: 1 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const folder = process.argv[2];
  if (!folder) {
    console.error('Usage: node scripts/convert-to-v5.mjs <folder>');
    process.exit(1);
  }
  const file = path.join(folder, 'data.json');
  const env = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (env.schemaVersion !== 4) {
    console.error(`data.json is schema ${env.schemaVersion}, not 4.`);
    process.exit(1);
  }
  fs.copyFileSync(file, path.join(folder, 'data.v4.json'));
  fs.writeFileSync(file, serialize(await seal('data', convertBody(env.body), env.stamp, env.writtenAt)));
  console.log(`Converted ${file} to schema 5 (the old copy is data.v4.json).`);
  // profiles.json is refused under any other schema too; its contents are unchanged, only resealed.
  const pfile = path.join(folder, 'profiles.json');
  if (fs.existsSync(pfile)) {
    const penv = JSON.parse(fs.readFileSync(pfile, 'utf8'));
    if (penv.schemaVersion === 4) {
      fs.copyFileSync(pfile, path.join(folder, 'profiles.v4.json'));
      fs.writeFileSync(pfile, serialize(await seal('profiles', penv.body, penv.stamp, penv.writtenAt)));
      console.log(`Resealed ${pfile} as schema 5 (the old copy is profiles.v4.json).`);
    }
  }
}
```

If `test/scripts/convert-to-v4.test.js` now fails because `emptyData()` has new kinds, leave it alone if it still passes. If it fails, delete it along with `scripts/convert-to-v4.mjs`: schema 3 data can no longer be opened anyway.

- [ ] **Step 4: Run the tests.**

Run: `node --test test/scripts && npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add scripts/convert-to-v5.mjs test/scripts/convert-to-v5.test.js
git commit -m "Throwaway script converting practice data to schema 5: open reviews and review rows dropped, completed reviews kept

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `ssra.js` exports for embedding

**Files:**
- Modify: `src/ui/screens/ssra.js:59,180-204,309-314`
- Test: `test/ui/screens-ssra.test.js` (add a test)

**Interfaces:**
- Produces:
  - `controlsSection(state, data, h, platformId, platformName)`, now exported
  - `sfarpArea(data, h, platformId)`
  - `riskPanels(state, data, h, platformId, stage, part = 'both')`, where `part` is `'both' | 'ratings' | 'justifications'`

- [ ] **Step 1: Write the failing test** (add it to `test/ui/screens-ssra.test.js`, reusing that file's data and state helpers).

```js
import { riskPanels, sfarpArea, controlsSection } from '../../src/ui/screens/ssra.js';

test('risk panels show ratings only, justifications only, or both; SFARP and controls render on their own', () => {
  const d = seed();
  const h = d.records.hazard.h1;
  const ratings = riskPanels(state, d, h, 'p1', 'residual', 'ratings').toString();
  assert.match(ratings, /name="likelihood"/);
  assert.doesNotMatch(ratings, /name="likelihoodWhy"/);
  const why = riskPanels(state, d, h, 'p1', 'residual', 'justifications').toString();
  assert.match(why, /name="likelihoodWhy"/);
  assert.doesNotMatch(why, /<select name="likelihood"/);
  assert.match(riskPanels(state, d, h, 'p1', 'residual').toString(), /name="likelihood".*name="likelihoodWhy"/s);
  assert.match(sfarpArea(d, h, 'p1').toString(), /name="justification".*name="conclusion".*name="conditions"/s);
  assert.match(controlsSection(state, d, h, 'p1', 'Alpha').toString(), /Sprinklers/);
});
```

If the file has no `seed` or `state` in scope, import `seed` from `../helpers.js` and use `{ ...initialState(), screen: 'main', profileId: 'u1', today: '2026-09-28', profiles: [] }`.

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/ui/screens-ssra.test.js`
Expected: FAIL (`sfarpArea` is not exported).

- [ ] **Step 3: Implement.**

Change `function controlsSection(` to `export function controlsSection(`.

Add `sfarpArea`, and use it in `platformTab`'s SFARP body in place of the inline `<div class="sfarp">…</div>`:

```js
/** A platform's SFARP considerations for a hazard: justification, conclusion and conditions of validity. @param {Data} data @param {any} h @param {string} platformId */
export function sfarpArea(data, h, platformId) {
  const sf = sfarpOf(data, h.id, platformId);
  const sfAt = { change: 'setSfarp', 'hazard-id': h.id, 'platform-id': platformId };
  return html`<div class="sfarp">
    <label>SFARP justification<textarea name="justification" rows="4" aria-label="SFARP justification" ${dataAttrs(sfAt)}>${sf.justification}</textarea></label>
    <label>SFARP conclusion<textarea name="conclusion" rows="2" aria-label="SFARP conclusion" ${dataAttrs(sfAt)}>${sf.conclusion}</textarea></label>
    <label>Conditions of validity<textarea name="conditions" rows="3" aria-label="Conditions of validity" ${dataAttrs(sfAt)}>${sf.conditions}</textarea></label>
  </div>`;
}
```

`riskPanels` gains `part`. In `panel`, wrap the two selects and the two `.why` divs:

```js
/** … @param {'both' | 'ratings' | 'justifications'} [part] which halves to show: the ratings, their justifications, or both */
export function riskPanels(state, data, h, platformId, stage, part = 'both') {
  const rate = part !== 'justifications';
  const justify = part !== 'ratings';
  // inside panel(), replace the four lines with:
  //   ${rate ? html`<label class="risk-field">Likelihood <select …>…</select></label>` : html`<p class="risk-field">Likelihood <strong>${a?.likelihood ?? '—'}</strong></p>`}
  //   ${justify ? html`<div class="why">${copy('likelihoodWhy')}<textarea …likelihoodWhy…></textarea></div>` : ''}
  //   ${rate ? html`<label class="risk-field">Consequence <select …>…</select></label>` : html`<p class="risk-field">Consequence <strong>${a?.consequence ?? '—'}</strong></p>`}
  //   ${justify ? html`<div class="why">${copy('consequenceWhy')}<textarea …consequenceWhy…></textarea></div>` : ''}
```

Keep the existing markup inside each `${rate ? …}` and `${justify ? …}` exactly as it is today. Only wrap it.

- [ ] **Step 4: Run the tests.**

Run: `node --test test/ui/screens-ssra.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/screens/ssra.js test/ui/screens-ssra.test.js
git commit -m "SSRA pieces for embedding: controls section exported, SFARP area on its own, risk panels as ratings, justifications or both

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Controller: navigation, prefs, stamping, workflow handlers

**Files:**
- Create: `src/ui/workflows-prefs.js`
- Modify: `src/ui/controller.js`, `src/ui/screens/common.js:158,164,271`
- Test: `test/ui/controller-workflows.test.js` (new), `test/ui/workflows-prefs.test.js` (new)

**Interfaces:**
- Produces:
  - from `workflows-prefs.js`: `RECENT_DAYS = [7,30,90,365]`, `DEFAULT_WORKFLOWS_PREFS = { owner: 'everyone', days: 30 }`, `workflowsPrefsKey`, `readWorkflowsPrefs`, `writeWorkflowsPrefs`
  - state: `workflowsPrefs`
  - handlers: `showWorkflowHazard({ workflowId, hazardId })` and `setWorkflowsFilter({ owner?, days? })`
  - views: `workflows` (tab `dashboard`|`history`) and `workflow` (`id`, optional `hazardId`, where `'summary'` means the summary)

- [ ] **Step 1: Write the failing tests.**

```js
// test/ui/workflows-prefs.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWorkflowsPrefs, writeWorkflowsPrefs, workflowsPrefsKey, DEFAULT_WORKFLOWS_PREFS } from '../../src/ui/workflows-prefs.js';
import { MemoryStorage } from '../fakes/storage.js';

test('the Workflows owner and range: Everyone and 30 days unless remembered; bad values are the defaults', () => {
  const s = new MemoryStorage();
  const key = workflowsPrefsKey('F', 'u1');
  assert.equal(key, 'pivot.workflows:F:u1');
  assert.deepEqual(readWorkflowsPrefs(s, key), { owner: 'everyone', days: 30 });
  writeWorkflowsPrefs(s, key, { owner: 'u2', days: 90 });
  assert.deepEqual(readWorkflowsPrefs(s, key), { owner: 'u2', days: 90 });
  s.setItem(key, JSON.stringify({ owner: 'u2', days: 12 }));
  assert.deepEqual(readWorkflowsPrefs(s, key), DEFAULT_WORKFLOWS_PREFS);
});
```

```js
// test/ui/controller-workflows.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { entries } from '../../src/core/history.js';
import { hasUnsaved } from '../../src/ui/workspace.js';

const env = (f, storage = new MemoryStorage()) => ({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage, minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

/** Ada owns p1 (h1, h2 on it); Grace exists. Signed in as Ada. */
async function ready(folder = new MemoryFolder(), storage = new MemoryStorage()) {
  const c = createController(env(folder, storage));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  await c.dispatch({ type: 'createProfile', name: 'Grace' });
  const [ada, grace] = c.getState().profiles.map((p) => p.id);
  await c.dispatch({ type: 'selectProfile', id: ada });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createHazard', id: 'h2', title: 'Flood' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: ada });
  await c.dispatch({ type: 'linkHazard', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'linkHazard', hazardId: 'h2', platformId: 'p1' });
  return { c, ada, grace, folder, storage };
}
const W = (c) => c.getState().session.working;

test('Workflows sits between Platforms and Reviews and opens on the dashboard', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'go', view: 'workflows' });
  assert.equal(c.getState().view.name, 'workflows');
});

test('edits made on a workflow page I own carry the workflow; edits elsewhere do not', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'beginReview', platformId: 'p1' });
  const id = c.getState().view.id;
  await c.dispatch({ type: 'setSfarp', hazardId: 'h1', platformId: 'p1', conclusion: 'Tolerable' });
  assert.equal(entries(W(c)).at(-1).workflow, id);
  await c.dispatch({ type: 'go', view: 'hazards' });
  await c.dispatch({ type: 'setSfarp', hazardId: 'h1', platformId: 'p1', conclusion: 'Tolerable now' });
  assert.ok(!('workflow' in entries(W(c)).at(-1)));
});

test('moving between hazards remembers the place for the owner; the summary is null', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'beginReview', platformId: 'p1' });
  const id = c.getState().view.id;
  assert.deepEqual(W(c).records.workflow[id].at, { hazardId: 'h1' });
  await c.dispatch({ type: 'showWorkflowHazard', workflowId: id, hazardId: 'h2' });
  assert.deepEqual([c.getState().view.hazardId, W(c).records.workflow[id].at.hazardId], ['h2', 'h2']);
  await c.dispatch({ type: 'showWorkflowHazard', workflowId: id, hazardId: '' });
  assert.deepEqual([c.getState().view.hazardId, W(c).records.workflow[id].at.hazardId], ['summary', null]);
});

test('someone else browsing my workflow moves around without writing anything, and their edits are not stamped', async () => {
  const { c, grace, folder, storage } = await ready();
  await c.dispatch({ type: 'beginReview', platformId: 'p1' });
  const id = c.getState().view.id;
  await c.dispatch({ type: 'save' });
  const g = createController(env(folder, storage));
  await g.dispatch({ type: 'chooseFolder' });
  await g.dispatch({ type: 'selectProfile', id: grace });
  await g.dispatch({ type: 'go', view: 'workflow', id });
  await g.dispatch({ type: 'showWorkflowHazard', workflowId: id, hazardId: 'h2' });
  assert.equal(g.getState().view.hazardId, 'h2');
  assert.equal(W(g).records.workflow[id].at.hazardId, 'h1', 'the owner’s place is untouched');
  assert.equal(hasUnsaved(g.getState().session), false);
  await g.dispatch({ type: 'setSfarp', hazardId: 'h1', platformId: 'p1', conclusion: 'x' });
  assert.ok(!('workflow' in entries(W(g)).at(-1)));
  await g.dispatch({ type: 'setStep', workflowId: id, hazardId: 'h1', check: 'sfarp', checked: 'true' });
  assert.equal(g.getState().message.kind, 'error', 'only the owner ticks');
});

test('a workflow survives saving and opening the folder again, where it left off', async () => {
  const { c, ada, folder, storage } = await ready();
  await c.dispatch({ type: 'beginReview', platformId: 'p1' });
  const id = c.getState().view.id;
  await c.dispatch({ type: 'setStep', workflowId: id, hazardId: 'h1', check: 'controls', checked: 'true', note: 'Added C-001' });
  await c.dispatch({ type: 'showWorkflowHazard', workflowId: id, hazardId: 'h2' });
  await c.dispatch({ type: 'save' });
  const again = createController(env(folder, storage));
  await again.dispatch({ type: 'chooseFolder' });
  await again.dispatch({ type: 'selectProfile', id: ada });
  const w = W(again).records.workflow[id];
  assert.deepEqual([w.state, w.at.hazardId, w.number], ['open', 'h2', 1]);
  assert.equal(Object.values(W(again).records.workflowStep)[0].note, 'Added C-001');
});

test('the Workflows owner filter and range are kept for the profile', async () => {
  const { c, storage } = await ready();
  assert.deepEqual(c.getState().workflowsPrefs, { owner: 'everyone', days: 30 });
  await c.dispatch({ type: 'setWorkflowsFilter', owner: 'me' });
  await c.dispatch({ type: 'setWorkflowsFilter', days: '90' });
  await c.dispatch({ type: 'setWorkflowsFilter', days: '11' });
  assert.deepEqual(c.getState().workflowsPrefs, { owner: 'me', days: 90 });
  assert.deepEqual(JSON.parse(storage.getItem(`pivot.workflows:${c.getState().folderName}:${c.getState().profileId}`)), { owner: 'me', days: 90 });
});
```

Check that `hasUnsaved` is exported from `src/ui/workspace.js`. If not, use the function `common.js` imports for the Unsaved button.

- [ ] **Step 2: Run them and check they fail.**

Run: `node --test test/ui/workflows-prefs.test.js test/ui/controller-workflows.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.**

`src/ui/workflows-prefs.js`:

```js
/** How the Workflows tab is filtered: whose workflows, and how far back Recently completed looks. Remembered per browser, folder and profile. */

/** @typedef {{ owner: string, days: number }} WorkflowsPrefs */

/** How far back Recently completed looks, in days. */
export const RECENT_DAYS = Object.freeze([7, 30, 90, 365]);

/** @type {WorkflowsPrefs} */
export const DEFAULT_WORKFLOWS_PREFS = Object.freeze({ owner: 'everyone', days: 30 });

/** @param {string} folderName @param {string} profileId */
export function workflowsPrefsKey(folderName, profileId) {
  return `pivot.workflows:${folderName}:${profileId}`;
}

/** @param {Pick<Storage, 'getItem'>} storage @param {string} key @returns {WorkflowsPrefs} */
export function readWorkflowsPrefs(storage, key) {
  try {
    const v = JSON.parse(storage.getItem(key) ?? 'null');
    return v && typeof v.owner === 'string' && RECENT_DAYS.includes(v.days) ? { owner: v.owner, days: v.days } : DEFAULT_WORKFLOWS_PREFS;
  } catch {
    return DEFAULT_WORKFLOWS_PREFS;
  }
}

/** @param {Pick<Storage, 'setItem'>} storage @param {string} key @param {WorkflowsPrefs} prefs */
export function writeWorkflowsPrefs(storage, key, prefs) {
  try {
    storage.setItem(key, JSON.stringify(prefs));
  } catch {
    // A convenience only: a full or refused storage just forgets the filter.
  }
}
```

`src/ui/controller.js`:

```js
import { DEFAULT_WORKFLOWS_PREFS, RECENT_DAYS, readWorkflowsPrefs, writeWorkflowsPrefs, workflowsPrefsKey } from './workflows-prefs.js';

// initialState(): add  workflowsPrefs: DEFAULT_WORKFLOWS_PREFS,
// at the selectProfile point that reads reviewsPrefs (line ~192), also:
    const workflowsPrefs = readWorkflowsPrefs(env.storage, workflowsPrefsKey(state.folderName, /** @type {string} */ (state.profileId)));
//   and include workflowsPrefs in the same set({...}).

// act(): edits made on a workflow page the profile owns, while it is open, carry the workflow.
  const act = () => {
    const by = /** @type {string} */ (state.profileId);
    const at = env.clock.now();
    const v = state.view;
    const wf = v?.name === 'workflow' && v.id ? state.session?.working.records.workflow?.[v.id] : null;
    return wf && wf.status === 'live' && wf.state === 'open' && wf.ownerId === by ? { by, at, workflowId: wf.id } : { by, at };
  };

// handlers:
    // A hazard (or '' for the summary) chosen in a workflow's rail: shown; and, for its owner, kept as the place to resume.
    async showWorkflowHazard({ workflowId, hazardId }) {
      const wf = state.session?.working.records.workflow[workflowId];
      set({ view: { name: 'workflow', id: workflowId, hazardId: hazardId || 'summary' }, editing: null, message: null });
      if (wf && wf.status === 'live' && wf.state === 'open' && wf.ownerId === state.profileId) {
        await applyEdit('setWorkflowPosition', { workflowId, hazardId: hazardId || null });
      }
    },
    // The Workflows tab's owner and Recently completed range: remembered in this browser.
    async setWorkflowsFilter({ owner, days }) {
      const p = { ...state.workflowsPrefs };
      if (owner !== undefined) p.owner = owner || 'everyone';
      if (days !== undefined && RECENT_DAYS.includes(Number(days))) p.days = Number(days);
      set({ workflowsPrefs: p });
      writeWorkflowsPrefs(env.storage, workflowsPrefsKey(state.folderName, /** @type {string} */ (state.profileId)), p);
    },
```

- Add `'setWorkflowsFilter'` to QUIET.
- Add `setWorkflowPosition: workflows.setWorkflowPosition` to EDITS. It is dispatched by `showWorkflowHazard`; register it so `applyEdit` can find it.

`src/ui/screens/common.js`:

```js
const NAV = [['home', 'Home'], ['hazards', 'Hazards'], ['controls', 'Controls'], ['platforms', 'Platforms'], ['workflows', 'Workflows'], ['reviews', 'Reviews'], ['bowties', 'Bow-ties'], ['info', 'Info'], ['reports', 'Reports'], ['references', 'References']];
// SECTION: add  workflows: 'workflows', workflow: 'workflows',
// PAGE_WORD: add  workflows: 'Workflows', workflow: 'Workflow',
```

Add a temporary `case 'workflows': return html`<div class="head"><h1>Workflows</h1></div>`;` to `src/ui/render.js` (replaced in Task 7).

- [ ] **Step 4: Run the tests.**

Run: `node --test test/ui/workflows-prefs.test.js test/ui/controller-workflows.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS. If a nav-order test in `test/ui/` lists the old NAV, update it to include Workflows.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/workflows-prefs.js src/ui/controller.js src/ui/screens/common.js src/ui/render.js test/ui/workflows-prefs.test.js test/ui/controller-workflows.test.js
git commit -m "Workflows tab between Platforms and Reviews; edits on a workflow you own carry its number; moving between hazards resumes for the owner only; filter remembered

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Workflows dashboard and History sub-tab

**Files:**
- Create: `src/ui/screens/workflows.js`
- Modify: `src/ui/render.js`
- Test: `test/ui/screens-workflows.test.js` (new)

**Interfaces:**
- Consumes: `openWorkflows`, `endedWorkflows`, `workflowProgress`, `lastActivity`, `WORKFLOW_TYPES`, `typeName`, `openReview`, `scheduleOf`, `workflowLabel`, `state.workflowsPrefs`
- Produces:
  - `workflowsView(state, data)`
  - `progressBar(done, total)`, which Task 9's Home panel reuses
  - `workflowsOwnerId(state) → string|null`
  - `workflowSubject(data, wf) → string`

- [ ] **Step 1: Write the failing test.**

```js
// test/ui/screens-workflows.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowsView } from '../../src/ui/screens/workflows.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { cancelWorkflow, setStep } from '../../src/core/ops/workflows.js';
import { seed, act, later, scheduleFixed, beginPlatformReview, finishPlatformReview } from '../helpers.js';

export const state = { ...initialState(), screen: 'main', today: '2026-09-28', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }], profileId: 'u1', view: { name: 'workflows' } };

/** w1 open on p1 (Ada, 1 of 6 ticked), w2 open on p2 (Grace); p1 every 6 months due 2026-09-01 (overdue). */
export function data() {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-09-01');
  d = beginPlatformReview(d, act, { id: 'w1', platformId: 'p1' });
  d = setStep(d, act, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true });
  d = beginPlatformReview(d, later, { id: 'w2', platformId: 'p2' });
  return assignNumbers(d);
}

test('in progress: every owner by default, with number, workflow, subject, owner, progress and Resume', () => {
  const out = workflowsView(state, data()).toString();
  assert.match(out, /<h2>In progress<\/h2>/);
  assert.match(out, /WF-001/);
  assert.match(out, /WF-002/);
  assert.match(out, /Platform Review/);
  assert.match(out, /Alpha/);
  assert.match(out, /Grace/);
  assert.match(out, /1\/6/);
  assert.match(out, /data-view="workflow"[^>]*data-id="w1"|data-id="w1"[^>]*data-view="workflow"/);
  assert.match(out, /<option value="everyone" selected>Everyone<\/option>/);
});

test('the owner filter narrows In progress', () => {
  const out = workflowsView({ ...state, workflowsPrefs: { owner: 'me', days: 30 } }, data()).toString();
  assert.match(out, /WF-001/);
  assert.doesNotMatch(out, /WF-002/);
});

test('start a workflow: Platform Review with a platform picker, overdue first; the rest Coming soon', () => {
  const out = workflowsView(state, data()).toString();
  assert.match(out, /data-action="beginReview"/);
  assert.match(out, /Alpha — WF-001 in progress/);
  for (const name of ['Platform Onboarding', 'New Tech Data', 'Transfer Platform Owner', 'Reference Update']) assert.match(out, new RegExp(`${name}[\\s\\S]*?Coming soon`));
});

test('recently completed within the chosen range, with All history; History lists completed and cancelled', () => {
  let d = finishPlatformReview(data(), act, { workflowId: 'w1' });
  d = cancelWorkflow(d, { by: 'u2', at: '2026-06-01T10:00:00+10:00' }, { workflowId: 'w2' });
  const out = workflowsView(state, d).toString();
  assert.match(out, /Recently completed/);
  assert.match(out, /<option value="30" selected>Last 30 days<\/option>/);
  assert.match(out, /WF-001[\s\S]*Completed/);
  assert.doesNotMatch(out.split('Recently completed')[1], /WF-002/, 'cancelled in June: outside 30 days');
  assert.match(out, /All history →/);
  const hist = workflowsView({ ...state, view: { name: 'workflows', tab: 'history' } }, d).toString();
  assert.match(hist, /WF-001[\s\S]*Completed/);
  assert.match(hist, /WF-002[\s\S]*Cancelled/);
});

test('a workflow not yet saved shows a TBC tag', () => {
  const d = beginPlatformReview(seed(), act, { id: 'w9', platformId: 'p1' });
  assert.match(workflowsView(state, d).toString(), /tag-tbc/);
});
```

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/ui/screens-workflows.test.js`
Expected: FAIL (cannot find the module).

- [ ] **Step 3: Implement `src/ui/screens/workflows.js`.**

```js
import { html } from '../html.js';
import { dataAttrs, option, go, idTag } from './common.js';
import { dataTable } from './table.js';
import { get, live } from '../../core/data.js';
import { workflowLabel } from '../../core/ids.js';
import { openReview } from '../../core/queries.js';
import { scheduleOf } from '../../core/schedule.js';
import { addDays } from '../../core/time.js';
import { openWorkflows, endedWorkflows, workflowProgress, lastActivity, WORKFLOW_TYPES, typeName } from '../../core/workflows.js';
import { DEFAULT_WORKFLOWS_PREFS, RECENT_DAYS } from '../workflows-prefs.js';
import { profileName, when, day } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** Whose workflows the tab shows: everyone as null. @param {any} state */
export function workflowsOwnerId(state) {
  const o = state.workflowsPrefs?.owner || 'everyone';
  return o === 'everyone' ? null : o === 'me' ? state.profileId : o;
}

/** What a workflow is about, as a person reads it. @param {Data} data @param {any} wf */
export function workflowSubject(data, wf) {
  return get(data, 'platform', wf.platformId)?.name ?? 'A deleted platform';
}

/** A thin bar of how many checks are done, and the figures. @param {number} done @param {number} total */
export function progressBar(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 100;
  return html`<span class="wf-progress"><span class="wf-bar" role="img" aria-label="${done} of ${total} checks done"><span style="width:${pct}%"></span></span><span class="muted">${done}/${total}</span></span>`;
}

const STATE_RANK = { overdue: 0, dueSoon: 1, ok: 2, none: 3 };

/** @param {any} state @param {Data} data */
function inProgress(state, data) {
  return dataTable(state, {
    id: 'workflowsOpen',
    rowKey: (w) => w.id,
    rows: openWorkflows(data, workflowsOwnerId(state)),
    empty: 'No workflows in progress.',
    rowAttrs: (w) => ({ dblclick: 'go', view: 'workflow', id: w.id }),
    columns: [
      { key: 'no', label: 'No.', width: 110, minWidth: 90, value: (w) => w.number ?? 0, render: (w) => idTag(workflowLabel(w)) },
      { key: 'type', label: 'Workflow', width: 200, minWidth: 140, value: (w) => typeName(w.type) },
      { key: 'subject', label: 'Subject', width: 220, minWidth: 140, value: (w) => workflowSubject(data, w), filter: 'text' },
      { key: 'owner', label: 'Owner', width: 160, minWidth: 100, value: (w) => profileName(state, w.ownerId) },
      { key: 'progress', label: 'Progress', width: 220, minWidth: 160, sortable: false, render: (w) => { const p = workflowProgress(data, w); return progressBar(p.done, p.total); } },
      { key: 'started', label: 'Started', width: 150, minWidth: 110, value: (w) => w.createdAt, render: (w) => day(w.createdAt) },
      { key: 'last', label: 'Last activity', width: 190, minWidth: 130, value: (w) => lastActivity(data, w), render: (w) => when(lastActivity(data, w)) },
      { key: 'go', label: '', width: 120, minWidth: 100, sortable: false, render: (w) => go('Resume →', 'workflow', { id: w.id }) },
    ],
  });
}

/** The card that starts a Platform Review: a platform picker, overdue and due-soon first. @param {any} state @param {Data} data */
function reviewCard(state, data) {
  const rows = live(data, 'platform').map((p) => ({ p, s: scheduleOf(data, p.id, state.today), open: openReview(data, p.id) }))
    .sort((a, b) => (STATE_RANK[/** @type {keyof typeof STATE_RANK} */ (a.s.state)] - STATE_RANK[/** @type {keyof typeof STATE_RANK} */ (b.s.state)]) || String(a.p.name).localeCompare(b.p.name));
  const word = (/** @type {any} */ r) => (r.open ? ` — ${workflowLabel(r.open) === 'TBC' ? 'review' : workflowLabel(r.open)} in progress` : r.s.state === 'overdue' ? ' — overdue' : r.s.state === 'dueSoon' ? ' — due soon' : '');
  return rows.length
    ? html`<form class="wf-start" data-action="beginReview"><select name="platformId" aria-label="Platform to review" required>${rows.map((r) => option(r.p.id, `${r.p.name}${word(r)}`, ''))}</select><button type="submit" class="primary small">Start or resume</button></form>`
    : html`<p class="muted">No live platforms to review.</p>`;
}

/** @param {any} state @param {Data} data */
function startCards(state, data) {
  return html`<div class="wf-cards">${WORKFLOW_TYPES.map((t) => html`<section class="dash-card wf-card${t.ready ? '' : ' soon'}" aria-label="${t.name}">
    <h3 class="dash-card-h">${t.name}${t.ready ? '' : html` <span class="tag">Coming soon</span>`}</h3>
    <p class="muted">${t.blurb}</p>
    ${t.type === 'platformReview' ? reviewCard(state, data) : ''}
  </section>`)}</div>`;
}

/** Completed and cancelled workflows as rows. @param {any} state @param {Data} data @param {string} id @param {any[]} rows */
function endedTable(state, data, id, rows) {
  return dataTable(state, {
    id,
    rowKey: (w) => w.id,
    rows,
    empty: 'None.',
    rowAttrs: (w) => ({ dblclick: 'go', view: 'workflow', id: w.id }),
    columns: [
      { key: 'no', label: 'No.', width: 110, minWidth: 90, value: (w) => w.number ?? 0, render: (w) => go(workflowLabel(w), 'workflow', { id: w.id }) },
      { key: 'type', label: 'Workflow', width: 190, minWidth: 140, value: (w) => typeName(w.type), filter: 'select', options: WORKFLOW_TYPES.map((t) => [t.name, t.name]) },
      { key: 'subject', label: 'Subject', width: 200, minWidth: 140, value: (w) => workflowSubject(data, w), filter: 'text' },
      { key: 'status', label: 'Status', width: 140, minWidth: 110, value: (w) => (w.state === 'completed' ? 'Completed' : 'Cancelled'), filter: 'select', options: [['Completed', 'Completed'], ['Cancelled', 'Cancelled']],
        render: (w) => html`<span class="tag wf-${w.state}">${w.state === 'completed' ? 'Completed' : 'Cancelled'}</span>` },
      { key: 'owner', label: 'Owner', width: 150, minWidth: 100, value: (w) => profileName(state, w.ownerId), filter: 'text' },
      { key: 'by', label: 'Ended by', width: 150, minWidth: 100, value: (w) => profileName(state, w.endedBy) },
      { key: 'ended', label: 'Ended', width: 180, minWidth: 120, value: (w) => w.endedAt, render: (w) => when(w.endedAt) },
      { key: 'started', label: 'Started', width: 150, minWidth: 110, value: (w) => w.createdAt, render: (w) => day(w.createdAt) },
    ],
  });
}

/**
 * The Workflows tab: a dashboard (in progress, start one, recently completed) and the History of
 * every completed or cancelled workflow.
 * @param {any} state @param {Data} data
 */
export function workflowsView(state, data) {
  const tab = state.view?.tab === 'history' ? 'history' : 'dashboard';
  const prefs = state.workflowsPrefs ?? DEFAULT_WORKFLOWS_PREFS;
  const on = (/** @type {string} */ t) => (tab === t ? ' on' : '');
  const tabs = html`<nav class="tabs">${[['dashboard', 'Dashboard'], ['history', 'History']].map(([t, label]) => html`<button type="button" class="tab${on(t)}" ${dataAttrs({ action: 'go', view: 'workflows', tab: t })}>${label}</button>`)}</nav>`;
  const owner = html`<label class="owner-pick">Owner <select name="owner" ${dataAttrs({ change: 'setWorkflowsFilter' })}>
    ${option('everyone', 'Everyone', prefs.owner)}${option('me', 'Me', prefs.owner)}${state.profiles.filter((/** @type {any} */ p) => p.id !== state.profileId).map((/** @type {any} */ p) => option(p.id, p.name, prefs.owner))}</select></label>`;
  const head = html`<div class="head"><h1>Workflows</h1>${owner}</div>${tabs}`;
  const ownerId = workflowsOwnerId(state);
  if (tab === 'history') return html`${head}<section class="block">${endedTable(state, data, 'workflowHistory', endedWorkflows(data, { ownerId }))}</section>`;
  const since = addDays(state.today, -prefs.days);
  const range = html`<select class="window-pick" name="days" aria-label="How far back Recently completed looks" ${dataAttrs({ change: 'setWorkflowsFilter' })}>${RECENT_DAYS.map((n) => option(String(n), n === 365 ? 'Last year' : `Last ${n} days`, String(prefs.days)))}</select>`;
  return html`${head}
    <section class="panel"><h2>In progress</h2>${inProgress(state, data)}</section>
    <h2 class="dash-h">Start a workflow</h2>${startCards(state, data)}
    <section class="panel"><div class="panel-head"><h2>Recently completed</h2>${range}</div>
      ${endedTable(state, data, 'workflowsRecent', endedWorkflows(data, { since, ownerId }))}
      <div class="panel-more">${go('All history →', 'workflows', { tab: 'history' })}</div></section>`;
}
```

Check `addDays` in `src/core/time.js` (`grep -n "export function addDays" src/core/time.js`). If it is not exported, take the date arithmetic from where `controller.js` imports `addDays`.

`src/ui/render.js`: `import { workflowsView } from './screens/workflows.js';` and `case 'workflows': return workflowsView(state, data);`. This replaces the Task 6 stub.

- [ ] **Step 4: Run the tests.**

Run: `node --test test/ui/screens-workflows.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS. Adjust the regexes only where the table helper's markup differs, for example how `option` renders `selected`. Read `option()` in `common.js:21`.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/screens/workflows.js src/ui/render.js test/ui/screens-workflows.test.js
git commit -m "Workflows dashboard: in progress by owner (Everyone first), start a Platform Review by platform, the rest coming soon, recently completed with a range; History of every workflow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The workflow page

**Files:**
- Create: `src/ui/screens/workflow.js`
- Modify: `src/ui/render.js`
- Test: `test/ui/screens-workflow.test.js` (new)

**Interfaces:**
- Consumes:
  - from Task 5: `safetyReportsSection`, `controlsSection`, `riskPanels(…, part)`, `sfarpArea`
  - `referencesCard(state, data, { kind: 'hazard', id, platformId })` from `references.js`
  - from Task 2: `CHECKS`, `CHECK_WORDS`, `CHECK_QUESTIONS`, `stepOf`, `workflowHazards`, `workflowProgress`, `workflowChanges`, `typeName`
  - `workflowSubject` from Task 7
- Produces:
  - `workflowView(state, data, id)`
  - `checkGrid(data, wf)`, which the Reviews tab reuses in Task 9

- [ ] **Step 1: Write the failing test.**

```js
// test/ui/screens-workflow.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowView } from '../../src/ui/screens/workflow.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { linkHazard } from '../../src/core/ops/platforms.js';
import { setStep, cancelWorkflow } from '../../src/core/ops/workflows.js';
import { updateHazard } from '../../src/core/ops/hazards.js';
import { state } from './screens-workflows.test.js';
import { seed, act, scheduleFixed, beginPlatformReview, finishPlatformReview } from '../helpers.js';

/** w1 (Ada) on p1 with h1 and h2; h1 has controls ticked with a note. */
function data() {
  let d = linkHazard(scheduleFixed(seed(), 'p1', 6, '2026-10-30'), act, { hazardId: 'h2', platformId: 'p1' });
  d = beginPlatformReview(d, act, { id: 'w1', platformId: 'p1' });
  d = setStep(d, act, { workflowId: 'w1', hazardId: 'h1', check: 'controls', checked: true, note: 'Added C-009' });
  return assignNumbers(d);
}
const on = (extra = {}) => ({ ...state, view: { name: 'workflow', id: 'w1', ...extra } });

test('the owner sees the rail with progress, the six checks on the current hazard, notes and ticks, and Cancel behind a confirm', () => {
  const out = workflowView(on(), data(), 'w1').toString();
  assert.match(out, /WF-001/);
  assert.match(out, /class="wf-rail"/);
  assert.match(out, /Fire[\s\S]*?1\/6/);
  assert.match(out, /Flood[\s\S]*?0\/6/);
  assert.match(out, /Summary &amp; complete|Summary & complete/);
  for (const w of ['Safety reports', 'References', 'Controls', 'Residual risk ratings', 'Residual risk justifications', 'SFARP']) assert.match(out, new RegExp(`wf-check-h[^]*?${w}`));
  assert.match(out, /value="Added C-009"/);
  assert.match(out, /name="checked" checked/);
  assert.match(out, /<details class="confirm"><summary>Cancel workflow…<\/summary>[\s\S]*changes you made to hazards stay/);
  assert.doesNotMatch(out, /<fieldset[^>]*disabled/);
  assert.match(out, /Next hazard →/);
});

test('the rail opens the hazard chosen; the summary shows the grid, outcome, notes and Complete disabled with what is left', () => {
  const flood = workflowView(on({ hazardId: 'h2' }), data(), 'w1').toString();
  assert.match(flood, /class="wf-hazard-h"[\s\S]*Flood/);
  assert.match(flood, /← Previous hazard/);
  const sum = workflowView(on({ hazardId: 'summary' }), data(), 'w1').toString();
  assert.match(sum, /class="wf-grid"/);
  assert.match(sum, /name="outcome"/);
  assert.match(sum, /name="notes"/);
  assert.match(sum, /Complete review — 11 checks not ticked<\/button>/);
  assert.match(sum, /data-action="completeWorkflow"[^>]*disabled/);
});

test('someone else sees it read-only, with the owner named and Take over behind a confirm', () => {
  const out = workflowView({ ...on(), profileId: 'u2' }, data(), 'w1').toString();
  assert.match(out, /Owned by Ada/);
  assert.match(out, /<details class="confirm"><summary>Take over…<\/summary>/);
  assert.match(out, /<fieldset class="wf-fields" disabled>/);
  assert.doesNotMatch(out, /Cancel workflow…/);
});

test('a completed workflow: read-only grid, outcome, and the changes made through it', () => {
  let d = updateHazard(data(), { ...act, workflowId: 'w1' }, { id: 'h1', title: 'Fire on board' });
  d = finishPlatformReview(d, act, { workflowId: 'w1' });
  const out = workflowView(on(), d, 'w1').toString();
  assert.match(out, /tag wf-completed/);
  assert.match(out, /class="wf-grid"/);
  assert.match(out, /Changes made through WF-001/);
  assert.match(out, /Edit hazard/);
  assert.doesNotMatch(out, /class="wf-rail"/);
});

test('a cancelled workflow says so, and keeps its ticks', () => {
  const d = cancelWorkflow(data(), act, { workflowId: 'w1' });
  const out = workflowView(on(), d, 'w1').toString();
  assert.match(out, /tag wf-cancelled/);
  assert.match(out, /Added C-009/);
});

test('an unsaved workflow is named as this workflow in its confirm, never TBC', () => {
  let d = linkHazard(seed(), act, { hazardId: 'h2', platformId: 'p1' });
  d = beginPlatformReview(d, act, { id: 'w1', platformId: 'p1' });
  const out = workflowView(on(), d, 'w1').toString();
  assert.match(out, /Cancel this workflow/);
  assert.doesNotMatch(out, /Cancel TBC/);
});
```

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/ui/screens-workflow.test.js`
Expected: FAIL (cannot find the module).

- [ ] **Step 3: Implement `src/ui/screens/workflow.js`.**

```js
import { html, raw } from '../html.js';
import { dataAttrs, go, idTag, confirmButton, changeDetail } from './common.js';
import { safetyReportsSection, controlsSection, riskPanels, sfarpArea } from './ssra.js';
import { referencesCard } from './references.js';
import { workflowSubject } from './workflows.js';
import { get } from '../../core/data.js';
import { workflowLabel, UNNUMBERED } from '../../core/ids.js';
import { dueOf } from '../../core/schedule.js';
import { CHECKS, CHECK_WORDS, CHECK_QUESTIONS, stepOf, workflowHazards, workflowProgress, workflowChanges, typeName } from '../../core/workflows.js';
import { profileName, when, recordName, KIND_LABEL } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** @param {any} wf */
const named = (wf) => (workflowLabel(wf) === UNNUMBERED ? 'this workflow' : workflowLabel(wf));

/**
 * Each hazard against each check: ✓ where ticked, and its note.
 * @param {Data} data @param {any} wf
 */
export function checkGrid(data, wf) {
  const hz = workflowHazards(data, wf);
  if (!hz.length) return html`<p class="muted">No hazards to check.</p>`;
  return html`<div class="wf-grid-wrap"><table class="wf-grid"><thead><tr><th scope="col">Hazard</th>${CHECKS.map((c) => html`<th scope="col">${CHECK_WORDS[c]}</th>`)}</tr></thead>
    <tbody>${hz.map((x) => html`<tr><th scope="row">${idTag(x.reportId)} ${x.hazard.title}</th>${CHECKS.map((c) => {
      const s = stepOf(data, wf.id, x.hazard.id, c);
      return html`<td class="${s?.checked ? 'yes' : 'no'}">${s?.checked ? '✓' : ''}${s?.note ? html`<div class="wf-note">${s.note}</div>` : ''}</td>`;
    })}</tr>`)}</tbody></table></div>`;
}

/** The hazards and the summary, each with how far along it is. @param {Data} data @param {any} wf @param {string | null} current */
function rail(data, wf, current) {
  const prog = workflowProgress(data, wf);
  const item = (/** @type {string} */ hazardId, /** @type {any} */ body, /** @type {boolean} */ done) => html`<button type="button" class="wf-rail-item${current === (hazardId || null) ? ' on' : ''}${done ? ' done' : ''}" ${dataAttrs({ action: 'showWorkflowHazard', 'workflow-id': wf.id, 'hazard-id': hazardId })}>${body}</button>`;
  return html`<nav class="wf-rail" aria-label="Hazards"><div class="wf-rail-h">Hazards <span class="muted">${prog.done}/${prog.total}</span></div>
    ${workflowHazards(data, wf).map((x) => {
      const n = prog.perHazard.get(x.hazard.id) ?? 0;
      return item(x.hazard.id, html`<span class="wf-mark" aria-hidden="true">${n === CHECKS.length ? '✓' : ''}</span><span class="wf-name">${idTag(x.reportId)} ${x.hazard.title}</span><span class="wf-count">${n}/${CHECKS.length}</span>`, n === CHECKS.length);
    })}
    ${item('', html`<span class="wf-mark" aria-hidden="true"></span><span class="wf-name">Summary &amp; complete</span>`, false)}</nav>`;
}

/** The editor a check shows: the same one the platform page uses. @param {any} state @param {Data} data @param {any} h @param {any} p @param {string} check */
function checkBody(state, data, h, p, check) {
  switch (check) {
    case 'safetyReports': return safetyReportsSection(state, data, h, p.id);
    case 'references': return referencesCard(state, data, { kind: 'hazard', id: h.id, platformId: p.id });
    case 'controls': return controlsSection(state, data, h, p.id, p.name);
    case 'residualRatings': return riskPanels(state, data, h, p.id, 'residual', 'ratings');
    case 'residualJustifications': return riskPanels(state, data, h, p.id, 'residual', 'justifications');
    default: return sfarpArea(data, h, p.id);
  }
}

/** One check on a hazard: its question, the editor, a note and the tick. @param {any} state @param {Data} data @param {any} wf @param {any} h @param {any} p @param {string} check @param {number} n */
function checkCard(state, data, wf, h, p, check, n) {
  const s = stepOf(data, wf.id, h.id, check);
  const at = { change: 'setStep', 'workflow-id': wf.id, 'hazard-id': h.id, check };
  return html`<section class="wf-check${s?.checked ? ' done' : ''}" aria-label="${CHECK_WORDS[check]}">
    <h3 class="wf-check-h"><span class="wf-n">${n}</span> ${CHECK_WORDS[check]} <span class="muted wf-q">${CHECK_QUESTIONS[check]}</span></h3>
    <div class="wf-check-body">${checkBody(state, data, h, p, check)}</div>
    <div class="wf-check-foot">
      <input class="grow" name="note" value="${s?.note ?? ''}" placeholder="Note (optional)…" aria-label="Note on ${CHECK_WORDS[check]}" ${dataAttrs(at)}>
      <label class="wf-tick"><input type="checkbox" name="checked"${s?.checked ? raw(' checked') : ''} ${dataAttrs(at)}> Checked</label>
    </div></section>`;
}

/** @param {any} wf @param {string} label @param {string} hazardId */
const navButton = (wf, label, hazardId) => html`<button type="button" ${dataAttrs({ action: 'showWorkflowHazard', 'workflow-id': wf.id, 'hazard-id': hazardId })}>${label}</button>`;

/** @param {any} state @param {Data} data @param {any} wf @param {{ hazard: any, reportId: string }} x @param {boolean} mine */
function hazardPage(state, data, wf, x, mine) {
  const p = get(data, 'platform', wf.platformId);
  const hz = workflowHazards(data, wf);
  const i = hz.findIndex((y) => y.hazard.id === x.hazard.id);
  const n = workflowProgress(data, wf).perHazard.get(x.hazard.id) ?? 0;
  return html`<div class="wf-hazard-h"><h2>${idTag(x.reportId)} ${go(x.hazard.title, 'hazard', { id: x.hazard.id })}</h2><span class="muted">${n}/${CHECKS.length} checked</span></div>
    <fieldset class="wf-fields"${mine ? '' : raw(' disabled')}>${CHECKS.map((c, k) => checkCard(state, data, wf, x.hazard, p, c, k + 1))}</fieldset>
    <div class="actions wf-nav">${i > 0 ? navButton(wf, '← Previous hazard', hz[i - 1].hazard.id) : ''}${i < hz.length - 1 ? navButton(wf, 'Next hazard →', hz[i + 1].hazard.id) : navButton(wf, 'Summary & complete →', '')}</div>`;
}

/** @param {any} state @param {Data} data @param {any} wf @param {boolean} mine */
function summary(state, data, wf, mine) {
  const { done, total } = workflowProgress(data, wf);
  const left = total - done;
  const scheduled = Boolean(dueOf(data, wf.platformId));
  const at = { 'workflow-id': wf.id };
  return html`<h2>Summary</h2>${checkGrid(data, wf)}
    <fieldset class="wf-fields"${mine ? '' : raw(' disabled')}>
      <label class="outcome">Outcome<textarea name="outcome" rows="3" placeholder="What the review found, and anything to follow up…" ${dataAttrs({ change: 'setWorkflowOutcome', ...at })}>${wf.outcome}</textarea></label>
      <label class="outcome">Additional notes<textarea name="notes" rows="4" placeholder="Anything else worth keeping with this review…" ${dataAttrs({ change: 'setWorkflowNotes', ...at })}>${wf.notes}</textarea></label>
      <div class="actions"><button type="button" class="primary" ${dataAttrs({ action: 'completeWorkflow', ...at })}${left || !scheduled ? raw(' disabled') : ''}>${left ? `Complete review — ${left} check${left === 1 ? '' : 's'} not ticked` : 'Complete review'}</button></div>
    </fieldset>
    ${scheduled ? '' : html`<p class="muted">Completing a review needs a review schedule: set one on its ${go('Reviews page', 'platformReview', { id: wf.platformId })}.</p>`}`;
}

/** What each change made through the workflow did, newest first. @param {any} state @param {Data} data @param {any} wf */
function changesList(state, data, wf) {
  const list = workflowChanges(data, wf.id).slice().reverse();
  if (!list.length) return html`<p class="muted">No changes were made through this workflow.</p>`;
  return html`<ul class="plain wf-changes">${list.map((e) => html`<li><strong>${e.action}</strong> <span class="muted">${profileName(state, e.by)}, ${when(e.at)}</span>
    <ul class="plain">${e.items.filter((/** @type {any} */ i) => i.kind !== 'workflow' && i.kind !== 'workflowStep').map((/** @type {any} */ i) => html`<li><span class="muted">${KIND_LABEL[/** @type {keyof typeof KIND_LABEL} */ (i.kind)] ?? i.kind}: ${recordName(i.kind, get(data, i.kind, i.id), data)}</span> ${changeDetail(i)}</li>`)}</ul></li>`)}</ul>`;
}

/** @param {any} state @param {Data} data @param {any} wf */
function endedBody(state, data, wf) {
  const word = wf.state === 'completed' ? 'Completed' : 'Cancelled';
  return html`<p class="doc-meta"><span class="tag wf-${wf.state}">${word}</span> by ${profileName(state, wf.endedBy)}, ${when(wf.endedAt)}. Started by ${profileName(state, wf.createdBy)}, ${when(wf.createdAt)}.</p>
    <article class="doc">${checkGrid(data, wf)}
      ${wf.outcome ? html`<h3>Outcome</h3><p class="outcome-text">${wf.outcome}</p>` : ''}
      ${wf.notes ? html`<h3>Additional notes</h3><p class="outcome-text">${wf.notes}</p>` : ''}
      <h2>Changes made through ${workflowLabel(wf)}</h2>${changesList(state, data, wf)}</article>`;
}

/**
 * A workflow's page. Open: a rail of hazards and the summary, with the chosen one's checks; only
 * its owner can change them, anyone else sees them read-only and can take it over. Ended: what it
 * recorded and the changes made through it.
 * @param {any} state @param {Data} data @param {string} id
 */
export function workflowView(state, data, id) {
  const wf = get(data, 'workflow', id);
  if (!wf || wf.status === 'deleted') return html`<p class="muted">That workflow no longer exists.</p>`;
  const mine = wf.ownerId === state.profileId;
  const title = html`<h1>${go('Workflows', 'workflows')} · ${idTag(workflowLabel(wf))} ${typeName(wf.type)} · ${get(data, 'platform', wf.platformId) ? go(workflowSubject(data, wf), 'platform', { id: wf.platformId }) : workflowSubject(data, wf)}</h1>`;
  if (wf.state !== 'open') return html`<div class="head">${title}</div>${endedBody(state, data, wf)}`;
  const tools = mine
    ? confirmButton('Cancel workflow…', `Cancel ${named(wf)}: its ticks and notes are kept in History as cancelled; changes you made to hazards stay`, dataAttrs({ action: 'cancelWorkflow', 'workflow-id': wf.id }))
    : confirmButton('Take over…', `Take over ${named(wf)} from ${profileName(state, wf.ownerId)}`, dataAttrs({ action: 'takeOverWorkflow', 'workflow-id': wf.id }));
  const head = html`<div class="head">${title}<span class="wf-owner muted">Owner: ${profileName(state, wf.ownerId)}</span>${tools}</div>
    ${mine ? '' : html`<p class="wf-banner">Owned by ${profileName(state, wf.ownerId)}. You can look through it; take it over to work on it.</p>`}`;
  const hz = workflowHazards(data, wf);
  const want = state.view?.hazardId === 'summary' ? null : state.view?.hazardId ?? wf.at?.hazardId ?? null;
  const x = want ? hz.find((y) => y.hazard.id === want) ?? (state.view?.hazardId ? null : hz[0] ?? null) : null;
  const current = x ? x.hazard.id : null;
  return html`${head}<div class="wf-layout">${rail(data, wf, current)}<div class="wf-main">${x ? hazardPage(state, data, wf, x, mine) : summary(state, data, wf, mine)}</div></div>`;
}
```

`src/ui/render.js`: `import { workflowView } from './screens/workflow.js';` and `case 'workflow': return workflowView(state, data, v.id);`. This replaces the Task 3 stub.

- [ ] **Step 4: Run the tests.**

Run: `node --test test/ui/screens-workflow.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS.

If `referencesCard`'s signature differs, read `src/ui/screens/references.js` and match the call `ssra.js:309` already makes.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/screens/workflow.js src/ui/render.js test/ui/screens-workflow.test.js
git commit -m "Workflow page: a rail of hazards with progress, six checks each with the platform's own editors, a note and a tick; summary with strict Complete; read-only with Take over for others; ended workflows show their grid and the changes made through them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Reviews tab, Home panel, history chips

**Files:**
- Modify: `src/ui/screens/reviews.js`, `src/ui/screens/home.js`, `src/ui/screens/common.js` (`historyTable`)
- Test: `test/ui/screens-reviews.test.js`, `test/ui/screens-home.test.js`, `test/ui/history-workflow-chip.test.js` (new)

**Interfaces:**
- Consumes: `checkGrid` (Task 8), `progressBar` and `workflowSubject` (Task 7), `openWorkflows`, `typeName`, `homeOwnerId`

- [ ] **Step 1: Write the failing tests.**

Add to `test/ui/screens-reviews.test.js`, using its existing `data()`, `onTab()` and `state`:

```js
import { beginPlatformReview, finishPlatformReview } from '../helpers.js';
import { ids } from '../../src/core/ids.js';

test('a completed review shows its workflow’s check grid, and past reviews link the WF number', () => {
  let d = beginPlatformReview(data(), act, { id: 'w1', platformId: 'p1' });
  d = assignNumbers(finishPlatformReview(d, act, { workflowId: 'w1' }));
  const page = platformReviewView(onTab(), d, 'p1').toString();
  assert.match(page, /<th data-col="wf"/);
  assert.match(page, /WF-001/);
  const opened = platformReviewView({ ...onTab(), view: { name: 'platformReview', id: 'p1', reviewId: ids.workflowReview('w1') } }, d, 'p1').toString();
  assert.match(opened, /class="wf-grid"/);
});

test('a review recorded before workflows says so', () => {
  const d = data();
  d.records.review.old = { id: 'old', status: 'live', createdBy: 'u1', createdAt: act.at, updatedBy: 'u1', updatedAt: act.at, platformId: 'p1', workflowId: null, state: 'completed', outcome: 'Fine', notes: '', dueBefore: '2026-03-01', dueAfter: '2026-09-01', completedBy: 'u1', completedAt: act.at };
  const out = platformReviewView({ ...onTab(), view: { name: 'platformReview', id: 'p1', reviewId: 'old' } }, d, 'p1').toString();
  assert.match(out, /Recorded before workflows/);
  assert.match(out, /Fine/);
});
```

Add to `test/ui/screens-home.test.js`, using that file's state and data setup:

```js
import { beginPlatformReview } from '../helpers.js';

test('Home lists the workflows in progress for the owner chosen, with Resume and All workflows', () => {
  let d = beginPlatformReview(seed(), act, { id: 'w1', platformId: 'p1' });
  d = beginPlatformReview(d, later, { id: 'w2', platformId: 'p2' });
  const mine = homeView({ ...state, homeOwner: 'me' }, d).toString();
  assert.match(mine, /<h2>Workflows in progress<\/h2>/);
  assert.match(mine, /data-id="w1"/);
  assert.doesNotMatch(mine, /data-id="w2"/);
  assert.match(mine, /All workflows →/);
  const all = homeView({ ...state, homeOwner: 'everyone' }, d).toString();
  assert.match(all, /data-id="w2"/);
});
```

(Use whatever `state` and `homeView` imports that file already has. Its profile must be `u1`.)

```js
// test/ui/history-workflow-chip.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyTable } from '../../src/ui/screens/common.js';
import { updateHazard, assignNumbers } from '../../src/core/ops/hazards.js';
import { initialState } from '../../src/ui/controller.js';
import { seed, act, beginPlatformReview } from '../helpers.js';

test('a change made through a workflow shows a via WF chip linking to it', () => {
  let d = assignNumbers(beginPlatformReview(seed(), act, { id: 'w1', platformId: 'p1' }));
  d = updateHazard(d, { ...act, workflowId: 'w1' }, { id: 'h1', title: 'Fire on board' });
  const state = { ...initialState(), screen: 'main', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }], view: { name: 'hazard', id: 'h1', tab: 'history' } };
  const out = historyTable(state, d, 'hazard', 'h1').toString();
  assert.match(out, /class="tag wf-chip"[^>]*>via WF-001/);
  assert.match(out, /data-view="workflow"/);
});
```

- [ ] **Step 2: Run them and check they fail.**

Run: `node --test test/ui/screens-reviews.test.js test/ui/screens-home.test.js test/ui/history-workflow-chip.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.**

`src/ui/screens/common.js` → `historyTable`. In the `what` column's `render`, the non-bundle branch becomes `if (!r.bundle) return html`${what(r)}${viaWorkflow(data, r.e)}`;`. Add at module level (import `get` from `../../core/data.js` and `workflowLabel` from `../../core/ids.js` if they are not already imported):

```js
/** The workflow a change was made through, as a chip opening it. @param {any} data @param {any} e a history entry */
function viaWorkflow(data, e) {
  const wf = e.workflow ? get(data, 'workflow', e.workflow) : null;
  return wf ? html` <button type="button" class="tag wf-chip" title="Made through this workflow" ${dataAttrs({ action: 'go', view: 'workflow', id: wf.id })}>via ${workflowLabel(wf)}</button>` : '';
}
```

`src/ui/screens/reviews.js`:
- `completedReview(state, data, p, review)` keeps its meta line, outcome and notes. Replace the Task 3 placeholder with:

```js
    ${review.workflowId && get(data, 'workflow', review.workflowId)
      ? html`<p>${go(`Open ${workflowLabel(get(data, 'workflow', review.workflowId))} →`, 'workflow', { id: review.workflowId })}</p>${checkGrid(data, get(data, 'workflow', review.workflowId))}`
      : html`<p class="muted">Recorded before workflows.</p>`}
```

- In `pastReviews`, add the first column:

```js
      { key: 'wf', label: 'Workflow', width: 130, minWidth: 100, value: (c) => c.workflow?.number ?? 0,
        render: (c) => (c.workflow ? go(workflowLabel(c.workflow), 'workflow', { id: c.workflow.id }) : html`<span class="muted">—</span>`) },
```

Imports: `checkGrid` from `./workflow.js`, `get` from `../../core/data.js`.

`src/ui/screens/home.js`: add the panel. Put it first inside `<div class="dash-stack">`, before Coming up:

```js
import { openWorkflows, workflowProgress, typeName } from '../../core/workflows.js';
import { progressBar, workflowSubject } from './workflows.js';
import { workflowLabel } from '../../core/ids.js';

/** How many workflows Home lists before All workflows. */
const WORKFLOW_LIMIT = 5;

/** The workflows in progress for Home's owner (everyone's for null). @param {any} state @param {Data} data @param {string | null} ownerId */
function workflowsPanel(state, data, ownerId) {
  const rows = openWorkflows(data, ownerId);
  return html`<section class="panel stack-panel wf-panel"><div class="panel-head"><h2>Workflows in progress</h2></div>
    ${rows.length
      ? html`<table class="attn wf-home"><tbody>${rows.slice(0, WORKFLOW_LIMIT).map((w) => { const p = workflowProgress(data, w); return html`<tr>
          <td>${idTag(workflowLabel(w))}</td><td>${typeName(w.type)} · ${workflowSubject(data, w)}${ownerId == null ? html` <span class="muted">${profileName(state, w.ownerId)}</span>` : ''}</td>
          <td>${progressBar(p.done, p.total)}</td>
          <td class="act"><button type="button" class="small" ${dataAttrs({ action: 'go', view: 'workflow', id: w.id })}>Resume →</button></td></tr>`; })}</tbody></table>`
      : html`<p class="muted">No workflows in progress.</p>`}
    <div class="panel-more">${go(rows.length > WORKFLOW_LIMIT ? `All ${rows.length} workflows →` : 'All workflows →', 'workflows')}</div></section>`;
}
// in homeView, inside <div class="dash-stack">: ${workflowsPanel(state, data, ownerId)} before the Coming up section.
```

`home.js` already imports `idTag` and `dataAttrs`. Add `workflowLabel` to its existing `../../core/ids.js` import rather than importing it twice.

- [ ] **Step 4: Run the tests.**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/screens/reviews.js src/ui/screens/home.js src/ui/screens/common.js test/ui/screens-reviews.test.js test/ui/screens-home.test.js test/ui/history-workflow-chip.test.js
git commit -m "Reviews show each completed review's workflow grid and WF number; Home lists workflows in progress; History marks changes made through a workflow with a via WF chip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Styles, then the whole app checked in the browser

**Files:**
- Modify: `src/ui/styles.css`

- [ ] **Step 1: Add the styles.** Use the existing custom properties: read the top of `styles.css` for the colour, spacing and border variables (for example `--accent`, `--line`, `--muted`). Use the same names in place of any literal colours below.

```css
/* Workflows */
.wf-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-bottom: 20px; }
.wf-card.soon { opacity: .6; }
.wf-start { display: flex; gap: 8px; align-items: center; }
.wf-start select { flex: 1; min-width: 0; }
.wf-progress { display: inline-flex; align-items: center; gap: 8px; }
.wf-bar { display: inline-block; width: 110px; height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; }
.wf-bar > span { display: block; height: 100%; background: var(--accent); }
.wf-layout { display: grid; grid-template-columns: 280px 1fr; gap: 20px; align-items: start; }
.wf-rail { position: sticky; top: 12px; display: flex; flex-direction: column; gap: 2px; border-right: 1px solid var(--line); padding-right: 12px; }
.wf-rail-h { font-weight: 600; margin-bottom: 6px; display: flex; justify-content: space-between; }
.wf-rail-item { display: grid; grid-template-columns: 16px 1fr auto; gap: 6px; text-align: left; background: none; border: 0; padding: 6px 8px; border-radius: 4px; cursor: pointer; }
.wf-rail-item.on { background: var(--accent-soft, rgba(0,0,0,.06)); font-weight: 600; }
.wf-rail-item.done .wf-mark { color: var(--accent); }
.wf-count { color: var(--muted); font-variant-numeric: tabular-nums; }
.wf-hazard-h { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.wf-fields { border: 0; padding: 0; margin: 0; min-width: 0; }
.wf-fields[disabled] { opacity: .75; }
.wf-check { border: 1px solid var(--line); border-radius: 6px; padding: 12px 14px; margin-bottom: 12px; }
.wf-check.done { border-color: var(--accent); }
.wf-check-h { margin: 0 0 8px; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.wf-n { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--line); font-size: .85em; }
.wf-q { font-weight: 400; }
.wf-check-foot { display: flex; gap: 12px; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); }
.wf-tick { display: inline-flex; gap: 6px; align-items: center; white-space: nowrap; }
.wf-nav { justify-content: space-between; }
.wf-banner { padding: 8px 12px; border-radius: 4px; background: var(--accent-soft, rgba(0,0,0,.06)); }
.wf-grid-wrap { overflow-x: auto; }
.wf-grid { border-collapse: collapse; width: 100%; }
.wf-grid th, .wf-grid td { border: 1px solid var(--line); padding: 4px 8px; vertical-align: top; }
.wf-grid td.yes { color: var(--accent); text-align: center; }
.wf-note { color: var(--muted); font-size: .85em; text-align: left; }
.tag.wf-completed { background: var(--ok-soft, #e3f2e5); }
.tag.wf-cancelled { background: var(--line); }
.tag.wf-chip { cursor: pointer; border: 0; font: inherit; font-size: .8em; }
@media (max-width: 900px) { .wf-layout { grid-template-columns: 1fr; } .wf-rail { position: static; border-right: 0; padding-right: 0; } }
```

- [ ] **Step 2: Build and run the full suite.**

Run: `npm run build && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Check it in the browser.** Use the `run` skill. Open a practice folder (converted with `node scripts/convert-to-v5.mjs <folder>` if it is schema 4) and confirm, light and dark:
  1. The tab order is Platforms, Workflows, Reviews.
  2. Reviews → Start review lands on the workflow. The Workflows dashboard shows it In progress, with Owner set to Everyone.
  3. Tick and note checks, edit a residual rating inside check 4, and move between hazards. Save, reload, and confirm it resumes on the same hazard.
  4. The hazard's History tab shows the rating change with **via WF-00n**.
  5. Summary: Complete stays disabled until everything is ticked. Completing moves the review date, and the workflow appears in Recently completed and History.
  6. Start another review and Cancel it (two clicks). It shows as Cancelled with its ticks.
  7. Switch profile, open someone else's workflow: it is read-only, and Take over works (two clicks).
  8. The Home panel lists in-progress workflows and follows the Home owner picker.

Fix anything that looks broken, then rebuild.

- [ ] **Step 4: Commit.**

```bash
git add src/ui/styles.css
git commit -m "Workflow styles: start cards, progress bars, the hazard rail, check cards, the check grid and chips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
