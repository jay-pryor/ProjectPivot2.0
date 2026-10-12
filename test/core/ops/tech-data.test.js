import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { entries } from '../../../src/core/history.js';
import { mergeData } from '../../../src/core/merge.js';
import { ids } from '../../../src/core/ids.js';
import { createReference, setReferenceArchived, retireReference, deleteReference } from '../../../src/core/ops/references.js';
import { retirePlatform, unlinkHazard } from '../../../src/core/ops/platforms.js';
import { checkRules } from '../../../src/core/rules.js';
import { startWorkflow, setTechScope, addTechHazard, startOnboarding } from '../../../src/core/ops/workflows.js';
import { techScope, techPairs } from '../../../src/core/workflows.js';
import { act, later, seed } from '../../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
/** Reference r1 (rev A) and New Tech Data t1 on it. The seed has h1 Fire on p1 Alpha and p2 Bravo; h2 Flood on nothing. */
export function started() {
  const d = createReference(seed(), act, { id: 'r1', title: 'Service bulletin 12', revision: 'A', url: 'https://sb12' });
  return startWorkflow(d, act, { id: 't1', type: 'newTechData', referenceId: 'r1' });
}
export const scope = (d, platformId, hazardId, checked = true) => setTechScope(d, act, { workflowId: 't1', platformId, hazardId, checked });
/** t1 with p1|h1 and p2|h1 in scope. */
export const scoped = () => scope(scope(scope(scope(started(), 'p1'), 'p1', 'h1'), 'p2'), 'p2', 'h1');
const pairs = (d) => techPairs(d, d.records.workflow.t1).map((x) => x.key);

test('New Tech Data starts on a live, unarchived reference, opens on its scope, one at a time', () => {
  const d = started();
  const w = d.records.workflow.t1;
  assert.deepEqual([w.type, w.referenceId, w.platformId, w.at.hazardId, w.linked, w.ownerId], ['newTechData', 'r1', null, '@scope', null, 'u1']);
  assert.throws(() => startWorkflow(d, act, { type: 'newTechData', referenceId: 'r1' }), code('techData.open'));
  assert.throws(() => startWorkflow(setReferenceArchived(d, act, { id: 'r1', archived: true }), act, { type: 'newTechData', referenceId: 'r1' }), code('reference.archived'));
  assert.throws(() => startWorkflow(retireReference(d, act, { id: 'r1' }), act, { type: 'newTechData', referenceId: 'r1' }), code('reference.retired'));
});

test('scope: platforms first, then hazards on them; unticking a platform hides its hazards until it is ticked again', () => {
  let d = scope(started(), 'p1');
  assert.throws(() => scope(d, 'p2', 'h1'), code('techData.scope'), 'p2 is not ticked');
  assert.throws(() => scope(d, 'p1', 'h2'), code('workflow.hazard'), 'h2 is not on p1');
  d = scope(d, 'p1', 'h1');
  assert.deepEqual(pairs(d), ['p1|h1']);
  assert.equal(entries(d).at(-1).action, 'Scope new tech data');
  d = scope(d, 'p1', undefined, false);
  assert.deepEqual([pairs(d), techScope(d, d.records.workflow.t1)], [[], []]);
  d = scope(d, 'p1');
  assert.deepEqual(pairs(d), ['p1|h1'], 'its hazard comes back with it');
});

test('a platform being onboarded cannot be scoped, and only the owner scopes', () => {
  const d = startOnboarding(started(), act, { id: 'o1', platformId: 'p9', name: 'Charlie', ownerId: 'u1' });
  assert.throws(() => scope(d, 'p9'), code('techData.onboarding'));
  assert.throws(() => setTechScope(started(), later, { workflowId: 't1', platformId: 'p1', checked: true }), code('workflow.owner'));
});

