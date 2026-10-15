import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';
import { renderHtml } from '../../DocGen/doc-html.js';
import { normaliseStyle } from '../../DocGen/doc-style.js';

function host() {
  const state = { report: { sections: [{ id: 'sec1', title: 'One', parts: [{ id: 'p1', kind: 'para', text: 'Hello there.' }] }], options: { sections: { toc: false, meta: false } } } };
  const h = {
    getState: () => state, commit: (m) => m(state), clock: { nowIso: () => '2026-10-15T09:00:00.000Z' },
    subject: { list: () => [{ id: 'p1', label: 'Ship' }], ready: () => true, meta: () => [] },
    sections: () => [], who: () => 'Jay',
  };
  App.docHost.set(h);
  return h;
}

test('markup and comment threads are stored with the design, and removed whole', () => {
  const h = host();
  assert.equal(App.docStore.addMarkup({ kind: 'hl', page: 0, x: 10, y: 20, w: 100, h: 12, at: { sec: 'sec1', n: 1, fx: 0, fy: 0, fw: 0.5, fh: 1 } }).ok, true);
  assert.equal(App.docStore.addMarkup({ kind: 'scribble' }).ok, false);
  const c = App.docStore.addComment({ page: 0, y: 30, text: 'Is this right?', by: 'Jay' });
  App.docStore.replyComment(c.id, 'Yes.', 'Sam');
  const r = h.getState().report;
  assert.equal(r.markup.length, 1);
  assert.deepEqual(r.comments[0].posts.map((p) => [p.by, p.text]), [['Jay', 'Is this right?'], ['Sam', 'Yes.']]);
  App.docStore.removeComment(c.id);
  App.docStore.clearMarkup();
  assert.equal('comments' in h.getState().report, false);
  assert.equal('markup' in h.getState().report, false);
});

test('undo and redo step back and forward through the design', () => {
  const h = host();
  const H = App.docHost.history;
  assert.equal(H.canUndo(), false);
  App.docStore.addMarkup({ kind: 'box', page: 0, x: 1, y: 1, w: 5, h: 5 });
  H.cut();
  App.docStore.addMarkup({ kind: 'box', page: 0, x: 9, y: 9, w: 5, h: 5 });
  assert.equal(h.getState().report.markup.length, 2);
  assert.equal(H.undo(), true);
  assert.equal(h.getState().report.markup.length, 1);
  assert.equal(H.undo(), true);
  assert.equal('markup' in h.getState().report, false);
  assert.equal(H.redo(), true);
  assert.equal(h.getState().report.markup.length, 1);
  // A new change after an undo drops what could have been redone.
  App.docStore.addComment({ page: 0, y: 1, text: 'x' });
  assert.equal(H.canRedo(), false);
});

test('the HTML puts markup and comments over the block they were made on; without them it is unchanged', () => {
  const style = normaliseStyle({ id: 'x', name: 'x' }).style;
  const doc = { blocks: [{ kind: 'heading', level: 1, runs: [{ text: 'One' }], sec: 'sec1' }, { kind: 'paragraph', style: 'body', runs: [{ text: 'Hello' }], sec: 'sec1' }] };
  const plain = renderHtml(doc, style);
  assert.doesNotMatch(plain, /rv-wrap|rv-mk/);
  const html = renderHtml(doc, style, { review: {
    markup: [{ kind: 'hl', at: { sec: 'sec1', n: 1, fx: 0.1, fy: 0, fw: 0.5, fh: 1 } }],
    comments: [{ at: { sec: 'sec1', n: 0, fy: 0.5 }, posts: [{ by: 'Jay', at: '2026-10-15T09:00:00Z', text: 'Rename <this>' }] }] } });
  assert.match(html, /<div class="rv-wrap"><p class="body">Hello<\/p><div class="rv-mk rv-hl" style="left:10%;top:0%;width:50%;height:100%"><\/div><\/div>/);
  assert.match(html, /<div class="rv-wrap"><h2[^>]*>.*One<\/h2><div class="rv-cmt" style="top:50%">/);
  assert.match(html, /Rename &lt;this&gt;/);
  assert.match(html, /\.rv-cmt:hover \.rv-cmt-pop/);
});
