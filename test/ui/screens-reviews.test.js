import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformsView, platformView } from '../../src/ui/screens/platforms.js';
import { platformReviewView } from '../../src/ui/screens/reviews.js';
import { policyData } from './screens-reviews-tab.test.js';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { day } from '../../src/ui/names.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { startReview, markRow, completeReview, setReviewOutcome } from '../../src/core/ops/reviews.js';
import { entries } from '../../src/core/history.js';
import { reportsView } from '../../src/ui/screens/reports.js';
import { createReport } from '../../src/core/ops/reports.js';
import { seed, act, scheduleFixed } from '../helpers.js';

export const state = { ...initialState(), screen: 'main', today: '2026-09-28', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }], profileId: 'u1' };
/** p1 overdue (due 2026-09-01), p2 due soon (2026-10-10). */
export function data() {
  let d = assignNumbers(seed());
  d = scheduleFixed(d, 'p1', 6, '2026-09-01');
  return scheduleFixed(d, 'p2', 12, '2026-10-10');
}

test('day() reads a date the way people write it', () => {
  assert.equal(day('2026-08-12'), '12 Aug 2026');
  assert.equal(day('2026-12-01T09:30:00+10:00'), '1 Dec 2026');
});

test('the platforms list shows the next review with a due-soon or overdue badge, and filters by it', () => {
  const out = platformsView(state, data()).toString();
  assert.match(out, /<th data-col="review"/);
  assert.match(out, /1 Sep 2026 <span class="tag review-overdue">Overdue<\/span>/);
  assert.match(out, /10 Oct 2026 <span class="tag review-due-soon">Due soon<\/span>/);
  const overdueOnly = platformsView({ ...state, tables: { platforms: { filters: { review: 'overdue' } } } }, data()).toString();
  assert.match(overdueOnly, /data-row="p1"/);
  assert.doesNotMatch(overdueOnly, /data-row="p2"/);
});

test('the platform review page shows the rule, the next due date with how overdue, and the last review with Start review', () => {
  const out = platformReviewView(onTab(), data(), 'p1').toString();
  assert.match(out, /<h1>.*Reviews.*Alpha/);
  assert.match(out, /aria-label="Review rule"[\s\S]*<select name="kind" aria-label="Review rule" data-change="setRuleField" data-platform-id="p1">[\s\S]*<option value="fixed" selected>/);
  assert.match(out, /<input type="number" name="value" value="6"[^>]*data-change="setRuleField"[\s\S]*?<option value="months" selected>/);
  assert.match(out, /<input type="date" name="start" value="2026-03-01" data-change="setRuleField" data-platform-id="p1">/);
  assert.doesNotMatch(out, /<option value="policy"/, 'no policies yet, so no policy choice');
  assert.match(out, /<div class="dash-grid three-even review-cards">[\s\S]*?aria-label="Review rule"[\s\S]*?class="dash-card rv-card rv-overdue" aria-label="Next review due"[\s\S]*?1 Sep 2026[\s\S]*?Every 6 months[\s\S]*?\d+ days? overdue[\s\S]*?aria-label="Last reviewed"[\s\S]*?Never[\s\S]*?class="primary rv-action" data-action="beginReview" data-platform-id="p1">Start review/);
});

test('without a rule, the rule card offers the choice and the due card says why there is no date', () => {
  const out = platformReviewView(onTab(), seed(), 'p1').toString();
  assert.match(out, /<option value="none" selected>No schedule<\/option>/);
  assert.doesNotMatch(out, /name="start"/);
  assert.match(out, /Set a rule to have one/);
});

test('a policy rule names its policy and says what sets its period', () => {
  const out = platformReviewView(onTab(), policyData(), 'p1').toString();
  assert.match(out, /<option value="policy" selected>Review policy<\/option>/);
  assert.match(out, /<select name="policyId"[^>]*data-change="setRuleField" data-platform-id="p1"><option value="pol1" selected>Standard/);
  assert.match(out, /Every 6 months, because HAZ-\d+ residual personnel: Serious/);
});

