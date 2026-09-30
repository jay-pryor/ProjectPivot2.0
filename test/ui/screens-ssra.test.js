import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { setAssessment, setSfarp, setControlStatus } from '../../src/core/ops/assessment.js';
import { setControlAnalysis, linkExistingControl, updateControl, retireControl, createControl } from '../../src/core/ops/controls.js';
import { pickerView } from '../../src/ui/screens/picker.js';
import { createSafetyReport } from '../../src/core/ops/safety-reports.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }] };
const on = (tab) => ({ ...state, view: { name: 'hazard', id: 'h1', tab } });
/** h1 on p1 (Alpha) and p2 (Bravo); Alpha residual: personnel 4D, environment 2C; an initial personnel likelihood with a justification; SFARP written. */
function data(why = 'Seen twice a year') {
  let d = assignNumbers(seed());
  d = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'personnel', consequence: 4, likelihood: 'D' });
  d = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'environment', consequence: 2, likelihood: 'C' });
  d = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihood: 'C', likelihoodWhy: why });
  return setSfarp(d, act, { hazardId: 'h1', platformId: 'p1', conclusion: 'Risk is SFARP' });
}

test('the hazard page has an Overview tab, a tab per platform (with its worst residual), and History', () => {
  const out = hazardView(state, data(), 'h1').toString();
  assert.match(out, /<nav class="tabs">[\s\S]*?>Overview<\/button>/);
  assert.match(out, /data-tab="p:p1">Alpha <span class="band band-serious">Serious<\/span>/);
  assert.match(out, /data-tab="p:p2">Bravo/);
  assert.match(out, /History \(/);
  assert.match(out, /data-table="hazardPlatforms"[\s\S]*?<th data-col="personnel"[\s\S]*?<th data-col="environment"/, 'Overview: residual personnel and environment per platform');
  assert.match(out, /data-action="go" data-view="hazard" data-id="h1" data-tab="p:p1"/, 'each platform row opens its tab');
});

test('a platform tab reads like the SSRA: shared overview, references, initial risk, residual risk, SFARP', () => {
  const out = hazardView(on('p:p1'), data(), 'h1').toString();
  const order = ['Overview', 'References', 'Initial risk', 'Residual risk', 'SFARP considerations'].map((h) => out.indexOf(`<h2>${h}`));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), `sections in SSRA order: ${order}`);
  assert.match(out, /class="shared-mark">Shared across platforms/);
  assert.match(out, /<textarea class="doc-text" name="description"[^>]*data-change="updateHazard"/);
  assert.match(out, /data-table="causalFactor"/);
});

test('risk panels: personnel and environment side by side, each with likelihood, consequence, justifications and the level', () => {
  const out = hazardView(on('p:p1'), data(), 'h1').toString();
  assert.match(out, /<select name="likelihood" aria-label="Initial personnel likelihood" data-change="setAssessment" data-hazard-id="h1" data-platform-id="p1" data-stage="initial" data-receptor="personnel">[\s\S]*?<option value="C" selected>C · Occasional<\/option>/);
  assert.match(out, /<textarea name="likelihoodWhy"[^>]*data-change="setAssessment" data-hazard-id="h1" data-platform-id="p1" data-stage="initial" data-receptor="personnel">Seen twice a year<\/textarea>/);
  assert.match(out, /<select name="consequence" aria-label="Residual environment consequence"[\s\S]*?<option value="2" selected>2 · Critical<\/option>/);
  assert.match(out, /Residual risk[\s\S]*?Personnel[\s\S]*?<span class="band band-low">4D Low<\/span>[\s\S]*?Environment[\s\S]*?<span class="band band-serious">2C Serious<\/span>/);
  assert.match(out, /Initial risk[\s\S]*?<span class="band band-uncategorised">Not yet assessed<\/span>/, 'a likelihood alone has no level');
});

