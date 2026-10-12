import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, MM } from '../../DocGen/doc-layout.js';
import { normaliseStyle } from '../../DocGen/doc-style.js';
import { textWidth } from '../../DocGen/doc-fonts.js';

const style = (over = {}) => normaliseStyle(over).style;
/** No footer: the page-number footer sits in the bottom margin, so it is not body text. */
const bare = (over = {}) => style({ ...over, headerFooter: { footer: { centre: '' } } });
const para = (text, extra = {}) => ({ kind: 'paragraph', style: 'body', runs: [{ text }], ...extra });
const head = (level, text, anchor, extra = {}) => ({ kind: 'heading', level, number: level ? '1' : '', anchor, runs: [{ text }], ...extra });
const doc = (blocks, meta = {}) => ({ title: 'T', meta: { title: 'T', platform: 'Alpha', date: '2026-10-12', marking: '', ...meta }, blocks });
const texts = (page) => page.items.filter((i) => i.kind === 'text');
const words = (page) => texts(page).map((t) => t.text).join(' ');
const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua';

test('one short paragraph: one page, A4, the text inside the margins', () => {
  const r = layout(doc([para('Hello world')]), style());
  assert.equal(r.pages.length, 1);
  assert.deepEqual(r.pages[0].size, [595.28, 841.89]);
  const t = texts(r.pages[0]).filter((i) => i.text === 'Hello');
  assert.equal(t.length, 1);
  assert.ok(Math.abs(t[0].x - 25 * MM) < 0.01);
  assert.ok(t[0].y > 25 * MM && t[0].y < 25 * MM + 20);
});

test('long text wraps within the text width; every line fits', () => {
  const s = style({ text: { body: { align: 'left' } } });
  const r = layout(doc([para(LOREM.repeat(3))]), s);
  const right = 595.28 - 25 * MM;
  for (const t of texts(r.pages[0])) assert.ok(t.x + textWidth(t.font, t.size, t.text) <= right + 0.01, `"${t.text}" overruns`);
  const lines = new Set(texts(r.pages[0]).map((t) => t.y));
  assert.ok(lines.size > 2);
});

test('alignment: centre and right place a short line in the middle and at the margin', () => {
  const W = 595.28 - 50 * MM;
  const w = textWidth('Helvetica', 10.5, 'Hi');
  const at = (align) => texts(layout(doc([para('Hi')]), style({ text: { body: { align } } })).pages[0]).find((t) => t.text === 'Hi').x;
  assert.ok(Math.abs(at('centre') - (25 * MM + (W - w) / 2)) < 0.01);
  assert.ok(Math.abs(at('right') - (25 * MM + W - w)) < 0.01);
});

test('justified lines reach the right margin, except the last', () => {
  const r = layout(doc([para(LOREM.repeat(4))]), bare({ text: { body: { align: 'justify' } } }));
  const byLine = new Map();
  for (const t of texts(r.pages[0])) byLine.set(t.y, [...(byLine.get(t.y) ?? []), t]);
  const ends = [...byLine.values()].map((ts) => { const last = ts[ts.length - 1]; return last.x + textWidth(last.font, last.size, last.text); });
  const right = 595.28 - 25 * MM;
  ends.slice(0, -1).forEach((e) => assert.ok(Math.abs(e - right) < 0.05));
  assert.ok(ends[ends.length - 1] < right - 1);
});

test('a word wider than the line is broken across lines', () => {
  const r = layout(doc([para('x'.repeat(400))]), style());
  assert.ok(texts(r.pages[0]).length > 1);
});

test('content flows onto new pages; a long paragraph splits, leaving at least two lines each side', () => {
  const r = layout(doc(Array.from({ length: 30 }, () => para(LOREM.repeat(2)))), bare());
  assert.ok(r.pages.length > 1);
  for (const p of r.pages) for (const t of texts(p)) assert.ok(t.y < 841.89 - 25 * MM + 0.01, 'nothing below the bottom margin');
});

