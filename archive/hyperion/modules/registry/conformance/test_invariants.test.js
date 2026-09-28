/**
 * registry conformance: invariants (CORE-CON-002). Property-based over seeded random starting
 * bodies and sequences of calls (CORE-TST-001: the seed is fixed and recorded in harness.js).
 * Each test states the model it checks against and the clause of
 * modules/registry/CONTRACT.md 5.0 the model comes from; the models of the reads are in
 * harness.js, written from the clauses. Written from the contract before any implementation
 * (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1): fixed data cannot list what was
 * created, keep a deleted id retired, give a control the state its rows say, or record the
 * act it performed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as registry from '../contract.js';
import * as errors from '../contract.js';
import { hazardId } from '../../../baseline/types.js';
import {
  HELD, LOG, OWNED_KINDS, SEED, TYPED_TITLES, actOf, addedEntries, affectedModel, allControlsModel, allHazardsModel, allPlatformsModel, assertRecorded,
  bodyFrom, changeLog, controlRow, controlsModel, deepFreeze, detailModel, differences, entriesOf, hazardControlLinkRow, hazardPlatformLinkRow, hazardRow,
  hazardsModel, idNumber, jsonRoundTrip, justificationRow, linksModel, liveLinks, newProfile, oneOf, orderedUuid, pick, platformHazardsModel, platformRow,
  platformsModel, plusSeconds, prng, randomBody, ratingRow, refOf, schema, snapshot, stateModel, valuesModel, withBrowserStorageSpies, withClock,
} from './harness.js';

/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../contract.js').Hazard} Hazard */

const COMMON = [errors.MissingProfileError, errors.InvalidActError, errors.UnknownPlatformError];

/**
 * The rejections section 4 names for each changing operation on a well-formed body whose log
 * `change-log` can read. Anything else is a defect.
 * @type {Record<string, Function[]>}
 */
const ALLOWED = {
  createHazard: [...COMMON, errors.InvalidHazardTitleError, errors.HazardSequenceError],
  updateHazard: [...COMMON, errors.InvalidHazardTitleError, errors.UnknownHazardError, errors.HazardNotLiveError, errors.NoChangeError],
  deleteHazard: [...COMMON, errors.UnknownHazardError, errors.HazardNotLiveError],
  retireHazard: [...COMMON, errors.UnknownHazardError, errors.HazardNotLiveError, errors.HazardOnPlatformsError],
  addCausalFactor: [...COMMON, errors.InvalidCausalFactorTextError, errors.UnknownHazardError, errors.HazardNotLiveError],
  addConsequence: [...COMMON, errors.InvalidConsequenceTextError, errors.UnknownHazardError, errors.HazardNotLiveError],
  createControl: [...COMMON, errors.InvalidControlTitleError],
  retireControl: [...COMMON, errors.UnknownControlError, errors.ControlNotLiveError],
  linkControlToHazard: [...COMMON, errors.UnknownHazardError, errors.HazardNotLiveError, errors.UnknownControlError, errors.ControlNotLiveError, errors.InvalidControlKindError, errors.DuplicateLinkError],
  createPlatform: [...COMMON, errors.InvalidPlatformNameError, errors.InvalidOwnerError],
  retirePlatform: [...COMMON, errors.PlatformNotLiveError],
  setPlatformOwner: [...COMMON, errors.PlatformNotLiveError, errors.InvalidOwnerError, errors.NoChangeError],
  linkHazardToPlatform: [...COMMON, errors.UnknownHazardError, errors.HazardNotLiveError, errors.PlatformNotLiveError, errors.DuplicateLinkError],
  setPlatformReportId: [...COMMON, errors.HazardNotOnPlatformError, errors.InvalidPlatformReportIdError, errors.NoChangeError],
  confirmControlForPlatform: [...COMMON, errors.UnknownControlError, errors.DuplicateLinkError, errors.HazardNotOnPlatformError, errors.ControlNotOnHazardError],
  excludeControlFromPlatform: [...COMMON, errors.UnknownControlError, errors.AlreadyExcludedError, errors.HazardNotOnPlatformError, errors.ControlNotOnHazardError, errors.InvalidJustificationTextError],
  setRating: [...COMMON, errors.HazardNotOnPlatformError, errors.InvalidRatingStageError, errors.InvalidRatingValueError, errors.NoChangeError],
};

/** The record each changing operation's change returns, by the property the change carries it on. */
const RETURNED = /** @type {const} */ ({
  createHazard: ['hazard'], updateHazard: ['hazard'], deleteHazard: ['hazard'], retireHazard: ['hazard'], addCausalFactor: ['causalFactor'],
  addConsequence: ['consequence'], createControl: ['control'], retireControl: ['control'], linkControlToHazard: ['link'], createPlatform: ['platform'],
  retirePlatform: ['platform'], setPlatformOwner: ['platform'], linkHazardToPlatform: ['link'], setPlatformReportId: ['link'],
  confirmControlForPlatform: ['link', 'clearedJustification'], excludeControlFromPlatform: ['justification', 'removedLink'], setRating: ['rating'],
});

/**
 * A random changing call against `body`, arguments drawn mostly from what the body holds so
 * most calls resolve, sometimes from what it does not.
 * @param {() => number} random
 * @param {DataBody} body
 * @param {ActiveProfile[]} profiles
 * @returns {{ name: keyof typeof ALLOWED, act: any, call: (body: DataBody) => Promise<any> }}
 */
