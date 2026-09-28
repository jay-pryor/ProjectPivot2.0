/**
 * reference-register conformance: invariants (CORE-CON-002, CORE-TST-001). Property-based over
 * seeded random sequences of acts: the body is a value (C-002), the register the lists give is
 * the one the acts made (C-001, C-005, C-009), every act is one log entry (C-011), a refused
 * create leaves no file (C-004), the entry holds a location and never contents (C-003), and the
 * flag follows the folder (C-010). The seed is fixed and recorded in the harness.
 *
 * The null double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as rr from '../contract.js';
import {
  CONTENT_FIELDS, ENTRY_FIELDS, KIND, SEED, SIX_KINDS, actOf, bodyOf, byKindThenId, changeLog, deepFreeze, differences, entriesModel,
  fieldsOf, foreignCollections, incomingFile, jsonRoundTrip, malformedLog, newProfile, oneOf, openFolder, pick, platformNo, prng, randomBytes,
  randomText, refTo, rejectionOf, schema, snapshot, storedFiles, withClock,
} from './harness.js';

/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */

const RUNS = 12;
const STEPS = 25;

/**
 * A time `step` minutes into a day, several steps sharing a minute so the id tie-break is used.
 * @param {number} step
 * @returns {any}
 */
function timeAt(step) {
  const minutes = Math.floor(step / 3);
  return `2026-09-15T${String(9 + Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00+10:00`;
}

