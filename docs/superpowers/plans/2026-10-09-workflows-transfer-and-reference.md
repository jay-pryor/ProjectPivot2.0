# Workflows, part 3 (Transfer Platform Owner, Reference Update) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two workflows on the part-1 framework:
- **Transfer Platform Owner:** ticks per responsibility group, then the owner changes on confirm, open workflows are handed over, and the recipient gets an urgent item to review.
- **Reference Update:** a new revision with a file, link or path, every linked item ticked, applied on confirm.

**Architecture:**
- The new types `transferOwner` and `referenceUpdate` reuse the `workflow` and `workflowStep` records.
- Steps are keyed by group (`'-'` + `group:<key>`) or by linked item (`'<kind>:<id>'` + `item`).
- Type branches live in `core/workflows.js` (queries, progress) and `core/ops/workflows.js` (ops).
- A `via` field on the view stamps edits made on an item page opened from a reference update.

**Tech Stack:** Vanilla ES modules, JSDoc types (`npm run typecheck`), `node:test` (`npm test`), `npm run build`.

**Spec:** `docs/superpowers/specs/2026-10-09-workflows-transfer-and-reference-design.md`

## Global Constraints

- **Types and step keys:**
  - Types are `'transferOwner'` and `'referenceUpdate'`.
  - Transfer group keys, in this order: `acks`, `review`, `workflows`, `awaiting`, `toImplement`, `controlGaps`, `hazardGaps`.
  - A transfer step is `hazardId: '-'`, `check: 'group:<key>'`.
  - A reference update step is `hazardId: '<targetKind>:<targetId>'`, `check: 'item'`.
- **Owner changes:** all of them go through Transfer, except onboarding's Details step.
- **Reference updates:** the revision, file, url and path are applied only on confirm. At least one of file, url or path must be **given in the workflow**.
- **Sharp corners** (`corners.test.js`).
- **Text on a warning background** uses `--p-warn`, not `--p-warn-fg`.
- **Run `npm run build` after every source change.**
- **Commits:**
  - Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Branch: `workflows-transfer-reference`.
  - Stage only the task's files.

## Review Focus

1. **A transfer whose platform has an open review owned by a third person:** the review stays theirs. Only workflows owned by the old owner move. Covered in Task 2.
2. **A reference update where an item is unlinked mid-workflow after being ticked:** it drops out and no longer counts toward confirm. A newly linked item must be ticked. Covered in Task 3.
3. **Someone other than the recipient opens a completed transfer:** no Mark as reviewed button, and the op refuses them. Covered in Task 2 and Task 5.
4. **Navigating away from an item page opened with `via`:** edits after that are not stamped. Covered in Task 4.
5. **A reference update cancelled after a file was uploaded:** the reference's `file` and `pastFiles` are unchanged. Covered in Task 3.

---

### Task 1: Types, queries, progress and rules

**Files:**
- Modify: `src/core/workflows.js`, `src/core/rules.js`, `src/core/queries.js` (export the `openItems` per-platform pieces used by `transferGroups`)
- Test: `test/core/transfer-reference-queries.test.js` (new)

**Interfaces:**
- Produces from `core/workflows.js`:
  - `TRANSFER_GROUPS` (`[key, title][]`)
  - `transferGroups(data, platformId, today, selfId?) → { key, title, items: { text, view?, id?, tab? }[] }[]`
  - `referenceItems(data, referenceId) → { key, kind, label, platforms: string[], open: { view, id, tab? } }[]`
  - `openTransfer(data, platformId)`
  - `openReferenceUpdate(data, referenceId)`
- `workflowProgress` handles both types.
- `workflowSubject` (`ui/screens/workflows.js`) names a reference for a reference update.

- [ ] **Step 1: Write the failing test.**

```js
// test/core/transfer-reference-queries.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { created, put } from '../../src/core/data.js';
import { createReference, linkReference, unlinkReference } from '../../src/core/ops/references.js';
import { transferGroups, referenceItems, workflowProgress, TRANSFER_GROUPS, openTransfer, openReferenceUpdate } from '../../src/core/workflows.js';
import { checkRules } from '../../src/core/rules.js';
import { act, seed, scheduleFixed, beginPlatformReview } from '../helpers.js';

const wf = (d, id, fields) => put(d, 'workflow', created(act, id, { number: null, ownerId: 'u1', state: 'open', at: { hazardId: null }, outcome: '', notes: '', endedBy: null, endedAt: null, ...fields }));

test('transfer groups: every group in order, the review schedule always there, the platform’s other open workflows listed', () => {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  d = beginPlatformReview(d, act, { id: 'w1', platformId: 'p1' });
  d = wf(d, 't1', { type: 'transferOwner', platformId: 'p1', toOwnerId: null, fromOwnerId: null, reviewed: null });
  const g = transferGroups(d, 'p1', '2026-09-28', 't1');
  assert.deepEqual(g.map((x) => x.key), TRANSFER_GROUPS.map(([k]) => k));
  assert.deepEqual(g.map((x) => x.key), ['acks', 'review', 'workflows', 'awaiting', 'toImplement', 'controlGaps', 'hazardGaps']);
  assert.equal(g.find((x) => x.key === 'review').items.length, 1);
  assert.match(g.find((x) => x.key === 'review').items[0].text, /30 Oct 2026|2026-10-30/);
  assert.deepEqual(g.find((x) => x.key === 'workflows').items.map((i) => i.id), ['w1'], 'not the transfer itself');
  assert.ok(g.find((x) => x.key === 'awaiting').items.length >= 1, 'seed controls are recommended on p1');
  assert.equal(openTransfer(d, 'p1')?.id, 't1');
});

test('reference items: each live link with its platforms and where it opens; unlinked ones drop out', () => {
  let d = createReference(seed(), act, { id: 'r1', title: 'Range manual', revision: 'B', url: 'https://x' });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'control', targetId: 'c1' });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'causalFactor', targetId: 'cf1' });
  const items = referenceItems(d, 'r1');
  assert.deepEqual(items.map((i) => i.key).sort(), ['causalFactor:cf1', 'control:c1', 'hazard:h1']);
  const h = items.find((i) => i.key === 'hazard:h1');
  assert.deepEqual([h.kind, h.platforms.sort(), h.open.view, h.open.id], ['hazard', ['Alpha', 'Bravo'], 'hazard', 'h1']);
  assert.deepEqual([items.find((i) => i.key === 'causalFactor:cf1').open.view, items.find((i) => i.key === 'causalFactor:cf1').open.id], ['hazard', 'h1'], 'a causal factor opens its hazard');
  d = unlinkReference(d, act, { referenceId: 'r1', targetKind: 'control', targetId: 'c1' });
  assert.ok(!referenceItems(d, 'r1').some((i) => i.key === 'control:c1'));
});

test('progress for a transfer counts the recipient and ticked non-empty groups; for an update the draft and ticked items', () => {
  let d = wf(seed(), 't1', { type: 'transferOwner', platformId: 'p1', toOwnerId: null, fromOwnerId: null, reviewed: null });
  const nonEmpty = transferGroups(d, 'p1', '2026-09-28', 't1').filter((g) => g.items.length).length;
  assert.deepEqual([workflowProgress(d, d.records.workflow.t1).done, workflowProgress(d, d.records.workflow.t1).total], [0, nonEmpty + 1]);
  d = createReference(d, act, { id: 'r1', title: 'Manual', revision: 'B', url: 'https://x' });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' });
  d = wf(d, 'u1', { type: 'referenceUpdate', platformId: null, referenceId: 'r1', revision: '', file: null, url: null, path: null });
  assert.deepEqual([workflowProgress(d, d.records.workflow.u1).done, workflowProgress(d, d.records.workflow.u1).total], [0, 2]);
  assert.equal(openReferenceUpdate(d, 'r1')?.id, 'u1');
});

test('rules: a reference update needs a live reference; one open transfer per platform and one open update per reference', () => {
  let d = createReference(seed(), act, { id: 'r1', title: 'Manual', revision: 'B', url: 'https://x' });
  d = wf(d, 'u1', { type: 'referenceUpdate', platformId: null, referenceId: 'r1', revision: '', file: null, url: null, path: null });
  assert.deepEqual(checkRules(d), [], 'no platform needed');
  assert.ok(checkRules(put(d, 'reference', { ...d.records.reference.r1, status: 'deleted' })).some((v) => v.rule === 'workflow-subject-not-live'));
  const two = wf(d, 'u2', { type: 'referenceUpdate', platformId: null, referenceId: 'r1', revision: '', file: null, url: null, path: null });
  assert.ok(checkRules(two).some((v) => v.rule === 'two-open-updates'));
  let t = wf(seed(), 't1', { type: 'transferOwner', platformId: 'p1', toOwnerId: null, fromOwnerId: null, reviewed: null });
  t = wf(t, 't2', { type: 'transferOwner', platformId: 'p1', toOwnerId: null, fromOwnerId: null, reviewed: null });
  assert.ok(checkRules(t).some((v) => v.rule === 'two-open-transfers'));
});
```

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/core/transfer-reference-queries.test.js`
Expected: FAIL (`transferGroups` is not exported).

- [ ] **Step 3: Implement.**

`src/core/workflows.js`:
- Set `ready: true` on the `transferOwner` and `referenceUpdate` entries of `WORKFLOW_TYPES`.
- Import `openItems, waitingChanges, scheduleOf?` (check: `scheduleOf` lives in `./schedule.js`; import it from there), `referenceTargets`, `targetPlatforms`, and `day`-free helpers. Dates are kept as ISO text here; the screen formats them.

```js
/** A transfer's responsibility groups: their keys and titles, in order. */
export const TRANSFER_GROUPS = Object.freeze([
  ['acks', 'Changes waiting acknowledgement'], ['review', 'Review schedule'], ['workflows', 'Workflows on this platform'],
  ['awaiting', 'Controls awaiting a decision'], ['toImplement', 'Controls to implement'], ['controlGaps', 'Controls incomplete'],
  ['hazardGaps', 'Hazards unrated, unjustified or SFARP incomplete'],
]);

