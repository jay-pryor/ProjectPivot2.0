# Review Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move review scheduling and the running of reviews into a new top-level Reviews tab, with fixed or risk-based (named policy) review periods, a calculated next-due date, "review date moved" alerts, and a month-by-month timeline.

**Architecture:** A platform stores a rule (`reviewRule`), a start date (`reviewStart`) and the due date its owner last acknowledged (`reviewDueSeen`). A new pure module `src/core/schedule.js` works out the period, its driver and the next due date from the rule, the platform's residual ratings and its completed reviews (memoised per `Data`). Everything that showed `reviewDue` reads `scheduleOf(data, platformId)` instead. The UI gains a `reviews` view (Schedule / Timeline / Policies sub-tabs) and a `platformReview` view; the platform page loses its Reviews tab.

**Tech Stack:** Plain ES modules (Node ≥ 22, no bundler), `node:test`, HTML built with the `html` tagged template in `src/ui/html.js`, JSDoc types checked by `npm run typecheck`, single-file build by `npm run build`.

**Spec:** `docs/superpowers/specs/2026-10-08-review-scheduling-design.md`

## Global Constraints

- Periods are whole months from 1 to 120 (`MAX_REVIEW_MONTHS = 120`); the UI enters them as months or years (years × 12).
- `DUE_SOON_DAYS` stays 30; "urgent" means the new due date is on or before `today + 30 days` (so passed counts).
- Bands, worst first: `BANDS = ['High', 'Serious', 'Medium', 'Low', 'Eliminated', 'Not Credible', 'Uncategorised']`.
- Receptors: `RECEPTORS = ['personnel', 'environment', 'capability']`.
- "Review owner" = the platform's `ownerId`. No new owner field.
- `SCHEMA_VERSION` goes from 3 to 4. No conversion code in `src/`; a throwaway `scripts/convert-to-v4.mjs` converts the practice folder.
- Run `npm run build` after every source change (user preference); run `npm test` and `npm run typecheck` before each commit.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Match the surrounding code: JSDoc on every export, comments in plain sentences explaining *why*, British spelling ("colour", "acknowledge"), the `html` template and `dataAttrs` for markup.
- The branch `flashy-headers` has uncommitted bow-tie work from before this plan. Never `git add -A`; add only the files each task names.

## Review Focus

1. **A platform with a policy but no hazards, or only unrated hazards** — expect the policy's `longest` (or the Uncategorised row if it has a period) rather than a crash or "no schedule". Pinned in Task 1.
2. **Completing a review many periods late with a period that has since shortened** — expect the next due date to land after the completion date, never in the past. Pinned in Task 2.
3. **Deleting or retiring a hazard, or unlinking it from a platform, that was the driver** — expect the period to relax and a (normal) "review date moved" item, not a stale driver naming a gone hazard. Pinned in Task 1 (driver ignores non-live links) and Task 3.
4. **A policy deleted under a platform by a merge** (another user deleted it while this user assigned it) — expect the platform to read as "no schedule" with the rules check reporting it, not a throw. Pinned in Task 1 (`scheduleOf` with a missing policy) and Task 2 (rules).
5. **Typing a period of 0, 11 years, or "1.5" into the rule or policy grid** — expect a clear error message and nothing changed. Pinned in Task 2 and Task 6.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/core/schedule.js` (new) | Period + driver, next due, state, date-moved detection. Pure, memoised per `Data`. |
| `src/core/data.js` | `SCHEMA_VERSION = 4`; `reviewPolicy` kind. |
| `src/core/time.js` | `reviewState(due, today)` takes a due date. |
| `src/core/ops/reviews.js` | `setRule`, `acknowledgeReviewDate`, policy ops; `completeReview` on the new model. `setSchedule` removed. |
| `src/core/ops/platforms.js` | New platforms get `reviewRule: null, reviewStart: null, reviewDueSeen: null`. |
| `src/core/acks.js` | `Acknowledge review date` never waits for acknowledgement. |
| `src/core/queries.js` | `platformsReached` for `reviewPolicy`; review summaries read `scheduleOf`; `dateMoved` items; `attentionItems` order. |
| `src/core/rules.js` | `platform-policy-missing` rule. |
| `src/reports/snapshot.js` | Review block from `scheduleOf`. |
| `scripts/convert-to-v4.mjs` (new, throwaway) | Converts a practice `data.json` from schema 3 to 4. |
| `src/ui/names.js` | `periodWord(months)`, `ruleWord(data, platform)`, `driverWord(...)`. |
| `src/ui/screens/reviews.js` | Becomes the Reviews tab: Schedule table, Policies, platform review page. |
| `src/ui/screens/timeline.js` (new) | The Gantt. |
| `src/ui/screens/platforms.js` | Loses the Reviews tab; ⋯ menu gains Review schedule…; list/glance read `scheduleOf`. |
| `src/ui/screens/common.js` | Nav, SECTION, PAGE_WORD, FIELD_WORD, `reviewMovedDialog`, `show()` for rules. |
| `src/ui/screens/home.js` | `dateMoved` rows, links to the platform review page. |
| `src/ui/screens/reports.js` | Overdue warning reads `scheduleOf`. |
| `src/ui/render.js` | Routes `reviews` and `platformReview`. |
| `src/ui/controller.js` | New EDITS and handlers; due-move pop-up after each edit; timeline settings. |
| `src/ui/reviews-prefs.js` (new) | Read/write the Reviews filters and timeline range in localStorage. |
| `src/ui/styles.css` | Reviews tab, policy grid, timeline, urgent rows, pop-up. |
| `test/helpers.js` | `scheduleFixed(d, platformId, months, due)` helper for fixtures. |

---

### Task 1: Schedule model and calculations

**Files:**
- Create: `src/core/schedule.js`
- Modify: `src/core/data.js:3` (`SCHEMA_VERSION`), `src/core/data.js:5-14` (`KINDS`)
- Modify: `src/core/time.js:94-105` (`reviewState`)
- Modify: `src/core/ops/platforms.js:14` (new platform fields)
- Test: `test/core/schedule.test.js` (new)

**Interfaces:**
- Produces:
  - `KINDS` includes `'reviewPolicy'`; `SCHEMA_VERSION === 4`.
  - `reviewState(due: string | null, today: string): 'none' | 'overdue' | 'dueSoon' | 'ok'`
  - `periodOf(data, platformId): { months: number, driver: Driver } | null` where `Driver = { kind: 'fixed' } | { kind: 'longest' } | { kind: 'hazard', hazardId: string, receptor: 'personnel'|'environment'|'capability', band: string }`
  - `dueOf(data, platformId): string | null`
  - `scheduleOf(data, platformId, today): { rule, policy: Rec | null, months: number | null, driver: Driver | null, start: string | null, due: string | null, state: string, seen: string | null, moved: boolean, urgent: boolean }`
  - `URGENT_DAYS = 30`
  - Policy record shape: `{ name: string, order: number, longest: number, receptors: { personnel|environment|capability: { considered: boolean, periods: Record<band, number | null> } } }`

- [ ] **Step 1: Write the failing tests**

Create `test/core/schedule.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, SCHEMA_VERSION, put, created, changed } from '../../src/core/data.js';
import { reviewState } from '../../src/core/time.js';
import { periodOf, dueOf, scheduleOf } from '../../src/core/schedule.js';
import { setRating } from '../../src/core/ops/assessment.js';
import { unlinkHazard } from '../../src/core/ops/platforms.js';
import { act, seed } from '../helpers.js';

const BLANK = { High: null, Serious: null, Medium: null, Low: null, Eliminated: null, 'Not Credible': null, Uncategorised: null };
/** Serious → 6 months, Medium → 36 months for personnel; capability not considered; longest 60. */
const policy = (over = {}) => created(act, 'pol1', {
  name: 'Standard', order: 1, longest: 60,
  receptors: {
    personnel: { considered: true, periods: { ...BLANK, Serious: 6, Medium: 36 } },
    environment: { considered: true, periods: { ...BLANK, Serious: 12 } },
    capability: { considered: false, periods: { ...BLANK, Serious: 1, Medium: 1 } },
  },
  ...over,
});
/** p1 on the policy, started 2026-01-01. h1 is the only hazard on p1. */
function onPolicy(over) {
  let d = put(seed(), 'reviewPolicy', policy(over));
  d = put(d, 'platform', changed(d.records.platform.p1, act, { reviewRule: { kind: 'policy', policyId: 'pol1' }, reviewStart: '2026-01-01', reviewDueSeen: null }));
  return d;
}
const residual = (d, receptor, consequence, likelihood) => setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor, consequence, likelihood });

test('review policies are a record kind, under schema 4', () => {
  assert.ok(KINDS.includes('reviewPolicy'));
  assert.equal(SCHEMA_VERSION, 4);
});

test('reviewState reads a due date against today', () => {
  assert.equal(reviewState(null, '2026-10-08'), 'none');
  assert.equal(reviewState('2026-10-07', '2026-10-08'), 'overdue');
  assert.equal(reviewState('2026-11-07', '2026-10-08'), 'dueSoon');
  assert.equal(reviewState('2026-11-08', '2026-10-08'), 'ok');
});

test('a fixed rule gives its months; no rule gives no period', () => {
  let d = seed();
  assert.equal(periodOf(d, 'p1'), null);
  d = put(d, 'platform', changed(d.records.platform.p1, act, { reviewRule: { kind: 'fixed', months: 24 }, reviewStart: '2026-01-31' }));
  assert.deepEqual(periodOf(d, 'p1'), { months: 24, driver: { kind: 'fixed' } });
  assert.equal(dueOf(d, 'p1'), '2028-01-31');
});

test('a policy takes the shortest period any hazard gives for a considered receptor', () => {
  let d = residual(onPolicy(), 'personnel', 3, 'C'); // Medium → 36
  assert.deepEqual(periodOf(d, 'p1'), { months: 36, driver: { kind: 'hazard', hazardId: 'h1', receptor: 'personnel', band: 'Medium' } });
  d = residual(d, 'environment', 2, 'C'); // Serious → 12
  assert.equal(periodOf(d, 'p1')?.months, 12);
  d = residual(d, 'capability', 2, 'C'); // Serious, but capability is not considered
  assert.equal(periodOf(d, 'p1')?.months, 12);
  d = residual(d, 'personnel', 2, 'C'); // Serious → 6
  assert.deepEqual(periodOf(d, 'p1'), { months: 6, driver: { kind: 'hazard', hazardId: 'h1', receptor: 'personnel', band: 'Serious' } });
});

