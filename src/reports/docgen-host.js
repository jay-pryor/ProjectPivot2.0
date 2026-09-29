import { App } from '../../DocGen/doc-designer.js';
import { CLASSIFICATIONS } from './classifications.js';
import { buildSnapshot } from './snapshot.js';
import { live } from '../core/data.js';
import { formatRating } from '../core/matrix.js';
import { toIsoUtc, aestDate } from '../core/time.js';

/** @typedef {import('./snapshot.js').Snapshot} Snapshot */

/** @param {{ platformName: string, producedAt: string }} s */
export function reportFileBase(s) {
  return `${s.platformName}-${aestDate(s.producedAt)}`.replace(/[^A-Za-z0-9._-]+/g, '-');
}

/** @param {Snapshot} s */
function metaRows(s) {
  const rows = [
    { id: 'platform', label: 'Platform', value: s.platformName, code: false },
    { id: 'owner', label: 'Owner', value: s.ownerName, code: false },
    { id: 'hazards', label: 'Hazards', value: String(s.rows.length), code: false },
  ];
  if (s.producedBy) rows.push({ id: 'produced', label: 'Produced', value: aestDate(s.producedAt), code: false });
  return rows;
}

/**
 * The report's tables, declared for DocGen. Unbound (no snapshot) they have no rows, which is
 * all the designer needs to draw a section it is not generating.
 * @param {Snapshot | null} s
 */
