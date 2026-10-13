# Reports With Their Own Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each report is a record with its own name, design and stage (In-Progress / For Review), started from the Reports tab and reopened from the list; and the designer shows the app's Save button.

**Architecture:** The report record gains `stage` and `design`. The doc host gets a second kind of host, `hostFor(reportId)`, whose state is the report's own arrangement laid over the shared *library* (Styles, templates, Standard Images), and whose commits split back into the two. The controller tracks which report the designer has open; Make PDF/HTML make the document onto that record. The designer's header gets a slot the app fills with its own Save button.

**Tech Stack:** Plain ES modules (`src/`), ES5 IIFEs (`DocGen/doc-designer.js`), node:test, Playwright walkthrough.

**Spec:** `docs/superpowers/specs/2026-10-13-reports-own-design-design.md`

## Global Constraints

- The record field is `stage: 'in-progress' | 'for-review'`; record `status` stays `live`/`deleted`. A report with no `stage` counts as For Review.
- Labels exactly: "In-Progress", "For Review", "Open in Report Designer", "Default for new reports", "Report name", "Start from", "The shared design".
- Edits to a report's `design` write no history; creating writes "Start report"; making writes "Make report".
- The shared *library* — `formats`, `sectionTemplates`, `reportTemplates`, `standardImages` — stays in `reportDesign` for everyone; a report's `design` holds the rest (order, levels, wording, sections, `formatId`, options, classification, …).
- `SCHEMA_VERSION` stays 6; no conversion.
- `DocGen/doc-designer.js` stays ES5. Build after every change; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The designer left on the shared host after making a report** — `produce` used to call `App.docHost.set(host)` with the shared host; after Make PDF on a report the designer must still edit that report (Task 3 test "producing a report keeps the designer on that report's host").
2. **A Style or template made while a report is open** — it must land in the shared library, not inside the report (Task 3 test "a report host keeps the library shared").
3. **Recovering unsaved work after a report was made again** — the browser copy must keep the new document (Task 2 test).
4. **Opening an old report** (no `design`, no `stage`) — it opens on a copy of the shared design, shows For Review, and opening does not change its stage (Task 4 test).
5. **The heading/Save slot repainted away** — designer repaints replace the header; the slot must be refilled on every designer paint and on every app state change (Task 6 test + walkthrough).

## Spec rulings carried into this plan

- **Library stays shared** (spec silent): a report's own copy covers its arrangement and choice of Style; Styles, templates and Standard Images are a shared library. Otherwise a Style or template made while a report is open would vanish into that report.
- **Save button wording**: the top bar shows Unsaved / Saving… / Saved (no count); the designer shows the same. The spec's "with their count" described the top bar wrongly.
- **Name required**: the name box is `required` in a form, as the app's other name boxes are; the browser says "Please fill out this field" rather than a disabled button.

---

### Task 1: The report record — start, own-design edits, make

**Files:**
- Modify: `src/core/ops/reports.js`, `src/core/history.js`
- Test: `test/core/report-design.test.js` (new)

**Interfaces:**
- Produces (from `src/core/ops/reports.js`):
  - `STAGES = { inProgress: 'in-progress', forReview: 'for-review' }`, `stageOf(r) → 'in-progress' | 'for-review'`
  - `startReport(data, act, { id, title, design }) → Data` (history "Start report")
  - `setOwnReportDesign(data, act, { id, design, platformId? }) → Data` (no history; a For Review report whose design changed goes back to In-Progress)
  - `makeReport(data, act, { id, report }) → Data` (history "Make report"; sets `stage: 'for-review'` and the made fields)
- `history.js`: report's fields left out of history are `document`, `style`, `html`, `design`.

