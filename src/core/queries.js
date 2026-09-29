import { get, all, live, byCreated } from './data.js';
import { ids, hazardLabel } from './ids.js';
import { ratingFor, BANDS } from './matrix.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Rec} Rec */

/** @param {string[]} xs */
function sortedUnique(xs) {
  return [...new Set(xs)].sort();
}

/** @param {Data} data @param {string} hazardId @returns {string[]} */
export function platformsOfHazard(data, hazardId) {
  return sortedUnique(live(data, 'hazardPlatform').filter((l) => l.hazardId === hazardId).map((l) => l.platformId));
}

/**
 * Every platform a record reaches through the live links: the list an edit is warned about
 * and (in release 2) queued for acknowledgement on.
 * @param {Data} data @param {string} kind @param {Record<string, any>} rec
 * @returns {string[]}
 */
export function platformsReached(data, kind, rec) {
  switch (kind) {
    case 'hazard': return platformsOfHazard(data, rec.id);
    case 'causalFactor':
    case 'consequence':
    case 'hazardControl': return platformsOfHazard(data, rec.hazardId);
    case 'control':
      return sortedUnique(live(data, 'hazardControl').filter((l) => l.controlId === rec.id).flatMap((l) => platformsOfHazard(data, l.hazardId)));
    case 'platform': return [rec.id];
    case 'hazardPlatform':
    case 'ruling':
    case 'rating':
    case 'report': return [rec.platformId];
    default: return [];
  }
}

/** @param {Rec} a @param {Rec} b numbered hazards by number, new ones after them oldest first */
export function byNumber(a, b) {
  if (a.number != null && b.number != null) return a.number - b.number;
  if (a.number != null) return -1;
  if (b.number != null) return 1;
  return byCreated(a, b);
}

/** @param {Data} data @param {string} hazardId @param {string} controlId @param {string} platformId */
export function controlState(data, hazardId, controlId, platformId) {
  const r = get(data, 'ruling', ids.ruling(hazardId, controlId, platformId));
  return r && r.status === 'live' ? { state: /** @type {string} */ (r.state), ruling: r } : { state: 'awaiting', ruling: null };
}

/** @param {Data} data @param {string} hazardId @param {string} platformId */
export function ratingOf(data, hazardId, platformId) {
  const r = get(data, 'rating', ids.rating(hazardId, platformId));
  return r && r.status === 'live' ? { initial: r.initial ?? null, residual: r.residual ?? null } : { initial: null, residual: null };
}

/** @param {{ consequence: number | null, likelihood: string | null } | null | undefined} pair */
export function bandOf(pair) {
  return ratingFor(pair?.consequence ?? null, pair?.likelihood ?? null).band;
}

/** @param {Data} data @param {string} hazardId */
export function hazardDetail(data, hazardId) {
  const hazard = get(data, 'hazard', hazardId);
  if (!hazard) return null;
  return {
    hazard,
    causalFactors: live(data, 'causalFactor').filter((r) => r.hazardId === hazardId),
    consequences: live(data, 'consequence').filter((r) => r.hazardId === hazardId),
    controls: live(data, 'hazardControl').filter((l) => l.hazardId === hazardId)
      .map((link) => ({ link, control: /** @type {Rec} */ (get(data, 'control', link.controlId)) })),
    platforms: live(data, 'hazardPlatform').filter((l) => l.hazardId === hazardId)
      .map((link) => ({ link, platform: /** @type {Rec} */ (get(data, 'platform', link.platformId)), reportId: link.reportId ?? hazardLabel(hazard) })),
  };
}

/** @param {Data} data @param {string} hazardId @param {string} platformId */
export function controlsOnPlatform(data, hazardId, platformId) {
  return live(data, 'hazardControl').filter((l) => l.hazardId === hazardId).map((link) => {
    const s = controlState(data, hazardId, link.controlId, platformId);
    return { control: /** @type {Rec} */ (get(data, 'control', link.controlId)), kind: link.kind, state: s.state, ruling: s.ruling };
  });
}

/**
 * The one list of a platform's hazards. The platform screen, the assessment and reports are all
 * built from it, so no two of them can disagree about what the platform holds.
 * @param {Data} data @param {string} platformId
 */
export function platformHazards(data, platformId) {
  return live(data, 'hazardPlatform').filter((l) => l.platformId === platformId).map((link) => {
    const hazard = /** @type {Rec} */ (get(data, 'hazard', link.hazardId));
    return {
      hazard, link,
      reportId: link.reportId ?? hazardLabel(hazard),
      rating: ratingOf(data, hazard.id, platformId),
      controls: controlsOnPlatform(data, hazard.id, platformId),
    };
  }).sort((a, b) => byNumber(a.hazard, b.hazard));
}

