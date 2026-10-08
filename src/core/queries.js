import { get, all, live, byCreated } from './data.js';
import { ids, hazardLabel, referenceLabel } from './ids.js';
import { ratingFor, BANDS } from './matrix.js';
import { addDays } from './time.js';
import { scheduleOf } from './schedule.js';
import { waitingChanges } from './acks.js';
import { RECEPTORS, RECEPTOR_WORD } from './receptors.js';
import { tierRank, IMPLEMENTER_WORD } from './ops/controls.js';

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

/** Causal factors and consequences in the order they were added; those from before the order was kept come first. @param {Rec} a @param {Rec} b */
export const byAdded = (a, b) => (a.seq ?? 0) - (b.seq ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** A hazard's live causal factors or consequences, in the order they were added. @param {Data} data @param {'causalFactor' | 'consequence'} kind @param {string} hazardId */
export function childrenOf(data, kind, hazardId) {
  return live(data, kind).filter((r) => r.hazardId === hazardId).sort(byAdded);
}

/**
 * A hazard's causal factors on one platform: those for every platform and those for that one
 * alone, in the order they were added. With no platform, every one of the hazard's.
 * @param {Data} data @param {string} hazardId @param {string | null} [platformId]
 */
export function causalFactorsOn(data, hazardId, platformId = null) {
  return childrenOf(data, 'causalFactor', hazardId).filter((r) => !platformId || !r.platformId || r.platformId === platformId);
}

/**
 * A hazard's element failure modes, systems or elements, or affected groups on one platform, in the order they
 * were added.
 * @param {Data} data @param {'failureMode' | 'systemElement' | 'affectedGroup'} kind @param {string} hazardId @param {string} platformId
 */
export function platformListOn(data, kind, hazardId, platformId) {
  return live(data, kind).filter((r) => r.hazardId === hazardId && r.platformId === platformId).sort(byAdded);
}

/**
 * Every element failure mode (or system or element, or affected group) already given, on any hazard and platform, once
 * each ignoring case, in order: what the box suggests as you type.
 * @param {Data} data @param {'failureMode' | 'systemElement' | 'affectedGroup'} kind @returns {string[]}
 */
export function platformListEntries(data, kind) {
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (const r of live(data, kind)) {
    const t = String(r.text ?? '').trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
}

/** The platforms a causal factor is on: its own, or every platform of its hazard. @param {Data} data @param {Record<string, any>} r */
function causalFactorPlatforms(data, r) {
  const on = platformsOfHazard(data, r.hazardId);
  return r.platformId ? on.filter((p) => p === r.platformId) : on;
}

/** The platforms a reference link's target is on. @param {Data} data @param {string} kind @param {string} id @returns {string[]} */
function targetPlatforms(data, kind, id) {
  switch (kind) {
    case 'platform': return [id];
    case 'hazard': return platformsOfHazard(data, id);
    case 'causalFactor': {
      const r = get(data, kind, id);
      return r ? causalFactorPlatforms(data, r) : [];
    }
    case 'failureMode':
    case 'systemElement':
    case 'affectedGroup': {
      const r = get(data, kind, id);
      return r ? [r.platformId] : [];
    }
    case 'hazardPhase':
    case 'consequence': {
      const r = get(data, kind, id);
      return r ? platformsOfHazard(data, r.hazardId) : [];
    }
    case 'control': return platformsReached(data, 'control', { id });
    default: return [];
  }
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
    case 'causalFactor': return causalFactorPlatforms(data, rec);
    case 'consequence':
    case 'hazardControl': return platformsOfHazard(data, rec.hazardId);
    case 'control':
      return sortedUnique(live(data, 'hazardControl').filter((l) => l.controlId === rec.id).flatMap((l) => controlPlatforms(data, l.hazardId, rec.id)));
    case 'platform': return [rec.id];
    case 'hazardPlatform':
    case 'ruling':
    case 'implementationStatus':
    case 'controlOn':
    case 'rating':
    case 'assessment':
    case 'sfarp':
    case 'safetyReport':
    case 'implementer':
    case 'failureMode':
    case 'systemElement':
    case 'affectedGroup':
    case 'report': return [rec.platformId];
    case 'review':
    case 'platformGroupLink': return [rec.platformId];
    case 'hazardPhase': return platformsOfHazard(data, rec.hazardId);
    case 'phase':
      return sortedUnique(live(data, 'hazardPhase').filter((l) => l.phaseId === rec.id).flatMap((l) => platformsOfHazard(data, l.hazardId)));
    case 'reference':
      return sortedUnique(live(data, 'referenceLink').filter((l) => l.referenceId === rec.id).flatMap((l) => targetPlatforms(data, l.targetKind, l.targetId)));
    case 'referenceLink': return sortedUnique(targetPlatforms(data, rec.targetKind, rec.targetId));
    case 'reviewRow': {
      const review = get(data, 'review', rec.reviewId);
      return review ? [review.platformId] : [];
    }
    case 'reviewPolicy':
      return live(data, 'platform').filter((p) => p.reviewRule?.kind === 'policy' && p.reviewRule.policyId === rec.id).map((p) => p.id).sort();
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

/**
 * Whether a control linked to a hazard has been taken off one of the hazard's platforms.
 * @param {Data} data @param {string} hazardId @param {string} controlId @param {string} platformId
 */
export function controlOff(data, hazardId, controlId, platformId) {
  const on = get(data, 'controlOn', ids.controlOn(hazardId, controlId, platformId));
  return Boolean(on && on.status === 'live' && on.off);
}

/** The platforms of its hazard a linked control is on: all of them but those it was taken off. @param {Data} data @param {string} hazardId @param {string} controlId */
export function controlPlatforms(data, hazardId, controlId) {
  return platformsOfHazard(data, hazardId).filter((p) => !controlOff(data, hazardId, controlId, p));
}

/** @param {Data} data @param {string} hazardId @param {string} controlId @param {string} platformId */
export function controlState(data, hazardId, controlId, platformId) {
  const r = get(data, 'ruling', ids.ruling(hazardId, controlId, platformId));
  return r && r.status === 'live' ? { state: /** @type {string} */ (r.state), ruling: r } : { state: 'recommended', ruling: null };
}

/** One assessment's live record, or null. @param {Data} data @param {string} hazardId @param {string} platformId @param {string} stage @param {string} receptor */
export function assessmentOf(data, hazardId, platformId, stage, receptor) {
  const r = get(data, 'assessment', ids.assessment(hazardId, platformId, stage, receptor));
  return r && r.status === 'live' ? r : null;
}

/**
 * Both stages for both receptors, each as `{ consequence, likelihood }` (the matrix's input), or
 * null when neither is set.
 * @param {Data} data @param {string} hazardId @param {string} platformId
 */
export function ratingsOf(data, hazardId, platformId) {
  /** @param {string} stage @param {string} receptor */
  const pair = (stage, receptor) => {
    const a = assessmentOf(data, hazardId, platformId, stage, receptor);
    return a && (a.likelihood != null || a.consequence != null) ? { consequence: a.consequence, likelihood: a.likelihood } : null;
  };
  /** @param {string} stage */
  const each = (stage) => /** @type {Record<'personnel' | 'environment' | 'capability', { consequence: any, likelihood: any } | null>} */ (Object.fromEntries(RECEPTORS.map((r) => [r, pair(stage, r)])));
  return { initial: each('initial'), residual: each('residual') };
}

/** One receptor's initial and residual (personnel unless named): the shape callers had before assessments. @param {Data} data @param {string} hazardId @param {string} platformId @param {'personnel' | 'environment' | 'capability'} [receptor] */
export function ratingOf(data, hazardId, platformId, receptor = 'personnel') {
  const r = ratingsOf(data, hazardId, platformId);
  return { initial: r.initial[receptor], residual: r.residual[receptor] };
}

/**
 * The other platforms of a hazard whose same assessment has text in the same justification box,
 * to copy from: `{ platform, text }[]`, by platform name.
 * @param {Data} data @param {string} hazardId @param {string} platformId the platform being written
 * @param {string} stage @param {string} receptor @param {'likelihoodWhy' | 'consequenceWhy'} field
 */
export function copySources(data, hazardId, platformId, stage, receptor, field) {
  return live(data, 'hazardPlatform').filter((l) => l.hazardId === hazardId && l.platformId !== platformId).flatMap((l) => {
    const a = assessmentOf(data, hazardId, l.platformId, stage, receptor);
    const platform = get(data, 'platform', l.platformId);
    return a && a[field] && platform ? [{ platform, text: /** @type {string} */ (a[field]) }] : [];
  }).sort((x, y) => String(x.platform.name).localeCompare(String(y.platform.name)));
}

/**
 * The other platforms of a hazard with any likelihood or consequence at a stage, to copy the whole
 * stage from: `{ platform, ratings }[]` (ratings per receptor), by platform name.
 * @param {Data} data @param {string} hazardId @param {string} platformId @param {'initial' | 'residual'} stage
 */
export function stageCopySources(data, hazardId, platformId, stage) {
  return live(data, 'hazardPlatform').filter((l) => l.hazardId === hazardId && l.platformId !== platformId).flatMap((l) => {
    const ratings = ratingsOf(data, hazardId, l.platformId)[stage];
    const platform = get(data, 'platform', l.platformId);
    return platform && Object.values(ratings).some(Boolean) ? [{ platform, ratings }] : [];
  }).sort((x, y) => String(x.platform.name).localeCompare(String(y.platform.name)));
}

/**
 * The hazard's other platforms with something to copy here, each with what: controls (any on
 * it, with their statuses), or SFARP considerations (any written).
 * @param {Data} data @param {string} hazardId @param {string} platformId @param {'controls' | 'sfarp'} part
 * @returns {{ platform: Rec, states?: string[], sfarp?: { justification: string, conclusion: string, conditions: string } }[]}
 */
export function partCopySources(data, hazardId, platformId, part) {
  return live(data, 'hazardPlatform').filter((l) => l.hazardId === hazardId && l.platformId !== platformId).flatMap((l) => /** @type {any[]} */ ((() => {
    const platform = get(data, 'platform', l.platformId);
    if (!platform) return [];
    if (part === 'controls') {
      const states = controlsOnPlatform(data, hazardId, l.platformId).map((c) => String(c.state));
      return states.length ? [{ platform, states }] : [];
    }
    const sfarp = sfarpOf(data, hazardId, l.platformId);
    return sfarp.justification || sfarp.conclusion || sfarp.conditions ? [{ platform, sfarp }] : [];
  })())).sort((x, y) => String(x.platform.name).localeCompare(String(y.platform.name)));
}

/** @param {Data} data @param {string} hazardId @param {string} platformId */
export function sfarpOf(data, hazardId, platformId) {
  const r = get(data, 'sfarp', ids.sfarp(hazardId, platformId));
  return r && r.status === 'live'
    ? { justification: r.justification ?? '', conclusion: r.conclusion ?? '', conditions: r.conditions ?? '' }
    : { justification: '', conclusion: '', conditions: '' };
}

/** The higher of two bands. @param {string} a @param {string} b */
export function worseBand(a, b) {
  return BANDS[Math.min(BANDS.indexOf(a), BANDS.indexOf(b))];
}

/** The worst residual band of a hazard on a platform, over every receptor. @param {Data} data @param {string} hazardId @param {string} platformId */
function worseResidual(data, hazardId, platformId) {
  const r = ratingsOf(data, hazardId, platformId).residual;
  return RECEPTORS.map((x) => bandOf(r[/** @type {'personnel'} */ (x)])).reduce(worseBand);
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
    causalFactors: childrenOf(data, 'causalFactor', hazardId),
    consequences: childrenOf(data, 'consequence', hazardId),
    controls: live(data, 'hazardControl').filter((l) => l.hazardId === hazardId)
      .map((link) => ({ link, control: /** @type {Rec} */ (get(data, 'control', link.controlId)) })),
    platforms: live(data, 'hazardPlatform').filter((l) => l.hazardId === hazardId)
      .map((link) => ({ link, platform: /** @type {Rec} */ (get(data, 'platform', link.platformId)), reportId: link.reportId ?? hazardLabel(hazard) })),
  };
}

/** @param {Data} data @param {string} hazardId @param {string} platformId */
export function controlsOnPlatform(data, hazardId, platformId) {
  return live(data, 'hazardControl').filter((l) => l.hazardId === hazardId && !controlOff(data, hazardId, l.controlId, platformId)).map((link) => {
    const s = controlState(data, hazardId, link.controlId, platformId);
    // On this platform its kind may differ from the hazard's, and it says what it prevents or mitigates.
    const on = get(data, 'controlOn', ids.controlOn(hazardId, link.controlId, platformId));
    const here = on && on.status === 'live' ? on : null;
    const kind = /** @type {string} */ (here?.kind || link.kind);
    return { control: /** @type {Rec} */ (get(data, 'control', link.controlId)), kind, state: s.state, ruling: s.ruling, link, targets: barrierTargets(data, kind, here?.targets, hazardId, platformId) };
  }).sort((a, b) => tierRank(a.control.tier) - tierRank(b.control.tier) || byNumber(a.control, b.control));
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
      ratings: ratingsOf(data, hazard.id, platformId),
      controls: controlsOnPlatform(data, hazard.id, platformId),
    };
  }).sort((a, b) => byNumber(a.hazard, b.hazard));
}

