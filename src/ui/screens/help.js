import { html, raw } from '../html.js';
import { dataAttrs } from './common.js';
import { HELP_GROUPS, HELP_TOPICS, GLOSSARY, termId, renderHelpText, plainHelpText } from '../help-content.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** A rail entry: found by search on any word of its title, summary or text. @param {string} id @param {string} current */
function railItem(id, current) {
  const t = HELP_TOPICS[id];
  const words = `${t.title} ${plainHelpText(t.summary)} ${plainHelpText(t.body)}`.toLowerCase();
  return html`<li data-pick-text="${words}"><button type="button" class="help-item${id === current ? ' on' : ''}" ${dataAttrs({ action: 'go', view: 'help', topic: id })}>${t.title}</button></li>`;
}

/** The topics in their groups, a search box over them, and the glossary terms (shown only when searching). @param {string} current */
function rail(current) {
  return html`<nav class="help-rail" aria-label="Help topics" data-filter-scope>
    <input class="help-search" type="search" data-filter-list placeholder="Search help…" aria-label="Search help">
    ${HELP_GROUPS.map((g) => html`<div class="help-group"><div class="help-group-h">${g.title}</div><ul class="plain">${g.topics.map((id) => railItem(id, current))}</ul></div>`)}
    <ul class="plain help-found">${GLOSSARY.map((g) => html`<li data-pick-only hidden data-pick-text="${`${g.term} ${plainHelpText(g.def)}`.toLowerCase()}"><button type="button" class="help-item" ${dataAttrs({ action: 'go', view: 'help', topic: 'glossary', term: termId(g.term) })}><span class="muted">Glossary:</span> ${g.term}</button></li>`)}</ul>
  </nav>`;
}

/** @param {{ term: string, def: string }} g @param {boolean} on @param {boolean} [anchor] */
const termBlock = (g, on, anchor = true) => html`<div class="help-term${on ? ' on' : ''}"${anchor ? raw(` id="term-${termId(g.term)}"`) : ''}><dt>${g.term}</dt><dd>${renderHelpText(g.def)}</dd></div>`;

/** The glossary: the term looked up first, then every term. @param {string | undefined} term */
function glossary(term) {
  const found = GLOSSARY.find((g) => termId(g.term) === term);
  return html`${found ? html`<dl class="help-lookup">${termBlock(found, true, false)}</dl>` : ''}
    <dl class="help-glossary">${GLOSSARY.map((g) => termBlock(g, termId(g.term) === term))}</dl>`;
}

/** For a new profile, until answered, an invitation to the tutorial at the top of Getting started. @param {any} state */
function tourStart(state) {
  const offered = state.profiles?.find((/** @type {any} */ p) => p.id === state.profileId)?.prefs?.tutorialOffered === false;
  return html`${offered ? html`<aside class="tour-invite"><span><strong>New to PIVOT?</strong> Take the 5-minute tutorial: it shows you around using sample data.</span>
      <span class="tour-invite-buttons"><button type="button" class="primary" ${dataAttrs({ action: 'startTour' })}>Start</button><button type="button" ${dataAttrs({ action: 'dismissTourInvite' })}>Not now</button></span></aside>` : ''}
`;
}

/** Getting started's Start the tutorial, at the end of its Getting help section. */
const tourButton = () => html`<p><button type="button" class="primary tour-start" ${dataAttrs({ action: 'startTour' })}>Start the tutorial</button> <span class="muted">A 5-minute tour on sample data.</span></p>`;

/**
 * The Help page: the topic rail with search, and the topic chosen (Getting started unless
 * another is asked for).
 * @param {any} state @param {Data} _data
 */
export function helpView(state, _data) {
  const id = HELP_TOPICS[state.view?.topic] ? state.view.topic : 'getting-started';
  const t = HELP_TOPICS[id];
  const related = (t.related ?? []).filter((r) => HELP_TOPICS[r]);
  return html`<div class="head"><h1>Help</h1></div>
    <div class="help-layout">${rail(id)}
      <article class="help-main doc">
        <h2>${t.title}</h2><div class="help-summary">${renderHelpText(t.summary)}</div>
        ${id === 'getting-started' ? tourStart(state) : ''}
        ${renderHelpText(t.body)}
        ${id === 'getting-started' ? tourButton() : ''}
        ${id === 'glossary' ? glossary(state.view?.term) : ''}
        ${related.length ? html`<h3>Related</h3><ul class="plain help-related">${related.map((r) => html`<li><button type="button" class="link" ${dataAttrs({ action: 'go', view: 'help', topic: r })}>${HELP_TOPICS[r].title}</button></li>`)}</ul>` : ''}
      </article></div>`;
}
