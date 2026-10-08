import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { setAssessment, setSfarp, setControlStatus } from '../../src/core/ops/assessment.js';
import { setControlAnalysis, updateControl, retireControl, createControl, createControlOn, removeControlHere, setImplementedBy } from '../../src/core/ops/controls.js';
import { pickerView } from '../../src/ui/screens/picker.js';
import { createSafetyReport } from '../../src/core/ops/safety-reports.js';
import { seed, act } from '../helpers.js';
import { riskPanels, sfarpArea, controlsSection } from '../../src/ui/screens/ssra.js';

const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }] };
const on = (tab, section) => ({ ...state, view: { name: 'hazard', id: 'h1', tab }, ...(section === undefined ? {} : { sections: { ssra: section } }) });
const SECTIONS = ['reports', 'references', 'initial', 'controls', 'residual', 'sfarp'];
/** Alpha's tab drawn once with each rail section open in turn. */
const everySection = (d, extra = {}) => SECTIONS.map((x) => hazardView({ ...on('p:p1', x), ...extra }, d, 'h1').toString()).join('\n');
/** The rail's section labels, in order. @param {string} out */
const railOrder = (out) => [...out.matchAll(/data-action="showSection" data-page="ssra" data-section="(\w+)"/g)].map((m) => m[1]);
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
  assert.match(out, /<button type="button" class="dash-card plat-card" title="Open the SSRA for Alpha" data-action="go" data-view="hazard" data-id="h1" data-tab="p:p1">[\s\S]*?Personnel<\/span><span class="band band-low">Low[\s\S]*?Environment<\/span><span class="band band-serious">Serious/, 'Overview: a tile per platform with its residual per receptor, opening its tab');
  assert.doesNotMatch(out, /Open SSRA|never reviewed/);
});

test('a platform tab is a dashboard: risk and controls at a glance, the shared hazard, numbered lists, and a rail in SSRA order', () => {
  const out = hazardView(on('p:p1'), data(), 'h1').toString();
  assert.deepEqual(railOrder(out), SECTIONS);
  assert.match(out, /<table class="risk-glance">[\s\S]*?Initial[\s\S]*?Residual[\s\S]*?<span class="band band-serious">2C Serious<\/span>/);
  assert.match(out, /class="shared-mark">Shared across platforms/);
  assert.match(out, /<textarea class="doc-text boxed" name="description"[^>]*data-change="updateHazard"/);
  assert.match(out, /<div class="dash-grid hazard-lists">\s*<section class="dash-card nl-card" aria-label="Causal factors">/);
  assert.match(out, /aria-label="Causal factors">[\s\S]*?<span class="nl-num">1<\/span>[\s\S]*?aria-label="Consequences">[\s\S]*?<span class="nl-num">1<\/span>[\s\S]*?aria-label="Element failure modes">[\s\S]*?No element failure modes yet\.[\s\S]*?aria-label="System\/Element">[\s\S]*?aria-label="Lifecycle phases">[\s\S]*?aria-label="Affected groups">/);
  assert.ok(out.indexOf('aria-label="Hazard"') < out.indexOf('aria-label="Risk"') && out.indexOf('aria-label="Risk"') < out.indexOf('aria-label="Controls"'), 'hazard, then risk, then controls');
  assert.match(out, /class="rail-item on" aria-pressed="true"[^>]*data-section="initial"/, 'Initial risk is open until another is chosen');
  assert.equal((out.match(/class="rail-panel"/g) ?? []).length, 1, 'one section open at a time');
  assert.match(hazardView(on('p:p1', null), data(), 'h1').toString(), /Choose a section on the left/, 'the open one closes');
});

test('risk panels: personnel and environment side by side, each with likelihood, consequence, justifications and the level', () => {
  const out = everySection(data());
  assert.match(out, /<select name="likelihood" aria-label="Initial personnel likelihood" data-change="setAssessment" data-hazard-id="h1" data-platform-id="p1" data-stage="initial" data-receptor="personnel">[\s\S]*?<option value="C" selected>C · Occasional<\/option>/);
  assert.match(out, /<textarea name="likelihoodWhy"[^>]*data-change="setAssessment" data-hazard-id="h1" data-platform-id="p1" data-stage="initial" data-receptor="personnel">Seen twice a year<\/textarea>/);
  assert.match(out, /<select name="consequence" aria-label="Residual environment consequence"[\s\S]*?<option value="2" selected>2 · Critical<\/option>/);
  assert.match(out, /Residual risk[\s\S]*?Personnel[\s\S]*?<span class="band band-low">4D Low<\/span>[\s\S]*?Environment[\s\S]*?<span class="band band-serious">2C Serious<\/span>/);
  assert.match(out, /Initial risk[\s\S]*?<span class="band band-uncategorised">Not yet assessed<\/span>/, 'a likelihood alone has no level');
});

