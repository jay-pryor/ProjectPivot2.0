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

test('Policies: adding a policy sits in the top part, a plain small button; the policies are a menu below the thick line', () => {
  const out = reviewsView(state, data()).toString();
  assert.match(out, /<div class="policy-top">\s*<h3 class="policy-top-h">New policy<\/h3>\s*<form data-action="newReviewPolicy" class="new-policy">[\s\S]*?<button type="submit" class="small">Add policy<\/button><\/form>\s*<\/div>\s*<div class="rail-layout">/);
  assert.doesNotMatch(out, /A review policy sets how often/, 'no explanation up top');
  assert.doesNotMatch(out, /class="primary"[^>]*>Add policy/);
  assert.match(out, /<nav class="rail" aria-label="Policies">[\s\S]*?data-action="showSection" data-page="reviewPolicies" data-section="pol1">[\s\S]*?Standard[\s\S]*?data-section="pol2">[\s\S]*?Light/);
});

test('the first policy is open as a band by receptor grid, with no longest period', () => {
  const out = reviewsView(state, data()).toString();
  assert.match(out, /class="rail-item on"[^>]*data-section="pol1"/);
  assert.match(out, /<table class="policy-grid">[\s\S]*Personnel[\s\S]*Environment[\s\S]*Capability/);
  assert.match(out, /name="value" value="6"[^>]*data-change="setPolicyCell" data-id="pol1" data-receptor="personnel" data-band="Serious"/);
  assert.match(out, /name="value" value="3"[^>]*data-band="Medium"[^>]*>\s*<select[^>]*>[\s\S]*?<option value="years" selected>/);
  assert.match(out, /<input type="checkbox" name="considered" data-change="updateReviewPolicy" data-id="pol1" data-receptor="capability">/, 'capability unticked');
  assert.doesNotMatch(out, /[Ll]ongest/);
  assert.match(out, /Used by[\s\S]*Alpha/);
  assert.match(out, /<button type="button" class="danger" data-action="removeReviewPolicy" data-id="pol1" disabled/, 'a policy in use cannot be deleted');
});

test('another policy opens when chosen from the menu, and an unused one can be deleted', () => {
  const out = reviewsView({ ...state, sections: { reviewPolicies: 'pol2' } }, data()).toString();
  assert.match(out, /class="rail-item on"[^>]*data-section="pol2"/);
  assert.match(out, /value="Light"[^>]*data-change="renameReviewPolicy" data-id="pol2"/);
  assert.match(out, /<button type="button" class="danger" data-action="removeReviewPolicy" data-id="pol2">Delete policy/);
  assert.match(out, /Used by <span class="muted">no platforms<\/span>/);
});

test('a unit chosen on an empty cell is shown until a number is typed', () => {
  const out = reviewsView({ ...state, policyUnits: { 'pol1|personnel|High': 'years' } }, data()).toString();
  assert.match(out, /name="value" value=""[^>]*data-band="High"[^>]*>\s*<select[^>]*data-band="High"[^>]*>[\s\S]*?<option value="years" selected>/);
});

test('with no policies, the top part offers to add one', () => {
  const out = reviewsView(state, seed()).toString();
  assert.match(out, /<h3 class="policy-top-h">New policy<\/h3>/);
  assert.match(out, /<form data-action="newReviewPolicy" class="new-policy">/);
  assert.match(out, /No review policies yet/);
});
