/**
 * Test support for the registry conformance suite (CORE-CON-002). Not a test file: the
 * runner collects `*.test.js` only.
 *
 * Section 2 of modules/registry/CONTRACT.md: a conformance test starts from
 * `schema.emptyDataBody()` or a body it builds, holds the baseline clock where a clause
 * names it, needs no folder, and from 4.0 reads what a changing operation recorded through
 * `change-log`'s own contract and never by reading `collections['change-log-entry']`. So
 * this file imports what modules/registry/manifest.yaml declares (CORE-CON-003, `declared`):
 * baseline/types, baseline/schema, baseline/clock, and modules/change-log/contract. The item
 * `change-log` C-002, C-004, and C-005 derive from a record as it was and as it now is is
 * modelled here from that contract, not imported from its suite: the manifest draws no edge
 * to it.
 *
 * Provides: profiles and acts; ids chosen to sort in a known order; stored rows of every
 * kind this module owns, and bodies holding them; the C-003 "differs only by" comparison;
 * the C-023 check of the one entry an act appends; models of the reads, written from the
 * clauses (C-006, C-010, C-011, C-012, C-014, C-019, C-021, C-024, C-030, C-031) for the
 * property tests; a seeded generator of starting bodies (CORE-TST-001: the seed is fixed and
 * recorded); and a spy on the browser's storage for C-007.
 */

import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

import { fixClock, releaseClock } from '../../../baseline/clock.js';
import * as schema from '../../../baseline/schema.js';
import { RECORD_KINDS, hazardId, platformId, timestampAest, userProfileId } from '../../../baseline/types.js';
import * as changeLog from '../../change-log/contract.js';
import * as registry from '../contract.js';

/** @typedef {import('../../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../../baseline/types.js').HazardId} HazardId */
/** @typedef {import('../../../baseline/types.js').ControlId} ControlId */
/** @typedef {import('../../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../../baseline/types.js').RecordKind} RecordKind */
/** @typedef {import('../../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../../baseline/types.js').RecordStatus} RecordStatus */
/** @typedef {import('../../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../../baseline/schema.js').StoredRecord} StoredRecord */
/** @typedef {import('../contract.js').Act} Act */
/** @typedef {import('../contract.js').Hazard} Hazard */
/** @typedef {import('../contract.js').Control} Control */
/** @typedef {import('../contract.js').Platform} Platform */
/** @typedef {import('../contract.js').CausalFactor} CausalFactor */
/** @typedef {import('../contract.js').Consequence} Consequence */
/** @typedef {import('../contract.js').Justification} Justification */
/** @typedef {import('../contract.js').Rating} Rating */
/** @typedef {import('../contract.js').Link} Link */
/** @typedef {import('../contract.js').PlatformHazards} PlatformHazards */
/** @typedef {import('../contract.js').PlatformControl} PlatformControl */
/** @typedef {import('../contract.js').HazardDetail} HazardDetail */
/** @typedef {import('../../change-log/contract.js').ChangeLogEntry} ChangeLogEntry */
/** @typedef {import('../../change-log/contract.js').RecordChangeEntry} RecordChangeEntry */

/** The one seed this suite's property tests use (CORE-TST-001); change it only on purpose, and record why. */
export const SEED = 0x52454749;

/** The collection `change-log` owns; this suite never reads it directly (section 2). */
export const LOG = /** @type {const} */ ('change-log-entry');

/** The record kinds whose collections this module reads and writes (section 3). */
export const OWNED_KINDS = Object.freeze(/** @type {RecordKind[]} */ (['hazard', 'control', 'platform', 'causal-factor', 'consequence', 'justification', 'rating', 'link']));

/** Every baseline record kind this module does not own: C-024 and C-031 refuse a ref of one. */
export const UNOWNED_KINDS = Object.freeze(RECORD_KINDS.filter((k) => !OWNED_KINDS.includes(k)));

// ------------------------------------------------------------------ profiles, acts, ids, and time

/**
 * The profile a session acts as, as `views` would pass it on from `profiles` (REQ-055).
 * @param {string} name
 * @returns {ActiveProfile}
 */
export function newProfile(name) {
  return { id: userProfileId.fresh(), name };
}

/**
 * An act: who performs it, and the platform they were working on, null for none (DEC-016).
 * @param {ActiveProfile} profile
 * @param {PlatformId | null} [madeFor]
 * @returns {Act}
 */
export function actOf(profile, madeFor = null) {
  return { profile, madeForPlatformId: madeFor };
}

/**
 * A valid UUID whose string order is the order of `n`, for ids a test needs sorted: every
 * kind's UUID parser accepts it (version 4, variant 8).
 * @param {number} n 0 to 2^32 - 1
 * @param {number} [salt] 0 to 65535, to keep ids of two kinds apart
 * @returns {any}
 */
export function orderedUuid(n, salt = 0) {
  return `${n.toString(16).padStart(8, '0')}-${salt.toString(16).padStart(4, '0')}-4000-8000-000000000000`;
}

/** @type {TimestampAest} a time no test's clock is held at, for rows a body starts with */
export const EARLIER = timestampAest('2026-01-05T08:00:00+10:00');

