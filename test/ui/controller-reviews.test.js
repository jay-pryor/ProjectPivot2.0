import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController, initialState } from '../../src/ui/controller.js';
import { ids } from '../../src/core/ids.js';

const env = (f) => ({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

async function ready() {
  const c = createController(env(new MemoryFolder()));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const u = c.getState().profiles[0].id;
  await c.dispatch({ type: 'selectProfile', id: u });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: u });
  await c.dispatch({ type: 'linkHazard', hazardId: 'h1', platformId: 'p1' });
  return c;
}
const W = (c) => c.getState().session.working;

test('today comes from the clock', async () => {
  assert.match(initialState().today, /^\d{4}-\d{2}-\d{2}$/);
  const c = await ready();
  assert.equal(c.getState().today, '2026-09-28');
});

test('a schedule set from the form, then each part changed in place, keeping the other', async () => {
  const c = await ready();
  await c.dispatch({ type: 'setSchedule', platformId: 'p1', months: '6', due: '2026-12-31' });
  assert.deepEqual([W(c).records.platform.p1.reviewMonths, W(c).records.platform.p1.reviewDue], [6, '2026-12-31']);
  await c.dispatch({ type: 'setScheduleField', platformId: 'p1', months: '3' });
  assert.deepEqual([W(c).records.platform.p1.reviewMonths, W(c).records.platform.p1.reviewDue], [3, '2026-12-31']);
  await c.dispatch({ type: 'setScheduleField', platformId: 'p1', due: '2027-01-15' });
  assert.deepEqual([W(c).records.platform.p1.reviewMonths, W(c).records.platform.p1.reviewDue], [3, '2027-01-15']);
});

test('clearing the due date in place is refused with a message and leaves the schedule as it was', async () => {
  const c = await ready();
  await c.dispatch({ type: 'setSchedule', platformId: 'p1', months: '6', due: '2026-12-31' });
  await c.dispatch({ type: 'setScheduleField', platformId: 'p1', due: '' });
  assert.equal(c.getState().message.kind, 'error');
  assert.match(c.getState().message.text, /real date/);
  assert.deepEqual([W(c).records.platform.p1.reviewMonths, W(c).records.platform.p1.reviewDue], [6, '2026-12-31']);
});

test('starting a review shows the Reviews tab; a tick arrives as text and is stored as a boolean; completing moves the date', async () => {
  const c = await ready();
  await c.dispatch({ type: 'setSchedule', platformId: 'p1', months: '6', due: '2026-12-31' });
  await c.dispatch({ type: 'beginReview', platformId: 'p1' });
  assert.deepEqual([c.getState().view.name, c.getState().view.id, c.getState().view.tab], ['platform', 'p1', 'reviews']);
  const review = Object.values(W(c).records.review)[0];
  await c.dispatch({ type: 'tickReviewRow', reviewId: review.id, hazardId: 'h1', reviewed: 'true' });
  assert.equal(W(c).records.reviewRow[ids.reviewRow(review.id, 'h1')].reviewed, true);
  await c.dispatch({ type: 'tickReviewRow', reviewId: review.id, hazardId: 'h1', reviewed: 'false' });
  assert.equal(W(c).records.reviewRow[ids.reviewRow(review.id, 'h1')].reviewed, false);
  await c.dispatch({ type: 'markRow', reviewId: review.id, hazardId: 'h1', note: 'Looked at it' });
  await c.dispatch({ type: 'setReviewOutcome', reviewId: review.id, outcome: 'Done' });
  await c.dispatch({ type: 'completeReview', reviewId: review.id });
  assert.equal(W(c).records.platform.p1.reviewDue, '2027-06-30');
  await c.dispatch({ type: 'go', view: 'platform', id: 'p1', tab: 'reviews', reviewId: review.id });
  assert.equal(c.getState().view.reviewId, review.id);
});

test('choosing a platform in the report form is remembered on screen only', async () => {
  const c = await ready();
  assert.equal(c.getState().reportPlatformId, null);
  await c.dispatch({ type: 'chooseReportPlatform', platformId: 'p1' });
  assert.equal(c.getState().reportPlatformId, 'p1');
  assert.equal(c.getState().busy, false);
});