test('a moved review date shows on the page with Acknowledge', () => {
  let d = data();
  d = { ...d, records: { ...d.records, platform: { ...d.records.platform, p1: { ...d.records.platform.p1, reviewDueSeen: '2027-01-01' } } } };
  const out = platformReviewView(onTab(), d, 'p1').toString();
  assert.match(out, /<span class="tag review-moved urgent">Moved from 1 Jan 2027<\/span>[\s\S]*?data-action="acknowledgeReviewDate" data-platform-id="p1"/);
});

test('with a review open, the page shows the rule and the review, and no Start button', () => {
  const d = startReview(data(), act, { id: 'r1', platformId: 'p1' });
  const out = platformReviewView(onTab(), d, 'p1').toString();
  assert.match(out, /data-change="setRuleField"[\s\S]*?data-table="reviewRows"/, 'the rule above the review');
  assert.doesNotMatch(out, /data-action="beginReview"|Continue review/);
});

test('the platform page no longer has a Reviews tab; its menu opens the review schedule panel', () => {
  const out = platformView(state, data(), 'p1').toString();
  assert.doesNotMatch(out, /data-tab="reviews"/);
  assert.match(out, /data-action="showReviewPanel" data-id="p1">[^<]*<span class="dots-check" aria-hidden="true"><\/span>Review schedule…/);
  assert.match(out, /data-action="go" data-view="platformReview" data-id="p1">Reviews →/);
  const panel = platformView({ ...state, reviewPanel: 'p1' }, data(), 'p1').toString();
  assert.match(panel, /role="dialog" aria-modal="true" aria-label="Review schedule"[\s\S]*Fixed · 6 months[\s\S]*1 Sep 2026[\s\S]*review-overdue[\s\S]*Never[\s\S]*data-view="platformReview" data-id="p1"[^>]*>Open in Reviews/);
  assert.doesNotMatch(platformView(state, data(), 'p1').toString(), /aria-label="Review schedule"/, 'closed until asked for');
});

const onTab = (extra = {}) => ({ ...state, view: { name: 'platformReview', id: 'p1', ...extra } });

test('the review page with no review open offers to start one', () => {
  const out = platformReviewView(onTab(), data(), 'p1').toString();
  assert.match(out, /No review in progress/);
  assert.match(out, /data-action="beginReview" data-platform-id="p1"/);
  assert.match(out, /data-table="pastReviews"/);
});

test('an open review: a checklist with a tickbox and a note per hazard, the outcome, Complete and Abandon', () => {
  let d = startReview(data(), act, { id: 'r1', platformId: 'p1' });
  d = markRow(d, act, { reviewId: 'r1', hazardId: 'h1', note: 'Crew briefed' });
  const out = platformReviewView(onTab(), d, 'p1').toString();
  assert.match(out, /data-table="reviewRows"/);
  assert.match(out, /<input type="checkbox" name="reviewed"[^>]*data-change="tickReviewRow" data-review-id="r1" data-hazard-id="h1"/);
  assert.doesNotMatch(out, /name="reviewed"[^>]* checked/, 'not yet ticked');
  assert.match(out, /<button type="button" class="cell-text cell-button" data-action="startEdit" data-kind="reviewNote" data-id="h1"[^>]*>Crew briefed</, 'one click edits the note');
  assert.doesNotMatch(out, /data-dblclick="startEdit" data-kind="reviewNote"/);
  assert.match(out, /<textarea name="outcome"[^>]*data-change="setReviewOutcome" data-review-id="r1"/);
  assert.match(out, /data-action="completeReview" data-review-id="r1"[^>]*>Complete — 1 not ticked</);
  assert.match(out, /data-action="abandonReview" data-review-id="r1"/);
  assert.match(out, /<span class="tag">Review in progress<\/span>/);
  const ticked = platformReviewView(onTab(), markRow(d, act, { reviewId: 'r1', hazardId: 'h1', reviewed: true }), 'p1').toString();
  assert.match(ticked, /name="reviewed"[^>]* checked/);
  assert.match(ticked, />Complete review</);
  const noting = platformReviewView({ ...onTab(), editing: { kind: 'reviewNote', id: 'h1' } }, d, 'p1').toString();
  assert.match(noting, /<input class="cell-edit" name="note" value="Crew briefed"[^>]*data-change="markRow" data-review-id="r1" data-hazard-id="h1"/);
});