/** The open transfer of a platform, if any. @param {Data} data @param {string} platformId */
export function openTransfer(data, platformId) {
  return live(data, 'workflow').find((w) => w.type === 'transferOwner' && w.platformId === platformId && w.state === 'open') ?? null;
}

/** The open update of a reference, if any. @param {Data} data @param {string} referenceId */
export function openReferenceUpdate(data, referenceId) {
  return live(data, 'workflow').find((w) => w.type === 'referenceUpdate' && w.referenceId === referenceId && w.state === 'open') ?? null;
}

/**
 * What the owner of a platform answers for, as a transfer lists it: one group per kind, each with
 * its items (what they say, and where to see them).
 * @param {Data} data @param {string} platformId @param {string} today @param {string | null} [selfId] the transfer itself, left out of the platform's workflows
 */
export function transferGroups(data, platformId, today, selfId = null) {
  const items = openItems(data, today, null);
  const here = (/** @type {any[]} */ xs) => xs.filter((x) => x.platform.id === platformId);
  const s = scheduleOf(data, platformId, today);
  /** @type {Record<string, { text: string, view?: string, id?: string, tab?: string }[]>} */
  const by = {
    acks: here(items.acks).map((x) => ({ text: x.entry.action, view: 'platform', id: platformId, tab: 'history' })),
    review: [{ text: s.due ? `Next review ${s.due}${s.state === 'overdue' ? ' (overdue)' : s.state === 'dueSoon' ? ' (due soon)' : ''}${s.moved ? `, moved from ${s.seen}` : ''}` : 'No review schedule', view: 'platformReview', id: platformId }],
    workflows: live(data, 'workflow').filter((w) => w.platformId === platformId && w.state === 'open' && w.id !== selfId)
      .map((w) => ({ text: `${workflowLabel(w)} ${typeName(w.type)}`, view: 'workflow', id: w.id })),
    awaiting: here(items.awaiting).map((x) => ({ text: `${controlLabel(x.control)} ${x.control.title} on ${hazardLabel(x.hazard)} ${x.hazard.title}`, view: 'control', id: x.control.id, tab: `p:${platformId}` })),
    toImplement: here(items.toImplement).map((x) => ({ text: `${controlLabel(x.control)} ${x.control.title} on ${hazardLabel(x.hazard)} ${x.hazard.title}`, view: 'control', id: x.control.id, tab: `p:${platformId}` })),
    controlGaps: here(items.controlGaps ?? []).map((x) => ({ text: `${controlLabel(x.control)} ${x.control.title}: no ${x.missing.join(', ')}`, view: 'control', id: x.control.id, tab: `p:${platformId}` })),
    hazardGaps: [...here(items.unrated), ...here(items.unjustified ?? []), ...here(items.sfarpGaps ?? [])]
      .map((x) => ({ text: `${hazardLabel(x.hazard)} ${x.hazard.title}: ${x.missing.join(', ')}`, view: 'hazard', id: x.hazard.id, tab: `p:${platformId}` })),
  };
  return TRANSFER_GROUPS.map(([key, title]) => ({ key, title, items: by[key] }));
}

/** Where each kind of linked record is opened: its own page, or the page that holds it. */
const OPEN_AT = Object.freeze({
  hazard: (/** @type {any} */ r) => ({ view: 'hazard', id: r.id }),
  control: (/** @type {any} */ r) => ({ view: 'control', id: r.id }),
  platform: (/** @type {any} */ r) => ({ view: 'platform', id: r.id }),
  consequence: (/** @type {any} */ r) => ({ view: 'hazard', id: r.hazardId }),
  hazardPhase: (/** @type {any} */ r) => ({ view: 'hazard', id: r.hazardId }),
  causalFactor: (/** @type {any} */ r) => ({ view: 'hazard', id: r.hazardId, ...(r.platformId ? { tab: `p:${r.platformId}` } : {}) }),
  failureMode: (/** @type {any} */ r) => ({ view: 'hazard', id: r.hazardId, tab: `p:${r.platformId}` }),
  systemElement: (/** @type {any} */ r) => ({ view: 'hazard', id: r.hazardId, tab: `p:${r.platformId}` }),
  affectedGroup: (/** @type {any} */ r) => ({ view: 'hazard', id: r.hazardId, tab: `p:${r.platformId}` }),
});

/**
 * What a reference informs, as an update lists it: each live link to a live record, with the
 * platforms it reaches and where to open it.
 * @param {Data} data @param {string} referenceId
 */
export function referenceItems(data, referenceId) {
  return referenceTargets(data, referenceId).map(({ link, target }) => {
    const kind = link.targetKind;
    const platforms = targetPlatforms(data, kind, target.id).map((pid) => get(data, 'platform', pid)?.name ?? '').filter(Boolean);
    return { key: `${kind}:${target.id}`, kind, label: recordName(kind, target, data), platforms, open: OPEN_AT[/** @type {keyof typeof OPEN_AT} */ (kind)](target) };
  });
}
```

Check each import:
- `referenceTargets` (`queries.js:581`) returns `{ link, target, hazard }`.
- `targetPlatforms` (`queries.js:71`): if it isn't exported, export it.
- `recordName` lives in `src/ui/names.js` (UI), so it must not be imported into core. Write a small core label instead:

```js
/** A linked record as a person reads it. @param {Data} data @param {string} kind @param {any} r */
function linkedLabel(data, kind, r) {
  if (kind === 'hazard') return `${hazardLabel(r)} ${r.title}`;
  if (kind === 'control') return `${controlLabel(r)} ${r.title}`;
  if (kind === 'platform') return r.name;
  if (kind === 'hazardPhase') return get(data, 'phase', r.phaseId)?.name ?? 'Lifecycle phase';
  return String(r.text ?? '');
}
```

and use `label: linkedLabel(data, kind, target)`.

In `workflowProgress`, after the onboarding branch:

```js
  if (wf.type === 'transferOwner') {
    const groups = transferGroups(data, wf.platformId, String(wf.updatedAt).slice(0, 10), wf.id).filter((g) => g.items.length);
    const done = Number(Boolean(wf.toOwnerId)) + groups.filter((g) => stepOf(data, wf.id, '-', `group:${g.key}`)?.checked).length;
    return { perHazard: new Map(), done, total: groups.length + 1 };
  }
  if (wf.type === 'referenceUpdate') {
    const items = referenceItems(data, wf.referenceId);
    const drafted = Boolean(String(wf.revision ?? '').trim() && (wf.file || String(wf.url ?? '').trim() || String(wf.path ?? '').trim()));
    const done = Number(drafted) + items.filter((i) => stepOf(data, wf.id, i.key, 'item')?.checked).length;
    return { perHazard: new Map(), done, total: items.length + 1 };
  }
```

A note on the transfer progress date: `workflowProgress` has no `today`, so it uses the workflow's last update date for the review-due wording only. Group membership does not depend on the date, except overdue/dueSoon, which only change wording in `review`, a group that always has exactly one item. So counts are stable.

`stepOf` builds the id as `ws:${w}:${h}:${c}`, which works for `'-'` and `'kind:id'` keys unchanged.

`src/core/rules.js`: replace the open-workflow loop with:

```js
  // An open workflow needs its subject live; a platform has at most one open review, onboarding
  // and transfer, and a reference one open update.
  /** @type {Map<string, any>} */
  const openOn = new Map();
  const TWO = { platformReview: ['two-open-reviews', 'reviews'], platformOnboarding: ['two-open-onboardings', 'onboardings'], transferOwner: ['two-open-transfers', 'transfers'], referenceUpdate: ['two-open-updates', 'updates'] };
  for (const w of live(data, 'workflow')) {
    if (w.state !== 'open') continue;
    const onReference = w.type === 'referenceUpdate';
    const subject = onReference ? get(data, 'reference', w.referenceId) : get(data, 'platform', w.platformId);
    if (!subject || subject.status !== 'live' || (onReference && subject.archived)) {
      out.push(onReference
        ? { rule: 'workflow-subject-not-live', message: 'A reference update is in progress on a reference that is not live.', records: [{ kind: 'workflow', id: w.id }, { kind: 'reference', id: w.referenceId }] }
        : { rule: 'review-on-platform-not-live', message: 'A workflow is in progress on a platform that is not live.', records: [{ kind: 'workflow', id: w.id }, { kind: 'platform', id: w.platformId }] });
    }
    const key = `${w.type}:${onReference ? w.referenceId : w.platformId}`;
    const first = openOn.get(key);
    const [rule, word] = TWO[/** @type {keyof typeof TWO} */ (w.type)] ?? ['two-open-workflows', 'workflows'];
    if (first) out.push({ rule, message: `Two ${word} are in progress on the same ${onReference ? 'reference' : 'platform'}.`, records: [{ kind: 'workflow', id: first.id }, { kind: 'workflow', id: w.id }] });
    else openOn.set(key, w);
  }
