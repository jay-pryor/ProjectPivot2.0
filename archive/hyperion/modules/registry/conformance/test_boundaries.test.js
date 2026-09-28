/**
 * registry conformance: boundaries (CORE-CON-002). Empty, degenerate, and edge cases of
 * modules/registry/CONTRACT.md 5.0: a body with no collections or empty ones, what trimming
 * removes and keeps, gaps in the numbering and sequences past four digits, the ends of the
 * rating scales and the null case, a platform id a record names that no platform has, an act
 * made for a platform that is not live, supersessions in one second, and collections of other
 * kinds carried through untouched. Written from the contract before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as registry from '../contract.js';
import { HazardNotLiveError, NoChangeError, UnknownHazardError, UnknownPlatformError } from '../contract.js';
import { hazardId, platformId } from '../../../baseline/types.js';
import {
  HELD, OWNED_KINDS, actOf, assertRecorded, assertRefused, bodyFrom, causalFactorRow, changeLog, controlPlatformLinkRow, controlRow, differences,
  hazardControlLinkRow, hazardPlatformLinkRow, hazardRow, jsonRoundTrip, justificationRow, newProfile, orderedUuid, platformRow, plusSeconds, ratingRow,
  rejectionOf, schema, smallWorld, snapshot, withClock,
} from './harness.js';

/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */

test('a body with no collections: every list is empty, every get is null, every rating is none, platformsAffected and listLinks of any owned kind are empty, listPlatformHazards refuses the unknown platform, and the first change creates its collection and the log (C-006, C-010, C-011, C-014, C-017, C-019, C-024, C-030, C-031; change-log C-006)', async () => {
  const body = schema.emptyDataBody();
  const p = newProfile('Alice');
  const somePlatform = platformId.parse(orderedUuid(1, 0xa));
  for (const list of [registry.listHazards, registry.listAllHazards, registry.listControls, registry.listAllControls, registry.listPlatforms, registry.listAllPlatforms]) {
    assert.deepEqual([...(await list(body))], [], `${list.name} is empty`);
  }
  assert.equal(await registry.getHazard(body, hazardId.fromSequence(1)), null);
  assert.equal(await registry.getHazardDetail(body, hazardId.fromSequence(1)), null);
  assert.deepEqual(await registry.getRatings(body, hazardId.fromSequence(1), somePlatform), { initial: { consequence: null, likelihood: null }, residual: { consequence: null, likelihood: null } });
  for (const kind of OWNED_KINDS) {
    assert.deepEqual([...(await registry.platformsAffected(body, { kind, id: orderedUuid(1) }))], [], `platformsAffected of a ${kind} nothing has`);
    assert.deepEqual([...(await registry.listLinks(body, { kind, id: orderedUuid(1) }))], [], `listLinks of a ${kind} nothing has`);
  }
  await assertRefused(() => registry.listPlatformHazards(body, somePlatform), UnknownPlatformError, body, 'listPlatformHazards on a body with no platforms');
  await assertRefused(() => withClock(HELD, () => registry.deleteHazard(body, actOf(p), hazardId.fromSequence(1))), UnknownHazardError, body, 'deleteHazard on a body with no hazards');

  const { body: b, control } = await withClock(HELD, () => registry.createControl(body, actOf(p), { title: 'first' }));
  assert.deepEqual(Object.keys(/** @type {any} */ (b.collections).control), [control.id], 'the collection now holds exactly the one entry');
  assert.equal((await changeLog.listEntries(b)).length, 1, 'and the log its first entry');
  assert.deepEqual(body, schema.emptyDataBody());
});

test('an empty hazard collection behaves as no collection: lists as empty, gets null, and a create takes the sequence\'s number, not 1 (C-006, C-001)', async () => {
  const p = newProfile('Alice');
  const body = /** @type {DataBody} */ ({ collections: { hazard: {} }, sequences: { hazard: 6 } });
  assert.deepEqual([...(await registry.listHazards(body))], []);
  assert.equal(await registry.getHazard(body, hazardId.fromSequence(6)), null);
  const { body: b, hazard: h } = await withClock(HELD, () => registry.createHazard(body, actOf(p), { title: 'six' }));
  assert.equal(h.id, 'H-0006', 'the sequence is data: an empty collection with a sequence at 6 gives H-0006');
  assert.equal(b.sequences.hazard, 7);
  assert.deepEqual([...(await registry.listHazards(b))], [h]);
});

