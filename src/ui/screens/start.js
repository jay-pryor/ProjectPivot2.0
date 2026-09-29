import { html, raw } from '../html.js';
import { FULCRUM_SVG } from '../logo.js';
import { dataAttrs, messages } from './common.js';
import { profileName, recordName, when, KIND_LABEL } from '../names.js';

/** @param {any} state */
export function openScreen(state) {
  return html`<div class="start"><h1 class="brand-title">${raw(FULCRUM_SVG)}PIVOT</h1>
    <p>Choose the shared data folder. A new, empty folder starts an empty register.</p>
    ${state.lastFolder
      ? html`<div class="row"><button type="button" class="primary" ${dataAttrs({ action: 'reconnectFolder' })}>Reconnect to ${state.lastFolder}</button>
        <button type="button" ${dataAttrs({ action: 'chooseFolder' })}>Choose a different folder…</button></div>`
      : html`<button type="button" class="primary" ${dataAttrs({ action: 'chooseFolder' })}>Choose data folder…</button>`}
    ${messages(state)}</div>`;
}

/** @param {any} state */
export function checkScreen(state) {
  const profilesBad = state.check.failed.some((/** @type {any} */ f) => f.file === 'profiles.json');
  return html`<div class="start"><h1>Some files in ${state.folderName} cannot be used</h1>
    <ul class="failed">${state.check.failed.map((/** @type {any} */ f) => html`<li><strong>${f.file}</strong>: ${f.detail}</li>`)}</ul>
    ${profilesBad
      ? html`<p>Replace profiles.json with a copy you trust, then open the folder again.</p>`
      : html`<p>Nothing from data.json is shown. Pick your profile, then restore from a backup.</p>
         <button type="button" class="primary" ${dataAttrs({ action: 'continueFromCheck' })}>Continue</button>`}
    ${messages(state)}</div>`;
}

/** @param {any} state */
export function profileScreen(state) {
  return html`<div class="start"><h1>Who are you?</h1><p class="muted">${state.folderName}</p>
    ${messages(state)}
    ${state.profiles.length
      ? html`<ul class="profiles">${state.profiles.map((/** @type {any} */ p) => html`<li><button type="button" ${dataAttrs({ action: 'selectProfile', id: p.id })}>${p.name}</button></li>`)}</ul>`
      : html`<p>No profiles yet. Create yours.</p>`}
    <form data-action="createProfile" class="row"><label>New profile <input name="name" required autocomplete="off"></label><button type="submit">Create</button></form>
  </div>`;
}

/** @param {any} state */
export function recoverScreen(state) {
  return html`<div class="start"><h1>Unsaved changes were found</h1>
    <p>This browser kept changes to ${state.folderName} that were never saved.</p>
    <p>Recovering puts them back on screen. Nothing is written to the folder until you save, and anything others saved since is merged in then.</p>
    <button type="button" class="primary" ${dataAttrs({ action: 'recover' })}>Recover them</button>
    <button type="button" ${dataAttrs({ action: 'discardRecovery' })}>Discard them</button>
    ${messages(state)}</div>`;
}

/** @param {any} state */
export function noticesScreen(state) {
  return html`<div class="start"><h1>Some of your saved changes were replaced</h1>
    <p>Someone saved over them after you. What they saved is what is stored now.</p>
    ${state.notices.map((/** @type {any} */ n) => html`<section class="notice"><h2>${when(n.at)}, by ${profileName(state, n.by)}</h2><ul>
      ${n.items.map((/** @type {any} */ i) => html`<li>${KIND_LABEL[/** @type {keyof typeof KIND_LABEL} */ (i.kind)] ?? i.kind}: your “${recordName(i.kind, i.theirs, state.session?.working)}” was replaced ${i.mine ? html`by “${recordName(i.kind, i.mine, state.session?.working)}”` : 'and removed'}</li>`)}
    </ul></section>`)}
    <button type="button" class="primary" ${dataAttrs({ action: 'dismissNotices' })}>OK</button></div>`;
}
