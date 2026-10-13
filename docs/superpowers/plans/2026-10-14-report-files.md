# Report Design Files and the Default Report Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each report's design is stored in `files/reports/<id>.json` (not in `data.json`); new reports start from a fixed, built-in Default Report Template; the old shared arrangement is gone.

**Architecture:** In memory nothing changes (`record.design`). The storage layer attaches designs on read and writes them out on save and restore; backups carry them inline. The doc host's empty design (`{}`) is the Default Report Template. A throwaway script converts the practice folder to schema 7.

**Tech Stack:** ES modules, node:test with the MemoryFolder fake, Playwright walkthrough.

**Spec:** `docs/superpowers/specs/2026-10-14-report-files-default-template-design.md`

## Global Constraints

- Design file: `files/reports/<report id>.json`, contents `{ "format": "pivot-report-design", "version": 1, "reportId": "<id>", "design": {…} }`, `JSON.stringify(…, null, 2)`.
- `data.json` never holds a report's `design`; backups do (inline).
- Design files are written after the save's "has anyone saved meanwhile" check and before `data.json`.
- `SCHEMA_VERSION` 6 → 7; no in-app conversion.
- Labels: "Default Report Template", "Design missing", tooltip "Its design file is not in the folder; it opens on the Default Report Template".
- Build after every change; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Spec rulings carried into this plan

