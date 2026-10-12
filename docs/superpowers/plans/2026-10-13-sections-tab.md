# A friendlier Sections tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the report designer's Sections tab into three columns — section list | categorised settings | live section preview — with plainer wording and no one-line explanations anywhere in the designer.

**Architecture:** All changes are in the designer's view module (`App.ui.views.reportDesign` in `DocGen/doc-designer.js`) and its CSS. `paneSection` is rebuilt from the existing field builders (`nameField`, `centreToggle`, `introField`, `tableWordingEditor`, `widthStrip`, `metaPane`, the part editors), regrouped under a category menu; no store, builder or layout code changes. Live preview reuses the store writes the `change` handlers already make, called on a debounced `input` and followed by a redraw of the preview column only.

**Tech Stack:** vanilla ES modules (the designer is ES5-style inside an IIFE, `// @ts-nocheck`); `node:test`; `npm test`, `npm run typecheck`, `npm run build`.

**Spec:** `docs/superpowers/specs/2026-10-13-sections-tab-design.md`

## Global Constraints

- `npm run build` after every source change; commit messages end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Sharp corners (the app forces `border-radius: 0` on `.docgen`); colours only through the `--c-*` tokens (PIVOT maps them).
- Every existing control keeps its `data-rd-*` attribute and its store call — this is a re-arrangement, not a re-implementation.
- Tags: **Auto-populated** (provider sections), **Meta** (`kind === 'meta'`), **Table of Contents** (`kind === 'toc'`), none for `kind === 'custom'`.
- Level labels: **Title**, **Heading 1**–**Heading 4**, **Normal text**, and **Auto (Heading N)** / **Auto (Title)** / **Auto (Normal text)**.

## Review Focus

1. **Typing fast then leaving the box** — the debounced save and the `change`/`focusout` save must not fight: no lost characters, no double entries, caret kept while typing. (Task 4 test: the save is idempotent; walkthrough.)
2. **Switching section while a category is open that the new section lacks** (e.g. Table → an own section) — falls back to the first category, never a blank column. (Task 1 test.)
3. **A section removed or unticked while selected** — the pane still renders (first section, or "That section is no longer in the document."). (Task 1 test.)
4. **Narrow window** — three columns must not overflow; the preview column wraps below the settings under ~1100 px of pane width. (Task 5 CSS, walkthrough.)
5. **The ☰ menu's ticks moved into Table** — group ticks for a grouped register and optional-column ticks still write the same maps (`datasetSections`, `columns`). (Task 1 test asserts the attributes.)

---

### Task 1: The Sections pane as categories with the preview beside them

**Files:**
- Modify: `DocGen/doc-designer.js` — `paneSection`, `optionsMenu` (split), `renderSectionList` row (drop the ☰), `_rd` (add `secCat`), wiring (`[data-rd-sec-cat]` click), `App.ui.views.reportDesign` export (`SEC_CATEGORIES` for tests)
- Test: `test/docgen/designer-panes.test.js`

