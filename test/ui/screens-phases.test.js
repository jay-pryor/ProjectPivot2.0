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

test('Stats opens on its Lifecycle phases sub-tab: phases with what they cover, renamed in place, retired, restored, deleted only when unused', () => {
  const out = phasesView(state, data()).toString();
  assert.match(out, /<h1>Stats<\/h1><\/div>\s*<nav class="tabs"><button type="button" class="tab on" data-action="go" data-view="stats" data-tab="phases">Lifecycle phases<\/button><\/nav>/);
  assert.match(out, /data-table="phases"/);
  for (const col of ['used', 'platforms', 'pairs', 'controls', 'unrated', 'worst']) assert.match(out, new RegExp(`<th data-col="${col}"`));
  // Operation: h1, on Alpha and Bravo, with two additional controls, unrated on both.
  assert.match(out, /data-row="ph2"[\s\S]*?Operation<\/span><\/td><td>1<\/td><td>2<\/td><td>2<\/td><td>2<\/td><td><span class="tag tag-warn">2<\/span><\/td><td><span class="band band-uncategorised">Uncategorised<\/span><\/td>[\s\S]*?data-action="retirePhase" data-id="ph2"/);
  assert.match(out, /data-row="ph3"[\s\S]*?Disposal<\/span><\/td><td>0<\/td>[\s\S]*?<span class="muted">—<\/span>/, 'unused: nothing to rate');
  assert.match(out, /data-row="ph1"[\s\S]*?retired[\s\S]*?data-action="restoreRecord" data-kind="phase" data-id="ph1"/);
  assert.match(out, /data-row="ph3"[\s\S]*?data-action="askConfirm" data-run="deletePhase" data-id="ph3"/);
  assert.doesNotMatch(out.slice(out.indexOf('data-row="ph2"'), out.indexOf('data-row="ph3"')), /deletePhase/, 'in use: no delete');
  assert.match(out, /&lt;Test&gt;/);
  const renaming = phasesView({ ...state, editing: { kind: 'phaseName', id: 'ph3' } }, data()).toString();
  assert.match(renaming, /<input class="cell-edit" name="name" value="Disposal"[^>]*data-change="renamePhase" data-id="ph3"/);
});

test('the nav has Stats where Phases was, lit for Stats and its phases', () => {
  for (const name of ['stats', 'phases']) assert.match(shell({ ...state, view: { name } }, html``).toString(), /data-view="bowties">Bow-ties<\/button><button type="button" class="nav on" data-action="go" data-view="stats">Stats<\/button>/);
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
