import { RECEPTORS, RECEPTOR_WORD } from '../../core/receptors.js';
import { html, raw } from '../html.js';
import { dataAttrs, option, go, reviewTag, changeDetail, idTag, favouriteLabel, unfavouriteStar, groupTags } from './common.js';
import { favouritesOf, favouriteLayout, comingUpDays, COMING_UP_WINDOWS } from '../prefs.js';
import { platformImage, statusSelect, rejectionCell } from './platforms.js';
import { dataTable, shownRows } from './table.js';
import { sectionRail } from './dashboard.js';
import { openItems, upcomingReviews, platformCards, attentionItems, groupsOf } from '../../core/queries.js';
import { BANDS } from '../../core/matrix.js';
import { get } from '../../core/data.js';
import { hazardLabel, controlLabel, UNNUMBERED } from '../../core/ids.js';
import { profileName, when, day, recordName, KIND_LABEL } from '../names.js';
import { driverWord } from '../review-words.js';

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
  return html`<ul class="plain">${entry.items.map((/** @type {any} */ i) => html`<li><strong>${KIND_LABEL[/** @type {keyof typeof KIND_LABEL} */ (i.kind)] ?? i.kind}: ${recordName(i.kind, get(data, i.kind, i.id), data)}</strong> ${changeDetail(i)}</li>`)}</ul>`;
}

/** @param {any} p a platform */
const platformLink = (p) => go(p.name, 'platform', { id: p.id });

/** The Owner chooser: me, each other profile, everyone. @param {any} state */
function ownerPicker(state) {
  const owner = state.homeOwner || 'me';
  return html`<label class="owner-pick">Owner <select name="ownerId" ${dataAttrs({ change: 'setHomeOwner' })}>
        ${option('me', 'Me', owner)}${state.profiles.filter((/** @type {any} */ p) => p.id !== state.profileId).map((/** @type {any} */ p) => option(p.id, p.name, owner))}${option('everyone', 'Everyone', owner)}
      </select></label>`;
}

/**
 * Where an open item's action is done, for a double-click on its row: a review (or a moved review
 * date) on the platform's review page; a control's status (to decide, or to implement) on the
 * control's page for that platform, as are its properties; ratings, their justifications and the SFARP
 * considerations on the hazard's page for that platform. A change is
 * acknowledged in the list itself, so its row opens the platform's history, where the change sits
 * in context.
 * @param {'change' | 'review' | 'schedule' | 'dateMoved' | 'control' | 'implement' | 'controlGap' | 'rating' | 'justify' | 'sfarp'} type
 * @param {{ platform: any, hazard?: any, control?: any }} item
 * @returns {Record<string, string>}
 */
export function whereToAct(type, item) {
  const on = `p:${item.platform.id}`;
  if (type === 'control' || type === 'implement' || type === 'controlGap') return { view: 'control', id: item.control.id, tab: on };
  if (type === 'rating' || type === 'justify' || type === 'sfarp') return { view: 'hazard', id: item.hazard.id, tab: on };
  if (type === 'change') return { view: 'platform', id: item.platform.id, tab: 'history' };
  return { view: 'platformReview', id: item.platform.id };
}

