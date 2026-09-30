import { html, raw } from '../html.js';
import { FULCRUM_SVG } from '../logo.js';
import { dataAttrs, messages } from './common.js';
import { profileName, recordName, when, KIND_LABEL } from '../names.js';

/** The logo, large and at the top middle, in the same place on the folder and profile screens. */
const frontBrand = () => html`<div class="front-brand"><h1 class="brand-title">${raw(FULCRUM_SVG)}PIVOT</h1></div>`;

/** @param {any} state */
export function openScreen(state) {
  return html`<div class="start front">${frontBrand()}<div class="front-body">
    <p>Choose the shared data folder. A new, empty folder starts an empty register.</p>
    ${state.lastFolder
      ? html`<div class="row"><button type="button" class="primary beckon" ${dataAttrs({ action: 'reconnectFolder' })}>Reconnect to ${state.lastFolder}</button>
        <button type="button" ${dataAttrs({ action: 'chooseFolder' })}>Choose a different folder…</button></div>`
      : html`<button type="button" class="primary" ${dataAttrs({ action: 'chooseFolder' })}>Choose data folder…</button>`}
    ${messages(state)}</div></div>`;
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
  return html`<div class="start front">${frontBrand()}<div class="front-body">
    <h2 class="front-title">Log In</h2>
    ${messages(state)}
    <ul class="profiles">${state.profiles.map((/** @type {any} */ p, /** @type {number} */ i) => html`<li style="--i: ${i}"><button type="button" class="profile-tile" ${dataAttrs({ action: 'selectProfile', id: p.id })}><span class="initial" aria-hidden="true">${[...p.name.trim()][0]?.toUpperCase() ?? '?'}</span><span class="name">${p.name}</span></button></li>`)}
      <li style="--i: ${state.profiles.length}"><form data-action="createProfile" class="profile-tile new"><span class="initial" aria-hidden="true">+</span><label>New profile <input name="name" required autocomplete="off"></label><button type="submit" class="primary">Create</button></form></li></ul>
    ${state.profiles.length ? null : html`<p>No profiles yet. Create yours.</p>`}
  </div></div>`;
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