test('adding a hazard links it to the platform and scopes it as added, in one change; a title creates it', () => {
  let d = scope(started(), 'p1');
  d = addTechHazard(d, act, { workflowId: 't1', platformId: 'p1', hazardId: 'h2' });
  assert.equal(d.records.hazardPlatform[ids.hazardPlatform('h2', 'p1')].status, 'live');
  assert.equal(entries(d).at(-1).action, 'Link hazard to platform');
  d = addTechHazard(d, act, { workflowId: 't1', platformId: 'p1', title: '  Laser glare ' });
  assert.deepEqual([entries(d).at(-1).action, entries(d).at(-1).items.map((i) => i.kind).sort()], ['Create hazard on platform', ['hazard', 'hazardPlatform', 'workflowStep']]);
  // The new hazard's id is random and both are unnumbered, so their order is not fixed: compare sorted.
  assert.deepEqual(techPairs(d, d.records.workflow.t1).map((x) => `${x.hazard.title}:${x.added}`).sort(), ['Flood:true', 'Laser glare:true']);
  assert.throws(() => addTechHazard(d, act, { workflowId: 't1', platformId: 'p2', hazardId: 'h2' }), code('techData.scope'));
  assert.throws(() => addTechHazard(d, act, { workflowId: 't1', platformId: 'p1', title: ' ' }), (e) => e instanceof PivotError);
});

test('a hazard already on the platform, added again, is just scoped: not marked added', () => {
  const d = addTechHazard(scope(started(), 'p1'), act, { workflowId: 't1', platformId: 'p1', hazardId: 'h1' });
  assert.deepEqual(techPairs(d, d.records.workflow.t1).map((x) => [x.key, x.added]), [['p1|h1', false]]);
});

test('a hazard unlinked from its platform, or a retired platform, drops out of scope; the workflow stays open', () => {
  let d = scoped();
  assert.deepEqual(pairs(d), ['p1|h1', 'p2|h1']);
  d = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual(pairs(d), ['p2|h1']);
  d = retirePlatform(d, act, { id: 'p2' });
  assert.deepEqual([pairs(d), d.records.workflow.t1.state], [[], 'open']);
  assert.deepEqual(checkRules(d), []);
});

test('retiring, archiving or deleting the reference cancels its open New Tech Data, keeping what it covered', () => {
  for (const end of [(d) => retireReference(d, act, { id: 'r1' }), (d) => setReferenceArchived(d, act, { id: 'r1', archived: true }), (d) => deleteReference(d, act, { id: 'r1' })]) {
    const d = end(scoped());
    assert.equal(d.records.workflow.t1.state, 'cancelled');
    assert.deepEqual(d.records.workflow.t1.covered, ['p1|h1', 'p2|h1']);
    assert.deepEqual(checkRules(d), []);
  }
});

test('the rules: an open New Tech Data needs a live, unarchived reference, and one per reference', () => {
  const d = started();
  const twice = { ...d, records: { ...d.records, workflow: { ...d.records.workflow, t9: { ...d.records.workflow.t1, id: 't9' } } } };
  assert.deepEqual(checkRules(twice).map((v) => v.rule), ['two-open-techdata']);
  const gone = { ...d, records: { ...d.records, reference: { ...d.records.reference, r1: { ...d.records.reference.r1, archived: true } } } };
  assert.deepEqual(checkRules(gone).map((v) => v.rule), ['workflow-subject-not-live']);
});

test('two people starting New Tech Data on the same reference: mine is kept', () => {
  const base = createReference(seed(), act, { id: 'r1', title: 'Service bulletin 12', url: 'https://sb12' });
  const mine = startWorkflow(base, act, { id: 'mine', type: 'newTechData', referenceId: 'r1' });
  const theirs = startWorkflow(base, later, { id: 'theirs', type: 'newTechData', referenceId: 'r1' });
  const { data } = mergeData(base, mine, theirs, { by: 'u1', at: '2026-09-28T13:00:00+10:00' });
  assert.equal(data.records.workflow.mine.state, 'open');
  assert.equal(data.records.workflow.theirs.status, 'deleted');
});
