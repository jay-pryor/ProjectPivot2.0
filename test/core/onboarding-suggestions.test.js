import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformGroup, tagPlatform } from '../../src/core/ops/platform-groups.js';
import { createFacetOption, setOptionGroup } from '../../src/core/ops/facets.js';
import { createHazard, addFailureMode, addCausalFactor } from '../../src/core/ops/hazards.js';
import { createControl } from '../../src/core/ops/controls.js';
import { facetChoices } from '../../src/core/queries.js';
import { sharedGroups, groupSuggestions } from '../../src/core/workflows.js';
import { act, seed } from '../helpers.js';

/** p1 is in Lasers and Vehicles; h1 is assigned to Lasers and Maritime. */
function groups() {
  let d = seed();
  for (const [id, name] of [['gL', 'Lasers'], ['gV', 'Vehicles'], ['gM', 'Maritime']]) d = createPlatformGroup(d, act, { id, name });
  d = tagPlatform(d, act, { platformId: 'p1', groupId: 'gL' });
  d = tagPlatform(d, act, { platformId: 'p1', groupId: 'gV' });
  d = setOptionGroup(d, act, { facet: 'hazard', optionId: 'h1', groupId: 'gL', on: true });
  d = setOptionGroup(d, act, { facet: 'hazard', optionId: 'h1', groupId: 'gM', on: true });
  for (const [id, name, g] of [['fL', 'Beam misaligned', 'gL'], ['fV', 'Brake failure', 'gV'], ['fM', 'Hull breach', 'gM'], ['fA', 'Power loss', 'all']]) {
    d = createFacetOption(d, act, { id, facet: 'failureMode', name });
    d = setOptionGroup(d, act, { facet: 'failureMode', optionId: id, groupId: g, on: true });
  }
  return d;
}

test('shared groups: those the platform is in and the hazard is assigned to, plus All platforms when the hazard is', () => {
  let d = groups();
  assert.deepEqual(sharedGroups(d, 'p1', 'h1'), ['gL']);
  d = setOptionGroup(d, act, { facet: 'hazard', optionId: 'h1', groupId: 'all', on: true });
  assert.deepEqual(sharedGroups(d, 'p1', 'h1').sort(), ['all', 'gL']);
});

test('facet suggestions come from the shared groups and All platforms, without what is already there', () => {
  let d = groups();
  assert.deepEqual(groupSuggestions(d, { kind: 'failureMode', platformId: 'p1', hazardId: 'h1' }).map((s) => [s.text, s.from]),
    [['Beam misaligned', 'Lasers'], ['Power loss', 'All platforms']], 'not Brake failure (Vehicles: the hazard is not), not Hull breach (Maritime: the platform is not)');
  d = addFailureMode(d, act, { hazardId: 'h1', platformId: 'p1', text: 'beam MISALIGNED' });
  assert.deepEqual(groupSuggestions(d, { kind: 'failureMode', platformId: 'p1', hazardId: 'h1' }).map((s) => s.text), ['Power loss']);
});

test('hazard suggestions come from the platform’s groups and All platforms, without hazards already on it', () => {
  let d = groups();
  d = createHazard(d, act, { id: 'h3', title: 'Glare' });
  d = setOptionGroup(d, act, { facet: 'hazard', optionId: 'h3', groupId: 'gV', on: true });
  d = createHazard(d, act, { id: 'h4', title: 'Drowning' });
  d = setOptionGroup(d, act, { facet: 'hazard', optionId: 'h4', groupId: 'gM', on: true });
  assert.deepEqual(groupSuggestions(d, { kind: 'hazard', platformId: 'p1' }).map((s) => [s.id, s.from]), [['h3', 'Vehicles']], 'h1 is already on p1; h4 is Maritime only');
});

test('control suggestions come from the shared groups, without controls already on the hazard here', () => {
  let d = groups();
  d = createControl(d, act, { id: 'c3', title: 'Beam stop' });
  d = setOptionGroup(d, act, { facet: 'control', optionId: 'c3', groupId: 'gL', on: true });
  d = setOptionGroup(d, act, { facet: 'control', optionId: 'c1', groupId: 'gL', on: true });
  assert.deepEqual(groupSuggestions(d, { kind: 'control', platformId: 'p1', hazardId: 'h1' }).map((s) => s.id), ['c3'], 'c1 is on h1 at p1 already, as Recommended');
});

test('consequence suggestions come from the shared groups, without those the hazard has', () => {
  let d = groups();
  for (const [id, name] of [['qB', 'Burns'], ['qS', 'Smoke inhalation']]) {
    d = createFacetOption(d, act, { id, facet: 'consequence', name });
    d = setOptionGroup(d, act, { facet: 'consequence', optionId: id, groupId: 'gL', on: true });
  }
  assert.deepEqual(groupSuggestions(d, { kind: 'consequence', platformId: 'p1', hazardId: 'h1' }).map((s) => s.text), ['Smoke inhalation'], 'h1 has Burns');
});

test('facet choices: Info\'s options, then what is given on any hazard, once each, leaving out what is had', () => {
  let d = seed();
  d = createFacetOption(d, act, { id: 'o1', facet: 'causalFactor', name: 'Fuel leak' });
  d = createFacetOption(d, act, { id: 'o2', facet: 'causalFactor', name: 'hot works' });
  d = addCausalFactor(d, act, { hazardId: 'h2', text: 'Heavy rain' });
  assert.deepEqual(facetChoices(d, 'causalFactor', new Set()), ['Fuel leak', 'hot works', 'Heavy rain'], 'Hot works on h1 is the same as Info\'s hot works');
  assert.deepEqual(facetChoices(d, 'causalFactor', new Set(['hot works', 'heavy rain'])), ['Fuel leak']);
});
