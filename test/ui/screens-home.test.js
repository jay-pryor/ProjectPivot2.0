import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeDetail } from '../../src/ui/screens/common.js';
import { homeView, openItemsView, homeOwnerId, changeSummary } from '../../src/ui/screens/home.js';
import { createControl, linkControl } from '../../src/core/ops/controls.js';
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

test('Open items: an owner chooser, a summary, and the four full tables', () => {
  const d = data();
  const out = openItemsView(state, d).toString();
  assert.match(out, /<h1>Open items<\/h1>/);
  assert.match(out, /data-action="go" data-view="home">← Home/);
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
  const filtered = openItemsView({ ...state, tables: { homeAcks: { filters: { who: 'nobody' } } } }, data()).toString();
  assert.doesNotMatch(filtered, /data-action="acknowledgeAll"/);
});

test('empty sections say so; everyone shows every platform', () => {
  const none = openItemsView({ ...state, homeOwner: 'u3' }, data()).toString();
  assert.match(none, /Nothing to acknowledge\./);
  assert.match(none, /No reviews due\./);
  const everyone = openItemsView({ ...state, homeOwner: 'everyone' }, data()).toString();
  assert.match(everyone, /<option value="everyone" selected>/);
  assert.match(everyone, /2 changes to acknowledge/);
});

test('before and after values are shown literally', () => {
  const out = openItemsView(state, data('<b>x</b>')).toString();
  assert.match(out, /Fire → &lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(out, /<b>x<\/b>/);
  const dash = homeView(state, data('<b>x</b>')).toString();
  assert.match(dash, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(dash, /<b>x<\/b>/);
});

test('the nav leads with Home, dotted while my platforms need attention; Home is routed', () => {
  const d = data();
  const out = renderApp({ ...state, session: { base: d, working: d, loadedStamp: null }, view: { name: 'home' } });
  assert.match(out, /<nav><button type="button" class="nav on" data-action="go" data-view="home">Home<span class="nav-dot"[^>]*><\/span><\/button>/);
  assert.match(out, /<h1>Home<\/h1>/);
});

test('a platform page says how many changes wait there, linking to Home for its owner', () => {
  const out = platformView(state, data(), 'p1').toString();
  assert.match(out, /data-action="setHomeOwner" data-owner-id="u1" data-show="home">1 change to acknowledge</);
  assert.doesNotMatch(platformView(state, assignNumbers(seed()), 'p1').toString(), /to acknowledge/);
});

test('the dashboard: four stat tiles, each opening the full lists', () => {
  const out = homeView(state, data()).toString();
  assert.match(out, /<h1>Home<\/h1>[\s\S]*?<select name="ownerId" data-change="setHomeOwner"/);
  assert.match(out, /<button type="button" class="tile" data-action="go" data-view="openItems"><b>1<\/b><span>change to acknowledge<\/span><\/button>/);
  assert.match(out, /<button type="button" class="tile bad" data-action="go" data-view="openItems"><b>1<\/b><span>review overdue<\/span>/);
  assert.match(out, /<button type="button" class="tile warn" data-action="go" data-view="openItems"><b>2<\/b><span>controls awaiting<\/span>/);
  assert.match(out, /<b>1<\/b><span>hazard unrated<\/span>/);
});

test('needs attention: most urgent first; changes acknowledged in place; the rest link to where they are dealt with', () => {
  const d = data();
  const out = homeView(state, d).toString();
  const at = (cls) => out.indexOf(`chip ${cls}`);
  assert.ok(at('chip-review') > 0 && at('chip-review') < at('chip-change') && at('chip-change') < at('chip-control') && at('chip-control') < at('chip-rating'));
  const [e] = waitingChanges(d, 'p1');
  assert.match(out, new RegExp(`data-action="acknowledge" data-entry-id="${e.id}" data-platform-id="p1">Acknowledge<`));
  assert.match(out, /data-action="go" data-view="platform" data-id="p1" data-tab="reviews">Review →/);
  assert.match(out, /<td class="what">Sprinklers <span class="muted">[^<]*<\/span><\/td>\s*<td class="by"><\/td><td class="where"><button[^>]*data-id="p1"[^>]*>Alpha</, 'each part in its own column');
  assert.match(out, /<th>Type<\/th><th>Description<\/th><th>By<\/th><th>Platform<\/th>/);
  assert.match(out, /data-action="go" data-view="openItems">Open items →/);
});

test('needs attention shows the eight most urgent and a See all link', () => {
  let d = data();
  for (const n of [3, 4, 5, 6, 7, 8]) {
    d = createControl(d, at('10:50', 'u1'), { id: `c${n}`, title: `Control ${n}` });
    d = linkControl(d, at('10:50', 'u1'), { hazardId: 'h1', controlId: `c${n}`, kind: 'preventative' });
  }
  const out = homeView(state, d).toString();
  const list = out.slice(out.indexOf('<table class="attn">'), out.indexOf('</table>', out.indexOf('<table class="attn">')));
  assert.equal((list.match(/<tr>/g) ?? []).length, 9, 'a header row and eight items');
  assert.match(out, />See all 11 →</);
});

test('coming up: reviews due in the next 90 days; nothing says so', () => {
  assert.match(homeView(state, data()).toString(), /No reviews due in the next 90 days\./);
  const d = setSchedule(data(), at('10:45', 'u2'), { platformId: 'p2', months: 6, due: '2026-10-10' });
  const out = homeView({ ...state, homeOwner: 'everyone' }, d).toString();
  const box = out.slice(out.indexOf('<ul class="upcoming">'));
  assert.match(box, /<span class="date">10 Oct 2026<\/span>[\s\S]*?Bravo[\s\S]*?Due soon/);
  assert.doesNotMatch(box.slice(0, box.indexOf('</ul>')), /Alpha/, 'an overdue review is under Needs attention, not Coming up');
});

test('my platforms: a card per platform with its review, risk bar and what is open; everyone names the owners', () => {
  const out = homeView(state, data()).toString();
  assert.match(out, /<h2 class="dash-h">My platforms<\/h2>/);
  assert.match(out, /<button type="button" class="pcard" data-action="go" data-view="platform" data-id="p1">/);
  assert.match(out, /<span class="band-uncategorised" style="flex:1" title="1 Uncategorised"><\/span>/);
  assert.match(out, /1 hazard · 2 awaiting · 1 change/);
  assert.match(out, /Due 1 Sep 2026/);
  assert.doesNotMatch(out, /data-id="p2">/, 'Bravo is Grace\'s');
  const everyone = homeView({ ...state, homeOwner: 'everyone' }, data()).toString();
  assert.match(everyone, /<h2 class="dash-h">Platforms<\/h2>/);
  assert.match(everyone, /data-id="p2">[\s\S]*?Grace/);
  assert.match(homeView({ ...state, homeOwner: 'u2' }, data()).toString(), /<h2 class="dash-h">Grace’s platforms<\/h2>/);
});

test('a change in Needs attention says its action once: a name that repeats the action runs on from it', () => {
  assert.equal(changeSummary('Set residual environment risk', 'Residual environment risk of H-0004 on Alpha'), 'Set residual environment risk of H-0004 on Alpha');
  assert.equal(changeSummary('Edit hazard', 'H-0001 Fire'), 'Edit hazard: H-0001 Fire');
  assert.equal(changeSummary('Set review notes', 'Review notes'), 'Set review notes');
  assert.equal(changeSummary('Set risk', 'Riskiest thing'), 'Set risk: Riskiest thing', 'whole words only');
  assert.equal(changeSummary('Delete hazard', ''), 'Delete hazard');
});
