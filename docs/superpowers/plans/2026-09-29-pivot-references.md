# Pivot Release 2c: Reference Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A register of supporting documents (stored files kept by revision, web links, network paths), each linked to the hazards, causal factors, consequences, controls and platforms it supports, with a References section in produced reports.

**Architecture:** Two record kinds (`reference`, numbered R-0001; `referenceLink`, id built from what it joins) changed through ops in `src/core/ops/references.js` and guarded by rules the merge already enforces. Stored files are written whole-or-nothing into `files/<reference id>/` by `src/storage/store.js` and never overwritten. The UI adds a References list and page, a References card on hazard, control and platform pages, two pickers, and a DocGen section fed from the report snapshot.

**Tech Stack:** Plain ES modules, JSDoc types checked by `tsc --checkJs`, `node:test`, the File System Access API, no runtime dependency, no UI framework.

**Spec:** `docs/superpowers/specs/2026-09-29-pivot-references-design.md`

## Global Constraints

- A live reference has at least one of `url`, `path`, `file`; `title` is required.
- Link targets are exactly `hazard`, `causalFactor`, `consequence`, `control`, `platform`. Link id: `rl:<referenceId>:<targetKind>:<targetId>`.
- Stored files go to `files/<referenceId>/<n>-<safe name>`; a stored path is never written twice; nothing Pivot does removes a file from `files/`.
- References are numbered at save (`nextReferenceNumber`), shown R-0001, `TBC` until saved.
- Deleting a hazard, causal factor, consequence, control or platform deletes the reference links to it (a hazard also those to its causal factors and consequences). Retiring deletes nothing. Deleting a reference is refused while it has live links.
- Only `http:`, `https:` and `mailto:` web links get an Open link; a network path gets an Open link only as a `file:` URL built from `\\server\share\…` or `C:\…`.
- Schema version stays `2`; `normalizeData` brings older files up to date.
- Every piece of user text written into HTML passes through the `html` tagged template.
- Commands: `npm test`, `npm run typecheck`, `npm run build`, all passing at the end of every task.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on the branch `release-2c-references`.

## Review Focus

1. **A web link of `javascript:alert(1)`** typed into a reference. Expect it stored and shown as text but never rendered as a clickable Open link. Pinned in Task 6.
2. **Two uploads of files with the same name to one reference** (a new revision named like the old). Expect a new stored path, the old file kept under Past files and still openable. Pinned in Tasks 3 and 5.
3. **A stored file removed from the folder by hand.** Expect a red *File missing* badge on the list and the page after the check, and Open to say the file is missing rather than fail oddly. Pinned in Tasks 5 and 6.
4. **Deleting a hazard whose causal factor carries a reference link.** Expect the links to go with it and the rules to hold; the reference stays. Pinned in Task 2.
5. **Two people uploading a revision to the same reference at once.** Expect both files written to different paths (neither overwritten); the saved record keeps one of them (mine wins), the other stays in the folder. Pinned in Task 3 (storage).

## File Structure

```
src/core/data.js            + reference, referenceLink kinds; reference numbering counter
src/core/ids.js             + referenceLabel, ids.referenceLink
src/core/merge.js           carries nextReferenceNumber
src/core/queries.js         + platformsReached for references and links; referencesFor, hazardReferences, referenceTargets
src/core/ops/references.js  NEW: TARGET_KINDS, createReference, updateReference, attachFile, retireReference, deleteReference, linkReference, unlinkReference, linksTo
src/core/ops/hazards.js     deletes cascade to reference links; reference restorable
src/core/ops/controls.js    deleteControl cascades to reference links
src/core/ops/platforms.js   deletePlatform cascades to reference links
src/core/rules.js           + reference rules
src/ui/names.js             + reference labels and names
src/storage/folder.js       + readFile, exists; writeWhole accepts a Blob
src/storage/store.js        + safeName, storeReferenceFile, openReferenceFile, missingFiles
src/ui/drafts.js            formValues keeps a File as a File
src/reports/snapshot.js     + references
src/reports/docgen-host.js  + References section
src/ui/controller.js        + reference edits and handlers, missing-file check, pickers
src/main.js                 + openFile, copyText
src/ui/screens/references.js NEW: referencesView, referenceView, referencesCard, safeHref, fileUrl
src/ui/screens/picker.js    + linkReferences, linkTargets pickers
src/ui/screens/common.js    + References in the nav
src/ui/render.js            + the references and reference views
src/ui/screens/hazards.js, controls.js, platforms.js  + References card
src/ui/styles.css           + reference layout
test/core/references.test.js         NEW
test/storage/reference-files.test.js NEW
test/reports/snapshot.test.js, test/reports/docgen-host.test.js  + references
test/ui/controller-references.test.js NEW
test/ui/screens-references.test.js    NEW
test/ui/wire.test.js                  + formValues keeps files
```

---

### Task 1: The data model for references

**Files:**
- Modify: `src/core/data.js`, `src/core/ids.js`, `src/core/merge.js`, `src/core/queries.js`, `src/ui/names.js`
- Test: `test/core/references.test.js` (create)

