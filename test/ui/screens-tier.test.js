import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlsView, controlView } from '../../src/ui/screens/controls.js';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { platformView } from '../../src/ui/screens/platforms.js';
import { initialState } from '../../src/ui/controller.js';
import { shell } from '../../src/ui/screens/common.js';
import { html } from '../../src/ui/html.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { updateControl } from '../../src/core/ops/controls.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };
/** c1 Sprinklers is Engineering; c2 Fire drills has no tier. */
const data = () => assignNumbers(updateControl(seed(), act, { id: 'c1', tier: 'Engineering' }));

test('a control page shows only its tier until clicked, then every tier slides out; the chosen one, clicked again, clears', () => {
  const out = controlView(state, data(), 'c1').toString();
  assert.match(out, /class="tier-current"[^>]*data-action="startEdit" data-kind="tier" data-id="c1"><span id="tier-now">Engineering<\/span>/);
  assert.doesNotMatch(out, /tier-pick/);
  const open = controlView({ ...state, editing: { kind: 'tier', id: 'c1' } }, data(), 'c1').toString();
  assert.match(open, /<div class="tier-pick open" role="radiogroup" aria-labelledby="tier-label" data-reveal="tier:c1">/);
  assert.match(open, /role="radio" style="--i: \d" aria-checked="true" class="on"[^>]*data-action="updateControl" data-id="c1" data-tier="">Engineering</);
  assert.match(open, /role="radio" style="--i: \d" aria-checked="false"\s+data-action="updateControl" data-id="c1" data-tier="PPE">PPE</);
  assert.match(open, /class="tier-close"[^>]*data-action="cancelEdit"/);
  const none = controlView(state, data(), 'c2').toString();
  assert.match(none, /class="tier-current unset"[\s\S]*?<span id="tier-now">Not set<\/span>/);
});

test('control, hazard and platform pages head with their number and the page you are on', () => {
  assert.match(controlView(state, data(), 'c1').toString(), /<h1 class="doc-page"><span class="doc-id">C-001<\/span> <span class="doc-page-sep" aria-hidden="true">—<\/span> Overview<\/h1>[\s\S]*?<span class="field-label">Control<\/span>/);
  assert.match(controlView({ ...state, view: { name: 'control', id: 'c1', tab: 'history' } }, data(), 'c1').toString(), /C-001<\/span> <span[^>]*>—<\/span> History<\/h1>/);
  const h = hazardView({ ...state, view: { name: 'hazard', id: 'h1', tab: 'p:p1' } }, data(), 'h1').toString();
  assert.match(h, /HAZ-001<\/span> <span[^>]*>—<\/span> Alpha<\/h1>[\s\S]*?<span class="field-label">Hazard<\/span>/);
  assert.match(platformView({ ...state, view: { name: 'platform', id: 'p1', tab: 'reviews' } }, data(), 'p1').toString(), /<span class="doc-id">[^<]+<\/span> <span[^>]*>—<\/span> Reviews<\/h1>[\s\S]*?<span class="field-label">Platform<\/span>/);
  assert.doesNotMatch(h, /class="back"/, 'the page leaves Back to the shell');
  const back = shell({ ...state, view: { name: 'hazard', id: 'h1' }, viewHistory: [{ name: 'platform', id: 'p1' }], session: { base: data(), working: data(), loadedStamp: null } }, html``).toString();
  assert.match(back, /<button type="button" class="back" data-action="goBack" title="Back to P-001 — Details"><span aria-hidden="true">←<\/span> Back<span class="back-to"> to P-001 — Details<\/span><\/button>/, 'a numbered record\'s page by its own title');
  assert.match(shell({ ...state, view: { name: 'hazards' } }, html``).toString(), /class="back" data-action="goBack" disabled/, 'nothing to go back to yet');
});

test('the Controls list has a Tier column that filters, including not set', () => {
  const out = controlsView(state, data()).toString();
  assert.match(out, /<th data-col="tier"/);
  assert.match(out, /<option value="none">Not set<\/option>/);
  const eng = controlsView({ ...state, tables: { controls: { filters: { tier: 'Engineering' } } } }, data()).toString();
  assert.match(eng, /Sprinklers/);
  assert.doesNotMatch(eng, /Fire drills/);
  const none = controlsView({ ...state, tables: { controls: { filters: { tier: 'none' } } } }, data()).toString();
  assert.match(none, /Fire drills/);
  assert.doesNotMatch(none, /Sprinklers/);
});

test('hazard and platform pages show each control\'s tier beside its kind', () => {
  const h = hazardView(state, data(), 'h1').toString();
  assert.match(h, /data-table="hazardControls"[\s\S]*?<th data-col="tier"[\s\S]*?Engineering/);
  const p = platformView({ ...state, sections: { platform: 'controls' } }, data(), 'p1').toString();
  assert.match(p, /data-table="platformControls"[\s\S]*?<th data-col="tier"[\s\S]*?Engineering/);
});