function sectionsFor(s) {
  /** @param {(s: Snapshot) => any[]} f */
  const rows = (f) => () => (s ? f(s) : []);
  const STATUS_WORD = { recommended: 'Recommended', planned: 'Planned', implemented: 'Implemented', rejected: 'Rejected', confirmed: 'Implemented', excluded: 'Rejected', awaiting: 'Recommended' };
  const hazardKey = { id: '_key', label: 'Hazard', w: 3, get: (/** @type {any} */ r) => r.reportId };
  return [
    {
      id: 'hazards', label: 'Hazards',
      keyColumn: { id: '_key', label: 'ID', w: 3, get: (/** @type {any} */ r) => r.reportId },
      columns: [
        { id: 'title', label: 'Hazard', w: 6, get: (/** @type {any} */ r) => r.title },
        { id: 'initialPersonnel', label: 'Initial risk (personnel)', w: 3, get: (/** @type {any} */ r) => formatRating(r.ratings?.initialPersonnel ?? r.initial) },
        { id: 'initialEnvironment', label: 'Initial risk (environment)', w: 3, get: (/** @type {any} */ r) => formatRating(r.ratings?.initialEnvironment ?? null) },
        { id: 'residualPersonnel', label: 'Residual risk (personnel)', w: 3, get: (/** @type {any} */ r) => formatRating(r.ratings?.residualPersonnel ?? r.residual) },
        { id: 'residualEnvironment', label: 'Residual risk (environment)', w: 3, get: (/** @type {any} */ r) => formatRating(r.ratings?.residualEnvironment ?? null) },
        { id: 'description', label: 'Description', w: 6, optional: true, get: (/** @type {any} */ r) => r.description },
      ],
      rows: rows((x) => x.rows),
    },
    {
      id: 'controls', label: 'Additional control analysis',
      keyColumn: hazardKey,
      columns: [
        { id: 'number', label: 'ID', w: 2, get: (/** @type {any} */ r) => r.number ?? '' },
        { id: 'control', label: 'Control measure', w: 4, get: (/** @type {any} */ r) => r.title },
        { id: 'tier', label: 'Tier', w: 3, optional: true, get: (/** @type {any} */ r) => r.tier ?? '' },
        { id: 'description', label: 'Description', w: 5, optional: true, get: (/** @type {any} */ r) => r.description ?? '' },
        { id: 'kind', label: 'Kind', w: 2, get: (/** @type {any} */ r) => r.kind },
        { id: 'recommendation', label: 'Recommendation', w: 5, get: (/** @type {any} */ r) => r.recommendation ?? '' },
        { id: 'justification', label: 'Justification', w: 5, get: (/** @type {any} */ r) => r.justification ?? '' },
        { id: 'state', label: 'Status', w: 2, get: (/** @type {any} */ r) => STATUS_WORD[/** @type {keyof typeof STATUS_WORD} */ (r.state)] ?? r.state },
        { id: 'reason', label: 'Reason rejected', w: 4, optional: true, get: (/** @type {any} */ r) => r.reason },
      ],
      rows: rows((x) => x.rows.flatMap((h) => h.controls.map((c) => ({ reportId: h.reportId, ...c })))),
    },
    {
      id: 'existing', label: 'Existing controls',
      keyColumn: hazardKey,
      columns: [
        { id: 'tier', label: 'Tier', w: 3, get: (/** @type {any} */ r) => r.tier || 'Not set' },
        { id: 'number', label: 'ID', w: 2, get: (/** @type {any} */ r) => r.number },
        { id: 'control', label: 'Control', w: 5, get: (/** @type {any} */ r) => r.title },
        { id: 'description', label: 'Description', w: 5, optional: true, get: (/** @type {any} */ r) => r.description },
        { id: 'kind', label: 'Kind', w: 2, get: (/** @type {any} */ r) => r.kind },
      ],
      rows: rows((x) => x.rows.flatMap((h) => (h.existingControls ?? []).map((c) => ({ reportId: h.reportId, ...c })))),
    },
    {
      id: 'causes', label: 'Causal factors and consequences',
      keyColumn: hazardKey,
      columns: [
        { id: 'type', label: 'Type', w: 2, get: (/** @type {any} */ r) => r.type },
        { id: 'text', label: 'Description', w: 8, get: (/** @type {any} */ r) => r.text },
      ],
      rows: rows((x) => x.rows.flatMap((h) => [
        ...h.causalFactors.map((text) => ({ reportId: h.reportId, type: 'Causal factor', text })),
        ...h.consequences.map((text) => ({ reportId: h.reportId, type: 'Consequence', text })),
      ])),
    },
    {
      id: 'references', label: 'References',
      keyColumn: { id: '_key', label: 'ID', w: 2, get: (/** @type {any} */ r) => r.number },
      columns: [
        { id: 'title', label: 'Reference', w: 5, get: (/** @type {any} */ r) => r.title },
        { id: 'docNumber', label: 'Doc number', w: 3, get: (/** @type {any} */ r) => r.docNumber },
        { id: 'revision', label: 'Revision', w: 2, get: (/** @type {any} */ r) => r.revision },
        { id: 'supports', label: 'Supports', w: 4, get: (/** @type {any} */ r) => r.supports },
      ],
      rows: rows((x) => x.references ?? []),
    },
    {
      id: 'assessments', label: 'Risk assessments',
      keyColumn: hazardKey,
      columns: [
        { id: 'stage', label: 'Stage', w: 2, get: (/** @type {any} */ r) => (r.stage === 'initial' ? 'Initial' : 'Residual') },
        { id: 'receptor', label: 'Receptor', w: 2, get: (/** @type {any} */ r) => (r.receptor === 'personnel' ? 'Personnel' : 'Environment') },
        { id: 'likelihood', label: 'Likelihood', w: 2, get: (/** @type {any} */ r) => r.likelihood ?? '' },
        { id: 'likelihoodWhy', label: 'Likelihood justification', w: 5, get: (/** @type {any} */ r) => r.likelihoodWhy },
        { id: 'consequence', label: 'Consequence', w: 2, get: (/** @type {any} */ r) => (r.consequence == null ? '' : String(r.consequence)) },
        { id: 'consequenceWhy', label: 'Consequence justification', w: 5, get: (/** @type {any} */ r) => r.consequenceWhy },
        { id: 'level', label: 'Assessed level', w: 3, get: (/** @type {any} */ r) => r.level },
      ],
      rows: rows((x) => x.rows.flatMap((h) => (h.assessments ?? []).map((a) => ({ reportId: h.reportId, ...a })))),
    },
    {
      id: 'sfarp', label: 'SFARP considerations',
      keyColumn: hazardKey,
      columns: [
        { id: 'justification', label: 'Justification', w: 5, get: (/** @type {any} */ r) => r.justification },
        { id: 'conclusion', label: 'Conclusion', w: 4, get: (/** @type {any} */ r) => r.conclusion },
        { id: 'conditions', label: 'Conditions of validity', w: 5, get: (/** @type {any} */ r) => r.conditions },
      ],
      rows: rows((x) => x.rows.map((h) => ({ reportId: h.reportId, ...(h.sfarp ?? { justification: '', conclusion: '', conditions: '' }) }))),
    },
  ];
}

