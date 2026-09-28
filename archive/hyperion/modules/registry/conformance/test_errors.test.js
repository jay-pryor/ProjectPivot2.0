/**
 * registry conformance: errors (CORE-CON-002). Every condition in section 4 of
 * modules/registry/CONTRACT.md 5.0, signalled as the named rejected promise with the body
 * passed in deep-equal to what it was afterwards ("body unchanged"); the order section 4
 * gives when two conditions hold at once; C-008's malformed records, refused or, in
 * `listPlatformHazards`, named as omitted; and a rejection from `change-log.recordChange`
 * passed through unchanged (C-023). Written from the contract before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1): an implementation that enforces
 * nothing resolves where every test below expects a rejection.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as registry from '../contract.js';
import {
  AlreadyExcludedError, ControlNotLiveError, ControlNotOnHazardError, DuplicateLinkError, HazardNotLiveError, HazardNotOnPlatformError,
  HazardOnPlatformsError, HazardSequenceError, InvalidActError, InvalidCausalFactorTextError, InvalidConsequenceTextError, InvalidControlKindError,
  InvalidControlTitleError, InvalidHazardTitleError, InvalidJustificationTextError, InvalidOwnerError, InvalidPlatformNameError,
  InvalidPlatformReportIdError, InvalidRatingStageError, InvalidRatingValueError, MalformedCausalFactorError, MalformedConsequenceError,
  MalformedControlError, MalformedHazardError, MalformedJustificationError, MalformedLinkError, MalformedPlatformError, MalformedRatingError,
  MalformedRecordError, MissingProfileError, NoChangeError, PlatformNotLiveError, UnknownControlError, UnknownHazardError, UnknownPlatformError,
  UnownedRecordKindError,
} from '../contract.js';
import { controlId, hazardId, platformId } from '../../../baseline/types.js';
import {
  HELD, LOG, UNOWNED_KINDS, actOf, assertRefused, bodyFrom, causalFactorRow, changeLog, consequenceRow, controlPlatformLinkRow, controlRow,
  hazardControlLinkRow, hazardPlatformLinkRow, hazardRow, justificationRow, newProfile, orderedUuid, platformRow, ratingRow, rejectionOf, schema,
  snapshot, withClock,
} from './harness.js';

/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../contract.js').Act} Act */

/**
 * One body holding every precondition section 4 names, built directly so no call is needed
 * to set it up. Alpha and Bravo are live, Retired and Gone are not; H-0001 is live on Alpha
 * and Bravo with Stall (preventative, confirmed on Bravo) and Training (mitigating, excluded
 * on Alpha); H-0002 is live on nothing; H-0003 is deleted and still linked to Alpha; H-0004
 * is retired; Spare is a live control on no hazard; Old is retired and Dead deleted; H-0001
 * has a residual rating on Alpha.
 */
function fixture() {
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const alpha = platformId.parse(orderedUuid(1, 0xa));
  const bravo = platformId.parse(orderedUuid(2, 0xa));
  const retired = platformId.parse(orderedUuid(3, 0xa));
  const gone = platformId.parse(orderedUuid(4, 0xa));
  const h1 = hazardId.fromSequence(1);
  const h2 = hazardId.fromSequence(2);
  const h3 = hazardId.fromSequence(3);
  const h4 = hazardId.fromSequence(4);
  const stall = controlId.parse(orderedUuid(1, 0xc));
  const training = controlId.parse(orderedUuid(2, 0xc));
  const spare = controlId.parse(orderedUuid(3, 0xc));
  const old = controlId.parse(orderedUuid(4, 0xc));
  const dead = controlId.parse(orderedUuid(5, 0xc));
  const onBravoLink = orderedUuid(11, 0x1);
  const onAlphaLink = orderedUuid(10, 0x1);
  const stallLink = orderedUuid(12, 0x1);
  const trainingLink = orderedUuid(13, 0x1);
  const confirmation = orderedUuid(14, 0x1);
  const exclusion = orderedUuid(15, 0x1);
  const rating = orderedUuid(16, 0x1);
  const body = bodyFrom([
    platformRow(alpha, alice, 'Alpha', alice), platformRow(bravo, alice, 'Bravo', bob),
    platformRow(retired, alice, 'Retired', alice, { status: 'retired' }), platformRow(gone, alice, 'Gone', alice, { status: 'deleted' }),
    hazardRow(1, alice, 'one'), hazardRow(2, alice, 'two'), hazardRow(3, alice, 'three', { status: 'deleted' }), hazardRow(4, alice, 'four', { status: 'retired' }),
    controlRow(stall, alice, 'Stall'), controlRow(training, alice, 'Training'), controlRow(spare, alice, 'Spare'),
    controlRow(old, alice, 'Old', { status: 'retired' }), controlRow(dead, alice, 'Dead', { status: 'deleted' }),
    hazardPlatformLinkRow(onBravoLink, alice, h1, bravo), hazardPlatformLinkRow(onAlphaLink, alice, h1, alpha),
    hazardPlatformLinkRow(orderedUuid(17, 0x1), alice, h3, alpha),
    hazardPlatformLinkRow(orderedUuid(18, 0x1), alice, h2, alpha, { status: 'deleted' }),
    hazardControlLinkRow(stallLink, alice, h1, stall, 'preventative'), hazardControlLinkRow(trainingLink, alice, h1, training, 'mitigating'),
    hazardControlLinkRow(orderedUuid(19, 0x1), alice, h1, old, 'preventative'),
    controlPlatformLinkRow(confirmation, alice, { hazardId: h1, controlId: stall, platformId: bravo }),
    justificationRow(exclusion, alice, { hazardId: h1, controlId: training, platformId: alpha }, 'not fitted'),
    ratingRow(rating, alice, { hazardId: h1, platformId: alpha, stage: 'residual', consequence: 3, likelihood: 'C' }),
  ]);
  return {
    alice, bob, body, alpha, bravo, retired, gone, h1, h2, h3, h4, stall, training, spare, old, dead, onAlphaLink, onBravoLink, stallLink, confirmation, exclusion, rating,
  };
}

/**
 * Every changing operation, each a call that resolves on the fixture with a good act.
 * @param {ReturnType<typeof fixture>} f
 * @param {DataBody} [body]
 * @returns {[string, (act: any) => Promise<unknown>][]}
 */
function changingCalls(f, body = f.body) {
  return [
    ['createHazard', (act) => registry.createHazard(body, act, { title: 'new' })],
    ['updateHazard', (act) => registry.updateHazard(body, act, f.h1, { title: 'renamed' })],
    ['deleteHazard', (act) => registry.deleteHazard(body, act, f.h2)],
    ['retireHazard', (act) => registry.retireHazard(body, act, f.h2)],
    ['addCausalFactor', (act) => registry.addCausalFactor(body, act, f.h1, { text: 'cause' })],
    ['addConsequence', (act) => registry.addConsequence(body, act, f.h1, { text: 'effect' })],
    ['createControl', (act) => registry.createControl(body, act, { title: 'new control' })],
    ['retireControl', (act) => registry.retireControl(body, act, f.spare)],
    ['linkControlToHazard', (act) => registry.linkControlToHazard(body, act, { hazardId: f.h1, controlId: f.spare, controlKind: 'preventative' })],
    ['createPlatform', (act) => registry.createPlatform(body, act, { name: 'Charlie', ownerProfileId: f.alice.id })],
    ['retirePlatform', (act) => registry.retirePlatform(body, act, f.bravo)],
    ['setPlatformOwner', (act) => registry.setPlatformOwner(body, act, { platformId: f.alpha, ownerProfileId: f.bob.id })],
    ['linkHazardToPlatform', (act) => registry.linkHazardToPlatform(body, act, { hazardId: f.h2, platformId: f.alpha })],
    ['setPlatformReportId', (act) => registry.setPlatformReportId(body, act, { hazardId: f.h1, platformId: f.alpha, reportId: 'ALPHA-1' })],
    ['confirmControlForPlatform', (act) => registry.confirmControlForPlatform(body, act, { hazardId: f.h1, controlId: f.training, platformId: f.alpha })],
    ['excludeControlFromPlatform', (act) => registry.excludeControlFromPlatform(body, act, { hazardId: f.h1, controlId: f.stall, platformId: f.alpha, text: 'reason' })],
    ['setRating', (act) => registry.setRating(body, act, { hazardId: f.h1, platformId: f.bravo, stage: 'residual', consequence: /** @type {any} */ (2), likelihood: /** @type {any} */ ('B') })],
  ];
}

