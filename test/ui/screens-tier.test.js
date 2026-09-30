import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlsView, controlView } from '../../src/ui/screens/controls.js';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { platformView } from '../../src/ui/screens/platforms.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { updateControl } from '../../src/core/ops/controls.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };
/** c1 Sprinklers is Engineering; c2 Fire drills has no tier. */
const data = () => assignNumbers(updateControl(seed(), act, { id: 'c1', tier: 'Engineering' }));

test('a control page chooses its tier in place: a button per tier, the chosen one on, clicked again to clear', () => {
  const out = controlView(state, data(), 'c1').toString();
  assert.match(out, /<div class="tier-pick" role="radiogroup" aria-labelledby="tier-label">/);
  assert.match(out, /role="radio" aria-checked="true" class="on"[^>]*data-action="updateControl" data-id="c1" data-tier="">Engineering</);
  assert.match(out, /role="radio" aria-checked="false"\s+data-action="updateControl" data-id="c1" data-tier="PPE">PPE</);
  const none = controlView(state, data(), 'c2').toString();
  assert.doesNotMatch(none, /aria-checked="true"/);
  assert.match(none, /<span class="muted">Not set<\/span>/);
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
  const p = platformView(state, data(), 'p1').toString();
  assert.match(p, /data-table="platformControls"[\s\S]*?<th data-col="tier"[\s\S]*?Engineering/);
});