/** @param {Data} data @param {string} controlId */
export function controlUsage(data, controlId) {
  return live(data, 'hazardControl').filter((l) => l.controlId === controlId).map((link) => {
    const hazard = /** @type {Rec} */ (get(data, 'hazard', link.hazardId));
    const platforms = live(data, 'hazardPlatform').filter((l) => l.hazardId === hazard.id).map((hp) => ({
      platform: /** @type {Rec} */ (get(data, 'platform', hp.platformId)),
      ...controlState(data, hazard.id, controlId, hp.platformId),
    }));
    return { hazard, kind: link.kind, platforms };
  });
}

/** @param {Data} data @param {string} platformId live hazards not yet on the platform */
export function hazardsNotOn(data, platformId) {
  const on = new Set(live(data, 'hazardPlatform').filter((l) => l.platformId === platformId).map((l) => l.hazardId));
  return live(data, 'hazard').filter((h) => !on.has(h.id)).sort(byNumber);
}

/** @param {Rec} rec @param {string | undefined} status */
function statusMatches(rec, status) {
  const s = status || 'live';
  return s === 'any' || rec.status === s;
}

/** @param {Data} data @param {string} [status] 'live' (default), 'retired', 'deleted' or 'any' */
export function listHazards(data, status) {
  return all(data, 'hazard').filter((h) => statusMatches(h, status)).sort(byNumber);
}

/**
 * @typedef {{ platformId?: string, band?: string, status?: string, controlState?: string }} Filter
 */

/** One row per hazard per platform it is on; a hazard on no platform is one row with none. @param {Data} data @param {Filter} f */
export function filterHazards(data, f = {}) {
  const rows = [];
  for (const hazard of listHazards(data, f.status)) {
    const links = live(data, 'hazardPlatform').filter((l) => l.hazardId === hazard.id && (!f.platformId || l.platformId === f.platformId));
    if (links.length === 0) {
      if (!f.platformId && !f.band) rows.push({ hazard, platform: null, band: null });
      continue;
    }
    for (const l of links) {
      const band = bandOf(ratingOf(data, hazard.id, l.platformId).residual);
      if (f.band && band !== f.band) continue;
      rows.push({ hazard, platform: /** @type {Rec} */ (get(data, 'platform', l.platformId)), band });
    }
  }
  return rows;
}

/**
 * One row per control per hazard-on-platform it serves; a control used nowhere is one row with
 * none. A control's band is the residual band of the hazard row it appears on.
 * @param {Data} data @param {Filter} f
 */
export function filterControls(data, f = {}) {
  const rows = [];
  const narrowed = Boolean(f.platformId || f.band || f.controlState);
  for (const control of all(data, 'control').filter((c) => statusMatches(c, f.status))) {
    let used = false;
    for (const hc of live(data, 'hazardControl').filter((l) => l.controlId === control.id)) {
      const hazard = /** @type {Rec} */ (get(data, 'hazard', hc.hazardId));
      for (const hp of live(data, 'hazardPlatform').filter((l) => l.hazardId === hazard.id)) {
        used = true;
        if (f.platformId && hp.platformId !== f.platformId) continue;
        const { state } = controlState(data, hazard.id, control.id, hp.platformId);
        const band = bandOf(ratingOf(data, hazard.id, hp.platformId).residual);
        if (f.band && band !== f.band) continue;
        if (f.controlState && state !== f.controlState) continue;
        rows.push({ control, hazard, platform: /** @type {Rec} */ (get(data, 'platform', hp.platformId)), kind: hc.kind, state, band });
      }
    }
    if (!used && !narrowed) rows.push({ control, hazard: null, platform: null, kind: null, state: null, band: null });
  }
  return rows;
}

/**
 * One row per hazard, whatever its status, with every platform it is on and its residual band
 * there, and the worst of those bands. Risk belongs to a hazard on a platform, never to the hazard.
 * @param {Data} data
 */
export function hazardRows(data) {
  return listHazards(data, 'any').map((hazard) => {
    const platforms = live(data, 'hazardPlatform').filter((l) => l.hazardId === hazard.id).map((l) => ({
      platform: /** @type {Rec} */ (get(data, 'platform', l.platformId)),
      band: bandOf(ratingOf(data, hazard.id, l.platformId).residual),
    }));
    const worst = platforms.length ? BANDS[Math.min(...platforms.map((p) => BANDS.indexOf(p.band)))] : null;
    return { hazard, platforms, worst };
  });
}
