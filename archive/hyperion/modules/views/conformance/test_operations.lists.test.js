/**
 * views conformance: the filter, the dashboard, and the open items (CORE-CON-002). The happy
 * path of C-045 to C-048 of modules/views/CONTRACT.md (SL-11). These three clauses are this
 * module's rules of composition (DEC-037), so the suite states each rule once below, as the
 * clause's own table words it, over what `registry`, `rating`, `review-schedule`,
 * `reference-register`, `workflows`, and `change-log` give for the body, and compares every screen
 * with it. Written from the contract before any implementation (P8).
 *
 * The one operation no screen offers that this file calls is `registry.deleteHazard`, on a body
 * the suite then saves to the folder (section 5).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as views from '../contract.js';
import * as registry from '../../registry/contract.js';
import * as rating from '../../rating/contract.js';
import * as changeLog from '../../change-log/contract.js';
import * as reviewSchedule from '../../review-schedule/contract.js';
import * as referenceRegister from '../../reference-register/contract.js';
import * as workflows from '../../workflows/contract.js';
import {
  actOf, addControls, addHazards, addPlatforms, buildWorld, clockOn, day, everywhere, expectScreen, filesOf, heldBody, inBrowser,
  linkHazards, listedProfiles, loaded, noMessages, plain, platformName, reviewsOf, saveBody, selectedApp, step, toAssessment,
  toHazard, toHazards,
} from './harness.js';

const NO_FILTER = Object.freeze({ platformId: null, band: null, recordStatus: null, controlState: null, referenceEntryId: null });

/**
 * @param {any} a
 * @param {any} b
 */
const sameRef = (a, b) => a.kind === b.kind && a.id === b.id;

// ------------------------------------------------------------------ the rules, as C-045 to C-048 word them

/**
 * C-045's unfiltered lists and messages for a body.
 * @param {any} body
 */
async function unfiltered(body) {
  const hazards = plain(await registry.listAllHazards(body));
  const controls = plain(await registry.listAllControls(body));
  const platforms = plain(await registry.listAllPlatforms(body));
  /** @type {any[]} */
  const queries = [];
  const messages = [];
  for (const p of platforms) {
    const q = plain(await registry.listPlatformHazards(body, p.id));
    const rows = [];
    for (const row of q.rows) rows.push({ ...row, band: plain(await rating.ratingFor(row.residual.consequence, row.residual.likelihood)) });
    queries.push({ platform: q.platform, rows, omitted: q.omitted });
    for (const o of q.omitted) messages.push({ severity: 'error', names: [o.id, o.key, p.name] });
  }
  const hazardItems = [];
  for (const h of hazards) {
    let any = false;
    for (const q of queries) {
      const row = q.rows.find((/** @type {any} */ r) => r.hazard.id === h.id);
      const omitted = q.omitted.find((/** @type {any} */ o) => o.id === h.id);
      if (row) { hazardItems.push({ hazard: h, platform: q.platform, omitted: null, residualRating: row.band }); any = true; }
      else if (omitted) { hazardItems.push({ hazard: h, platform: q.platform, omitted, residualRating: null }); any = true; }
    }
    if (!any) hazardItems.push({ hazard: h, platform: null, omitted: null, residualRating: null });
  }
  const controlItems = [];
  for (const c of controls) {
    let any = false;
    for (const h of hazards) {
      for (const q of queries) {
        const row = q.rows.find((/** @type {any} */ r) => r.hazard.id === h.id);
        const pc = row?.controls.find((/** @type {any} */ x) => x.control.id === c.id);
        if (pc) { controlItems.push({ control: pc.control, hazard: row.hazard, platform: q.platform, platformControl: pc, residualRating: row.band }); any = true; }
      }
    }
    if (!any) controlItems.push({ control: c, hazard: null, platform: null, platformControl: null, residualRating: null });
  }
  return { hazards: hazardItems, controls: controlItems, platforms, entries: plain(await referenceRegister.listEntries(body)), messages };
}

