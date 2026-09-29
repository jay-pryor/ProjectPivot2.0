import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformsView, platformView, assessmentView } from '../../src/ui/screens/platforms.js';
import { initialState } from '../../src/ui/controller.js';
import { assignHazardNumbers } from '../../src/core/ops/hazards.js';
import { confirmControl, excludeControl, setRating } from '../../src/core/ops/assessment.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }], profileId: 'u1' };
function data() {
  let d = assignHazardNumbers(seed());
  d = confirmControl(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  d = excludeControl(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', reason: 'No crew <aboard>' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 2, likelihood: 'C' });
  return d;
}

test('the platform list names each owner and offers a create form with an owner choice', () => {
  const out = platformsView(state, data()).toString();
  assert.match(out, /Alpha/);
  assert.match(out, /Grace/);
  assert.match(out, /<form data-action="createPlatform"/);
  assert.match(out, /<select name="ownerId"/);
});

test('a platform\'s page: its hazards with report IDs, risk and control states; link and unlink; owner', () => {
  const out = platformView(state, data(), 'p1').toString();
  assert.match(out, /data-action="setReportId" data-hazard-id="h1" data-platform-id="p1"/);
  assert.match(out, /placeholder="H-0001"/);
  assert.match(out, /band-serious/);
  assert.match(out, /state-confirmed/);
  assert.match(out, /state-excluded/);
  assert.match(out, /data-action="unlinkHazard"/);
  assert.match(out, /<form data-action="linkHazard" data-platform-id="p1"/);
  assert.match(out, /<option value="h2">H-0002 Flood<\/option>/);
  assert.match(out, /data-change="setOwner" data-id="p1"/);
});

test('the assessment: both ratings with their bands, and each control with confirm, exclude and reset', () => {
  const out = assessmentView(state, data(), 'h1', 'p1').toString();
  assert.match(out, /data-stage="initial"/);
  assert.match(out, /data-stage="residual"/);
  assert.match(out, /2C = Serious/);
  assert.match(out, /Uncategorised/);
  assert.match(out, /<option value="2" selected>2 Critical<\/option>/);
  assert.match(out, /No crew &lt;aboard&gt;/);
  assert.match(out, /by Ada/);
  assert.match(out, /data-action="excludeControl"/);
  assert.match(out, /data-action="resetControl"/);
});

test('an assessment of a hazard not on the platform shows a not-found note', () => {
  assert.match(assessmentView(state, data(), 'h2', 'p1').toString(), /not on this platform/);
});

test('the platform list filters by owner and status in its header', () => {
  const out = platformsView({ ...state, tables: { platforms: { filters: { owner: 'u2' } } } }, data()).toString();
  assert.match(out, /data-row="p2"/);
  assert.doesNotMatch(out, /data-row="p1"/);
  assert.match(out, /data-change="filterTable" data-table="platforms" data-key="owner"/);
});

test('a platform page: the name applies when left (no Rename), retire and delete at the bottom, History as a tab', () => {
  const out = platformView(state, data(), 'p1').toString();
  assert.doesNotMatch(out, />Rename</);
  assert.match(out, /<input name="name" value="Alpha" required[^>]*data-change="updatePlatform" data-id="p1"/);
  assert.ok(out.lastIndexOf('data-action="retirePlatform"') > out.lastIndexOf('</table>'));
  assert.match(out, /data-tab="history"/);
});
