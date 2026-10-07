import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformLetter, letterIndex, safetyReportId } from '../../src/core/ops/report-ids.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { createPlatform, linkHazard, unlinkHazard } from '../../src/core/ops/platforms.js';
import { createSafetyReport, deleteSafetyReport, moveSafetyReport } from '../../src/core/ops/safety-reports.js';
import { seed, act, later } from '../helpers.js';

const id = (d, rid) => safetyReportId(d, d.records.safetyReport[rid]).id;

test('platform letters run A to Z, then BA, BB…, and read back', () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 675, 676].map(platformLetter), ['A', 'B', 'Z', 'BA', 'BB', 'BZ', 'CA', 'ZZ', 'BAA']);
  for (const i of [0, 25, 26, 52, 700]) assert.equal(letterIndex(platformLetter(i)), i);
});

test('a hazard\'s platforms get letters in the order linked, at save, and keep them for good', () => {
  let d = assignNumbers(seed());
  assert.deepEqual(['p1', 'p2'].map((p) => d.records.hazardPlatform[`hp:h1:${p}`].letter), ['A', 'B']);
  d = createPlatform(d, act, { id: 'p3', name: 'Charlie', ownerId: 'u1' });
  d = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  d = assignNumbers(linkHazard(d, later, { hazardId: 'h1', platformId: 'p3' }));
  assert.equal(d.records.hazardPlatform['hp:h1:p3'].letter, 'C', 'A is still Alpha\'s, though it left');
  d = assignNumbers(linkHazard(d, later, { hazardId: 'h1', platformId: 'p1' }));
  assert.equal(d.records.hazardPlatform['hp:h1:p1'].letter, 'A', 'back on: its own letter again');
  // Past 26 platforms: BA.
  // Each linked a minute after the last, so the order linked is plain.
  for (let i = 4; i <= 27; i += 1) {
    const at = { by: 'u1', at: `2026-09-29T${String(Math.floor(i / 60) + 10).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00+10:00` };
    d = linkHazard(createPlatform(d, at, { id: `x${i}`, name: `P${i}`, ownerId: 'u1' }), at, { hazardId: 'h1', platformId: `x${i}` });
  }
  d = assignNumbers(d);
  assert.equal(d.records.hazardPlatform['hp:h1:x26'].letter, 'Z');
  assert.equal(d.records.hazardPlatform['hp:h1:x27'].letter, 'BA');
});

test('a safety report\'s ID: its hazard, its platform\'s letter, the next number there; TBC until saved; never used again', () => {
  let d = assignNumbers(seed());
  d = createSafetyReport(d, act, { id: 'a1', hazardId: 'h1', platformId: 'p1', summary: 'One' });
  assert.equal(id(d, 'a1'), 'TBC', 'until the save');
  d = createSafetyReport(d, act, { id: 'a2', hazardId: 'h1', platformId: 'p1', summary: 'Two' });
  d = createSafetyReport(d, act, { id: 'b1', hazardId: 'h1', platformId: 'p2', summary: 'On Bravo' });
  d = assignNumbers(d);
  assert.deepEqual(['a1', 'a2', 'b1'].map((r) => id(d, r)), ['HAZ-001-A-1', 'HAZ-001-A-2', 'HAZ-001-B-1']);
  d = assignNumbers(deleteSafetyReport(d, act, { id: 'a2' }));
  d = assignNumbers(createSafetyReport(d, later, { id: 'a3', hazardId: 'h1', platformId: 'p1', summary: 'Three' }));
  assert.equal(id(d, 'a3'), 'HAZ-001-A-3', 'a deleted report\'s number is not used again');
  assert.equal(assignNumbers(d), d, 'nothing new: nothing changes');
});

test('a report moved to another platform gets a new ID there at save; the old one is kept as retired and never used again', () => {
  let d = assignNumbers(seed());
  d = assignNumbers(createSafetyReport(d, act, { id: 'r1', hazardId: 'h1', platformId: 'p1', summary: 'Filed on the wrong one' }));
  assert.equal(id(d, 'r1'), 'HAZ-001-A-1');
  d = moveSafetyReport(d, later, { id: 'r1', platformId: 'p2' });
  assert.deepEqual(safetyReportId(d, d.records.safetyReport.r1), { id: 'TBC', past: ['HAZ-001-A-1'] }, 'moved: a new one at the next save');
  assert.equal(id(moveSafetyReport(d, later, { id: 'r1', platformId: 'p1' }), 'r1'), 'HAZ-001-A-1', 'moved back before saving: its own ID again');
  d = assignNumbers(d);
  assert.deepEqual(safetyReportId(d, d.records.safetyReport.r1), { id: 'HAZ-001-B-1', past: ['HAZ-001-A-1'] });
  d = assignNumbers(createSafetyReport(d, later, { id: 'r2', hazardId: 'h1', platformId: 'p1', summary: 'Next on Alpha' }));
  assert.equal(id(d, 'r2'), 'HAZ-001-A-2', 'A-1 is retired, not given again');
});

test('reports made in the same second are numbered in the order they were added', () => {
  let d = assignNumbers(seed());
  for (const [rid, s] of [['zz', 'First'], ['aa', 'Second'], ['mm', 'Third']]) d = createSafetyReport(d, act, { id: rid, hazardId: 'h1', platformId: 'p1', summary: s });
  d = assignNumbers(d);
  assert.deepEqual(['zz', 'aa', 'mm'].map((r) => id(d, r)), ['HAZ-001-A-1', 'HAZ-001-A-2', 'HAZ-001-A-3']);
});
