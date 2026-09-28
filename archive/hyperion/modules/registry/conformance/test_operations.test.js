/**
 * registry conformance: operations (CORE-CON-002). Every signature of
 * modules/registry/CONTRACT.md 5.0 on its happy path, each test naming the clause it encodes
 * and the slice criterion behind it (SL-01 criterion 4; SL-03; SL-04; SL-05; SL-11). Expected
 * records are written out literally where a clause gives them, so this file reads as the
 * contract does. From 4.0 every changing operation is also checked for the one entry its act
 * appends, read through `change-log`'s contract (C-023). Written from the contract and the
 * slice definitions before any implementation (P8).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as registry from '../contract.js';
import { causalFactorId, consequenceId, controlId, hazardId, justificationId, linkId, platformId } from '../../../baseline/types.js';
import {
  EARLIER, HELD, actOf, assertRecorded, bodyFrom, causalFactorRow, changeLog, consequenceRow, controlPlatformLinkRow, controlRow, differences,
  hazardControlLinkRow, hazardPlatformLinkRow, hazardRow, justificationRow, newProfile, only, orderedUuid, platformRow, plusSeconds, ratingRow,
  refOf, schema, smallWorld, snapshot, withClock,
} from './harness.js';

/** @typedef {import('../contract.js').Hazard} Hazard */

// ------------------------------------------------------------------ hazards (C-001, C-002, C-005, C-006, C-009)

test('createHazard on an empty body stores the trimmed title under H-0001 with the profile and the held clock in the header, advances the sequence, records the creation, and leaves the input body as it was (C-001, C-003, C-023; SL-01 criterion 4)', async () => {
  const body = schema.emptyDataBody();
  const before = snapshot(body);
  const p = newProfile('Alice');
  const act = actOf(p);

  const { body: b, hazard: h } = await withClock(HELD, () => registry.createHazard(body, act, { title: '  Loss of control  ' }));

  assert.deepEqual(h, {
    id: hazardId.fromSequence(1), kind: 'hazard', status: 'live', createdBy: p.id, createdAtAest: HELD, updatedBy: p.id, updatedAtAest: HELD, title: 'Loss of control',
  }, 'the hazard as C-001 describes it, and nothing else');
  assert.equal(b.sequences.hazard, 2, 'the sequence is one past what it was');
  assert.deepEqual(await registry.getHazard(b, h.id), h, 'getHazard on the new body is the hazard');
  assert.deepEqual([...(await registry.listHazards(b))], [h], 'listHazards on the new body is the old list plus the hazard');
  assert.deepEqual(differences(body, b), only('hazard/H-0001', 'sequences.hazard'), 'the new body differs only in that entry, the sequence, and the log');
  await assertRecorded(body, b, { act, at: HELD, records: [{ before: null, after: h }], affected: [] });
  assert.deepEqual(body, before, 'the body passed in is unchanged');
});

test('createHazard on a body with hazards takes the id the sequence names, keeps every stored row, and appends to the list (C-001)', async () => {
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const body = bodyFrom([hazardRow(1, alice, 'bird strike'), hazardRow(2, alice, 'fuel starvation'), hazardRow(3, alice, 'icing')], { sequence: 7 });
  const before = snapshot(body);
  const listedBefore = [...(await registry.listHazards(body))];

  const { body: b, hazard: h } = await withClock(HELD, () => registry.createHazard(body, actOf(bob), { title: 'wake turbulence' }));

  assert.equal(h.id, hazardId.fromSequence(7), 'the id is hazardId.fromSequence(body.sequences.hazard)');
  assert.equal(b.sequences.hazard, 8);
  assert.equal(h.createdBy, bob.id);
  assert.equal(h.updatedBy, bob.id);
  assert.deepEqual([...(await registry.listHazards(b))], [...listedBefore, h], 'listHazards(b) is listHazards(body) plus h');
  assert.deepEqual(differences(body, b), only('hazard/H-0007', 'sequences.hazard'));
  assert.deepEqual(body, before, 'the body passed in is unchanged');
});

test('creating the same title twice yields two hazards with two ids and two entries: titles are not unique (C-001, section 5 idempotency)', async () => {
  const p = newProfile('Alice');
  const first = await withClock(HELD, () => registry.createHazard(schema.emptyDataBody(), actOf(p), { title: 'bird strike' }));
  const second = await withClock(HELD, () => registry.createHazard(first.body, actOf(p), { title: 'bird strike' }));
  assert.notEqual(second.hazard.id, first.hazard.id);
  assert.equal(second.hazard.title, first.hazard.title);
  assert.deepEqual([...(await registry.listHazards(second.body))], [first.hazard, second.hazard]);
  assert.equal((await changeLog.listEntries(second.body)).length, 2, 'two acts, two entries');
});

test('listHazards resolves with an empty list for a body with no hazard collection and for an empty one (C-006)', async () => {
  assert.deepEqual([...(await registry.listHazards(schema.emptyDataBody()))], []);
  assert.deepEqual([...(await registry.listHazards(bodyFrom([], { extra: { 'reference-entry': {} } })))], [], 'other collections do not count');
  assert.deepEqual([...(await registry.listHazards({ collections: { hazard: {} }, sequences: { hazard: 4 } }))], [], 'an empty hazard collection');
});

test('listHazards resolves with every live hazard once, by ascending number, whatever order the collection holds them in, with nothing deleted, retired, or of another kind (C-006)', async () => {
  const p = newProfile('Alice');
  const rows = [hazardRow(10, p, 'ten'), hazardRow(1, p, 'one'), hazardRow(3, p, 'three', { status: 'deleted' }), hazardRow(2, p, 'two'), hazardRow(7, p, 'seven', { status: 'retired' }), hazardRow(12, p, 'twelve')];
  const body = bodyFrom([...rows, controlRow(orderedUuid(1), p, 'a control with a title')], { sequence: 13 });

  const listed = [...(await registry.listHazards(body))];
  assert.deepEqual(listed.map((h) => h.id), ['H-0001', 'H-0002', 'H-0010', 'H-0012'], 'by number, not by key order or by string order');
  for (const h of listed) assert.equal(h.kind, 'hazard');
});

test('getHazard resolves with the stored hazard whatever its status, deep-equal to the row, and with null for an id no entry has (C-006)', async () => {
  const p = newProfile('Alice');
  const live = hazardRow(1, p, 'one');
  const deleted = hazardRow(2, p, 'two', { status: 'deleted' });
  const retired = hazardRow(3, p, 'three', { status: 'retired' });
  const body = bodyFrom([live, deleted, retired]);

  assert.deepEqual(await registry.getHazard(body, live.id), live);
  assert.deepEqual(await registry.getHazard(body, deleted.id), deleted, 'a deleted hazard is still got');
  assert.deepEqual(await registry.getHazard(body, retired.id), retired);
  assert.equal(await registry.getHazard(body, hazardId.fromSequence(4)), null, 'the id the sequence would assign next');
  assert.equal(await registry.getHazard(schema.emptyDataBody(), hazardId.fromSequence(1)), null, 'no hazard collection at all');
});

