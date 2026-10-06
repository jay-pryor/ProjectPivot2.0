import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, normalizeData, validateData, put, created } from '../../src/core/data.js';
import { hazardLabel, controlLabel, platformLabel } from '../../src/core/ids.js';
import { assignNumbers, createHazard, deleteHazard } from '../../src/core/ops/hazards.js';
import { createControl, deleteControl, retireControl } from '../../src/core/ops/controls.js';
import { createPlatform, deletePlatform } from '../../src/core/ops/platforms.js';
import { mergeData } from '../../src/core/merge.js';

const act = { by: 'u1', at: '2026-09-28T10:00:00+10:00' };
const later = { by: 'u1', at: '2026-09-28T10:00:01+10:00' };

test('controls and platforms get IDs a person reads: C-001, P-001, or TBC until first saved', () => {
  assert.equal(controlLabel({ number: 3 }), 'C-003');
  assert.equal(platformLabel({ number: 12 }), 'P-012');
  assert.equal(controlLabel({ number: null }), 'TBC');
  assert.equal(hazardLabel({ number: 7 }), 'HAZ-007');
});

test('new controls and platforms have no number until saved, then each kind counts on its own and never reuses one', () => {
  let d = emptyData();
  d = createControl(d, act, { id: 'c1', title: 'A' });
  d = createPlatform(d, act, { id: 'p1', name: 'Alpha', ownerId: 'u1' });
  d = createHazard(d, act, { id: 'h1', title: 'Fire' });
  assert.equal(d.records.control.c1.number, null);
  d = assignNumbers(d);
  assert.deepEqual([d.records.hazard.h1.number, d.records.control.c1.number, d.records.platform.p1.number], [1, 1, 1]);
  d = deleteControl(d, later, { id: 'c1' });
  d = createControl(d, later, { id: 'c2', title: 'B' });
  d = retireControl(d, later, { id: 'c2' });
  d = createControl(d, later, { id: 'c3', title: 'C' });
  d = deletePlatform(d, later, { id: 'p1' });
  d = createPlatform(d, later, { id: 'p2', name: 'Bravo', ownerId: 'u1' });
  d = assignNumbers(d);
  assert.equal(d.records.control.c2.number, 2, 'a retired control keeps its number');
  assert.equal(d.records.control.c3.number, 3, 'a deleted control\'s number is not reused');
  assert.equal(d.records.platform.p2.number, 2);
  assert.deepEqual([d.nextControlNumber, d.nextPlatformNumber], [4, 3]);
});

test('data written before control and platform numbers existed is brought up to date on load', () => {
  const old = emptyData();
  delete old.nextControlNumber;
  delete old.nextPlatformNumber;
  const withOld = put(put(old, 'control', created(act, 'c1', { title: 'A', description: '' })), 'platform', created(act, 'p1', { name: 'P', ownerId: 'u1' }));
  const d = normalizeData(withOld);
  assert.deepEqual(validateData(d), []);
  d.records.control.c1.number;
  const numbered = assignNumbers(d);
  assert.equal(numbered.records.control.c1.number, 1);
  assert.equal(numbered.records.platform.p1.number, 1);
  assert.deepEqual(validateData(withOld).some((p) => /nextControlNumber/.test(p)), true, 'unnormalised old data is flagged');
});

test('merging keeps the larger counters, so a number is never given twice', () => {
  const base = assignNumbers(createControl(emptyData(), act, { id: 'c1', title: 'A' }));
  const mine = createControl(base, act, { id: 'mine', title: 'Mine' });
  const theirs = assignNumbers(createControl(base, later, { id: 'theirs', title: 'Theirs' }));
  const merged = assignNumbers(mergeData(base, mine, theirs, act).data);
  const nums = Object.values(merged.records.control).map((c) => c.number);
  assert.equal(new Set(nums).size, nums.length, `unique: ${nums}`);
  assert.equal(merged.records.control.theirs.number, 2);
  assert.equal(merged.records.control.mine.number, 3);
});
