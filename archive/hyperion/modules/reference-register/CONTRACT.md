# Contract: reference-register
Version: 1.0 · Status: draft

Written for SL-10. Promises the reference register STK-003 asks for, from one collection: one
entry per reference a user keeps, holding any combination of a name, a link, a path, and a
file; the file kept in the data folder with only its location on the entry; the records the
entry is linked to; and the answer to whether a stored file is still there, so an entry that
has lost its file can be flagged (REQ-028, REQ-029, REQ-030, REQ-031, REQ-078). It owns the
record kind `reference-entry`, which baseline has carried since it was instantiated and which
`review-schedule` 1.0 already schedules without owning (review-schedule C-011).

It is the one record module that reaches the data folder, and it reaches it for the file and
nothing else: `store.putStoredFile` to keep a carried file and `store.checkStoredFiles` to ask
whether one is still there (store 3.0, C-018 and C-019). That is DEC-006's single carve-out,
written into that decision before this module existed — "a record module whose records include
files in the folder (`reference-register`, REQ-029) imports `store` for the file operation and
nothing else". Every operation that does not touch a file is a function of the working
`DataBody` like every other record module's (C-007).

Nothing here knows what a hazard, a control, or a platform is. An entry names what it is linked
to by a baseline `RecordRef` and this module resolves no id and imports no module that could
(C-008), so an entry may be linked to a `report` at 1.0 although no module owns that kind until
SL-09. For the same reason the platforms a change to an entry reaches are named by the caller
and never derived here (DEC-020), as they are for `change-log` (DEC-015).

SL-10 criterion 1 says an entry can be created "with any combination of a name, a link, a path,
and a file, including one of them alone", which admits two readings of the empty combination.
On the first, "any combination" includes none of them, so an entry with nothing in it is
created and shown back. On the second, "including one of them alone" is the floor the criterion
is establishing — the weakest case that must work — and an entry with none of the four is
refused. This version promises the second (C-001), because an entry with no name, no link, no
path, and no file refers to nothing, cannot be told from any other such entry, and would be
flagged as an open item the moment it was made (REQ-068, SL-11 criterion 4) with nothing a user
could do to it but delete it. The first reading is not unreasonable and is recorded here rather
than passed over; if it is the intended one, C-001 is the clause that changes and the change is
an Interface one.

SL-10 criterion 4 says an entry is flagged when its file **or path** cannot be found. This
version answers for the file (C-010) and promises nothing about a path. A path is a place on
some machine's filesystem, which a browser page was never handed a handle for and cannot stat
under DEC-003, so no module can answer it — the gap is DEC-022's, recorded there as an open
GATE ruling and carried in `docs/slices/SL-10.md`, not closed or worked around here.

## 1. Purpose
Hold the reference register — one entry per reference, with what the user entered, where its
file was kept, and what it is linked to — each entry once, under an ID that is never changed or
reused.

## 2. Operations
In `contract.js`. Every operation is asynchronous and returns a promise (DEC-012). Every
operation is a function of the `DataBody` passed in and, for the ones that change it, of the
baseline clock and of `change-log.recordChange` (C-011). Two operations also take a `DataStore`
and reach the folder through `store`, and only those two: `createEntry` writes a file through
`store.putStoredFile` when one is given, and `checkEntryFiles` reads through
`store.checkStoredFiles` (C-007). A consumer holds the working body from `store.load`, replaces
it with the `body` each changing operation returns, and passes it to `store.save` when the user
saves.

| Operation | Signature | Verified by |
|---|---|---|
| createEntry | `(body: DataBody, act: EntryAct, store: DataStore, fields: EntryFields) → EntryChange` | conformance |
| linkEntry | `(body: DataBody, act: EntryAct, fields: EntryLinkFields) → EntryChange` | conformance |
| listEntries | `(body: DataBody) → readonly ReferenceEntry[]` | conformance |
| getEntry | `(body: DataBody, id: ReferenceEntryId) → ReferenceEntry \| null` | conformance |
| checkEntryFiles | `(body: DataBody, store: DataStore) → readonly EntryFileState[]` | conformance |

A conformance test starts from `schema.emptyDataBody()` or a body it builds, holds the baseline
clock where a clause names it, and opens a `DataStore` on `store`'s in-memory folder through
`modules/store/conformance/harness` rather than writing a second one, as `profiles`' and
`views`' suites do (CORE-CON-003 permits a conformance suite to be imported from test code).
The refs it links are `RecordRef` values built in test code, which is what this module sees of
every kind whoever owns it (C-008). What an act recorded is read back through `change-log`'s own
contract — `listEntries`, `listHistory`, `listAwaiting` — and never by reading
`collections['change-log-entry']` itself, as `registry`'s and `review-schedule`'s suites do:
what an entry holds is `change-log`'s to promise, and this suite checks only that the act this
module performed is the act that was recorded (C-011).

