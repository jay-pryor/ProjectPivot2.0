import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { infoDeletions, restoreDeletion } from '../../src/core/ops/facets.js';
import { createReviewPolicy, updateReviewPolicy, deleteReviewPolicy } from '../../src/core/ops/reviews.js';
import { historyDeletionsView } from '../../src/ui/screens/history-deletions.js';
import { initialState } from '../../src/ui/controller.js';
import { seed, act, later } from '../helpers.js';

const state = { ...initialState(), screen: 'main', today: '2026-10-08', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }] };
/** Standard (personnel Serious every 6 months), made by Ada and deleted by Grace. */
function deleted() {
  let d = createReviewPolicy(seed(), act, { id: 'pol1', name: 'Standard' });
  d = updateReviewPolicy(d, act, { id: 'pol1', receptor: 'personnel', band: 'Serious', months: '6', unit: 'months' });
  return deleteReviewPolicy(d, later, { id: 'pol1' });
}

test('a deleted review policy is listed in Deletion history, with who made and deleted it', () => {
  const d = deleted();
  const [x] = infoDeletions(d);
  assert.deepEqual([x.kind, x.recordId, x.name, x.by, x.createdBy, x.restored], ['reviewPolicy', 'pol1', 'Standard', 'u2', 'u1', null]);
  const out = historyDeletionsView(state, d).toString();
  assert.match(out, /<span class="tag">Reviews<\/span> Review policy: Standard/);
  assert.match(out, new RegExp(`data-action="restoreDeletion" data-entry-id="${x.id}">Restore`));
});

test('restoring brings the policy back as it was, and is refused while another policy has its name', () => {
  const d = deleted();
  const id = infoDeletions(d)[0].id;
  const back = restoreDeletion(d, act, { entryId: id });
  assert.equal(back.records.reviewPolicy.pol1.status, 'live');
  assert.equal(back.records.reviewPolicy.pol1.receptors.personnel.periods.Serious, 6);
  assert.equal(infoDeletions(back)[0].restored?.by, 'u1');
  const clash = createReviewPolicy(d, act, { id: 'pol2', name: 'standard' });
  assert.throws(() => restoreDeletion(clash, act, { entryId: id }), (e) => e instanceof PivotError && e.code === 'restore.duplicate');
});
