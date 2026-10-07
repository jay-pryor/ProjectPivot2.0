import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, NUMBERED, emptyData, normalizeData, put, created } from '../../src/core/data.js';
import { ids, referenceLabel } from '../../src/core/ids.js';
import { platformsReached, referencesFor, hazardReferences, referenceTargets } from '../../src/core/queries.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { KIND_LABEL, recordName } from '../../src/ui/names.js';
import { act, seed } from '../helpers.js';
import { PivotError } from '../../src/core/errors.js';
import { checkRules } from '../../src/core/rules.js';
import { mergeData } from '../../src/core/merge.js';
import { entries } from '../../src/core/history.js';
import { restoreRecord, deleteHazard, deleteCausalFactor } from '../../src/core/ops/hazards.js';
import { deleteControl, unlinkControl } from '../../src/core/ops/controls.js';
import { unlinkHazard, deletePlatform } from '../../src/core/ops/platforms.js';
import {
  TARGET_KINDS, createReference, updateReference, attachFile, retireReference, deleteReference, linkReference, unlinkReference,
} from '../../src/core/ops/references.js';

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
  assert.equal(referenceLabel({ number: 7 }), 'REF-007');
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

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const file = (n, name = 'spec.pdf') => ({ name, stored: `files/r1/${n}-${name}`, size: 10 * n, type: 'application/pdf', addedBy: 'u1', addedAt: act.at });
const made = () => createReference(seed(), act, { id: 'r1', title: 'Fire safety case', docNumber: 'SC-12', url: 'https://example.org/sc' });

test('a reference needs a title and one of a file, a web link or a network path', () => {
  const d = made();
  const r = d.records.reference.r1;
  assert.deepEqual([r.title, r.docNumber, r.revision, r.note, r.url, r.path, r.file, r.pastFiles, r.number], ['Fire safety case', 'SC-12', '', '', 'https://example.org/sc', '', null, [], null]);
  assert.equal(entries(d).at(-1).action, 'Create reference');
  assert.throws(() => createReference(seed(), act, { title: 'Nothing' }), code('reference.empty'));
  assert.throws(() => createReference(seed(), act, { title: ' ', url: 'x' }), code('empty'));
  assert.doesNotThrow(() => createReference(seed(), act, { title: 'A file', file: file(1) }));
  assert.doesNotThrow(() => createReference(seed(), act, { title: 'A path', path: '\\\\srv\\docs\\a.pdf' }));
  assert.equal(updateReference(d, act, { id: 'r1', revision: ' C ', path: '\\\\srv\\a' }).records.reference.r1.revision, 'C');
  assert.throws(() => updateReference(d, act, { id: 'r1', url: '' }), code('reference.empty'));
});

test('a new file replaces the current one, which is kept as a past file', () => {
  let d = attachFile(made(), act, { id: 'r1', file: file(1) });
  assert.equal(entries(d).at(-1).action, 'Add reference file');
  d = attachFile(d, act, { id: 'r1', file: file(2) });
  assert.equal(entries(d).at(-1).action, 'Replace reference file');
  assert.equal(d.records.reference.r1.file.stored, 'files/r1/2-spec.pdf');
  assert.deepEqual(d.records.reference.r1.pastFiles.map((f) => f.stored), ['files/r1/1-spec.pdf']);
  d = attachFile(d, act, { id: 'r1', file: file(3) });
  assert.deepEqual(d.records.reference.r1.pastFiles.map((f) => f.stored), ['files/r1/2-spec.pdf', 'files/r1/1-spec.pdf'], 'newest first');
});

