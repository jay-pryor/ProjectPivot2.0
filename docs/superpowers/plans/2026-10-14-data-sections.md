# Data Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the report designer shape register data itself — field chips in text and cells, sections and parts repeated per register entry with a filter and sort, hand-written fill-ins per entry, and register tables chosen per document.

**Architecture:** The host declares a data *catalogue* (collections, fields, an entry tree bound to the run). A new pure module `DocGen/doc-data.js` parses field tokens, resolves them against a *scope* (the chain of entries a piece of text sits in), filters and sorts entries, and expands repeating section groups into ordinary custom blocks before the existing outline/build pipeline runs. `App.md.runs` gains a `resolveField` option, so every place rich text is rendered prints fields; the designer gains a Field menu, chips, a Repeat category, Repeat parts, repeated table rows and a Fill in category.

**Tech Stack:** Plain ES modules, no dependencies; `node --test`; the single-file build (`scripts/build.js`).

**Spec:** `docs/superpowers/specs/2026-10-14-data-sections-design.md`

## Global Constraints

- DocGen stays generic and dependency-free: no hazard/control vocabulary in `DocGen/`.
- Field token: `{{f:<collection>.<field>[?opts]}}`; opts `sort=<field>[:desc]`, `where=<field>:<op>:<value>`, `list=num|bullet|comma|lines`, `empty=<text>`, values URI-encoded.
- Fill token: `{{fill:<id>?label=<text>}}`; values at `report.fills[id][instanceKey]`, instanceKey `coll:key/coll:key` (root excluded), `''` outside repeats.
- Unknown field prints `[unknown field]` bold; unfilled fill prints `[To fill in: <label>]` bold; empty default `Nil`.
- Operators: `is`, `not`, `has`, `empty`, `set`, `gte`, `lte`.
- Copy ids `<sectionId>~<entryKey>`; part ids suffixed the same way.
- Register text never parsed as markup.
- Schema 8: `report.registers` lists the register tables a design holds; absent = none.
- Run `npm run build` after every source change; `npm test` must pass before each commit.

## Review Focus

