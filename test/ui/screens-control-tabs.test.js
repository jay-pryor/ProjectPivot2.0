import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlView } from '../../src/ui/screens/controls.js';
import { platformView } from '../../src/ui/screens/platforms.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { setImplementedBy, removeControlHere, setControlKindOnPlatform } from '../../src/core/ops/controls.js';
import { setControlStatus } from '../../src/core/ops/assessment.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };
const on = (tab, extra = {}) => ({ ...state, view: { name: 'control', id: 'c1', tab }, ...extra });
/** c1 Sprinklers serves h1 Fire on p1 Alpha and p2 Bravo; on Alpha it is planned and implemented by the customer. */
function data() {
  let d = assignNumbers(seed());
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'planned' });
  return setImplementedBy(d, act, { controlId: 'c1', platformId: 'p1', implementedBy: 'customer' });
}

test('a control page has an Overview, a tab per platform it is used on, and History', () => {
  const out = controlView(state, data(), 'c1').toString();
  assert.match(out, /<nav class="tabs">[\s\S]*?>Overview<\/button>[\s\S]*?data-tab="p:p1">Alpha<\/button>[\s\S]*?data-tab="p:p2">Bravo<\/button>[\s\S]*?History \(/);
  assert.match(out, /data-table="controlUsage"/, 'the Overview keeps the platform-agnostic detail');
});

test('a platform tab sets who implements it there and lists the hazards on that platform using the control', () => {
  const out = controlView(on('p:p1'), data(), 'c1').toString();
  assert.match(out, /<select class="quiet" name="implementedBy" aria-label="Who implements Sprinklers on Alpha" data-change="setImplementedBy" data-control-id="c1" data-platform-id="p1"><option value="">Not set<\/option><option value="oem">OEM<\/option><option value="highcom">HighCom<\/option><option value="customer" selected>Customer<\/option><\/select>/);
  assert.doesNotMatch(out, /name="owner"|name="ownerName"/, 'no owner any more');
  assert.match(out, /data-table="controlPlatformUses"[\s\S]*?HAZ-001[\s\S]*?aria-label="Status of Sprinklers"[\s\S]*?<option value="planned" selected>Planned<\/option>/);
  assert.doesNotMatch(out, />(Additional|Existing)</, 'no role column');
  assert.match(out, /data-action="go" data-view="hazard" data-id="h1" data-tab="p:p1"/);
  const bravo = controlView(on('p:p2'), data(), 'c1').toString();
  assert.match(bravo, /name="implementedBy"[^>]*><option value="" selected>Not set<\/option>/);
});

test('its kind on a platform shows on the tab, and a platform the control was taken off, or never reached, shows a note', () => {
  let d = setControlKindOnPlatform(data(), act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', kind: 'mitigating' });
  assert.match(controlView(on('p:p1'), d, 'c1').toString(), /data-table="controlPlatformUses"[\s\S]*?<td>mitigating<\/td>/);
  assert.match(controlView(on('p:nope'), d, 'c1').toString(), /not used on that platform/);
  d = removeControlHere(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p2' });
  assert.match(controlView(on('p:p2'), d, 'c1').toString(), /not used on that platform/);
  assert.doesNotMatch(controlView(state, d, 'c1').toString(), /data-tab="p:p2"/, 'no tab for a platform it was taken off');
});

test('the platform page\'s controls table shows who implements each control there', () => {
  const out = platformView({ ...state, sections: { platform: 'controls' } }, data(), 'p1').toString();
  assert.match(out, /data-table="platformControls"[\s\S]*?<th data-col="implementedBy"[\s\S]*?data-change="setImplementedBy" data-control-id="c1" data-platform-id="p1">[\s\S]*?<option value="customer" selected>Customer<\/option>/);
  assert.doesNotMatch(out, /data-col="owner"/);
});

test('Implemented by changes in History say which platform, which control, and who implements it', () => {
  let d = setImplementedBy(data(), act, { controlId: 'c1', platformId: 'p2', implementedBy: 'highcom' });
  d = setImplementedBy(d, act, { controlId: 'c1', platformId: 'p2', implementedBy: 'oem' });
  d = setImplementedBy(d, act, { controlId: 'c1', platformId: 'p2', implementedBy: '' });
  const out = controlView(on('history'), d, 'c1').toString();
  assert.match(out, /Alpha · Sprinklers<\/span> <strong>Set implemented by<\/strong>: Customer/);
  assert.match(out, /Bravo · Sprinklers<\/span> <strong>Set implemented by<\/strong>: HighCom/);
  assert.match(out, /Bravo · Sprinklers<\/span> <ul class="plain"><li><strong>Changed implemented by<\/strong>: HighCom → OEM/);
  assert.match(out, /Bravo · Sprinklers<\/span> <strong>Cleared implemented by<\/strong>/);
});

test('a control\'s Overview is a dashboard: the control, its use, a tile per platform, and a menu of its tables', () => {
  const out = controlView(state, data(), 'c1').toString();
  assert.match(out, /aria-label="Control">[\s\S]*?id="tier-label">Control Tier[\s\S]*?name="description"/);
  assert.match(out, /aria-label="Use">[\s\S]*?<strong>1<\/strong> hazard it applies to[\s\S]*?<strong>2<\/strong> platforms[\s\S]*?<span class="tag state-recommended">1 Recommended<\/span> <span class="tag state-planned">1 Planned<\/span>/);
  assert.match(out, /<button type="button" class="dash-card plat-card" title="Open Sprinklers on Alpha" data-action="go" data-view="control" data-id="c1" data-tab="p:p1">[\s\S]*?Implemented by on this platform[\s\S]*?Customer[\s\S]*?<b>1<\/b> hazard <span class="glance-tags"><span class="tag state-planned">1 Planned/);
  assert.deepEqual([...out.matchAll(/data-page="control" data-section="(\w+)"/g)].map((m) => m[1]), ['usage', 'references'], 'where it applies, and its references');
  assert.match(out, /<span class="field-label">Control<\/span>/, 'no additional or existing label');
});

test('a control\'s platform tab has who implements it and its use there on cards above the table', () => {
  const out = controlView(on('p:p1'), data(), 'c1').toString();
  assert.match(out, /<article class="doc dash">[\s\S]*?Implemented by on Alpha<\/h3>[\s\S]*?On Alpha<\/h3>[\s\S]*?<strong>1<\/strong> hazard uses it[\s\S]*?data-table="controlPlatformUses"/);
});

test('a platform\'s Details are a dashboard: the platform, its worst risks, its controls, and a menu of its tables', () => {
  const out = platformView(state, data(), 'p1').toString();
  assert.match(out, /aria-label="Platform">[\s\S]*?Owned by <select[\s\S]*?No review schedule[\s\S]*?Reviews →/);
  assert.match(out, /aria-label="Risk">[\s\S]*?<strong>1<\/strong> hazard[\s\S]*?1 not rated/);
  assert.match(out, /aria-label="Controls">[\s\S]*?<strong>2<\/strong> controls/);
  assert.doesNotMatch(out, /existing|additional/i, 'one kind of control');
  assert.deepEqual([...out.matchAll(/data-page="platform" data-section="(\w+)"/g)].map((m) => m[1]), ['hazards', 'controls', 'references']);
  assert.match(out, /data-table="platformHazards"/, 'Hazards open by default');
  assert.match(out, /<tr data-row="h1" data-dblclick="go" data-view="hazard" data-id="h1" data-tab="p:p1">[\s\S]*?<button type="button" class="link" data-action="go" data-view="hazard" data-id="h1" data-tab="p:p1">/, 'the hazard on this platform opens from its name, or a double-click on its row');
  assert.match(out, /<span class="cell-text" data-dblclick="startEdit" data-kind="reportId" data-id="h1"/, 'except on its Report ID, which a double-click changes');
});
