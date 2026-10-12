import { html } from '../html.js';
import { dataAttrs } from './common.js';
import { workflowLabel } from '../../core/ids.js';
import { profileAssignments } from '../../core/queries.js';
import { profileName, when } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** What a profile still has, in a few words. @param {Data} data @param {ReturnType<typeof profileAssignments>} a */
function assigned(data, a) {
  return [
    a.platforms.length ? `Owns ${a.platforms.map((p) => p.name).join(', ')}` : '',
    a.workflows.length ? `${a.workflows.map((w) => workflowLabel(w)).join(', ')} open` : '',
    a.transfers.length ? `${a.transfers.length === 1 ? 'A transfer' : `${a.transfers.length} transfers`} to mark reviewed` : '',
  ].filter(Boolean).join(' · ') || '';
}

/**
 * The Profiles page (☰ menu): every profile, what it still has assigned, and Retire… (once nothing
 * is) or Restore. A retired profile given something since is flagged.
 * @param {any} state @param {Data} data
 */
export function profilesView(state, data) {
  const rows = [...state.profiles].sort((a, b) => Number(Boolean(a.retired)) - Number(Boolean(b.retired)) || a.name.localeCompare(b.name));
  return html`<div class="head"><h1>Profiles</h1></div>
    <p class="muted">Retire a profile no longer in use: it leaves the Log In screen and the lists of people to choose, and its name stays on what it did. A profile can be retired once it owns no platforms, has no open workflows and no transfer to mark reviewed.</p>
    <section class="block"><table class="grid profiles-table"><thead><tr><th scope="col">Profile</th><th scope="col">Status</th><th scope="col">Assigned</th><th scope="col"></th></tr></thead>
    <tbody>${rows.map((p) => {
      const what = assigned(data, profileAssignments(data, p.id));
      const status = p.retired
        ? html`<span class="tag">Retired</span> <span class="muted">by ${profileName(state, p.retired.by)}, ${when(p.retired.at)}</span>${what ? html` <span class="tag warn">Retired, but ${what.charAt(0).toLowerCase()}${what.slice(1)}</span>` : ''}`
        : html`<span class="tag">Active</span>`;
      const act = p.id === state.profileId ? html`<span class="muted">You</span>`
        : p.retired ? html`<button type="button" class="small" ${dataAttrs({ action: 'restoreProfile', id: p.id })}>Restore</button>`
        : html`<button type="button" class="small" ${dataAttrs({ action: 'askConfirm', run: 'retireProfile', id: p.id, title: `Retire ${p.name}?`, text: `${p.name} will leave the Log In screen and the lists of people to choose. Their name stays on what they did, and they can be restored.` })}>Retire…</button>`;
      return html`<tr><th scope="row">${p.name}</th><td>${status}</td><td>${what || html`<span class="muted">Nothing</span>`}</td><td>${act}</td></tr>`;
    })}</tbody></table></section>`;
}
