import { App } from '../../DocGen/doc-designer.js';
import { CLASSIFICATIONS } from './classifications.js';
import { buildSnapshot } from './snapshot.js';
import { catalogueFor, STATUS_WORD, byItem, byControl, hazardsOf, perHazard } from './catalogue.js';
import { STARTERS } from './starters.js';
import { live } from '../core/data.js';
import { formatRating, likelihoodText, consequenceText } from '../core/matrix.js';
import { RECEPTORS, RECEPTOR_WORD, stageKey } from '../core/receptors.js';
import { toIsoUtc, aestDate } from '../core/time.js';
import { imageInfo, imagePath, MAX_IMAGE_BYTES, tooManyPixels } from '../../DocGen/doc-images.js';
import { newId } from '../core/ids.js';

/** The parts of the design every report shares: Styles, templates and Standard Images. */
export const LIBRARY_KEYS = Object.freeze(['formats', 'sectionTemplates', 'reportTemplates', 'standardImages']);
const STAGE_LABEL = /** @type {Record<string, string>} */ ({ 'in-progress': 'In-Progress', 'for-review': 'For Review' });
/** @param {Record<string, any>} d */
const libraryOf = (d) => Object.fromEntries(LIBRARY_KEYS.filter((k) => d?.[k] !== undefined).map((k) => [k, structuredClone(d[k])]));
/** @param {Record<string, any>} d */
export const arrangementOf = (d) => Object.fromEntries(Object.entries(structuredClone(d ?? {})).filter(([k]) => !LIBRARY_KEYS.includes(k)));

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
 * A snapshot with its hazards, controls and references numbered from 1 for this document (each
 * that the Style's Register Numbering does not keep on the register's numbers), so a document
 * delivered outside the house carries its own list. With no Style's numbering given, as it is.
 * Order is kept: hazards as the snapshot lists them, controls and references in their register
 * order. Every place one is named follows: a safety report's ID, the Supports column.
 * @param {Snapshot} s @param {{ registerHazards?: boolean, registerControls?: boolean, registerReferences?: boolean } | null | undefined} numbering
 * @returns {Snapshot}
 */