test('a title, name, or text is trimmed of leading and trailing whitespace and nothing else: internal spacing, case, script, quotes, and length are kept (section 3; C-001, C-010, C-011, C-014, C-020)', async () => {
  const cases = [
    [' \t Loss  of   control \n', 'Loss  of   control'],
    ['Übertemperatur 火災', 'Übertemperatur 火災'],
    ['x', 'x'],
    ['a "quoted" \\ back\\slash', 'a "quoted" \\ back\\slash'],
    ['UPPER and lower', 'UPPER and lower'],
    [`${'long '.repeat(2000)}title`, `${'long '.repeat(2000)}title`],
    ['icing — pitot / static', 'icing — pitot / static'],
  ];
  for (const [typed, expected] of cases) {
    const w = await smallWorld();
    const a = actOf(w.alice);
    const why = JSON.stringify(typed.slice(0, 30));
    assert.equal((await withClock(HELD, () => registry.createHazard(w.body, a, { title: typed }))).hazard.title, expected, `createHazard ${why}`);
    assert.equal((await withClock(HELD, () => registry.updateHazard(w.body, a, w.hazard, { title: typed }))).hazard.title, expected, `updateHazard ${why}`);
    assert.equal((await withClock(HELD, () => registry.addCausalFactor(w.body, a, w.hazard, { text: typed }))).causalFactor.text, expected, `addCausalFactor ${why}`);
    assert.equal((await withClock(HELD, () => registry.addConsequence(w.body, a, w.hazard, { text: typed }))).consequence.text, expected, `addConsequence ${why}`);
    assert.equal((await withClock(HELD, () => registry.createControl(w.body, a, { title: typed }))).control.title, expected, `createControl ${why}`);
    assert.equal((await withClock(HELD, () => registry.createPlatform(w.body, a, { name: typed, ownerProfileId: w.bob.id }))).platform.name, expected, `createPlatform ${why}`);
    assert.equal((await withClock(HELD, () => registry.excludeControlFromPlatform(w.body, a, { hazardId: w.hazard, controlId: w.stall, platformId: w.alpha, text: typed }))).justification.text, expected, `excludeControlFromPlatform ${why}`);
  }
});

test('a report ID is stored exactly as given: internal spaces, case, and punctuation kept, and any string without outer whitespace accepted, the global ID of another hazard included (C-016; REQ-052)', async () => {
  const w = await smallWorld();
  for (const reportId of ['HZ 07 / rev A', 'x', 'h-0001', 'H-0002', '火災-1']) {
    const change = await withClock(HELD, () => registry.setPlatformReportId(w.body, actOf(w.alice), { hazardId: w.hazard, platformId: w.alpha, reportId: /** @type {any} */ (reportId) }));
    assert.equal(change.link.reportId, reportId);
    assert.equal((await registry.listPlatformHazards(change.body, w.alpha)).rows[0].reportId, reportId);
  }
});

test('ids follow the sequence past four digits and are ordered by number, not as strings (C-001, C-006, C-019)', async () => {
  const p = newProfile('Alice');
  const pa = platformId.parse(orderedUuid(1, 0xa));
  const big = hazardRow(10000, p, 'ten thousand');
  const small = hazardRow(999, p, 'nine nine nine');
  const body = bodyFrom([small, big, platformRow(pa, p, 'Alpha', p), hazardPlatformLinkRow(orderedUuid(1), p, big.id, pa), hazardPlatformLinkRow(orderedUuid(2), p, small.id, pa)], { sequence: 123456 });
  const { body: b, hazard: h } = await withClock(HELD, () => registry.createHazard(body, actOf(p), { title: 'big' }));
  assert.equal(h.id, 'H-123456');
  assert.equal(b.sequences.hazard, 123457);
  assert.deepEqual((await registry.listHazards(b)).map((x) => x.id), ['H-0999', 'H-10000', 'H-123456'], 'by number: as strings "H-10000" would sort before "H-0999"');
  assert.deepEqual((await registry.listAllHazards(b)).map((x) => x.id), ['H-0999', 'H-10000', 'H-123456']);
  assert.deepEqual((await registry.listPlatformHazards(b, pa)).rows.map((r) => r.hazard.id), ['H-0999', 'H-10000']);
});

