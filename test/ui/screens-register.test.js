import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hazardsView, hazardView } from '../../src/ui/screens/hazards.js';
import { controlsView, controlView } from '../../src/ui/screens/controls.js';
import { initialState } from '../../src/ui/controller.js';
import { assignHazardNumbers, retireHazard } from '../../src/core/ops/hazards.js';
import { confirmControl } from '../../src/core/ops/assessment.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }], profileId: 'u1' };
const data = () => confirmControl(assignHazardNumbers(seed()), act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });

test('the hazard list: one row per hazard per platform, filters, and an add form', () => {
  const out = hazardsView(state, data()).toString();
  assert.match(out, /<form data-action="createHazard"/);
  assert.match(out, /data-change="setFilter" data-list="hazards"/);
  assert.equal((out.match(/data-view="hazard" data-id="h1"/g) || []).length, 2, 'h1 is on two platforms');
  assert.match(out, /H-0002/);
});

test('the hazard list honours the status filter', () => {
  const d = retireHazard(data(), act, { id: 'h2' });
  const out = hazardsView({ ...state, filters: { hazards: { status: 'retired' }, controls: {} } }, d).toString();
  assert.match(out, /H-0002/);
  assert.doesNotMatch(out, /H-0001/);
});

test('a hazard\'s page: editable fields, causal factors, consequences, controls, platforms, history, and the shared note', () => {
  const out = hazardView(state, data(), 'h1').toString();
  assert.match(out, /<form data-action="updateHazard" data-id="h1"/);
  assert.match(out, /value="Hot works"/);
  assert.match(out, /data-action="addConsequence" data-hazard-id="h1"/);
  assert.match(out, /Sprinklers/);
  assert.match(out, /data-change="setControlKind"/);
  assert.match(out, /data-view="assessment" data-hazard-id="h1" data-platform-id="p1"/);
  assert.match(out, /Changes to this hazard reach 2 platforms: Alpha, Bravo/);
  assert.match(out, /History \(\d+\)/);
  assert.match(out, /data-action="deleteHazard"/);
});

test('the control library and a control\'s page show where it is used and its state on each platform', () => {
  const list = controlsView({ ...state, filters: { hazards: {}, controls: { controlState: 'confirmed' } } }, data()).toString();
  assert.match(list, /<form data-action="createControl"/);
  assert.match(list, /Sprinklers/);
  assert.doesNotMatch(list, /Fire drills/, 'filtered to confirmed');
  const page = controlView(state, data(), 'c1').toString();
  assert.match(page, /<form data-action="updateControl" data-id="c1"/);
  assert.match(page, /state-confirmed/);
  assert.match(page, /state-awaiting/);
  assert.match(page, /data-action="retireControl"/);
});

test('an unknown id shows a not-found note, not a crash', () => {
  assert.match(hazardView(state, data(), 'nope').toString(), /no longer exists/);
  assert.match(controlView(state, data(), 'nope').toString(), /no longer exists/);
});

test('a control used on several platforms says which ones its changes reach', () => {
  assert.match(controlView(state, data(), 'c1').toString(), /Changes to this control reach 2 platforms: Alpha, Bravo/);
});
