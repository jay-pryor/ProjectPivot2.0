import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOT_ACKNOWLEDGED, ackStart, startAcks, ownerAt, waitingChanges, acknowledge, acknowledgeAll } from '../../src/core/acks.js';
import { REVIEW_DETAIL_ACTIONS } from '../../src/core/ops/reviews.js';
import { updateHazard } from '../../src/core/ops/hazards.js';
import { setOwner, retirePlatform, setReportId, createPlatform, linkHazard } from '../../src/core/ops/platforms.js';
import { startReview, markRow, completeReview } from '../../src/core/ops/reviews.js';
import { createReport } from '../../src/core/ops/reports.js';
import { mergeData } from '../../src/core/merge.js';
import { seed, scheduleFixed } from '../helpers.js';

/** An act by `by` at `hh:mm` on 2026-09-28. */
const at = (hhmm, by) => ({ by, at: `2026-09-28T${hhmm}:00+10:00` });
/** seed(): h1 on p1 (owned by u1) and p2 (owned by u2), all made by u1 at 10:00. Acks start at 10:30. */
const started = () => startAcks(seed(), at('10:30', 'u1'));
const ids = (list) => list.map((e) => e.action);

test('the actions that never wait cover the review-row actions and producing a report', () => {
  for (const a of REVIEW_DETAIL_ACTIONS) assert.ok(NOT_ACKNOWLEDGED.includes(a));
  assert.ok(NOT_ACKNOWLEDGED.includes('Produce report'));
});

test('the start: none until written, written once, the earliest counts', () => {
  assert.equal(ackStart(seed()), null);
  assert.deepEqual(waitingChanges(updateHazard(seed(), at('11:00', 'u2'), { id: 'h1', title: 'X' }), 'p1'), [], 'nothing waits before a start');
  const d = started();
  assert.equal(ackStart(d), '2026-09-28T10:30:00+10:00');
  assert.equal(startAcks(d, at('12:00', 'u2')), d, 'a second start is not written');
  const mine = startAcks(seed(), at('10:45', 'u1'));
  const theirs = startAcks(seed(), at('10:15', 'u2'));
  const { data } = mergeData(seed(), mine, theirs, at('13:00', 'u1'));
  assert.equal(ackStart(data), '2026-09-28T10:15:00+10:00');
});

test('another person\'s change waits on each platform it reaches that they do not own; changes before the start do not', () => {
  const d = updateHazard(started(), at('11:00', 'u2'), { id: 'h1', title: 'Fire (edited)' });
  assert.deepEqual(ids(waitingChanges(d, 'p1')), ['Edit hazard'], 'u2 edited a hazard on u1\'s platform');
  assert.deepEqual(waitingChanges(d, 'p2'), [], 'u2 owns p2');
  const own = updateHazard(started(), at('11:00', 'u1'), { id: 'h1', title: 'Mine' });
  assert.deepEqual(waitingChanges(own, 'p1'), [], 'your own change never waits');
  assert.deepEqual(ids(waitingChanges(own, 'p2')), ['Edit hazard']);
});

test('the owner at the time: the new owner inherits what waits, but not the old owner\'s own changes', () => {
  let d = updateHazard(started(), at('11:00', 'u2'), { id: 'h1', title: 'By u2' });
  d = setReportId(d, at('11:30', 'u1'), { hazardId: 'h1', platformId: 'p1', reportId: 'R-1' });
  d = setOwner(d, at('12:00', 'u1'), { id: 'p1', ownerId: 'u2' });
  d = updateHazard(d, at('13:00', 'u2'), { id: 'h1', title: 'By u2 again' });
  assert.equal(ownerAt(d, 'p1', '2026-09-28T11:30:00+10:00'), 'u1');
  assert.equal(ownerAt(d, 'p1', '2026-09-28T12:00:00+10:00'), 'u2');
  assert.equal(ownerAt(d, 'p1', '2026-09-28T13:00:00+10:00'), 'u2');
  assert.deepEqual(ids(waitingChanges(d, 'p1')), ['Edit hazard', 'Change platform owner'],
    'u2\'s 11:00 edit (inherited) and the transfer itself; not u1\'s own 11:30 edit, not u2\'s 13:00 edit');
});

test('review ticks and producing a report do not wait; starting and completing a review do', () => {
  let d = scheduleFixed(started(), 'p1', 6, '2026-12-30', at('11:00', 'u1'));
  d = startReview(d, at('11:05', 'u2'), { id: 'r1', platformId: 'p1' });
  d = markRow(d, at('11:10', 'u2'), { reviewId: 'r1', hazardId: 'h1', reviewed: true });
  d = completeReview(d, at('11:15', 'u2'), { reviewId: 'r1' });
  d = createReport(d, at('11:20', 'u2'), { id: 'rep', report: { platformId: 'p1', title: 'R' } });
  assert.deepEqual(ids(waitingChanges(d, 'p1')), ['Start review', 'Complete review']);
});