/** @type {TimestampAest} the time most tests hold the clock at */
export const HELD = timestampAest('2026-09-15T10:30:00+10:00');

/**
 * Run `fn` with the baseline clock held at `ts`, releasing it after whatever happens.
 * @template T
 * @param {TimestampAest} ts
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withClock(ts, fn) {
  fixClock(ts);
  try {
    return await fn();
  } finally {
    releaseClock();
  }
}

/**
 * `ts` plus `seconds`, as the clock would format it.
 * @param {TimestampAest} ts
 * @param {number} seconds
 * @returns {TimestampAest}
 */
export function plusSeconds(ts, seconds) {
  const shifted = new Date(Date.parse(ts) + seconds * 1000 + 10 * 60 * 60 * 1000).toISOString();
  return timestampAest(`${shifted.slice(0, 19)}+10:00`);
}

// ------------------------------------------------------------------ stored rows

/**
 * @typedef {object} RowOptions
 * @property {RecordStatus} [status] `live` unless given
 * @property {TimestampAest} [at] createdAtAest, and updatedAtAest unless `updatedAt` is given
 * @property {ActiveProfile} [updatedBy]
 * @property {TimestampAest} [updatedAt]
 */

/**
 * The baseline header narrowed to a kind and an id (DEC-005).
 * @param {RecordKind} kind
 * @param {string} id
 * @param {ActiveProfile} by
 * @param {RowOptions} options
 */
function header(kind, id, by, options) {
  const at = options.at ?? EARLIER;
  return {
    id,
    kind,
    status: options.status ?? 'live',
    createdBy: by.id,
    createdAtAest: at,
    updatedBy: (options.updatedBy ?? by).id,
    updatedAtAest: options.updatedAt ?? at,
  };
}

/**
 * A stored hazard as C-001 would have created it.
 * @param {number} sequence
 * @param {ActiveProfile} by
 * @param {string} title
 * @param {RowOptions} [options]
 * @returns {Hazard}
 */
export function hazardRow(sequence, by, title, options = {}) {
  return /** @type {Hazard} */ ({ ...header('hazard', hazardId.fromSequence(sequence), by, options), title });
}

/**
 * @param {ControlId} id
 * @param {ActiveProfile} by
 * @param {string} title
 * @param {RowOptions} [options]
 * @returns {Control}
 */
export function controlRow(id, by, title, options = {}) {
  return /** @type {Control} */ ({ ...header('control', id, by, options), title });
}

/**
 * @param {PlatformId} id
 * @param {ActiveProfile} by
 * @param {string} name
 * @param {ActiveProfile} owner
 * @param {RowOptions} [options]
 * @returns {Platform}
 */
export function platformRow(id, by, name, owner, options = {}) {
  return /** @type {Platform} */ ({ ...header('platform', id, by, options), name, ownerProfileId: owner.id });
}

/**
 * @param {string} id
 * @param {ActiveProfile} by
 * @param {HazardId} hazard
 * @param {string} text
 * @param {RowOptions} [options]
 * @returns {CausalFactor}
 */
export function causalFactorRow(id, by, hazard, text, options = {}) {
  return /** @type {CausalFactor} */ ({ ...header('causal-factor', id, by, options), hazardId: hazard, text });
}

/**
 * @param {string} id
 * @param {ActiveProfile} by
 * @param {HazardId} hazard
 * @param {string} text
 * @param {RowOptions} [options]
 * @returns {Consequence}
 */
export function consequenceRow(id, by, hazard, text, options = {}) {
  return /** @type {Consequence} */ ({ ...header('consequence', id, by, options), hazardId: hazard, text });
}

/** @typedef {{ hazardId: HazardId, controlId: ControlId, platformId: PlatformId }} Triple */

/**
 * @param {string} id
 * @param {ActiveProfile} by
 * @param {Triple} triple
 * @param {string} text
 * @param {RowOptions} [options]
 * @returns {Justification}
 */
export function justificationRow(id, by, triple, text, options = {}) {
  return /** @type {Justification} */ ({ ...header('justification', id, by, options), hazardId: triple.hazardId, controlId: triple.controlId, platformId: triple.platformId, text });
}

/**
 * @param {string} id
 * @param {ActiveProfile} by
 * @param {{ hazardId: HazardId, platformId: PlatformId, stage: 'initial' | 'residual', consequence: any, likelihood: any }} fields
 * @param {RowOptions} [options]
 * @returns {Rating}
 */
export function ratingRow(id, by, fields, options = {}) {
  return /** @type {Rating} */ ({
    ...header('rating', id, by, options), hazardId: fields.hazardId, platformId: fields.platformId, stage: fields.stage, consequence: fields.consequence, likelihood: fields.likelihood,
  });
}

/**
 * A `hazard-platform` link; its report ID is the hazard's global ID unless given (C-015).
 * @param {string} id
 * @param {ActiveProfile} by
 * @param {HazardId} hazard
 * @param {PlatformId} platform
 * @param {RowOptions & { reportId?: string }} [options]
 * @returns {Link}
 */
export function hazardPlatformLinkRow(id, by, hazard, platform, options = {}) {
  return /** @type {Link} */ ({ ...header('link', id, by, options), linkKind: 'hazard-platform', hazardId: hazard, platformId: platform, reportId: options.reportId ?? hazard });
}

