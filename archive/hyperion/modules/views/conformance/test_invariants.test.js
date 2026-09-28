/**
 * views conformance: invariants (CORE-CON-002, CORE-TST-001). Property tests over seeded
 * sequences of operations, valid and not, against a model of modules/views/CONTRACT.md: one
 * screen at a time and operations offered by screen kind (C-001, C-002), the profile in the top
 * bar from selection on (C-005), a hazard added kept until saved and carried whole (C-006), every
 * change told to `store` and nothing else (C-012), confinement (C-003, C-009), the gate that
 * fires exactly when the entry an act appends reaches two or more platforms (C-027), and every
 * list of a platform's hazards and controls being the one query (C-020, C-021, C-024). The seed
 * is fixed in harness.js. Written from the contract before any implementation (P8). The null
 * double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as views from '../contract.js';
import { WrongScreenError } from '../contract.js';
import * as registry from '../../registry/contract.js';
import * as changeLog from '../../change-log/contract.js';
import * as bowtie from '../../bowtie/contract.js';
import * as schema from '../../../baseline/schema.js';
import { userProfileId } from '../../../baseline/types.js';
import {
  ALL_OPERATIONS, MemoryFolder, OPERATIONS_OF, SEED, addControls, addHazards, addPlatforms, buildWorld, callOperation, day,
  expectScreen, heldBody, inBrowser, listedProfiles, loaded, newEntry, pick, plain, plantProfiles, platformView, prng, rejectionOf,
  selectedApp, step, storedHazards, toAssessment, toHazard, toHazards, toPlatform,
} from './harness.js';

const NAMES = ['Alice', 'alice', ' Bob ', 'Carol', '', '   ', 'Dave', 'BOB', 'Erin'];
const TITLES = ['Loss of control', '  Icing  ', '', ' ', 'Bird strike', 'Hot brakes', '火災'];

/** The operations the seeded run of SL-01 and SL-02 draws from on each screen kind it reaches. */
const RUN_OPERATIONS = Object.freeze({
  folder: ['openFolder'],
  profile: ['createProfile', 'selectProfile'],
  recover: ['acceptRecovery', 'declineRecovery'],
  hazards: ['addHazard', 'save', 'openControls', 'openHistory'],
  controls: ['back'],
  history: ['back'],
});

/**
 * One seeded run: a start, then `steps` random calls, each checked against the model; ends with
 * the app and the model's view of it.
 * @param {() => number} random
 * @param {any} env
 * @param {MemoryFolder} folder
 * @param {number} steps
 */
