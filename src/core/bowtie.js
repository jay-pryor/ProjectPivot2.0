import { PivotError } from './errors.js';
import { get, live, isObject } from './data.js';
import { hazardLabel, ids, UNNUMBERED } from './ids.js';
import { controlsOnPlatform, causalFactorsOn, childrenOf } from './queries.js';
import { CONTROL_STATUSES } from './ops/assessment.js';
import { CONTROL_TIERS } from './ops/controls.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Rec} Rec */
/** @typedef {{ statuses: string[], tiers: string[] }} Filters  tiers: the tiers whose controls are shown, 'none' for those with no tier */
/**
 * A tag drawn as a badge under a control's name; its tone picks the badge's colours.
 * @typedef {{ text: string, tone: 'tier' | 'recommended' | 'planned' | 'implemented' | 'rejected' }} Tag
 */
/**
 * A control on the diagram: its status, its tags, and the causal factors or consequences it
 * prevents or mitigates (their ids), which the drawing joins it to. One implemented on the
 * platform is drawn solid; any other, dashed.
 * @typedef {{ control: Rec, kind: string, state: string, tags: Tag[], targets: string[] }} Item
 */
/**
 * @typedef {{ ok: true, hazard: Rec, platform: Rec, filters: Filters, caption: string,
 *   causalFactors: Rec[], consequences: Rec[], preventative: Item[], mitigating: Item[] }} Bowtie
 */
/** @typedef {{ ok: false, reason: 'hazard-gone' | 'hazard-retired' | 'platform-gone' | 'not-on-platform', message: string }} Cannot */

export const STATUS_WORD = Object.freeze({ recommended: 'Recommended', planned: 'Planned', implemented: 'Implemented', rejected: 'Rejected' });

/** Every tier a control can be filtered by: the hierarchy's, then 'none' for a control with no tier. */
export const TIER_KEYS = Object.freeze([...CONTROL_TIERS, 'none']);
/** What a tier key is called. @param {string} t */
export const tierWord = (t) => (t === 'none' ? 'No tier' : t);

/** Every control but the rejected ones, of every tier. */
export const DEFAULT_FILTERS = Object.freeze({ statuses: Object.freeze(['recommended', 'planned', 'implemented']), tiers: TIER_KEYS });
/** No filter at all: every control, whatever its status or tier. */
export const NO_FILTERS = Object.freeze({ statuses: CONTROL_STATUSES, tiers: TIER_KEYS });

/**
 * Filters as they are kept, whatever was read: a missing list becomes the default's, unknown
 * statuses are dropped, and the rest are in the statuses' own order.
 * @param {unknown} f @returns {Filters}
 */
export function normalizeFilters(f) {
  const statuses = isObject(f) && Array.isArray(f.statuses)
    ? CONTROL_STATUSES.filter((s) => f.statuses.includes(s))
    : [...DEFAULT_FILTERS.statuses];
  // Filters kept before tiers could be chosen show every tier.
  const tiers = isObject(f) && Array.isArray(f.tiers) ? TIER_KEYS.filter((t) => f.tiers.includes(t)) : [...TIER_KEYS];
  return { statuses, tiers };
}

/** Filters an op is asked to store, refused when they are not filters. @param {unknown} f @returns {Filters} */
export function needFilters(f) {
  if (!isObject(f) || !Array.isArray(f.statuses) || f.statuses.some((s) => !CONTROL_STATUSES.includes(s))) {
    throw new PivotError('bowtie.filters', `A bow-tie's statuses are among ${CONTROL_STATUSES.join(', ')}.`);
  }
  if (f.tiers !== undefined && (!Array.isArray(f.tiers) || f.tiers.some((t) => !TIER_KEYS.includes(t)))) {
    throw new PivotError('bowtie.filters', `A bow-tie's tiers are among ${TIER_KEYS.map(tierWord).join(', ')}.`);
  }
  return normalizeFilters(f);
}

/** @param {unknown} a @param {unknown} b */
export function sameFilters(a, b) {
  const x = normalizeFilters(a);
  const y = normalizeFilters(b);
  return x.statuses.join('|') === y.statuses.join('|') && x.tiers.join('|') === y.tiers.join('|');
}

