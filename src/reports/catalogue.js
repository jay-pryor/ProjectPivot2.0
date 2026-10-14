import { BANDS } from '../core/matrix.js';
import { formatRating } from '../core/matrix.js';
import { RECEPTORS, RECEPTOR_WORD, stageKey } from '../core/receptors.js';

/** @typedef {import('./snapshot.js').Snapshot} Snapshot */

/** How a control's state reads in a report. */
export const STATUS_WORD = /** @type {Record<string, string>} */ ({ recommended: 'Recommended', planned: 'Planned', implemented: 'Implemented', rejected: 'Rejected', confirmed: 'Implemented', excluded: 'Rejected', awaiting: 'Recommended' });

/**
 * Rows that are one thing on several hazards (a control, a safety report), gathered into one
 * row per thing: its own fields from the first, and every hazard's entry kept in `entries`.
 * @param {any[]} list @param {(x: any) => string} keyOf
 */
export function byItem(list, keyOf) {
  /** @type {Map<string, any>} */
  const out = new Map();
  for (const x of list) {
    const k = keyOf(x);
    if (!out.has(k)) out.set(k, { ...x, key: k, entries: [] });
    out.get(k).entries.push(x);
  }
  return [...out.values()];
}
/** @param {any[]} list */
export const byControl = (list) => byItem(list, (c) => c.number ?? c.title).sort((a, b) => String(a.key).localeCompare(String(b.key), undefined, { numeric: true }));
/** The hazards a gathered row is on. @param {any} r @returns {string[]} */
export const hazardList = (r) => [...new Set(r.entries.map((/** @type {any} */ e) => e.reportId))].map(String);
/** The hazards a gathered row is on, as a list that wraps in its column. @param {any} r */
export const hazardsOf = (r) => hazardList(r).join(', ');
/**
 * A value recorded per hazard: once when every hazard has the same, else one line per hazard
 * that has one.
 * @param {any} r @param {(entry: any) => any} get
 */
export function perHazard(r, get) {
  const vals = r.entries.map((/** @type {any} */ e) => ({ h: e.reportId, v: String(get(e) ?? '') }));
  if (new Set(vals.map((/** @type {any} */ x) => x.v)).size <= 1) return vals[0]?.v ?? '';
  // A hazard with nothing recorded is left out of the list.
  return vals.filter((/** @type {any} */ x) => x.v).map((/** @type {any} */ x) => `${x.h}: ${x.v}`).join('\n');
}