function randomCall(random, body, profiles) {
  const hazards = Object.keys(entriesOf(body, 'hazard'));
  const controls = Object.keys(entriesOf(body, 'control'));
  const platforms = Object.keys(entriesOf(body, 'platform'));
  const links = liveLinks(body);
  const hazard = () => (hazards.length > 0 && random() < 0.9 ? oneOf(random, hazards) : hazardId.fromSequence(body.sequences.hazard + 3));
  const control = () => (controls.length > 0 && random() < 0.9 ? oneOf(random, controls) : orderedUuid(0xfffffff0, 0xc));
  const platform = () => (platforms.length > 0 && random() < 0.9 ? oneOf(random, platforms) : orderedUuid(0xfffffff1, 0xa));
  const text = () => oneOf(random, TYPED_TITLES);
  const profile = oneOf(random, profiles);
  const r = random();
  const act = r < 0.03 ? null : r < 0.05 ? { profile } : actOf(profile, platforms.length > 0 && random() < 0.5 ? oneOf(random, platforms) : null);
  // a triple a hazard-control link and a hazard-platform link make, when there is one
  const triple = () => {
    const hc = links.filter((l) => l.linkKind === 'hazard-control');
    const hp = links.filter((l) => l.linkKind === 'hazard-platform');
    const pairs = hc.flatMap((c) => hp.filter((p) => p.hazardId === c.hazardId).map((p) => ({ hazardId: c.hazardId, controlId: /** @type {any} */ (c).controlId, platformId: /** @type {any} */ (p).platformId })));
    return pairs.length > 0 && random() < 0.85 ? oneOf(random, pairs) : { hazardId: hazard(), controlId: control(), platformId: platform() };
  };
  const onPlatform = () => {
    const hp = links.filter((l) => l.linkKind === 'hazard-platform');
    if (hp.length > 0 && random() < 0.85) { const l = /** @type {any} */ (oneOf(random, hp)); return { hazardId: l.hazardId, platformId: l.platformId }; }
    return { hazardId: hazard(), platformId: platform() };
  };
  const names = /** @type {(keyof typeof ALLOWED)[]} */ (Object.keys(ALLOWED));
  const name = oneOf(random, names);
  /** @type {Record<string, (b: DataBody) => Promise<any>>} */
  const calls = {
    createHazard: (b) => registry.createHazard(b, act, { title: text() }),
    updateHazard: (b) => registry.updateHazard(b, act, /** @type {any} */ (hazard()), { title: text() }),
    deleteHazard: (b) => registry.deleteHazard(b, act, /** @type {any} */ (hazard())),
    retireHazard: (b) => registry.retireHazard(b, act, /** @type {any} */ (hazard())),
    addCausalFactor: (b) => registry.addCausalFactor(b, act, /** @type {any} */ (hazard()), { text: text() }),
    addConsequence: (b) => registry.addConsequence(b, act, /** @type {any} */ (hazard()), { text: text() }),
    createControl: (b) => registry.createControl(b, act, { title: text() }),
    retireControl: (b) => registry.retireControl(b, act, /** @type {any} */ (control())),
    linkControlToHazard: (b) => registry.linkControlToHazard(b, act, /** @type {any} */ ({ hazardId: hazard(), controlId: control(), controlKind: oneOf(random, ['preventative', 'mitigating', 'mitigating', 'sideways']) })),
    createPlatform: (b) => registry.createPlatform(b, act, /** @type {any} */ ({ name: text(), ownerProfileId: random() < 0.9 ? oneOf(random, profiles).id : 'nobody' })),
    retirePlatform: (b) => registry.retirePlatform(b, act, /** @type {any} */ (platform())),
    setPlatformOwner: (b) => registry.setPlatformOwner(b, act, /** @type {any} */ ({ platformId: platform(), ownerProfileId: oneOf(random, profiles).id })),
    linkHazardToPlatform: (b) => registry.linkHazardToPlatform(b, act, /** @type {any} */ ({ hazardId: hazard(), platformId: platform() })),
    setPlatformReportId: (b) => registry.setPlatformReportId(b, act, /** @type {any} */ ({ ...onPlatform(), reportId: oneOf(random, ['R-1', 'R-2', ' R-3', 'R-4']) })),
    confirmControlForPlatform: (b) => registry.confirmControlForPlatform(b, act, /** @type {any} */ (triple())),
    excludeControlFromPlatform: (b) => registry.excludeControlFromPlatform(b, act, /** @type {any} */ ({ ...triple(), text: text() })),
    setRating: (b) => registry.setRating(b, act, /** @type {any} */ ({ ...onPlatform(), stage: oneOf(random, ['initial', 'residual']), consequence: oneOf(random, [null, 1, 3, 5, 6]), likelihood: oneOf(random, [null, 'A', 'D', 'G']) })),
  };
  return { name, act, call: calls[name] };
}

/**
 * Every read of this contract on `body` against the models in harness.js.
 * @param {DataBody} body
 * @param {string} at
 */
async function assertReadsMatchModels(body, at) {
  assert.deepEqual([...(await registry.listHazards(body))], hazardsModel(body), `${at}: listHazards (C-006)`);
  assert.deepEqual([...(await registry.listAllHazards(body))], allHazardsModel(body), `${at}: listAllHazards (C-030)`);
  assert.deepEqual([...(await registry.listControls(body))], controlsModel(body), `${at}: listControls (C-011)`);
  assert.deepEqual([...(await registry.listAllControls(body))], allControlsModel(body), `${at}: listAllControls (C-030)`);
  assert.deepEqual([...(await registry.listPlatforms(body))], platformsModel(body), `${at}: listPlatforms (C-014)`);
  assert.deepEqual([...(await registry.listAllPlatforms(body))], allPlatformsModel(body), `${at}: listAllPlatforms (C-030)`);
  for (const id of Object.keys(entriesOf(body, 'platform'))) {
    assert.deepEqual(await registry.listPlatformHazards(body, /** @type {any} */ (id)), platformHazardsModel(body, /** @type {any} */ (id)), `${at}: listPlatformHazards(${id}) (C-019, C-021)`);
  }
  for (const id of Object.keys(entriesOf(body, 'hazard'))) {
    assert.deepEqual(await registry.getHazardDetail(body, /** @type {any} */ (id)), detailModel(body, id), `${at}: getHazardDetail(${id}) (C-010, C-012)`);
  }
  for (const kind of OWNED_KINDS) {
    for (const id of Object.keys(entriesOf(body, kind))) {
      assert.deepEqual([...(await registry.platformsAffected(body, { kind, id }))], affectedModel(body, { kind, id }), `${at}: platformsAffected(${kind} ${id}) (C-024)`);
      assert.deepEqual([...(await registry.listLinks(body, { kind, id }))], linksModel(body, { kind, id }), `${at}: listLinks(${kind} ${id}) (C-031)`);
    }
  }
}