test('a completed review is listed under past reviews and opens read-only', () => {
  let d = startReview(data(), act, { id: 'r1', platformId: 'p1' });
  d = markRow(d, act, { reviewId: 'r1', hazardId: 'h1', reviewed: true, note: 'OK' });
  d = setReviewOutcome(d, act, { reviewId: 'r1', outcome: 'Nothing to change' });
  d = completeReview(d, act, { reviewId: 'r1' });
  const list = platformReviewView(onTab(), d, 'p1').toString();
  assert.match(list, /data-action="go" data-view="platformReview" data-id="p1" data-review-id="r1">28 Sep 2026/);
  assert.match(list, /Nothing to change/);
  const one = platformReviewView(onTab({ reviewId: 'r1' }), d, 'p1').toString();
  assert.match(one, /Completed by Ada/);
  assert.match(one, /data-table="reviewRecord"/);
  assert.doesNotMatch(one, /type="checkbox"/);
  assert.doesNotMatch(one, /data-action="completeReview"/);
});

test('notes and outcomes are shown literally', () => {
  let d = startReview(data(), act, { id: 'r1', platformId: 'p1' });
  d = markRow(d, act, { reviewId: 'r1', hazardId: 'h1', reviewed: true, note: '<b>x</b> & "y"' });
  d = setReviewOutcome(d, act, { reviewId: 'r1', outcome: '<script>alert(1)</script>' });
  const open = platformReviewView(onTab(), d, 'p1').toString();
  assert.match(open, /&lt;b&gt;x&lt;\/b&gt; &amp; &quot;y&quot;/);
  assert.match(open, /&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/textarea>/);
  d = completeReview(d, act, { reviewId: 'r1' });
  for (const out of [platformReviewView(onTab(), d, 'p1').toString(), platformReviewView(onTab({ reviewId: 'r1' }), d, 'p1').toString()]) {
    assert.doesNotMatch(out, /<script>alert/);
    assert.doesNotMatch(out, /<b>x<\/b>/);
  }
});

test('the platform History tab leaves out ticks and notes but keeps starting and completing', () => {
  let d = startReview(data(), act, { id: 'r1', platformId: 'p1' });
  d = markRow(d, act, { reviewId: 'r1', hazardId: 'h1', reviewed: true });
  d = completeReview(d, act, { reviewId: 'r1' });
  assert.ok(entries(d).some((e) => e.action === 'Mark review row'));
  const out = platformView({ ...state, view: { name: 'platform', id: 'p1', tab: 'history' } }, d, 'p1').toString();
  assert.match(out, /Start review/);
  assert.match(out, /Complete review/);
  assert.doesNotMatch(out, /Mark review row/);
});

test('the Reports screen warns about an overdue platform but still lets the report be produced', () => {
  const d = data();
  const first = reportsView(state, d).toString();
  assert.match(first, /<select name="platformId"[^>]*data-change="chooseReportPlatform"/);
  assert.match(first, /Alpha was due for review on 1 Sep 2026 \(never reviewed\)\. You can still produce the report; it will be marked as produced while overdue\./);
  assert.match(first, /<button type="submit" class="primary">Produce<\/button>/);
  const bravo = reportsView({ ...state, reportPlatformId: 'p2' }, d).toString();
  assert.match(bravo, /<option value="p2" selected>/);
  assert.match(bravo, /Bravo is due for review on 10 Oct 2026\./);
  assert.doesNotMatch(bravo, /produced while overdue\./);
  assert.doesNotMatch(reportsView(state, seed()).toString(), /due for review/);
});

