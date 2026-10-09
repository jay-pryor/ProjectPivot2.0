# Workflows, part 2 (Platform Onboarding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new platform is set up through a Platform Onboarding workflow. The platform is created at step 1 and marked Onboarding until the workflow completes. Strict requirements cover the platform's details, groups and hazards, and each hazard's facets and implemented controls. Suggestions come from the groups the hazard and the platform share.

**Architecture:** This reuses part 1's `workflow` / `workflowStep` records and the rail page.

- **Onboarding status is worked out, not stored:** a platform is Onboarding while its latest onboarding workflow isn't completed.
- **Progress is worked out from the data.** The only ticks are the "none applies" steps.
- **Core:** a new type branch in `ops/workflows.js` and new queries in `core/workflows.js`.
- **UI:** a new `screens/onboarding.js`, which `screens/workflow.js` hands off to.

**Tech Stack:** Vanilla ES modules, JSDoc types (`npm run typecheck`), `node:test` (`npm test`), `npm run build`.

**Spec:** `docs/superpowers/specs/2026-10-09-workflows-platform-onboarding-design.md` (it builds on `2026-10-08-workflows-platform-review-design.md`).

## Global Constraints

- **Type and checks:**
  - Workflow type `'platformOnboarding'`.
  - None-checks: `none:failureMode`, `none:systemElement`, `none:affectedGroup`, `none:causalFactor`, `none:controls`.
  - Reserved positions: `'@details'`, `'@groups'`, `'@hazards'`. `null` is the summary.
- **Required control properties:** tier, origin, description, and implemented-by on this platform.
- **Shared groups:** the groups the platform is in and the hazard is assigned to, plus `'all'` when the hazard is assigned to All platforms.
- **No schema bump.** A platform's `description` reads as `''` when missing.
- **Run `npm run build` after every source change.** This is a project rule.
- **Blocks have sharp corners** (`test/ui/corners.test.js`): never add `border-radius` except 50% on round things.
- **Commits:**
  - Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Work is on branch `workflows-onboarding`.
  - Stage only the task's files.

## Review Focus

1. **A cancelled onboarding:** the platform stays Onboarding, is left out of Open items, and its page offers Onboard again. Onboard again is refused while one is open. Covered in Task 3 and Task 8.
2. **An Onboarding platform with a review rule:** it never shows in Coming up or Open items, and Start review is refused. Covered in Task 3 and Task 4.
3. **A facet with entries and the "None applies" tick also ticked** (ticked first, then an entry added): the facet counts as met, and the UI disables the tick while entries exist. Covered in Task 1.
4. **An implemented control with tier/origin/description set but no implemented-by on this platform:** the requirement stays unmet. Implemented-by on another platform doesn't count. Covered in Task 1.
5. **A suggestion from a group the platform isn't in** (the hazard's other group): not suggested. "All platforms" assignments always are. Covered in Task 2.

---

## File map

| File | Change |
|---|---|
| `src/core/ops/platforms.js` | `updatePlatform` takes `description` |
| `src/core/workflows.js` | `WORKFLOW_TYPES` (onboarding ready), `NONE_CHECKS`, `FACET_KINDS`, `onboardingOf`, `onboardingProgress`, `workflowProgress` dispatch, `sharedGroups`, `groupSuggestions` |
| `src/core/ops/workflows.js` | `startOnboarding`; onboarding in `startWorkflow`, `setWorkflowPosition`, `setStep`, `completeWorkflow`; review refused while Onboarding |
| `src/core/queries.js` | `openItems`, `upcomingReviews` skip Onboarding platforms |
| `src/ui/screens/reviews.js` | timeline/schedule rows skip Onboarding; Start review → "Finish onboarding first" |
| `src/ui/screens/dashboard.js` | `numberedCard` / `platformListCard` / `addForm` take `grouped` suggestions |
| `src/ui/screens/ssra.js` | `controlsSection` takes an optional row filter |
| `src/ui/screens/onboarding.js` (new) | onboarding rail, platform steps, hazard cards, summary, ended grid |
| `src/ui/screens/workflow.js` | hands onboarding to `onboarding.js` |
| `src/ui/screens/workflows.js` | Platform Onboarding card form |
| `src/ui/screens/platforms.js` | New platform → onboarding; Onboarding tag; Onboard again |
| `src/ui/screens/home.js` | Onboarding tag on platform cards |
| `src/ui/controller.js` | EDITS `startOnboarding`; handlers `onboardPlatform`, `onboardAgain`, `addSuggestedControls` |
| `src/ui/styles.css` | onboarding styles |

---

### Task 1: Description, onboarding status and progress

**Files:**
- Modify: `src/core/ops/platforms.js:18-22`, `src/core/workflows.js`
- Test: `test/core/onboarding.test.js` (new)

**Interfaces:**
- Produces in `core/workflows.js`:
  - `NONE_CHECKS`
  - `FACET_KINDS = ['failureMode','systemElement','affectedGroup','causalFactor']`
  - `ONBOARDING_POSITIONS = ['@details','@groups','@hazards']`
  - `onboardingOf(data, platformId) → Rec|null`
  - `onboardingProgress(data, wf) → { details, groups, hazards, perHazard: Map<id,{ facets, implemented, optional, required }>, unmet: {hazardId,what}[] }`
  - `workflowProgress` returns `{done,total}` for onboarding too (done = requirements met; total = 3 + 2 × hazards), with `perHazard` mapping hazard → required met (0–2)
  - `requiredOf(wf) → number`: 6 for a review, 2 for onboarding

- [ ] **Step 1: Write the failing test.**

```js
// test/core/onboarding.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { created, put } from '../../src/core/data.js';
import { updatePlatform, linkHazard } from '../../src/core/ops/platforms.js';
import { tagPlatform, createPlatformGroup } from '../../src/core/ops/platform-groups.js';
import { addFailureMode, addSystemElement, addAffectedGroup, addCausalFactor } from '../../src/core/ops/hazards.js';
import { updateControl, setImplementedBy } from '../../src/core/ops/controls.js';
import { setControlStatus, setSfarp } from '../../src/core/ops/assessment.js';
import { onboardingOf, onboardingProgress, workflowProgress } from '../../src/core/workflows.js';
import { act, seed } from '../helpers.js';

/** p1 Alpha with h1; an open onboarding w1 on it (made directly, so this test needs no ops from Task 3). */
export function onboarding(d = seed(), state = 'open') {
  return put(d, 'workflow', created(act, 'w1', { number: null, type: 'platformOnboarding', platformId: 'p1', ownerId: 'u1', state, at: { hazardId: '@details' }, outcome: '', notes: '', endedBy: null, endedAt: null }));
}
const step = (d, hazardId, check, checked = true) => put(d, 'workflowStep', created(act, `ws:w1:${hazardId}:${check}`, { workflowId: 'w1', hazardId, check, checked, note: '' }));
const prog = (d) => onboardingProgress(d, d.records.workflow.w1);

test('a platform is Onboarding while its latest onboarding is not completed', () => {
  assert.equal(onboardingOf(seed(), 'p1'), null, 'never onboarded: a normal platform');
  assert.equal(onboardingOf(onboarding(), 'p1')?.id, 'w1');
  assert.equal(onboardingOf(onboarding(seed(), 'cancelled'), 'p1')?.id, 'w1', 'cancelled stays Onboarding');
  assert.equal(onboardingOf(onboarding(seed(), 'completed'), 'p1'), null);
});

test('a platform has a description', () => {
  const d = updatePlatform(seed(), act, { id: 'p1', description: '  A laser trailer  ' });
  assert.deepEqual([d.records.platform.p1.name, d.records.platform.p1.description], ['Alpha', 'A laser trailer']);
  assert.equal(updatePlatform(d, act, { id: 'p1', name: 'Alpha 2' }).records.platform.p1.description, 'A laser trailer');
});

test('platform requirements: details need a description, groups at least one, hazards at least one', () => {
  let d = onboarding();
  assert.deepEqual([prog(d).details, prog(d).groups, prog(d).hazards], [false, false, true]);
  d = updatePlatform(d, act, { id: 'p1', description: 'Trailer' });
  d = createPlatformGroup(d, act, { id: 'g1', name: 'Lasers' });
  d = tagPlatform(d, act, { platformId: 'p1', groupId: 'g1' });
  assert.deepEqual([prog(d).details, prog(d).groups], [true, true]);
  assert.ok(prog(d).unmet.some((u) => u.hazardId === 'h1'));
  assert.ok(!prog(d).unmet.some((u) => u.hazardId === null));
});

test('facets: each of the four needs an entry or its none tick; a tick plus an entry still counts', () => {
  let d = onboarding();
  assert.deepEqual(prog(d).perHazard.get('h1').facets, { failureMode: false, systemElement: false, affectedGroup: false, causalFactor: true }, 'seed h1 has a causal factor for every platform');
  d = addFailureMode(d, act, { hazardId: 'h1', platformId: 'p1', text: 'Beam misaligned' });
  d = step(d, 'h1', 'none:systemElement');
  d = step(d, 'h1', 'none:affectedGroup');
  d = addAffectedGroup(d, act, { hazardId: 'h1', platformId: 'p1', text: 'Crew' });
  assert.deepEqual(prog(d).perHazard.get('h1').facets, { failureMode: true, systemElement: true, affectedGroup: true, causalFactor: true });
  d = step(d, 'h1', 'none:systemElement', false);
  assert.equal(prog(d).perHazard.get('h1').facets.systemElement, false, 'an unticked none counts as not ticked');
});

test('implemented controls: one Implemented with tier, origin, description and implemented-by here, or the none tick', () => {
  let d = onboarding();
  assert.equal(prog(d).perHazard.get('h1').implemented, false);
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'implemented' });
  d = updateControl(d, act, { id: 'c1', tier: 'Engineering', origin: 'OEM manual', description: 'Wet-pipe sprinklers' });
  assert.equal(prog(d).perHazard.get('h1').implemented, false, 'implemented-by not set');
  d = setImplementedBy(d, act, { controlId: 'c1', platformId: 'p2', implementedBy: 'oem' });
  assert.equal(prog(d).perHazard.get('h1').implemented, false, 'set on another platform only');
  d = setImplementedBy(d, act, { controlId: 'c1', platformId: 'p1', implementedBy: 'oem' });
  assert.equal(prog(d).perHazard.get('h1').implemented, true);
  assert.equal(prog(step(onboarding(), 'h1', 'none:controls')).perHazard.get('h1').implemented, true);
});

test('optional cards say whether they have anything; progress counts requirements met', () => {
  let d = onboarding();
  assert.deepEqual(prog(d).perHazard.get('h1').optional, { otherControls: true, ratings: false, justifications: false, sfarp: false }, 'c1 and c2 are on h1 as recommended');
  d = setSfarp(d, act, { hazardId: 'h1', platformId: 'p1', conclusion: 'Tolerable' });
  assert.equal(prog(d).perHazard.get('h1').optional.sfarp, true);
  const p = workflowProgress(d, d.records.workflow.w1);
  assert.deepEqual([p.done, p.total, p.perHazard.get('h1')], [1, 5, 0], 'hazards met; details and groups not; h1 has 0 of 2');
});
```