/** A row's double-click to where its action is done. @param {Parameters<typeof whereToAct>[0]} type */
const actRow = (type) => (/** @type {any} */ r) => ({ dblclick: 'go', ...whereToAct(type, r) });

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
    rowAttrs: actRow('change'),
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
  const hazardCell = (/** @type {any} */ r) => html`<span class="id">${idTag(hazardLabel(r.hazard))}</span> ${go(r.hazard.title, 'hazard', { id: r.hazard.id })}`;
  const open = state.sections?.openItems === undefined ? 'acks' : state.sections.openItems;
  /** A headline count that opens its section below. @param {string} key @param {number} n @param {string} one @param {string} many @param {string} [tone] */
  // Any count above nought is highlighted (overdue reviews in red, the rest orange); nought stays plain.
  const tile = (key, n, one, many, tone = 'warn') => html`<button type="button" class="tile${n && tone ? ` ${tone}` : ''}${open === key ? ' on' : ''}" ${dataAttrs({ action: 'showSection', page: 'openItems', section: key, keep: 'true' })}><b>${n}</b><span>${n === 1 ? one : many}</span></button>`;
  return html`<div class="head"><h1>Open items</h1>${ownerPicker(state)}</div>
    ${teamLine(state, data)}
    <div class="tiles">
      ${totalTile(attentionItems(items).length)}
      ${tile('acks', items.acks.length, 'to acknowledge', 'to acknowledge')}
      ${tile('reviews', overdue, 'review overdue', 'reviews overdue', 'bad')}
      ${tile('moved', items.dateMoved.length, 'date moved', 'dates moved', items.dateMoved.some((m) => m.urgent) ? 'bad' : 'warn')}
      ${tile('awaiting', items.awaiting.length, 'awaiting decision', 'awaiting decision', 'warn')}
      ${tile('implement', items.toImplement.length, 'to implement', 'to implement')}
      ${tile('unrated', items.unrated.length, 'unrated', 'unrated')}
      ${tile('unjustified', items.unjustified.length, 'unjustified rating', 'unjustified ratings')}
      ${tile('controlGaps', items.controlGaps.length, 'control incomplete', 'controls incomplete')}
      ${tile('sfarpGaps', items.sfarpGaps.length, 'SFARP incomplete', 'SFARP incomplete')}
    </div>
    <p class="muted">Double-click a row to go straight to where it is dealt with.</p>
    ${sectionRail(state, 'openItems', [
      { key: 'acks', label: 'Changes to acknowledge', icon: 'acks', badge: items.acks.length, body: () => html`<div class="home-h"><h2>Changes to acknowledge</h2>${keys.length ? html`<button type="button" ${dataAttrs({ action: 'acknowledgeAll', keys: keys.join(',') })}>Acknowledge all shown (${keys.length})</button>` : ''}</div>
        <section class="block">${dataTable(state, ackSpec)}</section>` },
      { key: 'reviews', label: 'Reviews', icon: 'calendar', badge: items.reviews.length, body: () => html`<h2>Reviews</h2><section class="block">${dataTable(state, {
        id: 'homeReviews', rowKey: (r) => r.platform.id, rows: items.reviews, empty: 'No reviews due.', rowAttrs: actRow('review'),
        columns: [
          { key: 'platform', label: 'Platform', width: 360, minWidth: 160, value: (r) => r.platform.name, render: (r) => go(r.platform.name, 'platformReview', { id: r.platform.id }) },
          { key: 'due', label: 'Next due', width: 300, minWidth: 160, value: (r) => r.due, render: (r) => (r.due ? html`${day(r.due)}${reviewTag(r.state)}` : html`<span class="tag">No schedule</span>`) },
          { key: 'last', label: 'Last reviewed', width: 240, minWidth: 140, value: (r) => r.lastReviewed, render: (r) => (r.lastReviewed ? day(r.lastReviewed) : html`<span class="muted">Never</span>`) },
          { key: 'open', label: 'Review', width: 220, minWidth: 160, value: (r) => (r.open ? 'In progress' : ''), render: reviewButton },
        ],
      })}</section>` },
      { key: 'moved', label: 'Review dates moved', icon: 'calendar', badge: items.dateMoved.length, body: () => html`<h2>Review dates moved</h2><section class="block">${dataTable(state, {
        id: 'homeMoved', rowKey: (r) => r.platform.id, rows: items.dateMoved, empty: 'No review dates have moved.', rowAttrs: actRow('dateMoved'),
        columns: [
          { key: 'platform', label: 'Platform', width: 300, minWidth: 160, value: (r) => r.platform.name, render: (r) => go(r.platform.name, 'platformReview', { id: r.platform.id }) },
          { key: 'seen', label: 'Was due', width: 200, minWidth: 130, value: (r) => r.seen, render: (r) => day(r.seen) },
          { key: 'due', label: 'Now due', width: 260, minWidth: 150, value: (r) => r.due, render: (r) => html`${day(r.due)}${r.urgent ? html` <span class="chip chip-urgent">Urgent</span>` : ''}` },
          { key: 'why', label: 'Set by', width: 380, minWidth: 180, value: (r) => driverWord(data, r.driver) },
          { key: 'ack', label: '', width: 170, minWidth: 140, sortable: false,
            render: (r) => html`<button type="button" ${dataAttrs({ action: 'acknowledgeReviewDate', 'platform-id': r.platform.id })}>Acknowledge</button>` },
        ],
      })}</section>` },
      { key: 'awaiting', label: 'Controls awaiting status decision', icon: 'controls', badge: items.awaiting.length, body: () => html`<h2>Controls awaiting a status decision</h2>
        <section class="block">${dataTable(state, {
        id: 'homeAwaiting', rowKey: (r) => `${r.platform.id}|${r.hazard.id}|${r.control.id}`, rows: items.awaiting, empty: 'No controls awaiting a status decision.',
        rowAttrs: actRow('control'),
        columns: [
          { key: 'platform', label: 'Platform', width: 220, minWidth: 140, value: (r) => r.platform.name, filter: 'text', render: (r) => platformLink(r.platform) },
          { key: 'hazard', label: 'Hazard', width: 380, minWidth: 200, value: (r) => `${hazardLabel(r.hazard)} ${r.hazard.title}`, filter: 'text', render: hazardCell },
          { key: 'control', label: 'Control', width: 320, minWidth: 200, value: (r) => r.control.title, filter: 'text', render: (r) => go(r.control.title, 'control', { id: r.control.id, tab: `p:${r.platform.id}` }) },
          // Choosing Rejected asks why, in place, before it is set.
          { key: 'status', label: 'Status', width: 250, minWidth: 180, sortable: false,
            render: (r) => html`<div class="await-status">${statusSelect(data, { hazardId: r.hazard.id, control: r.control, platformId: r.platform.id, state: 'recommended' })}${rejectionCell(state, { control: r.control, state: 'recommended', ruling: null }, r.hazard.id, r.platform.id, r.platform.name)}</div>` },
        ],
      })}</section>` },
      { key: 'implement', label: 'Controls to implement', icon: 'existing', badge: items.toImplement.length, body: () => html`<h2>Controls to implement</h2>
        <p class="muted">Additional controls we own on the platform and have planned.</p><section class="block">${dataTable(state, {
        id: 'homeImplement', rowKey: (r) => `${r.platform.id}|${r.hazard.id}|${r.control.id}`, rows: items.toImplement, empty: 'Nothing planned for us to implement.', rowAttrs: actRow('implement'),
        columns: [
          { key: 'platform', label: 'Platform', width: 300, minWidth: 140, value: (r) => r.platform.name, filter: 'text', render: (r) => platformLink(r.platform) },
          { key: 'hazard', label: 'Hazard', width: 520, minWidth: 200, value: (r) => `${hazardLabel(r.hazard)} ${r.hazard.title}`, filter: 'text', render: hazardCell },
          { key: 'control', label: 'Control', width: 520, minWidth: 200, value: (r) => r.control.title, filter: 'text', render: (r) => go(r.control.title, 'control', { id: r.control.id }) },
        ],
      })}</section>` },
      { key: 'unrated', label: 'Hazards without ratings', icon: 'initial', badge: items.unrated.length, body: () => html`<h2>Hazards without ratings</h2><section class="block">${dataTable(state, {
        id: 'homeUnrated', rowKey: (r) => `${r.platform.id}|${r.hazard.id}`, rows: items.unrated, empty: 'Every hazard is rated.', rowAttrs: actRow('rating'),
        columns: [
          { key: 'platform', label: 'Platform', width: 300, minWidth: 140, value: (r) => r.platform.name, filter: 'text', render: (r) => platformLink(r.platform) },
          { key: 'hazard', label: 'Hazard', width: 520, minWidth: 200, value: (r) => `${hazardLabel(r.hazard)} ${r.hazard.title}`, filter: 'text', render: hazardCell },
          { key: 'missing', label: 'Missing', width: 280, minWidth: 140, value: (r) => r.missing.join(', '),
            render: (r) => r.missing.join(', ') },
        ],
      })}</section>` },
      { key: 'unjustified', label: 'Ratings without justification', icon: 'analysis', badge: items.unjustified.length, body: () => html`<h2>Ratings without justification</h2>
        <p class="muted">Risks rated with neither the likelihood nor the consequence justified.</p><section class="block">${dataTable(state, {
        id: 'homeUnjustified', rowKey: (r) => `${r.platform.id}|${r.hazard.id}`, rows: items.unjustified, empty: 'Every rating is justified.', rowAttrs: actRow('justify'),
        columns: [
          { key: 'platform', label: 'Platform', width: 300, minWidth: 140, value: (r) => r.platform.name, filter: 'text', render: (r) => platformLink(r.platform) },
          { key: 'hazard', label: 'Hazard', width: 520, minWidth: 200, value: (r) => `${hazardLabel(r.hazard)} ${r.hazard.title}`, filter: 'text', render: hazardCell },
          { key: 'missing', label: 'Not justified', width: 280, minWidth: 140, value: (r) => r.missing.join(', '),
            render: (r) => r.missing.join(', ') },
        ],
      })}</section>` },
      { key: 'controlGaps', label: 'Control properties not set', icon: 'controls', badge: items.controlGaps.length, body: () => html`<h2>Control properties not set</h2>
        <p class="muted">Controls used on the platform with a tier, origin, description or implemented by not set.</p><section class="block">${dataTable(state, {
        id: 'homeControlGaps', rowKey: (r) => `${r.platform.id}|${r.control.id}`, rows: items.controlGaps, empty: 'Every control has its properties set.', rowAttrs: actRow('controlGap'),
        columns: [
          { key: 'platform', label: 'Platform', width: 300, minWidth: 140, value: (r) => r.platform.name, filter: 'text', render: (r) => platformLink(r.platform) },
          { key: 'control', label: 'Control', width: 520, minWidth: 200, value: (r) => `${controlLabel(r.control)} ${r.control.title}`, filter: 'text',
            render: (r) => html`<span class="id">${idTag(controlLabel(r.control))}</span> ${go(r.control.title, 'control', { id: r.control.id, tab: `p:${r.platform.id}` })}` },
          { key: 'missing', label: 'Not set', width: 280, minWidth: 140, value: (r) => r.missing.join(', ') },
        ],
      })}</section>` },
      { key: 'sfarpGaps', label: 'SFARP incomplete', icon: 'sfarp', badge: items.sfarpGaps.length, body: () => html`<h2>SFARP incomplete</h2>
        <p class="muted">Hazards on a platform with a SFARP justification, conclusion or conditions of validity empty.</p><section class="block">${dataTable(state, {
        id: 'homeSfarpGaps', rowKey: (r) => `${r.platform.id}|${r.hazard.id}`, rows: items.sfarpGaps, empty: 'Every SFARP consideration is filled in.', rowAttrs: actRow('sfarp'),
        columns: [
          { key: 'platform', label: 'Platform', width: 300, minWidth: 140, value: (r) => r.platform.name, filter: 'text', render: (r) => platformLink(r.platform) },
          { key: 'hazard', label: 'Hazard', width: 520, minWidth: 200, value: (r) => `${hazardLabel(r.hazard)} ${r.hazard.title}`, filter: 'text', render: hazardCell },
          { key: 'missing', label: 'Empty', width: 280, minWidth: 140, value: (r) => r.missing.join(', ') },
        ],
      })}</section>` },
    ], 'acks')}`;
}