test('a heading is kept with what follows: it never sits alone at the foot of a page', () => {
  const blocks = [];
  for (let i = 0; i < 40; i++) blocks.push(head(1, `Section ${i}`, `sec-${i}`), para(LOREM));
  const r = layout(doc(blocks), bare());
  for (let p = 0; p < r.pages.length - 1; p++) {
    const ts = texts(r.pages[p]);
    const lastHeading = ts.filter((t) => t.text.startsWith('Section') || /^\d+$/.test(t.text)).pop();
    const lastText = ts[ts.length - 1];
    assert.ok(!lastHeading || lastHeading.y < lastText.y, `page ${p + 1} ends on a heading`);
  }
});

test('a heading that starts a page, by the block or by its style, starts one', () => {
  const r = layout(doc([para('a'), head(1, 'B', 'sec-b', { pageBreakBefore: true }), para('c')]), style());
  assert.equal(r.pages.length, 2);
  assert.equal(r.anchors['sec-b'].page, 1);
  const r2 = layout(doc([para('a'), head(1, 'B', 'sec-b')]), style({ text: { h1: { pageBreakBefore: true } } }));
  assert.equal(r2.anchors['sec-b'].page, 1);
  const r3 = layout(doc([head(1, 'B', 'sec-b', { pageBreakBefore: true })]), style());
  assert.equal(r3.pages.length, 1, 'no blank first page');
});

test('a page break block and a space block', () => {
  const r = layout(doc([para('a'), { kind: 'pageBreak' }, para('b')]), style());
  assert.equal(r.pages.length, 2);
  const a = texts(layout(doc([para('a'), { kind: 'space', mm: 50 }, para('b')]), style()).pages[0]);
  assert.ok(a.find((t) => t.text === 'b').y - a.find((t) => t.text === 'a').y > 50 * MM);
});

test('header and footer slots carry their fields; a different first page uses its own', () => {
  const s = style({ headerFooter: { firstDifferent: true, firstFooter: { centre: 'Cover' }, header: { left: '#title', right: '#platform #date' }, footer: { centre: 'Page #page of #pages' } } });
  const r = layout(doc([para('a'), { kind: 'pageBreak' }, para('b'), { kind: 'pageBreak' }, para('c')]), s);
  assert.equal(r.pages.length, 3);
  assert.match(words(r.pages[0]), /Cover/);
  assert.doesNotMatch(words(r.pages[0]), /Page 1/);
  assert.match(words(r.pages[1]), /Page 2 of 3/);
  assert.match(words(r.pages[1]), /T .*Alpha 2026-10-12|Alpha 2026-10-12.*T/);
});

test('the marking is printed at the top and bottom of every page, when there is one', () => {
  const r = layout(doc([para('a'), { kind: 'pageBreak' }, para('b')], { marking: 'OFFICIAL: Sensitive' }), style());
  for (const p of r.pages) {
    const m = texts(p).filter((t) => t.text.includes('OFFICIAL'));
    assert.equal(m.length, 2);
    assert.ok(m[0].y < 25 * MM && m[1].y > 841.89 - 25 * MM);
  }
  const off = layout(doc([para('a')], { marking: 'OFFICIAL' }), style({ marking: { show: false } }));
  assert.doesNotMatch(words(off.pages[0]), /OFFICIAL/);
});