- [ ] **Step 1: Write the failing tests** (`test/core/report-design.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startReport, setOwnReportDesign, makeReport, stageOf, createReport } from '../../src/core/ops/reports.js';
import { entries } from '../../src/core/history.js';
import { act, seed } from '../helpers.js';

const design = { order: ['hazards'], levels: { hazards: 1 } };

test('a report starts In-Progress with its own copy of a design, and says so in the history', () => {
  const d = startReport(seed(), act, { id: 'r1', title: 'Customer pack', design });
  const r = d.records.report.r1;
  assert.deepEqual([r.title, r.stage, r.status, r.design], ['Customer pack', 'in-progress', 'live', design]);
  assert.notEqual(r.design, design, 'a copy, not the same object');
  assert.equal(stageOf(r), 'in-progress');
  assert.ok(entries(d, 'report', 'r1').some((e) => e.label === 'Start report'));
});

test('a report made before stages counts as For Review', () => {
  const d = createReport(seed(), act, { id: 'r0', report: { title: 'Old', document: { blocks: [] }, style: {} } });
  assert.equal(stageOf(d.records.report.r0), 'for-review');
});

test('editing a report\'s design writes no history and sends a For Review report back to In-Progress', () => {
  let d = startReport(seed(), act, { id: 'r1', title: 'T', design });
  d = makeReport(d, act, { id: 'r1', report: { platformId: 'p1', platformName: 'Alpha', producedAt: act.at, producedBy: act.by, document: { blocks: [] }, style: {} } });
  assert.equal(d.records.report.r1.stage, 'for-review');
  const before = entries(d, 'report', 'r1').length;
  const same = setOwnReportDesign(d, act, { id: 'r1', design });
  assert.equal(same, d, 'no change, no new data');
  const e = setOwnReportDesign(d, act, { id: 'r1', design: { ...design, levels: { hazards: 2 } } });
  assert.equal(e.records.report.r1.stage, 'in-progress');
  assert.deepEqual(e.records.report.r1.design.levels, { hazards: 2 });
  assert.equal(entries(e, 'report', 'r1').length, before, 'no history entry for a design edit');
  const p = setOwnReportDesign(e, act, { id: 'r1', design: e.records.report.r1.design, platformId: 'p2' });
  assert.equal(p.records.report.r1.platformId, 'p2');
});

test('making a report puts the document on the same record and sets For Review', () => {
  let d = startReport(seed(), act, { id: 'r1', title: 'T', design });
  d = makeReport(d, act, { id: 'r1', report: { platformId: 'p1', platformName: 'Alpha', producedAt: act.at, producedBy: act.by, classification: 'OFFICIAL', document: { blocks: [1] }, style: { s: 1 } } });
  const r = d.records.report.r1;
  assert.deepEqual([r.stage, r.platformName, r.document.blocks[0], r.title, r.design.order[0]], ['for-review', 'Alpha', 1, 'T', 'hazards']);
  assert.equal(Object.keys(d.records.report).length, 1, 'no new report');
  const made = entries(d, 'report', 'r1').find((x) => x.label === 'Make report');
  assert.ok(made);
  assert.ok(!JSON.stringify(made).includes('"design"'), 'the design is not in the history');
});
```

Before writing, check `entries`' signature and the shape of a history entry (`sed -n 1,80p src/core/history.js | grep -n "export function entries" -A12`), and how `commit` labels a change (`grep -n "export function commit" -A20 src/core/apply.js`). Adjust the two `label` look-ups to the real field name holding "Start report" / "Make report" (the assertion — an entry with that wording exists — stays).

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/core/report-design.test.js`
Expected: FAIL — `startReport` is not exported.

- [ ] **Step 3: Implement** (append to `src/core/ops/reports.js`)

```js
/** A report's stage: being worked on, or made and waiting for review. */
export const STAGES = Object.freeze({ inProgress: 'in-progress', forReview: 'for-review' });
/** A report made before stages existed has been made, so it is For Review. @param {Record<string, any>} r */
export const stageOf = (r) => (r && r.stage === STAGES.inProgress ? STAGES.inProgress : STAGES.forReview);

/**
 * Start a report: a name, its own copy of a design, In-Progress.
 * @param {Data} data @param {Act} act @param {{ id?: string, title: string, design: Record<string, any> }} args
 */
export function startReport(data, act, { id = newId(), title, design }) {
  return commit(data, act, 'Start report', [{ kind: 'report', rec: created(act, id, {
    title: String(title).trim(), stage: STAGES.inProgress, design: structuredClone(design ?? {}),
    platformId: null, platformName: '', producedAt: null, producedBy: null, classification: '',
  }) }]);
}

/**
 * A report's own design, as the designer edits it. Not in the history (every tick would be an
 * entry), like the shared design. A change sends a For Review report back to In-Progress.
 * @param {Data} data @param {Act} act @param {{ id: string, design: Record<string, any>, platformId?: string | null }} args
 */
export function setOwnReportDesign(data, act, { id, design, platformId }) {
  const r = need(data, 'report', id);
  const next = structuredClone(design ?? {});
  const designChanged = !sameJson(r.design, next);
  const platformChanged = platformId !== undefined && platformId !== r.platformId;
  if (!designChanged && !platformChanged) return data;
  const rec = changed(r, act, {
    design: next,
    ...(platformChanged ? { platformId } : {}),
    ...(designChanged ? { stage: STAGES.inProgress } : {}),
  });
  return { ...data, records: { ...data.records, report: { ...data.records.report, [id]: rec } } };
}

/**
 * Make a report: its document onto its own record, and For Review.
 * @param {Data} data @param {Act} act @param {{ id: string, report: Record<string, any> }} args
 */
export function makeReport(data, act, { id, report }) {
  const r = need(data, 'report', id);
  const { title: _t, design: _d, ...made } = structuredClone(report);
  return commit(data, act, 'Make report', [{ kind: 'report', rec: changed(r, act, { ...made, stage: STAGES.forReview }) }]);
}
```

In `src/core/history.js`, change line 14 to:

```js
// A report's documents and its own design are large and edited often; the history leaves them out.
const NOT_IN_HISTORY = Object.freeze({ report: [...REPORT_DOCUMENTS, 'design'] });
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/core/report-design.test.js test/core/*.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/ops/reports.js src/core/history.js test/core/report-design.test.js
git commit -m "Reports: start a report with its own design (In-Progress), edit it without history, make it onto the same record (For Review)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The browser copy keeps a re-made report's document

**Files:**
- Modify: `src/storage/mirror.js`
- Test: `test/storage/mirror.test.js`

**Interfaces:**
- Consumes: report records with `producedAt`.
- Produces: `writeMirror` leaves out a saved report's documents only when the working report's `producedAt` equals the saved one's.

- [ ] **Step 1: Write the failing test** (append to `test/storage/mirror.test.js`; it already imports `writeMirror`, `readMirror`, `restoreReportDocuments`; check how it builds a Storage stub at its top and reuse it)

```js
test('a saved report made again since the save keeps its new document in the browser copy', () => {
  const s = memoryStorage();
  const rep = (at, blocks) => ({ id: 'r1', status: 'live', title: 'T', producedAt: at, document: { blocks }, style: {} });
  const base = { ...emptyData(), records: { ...emptyData().records, report: { r1: rep('2026-10-13T09:00:00+10:00', ['old']) } } };
  const working = { ...base, records: { ...base.records, report: { r1: rep('2026-10-13T10:00:00+10:00', ['new']) } } };
  assert.equal(writeMirror(s, { folderName: 'x', base, working, loadedStamp: null }), null);
  const back = restoreReportDocuments(readMirror(s, 'x'), base);
  assert.deepEqual(back.working.records.report.r1.document.blocks, ['new']);
  assert.deepEqual(back.base.records.report.r1.document.blocks, ['old']);
});
```

Use the file's own Storage stub name in place of `memoryStorage()` and its `emptyData` import (add `import { emptyData } from '../../src/core/data.js';` if it is not there).

- [ ] **Step 2: Run to see it fail**

Run: `node --test test/storage/mirror.test.js`
Expected: FAIL — the working document comes back as `['old']`.

- [ ] **Step 3: Implement**

Replace `withoutSavedDocuments` and its use in `writeMirror`:

```js
/**
 * A saved report is already in the folder, and its documents can be large, so the mirror leaves
 * them out; `restoreReportDocuments` puts them back from the folder on recovery. A report made
 * again since it was saved (its producedAt differs) keeps its new documents here.
 * @param {import('../core/data.js').Data} data @param {Record<string, any>} saved the saved reports, by id
 */
function withoutSavedDocuments(data, saved) {
  /** @type {Record<string, any>} */
  const reports = {};
  for (const [id, r] of Object.entries(data.records.report)) {
    const s = saved[id];
    if (s && s.producedAt === r.producedAt) {
      const rest = { ...r };
      for (const k of REPORT_DOCUMENTS) delete rest[k];
      reports[id] = rest;
    } else {
      reports[id] = r;
    }
  }
  return { ...data, records: { ...data.records, report: reports } };
}
```

and in `writeMirror`:

```js
    const saved = mirror.base.records.report;
    const compact = { ...mirror, base: withoutSavedDocuments(mirror.base, saved), working: withoutSavedDocuments(mirror.working, saved) };
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/storage/*.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/mirror.js test/storage/mirror.test.js
git commit -m "Unsaved work: a report made again since the last save keeps its new document in the browser copy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: A host for one report; designs from a starting point; images in report designs

**Files:**
- Modify: `DocGen/doc-designer.js` (extract `applyReportTemplate`; designer subject change tells the host)
- Modify: `src/reports/docgen-host.js`
- Test: `test/reports/docgen-host.test.js`, `test/docgen/designer-panes.test.js`

**Interfaces:**
- Consumes: `setOwnReportDesign` (Task 1) through a new ctx callback.
- Produces:
  - `App.docStore.applyReportTemplate(bag, template) → bag` (pure; what `useReportTemplate` does to the design bag).
  - `LIBRARY_KEYS = ['formats', 'sectionTemplates', 'reportTemplates', 'standardImages']` (exported from `docgen-host.js`).
  - `createDocHost(ctx)` ctx gains `setReportDesign(id, design, platformId?)`; it returns `{ host, hostFor(reportId), newDesign(from), produce(platformId, { at, by, title, reportId? }) }`.
    - `hostFor(id)`: `getState()` → `{ report: { ...library, ...ownDesign } }` (own design = the report's `design`, or a copy of the shared non-library fields when it has none); `commit(mutator)` → library keys to `ctx.setDesign`, the rest to `ctx.setReportDesign(id, …)`; `heading = { title, tag }`; `rememberSubject(platformId)`.
    - shared `host.heading = { title: 'Default for new reports' }`.
    - `newDesign(from)` → `{ design, library }`: `from` empty → the shared non-library fields; a report template id → those fields with the template applied (`library` is the shared library after applying, which may have gained the template's Style).
    - `produce(…, { reportId })` lays out with `hostFor(reportId)` and leaves `App.docHost` on it.
  - `imagesInUse` also counts live reports' `design`.
  - Designer: on a subject change, `H().rememberSubject && H().rememberSubject(id)`; the header reads `H().heading` (Task 6 renders it).

- [ ] **Step 1: Write the failing tests**

Append to `test/docgen/designer-panes.test.js`:

```js
test('applying a report template is a pure step on a design bag', () => {
  const t = { id: 'rpt1', name: 'Pack', order: ['things'], levels: { things: 2 }, sections: [], format: { ...normaliseStyle({ id: 'standard' }).style } };
  const out = App.docStore.applyReportTemplate({ order: ['others'], formats: [] }, t);
  assert.deepEqual(out.order, ['things']);
  assert.deepEqual(out.levels, { things: 2 });
  assert.equal(out.formats.length, 1, 'a template\'s Style joins the Styles');
  assert.equal(out.formatId, out.formats[0].id);
});
```

Append to `test/reports/docgen-host.test.js` (reuse `setup` from the file — check its signature with `sed -n 15,40p test/reports/docgen-host.test.js`; it returns `{ docs, box }` or similar — and extend the ctx it builds with `setReportDesign`):

```js
import { startReport, setOwnReportDesign } from '../../src/core/ops/reports.js';
import { LIBRARY_KEYS } from '../../src/reports/docgen-host.js';

/** A host whose data holds a report r1 with its own design, and the shared design with a library. */
function withReport(own) {
  const box = { data: setReportDesign(seed(), { order: ['hazards', 'controls'], formats: [{ id: 'house', name: 'House', page: { margins: {} }, text: {} }], formatId: 'house', sectionTemplates: [{ id: 't1', name: 'T', parts: [] }] }) };
  box.data = startReport(box.data, act, { id: 'r1', title: 'Customer pack', design: own });
  const docs = createDocHost({
    getData: () => box.data,
    setDesign: (design) => { box.data = setReportDesign(box.data, design); },
    setReportDesign: (id, design, platformId) => { box.data = setOwnReportDesign(box.data, act, { id, design, platformId }); },
    clock: fixedClock('2026-09-28T15:00:00+10:00'),
    profileName: (id) => id,
  });
  return { box, docs };
}

test('a report host shows its own arrangement over the shared library, and writes each back where it belongs', () => {
  assert.deepEqual(LIBRARY_KEYS, ['formats', 'sectionTemplates', 'reportTemplates', 'standardImages']);
  const { box, docs } = withReport({ order: ['controls'], formatId: 'house' });
  const h = docs.hostFor('r1');
  const st = h.getState().report;
  assert.deepEqual(st.order, ['controls']);
  assert.equal(st.formats[0].id, 'house', 'the library is there to use');
  assert.deepEqual(h.heading, { title: 'Customer pack', tag: 'In-Progress' });
  h.commit((s) => { s.report.order = ['hazards']; s.report.formats.push({ id: 'new', name: 'New', page: { margins: {} }, text: {} }); });
  assert.deepEqual(box.data.records.report.r1.design.order, ['hazards']);
  assert.equal(box.data.records.report.r1.design.formats, undefined, 'the library is not copied into the report');
  assert.deepEqual(box.data.reportDesign.order, ['hazards', 'controls'], 'the shared arrangement is untouched');
  assert.deepEqual(box.data.reportDesign.formats.map((f) => f.id), ['house', 'new'], 'a Style made in a report joins the shared Styles');
  assert.deepEqual(docs.host.heading, { title: 'Default for new reports' });
});

test('a report with no design of its own opens on a copy of the shared one', () => {
  const { box, docs } = withReport({});
  box.data = { ...box.data, records: { ...box.data.records, report: { ...box.data.records.report, r1: { ...box.data.records.report.r1, design: undefined, stage: undefined } } } };
  const h = docs.hostFor('r1');
  assert.deepEqual(h.getState().report.order, ['hazards', 'controls']);
  assert.equal(h.heading.tag, 'For Review');
});

test('a new report\'s design: the shared arrangement, or a template applied to it', () => {
  const { box, docs } = withReport({});
  box.data = setReportDesign(box.data, { ...box.data.reportDesign, reportTemplates: [{ id: 'rpt1', name: 'Pack', order: ['controls'], sections: [] }] });
  const shared = docs.newDesign('');
  assert.deepEqual(shared.design.order, ['hazards', 'controls']);
  assert.equal(shared.design.formats, undefined);
  const fromT = docs.newDesign('rpt1');
  assert.deepEqual(fromT.design.order, ['controls']);
  assert.ok(Array.isArray(fromT.library.reportTemplates));
});

test('the report host remembers the platform chosen for it', () => {
  const { box, docs } = withReport({});
  docs.hostFor('r1').rememberSubject('p2');
  assert.equal(box.data.records.report.r1.platformId, 'p2');
});

test('producing a report keeps the designer on that report\'s host', () => {
  const { docs } = withReport({ order: ['hazards'] });
  const { report } = docs.produce('p1', { at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'Customer pack', reportId: 'r1' });
  assert.ok(report.document);
  assert.deepEqual(App.docHost.get().heading, { title: 'Customer pack', tag: 'In-Progress' });
});

test('images in a report\'s own design are in use', () => {
  const data = { reportDesign: {}, records: { report: { r1: { status: 'live', design: { sections: [{ parts: [{ kind: 'image', images: [{ source: 'report', file: 'x.png' }] }] }] } } } } };
  assert.deepEqual([...imagesInUse(data)], ['x.png']);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/reports/docgen-host.test.js test/docgen/designer-panes.test.js`
Expected: FAIL — `LIBRARY_KEYS` / `applyReportTemplate` missing.

- [ ] **Step 3: Implement in the designer**

Replace the body of `useReportTemplate`'s `commit` with a call to a new pure function placed just above it:

```js
    /** RPT-T: what applying a report template does to a design bag (pure: a new bag). */
    function applyReportTemplate(bag0, t) {
      var b = JSON.parse(JSON.stringify(bag0 || {}));
      b.order = (t.order || []).slice();
      ['levels', 'centred', 'meta', 'names', 'headings', 'intros', 'introNumbered', 'tableStyles', 'tableWidths',
        'tables', 'pageBreak', 'noToc', 'space'].forEach(function (k) { b[k] = JSON.parse(JSON.stringify(t[k] || {})); });
      b.sections = JSON.parse(JSON.stringify(t.sections || []));
      if (!b.order.length) delete b.order;
      if (!b.sections.length) delete b.sections;
      ['levels', 'centred', 'meta', 'names', 'headings', 'intros', 'introNumbered', 'tableStyles', 'tableWidths',
        'tables', 'pageBreak', 'noToc', 'space'].forEach(function (k) { if (!Object.keys(b[k]).length) delete b[k]; });
      if (t.format) {
        var f = App.docFormat.normalise(t.format);
        delete f.builtin;
        if (f.id === 'standard') { f.id = nextId('fmt', b.formats || []); f.name = t.name + ' formatting'; }
        b.formats = (b.formats || []).filter(function (x) { return x.id !== f.id; }).concat([f]);
        b.formatId = f.id;
      }
      return b;
    }
```

and `useReportTemplate`'s commit becomes:

```js
      App.docHost.get().commit(function (p) { p.report = applyReportTemplate(bag(p), t); });
```

Export it: add `applyReportTemplate: applyReportTemplate,` to `App.docStore`.

In `wireShell`'s subject handler (`dom.on(ctx.root, 'change', '[data-rd-subject]', …)`), before `dirty(); repaint();` add `if (H().rememberSubject) H().rememberSubject(el.value);` (use the name the wiring scope has for the host getter — `App.docHost.get()` if `H` is not in scope there).

- [ ] **Step 4: Implement in `src/reports/docgen-host.js`**

Add after the imports:

```js
/** The parts of the design every report shares: Styles, templates and Standard Images. */
export const LIBRARY_KEYS = Object.freeze(['formats', 'sectionTemplates', 'reportTemplates', 'standardImages']);
const STAGE_LABEL = /** @type {Record<string, string>} */ ({ 'in-progress': 'In-Progress', 'for-review': 'For Review' });
/** @param {Record<string, any>} d */
const libraryOf = (d) => Object.fromEntries(LIBRARY_KEYS.filter((k) => d?.[k] !== undefined).map((k) => [k, structuredClone(d[k])]));
/** @param {Record<string, any>} d */
const arrangementOf = (d) => Object.fromEntries(Object.entries(structuredClone(d ?? {})).filter(([k]) => !LIBRARY_KEYS.includes(k)));
```

Extend the ctx JSDoc with `setReportDesign?: (id: string, design: Record<string, any>, platformId?: string | null) => void`.

Add `heading: { title: 'Default for new reports' },` to the shared `host`.

Inside `createDocHost`, after `host`, add:

```js
  /** @type {Map<string, any>} one host per report, so the designer keeps its place */
  const reportHosts = new Map();
  /** A host for one report: its own arrangement laid over the shared library. @param {string} id */
  const hostFor = (id) => {
    if (reportHosts.has(id)) return reportHosts.get(id);
    const rec = () => ctx.getData().records.report[id];
    const own = () => { const r = rec(); return r?.design ? structuredClone(r.design) : arrangementOf(ctx.getData().reportDesign); };
    const h = {
      ...host,
      get heading() { const r = rec(); return { title: r?.title ?? '', tag: STAGE_LABEL[r?.stage === 'in-progress' ? 'in-progress' : 'for-review'] }; },
      getState: () => ({ report: { ...libraryOf(ctx.getData().reportDesign), ...own() } }),
      /** @param {(state: { report?: Record<string, any> }) => void} mutator */
      commit(mutator) {
        const state = { report: { ...libraryOf(ctx.getData().reportDesign), ...own() } };
        mutator(state);
        const next = state.report ?? {};
        const shared = ctx.getData().reportDesign;
        const lib = libraryOf(next);
        if (LIBRARY_KEYS.some((k) => JSON.stringify(shared?.[k]) !== JSON.stringify(lib[k]))) ctx.setDesign({ ...arrangementOf(shared), ...lib });
        ctx.setReportDesign?.(id, arrangementOf(next));
      },
      /** @param {string} platformId */
      rememberSubject(platformId) { ctx.setReportDesign?.(id, own(), platformId); },
    };
    reportHosts.set(id, h);
    return h;
  };
  /**
   * A new report's design, from the shared arrangement or a report template applied to it; and
   * the shared library after (a template may bring its Style with it).
   * @param {string} from '' for the shared design, else a report template's id
   */
  const newDesign = (from) => {
    const shared = structuredClone(ctx.getData().reportDesign ?? {});
    const t = from ? (shared.reportTemplates ?? []).find((/** @type {any} */ x) => x.id === from) : null;
    const applied = t ? App.docStore.applyReportTemplate(shared, t) : shared;
    return { design: arrangementOf(applied), library: libraryOf(applied) };
  };
```

Change `produce` to take `reportId` and use the report host when given:

```js
    produce(platformId, { at, by, title, reportId }) {
      const h = reportId ? hostFor(reportId) : host;
      App.docHost.set(h);
      const options = App.docSession.options();
```

and pass `h` instead of `host` to `App.docGen.documentFor(…)`. Return `hostFor, newDesign` from `createDocHost` alongside `host` and `produce`.

In `imagesInUse`, after the produced-reports loop's `for (const r of Object.values(...))` header, add (inside it, before the blocks loop):

```js
    if (r?.status !== 'deleted' && r?.design) for (const s of r.design.sections ?? []) visit(s.parts);
```

- [ ] **Step 5: Run the tests, typecheck, build**

Run: `node --test test/reports/*.test.js test/docgen/*.test.js && node DocGen/doc-designer.test.js && npm run typecheck && npm run build`
Expected: PASS; build OK.

- [ ] **Step 6: Commit**

```bash
git add DocGen/doc-designer.js src/reports/docgen-host.js test/reports/docgen-host.test.js test/docgen/designer-panes.test.js
git commit -m "Report host: a host for one report (its arrangement over the shared library), new designs from the shared design or a template, report designs keep their images

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Controller — start, open, make onto the report

**Files:**
- Modify: `src/ui/controller.js`
- Test: `test/ui/controller-report-design.test.js` (new)

**Interfaces:**
- Consumes: Tasks 1 and 3.
- Produces:
  - state `designerReportId: string | null` (in `TOUR_KEPT`'s neighbour list of page state only if the tutorial must set it aside — it need not; leave `TOUR_KEPT` alone).
  - actions `startReport({ title, from })`, `openReportDesigner({ id })`; `openDesigner()` clears `designerReportId`; `generateFromDesigner({ format })` makes onto `designerReportId` when set (else as now).
  - `startReport` and `openReportDesigner` are added to `TOUR_OFF`.

- [ ] **Step 1: Write the failing tests** (`test/ui/controller-report-design.test.js`; reuse the setup from `test/ui/controller-report-images.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { App as DocGen } from '../../DocGen/doc-designer.js';

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
  return { f, c, go };
}
const reports = (c) => Object.values(c.getState().session.working.records.report).filter((r) => r.status !== 'deleted');

test('starting a report adds it In-Progress with a copy of the shared design and opens the designer on it', async () => {
  const { c, go } = await setup();
  await go({ type: 'openDesigner' });
  DocGen.docHost.get().commit((s) => { s.report = { ...s.report, levels: { hazards: 2 } }; });
  await go({ type: 'startReport', title: 'Customer pack', from: '' });
  const [r] = reports(c);
  assert.deepEqual([r.title, r.stage, r.design.levels], ['Customer pack', 'in-progress', { hazards: 2 }]);
  assert.equal(c.getState().designerReportId, r.id);
  assert.equal(DocGen.docHost.get().heading.title, 'Customer pack');
  assert.ok(DocGen.ui.views.reportDesign.isOpen());
});

test('making from the designer puts the document on the open report and sets For Review; an edit sets In-Progress again', async () => {
  const { c, go, f } = await setup();
  await go({ type: 'startReport', title: 'Customer pack', from: '' });
  await go({ type: 'generateFromDesigner', format: 'pdf' });
  let [r] = reports(c);
  assert.equal(reports(c).length, 1, 'no second report');
  assert.deepEqual([r.stage, r.platformId, r.title], ['for-review', 'p1', 'Customer pack']);
  assert.ok(r.document);
  assert.ok(f.list().some((p) => p.endsWith('.pdf')));
  DocGen.docHost.get().commit((s) => { s.report = { ...s.report, levels: { hazards: 3 } }; });
  [r] = reports(c);
  assert.equal(r.stage, 'in-progress');
  assert.equal(c.getState().session.working.reportDesign.levels, undefined, 'the shared design is untouched');
});

test('opening a report from the list puts the designer on it without changing its stage; the plain button opens the shared design', async () => {
  const { c, go } = await setup();
  await go({ type: 'startReport', title: 'A', from: '' });
  await go({ type: 'generateFromDesigner', format: 'html' });
  const [r] = reports(c);
  await go({ type: 'openDesigner' });
  assert.equal(c.getState().designerReportId, null);
  assert.equal(DocGen.docHost.get().heading.title, 'Default for new reports');
  await go({ type: 'openReportDesigner', id: r.id });
  assert.equal(DocGen.docHost.get().heading.title, 'A');
  assert.equal(reports(c)[0].stage, 'for-review');
  assert.equal(DocGen.docSession.selectedSubjectId(), 'p1', 'the report\'s platform is chosen again');
});

test('a blank name starts nothing', async () => {
  const { c } = await setup();
  await c.dispatch({ type: 'startReport', title: '   ', from: '' });
  assert.equal(c.getState().message?.kind, 'error');
  assert.equal(reports(c).length, 0);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/ui/controller-report-design.test.js`
Expected: FAIL — unknown action `startReport`.

- [ ] **Step 3: Implement**

a) Imports: add `startReport as startReportOp, setOwnReportDesign, makeReport` to the import from `../core/ops/reports.js` (it already imports `createReport, deleteReport`; check the exact line).

b) Initial state: add `designerReportId: null,` beside `lastReportId: null`.

c) `createDocHost({ … })`: add

```js
    setReportDesign: (id, design, platformId) => {
      if (!state.session) return;
      const working = setOwnReportDesign(state.session.working, act(), { id, design, platformId });
      if (working !== state.session.working) {
        set({ session: { ...state.session, working } });
        void afterChange();
      }
    },
```

(`act()` is the controller's act helper — confirm its name with `grep -n "const act = \|function act(" src/ui/controller.js`.)

d) `TOUR_OFF`: add `'startReport', 'openReportDesigner'`.

e) Handlers, beside `openDesigner`:

```js
    async openDesigner() {
      if (!state.session) throw new PivotError('no-data', 'Open the data before designing reports.');
      DocGen.docHost.set(docs.host);
      DocGen.ui.views.reportDesign.open();
      set({ designerReportId: null, designerRevision: state.designerRevision + 1 });
    },
    // A new report: a name, its own copy of the shared design or of a report template, In-Progress; the designer opens on it.
    async startReport({ title, from }) {
      if (!state.session) throw new PivotError('no-data', 'Open the data before making a report.');
      const name = String(title ?? '').trim();
      if (!name) throw new PivotError('report.name', 'Give the report a name.');
      const { design, library } = docs.newDesign(String(from ?? ''));
      let working = state.session.working;
      if (JSON.stringify(library) !== JSON.stringify(Object.fromEntries(Object.entries(working.reportDesign).filter(([k]) => k in library)))) {
        working = setReportDesign(working, { ...working.reportDesign, ...library });
      }
      const id = newId();
      working = startReportOp(working, act(), { id, title: name, design });
      set({ session: { ...state.session, working } });
      await afterChange();
      await handlers.openReportDesigner({ id });
    },
    async openReportDesigner({ id }) {
      const r = state.session?.working.records.report[id];
      if (!r || r.status === 'deleted') throw new PivotError('not-found', 'That report no longer exists.');
      const h = docs.hostFor(id);
      DocGen.docHost.set(h);
      if (r.platformId) DocGen.docSession.set({ subjectId: r.platformId });
      DocGen.ui.views.reportDesign.open();
      set({ designerReportId: id, designerRevision: state.designerRevision + 1 });
    },
```

f) `generateFromDesigner`: when a report is open, make onto it:

```js
    async generateFromDesigner({ format }) {
      const platformId = DocGen.docSession.selectedSubjectId();
      if (!platformId) throw new PivotError('not-found', 'Choose a platform in the designer first.');
      const id = state.designerReportId;
      if (!id) {
        await handlers.produceReport({ platformId });
      } else {
        if (!state.session) throw new PivotError('no-data', 'There is no data to report on.');
        if (hasUnsavedRecords(state.session)) throw new PivotError('report.unsaved', 'Save your changes before making a report, so the report matches what is stored.');
        const r = state.session.working.records.report[id];
        const at = env.clock.now();
        const { report } = docs.produce(platformId, { at, by: /** @type {string} */ (state.profileId), title: r.title, reportId: id });
        const working = makeReport(state.session.working, act(), { id, report });
        set({ session: { ...state.session, working }, lastReportId: id, message: { kind: 'info', text: `${r.title} made. Save to keep it.` } });
        await afterChange();
      }
      if (state.message?.kind === 'error') return;
      await handlers.downloadReport({ id: state.lastReportId, format });
    },
