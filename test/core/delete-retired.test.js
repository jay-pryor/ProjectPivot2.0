import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { entries } from '../../src/core/history.js';
import { checkRules } from '../../src/core/rules.js';
import { deleteHazard } from '../../src/core/ops/hazards.js';
import { retirePlatform } from '../../src/core/ops/platforms.js';
import { setAssessment, setSfarp, setControlStatus } from '../../src/core/ops/assessment.js';
import { linkExistingControl } from '../../src/core/ops/controls.js';
import { createSafetyReport } from '../../src/core/ops/safety-reports.js';
import { act, seed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
/** h1 on p1 and p2, with something of each per-platform kind on p1. */
function filled() {
  let d = setAssessment(seed(), act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'capability', likelihood: 'C', consequence: 2 });
  d = setSfarp(d, act, { hazardId: 'h1', platformId: 'p1', conclusion: 'SFARP' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'planned' });
  d = linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c2', kind: 'mitigating' });
  return createSafetyReport(d, act, { id: 'sr1', hazardId: 'h1', platformId: 'p1', summary: 'Near miss' });
}

test('a hazard on live platforms cannot be deleted; the refusal names only the live ones', () => {
  const d = retirePlatform(filled(), act, { id: 'p2' });
  assert.throws(() => deleteHazard(d, act, { id: 'h1' }), (e) => code('hazard.on-platforms')(e) && /Alpha/.test(e.message) && !/Bravo/.test(e.message) && /unlink it from that platform or retire it/i.test(e.message));
});

test('a hazard only on retired platforms can be deleted, taking its links and everything on them in one change', () => {
  let d = retirePlatform(filled(), act, { id: 'p1' });
  d = retirePlatform(d, act, { id: 'p2' });
  d = deleteHazard(d, act, { id: 'h1' });
  assert.equal(entries(d).at(-1).action, 'Delete hazard');
  assert.equal(d.records.hazard.h1.status, 'deleted');
  for (const [kind, id] of [['hazardPlatform', 'hp:h1:p1'], ['hazardPlatform', 'hp:h1:p2'], ['assessment', 'ra:h1:p1:residual:capability'], ['sfarp', 'sf:h1:p1'], ['ruling', 'ru:h1:c1:p1'], ['existingControl', 'ec:h1:p1:c2'], ['safetyReport', 'sr1']]) {
    assert.equal(d.records[kind][id].status, 'deleted', `${kind} ${id}`);
  }
  assert.equal(d.records.platform.p1.status, 'retired', 'the platforms themselves stay');
  assert.deepEqual(checkRules(d), []);
});

test('retiring a hazard still needs it off every platform, retired ones included', async () => {
  const { retireHazard } = await import('../../src/core/ops/hazards.js');
  let d = retirePlatform(filled(), act, { id: 'p1' });
  d = retirePlatform(d, act, { id: 'p2' });
  assert.throws(() => retireHazard(d, act, { id: 'h1' }), code('hazard.on-platforms'));
});
