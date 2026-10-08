import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewsView } from '../../src/ui/screens/reviews.js';
import { createReviewPolicy, updateReviewPolicy, setRule } from '../../src/core/ops/reviews.js';
import { state as base } from './screens-reviews-tab.test.js';
import { seed, act } from '../helpers.js';

const state = { ...base, view: { name: 'reviews', tab: 'policies' } };
/** Standard: personnel Serious 6 months, Medium 3 years; capability left out; used by Alpha. Light: unused. */
function data() {
  let d = createReviewPolicy(seed(), act, { id: 'pol1', name: 'Standard' });
  d = updateReviewPolicy(d, act, { id: 'pol1', receptor: 'personnel', band: 'Serious', months: '6', unit: 'months' });
  d = updateReviewPolicy(d, act, { id: 'pol1', receptor: 'personnel', band: 'Medium', months: '3', unit: 'years' });
  d = updateReviewPolicy(d, act, { id: 'pol1', receptor: 'capability', considered: false });
  d = createReviewPolicy(d, act, { id: 'pol2', name: 'Light' });
  return setRule(d, act, { platformId: 'p1', kind: 'policy', policyId: 'pol1', start: '2026-01-01' });
}

test('Policies lists the policies and opens the first as a band by receptor grid', () => {
  const out = reviewsView(state, data()).toString();
  assert.match(out, /data-action="go" data-view="reviews" data-tab="policies" data-id="pol1"[^>]*>Standard/);
  assert.match(out, /data-id="pol2"[^>]*>Light/);
  assert.match(out, /<table class="policy-grid">[\s\S]*Personnel[\s\S]*Environment[\s\S]*Capability/);
  assert.match(out, /name="value" value="6"[^>]*data-change="setPolicyCell" data-id="pol1" data-receptor="personnel" data-band="Serious"/);
  assert.match(out, /name="value" value="3"[^>]*data-band="Medium"[^>]*>\s*<select[^>]*>[\s\S]*?<option value="years" selected>/);
  assert.match(out, /<input type="checkbox" name="considered" data-change="updateReviewPolicy" data-id="pol1" data-receptor="capability">/, 'capability unticked');
  assert.match(out, /<input type="checkbox" name="considered" checked data-change="updateReviewPolicy" data-id="pol1" data-receptor="personnel">/);
  assert.match(out, /Longest period[\s\S]*?name="value" value="3"[^>]*data-change="setPolicyLongest"/);
  assert.match(out, /Used by[\s\S]*Alpha/);
  assert.match(out, /<button type="button" class="danger" data-action="removeReviewPolicy" data-id="pol1" disabled/, 'a policy in use cannot be deleted');
});

test('another policy opens when chosen, and an unused one can be deleted', () => {
  const out = reviewsView({ ...state, view: { ...state.view, id: 'pol2' } }, data()).toString();
  assert.match(out, /value="Light"[^>]*data-change="renameReviewPolicy" data-id="pol2"/);
  assert.match(out, /<button type="button" class="danger" data-action="removeReviewPolicy" data-id="pol2">Delete policy/);
  assert.match(out, /Used by <span class="muted">no platforms<\/span>/);
});

test('with no policies, Policies explains them and offers to make one', () => {
  const out = reviewsView(state, seed()).toString();
  assert.match(out, /shortest period any hazard gives/);
  assert.match(out, /<form data-action="newReviewPolicy"/);
});
