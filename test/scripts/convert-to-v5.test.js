import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertBody } from '../../scripts/convert-to-v5.mjs';
import { emptyData, created, validateData } from '../../src/core/data.js';
import { act } from '../helpers.js';

/** A schema 4 body: p1 with an open review r1 and a completed one r0, and their rows. */
function v4() {
  const d = /** @type {any} */ (emptyData());
  delete d.records.workflow; delete d.records.workflowStep; delete d.nextWorkflowNumber;
  d.records.platform.p1 = created(act, 'p1', { number: 1, name: 'A', ownerId: 'u1', reviewRule: null, reviewStart: null });
  d.records.review.r0 = created(act, 'r0', { platformId: 'p1', state: 'completed', outcome: 'Fine', notes: '', dueBefore: '2026-04-30', dueAfter: '2026-10-30', completedBy: 'u1', completedAt: act.at });
  d.records.review.r1 = created(act, 'r1', { platformId: 'p1', state: 'open', outcome: '', notes: '', dueBefore: null, dueAfter: null, completedBy: null, completedAt: null });
  d.records.reviewRow = { 'rr:r0:h1': created(act, 'rr:r0:h1', { reviewId: 'r0', hazardId: 'h1', reviewed: true, note: '' }) };
  return d;
}

test('open reviews and every review row go; completed reviews stay, with no workflow; the workflow kinds arrive', () => {
  const out = convertBody(v4());
  assert.deepEqual(Object.keys(out.records.review), ['r0']);
  assert.equal(out.records.review.r0.workflowId, null);
  assert.ok(!('reviewRow' in out.records));
  assert.deepEqual([out.records.workflow, out.records.workflowStep, out.nextWorkflowNumber], [{}, {}, 1]);
  assert.deepEqual(validateData(out), []);
});