// ------------------------------------------------------------------ the act (section 4, C-023)

test('every changing operation with no act, no profile, or a profile whose id is not a user profile id rejects with MissingProfileError; body unchanged (section 4; REQ-055)', async () => {
  const f = fixture();
  const badActs = /** @type {unknown[]} */ ([
    undefined, null, {}, { madeForPlatformId: null }, { profile: null, madeForPlatformId: null }, { profile: {}, madeForPlatformId: null },
    { profile: { name: 'no id' }, madeForPlatformId: null }, { profile: { id: 'H-0001', name: 'x' }, madeForPlatformId: null },
    { profile: { id: 'not-a-uuid', name: 'x' }, madeForPlatformId: null }, { profile: { id: 42, name: 'x' }, madeForPlatformId: null },
  ]);
  for (const [name, call] of changingCalls(f)) {
    for (const act of badActs) await assertRefused(() => withClock(HELD, () => call(act)), MissingProfileError, f.body, `${name} with act ${JSON.stringify(act)}`);
  }
});

test('every changing operation whose act.madeForPlatformId is absent, or neither null nor a platform id, rejects with InvalidActError naming the value; body unchanged (section 4, C-023; DEC-016)', async () => {
  const f = fixture();
  for (const [name, call] of changingCalls(f)) {
    await assertRefused(() => withClock(HELD, () => call({ profile: f.alice })), InvalidActError, f.body, `${name} with madeForPlatformId left off`);
    for (const given of /** @type {unknown[]} */ (['', 'Alpha', 'H-0001', 42, {}, [f.alpha], f.alpha.toUpperCase()])) {
      const e = await assertRefused(() => withClock(HELD, () => call({ profile: f.alice, madeForPlatformId: given })), InvalidActError, f.body, `${name} made for ${JSON.stringify(given)}`);
      assert.deepEqual(e.given, given, `${name}: InvalidActError names ${JSON.stringify(given)}`);
    }
  }
});

test('every changing operation whose act is made for a platform id no platform in the body has rejects with UnknownPlatformError; body unchanged (section 4)', async () => {
  const f = fixture();
  const nowhere = platformId.parse(orderedUuid(99, 0xa));
  for (const [name, call] of changingCalls(f)) {
    const e = await assertRefused(() => withClock(HELD, () => call(actOf(f.alice, nowhere))), UnknownPlatformError, f.body, `${name} made for an unknown platform`);
    assert.equal(e.id, nowhere, `${name}: carrying the id`);
  }
});

test('when change-log.recordChange rejects, every changing operation rejects with that error unchanged, writes nothing, and leaves the body unchanged; reads are unaffected (section 4, C-023; HZ-005)', async () => {
  const f = fixture();
  const collections = /** @type {any} */ ({ ...f.body.collections, [LOG]: { broken: { id: 'broken', kind: LOG } } });
  const body = { ...f.body, collections };
  for (const [name, call] of changingCalls(f, body)) {
    await assertRefused(() => withClock(HELD, () => call(actOf(f.alice, f.alpha))), changeLog.MalformedEntryError, body, `${name} on a body whose log change-log cannot read`);
  }
  assert.equal((await registry.listHazards(body)).length, 2, 'a read of this module does not read the log');
  assert.equal((await registry.listPlatformHazards(body, f.alpha)).rows.length, 1);
});

// ------------------------------------------------------------------ field values

test('a title, name, or text that is empty once trimmed is refused with its own error, and nothing is stored; body unchanged (C-001, C-009, C-010, C-011, C-014, C-020; REQ-058)', async () => {
  const f = fixture();
  const a = actOf(f.alice);
  for (const blank of ['', ' ', '   ', '\t', '\n', ' \t\n ']) {
    const at = JSON.stringify(blank);
    await assertRefused(() => withClock(HELD, () => registry.createHazard(f.body, a, { title: blank })), InvalidHazardTitleError, f.body, `createHazard(${at})`);
    await assertRefused(() => withClock(HELD, () => registry.updateHazard(f.body, a, f.h1, { title: blank })), InvalidHazardTitleError, f.body, `updateHazard(${at})`);
    await assertRefused(() => withClock(HELD, () => registry.addCausalFactor(f.body, a, f.h1, { text: blank })), InvalidCausalFactorTextError, f.body, `addCausalFactor(${at})`);
    await assertRefused(() => withClock(HELD, () => registry.addConsequence(f.body, a, f.h1, { text: blank })), InvalidConsequenceTextError, f.body, `addConsequence(${at})`);
    await assertRefused(() => withClock(HELD, () => registry.createControl(f.body, a, { title: blank })), InvalidControlTitleError, f.body, `createControl(${at})`);
    await assertRefused(() => withClock(HELD, () => registry.createPlatform(f.body, a, { name: blank, ownerProfileId: f.alice.id })), InvalidPlatformNameError, f.body, `createPlatform(${at})`);
    await assertRefused(() => withClock(HELD, () => registry.excludeControlFromPlatform(f.body, a, { hazardId: f.h1, controlId: f.stall, platformId: f.alpha, text: blank })), InvalidJustificationTextError, f.body, `excludeControlFromPlatform(${at})`);
  }
  assert.equal(f.body.sequences.hazard, 5, 'no id was assigned');
});

test('createPlatform and setPlatformOwner with an owner that is missing or not a user profile id reject with InvalidOwnerError; body unchanged (C-014, C-028; REQ-065)', async () => {
  const f = fixture();
  const a = actOf(f.alice);
  for (const owner of /** @type {unknown[]} */ ([undefined, null, '', 'alice', f.h1, 7, [f.alice.id], { id: f.alice.id }])) {
    await assertRefused(() => withClock(HELD, () => registry.createPlatform(f.body, a, /** @type {any} */ ({ name: 'Charlie', ownerProfileId: owner }))), InvalidOwnerError, f.body, `createPlatform owned by ${JSON.stringify(owner)}`);
    await assertRefused(() => withClock(HELD, () => registry.setPlatformOwner(f.body, a, /** @type {any} */ ({ platformId: f.alpha, ownerProfileId: owner }))), InvalidOwnerError, f.body, `setPlatformOwner to ${JSON.stringify(owner)}`);
  }
  await assertRefused(() => withClock(HELD, () => registry.createPlatform(f.body, a, /** @type {any} */ ({ name: 'Charlie' }))), InvalidOwnerError, f.body, 'createPlatform with no owner field');
});