/**
 * C-004: each record under its id in the collection of its kind, with exactly the fields
 * section 3 gives that kind, each a string, a whole number, a boolean, or null.
 * @param {DataBody} body
 * @param {string} at
 */
function assertStoredOnce(body, at) {
  const header = ['id', 'kind', 'status', 'createdBy', 'createdAtAest', 'updatedBy', 'updatedAtAest'];
  /** @type {Record<string, string[]>} */
  const own = {
    hazard: ['title'], control: ['title'], platform: ['name', 'ownerProfileId'], 'causal-factor': ['hazardId', 'text'], consequence: ['hazardId', 'text'],
    justification: ['hazardId', 'controlId', 'platformId', 'text'], rating: ['hazardId', 'platformId', 'stage', 'consequence', 'likelihood'],
  };
  /** @type {Record<string, string[]>} */
  const linkFields = { 'hazard-platform': ['hazardId', 'platformId', 'reportId'], 'hazard-control': ['hazardId', 'controlId', 'controlKind'], 'control-platform': ['hazardId', 'controlId', 'platformId'] };
  for (const kind of OWNED_KINDS) {
    for (const [key, row] of Object.entries(entriesOf(body, kind))) {
      assert.equal(row.id, key, `${at}: ${kind} ${key} is under its own id`);
      assert.equal(row.kind, kind, `${at}: ${kind} ${key} is in the collection of its kind`);
      const fields = kind === 'link' ? ['linkKind', ...linkFields[row.linkKind]] : own[kind];
      assert.deepEqual(Object.keys(row).sort(), [...header, ...fields].sort(), `${at}: ${kind} ${key} carries exactly its own fields and no copy of another record`);
      for (const [field, value] of Object.entries(row)) {
        assert.ok(value === null || typeof value === 'string' || typeof value === 'boolean' || Number.isInteger(value), `${at}: ${kind} ${key}.${field} is plain data`);
      }
    }
  }
  assert.deepEqual(jsonRoundTrip(body), body, `${at}: deep-equal to itself after JSON serialisation and parsing`);
}

/**
 * C-021 over a whole body: never more than one live link, one live justification, or one of
 * each, for a triple.
 * @param {DataBody} body
 * @param {string} at
 */
function assertOneStatePerTriple(body, at) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  const bump = (/** @type {any} */ r) => { const k = `${r.hazardId}|${r.controlId}|${r.platformId}`; counts.set(k, (counts.get(k) ?? 0) + 1); };
  for (const l of liveLinks(body)) if (l.linkKind === 'control-platform') bump(l);
  for (const j of Object.values(entriesOf(body, 'justification'))) if (j.status === 'live') bump(j);
  for (const [k, n] of counts) assert.ok(n <= 1, `${at}: triple ${k} holds ${n} live rows; C-021 allows one`);
}

test('model check: a random sequence of every changing operation over random bodies of the whole record model resolves or rejects as section 4 allows; each resolution changes exactly the records its change returns, returns them as stored, records one entry for exactly those records reaching the platforms C-024 derives, and leaves every read matching its model; the input body is never changed (C-003, C-004, C-008, C-013, C-017, C-019, C-021, C-023, C-024, C-030, C-031)', async () => {
  const random = prng(SEED);
  const profiles = [newProfile('Alice'), newProfile('Bob'), newProfile('Carol')];
  /** @type {Record<string, number>} */
  const resolved = {};
  let rejected = 0;
  for (let run = 0; run < 10; run += 1) {
    let body = randomBody(random, profiles);
    let clock = plusSeconds(HELD, run * 10000);
    await assertReadsMatchModels(body, `run ${run} start`);
    for (let step = 0; step < 50; step += 1) {
      const at = `run ${run} step ${step}`;
      clock = plusSeconds(clock, pick(random, 3)); // sometimes the same second as the step before
      const input = body;
      const before = snapshot(input);
      const { name, act, call } = randomCall(random, body, profiles);
      const outcome = await withClock(clock, () => call(input)).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
      assert.deepEqual(input, before, `${at}: ${name}: the body passed in is deep-equal to what it was`);
      if (!outcome.ok) {
        rejected += 1;
        assert.ok(ALLOWED[name].some((type) => outcome.e instanceof type), `${at}: ${name} rejected with ${String(outcome.e)}, which section 4 does not name for it`);
        continue;
      }
      resolved[name] = (resolved[name] ?? 0) + 1;
      const change = outcome.v;
      const output = change.body;
      /** @type {{ before: any, after: any }[]} */
      const records = RETURNED[name].map((prop) => change[prop]).filter((r) => r !== null).map((after) => ({ before: entriesOf(input, after.kind)[after.id] ?? null, after }));
      for (const r of records) assert.deepEqual(entriesOf(output, r.after.kind)[r.after.id], r.after, `${at}: ${name}: the ${r.after.kind} returned is the one stored`);
      const expectedKeys = records.map((r) => `${r.after.kind}/${r.after.id}`);
      if (name === 'createHazard') expectedKeys.push('sequences.hazard');
      assert.deepEqual(differences(input, output), expectedKeys.sort(), `${at}: ${name}: the body differs only by the records the change returns (C-003)`);
      await assertRecorded(input, output, { act, at: clock, records, what: `${at}: ${name}` });
      const entry = (await addedEntries(input, output, at))[0];
      /** @type {Set<string>} */
      const union = new Set(records.flatMap((r) => affectedModel(output, refOf(r.after))));
      assert.deepEqual([...entry.affectedPlatformIds], [...union].sort(), `${at}: ${name}: the platforms the model of C-024 derives`);

      const addedConfirmations = records.filter((r) => r.before === null && r.after.kind === 'link' && r.after.linkKind === 'control-platform');
      assert.equal(addedConfirmations.length, name === 'confirmControlForPlatform' ? 1 : 0, `${at}: ${name}: only a confirmation creates a control-platform link, one at a time (C-013)`);
      if (name !== 'setRating') assert.deepEqual(entriesOf(output, 'rating'), entriesOf(input, 'rating'), `${at}: ${name}: no operation but setRating writes a rating (C-017)`);
      if (name !== 'excludeControlFromPlatform' && name !== 'confirmControlForPlatform') assert.deepEqual(entriesOf(output, 'justification'), entriesOf(input, 'justification'), `${at}: ${name}: only the two acts of C-021 write a justification (C-020)`);
      assertOneStatePerTriple(output, `${at}: ${name}`);
      assertStoredOnce(output, `${at}: ${name}`);
      await assertReadsMatchModels(output, `${at}: after ${name}`);
      body = output;
    }
  }
  for (const name of Object.keys(ALLOWED)) assert.ok((resolved[name] ?? 0) >= 1, `the seed resolved ${name} ${resolved[name] ?? 0} times; it must exercise every operation (change it on purpose if this fails): ${JSON.stringify(resolved)}`);
  assert.ok(rejected >= 20, `the seed produced ${rejected} rejections; it must exercise section 4 (change it on purpose if this fails)`);
});

