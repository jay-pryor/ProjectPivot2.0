import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeDetail } from '../../src/ui/screens/common.js';
import { homeView, homeOwnerId } from '../../src/ui/screens/home.js';
import { platformView } from '../../src/ui/screens/platforms.js';
import { renderApp } from '../../src/ui/render.js';
import { initialState } from '../../src/ui/controller.js';
import { startAcks, waitingChanges } from '../../src/core/acks.js';
import { updateHazard, assignNumbers } from '../../src/core/ops/hazards.js';
import { setSchedule } from '../../src/core/ops/reviews.js';
import { seed } from '../helpers.js';

test('changeDetail: an edit as before → after, escaped; other changes as a word', () => {
  const out = changeDetail({ change: 'edited', fields: [{ field: 'title', before: '<b>x</b>', after: 'Fire' }] }).toString();
  assert.match(out, /<li><strong>title<\/strong>: &lt;b&gt;x&lt;\/b&gt; → Fire<\/li>/);
  assert.equal(String(changeDetail({ change: 'created', fields: [] })), 'Created');
});

const at = (hhmm, by) => ({ by, at: `2026-09-28T${hhmm}:00+10:00` });
const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1',
  profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }, { id: 'u3', name: 'Sam', createdAt: '' }] };
/** u3 retitles h1 (on p1 of Ada, p2 of Grace); p1 is overdue for review. */
function data(title = 'Fire (Sam)') {
  let d = startAcks(assignNumbers(seed()), at('10:30', 'u1'));
  d = setSchedule(d, at('10:40', 'u1'), { platformId: 'p1', months: 6, due: '2026-09-01' });
  return updateHazard(d, at('11:00', 'u3'), { id: 'h1', title });
}

test('homeOwnerId: me is the active profile, everyone is null', () => {
  assert.equal(homeOwnerId(state), 'u1');
  assert.equal(homeOwnerId({ ...state, homeOwner: 'everyone' }), null);
  assert.equal(homeOwnerId({ ...state, homeOwner: 'u2' }), 'u2');
});

test('Home: an owner chooser, a summary, and the four sections for my platforms', () => {
  const d = data();
  const out = homeView(state, d).toString();
  assert.match(out, /<select name="ownerId" data-change="setHomeOwner"[\s\S]*?<option value="me" selected>Me<\/option>[\s\S]*?<option value="u2">Grace<\/option>[\s\S]*?<option value="everyone">Everyone<\/option>/);
  assert.match(out, /1 change to acknowledge · 1 review overdue · 2 controls awaiting · 1 hazard unrated/);
  for (const t of ['homeAcks', 'homeReviews', 'homeAwaiting', 'homeUnrated']) assert.match(out, new RegExp(`data-table="${t}"`));
  const [e] = waitingChanges(d, 'p1');
  assert.match(out, new RegExp(`data-action="acknowledge" data-entry-id="${e.id}" data-platform-id="p1"`));
  assert.match(out, new RegExp(`data-action="acknowledgeAll" data-keys="${e.id}\\|p1"`));
  assert.match(out, /<strong>title<\/strong>: Fire → Fire \(Sam\)/);
  assert.match(out, /data-action="go" data-view="platform" data-id="p1" data-tab="reviews"/);
});

test('Acknowledge all acts on the rows shown: a filter that hides every row leaves no button', () => {
  const filtered = homeView({ ...state, tables: { homeAcks: { filters: { who: 'nobody' } } } }, data()).toString();
  assert.doesNotMatch(filtered, /data-action="acknowledgeAll"/);
});

test('empty sections say so; everyone shows every platform', () => {
  const none = homeView({ ...state, homeOwner: 'u3' }, data()).toString();
  assert.match(none, /Nothing to acknowledge\./);
  assert.match(none, /No reviews due\./);
  const everyone = homeView({ ...state, homeOwner: 'everyone' }, data()).toString();
  assert.match(everyone, /<option value="everyone" selected>/);
  assert.match(everyone, /2 changes to acknowledge/);
});

test('before and after values are shown literally', () => {
  const out = homeView(state, data('<b>x</b>')).toString();
  assert.match(out, /Fire → &lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(out, /<b>x<\/b>/);
});

test('the nav leads with Home and counts my waiting changes; Home is routed', () => {
  const d = data();
  const out = renderApp({ ...state, session: { base: d, working: d, loadedStamp: null }, view: { name: 'home' } });
  assert.match(out, /<nav><button type="button" class="nav on" data-action="go" data-view="home">Home \(1\)<\/button>/);
  assert.match(out, /<h1>Home<\/h1>/);
});

test('a platform page says how many changes wait there, linking to Home for its owner', () => {
  const out = platformView(state, data(), 'p1').toString();
  assert.match(out, /data-action="setHomeOwner" data-owner-id="u1" data-show="home">1 change to acknowledge</);
  assert.doesNotMatch(platformView(state, assignNumbers(seed()), 'p1').toString(), /to acknowledge/);
});
