import { html, raw } from '../html.js';
import { dataAttrs, go, option } from './common.js';
import { get } from '../../core/data.js';
import { transferGroups, stepOf } from '../../core/workflows.js';
import { profileName, when } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** A group's items, each linking where it is seen. @param {any[]} items */
const itemList = (items) => html`<ul class="plain wf-items">${items.map((i) => html`<li>${i.view ? go(i.text, i.view, { ...(i.id ? { id: i.id } : {}), ...(i.tab ? { tab: i.tab } : {}) }) : i.text}</li>`)}</ul>`;

/** @param {any} state @param {Data} data @param {any} wf @param {boolean} mine */
export function transferBody(state, data, wf, mine) {
  const p = get(data, 'platform', wf.platformId);
  const groups = transferGroups(data, wf.platformId, state.today, wf.id);
  const dis = mine ? '' : raw(' disabled');
  const recipient = html`<section class="wf-check" aria-label="New owner"><h3 class="wf-check-h">New owner</h3>
    <p class="muted">${p?.name} is owned by ${profileName(state, p?.ownerId)}.</p>
    <select name="toOwnerId" aria-label="New owner" required${dis} ${dataAttrs({ change: 'setTransferRecipient', 'workflow-id': wf.id })}>
      <option value="" disabled${wf.toOwnerId ? '' : raw(' selected')}>Select new owner…</option>
      ${state.profiles.filter((/** @type {any} */ pr) => pr.id !== p?.ownerId).map((/** @type {any} */ pr) => option(pr.id, pr.name, wf.toOwnerId ?? ''))}</select></section>`;
  const cards = groups.map((g) => {
    const s = stepOf(data, wf.id, '-', `group:${g.key}`);
    const at = { change: 'setStep', 'workflow-id': wf.id, 'hazard-id': '-', check: `group:${g.key}` };
    return html`<section class="wf-check${!g.items.length || s?.checked ? ' done' : ''}" aria-label="${g.title}">
      <h3 class="wf-check-h">${g.title} <span class="count">${g.items.length}</span></h3>
      ${g.items.length ? html`<details class="wf-group"${g.items.length <= 5 ? raw(' open') : ''}><summary>${g.items.length} item${g.items.length === 1 ? '' : 's'}</summary>${itemList(g.items)}</details>
        <div class="wf-check-foot"><input class="grow" name="note" value="${s?.note ?? ''}" placeholder="Note (optional)…" aria-label="Note on ${g.title}"${dis} ${dataAttrs(at)}>
          <label class="wf-tick"><input type="checkbox" name="checked"${s?.checked ? raw(' checked') : ''}${dis} ${dataAttrs(at)}> Checked</label></div>`
        : html`<p class="muted">None.</p>`}</section>`;
  });
  const left = groups.filter((g) => g.items.length && !stepOf(data, wf.id, '-', `group:${g.key}`)?.checked).length + Number(!wf.toOwnerId);
  return html`<div class="wf-single">${recipient}${cards}
    <div class="actions"><button type="button" class="primary" ${dataAttrs({ action: 'completeWorkflow', 'workflow-id': wf.id })}${left || !mine ? raw(' disabled') : ''}>${left ? `Confirm transfer — ${left} still needed` : 'Confirm transfer'}</button></div></div>`;
}

/** A completed or cancelled transfer: who it went from and to, the groups as they were ticked, and the new owner's review. @param {any} state @param {Data} data @param {any} wf */
export function transferEnded(state, data, wf) {
  const steps = (/** @type {string} */ key) => stepOf(data, wf.id, '-', `group:${key}`);
  const title = (/** @type {string} */ key) => transferGroups(data, wf.platformId, state.today, wf.id).find((g) => g.key === key)?.title ?? key;
  const ticked = ['acks', 'review', 'workflows', 'awaiting', 'toImplement', 'controlGaps', 'hazardGaps'].map((k) => ({ k, s: steps(k) })).filter((x) => x.s);
  const status = wf.state === 'completed'
    ? html`<p class="doc-meta"><span class="tag wf-completed">Completed</span> Transferred from ${profileName(state, wf.fromOwnerId)} to ${profileName(state, wf.toOwnerId)} by ${profileName(state, wf.endedBy)}, ${when(wf.endedAt)}.</p>`
    : html`<p class="doc-meta"><span class="tag wf-cancelled">Cancelled</span> by ${profileName(state, wf.endedBy)}, ${when(wf.endedAt)}. Nothing changed.</p>`;
  const review = wf.state !== 'completed' ? ''
    : wf.reviewed ? html`<p>Reviewed by ${profileName(state, wf.reviewed.by)}, ${when(wf.reviewed.at)}.</p>`
      : wf.toOwnerId === state.profileId ? html`<div class="actions"><button type="button" class="primary" ${dataAttrs({ action: 'markTransferReviewed', 'workflow-id': wf.id })}>Mark as reviewed</button></div>`
        : html`<p class="muted">Waiting for ${profileName(state, wf.toOwnerId)} to review it.</p>`;
  return html`${status}<article class="doc"><table class="wf-grid"><thead><tr><th>Group</th><th>Checked</th><th>Note</th></tr></thead>
    <tbody>${ticked.map((x) => html`<tr><th scope="row">${title(x.k)}</th><td class="${x.s?.checked ? 'yes' : 'no'}">${x.s?.checked ? '✓' : ''}</td><td>${x.s?.note ?? ''}</td></tr>`)}</tbody></table>${review}</article>`;
}
