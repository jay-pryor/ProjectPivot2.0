import { html } from '../html.js';
import { dataAttrs, option, go, reviewTag, changeDetail, idTag } from './common.js';
import { dataTable, shownRows } from './table.js';
import { openItems, upcomingReviews, platformCards, attentionItems } from '../../core/queries.js';
import { BANDS } from '../../core/matrix.js';
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

/** The Owner chooser: me, each other profile, everyone. @param {any} state */
function ownerPicker(state) {
  const owner = state.homeOwner || 'me';
  return html`<label class="owner-pick">Owner <select name="ownerId" ${dataAttrs({ change: 'setHomeOwner' })}>
        ${option('me', 'Me', owner)}${state.profiles.filter((/** @type {any} */ p) => p.id !== state.profileId).map((/** @type {any} */ p) => option(p.id, p.name, owner))}${option('everyone', 'Everyone', owner)}
      </select></label>`;
}

/**
 * Open items: every open item of one owner's platforms (or everyone's) as full tables, with
 * sorting, filters and Acknowledge all shown. Reached from the Home dashboard.
 * @param {any} state @param {Data} data
 */
export function openItemsView(state, data) {
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
  return html`<p>${go('← Home', 'home')}</p>
    <div class="head"><h1>Open items</h1>${ownerPicker(state)}</div>
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
          { key: 'missing', label: 'Missing', width: 280, minWidth: 140, value: (r) => r.missing.join(', '),
            render: (r) => r.missing.join(', ') },
        ],
      })}</section>
    </article>`;
}

/** How many "Needs attention" shows before See all. */
export const ATTENTION_LIMIT = 8;

const CHIP = { review: ['Review', 'chip-review'], change: ['Change', 'chip-change'], control: ['Control', 'chip-control'], rating: ['Rating', 'chip-rating'] };

/** @param {any} state @param {Data} data @param {any} item from attentionItems */
function attentionRow(state, data, item) {
  const [word, cls] = CHIP[/** @type {keyof typeof CHIP} */ (item.type)];
  const chip = html`<span class="chip ${cls}">${word}</span>`;
  if (item.type === 'review') {
    return html`<li>${chip}<span class="what">${item.platform.name} review overdue since ${day(item.due)}</span>${go('Review →', 'platform', { id: item.platform.id, tab: 'reviews' })}</li>`;
  }
  if (item.type === 'change') {
    const first = item.entry.items[0];
    const subject = first ? recordName(first.kind, get(data, first.kind, first.id)) : '';
    return html`<li>${chip}<span class="what">${item.entry.action}: ${subject} <span class="muted">· ${profileName(state, item.entry.by)} on ${item.platform.name}</span></span>
      <button type="button" class="small" ${dataAttrs({ action: 'acknowledge', 'entry-id': item.entry.id, 'platform-id': item.platform.id })}>Acknowledge</button></li>`;
  }
  if (item.type === 'control') {
    return html`<li>${chip}<span class="what">${item.control.title} on ${item.platform.name} <span class="muted">· ${hazardLabel(item.hazard)} ${item.hazard.title}</span></span>${go('Decide →', 'platform', { id: item.platform.id })}</li>`;
  }
  const missing = `no ${item.missing.join(', ')} rating`;
  return html`<li>${chip}<span class="what">${hazardLabel(item.hazard)} ${item.hazard.title} on ${item.platform.name} <span class="muted">· ${missing}</span></span>${go('Rate →', 'platform', { id: item.platform.id })}</li>`;
}

/** A bar of a platform's hazards by residual band, highest first. @param {Record<string, number>} bands */
function riskBar(bands) {
  const present = BANDS.filter((b) => bands[b]);
  const words = present.map((b) => `${bands[b]} ${b === 'Uncategorised' ? 'unrated' : b}`).join(' · ');
  return html`<span class="riskbar">${present.map((b) => html`<span class="band-${b.toLowerCase().replace(/\s+/g, '-')}" style="flex:${bands[b]}" title="${bands[b]} ${b}"></span>`)}</span>
    <span class="muted small-text">${words || 'No hazards yet'}</span>`;
}

