import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phasesView } from '../../src/ui/screens/phases.js';
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

test('the Phases page lists phases with their use, renames in place, retires, restores, and deletes only unused ones', () => {
  const out = phasesView(state, data()).toString();
  assert.match(out, /<h1>Lifecycle phases<\/h1>/);
  assert.match(out, /data-table="phases"/);
  assert.match(out, /data-row="ph2"[\s\S]*?Operation[\s\S]*?1 hazard[\s\S]*?data-action="retirePhase" data-id="ph2"/);
  assert.match(out, /data-row="ph1"[\s\S]*?retired[\s\S]*?data-action="restoreRecord" data-kind="phase" data-id="ph1"/);
  assert.match(out, /data-row="ph3"[\s\S]*?data-action="deletePhase" data-id="ph3"/);
  assert.doesNotMatch(out.slice(out.indexOf('data-row="ph2"'), out.indexOf('data-row="ph3"')), /deletePhase/, 'in use: no delete');
  assert.match(out, /&lt;Test&gt;/);
  const renaming = phasesView({ ...state, editing: { kind: 'phaseName', id: 'ph3' } }, data()).toString();
  assert.match(renaming, /<input class="cell-edit" name="name" value="Disposal"[^>]*data-change="renamePhase" data-id="ph3"/);
});

test('the nav has Phases', () => {
  assert.match(shell({ ...state, view: { name: 'phases' } }, html``).toString(), /class="nav on" data-action="go" data-view="phases">Phases</);
});

test('the hazard page shows its phases as chips, a retired one tagged, with + to add and ✕ to remove, on the Overview and on each platform tab', () => {
  for (const tab of [undefined, 'p:p1']) {
    const out = hazardView({ ...state, view: { name: 'hazard', id: 'h1', tab } }, data(), 'h1').toString();
    assert.match(out, /class="phases"[\s\S]*?Lifecycle phases[\s\S]*?Design <span class="tag tag-retired">retired<\/span>[\s\S]*?Operation/);
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