## 3. Data shapes
From `baseline/types.js`: `ReferenceEntryId`, `PlatformId`, `UserProfileId`, `ActiveProfile`,
`RecordKind`, `RecordStatus`, `RecordRef`, `TimestampAest`. From `baseline/schema.js`:
`DataBody`, whose `collections['reference-entry']` is the one collection this module reads and
writes. `collections['change-log-entry']` is not among them: it is `change-log`'s, and this
module only ever adds to it by calling that contract (C-007, C-011). From
`modules/store/contract.js`: `DataStore`, `IncomingFile`, `StoredFileLocation`. Defined in
`contract.js`:

**What may be linked**: `LINKABLE_KINDS`, the six `RecordKind` values SL-10 criterion 3 and
REQ-030 name — `hazard`, `causal-factor`, `consequence`, `platform`, `control`, `report`. A
`ref` of any other kind is refused (C-008). `reference-entry` is not among them: an entry is not
linked to another entry at 1.0.

**The two text kinds**, branded rather than left bare strings so that one cannot be assigned to
the other's field (IMP-05, CORE-CON-001 *Units and frames*):

- `ExternalLinkText`: an address of something somewhere else, as the user typed it once
  trimmed. Never opened, fetched, resolved, or checked.
- `FilesystemPathText`: a place on some machine's filesystem, as the user typed it once
  trimmed. Never opened, resolved, or checked (DEC-003, DEC-022).

A link and a path are the confusable pair of this contract: both are text a user types into a
form, both name something outside Pivot, and swapping them is invisible in a diff and on a
rendered screen. The brand is what lets `check_units.py`'s confusion probe reject the swap;
without it the type check accepts it and the distinction carries exactly the durability of the
comment it replaced. Both are distinct from `StoredFileLocation`, which is neither: a location
is Pivot's own, relative to the data folder, and is produced by `store.putStoredFile` and never
typed (store C-018).

**The record**, the baseline record header narrowed to this kind and id plus its own fields
(DEC-005), in `collections['reference-entry']` keyed by its id:

- `ReferenceEntry`: `kind: 'reference-entry'`, `id: ReferenceEntryId`, `name: string | null`,
  `link: ExternalLinkText | null`, `path: FilesystemPathText | null`,
  `fileLocation: StoredFileLocation | null`, and `links: readonly RecordRef[]`. At least one of
  the four content fields is not null (C-001). Each is null exactly when the user did not give
  it. `fileLocation` is the whole of what the entry holds about its file; the contents are
  never on the record and never in `DataBody` (C-003). `links` holds everything the entry is
  linked to, each ref once, ascending by kind then id (C-008, C-009).

**The act**, what a consumer supplies to each changing operation:

- `EntryAct`: `{ profile: ActiveProfile, madeForPlatformId: PlatformId | null,
  affectedPlatformIds: readonly PlatformId[] }` — `registry`'s `Act` plus the platforms the act
  reaches, which is `review-schedule`'s `ScheduleAct` (DEC-020). The profile stamps the header.
  The other two are not stored on an entry: they are passed through to the entry C-011 writes,
  where they decide which platforms await the act (`change-log` C-010). All three are required
  and never defaulted (C-011). `affectedPlatformIds` is the caller's statement, computed from
  `registry.platformsAffected` over the records this entry is linked to; this module holds no
  link to a platform and neither checks nor completes it (DEC-020).

**Field bundles** a consumer supplies: `EntryFields`
`{ name: string | null, link: string | null, path: string | null, file: IncomingFile | null }`
— the link and the path as the user typed them, branded on the way in (C-001), and the file as
the user chose it, handed to `store.putStoredFile` and never stored (C-003). `EntryLinkFields`
`{ entryId: ReferenceEntryId, ref: RecordRef }` — one call, one link.

**Changes**, what a changing operation returns: `EntryChange` `{ body: DataBody, entry:
ReferenceEntry }`, the body as it now is and the entry as it now is. The body passed in is
untouched (C-002).

**Reads**:

- `EntryFileState`: `{ entryId: ReferenceEntryId, location: StoredFileLocation | null, flagged:
  boolean, reason: 'missing' | 'inaccessible' | 'not-a-stored-file-location' | null }` —
  whether one entry's file is there to be opened. `reason` is `store`'s, unchanged (store
  C-019); `flagged` is true exactly when the entry has a location whose file could not be
  opened. Both are false and null for an entry with no file (C-010).