test('linkControlToHazard with a control kind that is neither preventative nor mitigating rejects with InvalidControlKindError; body unchanged (C-012; REQ-044)', async () => {
  const f = fixture();
  for (const kind of /** @type {unknown[]} */ ([undefined, null, '', 'Preventative', 'both', 'detective', 1])) {
    await assertRefused(() => withClock(HELD, () => registry.linkControlToHazard(f.body, actOf(f.alice), /** @type {any} */ ({ hazardId: f.h1, controlId: f.spare, controlKind: kind }))), InvalidControlKindError, f.body, `controlKind ${JSON.stringify(kind)}`);
  }
});

test('setPlatformReportId with an ID that is empty or has leading or trailing whitespace rejects with InvalidPlatformReportIdError; body unchanged (C-016; REQ-052)', async () => {
  const f = fixture();
  for (const reportId of ['', ' ', ' ALPHA-1', 'ALPHA-1 ', '\tALPHA-1', 'ALPHA-1\n']) {
    await assertRefused(() => withClock(HELD, () => registry.setPlatformReportId(f.body, actOf(f.alice), { hazardId: f.h1, platformId: f.alpha, reportId: /** @type {any} */ (reportId) })), InvalidPlatformReportIdError, f.body, `reportId ${JSON.stringify(reportId)}`);
  }
});

test('setRating with a stage that is neither initial nor residual rejects with InvalidRatingStageError; body unchanged (C-018)', async () => {
  const f = fixture();
  for (const stage of /** @type {unknown[]} */ ([undefined, null, '', 'Initial', 'final', 0])) {
    await assertRefused(() => withClock(HELD, () => registry.setRating(f.body, actOf(f.alice), /** @type {any} */ ({ hazardId: f.h1, platformId: f.alpha, stage, consequence: 2, likelihood: 'B' }))), InvalidRatingStageError, f.body, `stage ${JSON.stringify(stage)}`);
  }
});

test('setRating with a consequence that is neither null nor a whole number 1 to 5, or a likelihood that is neither null nor one of A to G, rejects with InvalidRatingValueError naming the field and the value; nothing stored; body unchanged (C-018; SL-03 criterion 6)', async () => {
  const f = fixture();
  const a = actOf(f.alice);
  for (const consequence of /** @type {unknown[]} */ ([0, 6, -1, 2.5, '3', 'three', undefined, NaN, true, [3]])) {
    const e = await assertRefused(() => withClock(HELD, () => registry.setRating(f.body, a, /** @type {any} */ ({ hazardId: f.h1, platformId: f.bravo, stage: 'initial', consequence, likelihood: 'B' }))), InvalidRatingValueError, f.body, `consequence ${String(consequence)}`);
    assert.equal(e.field, 'consequence');
    assert.ok(Object.is(e.given, consequence), `given ${String(consequence)}`);
  }
  for (const likelihood of /** @type {unknown[]} */ (['H', 'a', 'AB', '', ' A', 1, undefined, false])) {
    const e = await assertRefused(() => withClock(HELD, () => registry.setRating(f.body, a, /** @type {any} */ ({ hazardId: f.h1, platformId: f.bravo, stage: 'residual', consequence: 2, likelihood }))), InvalidRatingValueError, f.body, `likelihood ${String(likelihood)}`);
    assert.equal(e.field, 'likelihood');
    assert.ok(Object.is(e.given, likelihood), `given ${String(likelihood)}`);
  }
  assert.deepEqual(await registry.getRatings(f.body, f.h1, f.bravo), { initial: { consequence: null, likelihood: null }, residual: { consequence: null, likelihood: null } }, 'no out-of-scale value can be read back');
});

// ------------------------------------------------------------------ the record is not there, or not live

test('an id no hazard has rejects with UnknownHazardError from every operation that names a hazard to change or link; body unchanged (section 4; C-005, C-009, C-010, C-012, C-015, C-025)', async () => {
  const f = fixture();
  const a = actOf(f.alice);
  for (const id of [hazardId.fromSequence(5), hazardId.fromSequence(9999)]) {
    /** @type {[string, () => Promise<unknown>][]} */
    const calls = [
      ['updateHazard', () => registry.updateHazard(f.body, a, id, { title: 'x' })],
      ['deleteHazard', () => registry.deleteHazard(f.body, a, id)],
      ['retireHazard', () => registry.retireHazard(f.body, a, id)],
      ['addCausalFactor', () => registry.addCausalFactor(f.body, a, id, { text: 'x' })],
      ['addConsequence', () => registry.addConsequence(f.body, a, id, { text: 'x' })],
      ['linkControlToHazard', () => registry.linkControlToHazard(f.body, a, { hazardId: id, controlId: f.spare, controlKind: 'preventative' })],
      ['linkHazardToPlatform', () => registry.linkHazardToPlatform(f.body, a, { hazardId: id, platformId: f.alpha })],
    ];
    for (const [name, call] of calls) {
      const e = await assertRefused(() => withClock(HELD, call), UnknownHazardError, f.body, `${name}(${id})`);
      assert.equal(e.id, id);
    }
  }
  await assertRefused(() => withClock(HELD, () => registry.deleteHazard(schema.emptyDataBody(), a, hazardId.fromSequence(1))), UnknownHazardError, schema.emptyDataBody(), 'a body with no hazard collection has no hazards');
});

test('a hazard that is deleted or retired rejects with HazardNotLiveError carrying its status from every operation that names a hazard to change or link; body unchanged (section 4; C-005, C-009, C-010, C-012, C-015, C-025)', async () => {
  const f = fixture();
  const a = actOf(f.bob);
  for (const [id, status] of /** @type {const} */ ([[f.h3, 'deleted'], [f.h4, 'retired']])) {
    /** @type {[string, () => Promise<unknown>][]} */
    const calls = [
      ['updateHazard', () => registry.updateHazard(f.body, a, id, { title: 'x' })],
      ['deleteHazard', () => registry.deleteHazard(f.body, a, id)],
      ['retireHazard', () => registry.retireHazard(f.body, a, id)],
      ['addCausalFactor', () => registry.addCausalFactor(f.body, a, id, { text: 'x' })],
      ['addConsequence', () => registry.addConsequence(f.body, a, id, { text: 'x' })],
      ['linkControlToHazard', () => registry.linkControlToHazard(f.body, a, { hazardId: id, controlId: f.spare, controlKind: 'preventative' })],
      ['linkHazardToPlatform', () => registry.linkHazardToPlatform(f.body, a, { hazardId: id, platformId: f.bravo })],
    ];
    for (const [name, call] of calls) {
      const e = await assertRefused(() => withClock(HELD, call), HazardNotLiveError, f.body, `${name} of a ${status} hazard`);
      assert.equal(e.status, status, `${name}: carrying the status`);
    }
  }
});

test('deleting, retiring, or retiring a retired hazard twice fails the second time with HazardNotLiveError (C-005, C-025, section 5 idempotency)', async () => {
  const f = fixture();
  const a = actOf(f.alice);
  const deleted = await withClock(HELD, () => registry.deleteHazard(f.body, a, f.h2));
  const e1 = await assertRefused(() => withClock(HELD, () => registry.deleteHazard(deleted.body, a, f.h2)), HazardNotLiveError, deleted.body, 'deleting twice');
  assert.equal(e1.status, 'deleted');
  await assertRefused(() => withClock(HELD, () => registry.retireHazard(deleted.body, a, f.h2)), HazardNotLiveError, deleted.body, 'a deleted hazard cannot be retired');
  const retired = await withClock(HELD, () => registry.retireHazard(f.body, a, f.h2));
  const e2 = await assertRefused(() => withClock(HELD, () => registry.retireHazard(retired.body, a, f.h2)), HazardNotLiveError, retired.body, 'retiring twice');
  assert.equal(e2.status, 'retired');
});

