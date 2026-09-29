# Pivot Release 2b: Acknowledgements and Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let platform owners see and acknowledge other people's changes that reach their platforms, and give Pivot a Home page listing open items (changes to acknowledge, reviews due, controls awaiting a decision, unrated hazards) for a chosen owner.

**Architecture:** Acknowledgements are append-only history entries (`ack`, `acksStarted`), like comments, so they merge as a union with no merge change. What is waiting is derived in a new `src/core/acks.js`; the Home page's four sections come from one query, `openItems`, in `src/core/queries.js`. The UI adds a `home` view, a nav badge, and a line on platform pages.

**Tech Stack:** Plain ES modules, JSDoc types checked by `tsc --checkJs`, `node:test`, no runtime dependency, no UI framework.

**Spec:** `docs/superpowers/specs/2026-09-29-pivot-release-2b-acks-dashboard-design.md`

## Global Constraints

- No record kind, record field or schema version changes. New history entry types only: `{ id, type: 'ack', at, by, entryId, platformId }` and `{ id, type: 'acksStarted', at, by }`.
- A change waits on platform P only if: it is a `change` entry listing P; `at` ≥ the earliest `acksStarted`; its author is not P's owner at that time; its action is not `Mark review row`, `Set review outcome` or `Produce report`; it has no ack for P; P is live.
- With no `acksStarted` entry, nothing waits.
- Acknowledging never blocks anything and is never itself a `change` entry.
- Core code never reads the clock; it receives `act = { by, at }`.
- Every piece of user text written into HTML passes through the `html` tagged template.
- Commands: `npm test`, `npm run typecheck`, `npm run build`, all passing at the end of every task.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on the branch `release-2b-acks-home`.

## Review Focus

1. **Ownership transfer.** Ada owns Alpha; Grace edits a hazard on it (waiting for Ada); Ada transfers Alpha to Grace. Expect Grace to inherit the waiting change (it was not made by Alpha's owner at the time), and Ada's own earlier edits not to start waiting for Grace. Pinned in Task 1.
2. **Opening Pivot without editing anything.** Expect no *Unsaved* marker: the acknowledgement start is written only with the session's first real edit, and a no-op edit writes nothing. Pinned in Task 4.
3. **"Acknowledge all shown" with a filter on.** Expect only the rows left showing by the table's filters to be acknowledged. Pinned in Task 4 (controller) and Task 5 (the button's keys).
4. **Two people acknowledging the same change for the same platform at once.** Expect both saves to succeed and the change to count as acknowledged once. Pinned in Task 1.
5. **Markup in before/after values** (a hazard retitled to `<b>x</b>`). Expect it shown literally on Home. Pinned in Task 5.

## File Structure

```
src/core/acks.js              NEW: NOT_ACKNOWLEDGED, ackStart, startAcks, ownerAt, waitingChanges, acknowledge, acknowledgeAll
src/core/queries.js           + openItems
src/ui/screens/table.js       + shownRows (dataTable's filtering and sorting, exported)
src/ui/screens/common.js      + changeDetail (the History tab's before → after rendering, exported); Home in the nav with a count
src/ui/controller.js          + acknowledge edits, setHomeOwner, acksStarted with the first edit, open on Home
src/ui/screens/home.js        NEW: homeView, homeOwnerId
src/ui/render.js              + the home view
src/ui/screens/platforms.js   + "N changes to acknowledge" line
src/ui/styles.css             + Home layout
test/core/acks.test.js         NEW
test/core/open-items.test.js   NEW
test/ui/table.test.js          + shownRows
test/ui/controller-home.test.js NEW
test/ui/screens-home.test.js   NEW
```

---

### Task 1: What waits for acknowledgement

**Files:**
- Create: `src/core/acks.js`
- Test: `test/core/acks.test.js`

**Interfaces:**
- Consumes: `entries` (`src/core/history.js`), `get` (`src/core/data.js`), `newId` (`src/core/ids.js`).
- Produces:
  - `NOT_ACKNOWLEDGED: readonly string[]` = `['Mark review row', 'Set review outcome', 'Produce report']`
  - `ackStart(data): string | null` — the earliest `acksStarted` entry's `at`.
  - `startAcks(data, act): Data` — appends `acksStarted` unless one exists (then returns `data` itself).
  - `ownerAt(data, platformId, at): string | null`
  - `waitingChanges(data, platformId): Entry[]` — oldest first.
  - `acknowledge(data, act, { entryId, platformId }): Data` — returns `data` itself when that change is not waiting there.
  - `acknowledgeAll(data, act, { keys }): Data` — `keys` is `'entryId|platformId'` strings, as an array or one comma-separated string.
  - Note: `acks.js` must not import `ops/reviews.js` (it would make an import cycle through `queries.js`); `NOT_ACKNOWLEDGED` is written out, and a test checks it covers `REVIEW_DETAIL_ACTIONS`.

- [ ] **Step 1: Write the failing test**

