import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, NUMBERED, emptyData, normalizeData, put, created } from '../../src/core/data.js';
import { ids, referenceLabel } from '../../src/core/ids.js';
import { platformsReached, referencesFor, hazardReferences, referenceTargets } from '../../src/core/queries.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { KIND_LABEL, recordName } from '../../src/ui/names.js';
import { act, seed } from '../helpers.js';

const ref = (id, fields = {}) => created(act, id, { number: null, title: `Doc ${id}`, docNumber: '', revision: '', note: '', url: 'https://example.org', path: '', file: null, pastFiles: [], ...fields });
const link = (r, kind, target) => created(act, ids.referenceLink(r, kind, target), { referenceId: r, targetKind: kind, targetId: target });

test('references are numbered records; links are records built from what they join', () => {
  assert.ok(KINDS.includes('reference') && KINDS.includes('referenceLink'));
  assert.ok(NUMBERED.some((n) => n.kind === 'reference' && n.counter === 'nextReferenceNumber'));
  assert.equal(emptyData().nextReferenceNumber, 1);
  const old = emptyData();
  delete old.nextReferenceNumber;
  delete old.records.reference;
  assert.equal(normalizeData(old).nextReferenceNumber, 1);
  assert.equal(ids.referenceLink('r1', 'hazard', 'h1'), 'rl:r1:hazard:h1');
  assert.equal(referenceLabel({ number: 7 }), 'R-0007');
  assert.equal(referenceLabel({ number: null }), 'TBC');
  const d = assignNumbers(put(emptyData(), 'reference', ref('r1')));
  assert.equal(d.records.reference.r1.number, 1);
  assert.equal(KIND_LABEL.reference, 'Reference');
  assert.equal(KIND_LABEL.referenceLink, 'Reference link');
  assert.equal(recordName('reference', d.records.reference.r1), 'Doc r1');
});

/** seed(): h1 (cf1, cq1, c1, c2) on p1 and p2; h2 on nothing. r1 → h1, cf1, p2; r2 → c1; r3 deleted → h1. */
function linked() {
  let d = seed();
  for (const r of ['r1', 'r2']) d = put(d, 'reference', ref(r));
  d = put(d, 'reference', { ...ref('r3'), status: 'deleted' });
  for (const [r, k, t] of [['r1', 'hazard', 'h1'], ['r1', 'causalFactor', 'cf1'], ['r1', 'platform', 'p2'], ['r2', 'control', 'c1'], ['r3', 'hazard', 'h1']]) d = put(d, 'referenceLink', link(r, k, t));
  return d;
}

test('where a reference and its links reach', () => {
  const d = linked();
  assert.deepEqual(platformsReached(d, 'reference', d.records.reference.r1), ['p1', 'p2']);
  assert.deepEqual(platformsReached(d, 'reference', d.records.reference.r2), ['p1', 'p2'], 'c1 is on h1, which is on both');
  assert.deepEqual(platformsReached(d, 'referenceLink', link('r9', 'platform', 'p2')), ['p2']);
  assert.deepEqual(platformsReached(d, 'referenceLink', link('r9', 'consequence', 'cq1')), ['p1', 'p2']);
  assert.deepEqual(platformsReached(d, 'referenceLink', link('r9', 'hazard', 'h2')), []);
});

test('the references of a record, of a hazard with its causal factors and consequences, and what a reference supports', () => {
  const d = linked();
  assert.deepEqual(referencesFor(d, 'hazard', 'h1').map((x) => x.reference.id), ['r1'], 'a deleted reference is left out');
  assert.deepEqual(hazardReferences(d, 'h1').map((x) => [x.reference.id, x.forText]), [['r1', ''], ['r1', 'Causal factor: Hot works']]);
  assert.deepEqual(referenceTargets(d, 'r1').map((x) => [x.link.targetKind, x.target.id, x.hazard?.id ?? null]), [['causalFactor', 'cf1', 'h1'], ['hazard', 'h1', null], ['platform', 'p2', null]],
    'links made at the same moment sort by id');
});