test('retireHazard of a hazard one or more live hazard-platform links hold rejects with HazardOnPlatformsError carrying every such platform ascending as strings; the hazard stays live and nothing is recorded (C-026; REQ-076; SL-05 criterion 6)', async () => {
  const f = fixture();
  const e = await assertRefused(() => withClock(HELD, () => registry.retireHazard(f.body, actOf(f.alice), f.h1)), HazardOnPlatformsError, f.body, 'retiring a hazard on Alpha and Bravo');
  assert.deepEqual([...e.platformIds], [f.alpha, f.bravo].sort(), 'both platforms, ascending as strings, whatever order the links were made in');
  assert.equal((await registry.getHazard(f.body, f.h1))?.status, 'live');

  const p = newProfile('P');
  const one = platformId.parse(orderedUuid(9, 0xb));
  const retiredPlatform = bodyFrom([hazardRow(1, p, 'one'), platformRow(one, p, 'Retired', p, { status: 'retired' }), hazardPlatformLinkRow(orderedUuid(1), p, hazardId.fromSequence(1), one)]);
  const e2 = await assertRefused(() => withClock(HELD, () => registry.retireHazard(retiredPlatform, actOf(p), hazardId.fromSequence(1))), HazardOnPlatformsError, retiredPlatform, 'a live link to a retired platform still holds the hazard');
  assert.deepEqual([...e2.platformIds], [one], 'never an empty list');
});

test('an id no control has rejects with UnknownControlError from linkControlToHazard, confirmControlForPlatform, excludeControlFromPlatform, and retireControl; body unchanged (section 4)', async () => {
  const f = fixture();
  const a = actOf(f.alice);
  const nobody = controlId.parse(orderedUuid(99, 0xc));
  /** @type {[string, () => Promise<unknown>][]} */
  const calls = [
    ['linkControlToHazard', () => registry.linkControlToHazard(f.body, a, { hazardId: f.h1, controlId: nobody, controlKind: 'preventative' })],
    ['confirmControlForPlatform', () => registry.confirmControlForPlatform(f.body, a, { hazardId: f.h1, controlId: nobody, platformId: f.alpha })],
    ['excludeControlFromPlatform', () => registry.excludeControlFromPlatform(f.body, a, { hazardId: f.h1, controlId: nobody, platformId: f.alpha, text: 'x' })],
    ['retireControl', () => registry.retireControl(f.body, a, nobody)],
  ];
  for (const [name, call] of calls) {
    const e = await assertRefused(() => withClock(HELD, call), UnknownControlError, f.body, name);
    assert.equal(e.id, nobody);
  }
});

test('a control that is retired or deleted rejects with ControlNotLiveError carrying its status from linkControlToHazard and retireControl; body unchanged (section 4; C-012, C-025, C-027)', async () => {
  const f = fixture();
  const a = actOf(f.alice);
  for (const [id, status] of /** @type {const} */ ([[f.old, 'retired'], [f.dead, 'deleted']])) {
    const e1 = await assertRefused(() => withClock(HELD, () => registry.linkControlToHazard(f.body, a, { hazardId: f.h2, controlId: id, controlKind: 'mitigating' })), ControlNotLiveError, f.body, `linking a ${status} control`);
    assert.equal(e1.status, status);
    const e2 = await assertRefused(() => withClock(HELD, () => registry.retireControl(f.body, a, id)), ControlNotLiveError, f.body, `retiring a ${status} control`);
    assert.equal(e2.status, status);
  }
});

test('an id no platform has rejects with UnknownPlatformError from every operation that names a platform, listPlatformHazards included; body unchanged (section 4)', async () => {
  const f = fixture();
  const a = actOf(f.alice);
  const nowhere = platformId.parse(orderedUuid(98, 0xa));
  /** @type {[string, () => Promise<unknown>][]} */
  const calls = [
    ['linkHazardToPlatform', () => registry.linkHazardToPlatform(f.body, a, { hazardId: f.h2, platformId: nowhere })],
    ['confirmControlForPlatform', () => registry.confirmControlForPlatform(f.body, a, { hazardId: f.h1, controlId: f.training, platformId: nowhere })],
    ['excludeControlFromPlatform', () => registry.excludeControlFromPlatform(f.body, a, { hazardId: f.h1, controlId: f.stall, platformId: nowhere, text: 'x' })],
    ['setPlatformReportId', () => registry.setPlatformReportId(f.body, a, { hazardId: f.h1, platformId: nowhere, reportId: 'X' })],
    ['setRating', () => registry.setRating(f.body, a, { hazardId: f.h1, platformId: nowhere, stage: 'initial', consequence: /** @type {any} */ (1), likelihood: /** @type {any} */ ('A') })],
    ['listPlatformHazards', () => registry.listPlatformHazards(f.body, nowhere)],
    ['retirePlatform', () => registry.retirePlatform(f.body, a, nowhere)],
    ['setPlatformOwner', () => registry.setPlatformOwner(f.body, a, { platformId: nowhere, ownerProfileId: f.bob.id })],
  ];
  for (const [name, call] of calls) {
    const e = await assertRefused(() => withClock(HELD, call), UnknownPlatformError, f.body, name);
    assert.equal(e.id, nowhere, `${name}: carrying the id`);
  }
});

test('a platform that is retired or deleted rejects with PlatformNotLiveError carrying its status from linkHazardToPlatform, retirePlatform, and setPlatformOwner; body unchanged (section 4; C-015, C-025, C-027, C-028)', async () => {
  const f = fixture();
  const a = actOf(f.alice);
  for (const [id, status] of /** @type {const} */ ([[f.retired, 'retired'], [f.gone, 'deleted']])) {
    /** @type {[string, () => Promise<unknown>][]} */
    const calls = [
      ['linkHazardToPlatform', () => registry.linkHazardToPlatform(f.body, a, { hazardId: f.h2, platformId: id })],
      ['retirePlatform', () => registry.retirePlatform(f.body, a, id)],
      ['setPlatformOwner', () => registry.setPlatformOwner(f.body, a, { platformId: id, ownerProfileId: f.bob.id })],
    ];
    for (const [name, call] of calls) {
      const e = await assertRefused(() => withClock(HELD, call), PlatformNotLiveError, f.body, `${name} of a ${status} platform`);
      assert.equal(e.status, status);
    }
  }
});

// ------------------------------------------------------------------ link preconditions

test('a second live link of the same kind over the same ids rejects with DuplicateLinkError carrying the existing link\'s id; body unchanged (C-012, C-013, C-015)', async () => {
  const f = fixture();
  const a = actOf(f.alice);
  const e1 = await assertRefused(() => withClock(HELD, () => registry.linkControlToHazard(f.body, a, { hazardId: f.h1, controlId: f.stall, controlKind: 'mitigating' })), DuplicateLinkError, f.body, 'linking Stall to H-0001 again, on the other side');
  assert.equal(e1.existing, f.stallLink);
  const e2 = await assertRefused(() => withClock(HELD, () => registry.linkHazardToPlatform(f.body, a, { hazardId: f.h1, platformId: f.alpha })), DuplicateLinkError, f.body, 'linking H-0001 to Alpha again');
  assert.equal(e2.existing, f.onAlphaLink);
  const e3 = await assertRefused(() => withClock(HELD, () => registry.confirmControlForPlatform(f.body, a, { hazardId: f.h1, controlId: f.stall, platformId: f.bravo })), DuplicateLinkError, f.body, 'confirming Stall on Bravo again');
  assert.equal(e3.existing, f.confirmation);
});