test('deleteHazard keeps the row with status deleted and the header restamped, leaves its links, causal factors, consequences, and ratings as they were, and records a deletion that reaches every platform still linked to it (C-005, C-003, C-023, C-024; SL-05 criterion 1)', async () => {
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const pa = platformId.parse(orderedUuid(1, 0xa));
  const pb = platformId.parse(orderedUuid(2, 0xa));
  const pc = platformId.parse(orderedUuid(3, 0xa));
  const h2 = hazardRow(2, alice, 'two');
  const body = bodyFrom([
    hazardRow(1, alice, 'one'), h2, hazardRow(3, alice, 'three'),
    platformRow(pa, alice, 'Alpha', alice), platformRow(pb, alice, 'Bravo', bob), platformRow(pc, alice, 'Charlie', bob),
    hazardPlatformLinkRow(orderedUuid(10), alice, h2.id, pb), hazardPlatformLinkRow(orderedUuid(11), alice, h2.id, pa),
    hazardPlatformLinkRow(orderedUuid(12), alice, h2.id, pc, { status: 'deleted' }),
    causalFactorRow(orderedUuid(20), alice, h2.id, 'cause'), consequenceRow(orderedUuid(21), alice, h2.id, 'effect'),
    ratingRow(orderedUuid(22), alice, { hazardId: h2.id, platformId: pa, stage: 'residual', consequence: 3, likelihood: 'C' }),
  ]);
  const before = snapshot(body);
  const later = plusSeconds(HELD, 90);
  const act = actOf(bob, pb);

  const { body: b, hazard: h } = await withClock(later, () => registry.deleteHazard(body, act, h2.id));

  assert.deepEqual(h, { ...h2, status: 'deleted', updatedBy: bob.id, updatedAtAest: later }, 'status, updatedBy, updatedAtAest changed; every other field as before');
  assert.deepEqual(await registry.getHazard(b, h2.id), h, 'getHazard on the new body is the hazard as it now is');
  assert.deepEqual((await registry.listHazards(b)).map((x) => x.id), ['H-0001', 'H-0003'], 'listHazards(b) is listHazards(body) without it');
  assert.deepEqual(differences(body, b), only('hazard/H-0002'), 'no link, causal factor, consequence, or rating is touched, and the sequence does not move');
  const entry = await assertRecorded(body, b, { act, at: later, records: [{ before: h2, after: h }], affected: [pa, pb] });
  assert.equal(entry.items[0].action, 'deleted', 'change-log derives the deletion from the transition');
  assert.deepEqual(body, before, 'the body passed in is unchanged');
});

test('a consumer carries the returned body from call to call: ids strictly increase, a deleted or retired id is never assigned again, and the sequence follows (C-001, C-002, C-005, C-025)', async () => {
  const p = newProfile('Alice');
  const act = actOf(p);
  let body = schema.emptyDataBody();
  /** @type {string[]} */
  const assigned = [];
  for (const title of ['one', 'two', 'three']) {
    const change = await withClock(HELD, () => registry.createHazard(body, act, { title }));
    assigned.push(change.hazard.id);
    body = change.body;
  }
  assert.deepEqual(assigned, ['H-0001', 'H-0002', 'H-0003']);

  body = (await withClock(HELD, () => registry.deleteHazard(body, act, hazardId.fromSequence(3)))).body;
  body = (await withClock(HELD, () => registry.retireHazard(body, act, hazardId.fromSequence(1)))).body;
  assert.deepEqual((await registry.listHazards(body)).map((h) => h.id), ['H-0002']);

  const after = await withClock(HELD, () => registry.createHazard(body, act, { title: 'four' }));
  assert.equal(after.hazard.id, 'H-0004', 'not H-0001, retired, and not H-0003, deleted');
  assert.equal(after.body.sequences.hazard, 5);
  assert.equal((await registry.getHazard(after.body, hazardId.fromSequence(1)))?.status, 'retired', 'the retired row is still there');
  assert.equal((await registry.getHazard(after.body, hazardId.fromSequence(3)))?.status, 'deleted', 'the deleted row is still there');
  assert.equal((await changeLog.listEntries(after.body)).length, 6, 'one entry per act');
});

test('updateHazard changes the title on the one record, restamps the header, touches no link or other record, records an edit reaching every platform the hazard is on, and both platforms read the new title (C-009, C-004, C-023, C-024; SL-03 criterion 1)', async () => {
  const w = await smallWorld();
  const before = snapshot(w.body);
  const old = /** @type {Hazard} */ (await registry.getHazard(w.body, w.hazard));
  const act = actOf(w.bob, w.bravo);

  const { body: b, hazard: h } = await withClock(HELD, () => registry.updateHazard(w.body, act, w.hazard, { title: '  Loss of control in flight ' }));

  assert.deepEqual(h, { ...old, title: 'Loss of control in flight', updatedBy: w.bob.id, updatedAtAest: HELD }, 'title trimmed and the header restamped; id, kind, status, and creation stamp as they were');
  assert.deepEqual(differences(w.body, b), only(`hazard/${w.hazard}`), 'b differs from body only in that entry of collections.hazard');
  for (const platform of [w.alpha, w.bravo]) {
    const { rows } = await registry.listPlatformHazards(b, platform);
    assert.deepEqual(rows.map((r) => r.hazard), [h], `platform ${platform} reads the new title from the same record`);
  }
  const entry = await assertRecorded(w.body, b, { act, at: HELD, records: [{ before: old, after: h }], affected: [w.alpha, w.bravo] });
  assert.equal(entry.items[0].action, 'edited');
  assert.deepEqual(w.body, before, 'the body passed in is unchanged');
});

// ------------------------------------------------------------------ causal factors, consequences, detail (C-010)

test('addCausalFactor and addConsequence store the trimmed text against the hazard under a fresh id, stamped, record the creation, and getHazardDetail gives them back as stored (C-010, C-023; SL-03 criterion 2)', async () => {
  const w = await smallWorld();
  const act = actOf(w.alice);
  const cf = await withClock(HELD, () => registry.addCausalFactor(w.body, act, w.hazard, { text: '  pilot distracted ' }));
  assert.doesNotThrow(() => causalFactorId.parse(cf.causalFactor.id), 'a CausalFactorId');
  assert.deepEqual(cf.causalFactor, {
    id: cf.causalFactor.id, kind: 'causal-factor', status: 'live', createdBy: w.alice.id, createdAtAest: HELD, updatedBy: w.alice.id, updatedAtAest: HELD, hazardId: w.hazard, text: 'pilot distracted',
  });
  assert.deepEqual(differences(w.body, cf.body), only(`causal-factor/${cf.causalFactor.id}`));
  await assertRecorded(w.body, cf.body, { act, at: HELD, records: [{ before: null, after: cf.causalFactor }], affected: [w.alpha, w.bravo] });

  const later = plusSeconds(HELD, 5);
  const co = await withClock(later, () => registry.addConsequence(cf.body, act, w.hazard, { text: 'controlled flight into terrain' }));
  assert.doesNotThrow(() => consequenceId.parse(co.consequence.id), 'a ConsequenceId');
  assert.deepEqual(co.consequence, {
    id: co.consequence.id, kind: 'consequence', status: 'live', createdBy: w.alice.id, createdAtAest: later, updatedBy: w.alice.id, updatedAtAest: later, hazardId: w.hazard, text: 'controlled flight into terrain',
  });
  assert.deepEqual(differences(cf.body, co.body), only(`consequence/${co.consequence.id}`));
  await assertRecorded(cf.body, co.body, { act, at: later, records: [{ before: null, after: co.consequence }], affected: [w.alpha, w.bravo] });

  const detail = await registry.getHazardDetail(co.body, w.hazard);
  assert.deepEqual(detail?.hazard, await registry.getHazard(co.body, w.hazard));
  assert.deepEqual(detail?.causalFactors, [cf.causalFactor]);
  assert.deepEqual(detail?.consequences, [co.consequence]);
});

test('getHazardDetail gives every live causal factor and consequence of that hazard once, by createdAtAest then id, not another hazard\'s and not a deleted one, and gives it whatever the hazard\'s own status (C-010; SL-03 criterion 2; SL-11)', async () => {
  const p = newProfile('Alice');
  for (const status of /** @type {const} */ (['live', 'retired', 'deleted'])) {
    const h = hazardRow(1, p, 'one', { status });
    const other = hazardRow(2, p, 'two');
    const t1 = plusSeconds(EARLIER, 10);
    const cfs = [
      causalFactorRow(orderedUuid(3), p, h.id, 'late, low id', { at: plusSeconds(EARLIER, 20) }),
      causalFactorRow(orderedUuid(9), p, h.id, 'tie, high id', { at: t1 }),
      causalFactorRow(orderedUuid(2), p, h.id, 'tie, low id', { at: t1 }),
      causalFactorRow(orderedUuid(1), p, h.id, 'deleted', { status: 'deleted' }),
      causalFactorRow(orderedUuid(4), p, other.id, 'another hazard\'s'),
    ];
    const cos = [
      consequenceRow(orderedUuid(7), p, h.id, 'b', { at: t1 }),
      consequenceRow(orderedUuid(6), p, h.id, 'a', { at: plusSeconds(EARLIER, 5) }),
      consequenceRow(orderedUuid(5), p, other.id, 'not this one'),
    ];
    const body = bodyFrom([h, other, ...cfs, ...cos]);
    const detail = await registry.getHazardDetail(body, h.id);
    assert.deepEqual(detail, { hazard: h, causalFactors: [cfs[2], cfs[1], cfs[0]], consequences: [cos[1], cos[0]], controls: [] }, `a ${status} hazard's detail as stored`);
  }
  assert.equal(await registry.getHazardDetail(bodyFrom([hazardRow(1, p, 'one')]), hazardId.fromSequence(2)), null, 'null only when no hazard has the id');
});

