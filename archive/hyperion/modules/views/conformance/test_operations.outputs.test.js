/**
 * views conformance: the bow-tie, its export, and reports (CORE-CON-002). The happy path of
 * C-039 and C-040 (SL-08) and C-041 to C-044 (SL-09) of modules/views/CONTRACT.md, each screen
 * compared with what `bowtie`, `reports`, `registry`, and `review-schedule` give for the body it
 * is built from, and each export with the text those contracts render. Written from the contract
 * before any implementation (P8). `chooseExportTarget` and `chooseReportExportTarget` are
 * verified by demonstration; `exportBowtie` and `exportReport` take an in-memory export file
 * from `store`'s conformance harness (store C-020).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as views from '../contract.js';
import * as registry from '../../registry/contract.js';
import * as changeLog from '../../change-log/contract.js';
import * as bowtie from '../../bowtie/contract.js';
import * as reports from '../../reports/contract.js';
import {
  MemoryExportFile, buildWorld, byId, clockOn, controlIn, day, everywhere, expectScreen, heldBody, inBrowser, keyOf, loaded,
  malformed, newEntry, noMessages, plain, plantData, platformName, platformView, reviewsOf, selectedApp, step, toAssessment, toHazard,
  toHazards,
} from './harness.js';

const TEMPLATE = Object.freeze({
  name: '  Platform safety case ',
  title: ' Hazard log ',
  sections: [{ sectionKind: 'heading', text: ' Introduction ' }, { sectionKind: 'text', text: 'Scope of this log.' }, { sectionKind: 'hazards' }],
});

/**
 * @param {MemoryExportFile} file
 * @returns {string}
 */
function textOf(file) {
  return new TextDecoder().decode(file.contents());
}

/**
 * The bow-tie `bowtie` gives for a pair on a body, and its drawing.
 * @param {any} body
 * @param {string} hazardId
 * @param {string} platformId
 */
async function drawn(body, hazardId, platformId) {
  const value = await bowtie.bowtieFor(body, /** @type {any} */ (hazardId), /** @type {any} */ (platformId));
  return { bowtie: plain(value), svg: await bowtie.renderBowtieSvg(value) };
}

/**
 * From the hazards screen to the reports screen with the template saved; its id.
 * @param {any} app
 * @returns {Promise<string>}
 */
async function withTemplate(app) {
  await step(app, views.openReports(app), 'reports');
  const before = app.screen.templates.map((/** @type {any} */ t) => t.id);
  const screen = await step(app, views.createTemplate(app, /** @type {any} */ (TEMPLATE)), 'reports');
  const added = screen.templates.filter((/** @type {any} */ t) => !before.includes(t.id));
  assert.equal(added.length, 1, 'one template created');
  return added[0].id;
}

/**
 * The section marks of an HTML report, in order.
 * @param {string} html
 */
function sectionMarks(html) {
  return [...html.matchAll(/data-report-section="([^"]+)"/g)].map((m) => m[1]);
}

// ------------------------------------------------------------------ C-039 the bow-tie

test('openBowtie shows exactly bowtieFor of the working body for the assessment\'s pair and exactly the renderBowtieSvg of it, with the review standing and no message, writing nothing anywhere (C-039; SL-08 criteria 1 and 2)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toAssessment(w.app, w.platforms.alpha, w.hazards.fire);
  const before = everywhere(w.folder, env);
  const screen = await step(w.app, views.openBowtie(w.app), 'bowtie');
  const body = await heldBody(env, w.folder);
  const expected = await drawn(body, w.hazards.fire, w.platforms.alpha);
  assert.deepEqual(screen.bowtie, expected.bowtie);
  assert.equal(screen.svg, expected.svg, 'the drawing, byte for byte');
  assert.deepEqual(screen.reviews, await reviewsOf(body));
  assert.deepEqual(controlIn(screen.bowtie.preventativeControls, w.controls.bottle).state, 'confirmed', 'each control in the state registry gives it on the platform');
  assert.deepEqual(controlIn(screen.bowtie.mitigatingControls, w.controls.drill).state, 'excluded');
  assert.equal('rating' in screen || 'residualRating' in screen, false, 'no rating on the bow-tie screen');
  const back = expectScreen(w.app, await views.back(w.app), 'assessment');
  assert.deepEqual(back.hazard.id, w.hazards.fire);
  assert.deepEqual(everywhere(w.folder, env), before, 'showing a bow-tie and going back wrote nothing to the folder or the browser\'s storage');

  const again = await step(w.app, views.openBowtie(w.app), 'bowtie');
  assert.equal(again.svg, screen.svg, 'on the same body, the identical string');
}));