A `name` is what the user typed with leading and trailing whitespace removed, and so are a
`link` and a `path`. Every time in a record is a `TimestampAest`; an entry's id comes from
`types.referenceEntryId.fresh` (DEC-005). "Linked" everywhere in this contract means a ref in
the entry's own `links`, and nothing else: this module writes no `Link` record and reads none
(DEC-023).

## 4. Error conditions
Signalled as a rejected promise carrying the named error class. "Body unchanged" means the body
passed in is deep-equal to what it was before the call, which C-002 promises of every call, and
that nothing was returned as a new body. "No file written" means no file was kept under
`files/` by the call, which is store C-018's whole-or-not-at-all seen from here (C-004).

| Operation | Condition | Signalled as | Caller obligation |
|---|---|---|---|
| every operation that reads the collection | an entry of `collections['reference-entry']` is not a `ReferenceEntry` (C-006) | `MalformedEntryError` naming the entry's key and one sentence naming the field; nothing returned; body unchanged; no file written | Name the record to the user; show nothing from the register |
| createEntry, linkEntry | `act` is missing, or `act.profile` is missing, or its `id` is not a user profile id | `MissingProfileError`; body unchanged; no file written | Show the profile screen (REQ-055) |
| createEntry, linkEntry | `act.madeForPlatformId` is absent or is neither null nor a platform id, or `act.affectedPlatformIds` is absent or is not a list of platform ids | `InvalidActError` naming the value; body unchanged; no file written | Pass the platform the screen is on, or null, and the platforms `registry.platformsAffected` gives; never leave either off (DEC-016, DEC-020) |
| createEntry | `fields.name`, `fields.link`, or `fields.path` is given and empty once trimmed, checked in that order | `InvalidFieldError` naming the field; body unchanged; no file written | Ask for the field or leave it out; a blank is not an absence |
| createEntry | all four of `fields.name`, `fields.link`, `fields.path`, and `fields.file` are absent | `EmptyEntryError`; body unchanged; no file written | Ask for at least one of the four (C-001, and the reading recorded above) |
| createEntry | `change-log` cannot read `collections['change-log-entry']` | `MalformedEntryError`, `change-log`'s, unchanged; body unchanged; no file written | Name the entry to the user; nothing may be changed while the history cannot be read (C-004) |
| createEntry | `store.putStoredFile` rejects — no active profile, a malformed `IncomingFile`, or a write that did not complete | that error unchanged (`NoActiveProfileError`, or `StoreWriteError` at `stage: 'stored-file'`); no file left under `files/`; body unchanged; no entry created | Tell the user the file was not kept and that no entry was made; offer the file again |
| linkEntry | no entry of the collection has `fields.entryId`, live or otherwise | `UnknownEntryError`; body unchanged | List the register again and ask again |
| linkEntry | the entry has a status other than `live` | `EntryNotLiveError` carrying the status; body unchanged | Say the entry is deleted |
| linkEntry | `fields.ref` is not a `RecordKind` and an id together | `InvalidRefError` naming the value; body unchanged | Name the record by its kind and its id |
| linkEntry | `fields.ref.kind` is a `RecordKind` outside `LINKABLE_KINDS` | `UnlinkableKindError` carrying the kind; body unchanged | Do not offer that kind for a link at this version (section 7) |
| linkEntry | the entry's `links` already holds a ref deep-equal to `fields.ref` | `DuplicateLinkError` carrying the ref; body unchanged | Show it as already linked; do not link twice |
| createEntry, linkEntry | `change-log.recordChange` rejects | that error unchanged; body unchanged | Name the entry to the user; nothing may be changed while the history cannot be written (C-011) |
| checkEntryFiles | the data folder cannot be read | `StoreReadError` with `reason: 'inaccessible'`, `store`'s, unchanged | Offer to choose the folder again |

A body with no `collections['reference-entry']` is not an error: it has no entries, so
`listEntries` and `checkEntryFiles` resolve empty, `getEntry` resolves with null, and the first
`createEntry` creates the collection (C-005). A read never rejects for an id nothing has:
`getEntry` resolves with null whether or not an entry of that id ever existed. A file that is
not there is not an error either: it is `flagged: true` with a reason (C-010).

When two conditions of an operation hold at once, the one signalled is the first of these that
applies, so that a conformance test has one expected rejection and not a choice: a malformed
entry in the collection; a missing profile; an ill-formed act; then, for `linkEntry`, an
unknown entry, an entry that is not live, a ref that is not a kind and an id, an unlinkable
kind, and a duplicate link; and, for `createEntry`, a blank field, an entry with none of the
four, a history that cannot be read, and then whatever `store.putStoredFile` rejects with; and
last, for both, whatever `change-log.recordChange` rejects with, which is reached only once
everything else has been accepted. The body is unchanged and no file is written whichever
fires. So a blank name on an entry that also has no other field is `InvalidFieldError` and not
`EmptyEntryError`, and an unlinkable kind on an entry that is not live is `EntryNotLiveError`.

