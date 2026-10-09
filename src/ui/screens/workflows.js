import { html } from '../html.js';
import { dataAttrs, option, go, idTag } from './common.js';
import { dataTable } from './table.js';
import { get, live } from '../../core/data.js';
import { workflowLabel } from '../../core/ids.js';
import { openReview } from '../../core/queries.js';
import { scheduleOf } from '../../core/schedule.js';
import { addDays } from '../../core/time.js';
import { openWorkflows, endedWorkflows, workflowProgress, lastActivity, WORKFLOW_TYPES, typeName } from '../../core/workflows.js';
import { DEFAULT_WORKFLOWS_PREFS, RECENT_DAYS } from '../workflows-prefs.js';
import { profileName, when, day } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** Whose workflows the tab shows: everyone as null. @param {any} state */
export function workflowsOwnerId(state) {
  const o = state.workflowsPrefs?.owner || 'everyone';
  return o === 'everyone' ? null : o === 'me' ? state.profileId : o;
}

/** What a workflow is about, as a person reads it. @param {Data} data @param {any} wf */
export function workflowSubject(data, wf) {
  return get(data, 'platform', wf.platformId)?.name ?? 'A deleted platform';
}

/** A thin bar of how many checks are done, and the figures. @param {number} done @param {number} total */
export function progressBar(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 100;
  return html`<span class="wf-progress"><span class="wf-bar" role="img" aria-label="${done} of ${total} checks done"><span style="width:${pct}%"></span></span><span class="muted">${done}/${total}</span></span>`;
}

/** A dropdown's opening choice, saying what to pick; it cannot be chosen, so the form needs a real one. @param {string} words */
const NEUTRAL = (words) => html`<option value="" disabled selected>${words}</option>`;

const STATE_RANK = { overdue: 0, dueSoon: 1, ok: 2, none: 3 };

/** @param {any} state @param {Data} data */
function inProgress(state, data) {
  return dataTable(state, {
    id: 'workflowsOpen',
    rowKey: (w) => w.id,
    rows: openWorkflows(data, workflowsOwnerId(state)),
    empty: 'No workflows in progress.',
    rowAttrs: (w) => ({ dblclick: 'go', view: 'workflow', id: w.id }),
    columns: [
      { key: 'no', label: 'No.', width: 110, minWidth: 90, value: (w) => w.number ?? 0, render: (w) => idTag(workflowLabel(w)) },
      { key: 'type', label: 'Workflow', width: 200, minWidth: 140, value: (w) => typeName(w.type) },
      { key: 'subject', label: 'Subject', width: 220, minWidth: 140, value: (w) => workflowSubject(data, w), filter: 'text' },
      { key: 'owner', label: 'Owner', width: 160, minWidth: 100, value: (w) => profileName(state, w.ownerId) },
      { key: 'progress', label: 'Progress', width: 220, minWidth: 160, sortable: false, render: (w) => { const p = workflowProgress(data, w); return progressBar(p.done, p.total); } },
      { key: 'started', label: 'Started', width: 150, minWidth: 110, value: (w) => w.createdAt, render: (w) => day(w.createdAt) },
      { key: 'last', label: 'Last activity', width: 190, minWidth: 130, value: (w) => lastActivity(data, w), render: (w) => when(lastActivity(data, w)) },
      { key: 'go', label: '', width: 120, minWidth: 100, sortable: false, render: (w) => go('Resume →', 'workflow', { id: w.id }) },
    ],
  });
}

/** The card that starts a Platform Review: a platform picker, overdue and due-soon first. @param {any} state @param {Data} data */
function reviewCard(state, data) {
  const rows = live(data, 'platform').map((p) => ({ p, s: scheduleOf(data, p.id, state.today), open: openReview(data, p.id) }))
    .sort((a, b) => (STATE_RANK[/** @type {keyof typeof STATE_RANK} */ (a.s.state)] - STATE_RANK[/** @type {keyof typeof STATE_RANK} */ (b.s.state)]) || String(a.p.name).localeCompare(b.p.name));
  const word = (/** @type {any} */ r) => (r.open ? ` — ${workflowLabel(r.open) === 'TBC' ? 'review' : workflowLabel(r.open)} in progress` : r.s.state === 'overdue' ? ' — overdue' : r.s.state === 'dueSoon' ? ' — due soon' : '');
  return rows.length
    ? html`<form class="wf-start" data-action="beginReview"><div class="wf-fields-col"><select name="platformId" aria-label="Platform to review" required>${NEUTRAL('Select platform…')}${rows.map((r) => option(r.p.id, `${r.p.name}${word(r)}`, ''))}</select></div><button type="submit" class="wf-go">Start <span class="wf-go-arrow" aria-hidden="true">→</span></button></form>`
    : html`<p class="muted">No live platforms to review.</p>`;
}

/** The card that onboards a new platform: its name and owner. @param {any} state */
function onboardCard(state) {
  return html`<form class="wf-start" data-action="onboardPlatform"><div class="wf-fields-col"><input name="name" required placeholder="New platform name" aria-label="New platform name"><select name="ownerId" aria-label="Owner" required>${NEUTRAL('Select owner…')}${state.profiles.map((/** @type {any} */ p) => option(p.id, p.name, ''))}</select></div><button type="submit" class="wf-go">Start <span class="wf-go-arrow" aria-hidden="true">→</span></button></form>`;
}