test('SFARP considerations, and text shown literally', () => {
  const out = hazardView(on('p:p1'), data('<b>x</b>'), 'h1').toString();
  assert.match(out, /<textarea name="conclusion"[^>]*data-change="setSfarp" data-hazard-id="h1" data-platform-id="p1">Risk is SFARP<\/textarea>/);
  assert.match(out, /name="justification"[\s\S]*?name="conditions"/);
  assert.match(out, /&lt;b&gt;x&lt;\/b&gt;<\/textarea>/);
  assert.doesNotMatch(out, /<b>x<\/b>/);
});

test('a tab for a platform the hazard is not on shows a note, not a crash', () => {
  assert.match(hazardView(on('p:nope'), data(), 'h1').toString(), /not on that platform/);
});


test('the hazards list has a worst-residual column and filter per risk type', async () => {
  const { hazardsView } = await import('../../src/ui/screens/hazards.js');
  const out = hazardsView(state, data()).toString();
  assert.match(out, /<td data-col="riskPersonnel"|<th data-col="riskPersonnel"/);
  assert.match(out, /<th data-col="riskPersonnel"/);
  assert.match(out, /<th data-col="riskEnvironment"/);
  const env = hazardsView({ ...state, tables: { hazards: { filters: { riskEnvironment: 'Serious' } } } }, data()).toString();
  assert.match(env, /data-row="h1"/);
  const pers = hazardsView({ ...state, tables: { hazards: { filters: { riskPersonnel: 'Serious' } } } }, data()).toString();
  assert.doesNotMatch(pers, /data-row="h1"/);
});

test('dashboard cards show a personnel and an environment bar; unrated items name what is missing', async () => {
  const { homeView } = await import('../../src/ui/screens/home.js');
  const out = homeView(state, data()).toString();
  assert.match(out, /<span class="rx">Personnel<\/span><span class="riskbar">[\s\S]*?band-low/);
  assert.match(out, /<span class="rx">Environment<\/span><span class="riskbar">[\s\S]*?band-serious/);
  assert.match(out, /no initial personnel, initial environment, initial capability, residual capability rating/);
});

test('SSRA edits on a platform tab show in the hazard page\'s History, naming the platform and assessment', () => {
  const d = setAssessment(data(), act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihoodWhy: 'Seen monthly' });
  const out = hazardView(on('history'), d, 'h1').toString();
  assert.match(out, /Set initial personnel risk/);
  assert.match(out, /Alpha · Initial personnel<\/span> <ul class="plain"><li><strong>likelihoodWhy<\/strong>: Seen twice a year → Seen monthly/);
  assert.match(out, /Alpha · Initial personnel<\/span> Created/);
  assert.match(out, /Edit SFARP considerations[\s\S]*?Alpha · SFARP<\/span> Created/);
  assert.match(out, /History \(\d+\)/);
  assert.doesNotMatch(out, /History \(1\)/, 'the count includes SSRA edits');
});

test('unlinking a hazard from a platform warns that its assessments, justifications and SFARP go too', async () => {
  const { platformView } = await import('../../src/ui/screens/platforms.js');
  assert.match(platformView(state, data(), 'p1').toString(), /Unlink, clearing its risk assessments, justifications, SFARP considerations and control decisions here/);
});

function controlled() {
  let d = data();
  d = setControlAnalysis(d, act, { hazardId: 'h1', controlId: 'c1', recommendation: 'Fit <b>now</b>', justification: 'Cuts spread' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'rejected', reason: 'No water main' });
  d = updateControl(d, act, { id: 'c2', tier: 'Administrative' });
  return linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c2', kind: 'mitigating' });
}