test('model check of hazards: a random sequence of creates, retitles, deletes, retirements, lists and gets from a random body matches the model of stored hazards, the ids assigned, and the list order (C-001, C-002, C-005, C-006, C-009, C-025)', async () => {
  const random = prng(SEED + 1);
  const profiles = [newProfile('Alice'), newProfile('Bob')];
  const counts = { create: 0, retitle: 0, remove: 0, notLive: 0, unknown: 0 };
  for (let run = 0; run < 12; run += 1) {
    let body = randomBody(random, profiles);
    /** @type {Map<string, Hazard>} */
    const model = new Map(Object.entries(entriesOf(body, 'hazard')).map(([k, v]) => [k, snapshot(v)]));
    const startingIds = new Set(model.keys());
    /** @type {string[]} */
    const assigned = [];
    let sequence = body.sequences.hazard;
    let clock = plusSeconds(HELD, run * 1000);
    for (let step = 0; step < 40; step += 1) {
      const at = `run ${run} step ${step}`;
      const p = oneOf(random, profiles);
      const act = actOf(p);
      clock = plusSeconds(clock, 1 + pick(random, 120));
      const r = random();
      const onPlatform = (/** @type {string} */ id) => liveLinks(body).some((l) => l.linkKind === 'hazard-platform' && l.hazardId === id);
      if (r < 0.35) {
        const title = oneOf(random, TYPED_TITLES);
        const outcome = await withClock(clock, () => registry.createHazard(body, act, { title })).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
        if (title.trim() === '') {
          assert.ok(!outcome.ok && outcome.e instanceof errors.InvalidHazardTitleError, `${at}: blank title rejected`);
          continue;
        }
        assert.ok(outcome.ok, `${at}: create resolves, got ${outcome.ok ? '' : String(outcome.e)}`);
        counts.create += 1;
        const h = outcome.v.hazard;
        assert.equal(h.id, hazardId.fromSequence(sequence), `${at}: the id the sequence names`);
        assert.ok(!startingIds.has(h.id) && !assigned.includes(h.id), `${at}: ${h.id} was never held before`);
        assert.deepEqual(h, { id: h.id, kind: 'hazard', status: 'live', createdBy: p.id, createdAtAest: clock, updatedBy: p.id, updatedAtAest: clock, title: title.trim() });
        assigned.push(h.id);
        model.set(h.id, h);
        sequence += 1;
        body = outcome.v.body;
      } else if (r < 0.8) {
        const known = [...model.keys()];
        const id = /** @type {any} */ (known.length > 0 && random() < 0.85 ? oneOf(random, known) : hazardId.fromSequence(sequence + pick(random, 3)));
        const current = model.get(id);
        const which = oneOf(random, /** @type {const} */ (['update', 'delete', 'retire']));
        const title = `${oneOf(random, TYPED_TITLES).trim() || 'x'} ${step}`;
        const call = () => (which === 'update' ? registry.updateHazard(body, act, id, { title }) : which === 'delete' ? registry.deleteHazard(body, act, id) : registry.retireHazard(body, act, id));
        const outcome = await withClock(clock, call).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
        if (!current) {
          counts.unknown += 1;
          assert.ok(!outcome.ok && outcome.e instanceof errors.UnknownHazardError, `${at}: ${which} of unknown ${id}`);
        } else if (current.status !== 'live') {
          counts.notLive += 1;
          assert.ok(!outcome.ok && outcome.e instanceof errors.HazardNotLiveError && outcome.e.status === current.status, `${at}: ${which} of ${current.status} ${id}`);
        } else if (which === 'retire' && onPlatform(id)) {
          assert.ok(!outcome.ok && outcome.e instanceof errors.HazardOnPlatformsError, `${at}: retiring ${id}, which is on a platform`);
        } else {
          assert.ok(outcome.ok, `${at}: ${which} of live ${id} resolves, got ${outcome.ok ? '' : String(outcome.e)}`);
          const expected = which === 'update' ? { ...current, title, updatedBy: p.id, updatedAtAest: clock } : { ...current, status: which === 'delete' ? 'deleted' : 'retired', updatedBy: p.id, updatedAtAest: clock };
          assert.deepEqual(outcome.v.hazard, expected, `${at}: ${which} as C-009, C-005, C-025 describe it`);
          assert.equal(outcome.v.body.sequences.hazard, sequence, `${at}: the sequence does not move`);
          if (which === 'update') counts.retitle += 1; else counts.remove += 1;
          model.set(id, /** @type {Hazard} */ (expected));
          body = outcome.v.body;
        }
      } else if (r < 0.9) {
        const expected = [...model.values()].filter((h) => h.status === 'live').sort((a, b) => idNumber(a.id) - idNumber(b.id));
        assert.deepEqual([...(await registry.listHazards(body))], expected, `${at}: every live hazard once, by number`);
        assert.deepEqual([...(await registry.listAllHazards(body))], [...model.values()].sort((a, b) => idNumber(a.id) - idNumber(b.id)), `${at}: every hazard, by number`);
      } else {
        const known = [...model.keys()];
        const id = /** @type {any} */ (known.length > 0 && random() < 0.8 ? oneOf(random, known) : hazardId.fromSequence(sequence + 1));
        assert.deepEqual(await registry.getHazard(body, id), model.get(id) ?? null, `${at}: getHazard(${id})`);
      }
    }
    assert.deepEqual(assigned.map(idNumber), [...assigned.map(idNumber)].sort((a, b) => a - b), `run ${run}: assigned in increasing order`);
    assert.deepEqual(new Set(Object.keys(entriesOf(body, 'hazard'))), new Set(model.keys()), `run ${run}: every id ever held is still in the collection`);
  }
  assert.ok(counts.create >= 50 && counts.retitle >= 15 && counts.remove >= 15 && counts.notLive >= 8 && counts.unknown >= 5, `the seed produced ${JSON.stringify(counts)}; it must exercise each (change it on purpose if this fails)`);
});

