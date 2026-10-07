import { get } from '../core/data.js';
import { PivotError } from '../core/errors.js';
import { safetyReportId } from '../core/ops/report-ids.js';
import { platformHazards, hazardDetail, causalFactorsOn, lastReviewed, referencesFor, assessmentOf, sfarpOf, phasesOf, platformListOn, safetyReportsOn, implementedByOf, implementedByText } from '../core/queries.js';
import { formatRating } from '../core/matrix.js';
import { RECEPTORS, stageKey } from '../core/receptors.js';
import { referenceLabel, controlLabel } from '../core/ids.js';
import { reviewState, aestDate } from '../core/time.js';

/** @typedef {import('../core/data.js').Data} Data */
/**
 * @typedef {{ platformId: string, platformName: string, ownerName: string, producedAt: string, producedBy: string,
 *   title: string, classification: string, rows: SnapshotRow[],
 *   review: { state: string, due: string | null, months: number | null, lastReviewed: string | null },
 *   references: { number: string, title: string, docNumber: string, revision: string, supports: string }[] }} Snapshot
 * @typedef {{ hazardId: string, number: number | null, reportId: string, title: string, description: string,
 *   causalFactors: string[], consequences: string[], controls: { number: string, title: string, description: string, implementedBy: string, kind: string, tier: string, state: string, reason: string, recommendation: string, justification: string }[],
 *   phases: string[],
 *   safetyReports: { number: string, date: string | null, type: string, summary: string, description: string, location: string, parties: string }[],
 *   initial: any, residual: any,
 *   ratings: Record<string, any>,
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
      causalFactors: causalFactorsOn(data, r.hazard.id, platformId).map((x) => x.text),
      consequences: d.consequences.map((x) => x.text),
      controls: r.controls.map((c) => ({
        number: controlLabel(c.control), title: c.control.title, description: c.control.description ?? '', implementedBy: implementedByText(implementedByOf(data, c.control.id, platformId)),
        kind: c.kind, tier: c.control.tier ?? '', state: c.state, reason: c.state === 'rejected' ? c.ruling?.reason ?? '' : '',
        recommendation: c.link?.recommendation ?? '', justification: c.link?.justification ?? '',
      })),
      phases: phasesOf(data, r.hazard.id).map((x) => x.phase.name),
      safetyReports: safetyReportsOn(data, r.hazard.id, platformId).map((s) => ({
        number: safetyReportId(data, s).id, date: s.date, type: s.type, summary: s.summary, description: s.description, location: s.location, parties: s.parties,
      })),
      initial: r.rating.initial,
      residual: r.rating.residual,
      ratings: /** @type {any} */ (Object.fromEntries(['initial', 'residual'].flatMap((stage) => RECEPTORS.map((receptor) => [stageKey(stage, receptor), r.ratings[/** @type {'initial'} */ (stage)][/** @type {'personnel'} */ (receptor)]])))),
      assessments: ['initial', 'residual'].flatMap((stage) => RECEPTORS.map((receptor) => {
        const a = assessmentOf(data, r.hazard.id, platformId, stage, receptor);
        return {
          stage, receptor, likelihood: a?.likelihood ?? null, likelihoodWhy: a?.likelihoodWhy ?? '',
          consequence: a?.consequence ?? null, consequenceWhy: a?.consequenceWhy ?? '',
          level: formatRating(r.ratings[/** @type {'initial'} */ (stage)][/** @type {'personnel'} */ (receptor)]),
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
    for (const cf of causalFactorsOn(data, r.hazard.id, platformId)) add('causalFactor', cf.id, `${r.reportId} causal factor`);
    for (const cq of d.consequences) add('consequence', cq.id, `${r.reportId} consequence`);
    for (const { link } of phasesOf(data, r.hazard.id)) add('hazardPhase', link.id, `${r.reportId} lifecycle phase`);
    for (const [kind, word] of [['failureMode', 'element failure mode'], ['systemElement', 'system/element'], ['affectedGroup', 'affected group']]) {
      for (const x of platformListOn(data, /** @type {'failureMode'} */ (kind), r.hazard.id, platformId)) add(kind, x.id, `${r.reportId} ${word}`);
    }
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
