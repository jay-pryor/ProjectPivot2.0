import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformsView, platformView } from '../../src/ui/screens/platforms.js';
import { platformReviewView } from '../../src/ui/screens/reviews.js';
import { policyData } from './screens-reviews-tab.test.js';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { day } from '../../src/ui/names.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { entries } from '../../src/core/history.js';
import { reportsView } from '../../src/ui/screens/reports.js';
import { createReport } from '../../src/core/ops/reports.js';
import { seed, act, scheduleFixed, seeDue, beginPlatformReview, finishPlatformReview } from '../helpers.js';
import { ids } from '../../src/core/ids.js';

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
  assert.match(out, /aria-label="Review rule"><h3 class="dash-card-h">Review rule<\/h3><div class="rv-big">Fixed · every 6 months<\/div>\s*<div class="rv-line muted">Counted from 1 Mar 2026<\/div>/);
  assert.match(out, /<button type="button" class="small" data-action="editRule" data-platform-id="p1">Edit review rule<\/button>/);
  assert.doesNotMatch(out, /name="kind"|data-change="setRuleDraft"/, 'nothing to change until Edit');
  assert.match(out, /<div class="dash-grid three-even review-cards">[\s\S]*?aria-label="Review rule"[\s\S]*?class="dash-card rv-card rv-overdue" aria-label="Next review due"[\s\S]*?1 Sep 2026[\s\S]*?Every 6 months[\s\S]*?\d+ days? overdue[\s\S]*?aria-label="Last reviewed"[\s\S]*?Never[\s\S]*?class="primary rv-action" data-action="beginReview" data-platform-id="p1">Start review/);
});

test('editing the rule shows a form of the draft, with Confirm and Cancel', () => {
  const draft = { platformId: 'p1', kind: 'fixed', value: '2', unit: 'years', policyId: null, start: '2026-03-01' };
  const out = platformReviewView({ ...onTab(), ruleDraft: draft }, data(), 'p1').toString();
  assert.match(out, /<select name="kind" aria-label="Review rule" data-change="setRuleDraft" data-platform-id="p1">[\s\S]*?<option value="fixed" selected>/);
  assert.match(out, /<input type="number" name="value" value="2"[^>]*data-change="setRuleDraft" data-platform-id="p1">\s*<select name="unit"[^>]*data-change="setRuleDraft"[^>]*>[\s\S]*?<option value="years" selected>/);
  assert.match(out, /<input type="date" name="start" value="2026-03-01" data-change="setRuleDraft" data-platform-id="p1">/);
  assert.doesNotMatch(out, /<option value="policy"/, 'no policies yet, so no policy choice');
  assert.match(out, /<button type="button" class="primary small" data-action="confirmRule" data-platform-id="p1">Confirm<\/button>\s*<button type="button" class="small" data-action="cancelRule">Cancel<\/button>/);
  assert.doesNotMatch(out, /data-action="editRule"/);
  const other = platformReviewView({ ...onTab(), ruleDraft: { ...draft, platformId: 'p2' } }, data(), 'p1').toString();
  assert.doesNotMatch(other, /data-change="setRuleDraft"/, 'a draft for another platform is not shown here');
});

test('without a rule, the rule card says so, offers Edit, and the due card says why there is no date', () => {
  const out = platformReviewView(onTab(), seed(), 'p1').toString();
  assert.match(out, /aria-label="Review rule"><h3 class="dash-card-h">Review rule<\/h3><div class="rv-big muted">No schedule<\/div>/);
  assert.match(out, /data-action="editRule" data-platform-id="p1">Edit review rule/);
  assert.match(out, /Set a rule to have one/);
  const draft = { platformId: 'p1', kind: 'none', value: '1', unit: 'years', policyId: null, start: '2026-09-28' };
  const editing = platformReviewView({ ...onTab(), ruleDraft: draft }, seed(), 'p1').toString();
  assert.match(editing, /<option value="none" selected>No schedule<\/option>/);
  assert.doesNotMatch(editing, /name="start"|name="value"/, 'no schedule, nothing more to give');
});

