# Contract: change-log
Version: 1.0 · Status: draft

Written for SL-05. Promises the history STK-017 and STK-029 ask for and the queue STK-018
and STK-026 ask for, from one collection: one entry per act a person performed, holding
every record that act changed with the previous and new value of each field, the platform
the act was made for, and every platform it reaches; and, as entries of their own, the
acknowledgements that clear an act from a platform (DEC-015). Nothing here knows what a
hazard, a control, or a platform is: an entry is written from the baseline record header
(DEC-005) and the fields the caller hands over, so a record kind not yet built is logged by
this version without a change to it (SL-05 criterion 2).

This module sits below every module that owns a record kind and imports none of them
(DEC-004). It cannot ask which platforms a change reaches — the links are `registry`'s, and
the edge would close the cycle DEC-004 rejected — so the caller names them, and an entry is
the caller's statement of what it was changing (DEC-015).

SL-05 criterion 4 asks that each other affected platform's owner see "the change and every
item it affects". This contract reads "every item it affects" as every record the one act
changed, which is what an entry holds: an exclusion writes a justification and supersedes a
`control-platform` link in one call (registry C-021), and both are in one entry, acknowledged
together. The other reading — every item of that platform the changed records appear in, the
hazard's row and its controls — is a composition of `registry`'s per-platform query with this
module's entries, so it is `views`' half of REQ-012, written at its own CONTRACT session, and
is not refused here, only placed elsewhere. This module cannot make it: it holds no link.

## 1. Purpose
Keep one entry per act that changed stored data — who, when, every record it changed with
each field's previous and new value, and every platform it reaches — from which both the
history of any record and what a platform has yet to acknowledge are read.

## 2. Operations
In `contract.js`. Every operation is asynchronous and returns a promise (DEC-012). Every
operation is a function of the `DataBody` passed in and, for the two that change it, of the
baseline clock; none reads or writes the data folder, the browser's storage, or anything else
(DEC-006). A consumer holds the working body from `store.load`, replaces it with the `body`
each changing operation returns, and passes it to `store.save` when the user saves.

| Operation | Signature | Verified by |
|---|---|---|
| recordChange | `(body: DataBody, profile: ActiveProfile, change: RecordedChange) → EntryChange` | conformance |
| acknowledge | `(body: DataBody, profile: ActiveProfile, fields: AcknowledgementFields) → AcknowledgementChange` | conformance |
| listEntries | `(body: DataBody) → readonly ChangeLogEntry[]` | conformance |
| listHistory | `(body: DataBody, ref: RecordRef) → readonly ChangeLogEntry[]` | conformance |
| listAwaiting | `(body: DataBody, platformId: PlatformId) → readonly RecordChangeEntry[]` | conformance |

A conformance test starts from `schema.emptyDataBody()` or a body it builds, holds the
baseline clock where a clause names it, and needs no folder and no other module: the records
it hands to `recordChange` are `StoredRecord` values built in test code, which is what this
module sees of every kind whoever owns it (C-002).

## 3. Data shapes
From `baseline/types.js`: `ChangeLogEntryId`, `PlatformId`, `UserProfileId`, `ActiveProfile`,
`RecordKind`, `RecordStatus`, `RecordRef`, `TimestampAest`. From `baseline/schema.js`:
`DataBody`, whose `collections['change-log-entry']` is the one collection this module reads
and writes, and `RecordHeader` and `StoredRecord`, which are what it sees of every other
kind. Defined in `contract.js`:

**Values crossing the boundary**:

- `JsonValue`: a string, a whole or fractional number, a boolean, null, an array of
  `JsonValue`, or an object whose values are `JsonValue`. It is what a stored record's field
  may hold, so an entry survives a save and a load unchanged (C-003).
- `FieldChange`: `{ field: string, before: JsonValue, after: JsonValue }` — one field of one
  record, as it was and as it now is. Compared deep, so two values that are structurally
  equal are not a change (C-002).
