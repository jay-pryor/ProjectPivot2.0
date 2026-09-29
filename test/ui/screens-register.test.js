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
  assert.match(out, /data-action="startEdit" data-kind="newHazard"/);
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



test('the control library and a control\'s page show where it is used and its state on each platform', () => {
  const list = controlsView({ ...state, tables: { controls: { filters: { state: 'confirmed' } } } }, data()).toString();
  assert.match(list, /data-action="startEdit" data-kind="newControl"/);
  assert.match(list, /Sprinklers/);
  assert.doesNotMatch(list, /Fire drills/, 'filtered to confirmed');
  const page = controlView(state, data(), 'c1').toString();
  assert.match(page, /data-change="updateControl" data-id="c1"/);
  assert.match(page, /state-confirmed/);
  assert.match(page, /state-awaiting/);
  assert.match(page, /data-action="retireControl"/);
});

test('an unknown id shows a not-found note, not a crash', () => {
  assert.match(hazardView(state, data(), 'nope').toString(), /no longer exists/);
  assert.match(controlView(state, data(), 'nope').toString(), /no longer exists/);
});

test('a control used on several platforms says which ones its changes reach', () => {
  assert.match(controlView(state, data(), 'c1').toString(), /Used on Alpha, Bravo\. Changes here reach all of them\./);
});

test('a hazard page: fields apply when left (no Apply), retire and delete at the bottom, no heading repeating a table\'s title', () => {
  const out = hazardView(state, data(), 'h1').toString();
  assert.doesNotMatch(out, />Apply</);
  assert.match(out, /<input class="doc-title" name="title" value="Fire" required[^>]*data-change="updateHazard" data-id="h1"/);
  assert.match(out, /<textarea class="doc-text" name="description"[^>]*data-change="updateHazard" data-id="h1"/);
  assert.doesNotMatch(out, /<h2>(Causal factors|Consequences|Controls|Platforms)<\/h2>/);
  assert.match(out, /data-action="sortTable" data-table="causalFactor" data-key="text"[^>]*>Causal factors/);
  assert.ok(out.lastIndexOf('data-action="retireHazard"') > out.lastIndexOf('</table>'), 'retire comes after the tables');
});

test('a hazard page has a History tab: a table of when, who, what and the fields changed', () => {
  const d = data();
  const details = hazardView(state, d, 'h1').toString();
  assert.match(details, /data-action="go" data-view="hazard" data-id="h1" data-tab="history"/);
  assert.doesNotMatch(details, /<details class="history"/);
  const hist = hazardView({ ...state, view: { name: 'hazard', id: 'h1', tab: 'history' } }, d, 'h1').toString();
  assert.match(hist, /data-table="history"/);
  assert.match(hist, /Create hazard/);
  assert.match(hist, /Ada/);
  assert.doesNotMatch(hist, /doc-text/, 'the history tab shows history, not the report');
});
