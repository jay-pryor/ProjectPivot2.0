import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openItems, upcomingReviews, platformCards, attentionItems } from '../../src/core/queries.js';
import { startAcks } from '../../src/core/acks.js';
import { updateHazard } from '../../src/core/ops/hazards.js';
import { createPlatform, linkHazard } from '../../src/core/ops/platforms.js';
import { confirmControl, setRating } from '../../src/core/ops/assessment.js';
import { startReview } from '../../src/core/ops/reviews.js';
import { seed, scheduleFixed } from '../helpers.js';

const at = (hhmm, by) => ({ by, at: `2026-09-28T${hhmm}:00+10:00` });
const today = '2026-09-28';

/**
 * p1 (u1): overdue (due 1 Sep), h1 rated Serious, c1 confirmed, c2 awaiting.
 * p2 (u2): due soon (20 Oct), h1 unrated, both controls awaiting.
 * p3 (u1): due 20 Dec (inside 90 days), h2 on it, unrated. p4 (u1): due next June, a review in progress.
 * u3 edits h1, so a change waits on p1 and p2.
 */
function data() {
  let d = startAcks(seed(), at('10:30', 'u1'));
  d = createPlatform(d, at('10:31', 'u1'), { id: 'p3', name: 'Charlie', ownerId: 'u1' });
  d = createPlatform(d, at('10:32', 'u1'), { id: 'p4', name: 'Delta', ownerId: 'u1' });
  d = linkHazard(d, at('10:33', 'u1'), { hazardId: 'h2', platformId: 'p3' });
  d = scheduleFixed(d, 'p1', 6, '2026-09-01', at('10:34', 'u1'));
  d = scheduleFixed(d, 'p2', 6, '2026-10-20', at('10:34', 'u2'));
  d = scheduleFixed(d, 'p3', 6, '2026-12-20', at('10:34', 'u1'));
  d = scheduleFixed(d, 'p4', 12, '2027-06-01', at('10:34', 'u1'));
  d = startReview(d, at('10:35', 'u1'), { id: 'r4', platformId: 'p4' });
  d = confirmControl(d, at('10:36', 'u1'), { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  d = setRating(d, at('10:37', 'u1'), { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 2, likelihood: 'C' });
  return updateHazard(d, at('11:00', 'u3'), { id: 'h1', title: 'Fire (u3)' });
}

test('coming up: reviews due in the next 90 days, soonest first, and any in progress; never an overdue one', () => {
  assert.deepEqual(upcomingReviews(data(), today, 'u1').map((r) => [r.platform.id, r.due, r.state, r.open]), [
    ['p3', '2026-12-20', 'ok', false],
    ['p4', '2027-06-01', 'ok', true],
  ]);
  assert.deepEqual(upcomingReviews(data(), today, null).map((r) => [r.platform.id, r.state]), [['p2', 'dueSoon'], ['p3', 'ok'], ['p4', 'ok']]);
  assert.deepEqual(upcomingReviews(data(), today, 'u1', 60).map((r) => r.platform.id), ['p4'], 'a shorter window; the one in progress stays');
});

test('a card per platform: its review, the residual risk of its hazards, and what is open on it', () => {
  const cards = platformCards(data(), today, 'u1');
  assert.deepEqual(cards.map((c) => c.platform.id), ['p1', 'p3', 'p4']);
  const [p1, p3, p4] = cards;
  assert.deepEqual({ state: p1.state, due: p1.due, hazards: p1.hazards, awaiting: p1.awaiting, acks: p1.acks, bands: p1.bands },
    { state: 'overdue', due: '2026-09-01', hazards: 1, awaiting: 1, acks: 1, bands: { personnel: { Serious: 1 }, environment: { Serious: 1 }, capability: { Serious: 1 } } });
  assert.deepEqual({ hazards: p3.hazards, awaiting: p3.awaiting, acks: p3.acks, bands: p3.bands }, { hazards: 1, awaiting: 0, acks: 0, bands: { personnel: { Uncategorised: 1 }, environment: { Uncategorised: 1 }, capability: { Uncategorised: 1 } } });
  assert.deepEqual({ hazards: p4.hazards, bands: p4.bands, open: p4.open }, { hazards: 0, bands: { personnel: {}, environment: {}, capability: {} }, open: true });
  assert.deepEqual(platformCards(data(), today, null).map((c) => c.platform.id), ['p1', 'p2', 'p3', 'p4']);
});

test('needs attention: overdue reviews first, then changes (newest first), then controls awaiting, then unrated hazards, then ratings without justification, control properties not set and SFARP incomplete', () => {
  const items = attentionItems(openItems(data(), today, null));
  assert.deepEqual(items.map((i) => i.type), ['review', 'change', 'change', 'control', 'control', 'control', 'rating', 'rating', 'rating', 'justify', 'controlGap', 'controlGap', 'controlGap', 'controlGap', 'sfarp', 'sfarp', 'sfarp']);
  assert.equal(items[0].platform.id, 'p1');
  assert.deepEqual(items.filter((i) => i.type === 'rating').map((i) => [i.platform.id, i.missing]), [['p1', ['initial personnel', 'initial environment', 'initial capability']], ['p2', ['initial personnel', 'initial environment', 'initial capability', 'residual personnel', 'residual environment', 'residual capability']], ['p3', ['initial personnel', 'initial environment', 'initial capability', 'residual personnel', 'residual environment', 'residual capability']]]);
});
