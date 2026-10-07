import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyControls, copySfarp, setControlStatus, setSfarp } from '../../src/core/ops/assessment.js';
import { createControl, addControlHere, removeControlHere } from '../../src/core/ops/controls.js';
import { controlsOnPlatform, sfarpOf, partCopySources } from '../../src/core/queries.js';
import { checkRules } from '../../src/core/rules.js';
import { entries } from '../../src/core/history.js';
import { PivotError } from '../../src/core/errors.js';
import { seed, act } from '../helpers.js';

test('copy controls from another platform: the controls on it, each with its status and reason; those off it, off here', () => {
  let d = setControlStatus(seed(), act, { hazardId: 'h1', controlId: 'c1', platformId: 'p2', status: 'rejected', reason: 'Not fitted' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', status: 'planned' });
  d = createControl(d, act, { id: 'c3', title: 'Fire doors' });
  d = addControlHere(d, act, { hazardId: 'h1', platformId: 'p2', controlId: 'c3', kind: 'preventative' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c3', platformId: 'p2', status: 'implemented' });
  assert.deepEqual(partCopySources(d, 'h1', 'p1', 'controls').map((x) => [x.platform.name, [...x.states].sort()]), [['Bravo', ['implemented', 'recommended', 'rejected']]]);
  d = copyControls(d, act, { hazardId: 'h1', platformId: 'p1', from: 'p2' });
  assert.deepEqual(controlsOnPlatform(d, 'h1', 'p1').map((c) => [c.control.id, c.state]).sort(), [['c1', 'rejected'], ['c2', 'recommended'], ['c3', 'implemented']], 'Fire doors now here; recommended there, recommended here');
  assert.equal(d.records.ruling['ru:h1:c1:p1'].reason, 'Not fitted');
  assert.equal(entries(d).at(-1).action, 'Copy controls from Bravo');
  assert.equal(copyControls(d, act, { hazardId: 'h1', platformId: 'p1', from: 'p2' }), d, 'nothing different: nothing recorded');
  assert.throws(() => copyControls(d, act, { hazardId: 'h1', platformId: 'p1', from: 'p1' }), PivotError);
  // Taken off there, taken off here.
  d = removeControlHere(d, act, { hazardId: 'h1', platformId: 'p2', controlId: 'c2' });
  d = copyControls(d, act, { hazardId: 'h1', platformId: 'p1', from: 'p2' });
  assert.deepEqual(controlsOnPlatform(d, 'h1', 'p1').map((c) => c.control.id).sort(), ['c1', 'c3']);
  assert.deepEqual(checkRules(d), []);
});

test('copy SFARP: the other platform\'s justification, conclusion and conditions replace these', () => {
  let d = setSfarp(seed(), act, { hazardId: 'h1', platformId: 'p2', justification: 'J', conclusion: 'Reduced SFARP', conditions: '' });
  d = setSfarp(d, act, { hazardId: 'h1', platformId: 'p1', conditions: 'Old' });
  assert.deepEqual(partCopySources(d, 'h1', 'p1', 'sfarp').map((x) => x.platform.name), ['Bravo']);
  d = copySfarp(d, act, { hazardId: 'h1', platformId: 'p1', from: 'p2' });
  assert.deepEqual(sfarpOf(d, 'h1', 'p1'), { justification: 'J', conclusion: 'Reduced SFARP', conditions: '' });
  assert.equal(entries(d).at(-1).action, 'Copy SFARP from Bravo');
});

test('a control\'s implementation status on a platform: free text, cleared when blank, and gone when the control or the platform leaves the hazard', async () => {
  const { setImplementationStatus } = await import('../../src/core/ops/assessment.js');
  const { unlinkControl } = await import('../../src/core/ops/controls.js');
  const { unlinkHazard } = await import('../../src/core/ops/platforms.js');
  let d = setImplementationStatus(seed(), act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', text: '  Ordered; fitting in March ' });
  const id = 'is:h1:c1:p1';
  assert.equal(d.records.implementationStatus[id].text, 'Ordered; fitting in March');
  assert.equal(entries(d).at(-1).action, 'Set implementation status');
  assert.equal(setImplementationStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', text: 'Ordered; fitting in March' }), d, 'unchanged: nothing recorded');
  assert.equal(entries(setImplementationStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', text: '' })).at(-1).action, 'Clear implementation status');
  assert.throws(() => setImplementationStatus(d, act, { hazardId: 'h2', controlId: 'c1', platformId: 'p1', text: 'x' }), PivotError, 'only a control linked to the hazard on its platform');
  assert.deepEqual(checkRules(d), []);
  assert.equal(unlinkControl(d, act, { hazardId: 'h1', controlId: 'c1' }).records.implementationStatus[id].status, 'deleted');
  const off = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  assert.equal(off.records.implementationStatus[id].status, 'deleted');
  assert.deepEqual(checkRules(off), []);
});
