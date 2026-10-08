import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { KINDS, emptyData } from '../../src/core/data.js';
import { mergeData } from '../../src/core/merge.js';
import { startAcks, waitingChanges } from '../../src/core/acks.js';
import { createBowtieView, updateBowtieView, setBowtieSharing, deleteBowtieView } from '../../src/core/ops/bowtie-views.js';
import { myViews, sharedWithMe, canSee } from '../../src/core/bowtie.js';
import { KIND_LABEL, recordName } from '../../src/ui/names.js';
import { seed, act, later } from '../helpers.js';

/** The entry made last (the fixture's later-timestamped entry sorts after these edits in entries()). */
const lastAction = (d) => Object.values(d.history).at(-1).action;
const code = (c) => (e) => e instanceof PivotError && e.code === c;
const F = { statuses: ['planned'] };
/** u1 owns v1 (h1 on p1) and v2 (h1 on p2); v3 belongs to u2. */
function data() {
  let d = createBowtieView(seed(), act, { id: 'v1', name: 'Fire on Alpha', hazardId: 'h1', platformId: 'p1', filters: F });
  d = createBowtieView(d, act, { id: 'v2', name: 'Alpha before', hazardId: 'h1', platformId: 'p2', filters: F });
  return createBowtieView(d, later, { id: 'v3', name: 'Ben view', hazardId: 'h1', platformId: 'p1', filters: F });
}

test('a view is a record owned by whoever saved it, holding its choices and nobody to share with', () => {
  assert.ok(KINDS.includes('bowtieView'));
  assert.equal(KIND_LABEL.bowtieView, 'Bow-tie view');
  const d = data();
  const v = d.records.bowtieView.v1;
  assert.deepEqual({ name: v.name, ownerId: v.ownerId, hazardId: v.hazardId, platformId: v.platformId, filters: v.filters, sharedWith: v.sharedWith, status: v.status },
    { name: 'Fire on Alpha', ownerId: 'u1', hazardId: 'h1', platformId: 'p1', filters: { statuses: ['planned'], tiers: ['Elimination', 'Substitution', 'Isolation', 'Engineering', 'Administrative', 'PPE', 'none'] }, sharedWith: [], status: 'live' });
  assert.equal(lastAction(d), 'Save bow-tie view');
  assert.equal(recordName('bowtieView', v), 'Fire on Alpha');
  assert.throws(() => createBowtieView(d, act, { name: ' ', hazardId: 'h1', platformId: 'p1', filters: F }), code('empty'));
  assert.throws(() => createBowtieView(d, act, { name: 'x', hazardId: 'h2', platformId: 'p1', filters: F }), code('bowtie.not-on-platform'));
  assert.throws(() => createBowtieView(d, act, { name: 'x', hazardId: 'h1', platformId: 'p1', filters: { statuses: ['nope'] } }), code('bowtie.filters'));
});

test('only the owner saves, renames, shares or deletes a view', () => {
  let d = data();
  d = updateBowtieView(d, act, { id: 'v1', filters: { statuses: [] } });
  assert.equal(lastAction(d), 'Save bow-tie view');
  assert.deepEqual(d.records.bowtieView.v1.filters.statuses, []);
  d = updateBowtieView(d, act, { id: 'v1', name: 'Alpha now' });
  assert.equal(lastAction(d), 'Rename bow-tie view');
  assert.equal(d.records.bowtieView.v1.name, 'Alpha now');
  for (const op of [
    () => updateBowtieView(d, later, { id: 'v1', name: 'Mine now' }),
    () => setBowtieSharing(d, later, { id: 'v1', sharedWith: ['u2'] }),
    () => deleteBowtieView(d, later, { id: 'v1' }),
  ]) assert.throws(op, code('bowtie.not-owner'));
  d = deleteBowtieView(d, act, { id: 'v1' });
  assert.equal(d.records.bowtieView.v1.status, 'deleted');
  assert.equal(lastAction(d), 'Delete bow-tie view');
  assert.throws(() => updateBowtieView(d, act, { id: 'v1', name: 'Back' }), code('not-found'));
});

test('sharing: chosen profiles see it under Shared with me; the owner is never on the list; unsharing takes it away', () => {
  let d = setBowtieSharing(data(), act, { id: 'v1', sharedWith: ['u2', 'u1', 'u3', 'u2', ''] });
  assert.deepEqual(d.records.bowtieView.v1.sharedWith, ['u2', 'u3']);
  assert.equal(lastAction(d), 'Share bow-tie view');
  assert.deepEqual(myViews(d, 'u1').map((v) => v.id), ['v2', 'v1'], 'by name');
  assert.deepEqual(sharedWithMe(d, 'u1').map((v) => v.id), []);
  assert.deepEqual(myViews(d, 'u2').map((v) => v.id), ['v3']);
  assert.deepEqual(sharedWithMe(d, 'u2').map((v) => v.id), ['v1']);
  assert.ok(canSee(d.records.bowtieView.v1, 'u3'));
  assert.ok(!canSee(d.records.bowtieView.v2, 'u2'));
  d = setBowtieSharing(d, act, { id: 'v1', sharedWith: ['u3'] });
  assert.deepEqual(sharedWithMe(d, 'u2').map((v) => v.id), []);
  d = deleteBowtieView(d, act, { id: 'v1' });
  assert.deepEqual(sharedWithMe(d, 'u3'), [], 'a deleted view is seen by nobody');
  assert.ok(!canSee(d.records.bowtieView.v1, 'u1'));
});

test('views merge on save like any record, and never wait for acknowledgement', () => {
  const base = startAcks(data(), { by: 'u1', at: '2026-09-28T09:00:00+10:00' });
  const mine = updateBowtieView(base, act, { id: 'v1', name: 'Mine' });
  const theirs = createBowtieView(base, later, { id: 'v4', name: 'Theirs', hazardId: 'h1', platformId: 'p2', filters: F });
  const m = mergeData(base, mine, theirs, act);
  assert.equal(m.data.records.bowtieView.v1.name, 'Mine');
  assert.equal(m.data.records.bowtieView.v4.name, 'Theirs');
  assert.deepEqual(m.conflicts, []);
  const shared = setBowtieSharing(base, act, { id: 'v1', sharedWith: ['u2'] });
  assert.deepEqual(Object.values(shared.history).at(-1).platforms, []);
  assert.deepEqual(waitingChanges(shared, 'p1'), waitingChanges(base, 'p1'));
});

test('an empty file gets an empty bowtieView collection', () => {
  assert.deepEqual(emptyData().records.bowtieView, {});
});