// ------------------------------------------------------------------ the control library (C-011, C-012)

test('createControl stores one library control with no hazard, no platform, and no control kind, records it, and listControls gives every live control by createdAtAest then id (C-011, C-023; SL-03 criterion 3)', async () => {
  const p = newProfile('Alice');
  const act = actOf(p);
  const body = schema.emptyDataBody();
  const { body: b, control: c } = await withClock(HELD, () => registry.createControl(body, act, { title: ' Stall warning ' }));
  assert.doesNotThrow(() => controlId.parse(c.id), 'a ControlId');
  assert.deepEqual(c, { id: c.id, kind: 'control', status: 'live', createdBy: p.id, createdAtAest: HELD, updatedBy: p.id, updatedAtAest: HELD, title: 'Stall warning' }, 'exactly these fields: nothing names a hazard, a platform, or a kind');
  assert.deepEqual(differences(body, b), only(`control/${c.id}`));
  await assertRecorded(body, b, { act, at: HELD, records: [{ before: null, after: c }], affected: [] });
  assert.deepEqual([...(await registry.listControls(b))], [c]);

  const t = plusSeconds(EARLIER, 60);
  const rows = [
    controlRow(orderedUuid(5), p, 'late', { at: plusSeconds(t, 1) }),
    controlRow(orderedUuid(9), p, 'tie high', { at: t }),
    controlRow(orderedUuid(2), p, 'tie low', { at: t }),
    controlRow(orderedUuid(1), p, 'retired', { status: 'retired' }),
    controlRow(orderedUuid(3), p, 'deleted', { status: 'deleted' }),
  ];
  assert.deepEqual([...(await registry.listControls(bodyFrom(rows)))], [rows[2], rows[1], rows[0]], 'live only, by createdAtAest then id');
  assert.deepEqual([...(await registry.listControls(schema.emptyDataBody()))], [], 'empty when the body has no control collection');
});

test('linkControlToHazard links one control to two hazards on either side, records each link, and getHazardDetail gives the hazard\'s controls by the link\'s createdAtAest then the control\'s id (C-012, C-023, C-024; SL-03 criteria 2 and 3)', async () => {
  const p = newProfile('Alice');
  const act = actOf(p);
  const pa = platformId.parse(orderedUuid(1, 0xa));
  const h1 = hazardRow(1, p, 'one');
  const h2 = hazardRow(2, p, 'two');
  const c1 = controlRow(orderedUuid(8), p, 'shared');
  const c2 = controlRow(orderedUuid(3), p, 'second');
  const body = bodyFrom([h1, h2, c1, c2, platformRow(pa, p, 'Alpha', p), hazardPlatformLinkRow(orderedUuid(50), p, h1.id, pa)]);

  const first = await withClock(HELD, () => registry.linkControlToHazard(body, act, { hazardId: h1.id, controlId: c1.id, controlKind: 'preventative' }));
  assert.doesNotThrow(() => linkId.parse(first.link.id), 'a LinkId');
  assert.deepEqual(first.link, {
    id: first.link.id, kind: 'link', status: 'live', createdBy: p.id, createdAtAest: HELD, updatedBy: p.id, updatedAtAest: HELD, linkKind: 'hazard-control', hazardId: h1.id, controlId: c1.id, controlKind: 'preventative',
  });
  assert.deepEqual(differences(body, first.body), only(`link/${first.link.id}`), 'only that entry of collections.link; the control and the hazard untouched');
  await assertRecorded(body, first.body, { act, at: HELD, records: [{ before: null, after: first.link }], affected: [pa] });

  const second = await withClock(HELD, () => registry.linkControlToHazard(first.body, act, { hazardId: h1.id, controlId: c2.id, controlKind: 'mitigating' }));
  const other = await withClock(plusSeconds(HELD, 1), () => registry.linkControlToHazard(second.body, act, { hazardId: h2.id, controlId: c1.id, controlKind: 'mitigating' }));
  await assertRecorded(second.body, other.body, { act, at: plusSeconds(HELD, 1), records: [{ before: null, after: other.link }], affected: [] });

  const d1 = await registry.getHazardDetail(other.body, h1.id);
  assert.deepEqual(d1?.controls, [{ control: c2, controlKind: 'mitigating' }, { control: c1, controlKind: 'preventative' }], 'same link time, so by control id');
  const d2 = await registry.getHazardDetail(other.body, h2.id);
  assert.deepEqual(d2?.controls, [{ control: c1, controlKind: 'mitigating' }], 'the same library control on a second hazard, on the other side');
  assert.deepEqual([...(await registry.listControls(other.body))].length, 2, 'still two controls in the library: linking copies nothing');
});

// ------------------------------------------------------------------ platforms (C-014, C-015, C-016, C-028)

test('createPlatform stores one platform with exactly one owner, records it, and every other entry of every collection, a reference entry included, is left as it was (C-014, C-023; SL-03 criteria 4 and 7)', async () => {
  const w = await smallWorld();
  const reference = { 'r-1': { id: 'r-1', kind: 'reference-entry', note: 'someone else\'s' } };
  const body = { ...w.body, collections: { ...w.body.collections, 'reference-entry': /** @type {any} */ (reference) } };
  const before = snapshot(body);
  const act = actOf(w.alice, w.alpha);

  const { body: b, platform: q } = await withClock(HELD, () => registry.createPlatform(body, act, { name: '  Charlie ', ownerProfileId: w.bob.id }));

  assert.doesNotThrow(() => platformId.parse(q.id), 'a PlatformId');
  assert.deepEqual(q, { id: q.id, kind: 'platform', status: 'live', createdBy: w.alice.id, createdAtAest: HELD, updatedBy: w.alice.id, updatedAtAest: HELD, name: 'Charlie', ownerProfileId: w.bob.id });
  assert.deepEqual(differences(body, b), only(`platform/${q.id}`), 'every hazard, control, link, and reference entry deep-equal, compared entry for entry, and the sequences unchanged');
  await assertRecorded(body, b, { act, at: HELD, records: [{ before: null, after: q }], affected: [q.id] });
  assert.deepEqual((await registry.listPlatforms(b)).map((x) => x.id), [w.alpha, w.bravo, q.id], 'by createdAtAest then id');
  assert.deepEqual(body, before);
});

test('listPlatforms gives every live platform once by createdAtAest then id; empty with no collection (C-014)', async () => {
  const p = newProfile('Alice');
  const t = plusSeconds(EARLIER, 30);
  const rows = [
    platformRow(platformId.parse(orderedUuid(7)), p, 'tie high', p, { at: t }),
    platformRow(platformId.parse(orderedUuid(1)), p, 'retired', p, { status: 'retired' }),
    platformRow(platformId.parse(orderedUuid(4)), p, 'tie low', p, { at: t }),
    platformRow(platformId.parse(orderedUuid(2)), p, 'first', p),
  ];
  assert.deepEqual([...(await registry.listPlatforms(bodyFrom(rows)))], [rows[3], rows[2], rows[0]]);
  assert.deepEqual([...(await registry.listPlatforms(schema.emptyDataBody()))], []);
});