/**
 * @param {string} id
 * @param {ActiveProfile} by
 * @param {HazardId} hazard
 * @param {ControlId} control
 * @param {'preventative' | 'mitigating'} controlKind
 * @param {RowOptions} [options]
 * @returns {Link}
 */
export function hazardControlLinkRow(id, by, hazard, control, controlKind, options = {}) {
  return /** @type {Link} */ ({ ...header('link', id, by, options), linkKind: 'hazard-control', hazardId: hazard, controlId: control, controlKind });
}

/**
 * A `control-platform` link: a confirmation (C-013, C-022).
 * @param {string} id
 * @param {ActiveProfile} by
 * @param {Triple} triple
 * @param {RowOptions} [options]
 * @returns {Link}
 */
export function controlPlatformLinkRow(id, by, triple, options = {}) {
  return /** @type {Link} */ ({ ...header('link', id, by, options), linkKind: 'control-platform', hazardId: triple.hazardId, controlId: triple.controlId, platformId: triple.platformId });
}

/**
 * A body holding these rows, each in the collection of its kind under its id, with the
 * hazard sequence one past the highest hazard number unless given, and any other
 * collections as given. A kind with no row has no collection.
 * @param {readonly any[]} rows
 * @param {{ sequence?: number, extra?: Record<string, unknown> }} [options]
 * @returns {DataBody}
 */
export function bodyFrom(rows, options = {}) {
  /** @type {Record<string, Record<string, unknown>>} */
  const collections = /** @type {any} */ ({ ...(options.extra ?? {}) });
  let highest = 0;
  for (const row of rows) {
    (collections[row.kind] ??= {})[row.id] = row;
    if (row.kind === 'hazard') highest = Math.max(highest, idNumber(row.id));
  }
  return /** @type {DataBody} */ ({ collections, sequences: { hazard: options.sequence ?? highest + 1 } });
}

/**
 * The entries of one collection of a body, whatever their shape. Never used on `LOG`.
 * @param {DataBody} body
 * @param {string} kind
 * @returns {Record<string, any>}
 */
export function entriesOf(body, kind) {
  assert.notEqual(kind, LOG, 'this suite reads the change log through its contract only (section 2)');
  return /** @type {Record<string, any>} */ (/** @type {any} */ (body.collections)[kind] ?? {});
}

/**
 * @param {HazardId | string} id
 * @returns {number} the number in a global ID
 */
export function idNumber(id) {
  return Number(String(id).slice(2));
}

/**
 * @param {{ kind: RecordKind, id: string }} record
 * @returns {RecordRef}
 */
export function refOf(record) {
  return { kind: record.kind, id: record.id };
}

// ------------------------------------------------------------------ the body is a value (C-003)

/**
 * A deep copy: what a body was, to compare against after a call.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function snapshot(value) {
  return structuredClone(value);
}

/**
 * The body after a JSON serialise and parse, as `store` C-001 carries it (C-004).
 * @param {DataBody} body
 * @returns {DataBody}
 */
export function jsonRoundTrip(body) {
  return JSON.parse(JSON.stringify(body));
}

/**
 * Freeze a value and everything reachable from it, so a mutation throws instead of passing
 * unseen. Used beside, never instead of, the deep-equal check of C-003.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/**
 * Where `output` differs from `input`, outside the change-log collection: `kind/key` for an
 * entry added, removed, or not deep-equal; `kind` for a collection that is not an object on
 * one side; `sequences.<name>` for a sequence; `<field>` for any other field of the body.
 * Sorted. C-003's "differs only in" is this list being exactly what a clause names.
 * @param {DataBody} input
 * @param {DataBody} output
 * @returns {string[]}
 */
export function differences(input, output) {
  /** @type {string[]} */
  const out = [];
  const isMap = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const ic = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (input.collections));
  const oc = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (output.collections ?? {}));
  for (const name of new Set([...Object.keys(ic), ...Object.keys(oc)])) {
    if (name === LOG) continue;
    const a = ic[name];
    const b = oc[name];
    if ((a === undefined || isMap(a)) && (b === undefined || isMap(b))) {
      const am = /** @type {Record<string, unknown>} */ (a ?? {});
      const bm = /** @type {Record<string, unknown>} */ (b ?? {});
      if (a !== undefined && b === undefined && Object.keys(am).length === 0) { out.push(name); continue; }
      for (const key of new Set([...Object.keys(am), ...Object.keys(bm)])) {
        const inA = Object.prototype.hasOwnProperty.call(am, key);
        const inB = Object.prototype.hasOwnProperty.call(bm, key);
        if (inA !== inB || !isDeepStrictEqual(am[key], bm[key])) out.push(`${name}/${key}`);
      }
    } else if (!isDeepStrictEqual(a, b)) {
      out.push(name);
    }
  }
  const is = /** @type {Record<string, unknown>} */ (input.sequences ?? {});
  const os = /** @type {Record<string, unknown>} */ (output.sequences ?? {});
  for (const name of new Set([...Object.keys(is), ...Object.keys(os)])) if (!isDeepStrictEqual(is[name], os[name])) out.push(`sequences.${name}`);
  const { collections: _ic, sequences: _is, ...irest } = /** @type {any} */ (input);
  const { collections: _oc, sequences: _os, ...orest } = /** @type {any} */ (output);
  for (const name of new Set([...Object.keys(irest), ...Object.keys(orest)])) if (!isDeepStrictEqual(irest[name], orest[name])) out.push(name);
  return out.sort();
}