Create `test/core/acks.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOT_ACKNOWLEDGED, ackStart, startAcks, ownerAt, waitingChanges, acknowledge, acknowledgeAll } from '../../src/core/acks.js';
import { REVIEW_DETAIL_ACTIONS } from '../../src/core/ops/reviews.js';
import { updateHazard } from '../../src/core/ops/hazards.js';
import { setOwner, retirePlatform, setReportId, createPlatform, linkHazard } from '../../src/core/ops/platforms.js';
import { setSchedule, startReview, markRow, completeReview } from '../../src/core/ops/reviews.js';
import { createReport } from '../../src/core/ops/reports.js';
import { mergeData } from '../../src/core/merge.js';
import { seed } from '../helpers.js';

/** An act by `by` at `hh:mm` on 2026-09-28. */
const at = (hhmm, by) => ({ by, at: `2026-09-28T${hhmm}:00+10:00` });
/** seed(): h1 on p1 (owned by u1) and p2 (owned by u2), all made by u1 at 10:00. Acks start at 10:30. */
const started = () => startAcks(seed(), at('10:30', 'u1'));
const ids = (list) => list.map((e) => e.action);

test('the actions that never wait cover the review-row actions and producing a report', () => {
  for (const a of REVIEW_DETAIL_ACTIONS) assert.ok(NOT_ACKNOWLEDGED.includes(a));
  assert.ok(NOT_ACKNOWLEDGED.includes('Produce report'));
});

test('the start: none until written, written once, the earliest counts', () => {
  assert.equal(ackStart(seed()), null);
  assert.deepEqual(waitingChanges(updateHazard(seed(), at('11:00', 'u2'), { id: 'h1', title: 'X' }), 'p1'), [], 'nothing waits before a start');
  const d = started();
  assert.equal(ackStart(d), '2026-09-28T10:30:00+10:00');
  assert.equal(startAcks(d, at('12:00', 'u2')), d, 'a second start is not written');
  const mine = startAcks(seed(), at('10:45', 'u1'));
  const theirs = startAcks(seed(), at('10:15', 'u2'));
  const { data } = mergeData(seed(), mine, theirs, at('13:00', 'u1'));
  assert.equal(ackStart(data), '2026-09-28T10:15:00+10:00');
});

test('another person\'s change waits on each platform it reaches that they do not own; changes before the start do not', () => {
  const d = updateHazard(started(), at('11:00', 'u2'), { id: 'h1', title: 'Fire (edited)' });
  assert.deepEqual(ids(waitingChanges(d, 'p1')), ['Edit hazard'], 'u2 edited a hazard on u1\'s platform');
  assert.deepEqual(waitingChanges(d, 'p2'), [], 'u2 owns p2');
  const own = updateHazard(started(), at('11:00', 'u1'), { id: 'h1', title: 'Mine' });
  assert.deepEqual(waitingChanges(own, 'p1'), [], 'your own change never waits');
  assert.deepEqual(ids(waitingChanges(own, 'p2')), ['Edit hazard']);
});

test('the owner at the time: the new owner inherits what waits, but not the old owner\'s own changes', () => {
  let d = updateHazard(started(), at('11:00', 'u2'), { id: 'h1', title: 'By u2' });
  d = setReportId(d, at('11:30', 'u1'), { hazardId: 'h1', platformId: 'p1', reportId: 'R-1' });
  d = setOwner(d, at('12:00', 'u1'), { id: 'p1', ownerId: 'u2' });
  d = updateHazard(d, at('13:00', 'u2'), { id: 'h1', title: 'By u2 again' });
  assert.equal(ownerAt(d, 'p1', '2026-09-28T11:30:00+10:00'), 'u1');
  assert.equal(ownerAt(d, 'p1', '2026-09-28T12:00:00+10:00'), 'u2');
  assert.equal(ownerAt(d, 'p1', '2026-09-28T13:00:00+10:00'), 'u2');
  assert.deepEqual(ids(waitingChanges(d, 'p1')), ['Edit hazard', 'Change platform owner'],
    'u2\'s 11:00 edit (inherited) and the transfer itself; not u1\'s own 11:30 edit, not u2\'s 13:00 edit');
});

test('review ticks and producing a report do not wait; starting and completing a review do', () => {
  let d = setSchedule(started(), at('11:00', 'u1'), { platformId: 'p1', months: 6, due: '2026-12-31' });
  d = startReview(d, at('11:05', 'u2'), { id: 'r1', platformId: 'p1' });
  d = markRow(d, at('11:10', 'u2'), { reviewId: 'r1', hazardId: 'h1', reviewed: true });
  d = completeReview(d, at('11:15', 'u2'), { reviewId: 'r1' });
  d = createReport(d, at('11:20', 'u2'), { id: 'rep', report: { platformId: 'p1', title: 'R' } });
  assert.deepEqual(ids(waitingChanges(d, 'p1')), ['Start review', 'Complete review']);
});

test('a retired platform has nothing waiting', () => {
  let d = updateHazard(started(), at('11:00', 'u2'), { id: 'h1', title: 'X' });
  d = createPlatform(d, at('11:00', 'u1'), { id: 'p9', name: 'Spare', ownerId: 'u1' });
  d = linkHazard(d, at('11:00', 'u1'), { hazardId: 'h2', platformId: 'p9' });
  d = retirePlatform(d, at('12:00', 'u2'), { id: 'p9' });
  assert.deepEqual(waitingChanges(d, 'p9'), []);
});

test('acknowledging: per platform, once, and only what is waiting', () => {
  const d = updateHazard(started(), at('11:00', 'u3'), { id: 'h1', title: 'By u3' });
  const [change] = waitingChanges(d, 'p1');
  const a = acknowledge(d, at('12:00', 'u1'), { entryId: change.id, platformId: 'p1' });
  assert.deepEqual(waitingChanges(a, 'p1'), []);
  assert.equal(waitingChanges(a, 'p2').length, 1, 'p2 still has it waiting');
  const ack = Object.values(a.history).find((e) => e.type === 'ack');
  assert.deepEqual({ by: ack.by, at: ack.at, entryId: ack.entryId, platformId: ack.platformId }, { by: 'u1', at: '2026-09-28T12:00:00+10:00', entryId: change.id, platformId: 'p1' });
  assert.equal(acknowledge(a, at('12:05', 'u1'), { entryId: change.id, platformId: 'p1' }), a, 'twice changes nothing');
  assert.equal(acknowledge(d, at('12:05', 'u1'), { entryId: 'nope', platformId: 'p1' }), d, 'an unknown change changes nothing');
  const both = acknowledgeAll(d, at('12:10', 'u1'), { keys: `${change.id}|p1,${change.id}|p2` });
  assert.deepEqual([waitingChanges(both, 'p1'), waitingChanges(both, 'p2')], [[], []]);
  assert.equal(waitingChanges(acknowledgeAll(d, at('12:10', 'u1'), { keys: [`${change.id}|p2`] }), 'p1').length, 1);
});

test('two people acknowledging the same change at once: both saves merge, and it is acknowledged', () => {
  const d = updateHazard(started(), at('11:00', 'u3'), { id: 'h1', title: 'By u3' });
  const [change] = waitingChanges(d, 'p1');
  const mine = acknowledge(d, at('12:00', 'u1'), { entryId: change.id, platformId: 'p1' });
  const theirs = acknowledge(d, at('12:01', 'u2'), { entryId: change.id, platformId: 'p1' });
  const { data, conflicts } = mergeData(d, mine, theirs, at('13:00', 'u1'));
  assert.deepEqual(conflicts, []);
  assert.deepEqual(waitingChanges(data, 'p1'), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/core/acks.test.js`
Expected: FAIL — cannot find module `src/core/acks.js`.

- [ ] **Step 3: Write the implementation**

Create `src/core/acks.js`:

