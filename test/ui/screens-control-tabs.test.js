import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlView } from '../../src/ui/screens/controls.js';
import { platformView } from '../../src/ui/screens/platforms.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { setControlOwner, linkExistingControl } from '../../src/core/ops/controls.js';
import { setControlStatus } from '../../src/core/ops/assessment.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };
const on = (tab, extra = {}) => ({ ...state, view: { name: 'control', id: 'c1', tab }, ...extra });
/** c1 Sprinklers serves h1 Fire on p1 Alpha and p2 Bravo; on Alpha it is planned and owned by Acme <Fire>. */
function data() {
  let d = assignNumbers(seed());
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'planned' });
  return setControlOwner(d, act, { controlId: 'c1', platformId: 'p1', owner: 'other', ownerName: 'Acme <Fire>' });
}

test('a control page has an Overview, a tab per platform it is used on, and History', () => {
  const out = controlView(state, data(), 'c1').toString();
  assert.match(out, /<nav class="tabs">[\s\S]*?>Overview<\/button>[\s\S]*?data-tab="p:p1">Alpha<\/button>[\s\S]*?data-tab="p:p2">Bravo<\/button>[\s\S]*?History \(/);
  assert.match(out, /data-table="controlUsage"/, 'the Overview keeps the platform-agnostic detail');
});

test('a platform tab sets the owner there and lists the hazards on that platform using the control', () => {
  const out = controlView(on('p:p1'), data(), 'c1').toString();
  assert.match(out, /<select[^>]*name="owner"[^>]*aria-label="Owner on Alpha"[^>]*data-change="setControlOwner" data-control-id="c1" data-platform-id="p1">[\s\S]*?<option value="other" selected>Other<\/option>/);
  assert.match(out, /<input[^>]*name="ownerName" value="Acme &lt;Fire&gt;"[^>]*data-change="setControlOwner" data-control-id="c1" data-platform-id="p1"/);
  assert.match(out, /data-table="controlPlatformUses"[\s\S]*?H-0001[\s\S]*?Additional[\s\S]*?aria-label="Status of Sprinklers"[\s\S]*?<option value="planned" selected>/);
  assert.match(out, /data-action="go" data-view="hazard" data-id="h1" data-tab="p:p1"/);
  const bravo = controlView(on('p:p2'), data(), 'c1').toString();
  assert.match(bravo, /<option value="" selected>Not set<\/option>/);
  assert.doesNotMatch(bravo, /name="ownerName"/, 'a name box only for another party');
  assert.doesNotMatch(bravo, /<b>|Acme <Fire>/);
});

test('an existing-control use shows on the tab too, and a platform the control does not reach shows a note', () => {
  const d = linkExistingControl(data(), act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'mitigating' });
  assert.match(controlView(on('p:p1'), d, 'c1').toString(), /data-table="controlPlatformUses"[\s\S]*?Existing[\s\S]*?mitigating/);
  assert.match(controlView(on('p:nope'), d, 'c1').toString(), /not used on that platform/);
});

test('the platform page\'s controls table shows each control\'s owner there', () => {
  const out = platformView(state, data(), 'p1').toString();
  assert.match(out, /data-table="platformControls"[\s\S]*?<th data-col="owner"[\s\S]*?Acme &lt;Fire&gt;/);
});