test('a gap in the numbering is filled only if the sequence points at it: the sequence, not the collection, decides the next id (C-001, C-002)', async () => {
  const p = newProfile('Alice');
  const filled = await withClock(HELD, () => registry.createHazard(bodyFrom([hazardRow(1, p, 'one'), hazardRow(3, p, 'three')], { sequence: 2 }), actOf(p), { title: 'two' }));
  assert.equal(filled.hazard.id, 'H-0002');
  const appended = await withClock(HELD, () => registry.createHazard(bodyFrom([hazardRow(1, p, 'one'), hazardRow(3, p, 'three')], { sequence: 4 }), actOf(p), { title: 'four' }));
  assert.equal(appended.hazard.id, 'H-0004', 'the sequence at 4 leaves the gap alone');
});

test('a collection with every hazard deleted or retired lists as empty, lists all of them in listAllHazards, refuses every delete, and a create takes the next number (C-005, C-006, C-002, C-030)', async () => {
  const p = newProfile('Alice');
  const rows = [hazardRow(1, p, 'one', { status: 'deleted' }), hazardRow(2, p, 'two', { status: 'retired' }), hazardRow(3, p, 'three', { status: 'deleted' })];
  const body = bodyFrom(rows);
  assert.deepEqual([...(await registry.listHazards(body))], []);
  assert.deepEqual([...(await registry.listAllHazards(body))], rows);
  for (const row of rows) await assertRefused(() => withClock(HELD, () => registry.deleteHazard(body, actOf(p), row.id)), HazardNotLiveError, body, `deleteHazard(${row.id})`);
  const { hazard: h } = await withClock(HELD, () => registry.createHazard(body, actOf(p), { title: 'four' }));
  assert.equal(h.id, 'H-0004');
});

test('deleting from the body before a delete is still allowed, because that body is a value, and gives the same result; the header a delete restamps is exactly updatedBy and updatedAtAest (C-003, C-005)', async () => {
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const body = bodyFrom([hazardRow(1, alice, 'only')]);
  const first = await withClock(HELD, () => registry.deleteHazard(body, actOf(bob), hazardId.fromSequence(1)));
  assert.deepEqual(first.hazard, { ...hazardRow(1, alice, 'only'), status: 'deleted', updatedBy: bob.id, updatedAtAest: HELD }, 'createdBy and createdAtAest are not restamped');
  assert.deepEqual([...(await registry.listHazards(first.body))], []);
  const second = await withClock(HELD, () => registry.deleteHazard(body, actOf(bob), hazardId.fromSequence(1)));
  assert.deepEqual(second.hazard, first.hazard);
  assert.deepEqual(differences(second.body, first.body), [], 'the same body but for the entry\'s own id');
});

test('ratings at the ends of the scales and the uncategorised case are stored as entered; a rating of both null where none is live is a change, and the same again is not; changing one of the two values is a change (C-017, C-018, C-029; DEC-002)', async () => {
  const w = await smallWorld();
  const a = actOf(w.alice);
  /** @type {[any, any][]} */
  const values = [[1, 'A'], [5, 'G'], [null, 'D'], [3, null], [null, null], [1, 'G'], [5, 'A']];
  for (const stage of /** @type {const} */ (['initial', 'residual'])) {
    let body = w.body;
    let t = HELD;
    for (const [i, [consequence, likelihood]] of values.entries()) {
      t = plusSeconds(HELD, i);
      const change = await withClock(t, () => registry.setRating(body, a, { hazardId: w.hazard, platformId: w.bravo, stage, consequence, likelihood }));
      assert.deepEqual([change.rating.consequence, change.rating.likelihood], [consequence, likelihood], `${stage} ${consequence} ${likelihood} stored as entered`);
      assert.deepEqual((await registry.getRatings(change.body, w.hazard, w.bravo))[stage], { consequence, likelihood });
      body = change.body;
    }
    await assertRefused(() => withClock(t, () => registry.setRating(body, a, { hazardId: w.hazard, platformId: w.bravo, stage, consequence: /** @type {any} */ (5), likelihood: /** @type {any} */ ('A') })), NoChangeError, body, `${stage}: the values already stored`);
  }
  const nulls = await withClock(HELD, () => registry.setRating(w.body, a, { hazardId: w.hazard, platformId: w.alpha, stage: 'residual', consequence: null, likelihood: null }));
  assert.deepEqual([nulls.rating.consequence, nulls.rating.likelihood], [null, null], 'both null with no live rating is never a no change: it creates one');
  await assertRefused(() => withClock(HELD, () => registry.setRating(nulls.body, a, { hazardId: w.hazard, platformId: w.alpha, stage: 'residual', consequence: null, likelihood: null })), NoChangeError, nulls.body, 'both null again');
  const deletedRating = ratingRow(orderedUuid(90, 0x2), w.alice, { hazardId: w.hazard, platformId: w.alpha, stage: 'initial', consequence: 2, likelihood: 'B' }, { status: 'deleted' });
  const deletedOnly = { ...w.body, collections: /** @type {any} */ ({ ...w.body.collections, rating: { [deletedRating.id]: deletedRating } }) };
  const over = await withClock(HELD, () => registry.setRating(deletedOnly, a, { hazardId: w.hazard, platformId: w.alpha, stage: 'initial', consequence: /** @type {any} */ (2), likelihood: /** @type {any} */ ('B') }));
  assert.notEqual(over.rating.id, orderedUuid(90, 0x2), 'a deleted rating is not the live one: the same values create a live rating rather than refusing');
});

