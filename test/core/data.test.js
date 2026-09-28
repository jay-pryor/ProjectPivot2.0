import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, emptyData, validateData, put, get, all, live, created, changed, need, needText } from '../../src/core/data.js';
import { PivotError } from '../../src/core/errors.js';

const act = { by: 'u1', at: '2026-09-28T10:00:00+10:00' };
const later = { by: 'u2', at: '2026-09-28T11:00:00+10:00' };

test('emptyData has every kind, starts hazard numbers at 1, and validates', () => {
  const d = emptyData();
  assert.deepEqual(Object.keys(d.records).sort(), [...KINDS].sort());
  assert.equal(d.nextHazardNumber, 1);
  assert.deepEqual(validateData(d), []);
});

test('validateData names what is wrong', () => {
  const d = emptyData();
  d.records.hazard.x = { id: 'y', status: 'live' };
  d.records.control.c = { id: 'c', status: 'gone', createdBy: 'u', createdAt: 't', updatedBy: 'u', updatedAt: 't' };
  delete d.records.platform;
  d.nextHazardNumber = 0;
  const problems = validateData(d);
  assert.ok(problems.some((p) => p.includes('hazard x')));
  assert.ok(problems.some((p) => p.includes('control c')));
  assert.ok(problems.some((p) => p.includes('records.platform')));
  assert.ok(problems.some((p) => p.includes('nextHazardNumber')));
  assert.deepEqual(validateData(null), ['the data is not an object']);
});

test('put returns new data and leaves its input alone', () => {
  const d = emptyData();
  const rec = created(act, 'h1', { title: 'Fire' });
  const d2 = put(d, 'hazard', rec);
  assert.equal(get(d, 'hazard', 'h1'), undefined);
  assert.equal(get(d2, 'hazard', 'h1'), rec);
  assert.equal(d2.records.control, d.records.control);
});

test('created and changed stamp the header', () => {
  const rec = created(act, 'h1', { title: 'Fire' });
  assert.deepEqual(rec, { id: 'h1', status: 'live', createdBy: 'u1', createdAt: act.at, updatedBy: 'u1', updatedAt: act.at, title: 'Fire' });
  const edited = changed(rec, later, { title: 'Flood' });
  assert.equal(edited.title, 'Flood');
  assert.equal(edited.createdBy, 'u1');
  assert.equal(edited.updatedBy, 'u2');
  assert.equal(edited.updatedAt, later.at);
});

test('all sorts by creation time then id; live leaves out retired and deleted', () => {
  let d = emptyData();
  d = put(d, 'hazard', created(later, 'b', {}));
  d = put(d, 'hazard', created(act, 'z', {}));
  d = put(d, 'hazard', created(act, 'a', {}));
  d = put(d, 'hazard', { ...created(act, 'r', {}), status: 'retired' });
  assert.deepEqual(all(d, 'hazard').map((r) => r.id), ['a', 'r', 'z', 'b']);
  assert.deepEqual(live(d, 'hazard').map((r) => r.id), ['a', 'z', 'b']);
});

test('need refuses a missing or deleted record; needText refuses blank text', () => {
  let d = put(emptyData(), 'hazard', { ...created(act, 'gone', {}), status: 'deleted' });
  assert.throws(() => need(d, 'hazard', 'nope'), (e) => e instanceof PivotError && e.code === 'not-found');
  assert.throws(() => need(d, 'hazard', 'gone'), (e) => e instanceof PivotError && e.code === 'not-found');
  assert.equal(needText('  Fire  ', 'A title'), 'Fire');
  assert.throws(() => needText('   ', 'A title'), (e) => e instanceof PivotError && e.code === 'empty' && /A title/.test(e.message));
  assert.throws(() => needText(undefined, 'A title'), PivotError);
});