export function renumbered(s, numbering) {
  if (!numbering) return s;
  const n = { hazards: !numbering.registerHazards, controls: !numbering.registerControls, references: !numbering.registerReferences };
  if (!n.hazards && !n.controls && !n.references) return s;
  const pad = (/** @type {number} */ k) => String(k).padStart(3, '0');
  /** Old number → new, counting within each prefix (C-, EC-, …). @param {string[]} ids */
  const mapOf = (ids) => {
    /** @type {Map<string, string>} */
    const out = new Map();
    /** @type {Record<string, number>} */
    const count = {};
    for (const id of ids) {
      if (!id || out.has(id)) continue;
      const prefix = (/^([A-Za-z]+-)\d/.exec(id) ?? [])[1] ?? '';
      count[prefix] = (count[prefix] ?? 0) + 1;
      out.set(id, prefix + pad(count[prefix]));
    }
    return out;
  };
  const byNumber = (/** @type {string[]} */ ids) => [...new Set(ids)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const hz = n.hazards ? mapOf(s.rows.map((r) => r.reportId)) : new Map();
  const ct = n.controls ? mapOf(byNumber(s.rows.flatMap((r) => r.controls.map((c) => c.number)))) : new Map();
  const rf = n.references ? mapOf((s.references ?? []).map((r) => r.number)) : new Map();
  const any = (/** @type {string} */ id) => hz.get(id) ?? ct.get(id) ?? rf.get(id) ?? id;
  const swap = (/** @type {string} */ text) => String(text ?? '').replace(/\b[A-Za-z]+-\d+\b/g, any);
  return {
    ...s,
    rows: s.rows.map((r) => ({
      ...r,
      reportId: hz.get(r.reportId) ?? r.reportId,
      controls: r.controls.map((c) => ({ ...c, number: ct.get(c.number) ?? c.number })),
      safetyReports: (r.safetyReports ?? []).map((x) => ({ ...x, number: String(x.number ?? '').replace(/^[A-Za-z]+-\d+/, (m) => hz.get(m) ?? m) })),
    })),
    references: (s.references ?? []).map((r) => ({ ...r, number: rf.get(r.number) ?? r.number, supports: swap(r.supports) })),
  };
}

/**
 * The report's tables, declared for DocGen. Unbound (no snapshot) they have no rows, which is
 * all the designer needs to draw a section it is not generating.
 * @param {Snapshot | null} s
 */
function sectionsFor(s) {
  /** @param {(s: Snapshot) => any[]} f */
  const rows = (f) => () => (s ? f(s) : []);
  const hazardKey = { id: '_key', label: 'Hazard', w: 3, get: (/** @type {any} */ r) => r.reportId };
  return [
    {
      id: 'hazards', label: 'Hazards',
      keyColumn: { id: '_key', label: 'ID', w: 3, get: (/** @type {any} */ r) => r.reportId },
      columns: [
        { id: 'title', label: 'Hazard', w: 6, get: (/** @type {any} */ r) => r.title },
        // A risk column per stage and receptor; the personnel ones fall back to reports produced before assessments.
        ...['initial', 'residual'].flatMap((stage) => RECEPTORS.map((receptor) => ({
          id: stageKey(stage, receptor), label: `${stage === 'initial' ? 'Initial' : 'Residual'} risk (${receptor})`, w: 3,
          get: (/** @type {any} */ r) => formatRating(r.ratings?.[stageKey(stage, receptor)] ?? (receptor === 'personnel' ? r[stage] : null) ?? null),
        }))),
        { id: 'phases', label: 'Lifecycle phases', w: 4, optional: true, get: (/** @type {any} */ r) => (r.phases ?? []).join(', ') },
        { id: 'description', label: 'Description', w: 6, optional: true, get: (/** @type {any} */ r) => r.description },
      ],
      rows: rows((x) => x.rows),
    },
    {
      // One row per control, its ID first; what is recorded per hazard is shown once when
      // every hazard agrees, else one line per hazard.
      id: 'controls', label: 'Controls',
      keyColumn: { id: '_key', label: 'ID', w: 2, get: (/** @type {any} */ r) => r.number ?? '' },
      columns: [
        { id: 'control', label: 'Control measure', w: 4, get: (/** @type {any} */ r) => r.title },
        { id: 'hazards', label: 'Hazards', w: 3, get: (/** @type {any} */ r) => hazardsOf(r) },
        { id: 'tier', label: 'Tier', w: 3, optional: true, get: (/** @type {any} */ r) => r.tier ?? '' },
        { id: 'description', label: 'Description', w: 5, optional: true, get: (/** @type {any} */ r) => r.description ?? '' },
        { id: 'kind', label: 'Kind', w: 2, get: (/** @type {any} */ r) => perHazard(r, (c) => c.kind) },
        { id: 'recommendation', label: 'Recommendation', w: 5, get: (/** @type {any} */ r) => perHazard(r, (c) => c.recommendation ?? '') },
        { id: 'justification', label: 'Justification', w: 5, get: (/** @type {any} */ r) => perHazard(r, (c) => c.justification ?? '') },
        { id: 'state', label: 'Status', w: 2, get: (/** @type {any} */ r) => perHazard(r, (c) => STATUS_WORD[/** @type {keyof typeof STATUS_WORD} */ (c.state)] ?? c.state) },
        { id: 'reason', label: 'Reason rejected', w: 4, optional: true, get: (/** @type {any} */ r) => perHazard(r, (c) => c.reason ?? '') },
        { id: 'owner', label: 'Implemented by', w: 3, optional: true, defaultOff: true, get: (/** @type {any} */ r) => r.implementedBy ?? '' },
      ],
      rows: rows((x) => byControl(x.rows.flatMap((h) => h.controls.map((c) => ({ reportId: h.reportId, ...c }))))),
    },
    {
      // The controls implemented on the platform, one row each. Kept as 'existing', so designs
      // made when these were the existing controls still find it.
      id: 'existing', label: 'Implemented controls',
      keyColumn: { id: '_key', label: 'ID', w: 2, get: (/** @type {any} */ r) => r.number ?? '' },
      columns: [
        { id: 'control', label: 'Control', w: 5, get: (/** @type {any} */ r) => r.title },
        { id: 'hazards', label: 'Hazards', w: 3, get: (/** @type {any} */ r) => hazardsOf(r) },
        { id: 'tier', label: 'Tier', w: 3, get: (/** @type {any} */ r) => r.tier || 'Not set' },
        { id: 'description', label: 'Description', w: 5, optional: true, get: (/** @type {any} */ r) => r.description },
        { id: 'kind', label: 'Kind', w: 2, get: (/** @type {any} */ r) => perHazard(r, (c) => c.kind) },
        { id: 'owner', label: 'Implemented by', w: 3, optional: true, defaultOff: true, get: (/** @type {any} */ r) => r.implementedBy ?? '' },
      ],
      rows: rows((x) => byControl(x.rows.flatMap((h) => h.controls.filter((c) => c.state === 'implemented').map((c) => ({ reportId: h.reportId, ...c }))))),
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
        { id: 'receptor', label: 'Receptor', w: 2, get: (/** @type {any} */ r) => RECEPTOR_WORD[/** @type {'personnel'} */ (r.receptor)] ?? r.receptor },
        { id: 'likelihood', label: 'Likelihood', w: 2, get: (/** @type {any} */ r) => likelihoodText(r.likelihood) },
        { id: 'likelihoodWhy', label: 'Likelihood justification', w: 5, get: (/** @type {any} */ r) => r.likelihoodWhy },
        { id: 'consequence', label: 'Consequence', w: 2, get: (/** @type {any} */ r) => consequenceText(r.consequence) },
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
    {
      // One row per safety report, its ID first, with every hazard it is about.
      id: 'safetyReports', label: 'Safety reports',
      keyColumn: { id: '_key', label: 'Report ID', w: 2, get: (/** @type {any} */ r) => r.number },
      columns: [
        { id: 'summary', label: 'Summary', w: 5, get: (/** @type {any} */ r) => r.summary },
        { id: 'hazards', label: 'Hazards', w: 3, get: (/** @type {any} */ r) => hazardsOf(r) },
        { id: 'date', label: 'Date', w: 2, get: (/** @type {any} */ r) => r.date ?? '' },
        { id: 'type', label: 'Type', w: 2, get: (/** @type {any} */ r) => r.type },
        { id: 'location', label: 'Location', w: 3, get: (/** @type {any} */ r) => r.location },
        { id: 'parties', label: 'Parties involved', w: 3, get: (/** @type {any} */ r) => r.parties },
        { id: 'description', label: 'Description', w: 5, optional: true, get: (/** @type {any} */ r) => r.description },
      ],
      rows: rows((x) => byItem(x.rows.flatMap((h) => (h.safetyReports ?? []).map((s) => ({ reportId: h.reportId, ...s }))), (s) => s.number)),
    },
  ];
}

/**
 * The files in files/report-images/ that something still uses: an image part in a section, a
 * section template or a report template, or a figure in a produced report (downloaded again later).
 * @param {{ reportDesign?: any, records: { report?: Record<string, any> } }} data
 */
export function imagesInUse(data) {
  /** @type {Set<string>} */
  const used = new Set();
  /** @param {any[] | undefined} parts */
  const visit = (parts) => {
    for (const p of parts ?? []) {
      if (p?.kind === 'image') for (const im of p.images ?? []) if (im && im.source !== 'standard' && im.file) used.add(im.file);
      // A Repeat part's own parts, however deep.
      if (p?.kind === 'repeat') visit(p.parts);
    }
  };
  const d = data.reportDesign ?? {};
  for (const s of d.sections ?? []) visit(s.parts);
  for (const t of d.sectionTemplates ?? []) visit(t.parts);
  for (const t of d.reportTemplates ?? []) for (const s of t.sections ?? []) visit(s.parts);
  const prefix = 'files/report-images/';
  for (const r of Object.values(data.records.report ?? {})) {
    if (r?.status !== 'deleted' && r?.design) for (const s of r.design.sections ?? []) visit(s.parts);
    for (const b of r?.document?.blocks ?? []) {
      if (b.kind === 'figure') for (const im of b.images ?? []) if (im?.src?.startsWith(prefix)) used.add(im.src.slice(prefix.length));
    }
  }
  return used;
}

/**
 * @param {{ getData: () => import('../core/data.js').Data, setDesign: (design: Record<string, any>) => void,
 *   clock: import('../core/time.js').Clock, profileName: (id: string) => string, who?: () => string,
 *   setReportDesign?: (id: string, design: Record<string, any> | undefined, platformId?: string | null) => void,
 *   files?: { read: (path: string) => Promise<Uint8Array | null>, write: (path: string, blob: Blob) => Promise<void>, exists: (path: string) => Promise<boolean>, remove: (path: string) => Promise<void> } }} ctx
 */
export function createDocHost(ctx) {
  /** @type {Snapshot | null} set only while a report is being produced */
  let producing = null;
  /** @param {string} platformId */
  const snapshotFor = (platformId) => (producing && producing.platformId === platformId
    ? producing
    : buildSnapshot(ctx.getData(), platformId, { profileName: ctx.profileName, at: ctx.clock.now(), by: '', title: '', classification: '' }));

  // The shared design is only the library (Styles, templates, Standard Images): a design of its own
  // is a report's, and a report without one is on the Default Report Template, the empty arrangement.
  const host = {
    getState: () => ({ report: libraryOf(ctx.getData().reportDesign) }),
    /** @param {(state: { report?: Record<string, any> }) => void} mutator */
    commit(mutator) {
      const state = { report: libraryOf(ctx.getData().reportDesign) };
      mutator(state);
      ctx.setDesign(libraryOf(state.report ?? {}));
    },
    clock: { nowIso: () => toIsoUtc(ctx.clock.now()) },
    // Who is working: the name a comment is signed with.
    who: () => (ctx.who ? ctx.who() : ''),
    classifications: [...CLASSIFICATIONS],
    subject: {
      noun: 'platform',
      metaLabel: 'About this platform',
      list: () => live(ctx.getData(), 'platform').map((p) => ({ id: p.id, label: p.name })),
      ready: () => true,
      /** @param {string} id */
      meta: (id) => metaRows(snapshotFor(id)),
    },
    /** @param {{ subjectId?: string, numbering?: any } | null} run */
    // `run.numbering` is the Style's Document settings: numbered from 1 for the document when asked.
    sections: (run) => sectionsFor(run && run.subjectId ? renumbered(snapshotFor(run.subjectId), run.numbering) : null),
    /** @param {{ subjectId?: string, numbering?: any } | null} run */
    // The same snapshot as the tables, by field: what the designer's chips and repeats read.
    catalogue: (run) => catalogueFor(run && run.subjectId ? renumbered(snapshotFor(run.subjectId), run.numbering) : null),
    // Report images, kept in the data folder: files/report-images/ and files/standard-images/.
    images: {
      /** @param {'report'|'standard'} source @param {File | { name: string, size: number, arrayBuffer: () => Promise<ArrayBuffer> }} file */
      async store(source, file) {
        if (!ctx.files) throw new Error('Open the data folder first.');
        if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} is ${Math.round(file.size / (1024 * 1024))} MB; an image can be at most 20 MB.`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const info = imageInfo(bytes);
        if (!info) throw new Error('Only PNG and JPEG images can be used');
        const big = tooManyPixels(info, file.name);
        if (big) throw new Error(big);
        let name = '';
        do name = `${newId().replace(/-/g, '').slice(0, 8)}.${info.type === 'png' ? 'png' : 'jpg'}`;
        while (await ctx.files.exists(imagePath(source, name)));
        await ctx.files.write(imagePath(source, name), new Blob([bytes], { type: info.mime }));
        return { file: name, width: info.width, height: info.height };
      },
      /** @param {string} path */
      read: async (path) => (ctx.files ? ctx.files.read(path) : null),
      /** @param {'report'|'standard'} source @param {string} file */
      async remove(source, file) { if (ctx.files) await ctx.files.remove(imagePath(source, file)); },
    },
  };

  /** @type {Map<string, any>} one host per report, so the designer keeps its place */
  const reportHosts = new Map();
  /** A host for one report: its own arrangement laid over the shared library. @param {string} id */
  const hostFor = (id) => {
    if (reportHosts.has(id)) return reportHosts.get(id);
    const rec = () => ctx.getData().records.report[id];
    // A report without a design of its own is on the Default Report Template: the empty arrangement.
    const own = () => { const r = rec(); return r?.design ? structuredClone(r.design) : {}; };
    const h = {
      ...host,
      get heading() { const r = rec(); return { title: r?.title ?? '', tag: STAGE_LABEL[r?.stage === 'in-progress' ? 'in-progress' : 'for-review'] }; },
      getState: () => ({ report: { ...libraryOf(ctx.getData().reportDesign), ...own() } }),
      /** @param {(state: { report?: Record<string, any> }) => void} mutator */
      commit(mutator) {
        const state = { report: { ...libraryOf(ctx.getData().reportDesign), ...own() } };
        mutator(state);
        const next = state.report ?? {};
        const shared = ctx.getData().reportDesign;
        const lib = libraryOf(next);
        if (LIBRARY_KEYS.some((k) => JSON.stringify(shared?.[k]) !== JSON.stringify(lib[k]))) ctx.setDesign({ ...arrangementOf(shared), ...lib });
        ctx.setReportDesign?.(id, arrangementOf(next));
      },
      /** @param {string} platformId */
      rememberSubject(platformId) { ctx.setReportDesign?.(id, undefined, platformId); },
    };
    reportHosts.set(id, h);
    return h;
  };
  /**
   * A new report's design, the Default Report Template (empty) or a report template applied to the library; and
   * the shared library after (a template may bring its Style with it).
   * @param {string} from '' for the Default Report Template (the empty arrangement), else a report template's id
   */
  const newDesign = (from) => {
    const shared = structuredClone(ctx.getData().reportDesign ?? {});
    // A starter PIVOT ships, or one of the user's report templates.
    const t = from ? (STARTERS[/** @type {keyof typeof STARTERS} */ (from)] ? structuredClone(STARTERS[/** @type {keyof typeof STARTERS} */ (from)]) : (shared.reportTemplates ?? []).find((/** @type {any} */ x) => x.id === from)) : null;
    const applied = t ? App.docStore.applyReportTemplate(shared, t, true) : shared;
    return { design: t ? arrangementOf(applied) : {}, library: libraryOf(applied) };
  };

  return {
    host,
    hostFor,
    newDesign,
    /**
     * @param {string} platformId @param {{ at: string, by: string, title: string, reportId?: string }} o
     */
    produce(platformId, { at, by, title, reportId }) {
      const h = reportId ? hostFor(reportId) : host;
      App.docHost.set(h);
      const options = App.docSession.options();
      const snapshot = buildSnapshot(ctx.getData(), platformId, { profileName: ctx.profileName, at, by, title, classification: options.classification || '' });
      producing = snapshot;
      try {
        const o = { ...options, subjectId: platformId };
        const { document, style } = App.docGen.documentFor(h, o, {
          title, date: aestDate(at), platform: snapshot.platformName, classification: snapshot.classification, utc: toIsoUtc(at),
        });
        // The review layer goes with the report only when its HTML export is to show it (never the PDF).
        const design = h.getState().report ?? {}, want = design.htmlReview ?? {};
        const review = {
          ...(want.markup && (design.markup ?? []).length ? { markup: structuredClone(design.markup) } : {}),
          ...(want.comments && (design.comments ?? []).length ? { comments: structuredClone(design.comments) } : {}),
        };
        return { report: { ...snapshot, document, style, ...(Object.keys(review).length ? { review } : {}) }, baseName: reportFileBase(snapshot) };
      } finally {
        producing = null;
      }
    },
  };
}