/**
 * The Home dashboard: headline counts, what needs attention now, reviews coming up, and a card
 * per platform, for one owner (or everyone).
 * @param {any} state @param {Data} data
 */
export function homeView(state, data) {
  const ownerId = homeOwnerId(state);
  const items = openItems(data, state.today, ownerId);
  const attention = attentionItems(items);
  const overdue = items.reviews.filter((r) => r.state === 'overdue').length;
  /** @param {number} n @param {string} one @param {string} many @param {string} [tone] */
  const tile = (n, one, many, tone = '') => html`<button type="button" class="tile${n && tone ? ` ${tone}` : ''}" ${dataAttrs({ action: 'go', view: 'openItems' })}><b>${n}</b><span>${n === 1 ? one : many}</span></button>`;
  const upcoming = upcomingReviews(data, state.today, ownerId);
  const cards = platformCards(data, state.today, ownerId);
  const owner = state.homeOwner || 'me';
  const heading = owner === 'everyone' ? 'Platforms' : ownerId === state.profileId ? 'My platforms' : `${profileName(state, ownerId)}’s platforms`;
  const more = attention.length > ATTENTION_LIMIT ? go(`See all ${attention.length} →`, 'openItems') : attention.length ? go('Open items →', 'openItems') : '';
  return html`<div class="head"><h1>Home</h1>${ownerPicker(state)}</div>
    <div class="tiles">
      ${tile(items.acks.length, 'change to acknowledge', 'changes to acknowledge')}
      ${tile(overdue, 'review overdue', 'reviews overdue', 'bad')}
      ${tile(items.awaiting.length, 'control awaiting', 'controls awaiting', 'warn')}
      ${tile(items.unrated.length, 'hazard unrated', 'hazards unrated')}
    </div>
    <div class="dash-cols">
      <section class="panel"><h2>Needs attention</h2>
        ${attention.length
          ? html`<ul class="attn">${attention.slice(0, ATTENTION_LIMIT).map((i) => attentionRow(state, data, i))}</ul><div class="panel-more">${more}</div>`
          : html`<p class="muted">Nothing needs attention.</p>`}
      </section>
      <section class="panel"><h2>Coming up</h2>
        ${upcoming.length
          ? html`<ul class="upcoming">${upcoming.map((r) => html`<li><span class="date">${r.due ? day(r.due) : '—'}</span><span class="what">${go(r.platform.name, 'platform', { id: r.platform.id, tab: 'reviews' })} review${reviewTag(r.state)}${r.open ? html` <span class="tag">In progress</span>` : ''}</span></li>`)}</ul>`
          : html`<p class="muted">No reviews due in the next 90 days.</p>`}
      </section>
    </div>
    <h2 class="dash-h">${heading}</h2>
    ${cards.length ? html`<div class="pcards">${cards.map((c) => html`<button type="button" class="pcard" ${dataAttrs({ action: 'go', view: 'platform', id: c.platform.id })}>
        <span class="pcard-h"><strong>${c.platform.name}</strong>${reviewTag(c.state)}${c.open ? html` <span class="tag">Review in progress</span>` : ''}</span>
        ${owner === 'everyone' ? html`<span class="muted">${profileName(state, c.platform.ownerId)}</span>` : ''}
        ${riskBar(c.bands.personnel)}
        <span>${count(c.hazards, 'hazard', 'hazards')} · ${c.awaiting} awaiting · ${count(c.acks, 'change', 'changes')}</span>
        <span class="muted">${c.due ? `Due ${day(c.due)}` : 'No review schedule'}${c.lastReviewed ? ` · last ${day(c.lastReviewed)}` : ''}</span>
      </button>`)}</div>` : html`<p class="muted">No platforms.</p>`}`;
}