```js
import { newId } from './ids.js';
import { get } from './data.js';
import { entries } from './history.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Act} Act */

/**
 * Actions that never wait for acknowledgement: a review's row-level edits (its start and
 * completion do wait) and producing a report. Written out rather than imported from
 * ops/reviews.js, which would make an import cycle through queries.js.
 */
export const NOT_ACKNOWLEDGED = Object.freeze(['Mark review row', 'Set review outcome', 'Produce report']);

/** @param {Data} data @param {any} entry @returns {Data} */
const append = (data, entry) => ({ ...data, history: { ...data.history, [entry.id]: entry } });

/** When acknowledgement started on this data: the earliest start entry. @param {Data} data @returns {string | null} */
export function ackStart(data) {
  let first = null;
  for (const e of Object.values(data.history)) if (e.type === 'acksStarted' && (first === null || e.at < first)) first = e.at;
  return first;
}

/** @param {Data} data @param {Act} act @returns {Data} */
export function startAcks(data, act) {
  if (ackStart(data) !== null) return data;
  return append(data, { id: newId(), type: 'acksStarted', at: act.at, by: act.by });
}

/**
 * A platform's owner over time, from its history's ownerId changes: at `t`, the owner set by the
 * last change at or before `t`; before the first change, that change's `before`; with none, the
 * current owner.
 * @param {Data} data @param {string} platformId @returns {(t: string) => string | null}
 */
function ownerTimeline(data, platformId) {
  const current = get(data, 'platform', platformId)?.ownerId ?? null;
  const changes = entries(data).filter((e) => e.type === 'change').flatMap((e) => e.items
    .filter((/** @type {any} */ i) => i.kind === 'platform' && i.id === platformId)
    .flatMap((/** @type {any} */ i) => i.fields.filter((/** @type {any} */ f) => f.field === 'ownerId').map((/** @type {any} */ f) => ({ at: e.at, before: f.before, after: f.after }))));
  return (t) => {
    const upTo = changes.filter((c) => c.at <= t);
    if (upTo.length) return upTo[upTo.length - 1].after;
    return changes.length ? changes[0].before : current;
  };
}

/** @param {Data} data @param {string} platformId @param {string} at @returns {string | null} */
export function ownerAt(data, platformId, at) {
  return ownerTimeline(data, platformId)(at);
}

/** @param {Data} data @returns {Set<string>} `entryId|platformId` for every ack */
function acked(data) {
  return new Set(Object.values(data.history).filter((e) => e.type === 'ack').map((e) => `${e.entryId}|${e.platformId}`));
}

/**
 * The changes waiting for acknowledgement on a platform, oldest first: made since the start, by
 * someone other than the platform's owner at the time, and not yet acknowledged for it.
 * @param {Data} data @param {string} platformId
 */
export function waitingChanges(data, platformId) {
  const p = get(data, 'platform', platformId);
  const start = ackStart(data);
  if (!p || p.status !== 'live' || start === null) return [];
  const done = acked(data);
  const owner = ownerTimeline(data, platformId);
  return entries(data).filter((e) => e.type === 'change' && e.platforms.includes(platformId) && e.at >= start
    && !NOT_ACKNOWLEDGED.includes(e.action) && !done.has(`${e.id}|${platformId}`) && e.by !== owner(e.at));
}

/**
 * Acknowledge one change for one platform. Nothing happens when it is not waiting there.
 * @param {Data} data @param {Act} act @param {{ entryId: string, platformId: string }} args
 */
export function acknowledge(data, act, { entryId, platformId }) {
  if (!waitingChanges(data, platformId).some((e) => e.id === entryId)) return data;
  return append(data, { id: newId(), type: 'ack', at: act.at, by: act.by, entryId, platformId });
}

/**
 * @param {Data} data @param {Act} act
 * @param {{ keys: string[] | string }} args `entryId|platformId` pairs, a list or comma-separated
 */
export function acknowledgeAll(data, act, { keys }) {
  const list = Array.isArray(keys) ? keys : String(keys ?? '').split(',').filter(Boolean);
  let d = data;
  for (const k of list) {
    const [entryId, platformId] = k.split('|');
    d = acknowledge(d, act, { entryId, platformId });
  }
  return d;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/core/acks.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src/core/acks.js test/core/acks.test.js
git commit -m "Acknowledgements: which changes wait on a platform (others' changes since the start, judged by the owner at the time), and acknowledging them, as history entries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Open items

**Files:**
- Modify: `src/core/queries.js` (import `waitingChanges`; append `openItems`)
- Test: `test/core/open-items.test.js`

**Interfaces:**
- Consumes: `waitingChanges` (Task 1); `reviewState` (`src/core/time.js`); `openReview`, `lastReviewed`, `platformHazards` (`src/core/queries.js`).
- Produces: `openItems(data, today, ownerId: string | null)` →
  `{ acks: { entry, platform }[] (newest first), reviews: { platform, state, due, lastReviewed, open: boolean }[], awaiting: { platform, hazard, control }[], unrated: { platform, hazard, missing: 'initial' | 'residual' | 'both' }[] }`, over live platforms owned by `ownerId` (all live platforms when null).

- [ ] **Step 1: Write the failing test**

Create `test/core/open-items.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openItems } from '../../src/core/queries.js';
import { startAcks } from '../../src/core/acks.js';
import { updateHazard } from '../../src/core/ops/hazards.js';
import { confirmControl, setRating } from '../../src/core/ops/assessment.js';
import { setSchedule, startReview } from '../../src/core/ops/reviews.js';
import { seed } from '../helpers.js';

const at = (hhmm, by) => ({ by, at: `2026-09-28T${hhmm}:00+10:00` });

