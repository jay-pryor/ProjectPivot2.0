/**
 * views conformance: errors of the bow-tie, reports, the filter, the dashboard, and the open
 * items (CORE-CON-002). Every section 4 row of C-039 to C-048 (SL-08, SL-09, SL-11) of
 * modules/views/CONTRACT.md the suite can reach, with C-008. An export that did not happen
 * leaves the file the user chose as it was (store C-020), and a standing or a flag that could
 * not be read is null, never empty. Written from the contract before any implementation (P8).
 * The null double must fail this file (CORE-TST-002, rung 1).
 *
 * The bow-tie rows for a hazard `bowtie` omits or a record it cannot read are not reached: the
 * assessment screen is reached only through a row of the same query `bowtie` reads, on the same
 * working body, so within one app no bow-tie of a row can be refused for an omission (section 4
 * says the same of the `UnknownHazardError` row).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as views from '../contract.js';
import * as reports from '../../reports/contract.js';
import { arm } from '../../../baseline/faults.js';
import { reportId, reportTemplateId, platformId } from '../../../baseline/types.js';
import {
  MemoryExportFile, buildWorld, clockOn, day, everywhere, expectScreen, heldBody, inBrowser, itemsName, keyOf, loaded, malformed,
  oneMessage, plain, refusedAsBefore, saveBody, selectedApp, step, toAssessment, toHazards, withoutMessages,
} from './harness.js';

/**
 * @param {MemoryExportFile} file
 */
function textOf(file) {
  return new TextDecoder().decode(file.contents());
}

/**
 * The world, saved, with a template, a report on alpha, and the app on the reports screen.
 * @param {any} env
 */
async function reportsWorld(env) {
  const w = await buildWorld(env);
  await step(w.app, views.openReports(w.app), 'reports');
  const templateId = (await step(w.app, views.createTemplate(w.app, /** @type {any} */ ({ name: 'T', title: 'Log', sections: [{ sectionKind: 'hazards' }] })), 'reports')).templates[0].id;
  await step(w.app, views.beginReport(w.app, /** @type {any} */ ({ templateId, platformId: w.platforms.alpha })), 'prepare-report');
  const report = (await step(w.app, views.produceReport(w.app, [w.hazards.fire]), 'report')).report;
  await step(w.app, views.back(w.app), 'reports');
  return { ...w, templateId, report };
}

// ------------------------------------------------------------------ C-040 the export

test('exportBowtie whose write does not complete shows the bow-tie screen rebuilt, bowtie and svg as they were, with one error naming the target; the file holds what it held and nothing else is written (section 4, C-040; store C-020)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toAssessment(w.app, w.platforms.alpha, w.hazards.fire);
  const shown = await step(w.app, views.openBowtie(w.app), 'bowtie');
  const target = new MemoryExportFile('fire bow-tie.svg', 'what was there before');
  const before = everywhere(w.folder, env);
  arm('store.export.staged');
  const screen = expectScreen(w.app, await views.exportBowtie(w.app, /** @type {any} */ (target)), 'bowtie');
  itemsName(oneMessage(screen, 'error'), 'fire bow-tie.svg', 'the target\'s name');
  assert.deepEqual(withoutMessages(screen), withoutMessages(shown));
  assert.equal(textOf(target), 'what was there before');
  assert.deepEqual(everywhere(w.folder, env), before);
}));

// ------------------------------------------------------------------ C-041 to C-043 reports

test('createTemplate with a blank name, a blank title, or sections without exactly one place for the hazards leaves the reports screen as before with one warning naming what reports carries; nothing stored (section 4, C-041)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openReports(w.app), 'reports');
  const hazards = { sectionKind: 'hazards' };
  /** @type {[string, any, string][]} */
  const cases = [
    ['a blank name', { name: ' ', title: 'T', sections: [hazards] }, ''],
    ['a blank title', { name: 'N', title: '', sections: [hazards] }, ''],
    ['no hazards section', { name: 'N', title: 'T', sections: [{ sectionKind: 'heading', text: 'H' }] }, 'sections'],
    ['two hazards sections', { name: 'N', title: 'T', sections: [hazards, hazards] }, 'sections'],
    ['a blank heading', { name: 'N', title: 'T', sections: [{ sectionKind: 'heading', text: '  ' }, hazards] }, 'sections'],
  ];
  for (const [label, fields, named] of cases) {
    const m = await refusedAsBefore(w, () => views.createTemplate(w.app, fields), 'warning', label);
    if (named) itemsName(m, named, 'what the error carries');
  }
}));