test('a sequence behind its collection assigns nothing: createHazard rejects with HazardSequenceError for every held id the sequence points at, and a body with the sequence at a free number assigns that number (C-002)', async () => {
  const random = prng(SEED + 2);
  const p = newProfile('Alice');
  let rejections = 0;
  let assignments = 0;
  for (let run = 0; run < 40; run += 1) {
    const base = randomBody(random, [p]);
    const held = Object.keys(entriesOf(base, 'hazard'));
    const highest = held.reduce((n, id) => Math.max(n, idNumber(id)), 0);
    const pointAt = 1 + pick(random, highest + 2);
    const body = { ...base, sequences: { ...base.sequences, hazard: pointAt } };
    const before = snapshot(body);
    const wouldAssign = hazardId.fromSequence(pointAt);
    const outcome = await withClock(HELD, () => registry.createHazard(body, actOf(p), { title: 'probe' })).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
    if (held.includes(wouldAssign)) {
      rejections += 1;
      assert.ok(!outcome.ok && outcome.e instanceof errors.HazardSequenceError && outcome.e.id === wouldAssign, `run ${run}: sequence ${pointAt} points at held ${wouldAssign}`);
    } else {
      assignments += 1;
      assert.ok(outcome.ok && outcome.v.hazard.id === wouldAssign && outcome.v.body.sequences.hazard === pointAt + 1, `run ${run}: sequence ${pointAt} assigns free ${wouldAssign}`);
    }
    assert.deepEqual(body, before, `run ${run}: the body passed in is unchanged`);
  }
  assert.ok(rejections >= 8 && assignments >= 8, `the seed produced ${rejections} rejections and ${assignments} assignments; it must exercise both`);
});

test('the body is a value: every operation given a deeply frozen random body neither throws for it nor changes it, resolved or rejected, and a changing operation returns a new body (C-003)', async () => {
  const random = prng(SEED + 3);
  const profiles = [newProfile('Alice'), newProfile('Bob')];
  let resolvedOnFrozen = 0;
  for (let run = 0; run < 12; run += 1) {
    const body = deepFreeze(randomBody(random, profiles));
    const before = snapshot(body);
    for (let i = 0; i < 20; i += 1) {
      const { name, call } = randomCall(random, body, profiles);
      const outcome = await withClock(HELD, () => call(body)).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
      if (!outcome.ok) assert.ok(!(outcome.e instanceof TypeError), `run ${run}: ${name}: a frozen body is not written to (got ${String(outcome.e)})`);
      else { resolvedOnFrozen += 1; assert.notEqual(outcome.v.body, body, `run ${run}: ${name} returns a body, not the one passed in`); }
      assert.deepEqual(body, before, `run ${run}: ${name}: the body is deep-equal to what it was`);
    }
    const reads = [
      registry.listHazards(body), registry.listAllHazards(body), registry.listControls(body), registry.listAllControls(body), registry.listPlatforms(body), registry.listAllPlatforms(body),
      ...Object.keys(entriesOf(body, 'platform')).map((id) => registry.listPlatformHazards(body, /** @type {any} */ (id))),
      ...Object.keys(entriesOf(body, 'hazard')).map((id) => registry.getHazardDetail(body, /** @type {any} */ (id))),
    ];
    await Promise.all(reads);
    assert.deepEqual(body, before, `run ${run}: reads change nothing`);
  }
  assert.ok(resolvedOnFrozen >= 30, `the seed resolved ${resolvedOnFrozen} calls on frozen bodies; it must exercise the rule`);
});

test('HZ-007: over any sequence of every other operation, the control-platform links a body holds are exactly the confirmations made, one per confirmControlForPlatform, each over the one control it named, and a link keeps who confirmed and when whatever follows (C-013, C-022; SL-04 criterion 4)', async () => {
  const random = prng(SEED + 4);
  const profiles = [newProfile('Alice'), newProfile('Bob')];
  let confirmations = 0;
  let others = 0;
  for (let run = 0; run < 10; run += 1) {
    let body = randomBody(random, profiles);
    /** @type {Map<string, any>} every control-platform link ever seen, as created */
    const created = new Map(Object.values(entriesOf(body, 'link')).filter((l) => l.linkKind === 'control-platform').map((l) => [l.id, snapshot(l)]));
    let clock = plusSeconds(HELD, run * 5000);
    for (let step = 0; step < 60; step += 1) {
      clock = plusSeconds(clock, 1);
      const { name, act, call } = randomCall(random, body, profiles);
      const outcome = await withClock(clock, () => call(body)).then((v) => ({ ok: true, v }), () => ({ ok: false, v: null }));
      if (!outcome.ok) continue;
      const cp = Object.values(entriesOf(outcome.v.body, 'link')).filter((l) => l.linkKind === 'control-platform');
      const fresh = cp.filter((l) => !created.has(l.id));
      if (name === 'confirmControlForPlatform') {
        confirmations += 1;
        assert.equal(fresh.length, 1, `run ${run} step ${step}: one confirmation, one link`);
        assert.deepEqual([fresh[0].createdBy, fresh[0].createdAtAest], [act.profile.id, clock], 'stamped with who confirmed and when');
      } else {
        others += 1;
        assert.equal(fresh.length, 0, `run ${run} step ${step}: ${name} put no control on a platform`);
      }
      for (const l of cp) {
        const first = created.get(l.id) ?? l;
        assert.deepEqual([l.hazardId, l.controlId, l.platformId, l.createdBy, l.createdAtAest], [first.hazardId, first.controlId, first.platformId, first.createdBy, first.createdAtAest], `run ${run} step ${step}: no operation rewrites a confirmation's ids or who and when (C-022)`);
        if (!created.has(l.id)) created.set(l.id, snapshot(l));
      }
      assert.equal(cp.length, created.size, `run ${run} step ${step}: no confirmation row is removed`);
      body = outcome.v.body;
    }
  }
  assert.ok(confirmations >= 5 && others >= 100, `the seed produced ${confirmations} confirmations and ${others} other resolved acts`);
});

