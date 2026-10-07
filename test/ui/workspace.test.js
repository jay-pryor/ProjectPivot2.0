import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../fakes/storage.js';
import { emptyWorkspace, paneCount, replacedBy, placePane, movePane, swapPanes, closePane, updatePane, paneDirty, workspaceKey, readWorkspace, writeWorkspace } from '../../src/ui/workspace.js';
import { createBowtieView, deleteBowtieView } from '../../src/core/ops/bowtie-views.js';
import { seed, act } from '../helpers.js';

const F = { statuses: ['recommended', 'planned', 'implemented'] };
const A = { viewId: null, hazardId: 'h1', platformId: 'p1', filters: F };
const B = { viewId: null, hazardId: 'h1', platformId: 'p2', filters: F };
const C = { viewId: 'v1', hazardId: 'h1', platformId: 'p1', filters: F };
const ids = (ws) => ws.panes.map((p) => (p ? p.platformId + (p.viewId ?? '') : null));

test('the first window fills the stage wherever it is dropped', () => {
  for (const side of [0, 1, 'last']) {
    const ws = placePane(emptyWorkspace(), side, A);
    assert.deepEqual(ws, { panes: [A, null], lastUsed: 0 });
    assert.equal(paneCount(ws), 1);
  }
  assert.equal(replacedBy(emptyWorkspace(), 'last'), null);
});

test('dropping beside one window splits the stage; the other window takes the other half', () => {
  const one = placePane(emptyWorkspace(), 'last', A);
  assert.equal(replacedBy(one, 0), null);
  assert.deepEqual(ids(placePane(one, 0, B)), ['p2', 'p1']);
  assert.deepEqual(ids(placePane(one, 1, B)), ['p1', 'p2']);
  assert.equal(placePane(one, 1, B).lastUsed, 1);
  assert.equal(replacedBy(one, 'last'), 0, 'a click replaces the only window');
  assert.deepEqual(ids(placePane(one, 'last', B)), ['p2', null]);
});

test('with two windows, a drop replaces its half and a click replaces the window used last', () => {
  const two = placePane(placePane(emptyWorkspace(), 'last', A), 1, B);
  assert.equal(replacedBy(two, 0), 0);
  assert.deepEqual(ids(placePane(two, 0, C)), ['p1v1', 'p2']);
  assert.equal(replacedBy(two, 'last'), 1);
  assert.deepEqual(ids(placePane(two, 'last', C)), ['p1', 'p1v1']);
  assert.deepEqual(ids(updatePane(two, 0, { filters: { statuses: ['implemented'] } })), ['p1', 'p2']);
  assert.equal(updatePane(two, 0, { platformId: 'p9' }).lastUsed, 0);
});

test('moving, swapping and closing windows', () => {
  const two = placePane(placePane(emptyWorkspace(), 'last', A), 1, B);
  assert.deepEqual(ids(movePane(two, 0, 1)), ['p2', 'p1']);
  assert.equal(movePane(two, 0, 1).lastUsed, 1);
  assert.deepEqual(ids(movePane(two, 1, 1)), ['p1', 'p2'], 'dropped where it already is');
  assert.deepEqual(ids(swapPanes(two)), ['p2', 'p1']);
  const one = placePane(emptyWorkspace(), 'last', A);
  assert.deepEqual(movePane(one, 0, 1), one, 'one window has nowhere to move');
  assert.deepEqual(closePane(two, 0), { panes: [B, null], lastUsed: 0 });
  assert.deepEqual(closePane(two, 1), { panes: [A, null], lastUsed: 0 });
  assert.deepEqual(closePane(one, 0), emptyWorkspace());
});

test('a window is unsaved when its filters differ from its view, or from the defaults with no view', () => {
  let d = createBowtieView(seed(), act, { id: 'v1', name: 'Fire', hazardId: 'h1', platformId: 'p1', filters: { statuses: ['implemented'] } });
  assert.equal(paneDirty({ ...C, filters: { statuses: ['implemented'] } }, d), false);
  assert.equal(paneDirty(C, d), true);
  assert.equal(paneDirty(A, d), false);
  assert.equal(paneDirty({ ...A, filters: { statuses: [] } }, d), true);
  d = deleteBowtieView(d, act, { id: 'v1' });
  assert.equal(paneDirty({ ...C, filters: { statuses: ['implemented'] } }, d), true, 'its view is gone');
});

test('the workspace is remembered per folder and profile, and anything unreadable starts empty', () => {
  const s = new MemoryStorage();
  const key = workspaceKey('Pivot', 'u1');
  assert.equal(key, 'pivot.bowtieWorkspace:Pivot:u1');
  const two = placePane(placePane(emptyWorkspace(), 'last', A), 1, C);
  writeWorkspace(s, key, two);
  assert.deepEqual(readWorkspace(s, key), two);
  assert.deepEqual(readWorkspace(s, workspaceKey('Pivot', 'u2')), emptyWorkspace());
  s.setItem(key, 'not json');
  assert.deepEqual(readWorkspace(s, key), emptyWorkspace());
  s.setItem(key, JSON.stringify({ panes: [{ hazardId: 3 }, null], lastUsed: 0 }));
  assert.deepEqual(readWorkspace(s, key), emptyWorkspace());
  s.setItem(key, JSON.stringify({ panes: [null, { ...A, filters: { statuses: 'bogus' } }], lastUsed: 7 }));
  assert.deepEqual(readWorkspace(s, key), { panes: [{ ...A, filters: F }, null], lastUsed: 0 }, 'a lone window moves to the first slot');
  s.setItem(key, JSON.stringify({ panes: [{ ...A, zoom: 2.5, pan: { x: -40, y: 12 } }, { ...C, zoom: 'big', pan: { x: 'left' } }], lastUsed: 0 }));
  assert.deepEqual(readWorkspace(s, key).panes.map((p) => [p?.zoom, p?.pan]), [[2.5, { x: -40, y: 12 }], [undefined, undefined]], 'a view is kept; a bad one is fitted');
  s.refuseReads();
  assert.deepEqual(readWorkspace(s, key), emptyWorkspace());
  const full = new MemoryStorage();
  full.fill();
  assert.doesNotThrow(() => writeWorkspace(full, key, two));
});