test('SFARP considerations, and text shown literally', () => {
  const out = everySection(data('<b>x</b>'));
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
  assert.match(out, /Alpha · Initial personnel<\/span> <ul class="plain"><li><details class="long-change"><summary><strong>Changed likelihood justification<\/strong><\/summary><div class="text-old">Seen <mark class="diff-out">twice a year<\/mark><\/div>[\s\S]*?<div class="text-new">Seen <mark class="diff-in">monthly<\/mark><\/div>/);
  assert.match(out, /Alpha · Initial personnel<\/span> Created/);
  assert.match(out, /Edit SFARP considerations[\s\S]*?Alpha · SFARP<\/span> Created/);
  assert.match(out, /History \(\d+\)/);
  assert.doesNotMatch(out, /History \(1\)/, 'the count includes SSRA edits');
});

test('unlinking a hazard from a platform warns that its assessments, justifications and SFARP go too', async () => {
  const { platformView } = await import('../../src/ui/screens/platforms.js');
  assert.match(platformView(state, data(), 'p1').toString(), /data-action="askConfirm" data-run="unlinkHazard" data-hazard-id="h1" data-platform-id="p1" data-title="Unlink Fire from Alpha\?" data-text="Unlinking clears its risk assessments, justifications, SFARP considerations and control decisions here\."/);
});

/** Sprinklers rejected on Alpha, with its shared analysis; Fire drills Administrative, implemented by HighCom on Alpha; Hot work permit added on Alpha alone. */
function controlled() {
  let d = data();
  d = setControlAnalysis(d, act, { hazardId: 'h1', controlId: 'c1', recommendation: 'Fit <b>now</b>', justification: 'Cuts spread' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'rejected', reason: 'No water main' });
  d = updateControl(d, act, { id: 'c2', tier: 'Administrative' });
  d = setImplementedBy(d, act, { controlId: 'c2', platformId: 'p1', implementedBy: 'highcom' });
  return createControlOn(d, act, { id: 'c3', title: 'Hot work permit', hazardId: 'h1', platformId: 'p1', kind: 'preventative' });
}

test('a platform tab has one Controls section: this platform\'s status, who implements each, the shared analysis; counted on the dashboard', () => {
  const out = everySection(controlled());
  const glance = hazardView(on('p:p1'), controlled(), 'h1').toString();
  assert.match(glance, /<strong>3<\/strong> controls <span class="glance-tags"><span class="tag state-recommended">2 Recommended<\/span> <span class="tag state-rejected">1 Rejected<\/span>/);
  assert.doesNotMatch(out, /existingControls|Existing controls|Additional control/, 'no existing or additional sections');
  assert.match(out, /data-section="controls"[^>]*>[\s\S]*?<span class="rail-label">Controls<\/span><span class="rail-badge">3<\/span>/);
  assert.match(out, /<h2>Controls <span class="shared-mark">Recommendation and justification shared across platforms<\/span><button type="button" class="copy-stage" data-action="openPicker" data-picker="copyPart" data-part="controls" data-hazard-id="h1" data-platform-id="p1"/);
  assert.match(out, /data-table="controlAnalysis"[\s\S]*?Fire drills[\s\S]*?Administrative/);
  assert.match(out, /data-table="controlAnalysis"[\s\S]*?Hot work permit/);
  assert.match(out, /data-action="openPicker" data-picker="addControlsHere" data-hazard-id="h1" data-platform-id="p1"/);
  assert.match(out, /data-action="askConfirm" data-run="removeControlHere" data-hazard-id="h1" data-platform-id="p1" data-control-id="c2"/);
  assert.match(out, /<select class="quiet" name="implementedBy" aria-label="Who implements Fire drills on Alpha" data-change="setImplementedBy" data-control-id="c2" data-platform-id="p1">[\s\S]*?<option value="highcom" selected>HighCom<\/option>/);
  assert.match(out, /data-table="controlAnalysis"[\s\S]*?<textarea class="cell-area" name="recommendation"[^>]*data-change="setControlAnalysis" data-hazard-id="h1" data-control-id="c1">Fit &lt;b&gt;now&lt;\/b&gt;<\/textarea>/);
  assert.match(out, /aria-label="Status of Sprinklers"[\s\S]*?<option value="rejected" selected>Rejected<\/option>/);
  assert.match(out, /No water main/);
  assert.doesNotMatch(out, /<b>now<\/b>/);
  const bravo = hazardView(on('p:p2', 'controls'), controlled(), 'h1').toString();
  assert.doesNotMatch(bravo, /Hot work permit/, 'added on Alpha alone');
  assert.match(bravo, /data-table="controlAnalysis"[\s\S]*?Fire drills[\s\S]*?Sprinklers/, 'its other controls, by tier');
});