test('linkHazardToPlatform adds one link carrying the hazard\'s global ID as its report ID, copies nothing, records it, and every one of the hazard\'s controls starts awaiting on the new platform (C-015, C-016, C-021, C-023; SL-03 criteria 1 and 8; HZ-007)', async () => {
  const w = await smallWorld();
  const act = actOf(w.alice);
  const created = await withClock(HELD, () => registry.createPlatform(w.body, act, { name: 'Charlie', ownerProfileId: w.alice.id }));
  const body = created.body;
  const charlie = created.platform.id;
  const later = plusSeconds(HELD, 1);

  const { body: b, link: l } = await withClock(later, () => registry.linkHazardToPlatform(body, act, { hazardId: w.hazard, platformId: charlie }));

  assert.deepEqual(l, {
    id: l.id, kind: 'link', status: 'live', createdBy: w.alice.id, createdAtAest: later, updatedBy: w.alice.id, updatedAtAest: later, linkKind: 'hazard-platform', hazardId: w.hazard, platformId: charlie, reportId: w.hazard,
  });
  assert.deepEqual(differences(body, b), only(`link/${l.id}`), 'the hazard\'s entry, its causal factors, consequences, controls, justifications, ratings, and control-platform links are not touched');
  await assertRecorded(body, b, { act, at: later, records: [{ before: null, after: l }], affected: [charlie] });

  const { rows } = await registry.listPlatformHazards(b, charlie);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reportId, w.hazard, 'the report ID is the global ID');
  assert.deepEqual(rows[0].controls.map((c) => [c.control.id, c.state, c.confirmation, c.justification]), [[w.stall, 'awaiting', null, null], [w.training, 'awaiting', null, null]], 'nothing is on the platform until confirmed');
  assert.deepEqual((await registry.platformsAffected(b, { kind: 'hazard', id: w.hazard })), [w.alpha, w.bravo, charlie].sort(), 'one hazard on any number of platforms');
});

test('setPlatformReportId sets the report ID on that one link, restamps it, leaves the global ID and the ID on every other platform, and records the edit (C-016, C-023; SL-03 criterion 8)', async () => {
  const w = await smallWorld();
  const links = await registry.listLinks(w.body, { kind: 'hazard', id: w.hazard });
  const onBravo = /** @type {any} */ (links.find((l) => l.linkKind === 'hazard-platform' && l.platformId === w.bravo));
  const act = actOf(w.bob, w.bravo);

  const { body: b, link: l } = await withClock(HELD, () => registry.setPlatformReportId(w.body, act, { hazardId: w.hazard, platformId: w.bravo, reportId: 'BRV-HZ-07' }));

  assert.deepEqual(l, { ...onBravo, reportId: 'BRV-HZ-07', updatedBy: w.bob.id, updatedAtAest: HELD });
  assert.deepEqual(differences(w.body, b), only(`link/${onBravo.id}`));
  await assertRecorded(w.body, b, { act, at: HELD, records: [{ before: onBravo, after: l }], affected: [w.bravo] });
  assert.equal((await registry.listPlatformHazards(b, w.bravo)).rows[0].reportId, 'BRV-HZ-07');
  assert.equal((await registry.listPlatformHazards(b, w.alpha)).rows[0].reportId, w.hazard, 'the other platform keeps its ID');
  assert.equal((await registry.getHazard(b, w.hazard))?.id, w.hazard, 'the global ID is unchanged');
});

// ------------------------------------------------------------------ ratings (C-017)

test('setRating stores the values exactly as entered per hazard, platform, and stage; a second call updates the one record keeping its id and creation stamp; getRatings gives both stages; each act is recorded (C-017, C-018, C-023; SL-03 criterion 5; HZ-002)', async () => {
  const w = await smallWorld();
  const act = actOf(w.alice, w.alpha);
  const initial = await withClock(HELD, () => registry.setRating(w.body, act, { hazardId: w.hazard, platformId: w.alpha, stage: 'initial', consequence: /** @type {any} */ (2), likelihood: /** @type {any} */ ('C') }));
  assert.deepEqual(initial.rating, {
    id: initial.rating.id, kind: 'rating', status: 'live', createdBy: w.alice.id, createdAtAest: HELD, updatedBy: w.alice.id, updatedAtAest: HELD, hazardId: w.hazard, platformId: w.alpha, stage: 'initial', consequence: 2, likelihood: 'C',
  });
  assert.deepEqual(differences(w.body, initial.body), only(`rating/${initial.rating.id}`));
  await assertRecorded(w.body, initial.body, { act, at: HELD, records: [{ before: null, after: initial.rating }], affected: [w.alpha] });

  const t2 = plusSeconds(HELD, 10);
  const residual = await withClock(t2, () => registry.setRating(initial.body, act, { hazardId: w.hazard, platformId: w.alpha, stage: 'residual', consequence: /** @type {any} */ (4), likelihood: null }));
  assert.notEqual(residual.rating.id, initial.rating.id, 'a stage of its own');
  assert.deepEqual(await registry.getRatings(residual.body, w.hazard, w.alpha), { initial: { consequence: 2, likelihood: 'C' }, residual: { consequence: 4, likelihood: null } }, 'exactly as entered, null kept');
  assert.deepEqual(await registry.getRatings(residual.body, w.hazard, w.bravo), { initial: { consequence: null, likelihood: null }, residual: { consequence: null, likelihood: null } }, 'nothing entered on the other platform');

  const t3 = plusSeconds(HELD, 20);
  const bob = actOf(w.bob, w.alpha);
  const again = await withClock(t3, () => registry.setRating(residual.body, bob, { hazardId: w.hazard, platformId: w.alpha, stage: 'residual', consequence: /** @type {any} */ (4), likelihood: /** @type {any} */ ('E') }));
  assert.deepEqual(again.rating, { ...residual.rating, likelihood: 'E', updatedBy: w.bob.id, updatedAtAest: t3 }, 'the one record updated: RatingId, createdBy, createdAtAest kept');
  assert.deepEqual(differences(residual.body, again.body), only(`rating/${residual.rating.id}`));
  await assertRecorded(residual.body, again.body, { act: bob, at: t3, records: [{ before: residual.rating, after: again.rating }], affected: [w.alpha] });
  assert.equal((await registry.listPlatformHazards(again.body, w.alpha)).rows[0].residual.likelihood, 'E', 'the row gives the residual last set');
});

test('getRatings is a read: an unknown hazard, an unknown platform, and a hazard not on the platform are "none", both values null (C-017)', async () => {
  const w = await smallWorld();
  const none = { initial: { consequence: null, likelihood: null }, residual: { consequence: null, likelihood: null } };
  assert.deepEqual(await registry.getRatings(w.body, hazardId.fromSequence(99), w.alpha), none);
  assert.deepEqual(await registry.getRatings(w.body, w.hazard, platformId.fresh()), none);
  assert.deepEqual(await registry.getRatings(schema.emptyDataBody(), w.hazard, w.alpha), none);
});

// ------------------------------------------------------------------ a hazard's controls on a platform (C-013, C-019, C-020, C-021, C-022)

test('confirmControlForPlatform puts one control on one platform for one hazard by one link stamped with who and when, records it, and the row shows it confirmed with that confirmation (C-013, C-021, C-022, C-023; SL-04 criteria 1 and 4; HZ-007)', async () => {
  const w = await smallWorld();
  const act = actOf(w.bob, w.bravo);

  const { body: b, link: l, clearedJustification } = await withClock(HELD, () => registry.confirmControlForPlatform(w.body, act, { hazardId: w.hazard, controlId: w.stall, platformId: w.bravo }));

  assert.deepEqual(l, {
    id: l.id, kind: 'link', status: 'live', createdBy: w.bob.id, createdAtAest: HELD, updatedBy: w.bob.id, updatedAtAest: HELD, linkKind: 'control-platform', hazardId: w.hazard, controlId: w.stall, platformId: w.bravo,
  });
  assert.equal(clearedJustification, null, 'it was awaiting, so nothing was superseded');
  assert.deepEqual(differences(w.body, b), only(`link/${l.id}`));
  await assertRecorded(w.body, b, { act, at: HELD, records: [{ before: null, after: l }], affected: [w.bravo] });

  const bravo = (await registry.listPlatformHazards(b, w.bravo)).rows[0].controls;
  assert.deepEqual(bravo.map((c) => [c.control.id, c.state, c.confirmation, c.justification]), [[w.stall, 'confirmed', { byProfileId: w.bob.id, atAest: HELD }, null], [w.training, 'awaiting', null, null]]);
  const alpha = (await registry.listPlatformHazards(b, w.alpha)).rows[0].controls;
  assert.deepEqual(alpha.map((c) => c.state), ['awaiting', 'awaiting'], 'confirmed on Bravo is not on Alpha (DEC-013)');
});