```

(`report` from `produce` carries the snapshot fields — `platformId`, `platformName`, `producedAt`, `producedBy`, `classification`, `rows`, … — plus `document` and `style`; `makeReport` drops any `title`/`design` in it so the report keeps its own.)

- [ ] **Step 4: Run the tests**

Run: `node --test test/ui/controller-report-design.test.js test/ui/controller*.test.js && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/controller.js test/ui/controller-report-design.test.js
git commit -m "Reports: start a report from a name and a starting point, open one in the designer, make it onto itself

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Reports tab — name row, Status, downloads when made, Open icon

**Files:**
- Modify: `src/ui/screens/reports.js`, `src/ui/styles.css`
- Test: `test/ui/render.test.js`

**Interfaces:**
- Consumes: `stageOf` (Task 1); actions `startReport`, `openReportDesigner` (Task 4).
- Produces: `<form data-action="startReport" class="report-start">` with `name="title"` (required) and `<select name="from">`; Status column (key `stage`); Open column with `data-action="openReportDesigner" data-id=…` and `title="Open in Report Designer"` / `aria-label="Open in Report Designer"`.

- [ ] **Step 1: Write the failing test** (append to `test/ui/render.test.js`; it already imports `createReport`, `reportsView`, `main`, `act`, `seed`, `assignHazardNumbers`)