test('the Overview lists the hazard\'s controls with their shared recommendation and justification, and the platforms each is on', () => {
  const out = hazardView(state, controlled(), 'h1').toString();
  assert.match(out, /data-section="controls"[^>]*>[\s\S]*?<span class="rail-label">Controls<\/span>/);
  assert.match(out, /data-table="hazardControls"[\s\S]*?<th data-col="recommendation"[\s\S]*?<th data-col="justification"/);
  assert.match(out, />Cuts spread<\/textarea>/);
  assert.match(out, /<th data-col="description"/);
  assert.match(out, /<th data-col="platforms"[\s\S]*?On platforms/);
  assert.match(out, /<tr data-row="c1">[\s\S]*?<ul class="plain dots"><li>Alpha <span class="tag state-rejected">Rejected<\/span><\/li><li>Bravo <span class="tag state-recommended">Recommended<\/span><\/li><\/ul>/);
  assert.match(out, /<tr data-row="c3">[\s\S]*?<ul class="plain dots"><li>Alpha <span class="tag state-recommended">Recommended<\/span><\/li><\/ul>/, 'on Alpha alone');
});

test('Add controls offers live controls not on this platform, naming the hazard\'s other platforms each is on', () => {
  let d = removeControlHere(controlled(), act, { hazardId: 'h1', platformId: 'p2', controlId: 'c2' });
  d = createControl(d, act, { id: 'c4', title: 'Old drill' });
  d = retireControl(d, act, { id: 'c4' });
  const out = pickerView({ ...state, picker: { picker: 'addControlsHere', hazardId: 'h1', platformId: 'p2' } }, d).toString();
  assert.match(out, /<form data-action="addControlsHere" data-hazard-id="h1" data-platform-id="p2"/);
  assert.match(out, /value="c2"> <span class="id">[\s\S]*?Fire drills <span class="pick-from">on Alpha<\/span>/, 'taken off here, so offered again');
  assert.match(out, /value="c3">[\s\S]*?Hot work permit <span class="pick-from">on Alpha<\/span>/);
  assert.doesNotMatch(out, /value="c1"/, 'already on Bravo');
  assert.doesNotMatch(out, /value="c4"/, 'retired');
});

test('the Controls list names only the platforms a control is on, and a control page shows where it applies', async () => {
  const { controlsView, controlView } = await import('../../src/ui/screens/controls.js');
  const d = controlled();
  const list = controlsView({ ...state, view: { name: 'controls' } }, d).toString();
  const row = list.slice(list.indexOf('<tr data-row="c3"'), list.indexOf('</tr>', list.indexOf('<tr data-row="c3"')));
  assert.match(row, /HAZ-001 Fire[\s\S]*?Alpha/);
  assert.doesNotMatch(row, /Bravo/, 'taken off Bravo');
  const page = controlView(state, d, 'c3').toString();
  assert.deepEqual([...page.matchAll(/data-page="control" data-section="(\w+)"/g)].map((m) => m[1]), ['usage', 'references']);
  assert.match(page, /data-table="controlUsage"[\s\S]*?Fire[\s\S]*?Alpha/);
  assert.doesNotMatch(page, /Delete this control/);
});

