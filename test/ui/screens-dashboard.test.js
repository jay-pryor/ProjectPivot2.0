import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers, addCausalFactor, addConsequence } from '../../src/core/ops/hazards.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };
const on = (tab, extra = {}) => ({ ...state, view: { name: 'hazard', id: 'h1', tab }, ...extra });
/** cf1 for every platform, cf2 for Alpha alone, cf3 for Bravo alone; two consequences. */
function data() {
  let d = assignNumbers(seed());
  d = addCausalFactor(d, act, { id: 'cf2', hazardId: 'h1', platformId: 'p1', text: 'Fuel leak' });
  d = addCausalFactor(d, act, { id: 'cf3', hazardId: 'h1', platformId: 'p2', text: 'Lightning' });
  return addConsequence(d, act, { id: 'cq2', hazardId: 'h1', text: 'Smoke' });
}

test('the Overview leaves causal factors to each platform\'s tab, counting them on its tile', () => {
  const out = hazardView(state, data(), 'h1').toString();
  assert.doesNotMatch(out, /aria-label="Causal factors"|Fuel leak|Lightning/);
  assert.match(out, /title="Open the SSRA for Alpha"[\s\S]*?<span class="plat-count"><b>2<\/b> causal factors<\/span>/, 'Hot works for all, Fuel leak for Alpha');
  assert.match(out, /title="Open the SSRA for Bravo"[\s\S]*?<span class="plat-count"><b>2<\/b> causal factors<\/span>/, 'Hot works for all, Lightning for Bravo');
  assert.match(out, /aria-label="Consequences">[\s\S]*?"nl-num">1<\/span>[\s\S]*?"nl-num">2<\/span>[\s\S]*?Smoke/);
  assert.doesNotMatch(out.slice(out.indexOf('aria-label="Consequences"')), /class="scope/, 'consequences are the hazard\'s');
});

test('a platform tab numbers only that platform\'s causal factors, and adds new ones for it', () => {
  const out = hazardView(on('p:p2'), data(), 'h1').toString();
  assert.match(out, /"nl-num">1<\/span>[\s\S]*?Hot works[\s\S]*?"nl-num">2<\/span>[\s\S]*?Lightning/);
  assert.doesNotMatch(out, /Fuel leak/);
  assert.doesNotMatch(out, /class="scope|setCausalFactorPlatform/, 'no platform dropdowns');
  const adding = hazardView(on('p:p2', { editing: { kind: 'newCausalFactor', id: 'h1' } }), data(), 'h1').toString();
  assert.match(adding, /<form data-action="addCausalFactor" data-hazard-id="h1"[^>]*>[\s\S]*?<input type="hidden" name="platformId" value="p2">/, 'a new one is Bravo\'s');
  assert.match(adding, /On this hazard's other platforms[\s\S]*?<button type="button" class="suggest-item" title="Add it here" data-action="addCausalFactor" data-hazard-id="h1" data-platform-id="p2" data-text="Fuel leak">[\s\S]*?Fuel leak[\s\S]*?<span class="suggest-from">Alpha<\/span>/, 'Alpha\'s own, offered here');
  assert.doesNotMatch(adding.slice(adding.indexOf('class="suggest"')), /Hot works|Lightning/, 'not what is here already');
});

test('a rail section is marked to play its opening once', () => {
  const out = hazardView(on('p:p1', { sections: { ssra: 'sfarp' } }), data(), 'h1').toString();
  assert.match(out, /<section class="rail-panel" data-reveal="ssra:sfarp" aria-label="SFARP"><h2>SFARP considerations<\/h2>/);
});

test('lists open a record on a double-click; the platform page tints its risk columns and counts hazards', async () => {
  const { hazardsView } = await import('../../src/ui/screens/hazards.js');
  const { controlsView } = await import('../../src/ui/screens/controls.js');
  const { platformsView, platformView } = await import('../../src/ui/screens/platforms.js');
  const d = data();
  assert.match(hazardsView(state, d).toString(), /<tr data-row="h1" data-dblclick="go" data-view="hazard" data-id="h1">/);
  assert.match(controlsView(state, d).toString(), /<tr data-row="c1" data-dblclick="go" data-view="control" data-id="c1">/);
  const list = platformsView(state, d).toString();
  assert.match(list, /<tr data-row="p1" data-dblclick="go" data-view="platform" data-id="p1">/);
  assert.match(list, />Hazard count</);
  const page = platformView(state, d, 'p1').toString();
  assert.match(page, /<th data-col="initialPersonnel" class="tint-initial">/);
  assert.match(page, /<td class="tint-residual"><span class="band/);
});

test('the Overview\'s unlink is a narrow centred ✕ that asks in a pop-up', async () => {
  const { confirmDialog } = await import('../../src/ui/screens/common.js');
  const out = hazardView(state, data(), 'h1').toString();
  assert.match(out, /<col data-col="actions" style="width:52px"/);
  assert.match(out, /<td class="col-act"><div class="row-actions"><button type="button" class="icon-x" title="Unlink Sprinklers"[^>]*data-action="askConfirm" data-run="unlinkControl" data-hazard-id="h1" data-control-id="c1"/);
  assert.doesNotMatch(out, /<th data-col="actions"[^>]*>[\s\S]*?data-resize[^>]*data-key="actions"/, 'no handle to drag');
  const dialog = confirmDialog({ confirm: { title: 'Unlink Sprinklers?', text: 'It goes.', action: { type: 'unlinkControl' } } }).toString();
  assert.match(dialog, /role="alertdialog"[\s\S]*?<h2>Unlink Sprinklers\?<\/h2><p>It goes\.<\/p>[\s\S]*?data-action="confirmContinue">Continue[\s\S]*?data-action="confirmCancel" autofocus>Cancel/);
});

test('a produced report can be deleted after a pop-up, and leaves the list', async () => {
  const { createReport, deleteReport } = await import('../../src/core/ops/reports.js');
  const { reportsView } = await import('../../src/ui/screens/reports.js');
  let d = createReport(data(), act, { id: 'rep1', report: { title: 'Alpha hazards', platformName: 'Alpha', producedAt: '2026-09-28T10:00:00+10:00' } });
  const listed = reportsView(state, d).toString();
  assert.match(listed, /<td class="col-act"><div class="row-actions"><button type="button" class="icon-x" title="Delete Alpha hazards"[^>]*data-action="askConfirm" data-run="deleteReport" data-id="rep1"/);
  d = deleteReport(d, act, { id: 'rep1' });
  assert.equal(d.records.report.rep1.status, 'deleted');
  assert.doesNotMatch(reportsView(state, d).toString(), /Alpha hazards/);
});

test('a phase\'s actions are in an Options menu that is always there', async () => {
  const { phasesView } = await import('../../src/ui/screens/phases.js');
  const { createPhase } = await import('../../src/core/ops/phases.js');
  const out = phasesView(state, createPhase(data(), act, { id: 'ph1', name: 'Design' })).toString();
  assert.match(out, /<table class="grid has-gutter" data-table="phases"/);
  assert.match(out, /<th data-col="options" class="row-out">/, 'a gutter beside the table, not a column in it');
  assert.match(out, /<td>live<\/td><td class="row-out"><details class="row-menu"><summary aria-label="Options for Design" title="Options for Design">Options <span aria-hidden="true">▾<\/span><\/summary><div class="row-menu-body"><button type="button" data-action="startEdit" data-kind="phaseName" data-id="ph1">Rename<\/button><button type="button" data-action="retirePhase" data-id="ph1">Retire<\/button><button type="button" class="danger" data-action="askConfirm" data-run="deletePhase" data-id="ph1"/);
  assert.doesNotMatch(out, /class="row-actions"/);
});

test('a status is worded for the control\'s owner on the platform: the customer\'s four, our three', async () => {
  const { platformView } = await import('../../src/ui/screens/platforms.js');
  const { setControlOwner } = await import('../../src/core/ops/controls.js');
  let d = setControlOwner(data(), act, { controlId: 'c1', platformId: 'p1', owner: 'customer' });
  d = setControlOwner(d, act, { controlId: 'c2', platformId: 'p1', owner: 'us' });
  const out = platformView({ ...state, sections: { platform: 'controls' } }, d, 'p1').toString();
  const select = (title) => out.slice(out.indexOf(`aria-label="Status of ${title}"`)).split('</select>')[0];
  assert.match(select('Sprinklers'), /<option value="recommended" selected>Recommended to customer<\/option><option value="planned">Planned by customer<\/option><option value="implemented">Implemented by customer<\/option><option value="rejected">Rejected by customer<\/option>/);
  assert.match(select('Fire drills'), /<option value="recommended" selected>Recommended<\/option><option value="planned">Planned<\/option><option value="implemented">Implemented<\/option><option value="rejected">Rejected<\/option>/, 'undecided still shows as Recommended');
  assert.match(out, /aria-label="Owner of Sprinklers on Alpha" data-change="setControlOwner" data-control-id="c1" data-platform-id="p1">[\s\S]*?<option value="customer" selected>/);
  assert.match(out, /aria-label="Tier of Sprinklers" data-change="updateControl" data-id="c1"/);
  assert.match(out, /aria-label="Kind of Sprinklers"[^>]*data-change="setControlKind" data-hazard-id="h1" data-control-id="c1"/);
});

test('the Controls page has Additional and Existing sub-tabs, each with its own list and Create as', async () => {
  const { controlsView } = await import('../../src/ui/screens/controls.js');
  const { createControl } = await import('../../src/core/ops/controls.js');
  const d = assignNumbers(createControl(data(), act, { id: 'e1', title: 'Fire wall', category: 'existing' }));
  const add = controlsView({ ...state, view: { name: 'controls' } }, d).toString();
  assert.match(add, /class="tab on" data-action="go" data-view="controls" data-tab="additional">Additional controls<\/button><button type="button" class="tab" data-action="go" data-view="controls" data-tab="existing">Existing controls/);
  assert.match(add, /Sprinklers/);
  assert.doesNotMatch(add, /Fire wall/);
  assert.match(add, /data-action="copyControlAs" data-from="c1" data-category="existing">Create as existing control/);
  const ex = controlsView({ ...state, view: { name: 'controls', tab: 'existing' } }, d).toString();
  assert.match(ex, /EC-001[\s\S]*?Fire wall/);
  assert.doesNotMatch(ex, /Sprinklers/);
  assert.match(ex, /data-action="copyControlAs" data-from="e1" data-category="additional">Create as additional control/);
  assert.match(ex, /<input type="hidden" name="category" value="existing">|data-kind="new-existing-control"/);
  assert.doesNotMatch(add, /data-col="origin"|control-origins/, 'additional controls have no origin');
  const { updateControl } = await import('../../src/core/ops/controls.js');
  const withOrigin = updateControl(d, act, { id: 'e1', origin: 'Original build' });
  const ex2 = controlsView({ ...state, view: { name: 'controls', tab: 'existing' } }, withOrigin).toString();
  assert.match(ex2, /<th data-col="origin">/);
  assert.match(ex2, /<input class="cell-input" name="origin" list="control-origins"[^>]*value="Original build" data-change="updateControl" data-id="e1">/);
  assert.match(ex2, /<datalist id="control-origins"><option value="Original build"><\/option><\/datalist>/);
});

test('Home: a quiet count of the team\'s open items above the owner\'s tiles, and a tile for controls to implement', async () => {
  const { homeView } = await import('../../src/ui/screens/home.js');
  const out = homeView(state, data()).toString();
  assert.match(out, /<p class="team-line">Across the team: <b>\d+<\/b> open items<\/p>\s*<div class="tiles">/);
  assert.match(out, /<span>controls to implement<\/span>/);
});

test('the link-to-hazards picker offers an additional control the hazards it is not on, an existing one each hazard on each platform', async () => {
  const { pickerView } = await import('../../src/ui/screens/picker.js');
  const { createControl } = await import('../../src/core/ops/controls.js');
  const d = createControl(data(), act, { id: 'e1', title: 'Fire wall', category: 'existing' });
  const add = pickerView({ ...state, picker: { picker: 'controlHazards', controlId: 'c1' } }, d).toString();
  assert.match(add, /<form data-action="linkControlToHazards" data-control-id="c1"/);
  assert.match(add, /value="h2"[\s\S]*?name="kind:h2"/);
  assert.doesNotMatch(add, /value="h1"/, 'already linked');
  const ex = pickerView({ ...state, picker: { picker: 'controlHazards', controlId: 'e1' } }, d).toString();
  assert.match(ex, /<form data-action="placeExistingControl" data-control-id="e1"/);
  assert.match(ex, /value="h1\|p1"[\s\S]*?on Alpha[\s\S]*?value="h1\|p2"[\s\S]*?on Bravo/);
});

test('the Controls list puts each row\'s Options in a gutter outside the table, as Lifecycle phases does', async () => {
  const { controlsView } = await import('../../src/ui/screens/controls.js');
  const out = controlsView({ ...state, view: { name: 'controls' } }, data()).toString();
  assert.match(out, /<table class="grid has-gutter" data-table="controls"/);
  assert.match(out, /<th data-col="options" class="row-out">/);
  assert.match(out, /<td>live<\/td><td class="row-out"><details class="row-menu"><summary aria-label="Options for Sprinklers"/);
});