/**
 * The most "Needs attention" draws. The panel is a fixed share of the window's height and shows
 * only the rows that fit whole (the rest are hidden in the browser, see mount.js); See all opens
 * the full lists.
 */
export const ATTENTION_LIMIT = 40;

const CHIP = { review: ['Review', 'chip-review'], change: ['Change', 'chip-change'], control: ['Control', 'chip-control'], implement: ['Control', 'chip-control'], rating: ['Rating', 'chip-rating'], justify: ['Rating', 'chip-rating'], controlGap: ['Control', 'chip-control'], sfarp: ['SFARP', 'chip-rating'], schedule: ['Review', 'chip-review'], dateMoved: ['Review', 'chip-review'] };

/**
 * Every open item across the team, whoever owns the platform: a quiet line above the counts.
 * @param {any} state @param {Data} data
 */
function teamLine(state, data) {
  const n = attentionItems(openItems(data, state.today, null)).length;
  return html`<p class="team-line">Across the team: <b>${n}</b> open item${n === 1 ? '' : 's'}</p>`;
}

/**
 * A change in words: its action, then what it changed. Where the name repeats the end of the action,
 * the two run together: "Set residual environment risk" and "Residual environment risk of HAZ-004 on
 * Alpha" read "Set residual environment risk of HAZ-004 on Alpha".
 * @param {string} action @param {string} subject
 */
