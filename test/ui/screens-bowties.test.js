import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bowtiesView } from '../../src/ui/screens/bowties.js';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { shell } from '../../src/ui/screens/common.js';
import { renderApp } from '../../src/ui/render.js';
import { html } from '../../src/ui/html.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers, updateHazard, deleteHazard } from '../../src/core/ops/hazards.js';
import { createBowtieView, setBowtieSharing, deleteBowtieView } from '../../src/core/ops/bowtie-views.js';
import { unlinkHazard } from '../../src/core/ops/platforms.js';
import { placePane, emptyWorkspace } from '../../src/ui/workspace.js';
import { seed, act, later } from '../helpers.js';

const F = { statuses: ['recommended', 'planned', 'implemented'] };
const profiles = [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Ben', createdAt: '' }, { id: 'u3', name: 'Cy', createdAt: '' }];
/** u1 owns v1 "Alpha & now" (h1 on p1); u2 owns v2 (h1 on p2), shared with u1; u2 owns v3, not shared. */
function data() {
  let d = assignNumbers(seed());
  d = createBowtieView(d, act, { id: 'v1', name: 'Alpha & now', hazardId: 'h1', platformId: 'p1', filters: F });
  d = createBowtieView(d, later, { id: 'v2', name: 'Bravo base', hazardId: 'h1', platformId: 'p2', filters: F });
  d = setBowtieSharing(d, later, { id: 'v2', sharedWith: ['u1'] });
  return createBowtieView(d, later, { id: 'v3', name: 'Private to Ben', hazardId: 'h1', platformId: 'p1', filters: F });
}
const state = (d, extra = {}) => ({ ...initialState(), screen: 'main', today: '2026-09-30', profileId: 'u1', profiles,
  session: { base: d, working: d, loadedStamp: null }, view: { name: 'bowties' }, ...extra });
const one = (pane) => placePane(emptyWorkspace(), 'last', pane);
const two = (a, b) => placePane(one(a), 1, b);
const A = { viewId: 'v1', hazardId: 'h1', platformId: 'p1', filters: F };
const B = { viewId: null, hazardId: 'h1', platformId: 'p2', filters: { statuses: ['implemented'] } };

test('the side list: New diagram, my views, views shared with me by their owner, and nobody else\'s', () => {
  const out = bowtiesView(state(data()), data()).toString();
  assert.match(out, /<h1>Bow-ties<\/h1>/);
  assert.match(out, /data-action="startEdit" data-kind="bowtieNew"[^>]*>New diagram<\/button>/);
  assert.doesNotMatch(out, /data-action="newBowtie"/, 'the hazard and platform choice waits for New diagram');
  const choosing = bowtiesView(state(data(), { editing: { kind: 'bowtieNew', id: '' } }), data()).toString();
  assert.match(choosing, /<form data-action="newBowtie"[\s\S]*?<option value="h1\|p1">HAZ-001 Fire — Alpha<\/option><option value="h1\|p2">HAZ-001 Fire — Bravo<\/option>[\s\S]*?>Open<\/button>[\s\S]*?cancelEdit/);
  assert.doesNotMatch(choosing, />New diagram<\/button>/);
  const mine = out.slice(out.indexOf('My bow-ties'), out.indexOf('Shared with me'));
  const shared = out.slice(out.indexOf('Shared with me'));
  assert.match(mine, /data-drag-view="v1"[\s\S]*?Alpha &amp; now<\/strong><\/button>/, 'only the name until expanded');
  assert.match(mine, /aria-expanded="false"[^>]*data-action="toggleBowtieDetails" data-id="v1">▸/);
  const open = bowtiesView(state(data(), { bowtieDetails: ['v1', 'v2'] }), data()).toString();
  assert.match(open.slice(open.indexOf('My bow-ties'), open.indexOf('Shared with me')), /Alpha &amp; now<\/strong><span class="muted">HAZ-001 Fire<\/span><span class="muted">Alpha<\/span>/);
  assert.match(open.slice(open.indexOf('Shared with me')), /Bravo base<\/strong><span class="muted">HAZ-001 Fire<\/span><span class="muted">Bravo<\/span>/);
  assert.match(shared, /data-drag-view="v2"[\s\S]*?Bravo base[\s\S]*?from Ben/);
  assert.doesNotMatch(out, /Private to Ben/);
  assert.match(mine, /data-action="openBowtieView" data-id="v1" data-side="0">Open left/);
  assert.match(mine, /data-action="removeBowtieView" data-id="v1"/);
  assert.doesNotMatch(shared, /removeBowtieView|bowtieShare|bowtieRename/, 'only the owner manages a view');
  assert.match(out, /<aside class="bt-side" data-filter-scope>[\s\S]*?data-filter-list/);
});

test('an empty stage invites a diagram; drop targets are always in the stage for dragging', () => {
  const out = bowtiesView(state(data()), data()).toString();
  assert.match(out, /class="bt-empty"/);
  assert.match(out, /<div class="bt-drop" data-drop-side="0">Left<\/div><div class="bt-drop" data-drop-side="1">Right<\/div>/);
});

test('one window fills the stage; two split it; each has its filters, diagram, and buttons', () => {
  const d = data();
  const single = bowtiesView(state(d, { workspace: one(A) }), d).toString();
  assert.match(single, /<section class="bt-stage"/);
  assert.match(single, /<header class="bt-bar" draggable="true" data-drag-pane="0">[\s\S]*?<h2>Alpha &amp; now<\/h2>/);
  assert.match(single, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(single, /<div class="bt-filters">\s*<fieldset><legend>Controls<\/legend>/, 'which statuses, with no existing or additional choice');
  assert.doesNotMatch(single, /setPaneSet|Existing only|Additional only/);
  assert.match(single, /name="on" data-change="setPaneStatus" data-side="0" data-status="rejected">/, 'rejected is off');
  assert.match(single, /data-status="planned" checked>/);
  assert.match(single, /data-action="saveBowtiePane" data-side="0" disabled>Saved/);
  assert.match(single, /data-action="startEdit" data-kind="bowtieShare" data-id="v1">Share…/);
  assert.match(single, /data-action="exportBowtie" data-side="0">Export SVG/);
  assert.doesNotMatch(single, /swapBowtiePanes/);
  const split = bowtiesView(state(d, { workspace: two(A, B) }), d).toString();
  assert.match(split, /<section class="bt-stage split"/);
  assert.match(split, /<h2>Unsaved: HAZ-001 Fire on Bravo<\/h2>/);
  assert.match(split, /data-action="swapBowtiePanes"/);
  assert.match(split, /data-drag-pane="1"/);
  assert.match(split, /<div class="bt-diagram pannable" data-side="1"><div class="bt-canvas" data-zoom="1" data-x="0" data-y="0" style="max-width: \d+px; max-height: \d+px; transform: translate\(0px, 0px\) scale\(1\)"><svg/, 'fitted to its window, nothing moved');
  assert.match(split, /data-bt-zoom="fit">Fit</);
});

test('a window shows its drawing zoomed and moved as it was left', () => {
  const d = data();
  const out = bowtiesView(state(d, { workspace: one({ ...A, zoom: 2.5, pan: { x: -40, y: 12 } }) }), d).toString();
  assert.match(out, /<div class="bt-canvas" data-zoom="2.5" data-x="-40" data-y="12" style="max-width: \d+px; max-height: \d+px; transform: translate\(-40px, 12px\) scale\(2.5\)">/);
  assert.match(out, /data-bt-zoom="fit">250%</);
});

test('saving a copy of a shared view, naming a view, and sharing it with ticks', () => {
  const d = data();
  const sharedPane = { viewId: 'v2', hazardId: 'h1', platformId: 'p2', filters: F };
  const out = bowtiesView(state(d, { workspace: one(sharedPane), editing: { kind: 'bowtieName', id: '0' } }), d).toString();
  const win = out.slice(out.indexOf('<article class="bt-window"'));
  assert.match(win, /Save a copy/);
  assert.doesNotMatch(win, /bowtieShare/, 'not the owner: no Share in the window');
  assert.match(out, /<form data-action="saveBowtiePaneAs" data-side="0"[\s\S]*?value="Bravo base \(copy\)"/);
  const sharing = bowtiesView(state(d, { editing: { kind: 'bowtieShare', id: 'v1' } }), d).toString();
  assert.match(sharing, /<form data-action="shareBowtieView" data-id="v1"/);
  assert.match(sharing, /value="u2"> Ben/);
  assert.match(sharing, /value="u3"> Cy/);
  assert.doesNotMatch(sharing, /value="u1"/, 'not yourself');
  const shared = setBowtieSharing(d, act, { id: 'v1', sharedWith: ['u3'] });
  assert.match(bowtiesView(state(shared, { editing: { kind: 'bowtieShare', id: 'v1' } }), shared).toString(), /value="u3" checked> Cy/);
});

test('what goes wrong stays readable: a deleted hazard, a view unshared or deleted while open, markup in names', () => {
  let d = data();
  d = updateHazard(d, act, { id: 'h1', title: '<b>Fire</b>' });
  const markup = bowtiesView(state(d, { workspace: one(A) }), d).toString();
  assert.doesNotMatch(markup, /<b>Fire<\/b>/);
  assert.match(markup, /&lt;b&gt;Fire&lt;\/b&gt;/);
  const sharedPane = { viewId: 'v2', hazardId: 'h1', platformId: 'p2', filters: F };
  const unshared = setBowtieSharing(data(), later, { id: 'v2', sharedWith: [] });
  const out1 = bowtiesView(state(unshared, { workspace: one(sharedPane) }), unshared).toString();
  assert.match(out1, /<h2>Unsaved: HAZ-001 Fire on Bravo<\/h2>/);
  assert.match(out1, /<svg/);
  const gone = deleteBowtieView(data(), act, { id: 'v1' });
  assert.match(bowtiesView(state(gone, { workspace: one(A) }), gone).toString(), /<h2>Unsaved: HAZ-001 Fire on Alpha<\/h2>/);
  const noHazard = deleteHazard(unlinkHazard(unlinkHazard(data(), act, { hazardId: 'h1', platformId: 'p1' }), act, { hazardId: 'h1', platformId: 'p2' }), act, { id: 'h1' });
  const out2 = bowtiesView(state(noHazard, { workspace: one(A) }), noHazard).toString();
  assert.match(out2, /class="bt-cannot">The hazard in this view has been deleted\./);
  assert.doesNotMatch(out2, /exportBowtie/);
  assert.match(out2.slice(out2.indexOf('My bow-ties')), /data-drag-view="v1"[\s\S]*?Cannot draw/);
});

test('the replace question, the nav, the route, and Open bow-tie on a hazard\'s platform tab', () => {
  const d = data();
  const asking = bowtiesView(state(d, { workspace: one(B), bowtieReplace: { side: 'last', pane: A, index: 0 } }), d).toString();
  assert.match(asking, /class="picker-overlay"[\s\S]*?Replace the unsaved diagram\?[\s\S]*?data-action="confirmBowtieReplace"[\s\S]*?data-action="cancelBowtieReplace"/);
  assert.match(asking, /data-action="cancelBowtieReplace" autofocus>Keep it/, 'focus lands on the safe choice, so Escape and the keyboard work');
  assert.match(shell(state(d), html``).toString(), /data-view="reviews">Reviews<\/button><button type="button" class="nav on" data-action="go" data-view="bowties">Bow-ties<\/button><button[^>]*data-view="info"/);
  assert.match(renderApp(state(d)), /<h1>Bow-ties<\/h1>/);
  const tab = hazardView(state(d, { view: { name: 'hazard', id: 'h1', tab: 'p:p1' } }), d, 'h1').toString();
  assert.match(tab, /data-action="openBowtie" data-hazard-id="h1" data-platform-id="p1"/);
});
