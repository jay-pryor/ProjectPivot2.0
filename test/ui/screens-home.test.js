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
import { seed, scheduleFixed } from '../helpers.js';

test('changeDetail: an edit as before → after, escaped; other changes as a word', () => {
  const out = changeDetail({ change: 'edited', fields: [{ field: 'title', before: '<b>x</b>', after: 'Fire' }] }).toString();
  assert.match(out, /<li><strong>Changed title<\/strong>: &lt;b&gt;x&lt;\/b&gt; → Fire<\/li>/);
  assert.match(changeDetail({ change: 'edited', fields: [{ field: 'consequenceWhy', before: null, after: 'Burns' }] }).toString(), /<li><details class="long-change"><summary><strong>Set consequence justification<\/strong><\/summary><div class="text-new">Burns<\/div><\/details><\/li>/, 'a justification: what was done, its text folded away');
  assert.match(changeDetail({ change: 'edited', fields: [{ field: 'likelihoodWhy', before: 'Rare', after: '' }] }).toString(), /<summary><strong>Cleared likelihood justification<\/strong><\/summary><div class="text-old">Rare<\/div>/, 'Cleared, and what it was, folded');
  const changed = changeDetail({ change: 'edited', fields: [{ field: 'justification', before: 'The guard is fitted on every unit', after: 'The guard is checked on every unit' }] }).toString();
  assert.match(changed, /<summary><strong>Changed justification<\/strong><\/summary><div class="text-old">The guard is <mark class="diff-out">fitted<\/mark> on every unit<\/div><div class="text-arrow" aria-label="became">↓<\/div><div class="text-new">The guard is <mark class="diff-in">checked<\/mark> on every unit<\/div>/, 'old, an arrow on its own line, new; only the word changed is marked');
  assert.match(changeDetail({ change: 'edited', fields: [{ field: 'docNumber', before: 'A1', after: 'A2' }, { field: 'file', before: null, after: { name: 'SC.pdf', stored: 'files/r/1-ab-SC.pdf' } }] }).toString(), /Changed document number<\/strong>: A1 → A2[\s\S]*?Set file<\/strong>: SC\.pdf/, 'a file by its name, not raw data');
  assert.equal(String(changeDetail({ change: 'created', fields: [] })), 'Created');
});

const at = (hhmm, by) => ({ by, at: `2026-09-28T${hhmm}:00+10:00` });
const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1',
  profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }, { id: 'u3', name: 'Sam', createdAt: '' }] };
/** u3 retitles h1 (on p1 of Ada, p2 of Grace); p1 is overdue for review. */
function data(title = 'Fire (Sam)') {
  let d = startAcks(assignNumbers(seed()), at('10:30', 'u1'));
  d = scheduleFixed(d, 'p1', 6, '2026-09-01', at('10:40', 'u1'));
  return updateHazard(d, at('11:00', 'u3'), { id: 'h1', title });
}

test('homeOwnerId: me is the active profile, everyone is null', () => {
  assert.equal(homeOwnerId(state), 'u1');
  assert.equal(homeOwnerId({ ...state, homeOwner: 'everyone' }), null);
  assert.equal(homeOwnerId({ ...state, homeOwner: 'u2' }), 'u2');
});