Check the signatures of `createPlatformGroup`, `tagPlatform`, `addFailureMode` / `addAffectedGroup` and `setImplementedBy` against their source files before running, and adjust argument names only.

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/core/onboarding.test.js`
Expected: FAIL (`onboardingOf` is not exported).

- [ ] **Step 3: Implement.**

`src/core/ops/platforms.js`:

```js
/** @param {Data} data @param {Act} act @param {{ id: string, name?: string, description?: string }} args */
export function updatePlatform(data, act, { id, name, description }) {
  const p = need(data, 'platform', id);
  /** @type {Record<string, string>} */
  const fields = {};
  if (name !== undefined) fields.name = needText(name, 'A platform name');
  if (description !== undefined) fields.description = String(description ?? '').trim();
  return commit(data, act, name !== undefined && description === undefined ? 'Rename platform' : 'Edit platform', [{ kind: 'platform', rec: changed(p, act, fields) }]);
}
```

`src/core/workflows.js`:
- Set `ready: true` on the `platformOnboarding` entry of `WORKFLOW_TYPES`.
- Add `causalFactorsOn, platformListOn, controlsOnPlatform, implementedByOf, assessmentOf, sfarpOf` to the `./queries.js` import (check each is exported; `assessmentOf` and `sfarpOf` are used by `ssra.js`).
- Import `RECEPTORS` from `./receptors.js`.
- Then add:

```js
/** The per-platform facets onboarding asks for on each hazard. */
export const FACET_KINDS = Object.freeze(['failureMode', 'systemElement', 'affectedGroup', 'causalFactor']);

/** Onboarding's "none applies" ticks: one per facet, and one for implemented controls. */
export const NONE_CHECKS = Object.freeze([...FACET_KINDS.map((f) => `none:${f}`), 'none:controls']);

/** Where onboarding can stand besides a hazard or the summary. */
export const ONBOARDING_POSITIONS = Object.freeze(['@details', '@groups', '@hazards']);

/** How many required things each hazard has in a workflow of this type. @param {{ type: string }} wf */
export const requiredOf = (wf) => (wf.type === 'platformOnboarding' ? 2 : CHECKS.length);

/**
 * The onboarding a platform is under: its most recently started onboarding workflow, unless that
 * one was completed. A platform never onboarded is under none.
 * @param {Data} data @param {string} platformId @returns {Rec | null}
 */
export function onboardingOf(data, platformId) {
  const latest = live(data, 'workflow').filter((w) => w.type === 'platformOnboarding' && w.platformId === platformId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))[0];
  return latest && latest.state !== 'completed' ? latest : null;
}

/** @param {Data} data @param {string} workflowId @param {string} hazardId @param {string} check */
const ticked = (data, workflowId, hazardId, check) => Boolean(stepOf(data, workflowId, hazardId, check)?.checked);

/** The words for each requirement, as the summary lists them. */
const FACET_NAME = Object.freeze({ failureMode: 'element failure modes', systemElement: 'systems or elements', affectedGroup: 'affected groups', causalFactor: 'causal factors' });

/**
 * What an onboarding still needs, worked out from the data: the platform's description, a group
 * and a hazard; on each hazard each facet (an entry, or None applies) and its implemented controls
 * (one Implemented with tier, origin, description and implemented-by here, or No controls
 * implemented); and whether each optional card has anything in it.
 * @param {Data} data @param {Rec} wf
 */
export function onboardingProgress(data, wf) {
  const pid = wf.platformId;
  const p = get(data, 'platform', pid);
  const details = Boolean(p && String(p.name ?? '').trim() && String(p.description ?? '').trim());
  const groups = live(data, 'platformGroupLink').some((l) => l.platformId === pid && get(data, 'platformGroup', l.groupId)?.status !== 'deleted');
  const hz = workflowHazards(data, wf);
  /** @type {{ hazardId: string | null, what: string }[]} */
  const unmet = [];
  if (!details) unmet.push({ hazardId: null, what: 'A description of the platform' });
  if (!groups) unmet.push({ hazardId: null, what: 'At least one platform group' });
  if (!hz.length) unmet.push({ hazardId: null, what: 'At least one hazard' });
  /** @type {Map<string, any>} */
  const perHazard = new Map();
  for (const { hazard } of hz) {
    const hid = hazard.id;
    /** @type {Record<string, boolean>} */
    const facets = {};
    for (const f of FACET_KINDS) {
      const entries = f === 'causalFactor' ? causalFactorsOn(data, hid, pid) : platformListOn(data, /** @type {any} */ (f), hid, pid);
      facets[f] = entries.length > 0 || ticked(data, wf.id, hid, `none:${f}`);
    }
    const controls = controlsOnPlatform(data, hid, pid);
    const complete = (/** @type {Rec} */ c) => Boolean(c.tier && String(c.origin ?? '').trim() && String(c.description ?? '').trim() && implementedByOf(data, c.id, pid));
    const implemented = controls.some((c) => c.state === 'implemented') && controls.filter((c) => c.state === 'implemented').every((c) => complete(c.control))
      || (ticked(data, wf.id, hid, 'none:controls') && !controls.some((c) => c.state === 'implemented'));
    const rated = (/** @type {string} */ stage) => RECEPTORS.some((r) => { const a = assessmentOf(data, hid, pid, stage, r); return a && (a.likelihood != null || a.consequence != null); });
    const why = (/** @type {string} */ stage) => RECEPTORS.some((r) => { const a = assessmentOf(data, hid, pid, stage, r); return a && (String(a.likelihoodWhy ?? '').trim() || String(a.consequenceWhy ?? '').trim()); });
    const sf = sfarpOf(data, hid, pid);
    const optional = {
      otherControls: controls.some((c) => c.state !== 'implemented'),
      ratings: rated('initial') || rated('residual'),
      justifications: why('initial') || why('residual'),
      sfarp: ['justification', 'conclusion', 'conditions'].some((f) => String(sf[f] ?? '').trim()),
    };
    const facetsMet = FACET_KINDS.every((f) => facets[f]);
    for (const f of FACET_KINDS) if (!facets[f]) unmet.push({ hazardId: hid, what: `${hazardLabel(hazard)}: ${FACET_NAME[/** @type {'failureMode'} */ (f)]}, or None applies` });
    if (!implemented) unmet.push({ hazardId: hid, what: `${hazardLabel(hazard)}: implemented controls with tier, origin, description and implemented by, or No controls implemented` });
    perHazard.set(hid, { facets, implemented, optional, required: Number(facetsMet) + Number(implemented) });
  }
  return { details, groups, hazards: hz.length > 0, perHazard, unmet };
}
```

In `workflowProgress`, take the onboarding branch first:

```js
export function workflowProgress(data, wf) {
  if (wf.type === 'platformOnboarding') {
    const o = onboardingProgress(data, wf);
    /** @type {Map<string, number>} */
    const perHazard = new Map([...o.perHazard].map(([id, x]) => [id, x.required]));
    const done = Number(o.details) + Number(o.groups) + Number(o.hazards) + [...perHazard.values()].reduce((a, b) => a + b, 0);
    return { perHazard, done, total: 3 + perHazard.size * 2 };
  }
  // … the Platform Review body as it is
}
```

Notes:
- The implemented requirement is met **only if every** Implemented control is complete. A half-filled one keeps it unmet, so the summary points at it.
- `assessmentOf` may return a record or null. Check its return shape in `queries.js` and adapt the two `rated` / `why` lines if it returns `{ likelihood, … }` with nulls.
- The causal factors from `seed()` apply to every platform (`platformId: null`), so `causalFactor` starts met in the test.

- [ ] **Step 4: Run the tests.**

Run: `node --test test/core/onboarding.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/core/ops/platforms.js src/core/workflows.js test/core/onboarding.test.js
git commit -m "Onboarding: platforms have a description; a platform is Onboarding until its onboarding completes; what it still needs worked out from the data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Suggestions from shared groups

**Files:**
- Modify: `src/core/workflows.js`
- Test: `test/core/onboarding-suggestions.test.js` (new)

**Interfaces:**
- Produces:
  - `sharedGroups(data, platformId, hazardId) → string[]` (group ids, maybe `'all'`)
  - `groupSuggestions(data, { kind, platformId, hazardId? }) → { id: string, text: string, from: string }[]`, where `id` is the hazard, control or option id, `text` is the hazard/control title or option name, and `from` is the group names joined by ", ".

- [ ] **Step 1: Write the failing test.**