test('a confirmation names all three ids: the same control confirmed for one hazard on a platform is not on that platform for another hazard (C-013, DEC-013; SL-03 criterion 3)', async () => {
  const w = await smallWorld();
  const act = actOf(w.alice);
  let body = (await withClock(HELD, () => registry.createHazard(w.body, act, { title: 'second hazard' }))).body;
  const second = hazardId.fromSequence(2);
  body = (await withClock(HELD, () => registry.linkControlToHazard(body, act, { hazardId: second, controlId: w.stall, controlKind: 'mitigating' }))).body;
  body = (await withClock(HELD, () => registry.linkHazardToPlatform(body, act, { hazardId: second, platformId: w.alpha }))).body;
  body = (await withClock(HELD, () => registry.confirmControlForPlatform(body, act, { hazardId: w.hazard, controlId: w.stall, platformId: w.alpha }))).body;

  const { rows } = await registry.listPlatformHazards(body, w.alpha);
  assert.deepEqual(rows.map((r) => r.hazard.id), [w.hazard, second]);
  assert.equal(rows[0].controls.find((c) => c.control.id === w.stall)?.state, 'confirmed');
  assert.equal(rows[1].controls.find((c) => c.control.id === w.stall)?.state, 'awaiting', 'the second hazard\'s use of the same control awaits a confirmation of its own');
});

test('excludeControlFromPlatform stores the trimmed reason against the three ids, records it, and the row shows the control excluded with that reason (C-020, C-021, C-023; SL-04 criteria 2 and 3; HZ-001)', async () => {
  const w = await smallWorld();
  const act = actOf(w.alice, w.alpha);

  const { body: b, justification: j, removedLink } = await withClock(HELD, () => registry.excludeControlFromPlatform(w.body, act, { hazardId: w.hazard, controlId: w.training, platformId: w.alpha, text: '  not fitted to this type ' }));

  assert.doesNotThrow(() => justificationId.parse(j.id), 'a JustificationId');
  assert.deepEqual(j, {
    id: j.id, kind: 'justification', status: 'live', createdBy: w.alice.id, createdAtAest: HELD, updatedBy: w.alice.id, updatedAtAest: HELD, hazardId: w.hazard, controlId: w.training, platformId: w.alpha, text: 'not fitted to this type',
  });
  assert.equal(removedLink, null, 'it was awaiting, so no link was superseded');
  assert.deepEqual(differences(w.body, b), only(`justification/${j.id}`));
  await assertRecorded(w.body, b, { act, at: HELD, records: [{ before: null, after: j }], affected: [w.alpha] });

  const controls = (await registry.listPlatformHazards(b, w.alpha)).rows[0].controls;
  assert.deepEqual(controls.map((c) => [c.control.id, c.state, c.confirmation, c.justification]), [[w.stall, 'awaiting', null, null], [w.training, 'excluded', null, j]], 'every one of the hazard\'s controls is shown, the excluded one with its reason');
});

test('confirm, then exclude, then confirm again: each act supersedes the other, keeps the superseded row with status deleted and only updatedBy and updatedAtAest restamped, adds a new row rather than reviving one, and records both records in C-023\'s order (C-013, C-020, C-021, C-022, C-023; SL-04 criterion 4; SL-05 criteria 1 and 2)', async () => {
  const w = await smallWorld();
  const triple = { hazardId: w.hazard, controlId: w.stall, platformId: w.alpha };
  const t1 = HELD;
  const t2 = plusSeconds(HELD, 60);
  const t3 = plusSeconds(HELD, 120);
  const byAlice = actOf(w.alice, w.alpha);
  const byBob = actOf(w.bob, null);

  const confirmed = await withClock(t1, () => registry.confirmControlForPlatform(w.body, byAlice, triple));
  const excluded = await withClock(t2, () => registry.excludeControlFromPlatform(confirmed.body, byBob, { ...triple, text: 'removed after the mod' }));

  assert.deepEqual(excluded.removedLink, { ...confirmed.link, status: 'deleted', updatedBy: w.bob.id, updatedAtAest: t2 }, 'the link superseded, its creation stamp kept (C-022)');
  assert.deepEqual(differences(confirmed.body, excluded.body), only(`justification/${excluded.justification.id}`, `link/${confirmed.link.id}`));
  const exclusionEntry = await assertRecorded(confirmed.body, excluded.body, {
    act: byBob, at: t2, records: [{ before: null, after: excluded.justification }, { before: confirmed.link, after: excluded.removedLink }], affected: [w.alpha],
  });
  assert.deepEqual(exclusionEntry.items.map((i) => [i.ref.kind, i.action]), [['justification', 'created'], ['link', 'deleted']], 'the justification created, then the link it removed');
  assert.equal((await registry.listPlatformHazards(excluded.body, w.alpha)).rows[0].controls[0].state, 'excluded');

  const again = await withClock(t3, () => registry.confirmControlForPlatform(excluded.body, byBob, triple));
  assert.notEqual(again.link.id, confirmed.link.id, 'a new row with a new LinkId');
  assert.deepEqual(again.clearedJustification, { ...excluded.justification, status: 'deleted', updatedBy: w.bob.id, updatedAtAest: t3 });
  assert.deepEqual(differences(excluded.body, again.body), only(`link/${again.link.id}`, `justification/${excluded.justification.id}`));
  await assertRecorded(excluded.body, again.body, {
    act: byBob, at: t3, records: [{ before: null, after: again.link }, { before: excluded.justification, after: again.clearedJustification }], affected: [w.alpha],
  });
  const row = (await registry.listPlatformHazards(again.body, w.alpha)).rows[0].controls[0];
  assert.deepEqual([row.state, row.confirmation, row.justification], ['confirmed', { byProfileId: w.bob.id, atAest: t3 }, null], 'the second confirmer, on the new row');
  const links = Object.values(/** @type {Record<string, any>} */ (again.body.collections.link));
  assert.equal(links.filter((l) => l.linkKind === 'control-platform').length, 2, 'no row was removed');
  assert.deepEqual(links.find((l) => l.id === confirmed.link.id), excluded.removedLink, 'the first confirmation is still who and when it was');
});