**Interfaces:**
- Produces:
  - `KINDS` ends with `'reference', 'referenceLink'`; `NUMBERED` gains `{ kind: 'reference', counter: 'nextReferenceNumber' }`; `emptyData().nextReferenceNumber === 1`.
  - `referenceLabel(rec): string` → `R-0001` or `TBC`; `ids.referenceLink(referenceId, targetKind, targetId)` → `rl:<r>:<k>:<t>`.
  - `platformsReached(data, 'reference', rec)` and `(data, 'referenceLink', rec)`.
  - `referencesFor(data, targetKind, targetId): { link, reference }[]` (non-deleted references, by label then title).
  - `hazardReferences(data, hazardId): { link, reference, forText }[]` (the hazard's own, `forText: ''`; then its causal factors' and consequences', `forText: 'Causal factor: …'` / `'Consequence: …'`).
  - `referenceTargets(data, referenceId): { link, target, hazard }[]` (`hazard` is the parent hazard for a causal factor or consequence, else null; deleted targets left out).
  - `KIND_LABEL.reference = 'Reference'`, `KIND_LABEL.referenceLink = 'Reference link'`; `recordName('reference', rec)` is its title.

- [ ] **Step 1: Write the failing test**

Create `test/core/references.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/core/references.test.js`
Expected: FAIL — `referenceLabel` is not exported.

- [ ] **Step 3: Write the implementation**

`src/core/data.js`:
- `KINDS`: add `'reference', 'referenceLink',` after `'review', 'reviewRow',`.
- `NUMBERED`: add `{ kind: 'reference', counter: 'nextReferenceNumber' },`.
- `Data` typedef: add `nextReferenceNumber: number`.
- `emptyData()`: add `nextReferenceNumber: 1`.

`src/core/merge.js`, in the `data` literal after `nextPlatformNumber: counters.nextPlatformNumber,`, add `nextReferenceNumber: counters.nextReferenceNumber,`.

`src/core/ids.js`: add after `platformLabel`:

```js
/** @param {{ number?: number | null, [field: string]: any }} reference */
export function referenceLabel(reference) {
  return numberLabel('R', reference);
}
```

and to `ids`, after `reviewRow`:

```js
  /** @param {string} r a reference id @param {string} k the target's kind @param {string} t the target's id */
  referenceLink: (r, k, t) => `rl:${r}:${k}:${t}`,
```

`src/core/queries.js`: import `referenceLabel` from `./ids.js`; add a helper above `platformsReached`:

```js
/** The platforms a reference link's target is on. @param {Data} data @param {string} kind @param {string} id @returns {string[]} */
function targetPlatforms(data, kind, id) {
  switch (kind) {
    case 'platform': return [id];
    case 'hazard': return platformsOfHazard(data, id);
    case 'causalFactor':
    case 'consequence': {
      const r = get(data, kind, id);
      return r ? platformsOfHazard(data, r.hazardId) : [];
    }
    case 'control': return platformsReached(data, 'control', { id });
    default: return [];
  }
}
```

and in `platformsReached` before `default`:

```js
    case 'reference':
      return sortedUnique(live(data, 'referenceLink').filter((l) => l.referenceId === rec.id).flatMap((l) => targetPlatforms(data, l.targetKind, l.targetId)));
    case 'referenceLink': return sortedUnique(targetPlatforms(data, rec.targetKind, rec.targetId));
```

and append:

```js
/** @param {Rec} a @param {Rec} b references by label (numbered first), then title */
const byReference = (a, b) => referenceLabel(a).localeCompare(referenceLabel(b), undefined, { numeric: true }) || String(a.title).localeCompare(String(b.title));

/** The references linked to one record. @param {Data} data @param {string} targetKind @param {string} targetId */
export function referencesFor(data, targetKind, targetId) {
  return live(data, 'referenceLink').filter((l) => l.targetKind === targetKind && l.targetId === targetId)
    .map((link) => ({ link, reference: /** @type {Rec} */ (get(data, 'reference', link.referenceId)) }))
    .filter((x) => x.reference && x.reference.status !== 'deleted')
    .sort((a, b) => byReference(a.reference, b.reference));
}

/** A hazard's references, then those of its causal factors and consequences. @param {Data} data @param {string} hazardId */
export function hazardReferences(data, hazardId) {
  const out = referencesFor(data, 'hazard', hazardId).map((x) => ({ ...x, forText: '' }));
  for (const [kind, word] of [['causalFactor', 'Causal factor'], ['consequence', 'Consequence']]) {
    for (const r of live(data, kind).filter((x) => x.hazardId === hazardId)) {
      for (const x of referencesFor(data, kind, r.id)) out.push({ ...x, forText: `${word}: ${r.text}` });
    }
  }
  return out;
}

/** What a reference supports: its live links, each with the record it points at. @param {Data} data @param {string} referenceId */
export function referenceTargets(data, referenceId) {
  return live(data, 'referenceLink').filter((l) => l.referenceId === referenceId).map((link) => {
    const target = get(data, link.targetKind, link.targetId);
    const hazard = target && (link.targetKind === 'causalFactor' || link.targetKind === 'consequence') ? get(data, 'hazard', target.hazardId) ?? null : null;
    return { link, target, hazard };
  }).filter((x) => x.target && x.target.status !== 'deleted');
}
```

`src/ui/names.js`: in `KIND_LABEL` add `reference: 'Reference', referenceLink: 'Reference link',`; in `recordName` add `case 'reference':` to the `control`/`report` case (both return `rec.title`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/core/references.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src/core/data.js src/core/ids.js src/core/merge.js src/core/queries.js src/ui/names.js test/core/references.test.js
git commit -m "References in the data model: numbered reference records and link records, where they reach, and what each supports

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Reference operations, cascades and rules

**Files:**
- Create: `src/core/ops/references.js`
- Modify: `src/core/ops/hazards.js` (`deleteHazard`, `childOps.remove`, `RESTORABLE`), `src/core/ops/controls.js` (`deleteControl`), `src/core/ops/platforms.js` (`deletePlatform`), `src/core/rules.js`
- Test: `test/core/references.test.js` (append)

**Interfaces:**
- Consumes: Task 1.
- Produces (each `(data, act, args) => data`):
  - `TARGET_KINDS = ['hazard', 'causalFactor', 'consequence', 'control', 'platform']`
  - `createReference({ id?, title, docNumber?, revision?, note?, url?, path?, file? })` — action `Create reference`; error `reference.empty` without url, path or file; `empty` without a title.
  - `updateReference({ id, title?, docNumber?, revision?, note?, url?, path? })` — `Edit reference`; `reference.empty` if it would leave nothing.
  - `attachFile({ id, file })` — `Add reference file` or `Replace reference file`; the current file moves to the front of `pastFiles`.
  - `retireReference({ id })` — `Retire reference`; `deleteReference({ id })` — `Delete reference`, error `reference.in-use` while linked.
  - `linkReference({ referenceId, targetKind, targetId })` — `Link reference`; error `reference.target` for another kind; linking twice changes nothing.
  - `unlinkReference({ referenceId, targetKind, targetId })` — `Unlink reference`.
  - `linksTo(data, act, targets: { kind, id }[])` — the live links to those targets, as records marked deleted, for other ops to include.
  - `restoreRecord({ kind: 'reference', id })` restores a retired reference.
  - Rules: `reference-link-orphaned` (records `[reference, link]`), `reference-link-target-deleted` (records `[target, link]`), `reference-empty` (records `[reference]`).
  - A stored file object: `{ name, stored, size, type, addedBy, addedAt }`.

- [ ] **Step 1: Write the failing test**

Append to `test/core/references.test.js` (add these imports at the top):

```js
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
```

```js
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
  assert.deepEqual(TARGET_KINDS, ['hazard', 'causalFactor', 'consequence', 'control', 'platform']);
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/core/references.test.js`
Expected: FAIL — cannot find module `src/core/ops/references.js`.

- [ ] **Step 3: Write the implementation**

Create `src/core/ops/references.js`:

```js
import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, live, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */
/** @typedef {import('../data.js').Rec} Rec */
/** @typedef {{ name: string, stored: string, size: number, type: string, addedBy: string, addedAt: string }} StoredFile */

/** The kinds of record a reference can support. */
export const TARGET_KINDS = Object.freeze(['hazard', 'causalFactor', 'consequence', 'control', 'platform']);

/** @param {unknown} v */
const text = (v) => String(v ?? '').trim();

/** @param {Rec} r */
function needSomething(r) {
  if (!r.url && !r.path && !r.file) throw new PivotError('reference.empty', 'A reference needs a file, a web link or a network path.');
}

/**
 * @param {Data} data @param {Act} act
 * @param {{ id?: string, title: string, docNumber?: string, revision?: string, note?: string, url?: string, path?: string, file?: StoredFile | null }} args
 */
export function createReference(data, act, { id = newId(), title, docNumber, revision, note, url, path, file = null }) {
  const rec = created(act, id, {
    number: null, title: needText(title, 'A reference title'), docNumber: text(docNumber), revision: text(revision), note: text(note),
    url: text(url), path: text(path), file: file ?? null, pastFiles: [],
  });
  needSomething(rec);
  return commit(data, act, 'Create reference', [{ kind: 'reference', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, title?: string, docNumber?: string, revision?: string, note?: string, url?: string, path?: string }} args */
export function updateReference(data, act, { id, ...fields }) {
  const r = need(data, 'reference', id);
  /** @type {Record<string, string>} */
  const next = {};
  if (fields.title !== undefined) next.title = needText(fields.title, 'A reference title');
  for (const f of /** @type {const} */ (['docNumber', 'revision', 'note', 'url', 'path'])) if (fields[f] !== undefined) next[f] = text(fields[f]);
  const rec = changed(r, act, next);
  needSomething(rec);
  return commit(data, act, 'Edit reference', [{ kind: 'reference', rec }]);
}

/** A file just stored in the folder becomes the reference's file; the one before it is kept as a past file. @param {Data} data @param {Act} act @param {{ id: string, file: StoredFile }} args */
export function attachFile(data, act, { id, file }) {
  const r = need(data, 'reference', id);
  if (!file || !file.stored) throw new PivotError('reference.file', 'Choose a file to store.');
  const pastFiles = r.file ? [r.file, ...r.pastFiles] : r.pastFiles;
  return commit(data, act, r.file ? 'Replace reference file' : 'Add reference file', [{ kind: 'reference', rec: changed(r, act, { file, pastFiles }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function retireReference(data, act, { id }) {
  const r = need(data, 'reference', id);
  if (r.status === 'retired') return data;
  return commit(data, act, 'Retire reference', [{ kind: 'reference', rec: changed(r, act, { status: 'retired' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deleteReference(data, act, { id }) {
  const r = need(data, 'reference', id);
  const n = live(data, 'referenceLink').filter((l) => l.referenceId === id).length;
  if (n) throw new PivotError('reference.in-use', `${r.title} still supports ${n === 1 ? 'a record' : `${n} records`}. Unlink it first.`);
  return commit(data, act, 'Delete reference', [{ kind: 'reference', rec: changed(r, act, { status: 'deleted' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ referenceId: string, targetKind: string, targetId: string }} args */
export function linkReference(data, act, { referenceId, targetKind, targetId }) {
  need(data, 'reference', referenceId);
  if (!TARGET_KINDS.includes(targetKind)) throw new PivotError('reference.target', 'A reference supports hazards, causal factors, consequences, controls and platforms.');
  need(data, targetKind, targetId);
  const id = ids.referenceLink(referenceId, targetKind, targetId);
  const existing = get(data, 'referenceLink', id);
  if (existing && existing.status === 'live') return data;
  const rec = existing ? changed(existing, act, { status: 'live' }) : created(act, id, { referenceId, targetKind, targetId });
  return commit(data, act, 'Link reference', [{ kind: 'referenceLink', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ referenceId: string, targetKind: string, targetId: string }} args */
export function unlinkReference(data, act, { referenceId, targetKind, targetId }) {
  const l = need(data, 'referenceLink', ids.referenceLink(referenceId, targetKind, targetId));
  return commit(data, act, 'Unlink reference', [{ kind: 'referenceLink', rec: changed(l, act, { status: 'deleted' }) }]);
}

/**
 * The live reference links to some records, marked deleted, for an op deleting those records.
 * @param {Data} data @param {Act} act @param {{ kind: string, id: string }[]} targets
 * @returns {{ kind: string, rec: Rec }[]}
 */
export function linksTo(data, act, targets) {
  const keys = new Set(targets.map((t) => `${t.kind}:${t.id}`));
  return live(data, 'referenceLink').filter((l) => keys.has(`${l.targetKind}:${l.targetId}`))
    .map((l) => ({ kind: 'referenceLink', rec: changed(l, act, { status: 'deleted' }) }));
}
```

`src/core/ops/hazards.js`:
- `import { linksTo } from './references.js';`
- `deleteHazard`: before `return commit(...)`, add

```js
  const gone = [{ kind: 'hazard', id }, ...recs.filter((r) => r.kind === 'causalFactor' || r.kind === 'consequence').map((r) => ({ kind: r.kind, id: r.rec.id }))];
  recs.push(...linksTo(data, act, gone));
```

- `childOps.remove`: `return commit(data, act, \`Delete ${lower}\`, [{ kind, rec: changed(r, act, { status: 'deleted' }) }, ...linksTo(data, act, [{ kind, id }])]);`
- `RESTORABLE`: add `reference: 'reference'`.

`src/core/ops/controls.js`: `import { linksTo } from './references.js';` and in `deleteControl` the commit's list becomes `[{ kind: 'control', rec: changed(c, act, { status: 'deleted' }) }, ...linksTo(data, act, [{ kind: 'control', id }])]`.

`src/core/ops/platforms.js`: `import { linksTo } from './references.js';` and in `deletePlatform` add `...linksTo(data, act, [{ kind: 'platform', id }])` to the committed list.

`src/core/rules.js`, before `return out;`:

```js
  // A reference link needs its reference and its record; a live reference points at something.
  for (const l of live(data, 'referenceLink')) {
    if (gone(get(data, 'reference', l.referenceId))) {
      out.push({ rule: 'reference-link-orphaned', message: 'A reference link belongs to a deleted reference.', records: [{ kind: 'reference', id: l.referenceId }, { kind: 'referenceLink', id: l.id }] });
    }
    if (gone(get(data, l.targetKind, l.targetId))) {
      out.push({ rule: 'reference-link-target-deleted', message: 'A reference is linked to a deleted record.', records: [{ kind: l.targetKind, id: l.targetId }, { kind: 'referenceLink', id: l.id }] });
    }
  }
  for (const r of live(data, 'reference')) {
    if (!r.url && !r.path && !r.file) out.push({ rule: 'reference-empty', message: 'A reference points at nothing.', records: [{ kind: 'reference', id: r.id }] });
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/core/references.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass (the randomised merge test included).

```bash
git add src/core/ops/references.js src/core/ops/hazards.js src/core/ops/controls.js src/core/ops/platforms.js src/core/rules.js test/core/references.test.js
git commit -m "Reference operations: create, edit, store a file (old ones kept), retire, delete, link and unlink; deleting a record removes the links to it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Storing and reading reference files

**Files:**
- Modify: `src/storage/folder.js` (`readFile`, `exists`; `writeWhole` accepts a Blob), `src/storage/store.js`, `src/ui/drafts.js` (`formValues`)
- Test: `test/storage/reference-files.test.js` (create), `test/ui/wire.test.js` (append)

**Interfaces:**
- Produces:
  - `readFile(root, path): Promise<File | null>`; `exists(root, path): Promise<boolean>`.
  - `safeName(name): string` — Windows-safe, never empty (`file`), at most 120 characters.
  - `storeReferenceFile(handle, referenceId, n, file: Blob & { name: string }): Promise<string>` — writes to `files/<referenceId>/<n>-<safeName>`, taking the next free `n` if that path exists; returns the stored path.
  - `openReferenceFile(handle, stored): Promise<File>` — error `file-missing` when it is not there.
  - `missingFiles(handle, paths: string[]): Promise<string[]>`.
  - `formValues` keeps a `File` value as that `File`.

- [ ] **Step 1: Write the failing tests**

Create `test/storage/reference-files.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { PivotError } from '../../src/core/errors.js';
import { safeName, storeReferenceFile, openReferenceFile, missingFiles } from '../../src/storage/store.js';

const pdf = (name = 'Safety case.pdf', text = '%PDF-1.4 bytes') => new File([new TextEncoder().encode(text)], name, { type: 'application/pdf' });

test('safeName keeps a file name usable on Windows', () => {
  assert.equal(safeName('Safety case.pdf'), 'Safety case.pdf');
  assert.equal(safeName('a<b>:c"d/e\\f|g?h*.pdf'), 'a-b-c-d-e-f-g-h-.pdf');
  assert.equal(safeName('trailing. '), 'trailing');
  assert.equal(safeName('   '), 'file');
  assert.equal(safeName('x'.repeat(300)).length, 120);
});

test('a stored file is written whole into files/<reference>/, read back as the same bytes', async () => {
  const f = new MemoryFolder();
  const stored = await storeReferenceFile(f.handle, 'r1', 1, pdf());
  assert.equal(stored, 'files/r1/1-Safety case.pdf');
  assert.equal(f.read(stored), '%PDF-1.4 bytes');
  const back = await openReferenceFile(f.handle, stored);
  assert.equal(await back.text(), '%PDF-1.4 bytes');
});

test('a stored path is never written twice: a clash takes the next number', async () => {
  const f = new MemoryFolder();
  const a = await storeReferenceFile(f.handle, 'r1', 1, pdf('spec.pdf', 'first'));
  const b = await storeReferenceFile(f.handle, 'r1', 1, pdf('spec.pdf', 'second'));
  assert.deepEqual([a, b], ['files/r1/1-spec.pdf', 'files/r1/2-spec.pdf']);
  assert.equal(f.read(a), 'first', 'the first is untouched');
});

test('a failed write leaves nothing behind', async () => {
  const f = new MemoryFolder();
  f.failWrite(() => true);
  await assert.rejects(storeReferenceFile(f.handle, 'r1', 1, pdf()), (e) => e instanceof PivotError && e.code === 'write-failed');
  assert.deepEqual(f.listUnder('files'), []);
});

test('missing files are found; opening one says so', async () => {
  const f = new MemoryFolder();
  const a = await storeReferenceFile(f.handle, 'r1', 1, pdf());
  const b = await storeReferenceFile(f.handle, 'r1', 2, pdf('b.pdf'));
  f.remove(b);
  assert.deepEqual(await missingFiles(f.handle, [a, b, 'files/r9/1-x.pdf']), [b, 'files/r9/1-x.pdf']);
  await assert.rejects(openReferenceFile(f.handle, b), (e) => e instanceof PivotError && e.code === 'file-missing');
});
```

Append to `test/ui/wire.test.js`:

```js
test('form values: a chosen file stays a file', () => {
  const file = new File(['x'], 'a.pdf');
  const out = formValues([['title', 'Doc'], ['file', file]]);
  assert.equal(out.title, 'Doc');
  assert.equal(out.file, file);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/storage/reference-files.test.js test/ui/wire.test.js`
Expected: FAIL — `safeName` is not exported; `out.file` is the string `[object File]`.

- [ ] **Step 3: Write the implementation**

`src/storage/folder.js`:
- change `writeWhole`'s JSDoc to `@param {string | Blob} text` (the body already writes whatever it is given);
- add:

```js
/** @param {Dir} root @param {string} path @returns {Promise<File | null>} null when there is no such file */
export async function readFile(root, path) {
  const { dirs, name } = split(path);
  try {
    const d = await dirFor(root, dirs, false);
    return await (await d.getFileHandle(name)).getFile();
  } catch (e) {
    if (isNotFound(e)) return null;
    throw readFailed(path, e);
  }
}

/** @param {Dir} root @param {string} path @returns {Promise<boolean>} */
export async function exists(root, path) {
  const { dirs, name } = split(path);
  try {
    const d = await dirFor(root, dirs, false);
    await d.getFileHandle(name);
    return true;
  } catch (e) {
    if (isNotFound(e)) return false;
    throw readFailed(path, e);
  }
}
```

`src/storage/store.js`: change the folder import to `import { readText, writeWhole, readFile, exists } from './folder.js';` and append:

```js
/** An uploaded file's name made safe for a Windows folder. @param {string} name */
export function safeName(name) {
  const s = String(name ?? '').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/[. ]+$/, '').trim();
  return (s || 'file').slice(0, 120);
}

/**
 * Copy an uploaded file into the data folder, whole or not at all, at a path never used before.
 * @param {Dir} handle @param {string} referenceId @param {number} n @param {Blob & { name: string }} file
 * @returns {Promise<string>} the stored path
 */
export async function storeReferenceFile(handle, referenceId, n, file) {
  let k = n;
  let stored = '';
  do {
    stored = `${FILES.files}/${referenceId}/${k}-${safeName(file.name)}`;
    k += 1;
  } while (await exists(handle, stored));
  await writeWhole(handle, stored, file);
  return stored;
}

/** @param {Dir} handle @param {string} stored @returns {Promise<File>} */
export async function openReferenceFile(handle, stored) {
  const f = await readFile(handle, stored);
  if (!f) throw new PivotError('file-missing', `${stored} is missing from the data folder.`, { stored });
  return f;
}

/** The stored paths not found in the folder. @param {Dir} handle @param {string[]} paths */
export async function missingFiles(handle, paths) {
  const out = [];
  for (const p of paths) if (!(await exists(handle, p))) out.push(p);
  return out;
}
```

`src/ui/drafts.js`, in `formValues`: replace `const s = String(v);` with `const s = typeof v === 'string' ? v : v && typeof v === 'object' ? v : String(v);` and widen its JSDoc to `@param {Iterable<[string, unknown]>} entries` / values `string | File`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/storage/reference-files.test.js test/ui/wire.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src/storage/folder.js src/storage/store.js src/ui/drafts.js test/storage/reference-files.test.js test/ui/wire.test.js
git commit -m "Reference files: copied whole into files/<reference>/ at a path never reused, read back, and checked for going missing; forms carry chosen files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: References in reports

**Files:**
- Modify: `src/reports/snapshot.js`, `src/reports/docgen-host.js`
- Test: `test/reports/snapshot.test.js`, `test/reports/docgen-host.test.js` (append; update the section list)

**Interfaces:**
- Consumes: `referencesFor` (Task 1); ops (Task 2).
- Produces: `Snapshot.references: { number, title, docNumber, revision, supports }[]` — every live reference linked to the platform, a hazard on it, one of that hazard's causal factors or consequences, or a control linked to one of those hazards; once each; `supports` joined with `, ` in the order found (Platform, then per hazard: its report ID, `<report ID> causal factor`, `<report ID> consequence`, control titles). A DocGen section `references`.

- [ ] **Step 1: Write the failing tests**

Append to `test/reports/snapshot.test.js` (add `import { createReference, linkReference, retireReference } from '../../src/core/ops/references.js';`):

```js
test('a snapshot lists the references supporting the platform, each once, with what it supports', () => {
  let d = assessed();
  d = createReference(d, act, { id: 'r1', title: 'Safety case', docNumber: 'SC-1', revision: 'B', url: 'https://x' });
  d = createReference(d, act, { id: 'r2', title: 'Sprinkler spec', path: '\\\\srv\\s.pdf' });
  d = createReference(d, act, { id: 'r3', title: 'Retired', url: 'https://y' });
  d = createReference(d, act, { id: 'r4', title: 'Elsewhere', url: 'https://z' });
  for (const [r, k, t] of [['r1', 'platform', 'p1'], ['r1', 'hazard', 'h1'], ['r1', 'causalFactor', 'cf1'], ['r2', 'control', 'c1'], ['r3', 'hazard', 'h1'], ['r4', 'platform', 'p2']]) d = linkReference(d, act, { referenceId: r, targetKind: k, targetId: t });
  d = retireReference(d, act, { id: 'r3' });
  d = assignHazardNumbers(d);
  const s = buildSnapshot(d, 'p1', opts);
  assert.deepEqual(s.references, [
    { number: 'R-0001', title: 'Safety case', docNumber: 'SC-1', revision: 'B', supports: 'Platform, H-0001, H-0001 causal factor' },
    { number: 'R-0002', title: 'Sprinkler spec', docNumber: '', revision: '', supports: 'Sprinklers' },
  ]);
  assert.deepEqual(buildSnapshot(assessed(), 'p1', opts).references, []);
});
```

In `test/reports/docgen-host.test.js`, change the section list expectation to `['hazards', 'controls', 'causes', 'references']`, and append:

```js
test('the References section: ID, title, doc number, revision, what it supports', async () => {
  const { createReference, linkReference } = await import('../../src/core/ops/references.js');
  let data = createReference(assignHazardNumbers(seed()), act, { id: 'r1', title: 'Safety case', docNumber: 'SC-1', url: 'https://x' });
  data = assignHazardNumbers(linkReference(data, act, { referenceId: 'r1', targetKind: 'platform', targetId: 'p1' }));
  const docs = createDocHost({ getData: () => data, setDesign: () => {}, clock: fixedClock('2026-09-28T10:00:00+10:00'), profileName: (id) => id });
  const sec = docs.host.sections({ subjectId: 'p1' }).find((s) => s.id === 'references');
  assert.equal(sec.label, 'References');
  assert.deepEqual([sec.keyColumn.label, ...sec.columns.map((c) => c.label)], ['ID', 'Reference', 'Doc number', 'Revision', 'Supports']);
  const [row] = sec.rows();
  assert.deepEqual([sec.keyColumn.get(row), ...sec.columns.map((c) => c.get(row))], ['R-0001', 'Safety case', 'SC-1', '', 'Platform']);
});
```

(`assignHazardNumbers` numbers references too, since it walks `NUMBERED`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/reports/snapshot.test.js test/reports/docgen-host.test.js`
Expected: FAIL — `references` is undefined; the section list lacks `references`.

- [ ] **Step 3: Write the implementation**

`src/reports/snapshot.js`:
- import `referencesFor` from `../core/queries.js` and `referenceLabel` from `../core/ids.js`;
- extend the `Snapshot` typedef with `references: { number: string, title: string, docNumber: string, revision: string, supports: string }[]`;
- before the `return structuredClone(...)`, add:

```js
  /** @type {Map<string, { ref: any, supports: string[] }>} */
  const found = new Map();
  /** @param {string} kind @param {string} id @param {string} label */
  const add = (kind, id, label) => {
    for (const { reference } of referencesFor(data, kind, id)) {
      if (reference.status !== 'live') continue;
      const e = found.get(reference.id) ?? { ref: reference, supports: [] };
      if (!e.supports.includes(label)) e.supports.push(label);
      found.set(reference.id, e);
    }
  };
  add('platform', platformId, 'Platform');
  for (const r of platformHazards(data, platformId)) {
    add('hazard', r.hazard.id, r.reportId);
    const d = /** @type {NonNullable<ReturnType<typeof hazardDetail>>} */ (hazardDetail(data, r.hazard.id));
    for (const cf of d.causalFactors) add('causalFactor', cf.id, `${r.reportId} causal factor`);
    for (const cq of d.consequences) add('consequence', cq.id, `${r.reportId} consequence`);
    for (const c of r.controls) add('control', c.control.id, c.control.title);
  }
  const references = [...found.values()]
    .map(({ ref, supports }) => ({ number: referenceLabel(ref), title: ref.title, docNumber: ref.docNumber ?? '', revision: ref.revision ?? '', supports: supports.join(', ') }))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }) || a.title.localeCompare(b.title));