test('a bow-tie shown after the hazard is renamed, given a causal factor, and a control confirmed is drawn from the body as it now is (C-039; SL-08 criterion 2)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toAssessment(w.app, w.platforms.alpha, w.hazards.bird);
  const first = await step(w.app, views.openBowtie(w.app), 'bowtie');
  await toHazards(w.app);
  await toHazard(w.app, w.hazards.bird);
  await step(w.app, views.renameHazard(w.app, { title: 'Bird strike on climb-out' }), 'hazard');
  await step(w.app, views.addCausalFactor(w.app, { text: 'Flocking near the runway' }), 'hazard');
  await toHazards(w.app);
  await toAssessment(w.app, w.platforms.alpha, w.hazards.bird);
  await step(w.app, views.confirmControlForPlatform(w.app, /** @type {any} */ (w.controls.radar)), 'assessment');
  const before = everywhere(w.folder, env);
  const second = await step(w.app, views.openBowtie(w.app), 'bowtie');
  const expected = await drawn(await heldBody(env, w.folder), w.hazards.bird, w.platforms.alpha);
  assert.equal(second.svg, expected.svg);
  assert.notEqual(second.svg, first.svg);
  assert.equal(second.bowtie.hazard.title, 'Bird strike on climb-out');
  assert.deepEqual(second.bowtie.causalFactors.map((/** @type {any} */ c) => c.text), ['Flocking near the runway']);
  assert.equal(controlIn(second.bowtie.preventativeControls, w.controls.radar).state, 'confirmed');
  assert.deepEqual(everywhere(w.folder, env), before);
}));

// ------------------------------------------------------------------ C-040 the export