/**
 * C-045's table: whether an item satisfies every active filter.
 * @param {'hazard' | 'control'} kind
 * @param {any} item
 * @param {any} filter
 * @param {any[]} entries
 */
function satisfies(kind, item, filter, entries) {
  if (filter.platformId !== null && item.platform?.id !== filter.platformId) return false;
  if (filter.band !== null && item.residualRating?.band !== filter.band) return false;
  if (filter.recordStatus !== null && item[kind].status !== filter.recordStatus) return false;
  if (filter.controlState !== null && (kind === 'hazard' || item.platformControl?.state !== filter.controlState)) return false;
  if (filter.referenceEntryId !== null) {
    const entry = entries.find((e) => e.id === filter.referenceEntryId);
    if (!entry || !entry.links.some((/** @type {any} */ r) => sameRef(r, { kind, id: item[kind].id }))) return false;
  }
  return true;
}

/**
 * A platform's review set (section 3).
 * @param {any} q the platform's query
 * @param {any[]} entries every live reference entry
 */
function reviewSet(q, entries) {
  const refs = [{ kind: 'platform', id: q.platform.id }];
  for (const r of q.rows) refs.push({ kind: 'hazard', id: r.hazard.id });
  for (const o of q.omitted) refs.push({ kind: 'hazard', id: o.id });
  for (const r of q.rows) for (const c of r.controls) refs.push({ kind: 'control', id: c.control.id });
  for (const e of entries) if (e.links.some((/** @type {any} */ l) => refs.some((x) => sameRef(x, l)))) refs.push({ kind: 'reference-entry', id: e.id });
  return refs;
}

/**
 * C-046's `PlatformItems` for one platform of a body.
 * @param {any} body
 * @param {any} platform
 */
async function platformItems(body, platform) {
  const q = plain(await registry.listPlatformHazards(body, platform.id));
  const entries = plain(await referenceRegister.listEntries(body));
  const overdue = plain(await reviewSchedule.listOverdue(body));
  const set = reviewSet(q, entries);
  return {
    platform: q.platform,
    overdue: overdue.filter((/** @type {any} */ s) => set.some((r) => sameRef(r, s.ref))),
    unconfirmed: q.rows.flatMap((/** @type {any} */ r) => r.controls.filter((/** @type {any} */ c) => c.state === 'awaiting').map((/** @type {any} */ c) => ({ hazard: r.hazard, control: c }))),
    omitted: q.omitted,
    workflows: plain(await workflows.listWorkflows(body)).filter((/** @type {any} */ wf) => wf.state === 'in-progress' && wf.subject?.kind === 'platform' && wf.subject.id === platform.id),
    awaiting: plain(await changeLog.listAwaiting(body, platform.id)),
  };
}

/**
 * C-048's `unlinked` for a body.
 * @param {any} body
 */
async function unlinkedOf(body) {
  const entries = plain(await referenceRegister.listEntries(body));
  const inProgress = plain(await workflows.listWorkflows(body)).filter((/** @type {any} */ wf) => wf.state === 'in-progress');
  const byOthers = (/** @type {any} */ ref) => entries.some((e) => e.links.some((/** @type {any} */ l) => sameRef(l, ref))) || inProgress.some((/** @type {any} */ wf) => wf.subject && sameRef(wf.subject, ref));
  const out = [];
  for (const h of plain(await registry.listHazards(body))) {
    const ref = { kind: 'hazard', id: h.id };
    const links = plain(await registry.listLinks(body, /** @type {any} */ (ref)));
    const detail = plain(await registry.getHazardDetail(body, h.id));
    const linked = links.some((/** @type {any} */ l) => l.linkKind === 'hazard-control' || l.linkKind === 'hazard-platform') || detail.causalFactors.length > 0 || detail.consequences.length > 0 || byOthers(ref);
    if (!linked) out.push({ ref, name: h.title });
  }
  for (const c of plain(await registry.listControls(body))) {
    const ref = { kind: 'control', id: c.id };
    const linked = plain(await registry.listLinks(body, /** @type {any} */ (ref))).some((/** @type {any} */ l) => l.linkKind === 'hazard-control') || byOthers(ref);
    if (!linked) out.push({ ref, name: c.title });
  }
  for (const p of plain(await registry.listPlatforms(body))) {
    const ref = { kind: 'platform', id: p.id };
    const linked = plain(await registry.listLinks(body, /** @type {any} */ (ref))).some((/** @type {any} */ l) => l.linkKind === 'hazard-platform') || byOthers(ref);
    if (!linked) out.push({ ref, name: p.name });
  }
  for (const e of entries) {
    const ref = { kind: 'reference-entry', id: e.id };
    if (e.links.length === 0 && !byOthers(ref)) out.push({ ref, name: e.name });
  }
  return out;
}