test('a policy rule names its policy and says what sets its period; editing it chooses the policy', () => {
  const out = platformReviewView(onTab(), policyData(), 'p1').toString();
  assert.match(out, /<div class="rv-big">Standard \(policy\)<\/div>/);
  assert.match(out, /data-action="showPolicy" data-id="pol1">Edit policy →/);
  assert.match(out, /Every 6 months, because HAZ-\d+ residual personnel: Serious/);
  const draft = { platformId: 'p1', kind: 'policy', value: '1', unit: 'years', policyId: 'pol1', start: '2026-06-01' };
  const editing = platformReviewView({ ...onTab(), ruleDraft: draft }, policyData(), 'p1').toString();
  assert.match(editing, /<option value="policy" selected>Review policy<\/option>/);
  assert.match(editing, /<select name="policyId"[^>]*data-change="setRuleDraft" data-platform-id="p1"><option value="pol1" selected>Standard/);
  assert.doesNotMatch(editing, /name="value"/);
});

test('a moved review date shows on the page with Acknowledge', () => {
  let d = data();
  d = seeDue(d, 'p1', '2027-01-01');
  const out = platformReviewView(onTab(), d, 'p1').toString();
  assert.match(out, /<span class="tag review-moved urgent">Moved from 1 Jan 2027<\/span>[\s\S]*?data-action="acknowledgeReviewDate" data-platform-id="p1"/);
});

test('with a review open, the page shows the rule and a Resume link to the workflow, and no Start button', () => {
  const d = assignNumbers(beginPlatformReview(data(), act, { id: 'r1', platformId: 'p1' }));
  const out = platformReviewView(onTab(), d, 'p1').toString();
  assert.match(out, /data-action="editRule"[\s\S]*?WF-001 in progress/, 'the rule above the review');
  assert.match(out, /data-view="workflow"/);
  assert.doesNotMatch(out, /data-action="beginReview"/);
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

test('the platform History tab leaves out a review workflow’s own steps but keeps completing', () => {
  let d = beginPlatformReview(data(), act, { id: 'r1', platformId: 'p1' });
  d = finishPlatformReview(d, act, { workflowId: 'r1' });
  assert.ok(entries(d).some((e) => e.action === 'Check workflow step'));
  const out = platformView({ ...state, view: { name: 'platform', id: 'p1', tab: 'history' } }, d, 'p1').toString();
  assert.match(out, /Complete review/);
  assert.doesNotMatch(out, /Check workflow step|Start workflow/);
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

test('checkboxes are the accent orange', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');
  assert.match(css, /input\[type="checkbox"\], input\[type="radio"\] \{ accent-color: var\(--p-accent\); \}/);
});

test('a completed review shows its workflow’s check grid, and past reviews link the WF number', () => {
  let d = beginPlatformReview(data(), act, { id: 'w1', platformId: 'p1' });
  d = assignNumbers(finishPlatformReview(d, act, { workflowId: 'w1' }));
  const page = platformReviewView(onTab(), d, 'p1').toString();
  assert.match(page, /<th data-col="wf"/);
  assert.match(page, /WF-001/);
  const opened = platformReviewView({ ...onTab(), view: { name: 'platformReview', id: 'p1', reviewId: ids.workflowReview('w1') } }, d, 'p1').toString();
  assert.match(opened, /class="wf-grid"/);
});

test('a review recorded before workflows says so', () => {
  const d = data();
  d.records.review.old = { id: 'old', status: 'live', createdBy: 'u1', createdAt: act.at, updatedBy: 'u1', updatedAt: act.at, platformId: 'p1', workflowId: null, state: 'completed', outcome: 'Fine', notes: '', dueBefore: '2026-03-01', dueAfter: '2026-09-01', completedBy: 'u1', completedAt: act.at };
  const out = platformReviewView({ ...onTab(), view: { name: 'platformReview', id: 'p1', reviewId: 'old' } }, d, 'p1').toString();
  assert.match(out, /Recorded before workflows/);
  assert.match(out, /Fine/);
});