/**
 * @param {...string} keys
 * @returns {string[]} sorted, for comparison with `differences`
 */
export function only(...keys) {
  return [...keys].sort();
}

// ------------------------------------------------------------------ what an act recorded (C-023)

/**
 * Structural equality of plain data: key order is not data, array order is.
 * @param {unknown} x
 * @param {unknown} y
 * @returns {boolean}
 */
function sameValue(x, y) {
  if (x === y) return true;
  if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object') return false;
  if (Array.isArray(x) !== Array.isArray(y)) return false;
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((v, i) => sameValue(v, y[i]));
  const xo = /** @type {Record<string, unknown>} */ (x);
  const yo = /** @type {Record<string, unknown>} */ (y);
  return Object.keys(xo).length === Object.keys(yo).length && Object.keys(xo).every((k) => Object.prototype.hasOwnProperty.call(yo, k) && sameValue(xo[k], yo[k]));
}

/**
 * The item `change-log` gives for one record handed to it (change-log C-002, C-004, C-005):
 * the action from the status transition; for `edited`, one field change per field whose values
 * differ, for the other three, one per field of either side; null on a side a field is absent
 * from; ascending by field; never `updatedBy` or `updatedAtAest`.
 * @param {any} before
 * @param {any} after
 * @returns {import('../../change-log/contract.js').ChangedItem}
 */
export function expectedItem(before, after) {
  const action = before === null ? 'created'
    : after.status === 'deleted' && before.status !== 'deleted' ? 'deleted'
      : after.status === 'retired' && before.status !== 'retired' ? 'retired'
        : 'edited';
  const b = before ?? {};
  const names = [...new Set([...Object.keys(b), ...Object.keys(after)])].filter((f) => f !== 'updatedBy' && f !== 'updatedAtAest').sort();
  /** @type {any[]} */
  const fields = [];
  for (const field of names) {
    const inB = Object.prototype.hasOwnProperty.call(b, field);
    const inA = Object.prototype.hasOwnProperty.call(after, field);
    if (action === 'edited' && inB === inA && sameValue(b[field], after[field])) continue;
    fields.push({ field, before: inB ? b[field] : null, after: inA ? after[field] : null });
  }
  return { ref: { kind: after.kind, id: after.id }, action, fields };
}

/**
 * The entries `change-log` gives for a body, read through its contract (section 2).
 * @param {DataBody} body
 * @returns {Promise<ChangeLogEntry[]>}
 */
export async function logOf(body) {
  return [...(await changeLog.listEntries(body))];
}

/**
 * The entries of `output` that `input` did not hold, after checking that every entry `input`
 * held is still there and deep-equal (`change-log` C-006; C-003).
 * @param {DataBody} input
 * @param {DataBody} output
 * @param {string} at
 * @returns {Promise<ChangeLogEntry[]>}
 */
export async function addedEntries(input, output, at) {
  const had = await logOf(input);
  const has = await logOf(output);
  for (const e of had) assert.deepEqual(has.find((x) => x.id === e.id), e, `${at}: entry ${e.id} is still in the log as it was`);
  return has.filter((e) => !had.some((x) => x.id === e.id));
}

/**
 * The records an act hands `change-log`, each as it was and as it now is (C-023).
 * @typedef {{ before: any, after: any }} Handed
 */

/**
 * Check C-023 for one resolved changing call: `output` holds exactly one entry `input` did
 * not, stamped with the act's profile and the clock, whose items are those `records` in that
 * order, whose `madeForPlatformId` is the act's, and whose `affectedPlatformIds` is the union
 * of `platformsAffected(output, ref)` over the records' refs — or `affected` when a test names
 * the platforms literally. Returns the entry.
 * @param {DataBody} input
 * @param {DataBody} output
 * @param {{ act: Act, at: TimestampAest, records: Handed[], affected?: string[], what?: string }} expected
 * @returns {Promise<RecordChangeEntry>}
 */
export async function assertRecorded(input, output, expected) {
  const what = expected.what ?? 'the act';
  const added = await addedEntries(input, output, what);
  assert.equal(added.length, 1, `${what}: exactly one entry is added to the log (C-023), got ${added.length}`);
  const entry = /** @type {RecordChangeEntry} */ (added[0]);
  assert.equal(entry.entryKind, 'record-change', `${what}: the entry is a record change`);
  assert.equal(entry.createdBy, expected.act.profile.id, `${what}: the entry is stamped with act.profile`);
  assert.equal(entry.createdAtAest, expected.at, `${what}: the entry is stamped with the clock's now`);
  assert.equal(entry.madeForPlatformId, expected.act.madeForPlatformId, `${what}: madeForPlatformId is act.madeForPlatformId unchanged`);
  assert.deepEqual(entry.items, expected.records.map((r) => expectedItem(r.before, r.after)), `${what}: the records handed over are the ones the clause names, each as it was and as it now is, in C-023's order`);
  /** @type {Set<string>} */
  const union = new Set();
  for (const r of expected.records) for (const p of await registry.platformsAffected(output, refOf(r.after))) union.add(p);
  assert.deepEqual([...entry.affectedPlatformIds], [...union].sort(), `${what}: affectedPlatformIds is the union of platformsAffected on the returned body (C-023, C-024)`);
  if (expected.affected) assert.deepEqual([...entry.affectedPlatformIds], [...expected.affected].sort(), `${what}: the platforms the act reaches`);
  return entry;
}