1. Register text containing `{{b}}`, `{{f:…}}` or `/[Tag]` inside a field value must print literally — pinned in Task 2.
2. A repeating section whose template level is automatic must keep its level on every copy (not drift under the previous copy's sub-headings) — pinned in Task 4.
3. Editing a part inside a Repeat part (cell, move, delete, image) must find it — pinned in Task 9.
4. A design opened with no platform chosen must render the designer without errors and print no copies — pinned in Task 4 and Task 6.
5. Fill-in values must survive a hazard being renumbered (keys are record ids, not display numbers) — pinned in Task 3 (stable keys) and Task 10.

---

## Stage 1 — Foundation

### Task 1: `DocGen/doc-data.js` — tokens, values, filter, sort, scope resolution

**Files:**
- Create: `DocGen/doc-data.js`
- Modify: `scripts/build.js` (add to `EXTRA_SOURCES`)
- Test: `test/docgen/data.test.js`

**Interfaces — Produces:**
```js
export const OPS = ['is', 'not', 'has', 'empty', 'set', 'gte', 'lte'];
export function parseFieldTag(tag)   // 'f:hazard.title?sort=date:desc&list=num' -> { coll, field, opts: { sort?: {field,dir}, where?: {field,op,value}, list?: string, empty?: string } } | null
export function fieldTag(coll, field, opts)   // inverse; omits defaults
export function parseFillTag(tag)    // 'fill:fill1?label=X' -> { id, label } | null
export function fillTag(id, label)
export function textOf(v)            // Value -> string ('' for null)
export function sortOf(v)            // Value -> string|number (sort key)
export function matches(entry, where)            // where {field,op,value}|null -> boolean (null passes)
export function select(entries, where, sort)     // filter then stable sort; returns new array
export function rootScope(data)      // data entry|null -> Scope ([] when null) ; Scope = Array<{coll, entry}>
export function inScope(scope, coll) // innermost entry of coll or null
export function childrenIn(scope, coll)          // children list from innermost scope entry having children[coll], or null
export function resolveField(scope, parsed, catalogue) // -> { kind: 'value', text } | { kind: 'list', items: string[] } | { kind: 'unknown' } | { kind: 'unbound' }
export function fieldText(res, opts)  // -> string, printed per list style / empty
export function instanceKey(scope)    // 'hazard:h1/control:c3' (root excluded)
```
`resolveField` returns `unbound` when the scope is empty (no data) but the field exists in the catalogue; `unknown` when the collection/field is not declared or not reachable.

- [ ] **Step 1: Write failing tests** covering: parse/format round trip with URI-encoded values (`where=type:is:Near%20miss`); `sortOf` of `{text,sort}` vs plain strings; each operator (`gte` on rating ranks, `has` on lists, `empty`/`set`); stable sort with ties and `desc`; rule 1 (entry in scope → value), rule 2 (children → list, filtered/sorted by opts), list-type field under rule 1 → list, rule 3 unknown (undeclared field; collection not reachable), unbound with empty scope; `fieldText` for `lines`, `num`, `bullet`, `comma`, `empty` default `Nil` and custom; `instanceKey`.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../DocGen/doc-data.js';
const cat = { root: 'platform', collections: {
  platform: { label: 'Platform', fields: [{ id: 'name', label: 'Name', type: 'text' }], children: ['hazard'] },
  hazard: { label: 'Hazard', fields: [{ id: 'id', label: 'ID', type: 'text' }, { id: 'causes', label: 'Causes', type: 'list' }, { id: 'risk', label: 'Risk', type: 'rating' }], children: ['report'] },
  report: { label: 'Safety report', fields: [{ id: 'date', label: 'Date', type: 'date' }, { id: 'text', label: 'Text', type: 'text' }], children: [] } } };
const data = { key: 'p1', values: { name: 'Ship' }, children: { hazard: [
  { key: 'h1', values: { id: 'HAZ-001', causes: ['a', 'b'], risk: { text: 'High (2B)', sort: 3 } }, children: { report: [
    { key: 'r2', values: { date: { text: '2 Jan 2026', sort: '2026-01-02' }, text: 'later' }, children: {} },
    { key: 'r1', values: { date: { text: '1 Jan 2026', sort: '2026-01-01' }, text: 'earlier' }, children: {} }] } },
  { key: 'h2', values: { id: 'HAZ-002', causes: [], risk: { text: 'Low (5G)', sort: 1 } }, children: { report: [] } }] } };
test('a child list resolves sorted, numbered', () => {
  const scope = D.rootScope(data).concat([{ coll: 'hazard', entry: data.children.hazard[0] }]);
  const res = D.resolveField(scope, D.parseFieldTag('f:report.text?sort=date&list=num'), cat);
  assert.deepEqual(res, { kind: 'list', items: ['earlier', 'later'] });
  assert.equal(D.fieldText(res, { list: 'num' }), '1. earlier\n2. later');
});
test('gte compares sort keys', () => {
  assert.deepEqual(D.select(data.children.hazard, { field: 'risk', op: 'gte', value: '2' }).map((e) => e.key), ['h1']);
});
```
(Write the remaining cases in the same style.)

- [ ] **Step 2:** `node --test test/docgen/data.test.js` — FAIL (module missing).
- [ ] **Step 3: Implement** `doc-data.js` (pure functions above). `gte`/`lte` value: if the field's values sort numerically, compare `Number(value)`; otherwise compare strings with `localeCompare(..., {numeric:true})`. `is`/`not`/`has` compare `textOf` lower-cased; lists match when any item does. `where`/`sort` on a field the collection lacks: `matches` returns true / sort is a no-op (the designer reports it).
- [ ] **Step 4:** tests pass; add `'DocGen/doc-data.js'` to `EXTRA_SOURCES`; `npm run build`.
- [ ] **Step 5:** commit "DocGen: doc-data, field tokens resolved against a scope".

### Task 2: `App.md` and the rich-text box understand field and fill tokens

**Files:**
- Modify: `DocGen/doc-designer.js` (App.md `TOKEN`, `runsPara`, `plain`; App.ui.richText `toHtml`, `applyToken`)
- Test: `test/docgen/md-fields.test.js`

**Interfaces — Consumes:** `parseFieldTag`, `parseFillTag` (Task 1). **Produces:**
- `App.md.TOKEN` matches `{{f:…}}` and `{{fill:…}}`; `App.md.FIELD_TAG = /^f:/`, `App.md.FILL_TAG = /^fill:/`.
- `App.md.runs(s, { resolveRef, resolveField })`: `resolveField(tag) -> Array<run>|null`; a field/fill token emits those runs (current bold/italic applied); with no resolver, a field emits `{text:'‹'+label+'›'}` via `opts.fieldLabel(tag)` or the raw path.
- `App.md.plain(s, { fieldLabel })`: a field reads `‹Label›`, a fill `‹To fill in: label›`.
- `App.ui.richText.toHtml(tokens, { resolveRef, fieldLabel })`: field → `<span class="rd-chip rd-field" contenteditable="false" data-rd-tok="f:…" title="…">Hazard › Title</span>` (`rd-broken` when `fieldLabel` returns null); fill → `rd-chip rd-fill` reading `✎ label`.
- `applyToken(text, s, e, 'f:…')` inserts a marker token (no closing token), like a reference with no selection.

- [ ] **Step 1: Failing tests:** TOKEN matches `{{f:hazard.title?sort=date%3Adesc&list=num}}`; runs with a resolver returning `[{text:'{{b}}x /[Tag]'}]` gives that literal text (Review Focus 1); bold around a field bolds its runs; plain reading; `toHtml` chip and `fromNode` round trip (use the existing jsdom-free walker test style in `DocGen/doc-designer.test.js`, or test `toHtml` output string and `applyToken` only); `applyToken('ab', 1, 1, 'f:hazard.id')` → `a{{f:hazard.id}}b`.
- [ ] **Step 2:** run — FAIL.
- [ ] **Step 3: Implement.** TOKEN source becomes `\{\{(\/?)(b|i|c|br|(?:ref|refn|reft):[A-Za-z0-9:._-]+|ref|f:[A-Za-z0-9._-]+(?:\?[A-Za-z0-9._~%&=:-]*)?|fill:[A-Za-z0-9_-]+(?:\?[A-Za-z0-9._~%&=:-]*)?)\}\}`. In `runsPara`, a field/fill tag (not close): `var got = opts.resolveField ? opts.resolveField(tag) : null; (got || [{ text: fallback }]).forEach(r => out.push(run(r.text, r)))` with `br` runs pushed as `{br:true}`. `applyToken`: `var isMarker = isRef || /^(f|fill):/.test(tag)`; markers never get a close.
- [ ] **Step 4:** tests pass, full `npm test`, build.
- [ ] **Step 5:** commit.

### Task 3: The host's catalogue (contract + PIVOT)

**Files:**
- Modify: `DocGen/doc-designer.js` (App.docHost: validate optional `catalogue`; `App.docHost.catalogue(run)`)
- Modify: `src/reports/snapshot.js` (stable ids; per-hazard reference numbers)
- Create: `src/reports/catalogue.js` (`catalogueFor(snapshot|null)`)
- Modify: `src/reports/docgen-host.js` (`catalogue: (run) => catalogueFor(...)`)
- Test: `test/reports/catalogue.test.js`, `test/docgen/host-catalogue.test.js`

**Interfaces — Produces:**
- `App.docHost.catalogue(run) -> { root, collections, data } | null` (null when the host declares none).
- Snapshot rows gain `controls[].id`, `safetyReports[].id`, `references: string[]` (reference numbers supporting the hazard); snapshot `references[]` gain `id`.
- `catalogueFor(s)`: collections `platform`, `hazard`, `control`, `assessment`, `safetyReport`, `reference` with the spec's fields (ids: platform `name, owner, hazards, reviewDue, lastReviewed`; hazard `id, title, description, phases, causalFactors, consequences, initialPersonnel, initialEnvironment, initialCapability, residualPersonnel, residualEnvironment, residualCapability, sfarpJustification, sfarpConclusion, sfarpConditions`; control `id, title, description, kind, tier, status, recommendation, justification, reason, implementedBy, hazards`; assessment `stage, receptor, likelihood, likelihoodWhy, consequence, consequenceWhy, level`; safetyReport `id, date, type, summary, description, location, parties, hazards`; reference `id, title, docNumber, revision, supports`). Entry keys: hazard `hazardId`, control `id`, assessment `stage:receptor`, safety report `id`, reference `id`. Ratings `{text, sort: rank}` where rank is the band's index in `BANDS` order low→high (from `src/core/matrix.js`; export a `bandRank` if needed). Dates `{text: aestDate-like 'd Mon yyyy', sort: iso}`.

- [ ] **Step 1: Failing tests:** catalogue unbound has collections and `data: null`; bound from a small snapshot: hazard keys are hazard ids (renumbering via `renumbered()` changes `id` value but not key — Review Focus 5); platform-level controls gathered once with `hazards` list; hazard references only those supporting it; rating sort ranks order Low < … ; date sort ISO. DocGen side: `App.docHost.set(host without catalogue)` → `catalogue()` null; with a bad `catalogue` (not a function) → validate error.
- [ ] **Step 2–4:** implement, pass, build.
- [ ] **Step 5:** commit.

### Task 4: Expansion and rendering with a scope

**Files:**
- Modify: `DocGen/doc-data.js` (`expandRepeats`)
- Modify: `DocGen/doc-designer.js` (`documentFor`, `buildDocument`: scope-aware runs for headings, intros, parts, captions)
- Test: `test/docgen/expand.test.js`, additions to `test/docgen/builder.test.js`

**Interfaces — Produces:**
```js
// doc-data.js
export function groups(blocks)   // blocks with resolved .level -> Array<{ at, end }> per repeating custom block (index range of its group)
export function expandRepeats(blocks, catalogue, resolvedLevels)
// blocks: included hostBlocks; resolvedLevels: { [blockId]: level } from App.doc.outline of the same blocks.
// returns new blocks: each repeating group replaced by copies; every copy and every block inside a copy
// carries `scope` (Scope) and `level` pinned; ids/part ids suffixed '~key'; non-repeating blocks get `scope: rootScope(data)`.
// Contents (kind 'toc') and Metadata ('meta') inside a group are emitted once, before the copies.
```
- `buildDocument` reads `b.scope` and builds `resolveField(tag)` per block: field → `D.resolveField(scope, D.parseFieldTag(tag), cat)` → runs (lines split to `br`; `unknown` → `{text:'[unknown field]', bold:true}`; `unbound` → `‹label›`); fill tags handled in Task 10 (until then: `[To fill in: label]` bold). Headings: `textRuns(plainFields(title))` where `plainFields` resolves field tokens to text with no markup parsing. Captions: same for `autoCaption` text.
- `documentFor` passes `catalogue = App.docHost.catalogue(run)` to expansion and to `buildDocument(host, blocks, meta, catalogue)`.

- [ ] **Step 1: Failing tests:** two hazards → two copies with ids `s1~h1`, `s1~h2`; group of an H2 repeating + following H3 (auto level) → copies `s1~h1, s2~h1, s1~h2, s2~h2` with levels 2,3,2,3 (Review Focus 2, using `level: null` on the H2 after an explicit H1); nested repeat (H4 per report under the hazard group) uses that hazard's children; filter and sort applied; no entries → nothing; unbound (`data: null`) → nothing and no throw (Review Focus 4); part ids suffixed; a paragraph `{{f:hazard.id}}` in a copy prints `HAZ-001`; a heading `{{f:hazard.id}} {{f:hazard.title}}` prints plain; table cell field; `[unknown field]` for `{{f:hazard.id}}` outside a repeat; platform field anywhere; contents list lists each copy.
- [ ] **Step 2–4:** implement, pass, build.
- [ ] **Step 5:** commit.

### Task 5: Store and templates carry `repeat`

**Files:**
- Modify: `DocGen/doc-designer.js` (App.docStore `setSectionRepeat(id, repeat|null)`; `validItem`/section validation accepts `repeat`; `useSectionTemplate`/save section template carry `repeat`; report templates carry sections already — verify)
- Test: `test/docgen/repeat-store.test.js`

**Interfaces — Produces:** `App.docStore.setSectionRepeat(sectionId, { each, where?, sort? } | null) -> {ok, issues}`; normalises: drops `where` without a field, `sort` without a field, unknown op → error issue.

- [ ] Steps: failing tests (set/clear, normalise, template round trip, import of a section with `repeat` validates `each` string and `where.op` in OPS) → implement → pass → build → commit.

### Task 6: Designer UI — Field menu, chips, heading box, Repeat category

**Files:**
- Modify: `DocGen/doc-designer.js`, `DocGen/doc-designer.css`
- Test: `test/docgen/designer-fields.test.js`

**Interfaces — Consumes:** Tasks 1–5. **Produces:**
- `scopeChainFor(project, sectionId) -> string[]` collections in scope for a section (root, enclosing repeating sections' `each`, own `each`), from the outline of the unexpanded blocks and `D.groups`.
- `fieldLabel(tag)` for the designer: `Collection › Field` or null when unknown.
- Field button `data-rd-field-open="<boxId>"` beside every 🔗 Link (paragraph, table, introduction) and on the heading box; `_rd.fieldFor`; menu `fieldMenuFor(project, sectionId, host)` lists in-scope collections' fields and child collections (marked *list*), buttons `data-rd-field-pick="f:coll.field"` → `wrapSelection(el, tag)`.
- Field menu buttons are `draggable`; `dragstart` sets `text/x-rd-token` to the tag; a `drop` on a rich box places the caret at the drop point and inserts the token (`insertToken`).
- Custom section heading becomes a one-line rich box `data-rd-rich data-rd-sec-heading-rich="<secId>"` (Enter suppressed); `boxSaver` writes `updateSection(id,{title})`.
- Section list label uses `App.md.plain(title, { fieldLabel })`; a repeating section shows `<span class="rd-kind">↻ per Hazard</span>`.
- Category `repeat` ("Repeat") for custom sections when the host has a catalogue: select `data-rd-repeat-each`, filter (`data-rd-repeat-wfield`, `-wop`, `-wval`), sort (`data-rd-repeat-sfield`, `-sdir`), the group note, and the "no entries"/"not available here" notes.
- Section preview of a repeating section: crop from the first copy's anchor (`sec-<id>~<firstKey>`) with a note "1 of N".

- [ ] Steps: failing pane tests (Field button present per box; menu lists `Hazard › ID` inside a hazard repeat and not outside; chip HTML in a paragraph; Repeat category options = platform children at top level; list marker; no platform chosen renders without throwing — Review Focus 4) → implement → pass → build → commit "Stage 1".

## Stage 2 — Lists

### Task 7: List chip options panel

**Files:** `DocGen/doc-designer.js`, `.css`; Test: `test/docgen/designer-fields.test.js`
- Clicking a field chip in a box (`click` on `.rd-field`) sets `_rd.chipEdit = { key: boxKey, at: tokenOffset }` and repaints a panel under the box: Sort (field select + direction), Filter (field, op, value), Style (lines/num/bullet/comma — only when the token resolves to a list in this scope), Empty wording. Changes rewrite that one token in the box's text via `D.fieldTag` and save through `boxSaver`.
- Store helper (pure, tested): `replaceTokenAt(text, offset, newTag) -> text`.
- [ ] Steps: failing tests for `replaceTokenAt` and panel HTML → implement → pass → build → commit.

### Task 8: Repeated table rows

**Files:** `DocGen/doc-designer.js` (blankPart unchanged; `updatePart` accepts `each/where/sort/emptyText`; validation; buildDocument table emission; table editor "Rows" select), `.css`; Test: `test/docgen/rows.test.js`
- buildDocument: a table part with `each` → for each entry of `D.select(D.childrenIn(scope, each), where, sort)` (or the in-scope entry list), for each template row emit a row resolved in `scope.concat([{coll: each, entry}])`; none → one row `[emptyText||'Nil', '', …]`.
- Editor: `<select data-rd-rows-each>` "One row per: —, <collections available>", filter/sort controls like the Repeat category, template rows marked `rd-rowtpl` ↻.
- [ ] Steps: failing tests (two template rows × three entries = six rows in order; empty → Nil row; filter Initial) → implement → pass → build → commit.

### Task 9: Repeat parts

**Files:** `DocGen/doc-designer.js` (store recursion, build, editor, validation, templates), `src/reports/docgen-host.js` (`imagesInUse` recursion), `.css`; Test: `test/docgen/repeat-part.test.js`
- Store: `findPartIn(parts, id) -> { part, list, index } | null` recursive; `part()`, `updatePart`, `removePart`, `movePart`, `setCell`, row/column/width/image ops use it; `allParts` flattens recursively; `addPart(sectionId, kind, at, parentPartId?)` adds into a repeat's `parts`; `blankPart('repeat')` → `{ id, kind: 'repeat', each: '', parts: [] }`; `validParts` recursive and accepts `repeat`.
- Build: a repeat part → for each selected entry, its child parts emitted in the extended scope, child part ids suffixed `~key` (anchors unique); outline's table/figure numbering walks the expanded parts (expand repeat parts in `expandRepeats` too, so numbering sees them: do it there, per copy, with the copy's scope).
- Editor: framed box `rd-repeat` with "For each" select, filter, sort, nested parts rendered by the same part editors, and its own add bar (`data-rd-addpart` with `data-rd-parent`).
- [ ] Steps: failing tests (nested cell edit finds part — Review Focus 3; moving and deleting nested; allParts uniqueness; build emits per control; numbering of tables inside) → implement → pass → build → commit "Stage 2".

## Stage 3 — Fill-ins

### Task 10: Fill-ins

**Files:** `DocGen/doc-designer.js`, `.css`; Test: `test/docgen/fills.test.js`
- Store: `addFill(label) -> {id}` (next `fillN` over every fill token in sections and templates); `setFill(id, instanceKey, tokens)`; `removeLeftoverFills(liveKeysById)`; `removeSection` drops fills whose ids no longer appear anywhere.
- Build: fill tag resolves to `App.md.runs(value, {resolveRef})` flattened, or `[To fill in: label]` bold when empty; instance key `D.instanceKey(scope)`.
- `App.docGen.fillsIn(host, opts) -> Array<{ id, label, key, heading, sectionId, value }>` from the expanded blocks (with headings of each copy), plus `leftovers` count per id.
- UI: Field menu item "✎ To fill in…" (prompts for a label) inserts `fillTag(id,label)`; Fill in category for sections with fill tokens (grouped by copy heading, rich boxes `data-rd-fill="<id>" data-rd-fill-key="<key>"`); list marker "N to fill in"; Generate tab count; leftovers with Remove.
- [ ] Steps: failing tests (instance keys; value printed; empty marker; renumbered hazard keeps value — Review Focus 5; leftovers; templates do not carry fills) → implement → pass → build → commit "Stage 3".

## Stage 4 — Sections UI

### Task 11: Register tables opt-in (schema 8)

**Files:** `DocGen/doc-designer.js` (hostBlocks filters providers by `bag.registers`; `addRegister(id)`, `removeRegister(id)`; report templates carry `registers`), `src/core/data.js` (SCHEMA_VERSION 8), `scripts/convert-to-v8.mjs`, tests updated for opt-in; Test: `test/docgen/registers.test.js`, `test/scripts/convert-to-v8.test.js`
- `removeRegister` prunes the block's per-id keys like `removeSection`.
- Convert script: data.json envelope 7→8 (`reportDesign.reportTemplates[].registers` = all register ids minus those `options.sections[id] === false` in the template… templates store no options, so all); each `reports/<id>.json` design gets `registers` = all register ids minus `design.options.sections[id] === false`; keeps `data.v7.json`; design files rewritten in place after copying to `reports/<id>.v7.json`.
- [ ] Steps: failing tests → implement → existing tests adjusted to add `registers` where they expect register tables → pass → build → commit.

### Task 12: + Add section menu

**Files:** `DocGen/doc-designer.js`, `.css`; Test: `test/docgen/designer-panes.test.js`
- Button `data-rd-add-menu` toggles `_rd.addMenu`; menu items: Blank (`data-rd-add-section`), Repeating section ▸ collections (`data-rd-add-repeat="hazard"` → addSection then setSectionRepeat), Register table ▸ not-yet-added (`data-rd-add-register`), From template ▸ (`data-rd-use-template-id`). The old select goes. Register rows get ✕ `data-rd-del-register`.
- [ ] Steps: failing tests → implement → pass → build → commit.

### Task 13: SSRA starter template

**Files:** `src/reports/starters.js` (the SSRA report template object), `src/reports/docgen-host.js` (`starterTemplates`; `newDesign('starter:ssra')`), `src/ui/screens/reports.js` (Start from option), `src/ui/controller.js` if it validates `from`; Test: `test/reports/starters.test.js`
- The template uses only declared catalogue fields (test: every `f:` token in it parses and resolves `unbound` against `catalogueFor(null)`, never `unknown`), and builds a document for a fixture platform with N hazards → N hazard headings.
- [ ] Steps: failing tests → implement → pass → build → commit "Stage 4".

### Task 14: Browser check and branch review

- [ ] Serve `dist/`, render the designer through a fixture page (as done for the Styles list) with the SSRA starter on a fixture platform; screenshot the Sections pane, the Field menu, the preview; check copies, numbering, contents list, fill-in.
- [ ] Whole-branch review by a fresh reviewer; fix findings; final `npm test`, build, commit.