test('with nothing shorter, a policy gives its longest period', () => {
  assert.deepEqual(periodOf(onPolicy(), 'p1'), { months: 60, driver: { kind: 'longest' } }, 'unrated, and Uncategorised is blank');
  const withUnrated = onPolicy({ receptors: { ...policy().receptors, personnel: { considered: true, periods: { ...BLANK, Uncategorised: 3 } } } });
  assert.equal(periodOf(withUnrated, 'p1')?.months, 3, 'Uncategorised has its own row');
  const noHazards = unlinkHazard(onPolicy(), act, { hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual(periodOf(noHazards, 'p1'), { months: 60, driver: { kind: 'longest' } });
});

test('a period longer than the longest is capped at the longest', () => {
  const d = residual(onPolicy({ longest: 24 }), 'personnel', 3, 'C'); // Medium → 36, capped
  assert.deepEqual(periodOf(d, 'p1'), { months: 24, driver: { kind: 'longest' } });
});

test('a rule naming a missing or deleted policy reads as no schedule', () => {
  let d = onPolicy();
  d = put(d, 'reviewPolicy', changed(d.records.reviewPolicy.pol1, act, { status: 'deleted' }));
  assert.equal(periodOf(d, 'p1'), null);
  assert.equal(scheduleOf(d, 'p1', '2026-10-08').state, 'none');
});

test('the next due date steps past the latest completed review, in whole periods from the start', () => {
  let d = put(seed(), 'platform', changed(seed().records.platform.p1, act, { reviewRule: { kind: 'fixed', months: 6 }, reviewStart: '2026-01-31' }));
  assert.equal(dueOf(d, 'p1'), '2026-07-31');
  d = put(d, 'review', created(act, 'r1', { platformId: 'p1', state: 'completed', completedAt: '2027-03-01T09:00:00+10:00', dueBefore: '2026-01-31', dueAfter: null, completedBy: 'u1', outcome: '', notes: '' }));
  assert.equal(dueOf(d, 'p1'), '2027-07-31', 'three periods on, the first after 1 Mar 2027');
});

test('scheduleOf says whether the due date moved from what the owner saw, and whether that is urgent', () => {
  let d = residual(onPolicy(), 'personnel', 3, 'C'); // 36 months from 2026-01-01 → 2029-01-01
  d = put(d, 'platform', changed(d.records.platform.p1, act, { reviewDueSeen: '2029-01-01' }));
  const s = scheduleOf(d, 'p1', '2026-10-08');
  assert.deepEqual([s.due, s.state, s.moved, s.urgent], ['2029-01-01', 'ok', false, false]);
  d = residual(d, 'personnel', 2, 'C'); // 6 months → 2026-07-01, already passed
  const m = scheduleOf(d, 'p1', '2026-10-08');
  assert.deepEqual([m.due, m.state, m.moved, m.urgent, m.seen], ['2026-07-01', 'overdue', true, true, '2029-01-01']);
  d = residual(d, 'personnel', 3, 'C');
  d = residual(d, 'environment', 2, 'C'); // 12 months → 2027-01-01: moved, not urgent
  const n = scheduleOf(d, 'p1', '2026-10-08');
  assert.deepEqual([n.due, n.moved, n.urgent], ['2027-01-01', true, false]);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/core/schedule.test.js`
Expected: FAIL, `Cannot find module '.../src/core/schedule.js'`.

- [ ] **Step 3: Bump the schema and add the kind**

In `src/core/data.js`, change line 3 to `export const SCHEMA_VERSION = 4;` and add `'reviewPolicy'` after `'review', 'reviewRow',` in `KINDS`:

```js
  'review', 'reviewRow', 'reviewPolicy',
```

- [ ] **Step 4: Change `reviewState` to take a due date**

Replace `src/core/time.js` lines 94-105 with:

```js
/**
 * Where a review stands against today: none (no due date), overdue, due soon, or ok.
 * @param {string | null} due the calculated next due date @param {string} today
 * @returns {'none' | 'overdue' | 'dueSoon' | 'ok'}
 */
export function reviewState(due, today) {
  if (!due) return 'none';
  if (today > due) return 'overdue';
  if (due <= addDays(today, DUE_SOON_DAYS)) return 'dueSoon';
  return 'ok';
}
```

- [ ] **Step 5: New platforms carry the new fields**

In `src/core/ops/platforms.js:14` replace `reviewMonths: null, reviewDue: null` with `reviewRule: null, reviewStart: null, reviewDueSeen: null`.

- [ ] **Step 6: Write `src/core/schedule.js`**

```js
import { get, live } from './data.js';
import { BANDS } from './matrix.js';
import { RECEPTORS } from './receptors.js';
import { addMonths, addDays, aestDate, reviewState } from './time.js';
import { ratingsOf, bandOf, lastReviewed } from './queries.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Rec} Rec */
/** @typedef {'personnel' | 'environment' | 'capability'} Receptor */
/** @typedef {{ kind: 'fixed' } | { kind: 'longest' } | { kind: 'hazard', hazardId: string, receptor: Receptor, band: string }} Driver */

/** A moved review date is urgent when the new date is this many days away or fewer (or passed). */
export const URGENT_DAYS = 30;

/** The live policy a platform's rule names, or null. @param {Data} data @param {Rec} p */
export function policyOf(data, p) {
  if (p.reviewRule?.kind !== 'policy') return null;
  const pol = get(data, 'reviewPolicy', p.reviewRule.policyId);
  return pol && pol.status === 'live' ? pol : null;
}

/**
 * The period a policy gives a platform: for every live hazard on it and every receptor the policy
 * considers, the period its residual band has in the policy; the shortest of those and the policy's
 * longest. Ties keep the first found (hazards in link order, receptors in RECEPTORS order).
 * @param {Data} data @param {Rec} pol @param {string} platformId
 * @returns {{ months: number, driver: Driver }}
 */
function policyPeriod(data, pol, platformId) {
  /** @type {{ months: number, driver: Driver }} */
  let best = { months: pol.longest, driver: { kind: 'longest' } };
  for (const link of live(data, 'hazardPlatform').filter((l) => l.platformId === platformId)) {
    const hazard = get(data, 'hazard', link.hazardId);
    if (!hazard || hazard.status !== 'live') continue;
    const residual = ratingsOf(data, link.hazardId, platformId).residual;
    for (const receptor of /** @type {Receptor[]} */ ([...RECEPTORS])) {
      const r = pol.receptors?.[receptor];
      if (!r?.considered) continue;
      const band = bandOf(residual[receptor]);
      const months = r.periods?.[band];
      if (Number.isInteger(months) && months < best.months) best = { months, driver: { kind: 'hazard', hazardId: link.hazardId, receptor, band } };
    }
  }
  return best;
}

/** @type {WeakMap<Data, Map<string, { months: number, driver: Driver } | null>>} */
const periodCache = new WeakMap();

/**
 * How often a platform is reviewed, and what sets that: its fixed months, or its policy's shortest
 * period (with the hazard, receptor and band giving it) or longest. Null with no rule, or a rule
 * naming a policy that no longer exists.
 * @param {Data} data @param {string} platformId
 */
export function periodOf(data, platformId) {
  let m = periodCache.get(data);
  if (!m) periodCache.set(data, (m = new Map()));
  if (m.has(platformId)) return /** @type {{ months: number, driver: Driver } | null} */ (m.get(platformId));
  const p = get(data, 'platform', platformId);
  /** @type {{ months: number, driver: Driver } | null} */
  let out = null;
  if (p?.reviewRule?.kind === 'fixed') out = { months: p.reviewRule.months, driver: { kind: 'fixed' } };
  else if (p?.reviewRule?.kind === 'policy') {
    const pol = policyOf(data, p);
    out = pol ? policyPeriod(data, pol, platformId) : null;
  }
  m.set(platformId, out);
  return out;
}

/**
 * The next review due: the start plus one period, stepped on in whole periods (counted from the
 * start, so short months do not wear the day down) to the first date after the latest completed
 * review when that came on or after it. Null with no period or no start.
 * @param {Data} data @param {string} platformId @returns {string | null}
 */
export function dueOf(data, platformId) {
  const p = get(data, 'platform', platformId);
  const period = periodOf(data, platformId);
  if (!p || !period || !p.reviewStart) return null;
  const last = lastReviewed(data, platformId);
  const after = last ? aestDate(last) : null;
  let k = 1;
  let due = addMonths(p.reviewStart, period.months);
  while (after && due <= after) {
    k += 1;
    due = addMonths(p.reviewStart, k * period.months);
  }
  return due;
}

/**
 * Everything the screens say about a platform's schedule. `moved`: the calculated date differs from
 * the one its owner last acknowledged; `urgent`: moved, and the new date has passed or is within
 * URGENT_DAYS.
 * @param {Data} data @param {string} platformId @param {string} today
 */
export function scheduleOf(data, platformId, today) {
  const p = /** @type {Rec} */ (get(data, 'platform', platformId));
  const period = periodOf(data, platformId);
  const due = dueOf(data, platformId);
  const seen = p?.reviewDueSeen ?? null;
  const moved = Boolean(due && seen && due !== seen);
  return {
    rule: p?.reviewRule ?? null, policy: p ? policyOf(data, p) : null,
    months: period?.months ?? null, driver: period?.driver ?? null,
    start: p?.reviewStart ?? null, due, state: reviewState(due, today), seen, moved,
    urgent: moved && /** @type {string} */ (due) <= addDays(today, URGENT_DAYS),
  };
}

/** Bands in the order a policy grid lists them. */
export const POLICY_BANDS = BANDS;
```

- [ ] **Step 7: Run the tests**

Run: `node --test test/core/schedule.test.js`
Expected: PASS (all 9). If `setRating` rejects `likelihood: 'C'`, read `assessmentRec` in `src/core/ops/assessment.js` for the accepted form and adjust the test helper `residual`, not `schedule.js`.

- [ ] **Step 8: Build, then commit (the wider suite is fixed in Tasks 2–3)**

```bash
npm run build
git add src/core/schedule.js src/core/data.js src/core/time.js src/core/ops/platforms.js test/core/schedule.test.js
git commit -m "Review schedule model: policies, calculated period and due date

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expect other suites to fail until Task 3 (they still use `setSchedule` and `reviewState(platform, …)`). That's expected inside this sequence; Task 3 ends green.

---

### Task 2: Ops — rules, policies, completion, acknowledgement

**Files:**
- Modify: `src/core/ops/reviews.js` (replace `setSchedule`; rewrite `completeReview`; add ops)
- Modify: `src/core/acks.js:12-13` (`NOT_ACKNOWLEDGED`)
- Modify: `src/core/queries.js:100-137` (`platformsReached` for `reviewPolicy`)
- Modify: `src/core/rules.js` (new rule)
- Modify: `test/helpers.js` (fixture helper)
- Test: `test/core/ops/reviews.test.js` (rewrite schedule tests), `test/core/ops/review-policies.test.js` (new)

**Interfaces:**
- Consumes: `periodOf`, `dueOf`, `scheduleOf`, `policyOf` from Task 1.
- Produces:
  - `setRule(data, act, { platformId, kind: 'none'|'fixed'|'policy', months?, unit?: 'months'|'years', policyId?, start? })` — action names `'Set review rule'` / `'Remove review rule'`.
  - `acknowledgeReviewDate(data, act, { platformId })` — action `'Acknowledge review date'`.
  - `createReviewPolicy(data, act, { id?, name })` — action `'Create review policy'`; defaults: every receptor considered, every period `null`, `longest: 36`.
  - `updateReviewPolicy(data, act, { id, receptor?, band?, months?, unit?, considered?, longest?, longestUnit? })` — one change per call; action `'Change review policy'`.
  - `renameReviewPolicy(data, act, { id, name })`, `deleteReviewPolicy(data, act, { id })`.
  - `toMonths(n, unit, code)`: number of months from a form's value and unit, or throws `PivotError(code)`.
  - `test/helpers.js`: `scheduleFixed(d, platformId, months, due)` sets a fixed rule whose next due date is `due`.

- [ ] **Step 1: Add the fixture helper**

Append to `test/helpers.js`:

```js
import { setRule } from '../src/core/ops/reviews.js';
import { addMonths } from '../src/core/time.js';

/**
 * A fixed review rule whose next due date is `due`: the start is one period before it, and the
 * owner has seen that date. For tests that only care when a review falls due.
 * @param {import('../src/core/data.js').Data} d @param {string} platformId @param {number} months @param {string} due
 */
export function scheduleFixed(d, platformId, months, due) {
  return setRule(d, act, { platformId, kind: 'fixed', months, unit: 'months', start: addMonths(due, -months) });
}
```

(Move the two new `import` lines to the top of the file with the others.)

- [ ] **Step 2: Write the failing op tests**

In `test/core/ops/reviews.test.js`, replace the import of `setSchedule` with `setRule, acknowledgeReviewDate`, replace `scheduled` with:

```js
import { scheduleFixed } from '../../helpers.js';
import { scheduleOf } from '../../../src/core/schedule.js';
/** p1 Alpha (h1 on it) reviewed every 6 months, next due 2026-10-31. */
const scheduled = () => scheduleFixed(seed(), 'p1', 6, '2026-10-31');
```

and replace the first test (`'a schedule is a whole number…'`) with:

```js
test('a fixed rule is 1 to 120 months, given in months or years, from a real start date; none clears it', () => {
  const d = scheduled();
  assert.deepEqual(d.records.platform.p1.reviewRule, { kind: 'fixed', months: 6 });
  assert.equal(d.records.platform.p1.reviewStart, '2026-04-30');
  assert.equal(scheduleOf(d, 'p1', '2026-09-28').due, '2026-10-31');
  assert.equal(d.records.platform.p1.reviewDueSeen, '2026-10-31', 'whoever sets the rule has seen its date');
  assert.equal(entries(d).at(-1).action, 'Set review rule');
  const years = setRule(seed(), act, { platformId: 'p1', kind: 'fixed', months: '2', unit: 'years', start: '2026-01-01' });
  assert.deepEqual(years.records.platform.p1.reviewRule, { kind: 'fixed', months: 24 });
  assert.equal(MAX_REVIEW_MONTHS, 120);
  for (const [months, unit] of [[0, 'months'], [121, 'months'], [11, 'years'], [1.5, 'months'], ['x', 'months'], ['', 'months']]) {
    assert.throws(() => setRule(seed(), act, { platformId: 'p1', kind: 'fixed', months, unit, start: '2026-01-01' }), code('review.months'), `${months} ${unit}`);
  }
  assert.throws(() => setRule(seed(), act, { platformId: 'p1', kind: 'fixed', months: 6, unit: 'months', start: '2026-02-30' }), code('review.start'));
  const cleared = setRule(d, later, { platformId: 'p1', kind: 'none' });
  assert.deepEqual([cleared.records.platform.p1.reviewRule, cleared.records.platform.p1.reviewStart, cleared.records.platform.p1.reviewDueSeen], [null, null, null]);
  assert.equal(entries(cleared).at(-1).action, 'Remove review rule');
});

test('changing only the rule keeps the start; a policy rule needs a live policy', () => {
  const d = setRule(scheduled(), act, { platformId: 'p1', kind: 'fixed', months: 12, unit: 'months' });
  assert.equal(d.records.platform.p1.reviewStart, '2026-04-30');
  assert.throws(() => setRule(seed(), act, { platformId: 'p1', kind: 'policy', policyId: 'nope', start: '2026-01-01' }), code('not-found'));
  assert.throws(() => setRule(seed(), act, { platformId: 'p1', kind: 'fixed', months: 6, unit: 'months' }), code('review.start'), 'a first rule needs a start');
});

test('acknowledging a moved review date makes the calculated date the seen one', () => {
  let d = scheduled();
  d = setRule(d, later, { platformId: 'p1', kind: 'fixed', months: 3, unit: 'months' });
  // A rule change is seen by whoever made it; move the date under the owner another way.
  const p = d.records.platform.p1;
  d = { ...d, records: { ...d.records, platform: { ...d.records.platform, p1: { ...p, reviewDueSeen: '2026-10-31' } } } };
  assert.equal(scheduleOf(d, 'p1', '2026-09-28').moved, true);
  d = acknowledgeReviewDate(d, act, { platformId: 'p1' });
  assert.equal(scheduleOf(d, 'p1', '2026-09-28').moved, false);
  assert.equal(entries(d).at(-1).action, 'Acknowledge review date');
  assert.equal(acknowledgeReviewDate(d, act, { platformId: 'p1' }), d, 'nothing to acknowledge changes nothing');
});
```

Then find the existing completion test(s) in that file (search `completeReview`) and update their expectations: completion now sets `reviewStart` to the due it answered and `reviewDueSeen` to the next due, not `reviewDue`. Add:

```js
test('completing moves the start to the date answered and steps past today, even after the period shortened', () => {
  let d = started();
  d = completeReview(d, { by: 'u1', at: '2027-09-01T09:00:00+10:00' }, { reviewId: 'r1' });
  const p = d.records.platform.p1;
  assert.equal(p.reviewStart, '2026-10-31', 'the date that review answered');
  assert.equal(d.records.review.r1.dueBefore, '2026-10-31');
  assert.equal(d.records.review.r1.dueAfter, '2027-10-31', 'two periods on: the first after 1 Sep 2027');
  assert.equal(p.reviewDueSeen, '2027-10-31');
  assert.equal(scheduleOf(d, 'p1', '2027-09-01').due, '2027-10-31');
});
```

Create `test/core/ops/review-policies.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { entries } from '../../../src/core/history.js';
import { platformsReached } from '../../../src/core/queries.js';
import { checkRules } from '../../../src/core/rules.js';
import { createReviewPolicy, updateReviewPolicy, renameReviewPolicy, deleteReviewPolicy, setRule } from '../../../src/core/ops/reviews.js';
import { act, seed } from '../../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const made = () => createReviewPolicy(seed(), act, { id: 'pol1', name: 'Standard' });

test('a new policy considers every receptor, drives nothing, and is reviewed at least every 3 years', () => {
  const pol = made().records.reviewPolicy.pol1;
  assert.equal(pol.name, 'Standard');
  assert.equal(pol.longest, 36);
  for (const r of ['personnel', 'environment', 'capability']) {
    assert.equal(pol.receptors[r].considered, true);
    assert.deepEqual(Object.values(pol.receptors[r].periods), [null, null, null, null, null, null, null]);
  }
  assert.equal(entries(made()).at(-1).action, 'Create review policy');
  assert.throws(() => createReviewPolicy(made(), act, { name: ' standard ' }), code('reviewPolicy.duplicate'));
  assert.throws(() => createReviewPolicy(seed(), act, { name: '  ' }), code('empty'));
});

test('a policy cell takes months or years, or blank; a receptor can be left out; the longest is required', () => {
  let d = updateReviewPolicy(made(), act, { id: 'pol1', receptor: 'personnel', band: 'Serious', months: '6', unit: 'months' });
  d = updateReviewPolicy(d, act, { id: 'pol1', receptor: 'personnel', band: 'Medium', months: '3', unit: 'years' });
  d = updateReviewPolicy(d, act, { id: 'pol1', receptor: 'capability', considered: false });
  d = updateReviewPolicy(d, act, { id: 'pol1', longest: '5', longestUnit: 'years' });
  const pol = d.records.reviewPolicy.pol1;
  assert.equal(pol.receptors.personnel.periods.Serious, 6);
  assert.equal(pol.receptors.personnel.periods.Medium, 36);
  assert.equal(pol.receptors.capability.considered, false);
  assert.equal(pol.longest, 60);
  d = updateReviewPolicy(d, act, { id: 'pol1', receptor: 'personnel', band: 'Serious', months: '' });
  assert.equal(d.records.reviewPolicy.pol1.receptors.personnel.periods.Serious, null, 'blank clears a cell');
  assert.throws(() => updateReviewPolicy(d, act, { id: 'pol1', receptor: 'personnel', band: 'Serious', months: '0', unit: 'months' }), code('review.months'));
  assert.throws(() => updateReviewPolicy(d, act, { id: 'pol1', longest: '', longestUnit: 'months' }), code('review.months'));
  assert.throws(() => updateReviewPolicy(d, act, { id: 'pol1', receptor: 'people', band: 'Serious', months: '6' }), code('reviewPolicy.receptor'));
  assert.throws(() => updateReviewPolicy(d, act, { id: 'pol1', receptor: 'personnel', band: 'Awful', months: '6' }), code('reviewPolicy.band'));
});

test('renaming checks for clashes; a policy in use cannot be deleted', () => {
  let d = createReviewPolicy(made(), act, { id: 'pol2', name: 'Light' });
  assert.throws(() => renameReviewPolicy(d, act, { id: 'pol2', name: 'STANDARD' }), code('reviewPolicy.duplicate'));
  d = renameReviewPolicy(d, act, { id: 'pol2', name: 'Lighter' });
  assert.equal(d.records.reviewPolicy.pol2.name, 'Lighter');
  d = setRule(d, act, { platformId: 'p1', kind: 'policy', policyId: 'pol1', start: '2026-01-01' });
  assert.throws(() => deleteReviewPolicy(d, act, { id: 'pol1' }), (e) => code('reviewPolicy.inUse')(e) && /Alpha/.test(e.message));
  d = deleteReviewPolicy(d, act, { id: 'pol2' });
  assert.equal(d.records.reviewPolicy.pol2.status, 'deleted');
});

test('a policy reaches the platforms that use it; a rule naming a gone policy is reported', () => {
  let d = setRule(made(), act, { platformId: 'p1', kind: 'policy', policyId: 'pol1', start: '2026-01-01' });
  assert.deepEqual(platformsReached(d, 'reviewPolicy', d.records.reviewPolicy.pol1), ['p1']);
  // As a merge could leave it: the policy deleted under a platform still using it.
  const pol = { ...d.records.reviewPolicy.pol1, status: 'deleted' };
  d = { ...d, records: { ...d.records, reviewPolicy: { pol1: pol } } };
  assert.ok(checkRules(d).some((p) => p.rule === 'platform-policy-missing'));
});
```

(If `rules.js` exports its checker under a different name, use that name — check with `grep -n "^export function" src/core/rules.js`.)

- [ ] **Step 3: Run them to see them fail**

Run: `node --test test/core/ops/reviews.test.js test/core/ops/review-policies.test.js`
Expected: FAIL, `setRule` / `createReviewPolicy` not exported.

- [ ] **Step 4: Rewrite the top of `src/core/ops/reviews.js`**

Replace the imports and `setSchedule` (lines 1-35) with:

```js
import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, all, live, created, changed, need, needText, put } from '../data.js';
import { commit } from '../apply.js';
import { aestDate, isDate } from '../time.js';
import { openReview } from '../queries.js';
import { dueOf, POLICY_BANDS } from '../schedule.js';
import { RECEPTORS } from '../receptors.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */
/** @typedef {import('../data.js').Rec} Rec */

export const MAX_REVIEW_MONTHS = 120;

/** A new policy is reviewed at least this often, until someone says otherwise. */
const DEFAULT_LONGEST = 36;

/** Row-level review actions: kept in the history, but left out of the platform's History tab. */
export const REVIEW_DETAIL_ACTIONS = Object.freeze(['Mark review row', 'Set review outcome', 'Set review notes']);

/** @param {unknown} v */
const blank = (v) => v === undefined || v === null || v === '';

/**
 * A period from a form: a whole number of months or years, as months from 1 to MAX_REVIEW_MONTHS.
 * @param {unknown} n @param {unknown} unit 'years', or months otherwise @param {string} code
 */
export function toMonths(n, unit, code) {
  const v = blank(n) ? NaN : Number(n);
  const months = unit === 'years' ? v * 12 : v;
  if (!Number.isInteger(v) || months < 1 || months > MAX_REVIEW_MONTHS) {
    throw new PivotError(code, `A review period is a whole number of months or years, from 1 month to ${MAX_REVIEW_MONTHS / 12} years.`);
  }
  return months;
}

/**
 * The platform with `fields` changed, and its due date then marked seen: whoever sets the rule
 * has seen the date it gives.
 * @param {Data} data @param {Act} act @param {Rec} p @param {Record<string, any>} fields
 */
function withSeenDue(data, act, p, fields) {
  const rec = changed(p, act, fields);
  return changed(rec, act, { reviewDueSeen: dueOf(put(data, 'platform', rec), p.id) });
}

/**
 * Set how a platform's reviews are scheduled: none, a fixed period, or a review policy. A first
 * rule needs a start date (the date reviews are counted from); after that the start is kept
 * unless a new one is given.
 * @param {Data} data @param {Act} act
 * @param {{ platformId: string, kind: string, months?: unknown, unit?: unknown, policyId?: string, start?: unknown }} args
 */
export function setRule(data, act, { platformId, kind, months, unit, policyId, start }) {
  const p = need(data, 'platform', platformId);
  if (kind === 'none') {
    return commit(data, act, 'Remove review rule', [{ kind: 'platform', rec: changed(p, act, { reviewRule: null, reviewStart: null, reviewDueSeen: null }) }]);
  }
  /** @type {any} */
  let rule;
  if (kind === 'fixed') rule = { kind: 'fixed', months: toMonths(months, unit, 'review.months') };
  else if (kind === 'policy') {
    const pol = need(data, 'reviewPolicy', /** @type {string} */ (policyId));
    rule = { kind: 'policy', policyId: pol.id };
  } else throw new PivotError('review.rule', 'Choose no schedule, a fixed period or a review policy.');
  // Left out keeps the start; given as blank (a cleared date field) is refused below.
  const from = start === undefined || start === null ? p.reviewStart : start;
  if (!isDate(from)) throw new PivotError('review.start', 'Give the date reviews are counted from as a real date.');
  return commit(data, act, 'Set review rule', [{ kind: 'platform', rec: withSeenDue(data, act, p, { reviewRule: rule, reviewStart: from }) }]);
}

/**
 * The owner has seen that the platform's review date moved: the calculated date becomes the
 * seen one. Nothing happens when nothing moved.
 * @param {Data} data @param {Act} act @param {{ platformId: string }} args
 */
export function acknowledgeReviewDate(data, act, { platformId }) {
  const p = need(data, 'platform', platformId);
  const due = dueOf(data, platformId);
  if (!due || due === p.reviewDueSeen) return data;
  return commit(data, act, 'Acknowledge review date', [{ kind: 'platform', rec: changed(p, act, { reviewDueSeen: due }) }]);
}

/** A policy name, trimmed, not blank, and not another policy's (ignoring case). @param {Data} data @param {unknown} name @param {string | null} self */
function needPolicyName(data, name, self) {
  const n = needText(name, 'A policy name');
  const clash = all(data, 'reviewPolicy').find((x) => x.status !== 'deleted' && x.id !== self && String(x.name).toLowerCase() === n.toLowerCase());
  if (clash) throw new PivotError('reviewPolicy.duplicate', `There is already a policy called ${clash.name}.`);
  return n;
}

/** @returns {Record<string, number | null>} */
const blankPeriods = () => Object.fromEntries(POLICY_BANDS.map((b) => [b, null]));

/** @param {Data} data @param {Act} act @param {{ id?: string, name: string }} args */
export function createReviewPolicy(data, act, { id = newId(), name }) {
  const order = Math.max(0, ...all(data, 'reviewPolicy').map((x) => (Number.isInteger(x.order) ? x.order : 0))) + 1;
  const receptors = Object.fromEntries(RECEPTORS.map((r) => [r, { considered: true, periods: blankPeriods() }]));
  const rec = created(act, id, { name: needPolicyName(data, name, null), order, longest: DEFAULT_LONGEST, receptors });
  return commit(data, act, 'Create review policy', [{ kind: 'reviewPolicy', rec }]);
}

/**
 * One change to a policy: a band's period for a receptor (blank clears it), whether a receptor is
 * considered, or the longest period.
 * @param {Data} data @param {Act} act
 * @param {{ id: string, receptor?: string, band?: string, months?: unknown, unit?: unknown, considered?: unknown, longest?: unknown, longestUnit?: unknown }} args
 */
export function updateReviewPolicy(data, act, { id, receptor, band, months, unit, considered, longest, longestUnit }) {
  const pol = need(data, 'reviewPolicy', id);
  if (longest !== undefined) {
    return commit(data, act, 'Change review policy', [{ kind: 'reviewPolicy', rec: changed(pol, act, { longest: toMonths(longest, longestUnit, 'review.months') }) }]);
  }
  if (!RECEPTORS.includes(/** @type {any} */ (receptor))) throw new PivotError('reviewPolicy.receptor', 'Choose personnel, environment or capability.');
  const r = /** @type {string} */ (receptor);
  const was = pol.receptors[r];
  /** @type {any} */
  let next;
  if (considered !== undefined) next = { ...was, considered: considered === true || considered === 'true' };
  else {
    if (!POLICY_BANDS.includes(/** @type {any} */ (band))) throw new PivotError('reviewPolicy.band', 'That is not a risk band.');
    next = { ...was, periods: { ...was.periods, [/** @type {string} */ (band)]: blank(months) ? null : toMonths(months, unit, 'review.months') } };
  }
  return commit(data, act, 'Change review policy', [{ kind: 'reviewPolicy', rec: changed(pol, act, { receptors: { ...pol.receptors, [r]: next } }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, name: string }} args */
export function renameReviewPolicy(data, act, { id, name }) {
  const pol = need(data, 'reviewPolicy', id);
  return commit(data, act, 'Rename review policy', [{ kind: 'reviewPolicy', rec: changed(pol, act, { name: needPolicyName(data, name, id) }) }]);
}

/** A policy any live platform uses cannot be deleted; the refusal names them. @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deleteReviewPolicy(data, act, { id }) {
  const pol = need(data, 'reviewPolicy', id);
  const users = live(data, 'platform').filter((p) => p.reviewRule?.kind === 'policy' && p.reviewRule.policyId === id);
  if (users.length) throw new PivotError('reviewPolicy.inUse', `${pol.name} is used by ${users.map((p) => p.name).join(', ')}. Give them another rule first.`);
  return commit(data, act, 'Delete review policy', [{ kind: 'reviewPolicy', rec: changed(pol, act, { status: 'deleted' }) }]);
}
```

(The code uses `put` from `data.js`, so import it as shown.)

- [ ] **Step 5: Rewrite `completeReview`**

Replace the body of `completeReview` (keep the row handling) so the schedule part reads:

```js
export function completeReview(data, act, { reviewId }) {
  const r = needOpen(data, reviewId);
  const p = need(data, 'platform', r.platformId);
  const dueBefore = dueOf(data, p.id);
  if (!dueBefore) throw new PivotError('review.no-schedule', `Set a review schedule for ${p.name} first.`);
  /** @type {{ kind: string, rec: Rec }[]} */
  const recs = [];
  for (const link of live(data, 'hazardPlatform').filter((l) => l.platformId === p.id)) {
    const id = ids.reviewRow(reviewId, link.hazardId);
    const row = get(data, 'reviewRow', id);
    if (!row || row.status !== 'live') recs.push({ kind: 'reviewRow', rec: created(act, id, { reviewId, hazardId: link.hazardId, reviewed: false, note: '', final: true }) });
  }
  for (const row of live(data, 'reviewRow').filter((x) => x.reviewId === reviewId)) recs.push({ kind: 'reviewRow', rec: changed(row, act, { final: true }) });
  // The review counts from the date it answered, so a late one does not drift the schedule; the
  // next date then steps past today (this completion) in whole periods.
  const doneReview = changed(r, act, { state: 'completed', dueBefore, completedBy: act.by, completedAt: act.at });
  const moved = changed(p, act, { reviewStart: dueBefore });
  const after = put(put(data, 'review', doneReview), 'platform', moved);
  const dueAfter = /** @type {string} */ (dueOf(after, p.id));
  recs.push({ kind: 'review', rec: changed(doneReview, act, { dueAfter }) });
  recs.push({ kind: 'platform', rec: changed(moved, act, { reviewDueSeen: dueAfter }) });
  return commit(data, act, 'Complete review', recs);
}
```

Update its doc comment: "The due date moves on from the date this review answered, in whole periods, to the first date after today…". Remove the now-unused `addMonths` import (Step 4 already did).

- [ ] **Step 6: Acks, platformsReached, rules**

In `src/core/acks.js`, add `'Acknowledge review date'` to `NOT_ACKNOWLEDGED`.

In `src/core/queries.js` `platformsReached`, add before `default`:

```js
    case 'reviewPolicy':
      return live(data, 'platform').filter((p) => p.reviewRule?.kind === 'policy' && p.reviewRule.policyId === rec.id).map((p) => p.id).sort();
```

In `src/core/rules.js`, next to the review rules (around line 114), add:

```js
  for (const p of live(data, 'platform')) {
    if (p.reviewRule?.kind !== 'policy') continue;
    const pol = get(data, 'reviewPolicy', p.reviewRule.policyId);
    if (!pol || pol.status !== 'live') {
      out.push({ rule: 'platform-policy-missing', message: 'A platform is scheduled by a review policy that no longer exists.', records: [{ kind: 'platform', id: p.id }, { kind: 'reviewPolicy', id: p.reviewRule.policyId }] });
    }
  }
```

- [ ] **Step 7: Run the op tests**

Run: `node --test test/core/ops/reviews.test.js test/core/ops/review-policies.test.js test/core/schedule.test.js`
Expected: PASS. Fix other tests in `test/core/ops/reviews.test.js` that still read `reviewMonths`/`reviewDue` by switching them to `scheduleOf(d, 'p1', today).due` / `reviewStart`.

- [ ] **Step 8: Build and commit**

```bash
npm run build
git add src/core/ops/reviews.js src/core/acks.js src/core/queries.js src/core/rules.js test/helpers.js test/core/ops/reviews.test.js test/core/ops/review-policies.test.js
git commit -m "Review rules and policies: set, acknowledge, complete on the calculated date

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Queries, open items, snapshot — and the suite green again

**Files:**
- Modify: `src/core/queries.js:484-640` (`reviewDueList`, `openItems`, `upcomingReviews`, `platformCards`, `attentionItems`)
- Modify: `src/reports/snapshot.js:95-103`
- Modify: every test listed by `grep -rln "setSchedule\|reviewMonths\|reviewDue\b\|reviewState(" test`
- Test: `test/core/open-items.test.js` (add cases)

**Interfaces:**
- Consumes: `scheduleOf` (Task 1), `scheduleFixed` (Task 2).
- Produces:
  - `openItems(...)` result gains `dateMoved: { platform, due, seen, urgent, driver }[]`; `reviews[]` entries keep `{ platform, state, due, lastReviewed, open }` with `due` from `scheduleOf`.
  - `attentionItems` order: urgent `dateMoved` (type `'dateMoved'`, soonest due first), overdue reviews, changes, normal `dateMoved`, controls, implement, ratings, schedule.
  - Snapshot `review: { state, due, months, lastReviewed }` with `months` from `scheduleOf`.

- [ ] **Step 1: Write the failing open-items tests**

Add to `test/core/open-items.test.js` (import `scheduleFixed` from `../helpers.js`, `setRating` from ops/assessment, `put`/`changed` from data, `openItems, attentionItems` from queries):

```js
test('a moved review date is an item for the owner: urgent first when passed or within 30 days, otherwise with the changes', () => {
  let d = scheduleFixed(seed(), 'p1', 36, '2029-01-01');
  d = put(d, 'reviewPolicy', created(act, 'pol1', { name: 'S', order: 1, longest: 36, receptors: {
    personnel: { considered: true, periods: { High: 1, Serious: 6, Medium: null, Low: null, Eliminated: null, 'Not Credible': null, Uncategorised: null } },
    environment: { considered: false, periods: {} }, capability: { considered: false, periods: {} } } }));
  d = put(d, 'platform', changed(d.records.platform.p1, act, { reviewRule: { kind: 'policy', policyId: 'pol1' } }));
  // Seen 2029-01-01; the policy gives 36 → still 2029-01-01, nothing moved.
  assert.equal(openItems(d, '2026-10-08', 'u1').dateMoved.length, 0);
  d = setRating(d, later, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'personnel', consequence: 2, likelihood: 'C' }); // Serious → 6
  const items = openItems(d, '2026-10-08', 'u1');
  assert.equal(items.dateMoved.length, 1);
  assert.equal(items.dateMoved[0].urgent, true);
  assert.equal(attentionItems(items)[0].type, 'dateMoved', 'urgent moves come before everything');
  assert.equal(openItems(d, '2026-10-08', 'u2').dateMoved.length, 0, 'only the owner of p1');
});
```

Run: `node --test test/core/open-items.test.js` → FAIL (`dateMoved` undefined).

- [ ] **Step 2: Rewrite the review summaries in `src/core/queries.js`**

Add `import { scheduleOf } from './schedule.js';` at the top. Remove `reviewState` from the `./time.js` import if no longer used there.

```js
/** Every live platform with a review schedule, soonest due first. @param {Data} data @param {string} today */
export function reviewDueList(data, today) {
  return live(data, 'platform').map((platform) => ({ platform, s: scheduleOf(data, platform.id, today) }))
    .filter(({ s }) => s.due)
    .map(({ platform, s }) => ({ platform, state: s.state, due: /** @type {string} */ (s.due) }))
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}
```

In `openItems`: extend the typedef with `dateMoved: { platform: Rec, due: string, seen: string, urgent: boolean, driver: any }[]`, initialise `dateMoved: []`, and replace the review lines in the platform loop with:

```js
    const s = scheduleOf(data, platform.id, today);
    const open = Boolean(openReview(data, platform.id));
    if (s.state === 'overdue' || s.state === 'dueSoon' || s.state === 'none' || open) {
      out.reviews.push({ platform, state: s.state, due: s.due, lastReviewed: lastReviewed(data, platform.id), open });
    }
    if (s.moved) out.dateMoved.push({ platform, due: /** @type {string} */ (s.due), seen: /** @type {string} */ (s.seen), urgent: s.urgent, driver: s.driver });
```

After the loop: `out.dateMoved.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));`

`upcomingReviews`:

```js
export function upcomingReviews(data, today, ownerId, days = 90) {
  const until = addDays(today, days);
  return live(data, 'platform').filter((p) => ownedBy(p, ownerId))
    .map((platform) => {
      const s = scheduleOf(data, platform.id, today);
      return { platform, due: s.due, state: s.state, open: Boolean(openReview(data, platform.id)) };
    })
    .filter((r) => r.open || (r.due && r.state !== 'overdue' && r.due <= until))
    .sort((a, b) => ((a.due ?? '9999') < (b.due ?? '9999') ? -1 : (a.due ?? '9999') > (b.due ?? '9999') ? 1 : 0));
}
```

`platformCards`: replace `state: reviewState(platform, today), due: platform.reviewDue ?? null` with `...(({ state, due }) => ({ state, due }))(scheduleOf(data, platform.id, today))`, or more plainly compute `const s = scheduleOf(data, platform.id, today);` above the `return` and use `state: s.state, due: s.due`.

`attentionItems` (update the doc comment to match):

```js
export function attentionItems(items) {
  const moved = items.dateMoved ?? [];
  return [
    ...moved.filter((m) => m.urgent).map((m) => ({ type: 'dateMoved', ...m })),
    ...items.reviews.filter((r) => r.state === 'overdue').sort((a, b) => ((a.due ?? '') < (b.due ?? '') ? -1 : 1)).map((r) => ({ type: 'review', ...r })),
    ...items.acks.map((a) => ({ type: 'change', ...a })),
    ...moved.filter((m) => !m.urgent).map((m) => ({ type: 'dateMoved', ...m })),
    ...items.awaiting.map((x) => ({ type: 'control', ...x })),
    ...items.toImplement.map((x) => ({ type: 'implement', ...x })),
    ...items.unrated.map((x) => ({ type: 'rating', ...x })),
    ...items.reviews.filter((r) => r.state === 'none' && !r.open).map((r) => ({ type: 'schedule', ...r })),
  ];
}
```

- [ ] **Step 3: Snapshot**

In `src/reports/snapshot.js`, import `scheduleOf` from `../core/schedule.js`, drop `reviewState` from the time import if unused, and replace the review block:

```js
    review: (() => {
      const s = scheduleOf(data, platformId, aestDate(o.at));
      return { state: s.state, due: s.due, months: s.months, lastReviewed: lastReviewed(data, platformId) };
    })(),
```

- [ ] **Step 4: Move every test fixture to the new model**

Run: `grep -rln "setSchedule\|reviewMonths\|reviewDue\b\|reviewState(" test src`.
For each test file:
- `setSchedule(d, act, { platformId: X, months: M, due: D })` → `scheduleFixed(d, X, M, D)` (import from `helpers.js`; mind the relative path depth).
- `reviewState(p, today)` → `reviewState(scheduleOf(d, p.id, today).due, today)` or assert on `scheduleOf(...).state` directly.
- Reads of `.reviewDue` → `scheduleOf(d, id, today).due`; of `.reviewMonths` → `.reviewRule.months`.
- A test that cleared a schedule with `setSchedule(d, act, { platformId })` → `setRule(d, act, { platformId, kind: 'none' })`.
- `test/core/random-edits.js`: replace its `setSchedule` call with `setRule(..., { kind: 'fixed', months, unit: 'months', start })`.
- `test/core/reviews-merge.test.js`: merges compare whole records; update expected fields to `reviewStart`/`reviewDueSeen`.

Leave `test/ui/*` UI-screen tests that check the old platform Reviews tab markup for Task 7 (skip them meanwhile only if they block: mark with `test.skip` and a `// Task 7` comment; Task 7 removes or rewrites them).

For `src/`, only the UI files remain (`platforms.js`, `reports.js`, `reviews.js`, `controller.js`): make each compile now with the minimum change, as Tasks 5–9 rewrite them:
- `src/ui/screens/platforms.js:44-47,130` and `src/ui/screens/reports.js:12-17`: use `const s = scheduleOf(data, p.id, state.today)` and `s.due`/`s.state` in place of `p.reviewDue`/`reviewState(p, …)`.
- `src/ui/screens/reviews.js`: replace `reviewState(p, state.today)` with `scheduleOf(data, p.id, state.today).state`, `p.reviewDue` with that `.due`, and `p.reviewMonths` with `p.reviewRule` (truthiness only). The schedule card's inputs are rebuilt in Task 7; until then point its form at `setRule` with `kind: 'fixed'`, `unit: 'months'`, and name the date field `start`.
- `src/ui/controller.js:55`: replace `setSchedule: reviews.setSchedule` with `setRule: reviews.setRule, acknowledgeReviewDate: reviews.acknowledgeReviewDate, createReviewPolicy: reviews.createReviewPolicy, updateReviewPolicy: reviews.updateReviewPolicy, renameReviewPolicy: reviews.renameReviewPolicy, deleteReviewPolicy: reviews.deleteReviewPolicy`; delete the `setScheduleField` handler (Task 7 adds `setRuleField`).
- `src/ui/screens/common.js` `FIELD_WORD`: replace the `reviewDue`/`reviewMonths` words with `reviewRule: 'review rule', reviewStart: 'reviews counted from', reviewDueSeen: 'review date acknowledged', longest: 'longest period'`.

- [ ] **Step 5: Run everything**

Run: `npm test && npm run typecheck`
Expected: PASS (bar any UI tests skipped for Task 7, which show as skipped).

- [ ] **Step 6: Build and commit**

```bash
npm run build
git add src/core/queries.js src/reports/snapshot.js src/ui/screens/platforms.js src/ui/screens/reports.js src/ui/screens/reviews.js src/ui/screens/common.js src/ui/controller.js test
git commit -m "Open items, Home and reports read the calculated review date; review date moved items

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Note: `git add test` would also add the pre-existing uncommitted bow-tie test edits. Instead add each test file you changed by name (`git status --short test` shows them; leave `test/core/barriers.test.js`, `test/core/bowtie-views.test.js`, `test/core/bowtie.test.js`, `test/ui/bowtie-svg.test.js`, `test/ui/controller-bowties.test.js`, `test/ui/screens-bowties.test.js`, `test/ui/workspace.test.js` alone unless this task changed them).

---

### Task 4: Throwaway conversion script

**Files:**
- Create: `scripts/convert-to-v4.mjs`
- Test: `test/scripts/convert-to-v4.test.js` (new; runs the pure function)

**Interfaces:**
- Produces: `convertBody(body: any): any` (exported for the test) and a CLI: `node scripts/convert-to-v4.mjs <folder>` rewriting `<folder>/data.json` in place after copying it to `<folder>/data.v3.json`.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertBody } from '../../scripts/convert-to-v4.mjs';

test('a schema 3 platform schedule becomes a fixed rule counted from one period before its due date', () => {
  const body = { records: { platform: {
    p1: { id: 'p1', name: 'A', reviewMonths: 6, reviewDue: '2026-10-31' },
    p2: { id: 'p2', name: 'B', reviewMonths: null, reviewDue: null },
  }, review: {} } };
  const out = convertBody(body);
  assert.deepEqual(out.records.platform.p1, { id: 'p1', name: 'A', reviewRule: { kind: 'fixed', months: 6 }, reviewStart: '2026-04-30', reviewDueSeen: '2026-10-31' });
  assert.deepEqual(out.records.platform.p2, { id: 'p2', name: 'B', reviewRule: null, reviewStart: null, reviewDueSeen: null });
  assert.deepEqual(out.records.reviewPolicy, {});
});
```

Run: `node --test test/scripts/convert-to-v4.test.js` → FAIL (module not found).

Note `package.json`'s test glob is `test/**/*.test.js`, so this file runs with the suite.

- [ ] **Step 2: Write the script**

```js
#!/usr/bin/env node
/**
 * Throwaway: converts a practice folder's data.json from schema 3 to 4 (review rules). Not part
 * of the app; delete once nobody has schema 3 data.
 *
 *     node scripts/convert-to-v4.mjs <folder>     # keeps the old file as data.v3.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seal, serialize } from '../src/storage/envelope.js';
import { addMonths } from '../src/core/time.js';

/** @param {any} body the data inside a schema 3 envelope */
export function convertBody(body) {
  const platform = Object.fromEntries(Object.entries(body.records.platform ?? {}).map(([id, p]) => {
    const { reviewMonths, reviewDue, ...rest } = /** @type {any} */ (p);
    const scheduled = Number.isInteger(reviewMonths) && typeof reviewDue === 'string';
    return [id, {
      ...rest,
      reviewRule: scheduled ? { kind: 'fixed', months: reviewMonths } : null,
      reviewStart: scheduled ? addMonths(reviewDue, -reviewMonths) : null,
      reviewDueSeen: scheduled ? reviewDue : null,
    }];
  }));
  return { ...body, records: { ...body.records, platform, reviewPolicy: body.records.reviewPolicy ?? {} } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const folder = process.argv[2];
  if (!folder) { console.error('Usage: node scripts/convert-to-v4.mjs <folder>'); process.exit(1); }
  const file = path.join(folder, 'data.json');
  const env = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (env.schemaVersion !== 3) { console.error(`data.json is schema ${env.schemaVersion}, not 3.`); process.exit(1); }
  fs.copyFileSync(file, path.join(folder, 'data.v3.json'));
  const sealed = await seal('data', convertBody(env.body), env.stamp, env.writtenAt);
  fs.writeFileSync(file, serialize(sealed));
  console.log(`Converted ${file} to schema 4 (old copy: data.v3.json).`);
}
```

Check `addMonths` with a negative `n`: `total % 12` is negative for negative totals below zero only when the year goes below 0, so practice dates are fine; the test above (Oct − 6 → Apr) checks it.

- [ ] **Step 3: Run the test, build, commit**

Run: `node --test test/scripts/convert-to-v4.test.js` → PASS.

```bash
npm run build
git add scripts/convert-to-v4.mjs test/scripts/convert-to-v4.test.js
git commit -m "Throwaway script converting practice data to schema 4

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Tell the user to run `node scripts/convert-to-v4.mjs <their practice folder>` (backups in `backups/` stay schema 3 and won't restore; that's acceptable for practice data).

---

### Task 5: Reviews tab shell and the Schedule sub-tab

**Files:**
- Modify: `src/ui/names.js` (period and rule words)
- Modify: `src/ui/screens/common.js:157-163` (NAV, SECTION), `:270` (PAGE_WORD)
- Modify: `src/ui/screens/reviews.js` (add `reviewsView`, `scheduleTable`)
- Create: `src/ui/reviews-prefs.js`
- Modify: `src/ui/render.js` (route `reviews`)
- Modify: `src/ui/controller.js` (state `reviewsPrefs`, handlers `setReviewsFilter`, load/save prefs; QUIET)
- Modify: `src/ui/styles.css`
- Test: `test/ui/screens-reviews-tab.test.js` (new), `test/ui/reviews-prefs.test.js` (new)

**Interfaces:**
- Consumes: `scheduleOf`, `periodOf` (Task 1), `lastReviewed`, `openReview`, `listPlatformGroups`, `groupsOf` (queries).
- Produces:
  - Views: `{ name: 'reviews', tab?: 'schedule' | 'timeline' | 'policies', id?: policyId }`.
  - `periodWord(months: number): string` — `'6 months'`, `'1 month'`, `'2 years'`, `'18 months'`.
  - `ruleWord(data, platform): string` — `'Fixed · 2 years'`, `'Standard (policy)'`, `'None'`.
  - `driverWord(data, driver): string` — `'HZ-012 residual personnel: Serious'`, `'Policy’s longest period'`, `''` for fixed.
  - `ReviewsPrefs = { owner: 'me' | 'everyone' | profileId, groupId: string | null, start: string /* YYYY-MM */ | null, length: 6 | 12 | 24 | 36 | 60 | 120, past: boolean }`; `DEFAULT_REVIEWS_PREFS`; `readReviewsPrefs(storage, key)`, `writeReviewsPrefs(storage, key, prefs)`, `reviewsPrefsKey(folderName, profileId)`.
  - `reviewsOwnerId(state): string | null` (like `homeOwnerId`).
  - Controller action `setReviewsFilter({ owner?, groupId?, start?, length?, past?, shift? })`.

- [ ] **Step 1: Write the failing tests**

`test/ui/reviews-prefs.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../fakes/storage.js';
import { readReviewsPrefs, writeReviewsPrefs, DEFAULT_REVIEWS_PREFS, reviewsPrefsKey } from '../../src/ui/reviews-prefs.js';

test('Reviews filters and range are remembered per folder and profile, and anything odd reads as the defaults', () => {
  const s = new MemoryStorage();
  const key = reviewsPrefsKey('Pivot data', 'u1');
  assert.deepEqual(readReviewsPrefs(s, key), DEFAULT_REVIEWS_PREFS);
  writeReviewsPrefs(s, key, { ...DEFAULT_REVIEWS_PREFS, owner: 'everyone', length: 60, start: '2026-01', past: true });
  assert.deepEqual(readReviewsPrefs(s, key), { ...DEFAULT_REVIEWS_PREFS, owner: 'everyone', length: 60, start: '2026-01', past: true });
  s.setItem(key, '{"length": 7, "start": "nope", "owner": 3}');
  assert.deepEqual(readReviewsPrefs(s, key), DEFAULT_REVIEWS_PREFS);
  assert.deepEqual(readReviewsPrefs({ getItem() { throw new Error('refused'); } }, key), DEFAULT_REVIEWS_PREFS);
});
```

`test/ui/screens-reviews-tab.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewsView } from '../../src/ui/screens/reviews.js';
import { shell } from '../../src/ui/screens/common.js';
import { periodWord } from '../../src/ui/names.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { DEFAULT_REVIEWS_PREFS } from '../../src/ui/reviews-prefs.js';
import { seed, scheduleFixed } from '../helpers.js';

export const state = { ...initialState(), screen: 'main', today: '2026-09-28', view: { name: 'reviews' }, reviewsPrefs: { ...DEFAULT_REVIEWS_PREFS, owner: 'everyone' },
  profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }], profileId: 'u1' };
/** p1 every 6 months, overdue (due 2026-09-01); p2 no schedule. */
export const data = () => scheduleFixed(assignNumbers(seed()), 'p1', 6, '2026-09-01');

test('periods read in years when they are whole years', () => {
  assert.deepEqual([1, 6, 12, 18, 24, 120].map(periodWord), ['1 month', '6 months', '1 year', '18 months', '2 years', '10 years']);
});

test('Reviews is in the top bar, between Platforms and Bow-ties', () => {
  const out = shell({ ...state, session: { working: data(), base: data() } }, /** @type {any} */ ('')).toString();
  assert.match(out, /data-view="platforms">Platforms<\/button>\s*<button[^>]*data-view="reviews">Reviews<\/button>\s*<button[^>]*data-view="bowties"/);
  assert.match(out, /class="nav on"[^>]*data-view="reviews"/);
});

test('the Schedule sub-tab lists every platform: rule, period, next due with its state, last reviewed; overdue first, none last', () => {
  const out = reviewsView(state, data()).toString();
  assert.match(out, /<nav class="tabs">[\s\S]*Schedule[\s\S]*Timeline[\s\S]*Policies/);
  assert.match(out, /data-row="p1"[\s\S]*Fixed · 6 months[\s\S]*1 Sep 2026[\s\S]*review-overdue[\s\S]*data-row="p2"[\s\S]*None/);
  assert.match(out, /data-row="p1"[^>]*data-dblclick="go" data-view="platformReview" data-id="p1"/);
});

test('the owner filter narrows the list to that owner’s platforms', () => {
  const mine = reviewsView({ ...state, reviewsPrefs: { ...DEFAULT_REVIEWS_PREFS, owner: 'me' } }, data()).toString();
  assert.match(mine, /data-row="p1"/);
  assert.doesNotMatch(mine, /data-row="p2"/);
  assert.match(mine, /<select name="owner"[^>]*data-change="setReviewsFilter"/);
});
```

Run both → FAIL.

- [ ] **Step 2: `src/ui/reviews-prefs.js`**

```js
/** How the Reviews tab is filtered, and the timeline's range: remembered per browser, folder and profile. */

/** @typedef {{ owner: string, groupId: string | null, start: string | null, length: number, past: boolean }} ReviewsPrefs */

export const TIMELINE_LENGTHS = Object.freeze([6, 12, 24, 36, 60, 120]);

/** @type {ReviewsPrefs} */
export const DEFAULT_REVIEWS_PREFS = Object.freeze({ owner: 'me', groupId: null, start: null, length: 36, past: false });

/** @param {string} folderName @param {string} profileId */
export function reviewsPrefsKey(folderName, profileId) {
  return `pivot.reviews:${folderName}:${profileId}`;
}

/**
 * The remembered filters and range; anything missing, refused or malformed is its default.
 * @param {Pick<Storage, 'getItem'>} storage @param {string} key @returns {ReviewsPrefs}
 */
export function readReviewsPrefs(storage, key) {
  try {
    const v = JSON.parse(storage.getItem(key) ?? 'null');
    if (!v || typeof v !== 'object') return DEFAULT_REVIEWS_PREFS;
    const ok = typeof v.owner === 'string' && (v.groupId === null || typeof v.groupId === 'string')
      && (v.start === null || /^\d{4}-\d{2}$/.test(v.start)) && TIMELINE_LENGTHS.includes(v.length) && typeof v.past === 'boolean';
    return ok ? { owner: v.owner, groupId: v.groupId, start: v.start, length: v.length, past: v.past } : DEFAULT_REVIEWS_PREFS;
  } catch {
    return DEFAULT_REVIEWS_PREFS;
  }
}

/** @param {Pick<Storage, 'setItem'>} storage @param {string} key @param {ReviewsPrefs} prefs */
export function writeReviewsPrefs(storage, key, prefs) {
  try {
    storage.setItem(key, JSON.stringify(prefs));
  } catch {
    // A convenience only: a full or refused storage just forgets the filters.
  }
}
```

- [ ] **Step 3: Words in `src/ui/names.js`**

```js
/** A period as a person says it: whole years in years, otherwise months. @param {number} months */
export function periodWord(months) {
  if (months % 12 === 0) return `${months / 12} year${months === 12 ? '' : 's'}`;
  return `${months} month${months === 1 ? '' : 's'}`;
}
```

And, in `src/ui/screens/reviews.js` (it has `data` and `hazardLabel` to hand; `names.js` stays free of data lookups):

```js
/** How a platform is scheduled, in a few words. @param {Data} data @param {any} p */
export function ruleWord(data, p) {
  const r = p.reviewRule;
  if (r?.kind === 'fixed') return `Fixed · ${periodWord(r.months)}`;
  if (r?.kind === 'policy') {
    const pol = get(data, 'reviewPolicy', r.policyId);
    return pol && pol.status === 'live' ? `${pol.name} (policy)` : 'Policy missing';
  }
  return 'None';
}

/** What sets a policy's period, in a few words; nothing for a fixed rule. @param {Data} data @param {any} driver */
export function driverWord(data, driver) {
  if (driver?.kind === 'longest') return 'Policy’s longest period';
  if (driver?.kind !== 'hazard') return '';
  const h = get(data, 'hazard', driver.hazardId);
  return `${h ? hazardLabel(h) : 'A hazard'} residual ${driver.receptor}: ${driver.band}`;
}
```

(import `hazardLabel` from `../../core/ids.js` and `periodWord` from `../names.js`.)

- [ ] **Step 4: Nav, section, page word**

In `src/ui/screens/common.js`:
- `NAV`: insert `['reviews', 'Reviews']` after `['platforms', 'Platforms']`.
- `SECTION`: add `reviews: 'reviews', platformReview: 'reviews'`.
- `PAGE_WORD`: add `reviews: 'Reviews', platformReview: 'Review'`.

- [ ] **Step 5: `reviewsView` and the Schedule table**

Add to `src/ui/screens/reviews.js`:

```js
/** Whose platforms the Reviews tab shows: the active profile for "me", everyone as null. @param {any} state */
export function reviewsOwnerId(state) {
  const o = state.reviewsPrefs?.owner || 'me';
  return o === 'everyone' ? null : o === 'me' ? state.profileId : o;
}

/** The live platforms the Reviews filters let through. @param {any} state @param {Data} data */
export function reviewsPlatforms(state, data) {
  const owner = reviewsOwnerId(state);
  const groupId = state.reviewsPrefs?.groupId ?? null;
  return live(data, 'platform')
    .filter((p) => owner == null || p.ownerId === owner)
    .filter((p) => !groupId || groupsOf(data, p.id).some((g) => g.id === groupId));
}

/** The owner and platform group choosers, shared by Schedule and Timeline. @param {any} state @param {Data} data */
function reviewsFilters(state, data) {
  const prefs = state.reviewsPrefs ?? DEFAULT_REVIEWS_PREFS;
  const groups = listPlatformGroups(data);
  return html`<div class="rv-filters">
    <label class="owner-pick">Owner <select name="owner" ${dataAttrs({ change: 'setReviewsFilter' })}>
      ${option('me', 'Me', prefs.owner)}${state.profiles.filter((/** @type {any} */ p) => p.id !== state.profileId).map((/** @type {any} */ p) => option(p.id, p.name, prefs.owner))}${option('everyone', 'Everyone', prefs.owner)}
    </select></label>
    ${groups.length ? html`<label class="owner-pick">Group <select name="groupId" ${dataAttrs({ change: 'setReviewsFilter' })}>
      ${option('', 'All', prefs.groupId ?? '')}${groups.map((g) => option(g.id, g.name, prefs.groupId ?? ''))}</select></label>` : ''}
  </div>`;
}

const STATE_RANK = { overdue: 0, dueSoon: 1, ok: 2, none: 3 };

/** @param {any} state @param {Data} data */
function scheduleTable(state, data) {
  const rows = reviewsPlatforms(state, data).map((platform) => ({
    platform, s: scheduleOf(data, platform.id, state.today), last: lastReviewed(data, platform.id), open: Boolean(openReview(data, platform.id)),
  }));
  rows.sort((a, b) => STATE_RANK[/** @type {'ok'} */ (a.s.state)] - STATE_RANK[/** @type {'ok'} */ (b.s.state)] || String(a.s.due ?? '').localeCompare(String(b.s.due ?? '')) || String(a.platform.name).localeCompare(String(b.platform.name)));
  return dataTable(state, {
    id: 'reviewSchedule',
    rowKey: (r) => r.platform.id,
    rows,
    empty: 'No platforms match.',
    rowAttrs: (r) => ({ dblclick: 'go', view: 'platformReview', id: r.platform.id }),
    columns: [
      { key: 'platform', label: 'Platform', width: 260, minWidth: 160, value: (r) => r.platform.name, render: (r) => go(r.platform.name, 'platformReview', { id: r.platform.id }) },
      { key: 'owner', label: 'Owner', width: 160, minWidth: 100, value: (r) => profileName(state, r.platform.ownerId) },
      { key: 'rule', label: 'Rule', width: 220, minWidth: 140, value: (r) => ruleWord(data, r.platform) },
      { key: 'period', label: 'Period', width: 140, minWidth: 100, value: (r) => r.s.months, render: (r) => (r.s.months ? periodWord(r.s.months) : '—') },
      { key: 'driver', label: 'Set by', width: 300, minWidth: 160, value: (r) => driverWord(data, r.s.driver) },
      { key: 'start', label: 'Counted from', width: 170, minWidth: 120, value: (r) => r.s.start, render: (r) => (r.s.start ? day(r.s.start) : '—') },
      { key: 'due', label: 'Next due', width: 220, minWidth: 140, value: (r) => r.s.due,
        render: (r) => (r.s.due ? html`${day(r.s.due)}${reviewTag(r.s.state)}${r.s.moved ? html` <span class="tag review-moved${r.s.urgent ? ' urgent' : ''}">Moved</span>` : ''}` : '—') },
      { key: 'last', label: 'Last reviewed', width: 170, minWidth: 120, value: (r) => r.last, render: (r) => (r.last ? day(r.last) : html`<span class="muted">Never</span>`) },
      { key: 'open', label: 'In progress', width: 130, minWidth: 100, value: (r) => (r.open ? 'Yes' : ''), render: (r) => (r.open ? html`<span class="tag">In progress</span>` : '') },
    ],
  });
}

/**
 * The Reviews tab: the schedule of every platform, the timeline, and the review policies.
 * @param {any} state @param {Data} data
 */
export function reviewsView(state, data) {
  const tab = state.view?.tab || 'schedule';
  const on = (/** @type {string} */ t) => (tab === t ? ' on' : '');
  const tabs = html`<nav class="tabs">${[['schedule', 'Schedule'], ['timeline', 'Timeline'], ['policies', 'Policies']].map(([t, label]) => html`<button type="button" class="tab${on(t)}" ${dataAttrs({ action: 'go', view: 'reviews', tab: t })}>${label}</button>`)}</nav>`;
  const head = html`<div class="head"><h1>Reviews</h1>${tab === 'policies' ? '' : reviewsFilters(state, data)}</div>${tabs}`;
  if (tab === 'timeline') return html`${head}${timelineView(state, data)}`;
  if (tab === 'policies') return html`${head}${policiesView(state, data)}`;
  return html`${head}<section class="block">${scheduleTable(state, data)}</section>`;
}
```

Until Tasks 6 and 10 land, define placeholders at the bottom of the file that the next tasks replace:

```js
/** Replaced in Task 6. @param {any} _state @param {Data} _data */
function policiesView(_state, _data) { return html`<p class="muted">No review policies yet.</p>`; }
```

and import `timelineView` from `./timeline.js` with a stub file `src/ui/screens/timeline.js` exporting `export function timelineView() { return html\`<p class="muted">The timeline comes next.</p>\`; }` (Task 10 replaces it). These are intermediate states between commits, not left in the finished work.

Imports to add in `reviews.js`: `live` (data.js), `listPlatformGroups, groupsOf` (queries.js), `scheduleOf` (schedule.js), `option` (common.js), `periodWord` (names.js), `DEFAULT_REVIEWS_PREFS` (../reviews-prefs.js).

- [ ] **Step 6: Route and controller**

`src/ui/render.js`: import `reviewsView` and add `case 'reviews': return reviewsView(state, data);`.

`src/ui/controller.js`:
- `initialState`: add `reviewsPrefs: DEFAULT_REVIEWS_PREFS`.
- `finishOpening`: also `reviewsPrefs: readReviewsPrefs(env.storage, reviewsPrefsKey(state.folderName, state.profileId))` in the `set(...)`.
- Add to `QUIET`: `'setReviewsFilter'`.
- Handler:

```js
    // The Reviews tab's owner and group filters, and the timeline's range: remembered in this browser.
    async setReviewsFilter({ owner, groupId, start, length, past, shift }) {
      const p = { ...state.reviewsPrefs };
      if (owner !== undefined) p.owner = owner || 'me';
      if (groupId !== undefined) p.groupId = groupId || null;
      if (start !== undefined) p.start = /^\d{4}-\d{2}$/.test(start) ? start : null;
      if (length !== undefined && TIMELINE_LENGTHS.includes(Number(length))) p.length = Number(length);
      if (past !== undefined) p.past = past === true || past === 'true';
      if (shift !== undefined) p.start = shiftMonth(p.start ?? state.today.slice(0, 7), Number(shift));
      set({ reviewsPrefs: p });
      writeReviewsPrefs(env.storage, reviewsPrefsKey(state.folderName, /** @type {string} */ (state.profileId)), p);
    },
```

with, near the top of the controller module:

```js
/** A YYYY-MM month moved by `n` months. @param {string} ym @param {number} n */
const shiftMonth = (ym, n) => {
  const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
```

Check how `mount.js` sends a `<select data-change>`: it passes the element's `name` as the field (e.g. `owner`). If it sends `value` instead, name the handler's parameter to match (read `mount.js` around `data-change` handling).

- [ ] **Step 7: Styles**

Append to `src/ui/styles.css` (use the existing colour tokens; check names with `grep -n "^\s*--" src/ui/styles.css | head -40` and substitute the real ones for `--bad`, `--warn`, `--muted`, `--line`):

```css
.rv-filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.tag.review-moved { background: var(--warn-bg); color: var(--warn); }
.tag.review-moved.urgent { background: var(--bad-bg); color: var(--bad); }
```

- [ ] **Step 8: Run, build, commit**

Run: `node --test test/ui/reviews-prefs.test.js test/ui/screens-reviews-tab.test.js && npm test && npm run typecheck` → PASS.

```bash
npm run build
git add src/ui/reviews-prefs.js src/ui/names.js src/ui/screens/common.js src/ui/screens/reviews.js src/ui/screens/timeline.js src/ui/render.js src/ui/controller.js src/ui/styles.css test/ui/reviews-prefs.test.js test/ui/screens-reviews-tab.test.js
git commit -m "Reviews tab with the Schedule of every platform, filtered by owner and group

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Policies sub-tab

**Files:**
- Modify: `src/ui/screens/reviews.js` (replace the `policiesView` stub)
- Modify: `src/ui/controller.js` (handlers `newReviewPolicy`, `setPolicyCell`)
- Modify: `src/ui/styles.css`
- Test: `test/ui/screens-review-policies.test.js` (new), add to `test/ui/controller-reviews.test.js`

**Interfaces:**
- Consumes: policy ops (Task 2), `periodWord` (Task 5).
- Produces: view `{ name: 'reviews', tab: 'policies', id?: policyId }` (id = the policy open for editing; default the first). Controller actions:
  - `newReviewPolicy({ name })` → `createReviewPolicy` then `go` to it.
  - `setPolicyCell({ id, receptor, band, value, unit })` → `updateReviewPolicy({ id, receptor, band, months: value, unit })`.
  - Direct EDITS used by the markup: `updateReviewPolicy` (considered, longest), `renameReviewPolicy`, `deleteReviewPolicy`.

- [ ] **Step 1: Failing tests**

`test/ui/screens-review-policies.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewsView } from '../../src/ui/screens/reviews.js';
import { createReviewPolicy, updateReviewPolicy, setRule } from '../../src/core/ops/reviews.js';
import { state as base } from './screens-reviews-tab.test.js';
import { seed, act } from '../helpers.js';

const state = { ...base, view: { name: 'reviews', tab: 'policies' } };
function data() {
  let d = createReviewPolicy(seed(), act, { id: 'pol1', name: 'Standard' });
  d = updateReviewPolicy(d, act, { id: 'pol1', receptor: 'personnel', band: 'Serious', months: '6', unit: 'months' });
  d = updateReviewPolicy(d, act, { id: 'pol1', receptor: 'personnel', band: 'Medium', months: '3', unit: 'years' });
  d = updateReviewPolicy(d, act, { id: 'pol1', receptor: 'capability', considered: false });
  return setRule(d, act, { platformId: 'p1', kind: 'policy', policyId: 'pol1', start: '2026-01-01' });
}

test('Policies lists the policies and opens the first as a band by receptor grid', () => {
  const out = reviewsView(state, data()).toString();
  assert.match(out, /data-action="go" data-view="reviews" data-tab="policies" data-id="pol1"[^>]*>Standard/);
  assert.match(out, /<table class="policy-grid">[\s\S]*Personnel[\s\S]*Environment[\s\S]*Capability/);
  // Serious for personnel: 6 months; Medium: 3 years.
  assert.match(out, /name="value" value="6"[^>]*data-change="setPolicyCell" data-id="pol1" data-receptor="personnel" data-band="Serious"/);
  assert.match(out, /name="value" value="3"[^>]*data-band="Medium"[\s\S]*?<option value="years" selected>/);
  assert.match(out, /name="considered"[^>]*data-receptor="capability"(?![^>]*checked)/);
  assert.match(out, /Used by[\s\S]*Alpha/);
  assert.match(out, /<button[^>]*disabled[^>]*>Delete policy/, 'a policy in use cannot be deleted');
});

test('with no policies, Policies offers to make one', () => {
  const out = reviewsView(state, seed()).toString();
  assert.match(out, /<form data-action="newReviewPolicy"/);
});
```

In `test/ui/controller-reviews.test.js` add:

```js
test('a new policy opens for editing; a cell takes a value and unit; a bad value is refused with a message', async () => {
  const c = await ready();
  await c.dispatch({ type: 'newReviewPolicy', name: 'Standard' });
  const id = Object.keys(W(c).records.reviewPolicy)[0];
  assert.deepEqual([c.getState().view.name, c.getState().view.tab, c.getState().view.id], ['reviews', 'policies', id]);
  await c.dispatch({ type: 'setPolicyCell', id, receptor: 'personnel', band: 'Serious', value: '2', unit: 'years' });
  assert.equal(W(c).records.reviewPolicy[id].receptors.personnel.periods.Serious, 24);
  await c.dispatch({ type: 'setPolicyCell', id, receptor: 'personnel', band: 'Serious', value: '0', unit: 'months' });
  assert.equal(c.getState().message.kind, 'error');
  assert.equal(W(c).records.reviewPolicy[id].receptors.personnel.periods.Serious, 24);
});
```

Run → FAIL.

- [ ] **Step 2: The policies view**

Replace the stub in `src/ui/screens/reviews.js`:

```js
/** A number and its unit, as a policy cell or the longest period shows it. @param {number | null} months */
const asUnit = (months) => (months == null ? { n: '', unit: 'months' } : months % 12 === 0 ? { n: String(months / 12), unit: 'years' } : { n: String(months), unit: 'months' });

/**
 * A period input with its months/years chooser. Both send the same action, carrying the other's
 * value, so changing either sets the period.
 * @param {number | null} months @param {Record<string, string>} attrs the action and what it is for @param {string} label
 */
function periodInput(months, attrs, label) {
  const { n, unit } = asUnit(months);
  return html`<span class="period-input" data-period>
    <input type="number" name="value" value="${n}" min="1" max="${MAX_REVIEW_MONTHS}" aria-label="${label}" ${dataAttrs(attrs)}>
    <select name="unit" aria-label="${label}: unit" ${dataAttrs(attrs)}>${option('months', 'months', unit)}${option('years', 'years', unit)}</select></span>`;
}

const RECEPTOR_TITLE = { personnel: 'Personnel', environment: 'Environment', capability: 'Capability' };

/** @param {any} state @param {Data} data */
function policiesView(state, data) {
  const policies = live(data, 'reviewPolicy').sort((a, b) => a.order - b.order);
  const make = html`<form data-action="newReviewPolicy" class="rv-form inline-form">
    <input name="name" placeholder="New policy name" aria-label="New policy name" required>
    <button type="submit" class="primary">Add policy</button></form>`;
  if (!policies.length) return html`<p>A review policy sets how often a platform is reviewed from its residual risk: a period for each band, for each receptor you care about. The shortest period any hazard gives is used.</p>${make}`;
  const pol = policies.find((p) => p.id === state.view?.id) ?? policies[0];
  const users = live(data, 'platform').filter((p) => p.reviewRule?.kind === 'policy' && p.reviewRule.policyId === pol.id);
  const list = html`<ul class="policy-list">${policies.map((p) => html`<li><button type="button" class="link${p.id === pol.id ? ' on' : ''}" ${dataAttrs({ action: 'go', view: 'reviews', tab: 'policies', id: p.id })}>${p.name}</button></li>`)}</ul>`;
  const grid = html`<table class="policy-grid"><thead><tr><th>Residual band</th>${RECEPTORS.map((r) => html`<th>
      <label class="considered"><input type="checkbox" name="considered"${pol.receptors[r].considered ? raw(' checked') : ''} ${dataAttrs({ change: 'updateReviewPolicy', id: pol.id, receptor: r })}> ${RECEPTOR_TITLE[/** @type {'personnel'} */ (r)]}</label></th>`)}</tr></thead>
    <tbody>${POLICY_BANDS.map((band) => html`<tr><th scope="row">${bandTag(band)}</th>${RECEPTORS.map((r) => html`<td class="${pol.receptors[r].considered ? '' : 'off'}">
      ${periodInput(pol.receptors[r].periods[band] ?? null, { change: 'setPolicyCell', id: pol.id, receptor: r, band }, `${RECEPTOR_TITLE[/** @type {'personnel'} */ (r)]}, ${band}`)}</td>`)}</tr>`)}</tbody></table>`;
  return html`<div class="policies">${list}<article class="doc policy">
    <label class="doc-subtitle"><span class="field-label">Policy</span>
      <input class="quiet title" name="name" value="${pol.name}" aria-label="Policy name" ${dataAttrs({ change: 'renameReviewPolicy', id: pol.id })}></label>
    <p class="muted">Leave a cell blank when that band should not drive a review. Untick a receptor to leave it out. The shortest period any hazard on the platform gives is used, and never longer than the longest period.</p>
    ${grid}
    <p class="longest">Longest period ${periodInput(pol.longest, { change: 'setPolicyLongest', id: pol.id }, 'Longest period')}</p>
    <p>Used by ${users.length ? users.map((p, i) => html`${i ? ', ' : ''}${go(p.name, 'platformReview', { id: p.id })}`) : html`<span class="muted">no platforms</span>`}</p>
    <div class="actions"><button type="button" class="danger" ${dataAttrs({ action: 'deleteReviewPolicy', id: pol.id })}${users.length ? raw(' disabled title="Give its platforms another rule first"') : ''}>Delete policy</button></div>
    ${make}</article></div>`;
}
```

Imports: `RECEPTORS` (already), `POLICY_BANDS` from schedule.js, `MAX_REVIEW_MONTHS` (already).

- [ ] **Step 3: Controller handlers**

The number and the unit select in `periodInput` are separate fields; read `mount.js` to see whether a `data-change` sends only its own element's `name`/value. Since it does (one field per change), the handler fills in the other half from the record:

```js
    async newReviewPolicy({ name }) {
      const id = newId();
      await applyEdit('createReviewPolicy', { id, name });
      set({ view: { name: 'reviews', tab: 'policies', id } });
    },
    // A policy cell's number or its unit changed: whichever did not change is taken from the record.
    async setPolicyCell({ id, receptor, band, value, unit }) {
      const pol = state.session?.working.records.reviewPolicy[id];
      if (!pol) throw new PivotError('not-found', 'That policy no longer exists.');
      const was = pol.receptors[receptor]?.periods[band] ?? null;
      const wasUnit = was != null && was % 12 === 0 ? 'years' : 'months';
      const wasN = was == null ? '' : wasUnit === 'years' ? was / 12 : was;
      await applyEdit('updateReviewPolicy', { id, receptor, band, months: value ?? wasN, unit: unit ?? wasUnit });
    },
    async setPolicyLongest({ id, value, unit }) {
      const pol = state.session?.working.records.reviewPolicy[id];
      if (!pol) throw new PivotError('not-found', 'That policy no longer exists.');
      const wasUnit = pol.longest % 12 === 0 ? 'years' : 'months';
      await applyEdit('updateReviewPolicy', { id, longest: value ?? (wasUnit === 'years' ? pol.longest / 12 : pol.longest), longestUnit: unit ?? wasUnit });
    },
```

A checkbox's change: check how `mount.js` sends a checkbox (`tickReviewRow` receives `reviewed: 'true'|'false'`); `updateReviewPolicy` already accepts `'true'`/`'false'` for `considered`. For `deleteReviewPolicy`, wrap it in the existing confirm: render the button with `confirmButton('Delete policy', 'Delete this review policy', dataAttrs({ action: 'deleteReviewPolicy', id }))` if `confirmButton` supports a disabled state; otherwise keep the plain button above. After a delete, `go` to `{ name: 'reviews', tab: 'policies' }` — add a handler `async removeReviewPolicy({ id }) { await applyEdit('deleteReviewPolicy', { id }); set({ view: { name: 'reviews', tab: 'policies' } }); }` and point the button at `removeReviewPolicy` (update the test's regex to match the action name you use).

- [ ] **Step 4: Styles**

```css
.policies { display: grid; grid-template-columns: minmax(160px, 220px) 1fr; gap: 20px; }
.policy-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; }
.policy-list .on { font-weight: 600; }
.policy-grid { border-collapse: collapse; }
.policy-grid th, .policy-grid td { padding: 6px 10px; border-bottom: 1px solid var(--line); text-align: left; }
.policy-grid td.off { opacity: 0.4; }
.period-input { display: inline-flex; gap: 4px; align-items: center; }
.period-input input { width: 5em; }
@media (max-width: 720px) { .policies { grid-template-columns: 1fr; } }
```

- [ ] **Step 5: Run, build, commit**

Run: `node --test test/ui/screens-review-policies.test.js test/ui/controller-reviews.test.js && npm test && npm run typecheck` → PASS.

```bash
npm run build
git add src/ui/screens/reviews.js src/ui/controller.js src/ui/styles.css test/ui/screens-review-policies.test.js test/ui/controller-reviews.test.js
git commit -m "Review policies: a period per residual band and receptor, a longest period

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Platform review page; platform page loses its Reviews tab and gains the menu panel

