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
  assert.match(out, /REF-001/);
  assert.match(out, />Safety case<\/button> <span class="tag tag-missing">File missing<\/span>/);
  assert.match(out, /<button type="button" class="chip chip-open" title="Open [^"]+" data-action="openReferenceFile" data-stored="[^"]+">File<\/button><a class="chip chip-open" href="https:\/\/[^"]+" target="_blank" rel="noopener"[^>]*>Link<\/a><button type="button" class="chip chip-open" title="Copy [^"]+" data-action="copyPath" data-path="[^"]+">Path<\/button>/, 'each opens what it points at');
  assert.match(out, /Standard &lt;b&gt;x&lt;\/b&gt;/);
  const adding = referencesView({ ...state, editing: { kind: 'newReference', id: 'new' } }, data()).toString();
  assert.match(adding, /<form data-action="addReference"[\s\S]*?name="title" required[\s\S]*?type="file" name="file"[\s\S]*?name="url"[\s\S]*?name="path"/);
});

test('a reference page: fields in place, the stored file with its past files, the link, the path, and what it supports', () => {
  const out = referenceView(state, data(), 'r1').toString();
  assert.match(out, /<input class="doc-title small" name="title" value="Safety case"[^>]*data-change="updateReference" data-id="r1"/);
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
  assert.match(out, /data-action="askConfirm" data-run="unlinkReference" data-reference-id="r1" data-target-kind="control" data-target-id="c1"/);
  assert.doesNotMatch(out, /data-action="deleteReference"/, 'no delete while it supports records');
});

