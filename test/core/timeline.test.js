import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthsInRange, timelineMarks, rangeStart } from '../../src/core/timeline.js';
import { put, created } from '../../src/core/data.js';
import { seed, scheduleFixed, act, beginPlatformReview, finishPlatformReview } from '../helpers.js';

test('a range is consecutive months across year ends', () => {
  assert.deepEqual(monthsInRange('2026-11', 4), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('the range starts at the chosen month, or this month, a year earlier with the past shown', () => {
  assert.equal(rangeStart({ start: null, past: false }, '2026-10-08'), '2026-10');
  assert.equal(rangeStart({ start: '2027-03', past: true }, '2026-10-08'), '2026-03');
  assert.equal(rangeStart({ start: '2027-01', past: true }, '2026-10-08'), '2026-01');
});

test('marks: the next due, later reviews at the current period, completed reviews on time or late', () => {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-12-15');
  d = put(d, 'review', created(act, 'r1', { platformId: 'p1', state: 'completed', completedAt: '2026-06-20T09:00:00+10:00', dueBefore: '2026-06-15', dueAfter: '2026-12-15', completedBy: 'u1', outcome: '', notes: '' }));
  d = put(d, 'review', created(act, 'r0', { platformId: 'p1', state: 'completed', completedAt: '2025-12-10T09:00:00+10:00', dueBefore: '2025-12-15', dueAfter: '2026-06-15', completedBy: 'u1', outcome: '', notes: '' }));
  const marks = timelineMarks(d, 'p1', '2026-10-08', monthsInRange('2025-12', 25));
  assert.deepEqual(marks['2025-12'], [{ kind: 'done', date: '2025-12-10' }]);
  assert.deepEqual(marks['2026-06'], [{ kind: 'late', date: '2026-06-20' }]);
  assert.deepEqual(marks['2026-12'], [{ kind: 'due', date: '2026-12-15' }]);
  assert.deepEqual(marks['2027-06'], [{ kind: 'projected', date: '2027-06-15' }]);
  assert.deepEqual(marks['2027-12'], [{ kind: 'projected', date: '2027-12-15' }]);
  assert.equal(marks['2026-07'], undefined);
  assert.equal(Object.keys(marks).length, 5);
});

test('an overdue review is marked in this month with the date it was due, and where it was due', () => {
  const d = scheduleFixed(seed(), 'p1', 6, '2026-08-01');
  const marks = timelineMarks(d, 'p1', '2026-10-08', monthsInRange('2026-07', 6));
  assert.deepEqual(marks['2026-10'], [{ kind: 'overdue', date: '2026-08-01' }]);
  assert.deepEqual(marks['2026-08'], [{ kind: 'dueWas', date: '2026-08-01' }]);
  assert.equal(marks['2026-12'], undefined, 'the next after it (Feb 2027) is outside the range');
});

test('a review in progress is marked in the month it started; a platform with no rule has only what is done', () => {
  const d = beginPlatformReview(scheduleFixed(seed(), 'p1', 12, '2027-03-01'), act, { id: 'r1', platformId: 'p1' });
  assert.deepEqual(timelineMarks(d, 'p1', '2026-10-08', monthsInRange('2026-09', 3))['2026-09'], [{ kind: 'open', date: '2026-09-28' }]);
  assert.deepEqual(timelineMarks(seed(), 'p2', '2026-10-08', monthsInRange('2026-09', 36)), {});
});

test('marks outside the range are left out, and a 10-year range of monthly reviews stays bounded', () => {
  const d = scheduleFixed(seed(), 'p1', 1, '2026-11-05');
  const marks = timelineMarks(d, 'p1', '2026-10-08', monthsInRange('2026-10', 120));
  assert.equal(Object.keys(marks).length, 119, 'one a month from Nov 2026 to Sep 2036');
  assert.equal(marks['2026-10'], undefined);
});