test('beginReport for a template or platform outside the reports screen\'s lists leaves it as before with one warning whose items are the two ids; nothing called or written (section 4, C-042)', () => inBrowser(async (env) => {
  const w = await reportsWorld(env);
  const fields = [
    { templateId: reportTemplateId.fresh(), platformId: w.platforms.alpha },
    { templateId: w.templateId, platformId: platformId.fresh() },
  ];
  for (const f of fields) {
    const m = await refusedAsBefore(w, () => views.beginReport(w.app, /** @type {any} */ (f)), 'warning', JSON.stringify(f));
    itemsName(m, f.templateId, 'the template id');
    itemsName(m, f.platformId, 'the platform id');
  }
}));

test('produceReport naming a hazard that is not a row, or one twice, leaves the prepare-report screen as before with one warning naming the ids; nothing produced (section 4, C-042)', () => inBrowser(async (env) => {
  const w = await reportsWorld(env);
  await step(w.app, views.beginReport(w.app, /** @type {any} */ ({ templateId: w.templateId, platformId: w.platforms.alpha })), 'prepare-report');
  const count = (await reports.listReports(await heldBody(env, w.folder))).length;
  itemsName(await refusedAsBefore(w, () => views.produceReport(w.app, [/** @type {any} */ (w.hazards.brakes)]), 'warning', 'not a row'), w.hazards.brakes, 'the id');
  itemsName(await refusedAsBefore(w, () => views.produceReport(w.app, [/** @type {any} */ (w.hazards.fire), /** @type {any} */ (w.hazards.fire)]), 'warning', 'twice'), w.hazards.fire, 'the id');
  assert.equal((await reports.listReports(await heldBody(env, w.folder))).length, count);
}));

test('produceReport after the clock crosses a due date since the screen was built produces nothing and shows the prepare-report screen rebuilt with the list as it now is and its warning (section 4, C-042; HZ-009)', () => inBrowser(async (env) => {
  clockOn('2026-09-20');
  const w = await reportsWorld(env);
  await toHazards(w.app);
  await step(w.app, views.openPlatforms(w.app), 'platforms');
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'platform', id: w.platforms.alpha }, tempoMonths: 12, nextDueAest: day('2026-10-01') })), 'platforms');
  await toHazards(w.app);
  await step(w.app, views.openReports(w.app), 'reports');
  clockOn('2026-10-01');
  const shown = await step(w.app, views.beginReport(w.app, /** @type {any} */ ({ templateId: w.templateId, platformId: w.platforms.alpha })), 'prepare-report');
  assert.deepEqual(shown.outOfDate, []);
  const body = await heldBody(env, w.folder);
  const written = everywhere(w.folder, env);

  clockOn('2026-10-02');
  const screen = expectScreen(w.app, await views.produceReport(w.app, []), 'prepare-report');
  const now = plain(await reports.outOfDateFor(body, /** @type {any} */ (w.platforms.alpha)));
  assert.equal(now.length, 1);
  assert.deepEqual(screen.outOfDate, now);
  assert.equal(screen.messages[0].severity, 'warning');
  itemsName(screen.messages[0], 'Alpha', 'the record now past due');
  assert.deepEqual(everywhere(w.folder, env), written, 'nothing produced, noteChange not called');
  assert.equal((await reports.listReports(await heldBody(env, w.folder))).length, 1, 'only the report produced before');

  const produced = expectScreen(w.app, await views.produceReport(w.app, []), 'report');
  assert.deepEqual(produced.report.outOfDate, now, 'produced past the list the user has now seen');
}));

test('beginReport on a body whose schedule is malformed shows the reports screen rebuilt with reviews null and one error naming the key and its kind; no prepare-report screen (section 4, C-042; HZ-009)', () => inBrowser(async (env) => {
  const w = await reportsWorld(env);
  await toHazards(w.app);
  await step(w.app, views.openPlatforms(w.app), 'platforms');
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'platform', id: w.platforms.alpha }, tempoMonths: 12, nextDueAest: day('2027-01-01') })), 'platforms');
  await toHazards(w.app);
  await step(w.app, views.save(w.app), 'hazards');
  const body = (await loaded(w.folder)).body;
  const key = Object.keys(/** @type {any} */ (body.collections['review-schedule']))[0];
  await saveBody(w.folder, w.alice, malformed(body, 'review-schedule', key, (r) => { r.nextDueAest = 'soon'; }));
  const app = await selectedApp(w.folder, 'Alice');
  expectScreen(app, await views.openReports(app), 'reports');
  const screen = expectScreen(app, await views.beginReport(app, /** @type {any} */ ({ templateId: w.templateId, platformId: w.platforms.alpha })), 'reports');
  assert.equal(screen.reviews, null);
  assert.ok(screen.messages.some((/** @type {any} */ m) => m.severity === 'error' && m.items.some((/** @type {string} */ i) => i.includes(key))), 'an error naming the key');
}));