async function randomRun(random, env, folder, steps) {
  const app = await views.start();
  expectScreen(app, app.screen, 'folder');
  /** @type {string | null} */
  let selectedName = null;
  /** @type {any} */
  let lastSaved = null;
  /** @type {any} */
  let hazardsLeft = null;

  for (let s = 0; s < steps; s += 1) {
    const before = plain(app.screen);
    const kind = /** @type {keyof typeof RUN_OPERATIONS} */ (before.kind);
    const offered = RUN_OPERATIONS[kind];
    const wrong = ALL_OPERATIONS.filter((op) => !OPERATIONS_OF[kind].includes(op));
    const operation = random() < 0.2 ? wrong[pick(random, wrong.length)] : offered[pick(random, offered.length)];
    const listed = kind === 'profile' ? before.profiles : [];
    const args = {
      handle: folder.handle,
      name: NAMES[pick(random, NAMES.length)],
      profileId: listed.length > 0 && random() < 0.8 ? listed[pick(random, listed.length)].id : userProfileId.fresh(),
      title: TITLES[pick(random, TITLES.length)],
      hazardId: 'H-0001', controlId: 'none', platformId: 'none', text: 'x',
    };
    const label = `step ${s}: ${operation} on the ${kind} screen with ${JSON.stringify({ name: args.name, title: args.title })}`;

    if (wrong.includes(operation)) {
      const writes = env.local.writes.length;
      const files = folder.snapshot();
      const error = await rejectionOf(() => callOperation(app, operation, args));
      assert.ok(error instanceof WrongScreenError, `${label} rejects with WrongScreenError (C-002)`);
      assert.deepEqual(plain(app.screen), before, `${label} left the app unchanged (C-002)`);
      assert.equal(env.local.writes.length, writes, `${label} wrote nothing to the browser's storage`);
      assert.deepEqual(folder.snapshot(), files, `${label} wrote nothing to the folder`);
      continue;
    }

    const storageWrites = env.local.writes.length;
    const screen = /** @type {any} */ (await callOperation(app, operation, args));
    expectScreen(app, screen, screen.kind);
    assert.equal(screen.topBar.profileName, selectedName ?? (['hazards', 'recover'].includes(screen.kind) ? screen.topBar.profileName : null), `${label}: the top bar's profile (C-005)`);

    if (operation === 'openFolder') {
      assert.equal(screen.kind, 'profile', label);
      assert.deepEqual(screen.topBar, { folderName: folder.handle.name, profileName: null }, `${label} (C-003)`);
      assert.deepEqual(screen.profiles, await listedProfiles(folder), `${label} (C-003)`);
    } else if (operation === 'createProfile') {
      const trimmed = args.name.trim();
      const clash = before.profiles.some((/** @type {any} */ p) => p.name.trim().toLowerCase() === trimmed.toLowerCase());
      assert.equal(screen.kind, 'profile', label);
      assert.deepEqual(screen.profiles, await listedProfiles(folder), `${label}: the list as the folder holds it (C-004)`);
      if (trimmed === '' || clash) assert.equal(screen.messages[0]?.severity, 'warning', `${label}: a warning (section 4)`);
      else assert.ok(screen.profiles.some((/** @type {any} */ p) => p.name === trimmed), `${label}: under its trimmed name`);
    } else if (operation === 'selectProfile') {
      const chosen = before.profiles.find((/** @type {any} */ p) => p.id === args.profileId);
      if (chosen) {
        selectedName = chosen.name;
        assert.ok(['hazards', 'recover'].includes(screen.kind), `${label}: hazards, or recover when the browser holds unsaved state (C-004, C-013)`);
        assert.equal(screen.topBar.profileName, chosen.name, `${label} (C-005)`);
        if (screen.kind === 'hazards') {
          assert.deepEqual(screen.hazards, await storedHazards(folder), `${label}: the hazards of the loaded body (C-004)`);
          assert.equal(screen.unsaved, false);
        }
      } else {
        assert.equal(screen.kind, 'profile', label);
        assert.equal(screen.messages[0]?.severity, 'warning', `${label}: an unknown id is a warning (section 4)`);
      }
    } else if (operation === 'acceptRecovery') {
      assert.equal(screen.kind, 'hazards', label);
      assert.deepEqual(screen.hazards, before.hazards, `${label}: the recovered hazards (C-013)`);
      assert.equal(screen.unsaved, true);
    } else if (operation === 'declineRecovery') {
      assert.equal(screen.kind, 'hazards', label);
      assert.deepEqual(screen.hazards, await storedHazards(folder), `${label}: the loaded body (C-013)`);
      assert.equal(screen.unsaved, false);
    } else if (operation === 'addHazard') {
      assert.equal(screen.kind, 'hazards', label);
      assert.deepEqual(screen.lastSave, before.lastSave, label);
      if (args.title.trim() === '') {
        assert.equal(screen.messages[0]?.severity, 'warning', `${label}: a blank title is a warning (section 4)`);
        assert.deepEqual(screen.hazards, before.hazards, label);
        assert.equal(env.local.writes.length, storageWrites, `${label}: a refused change is not told to store (C-012)`);
      } else {
        assert.deepEqual(screen.messages, [], label);
        assert.deepEqual(screen.hazards.slice(0, -1), before.hazards, `${label}: the list before plus one (C-006)`);
        assert.equal(screen.hazards[screen.hazards.length - 1].title, args.title.trim(), `${label}: the title trimmed (C-006)`);
        assert.equal(screen.unsaved, true, label);
        assert.deepEqual(plain(await registry.listHazards(env.local.mirror().body)), screen.hazards, `${label}: the body told to store (C-012)`);
      }
    } else if (operation === 'save') {
      assert.equal(screen.kind, 'hazards', label);
      assert.equal(screen.unsaved, false, label);
      assert.deepEqual(screen.hazards, before.hazards, label);
      assert.deepEqual(screen.lastSave, (await loaded(folder)).lastSave, `${label}: lastSave is the stamp written (C-007)`);
      lastSaved = plain(screen.hazards);
    } else if (operation === 'openControls' || operation === 'openHistory') {
      hazardsLeft = before;
      assert.deepEqual(screen.messages, [], `${label}: a navigation says nothing (C-015)`);
      assert.equal(env.local.writes.length, storageWrites, `${label}: and tells store nothing (C-012)`);
    } else if (operation === 'back') {
      assert.equal(screen.kind, 'hazards', label);
      assert.deepEqual({ ...screen, messages: [] }, { ...hazardsLeft, messages: [] }, `${label}: nothing changed since, so the hazards screen as it was (C-015)`);
    }
  }
  return { app, selectedName, lastSaved };
}