```js
import { startReport } from '../../src/core/ops/reports.js';
import { setReportDesign } from '../../src/core/ops/reports.js';

test('the reports view: a name and a starting point open a new report; Status; downloads once made; an Open icon on every row', () => {
  let d = setReportDesign(assignHazardNumbers(seed()), { reportTemplates: [{ id: 'rpt1', name: 'Customer pack' }] });
  d = createReport(d, act, { id: 'r0', report: { platformId: 'p1', platformName: 'Alpha', producedAt: '2026-09-28T15:00:00+10:00', producedBy: 'u1', title: 'Made', classification: '', document: { blocks: [] }, style: {} } });
  d = startReport(d, act, { id: 'r1', title: 'Draft one', design: {} });
  const h = reportsView(main(d), d).toString();
  assert.match(h, /<form data-action="startReport" class="report-start">[\s\S]*?<input name="title" required[^>]*placeholder="Report name"[\s\S]*?<select name="from"[^>]*><option value="">The shared design<\/option><option value="rpt1">Customer pack<\/option><\/select>[\s\S]*?<button type="submit" class="primary">Open in Report Designer<\/button><\/form>/);
  assert.match(h, /<th[^>]*>[\s\S]*?Status/);
  assert.match(h, /data-id="r1"[\s\S]*?In-Progress|In-Progress[\s\S]*?data-id="r1"/);
  assert.match(h, /For Review/);
  assert.doesNotMatch(h, /data-action="downloadReport" data-id="r1"/, 'nothing to download before it is made');
  assert.match(h, /data-action="downloadReport" data-id="r0" data-format="pdf"/);
  for (const id of ['r0', 'r1']) assert.match(h, new RegExp(`data-action="openReportDesigner" data-id="${id}"[^>]*title="Open in Report Designer"[^>]*aria-label="Open in Report Designer"`));
});
```