## 5. Behavioural promises

- **C-001 An entry holds what was entered, and at least one of the four.** After
  `createEntry(body, act, store, fields)` resolves with `{ body: b, entry: e }`: `e.id` is a
  fresh `ReferenceEntryId` held by no entry of `collections['reference-entry']`; `e.kind` is
  `'reference-entry'`; `e.status` is `'live'`; `e.createdBy` and `e.updatedBy` are
  `act.profile.id`; `e.createdAtAest` and `e.updatedAtAest` are the baseline clock's now;
  `e.name` is `fields.name` trimmed or null; `e.link` is `fields.link` trimmed as an
  `ExternalLinkText` or null; `e.path` is `fields.path` trimmed as a `FilesystemPathText` or
  null; `e.links` is empty; and `getEntry(b, e.id)` is deep-equal to `e`. Each of the four is
  null exactly when the caller gave null for it, so an entry created with one of them alone has
  that one and three nulls and is shown back as entered. At least one of `e.name`, `e.link`,
  `e.path`, and `e.fileLocation` is not null: all four absent rejects with `EmptyEntryError`,
  and a `name`, `link`, or `path` given but empty once trimmed rejects with `InvalidFieldError`
  naming it, so a typed value is never silently turned into an absence. No operation of this
  contract changes an entry's id afterwards, and no id is reused: a fresh id is held by no entry
  whatever its status. (REQ-028; SL-10 criterion 1.)
- **C-002 The body is a value.** No operation modifies the body passed in: after any call,
  resolved or rejected, that body is deep-equal to what it was. The `body` a changing operation
  returns differs from the one passed in only in the one entry of `collections['reference-entry']`
  that operation's clause names, and in the one entry of `collections['change-log-entry']` that
  operation's act added (C-011); every other collection, every other entry of the collections it
  does touch, and every sequence is deep-equal to the input's. A collection of a kind this module
  does not own is carried through untouched and unread, however it is shaped. Every field of a
  stored entry is a string, a boolean, null, or an array of objects whose fields are strings, so
  the body after any operation is deep-equal to itself after JSON serialisation and parsing,
  which is what `store` C-001 carries across a save and a load. (REQ-004 as this module's half of
  it.)
- **C-003 A carried file is in the folder, and only its location is on the entry.** When
  `fields.file` is not null, `createEntry` keeps it by calling `store.putStoredFile(store,
  act.profile, fields.file)` exactly once and sets `e.fileLocation` to the location that call
  resolved with, unchanged. When it resolves, that location opens and yields `fields.file.bytes`
  byte-for-byte (store C-018). No field of `e`, and no entry of any collection of `b`, holds the
  file's bytes, its size, its type, a hash of it, or any part of its contents: what crosses back
  into the body is the location alone, so the stored record can be inspected and shown to hold
  no file contents. When `fields.file` is null, `e.fileLocation` is null,
  `store.putStoredFile` is not called, and nothing is written to the folder at all (C-007). The
  location is `store`'s to produce and opaque here: this module does not parse it, build one,
  compare one to a file name, or assume any relation between it and `fields.file.name` (store
  3.0, *Explicitly not promised*). (REQ-029 as this module's half of it, store C-018 being the
  other; SL-10 criterion 2.)
- **C-004 A refused entry leaves no file and no record.** `createEntry` accepts the fields and
  reads the history before it writes anything: `InvalidFieldError`, `EmptyEntryError`,
  `MissingProfileError`, `InvalidActError`, and a `collections['change-log-entry']` that
  `change-log` cannot read all reject before `store.putStoredFile` is called, so a rejected
  create keeps no file and the folder is as it was. When `store.putStoredFile` itself rejects, no
  file remains under `files/` (store C-018) and no entry is created. When
  `change-log.recordChange` rejects, the operation rejects with that error and the body passed in
  is unchanged, so no entry is stored without its log entry and none without its record. There is
  one window this clause does not close: a file kept by a `putStoredFile` that resolved, followed
  by a `recordChange` that rejected, leaves the file in the folder with no entry naming it. It is
  kept, unreferenced, and nothing collects it — which is store's stated position on a stored file
  whose record was never saved (store 3.0, *Explicitly not promised*), and is why the history is
  read first rather than last: the one cause of that rejection a body this module wrote can have
  is a `change-log` collection it cannot read, and that is checked before the file is written.
  (REQ-029; SL-10 criterion 2.)
