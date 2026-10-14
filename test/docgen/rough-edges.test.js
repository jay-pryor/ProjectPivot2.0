import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';

const RD = App.ui.views.reportDesign;
const COLLS = {
  platform: { label: 'Platform', fields: [{ id: 'name', label: 'Name', type: 'text' }], children: ['hazard'] },
  hazard: { label: 'Hazard', plural: 'Hazards', fields: [{ id: 'id', label: 'ID', type: 'text' }], children: ['control'] },
  control: { label: 'Control', plural: 'Controls', fields: [{ id: 'id', label: 'ID', type: 'text' }], children: [] },
};
const DATA = { key: 'p1', values: { name: 'Ship' }, children: { hazard: [{ key: 'h1', values: { id: 'HAZ-001' }, children: { control: [] } }] } };
const prov = { id: 'reg', label: 'Register', keyColumn: { id: '_key', label: 'ID', get: (r) => r.id }, columns: [{ id: 'v', label: 'V', get: (r) => r.v }], rows: () => [] };

function host(report, data = DATA) {
  const state = { report: { options: { sections: { toc: false, meta: false } }, ...report } };
  const h = {
    getState: () => state, commit: (m) => m(state), clock: { nowIso: () => '2026-10-14T00:00:00.000Z' },
    subject: { list: () => [{ id: 'p1', label: 'Ship' }], ready: () => true, meta: () => [] },
    sections: () => [prov],
    catalogue: (run) => ({ root: 'platform', collections: COLLS, data: run && run.subjectId ? data : null }),
  };
  App.docHost.set(h);
  return h;
}
function draw(h, set) {
  RD.open(); RD.pane('section');
  Object.assign(RD._rd, { preview: null, cat: null }, set);
  const html = RD.render(h.getState());
  RD.close(); Object.assign(RD._rd, { selected: null, secCat: null });
  return html;
}
const SEC = (parts, extra = {}) => ({ id: 's1', title: '{{f:hazard.id}}', repeat: { each: 'hazard' }, parts, ...extra });

test('a table caption is a one-line box that shows its fields as chips', () => {
  const h = host({ registers: [], sections: [SEC([{ id: 't1', kind: 'table', caption: 'Of {{f:hazard.id}}', header: ['A'], rows: [['x']] }])] });
  const html = draw(h, { selected: 's1', secCat: 'content' });
  assert.match(html, /data-rd-rich[^>]*data-rd-caption-rich="t1" data-rd-sec="s1"[^>]*>Of <span class="rd-chip rd-field"[^>]*>Hazard › ID<\/span>/);
  assert.doesNotMatch(html, /<input class="rd-cap"/);
});

test('a box redrawn in place keeps naming its fields, in its own scope', () => {
  // Outside any repeat: hazards are a list here, controls are out of reach.
  host({ registers: [], sections: [{ id: 's1', title: 'Plain', parts: [{ id: 'p1', kind: 'para', text: '' }] }] });
  const el = { getAttribute: (k) => ({ 'data-rd-text': 'p1', 'data-rd-sec': 's1' })[k] ?? null, hasAttribute: (k) => k === 'data-rd-text' || k === 'data-rd-sec' };
  assert.match(RD._boxHtml('{{f:hazard.id}} {{f:control.id}}', el), /rd-field"[^>]*>Hazard › ID<\/span> <span class="rd-chip rd-field rd-broken"/);
});

test('a part can be dragged into an empty Repeat part, to the end of one, and back out to the end of the section', () => {
  const h = host({ registers: [], sections: [SEC([{ id: 'rp', kind: 'repeat', repeat: { each: 'control' }, parts: [] }, { id: 'pa', kind: 'para', text: 'a' }, { id: 'pb', kind: 'para', text: 'b' }])] });
  const s = h.getState().report.sections[0];
  App.docStore.movePart('s1', 'pa', 0, null, 'rp');
  assert.deepEqual(s.parts[0].parts.map((p) => p.id), ['pa']);
  App.docStore.movePart('s1', 'pb', 0, null, 'rp');
  assert.deepEqual(s.parts[0].parts.map((p) => p.id), ['pa', 'pb'], 'to the end');
  App.docStore.movePart('s1', 'pa', 0, null, '');
  assert.deepEqual(s.parts.map((p) => p.id), ['rp', 'pa'], 'out, to the end of the section');
  App.docStore.movePart('s1', 'rp', 0, null, 'rp');
  assert.deepEqual(s.parts.map((p) => p.id), ['rp', 'pa'], 'never into itself');
  const html = draw(h, { selected: 's1', secCat: 'content' });
  assert.match(html, /class="rd-parts rd-nested" data-rd-partdrop="rp"/);
  assert.match(html, /class="rd-dropend" data-rd-partdrop=""/);
});

test('the Repeat category says when its filter names a field the list does not have', () => {
  const h = host({ registers: [], sections: [SEC([], { repeat: { each: 'hazard', where: { field: 'gone', op: 'is', value: 'x' } } })] });
  const html = draw(h, { selected: 's1', secCat: 'repeat' });
  assert.match(html, /<option value="gone" selected>gone \(not a Hazard field\)<\/option>/);
  assert.match(html, /The filter is on a field Hazards do not have: nothing is filtered\./);
});

test('a register table inside a repeating group says it prints with each copy', () => {
  const h = host({ levels: { s1: 1, reg: 2 }, order: ['s1', 'reg'], sections: [SEC([])] });
  const html = draw(h, { selected: 'reg', secCat: 'heading' });
  assert.match(html, /This register table is inside a repeating section: it prints, unchanged, with each copy\./);
  assert.doesNotMatch(draw(host({ levels: { s1: 1, reg: 1 }, order: ['s1', 'reg'], sections: [SEC([])] }), { selected: 'reg', secCat: 'heading' }), /inside a repeating section/);
});

test('with no data to repeat for, the preview says to choose a platform', () => {
  const h = host({ registers: [], pageBreak: { s1: false }, sections: [SEC([])] }, null);
  assert.match(draw(h, { selected: 's1', secCat: 'heading' }), /Choose a subject to see the copies of this section\./);
});