- `ItemAction`: `'created' | 'edited' | 'deleted' | 'retired'` — what the act did to one
  record, derived from its status transition and never given by the caller (C-005).
- `ChangedItem`: `{ ref: RecordRef, action: ItemAction, fields: readonly FieldChange[] }` —
  one record the act changed. `ref` is its kind and its id; which fields are in `fields`
  depends on `action` (C-002, C-004).

**Records**, in `collections['change-log-entry']` keyed by id, each the baseline record
header narrowed to this kind plus its own fields (DEC-005), and told apart by `entryKind`
as a `Link` is told apart by `linkKind` (DEC-013, DEC-015):

- `RecordChangeEntry`: `kind: 'change-log-entry'`, `id: ChangeLogEntryId`,
  `entryKind: 'record-change'`, `items: readonly ChangedItem[]` (at least one),
  `madeForPlatformId: PlatformId | null`, `affectedPlatformIds: readonly PlatformId[]`.
  `createdBy` and `createdAtAest` are who performed the act and when; `status` is `live`.
- `AcknowledgementEntry`: `kind: 'change-log-entry'`, `id: ChangeLogEntryId`,
  `entryKind: 'acknowledgement'`, `entryId: ChangeLogEntryId` — the record-change entry
  acknowledged — and `platformId: PlatformId`, the one platform it is acknowledged for.
  `createdBy` and `createdAtAest` are who acknowledged and when; `status` is `live`.
- `ChangeLogEntry`: `RecordChangeEntry | AcknowledgementEntry`.

**Field bundles** a consumer supplies:

- `RecordBeforeAfter`: `{ before: StoredRecord | null, after: StoredRecord }` — one record
  as it was, null when the act created it, and as it now is. `after` is never null: a
  deletion keeps the row with status `deleted` (registry C-005), so there is always a record
  to point at.
- `RecordedChange`: `{ records: readonly RecordBeforeAfter[], madeForPlatformId: PlatformId |
  null, affectedPlatformIds: readonly PlatformId[] }` — one act. `madeForPlatformId` is the
  platform the user was working on, or null when the act was not made for one;
  `affectedPlatformIds` is every platform the act reaches, the caller's to compute (DEC-015).
- `AcknowledgementFields`: `{ entryId: ChangeLogEntryId, platformId: PlatformId }`.

**Changes**, what a changing operation returns: `EntryChange`
`{ body: DataBody, entry: RecordChangeEntry }` and `AcknowledgementChange`
`{ body: DataBody, entry: AcknowledgementEntry }`. The body passed in is untouched (C-003).

Every time in an entry is a `TimestampAest` from the baseline clock; every id comes from
`types.changeLogEntryId.fresh` (DEC-005). "Awaiting" everywhere in this contract means what
C-010 defines: a record-change entry whose `affectedPlatformIds` hold the platform, whose
`madeForPlatformId` is not that platform, and which no live acknowledgement entry names for
that platform.

## 4. Error conditions
Signalled as a rejected promise carrying the named error class. "Body unchanged" means the
body passed in is deep-equal to what it was before the call, which C-003 promises of every
call, and that nothing was returned as a new body.