test('listPlatformHazards gives the platform, one row per live hazard with a live link to it by global ID number, each with its report ID, every control in C-012\'s order with its state, and the residual as entered; nothing for a hazard not linked, not live, or linked by a deleted link (C-019; SL-03 criterion 9, SL-04 criterion 2; HZ-004)', async () => {
  const p = newProfile('Alice');
  const pa = platformId.parse(orderedUuid(1, 0xa));
  const pb = platformId.parse(orderedUuid(2, 0xa));
  const alpha = platformRow(pa, p, 'Alpha', p);
  const h1 = hazardRow(1, p, 'one');
  const h3 = hazardRow(3, p, 'three');
  const h10 = hazardRow(10, p, 'ten');
  const retired = hazardRow(4, p, 'retired', { status: 'retired' });
  const deleted = hazardRow(5, p, 'deleted', { status: 'deleted' });
  const elsewhere = hazardRow(6, p, 'only on bravo');
  const unlinked = hazardRow(7, p, 'link deleted');
  const c1 = controlRow(orderedUuid(30), p, 'c1');
  const c2 = controlRow(orderedUuid(20), p, 'c2', { status: 'retired' });
  const c3 = controlRow(orderedUuid(10), p, 'c3');
  const tLate = plusSeconds(EARLIER, 100);
  const j = justificationRow(orderedUuid(60), p, { hazardId: h10.id, controlId: c3.id, platformId: pa }, 'not on this platform');
  const confirmation = controlPlatformLinkRow(orderedUuid(61), p, { hazardId: h10.id, controlId: c1.id, platformId: pa }, { at: plusSeconds(EARLIER, 7) });
  const body = bodyFrom([
    alpha, platformRow(pb, p, 'Bravo', p), h1, h3, h10, retired, deleted, elsewhere, unlinked, c1, c2, c3,
    hazardPlatformLinkRow(orderedUuid(40), p, h10.id, pa, { reportId: 'ALPHA-1' }), hazardPlatformLinkRow(orderedUuid(41), p, h1.id, pa), hazardPlatformLinkRow(orderedUuid(42), p, h3.id, pa),
    hazardPlatformLinkRow(orderedUuid(43), p, retired.id, pa), hazardPlatformLinkRow(orderedUuid(44), p, deleted.id, pa), hazardPlatformLinkRow(orderedUuid(45), p, elsewhere.id, pb),
    hazardPlatformLinkRow(orderedUuid(46), p, unlinked.id, pa, { status: 'deleted' }),
    hazardControlLinkRow(orderedUuid(50), p, h10.id, c1.id, 'mitigating', { at: tLate }),
    hazardControlLinkRow(orderedUuid(51), p, h10.id, c2.id, 'preventative'),
    hazardControlLinkRow(orderedUuid(52), p, h10.id, c3.id, 'preventative'),
    hazardControlLinkRow(orderedUuid(53), p, h1.id, c1.id, 'preventative', { status: 'deleted' }),
    j, confirmation,
    controlPlatformLinkRow(orderedUuid(62), p, { hazardId: h10.id, controlId: c2.id, platformId: pb }),
    ratingRow(orderedUuid(70), p, { hazardId: h10.id, platformId: pa, stage: 'residual', consequence: 3, likelihood: 'D' }),
    ratingRow(orderedUuid(71), p, { hazardId: h10.id, platformId: pa, stage: 'initial', consequence: 1, likelihood: 'A' }),
    ratingRow(orderedUuid(72), p, { hazardId: h3.id, platformId: pb, stage: 'residual', consequence: 5, likelihood: 'G' }),
    ratingRow(orderedUuid(73), p, { hazardId: h3.id, platformId: pa, stage: 'residual', consequence: 2, likelihood: 'B' }, { status: 'deleted' }),
  ]);
  const before = snapshot(body);
  const none = { consequence: null, likelihood: null };

  const result = await registry.listPlatformHazards(body, pa);

  assert.deepEqual(result, {
    platform: alpha,
    rows: [
      { hazard: h1, reportId: h1.id, controls: [], residual: none },
      { hazard: h3, reportId: h3.id, controls: [], residual: none },
      {
        hazard: h10,
        reportId: 'ALPHA-1',
        controls: [
          { control: c3, controlKind: 'preventative', state: 'excluded', confirmation: null, justification: j },
          { control: c2, controlKind: 'preventative', state: 'awaiting', confirmation: null, justification: null },
          { control: c1, controlKind: 'mitigating', state: 'confirmed', confirmation: { byProfileId: p.id, atAest: confirmation.createdAtAest }, justification: null },
        ],
        residual: { consequence: 3, likelihood: 'D' },
      },
    ],
    omitted: [],
  });
  assert.deepEqual(body, before, 'a read changes nothing');
  assert.equal((await changeLog.listEntries(body)).length, 0, 'and records nothing');
  assert.deepEqual(await registry.listPlatformHazards(bodyFrom([alpha]), pa), { platform: alpha, rows: [], omitted: [] }, 'no link collection: empty rows and empty omitted');
});

// ------------------------------------------------------------------ retirement (C-025, C-026, C-027) and ownership (C-028)

test('retireHazard of a hazard on no platform marks it retired, takes it out of the list, keeps every other record, and records a retirement reaching no platform (C-025, C-023; SL-05 criterion 6)', async () => {
  const p = newProfile('Alice');
  const h = hazardRow(1, p, 'one');
  const pa = platformId.parse(orderedUuid(1, 0xa));
  const body = bodyFrom([h, hazardRow(2, p, 'two'), platformRow(pa, p, 'Alpha', p), causalFactorRow(orderedUuid(5), p, h.id, 'cause'), hazardPlatformLinkRow(orderedUuid(6), p, h.id, pa, { status: 'deleted' })]);
  const act = actOf(p, pa);

  const { body: b, hazard: r } = await withClock(HELD, () => registry.retireHazard(body, act, h.id));

  assert.deepEqual(r, { ...h, status: 'retired', updatedBy: p.id, updatedAtAest: HELD });
  assert.deepEqual(await registry.getHazard(b, h.id), r);
  assert.deepEqual((await registry.listHazards(b)).map((x) => x.id), ['H-0002']);
  assert.deepEqual(differences(body, b), only('hazard/H-0001'), 'no link, causal factor, consequence, justification, or rating is touched; the sequence does not move');
  const entry = await assertRecorded(body, b, { act, at: HELD, records: [{ before: h, after: r }], affected: [] });
  assert.equal(entry.items[0].action, 'retired');
});

test('retireControl takes the control out of the library and off nothing: it stays in the hazard\'s detail and in every platform row in the state it was in, and the retirement reaches every platform its hazards are on (C-025, C-027, C-023, C-024; SL-05 criterion 6; HZ-001)', async () => {
  const w = await smallWorld();
  let body = (await withClock(HELD, () => registry.confirmControlForPlatform(w.body, actOf(w.alice), { hazardId: w.hazard, controlId: w.stall, platformId: w.alpha }))).body;
  body = (await withClock(HELD, () => registry.excludeControlFromPlatform(body, actOf(w.bob), { hazardId: w.hazard, controlId: w.stall, platformId: w.bravo, text: 'not fitted' }))).body;
  const alphaBefore = await registry.listPlatformHazards(body, w.alpha);
  const bravoBefore = await registry.listPlatformHazards(body, w.bravo);
  const control = /** @type {any} */ ((await registry.listControls(body)).find((c) => c.id === w.stall));
  const act = actOf(w.alice, null);
  const t = plusSeconds(HELD, 30);

  const { body: b, control: c } = await withClock(t, () => registry.retireControl(body, act, w.stall));

  assert.deepEqual(c, { ...control, status: 'retired', updatedBy: w.alice.id, updatedAtAest: t });
  assert.deepEqual((await registry.listControls(b)).map((x) => x.id), [w.training, w.unused], 'out of the library list');
  assert.deepEqual(differences(body, b), only(`control/${w.stall}`), 'no link or justification changes');
  await assertRecorded(body, b, { act, at: t, records: [{ before: control, after: c }], affected: [w.alpha, w.bravo] });

  const withRetired = (/** @type {any} */ result) => ({ ...result, rows: result.rows.map((/** @type {any} */ row) => ({ ...row, controls: row.controls.map((/** @type {any} */ pc) => (pc.control.id === w.stall ? { ...pc, control: c } : pc)) })) });
  assert.deepEqual(await registry.listPlatformHazards(b, w.alpha), withRetired(alphaBefore), 'still confirmed on Alpha, as stored with status retired');
  assert.deepEqual(await registry.listPlatformHazards(b, w.bravo), withRetired(bravoBefore), 'still excluded on Bravo with the same reason');
  assert.deepEqual((await registry.getHazardDetail(b, w.hazard))?.controls.map((x) => [x.control.id, x.control.status]), [[w.stall, 'retired'], [w.training, 'live']], 'still one of the hazard\'s');
});