test('platformsAffected names a platform through a justification, a rating, or a link only when a platform entry has that id; a platform ref names itself only when it exists (C-024)', async () => {
  const p = newProfile('Alice');
  const pa = platformId.parse(orderedUuid(1, 0xa));
  const missing = platformId.parse(orderedUuid(2, 0xa));
  const h = hazardRow(1, p, 'one');
  const c = controlRow(orderedUuid(1, 0xc), p, 'c');
  const j = justificationRow(orderedUuid(10), p, { hazardId: h.id, controlId: c.id, platformId: missing }, 'reason');
  const r = ratingRow(orderedUuid(11), p, { hazardId: h.id, platformId: missing, stage: 'initial', consequence: 1, likelihood: 'A' });
  const cp = controlPlatformLinkRow(orderedUuid(12), p, { hazardId: h.id, controlId: c.id, platformId: missing });
  const deletedPlatform = platformRow(pa, p, 'Deleted', p, { status: 'deleted' });
  const jOnDeleted = justificationRow(orderedUuid(13), p, { hazardId: h.id, controlId: c.id, platformId: pa }, 'reason');
  const body = bodyFrom([h, c, j, r, cp, deletedPlatform, jOnDeleted]);
  assert.deepEqual([...(await registry.platformsAffected(body, { kind: 'justification', id: j.id }))], []);
  assert.deepEqual([...(await registry.platformsAffected(body, { kind: 'rating', id: r.id }))], []);
  assert.deepEqual([...(await registry.platformsAffected(body, { kind: 'link', id: cp.id }))], []);
  assert.deepEqual([...(await registry.platformsAffected(body, { kind: 'platform', id: missing }))], []);
  assert.deepEqual([...(await registry.platformsAffected(body, { kind: 'platform', id: pa }))], [pa], 'a deleted platform is still an entry');
  assert.deepEqual([...(await registry.platformsAffected(body, { kind: 'justification', id: jOnDeleted.id }))], [pa], 'its status is not consulted');
  assert.deepEqual([...(await registry.platformsAffected(body, { kind: 'causal-factor', id: orderedUuid(99) }))], [], 'a causal factor nothing has');
});

test('an act made for a platform that is retired or deleted is accepted and carried to the entry: only a platform id no entry has is refused (section 4, C-023)', async () => {
  const w = await smallWorld();
  const body = (await withClock(HELD, () => registry.retirePlatform(w.body, actOf(w.bob), w.bravo))).body;
  const act = actOf(w.alice, w.bravo);
  const t = plusSeconds(HELD, 5);
  const before = /** @type {any} */ (await registry.getHazard(body, w.hazard));
  const change = await withClock(t, () => registry.updateHazard(body, act, w.hazard, { title: 'made for a retired platform' }));
  const entry = await assertRecorded(body, change.body, { act, at: t, records: [{ before, after: change.hazard }], affected: [w.alpha, w.bravo] });
  assert.ok(!(await changeLog.listAwaiting(change.body, w.bravo)).some((e) => e.id === entry.id), 'the platform it was made for does not await it');
  assert.ok((await changeLog.listAwaiting(change.body, w.alpha)).some((e) => e.id === entry.id), 'the other platform it reaches does');

  const deletedPlatform = platformRow(platformId.parse(orderedUuid(7, 0xa)), w.alice, 'Deleted', w.alice, { status: 'deleted' });
  const withDeleted = { ...w.body, collections: /** @type {any} */ ({ ...w.body.collections, platform: { ...w.body.collections.platform, [deletedPlatform.id]: deletedPlatform } }) };
  const made = await withClock(t, () => registry.createControl(withDeleted, actOf(w.alice, deletedPlatform.id), { title: 'made for a deleted platform' }));
  assert.equal((await changeLog.listEntries(made.body)).find((e) => e.createdAtAest === t)?.madeForPlatformId, deletedPlatform.id);
});