/**
 * Assert a screen's messages are exactly one error per omitted hazard, in order, naming its id,
 * the omitting record's key, and the platform's name.
 * @param {any} screen
 * @param {any[]} expected
 */
function omittedMessages(screen, expected) {
  assert.equal(screen.messages.length, expected.length, 'one message per omitted hazard');
  expected.forEach((e, i) => {
    assert.equal(screen.messages[i].severity, 'error');
    for (const thing of e.names) assert.ok(screen.messages[i].items.some((/** @type {string} */ it) => it.includes(thing)), `message ${i} names ${thing}`);
  });
}

/**
 * The world, plus what the filter needs: a deleted hazard once linked to bravo, a retired control,
 * an entry linked to a hazard and a control, and ratings in two bands. Saved; a fresh app on the
 * hazards screen.
 * @param {any} env
 */
async function filterWorld(env) {
  const w = await buildWorld(env);
  const [doomed] = await addHazards(w.app, ['Doomed hazard']);
  await linkHazards(w.app, w.platforms.bravo, [doomed]);
  await toAssessment(w.app, w.platforms.alpha, w.hazards.bird);
  await step(w.app, views.enterRating(w.app, 'residual', /** @type {any} */ ({ consequence: 5, likelihood: 'A' })), 'assessment');
  await toHazards(w.app);
  await step(w.app, views.openControls(w.app), 'controls');
  await step(w.app, views.retireControl(w.app, /** @type {any} */ (w.controls.drill)), 'confirm-edit');
  await step(w.app, views.confirmEdit(w.app), 'controls');
  await toHazards(w.app);
  await step(w.app, views.openReferences(w.app), 'references');
  const created = await step(w.app, views.createReference(w.app, /** @type {any} */ ({ name: 'Bird notes', link: null, path: null, file: null })), 'references');
  const entryId = created.entries[0].id;
  await step(w.app, views.openReference(w.app, entryId), 'reference');
  await step(w.app, views.linkReference(w.app, /** @type {any} */ ({ kind: 'hazard', id: w.hazards.bird })), 'reference');
  await step(w.app, views.linkReference(w.app, /** @type {any} */ ({ kind: 'control', id: w.controls.radar })), 'reference');
  await toHazards(w.app);
  await step(w.app, views.save(w.app), 'hazards');
  const { body } = await loaded(w.folder);
  const deleted = (await registry.deleteHazard(body, actOf(w.alice), /** @type {any} */ (doomed))).body;
  await saveBody(w.folder, w.alice, deleted);
  const app = await selectedApp(w.folder, 'Alice');
  return { ...w, app, doomed, entryId };
}

// ------------------------------------------------------------------ C-045 the filter

