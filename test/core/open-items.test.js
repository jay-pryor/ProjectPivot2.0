import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openItems, attentionItems } from '../../src/core/queries.js';
import { put, created, changed } from '../../src/core/data.js';
import { startAcks } from '../../src/core/acks.js';
import { updateHazard } from '../../src/core/ops/hazards.js';
import { confirmControl, setRating } from '../../src/core/ops/assessment.js';
import { startReview } from '../../src/core/ops/reviews.js';
import { seed, scheduleFixed, seeDue } from '../helpers.js';

const at = (hhmm, by) => ({ by, at: `2026-09-28T${hhmm}:00+10:00` });

/** p1 (u1): overdue, c1 confirmed, c2 awaiting, h1 rated initial only; p2 (u2): review in progress; an edit by u3. */
function data() {
  let d = startAcks(seed(), at('10:30', 'u1'));
  d = scheduleFixed(d, 'p1', 6, '2026-09-01');
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
  assert.deepEqual(names(o.unrated), ['p1:h1:residual personnel+residual environment+residual capability']);
});

test('the owner filter: another owner, and everyone', () => {
  const u2 = openItems(data(), '2026-09-28', 'u2');
  assert.deepEqual(u2.acks.map((a) => [a.platform.id, a.entry.action]), [['p2', 'Edit hazard']]);
  assert.deepEqual(u2.reviews.map((r) => [r.platform.id, r.state, r.open]), [['p2', 'none', true]], 'a review in progress, with no schedule');
  assert.deepEqual(names(u2.awaiting), ['p2:h1:c1', 'p2:h1:c2']);
  assert.deepEqual(names(u2.unrated), ['p2:h1:initial personnel+initial environment+initial capability+residual personnel+residual environment+residual capability']);
  const all = openItems(data(), '2026-09-28', null);
  assert.equal(all.acks.length, 2);
  assert.equal(all.awaiting.length, 3);
  assert.deepEqual(openItems(data(), '2026-09-28', 'nobody'), { acks: [], reviews: [], dateMoved: [], awaiting: [], toImplement: [], unrated: [] });
});

test('a moved review date is an item for the owner: urgent first when passed or within 30 days', () => {
  let d = scheduleFixed(seed(), 'p1', 36, '2029-01-01');
  d = put(d, 'reviewPolicy', created(at('10:00', 'u1'), 'pol1', { name: 'S', order: 1, longest: 36, receptors: {
    personnel: { considered: true, periods: { High: 1, Serious: 6, Medium: null, Low: null, Eliminated: null, 'Not Credible': null, Uncategorised: null } },
    environment: { considered: false, periods: {} }, capability: { considered: false, periods: {} } } }));
  d = put(d, 'platform', changed(d.records.platform.p1, at('10:00', 'u1'), { reviewRule: { kind: 'policy', policyId: 'pol1' } }));
  assert.equal(openItems(d, '2026-10-08', 'u1').dateMoved.length, 0, 'the policy gives 36 months too: nothing moved');
  d = setRating(d, at('11:00', 'u2'), { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'personnel', consequence: 2, likelihood: 'C' }); // Serious → 6
  const items = openItems(d, '2026-10-08', 'u1');
  assert.equal(items.dateMoved.length, 1);
  assert.deepEqual([items.dateMoved[0].due, items.dateMoved[0].seen, items.dateMoved[0].urgent], ['2026-07-01', '2029-01-01', true]);
  assert.equal(attentionItems(items)[0].type, 'dateMoved', 'urgent moves come before everything');
  assert.equal(openItems(d, '2026-10-08', 'u2').dateMoved.length, 0, 'only the owner of p1');
});

test('a moved review date far off comes after the changes to acknowledge', () => {
  let d = startAcks(scheduleFixed(seed(), 'p1', 6, '2026-12-01'), at('10:30', 'u1'));
  d = updateHazard(d, at('10:50', 'u3'), { id: 'h1', title: 'Big fire' });
  d = seeDue(d, 'p1', '2027-06-01');
  const items = openItems(d, '2026-10-08', 'u1');
  assert.deepEqual(items.dateMoved.map((m) => m.urgent), [false]);
  const types = attentionItems(items).map((i) => i.type);
  assert.ok(types.includes('change'));
  assert.ok(types.indexOf('dateMoved') > types.lastIndexOf('change'));
});