test('a retired platform has nothing waiting', () => {
  let d = updateHazard(started(), at('11:00', 'u2'), { id: 'h1', title: 'X' });
  d = createPlatform(d, at('11:00', 'u1'), { id: 'p9', name: 'Spare', ownerId: 'u1' });
  d = linkHazard(d, at('11:00', 'u1'), { hazardId: 'h2', platformId: 'p9' });
  d = retirePlatform(d, at('12:00', 'u2'), { id: 'p9' });
  assert.deepEqual(waitingChanges(d, 'p9'), []);
});

test('acknowledging: per platform, once, and only what is waiting', () => {
  const d = updateHazard(started(), at('11:00', 'u3'), { id: 'h1', title: 'By u3' });
  const [change] = waitingChanges(d, 'p1');
  const a = acknowledge(d, at('12:00', 'u1'), { entryId: change.id, platformId: 'p1' });
  assert.deepEqual(waitingChanges(a, 'p1'), []);
  assert.equal(waitingChanges(a, 'p2').length, 1, 'p2 still has it waiting');
  const ack = Object.values(a.history).find((e) => e.type === 'ack');
  assert.deepEqual({ by: ack.by, at: ack.at, entryId: ack.entryId, platformId: ack.platformId }, { by: 'u1', at: '2026-09-28T12:00:00+10:00', entryId: change.id, platformId: 'p1' });
  assert.equal(acknowledge(a, at('12:05', 'u1'), { entryId: change.id, platformId: 'p1' }), a, 'twice changes nothing');
  assert.equal(acknowledge(d, at('12:05', 'u1'), { entryId: 'nope', platformId: 'p1' }), d, 'an unknown change changes nothing');
  const both = acknowledgeAll(d, at('12:10', 'u1'), { keys: `${change.id}|p1,${change.id}|p2` });
  assert.deepEqual([waitingChanges(both, 'p1'), waitingChanges(both, 'p2')], [[], []]);
  assert.equal(waitingChanges(acknowledgeAll(d, at('12:10', 'u1'), { keys: [`${change.id}|p2`] }), 'p1').length, 1);
});

test('two people acknowledging the same change at once: both saves merge, and it is acknowledged', () => {
  const d = updateHazard(started(), at('11:00', 'u3'), { id: 'h1', title: 'By u3' });
  const [change] = waitingChanges(d, 'p1');
  const mine = acknowledge(d, at('12:00', 'u1'), { entryId: change.id, platformId: 'p1' });
  const theirs = acknowledge(d, at('12:01', 'u2'), { entryId: change.id, platformId: 'p1' });
  const { data, conflicts } = mergeData(d, mine, theirs, at('13:00', 'u1'));
  assert.deepEqual(conflicts, []);
  assert.deepEqual(waitingChanges(data, 'p1'), []);
});

test('Final I1: what waits is worked out once per version of the data, and acknowledging many at once is quick', () => {
  let d = started();
  for (let i = 0; i < 1500; i++) {
    const s = String(i % 60).padStart(2, '0');
    const m = String(Math.floor(i / 60) % 60).padStart(2, '0');
    d = updateHazard(d, { by: 'u3', at: `2026-09-28T11:${m}:${s}+10:00` }, { id: 'h1', title: `T${i}` });
  }
  const w = waitingChanges(d, 'p1');
  assert.equal(w.length, 1500);
  assert.equal(waitingChanges(d, 'p1'), w, 'the same data gives the same answer without working it out again');
  const t = performance.now();
  const a = acknowledgeAll(d, at('13:00', 'u1'), { keys: w.slice(0, 300).map((e) => `${e.id}|p1`) });
  assert.ok(performance.now() - t < 250, `acknowledging 300 took ${Math.round(performance.now() - t)} ms`);
  assert.equal(waitingChanges(a, 'p1').length, 1200);
  assert.equal(Object.values(a.history).filter((e) => e.type === 'ack').length, 300);
});

test('Final I2: after two transfers merge, the owner is the one the platform actually has', () => {
  const b = started();
  const mine = setOwner(b, at('11:00', 'u1'), { id: 'p1', ownerId: 'u3' });
  const theirs = setOwner(b, at('11:10', 'u1'), { id: 'p1', ownerId: 'u2' });
  let { data } = mergeData(b, mine, theirs, at('11:30', 'u1'));
  assert.equal(data.records.platform.p1.ownerId, 'u3', 'mine wins the record');
  assert.equal(ownerAt(data, 'p1', '2026-09-28T12:00:00+10:00'), 'u3');
  data = updateHazard(data, at('12:00', 'u3'), { id: 'h1', title: 'By u3, the owner' });
  data = setReportId(data, at('12:05', 'u2'), { hazardId: 'h1', platformId: 'p1', reportId: 'R-2' });
  const waiting = waitingChanges(data, 'p1').map((e) => [e.action, e.by]);
  assert.ok(!waiting.some(([a, by]) => a === 'Edit hazard' && by === 'u3'), 'the owner\'s own edit does not wait');
  assert.ok(waiting.some(([a, by]) => a === 'Set report ID' && by === 'u2'), 'u2 is not the owner, so their edit waits');
});
