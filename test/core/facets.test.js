import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { KINDS } from '../../src/core/data.js';
import { ids } from '../../src/core/ids.js';
import { entries } from '../../src/core/history.js';
import { checkRules } from '../../src/core/rules.js';
import { createFacetOption, renameFacetOption, deleteFacetOption, setOptionGroup, assignToGroup, infoDeletions, restoreDeletion } from '../../src/core/ops/facets.js';
import { createPlatformGroup, deletePlatformGroup, tagPlatform } from '../../src/core/ops/platform-groups.js';
import { linkPhase } from '../../src/core/ops/phases.js';
import { facetOptions, phasesOf, groupsOf, hazardGroupRows, controlGroupRows } from '../../src/core/queries.js';
import { deleteHazard } from '../../src/core/ops/hazards.js';
import { deleteControl, unlinkControl } from '../../src/core/ops/controls.js';
import { recordName } from '../../src/ui/names.js';
import { act, later, seed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const names = (d, facet) => facetOptions(d, facet).map((r) => r.option.name);
const withGroups = () => {
  let d = createPlatformGroup(seed(), act, { id: 'g1', name: 'UAS' });
  return createPlatformGroup(d, act, { id: 'g2', name: 'UGV' });
};

test('each facet has its own list of options: added in order, unique within the facet, renamed, deleted', () => {
  assert.ok(['facetOption', 'optionGroup'].every((k) => KINDS.includes(k)));
  assert.equal(ids.optionGroup('o1', 'g1'), 'og:o1:g1');
  let d = createFacetOption(seed(), act, { id: 'o1', facet: 'systemElement', name: 'Propeller' });
  d = createFacetOption(d, act, { id: 'o2', facet: 'systemElement', name: 'Battery' });
  d = createFacetOption(d, act, { id: 'o3', facet: 'consequence', name: 'propeller' });
  assert.deepEqual(names(d, 'systemElement'), ['Propeller', 'Battery']);
  assert.deepEqual(names(d, 'consequence'), ['propeller'], 'the same name in another facet is fine');
  assert.throws(() => createFacetOption(d, act, { facet: 'systemElement', name: ' PROPELLER ' }), code('facetOption.duplicate'));
  assert.throws(() => createFacetOption(d, act, { facet: 'nonsense', name: 'X' }), code('facet.unknown'));
  d = renameFacetOption(d, act, { id: 'o2', facet: 'systemElement', name: 'Li-ion battery' });
  assert.deepEqual(names(d, 'systemElement'), ['Propeller', 'Li-ion battery']);
  d = deleteFacetOption(d, act, { id: 'o1', facet: 'systemElement' });
  assert.deepEqual(names(d, 'systemElement'), ['Li-ion battery']);
  assert.equal(entries(d).at(-1).action, 'Delete facet option');
});

test('lifecycle phases are a facet like the rest: made, renamed and deleted through the same ops', () => {
  let d = createFacetOption(seed(), act, { id: 'ph1', facet: 'phase', name: 'Design' });
  assert.equal(d.records.phase.ph1.name, 'Design');
  d = renameFacetOption(d, act, { id: 'ph1', facet: 'phase', name: 'Concept' });
  d = linkPhase(d, act, { hazardId: 'h1', phaseId: 'ph1' });
  assert.deepEqual(facetOptions(d, 'phase').map((r) => [r.option.name, r.hazards, r.platforms]), [['Concept', 1, 2]]);
  d = deleteFacetOption(d, act, { id: 'ph1', facet: 'phase' });
  assert.deepEqual(phasesOf(d, 'h1'), [], 'it comes off its hazard');
  assert.deepEqual(checkRules(d), []);
});

test('an option is assigned to platform groups by ticking; deleting the option or the group takes the assignment with it', () => {
  let d = createFacetOption(withGroups(), act, { id: 'o1', facet: 'causalFactor', name: 'Propeller strike' });
  d = setOptionGroup(d, act, { facet: 'causalFactor', optionId: 'o1', groupId: 'g1', on: 'true' });
  d = setOptionGroup(d, act, { facet: 'causalFactor', optionId: 'o1', groupId: 'g2', on: true });
  assert.equal(entries(d).at(-1).action, 'Add Propeller strike to UGV');
  assert.equal(setOptionGroup(d, act, { facet: 'causalFactor', optionId: 'o1', groupId: 'g2', on: true }), d, 'already: no change');
  assert.deepEqual([...facetOptions(d, 'causalFactor')[0].groupIds], ['g1', 'g2']);
  d = setOptionGroup(d, act, { facet: 'causalFactor', optionId: 'o1', groupId: 'g2', on: 'false' });
  assert.equal(entries(d).at(-1).action, 'Remove Propeller strike from UGV');
  assert.deepEqual([...facetOptions(d, 'causalFactor')[0].groupIds], ['g1']);
  assert.deepEqual(checkRules(deletePlatformGroup(d, act, { id: 'g1' })), []);
  assert.deepEqual([...facetOptions(deletePlatformGroup(d, act, { id: 'g1' }), 'causalFactor')[0].groupIds], []);
  assert.deepEqual(checkRules(deleteFacetOption(d, act, { id: 'o1', facet: 'causalFactor' })), []);
});

test('several options are assigned to a group as one change; those already in it are left alone', () => {
  let d = createFacetOption(withGroups(), act, { id: 'o1', facet: 'systemElement', name: 'Propeller' });
  d = createFacetOption(d, act, { id: 'o2', facet: 'systemElement', name: 'Battery' });
  d = setOptionGroup(d, act, { facet: 'systemElement', optionId: 'o1', groupId: 'g1', on: true });
  const before = entries(d).length;
  d = assignToGroup(d, act, { facet: 'systemElement', optionIds: ['o1', 'o2', 'o2'], groupId: 'g1' });
  assert.equal(entries(d).length, before + 1);
  assert.equal(entries(d).at(-1).action, 'Assign 1 system or element to UAS');
  assert.deepEqual(facetOptions(d, 'systemElement').map((r) => [...r.groupIds]), [['g1'], ['g1']]);
  d = assignToGroup(d, act, { facet: 'systemElement', optionIds: ['o1', 'o2'], groupId: 'g2' });
  assert.equal(entries(d).at(-1).action, 'Assign 2 systems or elements to UGV');
  assert.throws(() => assignToGroup(d, act, { facet: 'systemElement', optionIds: [], groupId: 'g1' }), code('empty'));
  assert.deepEqual(checkRules(d), []);
});

test('All platforms needs no platform group record: options are assigned to it and taken off it like any group', () => {
  let d = createFacetOption(seed(), act, { id: 'o1', facet: 'consequence', name: 'Fire' });
  d = assignToGroup(d, act, { facet: 'consequence', optionIds: ['o1'], groupId: 'all' });
  assert.equal(entries(d).at(-1).action, 'Assign 1 consequence to All platforms');
  assert.deepEqual([...facetOptions(d, 'consequence')[0].groupIds], ['all']);
  assert.deepEqual(checkRules(d), []);
  d = setOptionGroup(d, act, { facet: 'consequence', optionId: 'o1', groupId: 'all', on: false });
  assert.equal(entries(d).at(-1).action, 'Remove Fire from All platforms');
  // Deleted and restored, it is back on All platforms.
  d = setOptionGroup(d, act, { facet: 'consequence', optionId: 'o1', groupId: 'all', on: true });
  d = deleteFacetOption(d, act, { id: 'o1', facet: 'consequence' });
  d = restoreDeletion(d, act, { entryId: infoDeletions(d)[0].id });
  assert.deepEqual([...facetOptions(d, 'consequence')[0].groupIds], ['all']);
});

test('Deletion history lists what was deleted on Info; Restore brings it back with what went with it', () => {
  let d = createFacetOption(withGroups(), act, { id: 'ph1', facet: 'phase', name: 'Design' });
  d = linkPhase(d, act, { hazardId: 'h1', phaseId: 'ph1' });
  d = setOptionGroup(d, act, { facet: 'phase', optionId: 'ph1', groupId: 'g1', on: true });
  d = tagPlatform(d, act, { platformId: 'p1', groupId: 'g2' });
  d = deleteFacetOption(d, later, { id: 'ph1', facet: 'phase' });
  d = deletePlatformGroup(d, later, { id: 'g2' });
  const [group, phase] = infoDeletions(d);
  assert.deepEqual({ ...phase, id: null }, { id: null, at: later.at, by: 'u2', kind: 'phase', recordId: 'ph1', name: 'Design', facet: 'phase', createdBy: 'u1', createdAt: act.at, hazards: 1, groups: 1, platforms: 0, restored: null });
  assert.equal(group.name, 'UGV');
  assert.equal(group.platforms, 1);
  d = restoreDeletion(d, act, { entryId: phase.id });
  assert.deepEqual(phasesOf(d, 'h1').map((x) => x.phase.name), ['Design'], 'back on its hazard');
  assert.deepEqual([...facetOptions(d, 'phase')[0].groupIds], ['g1'], 'and in its group');
  assert.deepEqual(infoDeletions(d).find((x) => x.id === phase.id).restored, { at: act.at, by: 'u1' });
  assert.throws(() => restoreDeletion(d, act, { entryId: phase.id }), code('not-found'));
  d = restoreDeletion(d, act, { entryId: group.id });
  assert.deepEqual(groupsOf(d, 'p1').map((g) => g.name), ['UGV']);
  assert.deepEqual(checkRules(d), []);
  // A name taken again meanwhile must be renamed before the old one comes back.
  let e = deleteFacetOption(createFacetOption(seed(), act, { id: 'o1', facet: 'consequence', name: 'Burns' }), act, { id: 'o1', facet: 'consequence' });
  e = createFacetOption(e, act, { facet: 'consequence', name: 'burns' });
  assert.throws(() => restoreDeletion(e, act, { entryId: infoDeletions(e)[0].id }), code('restore.duplicate'));
});

test('hazards are assigned to platform groups as options are, and lose their assignments when deleted or when the group is', () => {
  let d = assignToGroup(withGroups(), act, { facet: 'hazard', optionIds: ['h1', 'h2'], groupId: 'g1' });
  assert.equal(entries(d).at(-1).action, 'Assign 2 hazards to UAS');
  d = assignToGroup(d, act, { facet: 'hazard', optionIds: ['h2'], groupId: 'all' });
  assert.equal(entries(d).at(-1).action, 'Assign 1 hazard to All platforms');
  assert.deepEqual(hazardGroupRows(d).map((r) => [r.option.id, [...r.groupIds].sort(), r.platforms]), [['h1', ['g1'], 2], ['h2', ['all', 'g1'], 0]]);
  assert.equal(recordName('optionGroup', d.records.optionGroup[ids.optionGroup('h1', 'g1')], d), 'TBC Fire in UAS');
  assert.deepEqual(checkRules(d), []);
  d = setOptionGroup(d, act, { facet: 'hazard', optionId: 'h1', groupId: 'g1', on: false });
  assert.equal(entries(d).at(-1).action, 'Remove TBC Fire from UAS');
  d = deleteHazard(d, act, { id: 'h2' });
  assert.deepEqual(hazardGroupRows(d).map((r) => r.option.id), ['h1'], 'a deleted hazard is not listed');
  assert.deepEqual(checkRules(d), [], 'its assignments went with it');
  d = assignToGroup(d, act, { facet: 'hazard', optionIds: ['h1'], groupId: 'g2' });
  d = deletePlatformGroup(d, act, { id: 'g2' });
  assert.deepEqual([...hazardGroupRows(d)[0].groupIds], []);
  d = restoreDeletion(d, act, { entryId: infoDeletions(d)[0].id });
  assert.deepEqual([...hazardGroupRows(d)[0].groupIds], ['g2'], 'restoring the group brings its hazards back');
  assert.deepEqual(checkRules(d), []);
});

test('controls are assigned to platform groups too, and lose their assignments when deleted', () => {
  let d = assignToGroup(withGroups(), act, { facet: 'control', optionIds: ['c1', 'c2'], groupId: 'g1' });
  assert.equal(entries(d).at(-1).action, 'Assign 2 controls to UAS');
  d = setOptionGroup(d, act, { facet: 'control', optionId: 'c1', groupId: 'g1', on: false });
  assert.equal(entries(d).at(-1).action, 'Remove TBC Sprinklers from UAS');
  assert.deepEqual(controlGroupRows(d).map((r) => [r.option.id, [...r.groupIds], r.platforms]), [['c1', [], 2], ['c2', ['g1'], 2]]);
  assert.equal(recordName('optionGroup', d.records.optionGroup[ids.optionGroup('c2', 'g1')], d), 'Fire drills in UAS');
  d = deleteControl(unlinkControl(d, act, { hazardId: 'h1', controlId: 'c2' }), act, { id: 'c2' });
  assert.deepEqual(controlGroupRows(d).map((r) => r.option.id), ['c1']);
  assert.deepEqual(checkRules(d), []);
});