```js
// test/core/onboarding-suggestions.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformGroup, tagPlatform } from '../../src/core/ops/platform-groups.js';
import { createFacetOption, setOptionGroup } from '../../src/core/ops/facets.js';
import { createHazard, addFailureMode } from '../../src/core/ops/hazards.js';
import { createControl } from '../../src/core/ops/controls.js';
import { sharedGroups, groupSuggestions } from '../../src/core/workflows.js';
import { act, seed } from '../helpers.js';

/** p1 is in Lasers and Vehicles; h1 is assigned to Lasers and Maritime. */
function groups() {
  let d = seed();
  for (const [id, name] of [['gL', 'Lasers'], ['gV', 'Vehicles'], ['gM', 'Maritime']]) d = createPlatformGroup(d, act, { id, name });
  d = tagPlatform(d, act, { platformId: 'p1', groupId: 'gL' });
  d = tagPlatform(d, act, { platformId: 'p1', groupId: 'gV' });
  d = setOptionGroup(d, act, { facet: 'hazard', optionId: 'h1', groupId: 'gL', on: true });
  d = setOptionGroup(d, act, { facet: 'hazard', optionId: 'h1', groupId: 'gM', on: true });
  for (const [id, name, g] of [['fL', 'Beam misaligned', 'gL'], ['fV', 'Brake failure', 'gV'], ['fM', 'Hull breach', 'gM'], ['fA', 'Power loss', 'all']]) {
    d = createFacetOption(d, act, { id, facet: 'failureMode', name });
    d = setOptionGroup(d, act, { facet: 'failureMode', optionId: id, groupId: g, on: true });
  }
  return d;
}

test('shared groups: those the platform is in and the hazard is assigned to, plus All platforms when the hazard is', () => {
  let d = groups();
  assert.deepEqual(sharedGroups(d, 'p1', 'h1'), ['gL']);
  d = setOptionGroup(d, act, { facet: 'hazard', optionId: 'h1', groupId: 'all', on: true });
  assert.deepEqual(sharedGroups(d, 'p1', 'h1').sort(), ['all', 'gL']);
});

test('facet suggestions come from the shared groups and All platforms, without what is already there', () => {
  let d = groups();
  assert.deepEqual(groupSuggestions(d, { kind: 'failureMode', platformId: 'p1', hazardId: 'h1' }).map((s) => [s.text, s.from]),
    [['Beam misaligned', 'Lasers'], ['Power loss', 'All platforms']], 'not Brake failure (Vehicles: the hazard is not), not Hull breach (Maritime: the platform is not)');
  d = addFailureMode(d, act, { hazardId: 'h1', platformId: 'p1', text: 'beam MISALIGNED' });
  assert.deepEqual(groupSuggestions(d, { kind: 'failureMode', platformId: 'p1', hazardId: 'h1' }).map((s) => s.text), ['Power loss']);
});

test('hazard suggestions come from the platform’s groups and All platforms, without hazards already on it', () => {
  let d = groups();
  d = createHazard(d, act, { id: 'h3', title: 'Glare' });
  d = setOptionGroup(d, act, { facet: 'hazard', optionId: 'h3', groupId: 'gV', on: true });
  d = createHazard(d, act, { id: 'h4', title: 'Drowning' });
  d = setOptionGroup(d, act, { facet: 'hazard', optionId: 'h4', groupId: 'gM', on: true });
  assert.deepEqual(groupSuggestions(d, { kind: 'hazard', platformId: 'p1' }).map((s) => [s.id, s.from]), [['h3', 'Vehicles']], 'h1 is already on p1; h4 is Maritime only');
});

test('control suggestions come from the shared groups, without controls already on the hazard here', () => {
  let d = groups();
  d = createControl(d, act, { id: 'c3', title: 'Beam stop' });
  d = setOptionGroup(d, act, { facet: 'control', optionId: 'c3', groupId: 'gL', on: true });
  d = setOptionGroup(d, act, { facet: 'control', optionId: 'c1', groupId: 'gL', on: true });
  assert.deepEqual(groupSuggestions(d, { kind: 'control', platformId: 'p1', hazardId: 'h1' }).map((s) => s.id), ['c3'], 'c1 is already on h1 at p1');
});
```

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/core/onboarding-suggestions.test.js`
Expected: FAIL (`sharedGroups` is not exported).

- [ ] **Step 3: Implement** (`src/core/workflows.js`; add `groupsOf` to the queries import):

```js
/** @param {Data} data @param {string} kind 'hazard', 'control', or 'facetOption' @param {string} id @returns {Set<string>} */
const assignedGroups = (data, kind, id) => new Set(live(data, 'optionGroup').filter((l) => l.optionKind === kind && l.optionId === id).map((l) => /** @type {string} */ (l.groupId)));

/** @param {Data} data @param {string} groupId */
const groupName = (data, groupId) => (groupId === 'all' ? 'All platforms' : get(data, 'platformGroup', groupId)?.name ?? '');

/**
 * The groups a hazard on a platform takes suggestions from: those the platform is in that the
 * hazard is assigned to, and All platforms when the hazard is assigned to it.
 * @param {Data} data @param {string} platformId @param {string} hazardId @returns {string[]}
 */
export function sharedGroups(data, platformId, hazardId) {
  const mine = new Set(groupsOf(data, platformId).map((g) => g.id));
  return [...assignedGroups(data, 'hazard', hazardId)].filter((g) => g === 'all' || mine.has(g));
}

/**
 * What onboarding suggests, from platform groups: hazards assigned to the platform's groups (or
 * All platforms) not on it yet; and, for a hazard there, facet options or controls assigned to the
 * groups it shares with the platform, not there yet. Each says which groups it came from.
 * @param {Data} data @param {{ kind: string, platformId: string, hazardId?: string }} o
 * @returns {{ id: string, text: string, from: string }[]}
 */
export function groupSuggestions(data, { kind, platformId, hazardId }) {
  const groups = kind === 'hazard' ? ['all', ...groupsOf(data, platformId).map((g) => g.id)] : sharedGroups(data, platformId, /** @type {string} */ (hazardId));
  const want = new Set(groups);
  const from = (/** @type {string} */ k, /** @type {string} */ id) => [...assignedGroups(data, k, id)].filter((g) => want.has(g)).map((g) => groupName(data, g)).join(', ');
  if (kind === 'hazard') {
    const on = new Set(live(data, 'hazardPlatform').filter((l) => l.platformId === platformId).map((l) => l.hazardId));
    return live(data, 'hazard').filter((h) => !on.has(h.id)).sort(byNumber)
      .map((h) => ({ id: h.id, text: `${hazardLabel(h)} ${h.title}`, from: from('hazard', h.id) })).filter((s) => s.from);
  }
  if (kind === 'control') {
    const here = new Set(controlsOnPlatform(data, /** @type {string} */ (hazardId), platformId).map((c) => c.control.id));
    return live(data, 'control').filter((c) => !here.has(c.id)).sort(byNumber)
      .map((c) => ({ id: c.id, text: c.title, from: from('control', c.id) })).filter((s) => s.from);
  }
  const entries = kind === 'causalFactor' ? causalFactorsOn(data, /** @type {string} */ (hazardId), platformId) : platformListOn(data, /** @type {any} */ (kind), /** @type {string} */ (hazardId), platformId);
  const have = new Set(entries.map((e) => String(e.text).trim().toLowerCase()));
  return live(data, 'facetOption').filter((o) => o.facet === kind && !have.has(String(o.name).trim().toLowerCase()))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((o) => ({ id: o.id, text: o.name, from: from('facetOption', o.id) })).filter((s) => s.from);
}
```

Check: does `setOptionGroup` store `optionKind: 'facetOption'` for facet options? Read `facets.js` `optionKind()` and confirm before relying on the `'facetOption'` literal.

- [ ] **Step 4: Run the tests.**

Run: `node --test test/core/onboarding-suggestions.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/core/workflows.js test/core/onboarding-suggestions.test.js
git commit -m "Onboarding suggestions: hazards from the platform's groups, facets and controls from the groups the hazard shares with it, plus All platforms

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Onboarding ops

**Files:**
- Modify: `src/core/ops/workflows.js`
- Test: `test/core/ops/onboarding.test.js` (new)

**Interfaces:**
- Consumes: `onboardingOf`, `onboardingProgress`, `NONE_CHECKS`, `ONBOARDING_POSITIONS` (Task 1)
- Produces:
  - `startOnboarding(data, act, { id?, platformId?, name, ownerId })`
  - `startWorkflow` accepts `type: 'platformOnboarding'` (this is Onboard again)
  - `setWorkflowPosition` accepts `'@…'`
  - `setStep` accepts none-checks
  - `completeWorkflow` handles onboarding.
- Test helper (add to `test/helpers.js`): `beginOnboarding(d, by, { id, platformId, name, ownerId })`

- [ ] **Step 1: Write the failing test.**

```js
// test/core/ops/onboarding.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { entries } from '../../../src/core/history.js';
import { updatePlatform, linkHazard } from '../../../src/core/ops/platforms.js';
import { createPlatformGroup, tagPlatform } from '../../../src/core/ops/platform-groups.js';
import { startOnboarding, startWorkflow, setWorkflowPosition, setStep, cancelWorkflow, completeWorkflow } from '../../../src/core/ops/workflows.js';
import { onboardingOf } from '../../../src/core/workflows.js';
import { act, later, seed, scheduleFixed } from '../../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const begun = () => startOnboarding(seed(), act, { id: 'w9', platformId: 'p9', name: 'Gamma', ownerId: 'u2' });

/** Gamma with everything onboarding needs on h1. */
function ready() {
  let d = begun();
  d = updatePlatform(d, act, { id: 'p9', description: 'A trailer' });
  d = createPlatformGroup(d, act, { id: 'g1', name: 'Lasers' });
  d = tagPlatform(d, act, { platformId: 'p9', groupId: 'g1' });
  d = linkHazard(d, act, { hazardId: 'h1', platformId: 'p9' });
  for (const check of ['none:failureMode', 'none:systemElement', 'none:affectedGroup', 'none:controls']) d = setStep(d, act, { workflowId: 'w9', hazardId: 'h1', check, checked: true });
  return d;
}

test('onboarding a new platform makes it and the workflow in one change, on Details, owned by its starter', () => {
  const d = begun();
  assert.deepEqual([d.records.platform.p9.name, d.records.platform.p9.ownerId], ['Gamma', 'u2']);
  const w = d.records.workflow.w9;
  assert.deepEqual([w.type, w.platformId, w.ownerId, w.state, w.at.hazardId], ['platformOnboarding', 'p9', 'u1', 'open', '@details']);
  assert.equal(onboardingOf(d, 'p9')?.id, 'w9');
  assert.equal(entries(d).at(-1).action, 'Onboard platform');
  assert.equal(entries(d).length, entries(seed()).length + 1, 'one entry');
});

test('positions include the platform steps; none ticks need the hazard on the platform', () => {
  let d = setWorkflowPosition(begun(), act, { workflowId: 'w9', hazardId: '@groups' });
  assert.equal(d.records.workflow.w9.at.hazardId, '@groups');
  assert.throws(() => setStep(d, act, { workflowId: 'w9', hazardId: 'h1', check: 'none:controls', checked: true }), code('workflow.hazard'));
  d = linkHazard(d, act, { hazardId: 'h1', platformId: 'p9' });
  assert.doesNotThrow(() => setStep(d, act, { workflowId: 'w9', hazardId: 'h1', check: 'none:controls', checked: true }));
  assert.throws(() => setStep(d, act, { workflowId: 'w9', hazardId: 'h1', check: 'sfarp', checked: true }), code('workflow.check'), 'review checks are not onboarding’s');
});

test('complete is strict, writes no review, and ends Onboarding', () => {
  assert.throws(() => completeWorkflow(begun(), act, { workflowId: 'w9' }), (e) => e instanceof PivotError && e.code === 'workflow.unmet' && /3 things are still needed/.test(e.message));
  const d = completeWorkflow(ready(), act, { workflowId: 'w9' });
  assert.equal(d.records.workflow.w9.state, 'completed');
  assert.deepEqual(d.records.workflow.w9.covered, ['h1']);
  assert.equal(onboardingOf(d, 'p9'), null);
  assert.equal(Object.keys(d.records.review).length, 0);
  assert.equal(entries(d).at(-1).action, 'Complete onboarding');
});

test('a cancelled onboarding leaves the platform Onboarding; Onboard again starts another, only one at a time', () => {
  let d = cancelWorkflow(begun(), act, { workflowId: 'w9' });
  assert.equal(onboardingOf(d, 'p9')?.id, 'w9');
  d = startWorkflow(d, later, { id: 'w10', type: 'platformOnboarding', platformId: 'p9' });
  assert.equal(onboardingOf(d, 'p9')?.id, 'w10');
  assert.equal(d.records.workflow.w10.at.hazardId, '@details');
  assert.throws(() => startWorkflow(d, later, { type: 'platformOnboarding', platformId: 'p9' }), code('onboarding.open'));
  assert.throws(() => startWorkflow(seed(), act, { type: 'platformOnboarding', platformId: 'p1' }), code('onboarding.not'), 'a platform not Onboarding');
});

test('a review cannot start while the platform is Onboarding', () => {
  const d = scheduleFixed(begun(), 'p9', 6, '2026-10-30');
  assert.throws(() => startWorkflow(d, act, { type: 'platformReview', platformId: 'p9' }), (e) => e instanceof PivotError && e.code === 'review.onboarding' && /Finish onboarding Gamma first/.test(e.message));
});
```

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/core/ops/onboarding.test.js`
Expected: FAIL (`startOnboarding` is not exported).

- [ ] **Step 3: Implement** in `src/core/ops/workflows.js`. Add the imports `createPlatform` from `./platforms.js` (check for a cycle: `platforms.js` imports `./workflows.js`; that's fine because only functions are used at call time) and `NONE_CHECKS, ONBOARDING_POSITIONS, onboardingOf, onboardingProgress, requiredOf` from `../workflows.js`.

```js
/** A workflow's opening record. @param {Act} act @param {string} id @param {string} type @param {string} platformId @param {string | null} at */
const opening = (act, id, type, platformId, at) => created(act, id, { number: null, type, platformId, ownerId: act.by, state: 'open', at: { hazardId: at }, outcome: '', notes: '', endedBy: null, endedAt: null });