test('over random sequences of creates and links, the body passed in never changes, each result differs by one entry and one log entry, survives JSON, and the lists are the register the acts made (C-001, C-002, C-005, C-008, C-009, C-011)', async () => {
  const random = prng(SEED);
  const profiles = [newProfile('Alice'), newProfile('Bob')];
  for (let run = 0; run < RUNS; run += 1) {
    const { folder, opened } = await openFolder();
    /** @type {DataBody} */
    let body = /** @type {any} */ ({ collections: foreignCollections(random), sequences: { hazard: 1 + pick(random, 5) } });
    /** @type {Map<string, any>} what each entry should hold, by id */
    const model = new Map();
    let files = 0;

    for (let step = 0; step < STEPS; step += 1) {
      const at = timeAt(step);
      const act = actOf(oneOf(random, profiles), random() < 0.5 ? null : platformNo(pick(random, 3)), Array.from({ length: pick(random, 3) }, () => platformNo(pick(random, 4))));
      const input = deepFreeze(snapshot(body));
      const before = snapshot(input);
      const live = [...model.values()].filter((e) => e.status === 'live');

      if (live.length === 0 || random() < 0.4) {
        /** @type {Record<string, any>} */
        const raw = {};
        const given = fieldsOf();
        for (const f of /** @type {const} */ (['name', 'link', 'path'])) {
          if (random() < 0.5) { raw[f] = randomText(random, f); given[f] = raw[f]; }
        }
        if (random() < 0.4) given.file = incomingFile(`f${step}.bin`, randomBytes(random));
        const empty = given.name === null && given.link === null && given.path === null && given.file === null;
        if (empty) {
          const e = await rejectionOf(() => withClock(at, () => rr.createEntry(input, act, opened, given)));
          assert.ok(e instanceof rr.EmptyEntryError, `run ${run} step ${step}: none of the four is refused`);
          assert.deepEqual(input, before);
          assert.equal(storedFiles(folder).length, files, 'a refused create keeps no file (C-004)');
          continue;
        }
        const { body: out, entry } = await withClock(at, () => rr.createEntry(input, act, opened, given));
        for (const f of /** @type {const} */ (['name', 'link', 'path'])) {
          assert.equal(entry[f], f in raw ? raw[f].trim() : null, `run ${run} step ${step}: ${f} is what was typed, trimmed, or null`);
        }
        if (given.file) {
          files += 1;
          assert.deepEqual(folder.readBytes(/** @type {string} */ (entry.fileLocation)), given.file.bytes, 'the location opens with the bytes (C-003)');
        } else {
          assert.equal(entry.fileLocation, null);
        }
        assert.equal(storedFiles(folder).length, files, 'one file per create that carried one, and none otherwise (C-003, C-007)');
        assert.ok(!model.has(entry.id), 'a fresh id (C-001)');
        assert.deepEqual(entry.links, []);
        assert.deepEqual([entry.createdBy, entry.updatedBy, entry.createdAtAest, entry.updatedAtAest, entry.status], [act.profile.id, act.profile.id, at, at, 'live']);
        assert.deepEqual(differences(input, out), [`${KIND}/${entry.id}`]);
        assert.equal((await changeLog.listEntries(out)).length, (await changeLog.listEntries(input)).length + 1, 'one log entry per act (C-011)');
        model.set(entry.id, entry);
        body = out;
      } else {
        const target = oneOf(random, live);
        const ref = random() < 0.25 && target.links.length > 0 ? oneOf(random, target.links) : refTo(oneOf(random, SIX_KINDS), pick(random, 8));
        const duplicate = target.links.some((/** @type {any} */ r) => r.kind === ref.kind && r.id === ref.id);
        if (duplicate) {
          const e = await rejectionOf(() => withClock(at, () => rr.linkEntry(input, act, { entryId: target.id, ref })));
          assert.ok(e instanceof rr.DuplicateLinkError, `run ${run} step ${step}: a second link is refused`);
          assert.deepEqual(input, before);
          continue;
        }
        const { body: out, entry } = await withClock(at, () => rr.linkEntry(input, act, { entryId: target.id, ref }));
        const expected = { ...target, updatedBy: act.profile.id, updatedAtAest: at, links: [...target.links, ref].sort(byKindThenId) };
        assert.deepEqual(entry, expected, `run ${run} step ${step}: the entry gains the ref in order and nothing else changes (C-008)`);
        assert.deepEqual(differences(input, out), [`${KIND}/${target.id}`]);
        assert.equal((await changeLog.listEntries(out)).length, (await changeLog.listEntries(input)).length + 1, 'one log entry per act (C-011)');
        model.set(entry.id, entry);
        body = out;
      }

      assert.deepEqual(input, before, `run ${run} step ${step}: the body passed in is unchanged (C-002)`);
      assert.deepEqual(jsonRoundTrip(body), body, 'the body survives JSON (C-002)');
      const listed = [...(await rr.listEntries(body))];
      assert.deepEqual(listed, entriesModel(body), 'listEntries is every live entry, ascending by createdAtAest then id (C-005)');
      assert.deepEqual(listed.map((e) => e.id).sort(), [...model.keys()].sort());
      for (const e of listed) {
        assert.deepEqual(e, model.get(e.id), 'each entry is what the acts made');
        assert.deepEqual(await rr.getEntry(body, e.id), e, 'getEntry and listEntries agree (C-009)');
        assert.deepEqual(Object.keys(e).sort(), ENTRY_FIELDS, 'no field but those of section 3 (C-003)');
        assert.ok(CONTENT_FIELDS.some((f) => e[f] !== null), 'at least one of the four (C-001)');
        assert.deepEqual([...e.links], [...e.links].sort(byKindThenId), 'links in order (C-008)');
        assert.equal(new Set(e.links.map((r) => `${r.kind}|${r.id}`)).size, e.links.length, 'each ref once (C-008)');
        assert.equal((await changeLog.listHistory(body, { kind: KIND, id: e.id })).length, 1 + e.links.length, 'the history holds the creation and every link (C-011)');
      }
    }
  }
});

test('reads are harmless and repeatable: on the same body listEntries and getEntry resolve deep-equal and change nothing, and checkEntryFiles on an unchanged folder answers the same and writes nothing (section 5, Idempotency; C-010)', async () => {
  const random = prng(SEED ^ 0x1);
  const alice = newProfile('Alice');
  const { folder, opened } = await openFolder();
  let body = schema.emptyDataBody();
  for (let i = 0; i < 10; i += 1) {
    const given = fieldsOf({ name: `n${i}`, file: random() < 0.6 ? incomingFile(`f${i}`, randomBytes(random)) : null });
    ({ body } = await withClock(timeAt(i), () => rr.createEntry(body, actOf(alice), opened, given)));
  }
  const frozen = deepFreeze(snapshot(body));
  const files = folder.snapshot();
  const first = await rr.listEntries(frozen);
  assert.deepEqual(await rr.listEntries(frozen), first);
  for (const e of first) assert.deepEqual(await rr.getEntry(frozen, e.id), await rr.getEntry(frozen, e.id));
  const check = await rr.checkEntryFiles(frozen, opened);
  assert.deepEqual(await rr.checkEntryFiles(frozen, opened), check);
  assert.deepEqual(frozen, body);
  assert.deepEqual(folder.snapshot(), files, 'no read writes to the folder');
});

