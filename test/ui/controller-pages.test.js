import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { ids } from '../../src/core/ids.js';
import { historyReaching, commentsOn, entries } from '../../src/core/history.js';
import { ratingOf } from '../../src/core/queries.js';

const env = (f) => ({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

async function ready() {
  const c = createController(env(new MemoryFolder()));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const u = c.getState().profiles[0].id;
  await c.dispatch({ type: 'selectProfile', id: u });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createHazard', id: 'h2', title: 'Flood' });
  await c.dispatch({ type: 'createControl', id: 'c1', title: 'Sprinklers' });
  await c.dispatch({ type: 'createControl', id: 'c2', title: 'Drills' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: u });
  return c;
}
const W = (c) => c.getState().session.working;

test('linking several controls at once from the picker, each with its own kind', async () => {
  const c = await ready();
  await c.dispatch({ type: 'openPicker', picker: 'linkControls', hazardId: 'h1' });
  assert.deepEqual(c.getState().picker, { picker: 'linkControls', hazardId: 'h1' });
  await c.dispatch({ type: 'linkControls', hazardId: 'h1', controlId: ['c1', 'c2'], 'kind:c1': 'preventative', 'kind:c2': 'mitigating' });
  assert.equal(W(c).records.hazardControl[ids.hazardControl('h1', 'c1')].kind, 'preventative');
  assert.equal(W(c).records.hazardControl[ids.hazardControl('h1', 'c2')].kind, 'mitigating');
  assert.equal(c.getState().picker, null);
  await c.dispatch({ type: 'openPicker', picker: 'linkControls', hazardId: 'h1' });
  await c.dispatch({ type: 'closePicker' });
  assert.equal(c.getState().picker, null);
});

test('linking hazards to a platform from the picker, one ticked or several', async () => {
  const c = await ready();
  await c.dispatch({ type: 'linkHazards', platformId: 'p1', hazardId: 'h1' });
  await c.dispatch({ type: 'linkHazards', platformId: 'p1', hazardId: ['h2'] });
  assert.ok(W(c).records.hazardPlatform[ids.hazardPlatform('h1', 'p1')]);
  assert.ok(W(c).records.hazardPlatform[ids.hazardPlatform('h2', 'p1')]);
});

test('a control\'s state on a platform from one dropdown: confirmed, awaiting, or excluded after asking for a reason', async () => {
  const c = await ready();
  await c.dispatch({ type: 'linkControls', hazardId: 'h1', controlId: 'c1', 'kind:c1': 'preventative' });
  await c.dispatch({ type: 'linkHazards', platformId: 'p1', hazardId: 'h1' });
  const t = { hazardId: 'h1', controlId: 'c1', platformId: 'p1' };
  const ruling = () => W(c).records.ruling[ids.ruling('h1', 'c1', 'p1')];
  await c.dispatch({ type: 'setControlState', ...t, value: 'confirmed' });
  assert.equal(ruling().state, 'confirmed');
  await c.dispatch({ type: 'setControlState', ...t, value: 'excluded' });
  assert.equal(ruling().state, 'confirmed', 'nothing changes until a reason is given');
  assert.deepEqual(c.getState().editing, { kind: 'exclusion', id: 'h1|c1|p1' });
  await c.dispatch({ type: 'excludeControl', ...t, reason: 'Not fitted' });
  assert.equal(ruling().state, 'excluded');
  assert.equal(c.getState().editing, null);
  await c.dispatch({ type: 'setControlState', ...t, value: 'awaiting' });
  assert.equal(ruling().status, 'deleted');
});

test('ratings from a cell dropdown, and comments on history entries', async () => {
  const c = await ready();
  await c.dispatch({ type: 'linkHazards', platformId: 'p1', hazardId: 'h1' });
  await c.dispatch({ type: 'setRatingCell', hazardId: 'h1', platformId: 'p1', stage: 'initial', value: '1C' });
  assert.deepEqual(ratingOf(W(c), 'h1', 'p1').initial, { consequence: 1, likelihood: 'C' });
  const entry = historyReaching(W(c), 'p1').at(-1);
  assert.equal(entry.action, 'Set initial rating');
  await c.dispatch({ type: 'addComment', entryId: entry.id, text: 'From the 2025 survey' });
  assert.deepEqual(commentsOn(W(c), entry.id).map((x) => x.text), ['From the 2025 survey']);
  assert.ok(entries(W(c)).length > 0);
});