```

Keep the existing rule names `two-open-reviews` and `two-open-onboardings` (tests use them). `review-on-platform-not-live` is kept for platform subjects.

In `src/ui/screens/workflows.js` `workflowSubject`: `wf.type === 'referenceUpdate' ? (get(data, 'reference', wf.referenceId)?.title ?? 'A deleted reference') : …`.

- [ ] **Step 4: Run the tests.**

Run: `node --test test/core/transfer-reference-queries.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS. If the workflows-tile test asserts the four "Coming soon" names, update it: only New Tech Data is still coming soon.

- [ ] **Step 5: Commit.**

```bash
git add src/core/workflows.js src/core/rules.js src/core/queries.js src/ui/screens/workflows.js test/core/transfer-reference-queries.test.js
git commit -m "Transfer and reference update: what a transfer lists, what a reference informs, their progress, and one open at a time on a live subject

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Add any updated tests.)

---

### Task 2: Transfer ops, and the recipient's urgent item

**Files:**
- Modify: `src/core/ops/workflows.js`, `src/core/queries.js` (`openItems.transfers`, `attentionItems`), `src/core/acks.js` (NOT_ACKNOWLEDGED)
- Test: `test/core/ops/transfer.test.js` (new). Add the helper `beginTransfer` to `test/helpers.js`.

**Interfaces:**
- Produces:
  - `setTransferRecipient(data, act, { workflowId, toOwnerId })`
  - `markTransferReviewed(data, act, { workflowId })`
  - `startWorkflow` for `transferOwner`
  - `completeWorkflow` for a transfer
  - `openItems(...).transfers: { workflow, platform, from }[]`
  - attention item type `'transfer'`

- [ ] **Step 1: Write the failing test.**

```js
// test/core/ops/transfer.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { entries } from '../../../src/core/history.js';
import { mergeData } from '../../../src/core/merge.js';
import { startWorkflow, setTransferRecipient, setStep, completeWorkflow, markTransferReviewed, takeOverWorkflow } from '../../../src/core/ops/workflows.js';
import { transferGroups } from '../../../src/core/workflows.js';
import { openItems, attentionItems } from '../../../src/core/queries.js';
import { act, later, seed, scheduleFixed, beginPlatformReview, beginOnboarding } from '../../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const today = '2026-09-28';
/** p1 Alpha (owner u1), scheduled, with Ada’s review w1 open; transfer t1 started by u1. */
function started() {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  d = beginPlatformReview(d, act, { id: 'w1', platformId: 'p1' });
  return startWorkflow(d, act, { id: 't1', type: 'transferOwner', platformId: 'p1' });
}
const tickAll = (d) => {
  for (const g of transferGroups(d, 'p1', today, 't1').filter((x) => x.items.length)) d = setStep(d, act, { workflowId: 't1', hazardId: '-', check: `group:${g.key}`, checked: true, note: g.key === 'review' ? 'Due end of October' : '' });
  return d;
};

test('a transfer starts on a live, onboarded platform, one at a time', () => {
  const d = started();
  assert.deepEqual([d.records.workflow.t1.type, d.records.workflow.t1.toOwnerId, d.records.workflow.t1.reviewed], ['transferOwner', null, null]);
  assert.throws(() => startWorkflow(d, act, { type: 'transferOwner', platformId: 'p1' }), code('transfer.open'));
  const o = beginOnboarding(seed(), act, { id: 'o1', platformId: 'p9', name: 'Gamma', ownerId: 'u1' });
  assert.throws(() => startWorkflow(o, act, { type: 'transferOwner', platformId: 'p9' }), code('transfer.onboarding'));
});

test('the recipient is anyone but the current owner; groups are ticked like checks; confirm is strict', () => {
  let d = started();
  assert.throws(() => setTransferRecipient(d, act, { workflowId: 't1', toOwnerId: 'u1' }), code('transfer.same'));
  assert.throws(() => completeWorkflow(d, act, { workflowId: 't1' }), code('workflow.unmet'));
  d = setTransferRecipient(d, act, { workflowId: 't1', toOwnerId: 'u2' });
  assert.throws(() => completeWorkflow(d, act, { workflowId: 't1' }), code('workflow.unmet'), 'groups not ticked');
  assert.throws(() => setStep(d, act, { workflowId: 't1', hazardId: '-', check: 'group:nonsense', checked: true }), code('workflow.check'));
  d = tickAll(d);
  assert.doesNotThrow(() => completeWorkflow(d, act, { workflowId: 't1' }));
});

test('confirming changes the owner and hands over the old owner’s open workflows on the platform, not other people’s', () => {
  let d = started();
  d = setTransferRecipient(d, act, { workflowId: 't1', toOwnerId: 'u2' });
  d = startWorkflow(d, { by: 'u3', at: act.at }, { id: 'x1', type: 'platformReview', platformId: 'p2' });
  d = tickAll(d);
  d = completeWorkflow(d, act, { workflowId: 't1' });
  assert.equal(d.records.platform.p1.ownerId, 'u2');
  assert.equal(d.records.workflow.w1.ownerId, 'u2', 'Ada’s open review on Alpha goes with it');
  assert.equal(d.records.workflow.x1.ownerId, 'u3', 'another platform’s, another person’s: untouched');
  assert.deepEqual([d.records.workflow.t1.state, d.records.workflow.t1.fromOwnerId], ['completed', 'u1']);
  assert.equal(entries(d).at(-1).action, 'Transfer platform owner');
});

test('a review owned by someone else on the platform stays theirs', () => {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  d = beginPlatformReview(d, later, { id: 'w1', platformId: 'p1' });
  d = startWorkflow(d, act, { id: 't1', type: 'transferOwner', platformId: 'p1' });
  d = setTransferRecipient(d, act, { workflowId: 't1', toOwnerId: 'u3' });
  d = completeWorkflow(tickAll(d), act, { workflowId: 't1' });
  assert.equal(d.records.workflow.w1.ownerId, 'u2');
});

test('the recipient gets an urgent item until they mark the transfer reviewed; only they can', () => {
  let d = setTransferRecipient(started(), act, { workflowId: 't1', toOwnerId: 'u2' });
  d = completeWorkflow(tickAll(d), act, { workflowId: 't1' });
  const items = openItems(d, today, 'u2');
  assert.deepEqual(items.transfers.map((t) => [t.workflow.id, t.platform.id, t.from]), [['t1', 'p1', 'u1']]);
  assert.equal(attentionItems(items)[0].type, 'transfer', 'first, before everything else');
  assert.deepEqual(openItems(d, today, 'u1').transfers, []);
  assert.throws(() => markTransferReviewed(d, act, { workflowId: 't1' }), code('transfer.recipient'));
  d = markTransferReviewed(d, later, { workflowId: 't1' });
  assert.deepEqual(d.records.workflow.t1.reviewed, { by: 'u2', at: later.at });
  assert.deepEqual(openItems(d, today, 'u2').transfers, []);
});

test('two people starting a transfer of the same platform: mine is kept', () => {
  const base = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  const mine = startWorkflow(base, act, { id: 'mine', type: 'transferOwner', platformId: 'p1' });
  const theirs = startWorkflow(base, later, { id: 'theirs', type: 'transferOwner', platformId: 'p1' });
  const { data } = mergeData(base, mine, theirs, { by: 'u1', at: '2026-09-28T13:00:00+10:00' });
  assert.equal(data.records.workflow.mine.state, 'open');
  assert.equal(data.records.workflow.theirs.status, 'deleted');
});
```

`test/helpers.js` needs nothing new for this file.

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/core/ops/transfer.test.js`
Expected: FAIL (`setTransferRecipient` is not exported).

- [ ] **Step 3: Implement.**

In `src/core/ops/workflows.js`, import `TRANSFER_GROUPS, transferGroups, openTransfer, referenceItems, openReferenceUpdate` from `../workflows.js`, and `aestDate` from `../time.js`.

`startWorkflow`: before the `platformOnboarding` branch, insert:

```js
  if (type === 'referenceUpdate') return startReferenceUpdate(data, act, id, platformId);
```

(Task 3 defines `startReferenceUpdate`. Until then, add a stub that throws `workflow.type`.) Also insert:

```js
  if (type === 'transferOwner') {
    const p = need(data, 'platform', platformId);
    if (p.status !== 'live') throw new PivotError('platform.retired', `${p.name} is retired.`);
    if (onboardingOf(data, platformId)) throw new PivotError('transfer.onboarding', `Finish onboarding ${p.name} first.`);
    if (openTransfer(data, platformId)) throw new PivotError('transfer.open', `${p.name} is being transferred already.`);
    const rec = { ...opening(act, id, type, platformId, null), toOwnerId: null, fromOwnerId: null, reviewed: null };
    return commit(data, act, 'Start workflow', [{ kind: 'workflow', rec }]);
  }
```

The existing `const p = need(...)` line moves below these branches. For `referenceUpdate`, `platformId` carries the reference id from the controller; Task 3 renames that argument.

New ops:

```js
/** Who a transfer hands the platform to: anyone but its owner now. @param {Data} data @param {Act} act @param {{ workflowId: string, toOwnerId: string }} args */
export function setTransferRecipient(data, act, { workflowId, toOwnerId }) {
  const wf = needOpen(data, act, workflowId);
  if (wf.type !== 'transferOwner') throw new PivotError('workflow.type', 'That is not a transfer.');
  const p = need(data, 'platform', wf.platformId);
  const to = String(toOwnerId ?? '').trim() || null;
  if (to === p.ownerId) throw new PivotError('transfer.same', `${p.name} is theirs already.`);
  return commit(data, act, 'Choose new owner', [{ kind: 'workflow', rec: changed(wf, act, { toOwnerId: to }) }]);
}

/** The recipient has looked over what they took on. @param {Data} data @param {Act} act @param {{ workflowId: string }} args */
export function markTransferReviewed(data, act, { workflowId }) {
  const wf = need(data, 'workflow', workflowId);
  if (wf.type !== 'transferOwner' || wf.state !== 'completed') throw new PivotError('transfer.not-done', 'Only a completed transfer can be marked reviewed.');
  if (wf.toOwnerId !== act.by) throw new PivotError('transfer.recipient', 'Only the new owner can mark the transfer reviewed.');
  if (wf.reviewed) return data;
  return commit(data, act, 'Review transfer', [{ kind: 'workflow', rec: changed(wf, act, { reviewed: { by: act.by, at: act.at } }) }]);
}
```

`setStep`: replace the `allowed` guard and `needHazard` call with a type switch:

```js
  if (wf.type === 'transferOwner') {
    if (hazardId !== '-' || !TRANSFER_GROUPS.some(([k]) => `group:${k}` === check)) throw new PivotError('workflow.check', 'That is not one of this transfer’s groups.');
  } else if (wf.type === 'referenceUpdate') {
    if (check !== 'item' || !referenceItems(data, wf.referenceId).some((i) => i.key === hazardId)) throw new PivotError('workflow.check', 'That is not one of the items this reference informs.');
  } else {
    const allowed = wf.type === 'platformOnboarding' ? NONE_CHECKS : CHECKS;
    if (!allowed.includes(check)) throw new PivotError('workflow.check', 'That is not one of this workflow’s checks.');
    needHazard(data, wf, hazardId);
  }
```

`completeWorkflow`, after `needOpen`:

```js
  if (wf.type === 'transferOwner') {
    const p = need(data, 'platform', wf.platformId);
    const today = aestDate(act.at);
    const groups = transferGroups(data, p.id, today, wf.id).filter((g) => g.items.length);
    const left = groups.filter((g) => !stepOf(data, wf.id, '-', `group:${g.key}`)?.checked).length + Number(!wf.toOwnerId);
    if (left) throw new PivotError('workflow.unmet', `${left} thing${left === 1 ? ' is' : 's are'} still needed.`);
    const from = p.ownerId;
    const handed = live(data, 'workflow').filter((w) => w.platformId === p.id && w.state === 'open' && w.id !== wf.id && w.ownerId === from)
      .map((w) => ({ kind: 'workflow', rec: changed(w, act, { ownerId: wf.toOwnerId }) }));
    return commit(data, act, 'Transfer platform owner', [
      { kind: 'platform', rec: changed(p, act, { ownerId: wf.toOwnerId }) },
      ...handed,
      { kind: 'workflow', rec: changed(wf, act, { state: 'completed', endedBy: act.by, endedAt: act.at, fromOwnerId: from }) },
    ]);
  }
```

The platform record's `ownerId` field diff stays the one `acks.ownerChanges` reads; the action name is not used by acks. Check `acks.ownerChanges` reads field diffs on `platform` items whatever the action. If it filters on `'Change platform owner'`, keep that action name here instead and put "Transfer platform owner" in the test.

Import `stepOf` and `live` if they are not imported already.

`src/core/acks.js`: add `'Review transfer'` and `'Choose new owner'` to `NOT_ACKNOWLEDGED`. (Workflow records reach no platform, so these never wait anyway. This is belt and braces.)

`src/core/queries.js` `openItems`:
- Add `transfers: []` to `out`, plus its type `transfers: { workflow: Rec, platform: Rec, from: string }[]`.
- After the platform loop:

```js
  for (const w of live(data, 'workflow')) {
    if (w.type !== 'transferOwner' || w.state !== 'completed' || w.reviewed || (ownerId != null && w.toOwnerId !== ownerId)) continue;
    const platform = get(data, 'platform', w.platformId);
    if (platform && platform.status !== 'deleted') out.transfers.push({ workflow: w, platform, from: w.fromOwnerId });
  }
```

`attentionItems`: put `...(items.transfers ?? []).map((x) => ({ type: 'transfer', ...x })),` first.

- [ ] **Step 4: Run the tests.**

Run: `node --test test/core/ops/transfer.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS. Fix anything in `home.js` that destructures `CHIP[item.type]` for the new type: Task 7 adds the row. For now, add `transfer: ['Transfer', 'chip-review']` to `CHIP`, and a placeholder branch in `whereToAct`, `if (type === 'transfer') return { view: 'workflow', id: item.workflow.id };`, so Home doesn't break. Add `'transfer'` to the JSDoc type union of `whereToAct`.

- [ ] **Step 5: Commit.**

```bash
git add src/core/ops/workflows.js src/core/queries.js src/core/acks.js src/ui/screens/home.js test/core/ops/transfer.test.js
git commit -m "Transfer ops: choose a new owner, tick each group, confirm to change the owner and hand over the old owner's open workflows; the new owner gets an urgent item until they mark it reviewed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Reference update ops

**Files:**
- Modify: `src/core/ops/workflows.js`
- Test: `test/core/ops/reference-update.test.js` (new)

**Interfaces:**
- Produces:
  - `startWorkflow(data, act, { id?, type: 'referenceUpdate', referenceId })`. The arg is renamed: `startWorkflow` destructures `referenceId` too.
  - `setReferenceDraft(data, act, { workflowId, revision?, url?, path?, file? })`
  - `completeWorkflow` for an update
  - `startWorkflow` throws `update.open`, `reference.archived` and `not-found`.

- [ ] **Step 1: Write the failing test.**

```js
// test/core/ops/reference-update.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { entries } from '../../../src/core/history.js';
import { createReference, linkReference, unlinkReference, setReferenceArchived } from '../../../src/core/ops/references.js';
import { startWorkflow, setReferenceDraft, setStep, completeWorkflow, cancelWorkflow } from '../../../src/core/ops/workflows.js';
import { act, later, seed } from '../../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const oldFile = { name: 'manual-B.pdf', stored: 'files/references/r1/1-manual-B.pdf', size: 10, type: 'application/pdf', addedBy: 'u1', addedAt: act.at };
const newFile = { name: 'manual-C.pdf', stored: 'files/references/r1/2-manual-C.pdf', size: 12, type: 'application/pdf', addedBy: 'u1', addedAt: act.at };
/** Reference r1 (rev B, a file and a link) informing h1 and c1; update u1 started. */
function started() {
  let d = createReference(seed(), act, { id: 'r1', title: 'Range manual', revision: 'B', url: 'https://old', file: oldFile });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'control', targetId: 'c1' });
  return startWorkflow(d, act, { id: 'u1', type: 'referenceUpdate', referenceId: 'r1' });
}
const tick = (d, key) => setStep(d, act, { workflowId: 'u1', hazardId: key, check: 'item', checked: true });

test('an update starts on a live, unarchived reference, one at a time', () => {
  const d = started();
  const w = d.records.workflow.u1;
  assert.deepEqual([w.type, w.referenceId, w.platformId, w.revision, w.file, w.url, w.path], ['referenceUpdate', 'r1', null, '', null, null, null]);
  assert.throws(() => startWorkflow(d, act, { type: 'referenceUpdate', referenceId: 'r1' }), code('update.open'));
  const archived = setReferenceArchived(createReference(seed(), act, { id: 'r2', title: 'Old', url: 'x' }), act, { id: 'r2', archived: true });
  assert.throws(() => startWorkflow(archived, act, { type: 'referenceUpdate', referenceId: 'r2' }), code('reference.archived'));
});

test('confirm needs a new revision, a file, link or path given here, and every linked item ticked', () => {
  let d = started();
  assert.throws(() => completeWorkflow(d, act, { workflowId: 'u1' }), code('workflow.unmet'));
  d = setReferenceDraft(d, act, { workflowId: 'u1', revision: 'B' });
  d = tick(tick(d, 'hazard:h1'), 'control:c1');
  assert.throws(() => completeWorkflow(d, act, { workflowId: 'u1' }), (e) => e.code === 'workflow.unmet', 'B is the current revision, and nothing new given');
  d = setReferenceDraft(d, act, { workflowId: 'u1', revision: ' C ', url: 'https://new' });
  assert.deepEqual([d.records.workflow.u1.revision, d.records.workflow.u1.url], ['C', 'https://new']);
  assert.doesNotThrow(() => completeWorkflow(d, act, { workflowId: 'u1' }));
});

test('an item linked mid-way must be ticked; one unlinked after its tick no longer counts', () => {
  let d = setReferenceDraft(started(), act, { workflowId: 'u1', revision: 'C', url: 'https://new' });
  d = tick(tick(d, 'hazard:h1'), 'control:c1');
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'platform', targetId: 'p1' });
  assert.throws(() => completeWorkflow(d, act, { workflowId: 'u1' }), code('workflow.unmet'));
  d = unlinkReference(d, act, { referenceId: 'r1', targetKind: 'platform', targetId: 'p1' });
  d = unlinkReference(d, act, { referenceId: 'r1', targetKind: 'control', targetId: 'c1' });
  assert.doesNotThrow(() => completeWorkflow(d, act, { workflowId: 'u1' }));
});

test('nothing reaches the reference until confirm: then the revision, file (old one kept), link and path', () => {
  let d = setReferenceDraft(started(), act, { workflowId: 'u1', revision: 'C', file: newFile, path: '\\\\share\\manual-C.pdf' });
  assert.deepEqual([d.records.reference.r1.revision, d.records.reference.r1.file.name], ['B', 'manual-B.pdf'], 'unchanged while drafting');
  d = completeWorkflow(tick(tick(d, 'hazard:h1'), 'control:c1'), act, { workflowId: 'u1' });
  const r = d.records.reference.r1;
  assert.deepEqual([r.revision, r.file.name, r.pastFiles.map((f) => f.name), r.url, r.path], ['C', 'manual-C.pdf', ['manual-B.pdf'], 'https://old', '\\\\share\\manual-C.pdf']);
  assert.equal(entries(d).at(-1).action, 'Update reference to rev C');
});

test('cancelling leaves the reference untouched, even after a file was given', () => {
  let d = setReferenceDraft(started(), act, { workflowId: 'u1', revision: 'C', file: newFile });
  d = cancelWorkflow(d, act, { workflowId: 'u1' });
  assert.deepEqual([d.records.reference.r1.revision, d.records.reference.r1.file.name, d.records.reference.r1.pastFiles], ['B', 'manual-B.pdf', []]);
});

test('only the owner drafts the update', () => {
  assert.throws(() => setReferenceDraft(started(), later, { workflowId: 'u1', revision: 'C' }), code('workflow.owner'));
});
```

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/core/ops/reference-update.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.**