test('the control table leads with the control\'s ID and then its title, each its own column, and shows its status and who implements it before the long text columns', () => {
  const out = everySection(controlled());
  const heads = (id) => [...out.slice(out.indexOf(`data-table="${id}"`)).split('</thead>')[0].matchAll(/<th data-col="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(heads('controlAnalysis'), ['id', 'control', 'state', 'implementedBy', 'reason', 'tier', 'kind', 'targets', 'recommendation', 'justification', 'implementation', 'actions']);
  assert.match(out, /<th data-col="id">[\s\S]*?Control ID[\s\S]*?<th data-col="control">[\s\S]*?>Control</, 'the number and the title, each its own column');
});

test('the hazard\'s History includes its control analysis, statuses and controls added on a platform, each named', () => {
  const out = hazardView(on('history'), controlled(), 'h1').toString();
  assert.match(out, /Edit control analysis[\s\S]*?Control Sprinklers/);
  assert.match(out, /Set control to rejected[\s\S]*?Alpha · Status of Sprinklers/);
  assert.match(out, /Add control to platform[\s\S]*?Control Hot work permit/);
});

test('acknowledgements and notices name the control, hazard and platform a record is about', async () => {
  const { recordName } = await import('../../src/ui/names.js');
  const d = controlled();
  assert.equal(recordName('controlOn', d.records.controlOn['on:h1:c3:p2'], d), 'Hot work permit for HAZ-001 on Bravo');
  assert.equal(recordName('ruling', d.records.ruling['ru:h1:c1:p1'], d), 'Sprinklers for HAZ-001 on Alpha');
  assert.equal(recordName('hazardControl', d.records.hazardControl['hc:h1:c1'], d), 'Sprinklers for HAZ-001');
  assert.equal(recordName('assessment', d.records.assessment['ra:h1:p1:residual:environment'], d), 'Residual environment risk of HAZ-001 on Alpha');
  assert.equal(recordName('sfarp', d.records.sfarp['sf:h1:p1'], d), 'SFARP of HAZ-001 on Alpha');
  assert.equal(recordName('ruling', d.records.ruling['ru:h1:c1:p1']), 'Control decision', 'without the data, the kind');
});

function reported() {
  let d = data();
  d = createSafetyReport(d, act, { id: 'sr1', hazardId: 'h1', platformId: 'p1', date: '2026-03-04', reportType: 'Near miss', summary: 'Rotor <b>strike</b>', location: 'Hangar 3', parties: 'Crew A', description: 'Blade tip hit a stand' });
  // Saved, so each has its Report ID: Alpha was linked first (A), Bravo next (B).
  return assignNumbers(createSafetyReport(d, act, { id: 'sr2', hazardId: 'h1', platformId: 'p2', summary: 'On Bravo' }));
}

test('a platform tab lists that platform\'s safety reports in its own section, + to add, double-click to edit, ✕ to delete', () => {
  const out = hazardView(on('p:p1', 'reports'), reported(), 'h1').toString();
  assert.match(out, /data-section="reports"[^>]*>[\s\S]*?<span class="rail-badge">1<\/span>/);
  assert.match(out, /data-table="safetyReports"[\s\S]*?HAZ-001-A-1[\s\S]*?4 Mar 2026[\s\S]*?Near miss[\s\S]*?Rotor &lt;b&gt;strike&lt;\/b&gt;[\s\S]*?Hangar 3[\s\S]*?Crew A/);
  assert.doesNotMatch(out, /On Bravo/);
  assert.match(out, /data-dblclick="startEdit" data-kind="safetyReportCell" data-id="sr1:summary"/);
  assert.match(out, /data-action="askConfirm" data-run="deleteSafetyReport" data-id="sr1"/);
  assert.match(out, /data-action="startEdit" data-kind="safetyReport" data-id="new:p1"/);
  assert.doesNotMatch(out, /<b>strike<\/b>/);
});

test('a safety report\'s cell is changed in place by double-clicking it: text, a date, the type from its list, the description in several lines', () => {
  const at = (field) => hazardView({ ...on('p:p1', 'reports'), editing: { kind: 'safetyReportCell', id: `sr1:${field}` } }, reported(), 'h1').toString();
  assert.match(at('summary'), /<input class="cell-edit" name="summary" type="text" value="Rotor &lt;b&gt;strike&lt;\/b&gt;" required aria-label="Summary of HAZ-001-A-1" autofocus data-change="updateSafetyReport" data-id="sr1">/);
  assert.match(at('date'), /<input class="cell-edit" name="date" type="date" value="2026-03-04"[^>]*data-change="updateSafetyReport" data-id="sr1">/);
  assert.match(at('type'), /<select class="cell-edit" name="reportType" aria-label="Type of HAZ-001-A-1" autofocus data-change="updateSafetyReport" data-id="sr1">[\s\S]*?<option value="Near miss" selected>[\s\S]*?Field Service Bulletin/);
  assert.match(at('description'), /<textarea class="cell-edit" name="description" rows="3"[^>]*data-change="updateSafetyReport" data-id="sr1">/);
  const one = at('location');
  assert.equal((one.match(/class="cell-edit"/g) ?? []).length, 1, 'only the cell double-clicked');
  assert.doesNotMatch(one, /class="report-form"/, 'no whole-report form');
});

test('the safety report form adds a new one, or edits one with its values filled in', () => {
  const adding = hazardView({ ...on('p:p1', 'reports'), editing: { kind: 'safetyReport', id: 'new:p1' } }, reported(), 'h1').toString();
  assert.match(adding, /<form data-action="createSafetyReport" data-hazard-id="h1" data-platform-id="p1" class="report-form">/);
  assert.match(adding, /<select name="reportType"[^>]*>[\s\S]*?<option value="Occurrence" selected>/);
  assert.match(adding, /<input name="summary" required/);
  const editing = hazardView({ ...on('p:p1', 'reports'), editing: { kind: 'safetyReport', id: 'sr1' } }, reported(), 'h1').toString();
  assert.match(editing, /<form data-action="updateSafetyReport" data-id="sr1" class="report-form">/);
  assert.match(editing, /<input type="date" name="date" value="2026-03-04"/);
  assert.match(editing, /<option value="Near miss" selected>/);
  assert.match(editing, /<textarea name="description"[^>]*>Blade tip hit a stand<\/textarea>/);
});

test('deleting a hazard or a platform warns that its safety reports go too', async () => {
  const { platformView } = await import('../../src/ui/screens/platforms.js');
  assert.match(hazardView({ ...state, confirmDelete: { kind: 'hazard', id: 'h2' } }, reported(), 'h2').toString(), /class="delete-panel"[\s\S]*?lifecycle phases and safety reports go with it/);
  let d = reported();
  const { createPlatform } = await import('../../src/core/ops/platforms.js');
  d = createPlatform(d, act, { id: 'p3', name: 'Charlie', ownerId: 'u1' });
  assert.match(platformView({ ...state, confirmDelete: { kind: 'platform', id: 'p3' } }, d, 'p3').toString(), /class="delete-panel"[\s\S]*?Its safety reports go with it/);
});

// Capability: a third receptor on every screen.
const capability = (d, stage, likelihood, consequence, extra = {}) => setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage, receptor: 'capability', likelihood, consequence, ...extra });