test('a platform tab has Existing controls and the Additional control analysis, in SSRA order', () => {
  const out = hazardView(on('p:p1'), controlled(), 'h1').toString();
  const order = ['Overview', 'Existing controls', 'References', 'Initial risk', 'Additional control analysis', 'Residual risk', 'SFARP considerations'].map((h) => out.indexOf(`<h2>${h}`));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), `sections in SSRA order: ${order}`);
  assert.match(out, /data-table="existingControls"[\s\S]*?Fire drills[\s\S]*?Administrative/);
  assert.match(out, /data-action="openPicker" data-picker="linkExistingControls" data-hazard-id="h1" data-platform-id="p1"/);
  assert.match(out, /data-action="unlinkExistingControl" data-hazard-id="h1" data-platform-id="p1" data-control-id="c2"/);
  assert.match(out, /data-table="controlAnalysis"[\s\S]*?<textarea class="cell-area" name="recommendation"[^>]*data-change="setControlAnalysis" data-hazard-id="h1" data-control-id="c1">Fit &lt;b&gt;now&lt;\/b&gt;<\/textarea>/);
  assert.match(out, /aria-label="Status of Sprinklers"[\s\S]*?<option value="rejected" selected>rejected<\/option>/);
  assert.match(out, /No water main/);
  assert.doesNotMatch(out, /<b>now<\/b>/);
});

test('the Overview lists additional controls with their shared recommendation and justification', () => {
  const out = hazardView(state, controlled(), 'h1').toString();
  assert.match(out, /data-table="hazardControls"[\s\S]*?<th data-col="recommendation"[\s\S]*?<th data-col="justification"/);
  assert.match(out, />Cuts spread<\/textarea>/);
  assert.match(out, /<th data-col="description"/);
});

test('the existing-controls picker offers live controls not already listed there', () => {
  let d = controlled();
  d = retireControl(d, act, { id: 'c1' });
  const out = pickerView({ ...state, picker: { picker: 'linkExistingControls', hazardId: 'h1', platformId: 'p1' } }, d).toString();
  assert.match(out, /<form data-action="linkExistingControls" data-hazard-id="h1" data-platform-id="p1"/);
  assert.doesNotMatch(out, /value="c2"/, 'already an existing control here');
  assert.doesNotMatch(out, /value="c1"/, 'retired');
});

test('the Controls list counts existing uses among a control\'s hazards and platforms, and a control page lists them', async () => {
  const { controlsView, controlView } = await import('../../src/ui/screens/controls.js');
  const d = controlled();
  const c3 = createControl(d, act, { id: 'c3', title: 'Hot work permit' });
  const withExisting = linkExistingControl(c3, act, { hazardId: 'h1', platformId: 'p2', controlId: 'c3', kind: 'preventative' });
  const list = controlsView(state, withExisting).toString();
  assert.match(list, /<tr data-row="c3">[\s\S]*?H-0001 Fire[\s\S]*?Bravo/, 'an existing-control use counts as a hazard and platform it serves');
  const page = controlView(state, d, 'c2').toString();
  assert.match(page, /data-table="controlExisting"[\s\S]*?Fire[\s\S]*?Alpha[\s\S]*?mitigating/);
  assert.doesNotMatch(page, /Delete this control/);
});

