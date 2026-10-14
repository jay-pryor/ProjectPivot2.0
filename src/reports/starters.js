/**
 * Report templates PIVOT ships, offered under "Start from" beside the user's own. Once applied
 * the design is the report's, edited like any other; the starter itself never changes.
 */

/** @param {string} coll @param {string} field @param {string} [opts] */
const f = (coll, field, opts = '') => `{{f:${coll}.${field}${opts ? '?' + opts : ''}}}`;

/** One stage's risk, a row per receptor: likelihood, consequence, each with why, and the level. @param {'Initial'|'Residual'} stage @param {string} id */
const riskTable = (stage, id) => ({
  id, kind: 'table', caption: `${stage} risk: ${f('hazard', 'id')}`,
  header: ['Receptor', 'Likelihood', 'Likelihood justification', 'Consequence', 'Consequence justification', 'Risk'],
  rows: [[f('assessment', 'receptor'), f('assessment', 'likelihood'), f('assessment', 'likelihoodWhy'), f('assessment', 'consequence'), f('assessment', 'consequenceWhy'), f('assessment', 'level')]],
  widths: [0.13, 0.1, 0.26, 0.12, 0.26, 0.13],
  repeat: { each: 'assessment', where: { field: 'stage', op: 'is', value: stage } },
});

/**
 * SSRA (by hazard): a section per hazard on the platform — its summary, the references supporting
 * it, its initial risk, a table per control with a rationale written by hand, its residual risk
 * and its SFARP argument. No whole-register tables.
 */
export const SSRA = Object.freeze({
  id: 'starter:ssra',
  name: 'SSRA (by hazard)',
  order: ['toc', 'meta', 'ssra1', 'ssra2'],
  levels: { ssra1: 1, ssra2: 2 },
  registers: [],
  sections: [
    { id: 'ssra1', title: 'Hazard Assessments', parts: [
      { id: 'ssrap1', kind: 'para', text: `This section assesses each of the ${f('platform', 'hazards')} hazards on ${f('platform', 'name')}.` },
    ] },
    { id: 'ssra2', title: `${f('hazard', 'id')} ${f('hazard', 'title')}`, repeat: { each: 'hazard' }, parts: [
      { id: 'ssrap2', kind: 'table', caption: `Hazard summary: ${f('hazard', 'id')}`, header: ['Field', 'Detail'], widths: [0.25, 0.75], rows: [
        ['Title', f('hazard', 'title')],
        ['Description', f('hazard', 'description')],
        ['Causal factors', f('hazard', 'causalFactors', 'list=num')],
        ['Lifecycle phases', f('hazard', 'phases', 'list=comma')],
        ['Safety reports', f('safetyReport', 'description', 'sort=date&list=num')],
      ] },
      { id: 'ssrap3', kind: 'table', caption: `References: ${f('hazard', 'id')}`, header: ['ID', 'Reference', 'Doc number', 'Revision'], widths: [0.15, 0.5, 0.2, 0.15],
        rows: [[f('reference', 'id'), f('reference', 'title'), f('reference', 'docNumber'), f('reference', 'revision')]], repeat: { each: 'reference' } },
      riskTable('Initial', 'ssrap4'),
      { id: 'ssrap5', kind: 'repeat', repeat: { each: 'control' }, parts: [
        { id: 'ssrap6', kind: 'table', caption: `Control ${f('control', 'id')}`, header: ['Field', 'Detail'], widths: [0.25, 0.75], rows: [
          ['Control', `${f('control', 'id')} ${f('control', 'title')}`],
          ['Description', f('control', 'description')],
          ['Rationale', '{{fill:fill1?label=Control%20rationale}}'],
          ['Justification', f('control', 'justification')],
          ['Status', f('control', 'status')],
        ] },
      ] },
      riskTable('Residual', 'ssrap7'),
      { id: 'ssrap8', kind: 'table', caption: `SFARP: ${f('hazard', 'id')}`, header: ['Field', 'Detail'], widths: [0.25, 0.75], rows: [
        ['Justification', f('hazard', 'sfarpJustification')],
        ['Conclusion', f('hazard', 'sfarpConclusion')],
        ['Conditions of validity', f('hazard', 'sfarpConditions')],
      ] },
    ] },
  ],
});

/** The starters, by id. */
export const STARTERS = Object.freeze({ [SSRA.id]: SSRA });
