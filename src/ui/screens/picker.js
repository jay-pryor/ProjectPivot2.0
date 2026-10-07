import { html } from '../html.js';
import { dataAttrs, option, idTag, levelTag } from './common.js';
import { live, get } from '../../core/data.js';
import { hazardLabel, controlLabel, referenceLabel, platformLabel } from '../../core/ids.js';
import { hazardsNotOn, platformsNotOn, copySources, stageCopySources, partCopySources, controlsOnPlatform, hazardDetail, referencesFor, referenceTargets, phasesOf, controlPlatforms, groupsOf, listPlatformGroups, causalFactorsOn, childrenOf, platformListOn } from '../../core/queries.js';
import { CONTROL_KINDS } from '../../core/ops/controls.js';
import { RECEPTORS, RECEPTOR_WORD } from '../../core/receptors.js';

/**
 * A list to tick things in, opened by a small + next to a table. Typing in its search box narrows
 * the list on screen only, so ticks are never lost.
 * @param {any} state @param {import('../../core/data.js').Data} data
 */
export function pickerView(state, data) {
  const p = state.picker;
  if (!p) return '';
  if (p.picker === 'linkHazards') {
    const hazards = hazardsNotOn(data, p.platformId);
    return frame('Link hazards', html`<form data-action="linkHazards" ${dataAttrs({ 'platform-id': p.platformId })} class="picker-form">
      ${search()}
      <ul class="pick-list">${hazards.map((h) => html`<li data-pick-text="${`${hazardLabel(h)} ${h.title}`.toLowerCase()}"><label><input type="checkbox" name="hazardId" value="${h.id}"> <span class="id">${idTag(hazardLabel(h))}</span> ${h.title}</label></li>`)}</ul>
      ${hazards.length ? '' : html`<p class="muted">Every live hazard is already on this platform.</p>`}
      ${buttons('Link')}</form>`);
  }
  if (p.picker === 'controlHazards') {
    const c = data.records.control[p.controlId];
    if (!c) return '';
    const kinds = (/** @type {string} */ key, /** @type {string} */ name) => html`<select name="kind:${key}" aria-label="Kind for ${name}">${CONTROL_KINDS.map((k) => option(k, k))}</select>`;
    const linked = new Set(live(data, 'hazardControl').filter((l) => l.controlId === c.id).map((l) => l.hazardId));
    const hazards = live(data, 'hazard').filter((h) => !linked.has(h.id)).sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
    return frame(`Link ${c.title} to hazards`, html`<form data-action="linkControlToHazards" ${dataAttrs({ 'control-id': c.id })} class="picker-form">
      ${search()}
      <ul class="pick-list">${hazards.map((h) => html`<li data-pick-text="${`${hazardLabel(h)} ${h.title}`.toLowerCase()}"><label><input type="checkbox" name="hazardId" value="${h.id}"> <span class="id">${idTag(hazardLabel(h))}</span> ${h.title}</label>
        ${kinds(h.id, h.title)}</li>`)}</ul>
      ${hazards.length ? '' : html`<p class="muted">${live(data, 'hazard').length ? 'It is already linked to every live hazard.' : 'No hazards yet: add them on the Hazards page.'}</p>`}
      ${buttons('Link')}</form>`);
  }
  if (p.picker === 'linkPlatforms') {
    const platforms = platformsNotOn(data, p.hazardId);
    return frame('Link platforms', html`<form data-action="linkPlatforms" ${dataAttrs({ 'hazard-id': p.hazardId })} class="picker-form">
      ${search()}
      <ul class="pick-list">${platforms.map((pl) => html`<li data-pick-text="${`${platformLabel(pl)} ${pl.name}`.toLowerCase()}"><label><input type="checkbox" name="platformId" value="${pl.id}"> <span class="id">${idTag(platformLabel(pl))}</span> ${pl.name}</label></li>`)}</ul>
      ${platforms.length ? '' : html`<p class="muted">${live(data, 'platform').length ? 'The hazard is already on every live platform.' : 'No platforms yet: add them on the Platforms page.'}</p>`}
      ${buttons('Link')}</form>`);
  }
  if (p.picker === 'copyJustification') {
    const sources = copySources(data, p.hazardId, p.platformId, p.stage, p.receptor, p.field);
    const what = `${p.stage} ${p.receptor} ${p.field === 'likelihoodWhy' ? 'likelihood' : 'consequence'} justification`;
    return frame(`Copy the ${what}`, html`<p class="muted">Choose the platform to copy from. It replaces what is in this box.</p>
      <ul class="copy-list">${sources.map((x) => html`<li><button type="button" class="copy-choice" ${dataAttrs({ action: 'copyJustification', 'hazard-id': p.hazardId, 'platform-id': p.platformId, stage: p.stage, receptor: p.receptor, field: p.field, from: x.platform.id })}><strong>${x.platform.name}</strong><span>${x.text}</span></button></li>`)}</ul>
      ${sources.length ? '' : html`<p class="muted">No other platform has text here yet.</p>`}
      <div class="actions"><button type="button" ${dataAttrs({ action: 'closePicker' })}>Cancel</button></div>`);
  }
  if (p.picker === 'copyStage') {
    const sources = stageCopySources(data, p.hazardId, p.platformId, p.stage);
    // A form, so the choice of platform (its button) goes with the Include justifications tick.
    return frame(`Copy the ${p.stage} risk`, html`<form data-action="copyStage" ${dataAttrs({ 'hazard-id': p.hazardId, 'platform-id': p.platformId, stage: p.stage })} class="picker-form">
      <p class="muted">Choose the platform to copy from. Its likelihood and consequence for each risk type replace this platform's.</p>
      <label class="copy-why"><input type="checkbox" name="withWhy" value="true" checked> Include justifications <span class="muted">(their text replaces this platform's too)</span></label>
      <ul class="copy-list">${sources.map(({ platform, ratings }) => html`<li><button type="submit" class="copy-choice" name="from" value="${platform.id}">
        <strong>${platform.name}</strong>
        <span class="copy-levels">${RECEPTORS.map((r) => html`<span>${RECEPTOR_WORD[/** @type {'personnel'} */ (r)]} ${levelTag(/** @type {any} */ (ratings)[r])}</span>`)}</span></button></li>`)}</ul>
      ${sources.length ? '' : html`<p class="muted">No other platform has ${p.stage} risk yet.</p>`}
      <div class="actions"><button type="button" ${dataAttrs({ action: 'closePicker' })}>Cancel</button></div></form>`);
  }
  if (p.picker === 'controlTargets') {
    // What one control prevents (this platform's causal factors) or mitigates (the hazard's consequences).
    const row = controlsOnPlatform(data, p.hazardId, p.platformId).find((x) => x.control.id === p.controlId);
    if (!row) return '';
    const mitigating = row.kind === 'mitigating';
    const pool = mitigating ? childrenOf(data, 'consequence', p.hazardId) : causalFactorsOn(data, p.hazardId, p.platformId);
    const ticked = new Set(row.targets.map((/** @type {any} */ t) => t.id));
    return frame(`What ${row.control.title} ${mitigating ? 'mitigates' : 'prevents'}`, html`<form data-action="saveControlTargets" ${dataAttrs({ 'hazard-id': p.hazardId, 'platform-id': p.platformId, 'control-id': p.controlId })} class="picker-form">
      <p class="muted">As a ${row.kind} control, it ${mitigating ? 'mitigates the hazard\'s consequences' : 'prevents this platform\'s causal factors'}. Tick each it does; the bow-tie joins them.</p>
      <ul class="pick-list">${pool.map((r, i) => html`<li><label><input type="checkbox" name="targets" value="${r.id}"${ticked.has(r.id) ? html` checked` : ''}> <span class="nl-num">${i + 1}</span> ${r.text}</label></li>`)}</ul>
      ${pool.length ? '' : html`<p class="muted">${mitigating ? 'The hazard has no consequences yet.' : 'This platform has no causal factors yet.'}</p>`}
      ${buttons('Save')}</form>`);
  }
  if (p.picker === 'copyPart') {
    const sources = partCopySources(data, p.hazardId, p.platformId, p.part);
    const WHAT = {
      controls: ['controls', 'The hazard\'s controls here become those on that platform, each with the status (and any rejection reason) it has there.'],
      sfarp: ['SFARP considerations', 'Its justification, conclusion and conditions replace this platform\'s.'],
    }[/** @type {'controls'} */ (p.part)] ?? ['', ''];
    /** @param {any} x */
    const preview = (x) => (p.part === 'controls' ? [...new Set(x.states)].map((s) => `${x.states.filter((/** @type {string} */ t) => t === s).length} ${s}`).join(', ')
      : x.sfarp.conclusion || x.sfarp.justification || x.sfarp.conditions);
    return frame(`Copy the ${WHAT[0]}`, html`<p class="muted">Choose the platform to copy from. ${WHAT[1]}</p>
      <ul class="copy-list">${sources.map((x) => html`<li><button type="button" class="copy-choice" ${dataAttrs({ action: 'copyPlatformPart', part: p.part, 'hazard-id': p.hazardId, 'platform-id': p.platformId, from: x.platform.id })}><strong>${x.platform.name}</strong><span>${preview(x)}</span></button></li>`)}</ul>
      ${sources.length ? '' : html`<p class="muted">No other platform has any to copy.</p>`}
      <div class="actions"><button type="button" ${dataAttrs({ action: 'closePicker' })}>Cancel</button></div>`);
  }
  if (p.picker === 'linkControls') {
    const d = hazardDetail(data, p.hazardId);
    const linked = new Set((d?.controls ?? []).map((c) => c.control.id));
    const library = live(data, 'control');
    const controls = library.filter((c) => !linked.has(c.id));
    return frame('Link controls', html`<form data-action="linkControls" ${dataAttrs({ 'hazard-id': p.hazardId })} class="picker-form">
      ${search()}
      <ul class="pick-list">${controls.map((c) => html`<li data-pick-text="${`${controlLabel(c)} ${c.title}`.toLowerCase()}"><label><input type="checkbox" name="controlId" value="${c.id}"> <span class="id">${idTag(controlLabel(c))}</span> ${c.title}</label>
        <select name="kind:${c.id}" aria-label="Kind of ${c.title}">${CONTROL_KINDS.map((k) => option(k, k, c.kind ?? 'preventative'))}</select></li>`)}</ul>
      ${controls.length ? '' : html`<p class="muted">${library.length ? 'Every control is already linked.' : 'There are no controls yet: add them on the Controls page.'}</p>`}
      ${buttons('Link')}</form>`);
  }
  if (p.picker === 'addControlsHere') {
    const here = new Set(controlsOnPlatform(data, p.hazardId, p.platformId).map((x) => x.control.id));
    const library = live(data, 'control');
    // Which of the hazard's other platforms each is already on: named, and listed first.
    /** @type {Map<string, string[]>} */
    const usedOn = new Map();
    for (const l of live(data, 'hazardControl').filter((x) => x.hazardId === p.hazardId)) {
      const names = controlPlatforms(data, p.hazardId, l.controlId).filter((pid) => pid !== p.platformId).map((pid) => String(get(data, 'platform', pid)?.name ?? ''));
      if (names.length) usedOn.set(l.controlId, names);
    }
    const controls = library.filter((c) => !here.has(c.id)).sort((a, b) => Number(!usedOn.has(a.id)) - Number(!usedOn.has(b.id)));
    return frame('Add controls', html`<form data-action="addControlsHere" ${dataAttrs({ 'hazard-id': p.hazardId, 'platform-id': p.platformId })} class="picker-form">
      ${search()}
      <ul class="pick-list">${controls.map((c) => html`<li data-pick-text="${`${controlLabel(c)} ${c.title}`.toLowerCase()}"><label><input type="checkbox" name="controlId" value="${c.id}"> <span class="id">${idTag(controlLabel(c))}</span> ${c.title}${usedOn.has(c.id) ? html` <span class="pick-from">on ${usedOn.get(c.id)?.join(', ')}</span>` : ''}</label>
        <select name="kind:${c.id}" aria-label="Kind of ${c.title}">${CONTROL_KINDS.map((k) => option(k, k, c.kind ?? 'preventative'))}</select></li>`)}</ul>
      ${controls.length ? '' : html`<p class="muted">${library.length ? 'Every control is already on this platform.' : 'There are no controls yet.'} Make one with Add new.</p>`}
      <div class="pick-new" data-new-section hidden>
        <p class="pick-group">New control</p>
        <div class="row inline fill"><input name="newTitle" class="grow" placeholder="New control title…" aria-label="New control title" autocomplete="off">
          <select name="newKind" aria-label="Kind of the new control">${CONTROL_KINDS.map((k) => option(k, k))}</select></div>
        <p class="muted small-text">Made as a control (C-…) and added here with any ticked above.</p>
      </div>
      <div class="actions"><button type="submit" class="primary">Add</button><button type="button" data-show-new aria-expanded="false" title="Make a new control and add it here">Add new</button><button type="button" ${dataAttrs({ action: 'closePicker' })}>Cancel</button></div></form>`);
  }
  if (p.picker === 'linkPhases') {
    const ticked = new Set(phasesOf(data, p.hazardId).map((x) => x.phase.id));
    const phases = live(data, 'phase').filter((ph) => !ticked.has(ph.id)).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    return frame('Add lifecycle phases', html`<form data-action="linkPhases" ${dataAttrs({ 'hazard-id': p.hazardId })} class="picker-form">
      ${search()}
      <ul class="pick-list">${phases.map((ph) => html`<li data-pick-text="${String(ph.name).toLowerCase()}"><label><input type="checkbox" name="phaseId" value="${ph.id}"> ${ph.name}</label></li>`)}</ul>
      ${phases.length ? '' : html`<p class="muted">${live(data, 'phase').length ? 'Every live phase is already ticked.' : 'No phases yet: add them under Info, Lifecycle phases.'}</p>`}
      ${buttons('Add')}</form>`);
  }
  if (p.picker === 'tagPlatforms') {
    const inGroups = new Set(groupsOf(data, p.platformId).map((g) => g.id));
    const groups = listPlatformGroups(data).filter((g) => !inGroups.has(g.id));
    return frame('Add to platform groups', html`<form data-action="tagPlatforms" ${dataAttrs({ 'platform-id': p.platformId })} class="picker-form">
      ${search()}
      <ul class="pick-list">${groups.map((g) => html`<li data-pick-text="${String(g.name).toLowerCase()}"><label><input type="checkbox" name="groupId" value="${g.id}"> ${g.name}</label></li>`)}</ul>
      ${groups.length ? '' : html`<p class="muted">${listPlatformGroups(data).length ? 'This platform is already in every group.' : 'No platform groups yet: add them under Info, Platform groups.'}</p>`}
      ${buttons('Add')}</form>`);
  }
  if (p.picker === 'linkReferences') {
    const linked = new Set(referencesFor(data, p.targetKind, p.targetId).map((x) => x.reference.id));
    // An archived reference is not offered: move it back to Active to link it again.
    const refs = live(data, 'reference').filter((r) => !linked.has(r.id) && !r.archived);
    return frame('Link references', html`<form data-action="linkReferences" ${dataAttrs({ 'target-kind': p.targetKind, 'target-id': p.targetId })} class="picker-form">
      ${search()}
      <ul class="pick-list">${refs.map((r) => html`<li data-pick-text="${`${referenceLabel(r)} ${r.title} ${r.docNumber}`.toLowerCase()}"><label><input type="checkbox" name="referenceId" value="${r.id}"> <span class="id">${idTag(referenceLabel(r))}</span> ${r.title}</label></li>`)}</ul>
      ${refs.length ? '' : html`<p class="muted">${live(data, 'reference').length ? 'Every reference is already linked here.' : 'No references yet: add them on the References page.'}</p>`}
      ${buttons('Link')}</form>`);
  }
  if (p.picker === 'linkTargets') {
    const linked = new Set(referenceTargets(data, p.referenceId).map((x) => `${x.link.targetKind}|${x.link.targetId}`));
    /** @param {string} kind @param {string} id @param {string} text @param {any} label */
    const item = (kind, id, text, label) => (linked.has(`${kind}|${id}`) ? '' : html`<li data-pick-text="${text.toLowerCase()}"><label><input type="checkbox" name="target" value="${kind}|${id}"> ${label}</label></li>`);
    const hazards = live(data, 'hazard');
    return frame('Link records', html`<form data-action="linkTargets" ${dataAttrs({ 'reference-id': p.referenceId })} class="picker-form">
      ${search()}
      <ul class="pick-list">
        ${live(data, 'platform').map((pl) => item('platform', pl.id, `platform ${pl.name}`, html`Platform <span class="id">${idTag(platformLabel(pl))}</span> ${pl.name}`))}
        ${hazards.map((h) => html`${item('hazard', h.id, `${hazardLabel(h)} ${h.title}`, html`Hazard <span class="id">${idTag(hazardLabel(h))}</span> ${h.title}`)}
          ${live(data, 'causalFactor').filter((x) => x.hazardId === h.id).map((x) => item('causalFactor', x.id, `${hazardLabel(h)} ${x.text}`, html`<span class="indent">Causal factor of ${hazardLabel(h)}: ${x.text}</span>`))}
          ${live(data, 'consequence').filter((x) => x.hazardId === h.id).map((x) => item('consequence', x.id, `${hazardLabel(h)} ${x.text}`, html`<span class="indent">Consequence of ${hazardLabel(h)}: ${x.text}</span>`))}`)}
        ${live(data, 'control').map((c) => item('control', c.id, `${controlLabel(c)} ${c.title}`, html`Control <span class="id">${idTag(controlLabel(c))}</span> ${c.title}`))}
      </ul>
      ${buttons('Link')}</form>`);
  }
  if (p.picker === 'linkReferenceFor') {
    // From a hazard page's References: link one reference to more of what that page shows, in
    // groups as the page shows them, leaving out what it already supports.
    const ref = get(data, 'reference', p.referenceId);
    const h = get(data, 'hazard', p.hazardId);
    if (!ref || !h) return '';
    const linked = new Set(referenceTargets(data, ref.id).map((x) => `${x.link.targetKind}|${x.link.targetId}`));
    const platform = p.platformId ? get(data, 'platform', p.platformId) : null;
    /** @type {[string, string, { id: string, text: string }[]][]} */
    const groups = [
      ['hazard', 'Hazard', [{ id: h.id, text: `${hazardLabel(h)} ${h.title}` }]],
      ['causalFactor', 'Causal factors', causalFactorsOn(data, h.id, p.platformId || null).map((x) => ({ id: x.id, text: String(x.text) }))],
      ['consequence', 'Consequences', childrenOf(data, 'consequence', h.id).map((x) => ({ id: x.id, text: String(x.text) }))],
      ...(/** @type {[string, string, { id: string, text: string }[]][]} */ (p.platformId ? [
        ['failureMode', 'Element failure modes', platformListOn(data, 'failureMode', h.id, p.platformId).map((x) => ({ id: x.id, text: String(x.text) }))],
        ['systemElement', 'System/Element', platformListOn(data, 'systemElement', h.id, p.platformId).map((x) => ({ id: x.id, text: String(x.text) }))],
      ] : [])),
      ['hazardPhase', 'Lifecycle phases', phasesOf(data, h.id).map((x) => ({ id: x.link.id, text: String(x.phase?.name ?? '') }))],
      ...(/** @type {[string, string, { id: string, text: string }[]][]} */ (p.platformId ? [
        ['affectedGroup', 'Affected groups', platformListOn(data, 'affectedGroup', h.id, p.platformId).map((x) => ({ id: x.id, text: String(x.text) }))],
      ] : [])),
    ];
    const open = groups.map(([kind, word, items]) => /** @type {const} */ ([kind, word, items.filter((x) => !linked.has(`${kind}|${x.id}`))])).filter(([, , items]) => items.length);
    return frame(`Link ${ref.title}`, html`<form data-action="linkTargets" ${dataAttrs({ 'reference-id': ref.id })} class="picker-form">
      <p class="muted">What on ${platform ? `${hazardLabel(h)} on ${platform.name}` : hazardLabel(h)} does it support?</p>
      ${search()}
      <ul class="pick-list">${open.map(([kind, word, items]) => html`<li class="pick-group">${word}</li>${items.map((x) => html`<li data-pick-text="${`${word} ${x.text}`.toLowerCase()}"><label><input type="checkbox" name="target" value="${kind}|${x.id}"> ${x.text}</label></li>`)}`)}</ul>
      ${open.length ? '' : html`<p class="muted">It already supports everything this page shows.</p>`}
      ${buttons('Link')}</form>`);
  }
  return '';
}

function search() {
  return html`<input class="pick-search" data-filter-list placeholder="Search…" aria-label="Search the list" autofocus>`;
}

/** @param {string} label */
function buttons(label) {
  return html`<div class="actions"><button type="submit" class="primary">${label}</button><button type="button" ${dataAttrs({ action: 'closePicker' })}>Cancel</button></div>`;
}

/** @param {string} title @param {import('../html.js').Raw} body */
function frame(title, body) {
  return html`<div class="picker-overlay"><div class="picker" role="dialog" aria-modal="true" aria-label="${title}"><h2>${title}</h2>${body}</div></div>`;
}