- **C-005 The list is complete and ordered, and a read never rejects for an id nothing has.**
  `listEntries` resolves with every entry of `collections['reference-entry']` whose status is
  `'live'`, once each, in ascending order of `createdAtAest` then id, and with nothing else: no
  deleted entry, no record of another kind. It resolves with an empty list when the body has no
  such collection or the collection is empty. `getEntry` resolves with the entry whatever its
  status, and with null when no entry has the id, whether or not one ever did. Each entry is
  given as stored, with its `name`, `link`, and `path` exactly as they were trimmed and stored
  and neither re-trimmed nor normalised further. (REQ-028; SL-10 criterion 1.)
- **C-006 A malformed entry is refused or named, never skipped.** An entry of
  `collections['reference-entry']` is malformed when its key differs from its `id`, its `id` is
  not a `ReferenceEntryId`, its `kind` is not `'reference-entry'`, its `status` is not a
  `RecordStatus`, a header id is not a user profile id, a header time is not a `TimestampAest`,
  one of `name`, `link`, `path`, and `fileLocation` is absent or is neither a string nor null,
  all four are null, or `links` is absent, is not a list, or holds something that is not a
  `RecordRef` whose `kind` is in `LINKABLE_KINDS`. Every operation that reads the collection
  rejects with `MalformedEntryError` naming the entry's key and returns nothing, so a register is
  never shown with an entry silently missing from it and `checkEntryFiles` never returns a short
  list that would read as every entry's file being present. A blank stored `name`, `link`, or
  `path` is malformed only in that C-001 would not have created it; it is listed, not refused, so
  an entry is never hidden for its content. (REQ-028.)
- **C-007 Confinement.** No operation reads or writes the browser's storage or any global state.
  The only things outside its arguments an operation reads are the baseline clock, which only a
  changing operation reads; `change-log.recordChange`, which only a changing operation calls; and
  `store.putStoredFile` and `store.checkStoredFiles`, which are the only two operations of any
  module by which this one reaches the data folder. `createEntry` calls `store.putStoredFile`
  exactly once when `fields.file` is not null and not at all when it is null; `checkEntryFiles`
  calls `store.checkStoredFiles` exactly once; `linkEntry`, `listEntries`, and `getEntry` touch
  the folder not at all and take no `DataStore`. Nothing here calls `store.save`, `store.load`,
  `store.restore`, `store.noteChange`, or any other operation of that contract, so this module
  never writes `data.json`, never mirrors, and never decides what a save needs. It imports
  `modules/store/contract` and `modules/change-log/contract` and no other module — not
  `registry`, not `views`, not `rating`, not `profiles`, not `review-schedule` — so it holds no
  hazard, no platform, and no user profile, and it never checks that a `RecordRef`, a
  `PlatformId`, or a `UserProfileId` it stores names anything that exists. Both modules it
  imports import no module themselves, so the graph stays acyclic (DEC-004, DEC-006, DEC-015).
- **C-008 An entry is linked to one of six kinds, once per record, and no id is ever resolved.**
  After `linkEntry(body, act, { entryId, ref })` resolves with `{ body: b, entry: e }` for a live
  entry: `e.links` is the entry's links before plus `ref`, each ref once, ascending by `kind`
  then `id` as strings; `e.updatedBy` is `act.profile.id` and `e.updatedAtAest` is the clock's
  now; `e.id`, `e.kind`, `e.status`, `e.createdBy`, `e.createdAtAest`, `e.name`, `e.link`,
  `e.path`, and `e.fileLocation` are what they were; and `b` differs from `body` only by that
  entry and the entry of C-011. `ref.kind` is one of `LINKABLE_KINDS` and a `RecordKind` outside
  them is refused, on this operation and on every read, so no entry this module wrote is linked
  to a kind REQ-030 does not name. Within those six this module resolves nothing: it never asks
  whether a record of that kind and id exists, whether it is live, whether it is on a platform,
  or what it contains, and it imports no module that could tell it (C-007). So an entry may be
  linked to a `report` although no module owns that kind until SL-09; a link survives the record
  it names being deleted or retired by its owner, because nothing here is told; and two refs that
  share an id string across two kinds are two links, since a ref is a kind and an id together. A
  second link to a ref the entry already holds rejects with `DuplicateLinkError`; an unknown or
  not-live entry rejects; the body is unchanged. One entry may be linked to any number of
  records, and one record may be linked from any number of entries: a link is stored on the
  entry and copies no field of what it names, so a change to a hazard's title is a change to the
  one record every entry linked to it reads (DEC-023). (REQ-030; SL-10 criterion 3.)
- **C-009 Everything an entry is linked to is on the entry.** For any entry, `getEntry(body,
  id).links` and the `links` of that entry in `listEntries(body)` are the same list: every ref a
  `linkEntry` on that entry has added and no other, each once, in C-008's order, whatever the
  kinds and whatever became of the records named. Nothing else in this contract writes, reorders,
  or removes a ref, and no ref is held anywhere but on the entry, so there is no second place a
  link could be recorded and no list of an entry's links that could disagree with this one
  (DEC-023). The refs are what this module gives; resolving each to something a user can read —
  a hazard's title, a platform's name — is the consumer's, from the module that owns the kind
  (C-007, C-008). (REQ-031; SL-10 criterion 3.)