/**
 * Check that a call recorded nothing: `output`'s log is `input`'s.
 * @param {DataBody} input
 * @param {DataBody} output
 * @param {string} what
 */
export async function assertNothingRecorded(input, output, what) {
  assert.deepEqual(await addedEntries(input, output, what), [], `${what}: no entry was written`);
}

// ------------------------------------------------------------------ ordering (section 5)

/**
 * @param {{ createdAtAest: string, id: string }} a
 * @param {{ createdAtAest: string, id: string }} b
 * @returns {number} ascending `createdAtAest`, then id
 */
export function byTimeThenId(a, b) {
  if (a.createdAtAest !== b.createdAtAest) return a.createdAtAest < b.createdAtAest ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * @param {{ id: string }} a
 * @param {{ id: string }} b
 * @returns {number} ascending number in a global ID (C-006)
 */
export function byNumber(a, b) {
  return idNumber(a.id) - idNumber(b.id);
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} ascending as strings
 */
export function asStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ------------------------------------------------------------------ models of the reads, from the clauses

/**
 * @param {DataBody} body
 * @param {string} kind
 * @returns {any[]}
 */
function rows(body, kind) {
  return Object.values(entriesOf(body, kind));
}

/**
 * @param {DataBody} body
 * @returns {Link[]} every link whose own status is live (section 3, "linked")
 */
export function liveLinks(body) {
  return rows(body, 'link').filter((l) => l.status === 'live');
}

/** @param {DataBody} body @returns {Hazard[]} C-006 */
export function hazardsModel(body) { return rows(body, 'hazard').filter((h) => h.status === 'live').sort(byNumber); }
/** @param {DataBody} body @returns {Hazard[]} C-030 */
export function allHazardsModel(body) { return rows(body, 'hazard').sort(byNumber); }
/** @param {DataBody} body @returns {Control[]} C-011 */
export function controlsModel(body) { return rows(body, 'control').filter((c) => c.status === 'live').sort(byTimeThenId); }
/** @param {DataBody} body @returns {Control[]} C-030 */
export function allControlsModel(body) { return rows(body, 'control').sort(byTimeThenId); }
/** @param {DataBody} body @returns {Platform[]} C-014 */
export function platformsModel(body) { return rows(body, 'platform').filter((p) => p.status === 'live').sort(byTimeThenId); }
/** @param {DataBody} body @returns {Platform[]} C-030 */
export function allPlatformsModel(body) { return rows(body, 'platform').sort(byTimeThenId); }

/**
 * The hazard's controls C-012 gives: one per live `hazard-control` link, the control as
 * stored whatever its status, by the link's `createdAtAest` then the control's id.
 * @param {DataBody} body
 * @param {string} hazard
 * @returns {{ control: Control, controlKind: any }[]}
 */
export function hazardControlsModel(body, hazard) {
  const controls = entriesOf(body, 'control');
  return liveLinks(body)
    .filter((l) => l.linkKind === 'hazard-control' && l.hazardId === hazard)
    .sort((a, b) => (a.createdAtAest !== b.createdAtAest ? (a.createdAtAest < b.createdAtAest ? -1 : 1) : asStrings(/** @type {any} */ (a).controlId, /** @type {any} */ (b).controlId)))
    .map((l) => ({ control: controls[/** @type {any} */ (l).controlId], controlKind: /** @type {any} */ (l).controlKind }));
}

/**
 * C-010 with C-012: null only when no hazard has the id.
 * @param {DataBody} body
 * @param {string} hazard
 * @returns {HazardDetail | null}
 */
export function detailModel(body, hazard) {
  const h = entriesOf(body, 'hazard')[hazard];
  if (!h) return null;
  return {
    hazard: h,
    causalFactors: rows(body, 'causal-factor').filter((c) => c.status === 'live' && c.hazardId === hazard).sort(byTimeThenId),
    consequences: rows(body, 'consequence').filter((c) => c.status === 'live' && c.hazardId === hazard).sort(byTimeThenId),
    controls: hazardControlsModel(body, hazard),
  };
}

/**
 * What one of a hazard's controls is on one platform (C-021, C-022).
 * @param {DataBody} body
 * @param {Triple} t
 * @returns {{ state: 'confirmed' | 'excluded' | 'awaiting', confirmation: any, justification: any }}
 */
export function stateModel(body, t) {
  const link = liveLinks(body).find((l) => l.linkKind === 'control-platform' && l.hazardId === t.hazardId && l.controlId === t.controlId && l.platformId === t.platformId);
  if (link) return { state: 'confirmed', confirmation: { byProfileId: link.createdBy, atAest: link.createdAtAest }, justification: null };
  const j = rows(body, 'justification').find((x) => x.status === 'live' && x.hazardId === t.hazardId && x.controlId === t.controlId && x.platformId === t.platformId);
  if (j) return { state: 'excluded', confirmation: null, justification: j };
  return { state: 'awaiting', confirmation: null, justification: null };
}

/**
 * The residual values C-017 gives for a hazard on a platform.
 * @param {DataBody} body
 * @param {string} hazard
 * @param {string} platform
 * @param {'initial' | 'residual'} stage
 * @returns {{ consequence: any, likelihood: any }}
 */
export function valuesModel(body, hazard, platform, stage) {
  const r = rows(body, 'rating').find((x) => x.status === 'live' && x.hazardId === hazard && x.platformId === platform && x.stage === stage);
  return r ? { consequence: r.consequence, likelihood: r.likelihood } : { consequence: null, likelihood: null };
}

/**
 * C-019 for a body with no malformed record: every live hazard with a live link to the
 * platform, as a row, by number.
 * @param {DataBody} body
 * @param {PlatformId} platform
 * @returns {PlatformHazards}
 */
export function platformHazardsModel(body, platform) {
  const hazards = entriesOf(body, 'hazard');
  const linked = liveLinks(body).filter((l) => l.linkKind === 'hazard-platform' && l.platformId === platform);
  const rowsOut = linked
    .map((l) => ({ link: /** @type {any} */ (l), hazard: hazards[l.hazardId] }))
    .filter((x) => x.hazard && x.hazard.status === 'live')
    .sort((a, b) => byNumber(a.hazard, b.hazard))
    .map(({ link, hazard }) => ({
      hazard,
      reportId: link.reportId,
      controls: hazardControlsModel(body, hazard.id).map((hc) => ({ ...hc, ...stateModel(body, { hazardId: hazard.id, controlId: hc.control.id, platformId: platform }) })),
      residual: valuesModel(body, hazard.id, platform, 'residual'),
    }));
  return /** @type {PlatformHazards} */ ({ platform: entriesOf(body, 'platform')[platform], rows: rowsOut, omitted: [] });
}

/**
 * C-024: the platforms a change to one record reaches, distinct, ascending as strings.
 * @param {DataBody} body
 * @param {RecordRef} ref of an owned kind
 * @returns {string[]}
 */
export function affectedModel(body, ref) {
  const live = liveLinks(body);
  const platforms = entriesOf(body, 'platform');
  const ofHazard = (/** @type {string} */ h) => live.filter((l) => l.linkKind === 'hazard-platform' && l.hazardId === h).map((l) => /** @type {any} */ (l).platformId);
  const named = (/** @type {string} */ p) => (Object.prototype.hasOwnProperty.call(platforms, p) ? [p] : []);
  /** @type {string[]} */
  let out = [];
  const record = entriesOf(body, ref.kind)[ref.id];
  switch (ref.kind) {
    case 'hazard': out = ofHazard(ref.id); break;
    case 'control': out = live.filter((l) => l.linkKind === 'hazard-control' && /** @type {any} */ (l).controlId === ref.id).flatMap((l) => ofHazard(l.hazardId)); break;
    case 'platform': out = named(ref.id); break;
    case 'causal-factor': case 'consequence': out = record ? ofHazard(record.hazardId) : []; break;
    case 'justification': case 'rating': out = record ? named(record.platformId) : []; break;
    case 'link':
      if (!record) out = [];
      else if (record.linkKind === 'hazard-control') out = ofHazard(record.hazardId);
      else out = named(record.platformId);
      break;
    default: throw new Error(`not an owned kind: ${ref.kind}`);
  }
  return [...new Set(out)].sort(asStrings);
}

/**
 * C-031: every live link naming the ref in the field of its kind.
 * @param {DataBody} body
 * @param {RecordRef} ref of an owned kind
 * @returns {Link[]}
 */
export function linksModel(body, ref) {
  const field = ref.kind === 'hazard' ? 'hazardId' : ref.kind === 'control' ? 'controlId' : ref.kind === 'platform' ? 'platformId' : null;
  if (field === null) return [];
  return liveLinks(body).filter((l) => /** @type {any} */ (l)[field] === ref.id).sort(byTimeThenId);
}

// ------------------------------------------------------------------ a small world, built through the contract

/**
 * A body built through the contract's own operations, for tests that need the record model
 * in place: two owners, two platforms, one hazard on both, one control of that hazard as
 * preventative and a second as mitigating, and a third control in the library only. Every act
 * is made for no platform, one second apart from `start`.
 * @param {TimestampAest} [start]
 */
export async function smallWorld(start = EARLIER) {
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  let at = start;
  const tick = () => { at = plusSeconds(at, 1); return at; };
  const a = actOf(alice);
  let body = schema.emptyDataBody();
  const hazard = await withClock(tick(), () => registry.createHazard(body, a, { title: 'Loss of control' }));
  body = hazard.body;
  const pa = await withClock(tick(), () => registry.createPlatform(body, a, { name: 'Alpha', ownerProfileId: alice.id }));
  body = pa.body;
  const pb = await withClock(tick(), () => registry.createPlatform(body, a, { name: 'Bravo', ownerProfileId: bob.id }));
  body = pb.body;
  const c1 = await withClock(tick(), () => registry.createControl(body, a, { title: 'Stall warning' }));
  body = c1.body;
  const c2 = await withClock(tick(), () => registry.createControl(body, a, { title: 'Recovery training' }));
  body = c2.body;
  const c3 = await withClock(tick(), () => registry.createControl(body, a, { title: 'Unused' }));
  body = c3.body;
  body = (await withClock(tick(), () => registry.linkControlToHazard(body, a, { hazardId: hazard.hazard.id, controlId: c1.control.id, controlKind: 'preventative' }))).body;
  body = (await withClock(tick(), () => registry.linkControlToHazard(body, a, { hazardId: hazard.hazard.id, controlId: c2.control.id, controlKind: 'mitigating' }))).body;
  body = (await withClock(tick(), () => registry.linkHazardToPlatform(body, a, { hazardId: hazard.hazard.id, platformId: pa.platform.id }))).body;
  body = (await withClock(tick(), () => registry.linkHazardToPlatform(body, a, { hazardId: hazard.hazard.id, platformId: pb.platform.id }))).body;
  return {
    alice, bob, body, at,
    hazard: hazard.hazard.id,
    alpha: pa.platform.id,
    bravo: pb.platform.id,
    stall: c1.control.id,
    training: c2.control.id,
    unused: c3.control.id,
  };
}

// ------------------------------------------------------------------ rejections

/**
 * The error a call rejects with; fails the test if it resolves.
 * @param {() => Promise<unknown>} call
 * @param {string} [what]
 * @returns {Promise<any>}
 */
export async function rejectionOf(call, what = 'the call') {
  /** @type {unknown} */
  let error = null;
  let rejected = false;
  await call().then(
    (value) => { throw new Error(`${what} resolved with ${JSON.stringify(value)}; a rejection was expected`); },
    (e) => { error = e; rejected = true; },
  );
  if (!rejected) throw new Error(`${what} did not reject`);
  return error;
}

/**
 * Check a call rejects with `type`, the body it was given left deep-equal to what it was.
 * @param {() => Promise<unknown>} call
 * @param {Function} type
 * @param {DataBody} body
 * @param {string} what
 * @returns {Promise<any>} the error
 */
export async function assertRefused(call, type, body, what) {
  const before = snapshot(body);
  const e = await rejectionOf(call, what);
  assert.ok(e instanceof type, `${what}: rejects with ${type.name}, got ${String(e)}`);
  assert.deepEqual(body, before, `${what}: body unchanged`);
  return e;
}

// ------------------------------------------------------------------ seeded randomness (CORE-TST-001)

/**
 * mulberry32: small, deterministic, good enough to pick cases with.
 * @param {number} seed
 * @returns {() => number} uniform in [0, 1)
 */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {() => number} random
 * @param {number} maxExclusive
 * @returns {number}
 */
export function pick(random, maxExclusive) {
  return Math.floor(random() * maxExclusive);
}

/**
 * @template T
 * @param {() => number} random
 * @param {readonly T[]} list non-empty
 * @returns {T}
 */
export function oneOf(random, list) {
  return list[pick(random, list.length)];
}

/** Titles as users type them: padding, scripts, quotes, and a blank or two. */
export const TYPED_TITLES = [
  'loss of control', '  runway incursion  ', 'Übertemperatur', '火災', 'ground collision', '', '   ', '\t', 'fuel starvation',
  'icing — pitot', 'bird strike', 'a "quoted" title', ' x ', 'loss of control', 'Bird Strike', '\n\nwake turbulence\n',
];

/**
 * Collections of kinds this module does not own, as some other module might store them:
 * deliberately not well-formed records, because C-003 promises they are carried through
 * untouched and unread. Never `change-log-entry`, which `change-log` reads (C-023).
 * @param {() => number} random
 * @returns {Record<string, unknown>}
 */
export function foreignCollections(random) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (random() < 0.7) out['reference-entry'] = { junk: { nothing: null, list: [1, 2, 3] }, 'r-2': 'not even an object' };
  if (random() < 0.5) out['review-schedule'] = {};
  if (random() < 0.3) out['user-profile'] = { x: { id: 'y', kind: 'hazard', status: 'bogus' } };
  return out;
}

