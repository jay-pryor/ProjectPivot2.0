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
  assert.match(out, /<span class="chip">File<\/span><span class="chip">Link<\/span><span class="chip">Path<\/span>/);
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