export function changeSummary(action, subject) {
  const words = action.split(' ');
  for (let i = 1; i < words.length; i++) {
    const tail = words.slice(i).join(' ').toLowerCase();
    const head = subject.slice(0, tail.length).toLowerCase();
    if (head === tail && (subject.length === tail.length || subject[tail.length] === ' ')) return `${action}${subject.slice(tail.length)}`;
  }
  return subject ? `${action}: ${subject}` : action;
}

/** A row of Needs attention: what kind, what it is, who made the change (for a change), the platform and what to do. @param {any} state @param {Data} data @param {any} item from attentionItems */
function attentionRow(state, data, item) {
  const [word, cls] = CHIP[/** @type {keyof typeof CHIP} */ (item.type)];
  // A moved date is keyed by the date it moved to, so moving again makes it a new row.
  const key = [item.type, item.platform.id, item.entry?.id, item.hazard?.id, item.control?.id, item.type === 'dateMoved' ? item.due : ''].filter(Boolean).join('|');
  const place = whereToAct(item.type, item);
  const urgent = item.type === 'dateMoved' && item.urgent;
  /** @param {any} what @param {any} action @param {any} [by] */
  const row = (what, action, by = '') => html`<tr ${urgent ? raw('class="urgent" ') : ''}${dataAttrs({ key, dblclick: 'go', ...place })}><td class="kind">${urgent ? html`<span class="chip chip-urgent">Urgent</span> ` : ''}<span class="chip ${cls}">${word}</span></td><td class="what">${what}</td>
    <td class="by">${by}</td><td class="where">${platformLink(item.platform)}</td><td class="act">${action}</td></tr>`;
  if (item.type === 'dateMoved') {
    const why = driverWord(data, item.driver);
    return row(html`<strong>Review date moved: ${day(item.seen)} → ${day(item.due)}</strong>${why ? html` <span class="muted">· ${why}</span>` : ''}`,
      html`<button type="button" class="small" ${dataAttrs({ action: 'acknowledgeReviewDate', 'platform-id': item.platform.id })}>Acknowledge</button>`);
  }
  if (item.type === 'review') return row(`Review overdue since ${day(item.due)}`, go('Review →', place.view, place));
  if (item.type === 'change') {
    const first = item.entry.items[0];
    const subject = first ? recordName(first.kind, get(data, first.kind, first.id), data) : '';
    return row(changeSummary(item.entry.action, subject),
      html`<button type="button" class="small" ${dataAttrs({ action: 'acknowledge', 'entry-id': item.entry.id, 'platform-id': item.platform.id })}>Acknowledge</button>`,
      profileName(state, item.entry.by));
  }
  if (item.type === 'control') {
    // What is to be done, first: this control's status on this platform is to be decided. A record
    // not yet numbered goes by its name.
    const c = controlLabel(item.control);
    const hz = hazardLabel(item.hazard);
    // The names follow when the line gives numbers; given names, they would only repeat it.
    const names = [c === UNNUMBERED ? '' : item.control.title, hz === UNNUMBERED ? '' : item.hazard.title].filter(Boolean);
    const what = html`<strong>Decide on ${c === UNNUMBERED ? item.control.title : c} status for ${hz === UNNUMBERED ? item.hazard.title : hz}</strong>${names.length ? html` <span class="muted">· ${names.join(' · ')}</span>` : ''}`;
    return row(what, go('Decide →', place.view, place));
  }
  if (item.type === 'implement') {
    return row(html`${item.control.title} planned <span class="muted">· ${hazardLabel(item.hazard)} ${item.hazard.title}</span>`, go('Implement →', place.view, place));
  }
  if (item.type === 'schedule') return row('No review schedule', go('Set schedule →', place.view, place));
  if (item.type === 'controlGap') return row(html`${controlLabel(item.control)} ${item.control.title} <span class="muted">· no ${item.missing.join(', ')}</span>`, go('Fill in →', place.view, place));
  if (item.type === 'sfarp') return row(html`${hazardLabel(item.hazard)} ${item.hazard.title} <span class="muted">· no SFARP ${item.missing.join(', ')}</span>`, go('Fill in →', place.view, place));
  if (item.type === 'justify') return row(html`${hazardLabel(item.hazard)} ${item.hazard.title} <span class="muted">· no justification for the ${item.missing.join(', ')} rating${item.missing.length === 1 ? '' : 's'}</span>`, go('Justify →', place.view, place));
  return row(html`${hazardLabel(item.hazard)} ${item.hazard.title} <span class="muted">· no ${item.missing.join(', ')} rating</span>`, go('Rate →', place.view, place));
}