test('over random removals, denials, and restorations, checkEntryFiles flags exactly the entries whose file cannot be opened, with the reason, in listEntries order (C-010; store C-019)', async () => {
  const random = prng(SEED ^ 0x2);
  const alice = newProfile('Alice');
  const { folder, opened } = await openFolder();
  let body = schema.emptyDataBody();
  /** @type {Map<string, Uint8Array>} */
  const bytesAt = new Map();
  for (let i = 0; i < 14; i += 1) {
    const file = random() < 0.7 ? incomingFile(`f${i}.bin`, randomBytes(random)) : null;
    const r = await withClock(timeAt(i), () => rr.createEntry(body, actOf(alice), opened, fieldsOf({ path: `p${i}`, file })));
    body = r.body;
    if (file) bytesAt.set(/** @type {string} */ (r.entry.fileLocation), file.bytes);
  }
  const locations = [...bytesAt.keys()];
  /** @type {Set<string>} */
  const denied = new Set();
  for (let round = 0; round < 30; round += 1) {
    const location = oneOf(random, locations);
    // Each location is in one of three states — there, gone, or there and denied — so what store C-019 answers is never a combination.
    const move = pick(random, 3);
    denied.delete(location);
    if (move === 0) folder.remove(location);
    else folder.writeBytes(location, /** @type {Uint8Array} */ (bytesAt.get(location)));
    if (move === 2) denied.add(location);
    folder.denyRead((rel) => denied.has(rel));

    const listed = await rr.listEntries(body);
    const states = [...(await rr.checkEntryFiles(body, opened))];
    assert.deepEqual(states, listed.map((e) => {
      if (e.fileLocation === null) return { entryId: e.id, location: null, flagged: false, reason: null };
      if (!folder.exists(e.fileLocation)) return { entryId: e.id, location: e.fileLocation, flagged: true, reason: 'missing' };
      if (denied.has(e.fileLocation)) return { entryId: e.id, location: e.fileLocation, flagged: true, reason: 'inaccessible' };
      return { entryId: e.id, location: e.fileLocation, flagged: false, reason: null };
    }), `round ${round}`);
  }
});

test('over random refused creates — blank fields, bad acts, unreadable histories, files store refuses — no file is ever left under files/ and the body is unchanged (C-004)', async () => {
  const random = prng(SEED ^ 0x3);
  const alice = newProfile('Alice');
  for (let i = 0; i < 40; i += 1) {
    const { folder, opened } = await openFolder();
    const file = incomingFile(random() < 0.3 ? '' : `f${i}.pdf`, randomBytes(random));
    const kind = pick(random, 4);
    /** @type {DataBody} */
    let body = schema.emptyDataBody();
    let act = actOf(alice);
    const given = fieldsOf({ name: 'n', file });
    if (kind === 0) given[oneOf(random, /** @type {const} */ (['name', 'link', 'path']))] = oneOf(random, ['', ' ', '\n\t']);
    if (kind === 1) act = /** @type {any} */ ({ profile: alice, madeForPlatformId: 'nope', affectedPlatformIds: [] });
    if (kind === 2) body = bodyOf([], { 'change-log-entry': malformedLog(alice) });
    if (kind === 3) folder.failWrite(() => true);
    const before = snapshot(body);
    await rejectionOf(() => withClock(timeAt(i), () => rr.createEntry(body, act, opened, given)), `case ${i} (${kind})`);
    assert.deepEqual(body, before, `case ${i}: body unchanged`);
    assert.deepEqual(storedFiles(folder), [], `case ${i}: no file under files/`);
  }
});
