# Pivot Release 2a: Platform Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each platform a review schedule (a period in months and a next due date) with due-soon and overdue flags, a review checklist per platform that moves the due date on when completed, and a warning (never a block) when producing a report for an overdue platform.

**Architecture:** Two new record kinds (`review`, `reviewRow`) and two new platform fields (`reviewMonths`, `reviewDue`) in the existing data file, changed only through pure ops in a new `src/core/ops/reviews.js`, guarded by four new cross-record rules that the existing three-way merge already enforces. Derived views live in `src/core/queries.js`; the screens are string-rendering functions as before, with the review parts of the platform page in a new `src/ui/screens/reviews.js`.

**Tech Stack:** Plain ES modules, JSDoc types checked by `tsc --checkJs`, `node:test`, no runtime dependency, no UI framework.

**Spec:** `docs/superpowers/specs/2026-09-29-pivot-release-2a-reviews-design.md` (read it before starting; the rebuild design `docs/superpowers/specs/2026-09-28-pivot-rebuild-design.md` gives the architecture it extends).

## Global Constraints

- Nothing in `src/` calls `Date.now()` except `systemClock` in `src/core/time.js`. Core ops never read the clock; they receive `act = { by: profileId, at: AEST timestamp }`.
- Dates are AEST calendar dates `YYYY-MM-DD`; timestamps `YYYY-MM-DDTHH:mm:ss+10:00`. Dates compare as strings.
- A review period is a whole number of months from `1` to `120`. There is no default period.
- "Due soon" means the due date is within `30` days of today, inclusive. "Overdue" starts the day after the due date.
- Nothing is removed from `data.json`: delete and abandon set `status: 'deleted'`.
- A review's open/completed field is `state` (`'open' | 'completed'`); `status` stays the record header's `live | retired | deleted`.
- The schema version stays `2`; `normalizeData` brings older files up to date.
- Producing a report is never blocked by a review state.
- Every piece of user text written into HTML passes through the `html` tagged template (`src/ui/html.js`).
- No runtime dependency. TypeScript `5.9.3` is the only development dependency.
- Commands: `npm test`, `npm run typecheck`, `npm run build`. All three pass at the end of every task.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on a branch (`release-2a-reviews`), not `main`.

## Review Focus

1. **A review completed several periods late** (due 2025-01-31 every 6 months, completed 2026-09-28). Expect the platform not to read overdue afterwards: the due date moves on in whole periods from the old due date until it is after the completion date (2027-01-31 here, skipping 2025-07-31, 2026-01-31 and 2026-07-31). Pinned in Task 3.
2. **A platform with no hazards is reviewed.** Expect the review to start and complete normally with an empty checklist, and the due date to move on. Pinned in Task 3.
3. **A hazard is unlinked from the platform during a review, then linked back.** Expect its row, tick and note to be kept, shown as "no longer on this platform" while unlinked, and live again once relinked. Pinned in Task 5.
4. **The due date is cleared in place** (the date input emptied on the platform page). Expect a clear message and the schedule left as it was, not a half-set schedule. Pinned in Task 7.
5. **Notes and outcomes with markup characters** (`<b>`, `&`, `"`). Expect them shown literally in the checklist, the completed review and the past-reviews table. Pinned in Task 9.

## File Structure

```
src/core/time.js            + isDate, addDays, addMonths, DUE_SOON_DAYS, reviewState
src/core/data.js            + review, reviewRow kinds; normalizeData gives platforms reviewMonths/reviewDue
src/core/ids.js             + ids.reviewRow
src/core/ops/platforms.js   createPlatform sets the two fields; retire/delete abandon an open review
src/core/ops/reviews.js     NEW: setSchedule, startReview, markRow, setReviewOutcome, completeReview, abandonReview
src/core/rules.js           + four review rules
src/core/queries.js         + platformsReached for review kinds; openReview, reviewRows, completedReviews,
                              lastReviewed, hazardLastReviewed, reviewDueList
src/reports/snapshot.js     + review block
src/ui/names.js             + day(), KIND_LABEL entries
src/ui/controller.js        + edits and handlers, state.today, state.reportPlatformId, go(reviewId)
src/ui/mount.js             a checkbox's change sends "true"/"false"
src/ui/screens/common.js    pageTabs takes extra tabs; reviewTag
src/ui/screens/reviews.js   NEW: reviewLine (Details tab) and reviewsTab (Reviews tab)
src/ui/screens/platforms.js Next review column; review line; Reviews tab; History hides row-level actions
src/ui/screens/hazards.js   Last reviewed column on the hazard page's Platforms table
src/ui/screens/reports.js   review note beside Produce; Overdue badge on produced reports
src/ui/styles.css           review badges, the review line, the outcome box
test/core/dates.test.js           NEW
test/core/reviews-data.test.js    NEW
test/core/ops/reviews.test.js     NEW
test/core/reviews-merge.test.js   NEW
test/core/reviews-queries.test.js NEW
test/core/random-edits.js         + review ops
test/reports/snapshot.test.js     + review block
test/ui/controller-reviews.test.js NEW
test/ui/screens-reviews.test.js    NEW
```

---

### Task 1: Calendar dates and review state

**Files:**
- Modify: `src/core/time.js` (append after `fixedClock`)
- Test: `test/core/dates.test.js` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `isDate(s: unknown): boolean` — a real calendar date `YYYY-MM-DD`.
  - `addDays(date: string, n: number): string`
  - `addMonths(date: string, n: number): string` — clamps to the month's last day; the day does not come back.
  - `DUE_SOON_DAYS = 30`
  - `reviewState(platform: { reviewMonths?: number | null, reviewDue?: string | null }, today: string): 'none' | 'ok' | 'dueSoon' | 'overdue'`
  - `addDays`/`addMonths` throw `RangeError` for a date that is not real.

- [ ] **Step 1: Write the failing test**

Create `test/core/dates.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDate, addDays, addMonths, reviewState, DUE_SOON_DAYS } from '../../src/core/time.js';

test('isDate accepts real calendar dates only', () => {
  assert.equal(isDate('2026-02-28'), true);
  assert.equal(isDate('2028-02-29'), true);
  assert.equal(isDate('2026-02-29'), false);
  assert.equal(isDate('2026-13-01'), false);
  assert.equal(isDate('2026-1-01'), false);
  assert.equal(isDate(''), false);
  assert.equal(isDate(null), false);
});

test('addDays crosses months and years', () => {
  assert.equal(addDays('2026-09-28', 30), '2026-10-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('addMonths clamps to the last day of a short month, and the day does not come back', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-02-28', 1), '2026-03-28');
  assert.equal(addMonths(addMonths('2026-01-31', 1), 1), '2026-03-28');
  assert.equal(addMonths('2028-02-29', 12), '2029-02-28');
  assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(addMonths('2026-05-31', 120), '2036-05-31');
  assert.throws(() => addMonths('2026-02-30', 1), RangeError);
});

test('reviewState: none without a schedule; due soon within 30 days; overdue from the day after', () => {
  assert.equal(DUE_SOON_DAYS, 30);
  assert.equal(reviewState({ reviewMonths: null, reviewDue: null }, '2026-09-28'), 'none');
  assert.equal(reviewState({}, '2026-09-28'), 'none');
  const p = { reviewMonths: 6, reviewDue: '2026-09-28' };
  assert.equal(reviewState(p, '2026-09-28'), 'dueSoon', 'due today is not yet overdue');
  assert.equal(reviewState(p, '2026-09-29'), 'overdue');
  assert.equal(reviewState({ reviewMonths: 6, reviewDue: '2026-10-28' }, '2026-09-28'), 'dueSoon', '30 days out');
  assert.equal(reviewState({ reviewMonths: 6, reviewDue: '2026-10-29' }, '2026-09-28'), 'ok', '31 days out');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/core/dates.test.js`
Expected: FAIL — `isDate` is not exported from `time.js`.

- [ ] **Step 3: Write the implementation**

Append to `src/core/time.js`:

```js
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** @param {unknown} s @returns {boolean} whether `s` is a real calendar date `YYYY-MM-DD` */
export function isDate(s) {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** @param {string} date @returns {[number, number, number]} */
function dateParts(date) {
  if (!isDate(date)) throw new RangeError(`not a date: ${String(date)}`);
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
}

/** @param {number} y @param {number} m 1-12 @param {number} d */
const dateOf = (y, m, d) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** @param {string} date `YYYY-MM-DD` @param {number} n @returns {string} */
export function addDays(date, n) {
  const [y, m, d] = dateParts(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * Calendar months. A day the target month lacks becomes its last day, and the day does not come
 * back later: 31 Jan + 1 = 28 Feb, and 28 Feb + 1 = 28 Mar.
 * @param {string} date `YYYY-MM-DD` @param {number} n @returns {string}
 */
export function addMonths(date, n) {
  const [y, m, d] = dateParts(date);
  const total = y * 12 + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return dateOf(ty, tm, Math.min(d, last));
}

/** A review is "due soon" when its date is this many days away or fewer. */
export const DUE_SOON_DAYS = 30;

/**
 * @param {{ reviewMonths?: number | null, reviewDue?: string | null }} platform
 * @param {string} today `YYYY-MM-DD`, AEST
 * @returns {'none' | 'ok' | 'dueSoon' | 'overdue'}
 */
export function reviewState(platform, today) {
  const due = platform.reviewDue;
  if (!platform.reviewMonths || !due) return 'none';
  if (today > due) return 'overdue';
  if (due <= addDays(today, DUE_SOON_DAYS)) return 'dueSoon';
  return 'ok';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/core/dates.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src/core/time.js test/core/dates.test.js
git commit -m "Calendar dates for reviews: month arithmetic that clamps to the month's end, and a platform's review state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The data model for reviews

**Files:**
- Modify: `src/core/data.js` (`KINDS`, `normalizeData`)
- Modify: `src/core/ids.js` (`ids`)
- Modify: `src/core/ops/platforms.js:10-13` (`createPlatform`)
- Modify: `src/core/queries.js` (`platformsReached`; add `openReview`)
- Modify: `src/ui/names.js` (`KIND_LABEL`)
- Test: `test/core/reviews-data.test.js` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `KINDS` includes `'review'` and `'reviewRow'` (in that order, at the end).
  - `ids.reviewRow(reviewId: string, hazardId: string): string` → `rr:<review>:<hazard>`.
  - Every platform has `reviewMonths: number | null` and `reviewDue: string | null` (new platforms from `createPlatform`, older ones from `normalizeData`).
  - `platformsReached(data, 'review', rec)` → `[rec.platformId]`; `platformsReached(data, 'reviewRow', rec)` → the platform of `rec.reviewId`'s review, or `[]`.
  - `openReview(data, platformId): Rec | null` — the live review with `state === 'open'` on that platform.
  - Record shapes (created by Task 3's ops):
    - review: `{ platformId, state: 'open' | 'completed', outcome: string, dueBefore: string | null, dueAfter: string | null, completedBy: string | null, completedAt: string | null }`
    - reviewRow: `{ reviewId, hazardId, reviewed: boolean, note: string }`

- [ ] **Step 1: Write the failing test**

Create `test/core/reviews-data.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, emptyData, normalizeData, validateData, put, created } from '../../src/core/data.js';
import { ids } from '../../src/core/ids.js';
import { platformsReached, openReview } from '../../src/core/queries.js';
import { createPlatform } from '../../src/core/ops/platforms.js';
import { KIND_LABEL } from '../../src/ui/names.js';
import { act, seed } from '../helpers.js';

test('reviews and their rows are record kinds', () => {
  assert.ok(KINDS.includes('review'));
  assert.ok(KINDS.includes('reviewRow'));
  assert.deepEqual(emptyData().records.review, {});
  assert.equal(ids.reviewRow('r1', 'h1'), 'rr:r1:h1');
  assert.equal(KIND_LABEL.review, 'Review');
  assert.equal(KIND_LABEL.reviewRow, 'Review row');
});

test('a new platform has no review schedule', () => {
  const d = createPlatform(emptyData(), act, { id: 'p9', name: 'Spare', ownerId: 'u1' });
  assert.equal(d.records.platform.p9.reviewMonths, null);
  assert.equal(d.records.platform.p9.reviewDue, null);
});

test('an older data file gains the review kinds and platform fields on load, and still validates', () => {
  const old = emptyData();
  delete old.records.review;
  delete old.records.reviewRow;
  old.records.platform.p1 = created(act, 'p1', { number: 1, name: 'Alpha', ownerId: 'u1' });
  const d = normalizeData(old);
  assert.deepEqual(d.records.review, {});
  assert.deepEqual(d.records.reviewRow, {});
  assert.equal(d.records.platform.p1.reviewMonths, null);
  assert.equal(d.records.platform.p1.reviewDue, null);
  assert.deepEqual(validateData(d), []);
  const scheduled = { ...d.records.platform.p1, reviewMonths: 6, reviewDue: '2026-12-31' };
  const again = normalizeData(put(d, 'platform', scheduled));
  assert.equal(again.records.platform.p1.reviewMonths, 6, 'a schedule already there is kept');
});