test('over seeded sequences of calls, every screen is the one the model names: one screen at a time, operations offered by screen kind, recovery offered and taken, messages the last operation\'s, every change told to store, and the profile in the top bar from selection on (C-001, C-002, C-004, C-005, C-006, C-012, C-013, C-015)', () => inBrowser(async (env) => {
  const random = prng(SEED);
  for (let run = 0; run < 10; run += 1) {
    const folder = new MemoryFolder(`Run ${run}`);
    if (random() < 0.5) await plantProfiles(folder, ['Alice']);
    await randomRun(random, env, folder, 40);
    env.local.items.delete(schema.BROWSER_STORAGE_KEY);
  }
}));

test('what a seeded run saved is what the folder shows when opened again in another app as the same profile: the same ids and the same titles (C-006)', () => inBrowser(async (env) => {
  const random = prng(SEED + 1);
  let checked = 0;
  for (let run = 0; run < 14; run += 1) {
    const folder = new MemoryFolder();
    await plantProfiles(folder, ['Alice']);
    const { app, selectedName, lastSaved } = await randomRun(random, env, folder, 50);
    if (selectedName === null || lastSaved === null || /** @type {any} */ (app.screen).kind !== 'hazards' || /** @type {any} */ (app.screen).unsaved) continue;
    const other = await selectedApp(folder, selectedName);
    assert.deepEqual(plain(/** @type {any} */ (other.screen).hazards), lastSaved, `run ${run}: the last save, opened again`);
    checked += 1;
    env.local.items.delete(schema.BROWSER_STORAGE_KEY);
  }
  assert.ok(checked >= 3, `enough runs ended saved to mean something (${checked})`);
}));

test('before a profile is selected no call changes stored data or the browser\'s storage: over seeded calls of every operation on the folder and profile screens, data.json is never created or changed (C-002)', () => inBrowser(async (env) => {
  const random = prng(SEED + 2);
  for (let run = 0; run < 10; run += 1) {
    const folder = new MemoryFolder();
    await plantProfiles(folder, ['Alice']);
    const dataBefore = folder.read(schema.DATA_FOLDER.data);
    const writesBefore = env.local.writes.length;

    const app = await views.start();
    for (let s = 0; s < 30; s += 1) {
      const kind = /** @type {any} */ (app.screen).kind;
      if (kind === 'hazards' || kind === 'recover') break;
      const operation = ALL_OPERATIONS[pick(random, ALL_OPERATIONS.length)];
      if (operation.startsWith('choose')) continue;
      const args = { handle: folder.handle, name: NAMES[pick(random, NAMES.length)], profileId: userProfileId.fresh(), title: TITLES[pick(random, TITLES.length)] };
      try {
        await callOperation(app, operation, args);
      } catch (e) {
        assert.ok(e instanceof WrongScreenError, `run ${run} step ${s}: ${operation} on the ${kind} screen rejects only with WrongScreenError`);
      }
      assert.notEqual(/** @type {any} */ (app.screen).kind, 'hazards', 'an unknown id never reaches the hazards screen');
      assert.equal(folder.read(schema.DATA_FOLDER.data), dataBefore, `run ${run} step ${s}: ${operation} on the ${kind} screen left data.json as it was`);
      assert.equal(env.local.writes.length, writesBefore, `run ${run} step ${s}: nothing written to the browser's storage`);
    }
  }
}));