test('retirePlatform takes the platform out of listPlatforms and off nothing: its hazards, ratings, and links are still read, and the retirement reaches that platform (C-025, C-027, C-023, C-024; SL-05 criterion 6)', async () => {
  const w = await smallWorld();
  let body = (await withClock(HELD, () => registry.setRating(w.body, actOf(w.bob), { hazardId: w.hazard, platformId: w.bravo, stage: 'residual', consequence: /** @type {any} */ (3), likelihood: /** @type {any} */ ('B') }))).body;
  const bravoBefore = await registry.listPlatformHazards(body, w.bravo);
  const platform = /** @type {any} */ ((await registry.listPlatforms(body)).find((q) => q.id === w.bravo));
  const act = actOf(w.bob, w.bravo);

  const { body: b, platform: q } = await withClock(HELD, () => registry.retirePlatform(body, act, w.bravo));

  assert.deepEqual(q, { ...platform, status: 'retired', updatedBy: w.bob.id, updatedAtAest: HELD });
  assert.deepEqual((await registry.listPlatforms(b)).map((x) => x.id), [w.alpha]);
  assert.deepEqual(differences(body, b), only(`platform/${w.bravo}`));
  await assertRecorded(body, b, { act, at: HELD, records: [{ before: platform, after: q }], affected: [w.bravo] });
  assert.deepEqual(await registry.listPlatformHazards(b, w.bravo), { ...bravoBefore, platform: q }, 'listPlatformHazards still resolves for it, rows unchanged');
  assert.deepEqual((await registry.getRatings(b, w.hazard, w.bravo)).residual, { consequence: 3, likelihood: 'B' });
  assert.deepEqual(await registry.platformsAffected(b, { kind: 'hazard', id: w.hazard }), [w.alpha, w.bravo].sort(), 'still named');
});

test('setPlatformOwner changes only the owner, records it, and the platform\'s queue is untouched: everything the outgoing owner had not acknowledged awaits the incoming owner, plus this act when it was made for another platform (C-028, C-023; SL-05 criterion 5; REQ-081)', async () => {
  const w = await smallWorld();
  const carol = newProfile('Carol');
  // Two changes made from Alpha's screen reach Bravo and await its owner, after what smallWorld's
  // acts, made for no platform, already put in Bravo's queue (C-024: its creation and its link).
  const fromSetup = [...(await changeLog.listAwaiting(w.body, w.bravo))];
  let body = (await withClock(plusSeconds(HELD, 1), () => registry.updateHazard(w.body, actOf(w.alice, w.alpha), w.hazard, { title: 'renamed once' }))).body;
  body = (await withClock(plusSeconds(HELD, 2), () => registry.addCausalFactor(body, actOf(w.alice, w.alpha), w.hazard, { text: 'a cause' }))).body;
  const awaiting = [...(await changeLog.listAwaiting(body, w.bravo))];
  assert.equal(awaiting.length, fromSetup.length + 2, 'the setup: two more changes await Bravo');
  const platform = /** @type {any} */ ((await registry.listPlatforms(body)).find((q) => q.id === w.bravo));

  const fromBravo = actOf(w.bob, w.bravo);
  const t = plusSeconds(HELD, 10);
  const { body: b, platform: q } = await withClock(t, () => registry.setPlatformOwner(body, fromBravo, { platformId: w.bravo, ownerProfileId: carol.id }));
  assert.deepEqual(q, { ...platform, ownerProfileId: carol.id, updatedBy: w.bob.id, updatedAtAest: t }, 'id, kind, name, status, and creation stamp as they were');
  assert.deepEqual(differences(body, b), only(`platform/${w.bravo}`));
  await assertRecorded(body, b, { act: fromBravo, at: t, records: [{ before: platform, after: q }], affected: [w.bravo] });
  assert.deepEqual([...(await changeLog.listAwaiting(b, w.bravo))], awaiting, 'made for Bravo: the queue is exactly what it was, in the same order');

  const fromNowhere = actOf(w.bob, null);
  const other = await withClock(t, () => registry.setPlatformOwner(body, fromNowhere, { platformId: w.bravo, ownerProfileId: carol.id }));
  const entry = await assertRecorded(body, other.body, { act: fromNowhere, at: t, records: [{ before: platform, after: other.platform }], affected: [w.bravo] });
  assert.deepEqual([...(await changeLog.listAwaiting(other.body, w.bravo))], [...awaiting, entry], 'made for no platform: the queue plus this act');
});

// ------------------------------------------------------------------ what a change reaches (C-024)

test('platformsAffected derives, for a record of each kind, the platforms its live links reach, distinct and ascending as strings (C-024; SL-05 criteria 3 and 4; HZ-006)', async () => {
  const p = newProfile('Alice');
  const [pa, pb, pc, pd] = [4, 1, 3, 2].map((n) => platformId.parse(orderedUuid(n, 0xa)));
  const h1 = hazardRow(1, p, 'on a, b');
  const h2 = hazardRow(2, p, 'on b, c', { status: 'deleted' });
  const h3 = hazardRow(3, p, 'on nothing live');
  const c1 = controlRow(orderedUuid(10), p, 'of h1 and h2', { status: 'retired' });
  const c2 = controlRow(orderedUuid(11), p, 'of nothing live');
  const hc1 = hazardControlLinkRow(orderedUuid(20), p, h1.id, c1.id, 'preventative');
  const cp = controlPlatformLinkRow(orderedUuid(21), p, { hazardId: h1.id, controlId: c1.id, platformId: pa });
  const hp = hazardPlatformLinkRow(orderedUuid(22), p, h1.id, pb);
  const cf = causalFactorRow(orderedUuid(30), p, h2.id, 'cause');
  const co = consequenceRow(orderedUuid(31), p, h3.id, 'effect');
  const j = justificationRow(orderedUuid(32), p, { hazardId: h2.id, controlId: c1.id, platformId: pc }, 'reason');
  const r = ratingRow(orderedUuid(33), p, { hazardId: h1.id, platformId: pd, stage: 'initial', consequence: 1, likelihood: 'A' });
  const body = bodyFrom([
    platformRow(pa, p, 'a', p), platformRow(pb, p, 'b', p, { status: 'retired' }), platformRow(pc, p, 'c', p), platformRow(pd, p, 'd', p),
    h1, h2, h3, c1, c2, hc1, cp, hp, cf, co, j, r,
    hazardPlatformLinkRow(orderedUuid(23), p, h1.id, pa),
    hazardPlatformLinkRow(orderedUuid(24), p, h2.id, pb), hazardPlatformLinkRow(orderedUuid(25), p, h2.id, pc),
    hazardPlatformLinkRow(orderedUuid(26), p, h3.id, pd, { status: 'deleted' }),
    hazardControlLinkRow(orderedUuid(27), p, h2.id, c1.id, 'mitigating'),
    hazardControlLinkRow(orderedUuid(28), p, h3.id, c2.id, 'mitigating', { status: 'deleted' }),
  ]);
  const before = snapshot(body);
  const sorted = (/** @type {string[]} */ ...ids) => [...ids].sort();

  /** @type {[import('../../../baseline/types.js').RecordRef, string[], string][]} */
  const cases = [
    [refOf(h1), sorted(pa, pb), 'a hazard: its live hazard-platform links'],
    [refOf(h2), sorted(pb, pc), 'a deleted hazard still reaches the platforms still linked to it'],
    [refOf(h3), [], 'a hazard whose only link is deleted'],
    [refOf(c1), sorted(pa, pb, pc), 'a control: the platforms of every hazard it is linked to, once each; a retired control and a retired platform are not consulted'],
    [refOf(c2), [], 'a control whose only link is deleted'],
    [{ kind: 'platform', id: pb }, [pb], 'a platform: itself, retired or not'],
    [refOf(cf), sorted(pb, pc), 'a causal factor: its hazard\'s platforms'],
    [refOf(co), [], 'a consequence of a hazard on nothing live'],
    [refOf(j), [pc], 'a justification: the platform it names'],
    [refOf(r), [pd], 'a rating: the platform it names'],
    [refOf(cp), [pa], 'a control-platform link: its platform'],
    [refOf(hp), [pb], 'a hazard-platform link: its platform'],
    [refOf(hc1), sorted(pa, pb), 'a hazard-control link: its hazard\'s platforms'],
  ];
  for (const [ref, expected, why] of cases) assert.deepEqual([...(await registry.platformsAffected(body, ref))], expected, why);
  assert.deepEqual(body, before, 'a read changes nothing');
});