test('the platform tab has a Capability panel beside Personnel and Environment, for initial and residual risk', () => {
  const out = everySection(capability(data(), 'initial', 'B', null, { likelihoodWhy: '<b>x</b>' }));
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
  assert.match(hazardView(state, d, 'h1').toString(), /class="dash-card plat-card"[\s\S]*?Capability<\/span><span class="band band-high">High/);
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

test('Home has a capability bar', async () => {
  const { homeView } = await import('../../src/ui/screens/home.js');
  const d = capability(data(), 'residual', 'C', 2);
  assert.match(homeView(state, d).toString(), /<span class="rx">Capability<\/span><span class="riskbar">[\s\S]*?band-serious/);
});

test('the safety reports table shows each report\'s description', () => {
  const out = hazardView(on('p:p1', 'reports'), reported(), 'h1').toString();
  assert.match(out, /data-table="safetyReports"[\s\S]*?<th data-col="description"[\s\S]*?Blade tip hit a stand/);
});

test('initial risk panels are tinted red and residual ones blue, to tell them apart', async () => {
  const fs = await import('node:fs');
  const out = everySection(data());
  assert.match(out, /<h2>Initial risk<\/h2><div class="risk-panels risk-initial">/);
  assert.match(out, /<h2>Residual risk<\/h2><div class="risk-panels risk-residual">/);
  const css = fs.readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.risk-initial \.risk-panel \{[^}]*background: color-mix\(in srgb, #d64541 [0-9]+%, var\(--p-surface\)\)/);
  assert.match(css, /\.risk-residual \.risk-panel \{[^}]*background: color-mix\(in srgb, #3b82c4 [0-9]+%, var\(--p-surface\)\)/);
});

test('a hazard links to platforms from its own Overview: + opens the live platforms it is not on', async () => {
  const { createPlatform, retirePlatform } = await import('../../src/core/ops/platforms.js');
  let d = createPlatform(data(), act, { id: 'p3', name: 'Charlie', ownerId: 'u1' });
  d = createPlatform(d, act, { id: 'p4', name: 'Delta', ownerId: 'u1' });
  d = retirePlatform(d, act, { id: 'p4' });
  const out = hazardView(state, d, 'h1').toString();
  assert.match(out, /<h2 class="dash-h">Platforms <span class="count">2<\/span><button type="button" class="plus" data-action="openPicker" data-picker="linkPlatforms" data-hazard-id="h1"/);
  const picker = pickerView({ ...state, picker: { picker: 'linkPlatforms', hazardId: 'h1' } }, d).toString();
  assert.match(picker, /<form data-action="linkPlatforms" data-hazard-id="h1"/);
  assert.match(picker, /value="p3"/);
  assert.doesNotMatch(picker, /value="p1"|value="p2"/, 'already on them');
  assert.doesNotMatch(picker, /value="p4"/, 'retired');
});

test('a justification box offers to copy the same box from another platform, only when one has text', () => {
  const d = setAssessment(data(), act, { hazardId: 'h1', platformId: 'p2', stage: 'initial', receptor: 'environment', likelihood: 'D', likelihoodWhy: 'Bunded <store>' });
  const onAlpha = hazardView(on('p:p1', 'initial'), d, 'h1').toString();
  assert.match(onAlpha, /<button type="button" class="copy-from" data-action="openPicker" data-picker="copyJustification" data-hazard-id="h1" data-platform-id="p1" data-stage="initial" data-receptor="environment" data-field="likelihoodWhy" title="Copy from another platform" aria-label="Copy the initial environment likelihood justification from another platform">/);
  assert.equal((onAlpha.match(/class="copy-from"/g) ?? []).length, 1, 'no other platform has text in the other boxes');
  const picker = pickerView({ ...state, picker: { picker: 'copyJustification', hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'environment', field: 'likelihoodWhy' } }, d).toString();
  assert.match(picker, /data-action="copyJustification" data-hazard-id="h1" data-platform-id="p1" data-stage="initial" data-receptor="environment" data-field="likelihoodWhy" data-from="p2"[\s\S]*?Bravo[\s\S]*?Bunded &lt;store&gt;/);
});

test('Initial risk and Residual risk each offer to copy the whole stage from another platform that has one', () => {
  const d = setAssessment(data(), act, { hazardId: 'h1', platformId: 'p2', stage: 'initial', receptor: 'capability', likelihood: 'D', consequence: 3 });
  const out = everySection(d);
  assert.match(out, /<h2>Initial risk<button type="button" class="copy-stage" data-action="openPicker" data-picker="copyStage" data-hazard-id="h1" data-platform-id="p1" data-stage="initial" title="Copy all initial likelihoods and consequences from another platform">[\s\S]*?Copy from…<\/button><\/h2>/);
  assert.doesNotMatch(out, /data-picker="copyStage"[^>]*data-stage="residual"/, 'no other platform has residual risk yet');
  const picker = pickerView({ ...state, picker: { picker: 'copyStage', hazardId: 'h1', platformId: 'p1', stage: 'initial' } }, d).toString();
  assert.match(picker, /Copy the initial risk/);
  assert.match(picker, /<form data-action="copyStage" data-hazard-id="h1" data-platform-id="p1" data-stage="initial"[\s\S]*?<input type="checkbox" name="withWhy" value="true" checked> Include justifications[\s\S]*?<button type="submit" class="copy-choice" name="from" value="p2">[\s\S]*?Bravo[\s\S]*?Capability[\s\S]*?3D Medium/);
});

test('a platform tab\'s System/Element and Affected groups: numbered, + opens a box suggesting what was typed before', async () => {
  const { addSystemElement } = await import('../../src/core/ops/hazards.js');
  let d = addSystemElement(data(), act, { id: 's1', hazardId: 'h1', platformId: 'p1', text: 'Engine room' });
  d = addSystemElement(d, act, { id: 's2', hazardId: 'h1', platformId: 'p2', text: 'Galley' });
  const out = hazardView(on('p:p1'), d, 'h1').toString();
  const card = out.slice(out.indexOf('aria-label="System/Element"'), out.indexOf('aria-label="Lifecycle phases"'));
  assert.match(card, /System\/Element <span class="count">1<\/span><button[^>]*data-action="startEdit" data-kind="newSystemElement" data-id="h1:p1"/);
  assert.match(card, /<span class="cell-text nl-text" data-dblclick="startEdit" data-kind="systemElement" data-id="s1"[^>]*>Engine room<\/span>/);
  assert.doesNotMatch(card, /Galley|<datalist/, 'Bravo\'s stay on Bravo; no suggestions until adding');
  assert.match(out, /aria-label="Affected groups">[\s\S]*?No affected groups yet\./);
  const adding = hazardView({ ...on('p:p1'), editing: { kind: 'newSystemElement', id: 'h1:p1' } }, d, 'h1').toString();
  assert.match(adding, /<form data-action="addSystemElement" data-hazard-id="h1" data-platform-id="p1"[^>]*data-picks>\s*<div class="row inline fill"><input name="text" required list="systemElement-entries"/);
  assert.match(adding, /Used before[\s\S]*?<input type="checkbox" name="pick" value="Galley">/, 'what is used elsewhere, to tick');
  assert.doesNotMatch(adding, /name="pick" value="Engine room"/, 'not what is here already');
  assert.match(adding, /<datalist id="systemElement-entries"><option value="Engine room"><\/option><option value="Galley"><\/option><\/datalist>/, 'suggests entries from every hazard and platform');
});

test('a safety report\'s ⋯ beside its ✕ moves it to another platform the hazard is on', () => {
  const out = hazardView(on('p:p1', 'reports'), reported(), 'h1').toString();
  assert.match(out, /<details class="row-menu dots"><summary aria-label="More for HAZ-001-A-1"[\s\S]*?<button type="button" data-action="moveSafetyReport" data-id="sr1" data-platform-id="p2">Move to Bravo<\/button>[\s\S]*?data-run="deleteSafetyReport" data-id="sr1"/);
  assert.doesNotMatch(out, /data-platform-id="p1">Move to Alpha/, 'not to the platform it is on');
});

test('safety reports show their Report ID, given at save and not editable; TBC until then; a moved one notes its old ID', async () => {
  const { moveSafetyReport } = await import('../../src/core/ops/safety-reports.js');
  const out = hazardView(on('p:p1', 'reports'), reported(), 'h1').toString();
  assert.match(out, /<th data-col="reportId"[\s\S]*?Report ID/);
  assert.match(out, /<span class="report-id" title="Given at save; never changes">HAZ-001-A-1<\/span>/);
  assert.doesNotMatch(out, /data-kind="safetyReportCell" data-id="sr1:(number|reportId)"/, 'no editing it');
  assert.doesNotMatch(hazardView({ ...on('p:p1', 'reports'), editing: { kind: 'safetyReport', id: 'new:p1' } }, reported(), 'h1').toString(), /name="number"/, 'no number to type');
  const moved = moveSafetyReport(reported(), act, { id: 'sr1', platformId: 'p2' });
  assert.match(hazardView(on('p:p2', 'reports'), moved, 'h1').toString(), /<span class="report-id" title="Given when you save"><span class="tag tag-tbc"[^>]*>TBC<\/span><\/span><div class="muted small-text">was HAZ-001-A-1<\/div>/);
});

test('Add controls has Add new between Add and Cancel: a new control is made and added here with any ticked', async () => {
  const { pickerView } = await import('../../src/ui/screens/picker.js');
  const { controlsOnPlatform } = await import('../../src/core/queries.js');
  const pick = pickerView({ ...on('p:p1'), picker: { picker: 'addControlsHere', hazardId: 'h1', platformId: 'p1' } }, data()).toString();
  assert.match(pick, /<div class="pick-new" data-new-section hidden>[\s\S]*?<input name="newTitle"[^>]*placeholder="New control title…"[\s\S]*?<select name="newKind"/);
  assert.match(pick, /<button type="submit" class="primary">Add<\/button><button type="button" data-show-new aria-expanded="false"[^>]*>Add new<\/button><button type="button" data-action="closePicker">Cancel<\/button>/);
  const d = createControlOn(data(), act, { id: 'cN', title: 'Fire wall', hazardId: 'h1', platformId: 'p1', kind: 'mitigating' });
  assert.deepEqual(['category' in d.records.control.cN, d.records.control.cN.title], [false, 'Fire wall']);
  assert.deepEqual(controlsOnPlatform(d, 'h1', 'p1').filter((x) => x.control.id === 'cN').map((x) => x.kind), ['mitigating']);
  assert.deepEqual(controlsOnPlatform(d, 'h1', 'p2').filter((x) => x.control.id === 'cN'), [], 'on this platform alone');
});

test('the Controls section ends with an Implementation Status box for each control on this platform; statuses read with a capital', async () => {
  const { setImplementationStatus } = await import('../../src/core/ops/assessment.js');
  const d = setImplementationStatus(data(), act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', text: 'Ordered' });
  const out = hazardView(on('p:p1', 'controls'), d, 'h1').toString();
  assert.match(out, /<th data-col="implementation">[\s\S]*?Implementation Status/);
  assert.match(out, /<textarea class="cell-area" name="text" rows="2" placeholder="Implementation status…" aria-label="Implementation status of Sprinklers on Alpha" data-change="setImplementationStatus" data-hazard-id="h1" data-control-id="c1" data-platform-id="p1">Ordered<\/textarea>/);
  assert.match(out, /<option value="recommended" selected>Recommended<\/option><option value="planned">Planned<\/option>/);
});

test('the overview\'s Safety Reports section lists every platform\'s safety reports together, with a Platform column after the Report ID', () => {
  const out = hazardView({ ...state, view: { name: 'hazard', id: 'h1' }, sections: { hazard: 'reports' } }, reported(), 'h1').toString();
  assert.match(out, /data-section="reports"[^>]*>[\s\S]*?Safety Reports<\/span><span class="rail-badge">2<\/span>/);
  assert.match(out, /data-table="hazardSafetyReports"[\s\S]*?<th data-col="reportId"[\s\S]*?<th data-col="platform"[\s\S]*?<th data-col="date"/);
  assert.match(out, /HAZ-001-A-1[\s\S]*?data-action="go" data-view="hazard" data-id="h1" data-tab="p:p1">Alpha<\/button>[\s\S]*?Rotor &lt;b&gt;strike/);
  assert.match(out, /HAZ-001-B-1[\s\S]*?data-tab="p:p2">Bravo<\/button>[\s\S]*?On Bravo/);
  assert.doesNotMatch(out, /Add a safety report/, 'added on a platform\'s tab');
  assert.match(out, /data-action="moveSafetyReport" data-id="sr1" data-platform-id="p2">Move to Bravo/);
  assert.match(out, /data-action="moveSafetyReport" data-id="sr2" data-platform-id="p1">Move to Alpha/);
});

test('risk panels show ratings only, justifications only, or both; SFARP and controls render on their own', () => {
  const d = seed();
  const h = d.records.hazard.h1;
  const ratings = riskPanels(state, d, h, 'p1', 'residual', 'ratings').toString();
  assert.match(ratings, /name="likelihood"/);
  assert.doesNotMatch(ratings, /name="likelihoodWhy"/);
  const why = riskPanels(state, d, h, 'p1', 'residual', 'justifications').toString();
  assert.match(why, /name="likelihoodWhy"/);
  assert.doesNotMatch(why, /<select name="likelihood"/);
  assert.match(riskPanels(state, d, h, 'p1', 'residual').toString(), /name="likelihood".*name="likelihoodWhy"/s);
  assert.match(sfarpArea(d, h, 'p1').toString(), /name="justification".*name="conclusion".*name="conditions"/s);
  assert.match(controlsSection(state, d, h, 'p1', 'Alpha').toString(), /Sprinklers/);
});
