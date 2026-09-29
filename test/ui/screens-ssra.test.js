import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { setAssessment, setRatingCell, setSfarp, setControlStatus } from '../../src/core/ops/assessment.js';
import { setControlAnalysis, linkExistingControl, updateControl, retireControl } from '../../src/core/ops/controls.js';
import { pickerView } from '../../src/ui/screens/picker.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }] };
const on = (tab) => ({ ...state, view: { name: 'hazard', id: 'h1', tab } });
/** h1 on p1 (Alpha) and p2 (Bravo); Alpha residual: personnel 4D, environment 2C; an initial personnel likelihood with a justification; SFARP written. */
function data(why = 'Seen twice a year') {
  let d = assignNumbers(seed());
  d = setRatingCell(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'personnel', value: '4D' });
  d = setRatingCell(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'environment', value: '2C' });
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

test('the platform page sets all four ratings from the table, and each hazard opens its SSRA tab', async () => {
  const { platformView } = await import('../../src/ui/screens/platforms.js');
  const out = platformView(state, data(), 'p1').toString();
  for (const k of ['initialPersonnel', 'initialEnvironment', 'residualPersonnel', 'residualEnvironment']) assert.match(out, new RegExp(`<th data-col="${k}"`));
  assert.match(out, /data-change="setRatingCell" data-hazard-id="h1" data-platform-id="p1" data-stage="residual" data-receptor="environment"[\s\S]*?<option value="2C" selected>/);
  assert.match(out, /data-action="go" data-view="hazard" data-id="h1" data-tab="p:p1"/);
});

test('the hazards list shows residual personnel and environment separately, each with a filter', async () => {
  const { hazardsView } = await import('../../src/ui/screens/hazards.js');
  const out = hazardsView(state, data()).toString();
  assert.match(out, /Alpha <span class="rx">P<\/span> <span class="band band-low">Low<\/span> <span class="rx">E<\/span> <span class="band band-serious">Serious<\/span>/);
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
  assert.match(out, /no initial personnel, initial environment rating/);
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
  assert.match(out, /data-table="existingControls"[\s\S]*?Administrative[\s\S]*?Fire drills/);
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