| Operation | Condition | Signalled as | Caller obligation |
|---|---|---|---|
| every operation | an entry of `collections['change-log-entry']` is not a `ChangeLogEntry` (C-008) | `MalformedEntryError` naming the entry's key and one sentence naming the field; nothing returned; body unchanged | Name the record to the user; show nothing from the history |
| recordChange, acknowledge | `profile` is missing or its `id` is not a user profile id | `MissingProfileError`; body unchanged | Show the profile screen (REQ-055) |
| recordChange | `change.records` is empty | `EmptyChangeError`; body unchanged | Do not call for an act that changed nothing; an entry is a change |
| recordChange | a `before` that is not null, or an `after`, is not a `StoredRecord` — a missing or ill-formed header, an id that is not a string, a `kind` outside `RECORD_KINDS`, or a `status` that is not a `RecordStatus` | `InvalidRecordError` naming the position in `records` and the field; body unchanged | Fix the record the owning module handed over; never log a record shape this module cannot read |
| recordChange | a record's `kind` is `change-log-entry` | `SelfLoggingError`; body unchanged | Do not log the log; an acknowledgement is `acknowledge`'s (C-013) |
| recordChange | `before` is not null and its `id` or its `kind` differs from `after`'s | `MismatchedRecordError` naming both refs; body unchanged | Pair each record with itself; two records are two entries of `records` |
| recordChange | `before` is not null and is deep-equal to `after` | `UnchangedRecordError` naming the ref; body unchanged | Do not record a change that did not happen |
| recordChange | `madeForPlatformId` is neither null nor a platform id, or an entry of `affectedPlatformIds` is not a platform id | `InvalidPlatformError` naming the value; body unchanged | Pass the ids `registry` gave; this module does not check that a platform exists |
| acknowledge | no entry of `collections['change-log-entry']` has `fields.entryId` | `UnknownEntryError`; body unchanged | List the queue again and ask again |
| acknowledge | that entry's `entryKind` is `acknowledgement` | `NotAcknowledgeableError`; body unchanged | Acknowledge the change, not the acknowledgement |
| acknowledge | `fields.platformId` is not in that entry's `affectedPlatformIds`, or is its `madeForPlatformId` | `PlatformNotAwaitingError` naming both ids; body unchanged | Acknowledge only what C-010 says that platform awaits |
| acknowledge | a live acknowledgement entry already names that entry and that platform | `AlreadyAcknowledgedError` carrying its id; body unchanged | Show it as acknowledged; do not acknowledge twice |

A body with no `collections['change-log-entry']` is not an error: it has no history, so
`listEntries`, `listHistory`, and `listAwaiting` each resolve empty and the first
`recordChange` creates the collection (C-006). A read never rejects for an id nothing has:
`listHistory` of a ref no entry names resolves empty, whether or not a record of that kind
and id exists anywhere, and `listAwaiting` of a platform id nothing names resolves empty,
whether or not that platform exists — this module holds no platform and cannot say
(C-009, C-010). Only a malformed entry rejects a read.

When two conditions of an operation hold at once, the one signalled is the first of these
that applies, so that a conformance test has one expected rejection and not a choice: a
malformed entry in the collection; a missing profile; then, for `recordChange`, an empty
`records`, an invalid record, a `change-log-entry` record, a mismatched pair, an unchanged
pair, and finally a platform id; and, for `acknowledge`, an unknown entry, an entry that is
an acknowledgement, a platform not awaiting it, and finally one already acknowledged. The
body is unchanged whichever fires.

## 5. Behavioural promises

- **C-001 One act is one entry, stamped with the person who performed it.** After
  `recordChange(body, p, change)` resolves with `{ body: b, entry: e }`: `e.id` is a fresh
  `ChangeLogEntryId` held by no entry of `collections['change-log-entry']`; `e.kind` is
  `'change-log-entry'`; `e.entryKind` is `'record-change'`; `e.status` is `'live'`;
  `e.createdBy` and `e.updatedBy` are `p.id`; `e.createdAtAest` and `e.updatedAtAest` are the
  baseline clock's now; `e.items` has one `ChangedItem` per entry of `change.records`, in the
  order given; `e.madeForPlatformId` is `change.madeForPlatformId`;
  `e.affectedPlatformIds` is `change.affectedPlatformIds` with duplicates removed, in
  ascending order as strings; and `b` differs from `body` only by that one entry of
  `collections['change-log-entry']`. Every act that changes stored data is one such call, so
  who did it and when is stored once, on the entry, and never derived from the changed
  records' headers. (REQ-045; STK-029; SL-05 criteria 1 and 2.)