test('openFilter shows every hazard and control whatever its status, each against every platform whose one query shows it or against none, with no filter active, the platforms and entries to choose from, and the file and review standing (C-045; SL-11 criterion 1)', () => inBrowser(async (env) => {
  const w = await filterWorld(env);
  const before = everywhere(w.folder, env);
  const screen = expectScreen(w.app, await views.openFilter(w.app), 'filter');
  // the fresh app has made no change, so it holds what it loaded; the mirror still holds the first app's save (store C-015, C-016)
  const { body } = await loaded(w.folder);
  const expected = await unfiltered(body);
  assert.deepEqual(screen.filter, NO_FILTER);
  assert.deepEqual(screen.hazards, expected.hazards);
  assert.deepEqual(screen.controls, expected.controls);
  assert.deepEqual(screen.platforms, expected.platforms);
  assert.deepEqual(screen.entries, expected.entries);
  assert.deepEqual(screen.files, await filesOf(body, w.folder));
  assert.deepEqual(screen.reviews, await reviewsOf(body));
  omittedMessages(screen, expected.messages);
  assert.deepEqual(everywhere(w.folder, env), before, 'nothing written');

  const doomed = screen.hazards.filter((/** @type {any} */ i) => i.hazard.id === w.doomed);
  assert.deepEqual(doomed.map((/** @type {any} */ i) => [i.hazard.status, i.platform]), [['deleted', null]], 'a deleted hazard is listed once, against no platform, whatever links it has');
  const fire = screen.hazards.filter((/** @type {any} */ i) => i.hazard.id === w.hazards.fire);
  assert.equal(fire.length, 2, 'a hazard on two platforms is listed once per platform');
  const drill = screen.controls.filter((/** @type {any} */ i) => i.control.id === w.controls.drill);
  assert.ok(drill.length >= 1 && drill.every((/** @type {any} */ i) => i.platform !== null), 'a retired control is listed against the rows it is on');
  assert.equal(drill[0].control.status, 'retired');
}));

test('applyFilter with each filter alone and in combination shows exactly the unfiltered items, in order, that satisfy every active filter; a control-state filter empties the hazards; the same filter twice resolves deep-equal; back and openFilter again show no filter (C-045; SL-11 criterion 1)', () => inBrowser(async (env) => {
  const w = await filterWorld(env);
  expectScreen(w.app, await views.openFilter(w.app), 'filter');
  // the fresh app has made no change, so it holds what it loaded; the mirror still holds the first app's save (store C-015, C-016)
  const { body } = await loaded(w.folder);
  const all = await unfiltered(body);
  const bands = [...new Set(all.hazards.map((i) => i.residualRating?.band).filter(Boolean))];
  assert.ok(bands.length >= 2, 'ratings in two bands at least');

  /** @type {any[]} */
  const filters = [
    { platformId: w.platforms.alpha }, { platformId: w.platforms.bravo },
    ...bands.map((band) => ({ band })),
    { recordStatus: 'live' }, { recordStatus: 'deleted' }, { recordStatus: 'retired' },
    { controlState: 'confirmed' }, { controlState: 'excluded' }, { controlState: 'awaiting' },
    { referenceEntryId: w.entryId },
    { platformId: w.platforms.alpha, band: bands[0] },
    { platformId: w.platforms.alpha, controlState: 'awaiting' },
    { recordStatus: 'live', referenceEntryId: w.entryId },
    { platformId: w.platforms.bravo, band: bands[0], recordStatus: 'live', controlState: 'awaiting', referenceEntryId: w.entryId },
  ];
  for (const partial of filters) {
    const filter = { ...NO_FILTER, ...partial };
    const label = JSON.stringify(partial);
    const screen = expectScreen(w.app, await views.applyFilter(w.app, /** @type {any} */ (filter)), 'filter');
    assert.deepEqual(screen.filter, filter, `${label}: the filter as given`);
    assert.deepEqual(screen.hazards, all.hazards.filter((i) => satisfies('hazard', i, filter, all.entries)), `${label}: hazards`);
    assert.deepEqual(screen.controls, all.controls.filter((i) => satisfies('control', i, filter, all.entries)), `${label}: controls`);
    if (filter.controlState !== null) assert.deepEqual(screen.hazards, [], `${label}: a hazard has no control state`);
    assert.deepEqual(screen.platforms, all.platforms, `${label}: the platforms to choose from are unfiltered`);
    const twice = expectScreen(w.app, await views.applyFilter(w.app, /** @type {any} */ (filter)), 'filter');
    assert.deepEqual(twice, plain(screen), `${label}: the same filter twice, deep-equal`);
  }

  const byEntry = expectScreen(w.app, await views.applyFilter(w.app, /** @type {any} */ ({ ...NO_FILTER, referenceEntryId: w.entryId })), 'filter');
  assert.deepEqual([...new Set(byEntry.hazards.map((/** @type {any} */ i) => i.hazard.id))], [w.hazards.bird], 'only what the entry links to directly');
  assert.deepEqual([...new Set(byEntry.controls.map((/** @type {any} */ i) => i.control.id))], [w.controls.radar], 'not the controls of the hazard it names');

  await step(w.app, views.back(w.app), 'hazards');
  const reopened = expectScreen(w.app, await views.openFilter(w.app), 'filter');
  assert.deepEqual(reopened.filter, NO_FILTER, 'the filter is held by the screen only');
}));

