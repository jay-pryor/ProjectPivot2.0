import { html, raw } from '../html.js';
import { dataAttrs, go, idTag, plus } from './common.js';
import { controlsSection, safetyReportsSection, riskPanels, sfarpArea } from './ssra.js';
import { changesList } from './workflow.js';
import { get } from '../../core/data.js';
import { platformHazards, byNumber } from '../../core/queries.js';
import { hazardLabel, controlLabel, workflowLabel } from '../../core/ids.js';
import { TECH_CARDS, TECH_WORDS, TECH_QUESTIONS, techScope, techPairs, techPlatforms, techTouched, techLinks, workflowProgress, stepOf, pairKey } from '../../core/workflows.js';
import { profileName, when } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** The editor each card shows: the same one the platform page uses. */
const EDITOR = Object.freeze({
  controls: (/** @type {any} */ state, /** @type {Data} */ data, /** @type {any} */ x) => controlsSection(state, data, x.hazard, x.platform.id, x.platform.name),
  safetyReports: (/** @type {any} */ state, /** @type {Data} */ data, /** @type {any} */ x) => safetyReportsSection(state, data, x.hazard, x.platform.id),
  residual: (/** @type {any} */ state, /** @type {Data} */ data, /** @type {any} */ x) => riskPanels(state, data, x.hazard, x.platform.id, 'residual', 'both'),
  sfarp: (/** @type {any} */ _state, /** @type {Data} */ data, /** @type {any} */ x) => sfarpArea(data, x.hazard, x.platform.id),
});

const KIND_WORD = Object.freeze({ platform: 'Platform', hazard: 'Hazard', control: 'Control' });

/** A link Complete makes, as a person reads it. @param {Data} data @param {{ targetKind: string, targetId: string }} t */
function linkName(data, t) {
  const r = get(data, t.targetKind, t.targetId);
  const name = !r ? 'deleted' : t.targetKind === 'platform' ? r.name : t.targetKind === 'hazard' ? `${hazardLabel(r)} ${r.title}` : `${controlLabel(r)} ${r.title}`;
  return `${KIND_WORD[/** @type {keyof typeof KIND_WORD} */ (t.targetKind)] ?? t.targetKind}: ${name}`;
}

/** @param {Data} data @param {{ targetKind: string, targetId: string }[]} links */
const linkList = (data, links) => (links.length
  ? html`<ul class="plain wf-links">${links.map((t) => html`<li>${linkName(data, t)}</li>`)}</ul>`
  : html`<p class="muted">No new links.</p>`);

/** A row of the grid for a pair key: its platform and hazard as they are now, or as they were. @param {Data} data @param {string} key */
function rowLabel(data, key) {
  const [pid, hid] = key.split('|');
  const p = get(data, 'platform', pid);
  const h = get(data, 'hazard', hid);
  return `${p?.name ?? 'A deleted platform'} · ${h ? `${hazardLabel(h)} ${h.title}` : 'a deleted hazard'}`;
}

/** Each pair against each card: Changed, No change, or blank, with its note. @param {Data} data @param {any} wf @param {string[]} keys */
function grid(data, wf, keys) {
  if (!keys.length) return html`<p class="muted">Nothing in scope.</p>`;
  return html`<div class="wf-grid-wrap"><table class="wf-grid"><thead><tr><th scope="col">Platform · hazard</th>${TECH_CARDS.map((c) => html`<th scope="col">${TECH_WORDS[c]}</th>`)}</tr></thead>
    <tbody>${keys.map((k) => html`<tr><th scope="row">${rowLabel(data, k)}</th>${TECH_CARDS.map((c) => {
      const s = stepOf(data, wf.id, k, c);
      return html`<td class="${s?.answer === 'changed' ? 'yes' : 'no'}">${s?.answer === 'changed' ? 'Changed' : s?.answer === 'none' ? 'No change' : ''}${s?.note ? html`<div class="wf-note">${s.note}</div>` : ''}</td>`;
    })}</tr>`)}</tbody></table></div>`;
}

/** @param {any} wf @param {string} pos @param {any} body @param {boolean} done @param {string} current */
const railItem = (wf, pos, body, done, current) => html`<button type="button" class="wf-rail-item${current === pos ? ' on' : ''}${done ? ' done' : ''}" ${dataAttrs({ action: 'showWorkflowHazard', 'workflow-id': wf.id, 'hazard-id': pos })}>${body}</button>`;

