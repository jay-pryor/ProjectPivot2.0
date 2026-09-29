import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformsView, platformView } from '../../src/ui/screens/platforms.js';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { day } from '../../src/ui/names.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { setSchedule, startReview, markRow, completeReview } from '../../src/core/ops/reviews.js';
import { seed, act } from '../helpers.js';

export const state = { ...initialState(), screen: 'main', today: '2026-09-28', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }], profileId: 'u1' };
/** p1 overdue (due 2026-09-01), p2 due soon (2026-10-10). */
export function data() {
  let d = assignNumbers(seed());
  d = setSchedule(d, act, { platformId: 'p1', months: 6, due: '2026-09-01' });
  return setSchedule(d, act, { platformId: 'p2', months: 12, due: '2026-10-10' });
}

test('day() reads a date the way people write it', () => {
  assert.equal(day('2026-08-12'), '12 Aug 2026');
  assert.equal(day('2026-12-01T09:30:00+10:00'), '1 Dec 2026');
});

test('the platforms list shows the next review with a due-soon or overdue badge, and filters by it', () => {
  const out = platformsView(state, data()).toString();
  assert.match(out, /<th data-col="review"/);
  assert.match(out, /1 Sep 2026 <span class="tag review-overdue">Overdue<\/span>/);
  assert.match(out, /10 Oct 2026 <span class="tag review-due-soon">Due soon<\/span>/);
  const overdueOnly = platformsView({ ...state, tables: { platforms: { filters: { review: 'overdue' } } } }, data()).toString();
  assert.match(overdueOnly, /data-row="p1"/);
  assert.doesNotMatch(overdueOnly, /data-row="p2"/);
});

test('a platform page states its schedule, changed in place, with a Start review button', () => {
  const out = platformView(state, data(), 'p1').toString();
  assert.match(out, /<input type="number"[^>]*name="months"[^>]*value="6"[^>]*data-change="setScheduleField" data-platform-id="p1"/);
  assert.match(out, /<input type="date"[^>]*name="due"[^>]*value="2026-09-01"[^>]*data-change="setScheduleField"/);
  assert.match(out, /review-overdue/);
  assert.match(out, /data-action="beginReview" data-platform-id="p1"/);
  assert.match(out, /data-action="setSchedule" data-platform-id="p1"/, 'the schedule can be removed');
  assert.match(out, /class="tab[^"]*"[^>]*data-tab="reviews"/);
});

test('without a schedule: a Set schedule link, which opens a small form', () => {
  const out = platformView(state, seed(), 'p1').toString();
  assert.match(out, /No review schedule/);
  assert.match(out, /data-action="startEdit" data-kind="schedule" data-id="p1"/);
  const editing = platformView({ ...state, editing: { kind: 'schedule', id: 'p1' } }, seed(), 'p1').toString();
  assert.match(editing, /<form data-action="setSchedule" data-platform-id="p1"[\s\S]*?name="months"[\s\S]*?name="due"/);
});

test('with a review open, the button says Continue review', () => {
  const d = startReview(data(), act, { id: 'r1', platformId: 'p1' });
  const out = platformView(state, d, 'p1').toString();
  assert.match(out, /data-action="go" data-view="platform" data-id="p1" data-tab="reviews">Continue review/);
  assert.doesNotMatch(out, /data-action="beginReview"/);
});

test('a hazard page shows when it was last reviewed on each platform', () => {
  let d = startReview(data(), act, { id: 'r1', platformId: 'p1' });
  d = markRow(d, act, { reviewId: 'r1', hazardId: 'h1', reviewed: true });
  d = completeReview(d, act, { reviewId: 'r1' });
  const out = hazardView(state, d, 'h1').toString();
  assert.match(out, /<th data-col="lastReviewed"/);
  assert.match(out, /28 Sep 2026/);
  assert.match(out, /Never/, 'not reviewed on Bravo');
});
