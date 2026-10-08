import { test } from 'node:test';
import assert from 'node:assert/strict';
import { infoView } from '../../src/ui/screens/info.js';
import { platformView, platformsView } from '../../src/ui/screens/platforms.js';
import { homeView } from '../../src/ui/screens/home.js';
import { pickerView } from '../../src/ui/screens/picker.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers, addSystemElement } from '../../src/core/ops/hazards.js';
import { createPlatformGroup, tagPlatform } from '../../src/core/ops/platform-groups.js';
import { createFacetOption, assignToGroup } from '../../src/core/ops/facets.js';
import { seed, act } from '../helpers.js';

const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Bo', createdAt: '' }] };
/** UAS (Alpha, Bravo), Ground vehicles (Alpha), <Sea> (none); Propeller on h1 at Alpha. */
function data() {
  let d = assignNumbers(seed());
  d = createPlatformGroup(d, act, { id: 'g1', name: 'UAS' });
  d = createPlatformGroup(d, act, { id: 'g2', name: 'Ground vehicles' });
  d = createPlatformGroup(d, act, { id: 'g3', name: '<Sea>' });
  d = tagPlatform(d, act, { platformId: 'p1', groupId: 'g1' });
  d = tagPlatform(d, act, { platformId: 'p1', groupId: 'g2' });
  d = tagPlatform(d, act, { platformId: 'p2', groupId: 'g1' });
  return addSystemElement(d, act, { hazardId: 'h1', platformId: 'p1', text: 'Propeller' });
}