test('the control tables lead with the control, and the analysis shows its status before the long text columns', () => {
  const out = hazardView(on('p:p1'), controlled(), 'h1').toString();
  const heads = (id) => [...out.slice(out.indexOf(`data-table="${id}"`)).split('</thead>')[0].matchAll(/<th data-col="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(heads('existingControls'), ['control', 'tier', 'kind', 'actions']);
  assert.deepEqual(heads('controlAnalysis'), ['control', 'state', 'reason', 'tier', 'kind', 'recommendation', 'justification']);
});

test('the hazard\'s History includes its control analysis, statuses and existing controls, each named', () => {
  const out = hazardView(on('history'), controlled(), 'h1').toString();
  assert.match(out, /Edit control analysis[\s\S]*?Control Sprinklers/);
  assert.match(out, /Set control to rejected[\s\S]*?Alpha · Status of Sprinklers/);
  assert.match(out, /Link existing control[\s\S]*?Alpha · Existing control Fire drills/);
});

test('acknowledgements and notices name the control, hazard and platform a record is about', async () => {
  const { recordName } = await import('../../src/ui/names.js');
  const d = controlled();
  assert.equal(recordName('existingControl', d.records.existingControl['ec:h1:p1:c2'], d), 'Fire drills for H-0001 on Alpha');
  assert.equal(recordName('ruling', d.records.ruling['ru:h1:c1:p1'], d), 'Sprinklers for H-0001 on Alpha');
  assert.equal(recordName('hazardControl', d.records.hazardControl['hc:h1:c1'], d), 'Sprinklers for H-0001');
  assert.equal(recordName('assessment', d.records.assessment['ra:h1:p1:residual:environment'], d), 'Residual environment risk of H-0001 on Alpha');
  assert.equal(recordName('sfarp', d.records.sfarp['sf:h1:p1'], d), 'SFARP of H-0001 on Alpha');
  assert.equal(recordName('ruling', d.records.ruling['ru:h1:c1:p1']), 'Control decision', 'without the data, the kind');
});

function reported() {
  let d = data();
  d = createSafetyReport(d, act, { id: 'sr1', hazardId: 'h1', platformId: 'p1', number: 'SR-10', date: '2026-03-04', reportType: 'Near miss', summary: 'Rotor <b>strike</b>', location: 'Hangar 3', parties: 'Crew A', description: 'Blade tip hit a stand' });
  return createSafetyReport(d, act, { id: 'sr2', hazardId: 'h1', platformId: 'p2', summary: 'On Bravo' });
}

test('a platform tab lists that platform\'s safety reports after the overview, + to add, double-click to edit, ✕ to delete', () => {
  const out = hazardView(on('p:p1'), reported(), 'h1').toString();
  const order = ['Overview', 'Safety reports', 'Existing controls'].map((h) => out.indexOf(`<h2>${h}`));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), `sections in SSRA order: ${order}`);
  assert.match(out, /data-table="safetyReports"[\s\S]*?SR-10[\s\S]*?4 Mar 2026[\s\S]*?Near miss[\s\S]*?Rotor &lt;b&gt;strike&lt;\/b&gt;[\s\S]*?Hangar 3[\s\S]*?Crew A/);
  assert.doesNotMatch(out, /On Bravo/);
  assert.match(out, /data-dblclick="startEdit" data-kind="safetyReport" data-id="sr1"/);
  assert.match(out, /data-action="deleteSafetyReport" data-id="sr1"/);
  assert.match(out, /data-action="startEdit" data-kind="safetyReport" data-id="new:p1"/);
  assert.doesNotMatch(out, /<b>strike<\/b>/);
});

test('the safety report form adds a new one, or edits one with its values filled in', () => {
  const adding = hazardView({ ...on('p:p1'), editing: { kind: 'safetyReport', id: 'new:p1' } }, reported(), 'h1').toString();
  assert.match(adding, /<form data-action="createSafetyReport" data-hazard-id="h1" data-platform-id="p1" class="report-form">/);
  assert.match(adding, /<select name="reportType"[^>]*>[\s\S]*?<option value="Occurrence" selected>/);
  assert.match(adding, /<input name="summary" required/);
  const editing = hazardView({ ...on('p:p1'), editing: { kind: 'safetyReport', id: 'sr1' } }, reported(), 'h1').toString();
  assert.match(editing, /<form data-action="updateSafetyReport" data-id="sr1" class="report-form">/);
  assert.match(editing, /<input type="date" name="date" value="2026-03-04"/);
  assert.match(editing, /<option value="Near miss" selected>/);
  assert.match(editing, /<textarea name="description"[^>]*>Blade tip hit a stand<\/textarea>/);
});