```

- and add `references,` to the returned object.

`src/reports/docgen-host.js`, append to the array returned by `sectionsFor`:

```js
    {
      id: 'references', label: 'References',
      keyColumn: { id: '_key', label: 'ID', w: 2, get: (/** @type {any} */ r) => r.number },
      columns: [
        { id: 'title', label: 'Reference', w: 5, get: (/** @type {any} */ r) => r.title },
        { id: 'docNumber', label: 'Doc number', w: 3, get: (/** @type {any} */ r) => r.docNumber },
        { id: 'revision', label: 'Revision', w: 2, get: (/** @type {any} */ r) => r.revision },
        { id: 'supports', label: 'Supports', w: 4, get: (/** @type {any} */ r) => r.supports },
      ],
      rows: rows((x) => x.references ?? []),
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/reports/snapshot.test.js test/reports/docgen-host.test.js`
Expected: PASS.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src/reports/snapshot.js src/reports/docgen-host.js test/reports/snapshot.test.js test/reports/docgen-host.test.js
git commit -m "Reports list the references supporting the platform and its hazards, causal factors, consequences and controls, in a References section of the designer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Controller: adding, uploading, opening, linking, and the missing check

**Files:**
- Modify: `src/ui/controller.js`, `src/main.js`
- Test: `test/ui/controller-references.test.js` (create)

**Interfaces:**
- Consumes: Tasks 2 and 3.
- Produces:
  - Edits: `createReference`, `updateReference`, `attachFile`, `retireReference`, `deleteReference`, `linkReference`, `unlinkReference`. `SHOW_CREATED.createReference = 'reference'`.
  - Handlers:
    - `addReference({ title, url, path, file })` — a chosen file (a `File` with a name and size > 0) is stored first as file 1, then the reference is created with it; the page opens.
    - `uploadReferenceFile({ id, file })` — stores as file `1 + (file ? 1 : 0) + pastFiles.length`, then `attachFile`; error `reference.file` with no file chosen.
    - `openReferenceFile({ stored })` — reads it and calls `env.openFile(file)`.
    - `copyPath({ path })` — `env.copyText(path)`, then an info message *Copied the path.*
    - `checkReferenceFiles()` — `state.missingFiles` = the stored paths (current and past, of non-deleted references) not found; run after `go` to `references` or `reference`, and after each upload.
    - `linkReferences({ targetKind, targetId, referenceId })` — `referenceId` one or many; closes the picker.
    - `linkTargets({ referenceId, target })` — `target` one or many `kind|id`; closes the picker.
  - `openPicker` also carries `referenceId`, `targetKind`, `targetId`.
  - `initialState().missingFiles` is `[]`.
  - `env.openFile?: (file: File) => void`, `env.copyText?: (text: string) => Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `test/ui/controller-references.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController, initialState } from '../../src/ui/controller.js';

function setup() {
  const f = new MemoryFolder();
  const opened = [];
  const copied = [];
  const c = createController({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
    pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null,
    openFile: (file) => opened.push(file), copyText: async (t) => { copied.push(t); } });
  return { f, c, opened, copied };
}
async function ready() {
  const s = setup();
  await s.c.dispatch({ type: 'chooseFolder' });
  await s.c.dispatch({ type: 'createProfile', name: 'Ada' });
  const u = s.c.getState().profiles[0].id;
  await s.c.dispatch({ type: 'selectProfile', id: u });
  await s.c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  return s;
}
const W = (c) => c.getState().session.working;
const pdf = (name, text = 'bytes') => new File([text], name, { type: 'application/pdf' });
const R = (c) => Object.values(W(c).records.reference)[0];

test('adding a reference with a file stores the file first, then shows the new reference', async () => {
  assert.deepEqual(initialState().missingFiles, []);
  const { f, c } = await ready();
  await c.dispatch({ type: 'addReference', title: 'Safety case', url: '', path: '', file: pdf('SC.pdf', 'v1') });
  const r = R(c);
  assert.equal(r.title, 'Safety case');
  assert.equal(r.file.stored, `files/${r.id}/1-SC.pdf`);
  assert.deepEqual([r.file.name, r.file.size, r.file.addedAt], ['SC.pdf', 2, '2026-09-28T10:00:00+10:00']);
  assert.equal(f.read(r.file.stored), 'v1');
  assert.deepEqual([c.getState().view.name, c.getState().view.id], ['reference', r.id]);
});

test('adding with only a link works; with nothing it says what is needed; an empty file input counts as none', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'addReference', title: 'Nothing', url: '', path: '', file: new File([], '') });
  assert.match(c.getState().message.text, /file, a web link or a network path/);
  await c.dispatch({ type: 'addReference', title: 'Standard', url: 'https://example.org/std', path: '', file: new File([], '') });
  assert.equal(R(c).url, 'https://example.org/std');
});

test('a new revision is stored alongside; the old one stays openable; a missing file is flagged', async () => {
  const { f, c, opened } = await ready();
  await c.dispatch({ type: 'addReference', title: 'Spec', url: '', path: '', file: pdf('spec.pdf', 'rev A') });
  const id = R(c).id;
  await c.dispatch({ type: 'uploadReferenceFile', id, file: pdf('spec.pdf', 'rev B') });
  assert.equal(R(c).file.stored, `files/${id}/2-spec.pdf`);
  assert.deepEqual(R(c).pastFiles.map((x) => x.stored), [`files/${id}/1-spec.pdf`]);
  await c.dispatch({ type: 'openReferenceFile', stored: `files/${id}/1-spec.pdf` });
  assert.equal(await opened[0].text(), 'rev A');
  f.remove(`files/${id}/1-spec.pdf`);
  await c.dispatch({ type: 'go', view: 'reference', id });
  assert.deepEqual(c.getState().missingFiles, [`files/${id}/1-spec.pdf`]);
  await c.dispatch({ type: 'openReferenceFile', stored: `files/${id}/1-spec.pdf` });
  assert.match(c.getState().message.text, /missing from the data folder/);
  await c.dispatch({ type: 'uploadReferenceFile', id, file: new File([], '') });
  assert.match(c.getState().message.text, /Choose a file/);
});

test('copying a path; linking from a record and from the reference', async () => {
  const { c, copied } = await ready();
  await c.dispatch({ type: 'createControl', id: 'c1', title: 'Sprinklers' });
  await c.dispatch({ type: 'addReference', title: 'Drawing', url: '', path: '\\\\srv\\dwg\\a.pdf', file: new File([], '') });
  const id = R(c).id;
  await c.dispatch({ type: 'copyPath', path: '\\\\srv\\dwg\\a.pdf' });
  assert.deepEqual(copied, ['\\\\srv\\dwg\\a.pdf']);
  assert.equal(c.getState().message.text, 'Copied the path.');
  await c.dispatch({ type: 'openPicker', picker: 'linkReferences', targetKind: 'hazard', targetId: 'h1' });
  assert.deepEqual(c.getState().picker, { picker: 'linkReferences', targetKind: 'hazard', targetId: 'h1' });
  await c.dispatch({ type: 'linkReferences', targetKind: 'hazard', targetId: 'h1', referenceId: id });
  assert.equal(c.getState().picker, null);
  await c.dispatch({ type: 'linkTargets', referenceId: id, target: ['control|c1'] });
  const links = Object.values(W(c).records.referenceLink).filter((l) => l.status === 'live').map((l) => `${l.targetKind}:${l.targetId}`).sort();
  assert.deepEqual(links, ['control:c1', 'hazard:h1']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/controller-references.test.js`
Expected: FAIL — `initialState().missingFiles` is undefined.

- [ ] **Step 3: Write the implementation**

`src/ui/controller.js`:

1. `import * as references from '../core/ops/references.js';`.
2. `EDITS`: add

```js
  createReference: references.createReference, updateReference: references.updateReference, attachFile: references.attachFile,
  retireReference: references.retireReference, deleteReference: references.deleteReference,
  linkReference: references.linkReference, unlinkReference: references.unlinkReference,
```

3. `SHOW_CREATED`: add `createReference: 'reference'`.
4. `initialState()`: add `missingFiles: [],`.
5. `createController`'s env JSDoc: add `openFile?: (file: File) => void, copyText?: (text: string) => Promise<void>`.
6. Inside `createController`, before `handlers`, add:

```js
  /** A chosen file from a form, or null when none was chosen (an empty file input sends a nameless, empty file). @param {unknown} v */
  const chosenFile = (v) => (v && typeof v === 'object' && typeof (/** @type {any} */ (v).arrayBuffer) === 'function' && /** @type {any} */ (v).name && /** @type {any} */ (v).size > 0
    ? /** @type {File} */ (v) : null);

  /** Copy a chosen file into the folder and describe it for its reference. @param {string} referenceId @param {number} n @param {File} file */
  async function storeFile(referenceId, n, file) {
    if (!handle) throw new PivotError('no-data', 'Open the data folder first.');
    const stored = await store.storeReferenceFile(handle, referenceId, n, file);
    return { name: file.name, stored, size: file.size, type: file.type || '', addedBy: /** @type {string} */ (state.profileId), addedAt: env.clock.now() };
  }
```

7. In `handlers`, change `openPicker` to:

```js
    async openPicker({ picker, hazardId, platformId, referenceId, targetKind, targetId }) {
      const extra = { hazardId, platformId, referenceId, targetKind, targetId };
      set({ picker: { picker, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)) } });
    },
```

and add:

```js
    async addReference({ title, url, path, file }) {
      const id = newId();
      const f = chosenFile(file);
      const stored = f ? await storeFile(id, 1, f) : null;
      await applyEdit('createReference', { id, title, url, path, file: stored });
      await handlers.checkReferenceFiles();
    },
    async uploadReferenceFile({ id, file }) {
      const r = state.session?.working.records.reference[id];
      if (!r) throw new PivotError('not-found', 'That reference no longer exists.');
      const f = chosenFile(file);
      if (!f) throw new PivotError('reference.file', 'Choose a file to upload.');
      await applyEdit('attachFile', { id, file: await storeFile(id, 1 + (r.file ? 1 : 0) + r.pastFiles.length, f) });
      await handlers.checkReferenceFiles();
    },
    async openReferenceFile({ stored }) {
      if (!handle) throw new PivotError('no-data', 'Open the data folder first.');
      const file = await store.openReferenceFile(handle, stored);
      env.openFile?.(file);
    },
    async copyPath({ path }) {
      await env.copyText?.(path);
      set({ message: { kind: 'info', text: 'Copied the path.' } });
    },
    async checkReferenceFiles() {
      if (!handle || !state.session) return;
      const paths = Object.values(state.session.working.records.reference).filter((r) => r.status !== 'deleted')
        .flatMap((r) => [r.file, ...r.pastFiles]).filter(Boolean).map((f) => f.stored);
      set({ missingFiles: await store.missingFiles(handle, [...new Set(paths)]) });
    },
    async linkReferences(args) {
      for (const referenceId of list(args.referenceId)) await applyEdit('linkReference', { referenceId, targetKind: args.targetKind, targetId: args.targetId });
      set({ picker: null });
    },
    async linkTargets(args) {
      for (const t of list(args.target)) {
        const [targetKind, targetId] = t.split('|');
        await applyEdit('linkReference', { referenceId: args.referenceId, targetKind, targetId });
      }
      set({ picker: null });
    },
```

8. In `go`, after the backups line, add: `if (view === 'references' || view === 'reference') await handlers.checkReferenceFiles();`

`src/main.js`, add to the `createController` env:

```js
  openFile: (file) => {
    const url = URL.createObjectURL(file);
    // A new tab shows PDFs and images; where the browser blocks it, the file downloads instead.
    if (!window.open(url, '_blank')) {
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
  copyText: (text) => navigator.clipboard.writeText(text),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/controller-references.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass.

```bash
git add src/ui/controller.js src/main.js test/ui/controller-references.test.js
git commit -m "Controller: add a reference with its file, upload revisions, open stored files, copy paths, link from either side, and check for missing files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The screens

**Files:**
- Create: `src/ui/screens/references.js`
- Modify: `src/ui/screens/picker.js`, `src/ui/screens/common.js` (`NAV`, `SECTION`), `src/ui/render.js`, `src/ui/screens/hazards.js`, `src/ui/screens/controls.js`, `src/ui/screens/platforms.js`, `src/ui/styles.css`
- Test: `test/ui/screens-references.test.js` (create)

**Interfaces:**
- Consumes: Tasks 1, 2 and 5 (`state.missingFiles`, handlers and pickers).
- Produces: `referencesView(state, data)`, `referenceView(state, data, id)`, `referencesCard(state, data, { kind, id })`, `safeHref(url): string` (the url for `http:`, `https:`, `mailto:`, else `''`), `fileUrl(path): string` (`file:` URL for `\\server\share\…` or `X:\…`, else `''`); pickers `linkReferences` and `linkTargets`; tables `references`, `referenceTargets`, `refs-<kind>`.

- [ ] **Step 1: Write the failing test**

Create `test/ui/screens-references.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { referencesView, referenceView, safeHref, fileUrl } from '../../src/ui/screens/references.js';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { controlView } from '../../src/ui/screens/controls.js';
import { platformView } from '../../src/ui/screens/platforms.js';
import { pickerView } from '../../src/ui/screens/picker.js';
import { renderApp } from '../../src/ui/render.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { createReference, attachFile, linkReference } from '../../src/core/ops/references.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };
const f = (n) => ({ name: `spec-${n}.pdf`, stored: `files/r1/${n}-spec-${n}.pdf`, size: 2048 * n, type: 'application/pdf', addedBy: 'u1', addedAt: act.at });
/** r1: two files (rev 2 current), a link and a path, supporting h1, cf1 and c1; r2: a web link only. */
function data(url = 'https://example.org/sc') {
  let d = createReference(seed(), act, { id: 'r1', title: 'Safety case', docNumber: 'SC-1', revision: 'B', url, path: '\\\\srv\\docs\\sc.pdf', file: f(1) });
  d = attachFile(d, act, { id: 'r1', file: f(2) });
  d = createReference(d, act, { id: 'r2', title: 'Standard <b>x</b>', url: 'https://example.org/std' });
  for (const [k, t] of [['hazard', 'h1'], ['causalFactor', 'cf1'], ['control', 'c1']]) d = linkReference(d, act, { referenceId: 'r1', targetKind: k, targetId: t });
  return assignNumbers(d);
}

test('safe links: web links only for http, https and mailto; network paths as file URLs', () => {
  assert.equal(safeHref('https://x.org/a'), 'https://x.org/a');
  assert.equal(safeHref('mailto:a@b.c'), 'mailto:a@b.c');
  assert.equal(safeHref('javascript:alert(1)'), '');
  assert.equal(safeHref('  JaVaScRiPt:alert(1)'), '');
  assert.equal(safeHref('www.example.org'), '');
  assert.equal(fileUrl('\\\\srv\\docs\\a b.pdf'), 'file://srv/docs/a%20b.pdf');
  assert.equal(fileUrl('C:\\Docs\\a.pdf'), 'file:///C:/Docs/a.pdf');
  assert.equal(fileUrl('docs/a.pdf'), '');
});

test('the references list: ID, title, doc number, revision, what it points at, how much it supports, File missing', () => {
  const out = referencesView({ ...state, missingFiles: ['files/r1/2-spec-2.pdf'] }, data()).toString();
  assert.match(out, /<h1>References<\/h1>/);
  assert.match(out, /data-action="startEdit" data-kind="newReference"/);
  assert.match(out, /R-0001/);
  assert.match(out, />Safety case<\/button> <span class="tag tag-missing">File missing<\/span>/);
  assert.match(out, /<span class="chip">File<\/span><span class="chip">Link<\/span><span class="chip">Path<\/span>/);
  assert.match(out, /Standard &lt;b&gt;x&lt;\/b&gt;/);
  const adding = referencesView({ ...state, editing: { kind: 'newReference', id: 'new' } }, data()).toString();
  assert.match(adding, /<form data-action="addReference"[\s\S]*?name="title" required[\s\S]*?type="file" name="file"[\s\S]*?name="url"[\s\S]*?name="path"/);
});

test('a reference page: fields in place, the stored file with its past files, the link, the path, and what it supports', () => {
  const out = referenceView(state, data(), 'r1').toString();
  assert.match(out, /<input class="doc-title" name="title" value="Safety case"[^>]*data-change="updateReference" data-id="r1"/);
  assert.match(out, /name="docNumber" value="SC-1"/);
  assert.match(out, /data-action="openReferenceFile" data-stored="files\/r1\/2-spec-2.pdf">spec-2.pdf</);
  assert.match(out, /Past files[\s\S]*?data-stored="files\/r1\/1-spec-1.pdf"/);
  assert.match(out, /<form data-action="uploadReferenceFile" data-id="r1"[\s\S]*?Replace with new revision/);
  assert.match(out, /<a href="https:\/\/example.org\/sc" target="_blank" rel="noopener">Open<\/a>/);
  assert.match(out, /data-action="copyPath" data-path="\\\\srv\\docs\\sc.pdf"/);
  assert.match(out, /href="file:\/\/srv\/docs\/sc.pdf"/);
  assert.match(out, /data-table="referenceTargets"/);
  assert.match(out, /data-action="openPicker" data-picker="linkTargets" data-reference-id="r1"/);
  assert.match(out, /Causal factor[\s\S]*?Hot works/);
  assert.match(out, /data-action="unlinkReference" data-reference-id="r1" data-target-kind="control" data-target-id="c1"/);
  assert.doesNotMatch(out, /data-action="deleteReference"/, 'no delete while it supports records');
});

test('a dangerous web link is never made clickable', () => {
  const out = referenceView(state, data('javascript:alert(1)'), 'r1').toString();
  assert.match(out, /value="javascript:alert\(1\)"/);
  assert.doesNotMatch(out, /href="javascript/);
});

test('record pages carry a References card; a hazard\'s includes its causal factors\'', () => {
  const h = hazardView(state, data(), 'h1').toString();
  assert.match(h, /data-table="refs-hazard"/);
  assert.match(h, /data-action="openPicker" data-picker="linkReferences" data-target-kind="hazard" data-target-id="h1"/);
  assert.match(h, /Causal factor: Hot works/);
  assert.match(controlView(state, data(), 'c1').toString(), /data-table="refs-control"[\s\S]*?Safety case/);
  assert.match(platformView(state, data(), 'p1').toString(), /data-table="refs-platform"[\s\S]*?No references yet/);
});

test('the pickers: references not yet linked to a record; records not yet linked to a reference', () => {
  const d = data();
  const refs = pickerView({ ...state, picker: { picker: 'linkReferences', targetKind: 'hazard', targetId: 'h1' } }, d).toString();
  assert.match(refs, /<form data-action="linkReferences" data-target-kind="hazard" data-target-id="h1"/);
  assert.match(refs, /name="referenceId" value="r2"/);
  assert.doesNotMatch(refs, /value="r1"/, 'already linked');
  const targets = pickerView({ ...state, picker: { picker: 'linkTargets', referenceId: 'r1' } }, d).toString();
  assert.match(targets, /<form data-action="linkTargets" data-reference-id="r1"/);
  assert.match(targets, /name="target" value="platform\|p1"/);
  assert.match(targets, /name="target" value="consequence\|cq1"/);
  assert.match(targets, /name="target" value="control\|c2"/);
  assert.doesNotMatch(targets, /value="hazard\|h1"/, 'already linked');
});

test('References is in the nav and routed', () => {
  const d = data();
  const main = (view) => renderApp({ ...state, session: { base: d, working: d, loadedStamp: null }, view });
  assert.match(main({ name: 'references' }), /class="nav on" data-action="go" data-view="references">References/);
  assert.match(main({ name: 'reference', id: 'r1' }), /class="nav on" data-action="go" data-view="references">/);
  assert.match(main({ name: 'reference', id: 'r1' }), /Safety case/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/screens-references.test.js`
Expected: FAIL — cannot find module `src/ui/screens/references.js`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/screens/references.js`:

```js
import { html } from '../html.js';
import { dataAttrs, go, idTag, statusTag, confirmButton, pageTabs, historyTable, historyCount, plus } from './common.js';
import { dataTable } from './table.js';
import { statusColumn, idColumn, notFound } from './hazards.js';
import { all, get } from '../../core/data.js';
import { referenceLabel, hazardLabel, controlLabel, platformLabel } from '../../core/ids.js';
import { referenceTargets, referencesFor, hazardReferences } from '../../core/queries.js';
import { profileName, when } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** A web link only when it is http, https or mailto; anything else (javascript: above all) is never clickable. @param {string} url */
export function safeHref(url) {
  const u = String(url ?? '').trim();
  return /^(https?:|mailto:)/i.test(u) ? u : '';
}

/** A network path as a file URL: \\server\share\… or X:\…; anything else, none. @param {string} path */
export function fileUrl(path) {
  const s = String(path ?? '').trim().replace(/\\/g, '/');
  if (s.startsWith('//')) return encodeURI(`file:${s}`);
  if (/^[A-Za-z]:\//.test(s)) return encodeURI(`file:///${s}`);
  return '';
}

/** @param {number} n bytes */
const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`);

/** @param {any} r @param {Set<string>} missing */
const missingTag = (r, missing) => ([r.file, ...(r.pastFiles ?? [])].some((f) => f && missing.has(f.stored)) ? html` <span class="tag tag-missing">File missing</span>` : '');

/** @param {any} r */
const pointsAt = (r) => html`${r.file ? html`<span class="chip">File</span>` : ''}${r.url ? html`<span class="chip">Link</span>` : ''}${r.path ? html`<span class="chip">Path</span>` : ''}`;

/** @param {any} state */
function newReference(state) {
  if (state.editing?.kind !== 'newReference') return plus({ action: 'startEdit', kind: 'newReference', id: 'new' }, 'New reference');
  return html`<form data-action="addReference" class="new-reference">
    <input name="title" required placeholder="Reference title" aria-label="Reference title" autofocus>
    <label class="ref-file">File <input type="file" name="file"></label>
    <input name="url" placeholder="Web link (https://…)" aria-label="Web link">
    <input name="path" placeholder="Network path" aria-label="Network path">
    <p class="muted">Give a file, a web link or a network path (at least one).</p>
    <div class="actions"><button type="submit" class="primary">Add</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></div></form>`;
}

/** @param {any} state @param {Data} data */
export function referencesView(state, data) {
  const missing = new Set(state.missingFiles ?? []);
  return html`<div class="head"><h1>References</h1>${newReference(state)}</div>
    ${dataTable(state, {
      id: 'references',
      rowKey: (r) => r.id,
      rows: all(data, 'reference'),
      empty: 'No references yet.',
      columns: [
        idColumn((r) => r, referenceLabel, (r) => go(idTag(referenceLabel(r)), 'reference', { id: r.id })),
        { key: 'title', label: 'Reference', width: 560, minWidth: 200, value: (r) => r.title, filter: 'text',
          render: (r) => html`${go(r.title, 'reference', { id: r.id })}${missingTag(r, missing)}` },
        { key: 'docNumber', label: 'Doc number', width: 260, minWidth: 120, value: (r) => r.docNumber, filter: 'text' },
        { key: 'revision', label: 'Revision', width: 180, minWidth: 100, value: (r) => r.revision },
        { key: 'points', label: 'Points at', width: 240, minWidth: 140, sortable: false, render: (r) => pointsAt(r) },
        { key: 'supports', label: 'Supports', width: 180, minWidth: 110, value: (r) => referenceTargets(data, r.id).length },
        statusColumn((r) => r.status),
      ],
    })}`;
}

/** @param {any} state @param {any} f a stored file @param {Set<string>} missing */
function fileLine(state, f, missing) {
  return html`<button type="button" class="link" ${dataAttrs({ action: 'openReferenceFile', stored: f.stored })}>${f.name}</button>
    <span class="muted">${size(f.size)} · added by ${profileName(state, f.addedBy)}, ${when(f.addedAt)}</span>${missing.has(f.stored) ? html` <span class="tag tag-missing">File missing</span>` : ''}`;
}

/** A linked record, named and linked for a person. @param {Data} data @param {any} x from referenceTargets */
function targetCell(data, x) {
  const { link, target, hazard } = x;
  switch (link.targetKind) {
    case 'hazard': return html`<span class="id">${idTag(hazardLabel(target))}</span> ${go(target.title, 'hazard', { id: target.id })}`;
    case 'causalFactor':
    case 'consequence': return html`<span class="id">${idTag(hazardLabel(hazard))}</span> ${go(hazard.title, 'hazard', { id: hazard.id })}: ${target.text}`;
    case 'control': return html`<span class="id">${idTag(controlLabel(target))}</span> ${go(target.title, 'control', { id: target.id })}`;
    default: return html`<span class="id">${idTag(platformLabel(target))}</span> ${go(target.name, 'platform', { id: target.id })}`;
  }
}

const KIND_WORD = { hazard: 'Hazard', causalFactor: 'Causal factor', consequence: 'Consequence', control: 'Control', platform: 'Platform' };

/** @param {any} state @param {Data} data @param {string} id */
export function referenceView(state, data, id) {
  const r = get(data, 'reference', id);
  if (!r) return notFound();
  const tab = state.view?.tab;
  const head = html`<p>${go('← References', 'references')}</p>
    <div class="doc-head"><span class="doc-id">${idTag(referenceLabel(r))}</span>${statusTag(r.status)}</div>
    <input class="doc-title" name="title" value="${r.title}" required aria-label="Reference title" ${dataAttrs({ change: 'updateReference', id })}>
    ${pageTabs('reference', { id }, tab, historyCount(state, data, 'reference', id))}`;
  if (tab === 'history') return html`${head}${historyTable(state, data, 'reference', id)}`;
  const missing = new Set(state.missingFiles ?? []);
  const edit = { change: 'updateReference', id };
  const targets = referenceTargets(data, id);
  const href = safeHref(r.url);
  const pathHref = fileUrl(r.path);
  const actions = r.status === 'live'
    ? html`<button type="button" ${dataAttrs({ action: 'retireReference', id })}>Retire</button>
       ${targets.length ? '' : confirmButton('Delete…', 'Delete this reference', dataAttrs({ action: 'deleteReference', id }))}`
    : r.status === 'retired' ? html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'reference', id })}>Restore</button>` : '';
  return html`${head}
    <article class="doc">
      <div class="ref-fields">
        <label class="ref-field">Doc number <input class="quiet" name="docNumber" value="${r.docNumber}" placeholder="—" aria-label="Doc number" ${dataAttrs(edit)}></label>
        <label class="ref-field">Revision <input class="quiet" name="revision" value="${r.revision}" placeholder="—" aria-label="Revision" ${dataAttrs(edit)}></label>
      </div>
      <textarea class="doc-text" name="note" rows="2" placeholder="Add a note…" aria-label="Note" ${dataAttrs(edit)}>${r.note}</textarea>
      <section class="block ref-where">
        <div class="ref-row"><strong>File</strong>${r.file ? fileLine(state, r.file, missing) : html`<span class="muted">No file stored.</span>`}</div>
        <form data-action="uploadReferenceFile" ${dataAttrs({ id })} class="ref-row"><strong></strong><input type="file" name="file" required aria-label="${r.file ? 'New revision' : 'File to store'}"><button type="submit">${r.file ? 'Replace with new revision' : 'Upload file'}</button></form>
        ${r.pastFiles.length ? html`<div class="ref-row"><strong>Past files</strong><ul class="plain">${r.pastFiles.map((pf) => html`<li>${fileLine(state, pf, missing)}</li>`)}</ul></div>` : ''}
        <div class="ref-row"><strong>Web link</strong><input class="quiet grow" name="url" value="${r.url}" placeholder="https://…" aria-label="Web link" ${dataAttrs(edit)}>${href ? html`<a href="${href}" target="_blank" rel="noopener">Open</a>` : ''}</div>
        <div class="ref-row"><strong>Network path</strong><input class="quiet grow" name="path" value="${r.path}" placeholder="\\\\server\\share\\…" aria-label="Network path" ${dataAttrs(edit)}>${r.path ? html`<button type="button" ${dataAttrs({ action: 'copyPath', path: r.path })}>Copy path</button>` : ''}${pathHref ? html`<a href="${pathHref}" target="_blank" rel="noopener">Open</a>` : ''}</div>
      </section>
      <section class="block">${dataTable(state, {
        id: 'referenceTargets',
        rowKey: (x) => x.link.id,
        rows: targets,
        empty: 'Supports nothing yet. Link it with the +.',
        tools: r.status !== 'deleted' ? plus({ action: 'openPicker', picker: 'linkTargets', 'reference-id': id }, 'Link records') : '',
        columns: [
          { key: 'kind', label: 'Supports', width: 240, minWidth: 140, value: (x) => KIND_WORD[/** @type {keyof typeof KIND_WORD} */ (x.link.targetKind)] },
          { key: 'record', label: 'Record', width: 900, minWidth: 260, sortable: false, render: (x) => targetCell(data, x) },
          { key: 'actions', label: '', width: 120, minWidth: 80, sortable: false,
            render: (x) => html`<div class="row-actions">${confirmButton('✕', 'Unlink', dataAttrs({ action: 'unlinkReference', 'reference-id': id, 'target-kind': x.link.targetKind, 'target-id': x.link.targetId }))}</div>` },
        ],
      })}</section>
    </article>
    <div class="actions page-actions">${actions}</div>`;
}

/**
 * A record page's References card: the references linked to it (for a hazard, also to its causal
 * factors and consequences), a + to link more, and ✕ to unlink.
 * @param {any} state @param {Data} data @param {{ kind: string, id: string }} target
 */
export function referencesCard(state, data, { kind, id }) {
  const rows = kind === 'hazard' ? hazardReferences(data, id) : referencesFor(data, kind, id).map((x) => ({ ...x, forText: '' }));
  return dataTable(state, {
    id: `refs-${kind}`,
    rowKey: (x) => x.link.id,
    rows,
    empty: 'No references yet.',
    tools: plus({ action: 'openPicker', picker: 'linkReferences', 'target-kind': kind, 'target-id': id }, 'Link references'),
    columns: [
      { key: 'reference', label: 'References', width: 640, minWidth: 220, value: (x) => `${referenceLabel(x.reference)} ${x.reference.title}`,
        render: (x) => html`<span class="id">${idTag(referenceLabel(x.reference))}</span> ${go(x.reference.title, 'reference', { id: x.reference.id })}${statusTag(x.reference.status)}` },
      ...(kind === 'hazard' ? [{ key: 'for', label: 'For', width: 420, minWidth: 160, value: (/** @type {any} */ x) => x.forText }] : []),
      { key: 'points', label: 'Points at', width: 220, minWidth: 130, sortable: false, render: (x) => pointsAt(x.reference) },
      { key: 'actions', label: '', width: 120, minWidth: 80, sortable: false,
        render: (x) => html`<div class="row-actions">${confirmButton('✕', 'Unlink', dataAttrs({ action: 'unlinkReference', 'reference-id': x.reference.id, 'target-kind': x.link.targetKind, 'target-id': x.link.targetId }))}</div>` },
    ],
  });
}
```

`src/ui/screens/picker.js`: import `referenceLabel`, `platformLabel` from `../../core/ids.js`, `referencesFor`, `referenceTargets` from `../../core/queries.js`; add before the final `return '';`:

```js
  if (p.picker === 'linkReferences') {
    const linked = new Set(referencesFor(data, p.targetKind, p.targetId).map((x) => x.reference.id));
    const refs = live(data, 'reference').filter((r) => !linked.has(r.id));
    return frame('Link references', html`<form data-action="linkReferences" ${dataAttrs({ 'target-kind': p.targetKind, 'target-id': p.targetId })} class="picker-form">
      ${search()}
      <ul class="pick-list">${refs.map((r) => html`<li data-pick-text="${`${referenceLabel(r)} ${r.title} ${r.docNumber}`.toLowerCase()}"><label><input type="checkbox" name="referenceId" value="${r.id}"> <span class="id">${idTag(referenceLabel(r))}</span> ${r.title}</label></li>`)}</ul>
      ${refs.length ? '' : html`<p class="muted">${live(data, 'reference').length ? 'Every reference is already linked here.' : 'No references yet: add them on the References page.'}</p>`}
      ${buttons('Link')}</form>`);
  }
  if (p.picker === 'linkTargets') {
    const linked = new Set(referenceTargets(data, p.referenceId).map((x) => `${x.link.targetKind}|${x.link.targetId}`));
    /** @param {string} kind @param {string} id @param {string} text @param {any} label */
    const item = (kind, id, text, label) => (linked.has(`${kind}|${id}`) ? '' : html`<li data-pick-text="${text.toLowerCase()}"><label><input type="checkbox" name="target" value="${kind}|${id}"> ${label}</label></li>`);
    const hazards = live(data, 'hazard');
    return frame('Link records', html`<form data-action="linkTargets" ${dataAttrs({ 'reference-id': p.referenceId })} class="picker-form">
      ${search()}
      <ul class="pick-list">
        ${live(data, 'platform').map((pl) => item('platform', pl.id, `platform ${pl.name}`, html`Platform <span class="id">${idTag(platformLabel(pl))}</span> ${pl.name}`))}
        ${hazards.map((h) => html`${item('hazard', h.id, `${hazardLabel(h)} ${h.title}`, html`Hazard <span class="id">${idTag(hazardLabel(h))}</span> ${h.title}`)}
          ${live(data, 'causalFactor').filter((x) => x.hazardId === h.id).map((x) => item('causalFactor', x.id, `${hazardLabel(h)} ${x.text}`, html`<span class="indent">Causal factor of ${hazardLabel(h)}: ${x.text}</span>`))}
          ${live(data, 'consequence').filter((x) => x.hazardId === h.id).map((x) => item('consequence', x.id, `${hazardLabel(h)} ${x.text}`, html`<span class="indent">Consequence of ${hazardLabel(h)}: ${x.text}</span>`))}`)}
        ${live(data, 'control').map((c) => item('control', c.id, `${controlLabel(c)} ${c.title}`, html`Control <span class="id">${idTag(controlLabel(c))}</span> ${c.title}`))}
      </ul>
      ${buttons('Link')}</form>`);
  }
```

`src/ui/screens/common.js`: `NAV` gains `['references', 'References']` after `['platforms', 'Platforms']`; `SECTION` gains `references: 'references', reference: 'references'`.

`src/ui/render.js`: `import { referencesView, referenceView } from './screens/references.js';` and cases `case 'references': return referencesView(state, data);`, `case 'reference': return referenceView(state, data, v.id);`.

`src/ui/screens/hazards.js`: `import { referencesCard } from './references.js';` and after the Platforms `</section>` inside `<article class="doc">` add `<section class="block">${referencesCard(state, data, { kind: 'hazard', id: h.id })}</section>`.

`src/ui/screens/controls.js`: `import { referencesCard } from './references.js';` and after the usage `</section>` add `<section class="block">${referencesCard(state, data, { kind: 'control', id })}</section>`.

`src/ui/screens/platforms.js`: `import { referencesCard } from './references.js';` and after the controls `</section>` add `<section class="block">${referencesCard(state, data, { kind: 'platform', id })}</section>`.

Append to `src/ui/styles.css`:

```css
/* References */
.new-reference { display: grid; gap: 8px; max-width: 720px; width: 100%; }
.ref-file { display: flex; align-items: center; gap: 8px; }
.ref-fields { display: flex; gap: 28px; flex-wrap: wrap; margin: 0 0 8px; }
.ref-field { display: inline-flex; align-items: center; gap: 8px; color: var(--p-muted); }
.ref-where { padding: 10px 12px; display: grid; gap: 8px; }
.ref-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0; }
.ref-row > strong { min-width: 130px; }
.ref-row .grow { max-width: 900px; }
.ref-fields input.quiet, .ref-where input.quiet { border-color: transparent; background: transparent; color: var(--p-fg); }
.ref-fields input.quiet:hover, .ref-fields input.quiet:focus, .ref-where input.quiet:hover, .ref-where input.quiet:focus { border-color: var(--p-line); background: var(--p-surface); }
.chip { display: inline-block; padding: 0 7px; margin-right: 4px; border-radius: 4px; font-size: 12px; font-weight: 700; background: var(--p-surface-2); color: var(--p-muted); }
.tag-missing { background: var(--p-error-bg); color: var(--p-danger); }
.pick-list .indent { padding-left: 18px; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/screens-references.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: all pass. If a render test pins the nav's buttons, add References after Platforms.

```bash
git add src/ui/screens/references.js src/ui/screens/picker.js src/ui/screens/common.js src/ui/render.js src/ui/screens/hazards.js src/ui/screens/controls.js src/ui/screens/platforms.js src/ui/styles.css test/ui/screens-references.test.js
git commit -m "The reference register's screens: a References list and page (file with past revisions, link, path, what it supports), a References card on hazard, control and platform pages, and pickers to link either way

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Build, and a check in the browser

- [ ] **Step 1: Build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass; `OK wrote …/dist/pivot.html`.

- [ ] **Step 2: Check it in a real browser**

Serve `dist/` and drive it with the Playwright MCP tools, pickers replaced by the browser's private file system as before. Check:

1. References → + → title *Safety case*, choose a real PDF (Playwright `setInputFiles`), Add: the reference page opens with the file listed (name, size, added by).
2. **Open** on the file opens a new tab showing the PDF (a new page appears in the browser context).
3. Upload a second file under **Replace with new revision**: it becomes the current file; the first is under *Past files* and still opens.
4. Type a web link and a network path; Copy path shows *Copied the path.*; a `javascript:` link shows no Open link.
5. Link it (+) to a platform, a hazard and a causal factor; the hazard page's References card shows both rows; the platform's card shows it.
6. Save, then Reports → open the designer: a References section is listed; produce a report for the platform: its Markdown contains a References table with R-0001.
7. Remove the current stored file from the private file system (evaluate: `removeEntry`), open References: the *File missing* badge shows; Open says the file is missing.
8. Both themes.

Fix anything that does not behave as described, with a test where the fault is in rendering or the controller.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A src test
git commit -m "References: fixes from the browser check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