test('Info opens on Platform groups, first in its menu, then Hazards and Controls, then a section for each facet; groups are added, renamed and deleted like the facets', () => {
  const out = infoView(state, data()).toString();
  assert.match(out, /<h1>Info<\/h1>/);
  assert.deepEqual([...out.matchAll(/data-page="info" data-section="(\w+)"/g)].map((m) => m[1]), ['groups', 'hazards', 'controls', 'causalFactor', 'consequence', 'failureMode', 'systemElement', 'phase', 'affectedGroup']);
  assert.match(out, /class="rail-item on"[^>]*data-section="groups">[\s\S]*?Platform groups<\/span><span class="rail-badge">3<\/span>/);
  assert.match(out, /<h2>Platform groups<\/h2><button type="button" class="plus" data-action="startEdit" data-kind="newPlatformGroup" data-id="new"/);
  assert.doesNotMatch(out, /<p class="muted">/, 'no description under the heading');
  assert.match(infoView({ ...state, editing: { kind: 'newPlatformGroup', id: 'new' } }, data()).toString(), /<form data-action="createPlatformGroup" class="row inline new-record"><input name="name" required placeholder="New platform group"/);
  assert.match(out, /data-row="g1"[\s\S]*?UAS<\/span><\/td><td>2<\/td><td>[\s\S]*?Alpha[\s\S]*?Bravo/);
  assert.match(out, /data-row="g3"[\s\S]*?&lt;Sea&gt;[\s\S]*?None yet/);
  assert.match(out, /data-action="askConfirm" data-run="deletePlatformGroup" data-id="g1" data-title="Delete UAS\?" data-text="Its 2 platforms will no longer be in it, and its options, hazards and controls will no longer be assigned to it\. You can restore it from Deletion history/);
  assert.doesNotMatch(out, /row-menu/, 'no Options menu');
  const renaming = infoView({ ...state, editing: { kind: 'platformGroupName', id: 'g2' } }, data()).toString();
  assert.match(renaming, /<input class="cell-edit" name="name" value="Ground vehicles"[^>]*data-change="renamePlatformGroup" data-id="g2"/);
});

/** System/Element options: propeller (UAS, Ground vehicles), Rotor (none); Battery given on a hazard but not an option. */
function withOptions() {
  let d = createFacetOption(data(), act, { id: 'o1', facet: 'systemElement', name: 'propeller' });
  d = createFacetOption(d, act, { id: 'o2', facet: 'systemElement', name: 'Rotor' });
  d = assignToGroup(d, act, { facet: 'systemElement', optionIds: ['o1'], groupId: 'g1' });
  d = assignToGroup(d, act, { facet: 'systemElement', optionIds: ['o1'], groupId: 'g2' });
  return addSystemElement(d, act, { hazardId: 'h1', platformId: 'p2', text: 'Battery' });
}
const facetPage = (extra = {}) => infoView({ ...state, sections: { info: 'systemElement' }, ...extra }, withOptions()).toString();

test('a facet section lists its options with their platform groups as dot points, and offers entries on hazards not yet in the list', () => {
  const out = facetPage();
  assert.match(out, /data-reveal="info:systemElement"[\s\S]*?<h2>System\/Element<\/h2>/);
  assert.match(out, /<h2>System\/Element<\/h2><button type="button" class="plus" data-action="startEdit" data-kind="newFacetOption:systemElement" data-id="new"/);
  const adding = facetPage({ editing: { kind: 'newFacetOption:systemElement', id: 'new' } });
  assert.match(adding, /<form data-action="createFacetOption" class="row inline new-record"><input name="name" required placeholder="New system or element"[^>]*><input type="hidden" name="facet" value="systemElement">/);
  assert.deepEqual([...out.matchAll(/<th data-col="([^"]+)"/g)].map((m) => m[1]), ['name', 'groups', 'hazards', 'platforms', 'actions']);
  assert.doesNotMatch(out, /type="checkbox" name="on" aria-label="propeller/, 'no tick boxes in the table');
  assert.match(out, /data-row="o1"[\s\S]*?propeller<\/span><\/div><\/td><td><ul class="plain dots option-groups"><li>UAS<button[^>]*data-action="setOptionGroup" data-facet="systemElement" data-option-id="o1" data-group-id="g1" data-on="false">✕<\/button><\/li><li>Ground vehicles/);
  assert.match(out, /data-row="o1"[\s\S]*?<td>1<\/td><td>1<\/td>/, 'propeller is used on h1 at Alpha, ignoring case');
  assert.match(out, /data-row="o2"[\s\S]*?Rotor<\/span><\/div><\/td><td><span class="muted">—<\/span><\/td><td>0<\/td><td>0<\/td>/);
  assert.match(out, /data-run="deleteFacetOption" data-facet="systemElement" data-id="o1"[^>]*data-text="Hazards keep what they already have\./);
  assert.match(out, /On hazards, not in the list <span class="count">1<\/span>[\s\S]*?data-action="addUnlistedOptions" data-facet="systemElement"[\s\S]*?<span>Battery<\/span>[\s\S]*?data-action="createFacetOption" data-facet="systemElement" data-name="Battery">Add to list/);
});

test('the Tools tab: Assign to platform group chooses a group, then rows to Confirm; View setup shows or hides groups', () => {
  const out = facetPage();
  assert.match(out, /<div class="info-work">\s*<div class="info-main">[\s\S]*?<aside class="tool-tab" aria-label="Tools">/);
  assert.match(out, /<form data-action="startAssignToGroup" data-facet="systemElement" class="assign-start">\s*<select name="groupId"[^>]*><option value="all">All platforms<\/option><option value="g1">UAS<\/option><option value="g2">Ground vehicles<\/option><option value="g3">&lt;Sea&gt;<\/option><\/select>\s*<button type="submit">Choose rows<\/button>/);
  assert.doesNotMatch(out, /data-selectable/, 'rows are not chosen until the tool is on');
  const choosing = facetPage({ infoTools: { assigning: { facet: 'systemElement', groupId: 'g3' }, hidden: [], byGroup: false } });
  assert.match(choosing, /<div class="info-work info-assigning">/);
  assert.match(choosing, /<tr data-row="o1" data-selectable="" data-option-id="o1">/);
  assert.match(choosing, /<form class="assign-form" data-assign-form data-facet="systemElement" data-group-id="g3">[\s\S]*?Assigning to <strong>&lt;Sea&gt;<\/strong>[\s\S]*?data-assign-count>None chosen[\s\S]*?<button type="submit" class="primary" data-assign-confirm disabled>Confirm<\/button><button type="button" data-action="cancelAssignToGroup">Cancel/);
  assert.doesNotMatch(facetPage({ infoTools: { assigning: { facet: 'causalFactor', groupId: 'g3' }, hidden: [], byGroup: false } }), /data-selectable/, 'only in the facet it was started in');
  // View setup: Select all, Deselect all, a toggle per group; a hidden group leaves the table.
  assert.match(out, /data-action="showInfoGroups" data-all="true">Select all<\/button><button type="button" class="small" data-action="showInfoGroups" data-all="false">Deselect all/);
  assert.match(out, /<ul class="plain view-groups"><li><label><input type="checkbox" name="on" data-change="toggleInfoGroup" data-group-id="all" checked> All platforms<\/label><\/li><li><label><input type="checkbox" name="on" data-change="toggleInfoGroup" data-group-id="g1" checked> UAS/);
  const hidden = facetPage({ infoTools: { assigning: null, hidden: ['g1'], byGroup: false } });
  assert.match(hidden, /data-group-id="g1"> UAS/, 'unticked');
  assert.match(hidden, /data-row="o1"[\s\S]*?<ul class="plain dots option-groups"><li>Ground vehicles/);
  assert.match(out, /role="switch" aria-checked="false" data-action="toggleInfoByGroup">[\s\S]*?Display by platform group/);
});

test('displayed by platform group: a row per group shown it is in, marked as duplicated, and those in none under No group', () => {
  const out = facetPage({ infoTools: { assigning: null, hidden: [], byGroup: true } });
  assert.match(out, /role="switch" aria-checked="true" data-action="toggleInfoByGroup"/);
  assert.deepEqual([...out.matchAll(/<th data-col="([^"]+)"/g)].map((m) => m[1]), ['group', 'name', 'hazards', 'platforms', 'actions']);
  assert.deepEqual([...out.matchAll(/<tr data-row="([^"]+)"/g)].map((m) => m[1]), ['g1|o1', 'g2|o1', '-|o2']);
  assert.match(out, /<tr data-row="g1\|o1" class="group-start"><td><span class="tag group-tag">UAS<\/span><\/td><td><div class="option-name"><span class="cell-text"[^>]*>propeller<\/span><span class="dup-dot" role="img" tabindex="0" title="Duplicated row: this option belongs to more than one platform group shown, so it is listed under each\."/);
  assert.match(out, /<tr data-row="-\|o2" class="group-start"><td><span class="muted">No group<\/span><\/td><td><div class="option-name"><span class="cell-text"[^>]*>Rotor<\/span><\/div><\/td>/, 'no dot on a row listed once');
  const oneShown = facetPage({ infoTools: { assigning: null, hidden: ['g2'], byGroup: true } });
  assert.deepEqual([...oneShown.matchAll(/<tr data-row="([^"]+)"/g)].map((m) => m[1]), ['g1|o1', '-|o2']);
  assert.doesNotMatch(oneShown, /dup-dot/, 'shown once, so not duplicated');
});

test('displayed by platform group, a group\'s name is one merged cell beside all its rows', () => {
  const d = assignToGroup(withOptions(), act, { facet: 'systemElement', optionIds: ['o2'], groupId: 'g1' });
  const out = infoView({ ...state, sections: { info: 'systemElement' }, infoTools: { assigning: null, hidden: [], byGroup: true } }, d).toString();
  assert.deepEqual([...out.matchAll(/<tr data-row="([^"]+)"/g)].map((m) => m[1]), ['g1|o1', 'g1|o2', 'g2|o1']);
  assert.match(out, /<tr data-row="g1\|o1" class="group-start"><td class="merged" rowspan="2"><span class="tag group-tag">UAS<\/span><\/td><td>/);
  assert.match(out, /<tr data-row="g1\|o2"><td><div class="option-name">/, 'the second row has no cell of its own there');
  assert.match(out, /<tr data-row="g2\|o1" class="group-start"><td><span class="tag group-tag">Ground vehicles/, 'a group of one is not merged');
});

test('Assign to platform group keeps the group chosen last selected in its drop-down', () => {
  const out = facetPage({ infoTools: { assigning: null, hidden: [], byGroup: false, groupId: 'g2' } });
  assert.match(out, /<select name="groupId"[^>]*data-change="chooseAssignGroup"><option value="all">All platforms<\/option><option value="g1">UAS<\/option><option value="g2" selected>Ground vehicles<\/option>/);
});

test('All platforms is a group of its own for options: assigned, listed first, and shown first by platform group', () => {
  const d = assignToGroup(withOptions(), act, { facet: 'systemElement', optionIds: ['o1', 'o2'], groupId: 'all' });
  const out = infoView({ ...state, sections: { info: 'systemElement' } }, d).toString();
  assert.match(out, /data-row="o1"[\s\S]*?<ul class="plain dots option-groups"><li>All platforms<button[^>]*data-group-id="all" data-on="false">✕<\/button><\/li><li>UAS/);
  const grouped = infoView({ ...state, sections: { info: 'systemElement' }, infoTools: { assigning: null, hidden: [], byGroup: true } }, d).toString();
  assert.deepEqual([...grouped.matchAll(/<tr data-row="([^"]+)"/g)].map((m) => m[1]), ['all|o1', 'all|o2', 'g1|o1', 'g2|o1']);
  assert.match(grouped, /<td class="merged" rowspan="2"><span class="tag group-tag">All platforms<\/span>/);
});

test('a platform\'s page shows its groups, each with ✕, and + to add more; the picker offers the rest', () => {
  const out = platformView({ ...state, view: { name: 'platform', id: 'p1' } }, data(), 'p1').toString();
  assert.match(out, /class="glance-line plat-groups">Groups <span class="tag group-tag">UAS<button[^>]*data-action="untagPlatform" data-platform-id="p1" data-group-id="g1">✕<\/button><\/span> <span class="tag group-tag">Ground vehicles/);
  assert.match(out, /data-action="openPicker" data-picker="tagPlatforms" data-platform-id="p1"/);
  const pick = pickerView({ ...state, picker: { picker: 'tagPlatforms', platformId: 'p1' } }, data()).toString();
  assert.match(pick, /<form data-action="tagPlatforms" data-platform-id="p1"/);
  assert.match(pick, /value="g3"/);
  assert.doesNotMatch(pick, /value="g1"|value="g2"/);
});

test('the Platforms list has a Groups column, filtered by group', () => {
  const out = platformsView(state, data()).toString();
  assert.match(out, /<th data-col="groups"/);
  assert.match(out, /data-row="p2"[\s\S]*?<span class="tag group-tag">UAS<\/span>/);
});

test('a platform\'s Home card shows its groups as plain tags at its top right', () => {
  const out = homeView({ ...state, homeOwner: 'everyone' }, data()).toString();
  assert.match(out, /<span class="pcard-top"><span class="pcard-h"><strong>Alpha<\/strong>[\s\S]*?<\/span><span class="group-tags"><span class="tag group-tag">UAS<\/span><span class="tag group-tag">Ground vehicles<\/span><\/span><\/span>/);
  assert.match(out, /<span class="pcard-top"><span class="pcard-h"><strong>Bravo<\/strong>[\s\S]*?<span class="tag group-tag">UAS<\/span><\/span><\/span>/);
});

test('Hazards, under Platform groups, lists each hazard with its platform groups, assigned with the same tools as a facet', () => {
  const d = assignToGroup(data(), act, { facet: 'hazard', optionIds: ['h1'], groupId: 'g1' });
  const out = infoView({ ...state, sections: { info: 'hazards' } }, d).toString();
  assert.match(out, /data-section="hazards">[\s\S]*?Hazards<\/span><span class="rail-badge">2<\/span>/);
  assert.match(out, /<h2>Hazards<\/h2>/);
  assert.doesNotMatch(out, /data-kind="newFacetOption|deleteFacetOption/, 'hazards are added and deleted on their own pages');
  assert.match(out, /data-row="h1"[\s\S]*?HAZ-001[\s\S]*?data-action="go" data-view="hazard" data-id="h1">Fire<\/button>[\s\S]*?<li>UAS<button[^>]*data-action="setOptionGroup" data-facet="hazard" data-option-id="h1" data-group-id="g1" data-on="false">✕<\/button><\/li><\/ul><\/td><td>2<\/td>/);
  assert.match(out, /data-row="h2"[\s\S]*?Flood[\s\S]*?<span class="muted">—<\/span><\/td><td>0<\/td>/);
  assert.match(out, /<form data-action="startAssignToGroup" data-facet="hazard" class="assign-start">/);
  const choosing = infoView({ ...state, sections: { info: 'hazards' }, infoTools: { assigning: { facet: 'hazard', groupId: 'g2' }, hidden: [], byGroup: false } }, d).toString();
  assert.match(choosing, /data-assign-form data-facet="hazard" data-group-id="g2"/);
  assert.match(choosing, /data-row="h2" data-selectable="" data-option-id="h2"/);
  const byGroup = infoView({ ...state, sections: { info: 'hazards' }, infoTools: { assigning: null, hidden: [], byGroup: true } }, d).toString();
  assert.match(byGroup, /UAS<\/span>[\s\S]*?Fire[\s\S]*?No group[\s\S]*?Flood/);
});

test('Controls, under Hazards, lists each control with its platform groups, assigned with the same tools', () => {
  const d = assignToGroup(data(), act, { facet: 'control', optionIds: ['c2'], groupId: 'g2' });
  const out = infoView({ ...state, sections: { info: 'controls' } }, d).toString();
  assert.match(out, /data-section="controls">[\s\S]*?Controls<\/span><span class="rail-badge">2<\/span>/);
  assert.match(out, /<h2>Controls<\/h2>/);
  assert.match(out, /data-row="c2"[\s\S]*?data-action="go" data-view="control" data-id="c2">Fire drills<\/button>[\s\S]*?<li>Ground vehicles<button[^>]*data-action="setOptionGroup" data-facet="control" data-option-id="c2" data-group-id="g2" data-on="false">/);
  assert.match(out, /<form data-action="startAssignToGroup" data-facet="control" class="assign-start">/);
});