(If `setReportDesign` is already imported in that file, drop the duplicate import line.)

- [ ] **Step 2: Run to see it fail**

Run: `node --test test/ui/render.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** in `src/ui/screens/reports.js`

Import `stageOf` from `../../core/ops/reports.js`. Replace the intro paragraph and add the form before `<section><h2>Produced reports</h2>`:

```js
  const templates = data.reportDesign?.reportTemplates ?? [];
  const start = html`<form data-action="startReport" class="report-start">
      <label>Report name <input name="title" required placeholder="Report name" aria-label="Report name"></label>
      <label>Start from <select name="from" aria-label="Start from"><option value="">The shared design</option>${templates.map((t) => html`<option value="${t.id}">${t.name}</option>`)}</select></label>
      <button type="submit" class="primary">Open in Report Designer</button></form>`;
```

Head and intro:

```js
  return html`<div class="head"><h1>Reports</h1><button type="button" ${dataAttrs({ action: 'openDesigner' })} title="The design new reports start from">Open the report designer</button></div>
    <p class="muted">Each report has its own copy of a design. The report designer button edits the default for new reports.</p>
    ${start}
    ${unsaved ? …unchanged… }
```

Columns: Produced renders `r.producedAt ? when(r.producedAt) : '—'`; Platform `r.platformName || '—'`; after Title add

