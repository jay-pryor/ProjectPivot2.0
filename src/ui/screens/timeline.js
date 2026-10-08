import { html, raw } from '../html.js';
import { dataAttrs, option, go } from './common.js';
import { monthsInRange, timelineMarks, rangeStart } from '../../core/timeline.js';
import { scheduleOf } from '../../core/schedule.js';
import { groupsOf, listPlatformGroups } from '../../core/queries.js';
import { TIMELINE_LENGTHS, DEFAULT_REVIEWS_PREFS } from '../reviews-prefs.js';
import { day, periodWord, profileName } from '../names.js';
import { driverWord } from '../review-words.js';

/** @typedef {import('../../core/data.js').Data} Data */

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MARK_WORD = { due: 'Due', overdue: 'Overdue since', dueWas: 'Was due', projected: 'Then due', done: 'Reviewed', late: 'Reviewed late', open: 'Review started' };

/** The range's controls: a year back, the first month, the length, a year on, and the year before. @param {any} prefs @param {string} thisMonth */
function rangeControls(prefs, thisMonth) {
  return html`<div class="tl-controls">
    <button type="button" ${dataAttrs({ action: 'setReviewsFilter', shift: -12 })} aria-label="A year earlier" title="A year earlier">‹</button>
    <label>From <input type="month" name="start" value="${prefs.start ?? thisMonth}" ${dataAttrs({ change: 'setReviewsFilter' })}></label>
    <label>Show <select name="length" ${dataAttrs({ change: 'setReviewsFilter' })}>${TIMELINE_LENGTHS.map((n) => option(String(n), periodWord(n), String(prefs.length)))}</select></label>
    <button type="button" ${dataAttrs({ action: 'setReviewsFilter', shift: 12 })} aria-label="A year later" title="A year later">›</button>
    <label class="tl-past"><input type="checkbox" name="past"${prefs.past ? raw(' checked') : ''} ${dataAttrs({ change: 'setReviewsFilter' })}> Show the year before</label>
  </div>`;
}

/**
 * The review timeline: a row per platform the filters let through, a column per month, with each
 * platform's next review, the reviews after it at today's period, and the reviews done in the
 * range. A thin bar runs from a platform's first mark to its last, so short periods read as dense.
 * Rows sit under their first platform group when there are groups.
 * @param {any} state @param {Data} data @param {any[]} platforms the platforms the filters let through
 */
export function timelineView(state, data, platforms) {
  const prefs = state.reviewsPrefs ?? DEFAULT_REVIEWS_PREFS;
  const months = monthsInRange(rangeStart(prefs, state.today), prefs.length);
  const thisMonth = state.today.slice(0, 7);
  /** @type {[string, number][]} */
  const years = [];
  for (const m of months) {
    const y = m.slice(0, 4);
    const lastYear = years.at(-1);
    if (lastYear?.[0] === y) lastYear[1] += 1; else years.push([y, 1]);
  }
  const rows = platforms.map((p) => ({ p, s: scheduleOf(data, p.id, state.today) }))
    .sort((a, b) => Number(!a.s.due) - Number(!b.s.due) || String(a.s.due ?? '').localeCompare(String(b.s.due ?? '')) || String(a.p.name).localeCompare(String(b.p.name)));
  const row = (/** @type {{ p: any, s: any }} */ { p, s }) => {
    const name = html`<th class="tl-name" scope="row">${go(p.name, 'platformReview', { id: p.id })} <span class="muted">${profileName(state, p.ownerId)}${s.months ? ` · ${periodWord(s.months)}` : ''}</span></th>`;
    const marks = timelineMarks(data, p.id, state.today, months);
    if (!s.due && !Object.keys(marks).length) return html`<tr data-row="${p.id}" class="tl-none">${name}<td colspan="${months.length}" class="muted">No schedule</td></tr>`;
    const why = driverWord(data, s.driver);
    const marked = months.filter((m) => marks[m]);
    const [first, last] = [marked[0], marked.at(-1) ?? ''];
    const title = (/** @type {any} */ k) => `${MARK_WORD[/** @type {'due'} */ (k.kind)]} ${day(k.date)}${(k.kind === 'due' || k.kind === 'projected') && s.months ? ` · every ${periodWord(s.months)}${why ? ` · ${why}` : ''}` : ''}`;
    return html`<tr data-row="${p.id}" ${dataAttrs({ dblclick: 'go', view: 'platformReview', id: p.id })}>${name}${months.map((m) => {
      const bar = first && m >= first && m <= last ? ' tl-bar' : '';
      return html`<td class="tl-cell${m === thisMonth ? ' today' : ''}${bar}">${(marks[m] ?? []).map((k) => html`<span class="tl-mark ${k.kind}" title="${title(k)}"></span>`)}</td>`;
    })}</tr>`;
  };
  const groups = listPlatformGroups(data);
  /** @type {unknown[]} */
  let body;
  if (groups.length) {
    const firstGroup = (/** @type {any} */ p) => groupsOf(data, p.id)[0]?.id ?? null;
    const header = (/** @type {string} */ label) => html`<tr class="tl-group"><th colspan="${months.length + 1}" scope="rowgroup">${label}</th></tr>`;
    body = [...groups.map((g) => ({ id: g.id, name: g.name })), { id: null, name: 'No group' }].flatMap((g) => {
      const mine = rows.filter((r) => firstGroup(r.p) === g.id);
      return mine.length ? [header(g.name), ...mine.map(row)] : [];
    });
  } else body = rows.map(row);
  return html`${rangeControls(prefs, thisMonth)}
    <div class="tl-scroll"><table class="timeline">
      <thead><tr><th class="tl-name" rowspan="2" scope="col">Platform</th>${years.map(([y, n]) => html`<th colspan="${n}" class="tl-year">${y}</th>`)}</tr>
        <tr>${months.map((m) => html`<th class="tl-month${m === thisMonth ? ' today' : ''}" scope="col">${MONTH[Number(m.slice(5, 7)) - 1]}</th>`)}</tr></thead>
      <tbody>${body}</tbody></table></div>
    <p class="muted tl-key"><span class="tl-mark due"></span>next review <span class="tl-mark projected"></span>later reviews at today’s period <span class="tl-mark overdue"></span>overdue <span class="tl-mark dueWas"></span>when it was due <span class="tl-mark done"></span>reviewed <span class="tl-mark late"></span>reviewed late <span class="tl-mark open"></span>in progress</p>`;
}
