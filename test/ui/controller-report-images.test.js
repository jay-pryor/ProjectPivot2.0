import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController, SWEEP_AFTER_MS } from '../../src/ui/controller.js';
import { App as DocGen } from '../../DocGen/doc-designer.js';
import { makePng } from '../docgen/image-fixtures.js';

async function setup() {
  const f = new MemoryFolder();
  const c = createController({ clock: fixedClock('2026-10-12T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
    pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });
  const go = async (a) => { await c.dispatch(a); const m = c.getState().message; if (m?.kind === 'error') throw new Error(`${a.type}: ${m.text}`); };
  await go({ type: 'chooseFolder' });
  await go({ type: 'createProfile', name: 'Ada' });
  await go({ type: 'selectProfile', id: c.getState().profiles[0].id });
  await go({ type: 'createPlatform', id: 'p1', name: 'Boat', ownerId: c.getState().profiles[0].id });
  await go({ type: 'save' });
  await go({ type: 'startReport', title: 'Pictures', from: '' });
  return { f, c, go };
}
/** Put an image part holding these files into a new own section. */
function designWith(files) {
  DocGen.docHost.get().commit((s) => {
    s.report = s.report || {};
    s.report.sections = [{ id: 'pics', title: 'Pictures', parts: [{ id: 'i1', kind: 'image', layout: 'pair', captions: 'one', caption: 'Site',
      images: files.map((file) => ({ source: 'report', file, name: file })) }] }];
    s.report.order = [...(s.report.order || []), 'pics'];
  });
}
const text = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

test('images are stored through the host and drawn in the downloaded PDF and HTML; a missing one is a placeholder', async () => {
  const { f, c, go } = await setup();
  const png = await makePng({ width: 4, height: 2, sample: () => [10, 20, 30] });
  const r = await DocGen.docHost.get().images.store('report', new File([png], 'site.png'));
  assert.ok(f.readBytes(`files/report-images/${r.file}`));
  designWith([r.file, 'gone.png']);
  await go({ type: 'generateFromDesigner', format: 'pdf' });
  const pdf = text(f.readBytes(f.list().find((p) => p.endsWith('.pdf'))));
  assert.equal((pdf.match(/\/Subtype \/Image/g) ?? []).length, 1);
  assert.match(pdf, /\(Image\) Tj[\s\S]*?\(missing:\) Tj[\s\S]*?\(gone\.png\) Tj/);
  await go({ type: 'downloadReport', id: c.getState().lastReportId, format: 'html' });
  const html = f.read(f.list().find((p) => p.endsWith('.html')));
  assert.match(html, /<img[^>]*src="data:image\/png;base64,/);
  assert.match(html, /Image missing: gone\.png/);
});

test('a save removes old report images nothing uses, and keeps recent or used ones', async () => {
  const { f, go } = await setup();
  const png = await makePng({ width: 1, height: 1, sample: () => [0, 0, 0] });
  for (const n of ['used.png', 'old.png', 'new.png']) f.writeBytes(`files/report-images/${n}`, png);
  const age = (n, ms) => { const at = f.locate(`files/report-images/${n}`, false); at.dir.entries.get(at.name).lastModified = Date.now() - ms; };
  age('used.png', 2 * SWEEP_AFTER_MS); age('old.png', 2 * SWEEP_AFTER_MS); age('new.png', 60 * 1000);
  designWith(['used.png']);
  await go({ type: 'save' });
  await new Promise((r) => setTimeout(r, 20));
  const names = f.list().filter((p) => p.startsWith('files/report-images/')).sort();
  assert.deepEqual(names, ['files/report-images/new.png', 'files/report-images/used.png']);
});