test('a review and its rows reach their platform; openReview finds the open one', () => {
  let d = seed();
  d = put(d, 'review', created(act, 'r1', { platformId: 'p1', state: 'open', outcome: '', dueBefore: null, dueAfter: null, completedBy: null, completedAt: null }));
  const row = created(act, ids.reviewRow('r1', 'h1'), { reviewId: 'r1', hazardId: 'h1', reviewed: true, note: '' });
  assert.deepEqual(platformsReached(d, 'review', d.records.review.r1), ['p1']);
  assert.deepEqual(platformsReached(d, 'reviewRow', row), ['p1']);
  assert.deepEqual(platformsReached(d, 'reviewRow', { ...row, reviewId: 'gone' }), []);
  assert.equal(openReview(d, 'p1')?.id, 'r1');
  assert.equal(openReview(d, 'p2'), null);
  d = put(d, 'review', { ...d.records.review.r1, state: 'completed' });
  assert.equal(openReview(d, 'p1'), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/core/reviews-data.test.js`
Expected: FAIL — `KINDS` does not include `'review'`.

- [ ] **Step 3: Write the implementation**

In `src/core/data.js`, replace the `KINDS` constant:

```js
export const KINDS = Object.freeze([
  'hazard', 'causalFactor', 'consequence', 'control', 'platform',
  'hazardControl', 'hazardPlatform', 'ruling', 'rating', 'report',
  'review', 'reviewRow',
]);
```

In `normalizeData`, after the line `for (const k of KINDS) if (!isObject(records[k])) records[k] = {};` add:

```js
  // Platforms written before reviews existed have no schedule.
  records.platform = Object.fromEntries(Object.entries(records.platform).map(([id, p]) => [
    id, isObject(p) && !('reviewDue' in p) ? { ...p, reviewMonths: null, reviewDue: null } : p,
  ]));
```

In `src/core/ids.js`, add to the `ids` object after `rating`:

```js
  /** @param {string} r a review id @param {string} h */
  reviewRow: (r, h) => `rr:${r}:${h}`,
```

In `src/core/ops/platforms.js`, `createPlatform`, change the `created(...)` fields to:

```js
  const rec = created(act, id, { number: null, name: needText(name, 'A platform name'), ownerId: needText(ownerId, 'A platform owner'), reviewMonths: null, reviewDue: null });
```

In `src/core/queries.js`, `platformsReached`, add two cases before `default`:

```js
    case 'review': return [rec.platformId];
    case 'reviewRow': {
      const review = get(data, 'review', rec.reviewId);
      return review ? [review.platformId] : [];
    }
```

and append to `src/core/queries.js`:

```js
/** The review in progress on a platform, if any. @param {Data} data @param {string} platformId @returns {Rec | null} */
export function openReview(data, platformId) {
  return live(data, 'review').find((r) => r.platformId === platformId && r.state === 'open') ?? null;
}
```

In `src/ui/names.js`, add to `KIND_LABEL` after `report: 'Report',`:

```js
  review: 'Review', reviewRow: 'Review row',
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/core/reviews-data.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass. If a test pins the exact fields of a created platform or of its "Create platform" history item, add `reviewMonths: null, reviewDue: null` to its expectation (the new fields are correct).

```bash
git add src/core/data.js src/core/ids.js src/core/ops/platforms.js src/core/queries.js src/ui/names.js test/core/reviews-data.test.js
git commit -m "Reviews in the data model: review and review-row records, and a review schedule on every platform (empty by default, added to older files on load)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Review operations

**Files:**
- Create: `src/core/ops/reviews.js`
- Modify: `src/core/ops/platforms.js` (`retirePlatform`, `deletePlatform`)
- Test: `test/core/ops/reviews.test.js` (create)

**Interfaces:**
- Consumes: `addMonths`, `isDate`, `aestDate` (`src/core/time.js`); `ids.reviewRow`; `openReview` (`src/core/queries.js`); `commit` (`src/core/apply.js`); `get, live, created, changed, need` (`src/core/data.js`).
- Produces (each `(data, act, args) => data`, appending one history entry whose `platforms` is the review's platform):
  - `setSchedule(data, act, { platformId, months?, due? })` — both given sets them; both absent/empty clears them. Action `'Set review schedule'` or `'Remove review schedule'`. `months` may be a numeric string.
  - `startReview(data, act, { id?, platformId })` — action `'Start review'`.
  - `markRow(data, act, { reviewId, hazardId, reviewed?, note? })` — action `'Mark review row'`.
  - `setReviewOutcome(data, act, { reviewId, outcome })` — action `'Set review outcome'`.
  - `completeReview(data, act, { reviewId })` — action `'Complete review'`.
  - `abandonReview(data, act, { reviewId })` — action `'Abandon review'`.
  - `abandonRecs(data, act, review): { kind, rec }[]` — the review and its live rows, marked deleted.
  - `MAX_REVIEW_MONTHS = 120`
  - `REVIEW_DETAIL_ACTIONS = ['Mark review row', 'Set review outcome']`
  - Error codes (`PivotError.code`): `review.months`, `review.due`, `platform.retired`, `review.open`, `review.completed`, `review.hazard`, `review.no-schedule`, `not-found`.

- [ ] **Step 1: Write the failing test**

Create `test/core/ops/reviews.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { ids } from '../../../src/core/ids.js';
import { entries } from '../../../src/core/history.js';
import { openReview } from '../../../src/core/queries.js';
import { linkHazard, retirePlatform, deletePlatform, createPlatform } from '../../../src/core/ops/platforms.js';
import {
  setSchedule, startReview, markRow, setReviewOutcome, completeReview, abandonReview, MAX_REVIEW_MONTHS, REVIEW_DETAIL_ACTIONS,
} from '../../../src/core/ops/reviews.js';
import { act, later, seed } from '../../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
/** p1 Alpha (h1 on it) reviewed every 6 months, next due 2026-10-31. */
const scheduled = () => setSchedule(seed(), act, { platformId: 'p1', months: 6, due: '2026-10-31' });
const started = () => startReview(scheduled(), act, { id: 'r1', platformId: 'p1' });

test('a schedule is a whole number of months from 1 to 120 and a real date, set together or cleared together', () => {
  const d = scheduled();
  assert.equal(d.records.platform.p1.reviewMonths, 6);
  assert.equal(d.records.platform.p1.reviewDue, '2026-10-31');
  assert.equal(entries(d).at(-1).action, 'Set review schedule');
  assert.equal(setSchedule(seed(), act, { platformId: 'p1', months: '3', due: '2026-10-31' }).records.platform.p1.reviewMonths, 3, 'a form sends text');
  assert.equal(MAX_REVIEW_MONTHS, 120);
  for (const months of [0, 121, 1.5, 'x', '']) {
    assert.throws(() => setSchedule(seed(), act, { platformId: 'p1', months, due: '2026-10-31' }), code('review.months'), `months ${months}`);
  }
  assert.throws(() => setSchedule(seed(), act, { platformId: 'p1', months: 6, due: '2026-02-30' }), code('review.due'));
  assert.throws(() => setSchedule(seed(), act, { platformId: 'p1', months: 6, due: '' }), code('review.due'));
  const cleared = setSchedule(d, later, { platformId: 'p1' });
  assert.equal(cleared.records.platform.p1.reviewMonths, null);
  assert.equal(cleared.records.platform.p1.reviewDue, null);
  assert.equal(entries(cleared).at(-1).action, 'Remove review schedule');
});

test('one review at a time per platform, and only on a live platform', () => {
  const d = started();
  const r = d.records.review.r1;
  assert.deepEqual(
    { platformId: r.platformId, state: r.state, outcome: r.outcome, dueBefore: r.dueBefore, dueAfter: r.dueAfter, completedBy: r.completedBy, completedAt: r.completedAt },
    { platformId: 'p1', state: 'open', outcome: '', dueBefore: null, dueAfter: null, completedBy: null, completedAt: null },
  );
  assert.throws(() => startReview(d, later, { platformId: 'p1' }), code('review.open'));
  assert.doesNotThrow(() => startReview(d, later, { platformId: 'p2' }), 'another platform is separate');
  assert.throws(() => startReview(retirePlatform(scheduled(), act, { id: 'p2' }), act, { platformId: 'p2' }), code('platform.retired'));
});

test('ticking and noting a hazard, which must be on the platform', () => {
  let d = markRow(started(), later, { reviewId: 'r1', hazardId: 'h1', reviewed: true });
  const id = ids.reviewRow('r1', 'h1');
  assert.deepEqual({ reviewed: d.records.reviewRow[id].reviewed, note: d.records.reviewRow[id].note }, { reviewed: true, note: '' });
  d = markRow(d, later, { reviewId: 'r1', hazardId: 'h1', note: '  Checked with the crew  ' });
  assert.deepEqual({ reviewed: d.records.reviewRow[id].reviewed, note: d.records.reviewRow[id].note }, { reviewed: true, note: 'Checked with the crew' }, 'a note keeps the tick');
  assert.deepEqual(entries(d).at(-1).platforms, ['p1']);
  assert.throws(() => markRow(d, later, { reviewId: 'r1', hazardId: 'h2', reviewed: true }), code('review.hazard'), 'h2 is on no platform');
  const linked = linkHazard(d, later, { hazardId: 'h2', platformId: 'p1' });
  assert.doesNotThrow(() => markRow(linked, later, { reviewId: 'r1', hazardId: 'h2', reviewed: true }), 'a hazard linked during the review can be ticked');
  assert.deepEqual(REVIEW_DETAIL_ACTIONS, ['Mark review row', 'Set review outcome']);
});

test('completing moves the due date on from the old due date by one period, and records the review', () => {
  let d = setReviewOutcome(started(), later, { reviewId: 'r1', outcome: 'All current' });
  d = completeReview(d, later, { reviewId: 'r1' });
  const r = d.records.review.r1;
  assert.deepEqual(
    { state: r.state, outcome: r.outcome, dueBefore: r.dueBefore, dueAfter: r.dueAfter, completedBy: r.completedBy, completedAt: r.completedAt },
    { state: 'completed', outcome: 'All current', dueBefore: '2026-10-31', dueAfter: '2027-04-30', completedBy: 'u2', completedAt: later.at },
  );
  assert.equal(d.records.platform.p1.reviewDue, '2027-04-30');
  const row = d.records.reviewRow[ids.reviewRow('r1', 'h1')];
  assert.deepEqual({ reviewed: row.reviewed, note: row.note }, { reviewed: false, note: '' }, 'an unticked hazard is recorded as not reviewed');
  assert.equal(entries(d).at(-1).action, 'Complete review');
});

test('an early review does not push the schedule out, and month-end clamping does not come back', () => {
  let d = setSchedule(seed(), act, { platformId: 'p1', months: 1, due: '2027-01-31' });
  d = startReview(d, act, { id: 'r1', platformId: 'p1' });
  d = completeReview(d, act, { reviewId: 'r1' });
  assert.equal(d.records.platform.p1.reviewDue, '2027-02-28', 'completed four months early, still one period on from the due date');
  d = startReview(d, act, { id: 'r2', platformId: 'p1' });
  d = completeReview(d, act, { reviewId: 'r2' });
  assert.equal(d.records.platform.p1.reviewDue, '2027-03-28');
});

test('a review completed more than a period late moves on in whole periods until the date is after the completion', () => {
  let d = setSchedule(seed(), act, { platformId: 'p1', months: 6, due: '2025-01-31' });
  d = startReview(d, act, { id: 'r1', platformId: 'p1' });
  d = completeReview(d, act, { reviewId: 'r1' });
  assert.equal(d.records.review.r1.dueBefore, '2025-01-31');
  assert.equal(d.records.platform.p1.reviewDue, '2027-01-31', 'act is 2026-09-28: 2025-07-31, 2026-01-31 and 2026-07-31 are all past');
  d = setSchedule(d, act, { platformId: 'p1', months: 6, due: '2026-09-01' });
  d = startReview(d, act, { id: 'r2', platformId: 'p1' });
  d = completeReview(d, act, { reviewId: 'r2' });
  assert.equal(d.records.platform.p1.reviewDue, '2027-03-01', 'a little late: one period on, not pulled forward to today');
});

test('a platform with no hazards can be reviewed', () => {
  let d = createPlatform(seed(), act, { id: 'p9', name: 'Empty', ownerId: 'u1' });
  d = setSchedule(d, act, { platformId: 'p9', months: 12, due: '2026-12-01' });
  d = startReview(d, act, { id: 'r9', platformId: 'p9' });
  d = completeReview(d, act, { reviewId: 'r9' });
  assert.equal(d.records.review.r9.state, 'completed');
  assert.equal(d.records.platform.p9.reviewDue, '2027-12-01');
  assert.equal(Object.values(d.records.reviewRow).filter((r) => r.reviewId === 'r9').length, 0);
});

test('completing needs a schedule; a completed review cannot be changed', () => {
  const noSchedule = startReview(seed(), act, { id: 'r1', platformId: 'p1' });
  assert.throws(() => completeReview(noSchedule, act, { reviewId: 'r1' }), code('review.no-schedule'));
  const done = completeReview(started(), act, { reviewId: 'r1' });
  assert.throws(() => markRow(done, later, { reviewId: 'r1', hazardId: 'h1', reviewed: true }), code('review.completed'));
  assert.throws(() => setReviewOutcome(done, later, { reviewId: 'r1', outcome: 'x' }), code('review.completed'));
  assert.throws(() => completeReview(done, later, { reviewId: 'r1' }), code('review.completed'));
  assert.throws(() => abandonReview(done, later, { reviewId: 'r1' }), code('review.completed'));
});

test('abandoning deletes the review and its rows, and another can then be started', () => {
  let d = markRow(started(), later, { reviewId: 'r1', hazardId: 'h1', reviewed: true });
  d = abandonReview(d, later, { reviewId: 'r1' });
  assert.equal(d.records.review.r1.status, 'deleted');
  assert.equal(d.records.reviewRow[ids.reviewRow('r1', 'h1')].status, 'deleted');
  assert.equal(openReview(d, 'p1'), null);
  assert.equal(entries(d).at(-1).action, 'Abandon review');
  assert.doesNotThrow(() => startReview(d, later, { platformId: 'p1' }));
  assert.throws(() => markRow(d, later, { reviewId: 'r1', hazardId: 'h1', reviewed: true }), code('not-found'));
});

test('retiring or deleting a platform abandons its open review in the same entry', () => {
  const d = retirePlatform(markRow(started(), later, { reviewId: 'r1', hazardId: 'h1', reviewed: true }), later, { id: 'p1' });
  assert.equal(d.records.review.r1.status, 'deleted');
  assert.equal(d.records.reviewRow[ids.reviewRow('r1', 'h1')].status, 'deleted');
  assert.equal(entries(d).at(-1).action, 'Retire platform');
  let e = createPlatform(seed(), act, { id: 'p9', name: 'Empty', ownerId: 'u1' });
  e = startReview(e, act, { id: 'r9', platformId: 'p9' });
  e = deletePlatform(e, later, { id: 'p9' });
  assert.equal(e.records.review.r9.status, 'deleted');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/core/ops/reviews.test.js`
Expected: FAIL — cannot find module `src/core/ops/reviews.js`.

- [ ] **Step 3: Write the implementation**

Create `src/core/ops/reviews.js`:

```js
import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, live, created, changed, need } from '../data.js';
import { commit } from '../apply.js';
import { addMonths, aestDate, isDate } from '../time.js';
import { openReview } from '../queries.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */
/** @typedef {import('../data.js').Rec} Rec */

export const MAX_REVIEW_MONTHS = 120;

/** Row-level review actions: kept in the history, but left out of the platform's History tab. */
export const REVIEW_DETAIL_ACTIONS = Object.freeze(['Mark review row', 'Set review outcome']);

/** @param {unknown} v */
const blank = (v) => v === undefined || v === null || v === '';

/**
 * Set a platform's review period and next due date together, or clear both.
 * @param {Data} data @param {Act} act @param {{ platformId: string, months?: number | string | null, due?: string | null }} args
 */
export function setSchedule(data, act, { platformId, months, due }) {
  const p = need(data, 'platform', platformId);
  if (blank(months) && blank(due)) {
    return commit(data, act, 'Remove review schedule', [{ kind: 'platform', rec: changed(p, act, { reviewMonths: null, reviewDue: null }) }]);
  }
  const n = blank(months) ? NaN : Number(months);
  if (!Number.isInteger(n) || n < 1 || n > MAX_REVIEW_MONTHS) {
    throw new PivotError('review.months', `A review period is a whole number of months from 1 to ${MAX_REVIEW_MONTHS}.`);
  }
  if (!isDate(due)) throw new PivotError('review.due', 'Give the next review date as a real date.');
  return commit(data, act, 'Set review schedule', [{ kind: 'platform', rec: changed(p, act, { reviewMonths: n, reviewDue: due }) }]);
}

/** @param {Data} data @param {string} reviewId */
function needOpen(data, reviewId) {
  const r = need(data, 'review', reviewId);
  if (r.state !== 'open') throw new PivotError('review.completed', 'That review is completed and can no longer be changed.');
  return r;
}

/** @param {Data} data @param {Act} act @param {{ id?: string, platformId: string }} args */
export function startReview(data, act, { id = newId(), platformId }) {
  const p = need(data, 'platform', platformId);
  if (p.status !== 'live') throw new PivotError('platform.retired', `${p.name} is retired, so it cannot be reviewed.`);
  if (openReview(data, platformId)) throw new PivotError('review.open', `${p.name} already has a review in progress.`);
  const rec = created(act, id, { platformId, state: 'open', outcome: '', dueBefore: null, dueAfter: null, completedBy: null, completedAt: null });
  return commit(data, act, 'Start review', [{ kind: 'review', rec }]);
}

/**
 * Tick or untick a hazard in an open review, or change its note. Either may be left out.
 * @param {Data} data @param {Act} act @param {{ reviewId: string, hazardId: string, reviewed?: boolean, note?: string }} args
 */
export function markRow(data, act, { reviewId, hazardId, reviewed, note }) {
  const r = needOpen(data, reviewId);
  const link = get(data, 'hazardPlatform', ids.hazardPlatform(hazardId, r.platformId));
  if (!link || link.status !== 'live') throw new PivotError('review.hazard', 'That hazard is not on this platform.');
  const id = ids.reviewRow(reviewId, hazardId);
  const existing = get(data, 'reviewRow', id);
  const fields = {
    ...(reviewed === undefined ? {} : { reviewed: Boolean(reviewed) }),
    ...(note === undefined ? {} : { note: String(note).trim() }),
  };
  const rec = existing && existing.status === 'live'
    ? changed(existing, act, fields)
    : created(act, id, { reviewId, hazardId, reviewed: false, note: '', ...fields });
  return commit(data, act, 'Mark review row', [{ kind: 'reviewRow', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ reviewId: string, outcome: string }} args */
export function setReviewOutcome(data, act, { reviewId, outcome }) {
  const r = needOpen(data, reviewId);
  return commit(data, act, 'Set review outcome', [{ kind: 'review', rec: changed(r, act, { outcome: String(outcome ?? '').trim() }) }]);
}

/**
 * Complete a review. The due date moves on from the old due date in whole periods, to the first
 * date after today: a late review does not pull the schedule forward, an early one does not push
 * it out, and one completed several periods late does not leave the platform still overdue. Every
 * hazard on the platform with no row gets one, not reviewed, so the review records what it covered.
 * @param {Data} data @param {Act} act @param {{ reviewId: string }} args
 */
export function completeReview(data, act, { reviewId }) {
  const r = needOpen(data, reviewId);
  const p = need(data, 'platform', r.platformId);
  if (!p.reviewMonths || !p.reviewDue) throw new PivotError('review.no-schedule', `Set a review schedule for ${p.name} first.`);
  const today = aestDate(act.at);
  let k = 1;
  let dueAfter = addMonths(p.reviewDue, p.reviewMonths);
  while (dueAfter <= today) {
    k += 1;
    dueAfter = addMonths(p.reviewDue, k * p.reviewMonths);
  }
  /** @type {{ kind: string, rec: Rec }[]} */
  const recs = [];
  for (const link of live(data, 'hazardPlatform').filter((l) => l.platformId === p.id)) {
    const id = ids.reviewRow(reviewId, link.hazardId);
    const row = get(data, 'reviewRow', id);
    if (!row || row.status !== 'live') recs.push({ kind: 'reviewRow', rec: created(act, id, { reviewId, hazardId: link.hazardId, reviewed: false, note: '' }) });
  }
  recs.push({ kind: 'review', rec: changed(r, act, { state: 'completed', dueBefore: p.reviewDue, dueAfter, completedBy: act.by, completedAt: act.at }) });
  recs.push({ kind: 'platform', rec: changed(p, act, { reviewDue: dueAfter }) });
  return commit(data, act, 'Complete review', recs);
}

/**
 * The records that abandon a review: it and its live rows, marked deleted.
 * @param {Data} data @param {Act} act @param {Rec} review
 * @returns {{ kind: string, rec: Rec }[]}
 */
export function abandonRecs(data, act, review) {
  return [
    { kind: 'review', rec: changed(review, act, { status: 'deleted' }) },
    ...live(data, 'reviewRow').filter((x) => x.reviewId === review.id).map((x) => ({ kind: 'reviewRow', rec: changed(x, act, { status: 'deleted' }) })),
  ];
}

/** @param {Data} data @param {Act} act @param {{ reviewId: string }} args */
export function abandonReview(data, act, { reviewId }) {
  return commit(data, act, 'Abandon review', abandonRecs(data, act, needOpen(data, reviewId)));
}
```

In `src/core/ops/platforms.js`, add the imports:

```js
import { openReview } from '../queries.js';
import { abandonRecs } from './reviews.js';
```

and replace the two `commit(...)` lines of `retirePlatform` and `deletePlatform`:

```js
  const open = openReview(data, id);
  return commit(data, act, 'Retire platform', [{ kind: 'platform', rec: changed(p, act, { status: 'retired' }) }, ...(open ? abandonRecs(data, act, open) : [])]);
```

```js
  const open = openReview(data, id);
  return commit(data, act, 'Delete platform', [{ kind: 'platform', rec: changed(p, act, { status: 'deleted' }) }, ...(open ? abandonRecs(data, act, open) : [])]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/core/ops/reviews.test.js`
Expected: PASS (10 tests).

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src/core/ops/reviews.js src/core/ops/platforms.js test/core/ops/reviews.test.js
git commit -m "Review operations: set a schedule, start, tick and note hazards, set the outcome, complete (moving the due date on from the old one) and abandon; retiring a platform abandons its open review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Review rules, and reviews in the merge

**Files:**
- Modify: `src/core/rules.js` (append inside `checkRules`, before `return out;`)
- Modify: `test/core/random-edits.js` (add review ops)
- Test: `test/core/reviews-merge.test.js` (create)

**Interfaces:**
- Consumes: Task 3's ops; `mergeData` (`src/core/merge.js`, unchanged); `checkRules`.
- Produces: `checkRules` reports these rules (each `{ rule, message, records }`):
  - `review-on-platform-not-live` — records `[review, platform]`
  - `two-open-reviews` — records `[first review, second review]`
  - `review-row-orphaned` — a live row whose review is missing or deleted; records `[review, row]`
  - `review-row-deleted` — a deleted row whose review is live; records `[row]`
  - `completed-review-changed` — a live row with `updatedAt` after its completed review's `completedAt`; records `[row]`

The merge needs no code change: its existing loop resolves each broken rule to "mine" (or deleted when I lack the record). These tests prove it.

- [ ] **Step 1: Write the failing test**

Create `test/core/reviews-merge.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeData } from '../../src/core/merge.js';
import { checkRules } from '../../src/core/rules.js';
import { ids } from '../../src/core/ids.js';
import { put, changed } from '../../src/core/data.js';
import { retirePlatform, linkHazard } from '../../src/core/ops/platforms.js';
import { setSchedule, startReview, markRow, completeReview, abandonReview } from '../../src/core/ops/reviews.js';
import { seed } from '../helpers.js';

const setup = { by: 'u1', at: '2026-09-28T09:00:00+10:00' };
const me = { by: 'me', at: '2026-09-28T12:00:00+10:00' };
const them = { by: 'them', at: '2026-09-28T12:30:00+10:00' };
const saveAct = { by: 'me', at: '2026-09-28T13:00:00+10:00' };

/** p1 with h1 and h2, a 6-monthly schedule due 2026-10-31, and review r1 open. */
function base() {
  let d = linkHazard(seed(), setup, { hazardId: 'h2', platformId: 'p1' });
  d = setSchedule(d, setup, { platformId: 'p1', months: 6, due: '2026-10-31' });
  return startReview(d, setup, { id: 'r1', platformId: 'p1' });
}
const names = (violations) => violations.map((v) => v.rule).sort();

test('the rules: an open review needs a live platform, one open review per platform, rows follow their review', () => {
  const d = base();
  assert.deepEqual(checkRules(d), []);
  const retired = put(d, 'platform', { ...d.records.platform.p1, status: 'retired' });
  assert.deepEqual(names(checkRules(retired)), ['review-on-platform-not-live']);
  const second = put(d, 'review', { ...d.records.review.r1, id: 'r2' });
  assert.deepEqual(names(checkRules(second)), ['two-open-reviews']);
  const ticked = markRow(d, me, { reviewId: 'r1', hazardId: 'h1', reviewed: true });
  const orphan = put(ticked, 'review', { ...ticked.records.review.r1, status: 'deleted' });
  assert.deepEqual(names(checkRules(orphan)), ['review-row-orphaned']);
  const rowId = ids.reviewRow('r1', 'h1');
  const rowGone = put(ticked, 'reviewRow', { ...ticked.records.reviewRow[rowId], status: 'deleted' });
  assert.deepEqual(names(checkRules(rowGone)), ['review-row-deleted']);
  const done = completeReview(ticked, me, { reviewId: 'r1' });
  assert.deepEqual(checkRules(done), []);
  const tampered = put(done, 'reviewRow', changed(done.records.reviewRow[rowId], them, { note: 'after' }));
  assert.deepEqual(names(checkRules(tampered)), ['completed-review-changed']);
});

test('two people ticking different hazards in the same review: both ticks are kept', () => {
  const b = base();
  const mine = markRow(b, me, { reviewId: 'r1', hazardId: 'h1', reviewed: true });
  const theirs = markRow(b, them, { reviewId: 'r1', hazardId: 'h2', reviewed: true, note: 'Seen' });
  const { data, conflicts } = mergeData(b, mine, theirs, saveAct);
  assert.deepEqual(conflicts, []);
  assert.equal(data.records.reviewRow[ids.reviewRow('r1', 'h1')].reviewed, true);
  assert.equal(data.records.reviewRow[ids.reviewRow('r1', 'h2')].note, 'Seen');
});

test('both completing the same review moves the due date on once', () => {
  const b = base();
  const { data } = mergeData(b, completeReview(b, me, { reviewId: 'r1' }), completeReview(b, them, { reviewId: 'r1' }), saveAct);
  assert.equal(data.records.platform.p1.reviewDue, '2027-04-30');
  assert.equal(data.records.review.r1.completedBy, 'me');
  assert.deepEqual(checkRules(data), []);
});

test('both starting a review on the same platform: mine stays open, theirs is deleted and they are told', () => {
  const b = setSchedule(seed(), setup, { platformId: 'p1', months: 6, due: '2026-10-31' });
  const mine = startReview(b, me, { id: 'rm', platformId: 'p1' });
  let theirs = startReview(b, them, { id: 'rt', platformId: 'p1' });
  theirs = markRow(theirs, them, { reviewId: 'rt', hazardId: 'h1', reviewed: true });
  const { data, conflicts } = mergeData(b, mine, theirs, saveAct);
  assert.equal(data.records.review.rm.state, 'open');
  assert.equal(data.records.review.rt.status, 'deleted');
  assert.equal(data.records.reviewRow[ids.reviewRow('rt', 'h1')].status, 'deleted');
  assert.ok(conflicts.some((c) => c.kind === 'review' && c.id === 'rt' && c.overriddenBy === 'them'));
  assert.deepEqual(checkRules(data), []);
});

test('I retire the platform while they start a review on it: their review is deleted', () => {
  const b = setSchedule(seed(), setup, { platformId: 'p1', months: 6, due: '2026-10-31' });
  const { data } = mergeData(b, retirePlatform(b, me, { id: 'p1' }), startReview(b, them, { id: 'rt', platformId: 'p1' }), saveAct);
  assert.equal(data.records.platform.p1.status, 'retired');
  assert.equal(data.records.review.rt.status, 'deleted');
  assert.deepEqual(checkRules(data), []);
});

test('I complete a review they abandoned: the completed review keeps every row', () => {
  const b0 = base();
  const b = markRow(b0, setup, { reviewId: 'r1', hazardId: 'h1', reviewed: true });
  const { data } = mergeData(b, completeReview(b, me, { reviewId: 'r1' }), abandonReview(b, them, { reviewId: 'r1' }), saveAct);
  assert.equal(data.records.review.r1.state, 'completed');
  assert.equal(data.records.reviewRow[ids.reviewRow('r1', 'h1')].status, 'live');
  assert.equal(data.records.reviewRow[ids.reviewRow('r1', 'h1')].reviewed, true);
  assert.deepEqual(checkRules(data), []);
});

test('a row they add to a review I completed, for a hazard only they linked, is dropped', () => {
  let b = setSchedule(seed(), setup, { platformId: 'p1', months: 6, due: '2026-10-31' });
  b = startReview(b, setup, { id: 'r1', platformId: 'p1' });
  let theirs = linkHazard(b, them, { hazardId: 'h2', platformId: 'p1' });
  theirs = markRow(theirs, them, { reviewId: 'r1', hazardId: 'h2', reviewed: true });
  const { data } = mergeData(b, completeReview(b, me, { reviewId: 'r1' }), theirs, saveAct);
  assert.equal(data.records.reviewRow[ids.reviewRow('r1', 'h2')].status, 'deleted');
  assert.deepEqual(checkRules(data), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/core/reviews-merge.test.js`
Expected: FAIL — the first test's `names(checkRules(retired))` is `[]`, not `['review-on-platform-not-live']`.

- [ ] **Step 3: Write the implementation**

In `src/core/rules.js`, add `all` to the import (`import { get, live, all } from './data.js';`) and insert before `return out;`:

```js
  // Reviews: an open review needs a live platform, and there is one at a time per platform.
  /** @type {Map<string, any>} */
  const openOn = new Map();
  for (const r of live(data, 'review')) {
    if (r.state !== 'open') continue;
    const p = get(data, 'platform', r.platformId);
    if (!p || p.status !== 'live') {
      out.push({ rule: 'review-on-platform-not-live', message: 'A review is in progress on a platform that is not live.', records: [{ kind: 'review', id: r.id }, { kind: 'platform', id: r.platformId }] });
    }
    const first = openOn.get(r.platformId);
    if (first) out.push({ rule: 'two-open-reviews', message: 'A platform has two reviews in progress.', records: [{ kind: 'review', id: first.id }, { kind: 'review', id: r.id }] });
    else openOn.set(r.platformId, r);
  }
  // A review's rows live and die with it, and a completed review is never changed again.
  for (const row of all(data, 'reviewRow')) {
    const r = get(data, 'review', row.reviewId);
    const reviewLive = Boolean(r && r.status === 'live');
    if (row.status === 'live' && !reviewLive) {
      out.push({ rule: 'review-row-orphaned', message: 'A review row belongs to a review that no longer exists.', records: [{ kind: 'review', id: row.reviewId }, { kind: 'reviewRow', id: row.id }] });
    } else if (row.status === 'deleted' && reviewLive) {
      out.push({ rule: 'review-row-deleted', message: 'A row of a review was deleted without its review.', records: [{ kind: 'reviewRow', id: row.id }] });
    } else if (row.status === 'live' && r && r.state === 'completed' && row.updatedAt > r.completedAt) {
      out.push({ rule: 'completed-review-changed', message: 'A completed review was changed after it was completed.', records: [{ kind: 'reviewRow', id: row.id }] });
    }
  }
```

In `test/core/random-edits.js`, add the import:

```js
import { setSchedule, startReview, markRow, setReviewOutcome, completeReview, abandonReview } from '../../src/core/ops/reviews.js';
```

and inside `randomEdit`, after the `cf` line add `const rv = Object.keys(d.records.review);`, then append to `actions`:

```js
    () => setSchedule(d, act, { platformId: pick(rand, pl), months: 1 + Math.floor(rand() * 12), due: `2026-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-28` }),
    () => startReview(d, act, { platformId: pick(rand, pl) }),
    () => markRow(d, act, { reviewId: pick(rand, rv), hazardId: pick(rand, hz), reviewed: rand() < 0.7, note: `Note ${n()}` }),
    () => setReviewOutcome(d, act, { reviewId: pick(rand, rv), outcome: `Outcome ${n()}` }),
    () => completeReview(d, act, { reviewId: pick(rand, rv) }),
    () => abandonReview(d, act, { reviewId: pick(rand, rv) }),
```

(`pick` on an empty list returns `undefined`; the op then throws a `PivotError` or a `TypeError`. If a `TypeError` escapes, guard with `rv.length ? ... : d` in those four lines.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/core/reviews-merge.test.js test/core/merge.test.js`
Expected: PASS, including the existing randomised merge test (150 seeds) with review ops in the mix.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src/core/rules.js test/core/random-edits.js test/core/reviews-merge.test.js
git commit -m "Review rules that the merge enforces: one open review per live platform, rows kept with their review, and a completed review left as completed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Review queries

**Files:**
- Modify: `src/core/queries.js` (append)
- Test: `test/core/reviews-queries.test.js` (create)

**Interfaces:**
- Consumes: `openReview` (Task 2), Task 3's ops, existing `platformHazards`, `byNumber`, `reviewState` (Task 1).
- Produces:
  - `reviewRows(data, reviewId): ReviewItem[]`, sorted by hazard number, where
    `ReviewItem = { hazard: Rec, reportId: string, onPlatform: boolean, reviewed: boolean, note: string, rating: { initial, residual } | null, counts: { confirmed: number, excluded: number, awaiting: number } | null }`.
    For an open review: every hazard now on the platform, plus a row's hazard that has since left it (`onPlatform: false`, `rating`/`counts` null). For a completed review: exactly its live rows, with `rating` and `counts` null (the review does not claim what they were then).
  - `completedReviews(data, platformId): { review: Rec, ticked: number, notTicked: number }[]`, newest first.
  - `lastReviewed(data, platformId): string | null` — the latest `completedAt`.
  - `hazardLastReviewed(data, hazardId, platformId): string | null` — the latest `completedAt` of a completed review of that platform in which the hazard was ticked.
  - `reviewDueList(data, today): { platform: Rec, state: string, due: string }[]` — live platforms with a schedule, soonest due first.

- [ ] **Step 1: Write the failing test**

Create `test/core/reviews-queries.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewRows, completedReviews, lastReviewed, hazardLastReviewed, reviewDueList } from '../../src/core/queries.js';
import { linkHazard, unlinkHazard } from '../../src/core/ops/platforms.js';
import { confirmControl } from '../../src/core/ops/assessment.js';
import { assignHazardNumbers } from '../../src/core/ops/hazards.js';
import { setSchedule, startReview, markRow, completeReview } from '../../src/core/ops/reviews.js';
import { act, later, seed } from '../helpers.js';

const t1 = { by: 'u1', at: '2026-09-28T10:00:00+10:00' };
const t2 = { by: 'u2', at: '2026-10-05T10:00:00+10:00' };

function reviewing() {
  let d = assignHazardNumbers(seed());
  d = linkHazard(d, act, { hazardId: 'h2', platformId: 'p1' });
  d = confirmControl(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  d = setSchedule(d, act, { platformId: 'p1', months: 6, due: '2026-10-31' });
  d = startReview(d, act, { id: 'r1', platformId: 'p1' });
  return markRow(d, t1, { reviewId: 'r1', hazardId: 'h1', reviewed: true, note: 'Fine' });
}

test('an open review lists every hazard on the platform with its current ratings and control decisions', () => {
  const items = reviewRows(reviewing(), 'r1');
  assert.deepEqual(items.map((i) => [i.hazard.id, i.reportId, i.onPlatform, i.reviewed, i.note]), [
    ['h1', 'H-0001', true, true, 'Fine'],
    ['h2', 'H-0002', true, false, ''],
  ]);
  assert.deepEqual(items[0].counts, { confirmed: 1, excluded: 0, awaiting: 1 });
  assert.deepEqual(items[0].rating, { initial: null, residual: null });
});

test('a hazard unlinked during a review keeps its row, shown as off the platform, and comes back when relinked', () => {
  let d = unlinkHazard(reviewing(), later, { hazardId: 'h1', platformId: 'p1' });
  let h1 = reviewRows(d, 'r1').find((i) => i.hazard.id === 'h1');
  assert.deepEqual([h1.onPlatform, h1.reviewed, h1.note, h1.rating, h1.counts], [false, true, 'Fine', null, null]);
  d = linkHazard(d, later, { hazardId: 'h1', platformId: 'p1' });
  h1 = reviewRows(d, 'r1').find((i) => i.hazard.id === 'h1');
  assert.deepEqual([h1.onPlatform, h1.reviewed, h1.note], [true, true, 'Fine']);
});

test('a completed review lists exactly what it covered; past reviews, last reviewed and a hazard\'s last review', () => {
  let d = completeReview(reviewing(), t1, { reviewId: 'r1' });
  d = linkHazard(d, later, { hazardId: 'h2', platformId: 'p2' });
  assert.deepEqual(reviewRows(d, 'r1').map((i) => [i.hazard.id, i.reviewed, i.rating, i.counts]), [['h1', true, null, null], ['h2', false, null, null]]);
  d = startReview(d, t2, { id: 'r2', platformId: 'p1' });
  d = markRow(d, t2, { reviewId: 'r2', hazardId: 'h2', reviewed: true });
  d = completeReview(d, t2, { reviewId: 'r2' });
  assert.deepEqual(completedReviews(d, 'p1').map((c) => [c.review.id, c.ticked, c.notTicked]), [['r2', 1, 1], ['r1', 1, 1]]);
  assert.equal(lastReviewed(d, 'p1'), t2.at);
  assert.equal(lastReviewed(d, 'p2'), null);
  assert.equal(hazardLastReviewed(d, 'h1', 'p1'), t1.at, 'h1 was not ticked in r2');
  assert.equal(hazardLastReviewed(d, 'h2', 'p1'), t2.at);
  assert.equal(hazardLastReviewed(d, 'h2', 'p2'), null);
});

test('reviewDueList: scheduled live platforms, soonest first, with their state', () => {
  let d = setSchedule(seed(), act, { platformId: 'p1', months: 6, due: '2026-12-31' });
  d = setSchedule(d, act, { platformId: 'p2', months: 6, due: '2026-09-01' });
  assert.deepEqual(reviewDueList(d, '2026-09-28').map((x) => [x.platform.id, x.state, x.due]), [['p2', 'overdue', '2026-09-01'], ['p1', 'ok', '2026-12-31']]);
  assert.deepEqual(reviewDueList(seed(), '2026-09-28'), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/core/reviews-queries.test.js`
Expected: FAIL — `reviewRows` is not exported.

- [ ] **Step 3: Write the implementation**

Add `import { reviewState } from './time.js';` to the imports of `src/core/queries.js`, then append:

```js
/** @param {{ state: string }[]} controls */
function controlCounts(controls) {
  const counts = { confirmed: 0, excluded: 0, awaiting: 0 };
  for (const c of controls) counts[/** @type {keyof typeof counts} */ (c.state)] += 1;
  return counts;
}

/**
 * A review's checklist. Open: every hazard now on the platform, with its current ratings and
 * control decisions, plus any row whose hazard has since left the platform. Completed: exactly
 * the rows it recorded, with no ratings, since the review does not say what they were then.
 * @param {Data} data @param {string} reviewId
 */
export function reviewRows(data, reviewId) {
  const review = get(data, 'review', reviewId);
  if (!review) return [];
  const rows = live(data, 'reviewRow').filter((r) => r.reviewId === reviewId);
  const rowOf = new Map(rows.map((r) => [r.hazardId, r]));
  const onNow = new Map(platformHazards(data, review.platformId).map((ph) => [ph.hazard.id, ph]));
  /** @param {Rec} hazard */
  const reportIdOf = (hazard) => onNow.get(hazard.id)?.reportId ?? hazardLabel(hazard);
  /** @param {Rec} hazard @param {boolean} current */
  const item = (hazard, current) => {
    const row = rowOf.get(hazard.id);
    const ph = current ? onNow.get(hazard.id) : undefined;
    return {
      hazard, reportId: reportIdOf(hazard), onPlatform: onNow.has(hazard.id),
      reviewed: Boolean(row?.reviewed), note: row?.note ?? '',
      rating: ph ? ph.rating : null, counts: ph ? controlCounts(ph.controls) : null,
    };
  };
  const hazardOf = (/** @type {Rec} */ row) => /** @type {Rec} */ (get(data, 'hazard', row.hazardId));
  if (review.state === 'completed') return rows.map((r) => item(hazardOf(r), false)).sort((a, b) => byNumber(a.hazard, b.hazard));
  const off = rows.filter((r) => !onNow.has(r.hazardId)).map(hazardOf);
  return [...[...onNow.values()].map((ph) => item(ph.hazard, true)), ...off.map((h) => item(h, false))].sort((a, b) => byNumber(a.hazard, b.hazard));
}

/** A platform's completed reviews, newest first, with how many hazards each ticked. @param {Data} data @param {string} platformId */
export function completedReviews(data, platformId) {
  return live(data, 'review').filter((r) => r.platformId === platformId && r.state === 'completed')
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0))
    .map((review) => {
      const rows = live(data, 'reviewRow').filter((r) => r.reviewId === review.id);
      const ticked = rows.filter((r) => r.reviewed).length;
      return { review, ticked, notTicked: rows.length - ticked };
    });
}

/** @param {Data} data @param {string} platformId @returns {string | null} when it was last reviewed */
export function lastReviewed(data, platformId) {
  return completedReviews(data, platformId)[0]?.review.completedAt ?? null;
}

/** @param {Data} data @param {string} hazardId @param {string} platformId @returns {string | null} */
export function hazardLastReviewed(data, hazardId, platformId) {
  const hit = completedReviews(data, platformId).find(({ review }) => {
    const row = get(data, 'reviewRow', ids.reviewRow(review.id, hazardId));
    return row && row.status === 'live' && row.reviewed;
  });
  return hit?.review.completedAt ?? null;
}

/** Every live platform with a review schedule, soonest due first. @param {Data} data @param {string} today */
export function reviewDueList(data, today) {
  return live(data, 'platform').filter((p) => p.reviewMonths && p.reviewDue)
    .map((platform) => ({ platform, state: reviewState(platform, today), due: /** @type {string} */ (platform.reviewDue) }))
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/core/reviews-queries.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src/core/queries.js test/core/reviews-queries.test.js
git commit -m "Review queries: a review's checklist, past reviews, when a platform and each hazard on it were last reviewed, and the list of reviews coming due

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The review state in report snapshots

**Files:**
- Modify: `src/reports/snapshot.js`
- Test: `test/reports/snapshot.test.js` (append)

**Interfaces:**
- Consumes: `reviewState`, `aestDate` (`src/core/time.js`); `lastReviewed` (Task 5).
- Produces: `Snapshot.review = { state: 'none' | 'ok' | 'dueSoon' | 'overdue', due: string | null, months: number | null, lastReviewed: string | null }`, taken at `o.at`. Stored on the report record by `createReport` like the rest of the snapshot, so `report.review.state` is readable on produced reports.

- [ ] **Step 1: Write the failing test**

Append to `test/reports/snapshot.test.js` (add `import { setSchedule, startReview, completeReview } from '../../src/core/ops/reviews.js';` to its imports):

```js
test('a snapshot records whether the platform was due for review when the report was produced', () => {
  assert.deepEqual(buildSnapshot(assessed(), 'p1', opts).review, { state: 'none', due: null, months: null, lastReviewed: null });
  let d = setSchedule(assessed(), act, { platformId: 'p1', months: 6, due: '2026-09-01' });
  const overdue = buildSnapshot(d, 'p1', opts);
  assert.deepEqual(overdue.review, { state: 'overdue', due: '2026-09-01', months: 6, lastReviewed: null });
  const stored = createReport(d, act, { id: 'rep1', report: overdue });
  d = startReview(stored, act, { id: 'r1', platformId: 'p1' });
  d = completeReview(d, act, { reviewId: 'r1' });
  assert.equal(d.records.report.rep1.review.state, 'overdue', 'a later review does not change a produced report');
  assert.deepEqual(buildSnapshot(d, 'p1', opts).review, { state: 'ok', due: '2027-03-01', months: 6, lastReviewed: act.at });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/reports/snapshot.test.js`
Expected: FAIL — `review` is `undefined`.

- [ ] **Step 3: Write the implementation**

In `src/reports/snapshot.js`:

- change the imports to add `import { reviewState, aestDate } from '../core/time.js';` and `lastReviewed` to the queries import;
- extend the `Snapshot` typedef with `review: { state: string, due: string | null, months: number | null, lastReviewed: string | null }`;
- in the returned object, after `classification: o.classification, rows,` add:

```js
    review: {
      state: reviewState(platform, aestDate(o.at)),
      due: platform.reviewDue ?? null,
      months: platform.reviewMonths ?? null,
      lastReviewed: lastReviewed(data, platformId),
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/reports/snapshot.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass. If a DocGen host test pins the whole snapshot, add the `review` block to its expectation.

```bash
git add src/reports/snapshot.js test/reports/snapshot.test.js
git commit -m "A report records whether its platform was due or overdue for review when it was produced

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Controller actions for reviews

**Files:**
- Modify: `src/ui/controller.js`
- Modify: `src/ui/mount.js` (the `change` listener)
- Test: `test/ui/controller-reviews.test.js` (create)

**Interfaces:**
- Consumes: Task 3's ops.
- Produces:
  - Edits (dispatched by name, args from `data-*` attributes and form fields): `setSchedule`, `startReview`, `markRow`, `setReviewOutcome`, `completeReview`, `abandonReview`.
  - Handlers:
    - `setScheduleField({ platformId, months?, due? })` — changes one of the two, keeping the other.
    - `beginReview({ platformId })` — starts a review and shows the platform's Reviews tab.
    - `tickReviewRow({ reviewId, hazardId, reviewed: 'true' | 'false' })`
    - `chooseReportPlatform({ platformId })` — quiet; sets `state.reportPlatformId`.
  - `go` accepts `reviewId` and keeps it in `state.view.reviewId`.
  - `state.today: string` — today's AEST date, from the injected clock, refreshed on every state change; `initialState()` starts it from `systemClock`.
  - `state.reportPlatformId: string | null` (initially `null`).
  - `mount.js`: a checkbox's `change` sends its `name` as `"true"` or `"false"`.

- [ ] **Step 1: Write the failing test**

Create `test/ui/controller-reviews.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController, initialState } from '../../src/ui/controller.js';
import { ids } from '../../src/core/ids.js';

const env = (f) => ({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

async function ready() {
  const c = createController(env(new MemoryFolder()));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const u = c.getState().profiles[0].id;
  await c.dispatch({ type: 'selectProfile', id: u });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: u });
  await c.dispatch({ type: 'linkHazard', hazardId: 'h1', platformId: 'p1' });
  return c;
}
const W = (c) => c.getState().session.working;

test('today comes from the clock', async () => {
  assert.match(initialState().today, /^\d{4}-\d{2}-\d{2}$/);
  const c = await ready();
  assert.equal(c.getState().today, '2026-09-28');
});

test('a schedule set from the form, then each part changed in place, keeping the other', async () => {
  const c = await ready();
  await c.dispatch({ type: 'setSchedule', platformId: 'p1', months: '6', due: '2026-12-31' });
  assert.deepEqual([W(c).records.platform.p1.reviewMonths, W(c).records.platform.p1.reviewDue], [6, '2026-12-31']);
  await c.dispatch({ type: 'setScheduleField', platformId: 'p1', months: '3' });
  assert.deepEqual([W(c).records.platform.p1.reviewMonths, W(c).records.platform.p1.reviewDue], [3, '2026-12-31']);
  await c.dispatch({ type: 'setScheduleField', platformId: 'p1', due: '2027-01-15' });
  assert.deepEqual([W(c).records.platform.p1.reviewMonths, W(c).records.platform.p1.reviewDue], [3, '2027-01-15']);
});

test('clearing the due date in place is refused with a message and leaves the schedule as it was', async () => {
  const c = await ready();
  await c.dispatch({ type: 'setSchedule', platformId: 'p1', months: '6', due: '2026-12-31' });
  await c.dispatch({ type: 'setScheduleField', platformId: 'p1', due: '' });
  assert.equal(c.getState().message.kind, 'error');
  assert.match(c.getState().message.text, /real date/);
  assert.deepEqual([W(c).records.platform.p1.reviewMonths, W(c).records.platform.p1.reviewDue], [6, '2026-12-31']);
});

test('starting a review shows the Reviews tab; a tick arrives as text and is stored as a boolean; completing moves the date', async () => {
  const c = await ready();
  await c.dispatch({ type: 'setSchedule', platformId: 'p1', months: '6', due: '2026-12-31' });
  await c.dispatch({ type: 'beginReview', platformId: 'p1' });
  assert.deepEqual([c.getState().view.name, c.getState().view.id, c.getState().view.tab], ['platform', 'p1', 'reviews']);
  const review = Object.values(W(c).records.review)[0];
  await c.dispatch({ type: 'tickReviewRow', reviewId: review.id, hazardId: 'h1', reviewed: 'true' });
  assert.equal(W(c).records.reviewRow[ids.reviewRow(review.id, 'h1')].reviewed, true);
  await c.dispatch({ type: 'tickReviewRow', reviewId: review.id, hazardId: 'h1', reviewed: 'false' });
  assert.equal(W(c).records.reviewRow[ids.reviewRow(review.id, 'h1')].reviewed, false);
  await c.dispatch({ type: 'markRow', reviewId: review.id, hazardId: 'h1', note: 'Looked at it' });
  await c.dispatch({ type: 'setReviewOutcome', reviewId: review.id, outcome: 'Done' });
  await c.dispatch({ type: 'completeReview', reviewId: review.id });
  assert.equal(W(c).records.platform.p1.reviewDue, '2027-06-30');
  await c.dispatch({ type: 'go', view: 'platform', id: 'p1', tab: 'reviews', reviewId: review.id });
  assert.equal(c.getState().view.reviewId, review.id);
});

test('choosing a platform in the report form is remembered on screen only', async () => {
  const c = await ready();
  assert.equal(c.getState().reportPlatformId, null);
  await c.dispatch({ type: 'chooseReportPlatform', platformId: 'p1' });
  assert.equal(c.getState().reportPlatformId, 'p1');
  assert.equal(c.getState().busy, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/controller-reviews.test.js`
Expected: FAIL — `initialState().today` is `undefined`.

- [ ] **Step 3: Write the implementation**

In `src/ui/controller.js`:

1. Imports: change `import { epochOf } from '../core/time.js';` to `import { epochOf, aestDate, systemClock } from '../core/time.js';` and add `import * as reviews from '../core/ops/reviews.js';`.

2. In `EDITS`, after `setRatingCell: assessment.setRatingCell,` add:

```js
  setSchedule: reviews.setSchedule, startReview: reviews.startReview, markRow: reviews.markRow,
  setReviewOutcome: reviews.setReviewOutcome, completeReview: reviews.completeReview, abandonReview: reviews.abandonReview,
```

3. Add `'chooseReportPlatform'` to the `QUIET` set.

4. In `initialState()`, add to the returned object: `today: aestDate(systemClock.now()), reportPlatformId: null,`.

5. Replace `set`:

```js
  /** @param {Record<string, any>} patch */
  function set(patch) {
    state = { ...state, ...patch, today: aestDate(env.clock.now()) };
    for (const f of listeners) f(state);
  }
```

6. Replace the `go` handler:

```js
    async go({ view, id, hazardId, platformId, tab, reviewId }) {
      set({ view: { name: view, id, hazardId, platformId, tab, reviewId }, message: null, editing: null });
      if (view === 'backups' && handle) set({ backups: await store.listBackups(handle) });
    },
```

7. Add these handlers after `setControlState`:

```js
    async setScheduleField({ platformId, months, due }) {
      const p = state.session?.working.records.platform[platformId];
      if (!p) throw new PivotError('not-found', 'That platform no longer exists.');
      await applyEdit('setSchedule', { platformId, months: months ?? p.reviewMonths, due: due ?? p.reviewDue });
    },
    async beginReview({ platformId }) {
      await applyEdit('startReview', { platformId });
      set({ view: { name: 'platform', id: platformId, tab: 'reviews' } });
    },
    async tickReviewRow({ reviewId, hazardId, reviewed }) {
      await applyEdit('markRow', { reviewId, hazardId, reviewed: reviewed === 'true' });
    },
    async chooseReportPlatform({ platformId }) {
      set({ reportPlatformId: platformId });
    },
```

In `src/ui/mount.js`, replace the last listener (`el.addEventListener('change', ...)`) with:

```js
  el.addEventListener('change', (e) => {
    const t = /** @type {HTMLInputElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-change]'));
    if (!t) return;
    // A tickbox says whether it is ticked, not its value (which is always "on").
    const value = t.type === 'checkbox' ? String(t.checked) : t.value;
    void dispatch({ type: t.dataset.change, ...t.dataset, [t.name || 'value']: value });
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/controller-reviews.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src/ui/controller.js src/ui/mount.js test/ui/controller-reviews.test.js
git commit -m "Controller: set and change a review schedule, start a review, tick and note hazards, complete or abandon; today's date kept in the app state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Review flags on the platforms list, the platform page and the hazard page

**Files:**
- Modify: `src/ui/names.js` (add `day`)
- Modify: `src/ui/screens/common.js` (`pageTabs`, add `reviewTag`)
- Create: `src/ui/screens/reviews.js` (`reviewLine`)
- Modify: `src/ui/screens/platforms.js` (list column, review line on Details)
- Modify: `src/ui/screens/hazards.js` (Last reviewed column)
- Modify: `src/ui/styles.css`
- Test: `test/ui/screens-reviews.test.js` (create)

**Interfaces:**
- Consumes: `reviewState` (Task 1); `openReview`, `lastReviewed`, `hazardLastReviewed` (Tasks 2, 5); `state.today`, `state.editing` (Task 7); handlers `setSchedule`, `setScheduleField`, `beginReview`, `startEdit` with `kind: 'schedule'`.
- Produces:
  - `day(dateOrTimestamp: string): string` — `'2026-08-12'` → `'12 Aug 2026'`.
  - `reviewTag(state: string)` — ` <span class="tag review-overdue">Overdue</span>`, ` <span class="tag review-due-soon">Due soon</span>`, or `''`.
  - `pageTabs(view, where, tab, changes, extra = [])` — `extra` is `[tab, label][]`, shown between Details and History; Details is on when `tab` is empty or `'details'`.
  - `reviewLine(state, data, platform)` in `src/ui/screens/reviews.js`.

- [ ] **Step 1: Write the failing test**

Create `test/ui/screens-reviews.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformsView, platformView } from '../../src/ui/screens/platforms.js';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { day } from '../../src/ui/names.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { setSchedule, startReview, markRow, completeReview } from '../../src/core/ops/reviews.js';
import { seed, act } from '../helpers.js';

export const state = { ...initialState(), screen: 'main', today: '2026-09-28', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }], profileId: 'u1' };
/** p1 overdue (due 2026-09-01), p2 due soon (2026-10-10). */
export function data() {
  let d = assignNumbers(seed());
  d = setSchedule(d, act, { platformId: 'p1', months: 6, due: '2026-09-01' });
  return setSchedule(d, act, { platformId: 'p2', months: 12, due: '2026-10-10' });
}

test('day() reads a date the way people write it', () => {
  assert.equal(day('2026-08-12'), '12 Aug 2026');
  assert.equal(day('2026-12-01T09:30:00+10:00'), '1 Dec 2026');
});

test('the platforms list shows the next review with a due-soon or overdue badge, and filters by it', () => {
  const out = platformsView(state, data()).toString();
  assert.match(out, /<th data-col="review"/);
  assert.match(out, /1 Sep 2026 <span class="tag review-overdue">Overdue<\/span>/);
  assert.match(out, /10 Oct 2026 <span class="tag review-due-soon">Due soon<\/span>/);
  const overdueOnly = platformsView({ ...state, tables: { platforms: { filters: { review: 'overdue' } } } }, data()).toString();
  assert.match(overdueOnly, /data-row="p1"/);
  assert.doesNotMatch(overdueOnly, /data-row="p2"/);
});

test('a platform page states its schedule, changed in place, with a Start review button', () => {
  const out = platformView(state, data(), 'p1').toString();
  assert.match(out, /<input type="number"[^>]*name="months"[^>]*value="6"[^>]*data-change="setScheduleField" data-platform-id="p1"/);
  assert.match(out, /<input type="date"[^>]*name="due"[^>]*value="2026-09-01"[^>]*data-change="setScheduleField"/);
  assert.match(out, /review-overdue/);
  assert.match(out, /data-action="beginReview" data-platform-id="p1"/);
  assert.match(out, /data-action="setSchedule" data-platform-id="p1"/, 'the schedule can be removed');
  assert.match(out, /class="tab[^"]*"[^>]*data-tab="reviews"/);
});

test('without a schedule: a Set schedule link, which opens a small form', () => {
  const out = platformView(state, seed(), 'p1').toString();
  assert.match(out, /No review schedule/);
  assert.match(out, /data-action="startEdit" data-kind="schedule" data-id="p1"/);
  const editing = platformView({ ...state, editing: { kind: 'schedule', id: 'p1' } }, seed(), 'p1').toString();
  assert.match(editing, /<form data-action="setSchedule" data-platform-id="p1"[\s\S]*?name="months"[\s\S]*?name="due"/);
});

test('with a review open, the button says Continue review', () => {
  const d = startReview(data(), act, { id: 'r1', platformId: 'p1' });
  const out = platformView(state, d, 'p1').toString();
  assert.match(out, /data-action="go" data-view="platform" data-id="p1" data-tab="reviews">Continue review/);
  assert.doesNotMatch(out, /data-action="beginReview"/);
});

test('a hazard page shows when it was last reviewed on each platform', () => {
  let d = startReview(data(), act, { id: 'r1', platformId: 'p1' });
  d = markRow(d, act, { reviewId: 'r1', hazardId: 'h1', reviewed: true });
  d = completeReview(d, act, { reviewId: 'r1' });
  const out = hazardView(state, d, 'h1').toString();
  assert.match(out, /<th data-col="lastReviewed"/);
  assert.match(out, /28 Sep 2026/);
  assert.match(out, /Never/, 'not reviewed on Bravo');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/screens-reviews.test.js`
Expected: FAIL — `day` is not exported from `names.js`.

- [ ] **Step 3: Write the implementation**

Append to `src/ui/names.js`:

```js
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** @param {string} date `YYYY-MM-DD`, or an AEST timestamp @returns {string} e.g. `12 Aug 2026` */
export function day(date) {
  const [y, m, d] = date.slice(0, 10).split('-');
  return `${Number(d)} ${MONTH_NAMES[Number(m) - 1]} ${y}`;
}
```

In `src/ui/screens/common.js`, replace `pageTabs` and add `reviewTag` after it:

```js
/**
 * Details, any extra tabs, and History, as tabs of a record's page.
 * @param {string} view @param {Record<string, string>} where e.g. { id } or { 'hazard-id', 'platform-id' }
 * @param {string | undefined} tab @param {number} changes
 * @param {[string, unknown][]} [extra] [tab, label] pairs shown between Details and History
 */
export function pageTabs(view, where, tab, changes, extra = []) {
  const current = tab || 'details';
  const on = (/** @type {string} */ t) => (current === t ? ' on' : '');
  return html`<nav class="tabs">
    <button type="button" class="tab${on('details')}" ${dataAttrs({ action: 'go', view, ...where })}>Details</button>
    ${extra.map(([t, label]) => html`<button type="button" class="tab${on(t)}" ${dataAttrs({ action: 'go', view, ...where, tab: t })}>${label}</button>`)}
    <button type="button" class="tab${on('history')}" ${dataAttrs({ action: 'go', view, ...where, tab: 'history' })}>History (${changes})</button>
  </nav>`;
}

/** A badge for a review that is due soon or overdue; nothing otherwise. @param {string} state from reviewState */
export function reviewTag(state) {
  if (state === 'overdue') return html` <span class="tag review-overdue">Overdue</span>`;
  if (state === 'dueSoon') return html` <span class="tag review-due-soon">Due soon</span>`;
  return '';
}
```

Create `src/ui/screens/reviews.js`:

```js
import { html } from '../html.js';
import { dataAttrs, confirmButton, reviewTag } from './common.js';
import { openReview, lastReviewed } from '../../core/queries.js';
import { reviewState } from '../../core/time.js';
import { MAX_REVIEW_MONTHS } from '../../core/ops/reviews.js';
import { day } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/**
 * The platform's review schedule as a line of the document, changed in place, with the button
 * that starts or continues a review.
 * @param {any} state @param {Data} data @param {any} p the platform
 */
export function reviewLine(state, data, p) {
  const s = reviewState(p, state.today);
  const last = lastReviewed(data, p.id);
  const lastText = last ? html`<span class="muted">· last reviewed ${day(last)}</span>` : html`<span class="muted">· never reviewed</span>`;
  const start = p.status !== 'live' ? ''
    : openReview(data, p.id)
      ? html`<button type="button" ${dataAttrs({ action: 'go', view: 'platform', id: p.id, tab: 'reviews' })}>Continue review</button>`
      : html`<button type="button" ${dataAttrs({ action: 'beginReview', 'platform-id': p.id })}>Start review</button>`;
  if (s === 'none') {
    if (state.editing?.kind === 'schedule' && state.editing.id === p.id) {
      return html`<form data-action="setSchedule" ${dataAttrs({ 'platform-id': p.id })} class="doc-meta review-line fill">
        Reviewed every <input type="number" class="months" name="months" min="1" max="${MAX_REVIEW_MONTHS}" required aria-label="Months between reviews" autofocus> months, next due
        <input type="date" name="due" required aria-label="Next review due">
        <button type="submit">Set</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></form>`;
    }
    return html`<div class="doc-meta review-line">No review schedule
      <button type="button" class="link" ${dataAttrs({ action: 'startEdit', kind: 'schedule', id: p.id })}>Set schedule</button> ${lastText} ${start}</div>`;
  }
  const field = { change: 'setScheduleField', 'platform-id': p.id };
  return html`<div class="doc-meta review-line">Reviewed every
    <input type="number" class="quiet months" name="months" min="1" max="${MAX_REVIEW_MONTHS}" value="${p.reviewMonths}" aria-label="Months between reviews" ${dataAttrs(field)}> months · next due
    <input type="date" class="quiet" name="due" value="${p.reviewDue}" aria-label="Next review due" ${dataAttrs(field)}>${reviewTag(s)}
    ${lastText}
    ${confirmButton('✕', 'Remove the review schedule', dataAttrs({ action: 'setSchedule', 'platform-id': p.id }))}
    ${start}</div>`;
}
```

In `src/ui/screens/platforms.js`:

- add imports: `reviewTag` to the `./common.js` import; `import { reviewLine } from './reviews.js';`; `import { reviewState } from '../../core/time.js';`; `day` to the `../names.js` import; `openReview` to the queries import;
- in `platformsView`'s columns, before `statusColumn(...)`, add:

```js
        { key: 'review', label: 'Next review', width: 340, minWidth: 170, value: (p) => p.reviewDue ?? null, filter: 'select',
          options: [['overdue', 'Overdue'], ['dueSoon', 'Due soon'], ['ok', 'Not due yet'], ['none', 'No schedule']],
          match: (p, v) => reviewState(p, state.today) === v,
          render: (p) => (p.reviewDue ? html`${day(p.reviewDue)}${reviewTag(reviewState(p, state.today))}` : '—') },
```

- in `platformView`, change the tabs line of `head` to:

```js
    ${pageTabs('platform', { id }, tab, reaching.length, [['reviews', openReview(data, id) ? 'Reviews (in progress)' : 'Reviews']])}`;
```

- in `platformView`'s document, directly after the `<p class="doc-meta">Owned by …</p>` line, add `${reviewLine(state, data, p)}`.

In `src/ui/screens/hazards.js`:

- add `hazardLastReviewed` to the queries import and `import { day } from '../names.js';`;
- in the `hazardPlatforms` table's columns, after the `risk` column, add:

```js
            { key: 'lastReviewed', label: 'Last reviewed', width: 280, minWidth: 140, value: (p) => hazardLastReviewed(data, h.id, p.platform.id),
              render: (p) => {
                const at = hazardLastReviewed(data, h.id, p.platform.id);
                return at ? day(at) : html`<span class="muted">Never</span>`;
              } },
```

Append to `src/ui/styles.css`:

```css
/* Reviews */
.review-overdue { background: var(--p-error-bg); color: var(--p-danger); }
.review-due-soon { background: var(--p-warn-bg); color: var(--p-warn); }
.review-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0 0 16px; }
.review-line input.months { width: 72px; }
.review-line input.quiet { border-color: transparent; background: transparent; color: var(--p-fg); }
.review-line input.quiet:hover, .review-line input.quiet:focus { border-color: var(--p-line); background: var(--p-surface); }
.review-line > button:not(.link) { margin-left: 8px; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/screens-reviews.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src/ui/names.js src/ui/screens/common.js src/ui/screens/reviews.js src/ui/screens/platforms.js src/ui/screens/hazards.js src/ui/styles.css test/ui/screens-reviews.test.js
git commit -m "Review flags: a Next review column on the platforms list, the schedule on a platform's page (changed in place) with Start review, and when each hazard was last reviewed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The Reviews tab

**Files:**
- Modify: `src/ui/screens/reviews.js` (add `reviewsTab`)
- Modify: `src/ui/screens/platforms.js` (show the tab; History hides row-level actions)
- Modify: `src/ui/styles.css`
- Test: `test/ui/screens-reviews.test.js` (append)

**Interfaces:**
- Consumes: `reviewRows`, `completedReviews`, `openReview` (Task 5); `REVIEW_DETAIL_ACTIONS` (Task 3); handlers `tickReviewRow`, `markRow`, `setReviewOutcome`, `completeReview`, `abandonReview`, `beginReview`, `go` with `review-id` (Task 7); `state.view.reviewId`; `state.editing` with `kind: 'reviewNote'`, `id: hazardId`.
- Produces: `reviewsTab(state, data, platform)`; tables with ids `reviewRows`, `reviewRecord`, `pastReviews`.

- [ ] **Step 1: Write the failing test**

Append to `test/ui/screens-reviews.test.js` (add `import { entries } from '../../src/core/history.js';` and `setReviewOutcome` to the reviews import):

```js
const onTab = (extra = {}) => ({ ...state, view: { name: 'platform', id: 'p1', tab: 'reviews', ...extra } });

test('the Reviews tab with no review open offers to start one', () => {
  const out = platformView(onTab(), data(), 'p1').toString();
  assert.match(out, /No review in progress/);
  assert.match(out, /data-action="beginReview" data-platform-id="p1"/);
  assert.match(out, /data-table="pastReviews"/);
});

test('an open review: a checklist with a tickbox and a note per hazard, the outcome, Complete and Abandon', () => {
  let d = startReview(data(), act, { id: 'r1', platformId: 'p1' });
  d = markRow(d, act, { reviewId: 'r1', hazardId: 'h1', note: 'Crew briefed' });
  const out = platformView(onTab(), d, 'p1').toString();
  assert.match(out, /data-table="reviewRows"/);
  assert.match(out, /<input type="checkbox" name="reviewed"[^>]*data-change="tickReviewRow" data-review-id="r1" data-hazard-id="h1"/);
  assert.doesNotMatch(out, /name="reviewed"[^>]* checked/, 'not yet ticked');
  assert.match(out, /data-dblclick="startEdit" data-kind="reviewNote" data-id="h1"[^>]*>Crew briefed</);
  assert.match(out, /<textarea name="outcome"[^>]*data-change="setReviewOutcome" data-review-id="r1"/);
  assert.match(out, /data-action="completeReview" data-review-id="r1"[^>]*>Complete — 1 not ticked</);
  assert.match(out, /data-action="abandonReview" data-review-id="r1"/);
  assert.match(out, /Reviews \(in progress\)/);
  const ticked = platformView(onTab(), markRow(d, act, { reviewId: 'r1', hazardId: 'h1', reviewed: true }), 'p1').toString();
  assert.match(ticked, /name="reviewed"[^>]* checked/);
  assert.match(ticked, />Complete review</);
  const noting = platformView({ ...onTab(), editing: { kind: 'reviewNote', id: 'h1' } }, d, 'p1').toString();
  assert.match(noting, /<input class="cell-edit" name="note" value="Crew briefed"[^>]*data-change="markRow" data-review-id="r1" data-hazard-id="h1"/);
});

test('a completed review is listed under past reviews and opens read-only', () => {
  let d = startReview(data(), act, { id: 'r1', platformId: 'p1' });
  d = markRow(d, act, { reviewId: 'r1', hazardId: 'h1', reviewed: true, note: 'OK' });
  d = setReviewOutcome(d, act, { reviewId: 'r1', outcome: 'Nothing to change' });
  d = completeReview(d, act, { reviewId: 'r1' });
  const list = platformView(onTab(), d, 'p1').toString();
  assert.match(list, /data-action="go" data-view="platform" data-id="p1" data-tab="reviews" data-review-id="r1">28 Sep 2026/);
  assert.match(list, /Nothing to change/);
  const one = platformView(onTab({ reviewId: 'r1' }), d, 'p1').toString();
  assert.match(one, /Completed by Ada/);
  assert.match(one, /data-table="reviewRecord"/);
  assert.doesNotMatch(one, /type="checkbox"/);
  assert.doesNotMatch(one, /data-action="completeReview"/);
});

test('notes and outcomes are shown literally', () => {
  let d = startReview(data(), act, { id: 'r1', platformId: 'p1' });
  d = markRow(d, act, { reviewId: 'r1', hazardId: 'h1', reviewed: true, note: '<b>x</b> & "y"' });
  d = setReviewOutcome(d, act, { reviewId: 'r1', outcome: '<script>alert(1)</script>' });
  const open = platformView(onTab(), d, 'p1').toString();
  assert.match(open, /&lt;b&gt;x&lt;\/b&gt; &amp; &quot;y&quot;/);
  assert.match(open, /&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/textarea>/);
  d = completeReview(d, act, { reviewId: 'r1' });
  for (const out of [platformView(onTab(), d, 'p1').toString(), platformView(onTab({ reviewId: 'r1' }), d, 'p1').toString()]) {
    assert.doesNotMatch(out, /<script>alert/);
    assert.doesNotMatch(out, /<b>x<\/b>/);
  }
});

test('the platform History tab leaves out ticks and notes but keeps starting and completing', () => {
  let d = startReview(data(), act, { id: 'r1', platformId: 'p1' });
  d = markRow(d, act, { reviewId: 'r1', hazardId: 'h1', reviewed: true });
  d = completeReview(d, act, { reviewId: 'r1' });
  assert.ok(entries(d).some((e) => e.action === 'Mark review row'));
  const out = platformView({ ...state, view: { name: 'platform', id: 'p1', tab: 'history' } }, d, 'p1').toString();
  assert.match(out, /Start review/);
  assert.match(out, /Complete review/);
  assert.doesNotMatch(out, /Mark review row/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/screens-reviews.test.js`
Expected: FAIL — the Reviews tab shows the Details content (no `No review in progress`).

- [ ] **Step 3: Write the implementation**

Extend the imports of `src/ui/screens/reviews.js` to:

```js
import { html, raw } from '../html.js';
import { dataAttrs, confirmButton, reviewTag, go, bandTag, idTag } from './common.js';
import { dataTable } from './table.js';
import { get } from '../../core/data.js';
import { openReview, lastReviewed, reviewRows, completedReviews, bandOf } from '../../core/queries.js';
import { reviewState } from '../../core/time.js';
import { MAX_REVIEW_MONTHS } from '../../core/ops/reviews.js';
import { BANDS } from '../../core/matrix.js';
import { day, when, profileName } from '../names.js';
```

and append:

```js
/** @param {{ confirmed: number, excluded: number, awaiting: number }} c */
function controlSummary(c) {
  const parts = [['confirmed', c.confirmed], ['excluded', c.excluded], ['awaiting', c.awaiting]].filter(([, n]) => n);
  return parts.length ? parts.map(([s, n]) => `${n} ${s}`).join(' · ') : html`<span class="muted">No controls</span>`;
}

const needsSchedule = html`<p class="muted">Completing a review needs a review schedule: set one on the Details tab.</p>`;

/** @param {any} state @param {Data} data @param {any} p @param {any} review */
function openReviewBlock(state, data, p, review) {
  const items = reviewRows(data, review.id);
  const unticked = items.filter((i) => i.onPlatform && !i.reviewed).length;
  const noting = (/** @type {any} */ i) => state.editing?.kind === 'reviewNote' && state.editing.id === i.hazard.id;
  const band = (/** @type {any} */ pair) => bandOf(pair);
  return html`<p class="muted">Started by ${profileName(state, review.createdBy)}, ${when(review.createdAt)}. Tick each hazard once its ratings and controls are checked on the Details tab.</p>
    <section class="block">${dataTable(state, {
      id: 'reviewRows',
      rowKey: (i) => i.hazard.id,
      rows: items,
      empty: 'This platform has no hazards to review.',
      columns: [
        { key: 'reportId', label: 'ID', width: 200, minWidth: 100, value: (i) => i.reportId, render: (i) => idTag(i.reportId) },
        { key: 'hazard', label: 'Hazard', width: 520, minWidth: 200, value: (i) => i.hazard.title, filter: 'text',
          render: (i) => html`${go(i.hazard.title, 'hazard', { id: i.hazard.id })}${i.onPlatform ? '' : html` <span class="muted">(no longer on this platform)</span>`}` },
        { key: 'initial', label: 'Initial', width: 220, minWidth: 120, value: (i) => (i.rating ? BANDS.indexOf(band(i.rating.initial)) : null),
          render: (i) => (i.rating ? bandTag(band(i.rating.initial)) : '—') },
        { key: 'residual', label: 'Residual', width: 220, minWidth: 120, value: (i) => (i.rating ? BANDS.indexOf(band(i.rating.residual)) : null),
          render: (i) => (i.rating ? bandTag(band(i.rating.residual)) : '—') },
        { key: 'controls', label: 'Controls', width: 400, minWidth: 180, sortable: false, render: (i) => (i.counts ? controlSummary(i.counts) : '—') },
        { key: 'reviewed', label: 'Reviewed', width: 200, minWidth: 120, value: (i) => (i.reviewed ? 'yes' : 'no'), filter: 'select', options: [['yes', 'Yes'], ['no', 'No']],
          render: (i) => html`<input type="checkbox" name="reviewed" aria-label="Reviewed: ${i.hazard.title}"${i.reviewed ? raw(' checked') : ''}${i.onPlatform ? '' : raw(' disabled')} ${dataAttrs({ change: 'tickReviewRow', 'review-id': review.id, 'hazard-id': i.hazard.id })}>` },
        { key: 'note', label: 'Note', width: 640, minWidth: 220, value: (i) => i.note, filter: 'text',
          render: (i) => (noting(i)
            ? html`<input class="cell-edit" name="note" value="${i.note}" placeholder="What was checked or found…" aria-label="Note on ${i.hazard.title}" autofocus ${dataAttrs({ change: 'markRow', 'review-id': review.id, 'hazard-id': i.hazard.id })}>`
            : i.onPlatform
              ? html`<span class="cell-text" ${dataAttrs({ dblclick: 'startEdit', kind: 'reviewNote', id: i.hazard.id })} title="Double-click to change">${i.note}</span>`
              : html`<span class="cell-text">${i.note}</span>`) },
      ],
    })}</section>
    <label class="outcome">Outcome
      <textarea name="outcome" rows="3" placeholder="What the review found, and anything to follow up…" ${dataAttrs({ change: 'setReviewOutcome', 'review-id': review.id })}>${review.outcome}</textarea></label>
    <div class="actions">
      <button type="button" class="primary" ${dataAttrs({ action: 'completeReview', 'review-id': review.id })}${p.reviewMonths ? '' : raw(' disabled')}>${unticked ? `Complete — ${unticked} not ticked` : 'Complete review'}</button>
      ${confirmButton('Abandon…', 'Abandon this review, discarding its ticks and notes', dataAttrs({ action: 'abandonReview', 'review-id': review.id }))}
    </div>
    ${p.reviewMonths ? '' : needsSchedule}`;
}

/** @param {any} state @param {Data} data @param {any} p @param {any} review */
function completedReview(state, data, p, review) {
  return html`<p>${go('← All reviews', 'platform', { id: p.id, tab: 'reviews' })}</p>
    <p class="doc-meta">Completed by ${profileName(state, review.completedBy)}, ${when(review.completedAt)}. It cleared the review due ${day(review.dueBefore)}; the next was then due ${day(review.dueAfter)}.</p>
    ${review.outcome ? html`<p class="outcome-text">${review.outcome}</p>` : ''}
    <section class="block">${dataTable(state, {
      id: 'reviewRecord',
      rowKey: (i) => i.hazard.id,
      rows: reviewRows(data, review.id),
      empty: 'The platform had no hazards when this review was completed.',
      columns: [
        { key: 'reportId', label: 'ID', width: 200, minWidth: 100, value: (i) => i.reportId, render: (i) => idTag(i.reportId) },
        { key: 'hazard', label: 'Hazard', width: 560, minWidth: 200, value: (i) => i.hazard.title, render: (i) => go(i.hazard.title, 'hazard', { id: i.hazard.id }) },
        { key: 'reviewed', label: 'Reviewed', width: 200, minWidth: 120, value: (i) => (i.reviewed ? 'Yes' : 'No'), filter: 'select', options: [['Yes', 'Yes'], ['No', 'No']] },
        { key: 'note', label: 'Note', width: 720, minWidth: 220, value: (i) => i.note },
      ],
    })}</section>`;
}

/** @param {any} state @param {Data} data @param {any} p */
function pastReviews(state, data, p) {
  return dataTable(state, {
    id: 'pastReviews',
    rowKey: (c) => c.review.id,
    rows: completedReviews(data, p.id),
    empty: 'No completed reviews yet.',
    columns: [
      { key: 'completed', label: 'Completed', width: 260, minWidth: 140, value: (c) => c.review.completedAt,
        render: (c) => go(day(c.review.completedAt), 'platform', { id: p.id, tab: 'reviews', 'review-id': c.review.id }) },
      { key: 'by', label: 'By', width: 220, minWidth: 100, value: (c) => profileName(state, c.review.completedBy) },
      { key: 'cleared', label: 'Review due', width: 240, minWidth: 130, value: (c) => c.review.dueBefore, render: (c) => day(c.review.dueBefore) },
      { key: 'outcome', label: 'Outcome', width: 640, minWidth: 200, value: (c) => c.review.outcome },
      { key: 'ticked', label: 'Reviewed', width: 180, minWidth: 100, value: (c) => c.ticked },
      { key: 'notTicked', label: 'Not reviewed', width: 200, minWidth: 110, value: (c) => c.notTicked },
    ],
  });
}

/**
 * The platform's Reviews tab: the review in progress (or a way to start one), and the past
 * reviews, one of which can be opened read-only.
 * @param {any} state @param {Data} data @param {any} p
 */
export function reviewsTab(state, data, p) {
  const chosen = state.view?.reviewId ? get(data, 'review', state.view.reviewId) : null;
  if (chosen && chosen.status === 'live' && chosen.state === 'completed' && chosen.platformId === p.id) return completedReview(state, data, p, chosen);
  const open = openReview(data, p.id);
  const top = open ? openReviewBlock(state, data, p, open)
    : p.status !== 'live' ? html`<p class="muted">${p.name} is retired, so it cannot be reviewed.</p>`
      : html`<p>No review in progress. <button type="button" ${dataAttrs({ action: 'beginReview', 'platform-id': p.id })}>Start review</button></p>${p.reviewMonths ? '' : needsSchedule}`;
  return html`${top}<h2>Past reviews</h2><section class="block">${pastReviews(state, data, p)}</section>`;
}
```

In `src/ui/screens/platforms.js`:

- add `reviewsTab` to the `./reviews.js` import and `import { REVIEW_DETAIL_ACTIONS } from '../../core/ops/reviews.js';`;
- change `const reaching = historyReaching(data, id);` to:

```js
  // Ticks, notes and outcome edits stay in the review itself rather than crowding the History tab.
  const reaching = historyReaching(data, id).filter((e) => !REVIEW_DETAIL_ACTIONS.includes(e.action));
```

- after the `if (tab === 'history') ...` line, add:

```js
  if (tab === 'reviews') return html`${head}<article class="doc">${reviewsTab(state, data, p)}</article>`;
```

Append to `src/ui/styles.css`:

```css
.outcome { display: grid; gap: 4px; max-width: 1100px; margin: 14px 0 8px; font-weight: 700; }
.outcome textarea { font-weight: 400; }
.outcome-text { max-width: 1100px; white-space: pre-wrap; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/screens-reviews.test.js`
Expected: PASS (11 tests).

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src/ui/screens/reviews.js src/ui/screens/platforms.js src/ui/styles.css test/ui/screens-reviews.test.js
git commit -m "A platform's Reviews tab: the review in progress as a checklist with a tick and note per hazard, the outcome, complete or abandon, and past reviews opened read-only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The report warning, and a check in the built app

**Files:**
- Modify: `src/ui/screens/reports.js`
- Modify: `src/ui/styles.css`
- Test: `test/ui/screens-reviews.test.js` (append)

**Interfaces:**
- Consumes: `reviewState`; `lastReviewed`; `state.today`, `state.reportPlatformId` and the `chooseReportPlatform` handler (Task 7); `report.review` (Task 6); `day`.
- Produces: the Produce form's platform select dispatches `chooseReportPlatform`; a note beside it for an overdue or due-soon platform; an `Overdue` badge on reports produced while overdue.

- [ ] **Step 1: Write the failing test**

Append to `test/ui/screens-reviews.test.js` (add `import { reportsView } from '../../src/ui/screens/reports.js';` and `import { createReport } from '../../src/core/ops/reports.js';`):

```js
test('the Reports screen warns about an overdue platform but still lets the report be produced', () => {
  const d = data();
  const first = reportsView(state, d).toString();
  assert.match(first, /<select name="platformId"[^>]*data-change="chooseReportPlatform"/);
  assert.match(first, /Alpha was due for review on 1 Sep 2026 \(never reviewed\)\. You can still produce the report; it will be marked as produced while overdue\./);
  assert.match(first, /<button type="submit" class="primary">Produce<\/button>/);
  const bravo = reportsView({ ...state, reportPlatformId: 'p2' }, d).toString();
  assert.match(bravo, /<option value="p2" selected>/);
  assert.match(bravo, /Bravo is due for review on 10 Oct 2026\./);
  assert.doesNotMatch(bravo, /produced while overdue\./);
  assert.doesNotMatch(reportsView(state, seed()).toString(), /due for review/);
});

test('a report produced while overdue carries a badge in the list', () => {
  const report = { platformId: 'p1', platformName: 'Alpha', ownerName: 'Ada', producedAt: act.at, producedBy: 'u1', title: 'Alpha hazards', classification: '', rows: [],
    review: { state: 'overdue', due: '2026-09-01', months: 6, lastReviewed: null }, markdown: '', html: '' };
  const d = createReport(data(), act, { id: 'rep1', report });
  assert.match(reportsView(state, d).toString(), /Alpha hazards <span class="tag review-overdue"[^>]*>Overdue<\/span>/);
  const fine = createReport(data(), act, { id: 'rep2', report: { ...report, review: { state: 'ok', due: '2027-01-01', months: 6, lastReviewed: null } } });
  assert.doesNotMatch(reportsView(state, fine).toString(), /review-overdue/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/screens-reviews.test.js`
Expected: FAIL — the select has no `data-change="chooseReportPlatform"`.

- [ ] **Step 3: Write the implementation**

In `src/ui/screens/reports.js`:

- add imports: `import { reviewState } from '../../core/time.js';`, `import { lastReviewed } from '../../core/queries.js';`, and `day` to the `../names.js` import;
- add this function above `reportsView`:

```js
/** What the Produce form says about the chosen platform's review. @param {any} state @param {import('../../core/data.js').Data} data @param {any} p */
function reviewNote(state, data, p) {
  const s = reviewState(p, state.today);
  if (s === 'overdue') {
    const last = lastReviewed(data, p.id);
    return html`<p class="note review-warning" role="status">${p.name} was due for review on ${day(p.reviewDue)} (${last ? `last reviewed ${day(last)}` : 'never reviewed'}). You can still produce the report; it will be marked as produced while overdue.</p>`;
  }
  if (s === 'dueSoon') return html`<p class="muted">${p.name} is due for review on ${day(p.reviewDue)}.</p>`;
  return '';
}
```

- in `reportsView`, after `const platforms = live(data, 'platform');` add:

```js
  const chosen = platforms.find((p) => p.id === state.reportPlatformId) ?? platforms[0];
```

- replace the platform `<label>` in the Produce form with:

```js
            <label>Platform <select name="platformId" ${dataAttrs({ change: 'chooseReportPlatform' })}>${platforms.map((p) => option(p.id, p.name, chosen?.id))}</select></label>
```

- after the form's closing `</form>` (inside the `platforms.length ? html\`...\`` branch), add `${chosen ? reviewNote(state, data, chosen) : ''}` so the branch reads `html\`<form …>…</form>${chosen ? reviewNote(state, data, chosen) : ''}\``;
- replace the `title` column with:

```js
          { key: 'title', label: 'Title', width: 320, value: (r) => r.title,
            render: (r) => html`${r.title}${r.review?.state === 'overdue' ? html` <span class="tag review-overdue" title="Produced while ${r.platformName} was overdue for review">Overdue</span>` : ''}` },
```

Append to `src/ui/styles.css`:

```css
.review-warning { background: var(--p-warn-bg); border: 1px solid var(--p-warn); }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/screens-reviews.test.js`
Expected: PASS (13 tests).

- [ ] **Step 5: Run everything and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass; `OK wrote …/dist/pivot.html`.

- [ ] **Step 6: Check it in a real browser**

Serve the folder and open the built app with the Playwright MCP tools (browser tooling is not a project dependency):

```bash
python3 -m http.server 8765 --directory dist
```

Open `http://localhost:8765/pivot.html`, choose a data folder, pick a profile, and check:

1. Platforms → a platform → **Set schedule**: enter 6 months and a date last month → **Set**. The line reads "Reviewed every 6 months · next due … Overdue · never reviewed". The platforms list shows the date with a red Overdue badge, and the Next review filter "Overdue" keeps it.
2. **Start review**: the Reviews tab opens, one row per hazard. Tick a box: it stays ticked after the screen redraws (the change sends `"true"`). Double-click a note cell, type, press Enter: the note shows. Type an outcome and click away.
3. Change the months box on the Details tab to 3 and tab away: the value sticks, the due date is unchanged.
4. Back on Reviews, **Complete — N not ticked** (or **Complete review**): the due date moves on in whole periods to the first date after today; the review appears under Past reviews; clicking its date opens it read-only.
5. History tab: "Start review" and "Complete review" appear; "Mark review row" does not.
6. Reports: with the overdue platform chosen the warning shows; choose another platform and the warning follows the choice. Produce (after saving): the report list shows the Overdue badge on that report.
7. Switch to light mode: the badges and the warning read clearly in both themes.

Fix anything that does not behave as described, with a test where the fault is in rendering or the controller, before committing.

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens/reports.js src/ui/styles.css test/ui/screens-reviews.test.js
git commit -m "Reports: a warning beside Produce when the chosen platform is overdue for review (never a block), and an Overdue badge on reports produced while overdue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