/**
 * A random, well-formed starting body over the whole record model: hazards under
 * non-contiguous numbers, controls, platforms, causal factors, consequences, links of the
 * three kinds, each triple confirmed, excluded, or awaiting with superseded rows behind it,
 * ratings, records of every status, times that sometimes tie, a hazard sequence at or past
 * the highest number, and foreign collections. Every row a body this module wrote could
 * hold: at most one live link or one live justification per triple (C-021), one live rating
 * per stage (C-017), one live link per pair (C-012, C-015).
 * @param {() => number} random
 * @param {ActiveProfile[]} by
 * @returns {DataBody}
 */
export function randomBody(random, by) {
  /** @type {any[]} */
  const out = [];
  const who = () => oneOf(random, by);
  const when = () => plusSeconds(EARLIER, pick(random, 6) * 3600); // few distinct times, so ties happen
  const status = () => { const r = random(); return /** @type {RecordStatus} */ (r < 0.7 ? 'live' : r < 0.85 ? 'retired' : 'deleted'); };
  let n = 0;
  let uid = 0;
  const id = () => orderedUuid(pick(random, 0xffff) * 0x10000 + (uid += 1), 1 + pick(random, 3)); // unique, in an order that is not creation order

  const hazards = [];
  for (let i = 0, count = pick(random, 6); i < count; i += 1) {
    n += 1 + pick(random, 3);
    const h = hazardRow(n, who(), oneOf(random, TYPED_TITLES).trim() || 'untitled', { status: status(), at: when() });
    hazards.push(h);
    out.push(h);
  }
  const controls = [];
  for (let i = 0, count = pick(random, 5); i < count; i += 1) {
    const c = controlRow(id(), who(), `control ${i}`, { status: status(), at: when() });
    controls.push(c);
    out.push(c);
  }
  const platforms = [];
  for (let i = 0, count = pick(random, 4); i < count; i += 1) {
    const p = platformRow(/** @type {PlatformId} */ (id()), who(), `platform ${i}`, who(), { status: status(), at: when() });
    platforms.push(p);
    out.push(p);
  }
  for (const h of hazards) {
    for (let i = 0, count = pick(random, 3); i < count; i += 1) out.push(causalFactorRow(id(), who(), h.id, `cause ${i}`, { status: random() < 0.8 ? 'live' : 'deleted', at: when() }));
    for (let i = 0, count = pick(random, 3); i < count; i += 1) out.push(consequenceRow(id(), who(), h.id, `effect ${i}`, { status: random() < 0.8 ? 'live' : 'deleted', at: when() }));
    const mine = controls.filter(() => random() < 0.5);
    for (const c of mine) {
      if (random() < 0.15) out.push(hazardControlLinkRow(id(), who(), h.id, c.id, 'preventative', { status: 'deleted', at: when() }));
      out.push(hazardControlLinkRow(id(), who(), h.id, c.id, random() < 0.5 ? 'preventative' : 'mitigating', { at: when() }));
    }
    for (const p of platforms.filter(() => random() < 0.6)) {
      const linkStatus = random() < 0.85 ? 'live' : 'deleted';
      out.push(hazardPlatformLinkRow(id(), who(), h.id, p.id, { status: linkStatus, at: when(), reportId: random() < 0.3 ? `${p.name}-${h.id}` : undefined }));
      for (const c of mine) {
        const t = { hazardId: h.id, controlId: c.id, platformId: p.id };
        for (let s = 0, superseded = pick(random, 3); s < superseded; s += 1) {
          out.push(random() < 0.5 ? controlPlatformLinkRow(id(), who(), t, { status: 'deleted', at: when() }) : justificationRow(id(), who(), t, `old reason ${s}`, { status: 'deleted', at: when() }));
        }
        const r = random();
        if (r < 0.35) out.push(controlPlatformLinkRow(id(), who(), t, { at: when() }));
        else if (r < 0.65) out.push(justificationRow(id(), who(), t, 'not fitted', { at: when() }));
      }
      for (const stage of /** @type {const} */ (['initial', 'residual'])) {
        if (random() < 0.2) out.push(ratingRow(id(), who(), { hazardId: h.id, platformId: p.id, stage, consequence: 1, likelihood: 'A' }, { status: 'deleted', at: when() }));
        if (random() < 0.6) {
          out.push(ratingRow(id(), who(), {
            hazardId: h.id, platformId: p.id, stage, consequence: random() < 0.2 ? null : 1 + pick(random, 5), likelihood: random() < 0.2 ? null : oneOf(random, ['A', 'B', 'C', 'D', 'E', 'F', 'G']),
          }, { at: when() }));
        }
      }
    }
  }
  return bodyFrom(out, { sequence: n + 1 + pick(random, 4), extra: foreignCollections(random) });
}