/** The ⋯ menu's choices of how Favourite pages shows them. */
const LAYOUT_WORD = [['table', 'Table'], ['small', 'Small blocks'], ['large', 'Large blocks']];

/**
 * The pages this profile has starred, numbered in its order, as a table, small blocks (each as
 * small as its name allows) or large blocks (filling the box between them). Each opens its page;
 * its star, shown on pointing at it, takes it off. The ⋯ menu chooses the layout, and Edit turns
 * on dragging to reorder (see favouriteDrag in mount.js).
 * @param {any} state
 */
function favouritesPanel(state) {
  const favs = favouritesOf(state).map((f, i) => ({ f, i, ...favouriteLabel(state, f) }));
  const layout = favouriteLayout(state);
  const editing = Boolean(state.favouritesEditing) && favs.length > 1;
  /** @param {(typeof favs)[number]} x */
  const open = (x) => (x.gone || editing ? {} : { action: 'go', view: x.f.name, ...(x.f.id ? { id: x.f.id } : {}), ...(x.f.tab ? { tab: x.f.tab } : {}) });
  /** @param {(typeof favs)[number]} x */
  const drag = (x) => (editing ? html` draggable="true" ${dataAttrs({ 'fav-index': x.i })}` : '');
  const grip = editing ? html`<span class="fav-grip" aria-hidden="true">⠿</span>` : '';
  const menu = html`<details class="dots-menu">
      <summary aria-label="Favourite pages options" title="Options"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg></summary>
      <div class="dots-body" role="menu">
        ${LAYOUT_WORD.map(([l, word]) => html`<button type="button" role="menuitemradio" aria-checked="${l === layout ? 'true' : 'false'}" ${dataAttrs({ action: 'setFavouriteLayout', layout: l })}><span class="dots-check" aria-hidden="true">${l === layout ? '✓' : ''}</span>${word}</button>`)}
        <hr>
        <button type="button" role="menuitemcheckbox" aria-checked="${editing ? 'true' : 'false'}" ${dataAttrs({ action: 'toggleFavouriteEdit' })}${favs.length > 1 ? '' : html` disabled title="Star two or more pages to reorder them"`}><span class="dots-check" aria-hidden="true">${editing ? '✓' : ''}</span>Edit order</button>
      </div></details>`;
  /** @param {(typeof favs)[number]} x */
  const name = (x) => html`<span class="fav-name${x.gone ? ' muted' : ''}">${x.label}</span>`;
  const body = !favs.length
    ? html`<p class="muted">No favourites yet. Star a page with ☆ beside its Back button.</p>`
    : layout === 'table'
      ? html`<ol class="favs">${favs.map((x) => html`<li class="fav${x.gone ? ' gone' : ''}"${drag(x)}>${grip}<span class="fav-num">${x.i + 1}</span>
          <div class="fav-main"${Object.keys(open(x)).length ? html` role="link" tabindex="0" ${dataAttrs(open(x))}` : ''}>${name(x)}<span class="fav-kind">${x.kind}</span></div>${unfavouriteStar(x.f, x.label)}</li>`)}</ol>`
      : html`<div class="fav-blocks ${layout}">${blockRows(favs, layout).map((row) => html`<div class="fav-row">${row.map((x) => html`<div class="fav-block${x.gone ? ' gone' : ''}"${Object.keys(open(x)).length ? html` role="link" tabindex="0" ${dataAttrs(open(x))}` : ''}${drag(x)}>
          ${grip}<span class="fav-num">${x.i + 1}</span><span class="fav-heading">${x.heading}</span>${x.detail ? html`<span class="fav-name${x.gone ? ' muted' : ''}">${x.detail}</span>` : ''}<span class="fav-kind">${x.kind}</span>${unfavouriteStar(x.f, x.label)}</div>`)}</div>`)}</div>`;
  return html`<section class="panel stack-panel fav-panel${editing ? ' editing' : ''}" aria-label="Favourite pages">
    <div class="panel-head"><h2>Favourite pages</h2>${editing ? html`<span class="fav-editing">Drag to reorder</span><button type="button" class="small" ${dataAttrs({ action: 'toggleFavouriteEdit' })}>Done</button>` : ''}${menu}</div>
    ${body}
  </section>`;
}