test('excluding a control a live justification already excludes rejects with AlreadyExcludedError carrying its id; body unchanged (C-020, C-021)', async () => {
  const f = fixture();
  const e = await assertRefused(() => withClock(HELD, () => registry.excludeControlFromPlatform(f.body, actOf(f.bob), { hazardId: f.h1, controlId: f.training, platformId: f.alpha, text: 'a second reason' })), AlreadyExcludedError, f.body, 'excluding Training from Alpha again');
  assert.equal(e.existing, f.exclusion);
});

test('with no live hazard-platform link for the hazard and platform, setPlatformReportId, confirmControlForPlatform, excludeControlFromPlatform, and setRating reject with HazardNotOnPlatformError; a deleted link does not count; body unchanged (C-013, C-016, C-017, C-020; REQ-025)', async () => {
  const f = fixture();
  const a = actOf(f.alice);
  // H-0001 is never linked to Retired; its controls are its own, so no second link precondition holds.
  /** @type {[string, () => Promise<unknown>][]} */
  const never = [
    ['setPlatformReportId', () => registry.setPlatformReportId(f.body, a, { hazardId: f.h1, platformId: f.retired, reportId: 'X' })],
    ['confirmControlForPlatform', () => registry.confirmControlForPlatform(f.body, a, { hazardId: f.h1, controlId: f.stall, platformId: f.retired })],
    ['excludeControlFromPlatform', () => registry.excludeControlFromPlatform(f.body, a, { hazardId: f.h1, controlId: f.stall, platformId: f.retired, text: 'x' })],
    ['setRating', () => registry.setRating(f.body, a, { hazardId: f.h1, platformId: f.retired, stage: 'initial', consequence: /** @type {any} */ (1), likelihood: /** @type {any} */ ('A') })],
  ];
  for (const [name, call] of never) await assertRefused(() => withClock(HELD, call), HazardNotOnPlatformError, f.body, `${name}: a hazard never linked to the platform`);
  // H-0002's only link to Alpha is deleted.
  /** @type {[string, () => Promise<unknown>][]} */
  const deleted = [
    ['setPlatformReportId', () => registry.setPlatformReportId(f.body, a, { hazardId: f.h2, platformId: f.alpha, reportId: 'X' })],
    ['setRating', () => registry.setRating(f.body, a, { hazardId: f.h2, platformId: f.alpha, stage: 'initial', consequence: /** @type {any} */ (1), likelihood: /** @type {any} */ ('A') })],
  ];
  for (const [name, call] of deleted) await assertRefused(() => withClock(HELD, call), HazardNotOnPlatformError, f.body, `${name}: a hazard whose link to the platform is deleted`);
});

test('confirming or excluding a control that no live hazard-control link makes one of the hazard\'s rejects with ControlNotOnHazardError; body unchanged (C-013, C-020; REQ-033)', async () => {
  const f = fixture();
  const a = actOf(f.alice);
  await assertRefused(() => withClock(HELD, () => registry.confirmControlForPlatform(f.body, a, { hazardId: f.h1, controlId: f.spare, platformId: f.alpha })), ControlNotOnHazardError, f.body, 'confirming Spare for H-0001');
  await assertRefused(() => withClock(HELD, () => registry.excludeControlFromPlatform(f.body, a, { hazardId: f.h1, controlId: f.spare, platformId: f.alpha, text: 'x' })), ControlNotOnHazardError, f.body, 'excluding Spare for H-0001');
});

// ------------------------------------------------------------------ a change that changes nothing (C-029)

test('a change that would write what is already stored rejects with NoChangeError naming the record and the field, restamps nothing, and records nothing (C-029; SL-05 criterion 2)', async () => {
  const f = fixture();
  const a = actOf(f.bob, f.alpha);
  const e1 = await assertRefused(() => withClock(HELD, () => registry.updateHazard(f.body, a, f.h1, { title: '  one ' })), NoChangeError, f.body, 'updateHazard with the stored title once trimmed');
  assert.deepEqual([e1.ref, e1.field], [{ kind: 'hazard', id: f.h1 }, 'title']);
  const e2 = await assertRefused(() => withClock(HELD, () => registry.setPlatformReportId(f.body, a, { hazardId: f.h1, platformId: f.alpha, reportId: /** @type {any} */ (f.h1) })), NoChangeError, f.body, 'setPlatformReportId with the stored report ID');
  assert.deepEqual([e2.ref, e2.field], [{ kind: 'link', id: f.onAlphaLink }, 'reportId']);
  const e3 = await assertRefused(() => withClock(HELD, () => registry.setPlatformOwner(f.body, a, { platformId: f.bravo, ownerProfileId: f.bob.id })), NoChangeError, f.body, 'setPlatformOwner to the owner it has');
  assert.deepEqual([e3.ref, e3.field], [{ kind: 'platform', id: f.bravo }, 'ownerProfileId']);
  const e4 = await assertRefused(() => withClock(HELD, () => registry.setRating(f.body, a, { hazardId: f.h1, platformId: f.alpha, stage: 'residual', consequence: /** @type {any} */ (3), likelihood: /** @type {any} */ ('C') })), NoChangeError, f.body, 'setRating with both values stored');
  assert.deepEqual(e4.ref, { kind: 'rating', id: f.rating });
  assert.equal((await changeLog.listEntries(f.body)).length, 0);
});

test('a second identical change in the same second is refused rather than recorded: the first call\'s body refuses the same call (C-029)', async () => {
  const f = fixture();
  const a = actOf(f.alice);
  const first = await withClock(HELD, () => registry.updateHazard(f.body, a, f.h1, { title: 'renamed' }));
  await assertRefused(() => withClock(HELD, () => registry.updateHazard(first.body, a, f.h1, { title: 'renamed' })), NoChangeError, first.body, 'the same retitle again');
  const rated = await withClock(HELD, () => registry.setRating(f.body, a, { hazardId: f.h1, platformId: f.bravo, stage: 'initial', consequence: null, likelihood: null }));
  await assertRefused(() => withClock(HELD, () => registry.setRating(rated.body, a, { hazardId: f.h1, platformId: f.bravo, stage: 'initial', consequence: null, likelihood: null })), NoChangeError, rated.body, 'the same null rating again');
});

// ------------------------------------------------------------------ record kinds this module does not own (C-024, C-031)

test('platformsAffected and listLinks of a ref of a kind this module does not own reject with UnownedRecordKindError carrying the kind, whether or not the id is anything (C-024, C-031)', async () => {
  const f = fixture();
  for (const kind of UNOWNED_KINDS) {
    for (const id of [f.h1, orderedUuid(1), 'anything']) {
      const e1 = await assertRefused(() => registry.platformsAffected(f.body, { kind, id }), UnownedRecordKindError, f.body, `platformsAffected of a ${kind}`);
      assert.equal(e1.recordKind, kind);
      const e2 = await assertRefused(() => registry.listLinks(f.body, { kind, id }), UnownedRecordKindError, f.body, `listLinks of a ${kind}`);
      assert.equal(e2.recordKind, kind);
    }
  }
});

// ------------------------------------------------------------------ the order of conditions (section 4)

