import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyTable, shell, bundlePage } from '../../src/ui/screens/common.js';
import { historyDeletionsView } from '../../src/ui/screens/history-deletions.js';
import { initialState } from '../../src/ui/controller.js';
import { createBundle, bundlesOf, historyOf, deleteHistory, restoreHistory, historyDeletions } from '../../src/core/history.js';
import { updateHazard } from '../../src/core/ops/hazards.js';
import { html } from '../../src/ui/html.js';
import { seed, act, later } from '../helpers.js';

const view = { name: 'hazard', id: 'h1', tab: 'history' };
const state = { ...initialState(), screen: 'main', view, profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }] };

/** h1 renamed by Ada, then by Grace; the two bundled. */
function data() {
  let d = updateHazard(seed(), act, { id: 'h1', title: 'Blaze' });
  d = updateHazard(d, later, { id: 'h1', title: 'Inferno' });
  const [a, b] = historyOf(d, 'hazard', 'h1').filter((e) => e.action === 'Edit hazard').map((e) => e.id);
  return { d: createBundle(d, later, { entryIds: [a, b], text: 'Renamed twice' }), a, b };
}

test('a bundle is one row: the span of its changes, everyone who made them, their action once, its own comments; open, its changes beneath', () => {
  const { d, a, b } = data();
  const id = bundlesOf(d)[0].id;
  const out = historyTable(state, d, 'hazard', 'h1').toString();
  const row = out.slice(out.indexOf(`data-row="b:${id}"`), out.indexOf('</tr>', out.indexOf(`data-row="b:${id}"`)));
  assert.match(out, new RegExp(`<tr data-row="b:${id}" class="bundle-row">`));
  assert.match(row, /aria-expanded="false"[^>]*data-action="toggleBundleOpen"[^>]*><span class="bundle-caret" aria-hidden="true">▸<\/span> 2026-09-28 10:00 – 2026-09-28 11:00<\/button>/);
  assert.match(row, /<td>Ada, Grace<\/td>/);
  assert.match(row, /<div class="bundle-what"><span class="cell-text" data-dblclick="startEdit" data-kind="bundleTitle" data-id="[^"]+" title="Double-click to change">Edit hazard<\/span><span class="tag bundle-tag">Bundle<\/span><\/div>/, 'one kind of change, said once; the badge after it');
  assert.match(row, /2 changes<\/span> <button type="button" class="small unbundle" data-action="unbundle"/);
  assert.match(row, /<div class="comments-cell"><ul class="plain comments"><li>Renamed twice <span class="muted comment-by">— Grace, 2026-09-28 11:00<\/span><\/li><\/ul>\s*<button type="button" class="plus"/, 'the words first, then who and when; + after');
  assert.doesNotMatch(out, new RegExp(`data-row="c:${a}"`), 'closed: its changes hidden');
  const opened = historyTable({ ...state, openBundles: [id] }, d, 'hazard', 'h1').toString();
  assert.match(opened, new RegExp(`data-row="b:${id}"[\\s\\S]*?<tr data-row="c:${b}" class="bundle-child">[\\s\\S]*?<tr data-row="c:${a}" class="bundle-child">`), 'newest first beneath it');
  assert.match(opened, /data-run="deleteHistory" data-entry-id="[^"]+"/);
});

test('bundling different kinds of change says Multiple changes', () => {
  let d = updateHazard(seed(), act, { id: 'h1', title: 'Blaze' });
  const ids = historyOf(d, 'hazard', 'h1').map((e) => e.id);
  d = createBundle(d, act, { entryIds: ids.slice(0, 2) });
  assert.match(historyTable(state, d, 'hazard', 'h1').toString(), /title="Double-click to change">Multiple changes<\/span>/);
});

test('bundle mode: Bundle turns it on for this page, only loose rows can be chosen, and Confirm waits for two', () => {
  const { d } = data();
  const off = historyTable(state, d, 'hazard', 'h1').toString();
  assert.match(off, /<div class="history"><div class="tools"><span class="tools-label">Tools:<\/span><button type="button" class="tool" data-action="toggleBundling"[^>]*><svg class="tool-icon"[\s\S]*?<\/svg>Bundle<\/button>/);
  assert.doesNotMatch(off, /data-selectable/);
  const on = historyTable({ ...state, bundling: bundlePage(view) }, d, 'hazard', 'h1').toString();
  assert.match(on, /<div class="history bundling"><form class="tools bundle-bar" data-bundle-form><span class="tools-label">Tools:<\/span>/);
  assert.match(on, /data-bundle-confirm disabled>Confirm Bundle/);
  assert.doesNotMatch(on, /class="bundle-row" data-selectable/, 'a bundle is not chosen again');
  assert.match(on, /<tr data-row="[0-9a-f-]+" data-selectable="">/);
  assert.doesNotMatch(historyTable({ ...state, bundling: bundlePage({ name: 'control', id: 'c1', tab: 'history' }) }, d, 'hazard', 'h1').toString(), /data-bundle-form/, 'another page\'s bundle mode');
});