test('openReport for an id with no report shows the reports screen re-listed with one warning naming the id (section 4, C-043)', () => inBrowser(async (env) => {
  const w = await reportsWorld(env);
  const id = reportId.fresh();
  const screen = expectScreen(w.app, await views.openReport(w.app, id), 'reports');
  itemsName(oneMessage(screen, 'warning'), id, 'the id');
}));

test('exportReport with a format outside the two leaves the report screen as before with one warning naming it, and writes nothing; one whose write does not complete shows the report screen with one error naming the target and the file as it was (section 4, C-043)', () => inBrowser(async (env) => {
  const w = await reportsWorld(env);
  await step(w.app, views.openReport(w.app, w.report.id), 'report');
  const target = new MemoryExportFile('log.pdf', 'untouched');
  itemsName(await refusedAsBefore(w, () => views.exportReport(w.app, /** @type {any} */ (target), /** @type {any} */ ('pdf')), 'warning', 'pdf'), 'pdf', 'the value');
  assert.equal(target.opened, 0);
  const shown = plain(w.app.screen);
  arm('store.export.staged');
  const screen = expectScreen(w.app, await views.exportReport(w.app, /** @type {any} */ (target), 'html'), 'report');
  itemsName(oneMessage(screen, 'error'), 'log.pdf', 'the target\'s name');
  assert.deepEqual(withoutMessages(screen), withoutMessages(shown));
  assert.equal(textOf(target), 'untouched');
}));

test('the reports screens and a hazard\'s screen on a body whose report collection is malformed show templates and reports, or the hazard\'s reports, empty with one error naming the key (section 4)', () => inBrowser(async (env) => {
  const w = await reportsWorld(env);
  await toHazards(w.app);
  await step(w.app, views.save(w.app), 'hazards');
  const body = (await loaded(w.folder)).body;
  await saveBody(w.folder, w.alice, malformed(body, 'report', w.report.id, (r) => { r.hazards = 'all of them'; }));
  const app = await selectedApp(w.folder, 'Alice');
  const screen = expectScreen(app, await views.openReports(app), 'reports');
  assert.deepEqual([screen.templates, screen.reports], [[], []]);
  itemsName(oneMessage(screen, 'error'), w.report.id, 'the key');
  await toHazards(app);
  const hazard = expectScreen(app, await views.openHazard(app, /** @type {any} */ (w.hazards.fire)), 'hazard');
  assert.deepEqual(hazard.reports, []);
  itemsName(oneMessage(hazard, 'error'), w.report.id, 'the key');
  assert.equal(hazard.platforms.length, 2, 'the platforms as C-044 says');
}));

// ------------------------------------------------------------------ C-045 to C-048

test('applyFilter with a value outside the filter screen\'s lists or the named values leaves it as before with one warning naming the field and the value; nothing called or written (section 4, C-045)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  expectScreen(w.app, await views.openFilter(w.app), 'filter');
  const none = { platformId: null, band: null, recordStatus: null, controlState: null, referenceEntryId: null };
  /** @type {[string, string][]} */
  const cases = [['platformId', platformId.fresh()], ['band', 'Catastrophic'], ['recordStatus', 'archived'], ['controlState', 'linked'], ['referenceEntryId', '00000000-0000-4000-8000-0000000000ee']];
  for (const [field, value] of cases) {
    const m = await refusedAsBefore(w, () => views.applyFilter(w.app, /** @type {any} */ ({ ...none, [field]: value })), 'warning', field);
    itemsName(m, field, 'the field');
    itemsName(m, value, 'the value');
  }
}));