/** @param {Data} data @param {string} controlId */
export function controlUsage(data, controlId) {
  return live(data, 'hazardControl').filter((l) => l.controlId === controlId).map((link) => {
    const hazard = /** @type {Rec} */ (get(data, 'hazard', link.hazardId));
    const platforms = live(data, 'hazardPlatform').filter((l) => l.hazardId === hazard.id && !controlOff(data, hazard.id, controlId, l.platformId)).map((hp) => ({
      platform: /** @type {Rec} */ (get(data, 'platform', hp.platformId)),
      ...controlState(data, hazard.id, controlId, hp.platformId),
    }));
    return { hazard, kind: link.kind, platforms };
  });
}

/** @param {Data} data @param {string} platformId live hazards not yet on the platform */
/** The live platforms a hazard is not on, by name. @param {Data} data @param {string} hazardId */
export function platformsNotOn(data, hazardId) {
  const on = new Set(live(data, 'hazardPlatform').filter((l) => l.hazardId === hazardId).map((l) => l.platformId));
  return live(data, 'platform').filter((p) => !on.has(p.id)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** @param {Data} data @param {string} platformId */
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
      const band = worseResidual(data, hazard.id, l.platformId);
      if (f.band && band !== f.band) continue;
      rows.push({ hazard, platform: /** @type {Rec} */ (get(data, 'platform', l.platformId)), band });
    }
  }
  return rows;
}