test('when two conditions hold at once, the first in section 4\'s order is the one signalled, and the body is unchanged whichever fires (section 4)', async () => {
  const f = fixture();
  const a = actOf(f.alice);
  const malformed = { ...f.body, collections: { ...f.body.collections, hazard: { ...f.body.collections.hazard, 'H-0009': /** @type {any} */ ({ id: 'H-0009', kind: 'hazard' }) } } };
  const brokenLog = { ...f.body, collections: /** @type {any} */ ({ ...f.body.collections, [LOG]: { broken: { id: 'broken' } } }) };
  const nowhere = platformId.parse(orderedUuid(97, 0xa));
  /** @type {[string, DataBody, () => Promise<unknown>, Function][]} */
  const cases = [
    ['a malformed hazard before a missing profile', malformed, () => registry.updateHazard(malformed, /** @type {any} */ (null), f.h1, { title: 'x' }), MalformedHazardError],
    ['a missing profile before an ill-formed act', f.body, () => registry.updateHazard(f.body, /** @type {any} */ ({ profile: null }), f.h1, { title: 'x' }), MissingProfileError],
    ['an ill-formed act before an unknown hazard', f.body, () => registry.updateHazard(f.body, /** @type {any} */ ({ profile: f.alice, madeForPlatformId: 'nope' }), hazardId.fromSequence(50), { title: 'x' }), InvalidActError],
    ['an act made for no known platform before an unknown hazard', f.body, () => registry.updateHazard(f.body, actOf(f.alice, nowhere), hazardId.fromSequence(50), { title: 'x' }), UnknownPlatformError],
    ['an unknown hazard before a blank title', f.body, () => registry.updateHazard(f.body, a, hazardId.fromSequence(50), { title: ' ' }), UnknownHazardError],
    ['a hazard that is not live before a title that changes nothing', f.body, () => registry.updateHazard(f.body, a, f.h3, { title: 'three' }), HazardNotLiveError],
    ['a hazard that is not live before a blank title', f.body, () => registry.updateHazard(f.body, a, f.h4, { title: '' }), HazardNotLiveError],
    ['a deleted hazard on a platform is not live before it is on platforms', f.body, () => registry.retireHazard(f.body, a, f.h3), HazardNotLiveError],
    ['an unknown control before the hazard not on the platform', f.body, () => registry.confirmControlForPlatform(f.body, a, { hazardId: f.h2, controlId: controlId.parse(orderedUuid(96, 0xc)), platformId: f.alpha }), UnknownControlError],
    ['a hazard not on the platform before a blank reason', f.body, () => registry.excludeControlFromPlatform(f.body, a, { hazardId: f.h1, controlId: f.stall, platformId: f.retired, text: ' ' }), HazardNotOnPlatformError],
    ['an exclusion already made before a blank reason', f.body, () => registry.excludeControlFromPlatform(f.body, a, { hazardId: f.h1, controlId: f.training, platformId: f.alpha, text: '' }), AlreadyExcludedError],
    ['a duplicate link before an invalid control kind', f.body, () => registry.linkControlToHazard(f.body, a, /** @type {any} */ ({ hazardId: f.h1, controlId: f.stall, controlKind: 'both' })), DuplicateLinkError],
    ['a hazard not on the platform before a value out of scale', f.body, () => registry.setRating(f.body, a, /** @type {any} */ ({ hazardId: f.h2, platformId: f.alpha, stage: 'initial', consequence: 9, likelihood: 'A' })), HazardNotOnPlatformError],
    ['a platform that is not live before an owner that is not a profile', f.body, () => registry.setPlatformOwner(f.body, a, /** @type {any} */ ({ platformId: f.retired, ownerProfileId: 'nobody' })), PlatformNotLiveError],
    ['nothing to change before the log refusing', brokenLog, () => registry.updateHazard(brokenLog, a, f.h1, { title: 'one' }), NoChangeError],
  ];
  for (const [why, body, call, type] of cases) await assertRefused(() => withClock(HELD, call), type, body, why);
});

// ------------------------------------------------------------------ malformed records (C-008)

/**
 * Ways an entry fails to be a record of its kind, whatever the kind: each a function from a
 * good row to the key it sits under and the bad row.
 * @type {[string, (row: Record<string, any>) => { key: string, row: any }][]}
 */
const MALFORMED_HEADER = [
  ['its key differs from its id', (row) => ({ key: `${row.id}x`, row })],
  ['its kind is another kind', (row) => ({ key: row.id, row: { ...row, kind: row.kind === 'control' ? 'platform' : 'control' } })],
  ['its kind is missing', (row) => { const { kind: _k, ...rest } = row; return { key: row.id, row: rest }; }],
  ['its status is not a RecordStatus', (row) => ({ key: row.id, row: { ...row, status: 'archived' } })],
  ['createdBy is not a user profile id', (row) => ({ key: row.id, row: { ...row, createdBy: 'alice' } })],
  ['updatedBy is missing', (row) => { const { updatedBy: _u, ...rest } = row; return { key: row.id, row: rest }; }],
  ['createdAtAest is not a TimestampAest', (row) => ({ key: row.id, row: { ...row, createdAtAest: '2026-01-05T08:00:00Z' } })],
  ['updatedAtAest is a date', (row) => ({ key: row.id, row: { ...row, updatedAtAest: '2026-01-05' } })],
  ['the entry is null', (row) => ({ key: row.id, row: null })],
  ['the entry is a string', (row) => ({ key: row.id, row: String(row.id) })],
];

/**
 * @param {DataBody} body
 * @param {string} kind
 * @param {{ key: string, row: any }} bad
 * @returns {DataBody}
 */
function withEntry(body, kind, bad) {
  const collection = { ...(/** @type {any} */ (body.collections)[kind] ?? {}) };
  collection[bad.key] = bad.row;
  return { ...body, collections: /** @type {any} */ ({ ...body.collections, [kind]: collection }) };
}

/**
 * Check every read given rejects with `type` naming the key, for every way in `ways`.
 * @param {string} kind
 * @param {any} good a row of that kind, not in the fixture
 * @param {[string, (row: Record<string, any>) => { key: string, row: any }][]} ways
 * @param {Function} type
 * @param {(f: ReturnType<typeof fixture>, body: DataBody, key: string) => [string, () => Promise<unknown>][]} reads
 */
async function checkMalformed(kind, good, ways, type, reads) {
  const f = fixture();
  for (const [why, make] of ways) {
    const bad = make(good(f));
    const body = withEntry(f.body, kind, bad);
    for (const [name, call] of reads(f, body, bad.key)) {
      const e = await assertRefused(call, type, body, `${name} when a ${kind} entry: ${why}`);
      assert.ok(e instanceof MalformedRecordError, `${name}: one of the MalformedRecordError family`);
      assert.equal(e.key, bad.key, `${name} when ${why}: names the entry's key`);
      assert.equal(e.recordKind, kind, `${name} when ${why}: names the kind`);
    }
  }
}