```js
          { key: 'stage', label: 'Status', width: 120, value: (r) => stageOf(r),
            render: (r) => (stageOf(r) === 'in-progress' ? html`<span class="tag stage-progress">In-Progress</span>` : html`<span class="tag stage-review">For Review</span>`) },
```

Download renders only when made:

```js
          { key: 'download', label: 'Download', width: 150, sortable: false, render: (r) => (r.document || r.html ? html`<div class="actions">
            ${r.document ? html`<button type="button" ${dataAttrs({ action: 'downloadReport', id: r.id, format: 'pdf' })}>PDF</button>` : ''}
            <button type="button" ${dataAttrs({ action: 'downloadReport', id: r.id, format: 'html' })}>HTML</button></div>` : '') },
          { key: 'open', label: '', width: 48, sortable: false, render: (r) => html`<button type="button" class="icon-btn" ${dataAttrs({ action: 'openReportDesigner', id: r.id })} title="Open in Report Designer" aria-label="Open in Report Designer">✎</button>` },
```

The delete text uses `r.platformName` and `when(r.producedAt)`; for a report never made make it read `The report "${r.title}" will be deleted for everyone using this folder.` when `!r.producedAt`.

CSS (`src/ui/styles.css`, near other `.tag` rules — find with `grep -n "\.tag\b" src/ui/styles.css | head`):