**Interfaces — Produces:** `categoriesFor(block) → { id, label }[]`; markup `<div class="rd-secgrid"><nav class="rd-cat-list">…<button data-rd-sec-cat="ID">…</nav><div class="rd-sec-fields" data-rd-sec-fields>…</div><div class="rd-sec-prev" data-rd-sec-prev>…</div></div>`; `tableChoices(project, b) → string` (the former ☰ menu's ticks).

- [ ] **Step 1: Write the failing tests** — append to `test/docgen/designer-panes.test.js` (it already has `host()`, `sectionPane()`, `RD`):

```js
/** The Sections pane for a section, on a category. */
function sectionAt(h, id, cat) {
  App.docHost.set(h); RD.open(); RD.select(id); RD._rd.secCat = cat ?? null;
  const html = RD.render(h.getState()); RD.close(); RD._rd.secCat = null;
  return html;
}
const cats = (html) => [...html.matchAll(/data-rd-sec-cat="([a-z]+)"/g)].map((m) => m[1]);

test('Sections: three columns — categories, their fields, and the preview beside them', () => {
  const html = sectionAt(host(), 'things');
  assert.match(html, /class="rd-secgrid"[\s\S]*class="rd-cat-list"[\s\S]*data-rd-sec-fields[\s\S]*data-rd-sec-prev[\s\S]*class="dp-page"/);
});

test('each kind of section offers its own categories', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [] }] });
  assert.deepEqual(cats(sectionAt(h, 'things')), ['heading', 'placement', 'introduction', 'table']);
  assert.deepEqual(cats(sectionAt(h, 'meta')), ['heading', 'placement', 'introduction', 'table', 'rows']);
  assert.deepEqual(cats(sectionAt(h, 'toc')), ['heading', 'placement']);
  assert.deepEqual(cats(sectionAt(h, 'mine')), ['heading', 'placement', 'content']);
});

test('each category holds its existing controls', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [] }] });
  const at = (id, cat) => sectionAt(h, id, cat).slice(sectionAt(h, id, cat).indexOf('data-rd-sec-fields'));
  assert.match(at('things', 'heading'), /data-rd-sec-heading="things"[\s\S]*data-rd-level="things"/);
  assert.match(at('mine', 'heading'), /data-rd-sec-title="mine"[\s\S]*data-rd-level="mine"/);
  assert.match(at('things', 'placement'), /data-rd-centre="things"[\s\S]*data-rd-pagebreak="things"[\s\S]*data-rd-notoc="things"[\s\S]*data-rd-space="things"/);
  assert.match(at('things', 'introduction'), /data-rd-intro="things"[\s\S]*data-rd-intro-num="things"/);
  assert.match(at('things', 'table'), /data-rd-tbl-field="title"[\s\S]*data-rd-tbl-col=/);
  assert.match(at('meta', 'rows'), /data-rd-meta=/);
  assert.match(at('mine', 'content'), /data-rd-addpart="para"[\s\S]*data-rd-del-section="mine"/);
});

test('the column and group ticks are in Table, and the ☰ button on the list is gone', () => {
  const html = sectionAt(host(), 'things', 'table');
  assert.doesNotMatch(html, /data-rd-optmenu/);
  assert.match(html.slice(html.indexOf('data-rd-sec-fields')), /data-rd-dsmap="columns" data-rd-ds="things" data-rd-key="extra"/);
});

test('a category the section lacks falls back to the first; with nothing chosen the first section opens', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [] }] });
  assert.match(sectionAt(h, 'mine', 'table'), /class="rd-cat on"[^>]*data-rd-sec-cat="heading"/);
  App.docHost.set(h); RD.open(); RD._rd.selected = null;
  const first = RD.render(h.getState()); RD.close();
  assert.match(first, /data-rd-sec-fields/);
  assert.doesNotMatch(first, /Pick a section on the left/);
  App.docHost.set(h); RD.open(); RD._rd.selected = 'gone';
  assert.match(RD.render(h.getState()), /data-rd-sec-fields/, 'a vanished section opens the first one');
  RD.close();
});
```

Extend the panes `host()` fixture so `things` has one optional column: in `sections()` give `things` the columns `[{ id: 'v', label: 'Value', get: … }, { id: 'extra', label: 'Extra', optional: true, get: (r) => r.v }]`.

- [ ] **Step 2: Run** `node --test test/docgen/designer-panes.test.js` → the five new tests FAIL (no `rd-secgrid`).

- [ ] **Step 3: Implement.** In `doc-designer.js`:

```js
    /** The categories of a section's settings, by kind. */
    var SEC_CATEGORIES = { heading: 'Heading', placement: 'Placement', introduction: 'Introduction', table: 'Table', rows: 'Rows', content: 'Content' };
    function categoriesFor(block) {
      var ids = block.kind === 'toc' ? ['heading', 'placement']
        : block.kind === 'custom' ? ['heading', 'placement', 'content']
        : ['heading', 'placement', 'introduction'].concat(
            (App.docGen.sectionColumns(H(), block, opts()) || { all: [] }).all.length ? ['table'] : [],
            block.kind === 'meta' ? ['rows'] : []);
      return ids.map(function (id) { return { id: id, label: SEC_CATEGORIES[id] }; });
    }

    /** The former ☰ menu's ticks: which groups and optional columns a section carries. */
    function tableChoices(project, b) {
      var cols = App.docGen.sectionColumns(H(), b, opts());
      var optional = (cols && cols.optional) || [];
      var groups = b.groups || [];
      var out = '';
      if (groups.length) out += '<div class="rd-fieldset"><strong>Groups</strong>' + groups.map(function (g) {
        return cb('data-rd-dsmap="datasetSections" data-rd-ds="' + esc(b.dsId) + '" data-rd-key="' + esc(g.value) + '"', g.label, g.included);
      }).join('') + '</div>';
      if (optional.length) {
        var key = columnKeyOf(b);   // the key the builder reads — see below
        var colOpts = (opts().columns || {})[key] || {};
        out += '<div class="rd-fieldset"><strong>Columns</strong>' + optional.map(function (c) {
          return cb('data-rd-dsmap="columns" data-rd-ds="' + esc(key) + '" data-rd-key="' + esc(c.id) + '"', c.label, App.report.columnOn(c, colOpts));
        }).join('') + '</div>';
      }
      return out;
    }
```

`columnKeyOf(b)` must be the key the document builder reads the ticks back under. `App.docGen.contentOf` uses `columnKey(b, pv)` = the provider's `include.key`, which for PIVOT's providers is the provider id (= the block id). The old ☰ menu wrote under `b.dsId || b.kind` — `'section'` for every PIVOT section — so its ticks may never have reached the report. Expose the builder's own function (`App.docGen.columnKey = function (b) { return columnKey(b, providerOf(opts, b.id, b, host)); }` — bind it the way `sectionColumns` binds the host) and use it here and in `widthStrip`/`hostColumns` so the designer reads and writes one key. Add a test: unticking an optional column in Table (store write `App.docStore.setReportInclude('columns', key, 'extra', false)` via the same call the `[data-rd-dsmap]` handler makes) removes that column from `App.docGen.documentFor(...)`'s table header. Then delete `optionsMenu`, its call in the row markup (`optionsMenu(project, b) +`), and the `[data-rd-optmenu]` click wiring. Ledger this as a ruling (a fix found while moving the ticks).

Rewrite `paneSection(project, view)`:

```js
    function paneSection(project, view) {
      var included = view.blocks;
      var id = _rd.selected;
      var block = included.filter(function (b) { return b.id === id; })[0] || included[0];
      if (!block) return '<p class="muted">There are no sections yet.</p>';
      _rd.selected = block.id;
      var resolved = view.resolved.filter(function (r) { return r.id === block.id; })[0];
      var cats = categoriesFor(block);
      var cat = cats.filter(function (c) { return c.id === _rd.secCat; })[0] || cats[0];
      var list = '<nav class="rd-cat-list">' + cats.map(function (c) {
        return '<button type="button" class="rd-cat' + (c.id === cat.id ? ' on' : '') + '" data-rd-sec-cat="' + c.id + '"' +
          (c.id === cat.id ? ' aria-current="true"' : '') + '>' + esc(c.label) + '</button>';
      }).join('') + '</nav>';
      return '<div class="rd-secgrid">' + list +
        '<div class="rd-sec-fields" data-rd-sec-fields><h5>' + esc(block.label) + ' — ' + esc(cat.label) + '</h5>' + categoryFields(project, view, block, resolved, cat.id) + '</div>' +
        '<div class="rd-sec-prev" data-rd-sec-prev>' + sectionPreview(project, block) + '</div></div>';
    }
```

and `categoryFields(project, view, block, resolved, cat)` returning, per category, the existing builders: `heading` → generated: the heading input from `nameField(block, block.defaultTitle)`; own: the existing `data-rd-sec-title` label; both followed by `'<label class="rd-lab">Level' + levelSelect(block, resolved) + '</label>'`; `placement` → `centreToggle(project, block, resolved)` (it already holds centre, page break, contents and space); `introduction` → `introField(project, block)`; `table` → `tableChoices(project, block) + tableWordingEditor(project, block) + widthStrip(...)` (the width strip call moved verbatim from the old pane); `rows` → `metaPane(project)`; `content` → the old custom-section body: the parts list, the add bar, Save as template, Delete section (moved verbatim).

Wiring, next to `[data-rd-refresh-preview]`:

```js
      dom.on(ctx.root, 'click', '[data-rd-sec-cat]', function (e, el) { _rd.secCat = el.getAttribute('data-rd-sec-cat'); repaint(); });
```

Add `secCat: null,  // the open category of the Sections pane` to `_rd`, and export `SEC_CATEGORIES` beside `LIST_WIDTH`.

- [ ] **Step 4: Run** `node --test test/docgen/*.test.js` → all pass (fix older pane tests that looked for the preview heading "Preview" or the ☰, by the behaviour they meant). `npm test`, `npm run build`.

- [ ] **Step 5: Commit** — `git commit -m "Report designer: a section's settings in categories, with its preview beside them; the ☰ ticks move into Table"`.

---

### Task 2: Plain level names, list tags, no list blurb

**Files:** Modify `DocGen/doc-designer.js` (`LEVEL_OPTS`, `levelSelect`, the row's `kind` and `warn` spans, `renderSectionList`'s blurb). Test: `test/docgen/designer-panes.test.js`.

- [ ] **Step 1: Failing tests**

```js
test('the list uses plain level names and tags: Auto-populated, Meta, Table of Contents, none for your own', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [] }] });
  App.docHost.set(h); RD.open(); RD.select('things');
  const html = RD.render(h.getState()); RD.close();
  const list = html.slice(html.indexOf('rd-order-host'), html.indexOf('rd-split'));
  assert.match(list, /<option value="1"[^>]*>Heading 1<\/option>/);
  assert.match(list, /<option value="0"[^>]*>Title<\/option>/);
  assert.match(list, /<option value="5"[^>]*>Normal text<\/option>/);
  assert.match(list, />Auto \(Heading 1\)</);
  assert.doesNotMatch(list, />H1<|>T<|>N</);
  const row = (id) => list.slice(list.indexOf(`data-rd-block="${id}"`), list.indexOf('</li>', list.indexOf(`data-rd-block="${id}"`)));
  assert.match(row('things'), /class="rd-kind">Auto-populated</);
  assert.match(row('meta'), /class="rd-kind">Meta</);
  assert.match(row('toc'), /class="rd-kind">Table of Contents</);
  assert.doesNotMatch(row('mine'), /rd-kind/);
  assert.doesNotMatch(html, /Drag, or use/);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** A plain name per level:

```js
    function levelName(lv) {
      return lv === App.doc.TITLE_LEVEL ? 'Title' : lv === App.doc.BODY_LEVEL ? 'Normal text' : 'Heading ' + lv;
    }
```

`LEVEL_OPTS` labels become `levelName(l.value)`; `levelSelect`'s Auto label `'Auto (' + levelName(shown) + ')'` and its titles use `levelName`; the skip warning `'↰ ' + levelName(r.level)` and its title "…pulled up to " + levelName. The tag:

```js
        var kind = b.kind === 'custom' ? ''
          : '<span class="rd-kind">' + esc(b.kind === 'meta' ? 'Meta' : b.kind === 'toc' ? 'Table of Contents' : 'Auto-populated') + '</span>';
```

Delete the `<p class="muted rpt-note">Drag, or use…</p>` from `renderSectionList`. Remove the CSS `text-transform` on `.rd-kind` if it uppercases (check `doc-designer.css`; keep the tag's existing look otherwise).

- [ ] **Step 4: Run** the panes tests, `npm test`, `npm run build` → pass.
- [ ] **Step 5: Commit** — "Report designer: plain level names, section tags (Auto-populated, Meta, Table of Contents), no list blurb".

---

### Task 3: No one-line explanations in the designer

**Files:** Modify `DocGen/doc-designer.js` (every `<p class="muted…">` / `rd-hint` explanation in the view module). Test: `test/docgen/designer-panes.test.js`.

- [ ] **Step 1: Failing test** — render every tab and every category for a generated, a Meta, a Contents and an own section (with one paragraph, one table, one space part), and collect the text of every `<p class="muted…">`:

```js
test('no one-line explanations anywhere in the designer: only messages about state remain', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [{ id: 'p1', kind: 'para', text: 'x' }, { id: 't1', kind: 'table', header: ['A'], rows: [['1']], align: ['l'] }, { id: 's1', kind: 'space', height: 10 }] }] });
  const pages = [];
  for (const pane of ['styles', 'templates', 'preview', 'generate']) pages.push(paneOf(h, pane));
  for (const sec of ['styles']) for (const s of ['page', 'body', 'tables', 'headerFooter', 'marking', 'numbering']) pages.push(paneOf(h, sec, s));
  for (const [id, cs] of [['things', ['heading', 'placement', 'introduction', 'table']], ['meta', ['rows']], ['toc', ['heading']], ['mine', ['heading', 'placement', 'content']]]) for (const c of cs) pages.push(sectionAt(h, id, c));
  const ALLOWED = [/^Nothing in this section yet\.$/, /^No .+ selected/, /^There are no sections yet\.$/, /^None written yet/, /page(s)? of \d+/i, /^Page \d+/, /^\d+ pages?$/];
  const notes = pages.flatMap((p) => [...p.matchAll(/<p class="muted[^"]*">([\s\S]*?)<\/p>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim()));
  const stray = [...new Set(notes.filter((t) => t && !ALLOWED.some((re) => re.test(t))))];
  assert.deepEqual(stray, []);
});
```

- [ ] **Step 2: Run** → FAIL, listing every explanation still there (use the list as the worklist).

- [ ] **Step 3: Implement.** For each listed explanation: delete the `<p>`; where the field is not self-explanatory, put a short form (≤ 12 words) in the label's `title` attribute or the box's placeholder (for example the heading box's placeholder already names the standard wording; "Number it" gets `title="The introduction takes the section's first number, such as 5.1"`). Kept as they are (they report state, not explain): the Standard-style lock note (`rd-locked`), held values (`rd-held`), placeholders still to fill (`rpt-omit`), characters the PDF cannot show (`rd-replaced`), the width note under the column strip **only** if it states the current mode ("Automatic widths" / "Set by hand") — trim it to those words. If a kept message is a `<p class="muted">`, change its class to `rd-state` so the guard reads it as state, and add it to the CSS with the same muted look.

- [ ] **Step 4: Run** the panes tests, `npm test`, `npm run build` → pass.
- [ ] **Step 5: Commit** — "Report designer: no one-line explanations; the few that matter become tooltips and placeholders".

---

### Task 4: The preview follows typing

**Files:** Modify `DocGen/doc-designer.js` (wiring: one debounced `input` listener; small `liveSave(el)` used by it and by the existing `change` handlers it covers). Test: `test/docgen/designer-panes.test.js` (source guard), browser walkthrough.

- [ ] **Step 1: Failing test** — a guard that the debounced path exists and covers the four kinds of box, and that it never repaints the whole workspace:

```js
test('the Sections preview follows typing: a debounced input saves the box and redraws only the preview', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../DocGen/doc-designer.js', import.meta.url), 'utf8');
  const fn = /function liveSave\(el\) \{([\s\S]*?)\n    \}\n/.exec(src);
  assert.ok(fn, 'liveSave exists');
  for (const attr of ['data-rd-sec-heading', 'data-rd-sec-title', 'data-rd-tbl-block', 'data-rd-rich']) assert.match(fn[1], new RegExp(attr), attr);
  const wire = /dom\.on\(ctx\.root, 'input', '\[data-rd-live\]'[\s\S]*?\n      \}\);/.exec(src);
  assert.ok(wire, 'an input listener on [data-rd-live]');
  assert.match(wire[0], /setTimeout\([\s\S]*500\)/);
  assert.match(wire[0], /refreshSectionPreview\(\)/);
  assert.doesNotMatch(wire[0], /repaint\(\)/);
});
```

and a render test that the four kinds of box carry `data-rd-live`:

```js
test('the boxes that drive the live preview are marked', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [{ id: 'p1', kind: 'para', text: 'x' }] }] });
  assert.match(sectionAt(h, 'things', 'heading'), /data-rd-sec-heading="things"[^>]*data-rd-live|data-rd-live[^>]*data-rd-sec-heading="things"/);
  assert.match(sectionAt(h, 'mine', 'heading'), /data-rd-live[^>]*data-rd-sec-title|data-rd-sec-title[^>]*data-rd-live/);
  assert.match(sectionAt(h, 'things', 'introduction'), /data-rd-intro="things"[^>]*data-rd-live|data-rd-live[^>]*data-rd-intro="things"/);
  assert.match(sectionAt(h, 'things', 'table'), /data-rd-tbl-field="title"[^>]*data-rd-live|data-rd-live[^>]*data-rd-tbl-field="title"/);
  assert.match(sectionAt(h, 'mine', 'content'), /data-rd-text="p1"[^>]*data-rd-live|data-rd-live[^>]*data-rd-text="p1"/);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** Add `data-rd-live` to: the heading inputs (`data-rd-sec-heading`, `data-rd-sec-title`), the table-wording text inputs (title row, caption, column headings — not the No-caption tick), the introduction and paragraph rich boxes (`richBox` callers for `data-rd-intro` and `data-rd-text`), and table cells (`data-rd-cell`). Then:

```js
    /** The store write a live box makes, without any repaint: the same calls its change/blur handler makes. */
    function liveSave(el) {
      if (el.hasAttribute('data-rd-rich')) return boxSaver(el)(RT.fromNode(el));
      if (el.hasAttribute('data-rd-sec-heading')) return App.docStore.setBlockHeading(el.getAttribute('data-rd-sec-heading'), el.value);
      if (el.hasAttribute('data-rd-sec-title')) return App.docStore.updateSection(el.getAttribute('data-rd-sec-title'), { title: el.value });
      if (el.hasAttribute('data-rd-tbl-block')) {
        var block = el.getAttribute('data-rd-tbl-block'), key = el.getAttribute('data-rd-tbl-key'), col = el.getAttribute('data-rd-tbl-col');
        return col ? App.docStore.setTableColumnLabel(block, key, col, el.value)
          : App.docStore.setTableText(block, key, el.getAttribute('data-rd-tbl-field'), el.value);
      }
      return { ok: true, issues: [] };
    }
    /** Redraw the Sections pane's preview column alone, so focus and the caret stay where they are. */
    function refreshSectionPreview() {
      var col = document.querySelector('[data-rd-sec-prev]');
      var project = App.docHost.get() && App.docHost.get().getState();
      if (!col || !project) return;
      var view = outlineNow(project);
      var block = view.blocks.filter(function (b) { return b.id === _rd.selected; })[0];
      if (block) col.innerHTML = sectionPreview(project, block);
    }
```