test('Open items: an owner chooser, a summary, and the four full tables', () => {
  const d = data();
  const out = ['acks', 'reviews', 'awaiting', 'unrated'].map((x) => openItemsView({ ...state, sections: { openItems: x } }, d).toString()).join('\n');
  assert.match(out, /<h1>Open items<\/h1>/);
  assert.match(out, /<select name="ownerId" data-change="setHomeOwner"[\s\S]*?<option value="me" selected>Me<\/option>[\s\S]*?<option value="u2">Grace<\/option>[\s\S]*?<option value="everyone">Everyone<\/option>/);
  assert.match(out, /<b>1<\/b><span>change to acknowledge<\/span>[\s\S]*?<b>1<\/b><span>review overdue<\/span>[\s\S]*?<b>2<\/b><span>controls awaiting status decision<\/span>[\s\S]*?<b>1<\/b><span>hazard unrated<\/span>/);
  assert.match(out, /class="tile warn on" data-action="showSection" data-page="openItems" data-section="acks" data-keep="true"/, 'a tile opens its section, its count highlighted');
  assert.deepEqual([...openItemsView(state, d).toString().matchAll(/class="rail-item[^"]*"[^>]*data-section="(\w+)"/g)].map((m) => m[1]), ['acks', 'reviews', 'awaiting', 'implement', 'unrated']);
  for (const t of ['homeAcks', 'homeReviews', 'homeAwaiting', 'homeUnrated']) assert.match(out, new RegExp(`data-table="${t}"`));
  const [e] = waitingChanges(d, 'p1');
  assert.match(out, new RegExp(`data-action="acknowledge" data-entry-id="${e.id}" data-platform-id="p1"`));
  assert.match(out, new RegExp(`data-action="acknowledgeAll" data-keys="${e.id}\\|p1"`));
  assert.match(out, /<strong>Changed title<\/strong>: Fire → Fire \(Sam\)/);
  assert.match(out, /data-action="go" data-view="platformReview" data-id="p1"/);
});

test('Open items: a double-click on a row goes where it is dealt with; reviews start from their table; statuses are chosen in place', () => {
  const d = data();
  const show = (x, extra = {}) => openItemsView({ ...state, ...extra, sections: { openItems: x } }, d).toString();
  const [e] = waitingChanges(d, 'p1');
  assert.match(show('acks'), new RegExp(`<tr data-row="${e.id}\\|p1" data-dblclick="go" data-view="platform" data-id="p1" data-tab="history">`), 'a change opens the platform\'s history');
  const reviews = show('reviews');
  assert.match(reviews, /<tr data-row="p1" data-dblclick="go" data-view="platformReview" data-id="p1">[\s\S]*?data-action="beginReview" data-platform-id="p1">Start review<\/button>/);
  const awaiting = show('awaiting');
  assert.match(awaiting, /<h2>Controls awaiting a status decision<\/h2>/);
  assert.match(awaiting, /<tr data-row="p1\|h1\|c1" data-dblclick="go" data-view="control" data-id="c1" data-tab="p:p1">[\s\S]*?<select class="quiet state-select state-recommended" name="value"[^>]*data-change="setControlState" data-hazard-id="h1" data-control-id="c1" data-platform-id="p1">/);
  assert.match(show('awaiting', { editing: { kind: 'rejection', id: 'h1|c1|p1' } }), /data-change="rejectControl" data-hazard-id="h1" data-control-id="c1" data-platform-id="p1"/, 'Rejected asks why, in the row');
  assert.match(show('unrated'), /<tr data-row="p1\|h1" data-dblclick="go" data-view="hazard" data-id="h1" data-tab="p:p1">/);
});

test('Acknowledge all acts on the rows shown: a filter that hides every row leaves no button', () => {
  const filtered = openItemsView({ ...state, tables: { homeAcks: { filters: { who: 'nobody' } } } }, data()).toString();
  assert.doesNotMatch(filtered, /data-action="acknowledgeAll"/);
});

test('empty sections say so; everyone shows every platform', () => {
  const none = openItemsView({ ...state, homeOwner: 'u3' }, data()).toString();
  assert.match(none, /Nothing to acknowledge\./);
  assert.match(openItemsView({ ...state, homeOwner: 'u3', sections: { openItems: 'reviews' } }, data()).toString(), /No reviews due\./);
  const everyone = openItemsView({ ...state, homeOwner: 'everyone' }, data()).toString();
  assert.match(everyone, /<option value="everyone" selected>/);
  assert.match(everyone, /<b>2<\/b><span>changes to acknowledge/);
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
  assert.match(out, /<button type="button" class="tile warn" data-action="go" data-view="openItems"><b>1<\/b><span>change to acknowledge<\/span><\/button>/, 'any count above nought is highlighted');
  assert.match(out, /<button type="button" class="tile bad" data-action="go" data-view="openItems"><b>1<\/b><span>review overdue<\/span>/);
  assert.match(out, /<button type="button" class="tile warn" data-action="go" data-view="openItems"><b>2<\/b><span>controls awaiting status decision<\/span>/);
  assert.match(out, /<button type="button" class="tile" data-action="go" data-view="openItems"><b>0<\/b><span>controls to implement<\/span>/, 'nought stays plain');
  assert.match(out, /<b>1<\/b><span>hazard unrated<\/span>/);
});

test('needs attention: most urgent first; changes acknowledged in place; the rest link to where they are dealt with', () => {
  const d = data();
  const out = homeView(state, d).toString();
  const at = (cls) => out.indexOf(`chip ${cls}`);
  assert.ok(at('chip-review') > 0 && at('chip-review') < at('chip-change') && at('chip-change') < at('chip-control') && at('chip-control') < at('chip-rating'));
  const [e] = waitingChanges(d, 'p1');
  assert.match(out, new RegExp(`data-action="acknowledge" data-entry-id="${e.id}" data-platform-id="p1">Acknowledge<`));
  assert.match(out, /data-action="go" data-view="platformReview" data-id="p1">Review →/);
  assert.match(out, /<td class="what"><strong>Decide on (C-\d+|Sprinklers) status for (HAZ-\d+|Fire[^<]*)<\/strong> <span class="muted">· Sprinklers · [^<]*<\/span><\/td>\s*<td class="by"><\/td><td class="where"><button[^>]*data-id="p1"[^>]*>Alpha</, 'what is to be done first, each part in its own column');
  assert.match(out, /data-action="go" data-view="control" data-id="c1" data-tab="p:p1">Decide →/, 'Decide opens the control\'s page for that platform, where its status is set');
  assert.match(out, /<tr data-key="review\|p1" data-dblclick="go" data-view="platformReview" data-id="p1">/, 'a double-click on a row goes where its button does');
  assert.match(out, /<tr data-key="rating\|p1\|h1" data-dblclick="go" data-view="hazard" data-id="h1" data-tab="p:p1">[\s\S]*?data-view="hazard" data-id="h1" data-tab="p:p1">Rate →/, 'ratings are set on the hazard\'s page for the platform');
  assert.match(out, /<th>Type<\/th><th>Description<\/th><th>By<\/th><th>Platform<\/th>/);
  assert.match(out, /data-action="go" data-view="openItems">Open items →/);
});

test('needs attention draws its items, each keyed so it can slide when one goes, in a fixed-height panel the browser fits them to', () => {
  let d = data();
  for (const n of [3, 4, 5, 6, 7, 8]) {
    d = createControl(d, at('10:50', 'u1'), { id: `c${n}`, title: `Control ${n}` });
    d = linkControl(d, at('10:50', 'u1'), { hazardId: 'h1', controlId: `c${n}`, kind: 'preventative' });
  }
  const out = homeView(state, d).toString();
  const list = out.slice(out.indexOf('<table class="attn">'), out.indexOf('</table>', out.indexOf('<table class="attn">')));
  assert.equal((list.match(/<tr data-key="/g) ?? []).length, 11, 'every item, up to the most it draws');
  assert.match(list, /<tr data-key="control\|p1\|h1\|c3" data-dblclick="go" data-view="control" data-id="c3" data-tab="p:p1">/);
  assert.match(out, /<section class="panel attn-panel"><h2>Needs attention<\/h2>\s*<div class="attn-fit"><table class="attn">/);
  assert.match(out, /<div class="panel-more" data-attn-more="" data-total="11"><button[^>]*>Open items →/, 'the browser says See all 11 when some do not fit');
});

test('coming up: reviews due in the next 90 days; nothing says so', () => {
  assert.match(homeView(state, data()).toString(), /No reviews due in the next 90 days\./);
  const d = scheduleFixed(data(), 'p2', 6, '2026-10-10', at('10:45', 'u2'));
  const out = homeView({ ...state, homeOwner: 'everyone' }, d).toString();
  const box = out.slice(out.indexOf('<table class="attn upcoming-table">'));
  const table = box.slice(0, box.indexOf('</table>'));
  assert.match(table, /<th>Scheduled<\/th><th>Platform<\/th><th>Working days left<\/th>/);
  // From Monday 28 September to Saturday 10 October: nine working days.
  assert.match(table, /<td class="date">10 Oct 2026<\/td>\s*<td>[\s\S]*?Bravo[\s\S]*?<td class="days">9<\/td>\s*<td class="act"><button type="button" class="small" data-action="beginReview" data-platform-id="p2">Start review<\/button>/);
  assert.doesNotMatch(table, /Due soon/, 'no Due soon tag');
  assert.doesNotMatch(table, /Alpha/, 'an overdue review is under Needs attention, not Coming up');
});

test('coming up looks as far ahead as the menu beside its heading says: 90 days unless chosen', () => {
  const d = scheduleFixed(data(), 'p2', 6, '2026-10-10', at('10:45', 'u2'));
  const as = (prefs) => ({ ...state, homeOwner: 'everyone', profiles: state.profiles.map((p) => (p.id === 'u1' ? { ...p, prefs } : p)) });
  const out = homeView(as({}), d).toString();
  assert.match(out, /<h2>Coming up<\/h2><select class="window-pick" name="days" aria-label="How far ahead Coming up looks" data-change="setComingUpDays">[\s\S]*?<option value="90" selected>Next 90 days<\/option>[\s\S]*?Next 12 months<\/option>/);
  assert.match(out, /upcoming-table[\s\S]*?Bravo/);
  const week = homeView(as({ comingUpDays: 7 }), d).toString();
  assert.match(week, /<option value="7" selected>Next 7 days<\/option>/);
  assert.match(week, /No reviews due in the next 7 days\./, 'Bravo is twelve days away');
  assert.match(homeView(as({ comingUpDays: 45 }), d).toString(), /<option value="90" selected>/, 'a window not on the menu is 90 days');
});

test('my platforms: a card per platform with its review, risk bar and what is open; everyone names the owners', () => {
  const out = homeView(state, data()).toString();
  assert.match(out, /<h2 class="dash-h">My platforms<\/h2>/);
  assert.match(out, /<button type="button" class="pcard" data-action="go" data-view="platform" data-id="p1">/);
  assert.match(out, /<span class="band-uncategorised" style="flex:1" title="1 Uncategorised"><\/span>/);
  assert.match(out, /1 hazard · 2 awaiting status decision · 1 change/);
  assert.match(out, /Due 1 Sep 2026/);
  assert.doesNotMatch(out, /data-id="p2">/, 'Bravo is Grace\'s');
  const everyone = homeView({ ...state, homeOwner: 'everyone' }, data()).toString();
  assert.match(everyone, /<h2 class="dash-h">Platforms<\/h2>/);
  assert.match(everyone, /data-id="p2">[\s\S]*?Grace/);
  assert.match(homeView({ ...state, homeOwner: 'u2' }, data()).toString(), /<h2 class="dash-h">Grace’s platforms<\/h2>/);
});

test('a change in Needs attention says its action once: a name that repeats the action runs on from it', () => {
  assert.equal(changeSummary('Set residual environment risk', 'Residual environment risk of HAZ-004 on Alpha'), 'Set residual environment risk of HAZ-004 on Alpha');
  assert.equal(changeSummary('Edit hazard', 'HAZ-001 Fire'), 'Edit hazard: HAZ-001 Fire');
  assert.equal(changeSummary('Set review notes', 'Review notes'), 'Set review notes');
  assert.equal(changeSummary('Set risk', 'Riskiest thing'), 'Set risk: Riskiest thing', 'whole words only');
  assert.equal(changeSummary('Delete hazard', ''), 'Delete hazard');
});

test('Home: Coming up over Favourite pages beside Needs attention; numbered favourites open their page, and a star takes one off', async () => {
  const { shell } = await import('../../src/ui/screens/common.js');
  const { html } = await import('../../src/ui/html.js');
  const d = data();
  const favourites = [{ name: 'hazard', id: 'h1' }, { name: 'hazard', id: 'h1', tab: 'p:p2' }, { name: 'controls', id: null }, { name: 'platform', id: 'gone' }];
  const as = (prefs, extra = {}) => ({ ...state, ...extra, session: { base: d, working: d }, profiles: state.profiles.map((p) => (p.id === 'u1' ? { ...p, prefs: { favourites, ...prefs } } : p)) });
  const out = homeView(as({}), d).toString();
  assert.match(out, /<div class="dash-stack">\s*<section class="panel stack-panel"><div class="panel-head coming-up-head"><h2>Coming up<\/h2><select class="window-pick"[\s\S]*?<section class="panel stack-panel fav-panel" aria-label="Favourite pages">\s*<div class="panel-head"><h2>Favourite pages<\/h2><details class="dots-menu">/);
  assert.match(out, /role="menuitemradio" aria-checked="true" data-action="setFavouriteLayout" data-layout="table">[\s\S]*?Table<\/button>[\s\S]*?Small blocks[\s\S]*?Large blocks[\s\S]*?data-action="toggleFavouriteEdit"[^>]*>[\s\S]*?Edit order/);
  assert.match(out, /<li class="fav"><span class="fav-num">1<\/span>\s*<div class="fav-main" role="link" tabindex="0" data-action="go" data-view="hazard" data-id="h1"><span class="fav-name">HAZ-001 Fire \(Sam\)<\/span><span class="fav-kind">Hazard<\/span><\/div><button type="button" class="fav-star on"[^>]*data-action="toggleFavourite" data-page="hazard" data-id="h1" data-tab="">/);
  assert.match(out, /<span class="fav-num">2<\/span>\s*<div class="fav-main" role="link" tabindex="0" data-action="go" data-view="hazard" data-id="h1" data-tab="p:p2"><span class="fav-name">HAZ-001 Fire \(Sam\) · Bravo<\/span><span class="fav-kind">Hazard on a platform<\/span>/, 'a page within a page');
  assert.match(out, /<li class="fav gone"><span class="fav-num">4<\/span>\s*<div class="fav-main"><span class="fav-name muted">A deleted platform<\/span>/, 'gone: no link, but its star still takes it off');
  assert.match(homeView(state, d).toString(), /No favourites yet/);
  // Edit order: each draggable, with a grip, and nothing opens while editing.
  const editing = homeView(as({}, { favouritesEditing: true }), d).toString();
  assert.match(editing, /<section class="panel stack-panel fav-panel editing"[\s\S]*?Drag to reorder[\s\S]*?<li class="fav" draggable="true" data-fav-index="0"><span class="fav-grip"/);
  assert.doesNotMatch(editing.slice(editing.indexOf('class="favs"'), editing.indexOf('</ol>', editing.indexOf('class="favs"'))), /data-action="go"/);
  // Blocks: small ones in one wrapping row; large ones share the box out in rows.
  const small = homeView(as({ favouriteLayout: 'small' }), d).toString();
  assert.match(small, /<div class="fav-blocks small"><div class="fav-row">(?:[\s\S]*?<div class="fav-block[^"]*"){4}/);
  assert.equal((homeView(as({ favouriteLayout: 'large' }), d).toString().match(/class="fav-row"/g) ?? []).length, 2, 'four: two by two');
  // The star beside Back: for the page and tab open; none on Home.
  const page = (view) => shell({ ...as({}), view }, html``).toString();
  assert.match(page({ name: 'hazard', id: 'h1', tab: 'p:p2' }), /<button type="button" class="fav-star on" aria-pressed="true"[^>]*data-page="hazard" data-id="h1" data-tab="p:p2">/);
  assert.match(page({ name: 'hazard', id: 'h1', tab: 'history' }), /class="fav-star" aria-pressed="false"/);
  assert.doesNotMatch(page({ name: 'home' }), /fav-star/);
});

test('a favourite block is titled with the page\'s own heading, its record\'s name beneath', async () => {
  const d = data();
  const favourites = [{ name: 'hazard', id: 'h1', tab: 'p:p2' }, { name: 'platform', id: 'p1' }, { name: 'controls', id: null }];
  const me = { ...state, session: { base: d, working: d }, profiles: state.profiles.map((p) => (p.id === 'u1' ? { ...p, prefs: { favourites, favouriteLayout: 'small' } } : p)) };
  const out = homeView(me, d).toString();
  assert.match(out, /<span class="fav-heading">HAZ-001 — Bravo<\/span><span class="fav-name">Fire \(Sam\)<\/span><span class="fav-kind">Hazard on a platform<\/span>/);
  assert.match(out, /<span class="fav-heading">P-001 — Details<\/span><span class="fav-name">Alpha<\/span>/);
  assert.match(out, /<span class="fav-heading">Controls<\/span>[\s\S]*?<span class="fav-kind">Page<\/span>/);
});

test('Home\'s tiles start with the total of open items: not a button, and the same count as Needs attention', () => {
  const out = homeView(state, data()).toString();
  const total = /<div class="tile tile-total" role="status"[^>]*><b>(\d+)<\/b><span>open items? in total<\/span><\/div>/.exec(out);
  assert.ok(total, 'the total, first');
  assert.ok(out.indexOf('tile-total') < out.indexOf('changes to acknowledge') || out.indexOf('tile-total') < out.indexOf('change to acknowledge'));
  assert.match(out, new RegExp(`data-total="${total[1]}"`), 'as many as Needs attention lists');
});

test('Open items starts its counts with the same total of open items as Home', () => {
  const d = data();
  const home = /tile-total"[^>]*><b>(\d+)<\/b>/.exec(homeView(state, d).toString());
  const open = /<div class="tiles">\s*<div class="tile tile-total" role="status"[^>]*><b>(\d+)<\/b><span>open items? in total<\/span><\/div>/.exec(openItemsView(state, d).toString());
  assert.ok(home && open);
  assert.equal(open[1], home[1]);
});

test('working days until a date: Monday to Friday, from tomorrow to the day itself', async () => {
  const { workingDaysUntil } = await import('../../src/ui/screens/home.js');
  assert.equal(workingDaysUntil('2026-09-28', '2026-09-28'), 0, 'today: none left');
  assert.equal(workingDaysUntil('2026-09-25', '2026-09-28'), 1, 'Friday to Monday: one');
  assert.equal(workingDaysUntil('2026-09-28', '2026-10-10'), 9);
  assert.equal(workingDaysUntil('2026-09-28', '2026-10-12'), 10);
});

test('a platform tile on Home says when its review is due soon, and in how many days', () => {
  const d = scheduleFixed(data(), 'p2', 6, '2026-10-10', at('10:45', 'u2'));
  const out = homeView({ ...state, homeOwner: 'everyone' }, d).toString();
  assert.match(out, /<strong>Bravo<\/strong> <span class="tag review-due-soon">Review due soon – 12 days<\/span>/);
});
