import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, put, created, changed } from '../../src/core/data.js';
import { itemOf, entries, historyOf, recordOverride, unseenOverrides, markNoticesSeen } from '../../src/core/history.js';
import { commit } from '../../src/core/apply.js';
import { platformsReached } from '../../src/core/queries.js';
import { ids } from '../../src/core/ids.js';

const act = { by: 'u1', at: '2026-09-28T10:00:00+10:00' };
const later = { by: 'u2', at: '2026-09-28T11:00:00+10:00' };

/** A hazard h1 on platforms p1 and p2, with control c1 linked to it. */
function seeded() {
  let d = emptyData();
  d = put(d, 'hazard', created(act, 'h1', { number: 1, title: 'Fire', description: '' }));
  d = put(d, 'platform', created(act, 'p1', { name: 'Alpha', ownerId: 'u1' }));
  d = put(d, 'platform', created(act, 'p2', { name: 'Bravo', ownerId: 'u2' }));
  d = put(d, 'hazardPlatform', created(act, ids.hazardPlatform('h1', 'p1'), { hazardId: 'h1', platformId: 'p1', reportId: null }));
  d = put(d, 'hazardPlatform', created(act, ids.hazardPlatform('h1', 'p2'), { hazardId: 'h1', platformId: 'p2', reportId: null }));
  d = put(d, 'control', created(act, 'c1', { title: 'Sprinklers', description: '' }));
  d = put(d, 'hazardControl', created(act, ids.hazardControl('h1', 'c1'), { hazardId: 'h1', controlId: 'c1', kind: 'preventative' }));
  d = put(d, 'causalFactor', created(act, 'cf1', { hazardId: 'h1', text: 'Heat' }));
  return d;
}

test('itemOf: a creation lists every field but the restamp fields', () => {
  const rec = created(act, 'h9', { number: null, title: 'Flood' });
  const item = itemOf('hazard', null, rec);
  assert.equal(item.change, 'created');
  assert.deepEqual(item.fields.map((f) => f.field), ['createdAt', 'createdBy', 'id', 'number', 'status', 'title']);
  assert.deepEqual(item.fields.find((f) => f.field === 'title'), { field: 'title', before: null, after: 'Flood' });
});

test('itemOf: an edit lists only what changed; delete, retire and restore are told apart', () => {
  const rec = created(act, 'h9', { title: 'Flood', description: 'x' });
  const edit = itemOf('hazard', rec, changed(rec, later, { title: 'Flash flood' }));
  assert.equal(edit.change, 'edited');
  assert.deepEqual(edit.fields, [{ field: 'title', before: 'Flood', after: 'Flash flood' }]);
  const del = itemOf('hazard', rec, changed(rec, later, { status: 'deleted' }));
  assert.equal(del.change, 'deleted');
  assert.ok(del.fields.some((f) => f.field === 'description'));
  assert.equal(itemOf('hazard', rec, changed(rec, later, { status: 'retired' })).change, 'retired');
  const retired = { ...rec, status: 'retired' };
  assert.equal(itemOf('hazard', retired, changed(retired, later, { status: 'live' })).change, 'restored');
});

test('platformsReached follows the links for every kind', () => {
  const d = seeded();
  assert.deepEqual(platformsReached(d, 'hazard', d.records.hazard.h1), ['p1', 'p2']);
  assert.deepEqual(platformsReached(d, 'causalFactor', d.records.causalFactor.cf1), ['p1', 'p2']);
  assert.deepEqual(platformsReached(d, 'control', d.records.control.c1), ['p1', 'p2']);
  assert.deepEqual(platformsReached(d, 'hazardControl', d.records.hazardControl['hc:h1:c1']), ['p1', 'p2']);
  assert.deepEqual(platformsReached(d, 'platform', d.records.platform.p1), ['p1']);
  assert.deepEqual(platformsReached(d, 'hazardPlatform', d.records.hazardPlatform['hp:h1:p2']), ['p2']);
  assert.deepEqual(platformsReached(d, 'ruling', { platformId: 'p1' }), ['p1']);
  assert.deepEqual(platformsReached(d, 'rating', { platformId: 'p2' }), ['p2']);
  assert.deepEqual(platformsReached(d, 'report', { platformId: 'p2' }), ['p2']);
});

test('commit puts the records and appends one entry naming the platforms reached', () => {
  const d = seeded();
  const h = d.records.hazard.h1;
  const next = commit(d, later, 'Edit hazard', [{ kind: 'hazard', rec: changed(h, later, { title: 'Big fire' }) }]);
  assert.equal(next.records.hazard.h1.title, 'Big fire');
  const [entry] = entries(next);
  assert.equal(entry.type, 'change');
  assert.equal(entry.by, 'u2');
  assert.equal(entry.at, later.at);
  assert.equal(entry.action, 'Edit hazard');
  assert.deepEqual(entry.platforms, ['p1', 'p2']);
  assert.deepEqual(entry.items[0].fields, [{ field: 'title', before: 'Fire', after: 'Big fire' }]);
  assert.equal(d.records.hazard.h1.title, 'Fire', 'the input is untouched');
});

test('commit of an unlink still names the platform the link was on', () => {
  const d = seeded();
  const link = d.records.hazardPlatform['hp:h1:p2'];
  const next = commit(d, later, 'Unlink', [{ kind: 'hazardPlatform', rec: changed(link, later, { status: 'deleted' }) }]);
  assert.deepEqual(entries(next)[0].platforms, ['p2']);
});

test('commit that changes nothing but the stamp returns the same data and writes no entry', () => {
  const d = seeded();
  const h = d.records.hazard.h1;
  assert.equal(commit(d, later, 'Edit hazard', [{ kind: 'hazard', rec: changed(h, later, { title: 'Fire' }) }]), d);
});

test('historyOf gives the change entries that name a record, oldest first', () => {
  let d = seeded();
  d = commit(d, act, 'Edit hazard', [{ kind: 'hazard', rec: changed(d.records.hazard.h1, act, { title: 'A' }) }]);
  d = commit(d, later, 'Edit control', [{ kind: 'control', rec: changed(d.records.control.c1, later, { title: 'B' }) }]);
  d = commit(d, later, 'Edit hazard', [{ kind: 'hazard', rec: changed(d.records.hazard.h1, later, { title: 'C' }) }]);
  assert.deepEqual(historyOf(d, 'hazard', 'h1').map((e) => e.items[0].fields[0].after), ['A', 'C']);
});

test('an override is shown once to each user whose edit it overrode', () => {
  let d = seeded();
  d = recordOverride(d, act, [
    { kind: 'hazard', id: 'h1', reason: 'both-changed', overriddenBy: 'u2', theirs: { title: 'Theirs' }, mine: { title: 'Mine' } },
    { kind: 'control', id: 'c1', reason: 'both-changed', overriddenBy: 'u3', theirs: { title: 'T' }, mine: { title: 'M' } },
  ]);
  const forU2 = unseenOverrides(d, 'u2');
  assert.equal(forU2.length, 1);
  assert.deepEqual(forU2[0].items.map((i) => i.id), ['h1'], 'u2 sees only their own overridden edits');
  d = markNoticesSeen(d, later, forU2.map((e) => e.id));
  assert.deepEqual(unseenOverrides(d, 'u2'), []);
  assert.equal(unseenOverrides(d, 'u3').length, 1, 'seeing it for u2 does not clear it for u3');
  assert.deepEqual(unseenOverrides(d, 'u1'), []);
});