/**
 * The filters in words, for the caption: e.g. "Planned, Implemented", "No controls", or with
 * some tiers left out "Implemented · Engineering, PPE".
 * @param {unknown} f
 */
export function filterWords(f) {
  const { statuses, tiers } = normalizeFilters(f);
  if (!statuses.length || !tiers.length) return 'No controls';
  const words = statuses.map((s) => STATUS_WORD[/** @type {keyof typeof STATUS_WORD} */ (s)]).join(', ');
  return tiers.length === TIER_KEYS.length ? words : `${words} · ${tiers.map(tierWord).join(', ')}`;
}

/** "HAZ-001 Fire", or just the title until the hazard is numbered. @param {Rec} h */
export function hazardName(h) {
  const label = hazardLabel(h);
  return label === UNNUMBERED ? String(h.title) : `${label} ${h.title}`;
}

/**
 * What the bow-tie of a hazard on a platform holds under these filters, read from the data every
 * time; or why it cannot be drawn.
 * @param {Data} data @param {string} hazardId @param {string} platformId @param {unknown} filters
 * @returns {Bowtie | Cannot}
 */
export function bowtieOf(data, hazardId, platformId, filters) {
  const f = normalizeFilters(filters);
  const hazard = get(data, 'hazard', hazardId);
  if (!hazard || hazard.status === 'deleted') return { ok: false, reason: 'hazard-gone', message: 'The hazard in this view has been deleted.' };
  if (hazard.status === 'retired') return { ok: false, reason: 'hazard-retired', message: `${hazardName(hazard)} is retired.` };
  const platform = get(data, 'platform', platformId);
  if (!platform || platform.status === 'deleted') return { ok: false, reason: 'platform-gone', message: 'The platform in this view has been deleted.' };
  const link = get(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  if (!link || link.status !== 'live') return { ok: false, reason: 'not-on-platform', message: `${hazardName(hazard)} is no longer on ${platform.name}.` };
  /** @type {Item[]} */
  const items = controlsOnPlatform(data, hazardId, platformId)
    .filter((x) => f.statuses.includes(x.state) && f.tiers.includes(x.control.tier ? String(x.control.tier) : 'none'))
    .map((x) => ({
      control: x.control, kind: /** @type {string} */ (x.kind), state: x.state,
      // Its status, then its tier.
      tags: [{ text: STATUS_WORD[/** @type {keyof typeof STATUS_WORD} */ (x.state)], tone: /** @type {Tag['tone']} */ (x.state) },
        ...(x.control.tier ? [{ text: String(x.control.tier), tone: /** @type {Tag['tone']} */ ('tier') }] : [])],
      targets: x.targets.map((t) => t.id),
    }));
  return {
    ok: true, hazard, platform, filters: f, caption: `${platform.name} · ${filterWords(f)}`,
    causalFactors: causalFactorsOn(data, hazardId, platformId),
    consequences: childrenOf(data, 'consequence', hazardId),
    preventative: items.filter((i) => i.kind === 'preventative'),
    mitigating: items.filter((i) => i.kind === 'mitigating'),
  };
}

/** A live view its owner, or a profile it is shared with, may open. @param {Rec} view @param {string | null} profileId */
export function canSee(view, profileId) {
  return view.status === 'live' && profileId !== null && (view.ownerId === profileId || (view.sharedWith ?? []).includes(profileId));
}

/** @param {Rec} a @param {Rec} b */
const byName = (a, b) => String(a.name).localeCompare(String(b.name)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The profile's own views, by name. @param {Data} data @param {string} profileId */
export function myViews(data, profileId) {
  return live(data, 'bowtieView').filter((v) => v.ownerId === profileId).sort(byName);
}

/** Other people's views shared with the profile, by name. @param {Data} data @param {string} profileId */
export function sharedWithMe(data, profileId) {
  return live(data, 'bowtieView').filter((v) => v.ownerId !== profileId && (v.sharedWith ?? []).includes(profileId)).sort(byName);
}
