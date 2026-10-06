import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformsView, platformView } from '../../src/ui/screens/platforms.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { confirmControl, excludeControl, setRating } from '../../src/core/ops/assessment.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }], profileId: 'u1' };
function data() {
  let d = assignNumbers(seed());
  d = confirmControl(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  d = excludeControl(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', reason: 'No crew <aboard>' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 2, likelihood: 'C' });
  return d;
}

test('the platform list names each owner, filters by owner and status in its header, and adds with a +', () => {
  const out = platformsView(state, data()).toString();
  assert.match(out, /Alpha/);
  assert.match(out, /Grace/);
  assert.match(out, /data-change="filterTable" data-table="platforms" data-key="owner"/);
  const g = platformsView({ ...state, tables: { platforms: { filters: { owner: 'u2' } } } }, data()).toString();
  assert.match(g, /data-row="p2"/);
  assert.doesNotMatch(g, /data-row="p1"/);
  const adding = platformsView({ ...state, editing: { kind: 'newPlatform', id: 'new' } }, data()).toString();
  assert.match(adding, /<select name="ownerId"/);
});

test('a platform page: the name applies when left, the owner in a sentence, retire and delete at the bottom, History as a tab', () => {
  const out = platformView(state, data(), 'p1').toString();
  assert.doesNotMatch(out, />Rename</);
  assert.match(out, /<input class="doc-title small" name="name" value="Alpha" required[^>]*data-change="updatePlatform" data-id="p1"/);
  assert.match(out, /Owned by <select[^>]*data-change="setOwner" data-id="p1"/);
  assert.ok(out.lastIndexOf('data-action="retirePlatform"') > out.lastIndexOf('</table>'));
  assert.match(out, /data-tab="history"/);
  const controls = platformView({ ...state, sections: { platform: 'controls' } }, data(), 'p1').toString();
  assert.match(controls, /No crew &lt;aboard&gt;/, 'reasons are shown escaped');
  assert.match(controls, /Ada, 2026-09-28 10:00/, 'who confirmed, and when');
});

test('a platform\'s History tab shows every change that reached it', () => {
  const out = platformView({ ...state, view: { name: 'platform', id: 'p1', tab: 'history' } }, data(), 'p1').toString();
  assert.match(out, /data-table="history"/);
  assert.match(out, /Set residual rating/);
  assert.match(out, /Set control to rejected/);
});

test('the platform\'s controls table has the control ID and the control name in columns of their own', async () => {
  const { platformView } = await import('../../src/ui/screens/platforms.js');
  const { initialState } = await import('../../src/ui/controller.js');
  const { assignNumbers } = await import('../../src/core/ops/hazards.js');
  const { seed } = await import('../helpers.js');
  const st = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };
  const out = platformView({ ...st, sections: { platform: 'controls' } }, assignNumbers(seed()), 'p1').toString();
  const table = out.slice(out.indexOf('data-table="platformControls"'));
  const heads = [...table.split('</thead>')[0].matchAll(/<th data-col="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(heads.slice(0, 2), ['id', 'control']);
  assert.match(table, /<td><button type="button" class="link" data-action="go" data-view="control" data-id="c1">C-001<\/button><\/td><td><button type="button" class="link" data-action="go" data-view="control" data-id="c1">Sprinklers<\/button><\/td>/);
});