/**
 * Onboard a new platform: make it and its onboarding together, the onboarding owned by whoever
 * starts it and opening on the platform's details.
 * @param {Data} data @param {Act} act @param {{ id?: string, platformId?: string, name: string, ownerId: string }} args
 */
export function startOnboarding(data, act, { id = newId(), platformId = newId(), name, ownerId }) {
  const withPlatform = createPlatform(data, act, { id: platformId, name, ownerId });
  const platform = withPlatform.records.platform[platformId];
  return commit(data, act, 'Onboard platform', [{ kind: 'platform', rec: platform }, { kind: 'workflow', rec: opening(act, id, 'platformOnboarding', platformId, '@details') }]);
}
```

`startWorkflow` becomes:

```js
export function startWorkflow(data, act, { id = newId(), type, platformId }) {
  const p = need(data, 'platform', platformId);
  if (type === 'platformOnboarding') {
    const under = onboardingOf(data, platformId);
    if (!under) throw new PivotError('onboarding.not', `${p.name} has been onboarded already.`);
    if (under.state === 'open') throw new PivotError('onboarding.open', `${p.name} is being onboarded already.`);
    if (p.status !== 'live') throw new PivotError('platform.retired', `${p.name} is retired.`);
    return commit(data, act, 'Start workflow', [{ kind: 'workflow', rec: opening(act, id, type, platformId, '@details') }]);
  }
  if (type !== 'platformReview') throw new PivotError('workflow.type', 'That workflow is not available yet.');
  if (p.status !== 'live') throw new PivotError('platform.retired', `${p.name} is retired, so it cannot be reviewed.`);
  if (onboardingOf(data, platformId)) throw new PivotError('review.onboarding', `Finish onboarding ${p.name} first.`);
  if (openPlatformReview(data, platformId)) throw new PivotError('review.open', `${p.name} already has a review in progress.`);
  const first = workflowHazards(data, { platformId })[0]?.hazard.id ?? null;
  return commit(data, act, 'Start workflow', [{ kind: 'workflow', rec: opening(act, id, type, platformId, first) }]);
}
```

In `setWorkflowPosition`, before `needHazard`:

```js
  const to = !hazardId ? null : wf.type === 'platformOnboarding' && ONBOARDING_POSITIONS.includes(hazardId) ? hazardId : needHazard(data, wf, hazardId);
```

In `setStep`, replace the `CHECKS.includes(check)` guard with:

```js
  const allowed = wf.type === 'platformOnboarding' ? NONE_CHECKS : CHECKS;
  if (!allowed.includes(check)) throw new PivotError('workflow.check', 'That is not one of this workflow’s checks.');
```

At the top of `completeWorkflow`, after `needOpen`:

```js
  if (wf.type === 'platformOnboarding') {
    const { unmet } = onboardingProgress(data, wf);
    if (unmet.length) throw new PivotError('workflow.unmet', `${unmet.length} thing${unmet.length === 1 ? ' is' : 's are'} still needed.`);
    return commit(data, act, 'Complete onboarding', [{ kind: 'workflow', rec: changed(wf, act, { state: 'completed', endedBy: act.by, endedAt: act.at, covered: covered(data, wf) }) }]);
  }
```

`test/helpers.js`: add `startOnboarding` to the workflows ops import and:

```js
/** Onboard a new platform. @param {import('../src/core/data.js').Data} d @param {{ by: string, at: string }} by @param {{ id: string, platformId: string, name: string, ownerId: string }} args */
export function beginOnboarding(d, by, args) {
  return startOnboarding(d, by, args);
}
```

- [ ] **Step 4: Run the tests.**

Run: `node --test test/core/ops/onboarding.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS. Part 1's tests must still pass; the review-type guard message changed from "That workflow is not available yet." only for unknown types.

- [ ] **Step 5: Commit.**

```bash
git add src/core/ops/workflows.js test/helpers.js test/core/ops/onboarding.test.js
git commit -m "Onboarding ops: onboard a new platform in one change, Onboard again after a cancel, none ticks, strict Complete; a review waits for onboarding to finish

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Leave Onboarding platforms out of open items, Coming up and the timeline

**Files:**
- Modify: `src/core/queries.js` (`openItems` ~463, `upcomingReviews` ~579), `src/ui/screens/reviews.js` (`reviewsPlatforms` ~156)
- Test: `test/core/onboarding-excluded.test.js` (new)

`queries.js` must not import `core/workflows.js` (which imports `queries.js`), so it carries its own small check:

```js
/** Whether a platform is still being onboarded (as core/workflows.js onboardingOf, kept here to avoid an import cycle). @param {Data} data @param {string} platformId */
function onboarding(data, platformId) {
  const latest = live(data, 'workflow').filter((w) => w.type === 'platformOnboarding' && w.platformId === platformId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))[0];
  return Boolean(latest && latest.state !== 'completed');
}
```

- [ ] **Step 1: Write the failing test.**

```js
// test/core/onboarding-excluded.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openItems, upcomingReviews } from '../../src/core/queries.js';
import { reviewsPlatforms } from '../../src/ui/screens/reviews.js';
import { linkHazard } from '../../src/core/ops/platforms.js';
import { act, seed, scheduleFixed, beginOnboarding } from '../helpers.js';

test('an Onboarding platform has no open items, nothing coming up, and no timeline row', () => {
  let d = beginOnboarding(seed(), act, { id: 'w9', platformId: 'p9', name: 'Gamma', ownerId: 'u1' });
  d = linkHazard(d, act, { hazardId: 'h1', platformId: 'p9' });
  d = scheduleFixed(d, 'p9', 1, '2026-10-15');
  const items = openItems(d, '2026-09-28', null);
  for (const [k, list] of Object.entries(items)) assert.ok(!list.some((x) => x.platform?.id === 'p9'), `${k} leaves out Gamma`);
  assert.ok(!upcomingReviews(d, '2026-09-28', null, 90).some((r) => r.platform.id === 'p9'));
  const state = { profileId: 'u1', reviewsPrefs: { owner: 'everyone', groupId: null } };
  assert.ok(!reviewsPlatforms(state, d).some((p) => p.id === 'p9'));
  assert.ok(reviewsPlatforms(state, d).some((p) => p.id === 'p1'));
});
```

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/core/onboarding-excluded.test.js`
Expected: FAIL (Gamma appears in `unrated` or `reviews`).

- [ ] **Step 3: Implement.**
- Add the `onboarding` helper to `queries.js`.
- In `openItems`, change the platform loop filter to `.filter((p) => (ownerId == null || p.ownerId === ownerId) && !onboarding(data, p.id))`.
- In `upcomingReviews`, add `&& !onboarding(data, p.id)` to its platform filter.
- Export the helper as `isOnboarding`. In `reviewsPlatforms` (`reviews.js`), add `.filter((p) => !isOnboarding(data, p.id))`. Both the Schedule table and the timeline use `reviewsPlatforms`, so the schedule leaves it out too, which is consistent with "no review scheduling while Onboarding".

- [ ] **Step 4: Run the tests.**

Run: `node --test test/core/onboarding-excluded.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/core/queries.js src/ui/screens/reviews.js test/core/onboarding-excluded.test.js
git commit -m "Onboarding platforms stay out of open items, Coming up and the Reviews schedule and timeline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Shared UI pieces: group suggestions in the add forms, and a filtered controls table

**Files:**
- Modify: `src/ui/screens/dashboard.js` (`numberedCard`, `platformListCard`, `addForm`), `src/ui/screens/ssra.js` (`controlsSection`)
- Test: `test/ui/screens-dashboard.test.js` (add a test)

**Interfaces:**
- Produces:
  - `numberedCard(state, { …, grouped? })` and `platformListCard(state, { …, grouped? })`, where `grouped: { text, from }[]` is shown first under "Suggested from your groups"
  - `controlsSection(state, data, h, platformId, platformName, only?)`, where `only: (row) => boolean` filters the rows and `undefined` means all

- [ ] **Step 1: Write the failing test** (add it to `test/ui/screens-dashboard.test.js`, using its existing `state` and `seed` imports, and adding any missing ones):

```js
import { numberedCard, platformListCard } from '../../src/ui/screens/dashboard.js';
import { controlsSection } from '../../src/ui/screens/ssra.js';

