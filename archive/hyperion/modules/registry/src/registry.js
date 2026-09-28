/**
 * registry, implementing contract version 5.0 (modules/registry/CONTRACT.md). Selected by
 * contract.js unless REGISTRY_IMPL=null. Clause IDs (C-nnn) cite the contract.
 *
 * Every operation is a function of the body passed in and, for the ones that change it, of the
 * baseline clock and `change-log.recordChange` (C-007). The body is never modified: a changing
 * operation builds a new body whose touched collections are new objects holding every entry the
 * input held plus the ones its clause names, and every other collection is the input's, carried
 * through by reference and never read (C-003). Every operation first reads, whole, each owned
 * collection it depends on and refuses a malformed entry, so nothing is listed or changed over a
 * record this module cannot read (C-008) — except `listPlatformHazards`, which names a hazard in
 * `omitted` when a control, justification, or rating its row would carry is malformed (C-019).
 *
 * The checks of a changing operation run in section 4's order: malformed record, profile, act,
 * unknown record, record not live, link precondition, field value, no change, and last whatever
 * `recordChange` rejects with.
 */

import { nowAest } from '../../../baseline/clock.js';
import {
  causalFactorId, consequenceId, controlId, hazardId, justificationId, linkId, platformId, platformReportId, ratingId,
  timestampAest, userProfileId, CONSEQUENCE_LEVELS, LIKELIHOOD_LETTERS,
} from '../../../baseline/types.js';
import { recordChange } from '../../change-log/contract.js';
import {
  AlreadyExcludedError, ControlNotLiveError, ControlNotOnHazardError, DuplicateLinkError, HazardNotLiveError, HazardNotOnPlatformError,
  HazardOnPlatformsError, HazardSequenceError, InvalidActError, InvalidCausalFactorTextError, InvalidConsequenceTextError,
  InvalidControlKindError, InvalidControlTitleError, InvalidHazardTitleError, InvalidJustificationTextError, InvalidOwnerError,
  InvalidPlatformNameError, InvalidPlatformReportIdError, InvalidRatingStageError, InvalidRatingValueError, MalformedCausalFactorError,
  MalformedConsequenceError, MalformedControlError, MalformedHazardError, MalformedJustificationError, MalformedLinkError,
  MalformedPlatformError, MalformedRatingError, MissingProfileError, NoChangeError, PlatformNotLiveError, UnknownControlError,
  UnknownHazardError, UnknownPlatformError, UnownedRecordKindError,
} from '../contract.js';

/** @typedef {import('../contract.js').RegistryImplementation} Impl */
/** @typedef {import('../contract.js').Act} Act */
/** @typedef {import('../contract.js').Hazard} Hazard */
/** @typedef {import('../contract.js').Control} Control */
/** @typedef {import('../contract.js').Platform} Platform */
/** @typedef {import('../contract.js').CausalFactor} CausalFactor */
/** @typedef {import('../contract.js').Consequence} Consequence */
/** @typedef {import('../contract.js').Justification} Justification */
/** @typedef {import('../contract.js').Rating} Rating */
/** @typedef {import('../contract.js').Link} Link */
/** @typedef {import('../contract.js').HazardPlatformLink} HazardPlatformLink */
/** @typedef {import('../contract.js').HazardControlLink} HazardControlLink */
/** @typedef {import('../contract.js').ControlPlatformLink} ControlPlatformLink */
/** @typedef {import('../contract.js').HazardControl} HazardControl */
/** @typedef {import('../contract.js').PlatformControl} PlatformControl */
/** @typedef {import('../contract.js').PlatformHazardRow} PlatformHazardRow */
/** @typedef {import('../contract.js').OmittedHazard} OmittedHazard */
/** @typedef {import('../contract.js').RatingValues} RatingValues */
/** @typedef {import('../../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../../baseline/types.js').HazardId} HazardId */
/** @typedef {import('../../../baseline/types.js').LinkId} LinkId */
/** @typedef {import('../../../baseline/types.js').JustificationId} JustificationId */
/** @typedef {import('../../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../../baseline/types.js').RecordKind} RecordKind */
/** @typedef {import('../../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../../baseline/schema.js').StoredRecord} StoredRecord */
/** @typedef {import('../../change-log/contract.js').RecordBeforeAfter} RecordBeforeAfter */
/** @typedef {{ id: string, createdAtAest: string, [field: string]: any }} Row a stored record once C-008 has accepted it */
/** @typedef {Record<string, Row>} Rows a collection once C-008 has accepted every entry */

const STATUSES = Object.freeze(['live', 'retired', 'deleted']);
const CONTROL_KINDS = Object.freeze(['preventative', 'mitigating']);
const STAGES = Object.freeze(['initial', 'residual']);
const HEADER_FIELDS = Object.freeze(['id', 'kind', 'status', 'createdBy', 'createdAtAest', 'updatedBy', 'updatedAtAest']);

/** The fields each link shape carries beyond the header, and nothing else (C-008, DEC-013). */
const LINK_FIELDS = Object.freeze({
  'hazard-platform': ['linkKind', 'hazardId', 'platformId', 'reportId'],
  'hazard-control': ['linkKind', 'hazardId', 'controlId', 'controlKind'],
  'control-platform': ['linkKind', 'hazardId', 'controlId', 'platformId'],
});

// ------------------------------------------------------------------ value checks

/**
 * @param {unknown} v
 * @returns {v is Record<string, any>}
 */
function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * @param {object} o
 * @param {string} key
 * @returns {boolean}
 */
function has(o, key) {
  return Object.prototype.hasOwnProperty.call(o, key);
}

/**
 * @param {unknown} v
 * @param {(s: string) => unknown} parse a baseline id or time parser, which throws on a bad value
 * @returns {boolean}
 */
function parses(v, parse) {
  if (typeof v !== 'string') return false;
  try {
    parse(v);
    return true;
  } catch {
    return false;
  }
}