test('linking to each kind of record, once; unlinking; deleting a reference only when nothing is linked', () => {
  assert.deepEqual(TARGET_KINDS, ['hazard', 'causalFactor', 'consequence', 'hazardPhase', 'failureMode', 'systemElement', 'affectedGroup', 'control', 'platform']);
  let d = made();
  for (const [k, t] of [['hazard', 'h1'], ['causalFactor', 'cf1'], ['consequence', 'cq1'], ['control', 'c1'], ['platform', 'p1']]) d = linkReference(d, act, { referenceId: 'r1', targetKind: k, targetId: t });
  assert.equal(Object.values(d.records.referenceLink).filter((l) => l.status === 'live').length, 5);
  assert.equal(linkReference(d, act, { referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' }), d, 'linking twice changes nothing');
  assert.throws(() => linkReference(d, act, { referenceId: 'r1', targetKind: 'report', targetId: 'x' }), code('reference.target'));
  assert.throws(() => deleteReference(d, act, { id: 'r1' }), code('reference.in-use'));
  for (const [k, t] of [['hazard', 'h1'], ['causalFactor', 'cf1'], ['consequence', 'cq1'], ['control', 'c1'], ['platform', 'p1']]) d = unlinkReference(d, act, { referenceId: 'r1', targetKind: k, targetId: t });
  d = deleteReference(d, act, { id: 'r1' });
  assert.equal(d.records.reference.r1.status, 'deleted');
  assert.deepEqual(checkRules(d), []);
});

test('retiring keeps the links; a retired reference can be restored', () => {
  let d = linkReference(made(), act, { referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' });
  d = retireReference(d, act, { id: 'r1' });
  assert.equal(d.records.reference.r1.status, 'retired');
  assert.equal(d.records.referenceLink[ids.referenceLink('r1', 'hazard', 'h1')].status, 'live');
  assert.deepEqual(checkRules(d), []);
  assert.equal(restoreRecord(d, act, { kind: 'reference', id: 'r1' }).records.reference.r1.status, 'live');
});

test('deleting a record deletes the reference links to it; a hazard takes its causal factors\' and consequences\' too', () => {
  let d = made();
  for (const [k, t] of [['hazard', 'h1'], ['causalFactor', 'cf1'], ['consequence', 'cq1'], ['control', 'c1'], ['platform', 'p2']]) d = linkReference(d, act, { referenceId: 'r1', targetKind: k, targetId: t });
  const gone = (e, k, t) => e.records.referenceLink[ids.referenceLink('r1', k, t)].status === 'deleted';
  const cf = deleteCausalFactor(d, act, { id: 'cf1' });
  assert.ok(gone(cf, 'causalFactor', 'cf1'));
  let h = unlinkHazard(unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' }), act, { hazardId: 'h1', platformId: 'p2' });
  h = deleteHazard(h, act, { id: 'h1' });
  assert.ok(gone(h, 'hazard', 'h1') && gone(h, 'causalFactor', 'cf1') && gone(h, 'consequence', 'cq1'));
  assert.equal(h.records.reference.r1.status, 'live', 'the reference stays');
  assert.deepEqual(checkRules(h), []);
  let c = unlinkControl(d, act, { hazardId: 'h1', controlId: 'c1' });
  c = deleteControl(c, act, { id: 'c1' });
  assert.ok(gone(c, 'control', 'c1'));
  let p = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p2' });
  p = deletePlatform(p, act, { id: 'p2' });
  assert.ok(gone(p, 'platform', 'p2'));
  assert.deepEqual(checkRules(p), []);
});

test('the rules, and two people linking one reference to different records both keep their links', () => {
  const d = linkReference(made(), act, { referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' });
  const orphan = put(d, 'reference', { ...d.records.reference.r1, status: 'deleted' });
  assert.deepEqual(checkRules(orphan).map((v) => v.rule), ['reference-link-orphaned']);
  const targetGone = put(d, 'hazard', { ...d.records.hazard.h1, status: 'deleted' });
  assert.ok(checkRules(targetGone).some((v) => v.rule === 'reference-link-target-deleted'));
  const empty = put(d, 'reference', { ...d.records.reference.r1, url: '' });
  assert.deepEqual(checkRules(empty).map((v) => v.rule), ['reference-empty']);
  const b = made();
  const mine = linkReference(b, { by: 'me', at: '2026-09-28T12:00:00+10:00' }, { referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' });
  const theirs = linkReference(b, { by: 'them', at: '2026-09-28T12:30:00+10:00' }, { referenceId: 'r1', targetKind: 'control', targetId: 'c2' });
  const { data, conflicts } = mergeData(b, mine, theirs, { by: 'me', at: '2026-09-28T13:00:00+10:00' });
  assert.deepEqual(conflicts, []);
  assert.deepEqual(referenceTargets(data, 'r1').map((x) => x.link.targetKind).sort(), ['control', 'hazard']);
});
