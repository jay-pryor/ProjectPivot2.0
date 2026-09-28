/**
 * Contract: bowtie, version 1.0. The module's sole import surface (CORE-CON-003). Gives the
 * bow-tie of one hazard on one platform as the registry holds it, read through `registry`'s
 * contract on every call (DEC-028), and draws it as one self-contained SVG document. Nothing is
 * stored: both operations are pure and hold nothing between calls (C-003, REQ-059). Clause IDs
 * (C-nnn) are defined in CONTRACT.md beside this file and cited by the conformance suite.
 *
 * Every rejection `bowtieFor` passes on from `registry` is `registry`'s own error class,
 * unchanged, and so are the three it signals itself for a hazard that is unknown, not live, or
 * not on the platform; `HazardOmittedError` and `InvalidBowtieError` are this module's.
 *
 * Every operation delegates to the selected implementation: `src/bowtie.js` in production,
 * `null_double.js` when `BOWTIE_IMPL=null` is set in the environment (CORE-TST-002, rung 1). The
 * null double is test-only and never embedded in the built pivot.html, which is why its
 * specifier is held in a variable: the build inlines only quoted import specifiers.
 */

/** @typedef {import('../../baseline/types.js').HazardId} HazardId */
/** @typedef {import('../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../baseline/types.js').PlatformReportId} PlatformReportId */
/** @typedef {import('../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../registry/contract.js').Hazard} Hazard */
/** @typedef {import('../registry/contract.js').Platform} Platform */
/** @typedef {import('../registry/contract.js').CausalFactor} CausalFactor */
/** @typedef {import('../registry/contract.js').Consequence} Consequence */
/** @typedef {import('../registry/contract.js').PlatformControl} PlatformControl */
/** @typedef {import('../registry/contract.js').OmissionReason} OmissionReason */

// ------------------------------------------------------------------ data shapes

/**
 * One hazard on one platform, as the registry holds it (C-001). Every element is the registry's
 * own value: the lists are `getHazardDetail`'s causal factors and consequences and the row's
 * controls split by `controlKind`, each in the registry's order. Frozen; treat it as read-only.
 * @typedef {object} Bowtie
 * @property {Platform} platform
 * @property {Hazard} hazard
 * @property {PlatformReportId} reportId the hazard's ID in this platform's reports
 * @property {readonly CausalFactor[]} causalFactors
 * @property {readonly Consequence[]} consequences
 * @property {readonly PlatformControl[]} preventativeControls each with `controlKind: 'preventative'`
 * @property {readonly PlatformControl[]} mitigatingControls each with `controlKind: 'mitigating'`
 */

/**
 * One SVG document drawing one `Bowtie` (C-004 to C-010). Its coordinates are SVG user units of
 * its own `viewBox` and never cross this boundary as numbers.
 * @typedef {string} BowtieSvgText
 */

/**
 * What a node of the drawing is, as its `data-bowtie-node` attribute says (C-004), listed in the
 * drawing's left-to-right order (C-007).
 * @typedef {'causal-factor' | 'preventative-control' | 'hazard' | 'mitigating-control' | 'consequence'} BowtieNodeKind
 */

// ------------------------------------------------------------------ error conditions

/**
 * C-002: the hazard is linked to the platform and live, but `registry.listPlatformHazards` names
 * it as omitted, so a complete bow-tie cannot be read. Carries what the registry gave, so the
 * record that stopped it can be named. Nothing is drawn in part.
 */
export class HazardOmittedError extends Error {
  /**
   * @param {HazardId} hazardId
   * @param {OmissionReason} reason
   * @param {string} key the key of the record that stopped it
   * @param {string} detail registry's sentence naming the field
   */
  constructor(hazardId, reason, key, detail) {
    super(`hazard ${String(hazardId)} cannot be drawn on this platform: ${detail}`);
    this.name = 'HazardOmittedError';
    this.hazardId = hazardId;
    this.reason = reason;
    this.key = key;
    this.detail = detail;
  }
}

/**
 * C-011: `renderBowtieSvg` given a value that is not a `Bowtie`. `field` names the first failing
 * field, a list's entry by its index (`preventativeControls[2].state`). Nothing is drawn.
 */
export class InvalidBowtieError extends Error {
  /** @param {string} field */
  constructor(field) {
    super(`not a bow-tie: ${field}`);
    this.name = 'InvalidBowtieError';
    this.field = field;
  }
}

// ------------------------------------------------------------------ operations

/**
 * The bow-tie of this hazard on this platform, read from the body through
 * `registry.getHazardDetail` and `registry.listPlatformHazards` and nothing else (C-001, C-003).
 * Rejects rather than resolving with part of one (C-002); the order of rejections is section 4's.
 * @param {DataBody} body the working body; left unchanged
 * @param {HazardId} hazardId
 * @param {PlatformId} platformId
 * @returns {Promise<Bowtie>}
 */
export async function bowtieFor(body, hazardId, platformId) {
  return (await impl()).bowtieFor(body, hazardId, platformId);
}

/**
 * The SVG document drawing this bow-tie: one marked node per thing (C-004), each text whole
 * (C-005), each control's state in words (C-006), laid out by side and order (C-007), no relation
 * the registry does not store (C-008), self-contained (C-009), and identical for equal arguments
 * (C-010). Refuses a value that is not a `Bowtie` (C-011).
 * @param {Bowtie} bowtie
 * @returns {Promise<BowtieSvgText>}
 */
export async function renderBowtieSvg(bowtie) {
  return (await impl()).renderBowtieSvg(bowtie);
}

// ------------------------------------------------------------------ implementation selection

/**
 * @typedef {object} BowtieImplementation
 * @property {(body: DataBody, hazardId: HazardId, platformId: PlatformId) => Promise<Bowtie>} bowtieFor
 * @property {(bowtie: Bowtie) => Promise<BowtieSvgText>} renderBowtieSvg
 */

/** @type {Promise<BowtieImplementation> | null} */
let selected = null;

/** @returns {Promise<BowtieImplementation>} */
function impl() {
  if (selected === null) {
    const env = /** @type {{ process?: { env?: Record<string, string | undefined> } }} */ (globalThis).process?.env;
    if (env?.BOWTIE_IMPL === 'null') {
      const nullDouble = './null_double.js'; // test-only; not a runtime source, so never inlined by the build
      selected = import(nullDouble);
    } else {
      selected = import('./src/bowtie.js');
    }
  }
  return selected;
}