// ------------------------------------------------------------------ C-046 the dashboard

test('each user\'s dashboard shows, for each live platform that user owns and no other, its overdue reviews, awaiting controls, omitted hazards, workflows in progress, and changes awaiting acknowledgement (C-046; SL-11 criterion 2)', () => inBrowser(async (env) => {
  clockOn('2026-09-15');
  const w = await buildWorld(env);
  await step(w.app, views.openPlatforms(w.app), 'platforms');
  for (const id of Object.values(w.platforms)) {
    await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'platform', id }, tempoMonths: 12, nextDueAest: day('2026-09-20') })), 'platforms');
  }
  await toHazards(w.app);
  await toHazard(w.app, w.hazards.brakes);
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'hazard', id: w.hazards.brakes }, tempoMonths: 1, nextDueAest: day('2026-09-20') })), 'hazard');
  await toHazards(w.app);
  await step(w.app, views.openWorkflows(w.app), 'workflows');
  for (const id of Object.values(w.platforms)) {
    await step(w.app, views.startWorkflow(w.app, /** @type {any} */ ({ workflowKind: 'review-data', subject: { kind: 'platform', id } })), 'workflow');
    await step(w.app, views.back(w.app), 'workflows');
  }
  await step(w.app, views.startWorkflow(w.app, /** @type {any} */ ({ workflowKind: 'add-data', subject: null })), 'workflow');
  await toHazards(w.app);
  await toHazard(w.app, w.hazards.fire);
  await step(w.app, views.renameHazard(w.app, { title: 'Engine fire, on both' }), 'confirm-edit');
  await step(w.app, views.confirmEdit(w.app), 'hazard');
  await toHazards(w.app);
  await step(w.app, views.save(w.app), 'hazards');
  clockOn('2026-09-25');

  for (const [name, profile, owned, other] of [['Alice', w.alice, w.platforms.alpha, w.platforms.bravo], ['Bob', w.bob, w.platforms.bravo, w.platforms.alpha]]) {
    const app = name === 'Alice' ? w.app : await selectedApp(w.folder, 'Bob');
    const before = everywhere(w.folder, env);
    const screen = expectScreen(app, await views.openDashboard(app), 'dashboard');
    noMessages(screen);
    const body = await heldBody(env, w.folder);
    const live = plain(await registry.listPlatforms(body)).filter((/** @type {any} */ p) => p.ownerProfileId === /** @type {any} */ (profile).id);
    const expected = [];
    for (const p of live) expected.push(await platformItems(body, p));
    assert.deepEqual(screen.platforms, expected, `${name}: one PlatformItems per owned platform`);
    assert.deepEqual(screen.platforms.map((/** @type {any} */ p) => p.platform.id), [owned]);
    const items = screen.platforms[0];
    assert.ok(items.overdue.some((/** @type {any} */ s) => s.ref.kind === 'platform' && s.ref.id === owned), `${name}: the platform's own overdue review`);
    assert.equal(items.overdue.some((/** @type {any} */ s) => s.ref.kind === 'platform' && s.ref.id === other), false, `${name}: nothing of the other platform`);
    assert.equal(items.overdue.some((/** @type {any} */ s) => s.ref.id === w.hazards.brakes), false, `${name}: a record on no platform is on no dashboard`);
    assert.equal(items.workflows.length, 1, `${name}: the review in progress on the owned platform`);
    assert.ok(items.awaiting.some((/** @type {any} */ e) => e.items.some((/** @type {any} */ i) => i.ref.id === w.hazards.fire)), `${name}: the rename awaits`);
    assert.ok(items.unconfirmed.every((/** @type {any} */ u) => u.control.state === 'awaiting'), `${name}: an excluded control is not unconfirmed`);
    assert.deepEqual(screen.profiles, await listedProfiles(w.folder));
    assert.deepEqual(screen.reviews, await reviewsOf(body));
    assert.equal('files' in screen, false, 'the dashboard lists no entry and carries no files');
    assert.deepEqual(everywhere(w.folder, env), before, `${name}: nothing written`);
  }
}));