test('a body with no justification collection has no control excluded: every one of a hazard\'s controls on a platform is confirmed or awaiting (C-021, section 5 null semantics)', async () => {
  const p = newProfile('Alice');
  const pa = platformId.parse(orderedUuid(1, 0xa));
  const h = hazardRow(1, p, 'one');
  const c1 = controlRow(orderedUuid(1, 0xc), p, 'c1');
  const c2 = controlRow(orderedUuid(2, 0xc), p, 'c2');
  const body = bodyFrom([h, c1, c2, platformRow(pa, p, 'Alpha', p), hazardPlatformLinkRow(orderedUuid(10), p, h.id, pa),
    hazardControlLinkRow(orderedUuid(11), p, h.id, c1.id, 'preventative'), hazardControlLinkRow(orderedUuid(12), p, h.id, c2.id, 'mitigating'),
    controlPlatformLinkRow(orderedUuid(13), p, { hazardId: h.id, controlId: c1.id, platformId: pa })]);
  assert.equal(/** @type {any} */ (body.collections).justification, undefined);
  const { rows } = await registry.listPlatformHazards(body, pa);
  assert.deepEqual(rows[0].controls.map((c) => c.state), ['confirmed', 'awaiting']);
});

test('confirming and excluding the same control in the same second are two acts with two entries, and the superseded row and its successor are both kept (C-021, C-023; change-log C-001)', async () => {
  const w = await smallWorld();
  const a = actOf(w.alice);
  const t = { hazardId: w.hazard, controlId: w.stall, platformId: w.alpha };
  const confirmed = await withClock(HELD, () => registry.confirmControlForPlatform(w.body, a, t));
  const excluded = await withClock(HELD, () => registry.excludeControlFromPlatform(confirmed.body, a, { ...t, text: 'changed my mind' }));
  const again = await withClock(HELD, () => registry.confirmControlForPlatform(excluded.body, a, t));
  const entries = (await changeLog.listEntries(again.body)).filter((e) => e.createdAtAest === HELD);
  assert.equal(entries.length, 3, 'three acts, three entries');
  assert.deepEqual(excluded.removedLink, { ...confirmed.link, status: 'deleted' }, 'restamped at the same second, so only the status differs');
  assert.equal((await registry.listPlatformHazards(again.body, w.alpha)).rows[0].controls[0].state, 'confirmed');
});