/** p1 (u1): overdue, c1 confirmed, c2 awaiting, h1 rated initial only; p2 (u2): review in progress; an edit by u3. */
function data() {
  let d = startAcks(seed(), at('10:30', 'u1'));
  d = setSchedule(d, at('10:40', 'u1'), { platformId: 'p1', months: 6, due: '2026-09-01' });
  d = confirmControl(d, at('10:40', 'u1'), { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  d = setRating(d, at('10:40', 'u1'), { hazardId: 'h1', platformId: 'p1', stage: 'initial', consequence: 2, likelihood: 'C' });
  d = startReview(d, at('10:40', 'u2'), { id: 'r2', platformId: 'p2' });
  return updateHazard(d, at('11:00', 'u3'), { id: 'h1', title: 'Fire (u3)' });
}
const names = (xs) => xs.map((x) => `${x.platform.id}:${x.hazard?.id ?? ''}:${x.control?.id ?? x.missing ?? x.state ?? x.entry?.action ?? ''}`);

test('open items for one owner: changes to acknowledge, reviews, awaiting controls, unrated hazards', () => {
  const o = openItems(data(), '2026-09-28', 'u1');
  assert.deepEqual(o.acks.map((a) => [a.platform.id, a.entry.action]), [['p1', 'Edit hazard']],
    'u3 edited h1 on p1; u2 started a review on p2, not p1; u1\'s own edits never wait');
  assert.deepEqual(o.reviews.map((r) => [r.platform.id, r.state, r.due, r.open]), [['p1', 'overdue', '2026-09-01', false]]);
  assert.deepEqual(names(o.awaiting), ['p1:h1:c2']);
  assert.deepEqual(names(o.unrated), ['p1:h1:residual']);
});

test('the owner filter: another owner, and everyone', () => {
  const u2 = openItems(data(), '2026-09-28', 'u2');
  assert.deepEqual(u2.acks.map((a) => [a.platform.id, a.entry.action]), [['p2', 'Edit hazard']]);
  assert.deepEqual(u2.reviews.map((r) => [r.platform.id, r.state, r.open]), [['p2', 'none', true]], 'a review in progress, with no schedule');
  assert.deepEqual(names(u2.awaiting), ['p2:h1:c1', 'p2:h1:c2']);
  assert.deepEqual(names(u2.unrated), ['p2:h1:both']);
  const all = openItems(data(), '2026-09-28', null);
  assert.equal(all.acks.length, 2);
  assert.equal(all.awaiting.length, 3);
  assert.deepEqual(openItems(data(), '2026-09-28', 'nobody'), { acks: [], reviews: [], awaiting: [], unrated: [] });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/core/open-items.test.js`
Expected: FAIL — `openItems` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/core/queries.js` add `import { waitingChanges } from './acks.js';` to the imports, and append:

```js
/** @param {{ consequence: number | null, likelihood: string | null } | null | undefined} pair */
const unratedPair = (pair) => !pair || pair.consequence == null || pair.likelihood == null;

/**
 * What is left to do on the live platforms of one owner (every owner when `ownerId` is null):
 * changes to acknowledge, reviews due or in progress, controls awaiting a decision, and
 * hazards missing a rating.
 * @param {Data} data @param {string} today @param {string | null} ownerId
 */
export function openItems(data, today, ownerId) {
  /** @type {{ acks: { entry: any, platform: Rec }[], reviews: { platform: Rec, state: string, due: string | null, lastReviewed: string | null, open: boolean }[], awaiting: { platform: Rec, hazard: Rec, control: Rec }[], unrated: { platform: Rec, hazard: Rec, missing: string }[] }} */
  const out = { acks: [], reviews: [], awaiting: [], unrated: [] };
  for (const platform of live(data, 'platform').filter((p) => ownerId == null || p.ownerId === ownerId)) {
    for (const entry of waitingChanges(data, platform.id)) out.acks.push({ entry, platform });
    const state = reviewState(platform, today);
    const open = Boolean(openReview(data, platform.id));
    if (state === 'overdue' || state === 'dueSoon' || open) {
      out.reviews.push({ platform, state, due: platform.reviewDue ?? null, lastReviewed: lastReviewed(data, platform.id), open });
    }
    for (const ph of platformHazards(data, platform.id)) {
      for (const c of ph.controls) if (c.state === 'awaiting') out.awaiting.push({ platform, hazard: ph.hazard, control: c.control });
      const i = unratedPair(ph.rating.initial);
      const r = unratedPair(ph.rating.residual);
      if (i || r) out.unrated.push({ platform, hazard: ph.hazard, missing: i && r ? 'both' : i ? 'initial' : 'residual' });
    }
  }
  out.acks.sort((a, b) => (a.entry.at < b.entry.at ? 1 : a.entry.at > b.entry.at ? -1 : 0));
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/core/open-items.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src/core/queries.js test/core/open-items.test.js
git commit -m "Open items for an owner: changes to acknowledge, reviews due or in progress, controls awaiting a decision, and unrated hazards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Shared table filtering, and the change detail as a helper

**Files:**
- Modify: `src/ui/screens/table.js` (extract the filtering and sorting into `rowsView`; export `shownRows`)
- Modify: `src/ui/screens/common.js` (export `changeDetail`; `historyTable` uses it)
- Test: `test/ui/table.test.js` (append), `test/ui/screens-home.test.js` (create, first test)

**Interfaces:**
- Produces:
  - `shownRows(state, spec): any[]` — exactly the rows `dataTable(state, spec)` shows, in its order.
  - `changeDetail(item)` — for an `edited` item, a `<ul class="plain">` of `field: before → after` (ratings as cell and band); otherwise the word (Created, Deleted, Retired, Restored).

- [ ] **Step 1: Write the failing tests**

Append to `test/ui/table.test.js` (add `shownRows` to the `table.js` import):

```js
test('shownRows gives exactly the rows the table shows, filtered and sorted', () => {
  const st = state({ t: { sort: { key: 'n', dir: 'asc' }, filters: { status: 'any', kind: 'x' } } });
  assert.deepEqual(shownRows(st, { id: 't', columns, rows, rowKey: (r) => r.id }).map((r) => r.id), ['c', 'a']);
  assert.deepEqual(shownRows(state(), { id: 't', columns, rows, rowKey: (r) => r.id }).map((r) => r.id), ['a', 'c'], 'the default filter applies');
});
```

Create `test/ui/screens-home.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeDetail } from '../../src/ui/screens/common.js';

test('changeDetail: an edit as before → after, escaped; other changes as a word', () => {
  const out = changeDetail({ change: 'edited', fields: [{ field: 'title', before: '<b>x</b>', after: 'Fire' }] }).toString();
  assert.match(out, /<li><strong>title<\/strong>: &lt;b&gt;x&lt;\/b&gt; → Fire<\/li>/);
  assert.equal(String(changeDetail({ change: 'created', fields: [] })), 'Created');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/ui/table.test.js test/ui/screens-home.test.js`
Expected: FAIL — `shownRows` and `changeDetail` are not exported.

- [ ] **Step 3: Write the implementation**

In `src/ui/screens/table.js`, move the filter and sort code out of `dataTable` into:

```js
/**
 * The rows a table shows, after its filters (defaults, then the user's) and its sort.
 * @param {any} state @param {{ id: string, columns: Column[], rows: any[] }} spec
 */
function rowsView(state, { id, columns, rows }) {
  const t = state.tables?.[id] ?? {};
  /** @type {Record<string, string>} */
  const filters = {};
  for (const c of columns) if (c.defaultFilter) filters[c.key] = c.defaultFilter;
  Object.assign(filters, t.filters ?? {});
  let shown = rows.filter((row) => columns.every((c) => {
    const v = filters[c.key];
    if (!c.filter || !v) return true;
    if (c.match) return c.match(row, v, filters);
    const cell = text(valueOf(c, row));
    return c.filter === 'text' ? cell.toLowerCase().includes(v.toLowerCase()) : cell === v;
  }));
  const sortCol = t.sort && columns.find((c) => c.key === t.sort.key);
  if (sortCol) {
    const sign = t.sort.dir === 'desc' ? -1 : 1;
    shown = [...shown].sort((a, b) => sign * compare(valueOf(sortCol, a), valueOf(sortCol, b)));
  }
  return { t, filters, shown };
}

/** Exactly the rows `dataTable` shows for the same state and spec, in its order. @param {any} state @param {{ id: string, columns: Column[], rows: any[] }} spec */
export function shownRows(state, spec) {
  return rowsView(state, spec).shown;
}
```

and at the top of `dataTable`, replace everything from `const t = state.tables?.[id] ?? {};` down to the end of the sort block with:

```js
  const { t, filters, shown } = rowsView(state, { id, columns, rows });
```

(keeping `const minOf = ...` before it and the `filtering` line after it).

In `src/ui/screens/common.js`, add after the `CHANGE_WORD` constant:

```js
/** One history item's change: an edit as each field's before → after, otherwise a word. @param {any} item */
export function changeDetail(item) {
  return item.change === 'edited'
    ? html`<ul class="plain">${item.fields.map((/** @type {any} */ f) => html`<li><strong>${f.field}</strong>: ${show(f.before)} → ${show(f.after)}</li>`)}</ul>`
    : CHANGE_WORD[/** @type {keyof typeof CHANGE_WORD} */ (item.change)] ?? item.change;
}
```

and in `historyTable`'s `changes` column replace the render with `render: (r) => (r.item ? changeDetail(r.item) : '')`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/ui/table.test.js test/ui/screens-home.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass (the History tab tests still pass through `changeDetail`).

```bash
git add src/ui/screens/table.js src/ui/screens/common.js test/ui/table.test.js test/ui/screens-home.test.js
git commit -m "Tables expose the rows they show (for acting on what is on screen), and a history item's before → after is a shared helper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Controller: acknowledging, the start, and opening on Home

**Files:**
- Modify: `src/ui/controller.js`
- Test: `test/ui/controller-home.test.js`

**Interfaces:**
- Consumes: `acknowledge`, `acknowledgeAll`, `ackStart`, `startAcks`, `waitingChanges` (Task 1).
- Produces:
  - Edits `acknowledge({ entryId, platformId })` and `acknowledgeAll({ keys })`.
  - Handler `setHomeOwner({ ownerId, show? })`, quiet: sets `state.homeOwner` (`'me'`, a profile id, or `'everyone'`; empty means `'me'`); with `show: 'home'` also shows Home.
  - `initialState().homeOwner === 'me'`.
  - After opening (profile picked, then recovery or notices), `state.view.name === 'home'`.
  - The first edit that changes the data in a session is preceded by `startAcks` dated at the moment the session opened, when the data has no start.

- [ ] **Step 1: Write the failing test**

Create `test/ui/controller-home.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController, initialState } from '../../src/ui/controller.js';
import { hasUnsaved } from '../../src/storage/mirror.js';
import { ackStart, waitingChanges } from '../../src/core/acks.js';

const env = (f, clock = fixedClock('2026-09-28T10:00:00+10:00')) => ({ clock, storage: new MemoryStorage(), minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

async function openAs(c, name) {
  await c.dispatch({ type: 'chooseFolder' });
  let p = c.getState().profiles.find((x) => x.name === name);
  if (!p) { await c.dispatch({ type: 'createProfile', name }); p = c.getState().profiles.find((x) => x.name === name); }
  await c.dispatch({ type: 'selectProfile', id: p.id });
  return p.id;
}
const W = (c) => c.getState().session.working;

test('Pivot opens on Home, showing my items; opening alone leaves nothing unsaved', async () => {
  assert.equal(initialState().homeOwner, 'me');
  const c = createController(env(new MemoryFolder()));
  await openAs(c, 'Ada');
  assert.equal(c.getState().view.name, 'home');
  assert.equal(hasUnsaved(c.getState().session), false);
  assert.equal(ackStart(W(c)), null);
});

test('the start is written with the first real edit, dated when the session opened, and only once', async () => {
  const clock = fixedClock('2026-09-28T10:00:00+10:00');
  const c = createController(env(new MemoryFolder(), clock));
  const ada = await openAs(c, 'Ada');
  clock.advance(60_000);
  await c.dispatch({ type: 'setHomeOwner', ownerId: 'everyone' });
  assert.equal(ackStart(W(c)), null, 'a quiet action is not an edit');
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: ada });
  assert.equal(ackStart(W(c)), '2026-09-28T10:00:00+10:00');
  await c.dispatch({ type: 'updatePlatform', id: 'p1', name: 'Alpha' });
  assert.equal(Object.values(W(c).history).filter((e) => e.type === 'acksStarted').length, 1);
});

test('a no-op edit writes no start', async () => {
  const c = createController(env(new MemoryFolder()));
  await openAs(c, 'Ada');
  await c.dispatch({ type: 'acknowledge', entryId: 'nope', platformId: 'nope' });
  assert.equal(hasUnsaved(c.getState().session), false);
});

test('another person\'s change waits for me; I acknowledge one, or all shown', async () => {
  const f = new MemoryFolder();
  const a = createController(env(f));
  const ada = await openAs(a, 'Ada');
  await a.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: ada });
  await a.dispatch({ type: 'createPlatform', id: 'p2', name: 'Bravo', ownerId: ada });
  await a.dispatch({ type: 'save' });
  const g = createController(env(f));
  await openAs(g, 'Grace');
  await g.dispatch({ type: 'updatePlatform', id: 'p1', name: 'Alpha 1' });
  await g.dispatch({ type: 'updatePlatform', id: 'p2', name: 'Bravo 1' });
  await g.dispatch({ type: 'save' });
  await a.dispatch({ type: 'save' });
  const [one] = waitingChanges(W(a), 'p1');
  assert.ok(one, 'Grace\'s rename waits on Alpha');
  await a.dispatch({ type: 'acknowledge', entryId: one.id, platformId: 'p1' });
  assert.deepEqual(waitingChanges(W(a), 'p1'), []);
  const [two] = waitingChanges(W(a), 'p2');
  await a.dispatch({ type: 'acknowledgeAll', keys: `${two.id}|p2` });
  assert.deepEqual(waitingChanges(W(a), 'p2'), []);
});

test('setHomeOwner changes whose items Home shows, and can show Home', async () => {
  const c = createController(env(new MemoryFolder()));
  await openAs(c, 'Ada');
  await c.dispatch({ type: 'go', view: 'platforms' });
  await c.dispatch({ type: 'setHomeOwner', ownerId: 'u9', show: 'home' });
  assert.deepEqual([c.getState().homeOwner, c.getState().view.name], ['u9', 'home']);
  await c.dispatch({ type: 'setHomeOwner', ownerId: '' });
  assert.equal(c.getState().homeOwner, 'me');
  assert.equal(c.getState().busy, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/controller-home.test.js`
Expected: FAIL — `initialState().homeOwner` is `undefined`.

- [ ] **Step 3: Write the implementation**

In `src/ui/controller.js`:

1. Add `import * as acks from '../core/acks.js';`.
2. In `EDITS`, add `acknowledge: acks.acknowledge, acknowledgeAll: acks.acknowledgeAll,`.
3. Add `'setHomeOwner'` to `QUIET`.
4. In `initialState()`, add `homeOwner: 'me',`.
5. Inside `createController`, after `let running = 0;`, add:

```js
  /** When this session opened the data: the acknowledgement start, if the data has none yet. */
  let openedAt = /** @type {string | null} */ (null);
```

6. In `finishOpening`, set `openedAt = env.clock.now();` first, and change `view: { name: 'hazards' }` to `view: { name: 'home' }`.
7. Add the handler (next to `setScheduleField`):

```js
    async setHomeOwner({ ownerId, show }) {
      set({ homeOwner: ownerId || 'me', ...(show === 'home' ? { view: { name: 'home' }, editing: null } : {}) });
    },
```

8. In `applyEdit`, replace the line computing `working` with:

```js
    // Acknowledgement starts with the session's first real edit, dated when the session opened, so
    // opening Pivot alone never leaves unsaved work.
    const current = state.session.working;
    const from = openedAt && acks.ackStart(current) === null ? acks.startAcks(current, { by: state.profileId, at: openedAt }) : current;
    const next = EDITS[/** @type {keyof typeof EDITS} */ (type)](from, act(), /** @type {any} */ (args));
    const working = next === from ? current : next;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/controller-home.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass. If an existing test expects the view after opening to be `hazards`, change it to `home` (the spec moves the landing page).

```bash
git add src/ui/controller.js test/ui/controller-home.test.js
git commit -m "Controller: acknowledge one change or all shown, choose whose items Home shows, open on Home; acknowledgement starts with the session's first real edit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Home page, the nav count, and the platform-page line

**Files:**
- Create: `src/ui/screens/home.js`
- Modify: `src/ui/render.js` (route `home`)
- Modify: `src/ui/screens/common.js` (`NAV`, `SECTION`, the Home count in `shell`)
- Modify: `src/ui/screens/platforms.js` (the "N changes to acknowledge" line)
- Modify: `src/ui/styles.css`
- Test: `test/ui/screens-home.test.js` (append)

**Interfaces:**
- Consumes: `openItems` (Task 2); `waitingChanges` (Task 1); `shownRows`, `changeDetail` (Task 3); `state.homeOwner`, handlers `setHomeOwner`, `acknowledge`, `acknowledgeAll` (Task 4).
- Produces: `homeView(state, data)`, `homeOwnerId(state): string | null`; tables `homeAcks`, `homeReviews`, `homeAwaiting`, `homeUnrated`.

- [ ] **Step 1: Write the failing tests**

Append to `test/ui/screens-home.test.js`:

```js
import { homeView, homeOwnerId } from '../../src/ui/screens/home.js';
import { platformView } from '../../src/ui/screens/platforms.js';
import { renderApp } from '../../src/ui/render.js';
import { initialState } from '../../src/ui/controller.js';
import { startAcks, waitingChanges } from '../../src/core/acks.js';
import { updateHazard, assignNumbers } from '../../src/core/ops/hazards.js';
import { setSchedule } from '../../src/core/ops/reviews.js';
import { seed } from '../helpers.js';

const at = (hhmm, by) => ({ by, at: `2026-09-28T${hhmm}:00+10:00` });
const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1',
  profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }, { id: 'u3', name: 'Sam', createdAt: '' }] };
/** u3 retitles h1 (on p1 of Ada, p2 of Grace); p1 is overdue for review. */
function data(title = 'Fire (Sam)') {
  let d = startAcks(assignNumbers(seed()), at('10:30', 'u1'));
  d = setSchedule(d, at('10:40', 'u1'), { platformId: 'p1', months: 6, due: '2026-09-01' });
  return updateHazard(d, at('11:00', 'u3'), { id: 'h1', title });
}

test('homeOwnerId: me is the active profile, everyone is null', () => {
  assert.equal(homeOwnerId(state), 'u1');
  assert.equal(homeOwnerId({ ...state, homeOwner: 'everyone' }), null);
  assert.equal(homeOwnerId({ ...state, homeOwner: 'u2' }), 'u2');
});

test('Home: an owner chooser, a summary, and the four sections for my platforms', () => {
  const out = homeView(state, data()).toString();
  assert.match(out, /<select name="ownerId" data-change="setHomeOwner"[\s\S]*?<option value="me" selected>Me<\/option>[\s\S]*?<option value="u2">Grace<\/option>[\s\S]*?<option value="everyone">Everyone<\/option>/);
  assert.match(out, /1 change to acknowledge · 1 review overdue · 2 controls awaiting · 1 hazard unrated/);
  for (const t of ['homeAcks', 'homeReviews', 'homeAwaiting', 'homeUnrated']) assert.match(out, new RegExp(`data-table="${t}"`));
  const [e] = waitingChanges(data(), 'p1');
  assert.match(out, new RegExp(`data-action="acknowledge" data-entry-id="${e.id}" data-platform-id="p1"`));
  assert.match(out, new RegExp(`data-action="acknowledgeAll" data-keys="${e.id}\\|p1"`));
  assert.match(out, /<strong>title<\/strong>: Fire → Fire \(Sam\)/);
  assert.match(out, /data-action="go" data-view="platform" data-id="p1" data-tab="reviews"/);
});

test('Acknowledge all acts on the rows shown: a filter that hides every row leaves no button', () => {
  const filtered = homeView({ ...state, tables: { homeAcks: { filters: { who: 'nobody' } } } }, data()).toString();
  assert.doesNotMatch(filtered, /data-action="acknowledgeAll"/);
});

test('empty sections say so; everyone shows every platform', () => {
  const none = homeView({ ...state, homeOwner: 'u3' }, data()).toString();
  assert.match(none, /Nothing to acknowledge\./);
  assert.match(none, /No reviews due\./);
  const everyone = homeView({ ...state, homeOwner: 'everyone' }, data()).toString();
  assert.match(everyone, /<option value="everyone" selected>/);
  assert.match(everyone, /2 changes to acknowledge/);
});

test('before and after values are shown literally', () => {
  const out = homeView(state, data('<b>x</b>')).toString();
  assert.match(out, /Fire → &lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(out, /<b>x<\/b>/);
});

test('the nav leads with Home and counts my waiting changes; Home is routed', () => {
  const d = data();
  const out = renderApp({ ...state, session: { base: d, working: d, loadedStamp: null }, view: { name: 'home' } });
  assert.match(out, /<nav><button type="button" class="nav on" data-action="go" data-view="home">Home \(1\)<\/button>/);
  assert.match(out, /<h1>Home<\/h1>/);
});

test('a platform page says how many changes wait there, linking to Home for its owner', () => {
  const out = platformView(state, data(), 'p1').toString();
  assert.match(out, /data-action="setHomeOwner" data-owner-id="u1" data-show="home">1 change to acknowledge</);
  assert.doesNotMatch(platformView(state, assignNumbers(seed()), 'p1').toString(), /to acknowledge/);
});
```

(Move the new `import` lines to the top of the file with the existing one.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/ui/screens-home.test.js`
Expected: FAIL — cannot find module `src/ui/screens/home.js`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/screens/home.js`:

```js
import { html } from '../html.js';
import { dataAttrs, option, go, reviewTag, changeDetail, idTag } from './common.js';
import { dataTable, shownRows } from './table.js';
import { openItems } from '../../core/queries.js';
import { get } from '../../core/data.js';
import { hazardLabel } from '../../core/ids.js';
import { profileName, when, day, recordName, KIND_LABEL } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** @param {number} n @param {string} one @param {string} many */
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Whose items Home shows: the active profile for "me", nobody in particular (null) for everyone. @param {any} state */
export function homeOwnerId(state) {
  const o = state.homeOwner || 'me';
  return o === 'everyone' ? null : o === 'me' ? state.profileId : o;
}

/** @param {Data} data @param {any} entry what the change did, record by record */
function entryDetail(data, entry) {
  return html`<ul class="plain">${entry.items.map((/** @type {any} */ i) => html`<li><strong>${KIND_LABEL[/** @type {keyof typeof KIND_LABEL} */ (i.kind)] ?? i.kind}: ${recordName(i.kind, get(data, i.kind, i.id))}</strong> ${changeDetail(i)}</li>`)}</ul>`;
}

/** @param {any} p a platform @param {string} [tab] */
const platformLink = (p, tab) => go(p.name, 'platform', { id: p.id, ...(tab ? { tab } : {}) });

/**
 * The Home page: what is left to do on one owner's platforms (or everyone's).
 * @param {any} state @param {Data} data
 */
export function homeView(state, data) {
  const owner = state.homeOwner || 'me';
  const items = openItems(data, state.today, homeOwnerId(state));
  const platformOptions = [...new Map(items.acks.map((a) => [a.platform.id, a.platform.name]))];
  const ackSpec = {
    id: 'homeAcks',
    rowKey: (/** @type {any} */ r) => `${r.entry.id}|${r.platform.id}`,
    rows: items.acks,
    empty: 'Nothing to acknowledge.',
    columns: [
      { key: 'when', label: 'When', width: 200, minWidth: 150, value: (/** @type {any} */ r) => r.entry.at, render: (/** @type {any} */ r) => when(r.entry.at) },
      { key: 'who', label: 'Who', width: 200, minWidth: 110, value: (/** @type {any} */ r) => profileName(state, r.entry.by), filter: /** @type {const} */ ('text') },
      { key: 'platform', label: 'Platform', width: 240, minWidth: 130, value: (/** @type {any} */ r) => r.platform.name, filter: /** @type {const} */ ('select'),
        options: /** @type {[string, string][]} */ (platformOptions), match: (/** @type {any} */ r, /** @type {string} */ v) => r.platform.id === v, render: (/** @type {any} */ r) => platformLink(r.platform) },
      { key: 'what', label: 'What', width: 260, minWidth: 140, value: (/** @type {any} */ r) => r.entry.action, filter: /** @type {const} */ ('text') },
      { key: 'detail', label: 'Changes', width: 640, minWidth: 260, sortable: false, render: (/** @type {any} */ r) => entryDetail(data, r.entry) },
      { key: 'ack', label: '', width: 170, minWidth: 140, sortable: false,
        render: (/** @type {any} */ r) => html`<button type="button" ${dataAttrs({ action: 'acknowledge', 'entry-id': r.entry.id, 'platform-id': r.platform.id })}>Acknowledge</button>` },
    ],
  };
  const keys = shownRows(state, ackSpec).map((r) => `${r.entry.id}|${r.platform.id}`);
  const overdue = items.reviews.filter((r) => r.state === 'overdue').length;
  const dueSoon = items.reviews.filter((r) => r.state === 'dueSoon').length;
  const summary = [
    count(items.acks.length, 'change to acknowledge', 'changes to acknowledge'),
    count(overdue, 'review overdue', 'reviews overdue'),
    ...(dueSoon ? [count(dueSoon, 'review due soon', 'reviews due soon')] : []),
    count(items.awaiting.length, 'control awaiting', 'controls awaiting'),
    count(items.unrated.length, 'hazard unrated', 'hazards unrated'),
  ].join(' · ');
  const hazardCell = (/** @type {any} */ r) => html`<span class="id">${idTag(hazardLabel(r.hazard))}</span> ${go(r.hazard.title, 'hazard', { id: r.hazard.id })}`;
  return html`<div class="head"><h1>Home</h1>
      <label class="owner-pick">Owner <select name="ownerId" ${dataAttrs({ change: 'setHomeOwner' })}>
        ${option('me', 'Me', owner)}${state.profiles.filter((/** @type {any} */ p) => p.id !== state.profileId).map((/** @type {any} */ p) => option(p.id, p.name, owner))}${option('everyone', 'Everyone', owner)}
      </select></label></div>
    <p class="muted home-summary">${summary}</p>
    <article class="doc">
      <div class="home-h"><h2>Changes to acknowledge</h2>${keys.length ? html`<button type="button" ${dataAttrs({ action: 'acknowledgeAll', keys: keys.join(',') })}>Acknowledge all shown (${keys.length})</button>` : ''}</div>
      <section class="block">${dataTable(state, ackSpec)}</section>
      <div class="home-h"><h2>Reviews</h2></div>
      <section class="block">${dataTable(state, {
        id: 'homeReviews', rowKey: (r) => r.platform.id, rows: items.reviews, empty: 'No reviews due.',
        columns: [
          { key: 'platform', label: 'Platform', width: 360, minWidth: 160, value: (r) => r.platform.name, render: (r) => platformLink(r.platform, 'reviews') },
          { key: 'due', label: 'Next due', width: 300, minWidth: 160, value: (r) => r.due, render: (r) => (r.due ? html`${day(r.due)}${reviewTag(r.state)}` : '—') },
          { key: 'last', label: 'Last reviewed', width: 240, minWidth: 140, value: (r) => r.lastReviewed, render: (r) => (r.lastReviewed ? day(r.lastReviewed) : html`<span class="muted">Never</span>`) },
          { key: 'open', label: 'Review', width: 220, minWidth: 120, value: (r) => (r.open ? 'In progress' : ''), render: (r) => (r.open ? 'In progress' : '') },
        ],
      })}</section>
      <div class="home-h"><h2>Controls awaiting a decision</h2></div>
      <section class="block">${dataTable(state, {
        id: 'homeAwaiting', rowKey: (r) => `${r.platform.id}|${r.hazard.id}|${r.control.id}`, rows: items.awaiting, empty: 'No controls awaiting a decision.',
        columns: [
          { key: 'platform', label: 'Platform', width: 300, minWidth: 140, value: (r) => r.platform.name, filter: 'text', render: (r) => platformLink(r.platform) },
          { key: 'hazard', label: 'Hazard', width: 520, minWidth: 200, value: (r) => `${hazardLabel(r.hazard)} ${r.hazard.title}`, filter: 'text', render: hazardCell },
          { key: 'control', label: 'Control', width: 520, minWidth: 200, value: (r) => r.control.title, filter: 'text', render: (r) => go(r.control.title, 'control', { id: r.control.id }) },
        ],
      })}</section>
      <div class="home-h"><h2>Hazards without ratings</h2></div>
      <section class="block">${dataTable(state, {
        id: 'homeUnrated', rowKey: (r) => `${r.platform.id}|${r.hazard.id}`, rows: items.unrated, empty: 'Every hazard is rated.',
        columns: [
          { key: 'platform', label: 'Platform', width: 300, minWidth: 140, value: (r) => r.platform.name, filter: 'text', render: (r) => platformLink(r.platform) },
          { key: 'hazard', label: 'Hazard', width: 520, minWidth: 200, value: (r) => `${hazardLabel(r.hazard)} ${r.hazard.title}`, filter: 'text', render: hazardCell },
          { key: 'missing', label: 'Missing', width: 280, minWidth: 140, value: (r) => r.missing,
            render: (r) => ({ both: 'Initial and residual', initial: 'Initial', residual: 'Residual' })[/** @type {'both'} */ (r.missing)] },
        ],
      })}</section>
    </article>`;
}
```

In `src/ui/render.js`, add `import { homeView } from './screens/home.js';` and the case `case 'home': return homeView(state, data);` in `mainView`.

In `src/ui/screens/common.js`:

- add `import { waitingChanges } from '../../core/acks.js';` and `import { live } from '../../core/data.js';`;
- change `NAV` to start with `['home', 'Home']`, and add `home: 'home'` to `SECTION`;
- in `shell`, before the `return`, add:

```js
  // Home counts the changes waiting on the active profile's platforms.
  const data = state.session?.working;
  const waiting = data && state.profileId
    ? live(data, 'platform').filter((p) => p.ownerId === state.profileId).reduce((n, p) => n + waitingChanges(data, p.id).length, 0)
    : 0;
```

- and render each nav label as `${view === 'home' && waiting ? `${label} (${waiting})` : label}`.

In `src/ui/screens/platforms.js`, add `import { waitingChanges } from '../../core/acks.js';`, and directly after `${reviewLine(state, data, p)}` add:

```js
      ${(() => {
        const n = waitingChanges(data, id).length;
        return n ? html`<p class="doc-meta"><button type="button" class="link" ${dataAttrs({ action: 'setHomeOwner', 'owner-id': p.ownerId, show: 'home' })}>${n} ${n === 1 ? 'change' : 'changes'} to acknowledge</button></p>` : '';
      })()}
```

Append to `src/ui/styles.css`:

```css
/* Home */
.owner-pick select { margin-left: 6px; }
.home-summary { margin: 0 0 6px; }
.home-h { display: flex; align-items: center; gap: 14px; margin: 26px 0 8px; }
.home-h h2 { margin: 0; }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/ui/screens-home.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass. The render test's nav expectations may need `Home` added first; update them to the new nav.

```bash
git add src/ui/screens/home.js src/ui/render.js src/ui/screens/common.js src/ui/screens/platforms.js src/ui/styles.css test/ui/screens-home.test.js
git commit -m "The Home page: changes to acknowledge (one or all shown), reviews due, controls awaiting a decision and unrated hazards, for me, anyone or everyone; Home leads the nav with a count, and platform pages say what waits

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Build, and a check in the browser

**Files:** none beyond fixes found.

- [ ] **Step 1: Build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass; `OK wrote …/dist/pivot.html`.

- [ ] **Step 2: Check it in a real browser**

Serve `dist/` (`python3 -m http.server <port> --directory dist`) and drive it with the Playwright MCP tools, replacing the pickers with the browser's private file system as in 2a (`window.showDirectoryPicker = async () => navigator.storage.getDirectory()`). Check:

1. Pick a profile: Pivot opens on **Home**; the Save button reads *Saved* (nothing unsaved).
2. As Ada, create a platform and a hazard on it; save. Open a second page as a new profile Grace (same private file system), rename the hazard, save. Back as Ada, save (merges): **Home (1)** in the nav; the change appears with its before → after; the platform page says *1 change to acknowledge*.
3. Filter the Who column to a name that matches nothing: the *Acknowledge all shown* button disappears. Clear it; click it: the list empties and the nav count goes.
4. Set a review schedule in the past on the platform: it appears under Reviews with the Overdue badge; controls awaiting and unrated hazards list their rows, and each link opens the right page.
5. Switch the Owner to Everyone and back; check both themes.

Fix anything that does not behave as described, with a test where the fault is in rendering or the controller.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A src test
git commit -m "Home: fixes from the browser check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
