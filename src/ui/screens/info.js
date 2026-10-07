import { html, raw } from '../html.js';
import { dataAttrs, go, removeButton, removeColumn, option } from './common.js';
import { dataTable } from './table.js';
import { sectionRail } from './dashboard.js';
import { newRecord } from './hazards.js';
import { listPlatformGroups, groupMembers, facetOptions, unlistedEntries } from '../../core/queries.js';
import { FACET_WORD, ALL_PLATFORMS } from '../../core/ops/facets.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** Where to bring a deletion back from, said whenever something on Info is deleted. */
const RESTORE_NOTE = 'You can restore it from Deletion history in the ☰ menu.';

/**
 * The facets, in the order a hazard's platform tab shows them: what each is called and its rail icon.
 */
const FACETS = /** @type {const} */ ([
  { key: 'causalFactor', label: 'Causal factors', icon: 'causal' },
  { key: 'consequence', label: 'Consequences', icon: 'consequence' },
  { key: 'failureMode', label: 'Element failure modes', icon: 'failure' },
  { key: 'systemElement', label: 'System/Element', icon: 'element' },
  { key: 'phase', label: 'Lifecycle phases', icon: 'phases' },
  { key: 'affectedGroup', label: 'Affected groups', icon: 'people' },
]);

/**
 * Info, where the facets are set up: a rail with Platform groups first, then a section per facet.
 * Every section works the same way: a box to add one, double-click to rename, ✕ to delete, and
 * for a facet, a tick per platform group it is assigned to.
 * @param {any} state @param {Data} data
 */
export function infoView(state, data) {
  return html`<div class="head"><h1>Info</h1></div>
    ${sectionRail(state, 'info', [
      { key: 'groups', label: 'Platform groups', icon: 'groups', badge: listPlatformGroups(data).length, body: () => groupsSection(state, data) },
      ...FACETS.map((f) => {
        const rows = facetOptions(data, f.key);
        return { key: f.key, label: f.label, icon: f.icon, badge: rows.length, body: () => facetSection(state, data, f, rows) };
      }),
    ], 'groups')}`;
}

/**
 * A section's heading with a + beside it, which becomes a box to add one.
 * @param {any} state @param {string} title @param {string} kind what the + edits, e.g. newPlatformGroup
 * @param {string} action @param {string} placeholder @param {unknown} [extra] more fields for the form
 */
function sectionHead(state, title, kind, action, placeholder, extra = '') {
  return html`<div class="head sub-head"><h2>${title}</h2>${newRecord(state, kind, action, 'name', placeholder, extra)}</div>`;
}

/** A name that a double-click turns into a box to rename it. @param {any} state @param {string} kind @param {any} rec @param {Record<string, string>} change @param {string} label */
function renameCell(state, kind, rec, change, label) {
  return state.editing?.kind === kind && state.editing.id === rec.id
    ? html`<input class="cell-edit" name="name" value="${rec.name}" required aria-label="${label}" autofocus ${dataAttrs({ ...change, id: rec.id })}>`
    : html`<span class="cell-text" ${dataAttrs({ dblclick: 'startEdit', kind, id: rec.id })} title="Double-click to rename">${rec.name}</span>`;
}

/**
 * Platform groups: kinds of platform. A platform is put in its groups on its own page; a facet's
 * options are assigned to them in the facet's section.
 * @param {any} state @param {Data} data
 */
function groupsSection(state, data) {
  return html`${sectionHead(state, 'Platform groups', 'newPlatformGroup', 'createPlatformGroup', 'New platform group')}
    ${dataTable(state, {
      id: 'platformGroups',
      rowKey: (g) => g.id,
      rows: listPlatformGroups(data),
      empty: 'No platform groups yet.',
      columns: [
        { key: 'name', label: 'Group', width: 260, minWidth: 140, value: (g) => g.name, render: (g) => renameCell(state, 'platformGroupName', g, { change: 'renamePlatformGroup' }, 'Group name') },
        { key: 'count', label: 'Platforms', width: 110, minWidth: 90, value: (g) => groupMembers(data, g.id).length },
        { key: 'members', label: 'In this group', width: 480, minWidth: 200, sortable: false,
          render: (g) => {
            const members = groupMembers(data, g.id);
            return members.length ? html`${members.map((p, i) => html`${i ? ', ' : ''}${go(p.name, 'platform', { id: p.id })}`)}` : html`<span class="muted">None yet</span>`;
          } },
        removeColumn((g) => {
          const n = groupMembers(data, g.id).length;
          return removeButton(`Delete ${g.name}`, `Delete ${g.name}?`, `${n ? `${n === 1 ? 'Its one platform' : `Its ${n} platforms`} will no longer be in it, and its` : 'Its'} options will no longer be assigned to it. ${RESTORE_NOTE}`, { run: 'deletePlatformGroup', id: g.id });
        }),
      ],
    })}`;
}