/** @param {any} state @param {Data} data */
function startCards(state, data) {
  return html`<div class="wf-cards">${WORKFLOW_TYPES.map((t) => html`<section class="dash-card wf-card${t.ready ? '' : ' soon'}" aria-label="${t.name}">
    <h3 class="dash-card-h">${t.name}${t.ready ? '' : html` <span class="tag">Coming soon</span>`}</h3>
    <p class="muted">${t.blurb}</p>
    ${t.type === 'platformReview' ? reviewCard(state, data) : t.type === 'platformOnboarding' ? onboardCard(state) : ''}
  </section>`)}</div>`;
}

/** Completed and cancelled workflows as rows. @param {any} state @param {Data} data @param {string} id @param {any[]} rows */
function endedTable(state, data, id, rows) {
  return dataTable(state, {
    id,
    rowKey: (w) => w.id,
    rows,
    empty: 'None.',
    rowAttrs: (w) => ({ dblclick: 'go', view: 'workflow', id: w.id }),
    columns: [
      { key: 'no', label: 'No.', width: 110, minWidth: 90, value: (w) => w.number ?? 0, render: (w) => go(workflowLabel(w), 'workflow', { id: w.id }) },
      { key: 'type', label: 'Workflow', width: 190, minWidth: 140, value: (w) => typeName(w.type), filter: 'select', options: WORKFLOW_TYPES.map((t) => [t.name, t.name]) },
      { key: 'subject', label: 'Subject', width: 200, minWidth: 140, value: (w) => workflowSubject(data, w), filter: 'text' },
      { key: 'status', label: 'Status', width: 140, minWidth: 110, value: (w) => (w.state === 'completed' ? 'Completed' : 'Cancelled'), filter: 'select', options: [['Completed', 'Completed'], ['Cancelled', 'Cancelled']],
        render: (w) => html`<span class="tag wf-${w.state}">${w.state === 'completed' ? 'Completed' : 'Cancelled'}</span>` },
      { key: 'owner', label: 'Owner', width: 150, minWidth: 100, value: (w) => profileName(state, w.ownerId), filter: 'text' },
      { key: 'by', label: 'Ended by', width: 150, minWidth: 100, value: (w) => profileName(state, w.endedBy) },
      { key: 'ended', label: 'Ended', width: 180, minWidth: 120, value: (w) => w.endedAt, render: (w) => when(w.endedAt) },
      { key: 'started', label: 'Started', width: 150, minWidth: 110, value: (w) => w.createdAt, render: (w) => day(w.createdAt) },
    ],
  });
}

/**
 * The Workflows tab: a dashboard (in progress, start one, recently completed) and the History of
 * every completed or cancelled workflow.
 * @param {any} state @param {Data} data
 */
export function workflowsView(state, data) {
  const tab = state.view?.tab === 'history' ? 'history' : 'dashboard';
  const prefs = state.workflowsPrefs ?? DEFAULT_WORKFLOWS_PREFS;
  const on = (/** @type {string} */ t) => (tab === t ? ' on' : '');
  const tabs = html`<nav class="tabs">${[['dashboard', 'Dashboard'], ['history', 'History']].map(([t, label]) => html`<button type="button" class="tab${on(t)}" ${dataAttrs({ action: 'go', view: 'workflows', tab: t })}>${label}</button>`)}</nav>`;
  const owner = html`<label class="owner-pick">Owner <select name="owner" ${dataAttrs({ change: 'setWorkflowsFilter' })}>
    ${option('everyone', 'Everyone', prefs.owner)}${option('me', 'Me', prefs.owner)}${state.profiles.filter((/** @type {any} */ p) => p.id !== state.profileId).map((/** @type {any} */ p) => option(p.id, p.name, prefs.owner))}</select></label>`;
  const head = html`<div class="head"><h1>Workflows</h1>${owner}</div>${tabs}`;
  const ownerId = workflowsOwnerId(state);
  if (tab === 'history') return html`${head}<section class="block">${endedTable(state, data, 'workflowHistory', endedWorkflows(data, { ownerId }))}</section>`;
  const since = addDays(state.today, -prefs.days);
  const range = html`<select class="window-pick" name="days" aria-label="How far back Recently completed looks" ${dataAttrs({ change: 'setWorkflowsFilter' })}>${RECENT_DAYS.map((n) => option(String(n), n === 365 ? 'Last year' : `Last ${n} days`, String(prefs.days)))}</select>`;
  return html`${head}
    <section class="panel"><h2>In progress</h2>${inProgress(state, data)}</section>
    <h2 class="dash-h">Start a workflow</h2>${startCards(state, data)}
    <section class="panel"><div class="panel-head"><h2>Recently completed</h2>${range}</div>
      ${endedTable(state, data, 'workflowsRecent', endedWorkflows(data, { since, ownerId }))}
      <div class="panel-more">${go('All history →', 'workflows', { tab: 'history' })}</div></section>`;
}
