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
  assert.match(adding, /other platforms<\/p>[\s\S]*?<label class="suggest-item"><input type="checkbox" name="pick" value="Fuel leak"><span class="suggest-text">Fuel leak<\/span><span class="suggest-from">Alpha<\/span><\/label>/, 'Alpha\'s own, offered here to tick');
  const form = adding.slice(adding.indexOf('<form data-action="addCausalFactor"'), adding.indexOf('</form>', adding.indexOf('<form data-action="addCausalFactor"')));
  assert.match(form, /data-picks[\s\S]*name="pick"/, 'the ticks are in the form, so Add takes them with the box');
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

test('a status reads the same whoever implements the control: Recommended, Planned, Implemented, Rejected', async () => {
  const { platformView } = await import('../../src/ui/screens/platforms.js');
  const { setImplementedBy } = await import('../../src/core/ops/controls.js');
  let d = setImplementedBy(data(), act, { controlId: 'c1', platformId: 'p1', implementedBy: 'customer' });
  d = setImplementedBy(d, act, { controlId: 'c2', platformId: 'p1', implementedBy: 'highcom' });
  d = setImplementedBy(d, act, { controlId: 'c1', platformId: 'p2', implementedBy: 'oem' });
  const out = platformView({ ...state, sections: { platform: 'controls' } }, d, 'p1').toString();
  const select = (html, title) => html.slice(html.indexOf(`aria-label="Status of ${title}"`)).split('</select>')[0];
  const plain = /<option value="recommended" selected>Recommended<\/option><option value="planned">Planned<\/option><option value="implemented">Implemented<\/option><option value="rejected">Rejected<\/option>/;
  assert.match(select(out, 'Sprinklers'), plain, 'the customer');
  assert.match(select(out, 'Fire drills'), plain, 'HighCom: Recommended still offered');
  const bravo = platformView({ ...state, sections: { platform: 'controls' } }, d, 'p2').toString();
  assert.match(select(bravo, 'Sprinklers'), plain, 'the OEM');
  assert.match(out, /aria-label="Who implements Sprinklers on Alpha" data-change="setImplementedBy" data-control-id="c1" data-platform-id="p1">[\s\S]*?<option value="customer" selected>Customer<\/option>/);
  assert.match(out, /aria-label="Tier of Sprinklers" data-change="updateControl" data-id="c1"/);
  assert.match(out, /aria-label="Kind of Sprinklers"[^>]*data-change="setControlKind" data-hazard-id="h1" data-control-id="c1"/);
});

test('the Controls page is one list of every control, with an Origin for each, and no sub-tabs', async () => {
  const { controlsView } = await import('../../src/ui/screens/controls.js');
  const { createControl, updateControl } = await import('../../src/core/ops/controls.js');
  let d = assignNumbers(createControl(data(), act, { id: 'e1', title: 'Fire wall' }));
  d = updateControl(d, act, { id: 'e1', origin: 'Original build' });
  const out = controlsView({ ...state, view: { name: 'controls' } }, d).toString();
  assert.doesNotMatch(out, /<nav class="tabs">|data-tab="(additional|existing)"|copyControlAs|Create as/);
  assert.match(out, /C-001[\s\S]*?Sprinklers/);
  assert.match(out, /C-003[\s\S]*?Fire wall/, 'numbered in the one C- sequence');
  assert.doesNotMatch(out, /EC-/);
  assert.match(out, /<h1>Controls<\/h1><button type="button" class="plus" data-action="newControl" title="New control"/);
  assert.match(out, /<th data-col="origin">/);
  assert.match(out, /<input class="cell-input" name="origin" list="control-origins"[^>]*value="Original build" data-change="updateControl" data-id="e1">/);
  assert.match(out, /<input class="cell-input" name="origin" list="control-origins"[^>]*value="" data-change="updateControl" data-id="c1">/, 'any control can have an origin');
  assert.match(out, /<datalist id="control-origins"><option value="Original build"><\/option><\/datalist>/);
});

test('Home: a quiet count of the team\'s open items above the owner\'s tiles, and a tile for controls to implement', async () => {
  const { homeView } = await import('../../src/ui/screens/home.js');
  const out = homeView(state, data()).toString();
  assert.match(out, /<p class="team-line">Across the team: <b>\d+<\/b> open items<\/p>\s*<div class="tiles">/);
  assert.match(out, /<span>controls to implement<\/span>/);
});

test('the link-to-hazards picker offers a control the hazards it is not linked to, each with its kind', async () => {
  const { pickerView } = await import('../../src/ui/screens/picker.js');
  const { createControl } = await import('../../src/core/ops/controls.js');
  const d = createControl(data(), act, { id: 'e1', title: 'Fire wall' });
  const linked = pickerView({ ...state, picker: { picker: 'controlHazards', controlId: 'c1' } }, d).toString();
  assert.match(linked, /<form data-action="linkControlToHazards" data-control-id="c1"/);
  assert.match(linked, /value="h2"[\s\S]*?name="kind:h2"/);
  assert.doesNotMatch(linked, /value="h1"/, 'already linked');
  const fresh = pickerView({ ...state, picker: { picker: 'controlHazards', controlId: 'e1' } }, d).toString();
  assert.match(fresh, /<form data-action="linkControlToHazards" data-control-id="e1"/);
  assert.match(fresh, /value="h1"[\s\S]*?value="h2"/);
  assert.doesNotMatch(fresh, /placeExistingControl|h1\|p1/);
});

test('the Controls list puts each row\'s Options in a gutter outside the table, as Lifecycle phases does', async () => {
  const { controlsView } = await import('../../src/ui/screens/controls.js');
  const out = controlsView({ ...state, view: { name: 'controls' } }, data()).toString();
  assert.match(out, /<table class="grid has-gutter" data-table="controls"/);
  assert.match(out, /<th data-col="options" class="row-out">/);
  assert.match(out, /<td>live<\/td><td class="row-out"><details class="row-menu"><summary aria-label="Options for Sprinklers"/);
});

test('a control\'s and a reference\'s Retire and Delete are in the ⋯ menu by the heading; Delete asks in a pop-up, and only when nothing uses it', async () => {
  const { controlView } = await import('../../src/ui/screens/controls.js');
  const { referenceView } = await import('../../src/ui/screens/references.js');
  const { createControl } = await import('../../src/core/ops/controls.js');
  const { createReference } = await import('../../src/core/ops/references.js');
  let d = createControl(data(), act, { id: 'c9', title: 'Spare' });
  d = createReference(d, act, { id: 'r1', title: 'Manual', url: 'https://example.com/manual' });
  const spare = controlView({ ...state, view: { name: 'control', id: 'c9' } }, d, 'c9').toString();
  assert.match(spare, /<div class="doc-head">[\s\S]*?<details class="dots-menu doc-menu"><summary aria-label="Control options"[\s\S]*?data-action="retireControl" data-id="c9">[\s\S]*?class="danger-item" data-action="askConfirm" data-run="deleteControl" data-id="c9" data-title="Delete Spare\?"/);
  assert.doesNotMatch(spare, /page-actions/);
  assert.doesNotMatch(controlView({ ...state, view: { name: 'control', id: 'c1' } }, d, 'c1').toString(), /deleteControl/, 'in use: no Delete');
  const ref = referenceView({ ...state, view: { name: 'reference', id: 'r1' } }, d, 'r1').toString();
  assert.match(ref, /aria-label="Reference options"[\s\S]*?data-action="retireReference"[\s\S]*?data-run="deleteReference" data-id="r1"/);
});