**Files:**
- Modify: `src/ui/screens/reviews.js` (`reviewLine` → rule/due/last cards on the new model; `platformReviewView`; past-review links)
- Modify: `src/ui/screens/platforms.js:68-131` (menu item, panel, remove tab, links)
- Modify: `src/ui/render.js` (route `platformReview`)
- Modify: `src/ui/controller.js` (`beginReview` destination; `setRuleField`; `showReviewPanel`/`closeReviewPanel`)
- Modify: `src/ui/screens/home.js:205-215` (`whereToAct` review → `platformReview`)
- Modify: `test/ui/screens-reviews.test.js`, `test/ui/controller-reviews.test.js` (rewrite old-tab tests; un-skip anything skipped in Task 3)

**Interfaces:**
- Consumes: `scheduleOf`, `ruleWord`, `driverWord`, `periodWord`, `setRule`.
- Produces:
  - View `{ name: 'platformReview', id: platformId, reviewId? }`.
  - `platformReviewView(state, data, platformId)`.
  - Controller: `setRuleField({ platformId, kind?, value?, unit?, policyId?, start? })` — fills missing parts from the platform's current rule; `showReviewPanel({ id })`, `closeReviewPanel()` with state `reviewPanel: platformId | null` (QUIET).
  - `beginReview` goes to `{ name: 'platformReview', id }`.