test('a dangerous web link is never made clickable', () => {
  const out = referenceView(state, data('javascript:alert(1)'), 'r1').toString();
  assert.match(out, /value="javascript:alert\(1\)"/);
  assert.doesNotMatch(out, /href="javascript/);
});

test('record pages carry a References card; a hazard\'s includes its causal factors\'', () => {
  const h = hazardView({ ...state, sections: { hazard: 'references' } }, data(), 'h1').toString();
  assert.match(h, /data-table="refs-hazard"/);
  assert.match(h, /data-action="openPicker" data-picker="linkReferences" data-target-kind="hazard" data-target-id="h1"/);
  assert.match(h, /Causal factor: Hot works/);
  assert.match(controlView({ ...state, sections: { control: 'references' } }, data(), 'c1').toString(), /data-table="refs-control"[\s\S]*?Safety case/);
  assert.match(platformView({ ...state, sections: { platform: 'references' } }, data(), 'p1').toString(), /data-table="refs-platform"[\s\S]*?No references yet/);
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

test('References has Active and Archived sub-tabs; each row\'s Options moves it to the other, and an archived one is not offered for linking', async () => {
  const { referencesView, referenceView } = await import('../../src/ui/screens/references.js');
  const { createReference, setReferenceArchived } = await import('../../src/core/ops/references.js');
  const { pickerView } = await import('../../src/ui/screens/picker.js');
  const { initialState } = await import('../../src/ui/controller.js');
  const { seed, act } = await import('../helpers.js');
  const st = { ...initialState(), screen: 'main', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };
  let d = createReference(seed(), act, { id: 'r1', title: 'Safety case', url: 'https://example.com/sc' });
  d = createReference(d, act, { id: 'r2', title: 'Old manual', url: 'https://example.com/old' });
  d = setReferenceArchived(d, act, { id: 'r2', archived: 'true' });
  assert.equal(Object.values(d.history).at(-1).action, 'Archive reference');
  assert.equal(setReferenceArchived(d, act, { id: 'r2', archived: true }), d, 'already archived: nothing recorded');
  const active = referencesView({ ...st, view: { name: 'references' } }, d).toString();
  assert.match(active, /class="tab on" data-action="go" data-view="references" data-tab="active">Active <span class="count">1<\/span>[\s\S]*?data-tab="archived">Archived <span class="count">1<\/span>/);
  assert.match(active, /Safety case/);
  assert.doesNotMatch(active, /Old manual/);
  assert.match(active, /<details class="row-menu"><summary aria-label="Options for Safety case"[\s\S]*?data-action="setReferenceArchived" data-id="r1" data-archived="true">Move to Archived<\/button>/);
  const archive = referencesView({ ...st, view: { name: 'references', tab: 'archived' } }, d).toString();
  assert.match(archive, /Old manual[\s\S]*?data-action="setReferenceArchived" data-id="r2" data-archived="false">Move to Active<\/button>/);
  assert.doesNotMatch(archive, /Safety case|newReference/, 'no new reference from the archive');
  const page = referenceView({ ...st, view: { name: 'reference', id: 'r2' } }, d, 'r2').toString();
  assert.match(page, /<span class="tag">Archived<\/span>[\s\S]*?data-action="setReferenceArchived" data-id="r2" data-archived="false">[\s\S]*?Move to Active/);
  const pick = pickerView({ ...st, picker: { picker: 'linkReferences', targetKind: 'hazard', targetId: 'h1' } }, d).toString();
  assert.match(pick, /Safety case/);
  assert.doesNotMatch(pick, /Old manual/);
  d = setReferenceArchived(d, act, { id: 'r2', archived: 'false' });
  assert.equal(Object.values(d.history).at(-1).action, 'Return reference from archive');
});

test('a hazard\'s References: a + beside For links that reference to more of the page, offering what the page shows; a References row opens on a double-click', async () => {
  const { referencesCard, referencesView } = await import('../../src/ui/screens/references.js');
  const { createReference, linkReference } = await import('../../src/core/ops/references.js');
  const { addSystemElement } = await import('../../src/core/ops/hazards.js');
  const { pickerView } = await import('../../src/ui/screens/picker.js');
  const { initialState } = await import('../../src/ui/controller.js');
  const { seed, act } = await import('../helpers.js');
  const st = { ...initialState(), screen: 'main', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };
  let d = createReference(seed(), act, { id: 'r1', title: 'Manual', url: 'https://example.com/m' });
  d = addSystemElement(d, act, { id: 's1', hazardId: 'h1', platformId: 'p1', text: 'Engine room' });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'causalFactor', targetId: 'cf1' });
  const card = referencesCard(st, d, { kind: 'hazard', id: 'h1', platformId: 'p1' }).toString();
  assert.match(card, /<div class="for-cell"><ul class="plain for-list"><li><span class="for-text">Causal factor: Hot works<\/span><\/li><\/ul>\s*<button type="button" class="plus" data-action="openPicker" data-picker="linkReferenceFor" data-reference-id="r1" data-hazard-id="h1" data-platform-id="p1"/);
  const pick = pickerView({ ...st, picker: { picker: 'linkReferenceFor', referenceId: 'r1', hazardId: 'h1', platformId: 'p1' } }, d).toString();
  assert.match(pick, /<form data-action="linkTargets" data-reference-id="r1"/);
  assert.match(pick, /<li class="pick-group">Hazard<\/li>[\s\S]*?value="hazard\|h1"[\s\S]*?<li class="pick-group">Consequences<\/li>[\s\S]*?value="consequence\|cq1"> Burns[\s\S]*?<li class="pick-group">System\/Element<\/li>[\s\S]*?value="systemElement\|s1"> Engine room/);
  assert.doesNotMatch(pick, /causalFactor\|cf1/, 'already linked: not offered');
  assert.doesNotMatch(pickerView({ ...st, picker: { picker: 'linkReferenceFor', referenceId: 'r1', hazardId: 'h1' } }, d).toString(), /systemElement/, 'the Overview has no per-platform lists');
  assert.match(referencesView({ ...st, view: { name: 'references' } }, d).toString(), /<tr data-row="r1" data-dblclick="go" data-view="reference" data-id="r1">/);
});

test('a hazard\'s References: one row a reference, General for the hazard itself, every other part it is for listed in its For cell', async () => {
  const { referencesCard } = await import('../../src/ui/screens/references.js');
  const { createReference, linkReference, unlinkReferenceFrom } = await import('../../src/core/ops/references.js');
  const { initialState } = await import('../../src/ui/controller.js');
  const { seed, act } = await import('../helpers.js');
  const st = { ...initialState(), screen: 'main', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };
  let d = createReference(seed(), act, { id: 'r1', title: 'Manual', url: 'https://example.com/m' });
  for (const [targetKind, targetId] of [['hazard', 'h1'], ['causalFactor', 'cf1'], ['consequence', 'cq1']]) d = linkReference(d, act, { referenceId: 'r1', targetKind, targetId });
  const card = referencesCard(st, d, { kind: 'hazard', id: 'h1', platformId: 'p1' }).toString();
  assert.equal((card.match(/<tr data-row="r1"/g) ?? []).length, 1, 'one row');
  assert.match(card, /<ul class="plain for-list"><li><span class="for-text"><span class="muted">General<\/span><\/span><button[^>]*class="icon-x for-x"[^>]*data-target-kind="hazard"[\s\S]*?Causal factor: Hot works[\s\S]*?Consequence: Burns/);
  assert.match(card, /data-run="unlinkReferenceFrom" data-reference-id="r1" data-targets="hazard\|h1,causalFactor\|cf1,consequence\|cq1"/, 'the row\'s ✕ unlinks it from all three');
  const off = unlinkReferenceFrom(d, act, { referenceId: 'r1', targets: 'hazard|h1,causalFactor|cf1,consequence|cq1' });
  assert.equal(Object.values(off.records.referenceLink).filter((l) => l.status === 'live').length, 0);
  assert.equal(Object.values(off.history).filter((e) => e.action === 'Unlink reference').length, 1, 'one change');
});

test('a hazard\'s References names the column of what each reference is for Informs', async () => {
  const { referencesCard } = await import('../../src/ui/screens/references.js');
  const { initialState } = await import('../../src/ui/controller.js');
  const { seed } = await import('../helpers.js');
  const out = referencesCard({ ...initialState(), screen: 'main', profileId: 'u1', profiles: [] }, seed(), { kind: 'hazard', id: 'h1', platformId: 'p1' }).toString();
  assert.match(out, /<th data-col="for">[\s\S]*?>Informs</);
});

test('in a hazard\'s References, Link opens the web link in a new tab, but never a link that is not http, https or mailto', async () => {
  const { referencesCard } = await import('../../src/ui/screens/references.js');
  const { createReference, linkReference } = await import('../../src/core/ops/references.js');
  const { initialState } = await import('../../src/ui/controller.js');
  const { seed, act } = await import('../helpers.js');
  let d = createReference(seed(), act, { id: 'r1', title: 'Good', url: 'https://example.com/a' });
  d = createReference(d, act, { id: 'r2', title: 'Bad', url: 'javascript:alert(1)' });
  for (const r of ['r1', 'r2']) d = linkReference(d, act, { referenceId: r, targetKind: 'hazard', targetId: 'h1' });
  const out = referencesCard({ ...initialState(), screen: 'main', profileId: 'u1', profiles: [] }, d, { kind: 'hazard', id: 'h1', platformId: 'p1' }).toString();
  assert.match(out, /<a class="chip chip-open" href="https:\/\/example.com\/a" target="_blank" rel="noopener"/);
  assert.match(out, /<span class="chip" title="Not a web link that can be opened">Link<\/span>/);
  assert.doesNotMatch(out, /href="javascript:/);
});