/**
 * Every origin given to a control still in the library, once each (ignoring case, the
 * first spelling kept), in order: what the Origin box suggests as you type.
 * @param {Data} data @returns {string[]}
 */
export function controlOrigins(data) {
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (const c of Object.values(data.records.control ?? {})) {
    const o = String(c.origin ?? '').trim();
    if (c.status === 'deleted' || !o || seen.has(o.toLowerCase())) continue;
    seen.set(o.toLowerCase(), o);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
}

/**
 * The control library: each control once, whatever its status, with the hazards it is linked to
 * and the platforms it is on for them.
 * @param {Data} data
 */
export function controlRows(data) {
  return all(data, 'control').map((control) => {
    const hazardIds = new Set(live(data, 'hazardControl').filter((l) => l.controlId === control.id).map((l) => l.hazardId));
    const hazards = [...hazardIds].map((id) => /** @type {Rec} */ (get(data, 'hazard', id))).filter(Boolean).sort(byNumber);
    const platforms = platformsReached(data, 'control', control).map((id) => /** @type {Rec} */ (get(data, 'platform', id))).filter(Boolean)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return { control, hazards, platforms };
  });
}

/**
 * One row per hazard, whatever its status, with every platform it is on and its residual band
 * there, and the worst of those bands. Risk belongs to a hazard on a platform, never to the hazard.
 * @param {Data} data
 */
export function hazardRows(data) {
  return listHazards(data, 'any').map((hazard) => {
    const platforms = live(data, 'hazardPlatform').filter((l) => l.hazardId === hazard.id).map((l) => {
      const r = ratingsOf(data, hazard.id, l.platformId).residual;
      /** @type {Record<string, string>} */
      const bands = Object.fromEntries(RECEPTORS.map((x) => [x, bandOf(r[/** @type {'personnel'} */ (x)])]));
      return { platform: /** @type {Rec} */ (get(data, 'platform', l.platformId)), band: Object.values(bands).reduce(worseBand), ...bands };
    });
    /** @param {string} k */
    const worstOf = (k) => (platforms.length ? BANDS[Math.min(...platforms.map((p) => BANDS.indexOf(/** @type {any} */ (p)[k])))] : null);
    return { hazard, platforms, worst: worstOf('band'), ...Object.fromEntries(RECEPTORS.map((x) => [`worst${RECEPTOR_WORD[/** @type {'personnel'} */ (x)]}`, worstOf(x)])) };
  });
}

/** The review in progress on a platform, if any. @param {Data} data @param {string} platformId @returns {Rec | null} */
export function openReview(data, platformId) {
  return live(data, 'review').find((r) => r.platformId === platformId && r.state === 'open') ?? null;
}

/** @param {{ state: string }[]} controls */
function controlCounts(controls) {
  const counts = { recommended: 0, planned: 0, implemented: 0, rejected: 0 };
  for (const c of controls) counts[/** @type {keyof typeof counts} */ (c.state)] += 1;
  return counts;
}

/**
 * A review's checklist. Open: every hazard now on the platform, with its current ratings and
 * control decisions, plus any row whose hazard has since left the platform. Completed: exactly
 * the rows it recorded, with no ratings, since the review does not say what they were then.
 * @param {Data} data @param {string} reviewId
 */
export function reviewRows(data, reviewId) {
  const review = get(data, 'review', reviewId);
  if (!review) return [];
  const rows = live(data, 'reviewRow').filter((r) => r.reviewId === reviewId);
  const rowOf = new Map(rows.map((r) => [r.hazardId, r]));
  const onNow = new Map(platformHazards(data, review.platformId).map((ph) => [ph.hazard.id, ph]));
  /** @param {Rec} hazard */
  const reportIdOf = (hazard) => onNow.get(hazard.id)?.reportId ?? hazardLabel(hazard);
  /** @param {Rec} hazard @param {boolean} current */
  const item = (hazard, current) => {
    const row = rowOf.get(hazard.id);
    const ph = current ? onNow.get(hazard.id) : undefined;
    return {
      hazard, reportId: reportIdOf(hazard), onPlatform: onNow.has(hazard.id),
      reviewed: Boolean(row?.reviewed), note: row?.note ?? '',
      rating: ph ? ph.rating : null, ratings: ph ? ph.ratings : null, counts: ph ? controlCounts(ph.controls) : null,
    };
  };
  const hazardOf = (/** @type {Rec} */ row) => /** @type {Rec} */ (get(data, 'hazard', row.hazardId));
  if (review.state === 'completed') return rows.map((r) => item(hazardOf(r), false)).sort((a, b) => byNumber(a.hazard, b.hazard));
  const off = rows.filter((r) => !onNow.has(r.hazardId)).map(hazardOf);
  return [...[...onNow.values()].map((ph) => item(ph.hazard, true)), ...off.map((h) => item(h, false))].sort((a, b) => byNumber(a.hazard, b.hazard));
}

/** A platform's completed reviews, newest first, with how many hazards each ticked. @param {Data} data @param {string} platformId */
export function completedReviews(data, platformId) {
  return live(data, 'review').filter((r) => r.platformId === platformId && r.state === 'completed')
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0))
    .map((review) => {
      const rows = live(data, 'reviewRow').filter((r) => r.reviewId === review.id);
      const ticked = rows.filter((r) => r.reviewed).length;
      return { review, ticked, notTicked: rows.length - ticked };
    });
}