Wiring (in `wireText`, before the `focusout` handler):

```js
      var liveTimer = null;
      dom.on(ctx.root, 'input', '[data-rd-live]', function (e, el) {
        clearTimeout(liveTimer);
        liveTimer = setTimeout(function () {
          quietly(function () { logIssues(liveSave(el)); });
          dirty();
          refreshSectionPreview();
        }, 500);
      });
```

The existing `change` and `focusout` handlers stay; they save the same value again (each store write sets, so a second write of the same value is harmless) and repaint as before.

- [ ] **Step 4: Run** the panes tests, `npm test`, `npm run build` → pass.
- [ ] **Step 5: Commit** — "Report designer: the section preview follows typing, half a second after it stops".

---

### Task 5: Styling and the browser walkthrough

**Files:** Modify `DocGen/doc-designer.css` (the grid and category list), `src/ui/styles.css` (PIVOT's look for `.rd-cat`, as `.rd-style-sec`).

- [ ] **Step 1: CSS.**

```css
  .docgen .rd-secgrid { display: grid; grid-template-columns: 150px minmax(300px, 1fr) minmax(320px, 1fr); gap: 12px; align-items: start;}
  @media (max-width: 1400px) { .docgen .rd-secgrid { grid-template-columns: 150px minmax(0, 1fr); } .docgen .rd-sec-prev { grid-column: 1 / -1; } }
  .docgen .rd-cat-list { display: flex; flex-direction: column; gap: 2px; position: sticky; top: 0;}
  .docgen .rd-cat { text-align: left; border: 1px solid transparent; background: none; padding: 5px 8px; font: inherit; font-size: 13px; color: var(--c-text); cursor: pointer;}
  .docgen .rd-cat.on { border-color: var(--c-accent); background: var(--c-surface-alt); font-weight: 600;}
  .docgen .rd-sec-fields { min-width: 0;}
  .docgen .rd-sec-prev { position: sticky; top: 0; max-height: calc(100vh - 230px); overflow: auto; min-width: 0;}
  .docgen .rd-state { font-size: 12px; color: var(--c-text-muted); margin: 0 0 6px;}
```

In `src/ui/styles.css`, beside the `.rd-style-sec` rules, give `.docgen .rd-cat` the same three rules (transparent; hover surface-2 + accent text; `.on` surface-2 with the 3px inset accent bar, bold). Remove now-unused `.rd-optbtn` / `.rd-optmenu` rules from `doc-designer.css`.

- [ ] **Step 2: Build and walk through** (seed a register as in earlier walkthroughs; serve `dist/`):
  - Open the designer: the first section is open, Heading category, preview on the right.
  - Hazards: each category; Table shows the column ticks; untick an optional column → preview changes.
  - Type in the heading and the introduction: the preview follows within about half a second; the caret stays in the box.
  - About this platform: Rows; Contents: Heading and Placement only; an added section: Content with a paragraph.
  - Narrow the window: the preview moves under the settings. Light and dark themes.
- [ ] **Step 3: Fix what the walkthrough finds** (each with a test where the cause is testable); `npm test`; build; clean up (`dist/_seed.json`, `.playwright-mcp`, the server).
- [ ] **Step 4: Commit** — "Report designer: the Sections tab's grid, categories and preview column styled".