test('HZ-001: over random confirmations and exclusions of a hazard\'s controls on its platforms, every triple is confirmed, excluded, or awaiting and never two; the state every row shows is the one C-021 derives; superseded rows stay with status deleted (C-020, C-021; SL-04 criteria 1, 2 and 4)', async () => {
  const random = prng(SEED + 5);
  const profiles = [newProfile('Alice'), newProfile('Bob')];
  let states = { confirmed: 0, excluded: 0, awaiting: 0 };
  let supersessions = 0;
  for (let run = 0; run < 10; run += 1) {
    const p = profiles[0];
    const platforms = [orderedUuid(1, 0xa), orderedUuid(2, 0xa)];
    const controls = [orderedUuid(1, 0xc), orderedUuid(2, 0xc), orderedUuid(3, 0xc)];
    const hazards = [hazardRow(1, p, 'one'), hazardRow(2, p, 'two')];
    let body = bodyFrom([
      ...hazards, ...platforms.map((id, i) => platformRow(id, p, `P${i}`, p)), ...controls.map((id, i) => controlRow(id, p, `C${i}`)),
      ...hazards.flatMap((h, i) => controls.map((c, j) => hazardControlLinkRow(orderedUuid(100 + i * 10 + j), p, h.id, c, 'preventative'))),
      ...hazards.flatMap((h, i) => platforms.map((q, j) => hazardPlatformLinkRow(orderedUuid(200 + i * 10 + j), p, h.id, /** @type {any} */ (q)))),
    ]);
    let clock = plusSeconds(HELD, run * 1000);
    for (let step = 0; step < 60; step += 1) {
      clock = plusSeconds(clock, pick(random, 2));
      const t = { hazardId: oneOf(random, hazards).id, controlId: oneOf(random, controls), platformId: oneOf(random, platforms) };
      const act = actOf(oneOf(random, profiles), oneOf(random, [null, ...platforms]));
      const was = stateModel(body, t);
      if (random() < 0.5) {
        const outcome = await withClock(clock, () => registry.confirmControlForPlatform(body, act, t)).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
        if (was.state === 'confirmed') { assert.ok(!outcome.ok && outcome.e instanceof errors.DuplicateLinkError, `run ${run} step ${step}: confirming twice`); continue; }
        assert.ok(outcome.ok, `run ${run} step ${step}: confirm resolves, got ${outcome.ok ? '' : String(outcome.e)}`);
        if (was.state === 'excluded') {
          supersessions += 1;
          assert.deepEqual(outcome.v.clearedJustification, { ...was.justification, status: 'deleted', updatedBy: act.profile.id, updatedAtAest: clock });
        } else assert.equal(outcome.v.clearedJustification, null);
        body = outcome.v.body;
      } else {
        const outcome = await withClock(clock, () => registry.excludeControlFromPlatform(body, act, { ...t, text: `reason ${step}` })).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
        if (was.state === 'excluded') { assert.ok(!outcome.ok && outcome.e instanceof errors.AlreadyExcludedError, `run ${run} step ${step}: excluding twice`); continue; }
        assert.ok(outcome.ok, `run ${run} step ${step}: exclude resolves, got ${outcome.ok ? '' : String(outcome.e)}`);
        if (was.state === 'confirmed') {
          supersessions += 1;
          const link = liveLinks(body).find((l) => l.linkKind === 'control-platform' && l.hazardId === t.hazardId && /** @type {any} */ (l).controlId === t.controlId && /** @type {any} */ (l).platformId === t.platformId);
          assert.deepEqual(outcome.v.removedLink, { ...link, status: 'deleted', updatedBy: act.profile.id, updatedAtAest: clock });
        } else assert.equal(outcome.v.removedLink, null);
        body = outcome.v.body;
      }
      assertOneStatePerTriple(body, `run ${run} step ${step}`);
      for (const q of platforms) {
        const { rows } = await registry.listPlatformHazards(body, /** @type {any} */ (q));
        for (const row of rows) {
          assert.equal(row.controls.length, controls.length, 'every one of the hazard\'s controls is shown against the platform, whatever its state');
          for (const pc of row.controls) {
            const expected = stateModel(body, { hazardId: row.hazard.id, controlId: pc.control.id, platformId: /** @type {any} */ (q) });
            assert.deepEqual({ state: pc.state, confirmation: pc.confirmation, justification: pc.justification }, expected, `run ${run} step ${step}: the state C-021 derives`);
            states[pc.state] += 1;
          }
        }
      }
    }
  }
  assert.ok(states.confirmed >= 100 && states.excluded >= 100 && states.awaiting >= 100 && supersessions >= 30, `the seed produced ${JSON.stringify(states)} and ${supersessions} supersessions`);
});