/** The scope, each platform with its hazards and how many of their cards are answered, and the summary. @param {Data} data @param {any} wf @param {string} current */
function rail(data, wf, current) {
  const prog = workflowProgress(data, wf);
  const scope = techScope(data, wf);
  const scoped = scope.some((s) => s.hazards.length);
  const n = TECH_CARDS.length;
  return html`<nav class="wf-rail" aria-label="Scope and hazards"><div class="wf-rail-h">New tech data <span class="muted">${prog.done}/${prog.total}</span></div>
    ${railItem(wf, '@scope', html`<span class="wf-mark" aria-hidden="true">${scoped ? '✓' : ''}</span><span class="wf-name">Scope</span><span class="wf-count"></span>`, scoped, current)}
    ${scope.map((s) => html`<div class="wf-rail-group">${s.platform.name}</div>${s.hazards.map((x) => {
      const k = prog.perHazard.get(x.key) ?? 0;
      return railItem(wf, x.key, html`<span class="wf-mark" aria-hidden="true">${k === n ? '✓' : ''}</span><span class="wf-name">${idTag(x.reportId)} ${x.hazard.title}</span><span class="wf-count">${k}/${n}</span>`, k === n, current);
    })}`)}
    ${railItem(wf, '', html`<span class="wf-mark" aria-hidden="true"></span><span class="wf-name">Summary &amp; complete</span>`, false, current)}</nav>`;
}

/** Ticking the platforms the data affects, then their hazards; a ticked one can gain a hazard. @param {Data} data @param {any} wf @param {boolean} mine */
function scopeStep(data, wf, mine) {
  const step = (/** @type {string} */ key) => stepOf(data, wf.id, key, 'scope');
  // Ticked platforms first; a stable sort keeps the name order within each.
  const ps = techPlatforms(data).sort((a, b) => Number(Boolean(step(`p:${b.id}`)?.checked)) - Number(Boolean(step(`p:${a.id}`)?.checked)));
  const card = (/** @type {any} */ p) => {
    const on = Boolean(step(`p:${p.id}`)?.checked);
    const at = { change: 'setTechScope', 'workflow-id': wf.id, 'platform-id': p.id };
    const hazards = on ? platformHazards(data, p.id).filter((ph) => ph.hazard.status === 'live').sort((a, b) => byNumber(a.hazard, b.hazard)) : [];
    return html`<section class="wf-check wf-scope${on ? ' done' : ''}" aria-label="${p.name}">
      <label class="wf-scope-p"><input type="checkbox" name="checked"${on ? raw(' checked') : ''} ${dataAttrs(at)}> <strong>${p.name}</strong></label>
      ${on ? html`<ul class="plain wf-scope-h">${hazards.map((ph) => {
        const s = step(pairKey(p.id, ph.hazard.id));
        return html`<li><label><input type="checkbox" name="checked"${s?.checked ? raw(' checked') : ''} ${dataAttrs({ ...at, 'hazard-id': ph.hazard.id })}> ${idTag(ph.reportId)} ${ph.hazard.title}</label>${s?.added ? html` <span class="tag">Added</span>` : ''}</li>`;
      })}</ul>${hazards.length ? '' : html`<p class="muted">No hazards on ${p.name} yet.</p>`}
      ${mine ? html`<div class="wf-scope-add">${plus({ action: 'openPicker', picker: 'linkHazards', 'platform-id': p.id, 'workflow-id': wf.id }, 'Add hazard…')} <span class="muted">Add hazard…</span>
        <form class="inline" data-action="addTechHazard" ${dataAttrs({ 'workflow-id': wf.id, 'platform-id': p.id })}><input name="title" required placeholder="New hazard title" aria-label="New hazard title on ${p.name}"><button type="submit" class="small">Add</button></form></div>` : ''}` : ''}
    </section>`;
  };
  return html`<h2>Scope</h2><p class="muted">Tick the platforms this data affects, then the hazards on each.</p>
    <fieldset class="wf-fields"${mine ? '' : raw(' disabled')}>${ps.map(card)}</fieldset>${ps.length ? '' : html`<p class="muted">No live platforms.</p>`}`;
}

/** One card on a pair: its question, the editor, Changed or No change, and a note. @param {any} state @param {Data} data @param {any} wf @param {any} x @param {string} card @param {number} n @param {Map<string, Set<string>>} touched */
function techCard(state, data, wf, x, card, n, touched) {
  const s = stepOf(data, wf.id, x.key, card);
  const at = { change: 'setStep', 'workflow-id': wf.id, 'hazard-id': x.key, check: card };
  const radio = (/** @type {string} */ value, /** @type {string} */ label) => html`<label class="wf-tick"><input type="radio" name="answer" value="${value}"${s?.answer === value ? raw(' checked') : ''} ${dataAttrs(at)}> ${label}</label>`;
  const warn = s?.answer === 'changed' && !touched.get(x.key)?.has(card);
  return html`<section class="wf-check${s?.answer ? ' done' : ''}" aria-label="${TECH_WORDS[card]}">
    <h3 class="wf-check-h"><span class="wf-n">${n}</span> ${TECH_WORDS[card]} <span class="muted wf-q">${TECH_QUESTIONS[card]}</span></h3>
    <div class="wf-check-body">${EDITOR[/** @type {keyof typeof EDITOR} */ (card)](state, data, x)}</div>
    <div class="wf-check-foot">
      <input class="grow" name="note" value="${s?.note ?? ''}" placeholder="Note (optional)…" aria-label="Note on ${TECH_WORDS[card]}" ${dataAttrs(at)}>
      <form class="wf-answer" role="radiogroup" aria-label="${TECH_WORDS[card]}: changed?">${radio('changed', 'Changed')}${radio('none', 'No change')}</form>
    </div>${warn ? html`<p class="wf-warn">No changes recorded here yet.</p>` : ''}</section>`;
}