// ------------------------------------------------------------------ C-047 the open items

test('the open-items screen shows every live platform\'s items whatever its owner, deep-equal to that owner\'s dashboard, the overdue reviews and in-progress workflows on no live platform, and the unlinked records (C-047, C-048; SL-11 criterion 3)', () => inBrowser(async (env) => {
  clockOn('2026-09-15');
  const w = await buildWorld(env);
  await step(w.app, views.openPlatforms(w.app), 'platforms');
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'platform', id: w.platforms.bravo }, tempoMonths: 12, nextDueAest: day('2026-09-20') })), 'platforms');
  await toHazards(w.app);
  await toHazard(w.app, w.hazards.brakes);
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'hazard', id: w.hazards.brakes }, tempoMonths: 1, nextDueAest: day('2026-09-20') })), 'hazard');
  await toHazards(w.app);
  await step(w.app, views.openWorkflows(w.app), 'workflows');
  await step(w.app, views.startWorkflow(w.app, /** @type {any} */ ({ workflowKind: 'add-data', subject: null })), 'workflow');
  await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'name-the-hazard', title: 'Created in a workflow' })), 'workflow');
  await step(w.app, views.back(w.app), 'workflows');
  await step(w.app, views.startWorkflow(w.app, /** @type {any} */ ({ workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.bravo } })), 'workflow');
  await toHazards(w.app);
  clockOn('2026-09-25');

  const before = everywhere(w.folder, env);
  const screen = expectScreen(w.app, await views.openOpenItems(w.app), 'open-items');
  noMessages(screen);
  const body = await heldBody(env, w.folder);
  const live = plain(await registry.listPlatforms(body));
  const expected = [];
  for (const p of live) expected.push(await platformItems(body, p));
  assert.deepEqual(screen.platforms, expected, 'every live platform, whatever its owner');

  const queries = [];
  for (const p of live) queries.push(plain(await registry.listPlatformHazards(body, p.id)));
  const entries = plain(await referenceRegister.listEntries(body));
  const sets = queries.map((q) => reviewSet(q, entries));
  const overdue = plain(await reviewSchedule.listOverdue(body));
  assert.deepEqual(screen.unplaced.overdue, overdue.filter((/** @type {any} */ s) => !sets.some((set) => set.some((r) => sameRef(r, s.ref)))));
  assert.ok(screen.unplaced.overdue.some((/** @type {any} */ s) => s.ref.id === w.hazards.brakes), 'the overdue hazard on no platform');
  const hazards = plain(await registry.listHazards(body));
  const unplaced = plain(await workflows.listWorkflows(body)).filter((/** @type {any} */ wf) => wf.state === 'in-progress' && !(wf.subject?.kind === 'platform' && live.some((/** @type {any} */ p) => p.id === wf.subject.id)));
  assert.deepEqual(screen.unplaced.workflows, unplaced.map((/** @type {any} */ wf) => ({ workflow: wf, subjectName: wf.subject?.kind === 'hazard' ? hazards.find((/** @type {any} */ h) => h.id === wf.subject.id)?.title ?? null : null })));
  assert.equal(screen.unplaced.workflows[0].subjectName, 'Created in a workflow');
  assert.deepEqual(screen.unlinked, await unlinkedOf(body));
  assert.deepEqual(screen.profiles, await listedProfiles(w.folder));
  assert.deepEqual(screen.files, await filesOf(body, w.folder));
  assert.deepEqual(screen.reviews, await reviewsOf(body));
  assert.deepEqual(everywhere(w.folder, env), before, 'nothing written');

  await step(w.app, views.back(w.app), 'hazards');
  await step(w.app, views.save(w.app), 'hazards');
  const bob = await selectedApp(w.folder, 'Bob');
  const dashboard = expectScreen(bob, await views.openDashboard(bob), 'dashboard');
  assert.deepEqual(dashboard.platforms[0], screen.platforms.find((/** @type {any} */ p) => p.platform.id === w.platforms.bravo), 'the same PlatformItems as its owner\'s dashboard');
}));