- [ ] **Step 1: Rewrite the failing UI tests**

In `test/ui/screens-reviews.test.js`: switch fixtures to `scheduleFixed`; replace `platformView(onTab(), …)` calls with `platformReviewView(state, data(), 'p1')`; replace the schedule-card test with:

```js
test('the platform review page shows the rule, the next due date with what sets it, and the last review with Start review', () => {
  const out = platformReviewView(state, data(), 'p1').toString();
  assert.match(out, /aria-label="Review rule"[\s\S]*<select name="kind"[^>]*data-change="setRuleField" data-platform-id="p1"[\s\S]*<option value="fixed" selected>/);
  assert.match(out, /name="value" value="6"[\s\S]*<option value="months" selected>/);
  assert.match(out, /<input type="date"[^>]*name="start"[^>]*value="2026-03-01"/);
  assert.match(out, /class="dash-card rv-card rv-overdue" aria-label="Next review due"[\s\S]*1 Sep 2026[\s\S]*\d+ days? overdue/);
  assert.match(out, /data-action="beginReview" data-platform-id="p1"/);
});

test('the platform page no longer has a Reviews tab; its menu opens the review schedule panel', () => {
  const out = platformView(state, data(), 'p1').toString();
  assert.doesNotMatch(out, /data-tab="reviews"/);
  assert.match(out, /data-action="showReviewPanel" data-id="p1"[^>]*>Review schedule…/);
  const panel = platformView({ ...state, reviewPanel: 'p1' }, data(), 'p1').toString();
  assert.match(panel, /role="dialog" aria-label="Review schedule"[\s\S]*Fixed · 6 months[\s\S]*1 Sep 2026[\s\S]*Never[\s\S]*data-view="platformReview" data-id="p1"[^>]*>Open in Reviews/);
});

test('a policy rule says what sets its period', () => {
  // build: createReviewPolicy pol1 with personnel Serious 6; setRule p1 policy; setRating h1 p1 residual personnel 2/C
  const out = platformReviewView(state, policyData(), 'p1').toString();
  assert.match(out, /because[\s\S]*HZ-\d+ residual personnel: Serious/);
});
```