// ------------------------------------------------------------------ every status, and what is linked (C-030, C-031)

test('listAllHazards, listAllControls, and listAllPlatforms give every record whatever its status, each carrying it, in the live lists\' orders, of which the live lists are exactly the live entries (C-030; SL-11 criterion 1)', async () => {
  const p = newProfile('Alice');
  const t = plusSeconds(EARLIER, 50);
  const hazards = [hazardRow(12, p, 'twelve', { status: 'deleted' }), hazardRow(2, p, 'two'), hazardRow(9, p, 'nine', { status: 'retired' }), hazardRow(1, p, 'one')];
  const controls = [controlRow(orderedUuid(9), p, 'tie high', { at: t, status: 'retired' }), controlRow(orderedUuid(3), p, 'tie low', { at: t }), controlRow(orderedUuid(1), p, 'late', { at: plusSeconds(t, 1), status: 'deleted' })];
  const platforms = [platformRow(platformId.parse(orderedUuid(5)), p, 'late', p, { at: plusSeconds(t, 9) }), platformRow(platformId.parse(orderedUuid(6)), p, 'early', p, { status: 'retired' })];
  const body = bodyFrom([...hazards, ...controls, ...platforms]);

  const allHazards = [...(await registry.listAllHazards(body))];
  assert.deepEqual(allHazards, [hazards[3], hazards[1], hazards[2], hazards[0]], 'by number, every status');
  assert.deepEqual([...(await registry.listHazards(body))], allHazards.filter((h) => h.status === 'live'));
  const allControls = [...(await registry.listAllControls(body))];
  assert.deepEqual(allControls, [controls[1], controls[0], controls[2]], 'by createdAtAest then id, every status');
  assert.deepEqual([...(await registry.listControls(body))], allControls.filter((c) => c.status === 'live'));
  const allPlatforms = [...(await registry.listAllPlatforms(body))];
  assert.deepEqual(allPlatforms, [platforms[1], platforms[0]]);
  assert.deepEqual([...(await registry.listPlatforms(body))], allPlatforms.filter((q) => q.status === 'live'));
  for (const list of [registry.listAllHazards, registry.listAllControls, registry.listAllPlatforms]) assert.deepEqual([...(await list(schema.emptyDataBody()))], [], 'empty with no collection');
});

test('listLinks gives every live link naming a hazard, a control, or a platform in its field, of every link kind that has the field, by createdAtAest then id, whatever the status of the records at either end (C-031; SL-11 criteria 1 and 4)', async () => {
  const p = newProfile('Alice');
  const pa = platformId.parse(orderedUuid(1, 0xa));
  const h1 = hazardRow(1, p, 'one', { status: 'deleted' });
  const h2 = hazardRow(2, p, 'two');
  const c1 = controlRow(orderedUuid(10), p, 'c1', { status: 'retired' });
  const t = plusSeconds(EARLIER, 40);
  const hp = hazardPlatformLinkRow(orderedUuid(29), p, h1.id, pa, { at: t });
  const hc = hazardControlLinkRow(orderedUuid(21), p, h1.id, c1.id, 'mitigating', { at: t });
  const cp = controlPlatformLinkRow(orderedUuid(22), p, { hazardId: h1.id, controlId: c1.id, platformId: pa }, { at: plusSeconds(EARLIER, 1) });
  const deleted = controlPlatformLinkRow(orderedUuid(23), p, { hazardId: h1.id, controlId: c1.id, platformId: pa }, { status: 'deleted' });
  const other = hazardControlLinkRow(orderedUuid(24), p, h2.id, controlId.parse(orderedUuid(11)), 'preventative');
  const body = bodyFrom([h1, h2, c1, platformRow(pa, p, 'Alpha', p, { status: 'retired' }), hp, hc, cp, deleted, other, causalFactorRow(orderedUuid(30), p, h1.id, 'not a link')]);

  assert.deepEqual([...(await registry.listLinks(body, refOf(h1)))], [cp, hc, hp], 'a deleted hazard: all three kinds, by time then id');
  assert.deepEqual([...(await registry.listLinks(body, refOf(c1)))], [cp, hc], 'a retired control: its hazard-control and control-platform links, not the superseded one');
  assert.deepEqual([...(await registry.listLinks(body, { kind: 'platform', id: pa }))], [cp, hp], 'a retired platform: its hazard-platform and control-platform links');
  assert.deepEqual([...(await registry.listLinks(body, refOf(h2)))], [other]);
  for (const kind of /** @type {const} */ (['causal-factor', 'consequence', 'justification', 'rating', 'link'])) {
    assert.deepEqual([...(await registry.listLinks(body, { kind, id: orderedUuid(30) }))], [], `no link names a ${kind}`);
  }
  assert.deepEqual([...(await registry.listLinks(body, { kind: 'hazard', id: 'H-0099' }))], [], 'an id nothing has');
});

// ------------------------------------------------------------------ the act (C-023)

test('an act made for one platform lands in the queue of every other platform it reaches and not its own; the same act made for no platform lands in every one (C-023; change-log C-010; SL-05 criterion 4)', async () => {
  const w = await smallWorld();
  // smallWorld's acts are made for no platform, so each platform's queue already holds its own
  // creation and its hazard link (C-024); the act under test is measured against that, and
  // at HELD it sorts after every one of them (change-log C-010).
  const alphaBefore = [...(await changeLog.listAwaiting(w.body, w.alpha))];
  const bravoBefore = [...(await changeLog.listAwaiting(w.body, w.bravo))];
  const actAt = async (/** @type {any} */ b) => (await changeLog.listEntries(b)).filter((e) => e.createdAtAest === HELD);

  const forAlpha = await withClock(HELD, () => registry.updateHazard(w.body, actOf(w.alice, w.alpha), w.hazard, { title: 'renamed' }));
  const [madeForAlpha] = await actAt(forAlpha.body);
  assert.deepEqual([...(await changeLog.listAwaiting(forAlpha.body, w.alpha))], alphaBefore, 'not the platform it was made for');
  assert.deepEqual([...(await changeLog.listAwaiting(forAlpha.body, w.bravo))], [...bravoBefore, madeForAlpha], 'the other platform it reaches');

  const forNone = await withClock(HELD, () => registry.updateHazard(w.body, actOf(w.alice, null), w.hazard, { title: 'renamed' }));
  const acts = await actAt(forNone.body);
  assert.equal(acts.length, 1, 'one act, one entry');
  assert.deepEqual([...(await changeLog.listAwaiting(forNone.body, w.alpha))], [...alphaBefore, acts[0]]);
  assert.deepEqual([...(await changeLog.listAwaiting(forNone.body, w.bravo))], [...bravoBefore, acts[0]]);
});

test('reads record nothing: no read of this contract adds an entry or changes the body (C-023, C-003)', async () => {
  const w = await smallWorld();
  const before = snapshot(w.body);
  const entries = await changeLog.listEntries(w.body);
  await registry.listHazards(w.body);
  await registry.getHazard(w.body, w.hazard);
  await registry.getHazardDetail(w.body, w.hazard);
  await registry.listControls(w.body);
  await registry.listPlatforms(w.body);
  await registry.getRatings(w.body, w.hazard, w.alpha);
  await registry.listPlatformHazards(w.body, w.alpha);
  await registry.platformsAffected(w.body, { kind: 'hazard', id: w.hazard });
  await registry.listAllHazards(w.body);
  await registry.listAllControls(w.body);
  await registry.listAllPlatforms(w.body);
  await registry.listLinks(w.body, { kind: 'hazard', id: w.hazard });
  assert.deepEqual(w.body, before);
  assert.deepEqual(await changeLog.listEntries(w.body), entries);
});