test('HZ-002: whatever controls are linked, confirmed, or excluded and whatever platforms a hazard joins, the residual values read back are exactly the last ones setRating was given for that hazard, platform, and stage (C-017; SL-03 criterion 5)', async () => {
  const random = prng(SEED + 6);
  const p = newProfile('Alice');
  let reads = 0;
  for (let run = 0; run < 10; run += 1) {
    const platforms = [orderedUuid(1, 0xa), orderedUuid(2, 0xa), orderedUuid(3, 0xa)];
    const controls = [orderedUuid(1, 0xc), orderedUuid(2, 0xc)];
    const h = hazardRow(1, p, 'one');
    let body = bodyFrom([h, ...platforms.map((id, i) => platformRow(id, p, `P${i}`, p)), ...controls.map((id, i) => controlRow(id, p, `C${i}`)), hazardPlatformLinkRow(orderedUuid(9), p, h.id, /** @type {any} */ (platforms[0]))]);
    /** @type {Map<string, { consequence: any, likelihood: any }>} */
    const entered = new Map();
    let clock = plusSeconds(HELD, run * 1000);
    for (let step = 0; step < 60; step += 1) {
      clock = plusSeconds(clock, 1);
      const act = actOf(p);
      const q = /** @type {any} */ (oneOf(random, platforms));
      const c = /** @type {any} */ (oneOf(random, controls));
      const r = random();
      /** @type {() => Promise<any>} */
      let call;
      if (r < 0.3) {
        const stage = oneOf(random, /** @type {const} */ (['initial', 'residual']));
        const values = { consequence: oneOf(random, [null, 1, 2, 3, 4, 5]), likelihood: oneOf(random, [null, 'A', 'B', 'C', 'D', 'E', 'F', 'G']) };
        call = async () => { const v = await registry.setRating(body, act, /** @type {any} */ ({ hazardId: h.id, platformId: q, stage, ...values })); entered.set(`${q}|${stage}`, values); return v; };
      } else if (r < 0.45) call = () => registry.linkControlToHazard(body, act, { hazardId: h.id, controlId: c, controlKind: 'mitigating' });
      else if (r < 0.6) call = () => registry.linkHazardToPlatform(body, act, { hazardId: h.id, platformId: q });
      else if (r < 0.75) call = () => registry.confirmControlForPlatform(body, act, { hazardId: h.id, controlId: c, platformId: q });
      else if (r < 0.9) call = () => registry.excludeControlFromPlatform(body, act, { hazardId: h.id, controlId: c, platformId: q, text: 'removed' });
      else call = () => registry.setPlatformReportId(body, act, { hazardId: h.id, platformId: q, reportId: /** @type {any} */ (`R${step}`) });
      const outcome = await withClock(clock, call).then((v) => ({ ok: true, v }), () => ({ ok: false, v: null }));
      if (outcome.ok) body = outcome.v.body;
      for (const platform of platforms) {
        const ratings = await registry.getRatings(body, h.id, /** @type {any} */ (platform));
        for (const stage of /** @type {const} */ (['initial', 'residual'])) {
          assert.deepEqual(ratings[stage], entered.get(`${platform}|${stage}`) ?? { consequence: null, likelihood: null }, `run ${run} step ${step}: ${stage} on ${platform} is what was last entered`);
          reads += 1;
        }
        const { rows } = await registry.listPlatformHazards(body, /** @type {any} */ (platform));
        for (const row of rows) assert.deepEqual(row.residual, entered.get(`${platform}|residual`) ?? { consequence: null, likelihood: null }, `run ${run} step ${step}: the row's residual on ${platform} is what was last entered`);
        assert.deepEqual(valuesModel(body, h.id, platform, 'residual'), entered.get(`${platform}|residual`) ?? { consequence: null, likelihood: null }, 'one live rating per stage holds it');
      }
    }
    assert.ok(entered.size > 0);
  }
  assert.ok(reads >= 3000);
});

test('HZ-004: over random bodies with malformed controls, justifications, and residual ratings that rows of a platform carry, every live hazard with a live link to that platform is exactly one row or named exactly once in omitted with the key and the reason, and nothing else is in either (C-019, C-008; SL-03 criterion 9)', async () => {
  const random = prng(SEED + 7);
  const profiles = [newProfile('Alice'), newProfile('Bob')];
  let expectRows = 0;
  let expectOmitted = 0;
  for (let run = 0; run < 150; run += 1) {
    const body = randomBody(random, profiles);
    const platforms = Object.keys(entriesOf(body, 'platform'));
    if (platforms.length === 0) continue;
    const platform = oneOf(random, platforms);
    const collections = /** @type {any} */ (body.collections);
    const hp = liveLinks(body).filter((l) => l.linkKind === 'hazard-platform' && /** @type {any} */ (l).platformId === platform);
    const listed = hp.map((l) => l.hazardId).filter((id) => entriesOf(body, 'hazard')[id].status === 'live');
    const hc = liveLinks(body).filter((l) => l.linkKind === 'hazard-control' && listed.includes(l.hazardId));
    /** @type {Map<string, Set<string>>} hazard -> `reason|key` it may be omitted for */
    const spoiled = new Map();
    const spoil = (/** @type {string} */ hazard, /** @type {string} */ reason, /** @type {string} */ key) => {
      if (!spoiled.has(hazard)) spoiled.set(hazard, new Set());
      /** @type {Set<string>} */ (spoiled.get(hazard)).add(`${reason}|${key}`);
    };
    // Only records a row of this platform carries are made malformed: C-008 leaves open what a
    // malformed record no row depends on does to this query, so this test does not ask.
    for (const c of new Set(hc.map((l) => /** @type {any} */ (l).controlId))) {
      if (random() < 0.12) {
        collections.control[c] = { ...collections.control[c], title: null };
        for (const l of hc.filter((x) => /** @type {any} */ (x).controlId === c)) spoil(l.hazardId, 'malformed-control', c);
      }
    }
    for (const j of Object.values(entriesOf(body, 'justification'))) {
      if (j.status === 'live' && j.platformId === platform && hc.some((l) => l.hazardId === j.hazardId && /** @type {any} */ (l).controlId === j.controlId) && random() < 0.2) {
        collections.justification[j.id] = { ...j, text: 42 };
        spoil(j.hazardId, 'malformed-justification', j.id);
      }
    }
    for (const r of Object.values(entriesOf(body, 'rating'))) {
      if (r.status === 'live' && r.stage === 'residual' && r.platformId === platform && listed.includes(r.hazardId) && random() < 0.2) {
        collections.rating[r.id] = { ...r, consequence: 'high' };
        spoil(r.hazardId, 'malformed-rating', r.id);
      }
    }
    expectOmitted += spoiled.size;
    expectRows += listed.length - spoiled.size;
    const at = `run ${run} platform ${platform}`;
    const before = snapshot(body);
    const result = await registry.listPlatformHazards(body, /** @type {any} */ (platform));
    const inRows = result.rows.map((r) => r.hazard.id);
    const inOmitted = result.omitted.map((o) => o.id);
    assert.deepEqual([...inRows, ...inOmitted].sort(), [...listed].sort(), `${at}: every live linked live hazard exactly once across rows and omitted, and nothing else`);
    assert.deepEqual(inRows, [...inRows].sort((a, b) => idNumber(a) - idNumber(b)), `${at}: rows by number`);
    assert.deepEqual([...inOmitted].sort(), [...spoiled.keys()].sort(), `${at}: omitted exactly when a record the row would carry is malformed`);
    for (const o of result.omitted) {
      assert.ok(/** @type {Set<string>} */ (spoiled.get(o.id)).has(`${o.reason}|${o.key}`), `${at}: ${o.id} omitted for ${o.reason} ${o.key}, a malformed record its row would carry`);
      assert.ok(typeof o.detail === 'string' && o.detail.trim() !== '', `${at}: a sentence naming the field`);
    }
    assert.deepEqual(body, before, `${at}: a read changes nothing`);
  }
  assert.ok(expectRows >= 30 && expectOmitted >= 15, `the seed made ${expectRows} rows and ${expectOmitted} omissions; it must exercise both (change it on purpose if this fails)`);
});