test('confinement: after seeded runs of two apps on one folder, the folder holds only data.json, profiles.json, backups, and superseded saves; the browser\'s storage holds only the key; and no open pre-selects (C-003, C-009)', () => inBrowser(async (env) => {
  const random = prng(SEED + 3);
  for (let run = 0; run < 6; run += 1) {
    const folder = new MemoryFolder();
    await randomRun(random, env, folder, 30);
    await randomRun(random, env, folder, 30);
    for (const rel of folder.list()) {
      assert.ok(
        rel === schema.DATA_FOLDER.data || rel === schema.DATA_FOLDER.profiles
          || rel.startsWith(`${schema.DATA_FOLDER.supersededSaves}/`) || rel.startsWith(`${schema.DATA_FOLDER.backups}/`),
        `run ${run}: ${rel} is not a file views may cause to be written`,
      );
    }
    assert.ok([...env.local.items.keys()].every((k) => k === schema.BROWSER_STORAGE_KEY), 'only the one key');
    assert.deepEqual([...env.session.items.keys()], [], 'nothing in session storage');
    const opened = await views.start();
    const screen = await views.openFolder(opened, folder.handle);
    assert.equal(/** @type {any} */ (screen).topBar.profileName, null, `run ${run}: the next open selects no one, whatever the runs selected (C-003)`);
    env.local.items.delete(schema.BROWSER_STORAGE_KEY);
  }
}));

// ------------------------------------------------------------------ C-027: gated exactly when the entry reaches two or more platforms

test('over seeded links and edits, an operation of C-027 shows the confirm-edit screen exactly when platformsAffected of its ref gives two or more platforms, lists them, and the entry the act then appends reaches exactly that list; an ungated act\'s entry reaches fewer than two (C-027, C-026)', () => inBrowser(async (env) => {
  const random = prng(SEED + 4);
  const w = await buildWorld(env);
  const [charlie] = await addPlatforms(w.app, [{ name: 'Charlie', ownerProfileId: w.bob.id }]);
  const platforms = [w.platforms.alpha, w.platforms.bravo, charlie];
  const hazards = await addHazards(w.app, ['H one', 'H two', 'H three', 'H four']);
  const controls = await addControls(w.app, ['C one', 'C two', 'C three']);
  for (const h of hazards) {
    const picked = controls.filter(() => random() < 0.5);
    await toHazard(w.app, h);
    for (const c of picked) await step(w.app, views.linkControlToHazard(w.app, /** @type {any} */ (c), random() < 0.5 ? 'preventative' : 'mitigating'), 'hazard');
    await toHazards(w.app);
  }
  for (const p of platforms) {
    const chosen = hazards.filter(() => random() < 0.45);
    if (chosen.length > 0) {
      await toPlatform(w.app, p);
      for (const h of chosen) await step(w.app, views.linkHazardToPlatform(w.app, /** @type {any} */ (h)), 'platform');
      await toHazards(w.app);
    }
  }

  let gated = 0;
  let ungated = 0;
  for (let s = 0; s < 40; s += 1) {
    const body = await heldBody(env, w.folder);
    const choice = pick(random, 6);
    const hazard = hazards[pick(random, hazards.length)];
    const control = controls[pick(random, controls.length)];
    /** @type {{ ref: any, open: () => Promise<any>, act: () => Promise<any>, kind: string }} */
    let c;
    if (choice <= 2) {
      const title = `Renamed ${s}`;
      c = choice === 0
        ? { ref: { kind: 'hazard', id: hazard }, open: () => toHazard(w.app, hazard), act: () => views.renameHazard(w.app, { title }), kind: 'hazard' }
        : choice === 1
          ? { ref: { kind: 'hazard', id: hazard }, open: () => toHazard(w.app, hazard), act: () => views.addCausalFactor(w.app, { text: `CF ${s}` }), kind: 'hazard' }
          : { ref: { kind: 'hazard', id: hazard }, open: () => toHazard(w.app, hazard), act: () => views.addConsequence(w.app, { text: `Co ${s}` }), kind: 'hazard' };
    } else if (choice === 3) {
      c = { ref: { kind: 'hazard', id: hazard }, open: () => toHazard(w.app, hazard), act: () => views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'hazard', id: hazard }, tempoMonths: 1 + s, nextDueAest: day('2027-01-01') })), kind: 'hazard' };
    } else if (choice === 4) {
      c = { ref: { kind: 'control', id: control }, open: () => step(w.app, views.openControls(w.app), 'controls'), act: () => views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'control', id: control }, tempoMonths: 1 + s, nextDueAest: day('2027-02-01') })), kind: 'controls' };
    } else {
      const platform = platforms[pick(random, platforms.length)];
      c = { ref: { kind: 'platform', id: platform }, open: () => step(w.app, views.openPlatforms(w.app), 'platforms'), act: () => views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'platform', id: platform }, tempoMonths: 1 + s, nextDueAest: day('2027-03-01') })), kind: 'platforms' };
    }
    const expected = plain(await registry.platformsAffected(body, c.ref));
    await c.open();
    const entriesBefore = (await changeLog.listEntries(body)).length;
    const screen = /** @type {any} */ (await c.act());
    const label = `step ${s}: ${JSON.stringify(c.ref)} reaching ${expected.length}`;
    if (expected.length >= 2) {
      expectScreen(w.app, screen, 'confirm-edit');
      assert.deepEqual(screen.affected.map((/** @type {any} */ a) => a.id), expected, `${label}: the list is platformsAffected's`);
      assert.equal((await changeLog.listEntries(await heldBody(env, w.folder))).length, entriesBefore, `${label}: nothing recorded while it waits`);
      expectScreen(w.app, await views.confirmEdit(w.app), /** @type {any} */ (c.kind));
      gated += 1;
    } else {
      expectScreen(w.app, screen, /** @type {any} */ (c.kind));
      ungated += 1;
    }
    const heldAfter = await heldBody(env, w.folder);
    if ((await changeLog.listEntries(heldAfter)).length > entriesBefore) {
      const entry = await newEntry(body, heldAfter);
      assert.deepEqual(entry.affectedPlatformIds, expected, `${label}: the entry reaches exactly what the user was or would have been warned of`);
      assert.equal(entry.affectedPlatformIds.length >= 2, expected.length >= 2, `${label}: gated exactly when the entry carries two or more`);
    }
    await toHazards(w.app);
  }
  assert.ok(gated > 3 && ungated > 3, `both branches reached (${gated} gated, ${ungated} not)`);
}));