test('exportBowtie writes to the file chosen exactly the drawing generated again, shows the same screen with svg the text written, and changes nothing else: no entry, no body, no folder, no storage (C-040; SL-08 criterion 3)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toAssessment(w.app, w.platforms.alpha, w.hazards.fire);
  const shown = await step(w.app, views.openBowtie(w.app), 'bowtie');
  const body = await heldBody(env, w.folder);
  const entries = (await changeLog.listEntries(body)).length;
  const before = everywhere(w.folder, env);
  const target = new MemoryExportFile('fire.svg', 'an older export');

  const screen = await step(w.app, views.exportBowtie(w.app, /** @type {any} */ (target)), 'bowtie');
  assert.equal(textOf(target), shown.svg, 'the file holds the drawing the screen showed');
  assert.equal(screen.svg, textOf(target), 'the screen\'s svg is the text written');
  assert.deepEqual(screen.bowtie, shown.bowtie);
  assert.equal(screen.svg, (await drawn(body, w.hazards.fire, w.platforms.alpha)).svg);
  assert.deepEqual(everywhere(w.folder, env), before, 'nothing under the data folder or in the browser\'s storage written');
  assert.equal((await changeLog.listEntries(await heldBody(env, w.folder))).length, entries, 'no entry appended');

  const nodes = (/** @type {string} */ svg) => [...svg.matchAll(/data-bowtie-node="([^"]+)"[^>]*data-record-id="([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`).sort();
  assert.deepEqual(nodes(textOf(target)), nodes(shown.svg), 'the exported drawing holds the same nodes as the shown one');

  const again = await step(w.app, views.exportBowtie(w.app, /** @type {any} */ (target)), 'bowtie');
  assert.deepEqual(plain(again), plain(screen), 'a second export resolves with a deep-equal screen');
  assert.equal(textOf(target), shown.svg, 'and leaves the file as one export would');
}));

// ------------------------------------------------------------------ C-041 templates

test('openReports lists the templates and reports reports gives and every live platform; createTemplate saves one with its name, title, and sections trimmed, and a save carries it to the next open (C-041; SL-09 criterion 1)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const opened = await step(w.app, views.openReports(w.app), 'reports');
  let body = await heldBody(env, w.folder);
  assert.deepEqual(opened.templates, []);
  assert.deepEqual(opened.reports, []);
  assert.deepEqual(opened.platforms, plain(await registry.listPlatforms(body)));
  assert.deepEqual(opened.reviews, await reviewsOf(body));

  const prior = body;
  const screen = await step(w.app, views.createTemplate(w.app, /** @type {any} */ (TEMPLATE)), 'reports');
  body = await heldBody(env, w.folder);
  assert.deepEqual(screen.templates, plain(await reports.listTemplates(body)));
  const template = screen.templates[0];
  assert.equal(template.name, 'Platform safety case');
  assert.equal(template.title, 'Hazard log');
  assert.deepEqual(template.sections, [{ sectionKind: 'heading', text: 'Introduction' }, { sectionKind: 'text', text: 'Scope of this log.' }, { sectionKind: 'hazards' }]);
  const act = await newEntry(prior, body);
  assert.equal(act.madeForPlatformId, null, 'a template is made for no platform');

  await toHazards(w.app);
  await step(w.app, views.save(w.app), 'hazards');
  const other = await selectedApp(w.folder, 'Bob');
  const reopened = await step(other, views.openReports(other), 'reports');
  assert.deepEqual(reopened.templates, screen.templates, 'saved and listed again');
}));

// ------------------------------------------------------------------ C-042 preparing and producing

test('beginReport with nothing past due shows the template, the platform\'s hazards from the one query each with its band, outOfDate empty, and no warning; produceReport produces the report of exactly that list and shows its own screen (C-042, C-043; SL-09 criteria 2 and 3)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const templateId = await withTemplate(w.app);
  const before = everywhere(w.folder, env);
  const prepared = await step(w.app, views.beginReport(w.app, /** @type {any} */ ({ templateId, platformId: w.platforms.alpha })), 'prepare-report');
  let body = await heldBody(env, w.folder);
  const view = await platformView(body, w.platforms.alpha);
  assert.deepEqual(prepared.template, plain(await reports.getTemplate(body, /** @type {any} */ (templateId))));
  assert.deepEqual(prepared.platform, view.platform);
  assert.deepEqual(prepared.rows, view.rows);
  assert.deepEqual(prepared.omitted, view.omitted);
  assert.deepEqual(prepared.outOfDate, []);
  assert.deepEqual(prepared.reviews, await reviewsOf(body));
  assert.deepEqual(everywhere(w.folder, env), before, 'preparing wrote nothing');

  const prior = body;
  const report = await step(w.app, views.produceReport(w.app, [w.hazards.fire]), 'report');
  body = await heldBody(env, w.folder);
  const stored = plain(await reports.getReport(body, report.report.id));
  assert.deepEqual(report.report, stored);
  assert.deepEqual(report.includes, plain(await reports.includesOf(stored)));
  assert.deepEqual(stored.hazards.map((/** @type {any} */ h) => h.hazardId), view.rows.map((r) => r.hazard.id), 'the report holds the hazards the screen showed');
  assert.deepEqual(stored.bowties.map((/** @type {any} */ b) => b.hazardId), [w.hazards.fire]);
  assert.deepEqual(stored.outOfDate, []);
  const act = await newEntry(prior, body);
  assert.equal(act.madeForPlatformId, w.platforms.alpha, 'a report is made for the platform it is on');

  const back = await step(w.app, views.back(w.app), 'reports');
  assert.deepEqual(back.reports, plain(await reports.listReports(body)), 'back from the report goes to the reports screen, rebuilt');
}));

test('with the clock past a record\'s due date, beginReport warns first with one item per out-of-date record naming its kind, name, and last reviewed date or that it was never reviewed; produceReport hands back exactly that list and the report carries it (C-042; SL-09 criterion 3; HZ-009)', () => inBrowser(async (env) => {
  clockOn('2026-09-15');
  const w = await buildWorld(env);
  await step(w.app, views.openPlatforms(w.app), 'platforms');
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'platform', id: w.platforms.alpha }, tempoMonths: 12, nextDueAest: day('2026-10-01') })), 'platforms');
  await toHazards(w.app);
  await toHazard(w.app, w.hazards.bird);
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'hazard', id: w.hazards.bird }, tempoMonths: 6, nextDueAest: day('2026-10-05') })), 'hazard');
  await toHazards(w.app);
  const templateId = await withTemplate(w.app);

  clockOn('2026-10-01');
  const onTheDay = await step(w.app, views.beginReport(w.app, /** @type {any} */ ({ templateId, platformId: w.platforms.alpha })), 'prepare-report');
  assert.deepEqual(onTheDay.outOfDate, [], 'on the due date nothing is past due, and no warning');
  await step(w.app, views.back(w.app), 'reports');

  clockOn('2026-10-06');
  const screen = expectScreen(w.app, await views.beginReport(w.app, /** @type {any} */ ({ templateId, platformId: w.platforms.alpha })), 'prepare-report');
  const body = await heldBody(env, w.folder);
  const outOfDate = plain(await reports.outOfDateFor(body, /** @type {any} */ (w.platforms.alpha)));
  assert.equal(outOfDate.length, 2);
  assert.deepEqual(screen.outOfDate, outOfDate);
  assert.equal(screen.messages.length, 1, 'one warning, and no omitted-hazard message');
  const warning = screen.messages[0];
  assert.equal(warning.severity, 'warning');
  assert.equal(warning.items.length, outOfDate.length, 'one item per record, in its order');
  outOfDate.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
    assert.ok(warning.items[i].includes(r.ref.kind), `item ${i} names the kind`);
    assert.ok(warning.items[i].includes(r.name), `item ${i} names ${r.name}`);
    if (r.lastReviewedAest !== null) assert.ok(warning.items[i].includes(r.lastReviewedAest), `item ${i} names the last reviewed date`);
  });

  const report = expectScreen(w.app, await views.produceReport(w.app, []), 'report');
  noMessages(report);
  assert.deepEqual(report.report.outOfDate, outOfDate, 'the report was produced past exactly the list shown');
}));

test('a report holds the bow-tie as drawn at production: renaming the hazard and adding a causal factor afterwards leaves the report screen deep-equal (C-042, C-043; SL-09 criterion 5)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const templateId = await withTemplate(w.app);
  await step(w.app, views.beginReport(w.app, /** @type {any} */ ({ templateId, platformId: w.platforms.alpha })), 'prepare-report');
  const svgThen = (await drawn(await heldBody(env, w.folder), w.hazards.bird, w.platforms.alpha)).svg;
  const produced = await step(w.app, views.produceReport(w.app, [w.hazards.bird]), 'report');
  assert.equal(produced.report.bowties[0].svg, svgThen);

  await toHazards(w.app);
  await toHazard(w.app, w.hazards.bird);
  await step(w.app, views.renameHazard(w.app, { title: 'Renamed after the report' }), 'hazard');
  await step(w.app, views.addCausalFactor(w.app, { text: 'Added after the report' }), 'hazard');
  await toHazards(w.app);
  await step(w.app, views.openReports(w.app), 'reports');
  const reopened = await step(w.app, views.openReport(w.app, produced.report.id), 'report');
  assert.deepEqual(reopened, plain(produced), 'what the report held, not the records as they now are');
  assert.notEqual((await drawn(await heldBody(env, w.folder), w.hazards.bird, w.platforms.alpha)).svg, svgThen);
}));

test('two reports produced from one template carry its layout: the same title and sections, and the same section marks in both documents (C-041, C-043; SL-09 criterion 1)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const templateId = await withTemplate(w.app);
  const template = byId(/** @type {any} */ (w.app.screen).templates, templateId);
  const produced = [];
  for (const platformId of [w.platforms.alpha, w.platforms.bravo]) {
    await step(w.app, views.beginReport(w.app, /** @type {any} */ ({ templateId, platformId })), 'prepare-report');
    produced.push(await step(w.app, views.produceReport(w.app, []), 'report'));
    await step(w.app, views.back(w.app), 'reports');
  }
  const marks = [];
  for (const r of produced) {
    assert.equal(r.report.title, template.title);
    assert.deepEqual(r.report.sections, template.sections);
    await step(w.app, views.openReport(w.app, r.report.id), 'report');
    const file = new MemoryExportFile('r.html');
    await step(w.app, views.exportReport(w.app, /** @type {any} */ (file), 'html'), 'report');
    marks.push(sectionMarks(textOf(file)));
    await step(w.app, views.back(w.app), 'reports');
  }
  assert.deepEqual(marks[0], template.sections.map((/** @type {any} */ s) => s.sectionKind));
  assert.deepEqual(marks[1], marks[0]);
}));

// ------------------------------------------------------------------ C-043 a report's screen and download

test('openReport shows the report as getReport gives it and includesOf of it, no reviews and no message; exportReport writes exactly renderReportHtml or renderReportMarkdown of it and changes nothing else (C-043; SL-09 criterion 4)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const templateId = await withTemplate(w.app);
  await step(w.app, views.beginReport(w.app, /** @type {any} */ ({ templateId, platformId: w.platforms.alpha })), 'prepare-report');
  const produced = await step(w.app, views.produceReport(w.app, [w.hazards.fire]), 'report');
  await step(w.app, views.back(w.app), 'reports');
  const before = everywhere(w.folder, env);

  const screen = await step(w.app, views.openReport(w.app, produced.report.id), 'report');
  const body = await heldBody(env, w.folder);
  const stored = await reports.getReport(body, produced.report.id);
  assert.deepEqual(screen.report, plain(stored));
  assert.deepEqual(screen.includes, plain(await reports.includesOf(/** @type {any} */ (stored))));
  assert.deepEqual(screen.includes.platformIds, [w.platforms.alpha]);
  assert.equal('reviews' in screen, false);

  /** @type {['html' | 'markdown', string][]} */
  const forms = [['html', await reports.renderReportHtml(/** @type {any} */ (stored))], ['markdown', await reports.renderReportMarkdown(/** @type {any} */ (stored))]];
  for (const [format, text] of forms) {
    const file = new MemoryExportFile(`report.${format}`);
    const exported = await step(w.app, views.exportReport(w.app, /** @type {any} */ (file), format), 'report');
    assert.equal(textOf(file), text, `${format}: exactly the document reports renders`);
    assert.deepEqual(exported, plain(screen), `${format}: the report screen as it was`);
    await step(w.app, views.exportReport(w.app, /** @type {any} */ (file), format), 'report');
    assert.equal(textOf(file), text, `${format}: twice writes the same text`);
  }
  assert.deepEqual(everywhere(w.folder, env), before, 'opening and downloading wrote nothing to the folder or the browser\'s storage');
  assert.deepEqual(await heldBody(env, w.folder), body, 'the working body is the one held');
}));

// ------------------------------------------------------------------ C-044 a hazard's platforms and reports

test('a hazard\'s own screen lists each platform platformsAffected gives it, in that order, with that hazard\'s controls from each platform\'s one query, and exactly the reports reportsIncluding gives (C-044; SL-09 criterion 4)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const templateId = await withTemplate(w.app);
  await step(w.app, views.beginReport(w.app, /** @type {any} */ ({ templateId, platformId: w.platforms.alpha })), 'prepare-report');
  await step(w.app, views.produceReport(w.app, []), 'report');
  await toHazards(w.app);

  const screen = await toHazard(w.app, w.hazards.fire);
  const body = await heldBody(env, w.folder);
  const ids = plain(await registry.platformsAffected(body, { kind: 'hazard', id: /** @type {any} */ (w.hazards.fire) }));
  const expected = [];
  for (const id of ids) {
    const q = plain(await registry.listPlatformHazards(body, id));
    expected.push({ platform: q.platform, controls: q.rows.find((/** @type {any} */ r) => r.hazard.id === w.hazards.fire).controls, omitted: null });
  }
  assert.deepEqual(screen.platforms, expected);
  assert.equal(controlIn(screen.platforms.find((/** @type {any} */ p) => p.platform.id === w.platforms.alpha).controls, w.controls.bottle).state, 'confirmed');
  assert.equal(controlIn(screen.platforms.find((/** @type {any} */ p) => p.platform.id === w.platforms.bravo).controls, w.controls.bottle).state, 'awaiting');
  assert.deepEqual(screen.reports, plain(await reports.reportsIncluding(body, { kind: 'hazard', id: /** @type {any} */ (w.hazards.fire) })));
  assert.equal(screen.reports.length, 1);

  await toHazards(w.app);
  const brakes = await toHazard(w.app, w.hazards.brakes);
  assert.deepEqual([brakes.platforms, brakes.reports], [[], []], 'a hazard on no platform and in no report');
}));

test('a hazard omitted on one of its platforms is listed there with controls null and the omission, and the screen carries one error naming its id, the omitting record\'s key, and the platform\'s name (C-044; HZ-004)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const body = await heldBody(env, w.folder);
  const key = keyOf(body, 'rating', (r) => r.hazardId === w.hazards.fire && r.platformId === w.platforms.alpha && r.stage === 'residual');
  await plantData(w.folder, malformed(body, 'rating', key, (r) => { r.consequence = 0; }), w.alice);
  const app = await selectedApp(w.folder, 'Alice');
  const screen = expectScreen(app, await views.openHazard(app, /** @type {any} */ (w.hazards.fire)), 'hazard');
  const planted = (await loaded(w.folder)).body;
  const alphaView = await platformView(planted, w.platforms.alpha);
  const alpha = screen.platforms.find((/** @type {any} */ p) => p.platform.id === w.platforms.alpha);
  assert.equal(alpha.controls, null);
  assert.deepEqual(alpha.omitted, alphaView.omitted[0]);
  const bravo = screen.platforms.find((/** @type {any} */ p) => p.platform.id === w.platforms.bravo);
  assert.equal(bravo.omitted, null);
  assert.ok(Array.isArray(bravo.controls));
  assert.equal(screen.messages.length, 1);
  const m = screen.messages[0];
  assert.equal(m.severity, 'error');
  for (const thing of [w.hazards.fire, alphaView.omitted[0].key, await platformName(planted, w.platforms.alpha)]) {
    assert.ok(m.items.some((/** @type {string} */ i) => i.includes(thing)), `the message names ${thing}`);
  }
}));