/** @param {any} wf @param {string} label @param {string} pos */
const navButton = (wf, label, pos) => html`<button type="button" ${dataAttrs({ action: 'showWorkflowHazard', 'workflow-id': wf.id, 'hazard-id': pos })}>${label}</button>`;

/** @param {any} state @param {Data} data @param {any} wf @param {any} x @param {boolean} mine */
function pairPage(state, data, wf, x, mine) {
  const pairs = techPairs(data, wf);
  const i = pairs.findIndex((y) => y.key === x.key);
  const n = workflowProgress(data, wf).perHazard.get(x.key) ?? 0;
  const { cards } = techTouched(data, wf);
  return html`<div class="wf-hazard-h"><h2>${idTag(x.reportId)} ${go(x.hazard.title, 'hazard', { id: x.hazard.id, tab: `p:${x.platform.id}` })} <span class="muted">on</span> ${go(x.platform.name, 'platform', { id: x.platform.id })}</h2><span class="muted">${n}/${TECH_CARDS.length} answered</span></div>
    <fieldset class="wf-fields"${mine ? '' : raw(' disabled')}>${TECH_CARDS.map((c, k) => techCard(state, data, wf, x, c, k + 1, cards))}</fieldset>
    <div class="actions wf-nav">${i > 0 ? navButton(wf, '← Previous hazard', pairs[i - 1].key) : navButton(wf, '← Scope', '@scope')}${i < pairs.length - 1 ? navButton(wf, 'Next hazard →', pairs[i + 1].key) : navButton(wf, 'Summary & complete →', '')}</div>`;
}

/** @param {Data} data @param {any} wf @param {boolean} mine */
function summary(data, wf, mine) {
  const { done, total } = workflowProgress(data, wf);
  const left = total - done;
  const ref = get(data, 'reference', wf.referenceId);
  return html`<h2>Summary</h2>${grid(data, wf, techPairs(data, wf).map((x) => x.key))}
    <h3>Completing links ${ref?.title ?? 'the reference'} to</h3>${linkList(data, techLinks(data, wf))}
    <fieldset class="wf-fields"${mine ? '' : raw(' disabled')}>
      <label class="outcome">Outcome<textarea name="outcome" rows="3" placeholder="What the data changed, and anything to follow up…" ${dataAttrs({ change: 'setWorkflowOutcome', 'workflow-id': wf.id })}>${wf.outcome}</textarea></label>
      <div class="actions"><button type="button" class="primary" ${dataAttrs({ action: 'completeWorkflow', 'workflow-id': wf.id })}${left ? raw(' disabled') : ''}>${left ? `Complete — ${left} still needed` : 'Complete'}</button></div>
    </fieldset>`;
}

/**
 * An open New Tech Data: the rail, and the scope, a pair's cards, or the summary. Where it opens:
 * what the rail last chose, else where its owner left it, else the summary.
 * @param {any} state @param {Data} data @param {any} wf @param {boolean} mine
 */
export function techBody(state, data, wf, mine) {
  const v = state.view?.hazardId;
  const want = v === 'summary' ? null : v !== undefined ? v : (wf.at?.hazardId ?? null);
  const x = want && want !== '@scope' ? techPairs(data, wf).find((y) => y.key === want) ?? null : null;
  const page = want === '@scope' || (want && !x) ? '@scope' : x ? x.key : '';
  const main = page === '@scope' ? scopeStep(data, wf, mine) : x ? pairPage(state, data, wf, x, mine) : summary(data, wf, mine);
  return html`<div class="wf-layout">${rail(data, wf, page)}<div class="wf-main">${main}</div></div>`;
}

/** A completed or cancelled New Tech Data: its answers, what it linked, and the changes made through it. @param {any} state @param {Data} data @param {any} wf */
export function techEnded(state, data, wf) {
  const done = wf.state === 'completed';
  const keys = Array.isArray(wf.covered) ? wf.covered : [];
  return html`<p class="doc-meta"><span class="tag wf-${wf.state}">${done ? 'Completed' : 'Cancelled'}</span> by ${profileName(state, wf.endedBy)}, ${when(wf.endedAt)}.${done ? '' : ' The reference was not linked to anything.'}</p>
    <article class="doc">${grid(data, wf, keys)}
      ${done ? html`<h3>Linked to</h3>${linkList(data, wf.linked ?? [])}` : ''}
      ${wf.outcome ? html`<h3>Outcome</h3><p class="outcome-text">${wf.outcome}</p>` : ''}
      <h2>Changes made through ${workflowLabel(wf)}</h2>${changesList(state, data, wf)}</article>`;
}