- **`produceReport` stays** as an internal action (no button): since the reports-own-design fixes it creates a report record with its own design and For Review, which already satisfies "every made report is a report record with its own design"; removing it would only churn tests and seed scripts. `openDesigner` (and the shared host's "Default for new reports" heading) go.

## Review Focus

1. **A save that retries** (someone saved between the two disk reads): design files must not be written for the abandoned attempt (Task 1 orders the writes after the stamp check; test "a save writes designs only once it is going ahead").
2. **A report deleted by someone else while I edited its design**: the merge keeps it deleted; my design file must not resurrect it (deleted records are not written; test).
3. **A design file that is not JSON or not ours**: loading must not fail the whole folder; that report counts as missing (test).
4. **Restoring an old backup without designs** (pre-change backups are schema 6 and refused; a schema-7 backup always carries them) — restore must not delete existing design files for reports the backup lacks (test).
5. **The browser copy after a save**: `r.data` returned by save keeps designs in memory, so the mirror and the designer still have them (test asserts `r.data.records.report.r1.design`).

---

### Task 1: The store reads and writes report design files

**Files:**
- Modify: `src/storage/store.js`, `src/core/data.js`
- Test: `test/storage/report-designs.test.js` (new)

**Interfaces:**
- Produces (from `store.js`): `REPORTS_DIR = 'files/reports'`, `designPath(id)`; `readDisk(handle, { designs = true } = {})` attaches designs; `load(handle) → { data, stamp, missingDesigns: string[] }`; `save` writes design files then `data.json` without designs, and returns `data` with designs; `restore` writes design files then `data.json` without designs.

- [ ] **Step 1: Write the failing tests** (`test/storage/report-designs.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { load, save, restore, backupIfDue, readBackup, listBackups, FILES } from '../../src/storage/store.js';
import { openEnvelope } from '../../src/storage/envelope.js';
import { fixedClock } from '../../src/core/time.js';
import { startReport, setOwnReportDesign, deleteReport } from '../../src/core/ops/reports.js';
import { SCHEMA_VERSION } from '../../src/core/data.js';

const clock = () => fixedClock('2026-10-14T10:00:00+10:00');
const act = { by: 'a', at: '2026-10-14T10:00:00+10:00' };
const open = async (f) => { const { data, stamp, missingDesigns } = await load(f.handle); return { s: { base: data, working: data, loadedStamp: stamp }, missingDesigns }; };
const after = (r) => ({ base: r.data, working: r.data, loadedStamp: r.stamp });
const design = { order: ['hazards'], levels: { hazards: 2 } };
const diskBody = async (f) => (await openEnvelope(f.read(FILES.data), 'data')).envelope.body;

test('the schema is 7', () => { assert.equal(SCHEMA_VERSION, 7); });

test('a save writes each report\'s design to its own file and keeps it out of data.json', async () => {
  const f = new MemoryFolder();
  const { s } = await open(f);
  s.working = startReport(s.working, act, { id: 'r1', title: 'Pack', design });
  const r = await save(f.handle, s, 'a', clock());
  const file = JSON.parse(f.read('files/reports/r1.json'));
  assert.deepEqual(file, { format: 'pivot-report-design', version: 1, reportId: 'r1', design });
  assert.equal((await diskBody(f)).records.report.r1.design, undefined);
  assert.deepEqual(r.data.records.report.r1.design, design, 'in memory the design stays with the report');
});

test('a load attaches each design, and lists a live report whose file is missing or unreadable', async () => {
  const f = new MemoryFolder();
  let { s } = await open(f);
  s.working = startReport(s.working, act, { id: 'r1', title: 'One', design });
  s.working = startReport(s.working, act, { id: 'r2', title: 'Two', design });
  s.working = startReport(s.working, act, { id: 'r3', title: 'Three', design });
  await save(f.handle, s, 'a', clock());
  f.write('files/reports/r2.json', 'not json');
  const at = f.locate('files/reports/r3.json', false); at.dir.entries.delete(at.name);
  const back = await open(f);
  assert.deepEqual(back.s.base.records.report.r1.design, design);
  assert.equal(back.s.base.records.report.r2.design, undefined);
  assert.deepEqual(back.missingDesigns.sort(), ['r2', 'r3']);
});

test('only changed designs are written; a deleted report\'s file is left alone and not rewritten', async () => {
  const f = new MemoryFolder();
  let { s } = await open(f);
  s.working = startReport(s.working, act, { id: 'r1', title: 'One', design });
  s.working = startReport(s.working, act, { id: 'r2', title: 'Two', design });
  let r = await save(f.handle, s, 'a', clock());
  const r2Node = () => { const at = f.locate('files/reports/r2.json', false); return at.dir.entries.get(at.name); };
  const before = r2Node();
  s = after(r);
  s.working = setOwnReportDesign(s.working, act, { id: 'r1', design: { order: ['controls'] } });
  s.working = deleteReport(s.working, act, { id: 'r2' });
  r = await save(f.handle, s, 'a', clock());
  assert.deepEqual(JSON.parse(f.read('files/reports/r1.json')).design, { order: ['controls'] });
  assert.equal(r2Node(), before, 'the deleted report\'s file is untouched');
});

test('two people: designs of different reports both survive the merge', async () => {
  const f = new MemoryFolder();
  let { s: a } = await open(f);
  a.working = startReport(a.working, act, { id: 'r1', title: 'One', design });
  a.working = startReport(a.working, act, { id: 'r2', title: 'Two', design });
  a = after(await save(f.handle, a, 'a', clock()));
  const { s: b0 } = await open(f);
  const b = { ...b0, working: setOwnReportDesign(b0.working, { by: 'b', at: act.at }, { id: 'r2', design: { order: ['b'] } }) };
  a.working = setOwnReportDesign(a.working, act, { id: 'r1', design: { order: ['a'] } });
  await save(f.handle, b, 'b', clock());
  const r = await save(f.handle, a, 'a', clock());
  assert.equal(r.merged, true);
  assert.deepEqual(JSON.parse(f.read('files/reports/r1.json')).design, { order: ['a'] });
  assert.deepEqual(JSON.parse(f.read('files/reports/r2.json')).design, { order: ['b'] });
});

test('a save writes designs only once it is going ahead', async () => {
  const f = new MemoryFolder();
  const { s } = await open(f);
  s.working = startReport(s.working, act, { id: 'r1', title: 'One', design });
  let calls = 0;
  const hooks = { beforeWrite: async () => { calls++; assert.equal(f.read('files/reports/r1.json'), null, 'nothing written before the final check'); } };
  await save(f.handle, s, 'a', clock(), hooks);
  assert.equal(calls, 1);
  assert.ok(f.read('files/reports/r1.json'));
});

test('a backup carries the designs; restoring it writes them back and leaves other design files alone', async () => {
  const f = new MemoryFolder();
  const { s } = await open(f);
  s.working = startReport(s.working, act, { id: 'r1', title: 'One', design });
  const r = await save(f.handle, s, 'a', clock());
  await backupIfDue(f.handle, r.data, clock());
  const [b] = await listBackups(f.handle);
  const data = await readBackup(f.handle, b.name);
  assert.deepEqual(data.records.report.r1.design, design);
  f.write('files/reports/r1.json', 'changed by hand');
  f.write('files/reports/other.json', JSON.stringify({ format: 'pivot-report-design', version: 1, reportId: 'other', design: {} }));
  await restore(f.handle, data, 'a', clock());
  assert.deepEqual(JSON.parse(f.read('files/reports/r1.json')).design, design);
  assert.ok(f.read('files/reports/other.json'));
  assert.equal((await diskBody(f)).records.report.r1.design, undefined);
});
```

`f.locate`, `f.write`, `f.read`, `f.list` are the MemoryFolder fake's own (see `test/fakes/folder.js:344–420`); `read` returns null for a missing file.

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/storage/report-designs.test.js`
Expected: FAIL (schema is 6; no design files).

- [ ] **Step 3: Implement**

`src/core/data.js`: `export const SCHEMA_VERSION = 7;`

`src/storage/store.js`, after `FILES`:

```js
/** Where each report's own design is kept: one file per report. */
export const REPORTS_DIR = `${FILES.files}/reports`;
/** @param {string} id */
export const designPath = (id) => `${REPORTS_DIR}/${id}.json`;
const DESIGN_FORMAT = 'pivot-report-design';

/** A design file's text, or null when it is not one. @param {string | null} text @param {string} id */
function designOf(text, id) {
  if (text === null) return null;
  try {
    const f = JSON.parse(text);
    return f && f.format === DESIGN_FORMAT && f.reportId === id && f.design && typeof f.design === 'object' ? f.design : null;
  } catch {
    return null;
  }
}

/**
 * Each live report's design, read from its own file. A report whose file is missing or is not
 * a design file comes back without one, and is named in `missing`.
 * @param {Dir} handle @param {Data} data
 */
async function withDesigns(handle, data) {
  const live = Object.values(data.records.report).filter((r) => r.status !== 'deleted');
  const read = await Promise.all(live.map(async (r) => [r.id, designOf(await readText(handle, designPath(r.id)).catch(() => null), r.id)]));
  /** @type {Record<string, any>} */
  const reports = { ...data.records.report };
  /** @type {string[]} */
  const missing = [];
  for (const [id, design] of read) {
    if (design) reports[id] = { ...reports[id], design };
    else { const { design: _d, ...rest } = reports[id]; reports[id] = rest; missing.push(/** @type {string} */ (id)); }
  }
  return { data: { ...data, records: { ...data.records, report: reports } }, missing };
}

/** The data as data.json holds it: no report carries its design. @param {Data} data */
function withoutDesigns(data) {
  /** @type {Record<string, any>} */
  const reports = {};
  for (const [id, r] of Object.entries(data.records.report)) { const { design: _d, ...rest } = r; reports[id] = rest; }
  return { ...data, records: { ...data.records, report: reports } };
}

/** Write each live report's design whose file differs from `onDisk`'s. @param {Dir} handle @param {Data} data @param {Data | null} onDisk */
async function writeDesigns(handle, data, onDisk) {
  for (const r of Object.values(data.records.report)) {
    if (r.status === 'deleted' || !r.design) continue;
    if (onDisk && sameJson(onDisk.records.report[r.id]?.design, r.design)) continue;
    await writeWhole(handle, designPath(r.id), JSON.stringify({ format: DESIGN_FORMAT, version: 1, reportId: r.id, design: r.design }, null, 2));
  }
}
```

(`sameJson` — import it from `../core/json.js` if `store.js` does not already.)

`readDisk`:

```js
/** @param {Dir} handle @param {{ designs?: boolean }} [o] @returns {Promise<{ text: string | null, data: Data, stamp: SaveStamp | null, missingDesigns: string[] }>} */
export async function readDisk(handle, o = {}) {
  const text = await readText(handle, FILES.data);
  if (text === null) return { text: null, data: emptyData(), stamp: null, missingDesigns: [] };
  const opened = await openData(text);
  if (o.designs === false) return { text, ...opened, missingDesigns: [] };
  const { data, missing } = await withDesigns(handle, opened.data);
  return { text, data, stamp: opened.stamp, missingDesigns: missing };
}

/** @param {Dir} handle */
export async function load(handle) {
  const { data, stamp, missingDesigns } = await readDisk(handle);
  return { data, stamp, missingDesigns };
}
```

`save`: serialize without designs; the stamp check reads without designs; write designs after the check, before `data.json`:

```js
    const text = serialize(await seal('data', withoutDesigns(merged), stamp, at));

    if (hooks.beforeWrite) await hooks.beforeWrite();
    const now = await readDisk(handle, { designs: false });
    if (!sameStamp(now.stamp, disk.stamp)) continue;

    // Each report's own design goes to its own file first: a failed write stops the save before data.json changes.
    await writeDesigns(handle, merged, disk.data);
```

(then the existing superseded and `data.json` writes; `return { data: merged, … }` unchanged.)

`restore`: before writing `data.json`, `await writeDesigns(handle, data, null);` and write `serialize(await seal('data', withoutDesigns(data), stamp, at))`.

`backupIfDue` is unchanged (it writes the in-memory data, designs included).

Check every other caller of `readDisk` (`grep -n "readDisk(" src -r`) still works with the extra field.

- [ ] **Step 4: Run the tests**

Run: `node --test test/storage/*.test.js test/ui/*.test.js && npm run typecheck`
Expected: PASS. Fixtures that write schema-6 envelopes by hand would now be refused — if any test builds a `data.json` with a literal `schemaVersion: 6`, switch it to `SCHEMA_VERSION`.

- [ ] **Step 5: Commit**

```bash
git add src/storage/store.js src/core/data.js test/storage/report-designs.test.js
git commit -m "Storage: each report's design in its own file (files/reports/<id>.json), attached on load, written on save and restore; backups carry them; schema 7

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The Default Report Template; no shared designer; missing designs in the state

**Files:**
- Modify: `src/reports/docgen-host.js`, `src/ui/controller.js`
- Test: `test/reports/docgen-host.test.js`, `test/ui/controller-report-design.test.js`, `test/ui/controller-report-images.test.js`, `test/ui/controller-reports.test.js`

**Interfaces:**
- `newDesign('') → { design: {}, library }`; `hostFor(id).getState()` without a design → library over `{}`; the shared host has no `heading`.
- Controller: no `openDesigner` action; state `missingDesigns: string[]` set on load (from `store.load`) and pruned after a save of ids whose report now has a design.

- [ ] **Step 1: Write the failing tests**

In `test/reports/docgen-host.test.js` add:

```js
test('the Default Report Template is the empty design, whatever the shared design once held', () => {
  const { box, docs } = withReport({});
  box.data = setReportDesign(box.data, { ...box.data.reportDesign, sections: [{ id: 'leftover', title: 'Test', parts: [] }], order: ['leftover'] });
  assert.deepEqual(docs.newDesign('').design, {});
  box.data = { ...box.data, records: { ...box.data.records, report: { ...box.data.records.report, r1: { ...box.data.records.report.r1, design: undefined } } } };
  const st = docs.hostFor('r1').getState().report;
  assert.equal(st.sections, undefined);
  assert.equal(st.order, undefined);
  assert.equal(st.formats[0].id, 'house', 'the library is still there');
  assert.equal(docs.host.heading, undefined);
});
```

and change the existing "a report with no design of its own opens on a copy of the shared one" test to expect `getState().report.order` to be `undefined` (rename it "a report with no design of its own opens on the Default Report Template"). In "a new report's design: the shared arrangement, or a template applied to it", expect `shared.design` to deep-equal `{}` and rename it accordingly. Remove the `docs.host.heading` assertion from the first report-host test.

In `test/ui/controller-report-design.test.js`:
- In "starting a report adds it In-Progress…" replace the `openDesigner` + shared `commit` lines with nothing and expect `r.design` to deep-equal `{}`.
- In "opening a report from the list…" drop the `openDesigner` part (the three lines asserting `designerReportId === null` and the 'Default for new reports' heading).
- In "making a report… an edit sets In-Progress again" drop the `reportDesign.levels` assertion.
- In "a report made from the shared design keeps that design…" rename to "a report made without opening one has its own (default) design and is For Review", replace `openDesigner` + commit with nothing, use `await go({ type: 'produceReport', platformId: 'p1' })` instead of `generateFromDesigner`, and expect `r.design` to deep-equal `{}`.
- Add:

```js
test('the shared designer is gone', async () => {
  const { c } = await setup();
  await c.dispatch({ type: 'openDesigner' });
  assert.equal(c.getState().message?.kind, 'error');
});

test('a report whose design file is missing is named in the state after loading', async () => {
  const { c, go, f } = await setup();
  await go({ type: 'startReport', title: 'A', from: '' });
  await go({ type: 'save' });
  const [r] = reports(c);
  const at = f.locate(`files/reports/${r.id}.json`, false); at.dir.entries.delete(at.name);
  await go({ type: 'recallFolder' });
  assert.deepEqual(c.getState().missingDesigns, [r.id]);
});
```

(Check how the controller reloads a folder: `grep -n "async recallFolder\|async chooseFolder\|async reload" src/ui/controller.js`; use the action that re-reads `data.json` from the same handle, and the setup's `go` helper.)

In `test/ui/controller-report-images.test.js` `setup`, replace `await go({ type: 'openDesigner' })` with `await go({ type: 'startReport', title: 'Pictures', from: '' })`; `designWith` then commits through the report host (`DocGen.docHost.get()` is the report's). In `test/ui/controller-reports.test.js:83` replace `openDesigner` likewise (read the test first and keep what it checks).

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/reports/docgen-host.test.js test/ui/controller-report*.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

`docgen-host.js`:
- Remove `heading: { title: 'Default for new reports' },` from the shared `host`.
- In `hostFor`, `own()` becomes `const r = rec(); return r?.design ? structuredClone(r.design) : {};` — the Default Report Template.
- In `newDesign`: `return { design: t ? arrangementOf(applied) : {}, library: libraryOf(applied) };` and update its JSDoc ("'' for the Default Report Template").

`controller.js`:
- Delete the `openDesigner` handler (and from `TOUR_OFF`/any list naming it; `grep -n "openDesigner" src -r`).
- Initial state: `missingDesigns: [],`.
- Where the folder is loaded (`const { data, stamp } = await store.load(…)` ~line 434): take `missingDesigns` too and `set({ missingDesigns })` with the session.
- After a successful save (`save()`), `set({ missingDesigns: state.missingDesigns.filter((id) => !working.records.report[id]?.design) })` alongside the session update.

- [ ] **Step 4: Run the tests**

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)|passed," && npm run typecheck && npm run build`
Expected: `fail 0`, `OK 45 passed`, build OK.

- [ ] **Step 5: Commit**

```bash
git add src/reports/docgen-host.js src/ui/controller.js test
git commit -m "Reports: new reports start from the fixed Default Report Template; the shared designer is gone; missing design files are known after loading

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The Reports tab — Default Report Template, Design missing

**Files:**
- Modify: `src/ui/screens/reports.js`, `src/ui/styles.css`
- Test: `test/ui/render.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('Start from offers the Default Report Template first; a report without its design file says so', () => {
  let d = setReportDesign(assignHazardNumbers(seed()), { reportTemplates: [{ id: 'rpt1', name: 'Customer pack' }] });
  d = startReport(d, act, { id: 'r1', title: 'Lost', design: {} });
  const h = reportsView({ ...main(d), missingDesigns: ['r1'] }, d).toString();
  assert.match(h, /<select name="from"[^>]*><option value="">Default Report Template<\/option><option value="rpt1">Customer pack<\/option>/);
  assert.doesNotMatch(h, /The shared design/);
  assert.match(h, /Lost <span class="tag tag-warn" title="Its design file is not in the folder; it opens on the Default Report Template">Design missing<\/span>/);
});
```

Update the earlier reports-view test's Start-from regex (`The shared design` → `Default Report Template`).

- [ ] **Step 2: Run to see it fail**

Run: `node --test test/ui/render.test.js` — Expected: FAIL.

- [ ] **Step 3: Implement** in `reports.js`: the first option reads `Default Report Template`; the Title column renders

```js
render: (r) => html`${r.title}${(state.missingDesigns ?? []).includes(r.id) ? html` <span class="tag tag-warn" title="Its design file is not in the folder; it opens on the Default Report Template">Design missing</span>` : ''}${…existing overdue tag…}`
```

(keep the existing Overdue tag after it).

- [ ] **Step 4: Run** `node --test test/ui/*.test.js && npm run build` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/reports.js test/ui/render.test.js
git commit -m "Reports tab: Start from the Default Report Template; a report without its design file says so

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Convert the practice data; browser walkthrough

- [ ] **Step 1:** Write the throwaway script `$SCRATCH/convert-v7.mjs` (scratchpad, not the repo):

```js
// Usage: node convert-v7.mjs <data folder>. Moves each report's design to files/reports/<id>.json,
// keeps only the library in reportDesign, and rewrites data.json at schema 7. Backs up first.
import fs from 'node:fs';
import path from 'node:path';
const root = '/workspaces/ProjectPivot2.0/';
const { seal, serialize } = await import(root + 'src/storage/envelope.js');
const dir = process.argv[2];
const file = path.join(dir, 'data.json');
const text = fs.readFileSync(file, 'utf8');
fs.writeFileSync(path.join(dir, 'data.v6.json'), text);
const env = JSON.parse(text);
if (env.schemaVersion !== 6) throw new Error(`expected schema 6, found ${env.schemaVersion}`);
const body = env.body;
fs.mkdirSync(path.join(dir, 'files', 'reports'), { recursive: true });
let moved = 0;
for (const [id, r] of Object.entries(body.records.report ?? {})) {
  if (!r.design) continue;
  fs.writeFileSync(path.join(dir, 'files', 'reports', `${id}.json`), JSON.stringify({ format: 'pivot-report-design', version: 1, reportId: id, design: r.design }, null, 2));
  delete r.design; moved++;
}
const LIB = ['formats', 'sectionTemplates', 'reportTemplates', 'standardImages'];
const dropped = Object.keys(body.reportDesign ?? {}).filter((k) => !LIB.includes(k));
body.reportDesign = Object.fromEntries(Object.entries(body.reportDesign ?? {}).filter(([k]) => LIB.includes(k)));
fs.writeFileSync(file, serialize(await seal('data', body, env.stamp, env.writtenAt)));
console.log(`moved ${moved} design(s); dropped from the shared design: ${dropped.join(', ') || 'nothing'}`);
```

Check `seal`'s signature and `serialize` in `src/storage/envelope.js` first and adjust the call.

- [ ] **Step 2:** Run it on a copy first (`cp -r ConversionFiles $SCRATCH/cf-test && node convert-v7.mjs $SCRATCH/cf-test`), load the copy in the browser (OPFS as in earlier walkthroughs), confirm the data opens; then run it on `ConversionFiles` itself and report what it moved and dropped.
- [ ] **Step 3:** Browser walkthrough on the seeded folder: New report from the Default Report Template shows no test section; edit and Save → `files/reports/<id>.json` appears; reload → design back; delete the file, reload → "Design missing" and the report opens on the default; both themes; no page errors.
- [ ] **Step 4:** Commit any fixes (failing test first).
