import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDate, addDays, addMonths, reviewState, DUE_SOON_DAYS } from '../../src/core/time.js';

test('isDate accepts real calendar dates only', () => {
  assert.equal(isDate('2026-02-28'), true);
  assert.equal(isDate('2028-02-29'), true);
  assert.equal(isDate('2026-02-29'), false);
  assert.equal(isDate('2026-13-01'), false);
  assert.equal(isDate('2026-1-01'), false);
  assert.equal(isDate(''), false);
  assert.equal(isDate(null), false);
});

test('addDays crosses months and years', () => {
  assert.equal(addDays('2026-09-28', 30), '2026-10-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('addMonths clamps to the last day of a short month, and the day does not come back', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-02-28', 1), '2026-03-28');
  assert.equal(addMonths(addMonths('2026-01-31', 1), 1), '2026-03-28');
  assert.equal(addMonths('2028-02-29', 12), '2029-02-28');
  assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(addMonths('2026-05-31', 120), '2036-05-31');
  assert.throws(() => addMonths('2026-02-30', 1), RangeError);
});

test('reviewState: none without a schedule; due soon within 30 days; overdue from the day after', () => {
  assert.equal(DUE_SOON_DAYS, 30);
  assert.equal(reviewState({ reviewMonths: null, reviewDue: null }, '2026-09-28'), 'none');
  assert.equal(reviewState({}, '2026-09-28'), 'none');
  const p = { reviewMonths: 6, reviewDue: '2026-09-28' };
  assert.equal(reviewState(p, '2026-09-28'), 'dueSoon', 'due today is not yet overdue');
  assert.equal(reviewState(p, '2026-09-29'), 'overdue');
  assert.equal(reviewState({ reviewMonths: 6, reviewDue: '2026-10-28' }, '2026-09-28'), 'dueSoon', '30 days out');
  assert.equal(reviewState({ reviewMonths: 6, reviewDue: '2026-10-29' }, '2026-09-28'), 'ok', '31 days out');
});