test('deleting a hazard or a platform warns that its safety reports go too', async () => {
  const { platformView } = await import('../../src/ui/screens/platforms.js');
  assert.match(hazardView(state, reported(), 'h2').toString(), /lifecycle phases and safety reports/);
  let d = reported();
  const { createPlatform } = await import('../../src/core/ops/platforms.js');
  d = createPlatform(d, act, { id: 'p3', name: 'Charlie', ownerId: 'u1' });
  assert.match(platformView(state, d, 'p3').toString(), /Delete this platform and its safety reports/);
});

// Capability: a third receptor on every screen.
const capability = (d, stage, likelihood, consequence, extra = {}) => setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage, receptor: 'capability', likelihood, consequence, ...extra });

test('the platform tab has a Capability panel beside Personnel and Environment, for initial and residual risk', () => {
  const out = hazardView(on('p:p1'), capability(data(), 'initial', 'B', null, { likelihoodWhy: '<b>x</b>' }), 'h1').toString();
  assert.equal((out.match(/class="risk-panel"/g) ?? []).length, 6, 'three panels per stage');
  assert.match(out, /<select name="likelihood" aria-label="Initial capability likelihood"[^>]*>[\s\S]*?<option value="B" selected>/);
  assert.match(out, /aria-label="Residual capability consequence"/);
  assert.match(out, /<h3>Capability<\/h3>/);
  assert.match(out, /&lt;b&gt;x&lt;\/b&gt;<\/textarea>/);
  assert.doesNotMatch(out, /<b>x<\/b>/);
});

test('the worst residual counts capability, on the tab and in the hazards list, with a column and filter of its own', async () => {
  const { hazardsView } = await import('../../src/ui/screens/hazards.js');
  const d = capability(data(), 'residual', 'A', 1);
  assert.match(hazardView(state, d, 'h1').toString(), /data-tab="p:p1">Alpha <span class="band band-high">High<\/span>/);
  assert.match(hazardView(state, d, 'h1').toString(), /data-table="hazardPlatforms"[\s\S]*?<th data-col="capability"/);
  const list = hazardsView(state, d).toString();
  assert.match(list, /<th data-col="riskCapability"/);
  assert.match(hazardsView({ ...state, tables: { hazards: { filters: { riskCapability: 'High' } } } }, d).toString(), /data-row="h1"/);
});

test('the platform page shows six calculated levels, picks no cells, and links each hazard to its tab', async () => {
  const { platformView } = await import('../../src/ui/screens/platforms.js');
  const out = platformView(state, capability(data(), 'residual', 'C', 2), 'p1').toString();
  for (const k of ['initialPersonnel', 'initialEnvironment', 'initialCapability', 'residualPersonnel', 'residualEnvironment', 'residualCapability']) assert.match(out, new RegExp(`<th data-col="${k}"`));
  assert.match(out, /<span class="band band-serious">2C Serious<\/span>/);
  assert.match(out, /Not yet assessed/);
  assert.doesNotMatch(out, /setRatingCell|<option value="2C"/);
  assert.match(out, /data-action="go" data-view="hazard" data-id="h1" data-tab="p:p1"/);
});

test('Home has a capability bar; the review checklist a residual capability column', async () => {
  const { homeView } = await import('../../src/ui/screens/home.js');
  const { platformView } = await import('../../src/ui/screens/platforms.js');
  const { startReview } = await import('../../src/core/ops/reviews.js');
  const d = capability(data(), 'residual', 'C', 2);
  assert.match(homeView(state, d).toString(), /<span class="rx">Capability<\/span><span class="riskbar">[\s\S]*?band-serious/);
  const r = startReview(d, act, { id: 'r1', platformId: 'p1' });
  assert.match(platformView({ ...state, view: { name: 'platform', id: 'p1', tab: 'reviews' } }, r, 'p1').toString(), /<th data-col="residualCapability"/);
});

test('the safety reports table shows each report\'s description', () => {
  const out = hazardView(on('p:p1'), reported(), 'h1').toString();
  assert.match(out, /data-table="safetyReports"[\s\S]*?<th data-col="description"[\s\S]*?Blade tip hit a stand/);
});
