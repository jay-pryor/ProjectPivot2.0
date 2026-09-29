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
