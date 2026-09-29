import { get, all, live, byCreated } from './data.js';
import { ids, hazardLabel, referenceLabel } from './ids.js';
import { ratingFor, BANDS } from './matrix.js';
import { reviewState, addDays } from './time.js';
import { waitingChanges } from './acks.js';
import { tierRank } from './ops/controls.js';

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

/** The platforms a reference link's target is on. @param {Data} data @param {string} kind @param {string} id @returns {string[]} */
function targetPlatforms(data, kind, id) {
  switch (kind) {
    case 'platform': return [id];
    case 'hazard': return platformsOfHazard(data, id);
    case 'causalFactor':
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
    case 'causalFactor':
    case 'consequence':
    case 'hazardControl': return platformsOfHazard(data, rec.hazardId);
    case 'control':
      return sortedUnique([
        ...live(data, 'hazardControl').filter((l) => l.controlId === rec.id).flatMap((l) => platformsOfHazard(data, l.hazardId)),
        ...live(data, 'existingControl').filter((l) => l.controlId === rec.id).map((l) => l.platformId),
      ]);
    case 'platform': return [rec.id];
    case 'hazardPlatform':
    case 'ruling':
    case 'rating':
    case 'assessment':
    case 'sfarp':
    case 'existingControl':
    case 'safetyReport':
    case 'report': return [rec.platformId];
    case 'review': return [rec.platformId];
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
  return {
    initial: { personnel: pair('initial', 'personnel'), environment: pair('initial', 'environment') },
    residual: { personnel: pair('residual', 'personnel'), environment: pair('residual', 'environment') },
  };
}

/** One receptor's initial and residual (personnel unless named): the shape callers had before assessments. @param {Data} data @param {string} hazardId @param {string} platformId @param {'personnel' | 'environment'} [receptor] */
export function ratingOf(data, hazardId, platformId, receptor = 'personnel') {
  const r = ratingsOf(data, hazardId, platformId);
  return { initial: r.initial[receptor], residual: r.residual[receptor] };
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

/** The worse residual band of a hazard on a platform, over personnel and environment. @param {Data} data @param {string} hazardId @param {string} platformId */
function worseResidual(data, hazardId, platformId) {
  const r = ratingsOf(data, hazardId, platformId).residual;
  return worseBand(bandOf(r.personnel), bandOf(r.environment));
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
    return { control: /** @type {Rec} */ (get(data, 'control', link.controlId)), kind: link.kind, state: s.state, ruling: s.ruling, link };
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
      const band = worseResidual(data, hazard.id, l.platformId);
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
        const band = worseResidual(data, hazard.id, hp.platformId);
        if (f.band && band !== f.band) continue;
        if (f.controlState && state !== f.controlState) continue;
        rows.push({ control, hazard, platform: /** @type {Rec} */ (get(data, 'platform', hp.platformId)), kind: hc.kind, state, band, role: 'additional' });
      }
    }
    for (const ec of live(data, 'existingControl').filter((l) => l.controlId === control.id)) {
      used = true;
      if (f.platformId && ec.platformId !== f.platformId) continue;
      if (f.controlState) continue;
      const hazard = /** @type {Rec} */ (get(data, 'hazard', ec.hazardId));
      const band = worseResidual(data, hazard.id, ec.platformId);
      if (f.band && band !== f.band) continue;
      rows.push({ control, hazard, platform: /** @type {Rec} */ (get(data, 'platform', ec.platformId)), kind: ec.kind, state: null, band, role: 'existing' });
    }
    if (!used && !narrowed) rows.push({ control, hazard: null, platform: null, kind: null, state: null, band: null, role: null });
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
    const platforms = live(data, 'hazardPlatform').filter((l) => l.hazardId === hazard.id).map((l) => {
      const r = ratingsOf(data, hazard.id, l.platformId).residual;
      const personnel = bandOf(r.personnel);
      const environment = bandOf(r.environment);
      return { platform: /** @type {Rec} */ (get(data, 'platform', l.platformId)), band: worseBand(personnel, environment), personnel, environment };
    });
    /** @param {'band' | 'personnel' | 'environment'} k */
    const worstOf = (k) => (platforms.length ? BANDS[Math.min(...platforms.map((p) => BANDS.indexOf(p[k])))] : null);
    return { hazard, platforms, worst: worstOf('band'), worstPersonnel: worstOf('personnel'), worstEnvironment: worstOf('environment') };
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
  return live(data, 'platform').filter((p) => p.reviewMonths && p.reviewDue)
    .map((platform) => ({ platform, state: reviewState(platform, today), due: /** @type {string} */ (platform.reviewDue) }))
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

/**
 * What is left to do on the live platforms of one owner (every owner when `ownerId` is null):
 * changes to acknowledge, reviews due or in progress, controls awaiting a decision, and
 * hazards missing a rating.
 * @param {Data} data @param {string} today @param {string | null} ownerId
 */
export function openItems(data, today, ownerId) {
  /** @type {{ acks: { entry: any, platform: Rec }[], reviews: { platform: Rec, state: string, due: string | null, lastReviewed: string | null, open: boolean }[], awaiting: { platform: Rec, hazard: Rec, control: Rec }[], unrated: { platform: Rec, hazard: Rec, missing: string[] }[] }} */
  const out = { acks: [], reviews: [], awaiting: [], unrated: [] };
  for (const platform of live(data, 'platform').filter((p) => ownerId == null || p.ownerId === ownerId)) {
    for (const entry of waitingChanges(data, platform.id)) out.acks.push({ entry, platform });
    const state = reviewState(platform, today);
    const open = Boolean(openReview(data, platform.id));
    if (state === 'overdue' || state === 'dueSoon' || open) {
      out.reviews.push({ platform, state, due: platform.reviewDue ?? null, lastReviewed: lastReviewed(data, platform.id), open });
    }
    for (const ph of platformHazards(data, platform.id)) {
      for (const c of ph.controls) if (c.state === 'recommended') out.awaiting.push({ platform, hazard: ph.hazard, control: c.control });
      const incomplete = (/** @type {any} */ pair) => !pair || pair.consequence == null || pair.likelihood == null;
      const missing = [];
      for (const stage of ['initial', 'residual']) for (const receptor of ['personnel', 'environment']) {
        if (incomplete(ph.ratings[stage][receptor])) missing.push(`${stage} ${receptor}`);
      }
      if (missing.length) out.unrated.push({ platform, hazard: ph.hazard, missing });
    }
  }
  out.acks.sort((a, b) => (a.entry.at < b.entry.at ? 1 : a.entry.at > b.entry.at ? -1 : 0));
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

/** A hazard's references, then those of its causal factors and consequences. @param {Data} data @param {string} hazardId */
export function hazardReferences(data, hazardId) {
  const out = referencesFor(data, 'hazard', hazardId).map((x) => ({ ...x, forText: '' }));
  for (const [kind, word] of [['causalFactor', 'Causal factor'], ['consequence', 'Consequence']]) {
    for (const r of live(data, kind).filter((x) => x.hazardId === hazardId)) {
      for (const x of referencesFor(data, kind, r.id)) out.push({ ...x, forText: `${word}: ${r.text}` });
    }
  }
  return out;
}

/** What a reference supports: its live links, each with the record it points at. @param {Data} data @param {string} referenceId */
export function referenceTargets(data, referenceId) {
  return live(data, 'referenceLink').filter((l) => l.referenceId === referenceId).map((link) => {
    const target = get(data, link.targetKind, link.targetId);
    const hazard = target && (link.targetKind === 'causalFactor' || link.targetKind === 'consequence') ? get(data, 'hazard', target.hazardId) ?? null : null;
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
    .map((platform) => ({ platform, due: platform.reviewDue ?? null, state: reviewState(platform, today), open: Boolean(openReview(data, platform.id)) }))
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
    /** @type {{ personnel: Record<string, number>, environment: Record<string, number> }} */
    const bands = { personnel: {}, environment: {} };
    for (const h of hazards) {
      for (const receptor of /** @type {const} */ (['personnel', 'environment'])) {
        const b = bandOf(h.ratings.residual[receptor]);
        bands[receptor][b] = (bands[receptor][b] ?? 0) + 1;
      }
    }
    return {
      platform, state: reviewState(platform, today), due: platform.reviewDue ?? null, lastReviewed: lastReviewed(data, platform.id),
      open: Boolean(openReview(data, platform.id)), hazards: hazards.length,
      awaiting: hazards.reduce((n, h) => n + h.controls.filter((c) => c.state === 'recommended').length, 0),
      acks: waitingChanges(data, platform.id).length, bands,
    };
  });
}

/**
 * The open items in order of urgency: overdue reviews (longest overdue first), changes to
 * acknowledge (newest first), controls awaiting a decision, then hazards missing a rating.
 * @param {ReturnType<typeof openItems>} items
 */
export function attentionItems(items) {
  return [
    ...items.reviews.filter((r) => r.state === 'overdue').sort((a, b) => ((a.due ?? '') < (b.due ?? '') ? -1 : 1)).map((r) => ({ type: 'review', ...r })),
    ...items.acks.map((a) => ({ type: 'change', ...a })),
    ...items.awaiting.map((x) => ({ type: 'control', ...x })),
    ...items.unrated.map((x) => ({ type: 'rating', ...x })),
  ];
}

/** A hazard's existing controls on a platform, by tier (most effective first), then number. @param {Data} data @param {string} hazardId @param {string} platformId */
export function existingControlsOn(data, hazardId, platformId) {
  return live(data, 'existingControl').filter((l) => l.hazardId === hazardId && l.platformId === platformId)
    .map((link) => ({ link, control: /** @type {Rec} */ (get(data, 'control', link.controlId)), kind: /** @type {string} */ (link.kind) }))
    .sort((a, b) => tierRank(a.control.tier) - tierRank(b.control.tier) || byNumber(a.control, b.control) || String(a.control.title).localeCompare(String(b.control.title)));
}

/** Where a control is an existing control. @param {Data} data @param {string} controlId */
export function existingUsage(data, controlId) {
  return live(data, 'existingControl').filter((l) => l.controlId === controlId).map((l) => ({
    hazard: /** @type {Rec} */ (get(data, 'hazard', l.hazardId)), platform: /** @type {Rec} */ (get(data, 'platform', l.platformId)), kind: /** @type {string} */ (l.kind),
  }));
}

/** The phases that are not deleted, in the order they were added. @param {Data} data */
export function listPhases(data) {
  return all(data, 'phase').filter((p) => p.status !== 'deleted').sort(byCreated);
}

/** A hazard's lifecycle phases, in the list's order. @param {Data} data @param {string} hazardId */
export function phasesOf(data, hazardId) {
  return live(data, 'hazardPhase').filter((l) => l.hazardId === hazardId)
    .map((link) => ({ link, phase: /** @type {Rec} */ (get(data, 'phase', link.phaseId)) }))
    .sort((a, b) => byCreated(a.phase, b.phase));
}

/** The hazards a phase is ticked on. @param {Data} data @param {string} phaseId */
export function phaseUsage(data, phaseId) {
  return live(data, 'hazardPhase').filter((l) => l.phaseId === phaseId).map((l) => /** @type {Rec} */ (get(data, 'hazard', l.hazardId))).sort(byNumber);
}

/** A hazard's safety reports on a platform: newest first, undated last, then by number. @param {Data} data @param {string} hazardId @param {string} platformId */
export function safetyReportsOn(data, hazardId, platformId) {
  return live(data, 'safetyReport').filter((r) => r.hazardId === hazardId && r.platformId === platformId).sort((a, b) => {
    if (a.date !== b.date) return a.date == null ? 1 : b.date == null ? -1 : a.date < b.date ? 1 : -1;
    return String(a.number).localeCompare(String(b.number));
  });
}