test('the add form shows group suggestions first, each with its groups; the controls table can show a filtered set', () => {
  const s = { ...state, editing: { kind: 'newFailureMode', id: 'h1:p1' } };
  const out = platformListCard(s, { kind: 'failureMode', items: [], hazardId: 'h1', platformId: 'p1', entries: ['Old entry'], grouped: [{ text: 'Beam misaligned', from: 'Lasers' }] }).toString();
  assert.match(out, /Suggested from your groups[\s\S]*Beam misaligned[\s\S]*Lasers[\s\S]*Used before[\s\S]*Old entry/);
  const cf = numberedCard({ ...state, editing: { kind: 'newCausalFactor', id: 'h1' } }, { name: 'CausalFactor', items: [], hazardId: 'h1', platformId: 'p1', grouped: [{ text: 'Hot works', from: 'All platforms' }] }).toString();
  assert.match(cf, /Suggested from your groups[\s\S]*Hot works/);
  const d = seed();
  const only = controlsSection(state, d, d.records.hazard.h1, 'p1', 'Alpha', (c) => c.control.id === 'c2').toString();
  assert.match(only, /Fire drills/);
  assert.doesNotMatch(only, /Sprinklers/);
});
```

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/ui/screens-dashboard.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.**

`addForm` gains `grouped = []`, shown before the existing block:

```js
function addForm({ action, attrs, what, extra = '', list, heading, suggestions, reveal, grouped = [] }) {
  const block = (/** @type {string} */ h, /** @type {{ text: string, from: string }[]} */ xs, /** @type {string} */ key) => (xs.length
    ? html`<div class="suggest" data-reveal="${key}"><p class="suggest-h">${h}</p><ul class="suggest-list">${xs.map((x) => html`<li><label class="suggest-item"><input type="checkbox" name="pick" value="${x.text}"><span class="suggest-text">${x.text}</span>${x.from ? html`<span class="suggest-from">${x.from}</span>` : ''}</label></li>`)}</ul></div>`
    : '');
  const groupedTexts = new Set(grouped.map((g) => g.text.toLowerCase()));
  return html`<form data-action="${action}" ${dataAttrs(attrs)} class="new-row new-entries" data-picks>
    <div class="row inline fill"><input name="text" required${list ? html` list="${list}" autocomplete="off"` : ''} placeholder="New ${what}…" aria-label="New ${what}" class="grow" autofocus>${extra}<button type="submit">Add</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></div>
    ${block('Suggested from your groups', grouped, `${reveal}:groups`)}
    ${block(heading, suggestions.filter((x) => !groupedTexts.has(x.text.toLowerCase())), reveal)}
  </form>`;
}
```

- `numberedCard` and `platformListCard` destructure `grouped = []` and pass `grouped` to `addForm`. Add `grouped?: { text: string, from: string }[]` to their JSDoc.
- `controlsSection` gains a 6th parameter `only` (JSDoc `@param {(row: any) => boolean} [only]`) and uses `const rows = controlsOnPlatform(data, h.id, platformId).filter((c) => !only || only(c));`.

- [ ] **Step 4: Run the tests.**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/screens/dashboard.js src/ui/screens/ssra.js test/ui/screens-dashboard.test.js
git commit -m "Add forms offer suggestions from your groups first; the platform controls table can show a chosen set

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The onboarding page, platform steps, rail and summary

**Files:**
- Create: `src/ui/screens/onboarding.js`
- Modify: `src/ui/screens/workflow.js` (hand over open onboarding pages and choose the ended grid), `src/ui/controller.js` (EDITS `startOnboarding`; handler `onboardPlatform`)
- Test: `test/ui/screens-onboarding.test.js` (new), `test/ui/controller-onboarding.test.js` (new)

**Interfaces:**
- Produces:
  - `onboardingBody(state, data, wf, mine)`, the rail plus the current step or hazard or summary
  - `onboardingGrid(data, wf)`, the ended view's grid
  - controller handler `onboardPlatform({ name, ownerId })`
- Consumes: `onboardingProgress`, `groupSuggestions`, `workflowHazards`, `ONBOARDING_POSITIONS`

The hazard cards are Task 7. In this task the hazard page shows only its heading and a placeholder card list, so the rail and summary can be tested on their own.

- [ ] **Step 1: Write the failing tests.**

```js
// test/ui/screens-onboarding.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowView } from '../../src/ui/screens/workflow.js';
import { updatePlatform } from '../../src/core/ops/platforms.js';
import { createPlatformGroup, tagPlatform } from '../../src/core/ops/platform-groups.js';
import { setOptionGroup } from '../../src/core/ops/facets.js';
import { cancelWorkflow } from '../../src/core/ops/workflows.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { state } from './screens-workflows.test.js';
import { seed, act, beginOnboarding } from '../helpers.js';

/** Gamma being onboarded by Ada (w9), in group Lasers, with h1 suggested from Lasers. */
export function onboardingData() {
  let d = beginOnboarding(seed(), act, { id: 'w9', platformId: 'p9', name: 'Gamma', ownerId: 'u1' });
  d = createPlatformGroup(d, act, { id: 'g1', name: 'Lasers' });
  d = tagPlatform(d, act, { platformId: 'p9', groupId: 'g1' });
  d = setOptionGroup(d, act, { facet: 'hazard', optionId: 'h1', groupId: 'g1', on: true });
  return assignNumbers(d);
}
export const on = (extra = {}) => ({ ...state, view: { name: 'workflow', id: 'w9', ...extra } });

test('the rail has the platform steps with their state, the hazards, and the summary; it opens on Details', () => {
  const out = workflowView(on(), onboardingData(), 'w9').toString();
  assert.match(out, /WF-001[\s\S]*Platform Onboarding[\s\S]*Gamma/);
  assert.match(out, /class="wf-rail"[\s\S]*Details[\s\S]*Groups[\s\S]*Hazards[\s\S]*Summary &amp; complete|Summary & complete/);
  assert.match(out, /wf-rail-item on[^>]*>[\s\S]*?Details/);
  assert.match(out, /name="description"[^>]*data-change="updatePlatform"/);
  assert.match(out, /name="ownerId"[^>]*data-change="setOwner"/);
  assert.match(out, /Add image/);
});

test('the Groups step lists the tags with a + for more; the Hazards step suggests from the groups', () => {
  const d = onboardingData();
  assert.match(workflowView(on({ hazardId: '@groups' }), d, 'w9').toString(), /Lasers[\s\S]*data-picker="tagPlatforms"/);
  const hz = workflowView(on({ hazardId: '@hazards' }), d, 'w9').toString();
  assert.match(hz, /Suggested from your groups[\s\S]*name="hazardId" value="h1"[\s\S]*HAZ-001 Fire[\s\S]*Lasers/);
  assert.match(hz, /data-action="linkHazards"/);
  assert.match(hz, /data-picker="linkHazards"/);
});

test('the summary lists what is still needed and keeps Complete disabled', () => {
  const sum = workflowView(on({ hazardId: 'summary' }), onboardingData(), 'w9').toString();
  assert.match(sum, /A description of the platform/);
  assert.match(sum, /At least one hazard/);
  assert.match(sum, /Complete onboarding — 2 still needed<\/button>/);
  assert.match(sum, /data-action="completeWorkflow"[^>]*disabled/);
  const done = updatePlatform(onboardingData(), act, { id: 'p9', description: 'x' });
  assert.match(workflowView(on({ hazardId: 'summary' }), done, 'w9').toString(), /At least one hazard/);
});

test('a cancelled onboarding shows its requirements grid', () => {
  const d = cancelWorkflow(onboardingData(), act, { workflowId: 'w9' });
  const out = workflowView(on(), d, 'w9').toString();
  assert.match(out, /tag wf-cancelled/);
  assert.match(out, /class="wf-grid"/);
});
```

```js
// test/ui/controller-onboarding.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';