- **C-002 Each changed field's previous and new value is in the entry.** For an item whose
  `action` is `'edited'`, `fields` holds one `FieldChange` per field whose value in `before`
  is not deep-equal to its value in `after`, in ascending order of `field`, each carrying
  that field's value in `before` as `before` and in `after` as `after`, both exactly as
  stored and neither trimmed, rounded, summarised, or truncated; a field present in one and
  absent from the other carries null on the side it is absent from. `updatedBy` and
  `updatedAtAest` are in no item's `fields`, whatever the action: they are the same fact
  `e.createdBy` and `e.createdAtAest` hold for this act, and a fact is stored once (P3).
  `id` and `kind` are never in `fields` for an `'edited'` item, because a pair that differs
  in either is refused (section 4). Comparison is deep and exact: two `JsonValue`s are the
  same value when they are structurally equal, so a re-saved identical field is not a change
  and a reordered array is. (REQ-045; SL-05 criterion 2.)
- **C-003 The body is a value.** No operation modifies the body passed in: after any call,
  resolved or rejected, that body is deep-equal to what it was. The `body` a changing
  operation returns differs from the one passed in only by the one entry of
  `collections['change-log-entry']` that call added; every other entry of that collection and
  every other collection and sequence is deep-equal to the input's. A collection of a kind
  this module does not own is carried through untouched and unread, however it is shaped, and
  the `StoredRecord` values in `change.records` are read and never held: nothing of an entry
  is the same object as anything passed in. Every field of a stored entry is a `JsonValue`,
  so the body after any operation is deep-equal to itself after JSON serialisation and
  parsing, which is what `store` C-001 carries across a save and a load. (REQ-004 as this
  module's half of it; REQ-045.)
- **C-004 A deletion keeps what the record contained.** An item whose `action` is `'deleted'`
  or `'retired'` carries one `FieldChange` per field of `after`, and per field of `before`
  that `after` does not have, in ascending order of `field` — not only the fields that
  differ — so the entry holds every value the record held at the moment it was deleted or
  retired; and an item whose `action` is `'created'` likewise carries one per field of
  `after`, with `before` null. `updatedBy` and `updatedAtAest` are excluded as C-002 says. A
  record deleted and then read from `listHistory` therefore gives who deleted it
  (`createdBy`), the AEST time (`createdAtAest`), and what it contained (`fields`), whatever
  the record's kind and whether or not its row is still in the body. No operation of this
  contract removes an entry, so that answer survives every later act. (REQ-010; HZ-005;
  SL-05 criterion 1.) *Mitigation clause for HZ-005.*
- **C-005 The action is derived from the status transition, never given.** `RecordedChange`
  carries no action. For each entry of `change.records`, `action` is: `'created'` when
  `before` is null; otherwise `'deleted'` when `after.status` is `'deleted'` and
  `before.status` is not; otherwise `'retired'` when `after.status` is `'retired'` and
  `before.status` is not; otherwise `'edited'`. The four are exhaustive over any pair this
  contract accepts, and a change of status back to `'live'` is `'edited'` — no act of SL-05
  makes one, and the rule leaves no pair without an action. A caller therefore cannot label
  a deletion an edit, and the history cannot read as complete while a removal is hidden in
  it (HZ-005). (REQ-010, REQ-045, REQ-067; SL-05 criteria 1, 2 and 6.)
- **C-006 Entries are appended and never altered.** `recordChange` and `acknowledge` each add
  exactly one entry and change no entry already in the collection: after either resolves,
  every entry that was in `collections['change-log-entry']` before the call is deep-equal to
  what it was, its `status` still `'live'`, and none has been removed. This contract has no
  operation that edits, deletes, retires, or reorders an entry, and none that writes any
  other collection. So the history only grows, an id is never reused, and what `listHistory`
  resolved with for a ref is a prefix of what it resolves with after any later call. A body
  with no `collections['change-log-entry']` gains one on the first `recordChange` or
  `acknowledge`. (REQ-010, REQ-045; HZ-005.)
- **C-007 Confinement.** No operation reads or writes the data folder, the browser's storage,
  or any global state; the only thing outside its arguments an operation reads is the
  baseline clock, and only a changing operation reads it. This module imports no other
  module — not `registry`, not `store`, not `views`, not `profiles` — so it holds no link, no
  platform, and no user profile, and it never checks that a `PlatformId`, a `UserProfileId`,
  or a `RecordRef` it stores names anything that exists. What an id refers to is the owning
  module's; this module records what it was told (DEC-004, DEC-015). (DEC-006; REQ-069 as
  `store`'s to keep.)
- **C-008 A malformed entry is refused or named, never skipped.** An entry of
  `collections['change-log-entry']` is malformed when its key differs from its `id`, its `id`
  is not a `ChangeLogEntryId`, its `kind` is not `'change-log-entry'`, its `status` is not a
  `RecordStatus`, a header id is not a user profile id, a header time is not a
  `TimestampAest`, its `entryKind` is outside the two, or a field its `entryKind` carries is
  missing or of the wrong shape — for a `RecordChangeEntry`, an empty `items`, an item whose
  `ref` is not a kind and an id, whose `action` is outside the four, or whose `fields` is not
  a list of `FieldChange`, a `madeForPlatformId` that is neither null nor a platform id, or
  an `affectedPlatformIds` that is not a list of platform ids; for an `AcknowledgementEntry`,
  an `entryId` that is not a `ChangeLogEntryId` or a `platformId` that is not a platform id.
  Every operation rejects with `MalformedEntryError` naming the entry's key and returns
  nothing, so a history is never shown with an entry silently missing from it and a queue is
  never shown short. An acknowledgement entry naming an `entryId` no entry has is not
  malformed — nothing removes an entry (C-006), so it cannot arise from this contract, and if
  it is in the body it clears nothing and is listed like any other entry. (REQ-010, REQ-045;
  HZ-005.)
- **C-009 The history of one record is complete, ordered, and readable by anyone.**
  `listHistory(body, ref)` resolves with every entry of `collections['change-log-entry']`
  that names `ref`, once each, in ascending order of `createdAtAest` then id, and with
  nothing else: for a `ref` whose `kind` is not `'change-log-entry'`, every
  `RecordChangeEntry` one of whose `items` has a `ref` deep-equal to it; for a `ref` whose
  `kind` is `'change-log-entry'`, every `AcknowledgementEntry` whose `entryId` is its `id`.
  It takes no profile and no platform, so any user reading the working body sees the same
  history for a record, whatever platform they came from and whether or not the record is
  still live. `listEntries(body)` resolves the same way with every entry of both kinds. Both
  resolve empty for a body with no such collection. (REQ-010, REQ-045; STK-017, STK-029;
  SL-05 criteria 1 and 2.)
- **C-010 A change awaits acknowledgement on every other platform it reaches.**
  `listAwaiting(body, platformId)` resolves with every `RecordChangeEntry` whose
  `affectedPlatformIds` hold `platformId`, whose `madeForPlatformId` is not `platformId`, and
  for which no live `AcknowledgementEntry` has that `entryId` and that `platformId`, once
  each, in ascending order of `createdAtAest` then id, and with nothing else — no
  acknowledgement entry, no entry of a platform the act did not reach, no entry the act was
  made for, no duplicate. Each entry it gives carries the whole act: every record the act
  changed, with each field's previous and new value (C-002, C-004), so what is shown to that
  platform is the change and every item it affects. An entry stays in that result until it is
  acknowledged for that platform: no later `recordChange`, no acknowledgement for another
  platform, and no passage of time removes it. (REQ-012; HZ-006; STK-018, STK-026; SL-05
  criterion 4.) *Mitigation clause for HZ-006.*
- **C-011 Acknowledging clears the change for one platform and for no other.** After
  `acknowledge(body, p, { entryId, platformId })` resolves with `{ body: b, entry: a }`:
  `a.entryKind` is `'acknowledgement'`; `a.entryId` and `a.platformId` are as given;
  `a.createdBy` is `p.id` and `a.createdAtAest` is the clock's now; `a.status` is `'live'`;
  and `b` differs from `body` only by that entry. `listAwaiting(b, platformId)` is
  `listAwaiting(body, platformId)` without the entry `entryId` names, and for every other
  platform id `listAwaiting(b, …)` is deep-equal to `listAwaiting(body, …)` — so one owner's
  acknowledgement clears the change from that owner's queue and from nobody else's, and an
  act reaching three platforms is acknowledged three times. The acknowledged entry itself is
  unchanged (C-006) and `listHistory` still gives it, so acknowledging hides nothing from the
  history; `listHistory(b, { kind: 'change-log-entry', id: entryId })` gives the
  acknowledgement, which is who acknowledged and when. Acknowledging the same entry for the
  same platform twice rejects (section 4). (REQ-012; HZ-006; SL-05 criterion 4.)
- **C-012 The queue is keyed by platform and never by an owner.** No field of any entry this
  module writes names a platform's owner, and no operation takes one: `listAwaiting` is a
  function of the body and a `PlatformId` alone, and `acknowledge` stamps who acknowledged
  without asking who was entitled to. So when a platform's owner changes — a change of
  `Platform.ownerProfileId`, which is `registry`'s and touches nothing here — every entry
  that platform was awaiting is still awaiting, unchanged and in the same order, and is what
  `listAwaiting` gives the incoming owner until acknowledged. Nothing of the outgoing owner
  is stored to be migrated, and an acknowledgement recorded by the outgoing owner before the
  transfer stays cleared. Which profile owns a platform, and whether the profile
  acknowledging is that owner, are the consumer's to decide from `registry` and `profiles`.
  (REQ-081; HZ-006; DEC-004; SL-05 criterion 5.)
- **C-013 The log never logs itself.** `recordChange` rejects with `SelfLoggingError` when
  any record of `change.records` has `kind: 'change-log-entry'`, and no operation of this
  contract calls `recordChange`, so no entry is ever written about an entry and appending to
  the history cannot append to it again. An acknowledgement is written by `acknowledge` and
  by nothing else, and is itself an entry rather than a change to one (DEC-015), which is why
  the history of an entry is `listHistory`'s `change-log-entry` case (C-009) and not a second
  collection. (REQ-045; HZ-005.)

Ordering: ascending `createdAtAest` then id for `listEntries`, `listHistory`, and
`listAwaiting` (C-009, C-010); the order the caller gave for an entry's `items` (C-001);
ascending `field` for an item's `fields` (C-002, C-004); ascending as strings for
`affectedPlatformIds` (C-001). The collection is keyed, so the order of its entries is not
data.
Idempotency: every read is harmless and, on the same body, resolves with deep-equal results.
`recordChange` called twice with the same `RecordedChange` writes two entries with two ids:
two identical acts at different moments are two acts, and this module cannot tell a repeat
from a re-record. `acknowledge` twice over the same entry and platform fails the second time
(section 4).
Determinism: with the baseline clock held, every operation is a function of its arguments
and of the ids `IdKind.fresh` returns; a new id is a random UUID, which is the one thing a
conformance test must not assume (DEC-005).
Null and empty semantics: a missing collection reads as empty (C-006); an empty `records` is
refused; an empty `affectedPlatformIds` is stored as given and means the act reaches no
platform, so nobody awaits it; a `madeForPlatformId` of null means the act was not made for a
platform, so every platform in `affectedPlatformIds` awaits it; a field whose stored value is
null is a value, not an absence, and is compared as one (C-002).
Concurrency safety: two copies of Pivot on one folder are the designed case (ASM-004). Each
holds its own working body, so two copies may both record an act and may both acknowledge the
same entry for the same platform before either saves; `store` C-004 keeps the first save when
the second overwrites it, and what `data.json` then holds is that clause's outcome, not this
module's. Within one copy, calls are made one at a time by the caller on the body it holds;
overlapping calls on one body are not promised, and a consumer that discards a returned body
discards the entry.
Side effects: none (C-007).
Tolerance and precision: none; every comparison is exact and deep, and time is compared at
the second resolution of `TimestampAest`.

This module places no fault points at 1.0: it has no partial state to stop in, because every
changing operation adds one entry to one collection of a body it returns whole (C-003, C-006).

## 6. Performance envelope
`recordChange` is linear in the fields of the records it is given plus the entries of
`collections['change-log-entry']` it must read to find a free id; `acknowledge`,
`listEntries`, `listHistory`, and `listAwaiting` are each linear in that collection and touch
no other. No index is kept: a history is a scan. No bound beyond DEC-003's is claimed — the
body is in memory and the folder's I/O is `store`'s — but the collection only grows (C-006),
so it is the collection whose size DEC-003's reversal trigger will be felt on first.

## 7. Trace
Allocated to this module in `trace/requirements.yaml`; mitigations in `trace/hazards.yaml`;
the dependency graph in `modules/change-log/manifest.yaml`, checked against the real imports.
These are the sources, not this list. Checked by `check_traces.py` and `check_boundaries.js`.

Promised at version 1.0: REQ-010 (C-004 with C-005, C-006 and C-009), REQ-012 (C-010 with
C-011), REQ-045 (C-001 with C-002 and C-009), REQ-081 (C-012). HZ-005 is mitigated at C-004
and HZ-006 at C-010.

Expected here and promised nowhere yet: the halves of REQ-012 and REQ-081 that name an
owner and draw a queue on a screen are `views`', written at its own SL-05 CONTRACT session;
REQ-011's list of platforms before a save is `views`' with `registry`'s links behind it; and
REQ-067 and REQ-076, retirement and its refusal, are `registry`'s. None is claimed here.
This module records a retirement as an `ItemAction` (C-005) and nothing more.

## Explicitly not promised
- That any id in an entry names a record that exists. A `RecordRef`, a `PlatformId`, and a
  `UserProfileId` are stored as given and never resolved (C-007): this module imports no
  module that could resolve one, and a reference to a record removed from a body it never
  saw is kept rather than dropped.
- That `affectedPlatformIds` is right. It is the caller's statement of which platforms the
  act reaches, computed from the links the owning module holds (DEC-015). An act recorded
  with a platform missing from that list never reaches that platform's queue, and this module
  cannot tell. Whether `madeForPlatformId` is among them is not checked either.
- Who is entitled to acknowledge. `acknowledge` stamps the profile passed and asks nothing
  else; that the profile owns the platform is the consumer's, from `registry`'s
  `Platform.ownerProfileId` and `profiles`.
- Any grouping, filtering, paging, or search over entries beyond the three lists of section 2:
  by author, by date, by kind, by platform, or by action. The dashboard's open items are
  REQ-066 and REQ-068, at SL-11.
- Any entry for an act that changed nothing, and any collapsing of two acts into one or
  splitting of one act into two. One call is one entry (C-001); a caller that makes two calls
  for what a user saw as one act has recorded two acts.
- Undoing or reverting a change from its entry. An entry is a record of what happened, not a
  patch; nothing here writes another module's collection (C-006).
- Removing, archiving, compacting, or expiring entries, and any bound on the collection's
  size. The history only grows (C-006); what that costs the one-file format is DEC-003's and
  DEC-005's.
- The wording of anything shown to the user, which screen shows it, and how a `FieldChange`
  is rendered — a field's name is the stored field's name, not a label. This module records;
  `views` speaks.
- Whether a returned entry is the same object as the entry in the returned body, or a copy.
  Treat every returned value as read-only.
- The order of entries inside the collection, or anything about the body a consumer reads
  directly rather than through this contract. `DataBody` is baseline;
  `collections['change-log-entry']` is this module's to interpret.
- What a consumer may do with a body between calls, including saving it. `store` C-002
  decides what a save needs; this module only requires a profile to stamp an entry.