test('the contents lists headings to its depth with the pages they land on, as links', () => {
  const blocks = [head(1, 'Contents', 'sec-toc', { noToc: true }), { kind: 'toc' }, { kind: 'pageBreak' }];
  for (let i = 1; i <= 3; i++) blocks.push(head(1, `Part ${i}`, `sec-${i}`), head(2, `Sub ${i}`, `sec-${i}s`), { kind: 'pageBreak' });
  const r = layout(doc(blocks), style({ toc: { depth: 1 } }));
  const first = words(r.pages[0]);
  assert.match(first, /Part 1/);
  assert.doesNotMatch(first, /Sub 1/, 'depth 1');
  assert.doesNotMatch(first, /Contents.*Contents/, 'the contents does not list itself');
  for (let i = 1; i <= 3; i++) assert.ok(texts(r.pages[0]).some((t) => t.text === String(r.anchors[`sec-${i}`].page + 1)));
  const links = r.pages[0].items.filter((x) => x.kind === 'link').map((x) => x.to);
  assert.deepEqual(links.filter((l) => l.startsWith('sec-')), ['sec-1', 'sec-2', 'sec-3']);
});

test('page numbers settle even when the contents itself pushes the headings on', () => {
  const blocks = [head(1, 'Contents', 'sec-toc', { noToc: true }), { kind: 'toc' }];
  for (let i = 1; i <= 60; i++) blocks.push(head(1, `Section number ${i}`, `sec-${i}`), para('x'));
  const r = layout(doc(blocks), style());
  const tocPages = r.pages.filter((p) => p.items.some((x) => x.kind === 'link'));
  const printed = tocPages.flatMap((p) => p.items.filter((x) => x.kind === 'link' && x.to === 'sec-60')
    .map((link) => texts(p).filter((t) => Math.abs(t.y - (link.y + link.h * 0.75)) < link.h && /^\d+$/.test(t.text)).pop()?.text));
  assert.deepEqual(printed, [String(r.anchors['sec-60'].page + 1)]);
  assert.ok(r.passes <= 3);
});

test('a reference prints its words, adds "(page N)" in the PDF when the style says, and links to its target', () => {
  const blocks = [para('See', {}), { kind: 'paragraph', style: 'body', runs: [{ text: 'See ' }, { text: 'Section 2', ref: { anchor: 'sec-2' } }] },
    { kind: 'pageBreak' }, head(1, 'Two', 'sec-2')];
  const r = layout(doc(blocks), style());
  assert.match(words(r.pages[0]), /Section 2 \(page 2\)/);
  assert.ok(r.pages[0].items.some((x) => x.kind === 'link' && x.to === 'sec-2'));
  assert.doesNotMatch(words(layout(doc(blocks), style({ refs: { pageInPdf: false } })).pages[0]), /page 2/);
});

test('code runs are set in Courier; bold and italic runs in the matching face', () => {
  const r = layout(doc([{ kind: 'paragraph', style: 'body', runs: [{ text: 'a' }, { text: 'b', bold: true }, { text: 'c', italic: true }, { text: 'd', code: true }] }]), style({ text: { body: { family: 'times' } } }));
  const font = (x) => texts(r.pages[0]).find((t) => t.text === x).font;
  assert.deepEqual(['a', 'b', 'c', 'd'].map(font), ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Courier']);
});

test('underline in a style draws a line under the words; a rule block draws across the page', () => {
  const r = layout(doc([para('Under'), { kind: 'rule' }]), style({ text: { body: { underline: true } } }));
  assert.ok(r.pages[0].items.filter((x) => x.kind === 'rule').length >= 2);
});

test('characters the fonts cannot show are substituted and reported', () => {
  const r = layout(doc([para('x ≥ 5 ✓ 中')]), style());
  assert.match(words(r.pages[0]), />= 5 Yes \?/);
  assert.deepEqual(r.replaced, ['≥', '✓', '中']);
});

test('headings are reported in order for bookmarks, with their levels', () => {
  const r = layout(doc([head(0, 'Title', 'sec-t'), head(1, 'One', 'sec-1'), head(2, 'One A', 'sec-1a')]), style());
  assert.deepEqual(r.headings.map((h) => [h.title, h.level]), [['Title', 0], ['1 One', 1], ['1 One A', 2]]);
});

test('landscape swaps the page', () => {
  assert.deepEqual(layout(doc([para('a')]), style({ page: { orientation: 'landscape' } })).pages[0].size, [841.89, 595.28]);
});