`startWorkflow` destructures `{ id = newId(), type, platformId, referenceId }`. Replace the Task 2 stub with:

```js
  if (type === 'referenceUpdate') {
    const r = need(data, 'reference', /** @type {string} */ (referenceId));
    if (r.status !== 'live') throw new PivotError('reference.retired', `${r.title} is retired.`);
    if (r.archived) throw new PivotError('reference.archived', `${r.title} is archived.`);
    if (openReferenceUpdate(data, r.id)) throw new PivotError('update.open', `${r.title} is being updated already.`);
    const rec = { ...opening(act, id, type, /** @type {any} */ (null), null), referenceId: r.id, revision: '', file: null, url: null, path: null };
    return commit(data, act, 'Start workflow', [{ kind: 'workflow', rec }]);
  }
```

Widen `opening`'s `platformId` JSDoc to `string | null`.

```js
/**
 * What a reference update will give the reference: its revision, and a new file, link or path. Left
 * out, a field keeps its draft value; given blank, a link or path is not to change.
 * @param {Data} data @param {Act} act
 * @param {{ workflowId: string, revision?: string, url?: string, path?: string, file?: any }} args
 */
export function setReferenceDraft(data, act, { workflowId, revision, url, path, file }) {
  const wf = needOpen(data, act, workflowId);
  if (wf.type !== 'referenceUpdate') throw new PivotError('workflow.type', 'That is not a reference update.');
  /** @type {Record<string, any>} */
  const fields = {};
  if (revision !== undefined) fields.revision = String(revision ?? '').trim();
  if (url !== undefined) fields.url = String(url ?? '').trim() || null;
  if (path !== undefined) fields.path = String(path ?? '').trim() || null;
  if (file !== undefined) {
    if (file && !file.stored) throw new PivotError('reference.file', 'Choose a file to store.');
    fields.file = file || null;
  }
  return commit(data, act, 'Draft reference update', [{ kind: 'workflow', rec: changed(wf, act, fields) }]);
}
```

`completeWorkflow`, after the transfer branch:

```js
  if (wf.type === 'referenceUpdate') {
    const r = need(data, 'reference', wf.referenceId);
    const unmet = [];
    if (!wf.revision) unmet.push('a new revision');
    else if (wf.revision === String(r.revision ?? '').trim()) unmet.push('a revision different from the current one');
    if (!wf.file && !wf.url && !wf.path) unmet.push('a new file, link or path');
    const items = referenceItems(data, r.id);
    const left = items.filter((i) => !stepOf(data, wf.id, i.key, 'item')?.checked).length;
    if (left) unmet.push(`${left} item${left === 1 ? '' : 's'} to check`);
    if (unmet.length) throw new PivotError('workflow.unmet', `Still needed: ${unmet.join(', ')}.`);
    /** @type {Record<string, any>} */
    const fields = { revision: wf.revision };
    if (wf.file) { fields.file = wf.file; fields.pastFiles = r.file ? [r.file, ...(r.pastFiles ?? [])] : (r.pastFiles ?? []); }
    if (wf.url) fields.url = wf.url;
    if (wf.path) fields.path = wf.path;
    return commit(data, act, `Update reference to rev ${wf.revision}`, [
      { kind: 'reference', rec: changed(r, act, fields) },
      { kind: 'workflow', rec: changed(wf, act, { state: 'completed', endedBy: act.by, endedAt: act.at, before: String(r.revision ?? ''), covered: items.map((i) => i.key), coveredLabels: items.map((i) => i.label) }) },
    ]);
  }
```

Notes:
- `cancelRecs` / `cancelWorkflow` need nothing new: they never touch the reference.
- `workflowHazards` is not called for these types. Check `covered` isn't misread by `workflowHazards` for an ended update. It isn't called for them in any screen; Task 6's ended view reads `wf.covered` directly.

- [ ] **Step 4: Run the tests.**