const env = (f, storage = new MemoryStorage()) => ({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage, minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

test('New platform onboards it: the platform and its workflow are made and the workflow opens; it survives a save', async () => {
  const f = new MemoryFolder();
  const storage = new MemoryStorage();
  const c = createController(env(f, storage));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const ada = c.getState().profiles[0].id;
  await c.dispatch({ type: 'selectProfile', id: ada });
  await c.dispatch({ type: 'onboardPlatform', name: 'Gamma', ownerId: ada });
  const v = c.getState().view;
  const w = c.getState().session.working;
  assert.equal(v.name, 'workflow');
  assert.equal(w.records.workflow[v.id].type, 'platformOnboarding');
  assert.equal(w.records.platform[w.records.workflow[v.id].platformId].name, 'Gamma');
  await c.dispatch({ type: 'updatePlatform', id: w.records.workflow[v.id].platformId, description: 'A trailer' });
  await c.dispatch({ type: 'save' });
  const again = createController(env(f, storage));
  await again.dispatch({ type: 'chooseFolder' });
  await again.dispatch({ type: 'selectProfile', id: ada });
  const saved = again.getState().session.working;
  assert.equal(saved.records.platform[saved.records.workflow[v.id].platformId].description, 'A trailer');
});
```

- [ ] **Step 2: Run them and check they fail.**

Run: `node --test test/ui/screens-onboarding.test.js test/ui/controller-onboarding.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.**

Controller:
- Add `startOnboarding: workflows.startOnboarding` to EDITS.
- Add the handler:

```js
    // New platform: made and onboarded together, the onboarding opened.
    async onboardPlatform({ name, ownerId }) {
      const id = newId();
      await applyEdit('startOnboarding', { id, platformId: newId(), name, ownerId: ownerId || state.profileId });
      await handlers.go({ view: 'workflow', id });
    },
```

`src/ui/screens/workflow.js`:
- In `workflowView`, after building `head` for an open workflow: `if (wf.type === 'platformOnboarding') return html`${head}${onboardingBody(state, data, wf, mine)}`;`.
- In `endedBody`, use `${wf.type === 'platformOnboarding' ? onboardingGrid(data, wf) : checkGrid(data, wf)}`.
- Import both from `./onboarding.js`.

`src/ui/screens/onboarding.js`:

```js
import { html, raw } from '../html.js';
import { dataAttrs, go, idTag, option, groupTags, plus } from './common.js';
import { platformImage } from './platforms.js';
import { get } from '../../core/data.js';
import { groupsOf } from '../../core/queries.js';
import { workflowHazards, onboardingProgress, groupSuggestions, FACET_KINDS } from '../../core/workflows.js';
import { hazardCards } from './onboarding-cards.js';

/** @typedef {import('../../core/data.js').Data} Data */

const STEPS = /** @type {const} */ ([['@details', 'Details', 'details'], ['@groups', 'Groups', 'groups'], ['@hazards', 'Hazards', 'hazards']]);

/** @param {any} wf @param {string} label @param {string} position */
const navButton = (wf, label, position) => html`<button type="button" ${dataAttrs({ action: 'showWorkflowHazard', 'workflow-id': wf.id, 'hazard-id': position })}>${label}</button>`;

/** The rail: the platform's steps, then its hazards, then the summary; each with how far along it is. @param {Data} data @param {any} wf @param {any} prog @param {string | null} current */
function rail(data, wf, prog, current) {
  const item = (/** @type {string} */ pos, /** @type {any} */ body, /** @type {boolean} */ done) => html`<button type="button" class="wf-rail-item${current === (pos || null) ? ' on' : ''}${done ? ' done' : ''}" ${dataAttrs({ action: 'showWorkflowHazard', 'workflow-id': wf.id, 'hazard-id': pos })}>${body}</button>`;
  const mark = (/** @type {boolean} */ ok) => html`<span class="wf-mark" aria-hidden="true">${ok ? '✓' : ''}</span>`;
  return html`<nav class="wf-rail" aria-label="Onboarding steps"><div class="wf-rail-h">Platform</div>
    ${STEPS.map(([pos, label, key]) => item(pos, html`${mark(prog[key])}<span class="wf-name">${label}</span><span class="wf-count">${prog[key] ? '' : 'Needed'}</span>`, prog[key]))}
    <div class="wf-rail-h">Hazards</div>
    ${workflowHazards(data, wf).map((x) => {
      const n = prog.perHazard.get(x.hazard.id)?.required ?? 0;
      return item(x.hazard.id, html`${mark(n === 2)}<span class="wf-name">${idTag(x.reportId)} ${x.hazard.title}</span><span class="wf-count">${n}/2</span>`, n === 2);
    })}
    ${item('', html`${mark(false)}<span class="wf-name">Summary &amp; complete</span>`, false)}</nav>`;
}

/** @param {any} state @param {Data} data @param {any} wf @param {any} p */
function detailsStep(state, data, wf, p) {
  return html`<h2>Details</h2>
    <label class="field-block"><span class="field-label">Name</span><input name="name" value="${p.name}" required aria-label="Platform name" ${dataAttrs({ change: 'updatePlatform', id: p.id })}></label>
    <label class="field-block"><span class="field-label">Description</span><textarea class="doc-text boxed" name="description" rows="3" placeholder="What the platform is, and what it is for…" aria-label="Platform description" ${dataAttrs({ change: 'updatePlatform', id: p.id })}>${p.description ?? ''}</textarea></label>
    <label class="field-block"><span class="field-label">Owner</span><select name="ownerId" aria-label="Platform owner" ${dataAttrs({ change: 'setOwner', id: p.id })}>${state.profiles.map((/** @type {any} */ pr) => option(pr.id, pr.name, p.ownerId))}</select></label>
    <div class="field-block"><span class="field-label">Image <span class="muted">(optional)</span></span>${p.image ? platformImage(p, 'wf-image') : ''}
      <label class="button-like">${p.image ? 'Change image' : 'Add image'}<input type="file" accept="image/png,image/svg+xml" hidden data-image-for="${p.id}"></label></div>
    <div class="actions wf-nav"><span></span>${navButton(wf, 'Groups →', '@groups')}</div>`;
}

/** @param {Data} data @param {any} wf @param {any} p */
function groupsStep(data, wf, p) {
  const gs = groupsOf(data, p.id);
  return html`<h2>Groups ${plus({ action: 'openPicker', picker: 'tagPlatforms', 'platform-id': p.id }, 'Add to platform groups')}</h2>
    ${gs.length ? groupTags(gs) : html`<p class="muted">Not in any platform group yet. Groups decide what onboarding suggests.</p>`}
    <div class="actions wf-nav">${navButton(wf, '← Details', '@details')}${navButton(wf, 'Hazards →', '@hazards')}</div>`;
}

/** @param {Data} data @param {any} wf @param {any} p */
function hazardsStep(data, wf, p) {
  const sugg = groupSuggestions(data, { kind: 'hazard', platformId: p.id });
  const hz = workflowHazards(data, wf);
  return html`<h2>Hazards ${plus({ action: 'openPicker', picker: 'linkHazards', 'platform-id': p.id }, 'Add any hazard')}</h2>
    ${sugg.length ? html`<form data-action="linkHazards" ${dataAttrs({ 'platform-id': p.id })} class="suggest wf-suggest"><p class="suggest-h">Suggested from your groups</p>
      <ul class="suggest-list">${sugg.map((s) => html`<li><label class="suggest-item"><input type="checkbox" name="hazardId" value="${s.id}"><span class="suggest-text">${s.text}</span><span class="suggest-from">${s.from}</span></label></li>`)}</ul>
      <button type="submit" class="small">Add ticked hazards</button></form>` : html`<p class="muted">Nothing suggested from this platform’s groups.</p>`}
    ${hz.length ? html`<ul class="plain wf-list">${hz.map((x) => html`<li>${idTag(x.reportId)} ${x.hazard.title}</li>`)}</ul>` : html`<p class="muted">No hazards on ${p.name} yet.</p>`}
    <div class="actions wf-nav">${navButton(wf, '← Groups', '@groups')}${hz.length ? navButton(wf, `${hz[0].hazard.title} →`, hz[0].hazard.id) : html`<span></span>`}</div>`;
}

/** @param {any} state @param {Data} data @param {any} wf @param {any} prog @param {boolean} mine */
function summary(state, data, wf, prog, mine) {
  const left = prog.unmet.length;
  return html`<h2>Summary</h2>
    ${left ? html`<p>Still needed:</p><ul class="plain wf-unmet">${prog.unmet.map((/** @type {any} */ u) => html`<li>${navButton(wf, u.what, u.hazardId ?? (u.what.startsWith('A description') ? '@details' : u.what.includes('group') ? '@groups' : '@hazards'))}</li>`)}</ul>`
      : html`<p>Everything onboarding needs is in place.</p>`}
    <fieldset class="wf-fields"${mine ? '' : raw(' disabled')}><div class="actions"><button type="button" class="primary" ${dataAttrs({ action: 'completeWorkflow', 'workflow-id': wf.id })}${left ? raw(' disabled') : ''}>${left ? `Complete onboarding — ${left} still needed` : 'Complete onboarding'}</button></div></fieldset>`;
}

/**
 * An open onboarding's body: the rail, and the chosen step, hazard or the summary. Only its owner
 * can change the workflow's own ticks; everyone edits the platform as they could on its page.
 * @param {any} state @param {Data} data @param {any} wf @param {boolean} mine
 */
export function onboardingBody(state, data, wf, mine) {
  const p = get(data, 'platform', wf.platformId);
  const prog = onboardingProgress(data, wf);
  const hz = workflowHazards(data, wf);
  const asked = state.view?.hazardId === 'summary' ? null : state.view?.hazardId ?? wf.at?.hazardId ?? '@details';
  const current = asked && (asked.startsWith('@') || hz.some((x) => x.hazard.id === asked)) ? asked : asked ? '@details' : null;
  const x = current && !current.startsWith('@') ? hz.find((y) => y.hazard.id === current) : null;
  const main = current === '@details' ? detailsStep(state, data, wf, p)
    : current === '@groups' ? groupsStep(data, wf, p)
      : current === '@hazards' ? hazardsStep(data, wf, p)
        : x ? hazardCards(state, data, wf, x, prog, mine)
          : summary(state, data, wf, prog, mine);
  return html`<div class="wf-layout">${rail(data, wf, prog, current)}<div class="wf-main">${main}</div></div>`;
}

/**
 * An ended onboarding's grid: each hazard it covered against its facets and implemented controls.
 * @param {Data} data @param {any} wf
 */
export function onboardingGrid(data, wf) {
  const hz = workflowHazards(data, wf);
  if (!hz.length) return html`<p class="muted">No hazards.</p>`;
  const prog = onboardingProgress(data, { ...wf, state: 'open' });
  const cell = (/** @type {boolean | undefined} */ ok) => html`<td class="${ok ? 'yes' : 'no'}">${ok ? '✓' : ''}</td>`;
  return html`<div class="wf-grid-wrap"><table class="wf-grid"><thead><tr><th scope="col">Hazard</th><th scope="col">Facets</th><th scope="col">Implemented controls</th></tr></thead>
    <tbody>${hz.map((x) => { const h = prog.perHazard.get(x.hazard.id); return html`<tr><th scope="row">${idTag(x.reportId)} ${x.hazard.title}</th>${cell(h && FACET_KINDS.every((f) => h.facets[f]))}${cell(h?.implemented)}</tr>`; })}</tbody></table></div>`;
}
```

Also create the stub for the next task, so this task builds:

```js
// src/ui/screens/onboarding-cards.js
import { html } from '../html.js';
import { idTag } from './common.js';

/** A hazard's onboarding cards (filled in by the next task). @param {any} _state @param {any} _data @param {any} _wf @param {{ hazard: any, reportId: string }} x @param {any} _prog @param {boolean} _mine */
export function hazardCards(_state, _data, _wf, x, _prog, _mine) {
  return html`<div class="wf-hazard-h"><h2>${idTag(x.reportId)} ${x.hazard.title}</h2></div>`;
}
```

Notes:
- The image upload uses the existing `data-image-for` file input that `mount.js` handles (see `platformMenu` in `platforms.js`). Read it and copy its exact markup if it differs (for example, if `mount.js` looks for a specific class).
- `onboardingGrid` uses `{ ...wf, state: 'open' }` so progress is worked out over the covered hazards: `workflowHazards` with an ended wf returns `covered`, and `onboardingProgress` calls `workflowHazards`. Check this. If `onboardingProgress` for an ended workflow already reads `covered`, pass `wf` as it is.

- [ ] **Step 4: Run the tests.**

Run: `node --test test/ui/screens-onboarding.test.js test/ui/controller-onboarding.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/screens/onboarding.js src/ui/screens/onboarding-cards.js src/ui/screens/workflow.js src/ui/controller.js test/ui/screens-onboarding.test.js test/ui/controller-onboarding.test.js
git commit -m "Onboarding page: rail of platform steps and hazards, details with description, owner and image, groups, hazards suggested from groups, summary of what is still needed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The hazard cards

**Files:**
- Modify: `src/ui/screens/onboarding-cards.js`, `src/ui/controller.js` (handler `addSuggestedControls`)
- Test: `test/ui/screens-onboarding.test.js` (add tests), `test/ui/controller-onboarding.test.js` (add a test)

**Interfaces:**
- Consumes:
  - `numberedCard` / `platformListCard` with `grouped` (Task 5)
  - `controlsSection(..., only)` (Task 5)
  - `riskPanels(…, part)`, `sfarpArea` (part 1)
  - `groupSuggestions`, `stepOf`, `FACET_KINDS`
- Produces: `hazardCards(state, data, wf, x, prog, mine)`; handler `addSuggestedControls({ hazardId, platformId, controlId })`, where `controlId` is a string or list.

- [ ] **Step 1: Write the failing tests** (append to `test/ui/screens-onboarding.test.js`, and add imports for `linkHazard`, `createFacetOption`, `setOptionGroup`, `setControlStatus`):

```js
test('a hazard’s cards: facets with group suggestions and None applies, implemented controls with what is missing, the optional cards', () => {
  let d = linkHazard(onboardingData(), act, { hazardId: 'h1', platformId: 'p9' });
  d = createFacetOption(d, act, { id: 'fL', facet: 'failureMode', name: 'Beam misaligned' });
  d = setOptionGroup(d, act, { facet: 'failureMode', optionId: 'fL', groupId: 'g1', on: true });
  d = setOptionGroup(d, act, { facet: 'control', optionId: 'c1', groupId: 'g1', on: true });
  const s = { ...on({ hazardId: 'h1' }), editing: { kind: 'newFailureMode', id: 'h1:p9' } };
  const out = workflowView(s, d, 'w9').toString();
  assert.match(out, /1 Facets[\s\S]*Needed/);
  assert.match(out, /Suggested from your groups[\s\S]*Beam misaligned[\s\S]*Lasers/);
  assert.match(out, /name="checked"[^>]*data-check="none:failureMode"|data-check="none:failureMode"[^>]*name="checked"/);
  assert.match(out, /2 Implemented controls[\s\S]*Suggested from your groups[\s\S]*value="c1"[\s\S]*Sprinklers/);
  assert.match(out, /data-action="addSuggestedControls"/);
  assert.match(out, /data-check="none:controls"/);
  for (const card of ['3 Other controls', '4 Risk ratings', '5 Risk justifications', '6 SFARP']) assert.match(out, new RegExp(card));
  assert.match(out, /Consequences/);
});

test('an implemented control shows its missing properties; None applies is disabled while a facet has entries', () => {
  let d = linkHazard(onboardingData(), act, { hazardId: 'h1', platformId: 'p9' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p9', status: 'implemented' });
  const out = workflowView(on({ hazardId: 'h1' }), d, 'w9').toString();
  assert.match(out, /class="wf-missing"[^>]*>Missing: tier, origin, description, implemented by/);
  assert.match(out, /data-check="none:causalFactor"[^>]*disabled|disabled[^>]*data-check="none:causalFactor"/, 'h1 has a causal factor');
});
```

Append to `test/ui/controller-onboarding.test.js`:

```js
test('ticked suggested controls are added to the hazard here and set Implemented', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const ada = c.getState().profiles[0].id;
  await c.dispatch({ type: 'selectProfile', id: ada });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createControl', id: 'c1', title: 'Sprinklers' });
  await c.dispatch({ type: 'onboardPlatform', name: 'Gamma', ownerId: ada });
  const w = c.getState().session.working;
  const pid = w.records.workflow[c.getState().view.id].platformId;
  await c.dispatch({ type: 'linkHazards', hazardId: 'h1', platformId: pid });
  await c.dispatch({ type: 'addSuggestedControls', hazardId: 'h1', platformId: pid, controlId: ['c1'] });
  const after = c.getState().session.working;
  assert.equal(after.records.ruling[`ru:h1:c1:${pid}`].state, 'implemented');
});
```

- [ ] **Step 2: Run them and check they fail.**

Run: `node --test test/ui/screens-onboarding.test.js test/ui/controller-onboarding.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.**

Controller handler:

```js
    /** From onboarding: add the ticked controls to the hazard here, each at its usual kind, and mark them Implemented. */
    async addSuggestedControls({ hazardId, platformId, controlId }) {
      for (const id of list(controlId)) {
        const kind = state.session?.working.records.control[id]?.kind || 'preventative';
        await applyEdit('addControlHere', { hazardId, platformId, controlId: id, kind });
        await applyEdit('setControlStatus', { hazardId, controlId: id, platformId, status: 'implemented' });
      }
    },
```

`src/ui/screens/onboarding-cards.js`:

```js
import { html, raw } from '../html.js';
import { dataAttrs, idTag, option, go } from './common.js';
import { numberedCard, platformListCard } from './dashboard.js';
import { controlsSection, riskPanels, sfarpArea } from './ssra.js';
import { implementedBySelect } from './platforms.js';
import { get } from '../../core/data.js';
import { causalFactorsOn, platformListOn, platformListEntries, controlsOnPlatform, implementedByOf, hazardDetail } from '../../core/queries.js';
import { groupSuggestions, stepOf, workflowHazards, FACET_KINDS } from '../../core/workflows.js';
import { CONTROL_TIERS } from '../../core/ops/controls.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** A card's state beside its title: met, needed, or (optional) filled or empty. @param {boolean} required @param {boolean} ok */
const badge = (required, ok) => html`<span class="tag wf-badge ${ok ? 'met' : required ? 'needed' : 'empty'}">${ok ? (required ? '✓' : 'Filled') : required ? 'Needed' : 'Empty'}</span>`;

/** @param {number} n @param {string} title @param {any} b @param {any} body */
const card = (n, title, b, body) => html`<section class="wf-check" aria-label="${title}"><h3 class="wf-check-h"><span class="wf-n">${n}</span> ${title} ${b}</h3><div class="wf-check-body">${body}</div></section>`;

/** A None applies (or No controls implemented) tick, kept off while there are entries. @param {Data} data @param {any} wf @param {string} hazardId @param {string} check @param {string} label @param {boolean} blocked */
function noneTick(data, wf, hazardId, check, label, blocked) {
  const s = stepOf(data, wf.id, hazardId, check);
  return html`<label class="wf-tick wf-none"><input type="checkbox" name="checked"${s?.checked && !blocked ? raw(' checked') : ''}${blocked ? raw(' disabled') : ''} ${dataAttrs({ change: 'setStep', 'workflow-id': wf.id, 'hazard-id': hazardId, check })}> ${label}</label>`;
}

/** @param {{ text: string, from: string }[]} xs */
const grouped = (xs) => xs.map((s) => ({ text: s.text, from: s.from }));

/** @param {any} state @param {Data} data @param {any} wf @param {any} h @param {string} pid */
function facetsCard(state, data, wf, h, pid) {
  const lists = FACET_KINDS.filter((f) => f !== 'causalFactor').map((kind) => {
    const items = platformListOn(data, /** @type {any} */ (kind), h.id, pid);
    return html`<div class="wf-facet">${platformListCard(state, { kind: /** @type {any} */ (kind), items, hazardId: h.id, platformId: pid, entries: platformListEntries(data, /** @type {any} */ (kind)), grouped: grouped(groupSuggestions(data, { kind, platformId: pid, hazardId: h.id })) })}
      ${noneTick(data, wf, h.id, `none:${kind}`, 'None applies', items.length > 0)}</div>`;
  });
  const cfs = causalFactorsOn(data, h.id, pid);
  const cause = html`<div class="wf-facet">${numberedCard(state, { name: 'CausalFactor', items: cfs, hazardId: h.id, platformId: pid, grouped: grouped(groupSuggestions(data, { kind: 'causalFactor', platformId: pid, hazardId: h.id })) })}
    ${noneTick(data, wf, h.id, 'none:causalFactor', 'None applies', cfs.length > 0)}</div>`;
  const d = hazardDetail(data, h.id);
  return html`<div class="dash-grid hazard-lists">${lists}${cause}</div>
    <p class="muted wf-shared">Shared by all of this hazard’s platforms — Consequences: ${d?.consequences.map((/** @type {any} */ c) => c.text).join('; ') || 'none'}.</p>`;
}

/** @param {Data} data @param {any} c a control @param {string} pid */
function missing(data, c, pid) {
  return [c.tier ? '' : 'tier', String(c.origin ?? '').trim() ? '' : 'origin', String(c.description ?? '').trim() ? '' : 'description', implementedByOf(data, c.id, pid) ? '' : 'implemented by'].filter(Boolean);
}

/** @param {any} state @param {Data} data @param {any} wf @param {any} h @param {any} p */
function implementedCard(state, data, wf, h, p) {
  const rows = controlsOnPlatform(data, h.id, p.id).filter((c) => c.state === 'implemented');
  const sugg = groupSuggestions(data, { kind: 'control', platformId: p.id, hazardId: h.id });
  const at = (/** @type {any} */ c) => ({ change: 'updateControl', id: c.control.id });
  return html`${sugg.length ? html`<form data-action="addSuggestedControls" ${dataAttrs({ 'hazard-id': h.id, 'platform-id': p.id })} class="suggest wf-suggest"><p class="suggest-h">Suggested from your groups</p>
      <ul class="suggest-list">${sugg.map((s) => html`<li><label class="suggest-item"><input type="checkbox" name="controlId" value="${s.id}"><span class="suggest-text">${s.text}</span><span class="suggest-from">${s.from}</span></label></li>`)}</ul>
      <button type="submit" class="small">Add as implemented</button></form>` : ''}
    ${rows.length ? html`<table class="wf-controls"><thead><tr><th>Control</th><th>Tier</th><th>Origin</th><th>Description</th><th>Implemented by</th></tr></thead><tbody>
      ${rows.map((c) => { const m = missing(data, c.control, p.id); return html`<tr>
        <td>${go(c.control.title, 'control', { id: c.control.id })}${m.length ? html`<div class="wf-missing">Missing: ${m.join(', ')}</div>` : ''}</td>
        <td><select name="tier" aria-label="Tier of ${c.control.title}" ${dataAttrs(at(c))}>${option('', 'Not set', c.control.tier ?? '')}${CONTROL_TIERS.map((t) => option(t, t, c.control.tier ?? ''))}</select></td>
        <td><input name="origin" value="${c.control.origin ?? ''}" placeholder="Origin…" aria-label="Origin of ${c.control.title}" ${dataAttrs(at(c))}></td>
        <td><textarea class="cell-area" name="description" rows="2" placeholder="Description…" aria-label="Description of ${c.control.title}" ${dataAttrs(at(c))}>${c.control.description ?? ''}</textarea></td>
        <td>${implementedBySelect(data, c.control, p.id, p.name)}</td></tr>`; })}</tbody></table>`
      : html`<p class="muted">No controls set Implemented here yet. Add them from the suggestions, or set one Implemented under Other controls.</p>`}
    ${noneTick(data, wf, h.id, 'none:controls', 'No controls implemented', rows.length > 0)}`;
}

/**
 * A hazard's onboarding cards: facets and implemented controls (required), then other controls,
 * risk ratings, their justifications and SFARP (optional), each with how it stands.
 * @param {any} state @param {Data} data @param {any} wf @param {{ hazard: any, reportId: string }} x @param {any} prog @param {boolean} mine
 */
export function hazardCards(state, data, wf, x, prog, mine) {
  const h = x.hazard;
  const p = get(data, 'platform', wf.platformId);
  const st = prog.perHazard.get(h.id);
  const facetsMet = FACET_KINDS.every((f) => st.facets[f]);
  const hz = workflowHazards(data, wf);
  const i = hz.findIndex((y) => y.hazard.id === h.id);
  const nav = (/** @type {string} */ label, /** @type {string} */ pos) => html`<button type="button" ${dataAttrs({ action: 'showWorkflowHazard', 'workflow-id': wf.id, 'hazard-id': pos })}>${label}</button>`;
  return html`<div class="wf-hazard-h"><h2>${idTag(x.reportId)} ${go(h.title, 'hazard', { id: h.id })}</h2><span class="muted">${st.required}/2 required</span></div>
    ${card(1, 'Facets', badge(true, facetsMet), facetsCard(state, data, wf, h, p.id))}
    ${card(2, 'Implemented controls', badge(true, st.implemented), implementedCard(state, data, wf, h, p))}
    ${card(3, 'Other controls', badge(false, st.optional.otherControls), controlsSection(state, data, h, p.id, p.name, (c) => c.state !== 'implemented'))}
    ${card(4, 'Risk ratings', badge(false, st.optional.ratings), html`<h4>Initial</h4>${riskPanels(state, data, h, p.id, 'initial', 'ratings')}<h4>Residual</h4>${riskPanels(state, data, h, p.id, 'residual', 'ratings')}`)}
    ${card(5, 'Risk justifications', badge(false, st.optional.justifications), html`<h4>Initial</h4>${riskPanels(state, data, h, p.id, 'initial', 'justifications')}<h4>Residual</h4>${riskPanels(state, data, h, p.id, 'residual', 'justifications')}`)}
    ${card(6, 'SFARP', badge(false, st.optional.sfarp), sfarpArea(data, h, p.id))}
    <div class="actions wf-nav">${i > 0 ? nav('← Previous hazard', hz[i - 1].hazard.id) : nav('← Hazards', '@hazards')}${i < hz.length - 1 ? nav('Next hazard →', hz[i + 1].hazard.id) : nav('Summary & complete →', '')}</div>`;
}
```

Notes:
- `mine` isn't used to disable the cards: the editors are ordinary platform edits, which the spec allows anyone to make. The none ticks are still refused for non-owners by `setStep`. Remove the unused param or prefix it `_mine`.
- `hazardDetail(...).consequences` gives `{ text }[]`. Check this and adapt if needed. Phases can be added the same way if `hazardDetail` exposes them.

- [ ] **Step 4: Run the tests.**

Run: `node --test test/ui/screens-onboarding.test.js test/ui/controller-onboarding.test.js && npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/screens/onboarding-cards.js src/ui/controller.js test/ui/screens-onboarding.test.js test/ui/controller-onboarding.test.js
git commit -m "Onboarding hazard cards: facets with group suggestions and None applies, implemented controls with their missing properties and suggestions added as Implemented, then other controls, ratings, justifications and SFARP

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: New platform, the dashboard card, Onboarding tags, Onboard again, review start

**Files:**
- Modify: `src/ui/screens/platforms.js` (`platformsView` New platform form, the list's name cell, `platformView` head), `src/ui/screens/workflows.js` (Platform Onboarding card), `src/ui/screens/home.js` (platform card tag), `src/ui/screens/reviews.js` (`reviewLine` start), `src/ui/controller.js` (handler `onboardAgain`)
- Test: `test/ui/screens-onboarding-elsewhere.test.js` (new)

- [ ] **Step 1: Write the failing test.**

```js
// test/ui/screens-onboarding-elsewhere.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformsView, platformView } from '../../src/ui/screens/platforms.js';
import { workflowsView } from '../../src/ui/screens/workflows.js';
import { homeView } from '../../src/ui/screens/home.js';
import { platformReviewView } from '../../src/ui/screens/reviews.js';
import { cancelWorkflow } from '../../src/core/ops/workflows.js';
import { onboardingData } from './screens-onboarding.test.js';
import { state } from './screens-workflows.test.js';
import { act } from '../helpers.js';

test('New platform onboards; the dashboard card starts one too', () => {
  const list = platformsView({ ...state, editing: { kind: 'newPlatform', id: 'new' } }, onboardingData()).toString();
  assert.match(list, /data-action="onboardPlatform"/);
  const dash = workflowsView({ ...state, view: { name: 'workflows' } }, onboardingData()).toString();
  assert.match(dash, /Platform Onboarding[\s\S]*?data-action="onboardPlatform"/);
  assert.doesNotMatch(dash, /Platform Onboarding<\/h3>[^<]*<span class="tag">Coming soon/);
});

test('an Onboarding platform is tagged in the list, on its page and on Home, and its review start says finish onboarding first', () => {
  const d = onboardingData();
  assert.match(platformsView(state, d).toString(), /Gamma[\s\S]*?Onboarding/);
  assert.match(platformView({ ...state, view: { name: 'platform', id: 'p9' } }, d, 'p9').toString(), /class="tag onboarding-tag"[^>]*>Onboarding · WF-001/);
  assert.match(homeView({ ...state, homeOwner: 'everyone' }, d).toString(), /Gamma[\s\S]*?onboarding-tag/);
  assert.match(platformReviewView({ ...state, view: { name: 'platformReview', id: 'p9' } }, d, 'p9').toString(), /Finish onboarding first/);
});

test('a cancelled onboarding offers Onboard again on the platform page', () => {
  const d = cancelWorkflow(onboardingData(), act, { workflowId: 'w9' });
  const out = platformView({ ...state, view: { name: 'platform', id: 'p9' } }, d, 'p9').toString();
  assert.match(out, /data-action="onboardAgain"[^>]*data-platform-id="p9"|data-platform-id="p9"[^>]*data-action="onboardAgain"/);
  assert.doesNotMatch(platformView({ ...state, view: { name: 'platform', id: 'p9' } }, onboardingData(), 'p9').toString(), /onboardAgain/, 'not while one is open');
});
```

- [ ] **Step 2: Run it and check it fails.**

Run: `node --test test/ui/screens-onboarding-elsewhere.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.**

A shared tag goes in `src/ui/screens/common.js`. Import `onboardingOf` from `../../core/workflows.js`; check there's no import cycle problem (`workflows.js` imports only core).

```js
/** "Onboarding · WF-n" for a platform still being onboarded, linking to the onboarding; nothing otherwise. @param {any} data @param {string} platformId */
export function onboardingTag(data, platformId) {
  const wf = onboardingOf(data, platformId);
  if (!wf) return '';
  const label = workflowLabel(wf) === UNNUMBERED ? 'Onboarding' : `Onboarding · ${workflowLabel(wf)}`;
  return html` <button type="button" class="tag onboarding-tag" title="Still being onboarded" ${dataAttrs({ action: 'go', view: 'workflow', id: wf.id })}>${label}</button>`;
}
```

- **`platforms.js`:**
  - In `platformsView`, use `newRecord(state, 'newPlatform', 'onboardPlatform', 'name', 'New platform name', owner)`.
  - Render the name column as `html`${go(p.name, 'platform', { id: p.id })}${onboardingTag(data, p.id)}``.
  - In `platformView`'s head, after `statusTag(p.status)`, add `${onboardingTag(data, id)}${onboardAgain(data, p)}`, with:

```js
/** Onboard again, for a platform whose onboarding was cancelled. @param {Data} data @param {any} p */
function onboardAgain(data, p) {
  const wf = onboardingOf(data, p.id);
  return wf && wf.state === 'cancelled' && p.status === 'live'
    ? html`<button type="button" class="small" ${dataAttrs({ action: 'onboardAgain', 'platform-id': p.id })}>Onboard again</button>` : '';
}
```

- **`workflows.js`:** in `startCards`, for `t.type === 'platformOnboarding'` render:

```js
html`<form class="wf-start" data-action="onboardPlatform"><input name="name" required placeholder="New platform name" aria-label="New platform name"><select name="ownerId" aria-label="Owner">${state.profiles.map((/** @type {any} */ p) => option(p.id, p.name, state.profileId))}</select><button type="submit" class="primary small">Start</button></form>`
```

- **`home.js`:** in the platform card's `pcard-h`, after the name, add `${onboardingTag(data, c.platform.id)}`. It's a `<button>` inside the card's `<button>`, which isn't valid HTML. Use a `<span class="tag onboarding-tag">` instead there: add a `{ link: false }` option to `onboardingTag` that renders a span.
- **`reviews.js`:** in `reviewLine`, before the `inProgress` check:

```js
  const onboard = onboardingOf(data, p.id);
  // … const start = onboard ? html`<span class="muted">Finish onboarding first</span> ${go('Open onboarding →', 'workflow', { id: onboard.id })}` : inProgress ? …
```

- **Controller:**

```js
    // A platform whose onboarding was cancelled, onboarded again.
    async onboardAgain({ platformId }) {
      const id = newId();
      await applyEdit('startWorkflow', { id, type: 'platformOnboarding', platformId });
      await handlers.go({ view: 'workflow', id });
    },
```

- [ ] **Step 4: Run the tests.**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS. If an existing test asserts `data-action="createPlatform"` in the New platform form, update it to `onboardPlatform`.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/screens/common.js src/ui/screens/platforms.js src/ui/screens/workflows.js src/ui/screens/home.js src/ui/screens/reviews.js src/ui/controller.js test/ui/screens-onboarding-elsewhere.test.js
git commit -m "New platform onboards it; Platform Onboarding starts from the dashboard; Onboarding platforms are tagged, offer Onboard again once cancelled, and wait for onboarding before a review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Add any updated existing test files.)

---

### Task 9: Styles, and the app checked in the browser

**Files:**
- Modify: `src/ui/styles.css`

- [ ] **Step 1: Add the styles** (sharp corners; use the `--p-*` tokens):

```css
/* Onboarding */
.wf-badge.met { background: var(--p-info-bg); color: var(--p-info-fg); }
.wf-badge.needed { background: var(--p-warn-bg); color: var(--p-warn-fg); }
.wf-badge.empty { background: var(--p-surface-2); color: var(--p-muted); }
.wf-facet { display: flex; flex-direction: column; gap: 6px; }
.wf-none { color: var(--p-muted); font-size: .9em; }
.wf-suggest { margin: 0 0 12px; padding: 8px 10px; border: 1px dashed var(--p-line); }
.wf-controls { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
.wf-controls th, .wf-controls td { border: 1px solid var(--p-line); padding: 4px 6px; vertical-align: top; text-align: left; }
.wf-controls textarea, .wf-controls input, .wf-controls select { width: 100%; }
.wf-missing { color: var(--p-warn-fg); font-size: .85em; margin-top: 4px; }
.wf-unmet li { margin: 4px 0; }
.wf-shared { margin-top: 8px; }
.onboarding-tag { background: var(--p-warn-bg); color: var(--p-warn-fg); border: 0; font: inherit; font-size: .8em; cursor: pointer; }
.wf-image { max-width: 220px; display: block; margin: 6px 0; }
```

- [ ] **Step 2: Build and run the full suite.**

Run: `npm run build && npm test && npm run typecheck`
Expected: PASS (including `corners.test.js`).

- [ ] **Step 3: Check it in the browser.** Serve `dist/` on localhost. Point `showDirectoryPicker` at an OPFS directory seeded with sealed data built from `test/helpers.js` `seed()`, plus a group with hazards, facet options and controls assigned. Confirm:
  1. Platforms → New platform opens the onboarding on Details; the platform shows the Onboarding tag in the list.
  2. Description, owner and image save. Groups + tags a group. Hazards suggests from it, and Add ticked hazards links them.
  3. On a hazard: facet suggestions appear under "Suggested from your groups"; None applies disables once an entry exists. Add as implemented sets a control Implemented, and the missing properties clear as you fill them.
  4. Summary lists what's still needed with links; Complete enables once it's all met, and completing removes the Onboarding tag.
  5. Cancel (two clicks), then the platform page offers Onboard again.
  6. Reviews: Start review for an Onboarding platform reads "Finish onboarding first".

  Delete any served seed files and Playwright output afterwards.

- [ ] **Step 4: Commit.**

```bash
git add src/ui/styles.css
git commit -m "Onboarding styles: card badges, suggestion blocks, the implemented controls table, missing properties, the Onboarding tag

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