```css
.report-start { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: end; margin: 8px 0 16px; }
.report-start label { display: flex; flex-direction: column; gap: 4px; }
.report-start input { min-width: 260px; }
.tag.stage-progress { background: var(--c-warn-bg); color: var(--c-text); }
.tag.stage-review { background: var(--c-badge-bg); color: var(--c-text); }
.icon-btn { padding: 2px 8px; line-height: 1.2; }
```

Use only tokens that exist in `src/ui/styles.css` (check with `grep -o "var(--c-[a-z-]*" src/ui/styles.css | sort -u`); sharp corners (no radius). If `.icon-btn` already exists, reuse it and leave this rule out.

- [ ] **Step 4: Run the tests and build**

Run: `node --test test/ui/*.test.js && npm run build`
Expected: PASS (if the existing reports-view test asserts the old intro wording, update that one assertion to the new line).

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/reports.js src/ui/styles.css test/ui/render.test.js
git commit -m "Reports tab: name a report and open it in the designer, a Status column, downloads once made, an Open in Report Designer icon

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The designer's header — the report's name and stage, and the app's Save button

**Files:**
- Modify: `DocGen/doc-designer.js` (header), `DocGen/doc-designer.css`
- Modify: `src/ui/screens/common.js` (export `saveButton(state)`), `src/ui/mount.js`
- Test: `test/docgen/designer-panes.test.js`, `test/ui/render.test.js`

**Interfaces:**
- Produces:
  - `saveButton(state) → Raw` exported from `common.js` (the top bar uses it).
  - Designer header: `<h3>` = `H().heading.title` (or "Report Design" when the host has none), a `<span class="tag rd-stage">` with `H().heading.tag` when present, and `<span class="rd-save-slot" data-rd-save-slot>` holding `_ctx.saveButton()` when the ctx has one.
  - mount: `RD.wire({ …, saveButton: () => saveButton(controller.getState()).toString() })`; after each app paint, fill `[data-rd-save-slot]`; a click on `[data-action="save"]` inside the designer dispatches `save`.