/** What the dot on a row shown more than once says. */
const DUPLICATE_TIP = 'Duplicated row: this option belongs to more than one platform group shown, so it is listed under each.';

/**
 * One facet's options, with the platform groups each is assigned to and how many hazards and
 * platforms use it; below, entries given on hazards that are not yet options. The Tools tab on the
 * right assigns rows to a platform group and sets which groups are shown. Displayed by platform
 * group, each row is listed under each group shown that it is in (a dot marks the copies), and
 * those in none of them under No group.
 * @param {any} state @param {Data} data @param {typeof FACETS[number]} f @param {ReturnType<typeof facetOptions>} rows
 */
function facetSection(state, data, f, rows) {
  const word = FACET_WORD[f.key];
  // All platforms comes first, then the platform groups, wherever groups are listed here.
  const groups = [ALL_PLATFORMS, ...listPlatformGroups(data)];
  const tools = { assigning: null, hidden: [], byGroup: false, groupId: null, ...state.infoTools };
  const shown = groups.filter((g) => !tools.hidden.includes(g.id));
  const assigning = tools.assigning?.facet === f.key && groups.some((g) => g.id === tools.assigning.groupId) ? tools.assigning : null;
  const unlisted = f.key === 'phase' ? [] : unlistedEntries(data, f.key);
  const deleteText = (/** @type {ReturnType<typeof facetOptions>[number]} */ r) => (f.key === 'phase'
    ? `${r.hazards ? `It is ticked on ${r.hazards === 1 ? 'one hazard' : `${r.hazards} hazards`} and will come off ${r.hazards === 1 ? 'it' : 'them'}. ` : ''}${RESTORE_NOTE}`
    : `Hazards keep what they already have. ${RESTORE_NOTE}`);
  /** @typedef {ReturnType<typeof facetOptions>[number] & { key: string, group: any, copies: number, first: boolean }} Row */
  /** @type {Row[]} */
  let display;
  if (tools.byGroup) {
    const under = (/** @type {any} */ g) => rows.filter((r) => (g ? r.groupIds.has(g.id) : !shown.some((x) => r.groupIds.has(x.id))));
    const copies = (/** @type {any} */ r) => shown.filter((g) => r.groupIds.has(g.id)).length;
    display = [...shown, null].flatMap((g) => under(g).map((r, i) => ({ ...r, key: `${g?.id ?? '-'}|${r.option.id}`, group: g, copies: copies(r), first: i === 0 })));
  } else {
    display = rows.map((r) => ({ ...r, key: r.option.id, group: null, copies: 1, first: false }));
  }
  const order = new Map(shown.map((g, i) => [g.id, i]));
  const groupList = (/** @type {Row} */ r) => shown.filter((g) => r.groupIds.has(g.id));
  const table = dataTable(state, {
    id: `facet-${f.key}`,
    rowKey: (r) => r.key,
    rows: display,
    empty: `No ${f.label.toLowerCase()} yet.`,
    rowClass: (r) => (tools.byGroup && r.first ? 'group-start' : ''),
    rowAttrs: (r) => (assigning ? { selectable: '', 'option-id': r.option.id } : {}),
    columns: [
      ...(tools.byGroup ? [{ key: 'group', label: 'Platform group', width: 160, minWidth: 120, value: (/** @type {Row} */ r) => (r.group ? order.get(r.group.id) ?? 0 : shown.length),
        merge: (/** @type {Row} */ r) => r.group?.id ?? '-',
        render: (/** @type {Row} */ r) => (r.group ? html`<span class="tag group-tag">${r.group.name}</span>` : html`<span class="muted">No group</span>`) }] : []),
      { key: 'name', label: f.label, width: 260, minWidth: 140, value: (r) => r.option.name, filter: 'text',
        render: (r) => html`<div class="option-name">${renameCell(state, 'facetOption', r.option, { change: 'renameFacetOption', facet: f.key }, `${word} name`)}${r.copies > 1
          ? html`<span class="dup-dot" role="img" tabindex="0" title="${DUPLICATE_TIP}" aria-label="${DUPLICATE_TIP}"></span>` : ''}</div>` },
      ...(tools.byGroup ? [] : [{ key: 'groups', label: 'Platform groups', width: 220, minWidth: 140, value: (/** @type {Row} */ r) => groupList(r).map((g) => g.name).join(', '),
        render: (/** @type {Row} */ r) => (groupList(r).length
          ? html`<ul class="plain dots option-groups">${groupList(r).map((g) => html`<li>${g.name}<button type="button" class="icon-x og-x" title="Take ${r.option.name} out of ${g.name}" aria-label="Take ${r.option.name} out of ${g.name}" ${dataAttrs({ action: 'setOptionGroup', facet: f.key, 'option-id': r.option.id, 'group-id': g.id, on: 'false' })}>✕</button></li>`)}</ul>`
          : html`<span class="muted">—</span>`) }]),
      { key: 'hazards', label: 'Hazards', width: 105, minWidth: 95, value: (r) => r.hazards },
      { key: 'platforms', label: 'Platforms', width: 115, minWidth: 105, value: (r) => r.platforms },
      removeColumn((r) => removeButton(`Delete ${r.option.name}`, `Delete ${r.option.name}?`, deleteText(r), { run: 'deleteFacetOption', facet: f.key, id: r.option.id })),
    ],
  });
  return html`${sectionHead(state, f.label, `newFacetOption:${f.key}`, 'createFacetOption', `New ${word}`, html`<input type="hidden" name="facet" value="${f.key}">`)}
    <div class="info-work${assigning ? ' info-assigning' : ''}">
      <div class="info-main">${table}
    ${unlisted.length ? html`<section class="info-unlisted" aria-label="On hazards, not in the list">
      <div class="info-unlisted-h"><h3>On hazards, not in the list <span class="count">${unlisted.length}</span></h3>
        <button type="button" class="small" ${dataAttrs({ action: 'addUnlistedOptions', facet: f.key })}>Add all</button></div>
      <ul class="info-unlisted-list">${unlisted.map((e) => html`<li><span>${e.text}</span><span class="muted">${e.hazards === 1 ? '1 hazard' : `${e.hazards} hazards`}, ${e.platforms === 1 ? '1 platform' : `${e.platforms} platforms`}</span>
        <button type="button" class="small" ${dataAttrs({ action: 'createFacetOption', facet: f.key, name: e.text })}>Add to list</button></li>`)}</ul>
    </section>` : ''}</div>
      ${toolTab(f, groups, tools, assigning)}
    </div>`;
}

