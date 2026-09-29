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

test('the hazard list: one row per hazard, its platforms with their risk, filters in the header, and an add form', () => {
  const out = hazardsView(state, data()).toString();
  assert.match(out, /<form data-action="createHazard"/);
  assert.equal((out.match(/<tr data-row="h1"/g) || []).length, 1, 'h1 appears once though it is on two platforms');
  assert.match(out, /Alpha[^<]*<span class="band band-uncategorised">/);
  assert.match(out, /data-change="filterTable" data-table="hazards" data-key="platforms"/);
  assert.match(out, /data-change="filterTable" data-table="hazards" data-key="risk"/);
  assert.match(out, /data-input="filterTable" data-table="hazards" data-key="title"/);
  assert.doesNotMatch(out, /data-change="setFilter"/, 'no separate filter bar');
});

test('the hazard list filters: status (live by default), platform, and risk on that platform', () => {
  const d = retireHazard(data(), act, { id: 'h2' });
  const withFilters = (filters) => hazardsView({ ...state, tables: { hazards: { filters } } }, d).toString();
  assert.doesNotMatch(withFilters({}), /data-row="h2"/);
  assert.match(withFilters({ status: 'retired' }), /data-row="h2"/);
  assert.match(withFilters({ platforms: 'p1' }), /data-row="h1"/);
  assert.doesNotMatch(withFilters({ risk: 'Serious' }), /data-row="h1"/, 'no rating entered yet');
});

test('a hazard\'s page: fields, causal factors and consequences as table rows, controls, platforms, history, and the shared note', () => {
  const out = hazardView(state, data(), 'h1').toString();
  assert.match(out, /<form data-action="updateHazard" data-id="h1"/);
  assert.match(out, /<tr data-row="cf1"><td>Hot works<\/td>/);
  assert.match(out, /data-action="startEdit" data-kind="causalFactor" data-id="cf1"/);
  assert.doesNotMatch(out, /value="Hot works"/, 'not an input box until edited');
  assert.match(out, /data-action="addConsequence" data-hazard-id="h1"/);
  assert.match(out, /Sprinklers/);
  assert.match(out, /data-change="setControlKind"/);
  assert.match(out, /data-view="assessment" data-hazard-id="h1" data-platform-id="p1"/);
  assert.match(out, /Changes to this hazard reach 2 platforms: Alpha, Bravo/);
  assert.match(out, /History \(\d+\)/);
  assert.match(out, /data-action="deleteHazard"/);
});

test('a row being edited becomes a form in place, with save and cancel', () => {
  const out = hazardView({ ...state, editing: { kind: 'causalFactor', id: 'cf1' } }, data(), 'h1').toString();
  assert.match(out, /<form data-action="updateCausalFactor" data-id="cf1"[^>]*>[\s\S]*?value="Hot works"/);
  assert.match(out, /data-action="cancelEdit"/);
});

test('the control library and a control\'s page show where it is used and its state on each platform', () => {
  const list = controlsView({ ...state, tables: { controls: { filters: { state: 'confirmed' } } } }, data()).toString();
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
