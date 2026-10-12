import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleRegister, SAMPLE_PROFILE } from '../../src/ui/tour/sample.js';
import { checkRules } from '../../src/core/rules.js';
import { openItems } from '../../src/core/queries.js';
import { scheduleOf } from '../../src/core/schedule.js';

const today = '2026-10-12';
const d = sampleRegister('me', today);

test('the sample register keeps every rule and is numbered', () => {
  assert.deepEqual(checkRules(d), []);
  assert.equal(d.records.platform['tour-p1'].number != null, true);
  assert.equal(d.records.hazard['tour-h1'].number != null, true);
  assert.equal(SAMPLE_PROFILE.id, 'sample-sam');
});

test('the patrol boat is yours and due soon; the range is Sam’s and overdue', () => {
  assert.deepEqual([d.records.platform['tour-p1'].ownerId, scheduleOf(d, 'tour-p1', today).state], ['me', 'dueSoon']);
  assert.deepEqual([d.records.platform['tour-p2'].ownerId, scheduleOf(d, 'tour-p2', today).state], ['sample-sam', 'overdue']);
});

test('Home has what the tutorial points at: Sam’s change, a decision, a control to implement, a gap, the review', () => {
  const items = openItems(d, today, 'me');
  assert.equal(items.acks.length, 1);
  assert.equal(items.acks[0].entry.by, 'sample-sam');
  assert.ok(items.awaiting.some((x) => x.control.id === 'tour-c4'));
  assert.ok(items.toImplement.some((x) => x.control.id === 'tour-c3'));
  assert.ok(items.unjustified.some((x) => x.hazard.id === 'tour-h2'));
  assert.ok(items.reviews.some((x) => x.platform.id === 'tour-p1' && x.open));
  assert.equal(items.unrated.length, 0, 'everything of yours is rated');
  assert.equal(items.sfarpGaps.length, 0);
  assert.equal(items.controlGaps.length, 0);
});

test('an open review of the patrol boat, a saved bow-tie, a reference and a safety report', () => {
  const w = d.records.workflow['tour-w1'];
  assert.deepEqual([w.type, w.platformId, w.ownerId, w.state], ['platformReview', 'tour-p1', 'me', 'open']);
  assert.equal(d.records.bowtieView['tour-bv1'].ownerId, 'me');
  assert.equal(d.records.reference['tour-r1'].status, 'live');
  assert.equal(Object.values(d.records.safetyReport).filter((r) => r.status === 'live').length, 1);
});