/** @param {Data} data @param {string} platformId @returns {string | null} when it was last reviewed */
export function lastReviewed(data, platformId) {
  return completedReviews(data, platformId)[0]?.review.completedAt ?? null;
}

/** @param {Data} data @param {string} hazardId @param {string} platformId @returns {string | null} */
export function hazardLastReviewed(data, hazardId, platformId) {
  const hit = completedReviews(data, platformId).find(({ review }) => {
    const row = get(data, 'reviewRow', ids.reviewRow(review.id, hazardId));
    return row && row.status === 'live' && row.reviewed;
  });
  return hit?.review.completedAt ?? null;
}

/** Every live platform with a review schedule, soonest due first. @param {Data} data @param {string} today */
export function reviewDueList(data, today) {
  return live(data, 'platform').map((platform) => ({ platform, s: scheduleOf(data, platform.id, today) }))
    .filter(({ s }) => s.due)
    .map(({ platform, s }) => ({ platform, state: s.state, due: /** @type {string} */ (s.due) }))
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

/**
 * What is left to do on the live platforms of one owner (every owner when `ownerId` is null):
 * changes to acknowledge, reviews due or in progress (and platforms with no review schedule),
 * review dates moved since the owner last saw them (soonest first), controls awaiting a status
 * decision, controls we own there and have planned, and hazards missing a rating.
 * @param {Data} data @param {string} today @param {string | null} ownerId
 */
export function openItems(data, today, ownerId) {
  /** @type {{ acks: { entry: any, platform: Rec }[], reviews: { platform: Rec, state: string, due: string | null, lastReviewed: string | null, open: boolean }[], dateMoved: { platform: Rec, due: string, seen: string, urgent: boolean, driver: any }[], awaiting: { platform: Rec, hazard: Rec, control: Rec }[], toImplement: { platform: Rec, hazard: Rec, control: Rec }[], unrated: { platform: Rec, hazard: Rec, missing: string[] }[] }} */
  const out = { acks: [], reviews: [], dateMoved: [], awaiting: [], toImplement: [], unrated: [] };
  for (const platform of live(data, 'platform').filter((p) => ownerId == null || p.ownerId === ownerId)) {
    for (const entry of waitingChanges(data, platform.id)) out.acks.push({ entry, platform });
    const s = scheduleOf(data, platform.id, today);
    const open = Boolean(openReview(data, platform.id));
    if (s.state === 'overdue' || s.state === 'dueSoon' || s.state === 'none' || open) {
      out.reviews.push({ platform, state: s.state, due: s.due, lastReviewed: lastReviewed(data, platform.id), open });
    }
    if (s.moved) out.dateMoved.push({ platform, due: /** @type {string} */ (s.due), seen: /** @type {string} */ (s.seen), urgent: s.urgent, driver: s.driver });
    for (const ph of platformHazards(data, platform.id)) {
      for (const c of ph.controls) {
        if (c.state === 'recommended') out.awaiting.push({ platform, hazard: ph.hazard, control: c.control });
        if (c.state === 'planned' && implementedByOf(data, c.control.id, platform.id) === 'highcom') out.toImplement.push({ platform, hazard: ph.hazard, control: c.control });
      }
      const incomplete = (/** @type {any} */ pair) => !pair || pair.consequence == null || pair.likelihood == null;
      const missing = [];
      for (const stage of ['initial', 'residual']) for (const receptor of RECEPTORS) {
        if (incomplete(ph.ratings[stage][receptor])) missing.push(`${stage} ${receptor}`);
      }
      if (missing.length) out.unrated.push({ platform, hazard: ph.hazard, missing });
    }
  }
  out.acks.sort((a, b) => (a.entry.at < b.entry.at ? 1 : a.entry.at > b.entry.at ? -1 : 0));
  out.dateMoved.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  return out;
}

/** @param {Rec} a @param {Rec} b references by label (numbered first), then title */
const byReference = (a, b) => referenceLabel(a).localeCompare(referenceLabel(b), undefined, { numeric: true }) || String(a.title).localeCompare(String(b.title));

/** The references linked to one record. @param {Data} data @param {string} targetKind @param {string} targetId */
export function referencesFor(data, targetKind, targetId) {
  return live(data, 'referenceLink').filter((l) => l.targetKind === targetKind && l.targetId === targetId)
    .map((link) => ({ link, reference: /** @type {Rec} */ (get(data, 'reference', link.referenceId)) }))
    .filter((x) => x.reference && x.reference.status !== 'deleted')
    .sort((a, b) => byReference(a.reference, b.reference));
}

/**
 * A hazard's references, then those of the parts of it a page shows, each saying what it is for:
 * its causal factors, consequences and lifecycle phases, and on one platform's tab that platform's
 * own causal factors, element failure modes, systems or elements and affected groups. With no
 * platform (the Overview), every causal factor, and no per-platform lists.
 * @param {Data} data @param {string} hazardId @param {string | null} [platformId]
 */
export function hazardReferences(data, hazardId, platformId = null) {
  const out = referencesFor(data, 'hazard', hazardId).map((x) => ({ ...x, forText: '' }));
  /** @param {string} kind @param {string} word @param {Rec[]} recs @param {(r: Rec) => string} [name] */
  const add = (kind, word, recs, name = (r) => String(r.text)) => {
    for (const r of recs) for (const x of referencesFor(data, kind, r.id)) out.push({ ...x, forText: `${word}: ${name(r)}` });
  };
  add('causalFactor', 'Causal factor', causalFactorsOn(data, hazardId, platformId));
  add('consequence', 'Consequence', childrenOf(data, 'consequence', hazardId));
  add('hazardPhase', 'Lifecycle phase', phasesOf(data, hazardId).map((p) => p.link), (l) => String(get(data, 'phase', l.phaseId)?.name ?? ''));
  if (platformId) {
    add('failureMode', 'Element failure mode', platformListOn(data, 'failureMode', hazardId, platformId));
    add('systemElement', 'System/Element', platformListOn(data, 'systemElement', hazardId, platformId));
    add('affectedGroup', 'Affected group', platformListOn(data, 'affectedGroup', hazardId, platformId));
  }
  return out;
}

/**
 * A hazard's references once each, in the order hazardReferences gives, each with everything on the
 * page it is for (General first, for the hazard itself).
 * @param {Data} data @param {string} hazardId @param {string | null} [platformId]
 * @returns {{ reference: Rec, fors: { link: Rec, forText: string }[] }[]}
 */
export function hazardReferenceRows(data, hazardId, platformId = null) {
  /** @type {Map<string, { reference: Rec, fors: { link: Rec, forText: string }[] }>} */
  const rows = new Map();
  for (const x of hazardReferences(data, hazardId, platformId)) {
    const row = rows.get(x.reference.id) ?? { reference: x.reference, fors: [] };
    row.fors.push({ link: x.link, forText: x.forText });
    rows.set(x.reference.id, row);
  }
  return [...rows.values()];
}

/** What a reference supports: its live links, each with the record it points at. @param {Data} data @param {string} referenceId */
export function referenceTargets(data, referenceId) {
  return live(data, 'referenceLink').filter((l) => l.referenceId === referenceId).map((link) => {
    const target = get(data, link.targetKind, link.targetId);
    const hazard = target && target.hazardId && link.targetKind !== 'hazard' ? get(data, 'hazard', target.hazardId) ?? null : null;
    return { link, target, hazard };
  }).filter((x) => x.target && x.target.status !== 'deleted');
}

/** @param {Rec} p @param {string | null} ownerId */
const ownedBy = (p, ownerId) => ownerId == null || p.ownerId === ownerId;

/**
 * Reviews coming due within `days` (not yet overdue), soonest first, and any review in progress.
 * @param {Data} data @param {string} today @param {string | null} ownerId @param {number} [days]
 */
export function upcomingReviews(data, today, ownerId, days = 90) {
  const until = addDays(today, days);
  return live(data, 'platform').filter((p) => ownedBy(p, ownerId))
    .map((platform) => {
      const s = scheduleOf(data, platform.id, today);
      return { platform, due: s.due, state: s.state, open: Boolean(openReview(data, platform.id)) };
    })
    .filter((r) => r.open || (r.due && r.state !== 'overdue' && r.due <= until))
    .sort((a, b) => ((a.due ?? '9999') < (b.due ?? '9999') ? -1 : (a.due ?? '9999') > (b.due ?? '9999') ? 1 : 0));
}

/**
 * One summary per live platform of an owner (every owner when null): its review, the residual
 * risk of its hazards counted by band, and what is open on it.
 * @param {Data} data @param {string} today @param {string | null} ownerId
 */
export function platformCards(data, today, ownerId) {
  return live(data, 'platform').filter((p) => ownedBy(p, ownerId)).map((platform) => {
    const hazards = platformHazards(data, platform.id);
    /** @type {Record<string, Record<string, number>>} */
    const bands = Object.fromEntries(RECEPTORS.map((r) => [r, {}]));
    for (const h of hazards) {
      for (const receptor of /** @type {('personnel' | 'environment' | 'capability')[]} */ ([...RECEPTORS])) {
        const b = bandOf(h.ratings.residual[receptor]);
        bands[receptor][b] = (bands[receptor][b] ?? 0) + 1;
      }
    }
    const s = scheduleOf(data, platform.id, today);
    return {
      platform, state: s.state, due: s.due, lastReviewed: lastReviewed(data, platform.id),
      open: Boolean(openReview(data, platform.id)), hazards: hazards.length,
      awaiting: hazards.reduce((n, h) => n + h.controls.filter((c) => c.state === 'recommended').length, 0),
      acks: waitingChanges(data, platform.id).length, bands,
    };
  });
}

/**
 * The open items in order of urgency: review dates moved to within 30 days or past, overdue
 * reviews (longest overdue first), changes to acknowledge (newest first), other moved review
 * dates, controls awaiting a status decision, controls we have planned, hazards missing a rating,
 * then platforms with no review schedule.
 * @param {ReturnType<typeof openItems>} items
 */
export function attentionItems(items) {
  const moved = items.dateMoved ?? [];
  return [
    ...moved.filter((m) => m.urgent).map((m) => ({ type: 'dateMoved', ...m })),
    ...items.reviews.filter((r) => r.state === 'overdue').sort((a, b) => ((a.due ?? '') < (b.due ?? '') ? -1 : 1)).map((r) => ({ type: 'review', ...r })),
    ...items.acks.map((a) => ({ type: 'change', ...a })),
    ...moved.filter((m) => !m.urgent).map((m) => ({ type: 'dateMoved', ...m })),
    ...items.awaiting.map((x) => ({ type: 'control', ...x })),
    ...items.toImplement.map((x) => ({ type: 'implement', ...x })),
    ...items.unrated.map((x) => ({ type: 'rating', ...x })),
    ...items.reviews.filter((r) => r.state === 'none' && !r.open).map((r) => ({ type: 'schedule', ...r })),
  ];
}

/**
 * What a control prevents or mitigates on a platform: those of its causal factors (preventative)
 * or the hazard's consequences (mitigating) it is linked to, still there, in their own order.
 * @param {Data} data @param {string} kind @param {unknown} targets the ids kept @param {string} hazardId @param {string} platformId
 * @returns {Rec[]}
 */
export function barrierTargets(data, kind, targets, hazardId, platformId) {
  const wanted = new Set(Array.isArray(targets) ? targets : []);
  if (!wanted.size) return [];
  const pool = kind === 'mitigating' ? childrenOf(data, 'consequence', hazardId) : causalFactorsOn(data, hazardId, platformId);
  return pool.filter((r) => wanted.has(r.id));
}

/** The phases that are not deleted, in the order they were added. @param {Data} data */
export function listPhases(data) {
  return all(data, 'phase').filter((p) => p.status !== 'deleted').sort(byPhaseOrder);
}

/** Phases in the order they were added. @param {Rec} a @param {Rec} b */
function byPhaseOrder(a, b) {
  return (Number(a.order) || 0) - (Number(b.order) || 0) || byCreated(a, b);
}

/** A hazard's lifecycle phases, in the list's order. @param {Data} data @param {string} hazardId */
export function phasesOf(data, hazardId) {
  return live(data, 'hazardPhase').filter((l) => l.hazardId === hazardId)
    .map((link) => ({ link, phase: /** @type {Rec} */ (get(data, 'phase', link.phaseId)) }))
    .sort((a, b) => byPhaseOrder(a.phase, b.phase));
}

/** The hazards a phase is ticked on. @param {Data} data @param {string} phaseId */
export function phaseUsage(data, phaseId) {
  return live(data, 'hazardPhase').filter((l) => l.phaseId === phaseId).map((l) => /** @type {Rec} */ (get(data, 'hazard', l.hazardId))).sort(byNumber);
}

/** The platform groups that are not deleted, in the order they were added. @param {Data} data */
export function listPlatformGroups(data) {
  return all(data, 'platformGroup').filter((g) => g.status !== 'deleted').sort(byPhaseOrder);
}

/** A platform's groups, in the list's order. @param {Data} data @param {string} platformId */
export function groupsOf(data, platformId) {
  return live(data, 'platformGroupLink').filter((l) => l.platformId === platformId)
    .map((l) => get(data, 'platformGroup', l.groupId)).filter((g) => g && g.status !== 'deleted')
    .sort((a, b) => byPhaseOrder(/** @type {Rec} */ (a), /** @type {Rec} */ (b))).map((g) => /** @type {Rec} */ (g));
}

/** The platforms in a group that are not deleted, by name. @param {Data} data @param {string} groupId */
export function groupMembers(data, groupId) {
  return live(data, 'platformGroupLink').filter((l) => l.groupId === groupId)
    .map((l) => get(data, 'platform', l.platformId)).filter((p) => p && p.status !== 'deleted')
    .map((p) => /** @type {Rec} */ (p)).sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base', numeric: true }));
}

/**
 * A facet's options as Info lists them, in the order added: each with the platform groups it is
 * assigned to and how many hazards and platforms use it (a phase: ticked; any other: an entry of
 * the same text, ignoring case).
 * @param {Data} data @param {string} facet
 * @returns {{ option: Rec, groupIds: Set<string>, hazards: number, platforms: number }[]}
 */
export function facetOptions(data, facet) {
  const options = facet === 'phase' ? listPhases(data)
    : all(data, 'facetOption').filter((o) => o.status !== 'deleted' && o.facet === facet).sort(byPhaseOrder);
  const used = facet === 'phase' ? null : new Map(facetEntries(data, /** @type {'causalFactor'} */ (facet)).map((e) => [e.text.toLowerCase(), e]));
  const links = live(data, 'optionGroup');
  return options.map((option) => {
    const groupIds = new Set(links.filter((l) => l.optionId === option.id).map((l) => /** @type {string} */ (l.groupId)));
    const u = used ? used.get(String(option.name).toLowerCase()) : phaseStats(data, option.id);
    return { option, groupIds, hazards: u?.hazards ?? 0, platforms: u?.platforms ?? 0 };
  });
}

/**
 * Entries given on hazards for a facet (not lifecycle phases) that are not among its options,
 * on most platforms first: offered on Info to add to the list.
 * @param {Data} data @param {'causalFactor' | 'consequence' | 'failureMode' | 'systemElement' | 'affectedGroup'} facet
 */
export function unlistedEntries(data, facet) {
  const listed = new Set(facetOptions(data, facet).map((o) => String(o.option.name).toLowerCase()));
  return facetEntries(data, facet).filter((e) => !listed.has(e.text.toLowerCase()));
}

/**
 * Every entry of a facet given on any hazard, once each (ignoring case, the first spelling kept),
 * with the hazards it is on, the platforms it reaches, and those platforms' groups; on most platforms first.
 * @param {Data} data @param {'causalFactor' | 'consequence' | 'failureMode' | 'systemElement' | 'affectedGroup'} kind
 * @returns {{ text: string, hazards: number, platforms: number, groups: Rec[] }[]}
 */
export function facetEntries(data, kind) {
  /** @type {Map<string, { text: string, hazards: Set<string>, platforms: Set<string> }>} */
  const seen = new Map();
  for (const r of live(data, kind)) {
    const t = String(r.text ?? '').trim();
    const h = get(data, 'hazard', r.hazardId);
    if (!t || !h || h.status === 'deleted') continue;
    const key = t.toLowerCase();
    if (!seen.has(key)) seen.set(key, { text: t, hazards: new Set(), platforms: new Set() });
    const e = /** @type {{ text: string, hazards: Set<string>, platforms: Set<string> }} */ (seen.get(key));
    e.hazards.add(r.hazardId);
    for (const p of platformsReached(data, kind, r)) e.platforms.add(p);
  }
  const groups = listPlatformGroups(data);
  return [...seen.values()].map((e) => {
    const inGroup = new Set(live(data, 'platformGroupLink').filter((l) => e.platforms.has(l.platformId)).map((l) => l.groupId));
    return { text: e.text, hazards: e.hazards.size, platforms: e.platforms.size, groups: groups.filter((g) => inGroup.has(g.id)) };
  }).sort((a, b) => b.platforms - a.platforms || b.hazards - a.hazards || a.text.localeCompare(b.text, undefined, { sensitivity: 'base', numeric: true }));
}

/**
 * What a lifecycle phase covers: its hazards, the platforms they are on, the additional controls
 * linked to them, the worst residual band over every hazard on every platform, and how many of
 * those hazard-on-platform pairs still lack a full residual rating.
 * @param {Data} data @param {string} phaseId
 */
export function phaseStats(data, phaseId) {
  const hazards = phaseUsage(data, phaseId);
  const ids = new Set(hazards.map((h) => h.id));
  const pairs = live(data, 'hazardPlatform').filter((l) => ids.has(l.hazardId));
  const platforms = new Set(pairs.map((l) => l.platformId));
  const controls = new Set(live(data, 'hazardControl').filter((l) => ids.has(l.hazardId)).map((l) => l.controlId));
  let worst = 'Uncategorised';
  let unrated = 0;
  for (const l of pairs) {
    const residual = ratingsOf(data, l.hazardId, l.platformId).residual;
    if (RECEPTORS.some((r) => !residual[/** @type {'personnel'} */ (r)]?.likelihood || residual[/** @type {'personnel'} */ (r)]?.consequence == null)) unrated += 1;
    for (const r of RECEPTORS) worst = worseBand(worst, bandOf(residual[/** @type {'personnel'} */ (r)]));
  }
  return { hazards: hazards.length, platforms: platforms.size, controls: controls.size, pairs: pairs.length, unrated, worst };
}

/** A hazard's safety reports on a platform: newest first, undated last, then by number. @param {Data} data @param {string} hazardId @param {string} platformId */
export function safetyReportsOn(data, hazardId, platformId) {
  return live(data, 'safetyReport').filter((r) => r.hazardId === hazardId && r.platformId === platformId).sort((a, b) => {
    if (a.date !== b.date) return a.date == null ? 1 : b.date == null ? -1 : a.date < b.date ? 1 : -1;
    return String(a.number).localeCompare(String(b.number));
  });
}

/** Who implements a control on a platform (oem, highcom or customer), or null when not set. @param {Data} data @param {string} controlId @param {string} platformId */
export function implementedByOf(data, controlId, platformId) {
  const r = get(data, 'implementer', ids.implementer(controlId, platformId));
  return r && r.status === 'live' && r.implementedBy ? /** @type {string} */ (r.implementedBy) : null;
}

/** Who implements a control, as a person reads it: OEM, HighCom or Customer; empty when not set. @param {string | null} by */
export function implementedByText(by) {
  return by ? IMPLEMENTER_WORD[/** @type {'oem'} */ (by)] ?? '' : '';
}

/**
 * Every hazard on a platform the control is on for, with its kind and status there, by hazard number.
 * @param {Data} data @param {string} controlId @param {string} platformId
 */
export function controlOnPlatform(data, controlId, platformId) {
  const onPlatform = new Set(live(data, 'hazardPlatform').filter((l) => l.platformId === platformId).map((l) => l.hazardId));
  return live(data, 'hazardControl').filter((l) => l.controlId === controlId && onPlatform.has(l.hazardId) && !controlOff(data, l.hazardId, controlId, platformId))
    .map((l) => {
      const row = /** @type {ReturnType<typeof controlsOnPlatform>[number]} */ (controlsOnPlatform(data, l.hazardId, platformId).find((c) => c.control.id === controlId));
      return { hazard: /** @type {Rec} */ (get(data, 'hazard', l.hazardId)), kind: row.kind, state: row.state, ruling: row.ruling };
    })
    .sort((a, b) => byNumber(a.hazard, b.hazard));
}
