import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hazardsView, hazardView } from '../../src/ui/screens/hazards.js';
import { controlsView } from '../../src/ui/screens/controls.js';
import { platformsView, platformView } from '../../src/ui/screens/platforms.js';
import { pickerView } from '../../src/ui/screens/picker.js';
import { historyTable, backButton } from '../../src/ui/screens/common.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { confirmControl, excludeControl, setRating } from '../../src/core/ops/assessment.js';
import { addComment, historyOf, historyReaching } from '../../src/core/history.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }], profileId: 'u1' };
function data() {
  let d = assignNumbers(seed());
  d = confirmControl(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  d = excludeControl(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', reason: 'No crew' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 2, likelihood: 'C' });
  return d;
}

test('lists open with an ID column: hazards H-, controls C-, platforms P-; new records via a small + button', () => {
  assert.match(hazardsView(state, data()).toString(), /data-action="startEdit" data-kind="newHazard"/);
  const controls = controlsView(state, data()).toString();
  assert.match(controls, /<th data-col="id"/);
  assert.match(controls, /C-001/);
  assert.match(controls, /<h1>Controls<\/h1><button type="button" class="plus" data-action="newControl" title="New control"/);
  assert.doesNotMatch(controls, /data-category|<nav class="tabs">|Create as/, 'one kind of control: no sub-tabs');
  const platforms = platformsView(state, data()).toString();
  assert.match(platforms, /P-001/);
  assert.doesNotMatch(platforms, /<form data-action="createPlatform"/, 'no form until + is pressed');
  const adding = platformsView({ ...state, editing: { kind: 'newPlatform', id: 'new' } }, data()).toString();
  assert.match(adding, /<form data-action="createPlatform"[\s\S]*?name="name"[^>]*autofocus/);
});

test('Back names a numbered record\'s page by its own title, not the record\'s long name', () => {
  const d = data();
  const back = (prev) => backButton({ ...state, session: { base: d, working: d }, viewHistory: [prev] }).toString();
  assert.match(back({ name: 'control', id: 'c1' }), /title="Back to C-001 — Overview"[\s\S]*?<span class="back-to"> to C-001 — Overview<\/span>/);
  assert.doesNotMatch(back({ name: 'control', id: 'c1' }), /Sprinklers/);
  assert.match(back({ name: 'hazard', id: 'h1', tab: 'p:p1' }), /<span class="back-to"> to HAZ-001 — Alpha<\/span>/);
  assert.match(back({ name: 'controls' }), /<span class="back-to"> to Controls<\/span>/);
});

test('a platform page: report IDs as text, changed by double-click; calculated risk levels; control states as dropdowns', () => {
  const out = platformView(state, data(), 'p1').toString();
  assert.match(out, /P-001/);
  assert.doesNotMatch(out, />Set</);
  assert.doesNotMatch(out, /Assess/);
  assert.match(out, /data-dblclick="startEdit" data-kind="reportId" data-id="h1"[^>]*>HAZ-001</);
  assert.match(out, /<th data-col="residualPersonnel"[\s\S]*?<span class="band band-serious">2C Serious<\/span>/, 'levels are shown, calculated, not picked');
  assert.doesNotMatch(out, /setRatingCell/);
  const controls = platformView({ ...state, sections: { platform: 'controls' } }, data(), 'p1').toString();
  assert.match(controls, /data-table="platformControls"/);
  assert.match(controls, /data-change="setControlState" data-hazard-id="h1" data-control-id="c2" data-platform-id="p1"[\s\S]*?<option value="rejected" selected>/);
  assert.match(controls, /No crew/);
  assert.match(out, /data-action="openPicker" data-picker="linkHazards" data-platform-id="p1"/);
});

test('editing in place: a report ID, and the reason when a control is set to excluded', () => {
  const rid = platformView({ ...state, editing: { kind: 'reportId', id: 'h1' } }, data(), 'p1').toString();
  assert.match(rid, /<input class="cell-edit" name="reportId" value="" placeholder="HAZ-001"[^>]*data-change="setReportId" data-hazard-id="h1" data-platform-id="p1"/);
  const why = platformView({ ...state, sections: { platform: 'controls' }, editing: { kind: 'rejection', id: 'h1|c1|p1' } }, data(), 'p1').toString();
  assert.match(why, /name="reason"[^>]*data-change="rejectControl" data-hazard-id="h1" data-control-id="c1" data-platform-id="p1"/);
});

test('a hazard page reads like a report: the title and description are the document, + buttons add rows and link controls', () => {
  const out = hazardView(state, data(), 'h1').toString();
  const onAlpha = hazardView({ ...state, view: { name: 'hazard', id: 'h1', tab: 'p:p1' } }, data(), 'h1').toString();
  assert.match(out, /<input class="doc-title small" name="title" value="Fire"/);
  assert.match(out, /<textarea class="doc-text boxed" name="description"[^>]*placeholder="Add a description…"/);
  assert.match(onAlpha, /data-action="startEdit" data-kind="newCausalFactor" data-id="h1"/, 'causal factors are kept on each platform\'s tab');
  assert.doesNotMatch(out, /newCausalFactor/);
  assert.match(out, /data-action="openPicker" data-picker="linkControls" data-hazard-id="h1"/);
  assert.doesNotMatch(out, /<select name="controlId"/, 'no dropdown-and-button link form');
  assert.match(onAlpha, /data-dblclick="startEdit" data-kind="causalFactor" data-id="cf1"/);
  const adding = hazardView({ ...state, view: { name: 'hazard', id: 'h1', tab: 'p:p1' }, editing: { kind: 'newCausalFactor', id: 'h1' } }, data(), 'h1').toString();
  assert.match(adding, /<form data-action="addCausalFactor" data-hazard-id="h1"[\s\S]*?autofocus/);
  assert.doesNotMatch(out, /On (one|\d+) platform/, 'the platforms table says where it is used');
  assert.match(out, /<div class="dash-grid two">\s*<section class="dash-card nl-card" aria-label="Consequences">[\s\S]*?<span class="nl-num">1<\/span>[\s\S]*?aria-label="Lifecycle phases"/);
  assert.match(out, /class="dash-card plat-card"[\s\S]*?<span class="plat-count"><b>1<\/b> causal factor<\/span>/, 'each platform tile counts its causal factors');
});

test('records not yet numbered show a TBC badge in place of an ID', () => {
  const out = hazardsView(state, seed()).toString();
  assert.match(out, /<span class="tag tag-tbc"[^>]*>TBC<\/span>/);
  assert.doesNotMatch(out, />New</);
});

test('pickers: a list to tick, searchable, with a kind per control', () => {
  const d = data();
  const hz = pickerView({ ...state, picker: { picker: 'linkHazards', platformId: 'p1' } }, d).toString();
  assert.match(hz, /<form data-action="linkHazards" data-platform-id="p1"/);
  assert.match(hz, /<input type="checkbox" name="hazardId" value="h2"/);
  assert.doesNotMatch(hz, /value="h1"/, 'already on the platform');
  assert.match(hz, /data-filter-list/);
  assert.match(hz, /data-action="closePicker"/);
  const d2 = { ...d, records: { ...d.records, control: { ...d.records.control, c3: { ...d.records.control.c1, id: 'c3', title: 'Deluge' } } } };
  const ct = pickerView({ ...state, picker: { picker: 'linkControls', hazardId: 'h1' } }, d2).toString();
  assert.match(ct, /<input type="checkbox" name="controlId" value="c3"/);
  assert.match(ct, /<select name="kind:c3"/);
});

test('history comments: shown against their entry, added with a + in place', () => {
  let d = data();
  const entry = historyOf(d, 'hazard', 'h1')[0];
  d = addComment(d, act, { entryId: entry.id, text: 'Checked with Grace' });
  const out = historyTable(state, d, 'hazard', 'h1').toString();
  assert.match(out, /Checked with Grace/);
  assert.match(out, new RegExp(`data-action="startEdit" data-kind="comment" data-id="${entry.id}"`));
  const adding = historyTable({ ...state, editing: { kind: 'comment', id: entry.id } }, d, 'hazard', 'h1').toString();
  assert.match(adding, new RegExp(`<form data-action="addComment" data-entry-id="${entry.id}"`));
});

test('history shows a rating change as its matrix cell and band, not raw data', () => {
  let d = data();
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 3, likelihood: 'D' });
  const out = historyTable(state, d, 'platform', 'p1', historyReaching(d, 'p1')).toString();
  assert.doesNotMatch(out, /consequence&quot;|"consequence"/);
  assert.match(out, /Residual personnel[\s\S]*?consequence<\/strong>: 2 Critical → 3 Marginal[\s\S]*?likelihood<\/strong>: C Occasional → D Remote/);
  assert.match(out, /Residual environment/);
});