/**
 * The Tools tab beside a facet's table: Assign to platform group (choose a group, then rows, then
 * Confirm), and View setup (which platform groups are shown, and Display by platform group).
 * @param {typeof FACETS[number]} f @param {any[]} groups @param {{ hidden: string[], byGroup: boolean, groupId?: string | null }} tools
 *   groupId: the group chosen last, which the drop-down keeps
 * @param {{ facet: string, groupId: string } | null} assigning
 */
function toolTab(f, groups, tools, assigning) {
  const group = assigning ? groups.find((g) => g.id === assigning.groupId) : null;
  const assign = assigning && group
    ? html`<form class="assign-form" data-assign-form ${dataAttrs({ facet: f.key, 'group-id': group.id })}>
        <p class="tool-line">Assigning to <strong>${group.name}</strong></p>
        <p class="muted tool-hint">Drag over rows, or Shift-click and Ctrl-click, to choose them.</p>
        <p class="tool-line" data-assign-count>None chosen</p>
        <div class="tool-buttons"><button type="submit" class="primary" data-assign-confirm disabled>Confirm</button><button type="button" ${dataAttrs({ action: 'cancelAssignToGroup' })}>Cancel</button></div>
      </form>`
    : html`<form ${dataAttrs({ action: 'startAssignToGroup', facet: f.key })} class="assign-start">
        <select name="groupId" aria-label="Platform group to assign to" ${dataAttrs({ change: 'chooseAssignGroup' })}>${groups.map((g) => option(g.id, g.name, tools.groupId ?? ''))}</select>
        <button type="submit">Choose rows</button></form>`;
  return html`<aside class="tool-tab" aria-label="Tools">
    <h3 class="tool-tab-title">Tools</h3>
    <section class="tool-sec" aria-label="Assign to platform group"><h4>Assign to platform group</h4>${assign}</section>
    <section class="tool-sec" aria-label="View setup"><h4>View setup</h4>
      <div class="tool-buttons"><button type="button" class="small" ${dataAttrs({ action: 'showInfoGroups', all: 'true' })}>Select all</button><button type="button" class="small" ${dataAttrs({ action: 'showInfoGroups', all: 'false' })}>Deselect all</button></div>
      <ul class="plain view-groups">${groups.map((g) => html`<li><label><input type="checkbox" name="on" ${dataAttrs({ change: 'toggleInfoGroup', 'group-id': g.id })}${tools.hidden.includes(g.id) ? '' : raw(' checked')}> ${g.name}</label></li>`)}</ul>
      <button type="button" class="bt-tags-toggle${tools.byGroup ? ' on' : ''}" role="switch" aria-checked="${tools.byGroup ? 'true' : 'false'}" ${dataAttrs({ action: 'toggleInfoByGroup' })}><span class="bt-tags-track" aria-hidden="true"><span class="bt-tags-knob"></span></span>Display by platform group</button>
    </section>
  </aside>`;
}
