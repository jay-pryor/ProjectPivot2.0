import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hazardsView, hazardView } from '../../src/ui/screens/hazards.js';
import { controlsView } from '../../src/ui/screens/controls.js';
import { platformsView, platformView } from '../../src/ui/screens/platforms.js';
import { pickerView } from '../../src/ui/screens/picker.js';
import { historyTable } from '../../src/ui/screens/common.js';
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
  assert.match(controls, /C-0001/);
  assert.match(controls, /data-action="startEdit" data-kind="newControl"/);
  const platforms = platformsView(state, data()).toString();
  assert.match(platforms, /P-0001/);
  assert.doesNotMatch(platforms, /<form data-action="createPlatform"/, 'no form until + is pressed');
  const adding = platformsView({ ...state, editing: { kind: 'newPlatform', id: 'new' } }, data()).toString();
  assert.match(adding, /<form data-action="createPlatform"[\s\S]*?name="name"[^>]*autofocus/);
});

test('a platform page: report IDs as text, changed by double-click; ratings and control states as dropdowns in the tables', () => {
  const out = platformView(state, data(), 'p1').toString();
  assert.match(out, /P-0001/);
  assert.doesNotMatch(out, />Set</);
  assert.doesNotMatch(out, /Assess/);
  assert.match(out, /data-dblclick="startEdit" data-kind="reportId" data-id="h1"[^>]*>H-0001</);
  assert.match(out, /<select[^>]*data-change="setRatingCell" data-hazard-id="h1" data-platform-id="p1" data-stage="residual"[\s\S]*?<option value="2C" selected>/);
  assert.match(out, /data-change="setRatingCell"[^>]*data-stage="initial"/);
  assert.match(out, /data-table="platformControls"/);
  assert.match(out, /data-change="setControlState" data-hazard-id="h1" data-control-id="c2" data-platform-id="p1"[\s\S]*?<option value="rejected" selected>/);
  assert.match(out, /No crew/);
  assert.match(out, /data-action="openPicker" data-picker="linkHazards" data-platform-id="p1"/);
});

test('editing in place: a report ID, and the reason when a control is set to excluded', () => {
  const rid = platformView({ ...state, editing: { kind: 'reportId', id: 'h1' } }, data(), 'p1').toString();
  assert.match(rid, /<input class="cell-edit" name="reportId" value="" placeholder="H-0001"[^>]*data-change="setReportId" data-hazard-id="h1" data-platform-id="p1"/);
  const why = platformView({ ...state, editing: { kind: 'rejection', id: 'h1|c1|p1' } }, data(), 'p1').toString();
  assert.match(why, /name="reason"[^>]*data-change="rejectControl" data-hazard-id="h1" data-control-id="c1" data-platform-id="p1"/);
});

test('a hazard page reads like a report: the title and description are the document, + buttons add rows and link controls', () => {
  const out = hazardView(state, data(), 'h1').toString();
  assert.match(out, /<input class="doc-title" name="title" value="Fire"/);
  assert.match(out, /<textarea class="doc-text" name="description"[^>]*placeholder="Add a description…"/);
  assert.match(out, /data-action="startEdit" data-kind="newCausalFactor" data-id="h1"/);
  assert.match(out, /data-action="openPicker" data-picker="linkControls" data-hazard-id="h1"/);
  assert.doesNotMatch(out, /<select name="controlId"/, 'no dropdown-and-button link form');
  assert.match(out, /data-dblclick="startEdit" data-kind="causalFactor" data-id="cf1"/);
  const adding = hazardView({ ...state, editing: { kind: 'newCausalFactor', id: 'h1' } }, data(), 'h1').toString();
  assert.match(adding, /<form data-action="addCausalFactor" data-hazard-id="h1"[\s\S]*?autofocus/);
  assert.doesNotMatch(out, /On (one|\d+) platform/, 'the platforms table says where it is used');
  assert.match(out, /<section class="block">[\s\S]*?data-table="causalFactor"/);
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