// ------------------------------------------------------------------ the browser's storage

/**
 * Run `fn` with `localStorage` and `sessionStorage` present on `globalThis` as spies that
 * record every read and write, for C-007. Node has neither by default; if the runtime ever
 * supplies one, the real object is restored after.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ result: T, uses: string[] }>}
 */
export async function withBrowserStorageSpies(fn) {
  /** @type {string[]} */
  const uses = [];
  /** @param {string} which */
  const spy = (which) => ({
    length: 0,
    /** @param {string} _key */
    getItem: (_key) => { uses.push(`${which}.getItem`); return null; },
    /** @param {string} key @param {string} value */
    setItem: (key, value) => { uses.push(`${which}.setItem(${key}=${value})`); },
    /** @param {string} key */
    removeItem: (key) => { uses.push(`${which}.removeItem(${key})`); },
    clear: () => { uses.push(`${which}.clear()`); },
    /** @param {number} _i */
    key: (_i) => null,
  });
  const g = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (globalThis));
  const saved = { localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), sessionStorage: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage') };
  Object.defineProperty(globalThis, 'localStorage', { value: spy('localStorage'), configurable: true, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: spy('sessionStorage'), configurable: true, writable: true });
  try {
    const result = await fn();
    return { result, uses };
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete g[name];
    }
  }
}

export { changeLog, platformId, schema };
