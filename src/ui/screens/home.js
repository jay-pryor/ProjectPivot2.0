import { html } from '../html.js';
import { dataAttrs, option, go, reviewTag, changeDetail, idTag } from './common.js';
import { dataTable, shownRows } from './table.js';
import { openItems } from '../../core/queries.js';
import { get } from '../../core/data.js';
import { hazardLabel } from '../../core/ids.js';
import { profileName, when, day, recordName, KIND_LABEL } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** @param {number} n @param {string} one @param {string} many */
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Whose items Home shows: the active profile for "me", nobody in particular (null) for everyone. @param {any} state */
export function homeOwnerId(state) {
  const o = state.homeOwner || 'me';
  return o === 'everyone' ? null : o === 'me' ? state.profileId : o;
}

/** @param {Data} data @param {any} entry what the change did, record by record */
function entryDetail(data, entry) {
  return html`<ul class="plain">${entry.items.map((/** @type {any} */ i) => html`<li><strong>${KIND_LABEL[/** @type {keyof typeof KIND_LABEL} */ (i.kind)] ?? i.kind}: ${recordName(i.kind, get(data, i.kind, i.id))}</strong> ${changeDetail(i)}</li>`)}</ul>`;
}

/** @param {any} p a platform @param {string} [tab] */
const platformLink = (p, tab) => go(p.name, 'platform', { id: p.id, ...(tab ? { tab } : {}) });

/**
 * The Home page: what is left to do on one owner's platforms (or everyone's).
 * @param {any} state @param {Data} data
 */