(Define `policyData()` in the file with the steps in the comment, using the ops directly.)

In `test/ui/controller-reviews.test.js`, rewrite the two schedule tests:

```js
test('a rule set from the page, then each part changed in place, keeping the others', async () => {
  const c = await ready();
  await c.dispatch({ type: 'setRuleField', platformId: 'p1', kind: 'fixed', value: '6', unit: 'months', start: '2026-06-30' });
  assert.deepEqual([W(c).records.platform.p1.reviewRule, W(c).records.platform.p1.reviewStart], [{ kind: 'fixed', months: 6 }, '2026-06-30']);
  await c.dispatch({ type: 'setRuleField', platformId: 'p1', unit: 'years' });
  assert.deepEqual(W(c).records.platform.p1.reviewRule, { kind: 'fixed', months: 72 }, 'the number stays, read in years');
  await c.dispatch({ type: 'setRuleField', platformId: 'p1', start: '' });
  assert.equal(c.getState().message.kind, 'error');
  await c.dispatch({ type: 'setRuleField', platformId: 'p1', kind: 'none' });
  assert.equal(W(c).records.platform.p1.reviewRule, null);
});
```

and change the `beginReview` test's expectation to `['platformReview', 'p1']` for `[view.name, view.id]`, and `completeReview` to assert `scheduleOf(W(c), 'p1', '2026-09-28').due === '2027-06-30'` (with `start: '2026-06-30'`, 6 months).

