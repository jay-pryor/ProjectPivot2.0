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
  await c.dispatch({ type: 'setControlState', ...t, value: 'implemented' });
  assert.equal(ruling().state, 'implemented');
  await c.dispatch({ type: 'setControlState', ...t, value: 'rejected' });
  assert.equal(ruling().state, 'implemented', 'nothing changes until a reason is given');
  assert.deepEqual(c.getState().editing, { kind: 'rejection', id: 'h1|c1|p1' });
  await c.dispatch({ type: 'rejectControl', ...t, reason: 'Not fitted' });
  assert.equal(ruling().state, 'rejected');
  assert.equal(c.getState().editing, null);
  await c.dispatch({ type: 'setControlState', ...t, value: 'recommended' });
  assert.equal(ruling().status, 'deleted');
});

test('an assessment from its likelihood and consequence, and comments on history entries', async () => {
  const c = await ready();
  await c.dispatch({ type: 'linkHazards', platformId: 'p1', hazardId: 'h1' });
  await c.dispatch({ type: 'setAssessment', hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihood: 'C' });
  await c.dispatch({ type: 'setAssessment', hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', consequence: '1' });
  assert.deepEqual(ratingOf(W(c), 'h1', 'p1').initial, { consequence: 1, likelihood: 'C' });
  const entry = historyReaching(W(c), 'p1').at(-1);
  assert.equal(entry.action, 'Set initial personnel risk');
  await c.dispatch({ type: 'addComment', entryId: entry.id, text: 'From the 2025 survey' });
  assert.deepEqual(commentsOn(W(c), entry.id).map((x) => x.text), ['From the 2025 survey']);
  assert.ok(entries(W(c)).length > 0);
});

test('linking platforms to a hazard from its page, several at once', async () => {
  const c = await ready();
  await c.dispatch({ type: 'createPlatform', id: 'p2', name: 'Bravo', ownerId: c.getState().profileId });
  await c.dispatch({ type: 'openPicker', picker: 'linkPlatforms', hazardId: 'h1' });
  await c.dispatch({ type: 'linkPlatforms', hazardId: 'h1', platformId: ['p1', 'p2'] });
  assert.ok(W(c).records.hazardPlatform[ids.hazardPlatform('h1', 'p1')]);
  assert.ok(W(c).records.hazardPlatform[ids.hazardPlatform('h1', 'p2')]);
  assert.equal(c.getState().picker, null);
});

test('copying a justification from another platform writes it into this platform\'s box', async () => {
  const c = await ready();
  await c.dispatch({ type: 'createPlatform', id: 'p2', name: 'Bravo', ownerId: c.getState().profileId });
  await c.dispatch({ type: 'linkPlatforms', hazardId: 'h1', platformId: ['p1', 'p2'] });
  await c.dispatch({ type: 'setAssessment', hazardId: 'h1', platformId: 'p2', stage: 'residual', receptor: 'capability', consequenceWhy: 'Spare airframe held' });
  await c.dispatch({ type: 'openPicker', picker: 'copyJustification', hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'capability', field: 'consequenceWhy' });
  assert.equal(c.getState().picker.field, 'consequenceWhy');
  await c.dispatch({ type: 'copyJustification', hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'capability', field: 'consequenceWhy', from: 'p2' });
  assert.equal(W(c).records.assessment['ra:h1:p1:residual:capability'].consequenceWhy, 'Spare airframe held');
  assert.equal(c.getState().picker, null);
  await c.dispatch({ type: 'copyJustification', hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'capability', field: 'title', from: 'p2' });
  assert.match(c.getState().message.text, /justification/i, 'only the justification boxes can be copied');
});

test('copying a whole stage of risk from another platform, and the list closes', async () => {
  const c = await ready();
  await c.dispatch({ type: 'createPlatform', id: 'p2', name: 'Bravo', ownerId: c.getState().profileId });
  await c.dispatch({ type: 'linkPlatforms', hazardId: 'h1', platformId: ['p1', 'p2'] });
  await c.dispatch({ type: 'setAssessment', hazardId: 'h1', platformId: 'p2', stage: 'residual', receptor: 'personnel', likelihood: 'E', consequence: '4' });
  await c.dispatch({ type: 'openPicker', picker: 'copyStage', hazardId: 'h1', platformId: 'p1', stage: 'residual' });
  await c.dispatch({ type: 'copyStage', hazardId: 'h1', platformId: 'p1', stage: 'residual', from: 'p2' });
  assert.deepEqual(ratingOf(W(c), 'h1', 'p1').residual, { consequence: 4, likelihood: 'E' });
  assert.equal(c.getState().picker, null);
});

test('Info\'s Assign to platform group remembers the group through choosing, assigning and confirming', async () => {
  const f = new MemoryFolder();
  const c = createController({ clock: fixedClock('2026-09-28T10:00:00+10:00'), minSaveMs: 0, storage: new MemoryStorage(), pickFolder: async () => f.handle,
    pickSaveFile: async () => { throw new Error('no'); }, pickOpenFile: async () => { throw new Error('no'); } });
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  await c.dispatch({ type: 'selectProfile', id: c.getState().profiles[0].id });
  await c.dispatch({ type: 'createPlatformGroup', id: 'g1', name: 'UAS' });
  await c.dispatch({ type: 'createPlatformGroup', id: 'g2', name: 'UGV' });
  await c.dispatch({ type: 'createFacetOption', id: 'o1', facet: 'systemElement', name: 'Wheel' });
  await c.dispatch({ type: 'chooseAssignGroup', groupId: 'g2' });
  assert.equal(c.getState().infoTools.groupId, 'g2');
  await c.dispatch({ type: 'startAssignToGroup', facet: 'systemElement', groupId: 'g2' });
  await c.dispatch({ type: 'assignToGroup', facet: 'systemElement', groupId: 'g2', optionIds: ['o1'] });
  assert.equal(c.getState().infoTools.assigning, null, 'the tool is off after Confirm');
  assert.equal(c.getState().infoTools.groupId, 'g2', 'the group stays chosen');
  assert.equal(Object.values(c.getState().session.working.records.optionGroup)[0].groupId, 'g2');
});