// ------------------------------------------------------------------ C-048 the unlinked flag

test('a hazard, control, platform, and entry each created alone are flagged unlinked, and each act that links it clears the flag on the next open-items screen; a retirement clears it too (C-048; SL-11 criterion 4)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const [lonely] = await addHazards(w.app, ['Lonely hazard']);
  const [spare] = await addControls(w.app, ['Spare control']);
  const [charlie] = await addPlatforms(w.app, [{ name: 'Charlie', ownerProfileId: w.alice.id }]);
  await step(w.app, views.openReferences(w.app), 'references');
  const entryId = (await step(w.app, views.createReference(w.app, /** @type {any} */ ({ name: 'Loose note', link: null, path: null, file: null })), 'references')).entries[0].id;
  await toHazards(w.app);

  /** @param {string} id */
  const isFlagged = async (id) => {
    const screen = expectScreen(w.app, await views.openOpenItems(w.app), 'open-items');
    assert.deepEqual(screen.unlinked, await unlinkedOf(await heldBody(env, w.folder)));
    await step(w.app, views.back(w.app), 'hazards');
    return screen.unlinked.some((/** @type {any} */ u) => u.ref.id === id);
  };
  for (const id of [lonely, spare, charlie, entryId]) assert.equal(await isFlagged(id), true, `${id} flagged when created alone`);
  const first = expectScreen(w.app, await views.openOpenItems(w.app), 'open-items');
  assert.deepEqual(first.unlinked.find((/** @type {any} */ u) => u.ref.id === lonely), { ref: { kind: 'hazard', id: lonely }, name: 'Lonely hazard' });
  assert.deepEqual(first.unlinked.find((/** @type {any} */ u) => u.ref.id === entryId), { ref: { kind: 'reference-entry', id: entryId }, name: 'Loose note' });
  assert.equal(first.unlinked.some((/** @type {any} */ u) => u.ref.id === w.hazards.brakes), true, 'the world\'s bare hazard too');
  await step(w.app, views.back(w.app), 'hazards');

  await toHazard(w.app, lonely);
  await step(w.app, views.linkControlToHazard(w.app, /** @type {any} */ (spare), 'preventative'), 'hazard');
  await toHazards(w.app);
  assert.equal(await isFlagged(lonely), false, 'a hazard-control link clears the hazard');
  assert.equal(await isFlagged(spare), false, 'and the control');

  await linkHazards(w.app, charlie, [w.hazards.brakes]);
  assert.equal(await isFlagged(charlie), false, 'a hazard-platform link clears the platform');
  assert.equal(await isFlagged(w.hazards.brakes), false, 'and the hazard');

  await step(w.app, views.openReferences(w.app), 'references');
  await step(w.app, views.openReference(w.app, entryId), 'reference');
  await step(w.app, views.linkReference(w.app, /** @type {any} */ ({ kind: 'hazard', id: w.hazards.bird })), 'reference');
  await toHazards(w.app);
  assert.equal(await isFlagged(entryId), false, 'an entry\'s own link clears it');

  const [another] = await addHazards(w.app, ['Retired alone']);
  assert.equal(await isFlagged(another), true);
  await toHazard(w.app, another);
  await step(w.app, views.retireHazard(w.app), 'hazards');
  assert.equal(await isFlagged(another), false, 'a retired record is never flagged');
}));