test('collections of kinds this module does not own, however malformed, are carried through every changing operation untouched and never read (C-003, C-004)', async () => {
  const w = await smallWorld();
  const foreign = /** @type {any} */ ({
    'reference-entry': { junk: { nothing: null, list: [1, 2, 3] }, 'r-2': 'not even an object' },
    'review-schedule': {},
    'user-profile': { x: { id: 'y', kind: 'hazard', status: 'bogus' } },
    report: 'not a collection at all',
  });
  const body = { ...w.body, collections: { ...w.body.collections, ...foreign } };
  const before = snapshot(body);
  const a = actOf(w.alice);
  /** @type {(() => Promise<{ body: DataBody }>)[]} */
  const calls = [
    () => registry.createHazard(body, a, { title: 'two' }),
    () => registry.updateHazard(body, a, w.hazard, { title: 'renamed' }),
    () => registry.addCausalFactor(body, a, w.hazard, { text: 'cause' }),
    () => registry.createControl(body, a, { title: 'c' }),
    () => registry.linkControlToHazard(body, a, { hazardId: w.hazard, controlId: w.unused, controlKind: 'mitigating' }),
    () => registry.createPlatform(body, a, { name: 'Charlie', ownerProfileId: w.bob.id }),
    () => registry.setPlatformOwner(body, a, { platformId: w.alpha, ownerProfileId: w.bob.id }),
    () => registry.setPlatformReportId(body, a, { hazardId: w.hazard, platformId: w.alpha, reportId: /** @type {any} */ ('A-1') }),
    () => registry.confirmControlForPlatform(body, a, { hazardId: w.hazard, controlId: w.stall, platformId: w.alpha }),
    () => registry.excludeControlFromPlatform(body, a, { hazardId: w.hazard, controlId: w.training, platformId: w.bravo, text: 'r' }),
    () => registry.setRating(body, a, { hazardId: w.hazard, platformId: w.alpha, stage: 'initial', consequence: /** @type {any} */ (2), likelihood: /** @type {any} */ ('B') }),
    () => registry.retireControl(body, a, w.unused),
    () => registry.retirePlatform(body, a, w.bravo),
  ];
  for (const call of calls) {
    const { body: b } = await withClock(HELD, call);
    for (const [kind, value] of Object.entries(foreign)) assert.deepEqual(/** @type {any} */ (b.collections)[kind], value, `${kind} carried through`);
    assert.ok(differences(body, b).every((d) => !Object.keys(foreign).some((k) => d === k || d.startsWith(`${k}/`))), 'no foreign entry differs');
    assert.deepEqual(jsonRoundTrip(b), b, 'plain data');
  }
  assert.deepEqual(body, before);
  assert.equal((await registry.listHazards(body)).length, 1, 'reads do not read them either');
});

test('the returned body is what the next call reads: chaining forty creates and deletes from the empty body ends with the model, every intermediate body is still what it was, and the log holds one entry per act (C-001, C-003, C-005, C-023)', async () => {
  const p = newProfile('Alice');
  const a = actOf(p);
  /** @type {DataBody[]} */
  const bodies = [schema.emptyDataBody()];
  const snapshots = [snapshot(bodies[0])];
  /** @type {string[]} */
  const created = [];
  /** @type {string[]} */
  const deleted = [];
  for (let i = 1; i <= 40; i += 1) {
    const body = bodies[bodies.length - 1];
    if (i % 3 === 0) {
      const change = await withClock(HELD, () => registry.deleteHazard(body, a, /** @type {any} */ (created[created.length - 1])));
      deleted.push(change.hazard.id);
      bodies.push(change.body);
    } else {
      const change = await withClock(HELD, () => registry.createHazard(body, a, { title: `hazard ${i}` }));
      created.push(change.hazard.id);
      bodies.push(change.body);
    }
    snapshots.push(snapshot(bodies[bodies.length - 1]));
  }
  bodies.forEach((body, i) => assert.deepEqual(body, snapshots[i], `body ${i} is still what it was when returned`));
  const last = bodies[bodies.length - 1];
  assert.deepEqual(created, Array.from({ length: 27 }, (_, k) => hazardId.fromSequence(k + 1)));
  assert.equal(last.sequences.hazard, 28);
  assert.deepEqual((await registry.listHazards(last)).map((h) => h.id), created.filter((id) => !deleted.includes(id)));
  assert.equal((await changeLog.listEntries(last)).length, 40, 'one entry per act');
  for (let i = 1; i < bodies.length; i += 1) assert.equal((await changeLog.listEntries(bodies[i])).length, i, `body ${i} holds the entries of the acts before it`);
});

test('a causal factor or consequence of a hazard on no platform reaches no platform, and a retired hazard\'s detail still gives its causal factors (C-010, C-024)', async () => {
  const p = newProfile('Alice');
  const h = hazardRow(1, p, 'one', { status: 'retired' });
  const cf = causalFactorRow(orderedUuid(1), p, h.id, 'cause');
  const body = bodyFrom([h, cf]);
  assert.deepEqual([...(await registry.platformsAffected(body, { kind: 'causal-factor', id: cf.id }))], []);
  assert.deepEqual((await registry.getHazardDetail(body, h.id))?.causalFactors, [cf]);
  const e = await rejectionOf(() => withClock(HELD, () => registry.addCausalFactor(body, actOf(p), h.id, { text: 'more' })));
  assert.ok(e instanceof HazardNotLiveError, 'but nothing is added to a retired hazard');
});