test('the filter on a body with a malformed control shows hazards and controls empty, never a shorter list, with one error naming the key and its kind (section 4, C-045)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const body = await heldBody(env, w.folder);
  await saveBody(w.folder, w.alice, malformed(body, 'control', w.controls.bottle, (r) => { r.kind = 'hazard'; }));
  const app = await selectedApp(w.folder, 'Alice');
  const screen = expectScreen(app, await views.openFilter(app), 'filter');
  assert.deepEqual([screen.hazards, screen.controls], [[], []]);
  assert.ok(screen.messages.some((/** @type {any} */ m) => m.severity === 'error' && m.items.some((/** @type {string} */ i) => i.includes(w.controls.bottle)) && m.items.some((/** @type {string} */ i) => i.includes('control'))), 'an error naming the key and the kind');
}));

test('the dashboard and the open-items screen on a body with a malformed workflow record show every workflows list empty and unlinked null with one error naming the key; with a malformed reference entry, every overdue null and unlinked and files null (section 4, C-046 to C-048)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openWorkflows(w.app), 'workflows');
  await step(w.app, views.startWorkflow(w.app, /** @type {any} */ ({ workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.alpha } })), 'workflow');
  await toHazards(w.app);
  await step(w.app, views.openReferences(w.app), 'references');
  await step(w.app, views.createReference(w.app, /** @type {any} */ ({ name: 'Loose', link: null, path: null, file: null })), 'references');
  await toHazards(w.app);
  await step(w.app, views.save(w.app), 'hazards');
  const body = (await loaded(w.folder)).body;
  const wfKey = Object.keys(/** @type {any} */ (body.collections['workflow-record']))[0];
  const entryKey = Object.keys(/** @type {any} */ (body.collections['reference-entry']))[0];

  await saveBody(w.folder, w.alice, malformed(body, 'workflow-record', wfKey, (r) => { r.state = 'paused'; }));
  let app = await selectedApp(w.folder, 'Alice');
  const dashboard = expectScreen(app, await views.openDashboard(app), 'dashboard');
  assert.ok(dashboard.platforms.length > 0 && dashboard.platforms.every((/** @type {any} */ p) => p.workflows.length === 0));
  itemsName(oneMessage(dashboard, 'error'), wfKey, 'the key');
  await toHazards(app);
  const openItems = expectScreen(app, await views.openOpenItems(app), 'open-items');
  assert.ok(openItems.platforms.every((/** @type {any} */ p) => p.workflows.length === 0));
  assert.deepEqual(openItems.unplaced.workflows, []);
  assert.equal(openItems.unlinked, null);
  itemsName(oneMessage(openItems, 'error'), wfKey, 'the key');

  await saveBody(w.folder, w.alice, malformed(body, 'reference-entry', entryKey, (r) => { r.name = 42; }));
  app = await selectedApp(w.folder, 'Alice');
  const dash2 = expectScreen(app, await views.openDashboard(app), 'dashboard');
  assert.ok(dash2.platforms.every((/** @type {any} */ p) => p.overdue === null), 'every overdue null');
  itemsName(oneMessage(dash2, 'error'), entryKey, 'the key');
  await toHazards(app);
  const items2 = expectScreen(app, await views.openOpenItems(app), 'open-items');
  assert.ok(items2.platforms.every((/** @type {any} */ p) => p.overdue === null));
  assert.equal(items2.unplaced.overdue, null);
  assert.equal(items2.unlinked, null);
  assert.equal(items2.files, null);
  assert.ok(items2.messages.some((/** @type {any} */ m) => m.severity === 'error' && m.items.some((/** @type {string} */ i) => i.includes(entryKey))));
}));

test('the dashboard of a profile owning one platform whose query rejects shows that platform with unconfirmed and omitted empty and overdue null, and one error naming the record\'s key and its kind (section 4, C-046)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const body = await heldBody(env, w.folder);
  const linkKey = keyOf(body, 'link', (l) => l.linkKind === 'hazard-platform' && l.hazardId === w.hazards.bird);
  await saveBody(w.folder, w.alice, malformed(body, 'link', linkKey, (l) => { l.linkKind = 'hazard-somewhere'; }));
  const app = await selectedApp(w.folder, 'Alice');
  const screen = expectScreen(app, await views.openDashboard(app), 'dashboard');
  assert.equal(screen.platforms.length, 1);
  const [items] = screen.platforms;
  assert.equal(items.platform.id, w.platforms.alpha);
  assert.deepEqual([items.unconfirmed, items.omitted, items.overdue], [[], [], null]);
  const m = oneMessage(screen, 'error');
  itemsName(m, linkKey, 'the key');
  itemsName(m, 'link', 'the kind');
}));