Run → FAIL.

- [ ] **Step 2: Rewrite `reviewLine` as the page's three cards**

Replace `reviewLine` in `src/ui/screens/reviews.js`:

```js
/**
 * The top of a platform's review page as three cards: the rule (none, fixed or a policy, with the
 * date reviews count from), the next review due (how long until it or how overdue, and what sets
 * the period), and the last review, with Start review.
 * @param {any} state @param {Data} data @param {any} p the platform
 */
export function reviewLine(state, data, p) {
  const s = scheduleOf(data, p.id, state.today);
  const last = lastReviewed(data, p.id);
  const inProgress = openReview(data, p.id);
  const field = { change: 'setRuleField', 'platform-id': p.id };
  const kind = p.reviewRule?.kind ?? 'none';
  const policies = live(data, 'reviewPolicy').sort((a, b) => a.order - b.order);
  const { n, unit } = asUnit(kind === 'fixed' ? p.reviewRule.months : null);
  const rule = html`<div class="rv-big"><select name="kind" aria-label="Review rule" ${dataAttrs(field)}>
      ${option('none', 'No schedule', kind)}${option('fixed', 'Fixed period', kind)}${policies.length ? option('policy', 'Review policy', kind) : ''}</select></div>
    ${kind === 'fixed' ? html`<div class="rv-line">Every <input type="number" name="value" value="${n}" min="1" max="${MAX_REVIEW_MONTHS}" aria-label="Period" ${dataAttrs(field)}>
      <select name="unit" aria-label="Period unit" ${dataAttrs(field)}>${option('months', 'months', unit)}${option('years', 'years', unit)}</select></div>` : ''}
    ${kind === 'policy' ? html`<div class="rv-line"><select name="policyId" aria-label="Review policy" ${dataAttrs(field)}>${policies.map((x) => option(x.id, x.name, p.reviewRule.policyId))}</select>
      ${go('Edit →', 'reviews', { tab: 'policies', id: p.reviewRule.policyId })}</div>` : ''}
    ${kind !== 'none' ? html`<div class="rv-foot"><label>Counted from <input type="date" name="start" value="${p.reviewStart ?? ''}" ${dataAttrs(field)}></label></div>` : ''}`;
  const days = s.due ? Math.round((Date.parse(`${s.due}T00:00:00Z`) - Date.parse(`${String(state.today).slice(0, 10)}T00:00:00Z`)) / 86_400_000) : null;
  const until = days === null ? '' : days < 0 ? `${-days} day${days === -1 ? '' : 's'} overdue` : days === 0 ? 'Due today' : `In ${days} day${days === 1 ? '' : 's'}`;
  const why = driverWord(data, s.driver);
  const due = s.due
    ? html`<div class="rv-big">${day(s.due)}</div>
      <div class="rv-line muted">Every ${periodWord(/** @type {number} */ (s.months))}${why ? html`, because ${why}` : ''}</div>
      <div class="rv-foot"><span class="rv-until${days !== null && days < 0 ? ' late' : ''}">${until}</span>${reviewTag(s.state)}
        ${s.moved ? html`<span class="tag review-moved${s.urgent ? ' urgent' : ''}">Moved from ${day(/** @type {string} */ (s.seen))}</span>
          <button type="button" class="small" ${dataAttrs({ action: 'acknowledgeReviewDate', 'platform-id': p.id })}>Acknowledge</button>` : ''}</div>`
    : html`<div class="rv-big muted">—</div><div class="rv-foot muted">Set a rule to have one</div>`;
  const start = inProgress
    ? html`<span class="tag">Review in progress</span>`
    : p.status !== 'live' ? html`<span class="muted">${p.name} is retired</span>`
      : html`<button type="button" class="primary rv-action" ${dataAttrs({ action: 'beginReview', 'platform-id': p.id })}>Start review</button>`;
  return html`<div class="dash-grid three-even review-cards">
    <section class="dash-card rv-card" aria-label="Review rule"><h3 class="dash-card-h">Review rule</h3>${rule}</section>
    <section class="dash-card rv-card${s.state === 'overdue' ? ' rv-overdue' : s.state === 'dueSoon' ? ' rv-soon' : ''}" aria-label="Next review due"><h3 class="dash-card-h">Next review due</h3>${due}</section>
    <section class="dash-card rv-card" aria-label="Last reviewed"><h3 class="dash-card-h">Last reviewed</h3>
      <div class="rv-big${last ? '' : ' muted'}">${last ? day(last) : 'Never'}</div>
      <div class="rv-foot">${start}</div></section>
  </div>`;
}
```

In `openReviewBlock` and `reviewsTab`, replace `p.reviewMonths` checks with `scheduleOf(data, p.id, state.today).due` (truthy). In `pastReviews`, change the completed link to `go(day(...), 'platformReview', { id: p.id, 'review-id': c.review.id })`.

Rename `reviewsTab` to a page:

```js
/**
 * A platform's review page in the Reviews tab: its rule and dates, the review in progress (or a
 * way to start one), and the past reviews, one of which can be opened read-only.
 * @param {any} state @param {Data} data @param {string} id
 */
export function platformReviewView(state, data, id) {
  const p = get(data, 'platform', id);
  if (!p) return html`<p class="muted">That platform no longer exists.</p>`;
  const head = html`<div class="head"><h1>${go('Reviews', 'reviews')} · ${go(p.name, 'platform', { id })}</h1></div>`;
  return html`${head}<article class="doc">${reviewsTab(state, data, p)}</article>`;
}
```

(`reviewsTab` stays as the inner body; update its doc comment to say it is the body of the review page.)

- [ ] **Step 3: Platform page**

In `src/ui/screens/platforms.js`:
- Line ~110-116: drop the `tab === 'reviews'` branch and the `['reviews', …]` extra tab from `pageTabs`; `page` becomes `tab === 'history' ? 'History' : 'Details'`.
- Line ~131: `go('Reviews →', 'platform', { id, tab: 'reviews' })` → `go('Reviews →', 'platformReview', { id })`.
- In the ⋯ menu (`recordMenu`, ~line 77), add before Retire: `menuItem('Review schedule…', { action: 'showReviewPanel', id })`.
- At the end of `platformView`'s output (details tab and history alike), append `${state.reviewPanel === id ? reviewPanel(state, data, p) : ''}` with:

```js
/** The review schedule at a glance, from the platform's ⋯ menu. @param {any} state @param {Data} data @param {any} p */
function reviewPanel(state, data, p) {
  const s = scheduleOf(data, p.id, state.today);
  const last = lastReviewed(data, p.id);
  const why = driverWord(data, s.driver);
  return html`<div class="picker-overlay"><div class="picker review-panel" role="dialog" aria-modal="true" aria-label="Review schedule">
    <h2>Review schedule · ${p.name}</h2>
    <dl class="facts">
      <dt>Rule</dt><dd>${ruleWord(data, p)}</dd>
      <dt>Period</dt><dd>${s.months ? html`${periodWord(s.months)}${why ? html` <span class="muted">· ${why}</span>` : ''}` : '—'}</dd>
      <dt>Next due</dt><dd>${s.due ? html`${day(s.due)}${reviewTag(s.state)}${s.moved ? html` <span class="tag review-moved${s.urgent ? ' urgent' : ''}">Moved</span>` : ''}` : '—'}</dd>
      <dt>Last reviewed</dt><dd>${last ? day(last) : 'Never'}</dd>
      <dt>In progress</dt><dd>${openReview(data, p.id) ? 'Yes' : 'No'}</dd>
    </dl>
    <div class="actions">${go('Open in Reviews →', 'platformReview', { id: p.id })}
      <button type="button" ${dataAttrs({ action: 'closeReviewPanel' })} autofocus>Close</button></div></div></div>`;
}
```

(Import `ruleWord`, `driverWord` from `./reviews.js`, `periodWord` from `../names.js`, `scheduleOf` from schedule.js, `openReview`, `lastReviewed` from queries.)

Search for any other link to the old tab: `grep -rn "tab: 'reviews'\|tab=\"reviews\"\|'reviews' }" src`. Update each to `platformReview`. In `src/ui/screens/home.js` `whereToAct`, the final return becomes `return { view: 'platformReview', id: item.platform.id };` (the `type === 'schedule'` and `'review'` paths fall through to it).

- [ ] **Step 4: Router and controller**

`render.js`: import `platformReviewView`; `case 'platformReview': return platformReviewView(state, data, v.id);`.

`controller.js`:
- `initialState`: `reviewPanel: null`. In `go`, also reset `reviewPanel: null`.
- QUIET: add `'showReviewPanel', 'closeReviewPanel'`.
- Handlers:

```js
    async showReviewPanel({ id }) { set({ reviewPanel: id }); },
    async closeReviewPanel() { set({ reviewPanel: null }); },
    // One part of a platform's rule changed in place: the parts not sent are taken from its rule now.
    async setRuleField({ platformId, kind, value, unit, policyId, start }) {
      const data = state.session?.working;
      const p = data?.records.platform[platformId];
      if (!p) throw new PivotError('not-found', 'That platform no longer exists.');
      const r = p.reviewRule;
      const k = kind ?? r?.kind ?? 'none';
      if (k === 'none') return applyEdit('setRule', { platformId, kind: 'none' });
      const wasUnit = r?.kind === 'fixed' && r.months % 12 === 0 ? 'years' : 'months';
      const wasN = r?.kind === 'fixed' ? (wasUnit === 'years' ? r.months / 12 : r.months) : 12;
      const firstPolicy = Object.values(data.records.reviewPolicy).find((x) => x.status === 'live')?.id;
      await applyEdit('setRule', {
        platformId, kind: k,
        months: value ?? wasN, unit: unit ?? wasUnit,
        policyId: policyId ?? (r?.kind === 'policy' ? r.policyId : firstPolicy),
        start: start === undefined ? (p.reviewStart ?? state.today) : start,
      });
    },
```

A cleared date field sends `start: ''`, which `setRuleField` passes through and `setRule` refuses with `review.start` (Task 2 treats only a missing start as "keep").

Choosing "fixed" with nothing set yet uses 12 months from today, so the card shows a usable rule immediately.

- `beginReview`: `set({ view: { name: 'platformReview', id: platformId } });`
- `go` already passes `reviewId`; past-review links send `review-id`, which arrives as `reviewId`.

- [ ] **Step 5: Run, build, commit**

Run: `npm test && npm run typecheck` → PASS (no skipped review tests remain; remove any `test.skip` added in Task 3).

```bash
npm run build
git add src/ui/screens/reviews.js src/ui/screens/platforms.js src/ui/screens/home.js src/ui/render.js src/ui/controller.js src/core/ops/reviews.js test/ui/screens-reviews.test.js test/ui/controller-reviews.test.js test/core/ops/reviews.test.js
git commit -m "Reviews run from the Reviews tab; the platform page's menu shows its review schedule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Review date moved on Home and Open items

**Files:**
- Modify: `src/ui/screens/home.js` (CHIP, `attentionRow`, `whereToAct` type list, the Open items list)
- Modify: `src/ui/styles.css` (urgent row)
- Test: `test/ui/screens-home.test.js`, `test/ui/home-dot.test.js`

**Interfaces:**
- Consumes: `openItems(...).dateMoved`, `attentionItems` type `'dateMoved'` (Task 3); `driverWord` (Task 5); EDIT `acknowledgeReviewDate` (Task 3 wiring).
- Produces: Needs attention rows of type `dateMoved`: chip "Review"; text "Review date moved: {seen} → {due}" plus the driver; an Acknowledge button (`action: 'acknowledgeReviewDate'`); urgent rows carry class `urgent` and an "Urgent" chip.

- [ ] **Step 1: Failing tests**

Add to `test/ui/screens-home.test.js` (reuse its state/fixture style):

```js
/** The owner last saw a different date than the calculated one. */
const moveSeen = (d, id, seen) => put(d, 'platform', changed(d.records.platform[id], act, { reviewDueSeen: seen }));

test('a moved review date far off is a plain row with Acknowledge', () => {
  const d = moveSeen(scheduleFixed(assignNumbers(seed()), 'p1', 36, '2029-01-01'), 'p1', '2029-06-01');
  const out = homeView(state, d).toString();
  assert.match(out, /Review date moved: 1 Jun 2029 → 1 Jan 2029/);
  assert.match(out, /data-action="acknowledgeReviewDate" data-platform-id="p1"/);
  assert.doesNotMatch(out, /<tr class="urgent"/, 'two years off is not urgent');
});

test('a moved review date within 30 days, or passed, comes first, red and marked urgent', () => {
  const d = moveSeen(scheduleFixed(assignNumbers(seed()), 'p1', 6, '2026-10-01'), 'p1', '2027-01-01');
  const out = homeView(state, d).toString();
  const rows = out.match(/<tbody>[\s\S]*?<\/tbody>/)[0];
  assert.match(rows, /^<tbody><tr class="urgent"[\s\S]*?chip-urgent[\s\S]*?Review date moved: 1 Jan 2027 → 1 Oct 2026/, 'urgent first');
});
```

(Import `put`, `changed` from `src/core/data.js`, `scheduleFixed`, `act` from `../helpers.js`. `state.today` in that file is `2026-09-28`; check and adjust the dates if it differs.) In `test/ui/home-dot.test.js`, add one case: a moved date on the active profile's platform lights the dot.

Run → FAIL.

- [ ] **Step 2: Home rows**

In `src/ui/screens/home.js`:
- `CHIP`: add `dateMoved: ['Review', 'chip-review']`.
- `whereToAct`: add `'dateMoved'` to the type union in the JSDoc; it falls through to the platform review page.
- `attentionRow`: let `row` take a row class:

```js
  const row = (what, action, by = '', cls2 = '') => html`<tr ${cls2 ? raw(`class="${cls2}" `) : ''}${dataAttrs({ key, dblclick: 'go', ...place })}><td class="kind">${cls2 === 'urgent' ? html`<span class="chip chip-urgent">Urgent</span> ` : ''}<span class="chip ${cls}">${word}</span></td><td class="what">${what}</td>
    <td class="by">${by}</td><td class="where">${platformLink(item.platform)}</td><td class="act">${action}</td></tr>`;
  if (item.type === 'dateMoved') {
    const why = driverWord(data, item.driver);
    return row(html`<strong>Review date moved: ${day(item.seen)} → ${day(item.due)}</strong>${why ? html` <span class="muted">· ${why}</span>` : ''}`,
      html`<button type="button" class="small" ${dataAttrs({ action: 'acknowledgeReviewDate', 'platform-id': item.platform.id })}>Acknowledge</button>`, '', item.urgent ? 'urgent' : '');
  }
