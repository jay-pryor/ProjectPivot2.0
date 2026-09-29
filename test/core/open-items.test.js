import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openItems } from '../../src/core/queries.js';
import { startAcks } from '../../src/core/acks.js';
import { updateHazard } from '../../src/core/ops/hazards.js';
import { confirmControl, setRating } from '../../src/core/ops/assessment.js';
import { setSchedule, startReview } from '../../src/core/ops/reviews.js';
import { seed } from '../helpers.js';

const at = (hhmm, by) => ({ by, at: `2026-09-28T${hhmm}:00+10:00` });

/** p1 (u1): overdue, c1 confirmed, c2 awaiting, h1 rated initial only; p2 (u2): review in progress; an edit by u3. */
function data() {
  let d = startAcks(seed(), at('10:30', 'u1'));
  d = setSchedule(d, at('10:40', 'u1'), { platformId: 'p1', months: 6, due: '2026-09-01' });
  d = confirmControl(d, at('10:40', 'u1'), { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  d = setRating(d, at('10:40', 'u1'), { hazardId: 'h1', platformId: 'p1', stage: 'initial', consequence: 2, likelihood: 'C' });
  d = startReview(d, at('10:40', 'u2'), { id: 'r2', platformId: 'p2' });
  return updateHazard(d, at('11:00', 'u3'), { id: 'h1', title: 'Fire (u3)' });
}
const names = (xs) => xs.map((x) => `${x.platform.id}:${x.hazard?.id ?? ''}:${x.control?.id ?? x.missing?.join?.('+') ?? x.state ?? x.entry?.action ?? ''}`);

test('open items for one owner: changes to acknowledge, reviews, awaiting controls, unrated hazards', () => {
  const o = openItems(data(), '2026-09-28', 'u1');
  assert.deepEqual(o.acks.map((a) => [a.platform.id, a.entry.action]), [['p1', 'Edit hazard']],
    'u3 edited h1 on p1; u2 started a review on p2, not p1; u1\'s own edits never wait');
  assert.deepEqual(o.reviews.map((r) => [r.platform.id, r.state, r.due, r.open]), [['p1', 'overdue', '2026-09-01', false]]);
  assert.deepEqual(names(o.awaiting), ['p1:h1:c2']);
  assert.deepEqual(names(o.unrated), ['p1:h1:residual personnel+residual environment']);
});

test('the owner filter: another owner, and everyone', () => {
  const u2 = openItems(data(), '2026-09-28', 'u2');
  assert.deepEqual(u2.acks.map((a) => [a.platform.id, a.entry.action]), [['p2', 'Edit hazard']]);
  assert.deepEqual(u2.reviews.map((r) => [r.platform.id, r.state, r.open]), [['p2', 'none', true]], 'a review in progress, with no schedule');
  assert.deepEqual(names(u2.awaiting), ['p2:h1:c1', 'p2:h1:c2']);
  assert.deepEqual(names(u2.unrated), ['p2:h1:initial personnel+initial environment+residual personnel+residual environment']);
  const all = openItems(data(), '2026-09-28', null);
  assert.equal(all.acks.length, 2);
  assert.equal(all.awaiting.length, 3);
  assert.deepEqual(openItems(data(), '2026-09-28', 'nobody'), { acks: [], reviews: [], awaiting: [], unrated: [] });
});