test('a report produced while overdue carries a badge in the list', () => {
  const report = { platformId: 'p1', platformName: 'Alpha', ownerName: 'Ada', producedAt: act.at, producedBy: 'u1', title: 'Alpha hazards', classification: '', rows: [],
    review: { state: 'overdue', due: '2026-09-01', months: 6, lastReviewed: null }, markdown: '', html: '' };
  const d = createReport(data(), act, { id: 'rep1', report });
  assert.match(reportsView(state, d).toString(), /Alpha hazards <span class="tag review-overdue"[^>]*>Overdue<\/span>/);
  const fine = createReport(data(), act, { id: 'rep2', report: { ...report, review: { state: 'ok', due: '2027-01-01', months: 6, lastReviewed: null } } });
  assert.doesNotMatch(reportsView(state, fine).toString(), /review-overdue/);
});

test('an empty note invites one', () => {
  const d = startReview(data(), act, { id: 'r1', platformId: 'p1' });
  assert.match(platformReviewView(onTab(), d, 'p1').toString(), /data-kind="reviewNote" data-id="h1"[^>]*><span class="muted">Add a note…<\/span></);
});

test('checkboxes are the accent orange', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');
  assert.match(css, /input\[type="checkbox"\], input\[type="radio"\] \{ accent-color: var\(--p-accent\); \}/);
});

test('a review has additional notes beside its outcome, kept once completed', async () => {
  const { setReviewNotes, REVIEW_DETAIL_ACTIONS } = await import('../../src/core/ops/reviews.js');
  let d = startReview(data(), act, { id: 'r1', platformId: 'p1' });
  d = setReviewNotes(d, act, { reviewId: 'r1', notes: '  Spares list <b>out of date</b>  ' });
  assert.equal(d.records.review.r1.notes, 'Spares list <b>out of date</b>');
  assert.equal(entries(d).at(-1).action, 'Set review notes');
  assert.ok(REVIEW_DETAIL_ACTIONS.includes('Set review notes'), 'kept out of the platform History, like the outcome');
  const open = platformReviewView(onTab(), d, 'p1').toString();
  assert.match(open, /name="outcome"[\s\S]*?<label class="outcome">Additional notes\s*<textarea name="notes"[^>]*data-change="setReviewNotes" data-review-id="r1">Spares list &lt;b&gt;out of date&lt;\/b&gt;<\/textarea>/);
  d = setReviewOutcome(d, act, { reviewId: 'r1', outcome: 'All good' });
  d = completeReview(d, act, { reviewId: 'r1' });
  assert.throws(() => setReviewNotes(d, act, { reviewId: 'r1', notes: 'late' }));
  const done = platformReviewView(onTab({ reviewId: 'r1' }), d, 'p1').toString();
  assert.match(done, /All good[\s\S]*?<h3>Additional notes<\/h3><p class="outcome-text">Spares list &lt;b&gt;out of date&lt;\/b&gt;<\/p>/);
});

test('past reviews list their additional notes; the per-hazard column reads Review note', async () => {
  const { setReviewNotes } = await import('../../src/core/ops/reviews.js');
  let d = startReview(data(), act, { id: 'r1', platformId: 'p1' });
  const open = platformReviewView(onTab(), d, 'p1').toString();
  assert.match(open, /data-table="reviewRows"[\s\S]*?<th data-col="note"[\s\S]*?>Review note</);
  assert.doesNotMatch(open, />Note<(?:span|\/)/);
  d = setReviewNotes(d, act, { reviewId: 'r1', notes: 'Spares list out of date' });
  d = completeReview(d, act, { reviewId: 'r1' });
  const past = platformReviewView(onTab(), d, 'p1').toString();
  assert.match(past, /data-table="pastReviews"[\s\S]*?<th data-col="notes"[\s\S]*?Additional notes[\s\S]*?Spares list out of date/);
  const done = platformReviewView(onTab({ reviewId: 'r1' }), d, 'p1').toString();
  assert.match(done, /data-table="reviewRecord"[\s\S]*?>Review note</);
});