- [ ] **Step 1: Write the failing tests**

Append to `test/docgen/designer-panes.test.js`:

```js
test('the designer\'s header names what is open and has room for the app\'s Save button', () => {
  const h = host();
  h.heading = { title: 'Customer pack', tag: 'In-Progress' };
  let html = paneOf(h, 'section');
  assert.match(html, /<h3>Customer pack<\/h3><span class="tag rd-stage">In-Progress<\/span>/);
  assert.match(html, /<span class="rd-save-slot" data-rd-save-slot><\/span><button type="button" class="modal-close"/);
  h.heading = { title: 'Default for new reports' };
  html = paneOf(h, 'section');
  assert.match(html, /<h3>Default for new reports<\/h3>/);
  assert.doesNotMatch(html, /rd-stage/);
  delete h.heading;
  assert.match(paneOf(h, 'section'), /<h3>Report Design<\/h3>/);
});
```

Append to `test/ui/render.test.js`:

```js
import { saveButton } from '../../src/ui/screens/common.js';

test('the Save button on its own: Unsaved, Saving…, Saved', () => {
  const d = assignHazardNumbers(seed());
  assert.match(saveButton(main(d)).toString(), /class="save saved"[^>]*>Saved</);
  assert.match(saveButton({ ...main(d), saving: true }).toString(), /class="save saving"[^>]*disabled>Saving…</);
  assert.match(saveButton({ ...main(d), session: { base: emptyData(), working: d, loadedStamp: null } }).toString(), /class="save unsaved"[^>]*>Unsaved</);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/docgen/designer-panes.test.js test/ui/render.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

`common.js`: move the three-way `save` expression in `shell` into

```js
/** The one button that says where things stand: Unsaved (click to save), Saving… with a bar, or Saved. @param {any} state */
export function saveButton(state) {
  const unsaved = state.session ? hasUnsaved(state.session) : false;
  return state.saving
    ? html`<button type="button" class="save saving" ${dataAttrs({ action: 'save' })} disabled>Saving…</button>`
    : unsaved
      ? html`<button type="button" class="save unsaved" ${dataAttrs({ action: 'save' })} title="You have unsaved changes: click to save">Unsaved</button>`
      : html`<button type="button" class="save saved" ${dataAttrs({ action: 'save' })} title="Everything is saved">Saved</button>`;
}
```

and in `shell` use `const save = saveButton(state);` (remove the now-unused local `unsaved` if nothing else in `shell` uses it).

Designer header (`<h3>Report Design</h3>` line ~5013):

```js
      var hd = (H() && H().heading) || null;
      var save = _ctx && typeof _ctx.saveButton === 'function' ? _ctx.saveButton() : '';
      return '<div class="modal modal-full" role="dialog" aria-modal="true" aria-label="' + esc(hd ? hd.title : 'Report Design') + '">' +
        '<div class="modal-head"><div><h3>' + esc(hd ? hd.title : 'Report Design') + '</h3>' +
          (hd && hd.tag ? '<span class="tag rd-stage">' + esc(hd.tag) + '</span>' : '') +
          '<div class="modal-sub">' + (subj ? subjectPicker(selId) : 'No ' + esc(noun()) + ' selected.') + '</div></div>' +
          '<span class="rd-save-slot" data-rd-save-slot>' + save + '</span>' +
          '<button type="button" class="modal-close" data-rd-close aria-label="Close">×</button></div>' +
```

(`H()` is the designer UI's host getter; if the header function is outside its scope, use `App.docHost.get()`.)

CSS (`DocGen/doc-designer.css`): `.docgen .rd-save-slot { margin-left: auto; margin-right: 8px; display: flex; align-items: center;}` and `.docgen .rd-stage { margin-left: 8px; vertical-align: middle;}`. Check the `.modal-head` layout (`grep -n "modal-head" src/ui/styles.css DocGen/doc-designer.css`) and adjust so the slot sits just left of ×.

`mount.js`: import `saveButton` from `./screens/common.js`; change the `RD.wire({ … })` call to add `saveButton: () => saveButton(controller.getState()).toString()`; at the end of `paint` (after the designer block) add

```js
    const slot = designerEl.querySelector('[data-rd-save-slot]');
    if (slot) slot.innerHTML = saveButton(state).toString();
```

and in the existing `designerEl.addEventListener('click', …)` handler, before its `[data-generate-action]` lookup:

```js
    const s = /** @type {HTMLElement} */ (e.target).closest('[data-action="save"]');
    if (s) { void controller.dispatch({ type: 'save' }); return; }
```

- [ ] **Step 4: Run the tests, typecheck, build**

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)|passed," && npm run typecheck && npm run build`
Expected: `fail 0`; `OK 45 passed`; build OK.

- [ ] **Step 5: Commit**

```bash
git add DocGen/doc-designer.js DocGen/doc-designer.css src/ui/screens/common.js src/ui/mount.js test/docgen/designer-panes.test.js test/ui/render.test.js
git commit -m "Report designer: the header names the report and its status, and has the app's Save button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Browser walkthrough

- [ ] **Step 1:** `npm run build`; seed (`seed-pdf.mjs`) and serve `dist/` on 8765 as in earlier walkthroughs.
- [ ] **Step 2:** In Playwright:
  1. Reports tab: type "Customer pack", Start from "The shared design", Open in Report Designer → the designer shows "Customer pack" with In-Progress, and Save shows Unsaved.
  2. Change a heading; press the designer's Save → Saved; close → the list shows Customer pack, In-Progress, no downloads, ✎ with its tooltip.
  3. Reopen with ✎; Generate → Make PDF → the list shows For Review and PDF/HTML.
  4. Reopen, change something → In-Progress again; the shared design ("Open the report designer") is unchanged and its header reads "Default for new reports".
  5. Start a second report from a saved report template; check it has the template's order.
  6. An old report (from the seed's earlier production) opens with ✎ and stays For Review.
  7. Both themes; no page errors.
- [ ] **Step 3:** Any defect: failing test, fix, suite, commit.