export function homeView(state, data) {
  const owner = state.homeOwner || 'me';
  const items = openItems(data, state.today, homeOwnerId(state));
  const platformOptions = [...new Map(items.acks.map((a) => [a.platform.id, a.platform.name]))];
  const ackSpec = {
    id: 'homeAcks',
    rowKey: (/** @type {any} */ r) => `${r.entry.id}|${r.platform.id}`,
    rows: items.acks,
    empty: 'Nothing to acknowledge.',
    columns: [
      { key: 'when', label: 'When', width: 200, minWidth: 150, value: (/** @type {any} */ r) => r.entry.at, render: (/** @type {any} */ r) => when(r.entry.at) },
      { key: 'who', label: 'Who', width: 200, minWidth: 110, value: (/** @type {any} */ r) => profileName(state, r.entry.by), filter: /** @type {const} */ ('text') },
      { key: 'platform', label: 'Platform', width: 240, minWidth: 130, value: (/** @type {any} */ r) => r.platform.name, filter: /** @type {const} */ ('select'),
        options: /** @type {[string, string][]} */ (platformOptions), match: (/** @type {any} */ r, /** @type {string} */ v) => r.platform.id === v, render: (/** @type {any} */ r) => platformLink(r.platform) },
      { key: 'what', label: 'What', width: 260, minWidth: 140, value: (/** @type {any} */ r) => r.entry.action, filter: /** @type {const} */ ('text') },
      { key: 'detail', label: 'Changes', width: 640, minWidth: 260, sortable: false, render: (/** @type {any} */ r) => entryDetail(data, r.entry) },
      { key: 'ack', label: '', width: 170, minWidth: 140, sortable: false,
        render: (/** @type {any} */ r) => html`<button type="button" ${dataAttrs({ action: 'acknowledge', 'entry-id': r.entry.id, 'platform-id': r.platform.id })}>Acknowledge</button>` },
    ],
  };
  const keys = shownRows(state, ackSpec).map((r) => `${r.entry.id}|${r.platform.id}`);
  const overdue = items.reviews.filter((r) => r.state === 'overdue').length;
  const dueSoon = items.reviews.filter((r) => r.state === 'dueSoon').length;
  const summary = [
    count(items.acks.length, 'change to acknowledge', 'changes to acknowledge'),
    count(overdue, 'review overdue', 'reviews overdue'),
    ...(dueSoon ? [count(dueSoon, 'review due soon', 'reviews due soon')] : []),
    count(items.awaiting.length, 'control awaiting', 'controls awaiting'),
    count(items.unrated.length, 'hazard unrated', 'hazards unrated'),
  ].join(' · ');
  const hazardCell = (/** @type {any} */ r) => html`<span class="id">${idTag(hazardLabel(r.hazard))}</span> ${go(r.hazard.title, 'hazard', { id: r.hazard.id })}`;
  return html`<div class="head"><h1>Home</h1>
      <label class="owner-pick">Owner <select name="ownerId" ${dataAttrs({ change: 'setHomeOwner' })}>
        ${option('me', 'Me', owner)}${state.profiles.filter((/** @type {any} */ p) => p.id !== state.profileId).map((/** @type {any} */ p) => option(p.id, p.name, owner))}${option('everyone', 'Everyone', owner)}
      </select></label></div>
    <p class="muted home-summary">${summary}</p>
    <article class="doc">
      <div class="home-h"><h2>Changes to acknowledge</h2>${keys.length ? html`<button type="button" ${dataAttrs({ action: 'acknowledgeAll', keys: keys.join(',') })}>Acknowledge all shown (${keys.length})</button>` : ''}</div>
      <section class="block">${dataTable(state, ackSpec)}</section>
      <div class="home-h"><h2>Reviews</h2></div>
      <section class="block">${dataTable(state, {
        id: 'homeReviews', rowKey: (r) => r.platform.id, rows: items.reviews, empty: 'No reviews due.',
        columns: [
          { key: 'platform', label: 'Platform', width: 360, minWidth: 160, value: (r) => r.platform.name, render: (r) => platformLink(r.platform, 'reviews') },
          { key: 'due', label: 'Next due', width: 300, minWidth: 160, value: (r) => r.due, render: (r) => (r.due ? html`${day(r.due)}${reviewTag(r.state)}` : '—') },
          { key: 'last', label: 'Last reviewed', width: 240, minWidth: 140, value: (r) => r.lastReviewed, render: (r) => (r.lastReviewed ? day(r.lastReviewed) : html`<span class="muted">Never</span>`) },
          { key: 'open', label: 'Review', width: 220, minWidth: 120, value: (r) => (r.open ? 'In progress' : ''), render: (r) => (r.open ? 'In progress' : '') },
        ],
      })}</section>
      <div class="home-h"><h2>Controls awaiting a decision</h2></div>
      <section class="block">${dataTable(state, {
        id: 'homeAwaiting', rowKey: (r) => `${r.platform.id}|${r.hazard.id}|${r.control.id}`, rows: items.awaiting, empty: 'No controls awaiting a decision.',
        columns: [
          { key: 'platform', label: 'Platform', width: 300, minWidth: 140, value: (r) => r.platform.name, filter: 'text', render: (r) => platformLink(r.platform) },
          { key: 'hazard', label: 'Hazard', width: 520, minWidth: 200, value: (r) => `${hazardLabel(r.hazard)} ${r.hazard.title}`, filter: 'text', render: hazardCell },
          { key: 'control', label: 'Control', width: 520, minWidth: 200, value: (r) => r.control.title, filter: 'text', render: (r) => go(r.control.title, 'control', { id: r.control.id }) },
        ],
      })}</section>
      <div class="home-h"><h2>Hazards without ratings</h2></div>
      <section class="block">${dataTable(state, {
        id: 'homeUnrated', rowKey: (r) => `${r.platform.id}|${r.hazard.id}`, rows: items.unrated, empty: 'Every hazard is rated.',
        columns: [
          { key: 'platform', label: 'Platform', width: 300, minWidth: 140, value: (r) => r.platform.name, filter: 'text', render: (r) => platformLink(r.platform) },
          { key: 'hazard', label: 'Hazard', width: 520, minWidth: 200, value: (r) => `${hazardLabel(r.hazard)} ${r.hazard.title}`, filter: 'text', render: hazardCell },
          { key: 'missing', label: 'Missing', width: 280, minWidth: 140, value: (r) => r.missing,
            render: (r) => ({ both: 'Initial and residual', initial: 'Initial', residual: 'Residual' })[/** @type {'both'} */ (r.missing)] },
        ],
      })}</section>
    </article>`;
}