```

The `key` line: add `item.type === 'dateMoved' ? item.due : ''` to the parts so a re-render keys the row by its date.

- In `openItemsView` (the Open items page, same file), add a "Review dates moved" section using the same rows, if that page lists sections per type (follow how `acks` are listed there; mirror it with `items.dateMoved`). Update `DEFAULT_SECTION.openItems` only if a new rail section is added.

Import `driverWord` from `./reviews.js` (check that this does not create a cycle reviews.js → home.js; reviews.js must not import home.js).

- [ ] **Step 3: Styles**

```css
tr.urgent td { background: var(--bad-bg); }
.chip-urgent { background: var(--bad); color: var(--on-bad, #fff); }
```

- [ ] **Step 4: Run, build, commit**

Run: `npm test && npm run typecheck` → PASS.

```bash
npm run build
git add src/ui/screens/home.js src/ui/styles.css test/ui/screens-home.test.js test/ui/home-dot.test.js
git commit -m "Review date moved in Needs attention: urgent first and red, with Acknowledge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Pop-up when an edit moves review dates

**Files:**
- Modify: `src/ui/controller.js` (`applyEdit`; state `reviewMoved`; handler `dismissReviewMoved`)
- Modify: `src/ui/screens/common.js` (`reviewMovedDialog`, render it in `shell` beside `confirmDialog`)
- Modify: `src/ui/styles.css`
- Test: `test/ui/controller-review-moved.test.js` (new), add a render case to `test/ui/screens-reviews-tab.test.js`

**Interfaces:**
- Consumes: `dueOf`, `scheduleOf` (Task 1), `driverWord` (Task 5).
- Produces: `state.reviewMoved: { platformId: string, name: string, ownerId: string, from: string | null, to: string | null, urgent: boolean, driver: any }[] | null`; action `dismissReviewMoved` (QUIET); `reviewMovedDialog(state)`.

- [ ] **Step 1: Failing tests**

`test/ui/controller-review-moved.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { renderApp } from '../../src/ui/render.js';

const env = (f) => ({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

/** Ada owns p1 (policy: personnel Serious 6 months, longest 3 years, counted from 2026-01-01); Grace is the other profile. */
async function ready() {
  const c = createController(env(new MemoryFolder()));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  await c.dispatch({ type: 'createProfile', name: 'Grace' });
  const [ada, grace] = c.getState().profiles.map((p) => p.id);
  await c.dispatch({ type: 'selectProfile', id: ada });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: ada });
  await c.dispatch({ type: 'linkHazard', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'createReviewPolicy', id: 'pol1', name: 'Standard' });
  await c.dispatch({ type: 'updateReviewPolicy', id: 'pol1', receptor: 'personnel', band: 'Serious', months: '6', unit: 'months' });
  await c.dispatch({ type: 'setRule', platformId: 'p1', kind: 'policy', policyId: 'pol1', start: '2026-01-01' });
  await c.dispatch({ type: 'dismissReviewMoved' });
  return { c, ada, grace };
}
const serious = { type: 'setAssessment', hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'personnel', consequence: 2, likelihood: 'C' };

test('an edit that moves a review date opens the pop-up, urgent when the new date has passed; the owner is told to check it', async () => {
  const { c } = await ready();
  await c.dispatch(serious); // 3 years → 6 months: due 2026-07-01, passed
  const m = c.getState().reviewMoved;
  assert.equal(m.length, 1);
  assert.deepEqual([m[0].platformId, m[0].from, m[0].to, m[0].urgent], ['p1', '2029-01-01', '2026-07-01', true]);
  const out = renderApp(c.getState());
  assert.match(out, /role="alertdialog" aria-label="Review date moved"[\s\S]*class="urgent-banner"[\s\S]*You own Alpha: check its review date/);
  await c.dispatch({ type: 'dismissReviewMoved' });
  assert.equal(c.getState().reviewMoved, null);
});

test('someone else changing it is told the owner has been asked; an edit that moves nothing opens nothing', async () => {
  const { c, grace } = await ready();
  await c.dispatch({ type: 'selectProfile', id: grace });
  await c.dispatch({ type: 'updateHazard', id: 'h1', title: 'Big fire' });
  assert.equal(c.getState().reviewMoved, null);
  await c.dispatch(serious);
  assert.match(renderApp(c.getState()), /Alpha is owned by Ada: they have been asked to check its review date/);
});
```

(If switching profile mid-session is not a supported action, build the second case by creating the platform with `ownerId: grace` instead and keep Ada active; adjust the expected text to "owned by Grace".)

Run → FAIL.

- [ ] **Step 2: Compare due dates in `applyEdit`**

In `src/ui/controller.js`, import `dueOf` from `../core/schedule.js`. Add near the top of the module:

```js
/** Every live platform's calculated due date. @param {any} data @returns {Map<string, string | null>} */
const dueDates = (data) => new Map(Object.values(data.records.platform).filter((p) => p.status === 'live').map((p) => [p.id, dueOf(data, p.id)]));
```

In `applyEdit`, after computing `working` and before `set(...)`:

```js
    // An edit that moves any platform's review date (a rating, a hazard on or off it, a policy or
    // a rule) says so at once: who owns it, from when to when, and whether it is now urgent.
    const before = dueDates(current);
    const after = dueDates(working);
    const today = aestDate(env.clock.now());
    const moved = [...after].filter(([id, to]) => before.has(id) && before.get(id) !== to && type !== 'completeReview' && type !== 'acknowledgeReviewDate')
      .map(([id, to]) => {
        const p = working.records.platform[id];
        const s = scheduleOf(working, id, today);
        return { platformId: id, name: p.name, ownerId: p.ownerId, from: before.get(id) ?? null, to, urgent: Boolean(to && to <= addDays(today, URGENT_DAYS)), driver: s.driver };
      });
```

and add `...(moved.length ? { reviewMoved: moved } : {})` to the `set(...)` call. `dueDates` is cheap after Task 1's per-`Data` memoisation (each `Data` is computed once). A `setRule` the user made *does* report the move, as the spec says rule changes count; exclude only completion and acknowledgement, where the date moving is the point.

Also: `initialState` gets `reviewMoved: null`; QUIET gets `'dismissReviewMoved'`; handler `async dismissReviewMoved() { set({ reviewMoved: null }); }`. Imports: `scheduleOf`, `URGENT_DAYS` from schedule.js; `addDays` from time.js.

- [ ] **Step 3: The dialog**

In `src/ui/screens/common.js`:

```js
/**
 * Said at once when an edit moves review dates: each platform from when to when and why, and who
 * should look (you, as its owner, or its owner by name). Urgent moves are marked and bannered.
 * @param {any} state
 */
export function reviewMovedDialog(state) {
  const list = state.reviewMoved;
  if (!list?.length) return '';
  const data = state.session?.working;
  const urgent = list.some((/** @type {any} */ m) => m.urgent);
  return html`<div class="picker-overlay confirm-overlay"><div class="picker confirm-box review-moved-box" role="alertdialog" aria-modal="true" aria-label="Review date moved">
    <h2>Review date moved</h2>
    ${urgent ? html`<p class="urgent-banner"><strong>Urgent.</strong> A review is now overdue or due within 30 days.</p>` : ''}
    <ul class="plain">${list.map((/** @type {any} */ m) => {
      const why = data ? driverWord(data, m.driver) : '';
      const who = m.ownerId === state.profileId ? `You own ${m.name}: check its review date.` : `${m.name} is owned by ${profileName(state, m.ownerId)}: they have been asked to check its review date.`;
      return html`<li${m.urgent ? raw(' class="urgent"') : ''}><strong>${m.name}</strong>: ${m.from ? day(m.from) : 'no date'} → ${m.to ? day(m.to) : 'no date'}${m.urgent ? html` <span class="chip chip-urgent">${m.to && m.to < state.today ? 'Now overdue' : 'Due within 30 days'}</span>` : ''}
        ${why ? html`<br><span class="muted">${why}</span>` : ''}<br>${who}</li>`;
    })}</ul>
    <div class="actions"><button type="button" class="primary" ${dataAttrs({ action: 'dismissReviewMoved' })} autofocus>OK</button></div></div></div>`;
}
```

Render it in `shell` next to `${confirmDialog(state)}`: `${confirmDialog(state)}${reviewMovedDialog(state)}`. Import `driverWord` from `./reviews.js` and `day` from `../names.js` if not already. Check for an import cycle: `reviews.js` imports `common.js`; `common.js` importing `reviews.js` makes a cycle of function-only uses, which works in ESM (the codebase already has queries ↔ apply). If typecheck or tests complain, move `ruleWord`/`driverWord` into a new `src/ui/review-words.js` that imports only core modules and `names.js`, and import it from both.

- [ ] **Step 4: Styles**

```css
.urgent-banner { background: var(--bad-bg); color: var(--bad); padding: 8px 12px; border-radius: 6px; }
.review-moved-box li { margin: 8px 0; }
.review-moved-box li.urgent strong { color: var(--bad); }
```

- [ ] **Step 5: Run, build, commit**

Run: `node --test test/ui/controller-review-moved.test.js && npm test && npm run typecheck` → PASS.

```bash
npm run build
git add src/ui/controller.js src/ui/screens/common.js src/ui/styles.css test/ui/controller-review-moved.test.js
git commit -m "Pop-up when an edit moves a review date, urgent when it is now due within 30 days

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Timeline (Gantt)

**Files:**
- Modify: `src/ui/screens/timeline.js` (replace the stub)
- Create: `src/core/timeline.js` (pure: months in range, marks per platform)
- Modify: `src/ui/styles.css`
- Test: `test/core/timeline.test.js` (new), `test/ui/screens-timeline.test.js` (new)

**Interfaces:**
- Consumes: `scheduleOf`, `periodOf`, `dueOf` (Task 1); `completedReviews`, `openReview`, `groupsOf`, `listPlatformGroups` (queries); `reviewsPlatforms`, `reviewsOwnerId` (Task 5); `ReviewsPrefs`, `TIMELINE_LENGTHS` (Task 5).
- Produces:
  - `monthsInRange(startYm: string, length: number): string[]` — `['2026-10', '2026-11', …]`.
  - `timelineMarks(data, platformId, today, months: string[]): Record<string /*YYYY-MM*/, Mark[]>` where `Mark = { kind: 'due' | 'overdue' | 'projected' | 'done' | 'late' | 'open', date: string }`.
  - `rangeStart(prefs, today): string` — `prefs.start ?? today's month`, minus 12 months when `prefs.past`.
  - `timelineView(state, data)`.

- [ ] **Step 1: Failing core tests**

`test/core/timeline.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthsInRange, timelineMarks, rangeStart } from '../../src/core/timeline.js';
import { put, created } from '../../src/core/data.js';
import { seed, scheduleFixed, act } from '../helpers.js';

test('a range is consecutive months across year ends', () => {
  assert.deepEqual(monthsInRange('2026-11', 4), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('the range starts at the chosen month, or this month, a year earlier with past shown', () => {
  assert.equal(rangeStart({ start: null, past: false }, '2026-10-08'), '2026-10');
  assert.equal(rangeStart({ start: '2027-03', past: true }, '2026-10-08'), '2026-03');
});

test('marks: the next due, later reviews at the current period, completed reviews on time or late', () => {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-12-15');
  d = put(d, 'review', created(act, 'r1', { platformId: 'p1', state: 'completed', completedAt: '2026-06-20T09:00:00+10:00', dueBefore: '2026-06-15', dueAfter: '2026-12-15', completedBy: 'u1', outcome: '', notes: '' }));
  const marks = timelineMarks(d, 'p1', '2026-10-08', monthsInRange('2026-05', 20));
  assert.deepEqual(marks['2026-06'], [{ kind: 'late', date: '2026-06-20' }]);
  assert.deepEqual(marks['2026-12'], [{ kind: 'due', date: '2026-12-15' }]);
  assert.deepEqual(marks['2027-06'], [{ kind: 'projected', date: '2027-06-15' }]);
  assert.deepEqual(marks['2027-12'], [{ kind: 'projected', date: '2027-12-15' }]);
  assert.equal(marks['2026-07'], undefined);
});

test('an overdue review is marked in this month, with the due month noted', () => {
  const d = scheduleFixed(seed(), 'p1', 6, '2026-08-01');
  const marks = timelineMarks(d, 'p1', '2026-10-08', monthsInRange('2026-07', 6));
  assert.deepEqual(marks['2026-10'], [{ kind: 'overdue', date: '2026-08-01' }]);
  assert.deepEqual(marks['2026-08'], [{ kind: 'dueWas', date: '2026-08-01' }]);
  assert.equal(marks['2026-12'], undefined, 'the next after it (Feb 2027) is outside the range');
});
```

Note the second test shows the overdue bar's start month as a `dueWas` mark; add `'dueWas'` to the `Mark.kind` union. Projections after an overdue date start from the overdue due + period (e.g. `2027-02-01`), outside this 6-month range, so nothing else shows.

- [ ] **Step 2: `src/core/timeline.js`**

```js
import { addMonths } from './time.js';
import { periodOf, dueOf } from './schedule.js';
import { completedReviews, openReview } from './queries.js';
import { aestDate } from './time.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {{ kind: 'due' | 'overdue' | 'dueWas' | 'projected' | 'done' | 'late' | 'open', date: string }} Mark */

/** @param {string} ym @param {number} n */
const shift = (ym, n) => {
  const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

/** `length` months from `startYm`, as YYYY-MM. @param {string} startYm @param {number} length */
export function monthsInRange(startYm, length) {
  return Array.from({ length }, (_, i) => shift(startYm, i));
}

/** Where the timeline starts: the chosen month or this one, a year earlier when the past is shown. @param {{ start: string | null, past: boolean }} prefs @param {string} today */
export function rangeStart(prefs, today) {
  const from = prefs.start ?? today.slice(0, 7);
  return prefs.past ? shift(from, -12) : from;
}

/**
 * What the timeline draws for one platform, by month: completed reviews (late when after the date
 * they answered), a review in progress, the next due (overdue ones in this month, with the month
 * it was due), and later reviews at the current period. Projections assume today's ratings.
 * @param {Data} data @param {string} platformId @param {string} today @param {string[]} months
 * @returns {Record<string, Mark[]>}
 */
export function timelineMarks(data, platformId, today, months) {
  /** @type {Record<string, Mark[]>} */
  const out = {};
  const inRange = new Set(months);
  const add = (/** @type {string} */ date, /** @type {Mark['kind']} */ kind) => {
    const ym = date.slice(0, 7);
    if (inRange.has(ym)) (out[ym] ??= []).push({ kind, date });
  };
  for (const { review } of completedReviews(data, platformId)) {
    const done = aestDate(review.completedAt);
    add(done, review.dueBefore && done > review.dueBefore ? 'late' : 'done');
  }
  const open = openReview(data, platformId);
  if (open) add(aestDate(open.createdAt), 'open');
  const due = dueOf(data, platformId);
  const period = periodOf(data, platformId);
  if (!due || !period) return out;
  if (due < today) {
    add(due, 'dueWas');
    add(today, 'overdue');
    out[today.slice(0, 7)] = (out[today.slice(0, 7)] ?? []).map((m) => (m.kind === 'overdue' ? { kind: 'overdue', date: due } : m));
  } else add(due, 'due');
  const last = months.at(-1) ?? '';
  for (let k = 1; ; k += 1) {
    const next = addMonths(due, k * period.months);
    if (next.slice(0, 7) > last) break;
    add(next, 'projected');
  }
  return out;
}
```

Run `node --test test/core/timeline.test.js` → PASS (adjust only the code, not the expectations, unless an expectation contradicts the spec).

- [ ] **Step 3: Failing screen test**

`test/ui/screens-timeline.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewsView } from '../../src/ui/screens/reviews.js';
import { state as base, data } from './screens-reviews-tab.test.js';

const state = { ...base, view: { name: 'reviews', tab: 'timeline' }, reviewsPrefs: { ...base.reviewsPrefs, start: '2026-07', length: 12 } };

test('the timeline has a column per month under year bands, a row per platform, and today marked', () => {
  const out = reviewsView(state, data()).toString();
  assert.match(out, /<table class="timeline">/);
  assert.match(out, /<th colspan="6"[^>]*>2026<\/th><th colspan="6"[^>]*>2027<\/th>/);
  assert.equal((out.match(/<th class="tl-month/g) ?? []).length, 12);
  assert.match(out, /<th class="tl-month today"[^>]*>Sep<\/th>/);
  assert.match(out, /data-row="p1"[\s\S]*class="tl-mark overdue"[^>]*title="Overdue since 1 Sep 2026/);
  assert.match(out, /data-row="p2" class="tl-none"[\s\S]*No schedule/);
});

test('the range controls send the start, length and shifts', () => {
  const out = reviewsView(state, data()).toString();
  assert.match(out, /<select name="length"[^>]*data-change="setReviewsFilter"[\s\S]*<option value="12" selected>1 year/);
  assert.match(out, /data-action="setReviewsFilter" data-shift="-12"/);
  assert.match(out, /data-action="setReviewsFilter" data-shift="12"/);
  assert.match(out, /name="past"[^>]*data-change="setReviewsFilter"/);
});
```

Run → FAIL.

- [ ] **Step 4: `src/ui/screens/timeline.js`**

```js
import { html, raw } from '../html.js';
import { dataAttrs, option, go } from './common.js';
import { monthsInRange, timelineMarks, rangeStart } from '../../core/timeline.js';
import { scheduleOf } from '../../core/schedule.js';
import { groupsOf } from '../../core/queries.js';
import { TIMELINE_LENGTHS, DEFAULT_REVIEWS_PREFS } from '../reviews-prefs.js';
import { day, periodWord, profileName } from '../names.js';
import { reviewsPlatforms, driverWord } from './reviews.js';

/** @typedef {import('../../core/data.js').Data} Data */

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MARK_WORD = { due: 'Due', overdue: 'Overdue since', dueWas: 'Was due', projected: 'Then due', done: 'Reviewed', late: 'Reviewed late', open: 'Review started' };

/** @param {number} n */
const lengthWord = (n) => (n % 12 === 0 ? `${n / 12} year${n === 12 ? '' : 's'}` : `${n} months`);

/**
 * The review timeline: a row per platform, a column per month, with each platform's next review,
 * the reviews after it at today's period, and the reviews done in the range.
 * @param {any} state @param {Data} data
 */
export function timelineView(state, data) {
  const prefs = state.reviewsPrefs ?? DEFAULT_REVIEWS_PREFS;
  const months = monthsInRange(rangeStart(prefs, state.today), prefs.length);
  const thisMonth = state.today.slice(0, 7);
  /** @type {[string, number][]} */
  const years = [];
  for (const m of months) {
    const y = m.slice(0, 4);
    if (years.at(-1)?.[0] === y) years[years.length - 1][1] += 1; else years.push([y, 1]);
  }
  const platforms = reviewsPlatforms(state, data)
    .map((p) => ({ p, s: scheduleOf(data, p.id, state.today) }))
    .sort((a, b) => Number(!a.s.due) - Number(!b.s.due) || String(a.s.due ?? '').localeCompare(String(b.s.due ?? '')) || String(a.p.name).localeCompare(String(b.p.name)));
  const controls = html`<div class="tl-controls">
    <button type="button" ${dataAttrs({ action: 'setReviewsFilter', shift: -12 })} aria-label="A year earlier">‹</button>
    <label>From <input type="month" name="start" value="${prefs.start ?? thisMonth}" ${dataAttrs({ change: 'setReviewsFilter' })}></label>
    <label>Show <select name="length" ${dataAttrs({ change: 'setReviewsFilter' })}>${TIMELINE_LENGTHS.map((n) => option(String(n), lengthWord(n), String(prefs.length)))}</select></label>
    <button type="button" ${dataAttrs({ action: 'setReviewsFilter', shift: 12 })} aria-label="A year later">›</button>
    <label><input type="checkbox" name="past"${prefs.past ? raw(' checked') : ''} ${dataAttrs({ change: 'setReviewsFilter' })}> Show the year before</label>
  </div>`;
  const head = html`<thead><tr><th class="tl-name" rowspan="2">Platform</th>${years.map(([y, n]) => html`<th colspan="${n}" class="tl-year">${y}</th>`)}</tr>
    <tr>${months.map((m) => html`<th class="tl-month${m === thisMonth ? ' today' : ''}" scope="col">${MONTH[Number(m.slice(5, 7)) - 1]}</th>`)}</tr></thead>`;
  const rows = platforms.map(({ p, s }) => {
    if (!s.due) {
      return html`<tr data-row="${p.id}" class="tl-none"><th class="tl-name" scope="row">${go(p.name, 'platformReview', { id: p.id })} <span class="muted">${profileName(state, p.ownerId)}</span></th>
        <td colspan="${months.length}" class="muted">No schedule</td></tr>`;
    }
    const marks = timelineMarks(data, p.id, state.today, months);
    const why = driverWord(data, s.driver);
    // A thin bar runs from the start of the range (or the first mark) to the last mark, so the
    // period reads as density.
    const marked = months.filter((m) => marks[m]);
    const [first, last] = [marked[0], marked.at(-1)];
    return html`<tr data-row="${p.id}" ${dataAttrs({ dblclick: 'go', view: 'platformReview', id: p.id })}>
      <th class="tl-name" scope="row">${go(p.name, 'platformReview', { id: p.id })} <span class="muted">${profileName(state, p.ownerId)} · ${periodWord(/** @type {number} */ (s.months))}</span></th>
      ${months.map((m) => {
        const bar = first && m >= first && m <= last ? ' tl-bar' : '';
        return html`<td class="tl-cell${m === thisMonth ? ' today' : ''}${bar}">${(marks[m] ?? []).map((k) => html`<span class="tl-mark ${k.kind}" title="${MARK_WORD[k.kind]} ${day(k.date)}${k.kind === 'due' || k.kind === 'projected' ? ` · every ${periodWord(/** @type {number} */ (s.months))}${why ? ` · ${why}` : ''}` : ''}"></span>`)}</td>`;
      })}</tr>`;
  });
  return html`${controls}<div class="tl-scroll"><table class="timeline">${head}<tbody>${rows}</tbody></table></div>
    <p class="muted tl-key"><span class="tl-mark due"></span> next review <span class="tl-mark projected"></span> later reviews at today’s period <span class="tl-mark overdue"></span> overdue <span class="tl-mark done"></span> reviewed <span class="tl-mark late"></span> reviewed late <span class="tl-mark open"></span> in progress</p>`;
}
```

The test expects `title="Overdue since 1 Sep 2026…"`; the overdue mark carries `date: due`, so the title reads "Overdue since 1 Sep 2026". Platform groups: the spec groups rows by platform group when groups exist. Add that by splitting `platforms` with `groupsOf(data, p.id)[0]?.name ?? 'No group'` and emitting a `<tr class="tl-group"><th colspan="${months.length + 1}">Group name</th></tr>` before each group's rows when `listPlatformGroups(data).length` is non-zero. A platform in several groups shows under its first. Add a test case for it in `test/ui/screens-timeline.test.js` (one group, one platform tagged with `tagPlatform`, assert the group header row precedes `data-row="p1"`).

Handler note: the `‹ ›` buttons send `shift` as a string; `setReviewsFilter` does `Number(shift)`. The `month` input sends `start` as `YYYY-MM`. The checkbox sends `past` as `'true'`/`'false'` (check `mount.js`).

- [ ] **Step 5: Styles**

Use the theme tokens (check names in `styles.css`):

```css
.tl-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 8px 0 12px; }
.tl-scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; }
.timeline { border-collapse: separate; border-spacing: 0; min-width: 100%; }
.timeline th, .timeline td { padding: 4px 0; text-align: center; border-bottom: 1px solid var(--line); }
.timeline .tl-name { position: sticky; left: 0; z-index: 1; background: var(--panel); text-align: left; padding: 4px 12px; white-space: nowrap; min-width: 200px; }
.timeline .tl-month { font-weight: 500; font-size: 0.8em; min-width: 34px; }
.timeline .tl-year { font-size: 0.85em; border-left: 1px solid var(--line); }
.timeline .today { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.tl-cell { position: relative; height: 28px; }
.tl-cell.tl-bar::before { content: ""; position: absolute; left: 0; right: 0; top: 50%; border-top: 2px solid var(--line); }
.tl-mark { position: relative; display: inline-block; width: 12px; height: 12px; border-radius: 50%; vertical-align: middle; }
.tl-mark.due { background: var(--accent); }
.tl-mark.projected { border: 2px solid var(--accent); background: var(--panel); }
.tl-mark.overdue { background: var(--bad); }
.tl-mark.dueWas { border: 2px dashed var(--bad); background: transparent; }
.tl-mark.done { background: var(--good); border-radius: 2px; }
.tl-mark.late { background: var(--warn); border-radius: 2px; }
.tl-mark.open { width: 20px; border-radius: 3px; background: repeating-linear-gradient(45deg, var(--accent), var(--accent) 3px, transparent 3px, transparent 6px); }
.tl-none td { font-style: italic; }
.tl-group th { text-align: left; padding: 8px 12px; background: var(--panel-2, var(--panel)); }
.tl-key .tl-mark { margin: 0 4px 0 12px; }
```

- [ ] **Step 6: Run, build, commit**

Run: `node --test test/core/timeline.test.js test/ui/screens-timeline.test.js && npm test && npm run typecheck` → PASS.

```bash
npm run build
git add src/core/timeline.js src/ui/screens/timeline.js src/ui/styles.css test/core/timeline.test.js test/ui/screens-timeline.test.js
git commit -m "Review timeline: a month-by-month Gantt with a chosen range, filtered by owner and group

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Finish — history words, end-to-end check, tidy

**Files:**
- Modify: `src/ui/screens/common.js` (`show()` for rules; FIELD_WORD complete)
- Modify: `src/ui/names.js` (`KIND_LABEL.reviewPolicy`, `recordName` for policies)
- Test: `test/ui/history-review-words.test.js` (new)

**Interfaces:**
- Consumes: everything above.
- Produces: history lines like "review rule (none) → fixed, every 6 months"; `KIND_LABEL.reviewPolicy === 'Review policy'`.

- [ ] **Step 1: Failing test**

Create `test/ui/history-review-words.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformView } from '../../src/ui/screens/platforms.js';
import { KIND_LABEL } from '../../src/ui/names.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { setRule } from '../../src/core/ops/reviews.js';
import { state } from './screens-reviews-tab.test.js';
import { seed, act, scheduleFixed } from '../helpers.js';

test('a rule change reads in words in the platform history', () => {
  let d = scheduleFixed(assignNumbers(seed()), 'p1', 6, '2026-12-31');
  d = setRule(d, act, { platformId: 'p1', kind: 'fixed', months: '2', unit: 'years' });
  const out = platformView({ ...state, view: { name: 'platform', id: 'p1', tab: 'history' } }, d, 'p1').toString();
  assert.match(out, /review rule[\s\S]*every 6 months[\s\S]*every 2 years/);
  assert.equal(KIND_LABEL.reviewPolicy, 'Review policy');
});
```

Run → FAIL.

- [ ] **Step 2: Words**

In `common.js` `show(v)`, before the generic object branch:

```js
  if (v.kind === 'fixed' && Number.isInteger(v.months)) return `fixed, every ${periodWord(v.months)}`;
  if (v.kind === 'policy' && typeof v.policyId === 'string') return 'a review policy';
```

In `names.js`: `KIND_LABEL.reviewPolicy = 'Review policy'`, and in `recordName` return `rec.name` for `reviewPolicy` (follow the pattern for `platformGroup`).

- [ ] **Step 3: Full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass, `dist/pivot.html` written.

Then drive the real app (use the `run` skill or open `dist/pivot.html` with the Playwright/Chrome tools on a scratch folder) and check by hand:
1. Reviews is in the top bar; Schedule lists platforms; the owner filter works.
2. Make a policy (personnel Serious 6 months, longest 3 years), put a platform on it, rate a hazard residual personnel Serious → the pop-up appears, red and urgent; Home shows the urgent row first; Acknowledge clears it.
3. Timeline shows 3 years by default; ‹ › and the length change the range; the platform column stays put while scrolling sideways at 10 years.
4. Platform ⋯ → Review schedule… shows the panel; "Open in Reviews →" lands on the review page; Start review → tick → Complete moves the date and clears any moved item.
5. Light and dark themes both read well (urgent red, timeline marks).

Fix anything found, with a test first where it's logic.

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/common.js src/ui/names.js test/ui/history-review-words.test.js
git commit -m "Review rules and policies read in words in the history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Then tell the user to convert their practice folder: `node scripts/convert-to-v4.mjs <folder>`.