test('confinement: with the clock held, the same call on deep-equal bodies resolves with deep-equal results but for the ids IdKind.fresh returns, the input is never remembered, and the browser\'s storage is not read or written (C-007, section 5 determinism)', async () => {
  const random = prng(SEED + 8);
  const profiles = [newProfile('Alice'), newProfile('Bob')];
  /**
   * The body and its log with the fresh ids a new entry and a new record carry set aside.
   * @param {any} change
   */
  const comparable = async (change) => {
    const { [LOG]: _log, ...collections } = change.body.collections;
    const entries = (await changeLog.listEntries(change.body)).map(({ id: _id, ...rest }) => rest);
    return { collections, sequences: change.body.sequences, hazard: change.hazard, entries };
  };
  const { uses } = await withBrowserStorageSpies(async () => {
    for (let run = 0; run < 10; run += 1) {
      const body = randomBody(random, profiles);
      const twin = snapshot(body);
      const p = profiles[run % 2];
      const clock = plusSeconds(HELD, run * 7);
      const live = hazardsModel(body).filter((h) => !liveLinks(body).some((l) => l.linkKind === 'hazard-platform' && l.hazardId === h.id));
      /** @type {((b: DataBody) => Promise<any>)[]} */
      const calls = [
        (b) => registry.createHazard(b, actOf(p), { title: 'same call' }),
        ...live.slice(0, 1).flatMap((h) => [
          (/** @type {DataBody} */ b) => registry.updateHazard(b, actOf(p), h.id, { title: `${h.title} again` }),
          (/** @type {DataBody} */ b) => registry.deleteHazard(b, actOf(p), h.id),
          (/** @type {DataBody} */ b) => registry.retireHazard(b, actOf(p), h.id),
        ]),
      ];
      for (const call of calls) {
        const a = await withClock(clock, () => call(body));
        const b = await withClock(clock, () => call(twin));
        const again = await withClock(clock, () => call(body));
        assert.deepEqual(await comparable(a), await comparable(b), `run ${run}: the same call on deep-equal bodies`);
        assert.deepEqual(await comparable(again), await comparable(a), `run ${run}: and again on the same body: nothing was remembered`);
      }
      for (const platform of Object.keys(entriesOf(body, 'platform'))) {
        assert.deepEqual(await registry.listPlatformHazards(body, /** @type {any} */ (platform)), await registry.listPlatformHazards(twin, /** @type {any} */ (platform)), `run ${run}: a read is a function of the body`);
      }
    }
  });
  assert.deepEqual(uses, [], 'nothing was read from or written to localStorage or sessionStorage');
});

test('reads are harmless: on the same random body, every read called any number of times resolves with deep-equal results and the body stays as it was (section 5 idempotency)', async () => {
  const random = prng(SEED + 9);
  const profiles = [newProfile('Alice')];
  for (let run = 0; run < 8; run += 1) {
    const body = randomBody(random, profiles);
    const before = snapshot(body);
    const readAll = async () => ({
      hazards: await registry.listAllHazards(body),
      controls: await registry.listAllControls(body),
      platforms: await registry.listAllPlatforms(body),
      rows: await Promise.all(Object.keys(entriesOf(body, 'platform')).map((id) => registry.listPlatformHazards(body, /** @type {any} */ (id)))),
      affected: await Promise.all(OWNED_KINDS.flatMap((kind) => Object.keys(entriesOf(body, kind)).map((id) => registry.platformsAffected(body, { kind, id })))),
      links: await Promise.all(['hazard', 'control', 'platform'].flatMap((kind) => Object.keys(entriesOf(body, kind)).map((id) => registry.listLinks(body, /** @type {any} */ ({ kind, id }))))),
    });
    const first = await readAll();
    for (let i = 0; i < 3; i += 1) assert.deepEqual(await readAll(), first, `run ${run}: read ${i + 2} is the first`);
    assert.deepEqual(body, before, `run ${run}: the body is as it was`);
  }
  assert.deepEqual(schema.emptyDataBody(), { collections: {}, sequences: { hazard: 1 } }, 'the baseline empty body the suite starts from');
});

test('a stored justification or rating is never written by an operation other than its own, and every body a changing operation returns holds only records section 3 describes (C-004, C-017, C-020; REQ-035)', async () => {
  const random = prng(SEED + 10);
  const profiles = [newProfile('Alice'), newProfile('Bob')];
  let checked = 0;
  for (let run = 0; run < 8; run += 1) {
    let body = randomBody(random, profiles);
    for (let step = 0; step < 25; step += 1) {
      const { name, call } = randomCall(random, body, profiles);
      const outcome = await withClock(plusSeconds(HELD, step), () => call(body)).then((v) => ({ ok: true, v }), () => ({ ok: false, v: null }));
      if (!outcome.ok) continue;
      if (name === 'createPlatform') {
        const extra = differences(body, outcome.v.body);
        assert.deepEqual(extra, [`platform/${outcome.v.platform.id}`], `run ${run} step ${step}: adding a platform leaves every hazard, control, and link equal, record for record (REQ-035)`);
      }
      assertStoredOnce(outcome.v.body, `run ${run} step ${step}: ${name}`);
      checked += 1;
      body = outcome.v.body;
    }
  }
  assert.ok(checked >= 30, `the seed resolved ${checked} calls`);
});