Run: `node --test test/core/ops/reference-update.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/core/ops/workflows.js test/core/ops/reference-update.test.js
git commit -m "Reference update ops: draft a new revision with a file, link or path; tick every item the reference informs; confirm applies it all, keeping the old file; cancel changes nothing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Controller: starting, drafting, the file, and the "via" banner's stamping

**Files:**
- Modify: `src/ui/controller.js`
- Test: `test/ui/controller-transfer-reference.test.js` (new)

**Interfaces:**
- EDITS: `setTransferRecipient`, `setReferenceDraft`, `markTransferReviewed`.
- Handlers:
  - `startTransfer({ platformId })`: opens the open one or starts one
  - `startReferenceUpdate({ referenceId })`: the same
  - `uploadUpdateFile({ workflowId, file })`: stores the file, then `setReferenceDraft`
- `go` accepts `via`, which is kept on `view.via`.
- `act()` stamps `view.via` when that workflow is open and owned by the profile.

- [ ] **Step 1: Write the failing test.**

```js
// test/ui/controller-transfer-reference.test.js
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
  await c.dispatch({ type: 'createReference', id: 'r1', title: 'Manual', revision: 'B', url: 'https://old' });
  await c.dispatch({ type: 'linkReference', referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' });
  return c;
}

test('Update revision starts an update or opens the one under way', async () => {
  const c = await ready();
  await c.dispatch({ type: 'startReferenceUpdate', referenceId: 'r1' });
  const id = c.getState().view.id;
  assert.equal(W(c).records.workflow[id].type, 'referenceUpdate');
  await c.dispatch({ type: 'go', view: 'references' });
  await c.dispatch({ type: 'startReferenceUpdate', referenceId: 'r1' });
  assert.equal(c.getState().view.id, id);
});

test('an item opened from the update carries it: edits there are made through it, until leaving that page', async () => {
  const c = await ready();
  await c.dispatch({ type: 'startReferenceUpdate', referenceId: 'r1' });
  const id = c.getState().view.id;
  await c.dispatch({ type: 'go', view: 'hazard', id: 'h1', via: id });
  assert.equal(c.getState().view.via, id);
  await c.dispatch({ type: 'updateHazard', id: 'h1', title: 'Fire on the range' });
  assert.equal(entries(W(c)).at(-1).workflow, id);
  await c.dispatch({ type: 'go', view: 'hazards' });
  assert.equal(c.getState().view.via, undefined);
  await c.dispatch({ type: 'updateHazard', id: 'h1', title: 'Fire' });
  assert.ok(!('workflow' in entries(W(c)).at(-1)));
});
```

Read how `test/ui/controller-references.test.js` uploads a file (`uploadReferenceFile`) and add a third test with the same fake-file setup:
- dispatch `uploadUpdateFile({ workflowId: id, file })`
- assert that `W(c).records.workflow[id].file.name` is the file's name
- assert that `W(c).records.reference.r1.file` is unchanged (null).

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/ui/controller-transfer-reference.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** in `src/ui/controller.js`.

- EDITS: add `setTransferRecipient: workflows.setTransferRecipient, setReferenceDraft: workflows.setReferenceDraft, markTransferReviewed: workflows.markTransferReviewed,`.
- `go({ view, id, hazardId, platformId, tab, reviewId, via })`: put `...(via ? { via } : {})` into the new view object.
- `sameView` ignores `via`, which is fine.
- `act()`:

```js
  const act = () => {
    const by = /** @type {string} */ (state.profileId);
    const at = env.clock.now();
    const v = state.view;
    const wid = v?.name === 'workflow' ? v.id : v?.via;
    const wf = wid ? state.session?.working.records.workflow?.[wid] : null;
    return wf && wf.status === 'live' && wf.state === 'open' && wf.ownerId === by ? { by, at, workflowId: wf.id } : { by, at };
  };
```

- Handlers:

```js
    // Transfer owner: the platform's transfer under way, or a new one.
    async startTransfer({ platformId }) {
      const w = state.session ? openTransfer(state.session.working, platformId) : null;
      if (w) return handlers.go({ view: 'workflow', id: w.id });
      const id = newId();
      await applyEdit('startWorkflow', { id, type: 'transferOwner', platformId });
      await handlers.go({ view: 'workflow', id });
    },
    // Update revision: the reference's update under way, or a new one.
    async startReferenceUpdate({ referenceId }) {
      const w = state.session ? openReferenceUpdate(state.session.working, referenceId) : null;
      if (w) return handlers.go({ view: 'workflow', id: w.id });
      const id = newId();
      await applyEdit('startWorkflow', { id, type: 'referenceUpdate', referenceId });
      await handlers.go({ view: 'workflow', id });
    },
    // The new revision's file: copied into the folder now, given to the reference only when the update is confirmed.
    async uploadUpdateFile({ workflowId, file }) {
      const wf = state.session?.working.records.workflow[workflowId];
      const r = wf ? state.session?.working.records.reference[wf.referenceId] : null;
      if (!wf || !r) throw new PivotError('not-found', 'That update no longer exists.');
      const f = chosenFile(file);
      if (!f) throw new PivotError('reference.file', 'Choose a file to upload.');
      await applyEdit('setReferenceDraft', { workflowId, file: await storeFile(r.id, 2 + (r.file ? 1 : 0) + r.pastFiles.length, f) });
    },
```

- Import `openTransfer, openReferenceUpdate` from `../core/workflows.js`.
- `storeFile(referenceId, n, file)` exists; the `n` numbering only names the file in the folder. Using a number past the reference's own files avoids a clash with the next "Replace" upload.
- The upload is a file input in a form. Check how `mount.js` dispatches `uploadReferenceFile` (form submit vs change) and use the same mechanism, with `data-action="uploadUpdateFile"` and `data-workflow-id` in Task 6's markup.

- [ ] **Step 4: Run the tests.**

Run: `node --test test/ui/controller-transfer-reference.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/controller.js test/ui/controller-transfer-reference.test.js
git commit -m "Controller: Transfer owner and Update revision open the workflow under way or start one; an update's file is stored but not attached; pages opened from an update carry it, so edits there are made through it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The transfer page

**Files:**
- Create: `src/ui/screens/transfer.js`
- Modify: `src/ui/screens/workflow.js` (hand over the open and completed bodies)
- Test: `test/ui/screens-transfer.test.js` (new)

- [ ] **Step 1: Write the failing test.**

```js
// test/ui/screens-transfer.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowView } from '../../src/ui/screens/workflow.js';
import { startWorkflow, setTransferRecipient, setStep, completeWorkflow } from '../../src/core/ops/workflows.js';
import { transferGroups } from '../../src/core/workflows.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { state } from './screens-workflows.test.js';
import { seed, act, later, scheduleFixed } from '../helpers.js';

const on = (extra = {}) => ({ ...state, profiles: [...state.profiles, { id: 'u3', name: 'Lin', createdAt: '' }], view: { name: 'workflow', id: 't1', ...extra } });
function started() {
  const d = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  return assignNumbers(startWorkflow(d, act, { id: 't1', type: 'transferOwner', platformId: 'p1' }));
}
const done = () => {
  let d = setTransferRecipient(started(), act, { workflowId: 't1', toOwnerId: 'u2' });
  for (const g of transferGroups(d, 'p1', '2026-09-28', 't1').filter((x) => x.items.length)) d = setStep(d, act, { workflowId: 't1', hazardId: '-', check: `group:${g.key}`, checked: true, note: g.key === 'review' ? 'Due soon, warned Grace' : '' });
  return completeWorkflow(d, act, { workflowId: 't1' });
};

test('an open transfer: the new owner choice, a card per group with its count, items, note and tick; empty groups say None', () => {
  const out = workflowView(on(), started(), 't1').toString();
  assert.match(out, /<select name="toOwnerId"[^>]*required[^>]*><option value="" disabled selected>Select new owner…<\/option>/);
  assert.doesNotMatch(out, /<option value="u1"/, 'not the current owner');
  assert.match(out, /Controls awaiting a decision[\s\S]*?Sprinklers/);
  assert.match(out, /Changes waiting acknowledgement[\s\S]*?None/);
  assert.match(out, /data-check="group:review"/);
  assert.match(out, /Confirm transfer — \d+ still needed<\/button>/);
});

test('a completed transfer shows from and to, the ticks and notes; Mark as reviewed for the new owner only', () => {
  const d = done();
  const theirs = workflowView({ ...on(), profileId: 'u2' }, d, 't1').toString();
  assert.match(theirs, /Transferred from Ada to Grace/);
  assert.match(theirs, /Due soon, warned Grace/);
  assert.match(theirs, /data-action="markTransferReviewed"/);
  assert.doesNotMatch(workflowView(on(), d, 't1').toString(), /data-action="markTransferReviewed"/);
});
```

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/ui/screens-transfer.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.**

`src/ui/screens/workflow.js`:
- Open: `if (wf.type === 'transferOwner') return html`${head}${transferBody(state, data, wf, mine)}`;`, next to the onboarding hand-over.
- Ended: in `workflowView`, `if (wf.state !== 'open')`, return `html`<div class="head">${title}</div>${wf.type === 'transferOwner' ? transferEnded(state, data, wf) : endedBody(state, data, wf)}``.
- The Cancel confirm text for a transfer: "Cancel ${named(wf)}: nothing changes; it is kept in History as cancelled".

`src/ui/screens/transfer.js`:

```js
import { html, raw } from '../html.js';
import { dataAttrs, go, option } from './common.js';
import { get } from '../../core/data.js';
import { transferGroups, stepOf } from '../../core/workflows.js';
import { profileName, when } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** A group's items, each linking where it is seen. @param {any[]} items */
const itemList = (items) => html`<ul class="plain wf-items">${items.map((i) => html`<li>${i.view ? go(i.text, i.view, { ...(i.id ? { id: i.id } : {}), ...(i.tab ? { tab: i.tab } : {}) }) : i.text}</li>`)}</ul>`;

/** @param {any} state @param {Data} data @param {any} wf @param {boolean} mine */
export function transferBody(state, data, wf, mine) {
  const p = get(data, 'platform', wf.platformId);
  const groups = transferGroups(data, wf.platformId, state.today, wf.id);
  const dis = mine ? '' : raw(' disabled');
  const recipient = html`<section class="wf-check" aria-label="New owner"><h3 class="wf-check-h">New owner</h3>
    <p class="muted">${p?.name} is owned by ${profileName(state, p?.ownerId)}.</p>
    <select name="toOwnerId" aria-label="New owner" required${dis} ${dataAttrs({ change: 'setTransferRecipient', 'workflow-id': wf.id })}>
      <option value="" disabled${wf.toOwnerId ? '' : raw(' selected')}>Select new owner…</option>
      ${state.profiles.filter((/** @type {any} */ pr) => pr.id !== p?.ownerId).map((/** @type {any} */ pr) => option(pr.id, pr.name, wf.toOwnerId ?? ''))}</select></section>`;
  const cards = groups.map((g) => {
    const s = stepOf(data, wf.id, '-', `group:${g.key}`);
    const at = { change: 'setStep', 'workflow-id': wf.id, 'hazard-id': '-', check: `group:${g.key}` };
    return html`<section class="wf-check${!g.items.length || s?.checked ? ' done' : ''}" aria-label="${g.title}">
      <h3 class="wf-check-h">${g.title} <span class="count">${g.items.length}</span></h3>
      ${g.items.length ? html`<details class="wf-group"${g.items.length <= 5 ? raw(' open') : ''}><summary>${g.items.length} item${g.items.length === 1 ? '' : 's'}</summary>${itemList(g.items)}</details>
        <div class="wf-check-foot"><input class="grow" name="note" value="${s?.note ?? ''}" placeholder="Note (optional)…" aria-label="Note on ${g.title}"${dis} ${dataAttrs(at)}>
          <label class="wf-tick"><input type="checkbox" name="checked"${s?.checked ? raw(' checked') : ''}${dis} ${dataAttrs(at)}> Checked</label></div>`
        : html`<p class="muted">None.</p>`}</section>`;
  });
  const left = groups.filter((g) => g.items.length && !stepOf(data, wf.id, '-', `group:${g.key}`)?.checked).length + Number(!wf.toOwnerId);
  return html`<div class="wf-single">${recipient}${cards}
    <div class="actions"><button type="button" class="primary" ${dataAttrs({ action: 'completeWorkflow', 'workflow-id': wf.id })}${left || !mine ? raw(' disabled') : ''}>${left ? `Confirm transfer — ${left} still needed` : 'Confirm transfer'}</button></div></div>`;
}

/** A completed or cancelled transfer: who it went from and to, the groups as they were ticked, and the new owner's review. @param {any} state @param {Data} data @param {any} wf */
export function transferEnded(state, data, wf) {
  const steps = (/** @type {string} */ key) => stepOf(data, wf.id, '-', `group:${key}`);
  const title = (/** @type {string} */ key) => transferGroups(data, wf.platformId, state.today, wf.id).find((g) => g.key === key)?.title ?? key;
  const ticked = ['acks', 'review', 'workflows', 'awaiting', 'toImplement', 'controlGaps', 'hazardGaps'].map((k) => ({ k, s: steps(k) })).filter((x) => x.s);
  const status = wf.state === 'completed'
    ? html`<p class="doc-meta"><span class="tag wf-completed">Completed</span> Transferred from ${profileName(state, wf.fromOwnerId)} to ${profileName(state, wf.toOwnerId)} by ${profileName(state, wf.endedBy)}, ${when(wf.endedAt)}.</p>`
    : html`<p class="doc-meta"><span class="tag wf-cancelled">Cancelled</span> by ${profileName(state, wf.endedBy)}, ${when(wf.endedAt)}. Nothing changed.</p>`;
  const review = wf.state !== 'completed' ? ''
    : wf.reviewed ? html`<p>Reviewed by ${profileName(state, wf.reviewed.by)}, ${when(wf.reviewed.at)}.</p>`
      : wf.toOwnerId === state.profileId ? html`<div class="actions"><button type="button" class="primary" ${dataAttrs({ action: 'markTransferReviewed', 'workflow-id': wf.id })}>Mark as reviewed</button></div>`
        : html`<p class="muted">Waiting for ${profileName(state, wf.toOwnerId)} to review it.</p>`;
  return html`${status}<article class="doc"><table class="wf-grid"><thead><tr><th>Group</th><th>Checked</th><th>Note</th></tr></thead>
    <tbody>${ticked.map((x) => html`<tr><th scope="row">${title(x.k)}</th><td class="${x.s?.checked ? 'yes' : 'no'}">${x.s?.checked ? '✓' : ''}</td><td>${x.s?.note ?? ''}</td></tr>`)}</tbody></table>${review}</article>`;
}
```

- [ ] **Step 4: Run the tests.**

Run: `node --test test/ui/screens-transfer.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/screens/transfer.js src/ui/screens/workflow.js test/ui/screens-transfer.test.js
git commit -m "Transfer page: choose the new owner, a card per responsibility group with its items, a note and a tick; once confirmed, who it went from and to, and Mark as reviewed for the new owner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The reference update page

**Files:**
- Create: `src/ui/screens/reference-update.js`
- Modify: `src/ui/screens/workflow.js`
- Test: `test/ui/screens-reference-update.test.js` (new)

- [ ] **Step 1: Write the failing test.**

```js
// test/ui/screens-reference-update.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowView } from '../../src/ui/screens/workflow.js';
import { createReference, linkReference } from '../../src/core/ops/references.js';
import { startWorkflow, setReferenceDraft, setStep, completeWorkflow } from '../../src/core/ops/workflows.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { state } from './screens-workflows.test.js';
import { seed, act } from '../helpers.js';

const on = () => ({ ...state, view: { name: 'workflow', id: 'u1' } });
function started() {
  let d = createReference(seed(), act, { id: 'r1', title: 'Range manual', revision: 'B', url: 'https://old' });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' });
  return assignNumbers(startWorkflow(d, act, { id: 'u1', type: 'referenceUpdate', referenceId: 'r1' }));
}

test('an open update: current and new revision, file, link and path, and a row per item with its platforms, note, tick and Open', () => {
  const out = workflowView(on(), started(), 'u1').toString();
  assert.match(out, /Current revision[\s\S]*?B/);
  assert.match(out, /name="revision"[^>]*data-change="setReferenceDraft"/);
  assert.match(out, /name="url"[^>]*placeholder="https:\/\/old"/);
  assert.match(out, /data-action="uploadUpdateFile"/);
  assert.match(out, /HAZ-001 Fire[\s\S]*?Alpha, Bravo/);
  assert.match(out, /data-hazard-id="hazard:h1"/);
  assert.match(out, /data-view="hazard"[^>]*data-id="h1"[^>]*data-via="u1"|data-via="u1"[^>]*data-view="hazard"/);
  assert.match(out, /Confirm update — /);
});

test('a completed update shows the revision change and the items as they were ticked', () => {
  let d = setReferenceDraft(started(), act, { workflowId: 'u1', revision: 'C', url: 'https://new' });
  d = setStep(d, act, { workflowId: 'u1', hazardId: 'hazard:h1', check: 'item', checked: true, note: 'Still right' });
  d = completeWorkflow(d, act, { workflowId: 'u1' });
  const out = workflowView(on(), d, 'u1').toString();
  assert.match(out, /Revision B → C/);
  assert.match(out, /Still right/);
});
```

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/ui/screens-reference-update.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.**

`workflow.js`:
- Open: `if (wf.type === 'referenceUpdate') return html`${head}${updateBody(state, data, wf, mine)}`;`
- Ended: `wf.type === 'referenceUpdate' ? updateEnded(state, data, wf) : …`
- The Cancel text for an update: "Cancel ${named(wf)}: the reference is left as it is; a file uploaded here stays in the folder, unused".
- The title link for an update goes to the reference: `go(workflowSubject(data, wf), 'reference', { id: wf.referenceId })`. Branch `title` on type.

`src/ui/screens/reference-update.js`:

```js
import { html, raw } from '../html.js';
import { dataAttrs, go } from './common.js';
import { get } from '../../core/data.js';
import { referenceItems, stepOf } from '../../core/workflows.js';
import { profileName, when } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

const KIND_WORD = Object.freeze({ hazard: 'Hazard', control: 'Control', platform: 'Platform', consequence: 'Consequence', hazardPhase: 'Lifecycle phase', causalFactor: 'Causal factor', failureMode: 'Element failure mode', systemElement: 'System/Element', affectedGroup: 'Affected group' });

/** @param {any} state @param {Data} data @param {any} wf @param {boolean} mine */
export function updateBody(state, data, wf, mine) {
  const r = get(data, 'reference', wf.referenceId);
  const dis = mine ? '' : raw(' disabled');
  const at = { change: 'setReferenceDraft', 'workflow-id': wf.id };
  const items = referenceItems(data, wf.referenceId);
  const draft = html`<section class="wf-check" aria-label="New revision"><h3 class="wf-check-h">New revision</h3>
    <div class="wf-rev"><span class="field-label">Current revision</span> <strong>${r?.revision || '—'}</strong></div>
    <label class="field-block"><span class="field-label">New revision</span><input name="revision" value="${wf.revision ?? ''}" required placeholder="e.g. C"${dis} ${dataAttrs(at)}></label>
    <div class="field-block"><span class="field-label">New file</span>${wf.file ? html`<span>${wf.file.name}</span> ` : ''}
      <form class="inline" data-action="uploadUpdateFile" ${dataAttrs({ 'workflow-id': wf.id })}><input type="file" name="file"${dis}><button type="submit" class="small"${dis}>Upload</button></form></div>
    <label class="field-block"><span class="field-label">New link</span><input name="url" value="${wf.url ?? ''}" placeholder="${r?.url ?? 'https://…'}"${dis} ${dataAttrs(at)}></label>
    <label class="field-block"><span class="field-label">New path</span><input name="path" value="${wf.path ?? ''}" placeholder="${r?.path ?? '\\\\share\\…'}"${dis} ${dataAttrs(at)}></label>
    <p class="muted">Give at least one of a file, a link or a path. Nothing reaches the reference until the update is confirmed.</p></section>`;
  const rows = items.map((i) => {
    const s = stepOf(data, wf.id, i.key, 'item');
    const st = { change: 'setStep', 'workflow-id': wf.id, 'hazard-id': i.key, check: 'item' };
    return html`<tr><td>${KIND_WORD[/** @type {keyof typeof KIND_WORD} */ (i.kind)] ?? i.kind}</td><td>${i.label}</td><td class="muted">${i.platforms.join(', ') || '—'}</td>
      <td><input name="note" value="${s?.note ?? ''}" placeholder="Note…" aria-label="Note on ${i.label}"${dis} ${dataAttrs(st)}></td>
      <td><label class="wf-tick"><input type="checkbox" name="checked"${s?.checked ? raw(' checked') : ''}${dis} ${dataAttrs(st)}> Checked</label></td>
      <td><button type="button" class="small" ${dataAttrs({ action: 'go', view: i.open.view, id: i.open.id, ...(i.open.tab ? { tab: i.open.tab } : {}), via: wf.id })}>Open →</button></td></tr>`;
  });
  const drafted = Boolean(String(wf.revision ?? '').trim() && wf.revision !== String(r?.revision ?? '').trim() && (wf.file || wf.url || wf.path));
  const left = Number(!drafted) + items.filter((i) => !stepOf(data, wf.id, i.key, 'item')?.checked).length;
  return html`<div class="wf-single">${draft}
    <section class="wf-check" aria-label="Affected items"><h3 class="wf-check-h">Affected items <span class="count">${items.length}</span></h3>
      ${items.length ? html`<table class="wf-controls"><thead><tr><th>Kind</th><th>Item</th><th>Platforms</th><th>Note</th><th>Checked</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
        : html`<p class="muted">This reference informs nothing yet.</p>`}</section>
    <div class="actions"><button type="button" class="primary" ${dataAttrs({ action: 'completeWorkflow', 'workflow-id': wf.id })}${left || !mine ? raw(' disabled') : ''}>${left ? `Confirm update — ${left} still needed` : 'Confirm update'}</button></div></div>`;
}

/** A completed or cancelled update: the revision it gave, and each item as it was ticked. @param {any} state @param {Data} data @param {any} wf */
export function updateEnded(state, data, wf) {
  const r = get(data, 'reference', wf.referenceId);
  const keys = Array.isArray(wf.covered) ? wf.covered : [];
  const status = wf.state === 'completed'
    ? html`<p class="doc-meta"><span class="tag wf-completed">Completed</span> Revision ${wf.before ?? '?'} → ${wf.revision}, by ${profileName(state, wf.endedBy)}, ${when(wf.endedAt)}.</p>`
    : html`<p class="doc-meta"><span class="tag wf-cancelled">Cancelled</span> by ${profileName(state, wf.endedBy)}, ${when(wf.endedAt)}. The reference was left as it was.</p>`;
  return html`${status}<article class="doc"><table class="wf-grid"><thead><tr><th>Item</th><th>Checked</th><th>Note</th></tr></thead>
    <tbody>${keys.map((k, n) => { const s = stepOf(data, wf.id, k, 'item'); return html`<tr><th scope="row">${wf.coveredLabels?.[n] ?? k}</th><td class="${s?.checked ? 'yes' : 'no'}">${s?.checked ? '✓' : ''}</td><td>${s?.note ?? ''}</td></tr>`; })}</tbody></table></article>`;
}
```

`completeWorkflow` (Task 3) records `before`, `covered` and `coveredLabels` on the completed workflow; the ended view reads them. `r` is unused in `updateEnded`: remove it if typecheck complains.

- [ ] **Step 4: Run the tests.**

Run: `node --test test/ui/screens-reference-update.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/screens/reference-update.js src/ui/screens/workflow.js src/core/ops/workflows.js test/ui/screens-reference-update.test.js
git commit -m "Reference update page: the new revision with its file, link or path, and a row per affected item with its platforms, a note, a tick and Open; once confirmed, the revision change and each item as it was ticked

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Elsewhere: dashboard tiles, platform and reference buttons, Home row, banner

**Files:**
- Modify: `src/ui/screens/workflows.js`, `src/ui/screens/platforms.js:161`, `src/ui/screens/references.js` (reference page head), `src/ui/screens/home.js` (transfer attention row), `src/ui/render.js` (banner)
- Test: `test/ui/screens-transfer-reference-elsewhere.test.js` (new)

- [ ] **Step 1: Write the failing test.**

```js
// test/ui/screens-transfer-reference-elsewhere.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowsView } from '../../src/ui/screens/workflows.js';
import { platformView } from '../../src/ui/screens/platforms.js';
import { referenceView } from '../../src/ui/screens/references.js';
import { homeView } from '../../src/ui/screens/home.js';
import { renderApp } from '../../src/ui/render.js';
import { createReference, linkReference } from '../../src/core/ops/references.js';
import { startWorkflow, setTransferRecipient, setStep, completeWorkflow } from '../../src/core/ops/workflows.js';
import { transferGroups } from '../../src/core/workflows.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { state } from './screens-workflows.test.js';
import { seed, act, scheduleFixed } from '../helpers.js';

test('the dashboard starts a transfer by platform and an update by reference', () => {
  const d = createReference(seed(), act, { id: 'r1', title: 'Range manual', url: 'x' });
  const out = workflowsView({ ...state, view: { name: 'workflows' } }, d).toString();
  assert.match(out, /data-action="startTransfer"[\s\S]*?Select platform…/);
  assert.match(out, /data-action="startReferenceUpdate"[\s\S]*?Select reference…[\s\S]*?Range manual/);
  assert.match(out, /New Tech Data[\s\S]*?Coming soon/);
});

test('the platform page has Transfer owner… in place of the owner dropdown; the reference page has Update revision…', () => {
  const d = createReference(seed(), act, { id: 'r1', title: 'Range manual', url: 'x' });
  const p = platformView({ ...state, view: { name: 'platform', id: 'p1' } }, d, 'p1').toString();
  assert.doesNotMatch(p, /data-change="setOwner"/);
  assert.match(p, /Owned by Ada[\s\S]*?data-action="startTransfer"[^>]*>Transfer owner…/);
  assert.match(referenceView({ ...state, view: { name: 'reference', id: 'r1' } }, d, 'r1').toString(), /data-action="startReferenceUpdate"[^>]*>Update revision…/);
});

test('Home tops Needs attention with an urgent row for a transfer the profile received', () => {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  d = startWorkflow(d, act, { id: 't1', type: 'transferOwner', platformId: 'p1' });
  d = setTransferRecipient(d, act, { workflowId: 't1', toOwnerId: 'u2' });
  for (const g of transferGroups(d, 'p1', '2026-09-28', 't1').filter((x) => x.items.length)) d = setStep(d, act, { workflowId: 't1', hazardId: '-', check: `group:${g.key}`, checked: true });
  d = assignNumbers(completeWorkflow(d, act, { workflowId: 't1' }));
  const out = homeView({ ...state, profileId: 'u2', homeOwner: 'me' }, d).toString();
  assert.match(out, /<tbody><tr class="urgent"[\s\S]*?chip-urgent[\s\S]*?Review the transfer of Alpha from Ada[\s\S]*?Review →/);
});

test('a page opened from an update shows the banner back to it', () => {
  let d = createReference(seed(), act, { id: 'r1', title: 'Range manual', url: 'x' });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' });
  d = assignNumbers(startWorkflow(d, act, { id: 'u1', type: 'referenceUpdate', referenceId: 'r1' }));
  const s = { ...state, session: { base: d, working: d }, view: { name: 'hazard', id: 'h1', via: 'u1' } };
  assert.match(renderApp(s).toString(), /class="via-banner"[\s\S]*?Working on WF-001[\s\S]*?← Back to WF-001/);
});
```

(Check `renderApp`'s real export name and signature in `render.js`, as `test/ui/render.test.js` uses it, and adapt the last test's call.)

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/ui/screens-transfer-reference-elsewhere.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.**

**`workflows.js` `startCards`:**
- For `transferOwner`: `transferCard(state, data)`:
  - a form `data-action="startTransfer"`
  - in `.wf-fields-col`, a `select name="platformId" required` with `NEUTRAL('Select platform…')`, listing live platforms that are not Onboarding (`isOnboarding` from `queries.js`), sorted by name
  - `<button type="submit" class="wf-go">Start <span class="wf-go-arrow" aria-hidden="true">→</span></button>`.
- For `referenceUpdate`: `updateCard(data)`:
  - a form `data-action="startReferenceUpdate"`
  - a `select name="referenceId" required` with `NEUTRAL('Select reference…')`, listing live, unarchived references by number, labelled `${referenceLabel(r)} ${r.title}${r.revision ? ` (rev ${r.revision})` : ''}`
  - the same Start button.

**`platforms.js`:** replace the `Owned by <select …setOwner…>` line with:

```js
          <p class="glance-line">Owned by ${profileName(state, p.ownerId)} ${p.status === 'live' && !onboardingOf(data, id) ? html`<button type="button" class="small" ${dataAttrs({ action: 'startTransfer', 'platform-id': id })}>Transfer owner…</button>` : ''}</p>
```

**`references.js` `referenceView` head:** add, for a live, unarchived reference:

```js
html`<button type="button" class="small" ${dataAttrs({ action: 'startReferenceUpdate', 'reference-id': id })}>Update revision…</button>`
```

next to its other head actions.

**`home.js`:**
- `CHIP.transfer = ['Transfer', 'chip-review']`.
- In `attentionRow`, the key includes `item.workflow?.id`.
- `const urgent = (item.type === 'dateMoved' && item.urgent) || item.type === 'transfer';`
- Add the branch:

```js
  if (item.type === 'transfer') {
    return row(html`<strong>Review the transfer of ${item.platform.name} from ${profileName(state, item.from)}</strong> <span class="muted">· ${workflowLabel(item.workflow)}</span>`,
      go('Review →', 'workflow', { id: item.workflow.id }));
  }
```

- `whereToAct` for a transfer: `{ view: 'workflow', id: item.workflow.id }` (already added in Task 2).

**`render.js`:** wrap the main view, so that when `state.view?.via` is set and that workflow exists and is open, the view is prefixed with:

```js
html`<div class="via-banner">Working on ${workflowLabel(wf)} ${typeName(wf.type)} · ${go(`← Back to ${workflowLabel(wf)}`, 'workflow', { id: wf.id })}</div>`
```

When it is unnumbered, use "this workflow" for the label in both places.

- [ ] **Step 4: Run the tests.**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS. Update existing tests that asserted the platform page's `setOwner` select (`grep -rn 'data-change="setOwner"' test`). The onboarding Details step keeps its select, so its tests stay as they are.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/screens/workflows.js src/ui/screens/platforms.js src/ui/screens/references.js src/ui/screens/home.js src/ui/render.js test/ui
git commit -m "Transfer and Update revision start from the dashboard, the platform page (in place of the owner dropdown) and the reference page; a received transfer tops Needs attention as urgent; a page opened from an update shows the way back

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Styles, and the browser

**Files:**
- Modify: `src/ui/styles.css`

- [ ] **Step 1: Add the styles** (sharp corners; `--p-*` tokens):

```css
/* Transfer and reference update */
.wf-single { max-width: 1100px; }
.wf-group summary { cursor: pointer; color: var(--p-muted); margin-bottom: 6px; }
.wf-items li { margin: 3px 0; }
.wf-rev { margin-bottom: 8px; }
.via-banner { display: flex; gap: 12px; align-items: center; padding: 6px 12px; margin: 0 0 12px; background: var(--p-info-bg); color: var(--p-info-fg); border-left: 3px solid var(--p-accent); }
```

- [ ] **Step 2: Build and run the suite.**

Run: `npm run build && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Check it in the browser** (seeded OPFS folder, as in part 2):
  1. Start a transfer from the platform page: choose a new owner, tick the groups, Confirm. The owner changes, and an open review moves with it.
  2. Sign in as the recipient: the urgent row tops Needs attention, Review → opens it, and Mark as reviewed clears it.
  3. Update revision from a reference page:
     - give rev C and a link
     - Open → an item, edit it, and check its History shows "via WF-n"
     - ← Back, tick everything, Confirm: the reference shows rev C.
  4. Cancel an update after uploading a file: the reference is unchanged.

  Remove the seed files and Playwright output afterwards.

- [ ] **Step 4: Commit.**

```bash
git add src/ui/styles.css
git commit -m "Transfer and reference update styles, and the banner back to a workflow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