/** @param {unknown} v */
const isHazardId = (v) => parses(v, hazardId.parse);
/** @param {unknown} v */
const isControlId = (v) => parses(v, controlId.parse);
/** @param {unknown} v */
const isPlatformId = (v) => parses(v, platformId.parse);
/** @param {unknown} v */
const isProfileId = (v) => parses(v, userProfileId.parse);
/** @param {unknown} v */
const isTimestamp = (v) => parses(v, timestampAest);
/** @param {unknown} v */
const isReportId = (v) => parses(v, platformReportId);
/** @param {unknown} v */
const isConsequenceValue = (v) => v === null || (typeof v === 'number' && CONSEQUENCE_LEVELS.includes(v));
/** @param {unknown} v */
const isLikelihoodValue = (v) => v === null || (typeof v === 'string' && LIKELIHOOD_LETTERS.includes(v));

/**
 * @param {unknown} v
 * @returns {string | null} the text trimmed, or null when it is not a string with a character that is not a space
 */
function trimmed(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/**
 * @param {string} id a HazardId
 * @returns {number} the number in it (C-006)
 */
function hazardNumber(id) {
  return Number(id.slice(2));
}

/**
 * @param {{ createdAtAest: string, id: string }} a
 * @param {{ createdAtAest: string, id: string }} b
 * @returns {number} ascending `createdAtAest`, then id
 */
function byTimeThenId(a, b) {
  if (a.createdAtAest !== b.createdAtAest) return a.createdAtAest < b.createdAtAest ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * @param {{ id: string }} a
 * @param {{ id: string }} b
 * @returns {number} ascending number in a global hazard ID
 */
function byNumber(a, b) {
  return hazardNumber(a.id) - hazardNumber(b.id);
}

/**
 * @param {string} a
 * @param {string} b
 */
function asStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ------------------------------------------------------------------ what a record of each kind is (C-008)

/**
 * The kind's own fields, after the header has been accepted.
 * @type {Record<string, (row: Record<string, any>) => string | null>}
 */
const OWN_FIELDS = {
  hazard: (r) => (typeof r.title === 'string' ? null : 'its title is not a string'),
  control: (r) => (typeof r.title === 'string' ? null : 'its title is not a string'),
  platform: (r) => {
    if (typeof r.name !== 'string') return 'its name is not a string';
    if (!isProfileId(r.ownerProfileId)) return 'its ownerProfileId is not a user profile id';
    return null;
  },
  'causal-factor': (r) => {
    if (!isHazardId(r.hazardId)) return 'its hazardId is not a hazard id';
    return typeof r.text === 'string' ? null : 'its text is not a string';
  },
  consequence: (r) => {
    if (!isHazardId(r.hazardId)) return 'its hazardId is not a hazard id';
    return typeof r.text === 'string' ? null : 'its text is not a string';
  },
  justification: (r) => {
    if (!isHazardId(r.hazardId)) return 'its hazardId is not a hazard id';
    if (!isControlId(r.controlId)) return 'its controlId is not a control id';
    if (!isPlatformId(r.platformId)) return 'its platformId is not a platform id';
    return typeof r.text === 'string' ? null : 'its text is not a string';
  },
  rating: (r) => {
    if (!isHazardId(r.hazardId)) return 'its hazardId is not a hazard id';
    if (!isPlatformId(r.platformId)) return 'its platformId is not a platform id';
    if (!STAGES.includes(r.stage)) return 'its stage is neither initial nor residual';
    if (!has(r, 'consequence') || !isConsequenceValue(r.consequence)) return 'its consequence is neither null nor a whole number 1 to 5';
    if (!has(r, 'likelihood') || !isLikelihoodValue(r.likelihood)) return 'its likelihood is neither null nor a letter A to G';
    return null;
  },
  link: (r) => {
    if (!has(LINK_FIELDS, r.linkKind)) return 'its linkKind is not one of hazard-platform, hazard-control, control-platform';
    const fields = /** @type {readonly string[]} */ (LINK_FIELDS[/** @type {keyof typeof LINK_FIELDS} */ (r.linkKind)]);
    const extra = Object.keys(r).find((k) => !HEADER_FIELDS.includes(k) && !fields.includes(k));
    if (extra !== undefined) return `a ${r.linkKind} link carries no ${extra}`;
    if (!isHazardId(r.hazardId)) return 'its hazardId is not a hazard id';
    if (fields.includes('controlId') && !isControlId(r.controlId)) return 'its controlId is not a control id';
    if (fields.includes('platformId') && !isPlatformId(r.platformId)) return 'its platformId is not a platform id';
    if (fields.includes('reportId') && !isReportId(r.reportId)) return 'its reportId is not a platform report id';
    if (fields.includes('controlKind') && !CONTROL_KINDS.includes(r.controlKind)) return 'its controlKind is neither preventative nor mitigating';
    return null;
  },
};

/** @type {Record<string, (s: string) => unknown>} */
const ID_PARSERS = {
  hazard: hazardId.parse,
  control: controlId.parse,
  platform: platformId.parse,
  'causal-factor': causalFactorId.parse,
  consequence: consequenceId.parse,
  justification: justificationId.parse,
  rating: ratingId.parse,
  link: linkId.parse,
};

/** @type {Record<string, new (key: string, detail: string) => Error>} */
const MALFORMED = {
  hazard: MalformedHazardError,
  control: MalformedControlError,
  platform: MalformedPlatformError,
  'causal-factor': MalformedCausalFactorError,
  consequence: MalformedConsequenceError,
  justification: MalformedJustificationError,
  rating: MalformedRatingError,
  link: MalformedLinkError,
};

/** The record kinds whose collections this module owns (section 3). */
const OWNED = Object.freeze(Object.keys(ID_PARSERS));

/**
 * @param {string} kind an owned kind
 * @param {string} key the entry's key
 * @param {unknown} entry
 * @returns {string | null} one sentence naming the field, or null when the entry is a record of the kind
 */
function malformation(kind, key, entry) {
  if (!isObject(entry)) return 'the entry is not an object';
  if (!parses(entry.id, ID_PARSERS[kind])) return `its id is not a ${kind} id`;
  if (entry.id !== key) return 'its key differs from its id';
  if (entry.kind !== kind) return `its kind is not ${kind}`;
  if (!STATUSES.includes(entry.status)) return 'its status is not a record status';
  if (!isProfileId(entry.createdBy)) return 'createdBy is not a user profile id';
  if (!isProfileId(entry.updatedBy)) return 'updatedBy is not a user profile id';
  if (!isTimestamp(entry.createdAtAest)) return 'createdAtAest is not an AEST timestamp';
  if (!isTimestamp(entry.updatedAtAest)) return 'updatedAtAest is not an AEST timestamp';
  return OWN_FIELDS[kind](entry);
}

/**
 * The raw collection of a kind: an object, or empty when the body has none (C-006).
 * @param {DataBody} body
 * @param {string} kind an owned kind
 * @returns {Record<string, unknown>}
 */
function rawCollection(body, kind) {
  const collection = /** @type {unknown} */ (/** @type {Record<string, unknown>} */ (body.collections)[kind]);
  if (collection === undefined) return {};
  if (!isObject(collection)) throw new MALFORMED[kind](kind, `the ${kind} collection is not a keyed collection of records`);
  return collection;
}

/**
 * Every entry of an owned collection, checked. Rejects the first malformed entry with that
 * kind's error naming its key (C-008).
 * @param {DataBody} body
 * @param {string} kind an owned kind
 * @returns {Rows}
 */
function read(body, kind) {
  const collection = rawCollection(body, kind);
  for (const [key, entry] of Object.entries(collection)) {
    const why = malformation(kind, key, entry);
    if (why !== null) throw new MALFORMED[kind](key, why);
  }
  return /** @type {Rows} */ (collection);
}

/**
 * @param {Rows} rows
 * @param {string} id
 * @returns {Row | undefined}
 */
function entry(rows, id) {
  return typeof id === 'string' && has(rows, id) ? rows[id] : undefined;
}

// ------------------------------------------------------------------ the act (section 4's second and third conditions)

/**
 * @param {unknown} act
 * @param {Rows} platforms
 * @returns {Act}
 */
function requireAct(act, platforms) {
  if (!isObject(act) || !isObject(act.profile) || !isProfileId(act.profile.id)) throw new MissingProfileError();
  if (!has(act, 'madeForPlatformId')) throw new InvalidActError(undefined);
  const madeFor = act.madeForPlatformId;
  if (madeFor !== null && !isPlatformId(madeFor)) throw new InvalidActError(madeFor);
  if (madeFor !== null && entry(platforms, madeFor) === undefined) throw new UnknownPlatformError(madeFor);
  return /** @type {Act} */ (act);
}

// ------------------------------------------------------------------ writing

/**
 * @template T
 * @param {{ fresh: () => T }} kind
 * @param {Rows} rows the collection the id must be fresh in
 * @returns {T}
 */
function freshId(kind, rows) {
  let id = kind.fresh();
  while (has(rows, /** @type {string} */ (id))) id = kind.fresh();
  return id;
}

/**
 * A new record's header, stamped with the act's profile and now (DEC-005).
 * @param {string} kind
 * @param {string} id
 * @param {Act} act
 * @param {TimestampAest} at
 */
function header(kind, id, act, at) {
  const by = act.profile.id;
  return { id, kind, status: 'live', createdBy: by, createdAtAest: at, updatedBy: by, updatedAtAest: at };
}

/**
 * A stored record with its last-writer fields restamped and `changes` applied.
 * @param {Row} row
 * @param {Act} act
 * @param {TimestampAest} at
 * @param {Record<string, unknown>} changes
 * @returns {Row}
 */
function restamped(row, act, at, changes) {
  return { ...row, ...changes, updatedBy: act.profile.id, updatedAtAest: at };
}

/**
 * The body with the given records put in their collections and nothing else changed (C-003).
 * @param {DataBody} body
 * @param {readonly Row[]} records
 * @returns {DataBody}
 */
function withRecords(body, records) {
  /** @type {Record<string, any>} */
  const collections = { ...body.collections };
  for (const r of records) {
    const existing = /** @type {Record<string, unknown> | undefined} */ (collections[r.kind]);
    collections[r.kind] = { ...existing, [r.id]: r };
  }
  return { ...body, collections };
}

/**
 * Append the act's entry to `b` through `change-log` (C-023), the platforms each record reaches
 * derived from `b` itself (C-024). Rejects with whatever `recordChange` rejects with.
 * @param {DataBody} b the body with the act's records in it
 * @param {Act} act
 * @param {readonly { before: Row | null, after: Row }[]} records in C-023's order
 * @returns {Promise<DataBody>}
 */
async function recorded(b, act, records) {
  const affected = new Set();
  for (const { after } of records) for (const p of reach(b, { kind: after.kind, id: after.id })) affected.add(p);
  const { body } = await recordChange(b, act.profile, {
    records: /** @type {readonly RecordBeforeAfter[]} */ (/** @type {unknown} */ (records)),
    madeForPlatformId: act.madeForPlatformId,
    affectedPlatformIds: /** @type {PlatformId[]} */ ([...affected].sort(asStrings)),
  });
  return body;
}

// ------------------------------------------------------------------ what a change reaches (C-024)

/**
 * The platforms a change to `ref` reaches, over collections already accepted by C-008: every
 * caller has read `link` and `platform`, and the collection of `ref.kind` where it is consulted.
 * @param {DataBody} body
 * @param {RecordRef} ref of an owned kind
 * @returns {PlatformId[]} distinct, ascending as strings
 */
function reach(body, ref) {
  const links = /** @type {Row[]} */ (Object.values(rawCollection(body, 'link'))).filter((l) => l.status === 'live');
  const platforms = /** @type {Rows} */ (rawCollection(body, 'platform'));
  const ofHazard = (/** @type {string} */ h) => links.filter((l) => l.linkKind === 'hazard-platform' && l.hazardId === h).map((l) => l.platformId);
  const named = (/** @type {string} */ p) => (entry(platforms, p) !== undefined ? [p] : []);
  const record = ref.kind === 'hazard' || ref.kind === 'control' || ref.kind === 'platform'
    ? undefined
    : entry(/** @type {Rows} */ (rawCollection(body, ref.kind)), ref.id);
  /** @type {string[]} */
  let out;
  switch (ref.kind) {
    case 'hazard': out = ofHazard(ref.id); break;
    case 'control': out = links.filter((l) => l.linkKind === 'hazard-control' && l.controlId === ref.id).flatMap((l) => ofHazard(l.hazardId)); break;
    case 'platform': out = named(ref.id); break;
    case 'causal-factor': case 'consequence': out = record ? ofHazard(record.hazardId) : []; break;
    case 'justification': case 'rating': out = record ? named(record.platformId) : []; break;
    case 'link':
      if (!record) out = [];
      else if (record.linkKind === 'hazard-control') out = ofHazard(record.hazardId);
      else out = named(record.platformId);
      break;
    default: throw new UnownedRecordKindError(ref.kind);
  }
  return /** @type {PlatformId[]} */ ([...new Set(out)].sort(asStrings));
}

// ------------------------------------------------------------------ lookups over accepted collections

/**
 * @param {Rows} links
 * @param {(l: Row) => boolean} match
 * @returns {Row | undefined} the live link that matches
 */
function liveLink(links, match) {
  return Object.values(links).find((l) => l.status === 'live' && match(l));
}

/**
 * @param {Rows} links
 * @param {string} hazard
 * @param {string} platform
 */
function hazardPlatformLink(links, hazard, platform) {
  return liveLink(links, (l) => l.linkKind === 'hazard-platform' && l.hazardId === hazard && l.platformId === platform);
}

/**
 * @param {Rows} links
 * @param {string} hazard
 * @param {string} control
 */
function hazardControlLink(links, hazard, control) {
  return liveLink(links, (l) => l.linkKind === 'hazard-control' && l.hazardId === hazard && l.controlId === control);
}

/**
 * @param {Rows} links
 * @param {{ hazardId: string, controlId: string, platformId: string }} t
 */
function controlPlatformLink(links, t) {
  return liveLink(links, (l) => l.linkKind === 'control-platform' && l.hazardId === t.hazardId && l.controlId === t.controlId && l.platformId === t.platformId);
}

/**
 * @param {Rows} justifications
 * @param {{ hazardId: string, controlId: string, platformId: string }} t
 * @returns {Row | undefined}
 */
function liveJustification(justifications, t) {
  return Object.values(justifications).find((j) => j.status === 'live' && j.hazardId === t.hazardId && j.controlId === t.controlId && j.platformId === t.platformId);
}

/**
 * The hazard's live `hazard-control` links in C-012's order: the link's `createdAtAest`, then the control's id.
 * @param {Rows} links
 * @param {string} hazard
 * @returns {Row[]}
 */
function controlLinksOf(links, hazard) {
  return Object.values(links)
    .filter((l) => l.status === 'live' && l.linkKind === 'hazard-control' && l.hazardId === hazard)
    .sort((a, b) => (a.createdAtAest !== b.createdAtAest ? (a.createdAtAest < b.createdAtAest ? -1 : 1) : asStrings(a.controlId, b.controlId)));
}

/**
 * @param {Rows} rows
 * @param {string} id
 * @param {new (id: any) => Error} Unknown
 * @returns {Row}
 */
function known(rows, id, Unknown) {
  const r = entry(rows, id);
  if (r === undefined) throw new Unknown(id);
  return r;
}

/**
 * @param {Row} r
 * @param {new (id: any, status: any) => Error} NotLive
 */
function requireLive(r, NotLive) {
  if (r.status !== 'live') throw new NotLive(r.id, r.status);
}

// ------------------------------------------------------------------ hazards

/** @type {Impl['createHazard']} */
async function createHazard(body, act, fields) {
  const hazards = read(body, 'hazard');
  const platforms = read(body, 'platform');
  read(body, 'link');
  const a = requireAct(act, platforms);
  const title = trimmed(fields?.title);
  if (title === null) throw new InvalidHazardTitleError(fields?.title);
  const id = hazardId.fromSequence(body.sequences.hazard);
  if (has(hazards, id)) throw new HazardSequenceError(id);

  const hazard = { ...header('hazard', id, a, nowAest()), title };
  const b = withRecords(body, [hazard]);
  const next = { ...b, sequences: { ...b.sequences, hazard: body.sequences.hazard + 1 } };
  return { body: await recorded(next, a, [{ before: null, after: hazard }]), hazard: /** @type {Hazard} */ (hazard) };
}

/** @type {Impl['updateHazard']} */
async function updateHazard(body, act, id, fields) {
  const hazards = read(body, 'hazard');
  const platforms = read(body, 'platform');
  read(body, 'link');
  const a = requireAct(act, platforms);
  const before = known(hazards, id, UnknownHazardError);
  requireLive(before, HazardNotLiveError);
  const title = trimmed(fields?.title);
  if (title === null) throw new InvalidHazardTitleError(fields?.title);
  if (title === before.title) throw new NoChangeError({ kind: 'hazard', id }, 'title');

  const hazard = restamped(before, a, nowAest(), { title });
  const b = withRecords(body, [hazard]);
  return { body: await recorded(b, a, [{ before, after: hazard }]), hazard: /** @type {Hazard} */ (hazard) };
}

/** @type {Impl['listHazards']} */
async function listHazards(body) {
  return /** @type {Hazard[]} */ (Object.values(read(body, 'hazard')).filter((h) => h.status === 'live').sort(byNumber));
}

/** @type {Impl['getHazard']} */
async function getHazard(body, id) {
  return /** @type {Hazard | null} */ (entry(read(body, 'hazard'), id) ?? null);
}

/** @type {Impl['getHazardDetail']} */
async function getHazardDetail(body, id) {
  const hazards = read(body, 'hazard');
  const causalFactors = read(body, 'causal-factor');
  const consequences = read(body, 'consequence');
  const controls = read(body, 'control');
  const links = read(body, 'link');
  const hazard = entry(hazards, id);
  if (hazard === undefined) return null;
  const ofHazard = (/** @type {Rows} */ rows) => Object.values(rows).filter((r) => r.status === 'live' && r.hazardId === id).sort(byTimeThenId);
  return {
    hazard: /** @type {Hazard} */ (hazard),
    causalFactors: /** @type {CausalFactor[]} */ (ofHazard(causalFactors)),
    consequences: /** @type {Consequence[]} */ (ofHazard(consequences)),
    controls: controlLinksOf(links, id).map((l) => {
      const control = entry(controls, l.controlId);
      if (control === undefined) throw new MalformedControlError(l.controlId, `no control entry has the id live link ${l.id} names`);
      return { control: /** @type {Control} */ (control), controlKind: l.controlKind };
    }),
  };
}

/**
 * Delete and retire differ only in the status written and in retire's refusal of a hazard on
 * a platform (C-005, C-025, C-026).
 * @param {DataBody} body
 * @param {Act} act
 * @param {HazardId} id
 * @param {'deleted' | 'retired'} status
 */
async function endHazard(body, act, id, status) {
  const hazards = read(body, 'hazard');
  const platforms = read(body, 'platform');
  const links = read(body, 'link');
  const a = requireAct(act, platforms);
  const before = known(hazards, id, UnknownHazardError);
  requireLive(before, HazardNotLiveError);
  if (status === 'retired') {
    const on = Object.values(links).filter((l) => l.status === 'live' && l.linkKind === 'hazard-platform' && l.hazardId === id).map((l) => l.platformId);
    if (on.length > 0) throw new HazardOnPlatformsError(id, [...new Set(on)].sort(asStrings));
  }

  const hazard = restamped(before, a, nowAest(), { status });
  const b = withRecords(body, [hazard]);
  return { body: await recorded(b, a, [{ before, after: hazard }]), hazard: /** @type {Hazard} */ (hazard) };
}

/** @type {Impl['deleteHazard']} */
async function deleteHazard(body, act, id) {
  return endHazard(body, act, id, 'deleted');
}

/** @type {Impl['retireHazard']} */
async function retireHazard(body, act, id) {
  return endHazard(body, act, id, 'retired');
}

// ------------------------------------------------------------------ causal factors and consequences

/**
 * @param {DataBody} body
 * @param {Act} act
 * @param {HazardId} id
 * @param {{ text: string }} fields
 * @param {'causal-factor' | 'consequence'} kind
 * @param {new (text: any) => Error} Invalid
 * @param {{ fresh: () => any }} ids
 * @returns {Promise<{ body: DataBody, record: Row }>}
 */
async function addToHazard(body, act, id, fields, kind, Invalid, ids) {
  const hazards = read(body, 'hazard');
  const own = read(body, kind);
  const platforms = read(body, 'platform');
  read(body, 'link');
  const a = requireAct(act, platforms);
  known(hazards, id, UnknownHazardError);
  requireLive(hazards[id], HazardNotLiveError);
  const text = trimmed(fields?.text);
  if (text === null) throw new Invalid(fields?.text);

  const record = { ...header(kind, freshId(ids, own), a, nowAest()), hazardId: id, text };
  const b = withRecords(body, [record]);
  return { body: await recorded(b, a, [{ before: null, after: record }]), record };
}

/** @type {Impl['addCausalFactor']} */
async function addCausalFactor(body, act, hazard, fields) {
  const { body: b, record } = await addToHazard(body, act, hazard, fields, 'causal-factor', InvalidCausalFactorTextError, causalFactorId);
  return { body: b, causalFactor: /** @type {CausalFactor} */ (record) };
}

/** @type {Impl['addConsequence']} */
async function addConsequence(body, act, hazard, fields) {
  const { body: b, record } = await addToHazard(body, act, hazard, fields, 'consequence', InvalidConsequenceTextError, consequenceId);
  return { body: b, consequence: /** @type {Consequence} */ (record) };
}

// ------------------------------------------------------------------ the control library

/** @type {Impl['createControl']} */
async function createControl(body, act, fields) {
  const controls = read(body, 'control');
  const platforms = read(body, 'platform');
  read(body, 'link');
  const a = requireAct(act, platforms);
  const title = trimmed(fields?.title);
  if (title === null) throw new InvalidControlTitleError(fields?.title);

  const control = { ...header('control', freshId(controlId, controls), a, nowAest()), title };
  const b = withRecords(body, [control]);
  return { body: await recorded(b, a, [{ before: null, after: control }]), control: /** @type {Control} */ (control) };
}

/** @type {Impl['listControls']} */
async function listControls(body) {
  return /** @type {Control[]} */ (Object.values(read(body, 'control')).filter((c) => c.status === 'live').sort(byTimeThenId));
}

/** @type {Impl['retireControl']} */
async function retireControl(body, act, id) {
  const controls = read(body, 'control');
  const platforms = read(body, 'platform');
  read(body, 'link');
  const a = requireAct(act, platforms);
  const before = known(controls, id, UnknownControlError);
  requireLive(before, ControlNotLiveError);

  const control = restamped(before, a, nowAest(), { status: 'retired' });
  const b = withRecords(body, [control]);
  return { body: await recorded(b, a, [{ before, after: control }]), control: /** @type {Control} */ (control) };
}

/** @type {Impl['linkControlToHazard']} */
async function linkControlToHazard(body, act, fields) {
  const hazards = read(body, 'hazard');
  const controls = read(body, 'control');
  const platforms = read(body, 'platform');
  const links = read(body, 'link');
  const a = requireAct(act, platforms);
  const { hazardId: hid, controlId: cid, controlKind } = fields ?? {};
  const hazard = known(hazards, hid, UnknownHazardError);
  const control = known(controls, cid, UnknownControlError);
  requireLive(hazard, HazardNotLiveError);
  requireLive(control, ControlNotLiveError);
  const existing = hazardControlLink(links, hid, cid);
  if (existing !== undefined) throw new DuplicateLinkError('hazard-control', /** @type {LinkId} */ (existing.id));
  if (!CONTROL_KINDS.includes(controlKind)) throw new InvalidControlKindError(controlKind);

  const link = { ...header('link', freshId(linkId, links), a, nowAest()), linkKind: 'hazard-control', hazardId: hid, controlId: cid, controlKind };
  const b = withRecords(body, [link]);
  return { body: await recorded(b, a, [{ before: null, after: link }]), link: /** @type {Link} */ (link) };
}

// ------------------------------------------------------------------ platforms

/** @type {Impl['createPlatform']} */
async function createPlatform(body, act, fields) {
  const platforms = read(body, 'platform');
  read(body, 'link');
  const a = requireAct(act, platforms);
  const name = trimmed(fields?.name);
  if (name === null) throw new InvalidPlatformNameError(fields?.name);
  const owner = fields?.ownerProfileId;
  if (!isProfileId(owner)) throw new InvalidOwnerError(owner);

  const platform = { ...header('platform', freshId(platformId, platforms), a, nowAest()), name, ownerProfileId: owner };
  const b = withRecords(body, [platform]);
  return { body: await recorded(b, a, [{ before: null, after: platform }]), platform: /** @type {Platform} */ (platform) };
}

/** @type {Impl['listPlatforms']} */
async function listPlatforms(body) {
  return /** @type {Platform[]} */ (Object.values(read(body, 'platform')).filter((p) => p.status === 'live').sort(byTimeThenId));
}

/** @type {Impl['retirePlatform']} */
async function retirePlatform(body, act, id) {
  const platforms = read(body, 'platform');
  read(body, 'link');
  const a = requireAct(act, platforms);
  const before = known(platforms, id, UnknownPlatformError);
  requireLive(before, PlatformNotLiveError);

  const platform = restamped(before, a, nowAest(), { status: 'retired' });
  const b = withRecords(body, [platform]);
  return { body: await recorded(b, a, [{ before, after: platform }]), platform: /** @type {Platform} */ (platform) };
}

/** @type {Impl['setPlatformOwner']} */
async function setPlatformOwner(body, act, fields) {
  const platforms = read(body, 'platform');
  read(body, 'link');
  const a = requireAct(act, platforms);
  const { platformId: pid, ownerProfileId: owner } = fields ?? {};
  const before = known(platforms, pid, UnknownPlatformError);
  requireLive(before, PlatformNotLiveError);
  if (!isProfileId(owner)) throw new InvalidOwnerError(owner);
  if (owner === before.ownerProfileId) throw new NoChangeError({ kind: 'platform', id: pid }, 'ownerProfileId');

  const platform = restamped(before, a, nowAest(), { ownerProfileId: owner });
  const b = withRecords(body, [platform]);
  return { body: await recorded(b, a, [{ before, after: platform }]), platform: /** @type {Platform} */ (platform) };
}

/** @type {Impl['linkHazardToPlatform']} */
async function linkHazardToPlatform(body, act, fields) {
  const hazards = read(body, 'hazard');
  const platforms = read(body, 'platform');
  const links = read(body, 'link');
  const a = requireAct(act, platforms);
  const { hazardId: hid, platformId: pid } = fields ?? {};
  const hazard = known(hazards, hid, UnknownHazardError);
  const platform = known(platforms, pid, UnknownPlatformError);
  requireLive(hazard, HazardNotLiveError);
  requireLive(platform, PlatformNotLiveError);
  const existing = hazardPlatformLink(links, hid, pid);
  if (existing !== undefined) throw new DuplicateLinkError('hazard-platform', /** @type {LinkId} */ (existing.id));

  const link = {
    ...header('link', freshId(linkId, links), a, nowAest()),
    linkKind: 'hazard-platform', hazardId: hid, platformId: pid, reportId: platformReportId(hid),
  };
  const b = withRecords(body, [link]);
  return { body: await recorded(b, a, [{ before: null, after: link }]), link: /** @type {Link} */ (link) };
}

/** @type {Impl['setPlatformReportId']} */
async function setPlatformReportId(body, act, fields) {
  const platforms = read(body, 'platform');
  const links = read(body, 'link');
  const a = requireAct(act, platforms);
  const { hazardId: hid, platformId: pid, reportId } = fields ?? {};
  known(platforms, pid, UnknownPlatformError);
  const before = hazardPlatformLink(links, hid, pid);
  if (before === undefined) throw new HazardNotOnPlatformError(hid, pid);
  if (!isReportId(reportId)) throw new InvalidPlatformReportIdError(reportId);
  if (reportId === before.reportId) throw new NoChangeError({ kind: 'link', id: before.id }, 'reportId');

  const link = restamped(before, a, nowAest(), { reportId });
  const b = withRecords(body, [link]);
  return { body: await recorded(b, a, [{ before, after: link }]), link: /** @type {Link} */ (link) };
}

// ------------------------------------------------------------------ a hazard's controls on a platform

/**
 * The checks confirmation and exclusion share, in section 4's order up to the link preconditions
 * they have in common (C-013, C-020).
 * @param {DataBody} body
 * @param {unknown} act
 * @param {Record<string, any> | undefined} fields
 */
function ruling(body, act, fields) {
  const controls = read(body, 'control');
  const platforms = read(body, 'platform');
  const links = read(body, 'link');
  const justifications = read(body, 'justification');
  const a = requireAct(act, platforms);
  const t = { hazardId: fields?.hazardId, controlId: fields?.controlId, platformId: fields?.platformId };
  known(controls, t.controlId, UnknownControlError);
  known(platforms, t.platformId, UnknownPlatformError);
  if (hazardPlatformLink(links, t.hazardId, t.platformId) === undefined) throw new HazardNotOnPlatformError(t.hazardId, t.platformId);
  if (hazardControlLink(links, t.hazardId, t.controlId) === undefined) throw new ControlNotOnHazardError(t.controlId, t.hazardId);
  return { a, t, links, justifications, confirmed: controlPlatformLink(links, t), excluded: liveJustification(justifications, t) };
}

/** @type {Impl['confirmControlForPlatform']} */
async function confirmControlForPlatform(body, act, fields) {
  const { a, t, links, confirmed, excluded } = ruling(body, act, fields);
  if (confirmed !== undefined) throw new DuplicateLinkError('control-platform', /** @type {LinkId} */ (confirmed.id));

  const at = nowAest();
  const link = { ...header('link', freshId(linkId, links), a, at), linkKind: 'control-platform', ...t };
  const cleared = excluded === undefined ? null : restamped(excluded, a, at, { status: 'deleted' });
  const b = withRecords(body, cleared === null ? [link] : [link, cleared]);
  /** @type {{ before: Row | null, after: Row }[]} */
  const records = [{ before: null, after: link }];
  if (cleared !== null) records.push({ before: /** @type {Row} */ (excluded), after: cleared });
  return {
    body: await recorded(b, a, records),
    link: /** @type {ControlPlatformLink} */ (/** @type {unknown} */ (link)),
    clearedJustification: /** @type {Justification | null} */ (cleared),
  };
}

/** @type {Impl['excludeControlFromPlatform']} */
async function excludeControlFromPlatform(body, act, fields) {
  const { a, t, justifications, confirmed, excluded } = ruling(body, act, fields);
  if (excluded !== undefined) throw new AlreadyExcludedError(/** @type {JustificationId} */ (excluded.id));
  const text = trimmed(fields?.text);
  if (text === null) throw new InvalidJustificationTextError(fields?.text);

  const at = nowAest();
  const justification = { ...header('justification', freshId(justificationId, justifications), a, at), ...t, text };
  const removed = confirmed === undefined ? null : restamped(confirmed, a, at, { status: 'deleted' });
  const b = withRecords(body, removed === null ? [justification] : [justification, removed]);
  /** @type {{ before: Row | null, after: Row }[]} */
  const records = [{ before: null, after: justification }];
  if (removed !== null) records.push({ before: /** @type {Row} */ (confirmed), after: removed });
  return {
    body: await recorded(b, a, records),
    justification: /** @type {Justification} */ (justification),
    removedLink: /** @type {ControlPlatformLink | null} */ (/** @type {unknown} */ (removed)),
  };
}

// ------------------------------------------------------------------ ratings

/** @type {Impl['setRating']} */
async function setRating(body, act, fields) {
  const platforms = read(body, 'platform');
  const links = read(body, 'link');
  const ratings = read(body, 'rating');
  const a = requireAct(act, platforms);
  const { hazardId: hid, platformId: pid, stage, consequence, likelihood } = fields ?? {};
  known(platforms, pid, UnknownPlatformError);
  if (hazardPlatformLink(links, hid, pid) === undefined) throw new HazardNotOnPlatformError(hid, pid);
  if (!STAGES.includes(stage)) throw new InvalidRatingStageError(stage);
  if (!isConsequenceValue(consequence)) throw new InvalidRatingValueError('consequence', consequence);
  if (!isLikelihoodValue(likelihood)) throw new InvalidRatingValueError('likelihood', likelihood);

  const before = Object.values(ratings).find((r) => r.status === 'live' && r.hazardId === hid && r.platformId === pid && r.stage === stage);
  if (before !== undefined && before.consequence === consequence && before.likelihood === likelihood) {
    throw new NoChangeError({ kind: 'rating', id: before.id }, 'consequence and likelihood');
  }
  const at = nowAest();
  const rating = before === undefined
    ? { ...header('rating', freshId(ratingId, ratings), a, at), hazardId: hid, platformId: pid, stage, consequence, likelihood }
    : restamped(before, a, at, { consequence, likelihood });
  const b = withRecords(body, [rating]);
  return { body: await recorded(b, a, [{ before: before ?? null, after: rating }]), rating: /** @type {Rating} */ (rating) };
}

/**
 * @param {Rows} ratings
 * @param {string} hazard
 * @param {string} platform
 * @param {'initial' | 'residual'} stage
 * @returns {RatingValues}
 */
function valuesOf(ratings, hazard, platform, stage) {
  const r = Object.values(ratings).find((x) => x.status === 'live' && x.hazardId === hazard && x.platformId === platform && x.stage === stage);
  return r ? { consequence: r.consequence, likelihood: r.likelihood } : { consequence: null, likelihood: null };
}

/** @type {Impl['getRatings']} */
async function getRatings(body, hazard, platform) {
  const ratings = read(body, 'rating');
  return { initial: valuesOf(ratings, hazard, platform, 'initial'), residual: valuesOf(ratings, hazard, platform, 'residual') };
}

// ------------------------------------------------------------------ the one query (C-019)

/**
 * The entries of an owned collection split into the ones C-008 accepts and the ones it does not,
 * for the query that names a hazard rather than refusing the whole list.
 * @param {DataBody} body
 * @param {string} kind
 * @returns {{ good: Rows, bad: { key: string, raw: unknown, detail: string }[] }}
 */
function partition(body, kind) {
  /** @type {Rows} */
  const good = {};
  const bad = [];
  for (const [key, raw] of Object.entries(rawCollection(body, kind))) {
    const why = malformation(kind, key, raw);
    if (why === null) good[key] = /** @type {Row} */ (raw);
    else bad.push({ key, raw, detail: why });
  }
  return { good, bad };
}

/** @type {Impl['listPlatformHazards']} */
async function listPlatformHazards(body, pid) {
  const hazards = read(body, 'hazard');
  const links = read(body, 'link');
  const platforms = read(body, 'platform');
  const platform = known(platforms, pid, UnknownPlatformError);
  const controls = partition(body, 'control');
  const justifications = partition(body, 'justification');
  const ratings = partition(body, 'rating');

  /**
   * A malformed entry a row for `hazard` would carry: one whose readable fields name that hazard
   * on this platform. An entry naming neither is carried by no row of this platform.
   * @param {{ key: string, raw: unknown, detail: string }[]} bad
   * @param {string} hazard
   * @param {(raw: Record<string, any>) => boolean} [more]
   */
  const carried = (bad, hazard, more = () => true) => bad.find(({ raw }) => isObject(raw) && raw.hazardId === hazard && raw.platformId === pid && more(raw));

  const linked = Object.values(links)
    .filter((l) => l.status === 'live' && l.linkKind === 'hazard-platform' && l.platformId === pid)
    .map((l) => ({ link: l, hazard: entry(hazards, l.hazardId) }))
    .filter((x) => x.hazard !== undefined && x.hazard.status === 'live')
    .sort((x, y) => byNumber(/** @type {Row} */ (x.hazard), /** @type {Row} */ (y.hazard)));

  /** @type {PlatformHazardRow[]} */
  const rows = [];
  /** @type {OmittedHazard[]} */
  const omitted = [];
  for (const { link, hazard: h } of linked) {
    const hazard = /** @type {Row & { id: HazardId }} */ (h);
    const controlLinks = controlLinksOf(links, hazard.id);
    /** @type {OmittedHazard | null} */
    let omit = null;
    for (const l of controlLinks) {
      if (entry(controls.good, l.controlId) !== undefined) continue;
      const bad = controls.bad.find((x) => x.key === l.controlId);
      omit = { id: hazard.id, reason: 'malformed-control', key: l.controlId, detail: bad ? bad.detail : `no control entry has the id live link ${l.id} names` };
      break;
    }
    if (omit === null) {
      const bad = carried(justifications.bad, hazard.id);
      if (bad) omit = { id: hazard.id, reason: 'malformed-justification', key: bad.key, detail: bad.detail };
    }
    if (omit === null) {
      const bad = carried(ratings.bad, hazard.id, (raw) => raw.stage !== 'initial');
      if (bad) omit = { id: hazard.id, reason: 'malformed-rating', key: bad.key, detail: bad.detail };
    }
    if (omit !== null) {
      omitted.push(omit);
      continue;
    }
    rows.push({
      hazard: /** @type {Hazard} */ (hazard),
      reportId: link.reportId,
      controls: controlLinks.map((l) => {
        const t = { hazardId: hazard.id, controlId: l.controlId, platformId: pid };
        const confirmed = controlPlatformLink(links, t);
        const excluded = confirmed === undefined ? liveJustification(justifications.good, t) : undefined;
        return /** @type {PlatformControl} */ ({
          control: controls.good[l.controlId],
          controlKind: l.controlKind,
          state: confirmed ? 'confirmed' : excluded ? 'excluded' : 'awaiting',
          confirmation: confirmed ? { byProfileId: confirmed.createdBy, atAest: confirmed.createdAtAest } : null,
          justification: excluded ?? null,
        });
      }),
      residual: valuesOf(ratings.good, hazard.id, pid, 'residual'),
    });
  }
  return { platform: /** @type {Platform} */ (platform), rows, omitted };
}

// ------------------------------------------------------------------ what a change reaches, and every status

/**
 * @param {RecordRef} ref
 * @returns {RecordKind} the kind, when this module owns it (C-024, C-031)
 */
function ownedKind(ref) {
  const kind = /** @type {RecordKind} */ (ref?.kind);
  if (!OWNED.includes(kind)) throw new UnownedRecordKindError(kind);
  return kind;
}

/** @type {Impl['platformsAffected']} */
async function platformsAffected(body, ref) {
  const kind = ownedKind(ref);
  read(body, 'link');
  read(body, 'platform');
  read(body, kind);
  return reach(body, ref);
}

/** @type {Impl['listAllHazards']} */
async function listAllHazards(body) {
  return /** @type {Hazard[]} */ (Object.values(read(body, 'hazard')).sort(byNumber));
}

/** @type {Impl['listAllControls']} */
async function listAllControls(body) {
  return /** @type {Control[]} */ (Object.values(read(body, 'control')).sort(byTimeThenId));
}

/** @type {Impl['listAllPlatforms']} */
async function listAllPlatforms(body) {
  return /** @type {Platform[]} */ (Object.values(read(body, 'platform')).sort(byTimeThenId));
}

/** @type {Impl['listLinks']} */
async function listLinks(body, ref) {
  const kind = ownedKind(ref);
  const links = read(body, 'link');
  const field = kind === 'hazard' ? 'hazardId' : kind === 'control' ? 'controlId' : kind === 'platform' ? 'platformId' : null;
  if (field === null) return [];
  return /** @type {Link[]} */ (Object.values(links).filter((l) => l.status === 'live' && has(l, field) && l[field] === ref.id).sort(byTimeThenId));
}

export {
  createHazard, updateHazard, listHazards, getHazard, getHazardDetail, deleteHazard, retireHazard, addCausalFactor, addConsequence,
  createControl, listControls, retireControl, linkControlToHazard, createPlatform, listPlatforms, retirePlatform, setPlatformOwner,
  linkHazardToPlatform, setPlatformReportId, confirmControlForPlatform, excludeControlFromPlatform, setRating, getRatings,
  listPlatformHazards, platformsAffected, listAllHazards, listAllControls, listAllPlatforms, listLinks,
};
