import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addSystemElement, updateSystemElement, deleteSystemElement, addAffectedGroup } from '../../src/core/ops/hazards.js';
import { unlinkHazard } from '../../src/core/ops/platforms.js';
import { platformListOn, platformListEntries, platformsReached } from '../../src/core/queries.js';
import { checkRules } from '../../src/core/rules.js';
import { put } from '../../src/core/data.js';
import { PivotError } from '../../src/core/errors.js';
import { seed, act } from '../helpers.js';

const texts = (rs) => rs.map((r) => r.text);

test('a hazard\'s systems or elements are its own on each platform, in the order they were added', () => {
  let d = addSystemElement(seed(), act, { id: 's1', hazardId: 'h1', platformId: 'p1', text: '  Engine room ' });
  d = addSystemElement(d, act, { id: 's2', hazardId: 'h1', platformId: 'p1', text: 'Fuel system' });
  d = addSystemElement(d, act, { id: 's3', hazardId: 'h1', platformId: 'p2', text: 'engine room' });
  assert.deepEqual(texts(platformListOn(d, 'systemElement', 'h1', 'p1')), ['Engine room', 'Fuel system']);
  assert.deepEqual(texts(platformListOn(d, 'systemElement', 'h1', 'p2')), ['engine room']);
  assert.deepEqual(platformsReached(d, 'systemElement', d.records.systemElement.s1), ['p1']);
  assert.deepEqual(platformListEntries(d, 'systemElement'), ['Engine room', 'Fuel system'], 'suggested once each, whatever the case');
  assert.deepEqual(platformListEntries(d, 'affectedGroup'), [], 'each list suggests its own');
  assert.throws(() => addSystemElement(d, act, { hazardId: 'h1', platformId: 'p1', text: 'FUEL SYSTEM' }), (e) => e instanceof PivotError && e.code === 'duplicate');
  assert.throws(() => updateSystemElement(d, act, { id: 's2', text: 'engine ROOM' }), (e) => e instanceof PivotError && e.code === 'duplicate');
  assert.throws(() => addSystemElement(d, act, { hazardId: 'h2', platformId: 'p1', text: 'Hull' }), (e) => e instanceof PivotError && e.code === 'not-found', 'only where the hazard is');
  assert.throws(() => addSystemElement(d, act, { hazardId: 'h1', platformId: '', text: 'Hull' }), PivotError);
  d = updateSystemElement(d, act, { id: 's2', text: 'Fuel tanks' });
  d = deleteSystemElement(d, act, { id: 's1' });
  assert.deepEqual(texts(platformListOn(d, 'systemElement', 'h1', 'p1')), ['Fuel tanks']);
  assert.deepEqual(platformListEntries(d, 'systemElement'), ['engine room', 'Fuel tanks']);
});

test('affected groups go with the hazard when it leaves a platform, and the rules catch one left behind', () => {
  let d = addAffectedGroup(seed(), act, { id: 'g1', hazardId: 'h1', platformId: 'p1', text: 'Crew' });
  d = addAffectedGroup(d, act, { id: 'g2', hazardId: 'h1', platformId: 'p2', text: 'Passengers' });
  assert.deepEqual(checkRules(d), []);
  const left = put(d, 'hazardPlatform', { ...d.records.hazardPlatform['hp:h1:p1'], status: 'deleted' });
  assert.deepEqual(checkRules(left).map((v) => v.rule), ['affectedGroup-without-platform-link']);
  d = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  assert.equal(d.records.affectedGroup.g1.status, 'deleted');
  assert.equal(d.records.affectedGroup.g2.status, 'live');
});