/**
 * @param {{ getData: () => import('../core/data.js').Data, setDesign: (design: Record<string, any>) => void,
 *   clock: import('../core/time.js').Clock, profileName: (id: string) => string }} ctx
 */
export function createDocHost(ctx) {
  /** @type {Snapshot | null} set only while a report is being produced */
  let producing = null;
  /** @param {string} platformId */
  const snapshotFor = (platformId) => (producing && producing.platformId === platformId
    ? producing
    : buildSnapshot(ctx.getData(), platformId, { profileName: ctx.profileName, at: ctx.clock.now(), by: '', title: '', classification: '' }));

  const host = {
    getState: () => ({ report: structuredClone(ctx.getData().reportDesign) }),
    /** @param {(state: { report?: Record<string, any> }) => void} mutator */
    commit(mutator) {
      const state = { report: structuredClone(ctx.getData().reportDesign) };
      mutator(state);
      ctx.setDesign(state.report ?? {});
    },
    clock: { nowIso: () => toIsoUtc(ctx.clock.now()) },
    classifications: [...CLASSIFICATIONS],
    subject: {
      noun: 'platform',
      metaLabel: 'About this platform',
      list: () => live(ctx.getData(), 'platform').map((p) => ({ id: p.id, label: p.name })),
      ready: () => true,
      /** @param {string} id */
      meta: (id) => metaRows(snapshotFor(id)),
    },
    /** @param {{ subjectId?: string } | null} run */
    sections: (run) => sectionsFor(run && run.subjectId ? snapshotFor(run.subjectId) : null),
  };

  return {
    host,
    /**
     * @param {string} platformId @param {{ at: string, by: string, title: string }} o
     */
    produce(platformId, { at, by, title }) {
      App.docHost.set(host);
      const options = App.docSession.options();
      const snapshot = buildSnapshot(ctx.getData(), platformId, { profileName: ctx.profileName, at, by, title, classification: options.classification || '' });
      producing = snapshot;
      try {
        const o = { ...options, subjectId: platformId };
        const utc = toIsoUtc(at);
        const blocks = App.docGen.reportBlocks(host, o).filter((/** @type {any} */ b) => b.included);
        const meta = App.docHost.chosenMeta(platformId, utc);
        const prepared = blocks.map((/** @type {any} */ b) => App.docGen.sectionContent(host, b, o, App.docHost.context(platformId, utc), meta));
        const base = reportFileBase(snapshot);
        const md = App.docGen.emitDocument(host, prepared, {
          title, date: aestDate(at), classification: snapshot.classification,
          filename: o.filename, tags: o.tags, logicalName: `${base}.md`, fallbackName: `${base}.md`,
        });
        const html = App.docGen.emitHtml(host, md, { title, classification: snapshot.classification });
        return { report: { ...snapshot, markdown: md.text, html: html.text }, markdownName: md.name, htmlName: html.name };
      } finally {
        producing = null;
      }
    },
  };
}
