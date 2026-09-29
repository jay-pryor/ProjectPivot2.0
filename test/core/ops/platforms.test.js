import { test } from 'node:test';
import assert from 'node:assert/strict';
import { put, created } from '../../../src/core/data.js';
import { ids } from '../../../src/core/ids.js';
import { entries } from '../../../src/core/history.js';
import { retireHazard } from '../../../src/core/ops/hazards.js';
import {
  createPlatform, updatePlatform, setOwner, retirePlatform, deletePlatform, linkHazard, unlinkHazard, setReportId,
} from '../../../src/core/ops/platforms.js';
import { setRating } from '../../../src/core/ops/assessment.js';
import { act, later, seed } from '../../helpers.js';

const code = (c) => (e) => e.code === c;

test('a platform has a name and exactly one owner', () => {
  const d = seed();
  assert.equal(d.records.platform.p1.ownerId, 'u1');
  assert.throws(() => createPlatform(d, act, { name: 'X', ownerId: '' }), code('empty'));
  assert.throws(() => createPlatform(d, act, { name: ' ', ownerId: 'u1' }), code('empty'));
  const d2 = setOwner(updatePlatform(d, later, { id: 'p1', name: 'Alpha 2' }), later, { id: 'p1', ownerId: 'u3' });
  assert.equal(d2.records.platform.p1.name, 'Alpha 2');
  assert.equal(d2.records.platform.p1.ownerId, 'u3');
});

test('adding a platform changes nothing that already exists', () => {
  const d = seed();
  const d2 = createPlatform(d, later, { id: 'p9', name: 'New', ownerId: 'u1' });
  for (const kind of Object.keys(d.records)) {
    if (kind === 'platform') continue;
    assert.equal(d2.records[kind], d.records[kind], `${kind} untouched`);
  }
});

test('linkHazard links once, copies nothing, and starts the report id at the global id (null)', () => {
  const d = seed();
  const link = d.records.hazardPlatform[ids.hazardPlatform('h1', 'p1')];
  assert.equal(link.reportId, null);
  assert.equal(linkHazard(d, later, { hazardId: 'h1', platformId: 'p1' }), d, 'linking again changes nothing');
});

test('a retired hazard, or a retired platform, cannot be linked', () => {
  let d = retireHazard(seed(), act, { id: 'h2' });
  assert.throws(() => linkHazard(d, act, { hazardId: 'h2', platformId: 'p1' }), code('hazard.retired'));
  d = retirePlatform(seed(), act, { id: 'p1' });
  assert.throws(() => linkHazard(d, act, { hazardId: 'h2', platformId: 'p1' }), code('platform.retired'));
});

test('unlinking a hazard from a platform deletes its rulings and rating there, and then it can be retired', () => {
  let d = seed();
  d = put(d, 'ruling', created(act, ids.ruling('h1', 'c1', 'p1'), { hazardId: 'h1', controlId: 'c1', platformId: 'p1', state: 'implemented', reason: '' }));
  d = put(d, 'ruling', created(act, ids.ruling('h1', 'c1', 'p2'), { hazardId: 'h1', controlId: 'c1', platformId: 'p2', state: 'implemented', reason: '' }));
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 2, likelihood: 'C' });
  d = unlinkHazard(d, later, { hazardId: 'h1', platformId: 'p1' });
  assert.equal(d.records.hazardPlatform['hp:h1:p1'].status, 'deleted');
  assert.equal(d.records.ruling['ru:h1:c1:p1'].status, 'deleted');
  assert.equal(d.records.assessment['ra:h1:p1:residual:personnel'].status, 'deleted');
  assert.equal(d.records.ruling['ru:h1:c1:p2'].status, 'live', 'the other platform keeps its ruling');
  assert.deepEqual(entries(d).at(-1).platforms, ['p1']);
  d = unlinkHazard(d, later, { hazardId: 'h1', platformId: 'p2' });
  d = retireHazard(d, later, { id: 'h1' });
  assert.equal(d.records.hazard.h1.status, 'retired');
});

test('setReportId sets a platform-specific id; blank goes back to the global id', () => {
  let d = setReportId(seed(), later, { hazardId: 'h1', platformId: 'p1', reportId: '  ALPHA-7 ' });
  assert.equal(d.records.hazardPlatform['hp:h1:p1'].reportId, 'ALPHA-7');
  assert.equal(d.records.hazardPlatform['hp:h1:p2'].reportId, null);
  d = setReportId(d, later, { hazardId: 'h1', platformId: 'p1', reportId: '' });
  assert.equal(d.records.hazardPlatform['hp:h1:p1'].reportId, null);
});

test('a platform with hazards on it cannot be deleted; an empty one can', () => {
  assert.throws(() => deletePlatform(seed(), later, { id: 'p1' }), code('platform.has-hazards'));
  const d = createPlatform(seed(), later, { id: 'p9', name: 'Spare', ownerId: 'u1' });
  assert.equal(deletePlatform(d, later, { id: 'p9' }).records.platform.p9.status, 'deleted');
});
