# Landscape Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A "Landscape pages" tick per section; the layout gives those sections landscape pages and switches back after.

**Architecture:** The builder emits orientation page breaks where the orientation changes between sections; `flow` keeps the current page size, text width and limits in `let`s and re-derives them at an orientation break; HTML wraps landscape stretches in `div.landscape` with a named `@page`.

**Spec:** `docs/superpowers/specs/2026-10-14-landscape-sections-design.md`

## Global Constraints

- Stored as `landscape: { id: true }` (presence only), in `BLOCK_FLAGS`, carried by templates.
- Landscape = the Style's paper with the long side across; portrait = the Style's own orientation.
- An orientation break at the top of an empty page re-sizes that page (no blank page).
- `doc-designer.js` stays ES5. Build after every change; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A table that overflows on a landscape page keeps landscape on its overflow pages.
2. A heading kept with its next block (carryHeading) across an orientation break.
3. The section preview's crop of a landscape page (wider band).
4. Two landscape sections in a row with "Start on a new page" off on the second: they share a page.
5. Contents section ticked landscape (first pages).

---

### Task 1: Layout — pages of either orientation

**Files:** `DocGen/doc-layout.js`; test `test/docgen/layout.test.js`

- [ ] **Step 1: Failing tests** (append):

```js
test('an orientation break turns the page: wider text, landscape size, kept on overflow, and back', () => {
  const s = style();
  const long = 'word '.repeat(40);
  const r = layout(doc([para('portrait one'), { kind: 'pageBreak', orientation: 'landscape' }, ...Array.from({ length: 60 }, () => para(long)),
    { kind: 'pageBreak', orientation: 'portrait' }, para('portrait two')]), s);
  const [pw, ph] = r.pages[0].size;
  assert.ok(ph > pw, 'starts portrait');
  assert.deepEqual(r.pages[1].size, [ph, pw], 'then landscape');
  const landscapePages = r.pages.filter((p) => p.size[0] > p.size[1]);
  assert.ok(landscapePages.length >= 2, 'overflow pages stay landscape');
  const last = r.pages.at(-1);
  assert.deepEqual(last.size, [pw, ph], 'and back to portrait');
  const right = (p) => Math.max(...p.items.filter((i) => i.kind === 'text' && !/Page|of/.test(i.text)).map((i) => i.x));
  assert.ok(right(r.pages[1]) > pw - 20, 'text runs wider than a portrait page');
});

test('an orientation break at the top of an empty page turns that page rather than adding a blank one', () => {
  const r = layout(doc([{ kind: 'pageBreak', orientation: 'landscape' }, para('wide')]), style());
  assert.equal(r.pages.length, 1);
  assert.ok(r.pages[0].size[0] > r.pages[0].size[1]);
});

test('on a landscape page the header and footer run along the long edge', () => {
  const s = style({ headerFooter: { footer: { left: '', centre: '', right: 'Page #page' } } });
  const r = layout(doc([para('a'), { kind: 'pageBreak', orientation: 'landscape' }, para('b')]), s);
  const foot = r.pages[1].items.find((i) => i.kind === 'text' && i.text === '2');
  assert.ok(foot.x > r.pages[0].size[0], 'the page number sits beyond a portrait page\'s width');
});
```

(`doc`, `para`, `style` are this file's helpers — check their signatures at its top; adjust the footer text match to how the file's helpers write it.)

- [ ] **Step 2:** `node --test test/docgen/layout.test.js` — FAIL.
- [ ] **Step 3: Implement** in `flow`:

```js
  const [pw0, ph0] = pageSize(style);
  const m = style.page.margins;
  const left = m.left * MM, top = m.top * MM;
  // The page in force: the Style's own, or (at a landscape break) its paper with the long side across.
  let pw = pw0, ph = ph0, bottom = 0, W = 0;
  const orient = (/** @type {boolean} */ landscape) => {
    [pw, ph] = landscape ? [Math.max(pw0, ph0), Math.min(pw0, ph0)] : [pw0, ph0];
    bottom = ph - m.bottom * MM;
    W = pw - (m.left + m.right) * MM;
  };
  orient(false);
```

(`newPage` already uses `pw`, `ph`; closures read the current `W`/`bottom`.) The pageBreak branch:

```js
    else if (b.kind === 'pageBreak') {
      if (b.orientation) {
        const was = [pw, ph];
        orient(b.orientation === 'landscape');
        const changed = was[0] !== pw || was[1] !== ph;
        if (changed && atTop() && page.items.length === 0) page.size = [pw, ph];
        else if (changed || !atTop()) newPage();
      } else if (!atTop()) newPage();
    }
```

(What matters is whether the size changed: a break to the orientation already in force is an ordinary page break.)

- [ ] **Step 4:** `node --test test/docgen/*.test.js` — PASS. **Step 5:** commit "Report layout: pages of either orientation; an orientation break turns the page and its text width".

---

### Task 2: The tick, the block, the builder

**Files:** `DocGen/doc-designer.js`; tests `test/docgen/builder.test.js`, `test/docgen/designer-panes.test.js`

- [ ] **Step 1: Failing tests:**

builder:

```js
test('a landscape section is turned on its own pages, and the next section turns back', () => {
  const { document } = build({ landscape: { staff: true, teams: true } });
  const kinds = document.blocks.map((b) => (b.kind === 'pageBreak' ? `break:${b.orientation ?? ''}` : b.kind === 'heading' ? `h:${plain(b.runs)}` : b.kind));
  const at = (t) => kinds.indexOf(`h:${t}`);
  assert.equal(kinds[at('Staff') - 1], 'break:landscape');
  assert.ok(!kinds.slice(at('Staff'), at('Teams')).includes('break:landscape'), 'consecutive landscape sections share the turn');
  assert.equal(kinds[at('Notes for 12 Oct 2026') - 1], 'break:portrait');
  assert.ok(!build().document.blocks.some((b) => b.kind === 'pageBreak' && b.orientation), 'no tick, no turns');
});
```

panes:

```js
test('Placement has a Landscape pages tick; only on is stored', () => {
  const h = host();
  App.docHost.set(h); RD.open(); RD.select('things'); RD._rd.secCat = 'placement';
  const html = RD.render(h.getState()); RD.close();
  assert.match(html, /<input type="checkbox" data-rd-landscape="things"> Landscape pages/);
  App.docStore.setBlockFlag('landscape', 'things', true);
  assert.deepEqual(h.getState().report.landscape, { things: true });
  App.docStore.setBlockFlag('landscape', 'things', false);
  assert.equal(h.getState().report.landscape, undefined);
});
```

- [ ] **Step 2:** run — FAIL.
- [ ] **Step 3: Implement:**
  - `BLOCK_FLAGS = ['centred', 'pageBreak', 'noToc', 'landscape']`.
  - `hostBlocks`: beside `noToc = bag.noToc || {}` add `landscapes = bag.landscape || {}`; on each block `landscape: landscapes[b.id] === true,` (next to `pageBreakBefore`).
  - Template lists (`saveReportTemplate`, `applyReportTemplate`, and the clear-list near `'tables', 'pageBreak', 'noToc', 'space'` ~line 2062): add `'landscape'`.
  - `buildDocument`: declare `var orientation = 'portrait';` before `resolved.forEach`, and replace `if (b.pageBreakBefore) out.push({ kind: 'pageBreak' });` with

```js
        // LND-1: a section's own orientation; a change turns the page (and stands in for its page break).
        var want = b.landscape ? 'landscape' : 'portrait';
        if (want !== orientation) { out.push({ kind: 'pageBreak', orientation: want }); orientation = want; }
        else if (b.pageBreakBefore) out.push({ kind: 'pageBreak' });
```

  - `centreToggle` (Placement): after the page-break `cb(...)` add `cb('data-rd-landscape="' + esc(block.id) + '"', 'Landscape pages', block.landscape === true) +`.
  - wiring beside the `data-rd-pagebreak` handler:

```js
      dom.on(ctx.root, 'change', '[data-rd-landscape]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setBlockFlag('landscape', el.getAttribute('data-rd-landscape'), el.checked)); });
        dirty(); repaint();
      });
```

- [ ] **Step 4:** `node --test test/docgen/*.test.js && node DocGen/doc-designer.test.js` — PASS. **Step 5:** commit "Report designer: a Landscape pages tick per section; the document turns the page around it".

---

### Task 3: HTML

**Files:** `DocGen/doc-html.js`; test `test/docgen/html.test.js`

- [ ] **Step 1: Failing test:**

```js
test('landscape stretches print landscape: a named page and a wrapping div', () => {
  const html = renderHtml({ blocks: [{ kind: 'paragraph', style: 'body', runs: [{ text: 'a' }] }, { kind: 'pageBreak', orientation: 'landscape' },
    { kind: 'paragraph', style: 'body', runs: [{ text: 'wide' }] }, { kind: 'pageBreak', orientation: 'portrait' }, { kind: 'paragraph', style: 'body', runs: [{ text: 'b' }] }] }, normaliseStyle({}).style);
  assert.match(html, /@page landscape \{ size: a4 landscape; \}/);
  assert.match(html, /\.landscape \{ page: landscape; \}/);
  assert.match(html, /<div class="page-break"><\/div>\n?<div class="landscape">[\s\S]*?wide[\s\S]*?<\/div>\n?<div class="page-break"><\/div>/);
});
```

- [ ] **Step 2:** run — FAIL. **Step 3:** in `css(s)` add `` `@page landscape { size: ${s.page.paper} landscape; }` ``, `'.landscape { page: landscape; }'`; in `renderHtml` keep `let wide = false;` and for a pageBreak with an orientation return `(wide ? '</div>' : '') + '<div class="page-break"></div>' + (b.orientation === 'landscape' ? '<div class="landscape">' : '')`, setting `wide` accordingly; after the map, append `</div>` when `wide` is still true.
- [ ] **Step 4:** PASS. **Step 5:** commit "HTML: landscape sections print on landscape pages".

---

### Task 4: Browser walkthrough

- [ ] Tick an auto-populated section (e.g. Risk assessments) landscape: section preview shows a wide page; whole-document preview shows the turn and the return; Make PDF and check the page sizes (MediaBox) and the footer on the long edge; both themes; no page errors.