/**
 * Blocks in rows. Small blocks all go in one row that wraps. Large blocks share the box: up to three
 * across, so each is wide enough for its heading, the rows sharing them out evenly, so every block
 * is as big as it can be and none is left over (two blocks: each half the box; four: two by two).
 * @template T @param {T[]} items @param {string} layout @returns {T[][]}
 */
function blockRows(items, layout) {
  if (layout !== 'large') return [items];
  const rows = items.length <= 3 ? 1 : Math.ceil(items.length / 3);
  const out = [];
  let start = 0;
  for (let r = 0; r < rows; r += 1) {
    const n = Math.ceil((items.length - start) / (rows - r));
    out.push(items.slice(start, start + n));
    start += n;
  }
  return out;
}

/** The days from today until a date (calendar days). @param {string} today @param {string} due */
const daysUntil = (today, due) => Math.round((Date.parse(`${due.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

/**
 * The working days from today until a date: Monday to Friday, from tomorrow to the day itself.
 * @param {string} today YYYY-MM-DD @param {string} due YYYY-MM-DD
 */
export function workingDaysUntil(today, due) {
  let n = 0;
  const d = new Date(`${today.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${due.slice(0, 10)}T00:00:00Z`);
  for (d.setUTCDate(d.getUTCDate() + 1); d.getTime() <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n += 1;
  }
  return n;
}

/**
 * Coming up as a table: when each review is scheduled, the platform, the working days left, and
 * Start review (or, one under way, Open).
 * @param {any} state @param {any[]} rows from upcomingReviews
 */
function comingUp(state, rows) {
  return html`<table class="attn upcoming-table"><colgroup><col class="c-date"><col><col class="c-days"><col class="c-act"></colgroup>
    <thead><tr><th>Scheduled</th><th>Platform</th><th>Working days left</th><th></th></tr></thead>
    <tbody>${rows.map((r) => html`<tr>
      <td class="date">${r.due ? day(r.due) : html`<span class="muted">—</span>`}</td>
      <td>${go(r.platform.name, 'platformReview', { id: r.platform.id })}</td>
      <td class="days">${r.due ? workingDaysUntil(state.today, r.due) : html`<span class="muted">—</span>`}</td>
      <td class="act">${reviewButton(r)}</td>
    </tr>`)}</tbody></table>`;
}

/** Start a platform's review, or carry on with the one under way. @param {{ platform: any, open: boolean }} r */
function reviewButton(r) {
  return r.open
    ? html`<button type="button" class="small" title="A review is under way" ${dataAttrs({ action: 'go', view: 'platformReview', id: r.platform.id })}>Continue review →</button>`
    : html`<button type="button" class="small" ${dataAttrs({ action: 'beginReview', 'platform-id': r.platform.id })}>Start review</button>`;
}

/** The total of open items, first among the counts on Home and Open items: a figure, not a button. @param {number} n */
function totalTile(n) {
  return html`<div class="tile tile-total" role="status" title="Everything that needs doing, all together"><b>${n}</b><span>${n === 1 ? 'open item' : 'open items'}</span></div>`;
}

/** A bar of a platform's hazards by residual band, highest first. @param {Record<string, number>} bands */
function riskBar(bands) {
  const present = BANDS.filter((b) => bands[b]);
  const words = present.map((b) => `${bands[b]} ${b === 'Uncategorised' ? 'unrated' : b}`).join(' · ');
  return html`<span class="riskbar">${present.map((b) => html`<span class="band-${b.toLowerCase().replace(/\s+/g, '-')}" style="flex:${bands[b]}" title="${bands[b]} ${b}"></span>`)}</span>
    <span class="muted small-text">${words || 'No hazards yet'}</span>`;
}

/** The words for how far ahead Coming up looks. @param {number} days */
const windowWords = (days) => COMING_UP_WINDOWS.find(([d]) => d === days)?.[1] ?? `Next ${days} days`;

/** How far ahead Coming up looks, chosen beside its heading. @param {number} days */
function windowPicker(days) {
  return html`<select class="window-pick" name="days" aria-label="How far ahead Coming up looks" ${dataAttrs({ change: 'setComingUpDays' })}>
    ${COMING_UP_WINDOWS.map(([d, word]) => option(String(d), word, String(days)))}</select>`;
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
  // Any count above nought is highlighted (overdue reviews in red, the rest orange); nought stays plain.
  const tile = (n, one, many, tone = 'warn') => html`<button type="button" class="tile${n && tone ? ` ${tone}` : ''}" ${dataAttrs({ action: 'go', view: 'openItems' })}><b>${n}</b><span>${n === 1 ? one : many}</span></button>`;
  const days = comingUpDays(state);
  const upcoming = upcomingReviews(data, state.today, ownerId, days);
  const cards = platformCards(data, state.today, ownerId);
  const owner = state.homeOwner || 'me';
  const heading = owner === 'everyone' ? 'Platforms' : ownerId === state.profileId ? 'My platforms' : `${profileName(state, ownerId)}’s platforms`;
  const more = attention.length > ATTENTION_LIMIT ? go(`See all ${attention.length} →`, 'openItems') : attention.length ? go('Open items →', 'openItems') : '';
  const moreAttrs = { 'attn-more': '', total: attention.length };
  return html`<div class="head"><h1>Home</h1>${ownerPicker(state)}</div>
    ${teamLine(state, data)}
    <div class="tiles">
      ${totalTile(attention.length)}
      ${tile(items.acks.length, 'to acknowledge', 'to acknowledge')}
      ${tile(overdue, 'review overdue', 'reviews overdue', 'bad')}
      ${tile(items.awaiting.length, 'awaiting decision', 'awaiting decision')}
      ${tile(items.toImplement.length, 'to implement', 'to implement')}
      ${tile(items.unrated.length, 'unrated', 'unrated')}
      ${tile(items.unjustified.length, 'unjustified rating', 'unjustified ratings')}
      ${tile(items.controlGaps.length, 'control incomplete', 'controls incomplete')}
      ${tile(items.sfarpGaps.length, 'SFARP incomplete', 'SFARP incomplete')}
    </div>
    <div class="dash-cols">
      <section class="panel attn-panel"><h2>Needs attention</h2>
        ${attention.length
          ? html`<div class="attn-fit"><table class="attn"><colgroup><col class="c-kind"><col><col class="c-by"><col class="c-where"><col class="c-act"></colgroup><thead><tr><th>Type</th><th>Description</th><th>By</th><th>Platform</th><th></th></tr></thead>
            <tbody>${attention.slice(0, ATTENTION_LIMIT).map((i) => attentionRow(state, data, i))}</tbody></table></div><div class="panel-more" ${dataAttrs(moreAttrs)}>${more}</div>`
          : html`<p class="muted">Nothing needs attention.</p>`}
      </section>
      <div class="dash-stack">
      <section class="panel stack-panel"><div class="panel-head coming-up-head"><h2>Coming up</h2>${windowPicker(days)}</div>
        ${upcoming.length ? comingUp(state, upcoming) : html`<p class="muted">No reviews due in the ${windowWords(days).toLowerCase()}.</p>`}
      </section>
      ${favouritesPanel(state)}
      </div>
    </div>
    <h2 class="dash-h">${heading}</h2>
    ${cards.length ? html`<div class="pcards">${cards.map((c) => html`<button type="button" class="pcard" ${dataAttrs({ action: 'go', view: 'platform', id: c.platform.id })}>
        <span class="pcard-top"><span class="pcard-h"><strong>${c.platform.name}</strong>${c.state === 'dueSoon' && c.due ? html` <span class="tag review-due-soon">Review due soon – ${daysUntil(state.today, c.due)} day${daysUntil(state.today, c.due) === 1 ? '' : 's'}</span>` : reviewTag(c.state)}${c.open ? html` <span class="tag">Review in progress</span>` : ''}</span>${groupTags(groupsOf(data, c.platform.id))}</span>
        ${owner === 'everyone' ? html`<span class="muted">${profileName(state, c.platform.ownerId)}</span>` : ''}
        ${RECEPTORS.map((x) => html`<span class="rx">${RECEPTOR_WORD[/** @type {'personnel'} */ (x)]}</span>${riskBar(c.bands[x])}`)}
        <span>${count(c.hazards, 'hazard', 'hazards')} · ${c.awaiting} awaiting status decision · ${count(c.acks, 'change', 'changes')}</span>
        <span class="muted">${c.due ? `Due ${day(c.due)}` : 'No review schedule'}${c.lastReviewed ? ` · last ${day(c.lastReviewed)}` : ''}</span>
        ${c.platform.image ? platformImage(c.platform, 'pcard-image') : ''}
      </button>`)}</div>` : html`<p class="muted">No platforms.</p>`}`;
}
