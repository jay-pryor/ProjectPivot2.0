import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { KINDS } from '../../src/core/data.js';
import { ids } from '../../src/core/ids.js';
import { entries } from '../../src/core/history.js';
import { checkRules } from '../../src/core/rules.js';
import { startAcks, waitingChanges } from '../../src/core/acks.js';
import { createPlatformGroup, renamePlatformGroup, deletePlatformGroup, tagPlatform, untagPlatform } from '../../src/core/ops/platform-groups.js';
import { deletePlatform } from '../../src/core/ops/platforms.js';
import { addSystemElement } from '../../src/core/ops/hazards.js';
import { listPlatformGroups, groupsOf, groupMembers, facetEntries, platformsReached } from '../../src/core/queries.js';
import { createPlatform } from '../../src/core/ops/platforms.js';
import { act, later, seed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const withGroups = () => {
  let d = createPlatformGroup(seed(), act, { id: 'g1', name: 'UAS' });
  d = createPlatformGroup(d, act, { id: 'g2', name: 'Ground vehicles' });
  return d;
};
const names = (gs) => gs.map((g) => g.name);

test('platform groups are a list in the order added: named, unique, renamed, deleted', () => {
  assert.ok(['platformGroup', 'platformGroupLink'].every((k) => KINDS.includes(k)));
  assert.equal(ids.platformGroupLink('p1', 'g1'), 'pgl:p1:g1');
  let d = withGroups();
  assert.deepEqual(names(listPlatformGroups(d)), ['UAS', 'Ground vehicles']);
  assert.equal(entries(d).at(-1).action, 'Create platform group');
  assert.throws(() => createPlatformGroup(d, act, { name: ' uas ' }), code('platformGroup.duplicate'));
  assert.throws(() => createPlatformGroup(d, act, { name: ' ' }), code('empty'));
  d = renamePlatformGroup(d, act, { id: 'g2', name: 'UGV' });
  assert.equal(d.records.platformGroup.g2.name, 'UGV');
  assert.throws(() => renamePlatformGroup(d, act, { id: 'g2', name: 'UAS' }), code('platformGroup.duplicate'));
  d = deletePlatformGroup(d, act, { id: 'g1' });
  assert.deepEqual(names(listPlatformGroups(d)), ['UGV']);
  d = createPlatformGroup(d, act, { name: 'UAS' });
  assert.equal(listPlatformGroups(d).length, 2, 'a deleted name can be used again');
});

test('a platform can be in several groups; taking it out, deleting the group or the platform leaves nothing behind', () => {
  let d = tagPlatform(withGroups(), act, { platformId: 'p1', groupId: 'g2' });
  d = tagPlatform(d, act, { platformId: 'p1', groupId: 'g1' });
  d = tagPlatform(d, act, { platformId: 'p2', groupId: 'g1' });
  assert.equal(tagPlatform(d, act, { platformId: 'p1', groupId: 'g1' }), d, 'already in it: no change');
  assert.equal(entries(d).at(-1).action, 'Add to platform group');
  assert.deepEqual(names(groupsOf(d, 'p1')), ['UAS', 'Ground vehicles'], 'in the list\'s order');
  assert.deepEqual(names(groupMembers(d, 'g1')), ['Alpha', 'Bravo']);
  assert.deepEqual(platformsReached(d, 'platformGroupLink', d.records.platformGroupLink['pgl:p1:g1']), ['p1']);
  d = untagPlatform(d, act, { platformId: 'p1', groupId: 'g2' });
  assert.equal(entries(d).at(-1).action, 'Remove from platform group');
  assert.deepEqual(names(groupsOf(d, 'p1')), ['UAS']);
  d = tagPlatform(d, act, { platformId: 'p1', groupId: 'g2' });
  assert.deepEqual(names(groupsOf(d, 'p1')), ['UAS', 'Ground vehicles'], 'put back in');
  assert.deepEqual(checkRules(d), []);
  const gone = deletePlatformGroup(d, act, { id: 'g1' });
  assert.deepEqual(names(groupsOf(gone, 'p2')), []);
  assert.deepEqual(checkRules(gone), []);
  d = createPlatform(d, act, { id: 'p3', name: 'Charlie', ownerId: 'u1' });
  d = tagPlatform(d, act, { platformId: 'p3', groupId: 'g1' });
  d = deletePlatform(d, act, { id: 'p3' });
  assert.deepEqual(names(groupMembers(d, 'g1')), ['Alpha', 'Bravo']);
  assert.deepEqual(checkRules(d), []);
});

test('putting a platform in a group is in its history but waits for no acknowledgement', () => {
  let d = startAcks(withGroups(), act);
  d = tagPlatform(d, later, { platformId: 'p1', groupId: 'g1' });
  assert.ok(entries(d).at(-1).platforms.includes('p1'));
  assert.equal(waitingChanges(d, 'p1').length, 0);
});

test('a facet\'s entries: once each ignoring case, with their hazards, platforms and those platforms\' groups', () => {
  let d = tagPlatform(withGroups(), act, { platformId: 'p1', groupId: 'g1' });
  d = addSystemElement(d, act, { id: 'se1', hazardId: 'h1', platformId: 'p1', text: 'Propeller' });
  d = addSystemElement(d, later, { id: 'se2', hazardId: 'h1', platformId: 'p2', text: 'propeller' });
  d = addSystemElement(d, act, { hazardId: 'h1', platformId: 'p2', text: 'Battery' });
  assert.deepEqual(facetEntries(d, 'systemElement').map((e) => ({ ...e, groups: names(e.groups) })), [
    { text: 'Propeller', hazards: 1, platforms: 2, groups: ['UAS'] },
    { text: 'Battery', hazards: 1, platforms: 1, groups: [] },
  ]);
  assert.deepEqual(facetEntries(d, 'causalFactor').map((e) => [e.text, e.platforms]), [['Hot works', 2]], 'a causal factor for every platform reaches each');
  assert.deepEqual(facetEntries(d, 'consequence').map((e) => e.text), ['Burns']);
});