/** A rating's printed text, ranked: Uncategorised lowest, High highest. @param {string} text */
export function ratingValue(text) {
  const band = String(text ?? '').replace(/\s*\(.*$/, '');
  const at = BANDS.indexOf(/** @type {any} */ (band));
  return { text: String(text ?? ''), sort: at === -1 ? 0 : BANDS.length - 1 - at };
}
/** A date as stored (YYYY-MM-DD), sorting by itself. @param {string | null | undefined} d */
const dateValue = (d) => ({ text: d ?? '', sort: d ?? '' });

/** @param {string} id @param {string} label @param {'text'|'date'|'rating'|'list'} [type] */
const f = (id, label, type = 'text') => ({ id, label, type });

const CONTROL_FIELDS = [f('id', 'ID'), f('title', 'Title'), f('description', 'Description'), f('kind', 'Kind'), f('tier', 'Tier'), f('status', 'Status'),
  f('recommendation', 'Recommendation'), f('justification', 'Justification'), f('reason', 'Reason rejected'), f('implementedBy', 'Implemented by'), f('hazards', 'Hazards', 'list')];
const SAFETY_FIELDS = [f('id', 'ID'), f('date', 'Date', 'date'), f('type', 'Type'), f('summary', 'Summary'), f('description', 'Description'),
  f('location', 'Location'), f('parties', 'Parties involved'), f('hazards', 'Hazards', 'list')];

/** The collections, as PIVOT declares them to the designer. */
const COLLECTIONS = {
  platform: { label: 'Platform', fields: [f('name', 'Name'), f('owner', 'Owner'), f('hazards', 'Number of hazards'), f('reviewDue', 'Review due', 'date'), f('lastReviewed', 'Last reviewed', 'date')],
    children: ['hazard', 'control', 'safetyReport', 'reference'] },
  hazard: { label: 'Hazard', plural: 'Hazards', fields: [f('id', 'ID'), f('title', 'Title'), f('description', 'Description'), f('phases', 'Lifecycle phases', 'list'),
    f('causalFactors', 'Causal factors', 'list'), f('consequences', 'Consequences', 'list'),
    ...['initial', 'residual'].flatMap((stage) => RECEPTORS.map((rc) => f(stageKey(stage, rc), `${stage === 'initial' ? 'Initial' : 'Residual'} risk (${RECEPTOR_WORD[/** @type {'personnel'} */ (rc)]})`, 'rating'))),
    f('sfarpJustification', 'SFARP justification'), f('sfarpConclusion', 'SFARP conclusion'), f('sfarpConditions', 'Conditions of validity')],
    children: ['control', 'assessment', 'safetyReport', 'reference'] },
  control: { label: 'Control', plural: 'Controls', fields: CONTROL_FIELDS, children: [] },
  assessment: { label: 'Assessment', plural: 'Assessments', fields: [f('stage', 'Stage'), f('receptor', 'Receptor'), f('likelihood', 'Likelihood'), f('likelihoodWhy', 'Likelihood justification'),
    f('consequence', 'Consequence'), f('consequenceWhy', 'Consequence justification'), f('level', 'Level', 'rating')], children: [] },
  safetyReport: { label: 'Safety report', plural: 'Safety reports', fields: SAFETY_FIELDS, children: [] },
  reference: { label: 'Reference', plural: 'References', fields: [f('id', 'ID'), f('title', 'Title'), f('docNumber', 'Doc number'), f('revision', 'Revision'), f('supports', 'Supports')], children: [] },
};

/** @param {string} key @param {Record<string, any>} values @param {Record<string, any[]>} [children] */
const entry = (key, values, children = {}) => ({ key, values, children });

/** @param {any} c a control as one hazard has it (with `reportId`), or gathered (with `entries`) */
function controlEntry(c) {
  const g = c.entries ? (/** @type {(x: any) => any} */ get) => perHazard(c, get) : (/** @type {(x: any) => any} */ get) => get(c);
  return entry(c.id ?? c.number, {
    id: c.number ?? '', title: c.title ?? '', description: c.description ?? '', kind: g((x) => x.kind), tier: c.tier ?? '',
    status: g((x) => STATUS_WORD[x.state] ?? x.state), recommendation: g((x) => x.recommendation ?? ''), justification: g((x) => x.justification ?? ''),
    reason: g((x) => x.reason ?? ''), implementedBy: c.implementedBy ?? '', hazards: c.entries ? hazardList(c) : [String(c.reportId ?? '')],
  });
}
/** @param {any} s a safety report as one hazard has it, or gathered */
function safetyEntry(s) {
  return entry(s.id ?? s.number, {
    id: s.number ?? '', date: dateValue(s.date), type: s.type ?? '', summary: s.summary ?? '', description: s.description ?? '',
    location: s.location ?? '', parties: s.parties ?? '', hazards: s.entries ? hazardList(s) : [String(s.reportId ?? '')],
  });
}
/** @param {any} r */
const referenceEntry = (r) => entry(r.id ?? r.number, { id: r.number ?? '', title: r.title ?? '', docNumber: r.docNumber ?? '', revision: r.revision ?? '', supports: r.supports ?? '' });

/**
 * The register data a report can show, for the designer's fields and repeats: the collections,
 * and (with a snapshot) the entries, keyed by record id so text kept per entry survives
 * renumbering.
 * @param {Snapshot | null} s
 */
export function catalogueFor(s) {
  if (!s) return { root: 'platform', collections: COLLECTIONS, data: null };
  const refs = s.references ?? [];
  const hazards = s.rows.map((h) => {
    const withHazard = (/** @type {any} */ x) => ({ reportId: h.reportId, ...x });
    const mine = new Set(h.references ?? []);
    return entry(h.hazardId, {
      id: h.reportId, title: h.title ?? '', description: h.description ?? '', phases: h.phases ?? [], causalFactors: h.causalFactors ?? [], consequences: h.consequences ?? [],
      ...Object.fromEntries(['initial', 'residual'].flatMap((stage) => RECEPTORS.map((rc) => {
        const k = stageKey(stage, rc);
        return [k, ratingValue(formatRating(h.ratings?.[k] ?? (rc === 'personnel' ? /** @type {any} */ (h)[stage] : null) ?? null))];
      }))),
      sfarpJustification: h.sfarp?.justification ?? '', sfarpConclusion: h.sfarp?.conclusion ?? '', sfarpConditions: h.sfarp?.conditions ?? '',
    }, {
      control: h.controls.map((c) => controlEntry(withHazard(c))),
      assessment: (h.assessments ?? []).map((a) => entry(`${a.stage}:${a.receptor}`, {
        stage: a.stage === 'initial' ? 'Initial' : 'Residual', receptor: RECEPTOR_WORD[/** @type {'personnel'} */ (a.receptor)] ?? a.receptor,
        likelihood: a.likelihood ?? '', likelihoodWhy: a.likelihoodWhy ?? '', consequence: a.consequence == null ? '' : String(a.consequence),
        consequenceWhy: a.consequenceWhy ?? '', level: ratingValue(a.level),
      })),
      safetyReport: (h.safetyReports ?? []).map((x) => safetyEntry(withHazard(x))),
      reference: refs.filter((r) => mine.has(r.id)).map(referenceEntry),
    });
  });
  const platform = entry(s.platformId, {
    name: s.platformName, owner: s.ownerName, hazards: String(s.rows.length),
    reviewDue: dateValue(s.review?.due ?? ''), lastReviewed: dateValue(s.review?.lastReviewed ?? ''),
  }, {
    hazard: hazards,
    control: byControl(s.rows.flatMap((h) => h.controls.map((c) => ({ reportId: h.reportId, ...c })))).map(controlEntry),
    safetyReport: byItem(s.rows.flatMap((h) => (h.safetyReports ?? []).map((x) => ({ reportId: h.reportId, ...x }))), (x) => x.id ?? x.number).map(safetyEntry),
    reference: refs.map(referenceEntry),
  });
  return { root: 'platform', collections: COLLECTIONS, data: platform };
}