test('a hazard entry that is not a Hazard is refused with MalformedHazardError naming its key by every operation that reads hazards; nothing returned; body unchanged (C-008)', async () => {
  /** @type {[string, (row: Record<string, any>) => { key: string, row: any }][]} */
  const own = [
    ['its id is not a HazardId', (row) => ({ key: 'H-1', row: { ...row, id: 'H-1' } })],
    ['its id is a UUID', (row) => ({ key: orderedUuid(1), row: { ...row, id: orderedUuid(1) } })],
    ['its title is a number', (row) => ({ key: row.id, row: { ...row, title: 3 } })],
    ['its title is missing', (row) => { const { title: _t, ...rest } = row; return { key: row.id, row: rest }; }],
  ];
  await checkMalformed('hazard', (/** @type {any} */ f) => hazardRow(9, f.alice, 'nine'), [...MALFORMED_HEADER, ...own], MalformedHazardError, (f, body, key) => [
    ['createHazard', () => withClock(HELD, () => registry.createHazard(body, actOf(f.alice), { title: 'new' }))],
    ['deleteHazard of a good hazard', () => withClock(HELD, () => registry.deleteHazard(body, actOf(f.alice), f.h2))],
    ['listHazards', () => registry.listHazards(body)],
    ['listAllHazards', () => registry.listAllHazards(body)],
    ['getHazard of a good hazard', () => registry.getHazard(body, f.h1)],
    ['getHazard of the key', () => registry.getHazard(body, /** @type {any} */ (key))],
  ]);
});

test('a control entry that is not a Control is refused with MalformedControlError naming its key by every list of controls; body unchanged (C-008)', async () => {
  /** @type {[string, (row: Record<string, any>) => { key: string, row: any }][]} */
  const own = [
    ['its id is not a ControlId', (row) => ({ key: 'c-1', row: { ...row, id: 'c-1' } })],
    ['its title is null', (row) => ({ key: row.id, row: { ...row, title: null } })],
    ['its title is missing', (row) => { const { title: _t, ...rest } = row; return { key: row.id, row: rest }; }],
  ];
  await checkMalformed('control', (/** @type {any} */ f) => controlRow(controlId.parse(orderedUuid(50, 0xc)), f.alice, 'x'), [...MALFORMED_HEADER, ...own], MalformedControlError, (_f, body) => [
    ['listControls', () => registry.listControls(body)],
    ['listAllControls', () => registry.listAllControls(body)],
  ]);
});

test('a platform entry that is not a Platform is refused with MalformedPlatformError naming its key by every list of platforms; body unchanged (C-008)', async () => {
  /** @type {[string, (row: Record<string, any>) => { key: string, row: any }][]} */
  const own = [
    ['its id is not a PlatformId', (row) => ({ key: 'alpha', row: { ...row, id: 'alpha' } })],
    ['its name is missing', (row) => { const { name: _n, ...rest } = row; return { key: row.id, row: rest }; }],
    ['its owner is not a user profile id', (row) => ({ key: row.id, row: { ...row, ownerProfileId: 'alice' } })],
    ['its owner is a list', (row) => ({ key: row.id, row: { ...row, ownerProfileId: [row.ownerProfileId] } })],
    ['its owner is missing', (row) => { const { ownerProfileId: _o, ...rest } = row; return { key: row.id, row: rest }; }],
  ];
  await checkMalformed('platform', (/** @type {any} */ f) => platformRow(platformId.parse(orderedUuid(50, 0xa)), f.alice, 'x', f.alice), [...MALFORMED_HEADER, ...own], MalformedPlatformError, (_f, body) => [
    ['listPlatforms', () => registry.listPlatforms(body)],
    ['listAllPlatforms', () => registry.listAllPlatforms(body)],
  ]);
});

test('a causal factor or consequence entry of a hazard that is not one of its kind is refused by getHazardDetail with its own error naming the key; body unchanged (C-008, C-010)', async () => {
  /** @type {[string, (row: Record<string, any>) => { key: string, row: any }][]} */
  const own = [
    ['its id is not an id of its kind', (row) => ({ key: 'cf', row: { ...row, id: 'cf' } })],
    ['its text is a number', (row) => ({ key: row.id, row: { ...row, text: 5 } })],
    ['its text is missing', (row) => { const { text: _t, ...rest } = row; return { key: row.id, row: rest }; }],
  ];
  const ways = [...MALFORMED_HEADER, ...own];
  await checkMalformed('causal-factor', (/** @type {any} */ f) => causalFactorRow(orderedUuid(50), f.alice, f.h1, 'cause'), ways, MalformedCausalFactorError, (f, body) => [['getHazardDetail', () => registry.getHazardDetail(body, f.h1)]]);
  await checkMalformed('consequence', (/** @type {any} */ f) => consequenceRow(orderedUuid(51), f.alice, f.h1, 'effect'), ways, MalformedConsequenceError, (f, body) => [['getHazardDetail', () => registry.getHazardDetail(body, f.h1)]]);
});

test('a link entry that is not a Link is refused with MalformedLinkError naming its key by listLinks, platformsAffected, and listPlatformHazards; body unchanged (C-008, C-019, C-024, C-031)', async () => {
  /** @type {[string, (row: Record<string, any>) => { key: string, row: any }][]} */
  const own = [
    ['its id is not a LinkId', (row) => ({ key: 'l-1', row: { ...row, id: 'l-1' } })],
    ['its linkKind is outside the three', (row) => ({ key: row.id, row: { ...row, linkKind: 'platform-platform' } })],
    ['its linkKind is missing', (row) => { const { linkKind: _l, ...rest } = row; return { key: row.id, row: rest }; }],
    ['a hazard-platform link carries a field the shape does not carry', (row) => ({ key: row.id, row: { ...row, controlId: orderedUuid(3, 0xc) } })],
    ['a hazard-platform link has no reportId', (row) => { const { reportId: _r, ...rest } = row; return { key: row.id, row: rest }; }],
    ['a hazard-platform link\'s platformId is not a PlatformId', (row) => ({ key: row.id, row: { ...row, platformId: 'Alpha' } })],
    ['a hazard-platform link\'s hazardId is not a HazardId', (row) => ({ key: row.id, row: { ...row, hazardId: 'hazard one' } })],
  ];
  await checkMalformed('link', (/** @type {any} */ f) => hazardPlatformLinkRow(orderedUuid(50, 0x1), f.alice, f.h2, f.bravo), [...MALFORMED_HEADER, ...own], MalformedLinkError, (f, body) => [
    ['listLinks', () => registry.listLinks(body, { kind: 'hazard', id: f.h1 })],
    ['platformsAffected', () => registry.platformsAffected(body, { kind: 'hazard', id: f.h1 })],
    ['listPlatformHazards', () => registry.listPlatformHazards(body, f.alpha)],
  ]);
  /** @type {[string, (row: Record<string, any>) => { key: string, row: any }][]} */
  const controlLinks = [
    ['a hazard-control link\'s controlKind is outside the two', (row) => ({ key: row.id, row: { ...row, controlKind: 'sideways' } })],
    ['a hazard-control link has no controlKind', (row) => { const { controlKind: _c, ...rest } = row; return { key: row.id, row: rest }; }],
    ['a hazard-control link carries a platformId', (row) => ({ key: row.id, row: { ...row, platformId: orderedUuid(1, 0xa) } })],
  ];
  await checkMalformed('link', (/** @type {any} */ f) => hazardControlLinkRow(orderedUuid(51, 0x1), f.alice, f.h2, f.spare, 'preventative'), controlLinks, MalformedLinkError, (f, body) => [
    ['listLinks', () => registry.listLinks(body, { kind: 'control', id: f.stall })],
  ]);
  /** @type {[string, (row: Record<string, any>) => { key: string, row: any }][]} */
  const confirmations = [
    ['a control-platform link has no platformId', (row) => { const { platformId: _p, ...rest } = row; return { key: row.id, row: rest }; }],
    ['a control-platform link carries a controlKind', (row) => ({ key: row.id, row: { ...row, controlKind: 'preventative' } })],
  ];
  await checkMalformed('link', (/** @type {any} */ f) => controlPlatformLinkRow(orderedUuid(52, 0x1), f.alice, { hazardId: f.h2, controlId: f.spare, platformId: f.bravo }), confirmations, MalformedLinkError, (f, body) => [
    ['listLinks', () => registry.listLinks(body, { kind: 'platform', id: f.alpha })],
  ]);
});