- **C-010 An entry whose file has gone is told from one whose file is there.**
  `checkEntryFiles(body, store)` resolves with one `EntryFileState` per entry of
  `listEntries(body)`, in that order, and with nothing else. For an entry whose `fileLocation` is
  null: `location` is null, `flagged` is false, `reason` is null, and nothing about it is asked
  of the folder. For an entry whose `fileLocation` is not null: `location` is that location
  unchanged, and `flagged` and `reason` are the negation of `present` and the `reason` of the
  `StoredFilePresence` that `store.checkStoredFiles` gave for it — `flagged: false, reason: null`
  when the file is there to be opened, and `flagged: true` with `missing`, `inaccessible`, or
  `not-a-stored-file-location` when it is not (store C-019). Every live entry is in the result,
  so a consumer flags a whole list from one call and one read of the folder rather than one read
  per row, and an entry cannot be flagged in one list and unflagged in another (REQ-078 as the
  fact behind it; which lists show the flag is `views`'). A file that is not there is a value and
  never a rejection; only the data folder itself being unreadable rejects, with `store`'s error
  unchanged. The answer is a function of the folder's contents at the call, so a file put back by
  hand is unflagged on the next call. This clause answers for a stored file and for nothing else:
  an entry's `path` is not asked about, is never part of `flagged`, and is not answered by this
  contract or any other (DEC-022; the preamble's second reading). (REQ-078 in part; SL-10
  criterion 4, for the file half only.)
- **C-011 No change this module makes is unrecorded, and no entry is written without its log
  entry.** Each of `createEntry` and `linkEntry` calls `change-log.recordChange` exactly once,
  with `act.profile` and a `RecordedChange` whose `records` are the one entry its clause names,
  as it was — null for `createEntry`, which created it — and as it now is; `madeForPlatformId` is
  `act.madeForPlatformId` unchanged and `affectedPlatformIds` is `act.affectedPlatformIds`
  unchanged, neither derived here (DEC-020). So the body each resolves with holds exactly one
  entry of `collections['change-log-entry']` that its input did not, and that entry is the one
  act (`change-log` C-001), whose item action `change-log` derives from the status transition and
  this module never states (`change-log` C-005): a created entry is `created` and a link added to
  one is `edited`, carrying `links` as it was and as it now is. There is no operation of this
  contract that writes an entry and no log entry, so creating a reference and linking one are
  each in the history with the previous and new value of every field that changed (`change-log`
  C-002), which is what puts this record kind under REQ-010's and REQ-045's clauses. When
  `recordChange` rejects, the operation rejects with that error and the body passed in is
  unchanged (C-004 for the file). `change-log`'s `UnchangedRecordError` is unreachable from here:
  `createEntry` passes a null `before`, and `linkEntry` always adds a ref the entry did not hold,
  a duplicate having been refused already. A read of this contract writes nothing and records
  nothing. (REQ-010, REQ-012, REQ-045 as `change-log`'s, reachable for this kind only through
  this clause; HZ-005, HZ-006; DEC-016, DEC-020.)

Ordering: ascending `createdAtAest` then id for `listEntries` (C-005) and so for
`checkEntryFiles`, which follows it (C-010); ascending `kind` then `id` as strings for an
entry's `links` (C-008); `name`, then `link`, then `path` for which blank field is named first
(section 4). The collection is keyed, so the order of its entries is not data.
Idempotency: every read is harmless and, on the same body, resolves with deep-equal results —
except `checkEntryFiles`, which is a function of the folder as well and answers differently when
the folder changes between calls (C-010). `createEntry` twice with equal fields yields two
entries with two ids and, when a file was given, two files at two locations: two references are
two references, and a location is fresh on every call (store C-018). Linking twice fails the
second time (C-008).
Determinism: with the baseline clock held, every operation is a function of its arguments, of
the ids `types.referenceEntryId.fresh` returns, and, for the two that touch the folder, of the
folder's contents. A new id is a random UUID and a `StoredFileLocation` is `store`'s to choose;
neither is a thing a conformance test may assume (DEC-005, store C-018).
Null and empty semantics: a missing collection reads as empty (C-005); a field the user left out
is null and a field they typed blank is refused (C-001); an entry with none of the four is
refused (C-001); an entry with no links has an empty `links` and is not an error, and flagging it
as an open item is REQ-068's at SL-11; an entry with no file is never flagged (C-010); an empty
`affectedPlatformIds` is passed through as given and means the act reaches no platform, so
nobody awaits it (`change-log` C-001).
Concurrency safety: two copies of Pivot on one folder are the designed case (ASM-004). Each
holds its own working body, so two copies may both create an entry before either saves; `store`
C-004 keeps the first save when the second overwrites it, and what `data.json` then holds is
that clause's outcome, not this module's. Files are not subject to that race: a location is
fresh on every call, so two copies keeping a file of the same name keep two files and neither
overwrites the other (store C-018). A file whose entry was in a body that lost the save is kept,
unreferenced (C-004). Within one copy, calls are made one at a time by the caller on the body it
holds; overlapping calls on one body are not promised, and a consumer that discards a returned
body discards the entry and its log entry together — though not the file, which is in the folder
already.
Side effects: the one file `createEntry` keeps through `store.putStoredFile`, and nothing else
(C-003, C-007).
Tolerance and precision: none; every comparison is exact and deep, and time is compared at the
second resolution of `TimestampAest`.

This module places no fault points at 1.0. The one partial state it could have is a file kept
with no entry, and it is reachable through `store`'s own fault point `store.stored-file.staged`
and through a `change-log` collection the suite makes unreadable, which is what C-004's two
directions are tested by; nothing else here stops part-way, because every changing operation
returns one whole body or rejects and leaves the one it was given (C-002).

## 6. Performance envelope
`createEntry` is linear in `collections['reference-entry']` to find a free id, plus
`change-log.recordChange`'s cost, plus one `store.putStoredFile` when a file is given, which is
the file's size in the folder's I/O. `linkEntry` is linear in the one entry's `links` plus
`recordChange`'s cost. `listEntries` and `getEntry` are linear in the collection and touch no
other. `checkEntryFiles` is one `store.checkStoredFiles` over the live entries that carry a
file, which is one listing of `files/` however many entries there are (store C-019), plus the
cost of `listEntries`. No index is kept and no result is cached across calls. No bound beyond
DEC-003's is claimed: the body is in memory, and the folder's I/O is `store`'s. `files/` only
grows, because nothing in this version or in `store` 3.0 removes from it.

## 7. Trace
Allocated to this module in `trace/requirements.yaml`; the dependency graph in
`modules/reference-register/manifest.yaml`, checked against the real imports. These are the
sources, not this list (DEC-011 retired `docs/module-map.md`). Checked by `check_traces.py` and
`check_boundaries.js`.

Promised at version 1.0: REQ-028 (C-001 with C-005), REQ-030 (C-008), REQ-031 (C-009). All
three are written to `allocated_to: reference-register` by this session. SL-10 names no hazard
(`trace/slices.yaml`), so this contract carries no mitigation clause.

Not claimed at version 1.0, and deliberately: REQ-029 is `store`'s, allocated there by the
`store` 3.0 session, because allocation names exactly one module and `store` owns keeping the
file in the folder (store C-018). This module's half of it is C-003 — the entry holds the
location and never the contents — stated as a clause and not as a second allocation, in the way
store C-008 splits REQ-053 from REQ-054 and REQ-073.

Not claimed at version 1.0, and expected at `views`' own CONTRACT session: REQ-078. C-010
supplies the fact — whether each entry's file is there — and flagging the entry "wherever it is
listed" is the screen's, so its `allocated_to` is `views`' to write, as REQ-002's and REQ-009's
were at SL-03 and SL-04 and REQ-019's and REQ-023's at SL-06. It is left `TBD` rather than
allocated on `views`' behalf. REQ-078 is in any case verifiable for the file half only; the path
half is DEC-022's open GATE ruling.

Not claimed at version 1.0, and reachable only through this version: REQ-010, REQ-045, and, for
a change that reaches a platform, REQ-012 are `change-log`'s. C-011 is what every act of this
module reaches them by — without it a reference entry could be created or linked with no entry,
for a record kind `change-log` 1.0 was written before any module owned.

REQ-067's fourth kind is **not** closed by this version and is recorded here so it is not
discovered as a gap. REQ-067 names a hazard, a control, a platform, and a reference register
entry as retirable; it is allocated to `registry`, which owns the first three, and registry
CONTRACT.md section 7 recorded that the fourth "will need either a requirement of its own or a
reallocation of REQ-067, which is a GATE decision at SL-10 and not this session's to take".
SL-10 does not claim REQ-067 in `trace/slices.yaml` and none of its criteria mentions
retirement, so this contract adds no `retireEntry`: adding one would be this session deciding a
requirement's allocation across two modules, which is the human's (P10). At 1.0, REQ-067 is
verified for a hazard, a control, and a platform only, exactly as registry 4.0 left it. The
`RecordStatus` of an entry is baseline and this contract reads it (C-005, C-006), so a later
version that gains the ruling gains the operation without a change to the stored shape.

REQ-035 — that adding a platform changes or deletes no existing reference register entry — is
`registry`'s and is promised by registry C-014, which names "every collection of a kind this
module does not own, the reference register's included". This module makes no claim on it; C-002
is the converse, that this module leaves `registry`'s collections alone.

## Explicitly not promised
- Editing an entry. No operation of this version changes a `name`, a `link`, a `path`, or a
  `fileLocation` once stored; only `links` grows (C-008). A reference a user wants to correct is
  a later version, which is an Interface change that must decide what happens to a replaced
  file, since `files/` has no removal (store 3.0).
- Unlinking. Nothing here removes a ref from an entry's `links`, so a link made in error is
  answered by the history (C-011) rather than by a reversal. SL-10 criterion 3 asks for linking
  and for listing what is linked, not for undoing; adding an unlink is a later version that must
  decide what the act is called in the log.
- Deleting, retiring, or un-retiring an entry. `EntryNotLiveError` exists because a status is
  baseline and a body may hold an entry this version did not write, not because anything here
  sets one. Retirement is REQ-067's fourth kind and needs the GATE ruling named in section 7.
- Linking an entry to another entry, to a justification, to a rating, to a workflow record, to a
  review schedule, or to a change log entry. `LINKABLE_KINDS` is the six REQ-030 names and
  widening it is an Interface change to this module.
- That a `ref` names a record that exists, is live, or is of the kind it claims, and that a
  `PlatformId` or a `UserProfileId` names anything. All are stored as given and never resolved
  (C-008): this module imports no module that could resolve one. A link to a record removed from
  a body it never saw is kept rather than dropped.
- That `affectedPlatformIds` is right, or complete. It is the caller's statement of which
  platforms the act reaches, computed from the links `registry` holds (DEC-015, DEC-020). An act
  recorded with a platform missing from that list never reaches that platform's queue, and this
  module cannot tell. Whether `madeForPlatformId` is among them is not checked either.
- Anything about a `path` a user typed: that it exists, is reachable, is well formed, is
  absolute, or names the same thing on two machines. It is text, stored and given back (C-001).
  The path half of REQ-078 and of SL-10 criterion 4 has no mechanism in any module and is an
  open GATE ruling (DEC-022, Consequences).
- Anything about a `link` a user typed: that it is a URL, that its scheme is one a browser will
  open, that it resolves, or that it still points at what it did. Nothing here opens or fetches
  one, and nothing warns about one.
- The contents, integrity, type, size, or safety of a stored file. `store` writes the bytes as
  given and checks none of it (store 3.0, DEC-022), and this module never holds them (C-003). A
  file altered or truncated after Pivot wrote it is reported present by C-010; only presence is
  promised.
- Removing, moving, renaming, or replacing a stored file, and any bound on what `files/` holds.
  `store` 3.0 promises no removal, so a file whose entry is deleted, or whose `createEntry`
  failed after the file was kept (C-004), stays in the folder unreferenced and nothing collects
  it.
- That two entries with equal fields are the same entry, or that a `name`, a `link`, or a `path`
  is unique, has a maximum length, or is normalised beyond trimming. Two `createEntry` calls with
  equal fields are two references.
- Any grouping, filtering, paging, search, or count over entries beyond the two lists of
  section 2 — by kind linked to, by whether a file is flagged, by platform, or by author. The
  filter by reference entry is REQ-047 and the open-items list is REQ-066 and REQ-068, both at
  SL-11, and both are compositions a consumer makes.
- The reverse direction: what a hazard, a control, or a platform is linked to. An entry holds its
  links (C-009) and no other collection holds them, so a consumer that wants a record's
  references scans the register — which is REQ-047's shape at SL-11 and is not an operation of
  this version.
- A review tempo, a due date, or an overdue flag for an entry. `reference-entry` is in
  `review-schedule`'s `SCHEDULABLE_KINDS` and that module owns all three (review-schedule C-011);
  nothing here stores or derives one, and this module does not import it.
- Whether a returned entry is the same object as the entry in the returned body, or a copy.
  Treat every returned value as read-only.
- The order of entries inside the collection, or anything about the body a consumer reads
  directly rather than through this contract. `DataBody` is baseline;
  `collections['reference-entry']` is this module's to interpret.
- What a consumer may do with a body between calls, including saving it. `store` C-002 decides
  what a save needs; this module only requires an act to stamp a header and record what was done.
  A file is in the folder from the moment `createEntry` resolves, whether or not the body is ever
  saved.
- The wording of anything shown to the user, which screen shows it, and which lists carry the
  flag C-010 supplies. This module signals; `views` speaks.
