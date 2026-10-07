import { test } from 'node:test';
import assert from 'node:assert/strict';
import { infoView } from '../../src/ui/screens/info.js';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { pickerView } from '../../src/ui/screens/picker.js';
import { shell } from '../../src/ui/screens/common.js';
import { html } from '../../src/ui/html.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { createPhase, linkPhase, retirePhase } from '../../src/core/ops/phases.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };
/** Design (ticked on h1, then retired), Operation (ticked on h1), Disposal (unused), <Test> (unused, markup). */
function data() {
  let d = assignNumbers(seed());
  d = createPhase(d, act, { id: 'ph1', name: 'Design' });
  d = createPhase(d, act, { id: 'ph2', name: 'Operation' });
  d = createPhase(d, act, { id: 'ph3', name: 'Disposal' });
  d = createPhase(d, act, { id: 'ph4', name: '<Test>' });
  d = linkPhase(d, act, { hazardId: 'h1', phaseId: 'ph1' });
  d = linkPhase(d, act, { hazardId: 'h1', phaseId: 'ph2' });
  return retirePhase(d, act, { id: 'ph1' });
}

test('Info sets up Lifecycle phases like every other facet: add, rename, delete, its platform groups, hazards and platforms', () => {
  const page = infoView({ ...state, sections: { info: 'phase' } }, data()).toString();
  assert.match(page, /<h1>Info<\/h1>/);
  assert.match(page, /data-section="systemElement"[\s\S]*?data-section="phase"[\s\S]*?Lifecycle phases<\/span><span class="rail-badge">4<\/span>/);
  assert.match(page, /<h2>Lifecycle phases<\/h2><button type="button" class="plus" data-action="startEdit" data-kind="newFacetOption:phase" data-id="new"/);
  assert.doesNotMatch(page, /<p class="muted">/, 'no description under the heading');
  assert.match(page, /data-table="facet-phase"/);
  for (const col of ['pairs', 'controls', 'unrated', 'worst', 'status', 'options']) assert.doesNotMatch(page, new RegExp(`<th data-col="${col}"`), `no ${col} column`);
  assert.doesNotMatch(page, /row-menu|retirePhase/, 'no Options menu');
  // Operation: on h1, which is on Alpha and Bravo.
  assert.match(page, /data-row="ph2"[\s\S]*?Operation<\/span><\/div><\/td><td><span class="muted">—<\/span><\/td><td>1<\/td><td>2<\/td>/);
  assert.match(page, /data-row="ph2"[\s\S]*?data-action="askConfirm" data-run="deleteFacetOption" data-facet="phase" data-id="ph2" data-title="Delete Operation\?" data-text="It is ticked on one hazard and will come off it\. You can restore it from Deletion history/);
  assert.match(page, /&lt;Test&gt;/);
  const renaming = infoView({ ...state, sections: { info: 'phase' }, editing: { kind: 'facetOption', id: 'ph3' } }, data()).toString();
  assert.match(renaming, /<input class="cell-edit" name="name" value="Disposal"[^>]*data-change="renameFacetOption" data-facet="phase" data-id="ph3"/);
});

test('the nav has Info where Stats was, lit for Info', () => {
  for (const name of ['info']) assert.match(shell({ ...state, view: { name } }, html``).toString(), /data-view="bowties">Bow-ties<\/button><button type="button" class="nav on" data-action="go" data-view="info">Info<\/button>/);
  assert.doesNotMatch(shell(state, html``).toString(), />Stats</);
  assert.doesNotMatch(shell(state, html``).toString(), />Phases</);
});

test('the hazard page numbers its phases on a card, a retired one tagged, with + to add and ✕ to remove, on the Overview and on each platform tab', () => {
  for (const tab of [undefined, 'p:p1']) {
    const out = hazardView({ ...state, view: { name: 'hazard', id: 'h1', tab } }, data(), 'h1').toString();
    assert.match(out, /aria-label="Lifecycle phases">[\s\S]*?<span class="nl-num">1<\/span><span class="nl-text">Design <span class="tag tag-retired">retired<\/span>[\s\S]*?<span class="nl-num">2<\/span><span class="nl-text">Operation/);
    assert.match(out, /data-action="unlinkPhase" data-hazard-id="h1" data-phase-id="ph2"/);
    assert.match(out, /data-action="openPicker" data-picker="linkPhases" data-hazard-id="h1"/);
  }
});

test('the phase picker offers live phases not already ticked', () => {
  const out = pickerView({ ...state, picker: { picker: 'linkPhases', hazardId: 'h1' } }, data()).toString();
  assert.match(out, /<form data-action="linkPhases" data-hazard-id="h1"/);
  assert.match(out, /value="ph3"/);
  assert.doesNotMatch(out, /value="ph1"|value="ph2"/);
});