test('a rating entry that is not a Rating is refused by getRatings, and a justification entry that is not a Justification by platformsAffected of it, each with its own error naming the key; body unchanged (C-008, C-017, C-024)', async () => {
  /** @type {[string, (row: Record<string, any>) => { key: string, row: any }][]} */
  const ratings = [
    ['its stage is outside the two', (row) => ({ key: row.id, row: { ...row, stage: 'final' } })],
    ['its consequence is a word', (row) => ({ key: row.id, row: { ...row, consequence: 'three' } })],
    ['its likelihood is a number', (row) => ({ key: row.id, row: { ...row, likelihood: 7 } })],
    ['its consequence is missing', (row) => { const { consequence: _c, ...rest } = row; return { key: row.id, row: rest }; }],
  ];
  await checkMalformed('rating', (/** @type {any} */ f) => ratingRow(orderedUuid(50, 0x2), f.alice, { hazardId: f.h1, platformId: f.bravo, stage: 'initial', consequence: 1, likelihood: 'A' }), [...MALFORMED_HEADER, ...ratings], MalformedRatingError, (f, body) => [
    ['getRatings', () => registry.getRatings(body, f.h1, f.bravo)],
  ]);
  /** @type {[string, (row: Record<string, any>) => { key: string, row: any }][]} */
  const justifications = [
    ['its controlId is missing', (row) => { const { controlId: _c, ...rest } = row; return { key: row.id, row: rest }; }],
    ['its platformId is a hazard id', (row) => ({ key: row.id, row: { ...row, platformId: 'H-0001' } })],
    ['its hazardId is not a HazardId', (row) => ({ key: row.id, row: { ...row, hazardId: orderedUuid(1) } })],
    ['its text is a number', (row) => ({ key: row.id, row: { ...row, text: 5 } })],
  ];
  const justificationWays = [...MALFORMED_HEADER, ...justifications];
  await checkMalformed('justification', (/** @type {any} */ f) => justificationRow(orderedUuid(50, 0x3), f.alice, { hazardId: f.h1, controlId: f.stall, platformId: f.alpha }, 'r'), justificationWays, MalformedJustificationError, (_f, body, key) => [
    ['platformsAffected of it', () => registry.platformsAffected(body, { kind: 'justification', id: key })],
  ]);
});

test('listPlatformHazards names a live linked hazard in omitted, with the key and the reason, when a control, justification, or residual rating its row would carry is malformed, and gives every other hazard as a row (C-019, C-008; HZ-004)', async () => {
  const f = fixture();
  const p = f.alice;
  // H-0002 joins Alpha with a control only it has, so a malformed one stops H-0002's row and not H-0001's.
  const own = controlId.parse(orderedUuid(60, 0xc));
  const base = bodyFrom([...Object.values(f.body.collections).flatMap((c) => Object.values(/** @type {any} */ (c))),
    hazardPlatformLinkRow(orderedUuid(61, 0x1), p, f.h2, f.alpha), controlRow(own, p, 'H-0002 only'), hazardControlLinkRow(orderedUuid(62, 0x1), p, f.h2, own, 'mitigating')]);
  const good = await registry.listPlatformHazards(base, f.alpha).catch(() => null);
  const cases = /** @type {[string, string, any, string][]} */ ([
    ['control', own, { ...controlRow(own, p, 'H-0002 only'), title: 42 }, 'malformed-control'],
    ['justification', orderedUuid(63, 0x3), { ...justificationRow(orderedUuid(63, 0x3), p, { hazardId: f.h2, controlId: own, platformId: f.alpha }, 'r'), text: 7 }, 'malformed-justification'],
    ['rating', orderedUuid(64, 0x2), { ...ratingRow(orderedUuid(64, 0x2), p, { hazardId: f.h2, platformId: f.alpha, stage: 'residual', consequence: 1, likelihood: 'A' }), consequence: 'one' }, 'malformed-rating'],
  ]);
  for (const [kind, key, row, reason] of cases) {
    const body = withEntry(base, kind, { key, row });
    const before = snapshot(body);
    const result = await registry.listPlatformHazards(body, f.alpha);
    assert.deepEqual(result.rows.map((r) => r.hazard.id), [f.h1], `a malformed ${kind}: H-0001 is still a row`);
    assert.equal(result.omitted.length, 1, `a malformed ${kind}: H-0002 is named once, not dropped`);
    const [o] = result.omitted;
    assert.deepEqual([o.id, o.reason, o.key], [f.h2, reason, key], `a malformed ${kind}: the id, the reason, and the key of the record that stopped it`);
    assert.ok(typeof o.detail === 'string' && o.detail.trim() !== '', 'a sentence naming the field');
    assert.deepEqual(body, before, 'body unchanged');
    if (good) assert.deepEqual(result.rows, good.rows.filter((r) => r.hazard.id !== f.h2), 'H-0001\'s row is what it is without the malformed record');
  }
});

test('createHazard when the id the sequence would assign is already held, whatever its status, rejects with HazardSequenceError carrying that id; body unchanged and the sequence not adjusted (C-002)', async () => {
  const p = newProfile('Alice');
  for (const status of /** @type {const} */ (['live', 'deleted', 'retired'])) {
    const held = hazardRow(3, p, 'already here', { status });
    const body = bodyFrom([hazardRow(1, p, 'one'), held], { sequence: 3 });
    const e = await assertRefused(() => withClock(HELD, () => registry.createHazard(body, actOf(p), { title: 'new' })), HazardSequenceError, body, `createHazard over a ${status} H-0003`);
    assert.equal(e.id, hazardId.fromSequence(3));
    const again = await rejectionOf(() => withClock(HELD, () => registry.createHazard(body, actOf(p), { title: 'new' })));
    assert.ok(again instanceof HazardSequenceError, 'the sequence was not adjusted to get past it');
    assert.deepEqual(await registry.getHazard(body, held.id), held, 'the held row is as it was');
  }
});

test('a stored title, name, or text that is blank is listed, not refused: a record is never hidden for its content (C-008)', async () => {
  const p = newProfile('Alice');
  const blank = hazardRow(1, p, '');
  const spaces = hazardRow(2, p, '   ');
  const control = controlRow(controlId.parse(orderedUuid(1)), p, ' ');
  const platform = platformRow(platformId.parse(orderedUuid(2)), p, '', p);
  const cause = causalFactorRow(orderedUuid(3), p, blank.id, '');
  const body = bodyFrom([blank, spaces, hazardRow(3, p, 'three'), control, platform, cause]);
  assert.deepEqual((await registry.listHazards(body)).map((h) => h.id), ['H-0001', 'H-0002', 'H-0003']);
  assert.deepEqual([...(await registry.listControls(body))], [control]);
  assert.deepEqual([...(await registry.listPlatforms(body))], [platform]);
  assert.deepEqual((await registry.getHazardDetail(body, blank.id))?.causalFactors, [cause]);
  const created = await withClock(HELD, () => registry.createHazard(body, actOf(p), { title: 'four' }));
  assert.equal(created.hazard.id, 'H-0004', 'the collection is readable, so a create goes through');
});