test('a record linked only by a workflow in progress is not flagged, and is flagged again once that workflow is abandoned; a control linked only to a deleted hazard is linked (C-048)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const [bare] = await addPlatforms(w.app, [{ name: 'Echo', ownerProfileId: w.alice.id }]);
  const [orphanControl] = await addControls(w.app, ['Orphan control']);
  const [doomed] = await addHazards(w.app, ['Soon deleted']);
  await toHazard(w.app, doomed);
  await step(w.app, views.linkControlToHazard(w.app, /** @type {any} */ (orphanControl), 'mitigating'), 'hazard');
  await toHazards(w.app);
  await step(w.app, views.openWorkflows(w.app), 'workflows');
  await step(w.app, views.startWorkflow(w.app, /** @type {any} */ ({ workflowKind: 'review-data', subject: { kind: 'platform', id: bare } })), 'workflow');
  await toHazards(w.app);
  let screen = expectScreen(w.app, await views.openOpenItems(w.app), 'open-items');
  assert.equal(screen.unlinked.some((/** @type {any} */ u) => u.ref.id === bare), false, 'linked by the workflow in progress');
  await step(w.app, views.back(w.app), 'hazards');
  await step(w.app, views.openWorkflows(w.app), 'workflows');
  const wf = /** @type {any} */ (w.app.screen).workflows.find((/** @type {any} */ r) => r.workflow.subject?.id === bare);
  await step(w.app, views.openWorkflow(w.app, wf.workflow.id), 'workflow');
  await step(w.app, views.abandonWorkflow(w.app), 'workflows');
  await toHazards(w.app);
  screen = expectScreen(w.app, await views.openOpenItems(w.app), 'open-items');
  assert.equal(screen.unlinked.some((/** @type {any} */ u) => u.ref.id === bare), true, 'flagged again once abandoned');
  await step(w.app, views.back(w.app), 'hazards');
  await step(w.app, views.save(w.app), 'hazards');

  const { body } = await loaded(w.folder);
  await saveBody(w.folder, w.alice, (await registry.deleteHazard(body, actOf(w.alice), /** @type {any} */ (doomed))).body);
  const app = await selectedApp(w.folder, 'Alice');
  const after = expectScreen(app, await views.openOpenItems(app), 'open-items');
  assert.equal(after.unlinked.some((/** @type {any} */ u) => u.ref.id === orphanControl), false, 'a link counts by its own status');
  assert.equal(after.unlinked.some((/** @type {any} */ u) => u.ref.id === doomed), false, 'a deleted record is never flagged');
  assert.deepEqual(after.unlinked, await unlinkedOf((await loaded(w.folder)).body));
}));

test('a body in which every live record is linked shows unlinked empty, never null; a profile that owns no live platform sees a dashboard with platforms empty (C-046, C-048)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toHazard(w.app, w.hazards.brakes);
  await step(w.app, views.addCausalFactor(w.app, { text: 'Hard landing' }), 'hazard');
  await toHazards(w.app);
  const screen = expectScreen(w.app, await views.openOpenItems(w.app), 'open-items');
  assert.deepEqual(screen.unlinked, []);
  await step(w.app, views.back(w.app), 'hazards');
  await step(w.app, views.openPlatforms(w.app), 'platforms');
  await step(w.app, views.setPlatformOwner(w.app, /** @type {any} */ (w.platforms.alpha), /** @type {any} */ (w.bob.id)), 'platforms');
  await toHazards(w.app);
  const dashboard = expectScreen(w.app, await views.openDashboard(w.app), 'dashboard');
  assert.deepEqual(dashboard.platforms, []);
  noMessages(dashboard);
}));