test('Deletion history: in the ☰ menu, each with who deleted it, a Restore until restored, then who restored it', () => {
  const { d: start } = data();
  const bundle = bundlesOf(start)[0].id;
  let d = deleteHistory(start, act, { entryId: bundle });
  assert.match(shell({ ...state, session: { base: d, working: d }, view: { name: 'historyDeletions' } }, html``).toString(), /role="menuitem" class="on" data-action="go" data-view="historyDeletions">Deletion history/);
  let out = historyDeletionsView(state, d).toString();
  assert.match(out, /<td>Ada<\/td><td><span class="tag bundle-tag">Bundle<\/span> Bundle of 2 changes: Edit hazard<\/td><td>Ada, Grace, 2026-09-28 10:00 – 2026-09-28 11:00<\/td><td><button type="button" data-action="restoreHistory" data-id="[^"]+">Restore<\/button>/);
  assert.doesNotMatch(out, /deleteHistory|icon-x/, 'a deletion cannot be deleted');
  d = restoreHistory(d, later, { id: historyDeletions(d)[0].id });
  out = historyDeletionsView(state, d).toString();
  assert.match(out, /<tr data-row="[^"]+" class="restored">[\s\S]*?Restored by Grace, 2026-09-28 11:00/);
});

test('a bundle\'s What: given when bundling, changed by double-clicking, and back to its changes\' action when cleared', async () => {
  const { renameBundle } = await import('../../src/core/history.js');
  let d = updateHazard(seed(), act, { id: 'h1', title: 'Blaze' });
  d = updateHazard(d, later, { id: 'h1', title: 'Inferno' });
  const ids = historyOf(d, 'hazard', 'h1').filter((e) => e.action === 'Edit hazard').map((e) => e.id);
  d = createBundle(d, act, { entryIds: ids, title: '  Settled the name ' });
  const id = bundlesOf(d)[0].id;
  assert.equal(bundlesOf(d)[0].title, 'Settled the name');
  assert.match(historyTable(state, d, 'hazard', 'h1').toString(), />Settled the name<\/span><span class="tag bundle-tag">/);
  const editing = historyTable({ ...state, editing: { kind: 'bundleTitle', id } }, d, 'hazard', 'h1').toString();
  assert.match(editing, /<input class="cell-edit" name="title" value="Settled the name" placeholder="Edit hazard" aria-label="What the bundle is" autofocus data-change="renameBundle" data-id="[^"]+">/);
  d = renameBundle(d, later, { id, title: 'Final name' });
  assert.equal(bundlesOf(d)[0].title, 'Final name');
  assert.equal(renameBundle(d, later, { id, title: 'Final name' }), d, 'no change, nothing recorded');
  d = renameBundle(d, later, { id, title: ' ' });
  assert.equal(bundlesOf(d)[0].title, undefined);
  assert.match(historyTable(state, d, 'hazard', 'h1').toString(), /title="Double-click to change">Edit hazard<\/span>/, 'cleared: its changes\' action again');
  const on = historyTable({ ...state, bundling: bundlePage(view) }, d, 'hazard', 'h1').toString();
  assert.match(on, /<input name="bundleTitle" class="grow" placeholder="What \(optional\)…"[\s\S]*?<input name="bundleComment" class="grow" placeholder="Comment \(optional\)…"/);
});

test('the History tab\'s count takes a bundle as one change', async () => {
  const { historyCount } = await import('../../src/ui/screens/common.js');
  let d = updateHazard(seed(), act, { id: 'h1', title: 'Blaze' });
  d = updateHazard(d, later, { id: 'h1', title: 'Inferno' });
  const all = historyOf(d, 'hazard', 'h1');
  assert.equal(historyCount(state, d, 'hazard', 'h1'), all.length);
  const [a, b] = all.filter((e) => e.action === 'Edit hazard').map((e) => e.id);
  assert.equal(historyCount(state, createBundle(d, act, { entryIds: [a, b] }), 'hazard', 'h1'), all.length - 1, 'two bundled: one');
});