// ------------------------------------------------------------------ C-020, C-021, C-024: every list of a platform's hazards is one query

test('over seeded states, every screen that lists a platform\'s hazards or shows a hazard\'s controls on a platform agrees with the one listPlatformHazards: the platform screen, a review workflow, the prepare-report screen, the filter, a hazard\'s own screen, the assessment, the bow-tie, and the dashboard (C-020, C-021, C-024, C-044 to C-046)', () => inBrowser(async (env) => {
  const random = prng(SEED + 5);
  const w = await buildWorld(env);
  await step(w.app, views.openReports(w.app), 'reports');
  const templateId = (await step(w.app, views.createTemplate(w.app, /** @type {any} */ ({ name: 'T', title: 'T', sections: [{ sectionKind: 'hazards' }] })), 'reports')).templates[0].id;
  await toHazards(w.app);
  const extra = await addHazards(w.app, ['Extra one', 'Extra two']);
  await linkRandomly();

  async function linkRandomly() {
    for (const h of extra) {
      await toHazard(w.app, h);
      for (const c of Object.values(w.controls)) {
        if (random() < 0.5) await step(w.app, views.linkControlToHazard(w.app, /** @type {any} */ (c), random() < 0.5 ? 'preventative' : 'mitigating'), 'hazard');
      }
      await toHazards(w.app);
      if (random() < 0.7) await (async () => { await toPlatform(w.app, w.platforms.alpha); await step(w.app, views.linkHazardToPlatform(w.app, /** @type {any} */ (h)), 'platform'); await toHazards(w.app); })();
    }
  }

  for (let round = 0; round < 4; round += 1) {
    const view = await platformView(await heldBody(env, w.folder), w.platforms.alpha);
    for (const row of view.rows) {
      for (const pc of row.controls) {
        const r = random();
        if (r < 0.3 && pc.state !== 'confirmed') {
          await toAssessment(w.app, w.platforms.alpha, row.hazard.id);
          await step(w.app, views.confirmControlForPlatform(w.app, pc.control.id), 'assessment');
          await toHazards(w.app);
        } else if (r < 0.5 && pc.state !== 'excluded') {
          await toAssessment(w.app, w.platforms.alpha, row.hazard.id);
          await step(w.app, views.excludeControlFromPlatform(w.app, pc.control.id, `Round ${round}`), 'assessment');
          await toHazards(w.app);
        }
      }
      if (random() < 0.5) {
        await toAssessment(w.app, w.platforms.alpha, row.hazard.id);
        const values = { consequence: 1 + pick(random, 5), likelihood: 'ABCDEFG'[pick(random, 7)] };
        const current = /** @type {any} */ (w.app.screen).residual;
        if (current.consequence !== values.consequence || current.likelihood !== values.likelihood) {
          await step(w.app, views.enterRating(w.app, 'residual', /** @type {any} */ (values)), 'assessment');
        }
        await toHazards(w.app);
      }
    }

    const body = await heldBody(env, w.folder);
    const truth = await platformView(body, w.platforms.alpha);
    const label = `round ${round}`;
    const platform = await toPlatform(w.app, w.platforms.alpha);
    assert.deepEqual(platform.rows, truth.rows, `${label}: the platform screen`);
    await toHazards(w.app);

    await step(w.app, views.openWorkflows(w.app), 'workflows');
    const review = expectScreen(w.app, await views.startWorkflow(w.app, /** @type {any} */ ({ workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.alpha } })), 'workflow');
    assert.deepEqual(review.rows, truth.rows, `${label}: a review workflow`);
    await step(w.app, views.abandonWorkflow(w.app), 'workflows');
    await toHazards(w.app);

    await step(w.app, views.openReports(w.app), 'reports');
    const prepared = expectScreen(w.app, await views.beginReport(w.app, /** @type {any} */ ({ templateId, platformId: w.platforms.alpha })), 'prepare-report');
    assert.deepEqual(prepared.rows, truth.rows, `${label}: the prepare-report screen`);
    await toHazards(w.app);

    const filter = expectScreen(w.app, await views.openFilter(w.app), 'filter');
    const againstAlpha = filter.hazards.filter((/** @type {any} */ i) => i.platform?.id === w.platforms.alpha && i.omitted === null);
    assert.deepEqual(againstAlpha.map((/** @type {any} */ i) => [i.hazard.id, i.residualRating]).sort(), truth.rows.map((r) => [r.hazard.id, r.residualRating]).sort(), `${label}: the filter's hazards against the platform`);
    const controlsAgainst = filter.controls.filter((/** @type {any} */ i) => i.platform?.id === w.platforms.alpha);
    assert.deepEqual(controlsAgainst.map((/** @type {any} */ i) => i.platformControl).sort((/** @type {any} */ a, /** @type {any} */ b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), truth.rows.flatMap((r) => r.controls).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), `${label}: the filter's controls against the platform`);
    await toHazards(w.app);

    const dashboard = expectScreen(w.app, await views.openDashboard(w.app), 'dashboard');
    const alphaItems = dashboard.platforms.find((/** @type {any} */ p) => p.platform.id === w.platforms.alpha);
    assert.deepEqual(alphaItems.unconfirmed, truth.rows.flatMap((r) => r.controls.filter((/** @type {any} */ c) => c.state === 'awaiting').map((/** @type {any} */ c) => ({ hazard: r.hazard, control: c }))), `${label}: the dashboard's unconfirmed controls`);
    await toHazards(w.app);

    for (const row of truth.rows) {
      const hazard = await toHazard(w.app, row.hazard.id);
      assert.deepEqual(hazard.platforms.find((/** @type {any} */ p) => p.platform.id === w.platforms.alpha).controls, row.controls, `${label}: ${row.hazard.id}'s own screen`);
      await toHazards(w.app);
      const assessment = await toAssessment(w.app, w.platforms.alpha, row.hazard.id);
      assert.deepEqual(assessment.controls, row.controls, `${label}: ${row.hazard.id}'s assessment`);
      assert.deepEqual(assessment.residualRating, row.residualRating, `${label}: ${row.hazard.id}'s residual band`);
      const shown = await step(w.app, views.openBowtie(w.app), 'bowtie');
      assert.deepEqual([...shown.bowtie.preventativeControls, ...shown.bowtie.mitigatingControls].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), [...row.controls].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), `${label}: ${row.hazard.id}'s bow-tie`);
      assert.equal(shown.svg, await bowtie.renderBowtieSvg(await bowtie.bowtieFor(body, row.hazard.id, /** @type {any} */ (w.platforms.alpha))));
      await toHazards(w.app);
    }
  }
}));
