import { get } from '../core/data.js';
import { PivotError } from '../core/errors.js';
import { platformHazards, hazardDetail, lastReviewed, referencesFor, assessmentOf, sfarpOf, existingControlsOn } from '../core/queries.js';
import { formatRating } from '../core/matrix.js';
import { referenceLabel, controlLabel } from '../core/ids.js';
import { reviewState, aestDate } from '../core/time.js';

/** @typedef {import('../core/data.js').Data} Data */
/**
 * @typedef {{ platformId: string, platformName: string, ownerName: string, producedAt: string, producedBy: string,
 *   title: string, classification: string, rows: SnapshotRow[],
 *   review: { state: string, due: string | null, months: number | null, lastReviewed: string | null },
 *   references: { number: string, title: string, docNumber: string, revision: string, supports: string }[] }} Snapshot
 * @typedef {{ hazardId: string, number: number | null, reportId: string, title: string, description: string,
 *   causalFactors: string[], consequences: string[], controls: { number: string, title: string, description: string, kind: string, tier: string, state: string, reason: string, recommendation: string, justification: string }[],
 *   existingControls: { number: string, title: string, description: string, kind: string, tier: string }[],
 *   initial: any, residual: any,
 *   ratings: { initialPersonnel: any, initialEnvironment: any, residualPersonnel: any, residualEnvironment: any },
 *   assessments: { stage: string, receptor: string, likelihood: string | null, likelihoodWhy: string, consequence: number | null, consequenceWhy: string, level: string }[],
 *   sfarp: { justification: string, conclusion: string, conditions: string } }} SnapshotRow
 */

/**
 * A platform as a report shows it, as values rather than references, so a report stays what it
 * was when produced.
 * @param {Data} data @param {string} platformId
 * @param {{ profileName: (id: string) => string, at: string, by: string, title: string, classification: string }} o
 * @returns {Snapshot}
 */
export function buildSnapshot(data, platformId, o) {
  const platform = get(data, 'platform', platformId);
  if (!platform || platform.status === 'deleted') throw new PivotError('not-found', 'That platform no longer exists.');
  const rows = platformHazards(data, platformId).map((r) => {
    const d = /** @type {NonNullable<ReturnType<typeof hazardDetail>>} */ (hazardDetail(data, r.hazard.id));
    return {
      hazardId: r.hazard.id,
      number: r.hazard.number,
      reportId: r.reportId,
      title: r.hazard.title,
      description: r.hazard.description ?? '',
      causalFactors: d.causalFactors.map((x) => x.text),
      consequences: d.consequences.map((x) => x.text),
      controls: r.controls.map((c) => ({
        number: controlLabel(c.control), title: c.control.title, description: c.control.description ?? '',
        kind: c.kind, tier: c.control.tier ?? '', state: c.state, reason: c.state === 'rejected' ? c.ruling?.reason ?? '' : '',
        recommendation: c.link?.recommendation ?? '', justification: c.link?.justification ?? '',
      })),
      existingControls: existingControlsOn(data, r.hazard.id, platformId).map((x) => ({
        number: controlLabel(x.control), title: x.control.title, description: x.control.description ?? '', kind: x.kind, tier: x.control.tier ?? '',
      })),
      initial: r.rating.initial,
      residual: r.rating.residual,
      ratings: {
        initialPersonnel: r.ratings.initial.personnel, initialEnvironment: r.ratings.initial.environment,
        residualPersonnel: r.ratings.residual.personnel, residualEnvironment: r.ratings.residual.environment,
      },
      assessments: ['initial', 'residual'].flatMap((stage) => ['personnel', 'environment'].map((receptor) => {
        const a = assessmentOf(data, r.hazard.id, platformId, stage, receptor);
        return {
          stage, receptor, likelihood: a?.likelihood ?? null, likelihoodWhy: a?.likelihoodWhy ?? '',
          consequence: a?.consequence ?? null, consequenceWhy: a?.consequenceWhy ?? '',
          level: formatRating(r.ratings[stage][receptor]),
        };
      })),
      sfarp: sfarpOf(data, r.hazard.id, platformId),
    };
  });
  /** @type {Map<string, { ref: any, supports: string[] }>} */
  const found = new Map();
  /** @param {string} kind @param {string} id @param {string} label */
  const add = (kind, id, label) => {
    for (const { reference } of referencesFor(data, kind, id)) {
      if (reference.status !== 'live') continue;
      const e = found.get(reference.id) ?? { ref: reference, supports: [] };
      if (!e.supports.includes(label)) e.supports.push(label);
      found.set(reference.id, e);
    }
  };
  add('platform', platformId, 'Platform');
  for (const r of platformHazards(data, platformId)) {
    add('hazard', r.hazard.id, r.reportId);
    const d = /** @type {NonNullable<ReturnType<typeof hazardDetail>>} */ (hazardDetail(data, r.hazard.id));
    for (const cf of d.causalFactors) add('causalFactor', cf.id, `${r.reportId} causal factor`);
    for (const cq of d.consequences) add('consequence', cq.id, `${r.reportId} consequence`);
    for (const c of r.controls) add('control', c.control.id, c.control.title);
  }
  const references = [...found.values()]
    .map(({ ref, supports }) => ({ number: referenceLabel(ref), title: ref.title, docNumber: ref.docNumber ?? '', revision: ref.revision ?? '', supports: supports.join(', ') }))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }) || a.title.localeCompare(b.title));
  return structuredClone({
    platformId, platformName: platform.name, ownerName: o.profileName(platform.ownerId),
    producedAt: o.at, producedBy: o.by, title: o.title, classification: o.classification, rows, references,
    review: {
      state: reviewState(platform, aestDate(o.at)),
      due: platform.reviewDue ?? null,
      months: platform.reviewMonths ?? null,
      lastReviewed: lastReviewed(data, platformId),
    },
  });
}
