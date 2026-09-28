import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  consequenceLevel, likelihoodLetter, riskCell, parseRiskCell, splitRiskCell,
  dateAest, timestampAest, dateOfTimestamp, reviewTempoMonths, sha256Hex, saveToken,
  hazardId, platformReportId, controlId, userProfileId, reviewScheduleId, RECORD_KINDS,
} from '../types.js';

test('consequence level accepts 1 to 5 and rejects the rest', () => {
  for (const n of [1, 2, 3, 4, 5]) assert.equal(consequenceLevel(n), n);
  for (const n of [0, 6, 2.5, NaN, -1]) assert.throws(() => consequenceLevel(n), RangeError);
});

test('likelihood letter accepts A to G and rejects the DEC-001 integer encoding', () => {
  for (const s of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) assert.equal(likelihoodLetter(s), s);
  for (const s of ['H', 'a', '3', '', 'AA']) assert.throws(() => likelihoodLetter(s), RangeError);
  // @ts-expect-error a number is the trace-record encoding, never a product value
  assert.throws(() => likelihoodLetter(3), RangeError);
});

test('risk cell is level then letter, and splits back', () => {
  const cell = riskCell(consequenceLevel(2), likelihoodLetter('C'));
  assert.equal(cell, '2C');
  assert.deepEqual(splitRiskCell(cell), { level: 2, letter: 'C' });
  assert.equal(parseRiskCell('5G'), '5G');
  for (const s of ['C2', '2c', '6A', '2', '2CC']) assert.throws(() => parseRiskCell(s), RangeError);
});

test('AEST date must be a real calendar date', () => {
  assert.equal(dateAest('2026-09-14'), '2026-09-14');
  assert.equal(dateAest('2028-02-29'), '2028-02-29');
  for (const s of ['2026-02-30', '2026-13-01', '2026-9-14', '14/09/2026', '2026-09-14T00:00:00+10:00']) {
    assert.throws(() => dateAest(s), RangeError);
  }
});

test('AEST timestamp carries the +10:00 offset and second resolution', () => {
  assert.equal(timestampAest('2026-09-14T18:19:51+10:00'), '2026-09-14T18:19:51+10:00');
  for (const s of ['2026-09-14T18:19:51Z', '2026-09-14T18:19:51', '2026-09-14T18:19:51.398+10:00', '2026-09-14T24:00:00+10:00', '2026-09-14T18:19:51+11:00']) {
    assert.throws(() => timestampAest(s), RangeError);
  }
  assert.equal(dateOfTimestamp(timestampAest('2026-09-14T23:59:59+10:00')), '2026-09-14');
});

test('review tempo is a whole number of months from 1', () => {
  assert.equal(reviewTempoMonths(12), 12);
  for (const n of [0, -3, 1.5, NaN]) assert.throws(() => reviewTempoMonths(n), RangeError);
});

test('digest and token shapes are checked', () => {
  assert.equal(sha256Hex('a'.repeat(64)), 'a'.repeat(64));
  assert.throws(() => sha256Hex('A'.repeat(64)), RangeError);
  assert.throws(() => sha256Hex('a'.repeat(63)), RangeError);
  assert.equal(saveToken('0'.repeat(32)), '0'.repeat(32));
  assert.throws(() => saveToken('0'.repeat(31)), RangeError);
});

test('hazard global id comes from a sequence and is checked on parse', () => {
  assert.equal(hazardId.fromSequence(1), 'H-0001');
  assert.equal(hazardId.fromSequence(12345), 'H-12345');
  assert.throws(() => hazardId.fromSequence(0), RangeError);
  assert.equal(hazardId.parse('H-0042'), 'H-0042');
  for (const s of ['H-42', 'HZ-0001', '0001', 'h-0001']) assert.throws(() => hazardId.parse(s), TypeError);
});

test('platform report id is user text, trimmed and non-empty', () => {
  assert.equal(platformReportId('PLT-7'), 'PLT-7');
  for (const s of ['', '  ', ' PLT-7', 'PLT-7 ']) assert.throws(() => platformReportId(s), TypeError);
});

test('uuid ids are fresh, unique, and parsed by shape', () => {
  const a = controlId.fresh();
  const b = controlId.fresh();
  assert.notEqual(a, b);
  assert.equal(controlId.parse(a), a);
  assert.equal(controlId.kind, 'control');
  assert.equal(userProfileId.kind, 'user-profile');
  assert.throws(() => controlId.parse('not-a-uuid'), TypeError);
  assert.throws(() => controlId.parse('H-0001'), TypeError);
});

test('every record kind is listed once', () => {
  assert.equal(new Set(RECORD_KINDS).size, RECORD_KINDS.length);
  assert.ok(RECORD_KINDS.includes('hazard') && RECORD_KINDS.includes('change-log-entry'));
  assert.ok(RECORD_KINDS.includes('review-schedule'));
});

test('the review schedule is a record kind with a uuid id of its own (DEC-018)', () => {
  assert.equal(reviewScheduleId.kind, 'review-schedule');
  assert.ok(RECORD_KINDS.includes(reviewScheduleId.kind));
  const a = reviewScheduleId.fresh();
  assert.notEqual(a, reviewScheduleId.fresh());
  assert.equal(reviewScheduleId.parse(a), a);
  assert.throws(() => reviewScheduleId.parse('H-0001'), TypeError);
  assert.throws(() => reviewScheduleId.parse('not-a-uuid'), TypeError);
});
