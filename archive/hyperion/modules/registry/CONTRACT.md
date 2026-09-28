# Contract: registry
Version: 5.0 · Status: draft

Written for SL-01 at 1.0, extended for SL-03 at 2.0, for SL-04 at 3.0, for SL-05 at 4.0, and
for SL-11 at 5.0. At 5.0 it promises two reads and nothing that changes a record (DEC-036):
every hazard, control, and platform whatever its status, each carrying that status, so a list
can be filtered by it (C-030; REQ-047 is `views`'); and every live link that names a hazard, a
control, or a platform, whatever the status of the records at either end, so whether a thing
is linked can be read (C-031; REQ-068 is `views`'). Every 4.0 clause holds, and C-010 states
what 4.0 left unsaid: `getHazardDetail` resolves for a hazard of any status. `listHazards`,
`listControls`, `listPlatforms`, and `listPlatformHazards` are unchanged and still give live
records only. Nothing stored changes shape, no changing operation changes, and no import is
added.

At 4.0 it promises that no change this module makes is unrecorded — every changing operation
appends the `change-log` entry for its act to the body it returns, in the same call, and
derives the platforms that act reaches from its own links (DEC-016; REQ-010, REQ-012, REQ-045
are `change-log`'s, mitigating HZ-005 and HZ-006, and are reachable only because this module
calls it) — and that a hazard, a control, or a platform can be marked retired, a hazard never
while it is linked to a platform (REQ-067, REQ-076; SL-05 criterion 6), and that a platform's
owner can be changed, which carries its acknowledgement queue across untouched (REQ-081 is
`change-log` C-012's; this module supplies the act).

At 1.0 it promised the walking skeleton's one record kind: a bare hazard with a title and a
global ID assigned once and never reused. At 2.0 it promises the record model the rest of Pivot is
built on — the hazard with its causal factors, consequences, and controls; the control
library; platforms with an owner; the three links that relate them (DEC-013); the initial
and residual ratings an assessor enters for a hazard on a platform; the ID a hazard has in
one platform's reports; and the one query every list of a platform's hazards is produced by
(HZ-004). At 3.0 it promises what one of a hazard's controls is on one platform and how it
got there: confirmed by a person, excluded with a justification a person wrote, or awaiting
a ruling, and nothing in between (DEC-014; HZ-001, HZ-007).

Every 1.0 clause holds. C-003, C-004, C-007, and C-008 widen from the hazard collection to
every collection this module owns; C-001, C-002, C-005, and C-006 are unchanged, and
`createHazard`, `listHazards`, `getHazard`, and `deleteHazard` keep their 1.0 signatures.

At 3.0, every 2.0 clause holds but four. C-013 is rewritten: `linkControlToPlatform` and
`unlinkControlFromPlatform` are replaced by `confirmControlForPlatform` and
`excludeControlFromPlatform`, the two acts DEC-014 allows, and the second carries the reason.
C-019's `PlatformControl` carries a `state`, a confirmation, and a justification in place of
2.0's `linkedToPlatform` boolean, which said nothing about which of the two not-linked states
a control was in; its `OmissionReason` gains `malformed-justification`. C-004, C-008, and
C-017 widen to `collections.justification` and to the two new operations. C-020, C-021, and
C-022 are new. Nothing stored at 2.0 changes shape: `justification` is a collection 2.0 did
not write, and the `control-platform` link gains no field (DEC-014). `views` 3.0 C-024 is the
one consumer of the replaced operations and is rewritten at its own CONTRACT session, before
SL-03 or SL-04 is implemented.

At 4.0, every 3.0 clause holds but four, and every changing operation's second argument
changes: an `Act` — the profile and the platform the act was made for — in place of the bare
`ActiveProfile` (DEC-016). C-003 is rewritten: the body a changing operation returns now also
carries one new entry of `collections['change-log-entry']`, which is the one other difference
it may hold. C-007 is rewritten: this module imports `modules/change-log/contract`, the only
module it imports, and writes that collection through `change-log.recordChange` and never
directly. C-012 and C-019 are rewritten in one respect: a control's status is not
consulted where a live `hazard-control` link names it, so a control retired in the library
stays in the hazard's detail and in every platform row it was already in. C-023 to C-029 are
new. Nothing stored at 3.0 changes shape: `change-log-entry` is a collection 3.0 did not
write, `retired` is a `RecordStatus` the baseline already carries (DEC-005), and no record
gains a field. `views` 4.0 is the one consumer of every changing operation and is rewritten at
its own CONTRACT session, before SL-05 is implemented.

The three states are what reconciles SL-04's criteria 2 and 4, which a reader may take as
being in tension: criterion 2 asks for every control not linked to the platform to be shown
with the justification recorded for leaving it unlinked, and criterion 4 for a control
awaiting confirmation to be visible as awaiting rather than as linked. A control that nobody
has ruled on is not one a user has left unlinked, so it is shown as `awaiting` and carries no
justification; criterion 3's requirement of a reason bites on the act of ruling a control off
(C-020), not on the passage of time before anyone rules. The other reading — every control
without a link needs a justification before the state can be saved — makes criterion 4's
awaiting state unreachable and is refused here for that reason.

SL-05 criterion 6 says a control can be marked retired and says nothing about the platforms it
is already on, which admits two readings. On the first, retiring a control takes it out of
every list, so a control confirmed on a platform disappears from that platform's row: a thing
leaves a list with nobody told, which is HZ-004's shape, and the platform silently stops
showing a control a person confirmed for it, which is the converse of HZ-001's
never-statement. On the second, retiring takes a control out of the library only — it is no
longer offered for a new link (C-011 lists live controls, and C-012 already refuses to link
one that is not live) and stays exactly where a person already put it. The second is what this
version promises (C-025, C-027), because the first creates a state the hazard register
forbids; the same holds for a retired platform, which keeps its links and its rows. A control
that must leave a platform leaves it by an exclusion with a reason (C-020), which is the act
SL-04 built for that.

## 1. Purpose
Hold the hazard record model — hazards, their causal factors and consequences, the control
library, platforms, the links between them, the ratings entered against them, and what each
of a hazard's controls is on each platform — each thing once, under an ID that is never
changed or reused.

## 2. Operations
In `contract.js`. Every operation is asynchronous and returns a promise (DEC-012). Every
operation is a function of the `DataBody` passed in and, for the ones that change it, of
the baseline clock and of `change-log.recordChange` (C-023); none reads or writes the data
folder, the browser's storage, or anything else (DEC-006). A consumer holds the working body
from `store.load`, replaces it with the `body` each changing operation returns, and passes it
to `store.save` when the user saves. Every changing operation takes an `Act` where 3.0 took an
`ActiveProfile`: one call, one profile, one instant, and the platform the user was working on
(DEC-015, DEC-016).

| Operation | Signature | Verified by |
|---|---|---|
| createHazard | `(body: DataBody, act: Act, fields: HazardFields) → HazardChange` | conformance |
| updateHazard | `(body: DataBody, act: Act, id: HazardId, fields: HazardFields) → HazardChange` | conformance |
| listHazards | `(body: DataBody) → readonly Hazard[]` | conformance |
| getHazard | `(body: DataBody, id: HazardId) → Hazard \| null` | conformance |
| getHazardDetail | `(body: DataBody, id: HazardId) → HazardDetail \| null` | conformance |
| deleteHazard | `(body: DataBody, act: Act, id: HazardId) → HazardChange` | conformance |
| retireHazard | `(body: DataBody, act: Act, id: HazardId) → HazardChange` | conformance |
| addCausalFactor | `(body: DataBody, act: Act, hazardId: HazardId, fields: TextFields) → CausalFactorChange` | conformance |
| addConsequence | `(body: DataBody, act: Act, hazardId: HazardId, fields: TextFields) → ConsequenceChange` | conformance |
| createControl | `(body: DataBody, act: Act, fields: ControlFields) → ControlChange` | conformance |
| listControls | `(body: DataBody) → readonly Control[]` | conformance |
| retireControl | `(body: DataBody, act: Act, id: ControlId) → ControlChange` | conformance |
| linkControlToHazard | `(body: DataBody, act: Act, fields: HazardControlFields) → LinkChange` | conformance |
| createPlatform | `(body: DataBody, act: Act, fields: PlatformFields) → PlatformChange` | conformance |
| listPlatforms | `(body: DataBody) → readonly Platform[]` | conformance |
| retirePlatform | `(body: DataBody, act: Act, id: PlatformId) → PlatformChange` | conformance |
| setPlatformOwner | `(body: DataBody, act: Act, fields: PlatformOwnerFields) → PlatformChange` | conformance |
| linkHazardToPlatform | `(body: DataBody, act: Act, fields: HazardPlatformFields) → LinkChange` | conformance |
| setPlatformReportId | `(body: DataBody, act: Act, fields: ReportIdFields) → LinkChange` | conformance |
| confirmControlForPlatform | `(body: DataBody, act: Act, fields: ControlPlatformFields) → ConfirmationChange` | conformance |
| excludeControlFromPlatform | `(body: DataBody, act: Act, fields: ExclusionFields) → ExclusionChange` | conformance |
| setRating | `(body: DataBody, act: Act, fields: RatingFields) → RatingChange` | conformance |
| getRatings | `(body: DataBody, hazardId: HazardId, platformId: PlatformId) → PlatformRatings` | conformance |
| listPlatformHazards | `(body: DataBody, platformId: PlatformId) → PlatformHazards` | conformance |
| platformsAffected | `(body: DataBody, ref: RecordRef) → readonly PlatformId[]` | conformance |
| listAllHazards | `(body: DataBody) → readonly Hazard[]` | conformance |
| listAllControls | `(body: DataBody) → readonly Control[]` | conformance |
| listAllPlatforms | `(body: DataBody) → readonly Platform[]` | conformance |
| listLinks | `(body: DataBody, ref: RecordRef) → readonly Link[]` | conformance |

A conformance test starts from `schema.emptyDataBody()` or a body it builds, holds the
baseline clock where a clause names it, and needs no folder: the round trip through the
folder is `store`'s C-001 and is exercised end to end by `views`, not here. The rating a
consequence and a likelihood *mean* is `rating.ratingFor`'s and is never stored (DEC-002);
this module stores and returns the two values (C-017). From 4.0 a test reads what a changing
operation recorded through `change-log`'s own contract — `listEntries`, `listHistory`,
`listAwaiting` — which is the one import it needs beyond baseline, and never by reading
`collections['change-log-entry']` itself: what an entry holds is `change-log`'s to promise,
and this suite checks only that the act this module performed is the act that was recorded
(C-023, C-024).

## 3. Data shapes
From `baseline/types.js`: `HazardId`, `ControlId`, `PlatformId`, `CausalFactorId`,
`ConsequenceId`, `JustificationId`, `RatingId`, `LinkId`, `PlatformReportId`, `UserProfileId`,
`ActiveProfile`, `TimestampAest`, `RecordStatus`, `RecordKind`, `RecordRef`, `ControlKind`,
`RatingStage`, `ConsequenceLevel1to5`, `LikelihoodLetterAtoG`. From `baseline/schema.js`:
`DataBody`, whose `sequences.hazard` and whose `collections.hazard`, `.control`,
`.platform`, `.causal-factor`, `.consequence`, `.justification`, `.rating`, and `.link` are
the parts this module reads and writes. `collections['change-log-entry']` is not among them:
it is `change-log`'s, and this module only ever adds to it by calling that contract (C-007,
C-023). Defined in `contract.js`:

**Records**, each the baseline record header narrowed to its kind and id, plus its own
fields (DEC-005), stored in its collection keyed by its id:

- `Hazard`: `kind: 'hazard'`, `id: HazardId`, `title: string`.
- `Control`: `kind: 'control'`, `id: ControlId`, `title: string`. Carries no hazard, no
  platform, and no `ControlKind` (DEC-013).
- `Platform`: `kind: 'platform'`, `id: PlatformId`, `name: string`,
  `ownerProfileId: UserProfileId` — exactly one owner, never absent and never a list.
- `CausalFactor`: `kind: 'causal-factor'`, `id: CausalFactorId`, `hazardId: HazardId`,
  `text: string`.
- `Consequence`: `kind: 'consequence'`, `id: ConsequenceId`, `hazardId: HazardId`,
  `text: string`.
- `Justification`: `kind: 'justification'`, `id: JustificationId`, `hazardId: HazardId`,
  `controlId: ControlId`, `platformId: PlatformId`, `text: string` — why that control is not
  on that platform for that hazard (C-020).
- `Rating`: `kind: 'rating'`, `id: RatingId`, `hazardId: HazardId`,
  `platformId: PlatformId`, `stage: RatingStage`,
  `consequence: ConsequenceLevel1to5 | null`, `likelihood: LikelihoodLetterAtoG | null`.
- `Link`: `kind: 'link'`, `id: LinkId`, and one of three shapes told apart by `linkKind`
  (DEC-013): `'hazard-platform'` with `hazardId`, `platformId`, `reportId:
  PlatformReportId`; `'hazard-control'` with `hazardId`, `controlId`,
  `controlKind: ControlKind`; `'control-platform'` with `hazardId`, `controlId`,
  `platformId`.

**The act**, what a consumer supplies to every changing operation in place of 3.0's bare
profile (DEC-016):

- `Act`: `{ profile: ActiveProfile, madeForPlatformId: PlatformId | null }` — who is
  performing the act, and the platform they were working on when they performed it, or null
  when they were not working on one. The profile is what stamps every header this module
  writes, as it did at 3.0. `madeForPlatformId` is not stored on any record of this module: it
  is passed through to the entry C-023 writes, where it is what decides which platforms await
  the act and which does not (`change-log` C-010). It is required, never defaulted: a missing
  property is refused (C-023), because the value that decides whose queue a change lands in is
  the one a caller must not be able to forget.

**Field bundles** a consumer supplies: `HazardFields` `{ title: string }`; `TextFields`
`{ text: string }`; `ControlFields` `{ title: string }`; `PlatformFields`
`{ name: string, ownerProfileId: UserProfileId }`; `HazardControlFields`
`{ hazardId, controlId, controlKind }`; `HazardPlatformFields` `{ hazardId, platformId }`;
`ControlPlatformFields` `{ hazardId, controlId, platformId }`; `ExclusionFields`
`{ hazardId, controlId, platformId, text: string }`; `ReportIdFields`
`{ hazardId, platformId, reportId: PlatformReportId }`; `RatingFields`
`{ hazardId, platformId, stage, consequence, likelihood }`; `PlatformOwnerFields`
`{ platformId: PlatformId, ownerProfileId: UserProfileId }`.

**Changes**, what a changing operation returns: `{ body: DataBody }` plus the record as it
now is — `HazardChange.hazard`, `ControlChange.control`, `PlatformChange.platform`,
`CausalFactorChange.causalFactor`, `ConsequenceChange.consequence`, `RatingChange.rating`,
`LinkChange.link`. The two acts of C-021 each return what they superseded as well:
`ConfirmationChange` `{ body, link, clearedJustification: Justification | null }` and
`ExclusionChange` `{ body, justification, removedLink: ControlPlatformLink | null }`, the
superseded record as it now is with status `deleted`, or null when there was none. The body
passed in is untouched (C-003). No change shape gains a field at 4.0: the entry the act wrote
is in the returned body and is read from there through `change-log` (C-023), so a consumer
that does not want it is not handed it.

**Reads**:

- `HazardDetail`: `{ hazard: Hazard, causalFactors: readonly CausalFactor[], consequences:
  readonly Consequence[], controls: readonly HazardControl[] }`, where `HazardControl` is
  `{ control: Control, controlKind: ControlKind }`. Platform-independent (C-004).
- `RatingValues`: `{ consequence: ConsequenceLevel1to5 | null, likelihood:
  LikelihoodLetterAtoG | null }` — exactly what was entered, both null when nothing was.
- `PlatformRatings`: `{ initial: RatingValues, residual: RatingValues }`.
- `PlatformHazards`: `{ platform: Platform, rows: readonly PlatformHazardRow[], omitted:
  readonly OmittedHazard[] }`.
- `PlatformHazardRow`: `{ hazard: Hazard, reportId: PlatformReportId, controls: readonly
  PlatformControl[], residual: RatingValues }`, where `PlatformControl` is `HazardControl`
  plus `state: ControlPlatformState`, `confirmation: Confirmation | null`, and
  `justification: Justification | null` (C-021).
- `ControlPlatformState`: `'confirmed' | 'excluded' | 'awaiting'` — what one of a hazard's
  controls is on one platform. Only `confirmed` is on it (REQ-001).
- `Confirmation`: `{ byProfileId: UserProfileId, atAest: TimestampAest }` — who confirmed the
  control for the platform and when, read from the link's creation stamp (C-022).
- `OmittedHazard`: `{ id: HazardId, reason: OmissionReason, key: string, detail: string }`,
  where `OmissionReason` is `'malformed-control' | 'malformed-rating' |
  'malformed-justification'`.
- `platformsAffected` returns a `readonly PlatformId[]` and no shape of its own: the platforms
  a change to one record reaches, distinct and ascending as strings, which is the same list
  C-023 gives the entry as its `affectedPlatformIds` (C-024).
- `listAllHazards`, `listAllControls`, `listAllPlatforms`, and `listLinks` return the record
  shapes above and no shape of their own: a record's `status` is its header's, and a `Link` is
  the stored row (C-030, C-031).

A `title`, a `name`, and a `text` are what the user typed with leading and trailing
whitespace removed. Every time in a record is a `TimestampAest`; a hazard's id comes from
`types.hazardId.fromSequence` and every other id from its `IdKind.fresh` (DEC-005).
"Linked" everywhere in this contract means a link row of the relevant `linkKind` whose
`status` is `live` (C-013) — the link row's own status, never the status of the records it
names, so a link to a retired control is a live link (C-027). For a control on a platform that
link is a confirmation and nothing else makes one, so "linked", "confirmed", and "on the
platform" are one state (DEC-014, C-021).

## 4. Error conditions
Signalled as a rejected promise carrying the named error class. "Body unchanged" means the
body passed in is deep-equal to what it was before the call, which C-003 promises of every
call, and that nothing was returned as a new body. Every `Malformed*Error` extends
`MalformedRecordError`, which carries the record kind, the entry's key, and one sentence
naming the field, so a consumer may handle the family or one kind of it.

| Operation | Condition | Signalled as | Caller obligation |
|---|---|---|---|
| createHazard, updateHazard | `fields.title` is empty once trimmed | `InvalidHazardTitleError`; body unchanged | Ask for a title |
| every changing operation | `act` is missing, or `act.profile` is missing, or its `id` is not a user profile id | `MissingProfileError`; body unchanged | Show the profile screen (REQ-055) |
| every changing operation | `act.madeForPlatformId` is absent, or is neither null nor a platform id | `InvalidActError` naming the value; body unchanged | Pass the platform the screen is on, or null; never leave the field off (DEC-016) |
| every changing operation | `act.madeForPlatformId` is a platform id no platform in the body has | `UnknownPlatformError`; body unchanged | Ask which platform the user is on |
| every changing operation | `change-log.recordChange` rejects, which for a body this module wrote can only be an entry of `collections['change-log-entry']` that `change-log` cannot read | that error unchanged, `MalformedEntryError`; nothing written; body unchanged | Name the entry to the user; nothing may be changed while the history cannot be read (C-023) |
| createHazard | the id `sequences.hazard` would assign is already held by a hazard in `collections.hazard` | `HazardSequenceError` carrying that id; body unchanged | Tell the user the data cannot take a new hazard and name the id; do not adjust the sequence to get past this |
| updateHazard, deleteHazard, retireHazard, addCausalFactor, addConsequence, linkControlToHazard, linkHazardToPlatform | no hazard in the body has `hazardId`, live or otherwise | `UnknownHazardError`; body unchanged | List again and ask again |
| updateHazard, deleteHazard, retireHazard, addCausalFactor, addConsequence, linkControlToHazard, linkHazardToPlatform | the hazard has a status other than `live` | `HazardNotLiveError` carrying the status; body unchanged | Say the hazard is deleted or already retired |
| retireHazard | one or more live `hazard-platform` links hold `id` | `HazardOnPlatformsError` carrying every such platform id, ascending as strings; body unchanged | Name the platforms and say the hazard cannot be retired while it is on them (REQ-076, SL-05 criterion 6) |
| addCausalFactor | `fields.text` is empty once trimmed | `InvalidCausalFactorTextError`; body unchanged | Ask for the causal factor |
| addConsequence | `fields.text` is empty once trimmed | `InvalidConsequenceTextError`; body unchanged | Ask for the consequence |
| createControl | `fields.title` is empty once trimmed | `InvalidControlTitleError`; body unchanged | Ask for a control |
| createPlatform | `fields.name` is empty once trimmed | `InvalidPlatformNameError`; body unchanged | Ask for a platform name |
| createPlatform | `fields.ownerProfileId` is missing or is not a user profile id | `InvalidOwnerError`; body unchanged | Ask which profile owns the platform (REQ-065) |
| excludeControlFromPlatform | `fields.text` is empty once trimmed | `InvalidJustificationTextError`; body unchanged | Ask why the control is not on this platform; do not record the exclusion (REQ-058) |
| linkControlToHazard, confirmControlForPlatform, excludeControlFromPlatform, retireControl | no control in the body has `controlId` | `UnknownControlError`; body unchanged | List the library again |
| linkControlToHazard, retireControl | the control has a status other than `live` | `ControlNotLiveError` carrying the status; body unchanged | Say the control is deleted or already retired |
| linkControlToHazard | `fields.controlKind` is not `preventative` or `mitigating` | `InvalidControlKindError`; body unchanged | Ask which side of the hazard the control sits on (REQ-044) |
| linkHazardToPlatform, confirmControlForPlatform, excludeControlFromPlatform, setPlatformReportId, setRating, listPlatformHazards, retirePlatform, setPlatformOwner | no platform in the body has `platformId` | `UnknownPlatformError`; body unchanged | Ask which platform |
| linkHazardToPlatform, retirePlatform, setPlatformOwner | the platform has a status other than `live` | `PlatformNotLiveError` carrying the status; body unchanged | Say the platform is deleted or already retired |
| setPlatformOwner | `fields.ownerProfileId` is missing or is not a user profile id | `InvalidOwnerError`; body unchanged | Ask which profile is to own the platform (REQ-065) |
| linkControlToHazard, linkHazardToPlatform, confirmControlForPlatform | a live link of that `linkKind` already holds those ids | `DuplicateLinkError` carrying the existing link's id; body unchanged | Show it as already confirmed; do not confirm twice |
| excludeControlFromPlatform | a live justification already holds those three ids | `AlreadyExcludedError` carrying its id; body unchanged | Show it as already excluded and show the reason stored |
| setPlatformReportId, confirmControlForPlatform, excludeControlFromPlatform, setRating | no live `hazard-platform` link holds `hazardId` and `platformId` | `HazardNotOnPlatformError`; body unchanged | Link the hazard to the platform first (REQ-025) |
| confirmControlForPlatform, excludeControlFromPlatform | no live `hazard-control` link holds `hazardId` and `controlId` | `ControlNotOnHazardError`; body unchanged | Add the control to the hazard first (REQ-033) |
| setPlatformReportId | `fields.reportId` is empty, or has leading or trailing whitespace | `InvalidPlatformReportIdError`; body unchanged | Ask for the ID this platform's reports use (REQ-052) |
| setRating | `fields.stage` is not `initial` or `residual` | `InvalidRatingStageError`; body unchanged | Ask which rating is being entered |
| setRating | `fields.consequence` is neither null nor a whole number 1 to 5, or `fields.likelihood` is neither null nor one of A to G | `InvalidRatingValueError` naming the field and the value; body unchanged | Refuse the entry and say the scales; do not store or show it (SL-03 criterion 6) |
| updateHazard, setPlatformReportId, setPlatformOwner, setRating | every field the call would write already holds the value it would write: the same trimmed title, the same report ID, the same owner, or a live rating with both values equal | `NoChangeError` naming the record's `RecordRef` and the field; body unchanged; no entry written | Say nothing changed; do not save and do not record an act (C-029) |
| platformsAffected, listLinks | `ref.kind` is a record kind this module does not own | `UnownedRecordKindError` carrying the kind; nothing returned | Ask the module that owns the kind; this one holds no link to it (C-024, C-031) |
| every operation that reads a collection | an entry of a collection this module owns is not a record of that kind (C-008) | the `Malformed*Error` for that kind, naming the entry's key; nothing returned; body unchanged | Name the record to the user; show nothing from that collection |
| listPlatformHazards | a control, a justification, or a rating a row depends on is malformed | resolves; that hazard is in `omitted` with the key and the reason (C-019) | Show the hazard as omitted and name the record; never drop it silently |

A body with no collection of a kind is not an error: it has none of that kind (C-006,
C-019). A read never rejects for an id nothing has: `getHazard` and `getHazardDetail`
resolve with null, and `getRatings` resolves with both values null, whether or not the
hazard and the platform exist or are linked. Only `listPlatformHazards` rejects an unknown
platform, because its result carries the `Platform`. `platformsAffected` is a read of the
same kind: a `ref` of a kind this module owns whose id nothing has resolves with an empty
list, and only an unowned kind and a malformed record reject (C-024). `listLinks` is the same
(C-031).

When two conditions of an operation hold at once, the one signalled is the first of these
that applies, so that a conformance test has one expected rejection and not a choice: a
malformed record in a collection the operation reads; a missing profile; an act whose
`madeForPlatformId` is ill-formed or names no platform; an unknown
record; a record that is not live; a link precondition (`HazardNotOnPlatformError`,
`ControlNotOnHazardError`, `DuplicateLinkError`, `AlreadyExcludedError`,
`HazardOnPlatformsError`); a field value
(`Invalid*Error`); then a change that changes nothing (`NoChangeError`); and last, whatever
`change-log.recordChange` rejects with, which this module reaches only once it has accepted
the act. The body is unchanged whichever fires. So a blank text with a hazard not
on the platform is `HazardNotOnPlatformError`, a blank text for a control already
excluded is `AlreadyExcludedError`, and an unchanged title on a hazard that is not live is
`HazardNotLiveError`.

## 5. Behavioural promises

- **C-001 A created hazard is in the body under the next global ID.** After
  `createHazard(body, p, { title })` resolves with `{ body: b, hazard: h }`: `h.id` is
  `hazardId.fromSequence(body.sequences.hazard)`; `b.sequences.hazard` is
  `body.sequences.hazard + 1`; `h.title` is `title` trimmed; `h.kind` is `'hazard'`;
  `h.status` is `'live'`; `h.createdBy` and `h.updatedBy` are `p.id`; `h.createdAtAest`
  and `h.updatedAtAest` are the baseline clock's now; `getHazard(b, h.id)` is deep-equal to
  `h`; and `listHazards(b)` is `listHazards(body)` plus `h`. No operation of this contract
  changes a hazard's id afterwards. (REQ-024, REQ-050; SL-01 criterion 4.)
- **C-002 A global ID is assigned once and never again.** Over any sequence of
  `createHazard` and `deleteHazard` calls from any body, the ids assigned are distinct from
  one another and from every id in the starting body's `collections.hazard`, and their
  numbers strictly increase in the order assigned. Deleting a hazard does not free its id:
  a `createHazard` after a `deleteHazard` never yields the deleted id. When the id the
  sequence would assign is already held, `createHazard` rejects with `HazardSequenceError`
  and assigns nothing, so an id is never reused whatever the body contains. (REQ-050;
  SL-01 criterion 4.)
- **C-003 The body is a value.** No operation modifies the body passed in: after any call,
  resolved or rejected, that body is deep-equal to what it was. The `body` a changing
  operation returns differs from the one passed in only in the entries the clause for that
  operation names, in the one entry of `collections['change-log-entry']` that operation's act
  added (C-023), and in `sequences.hazard` for `createHazard` alone; every other
  collection, every other entry of the collections it does touch, and every other sequence
  is deep-equal to the input's. A collection of a kind this module does not own is carried
  through untouched and unread, however it is shaped. (REQ-004 as this module's half of it;
  REQ-035 with C-014.)
- **C-004 Each thing is stored once, as plain data, and no record holds a copy of another.**
  A hazard is in `collections.hazard` under its id and nowhere else, one entry per id; a
  control in `collections.control`; a platform in `collections.platform`; likewise each
  causal factor, consequence, justification, and rating. A `Hazard` names no platform and no control; a
  `Control` names no hazard and no platform; a `Platform` names no hazard and no control.
  What relates them is a `Link`, which holds ids and nothing else: linking a hazard to a
  second platform adds one link row and copies no field of the hazard, so a change to the
  hazard's title is a change to the one record both platforms read (C-009, C-015). Every
  field of every stored record is a string, a whole number, a boolean, or null, so the body
  after any operation is deep-equal to itself after JSON serialisation and parsing, which
  is what `store` C-001 carries across a save and a load. (REQ-024, REQ-025, REQ-032,
  REQ-050; SL-01 criterion 4, SL-03 criteria 1 and 3.)
- **C-005 Deletion keeps the row and retires the ID.** After
  `deleteHazard(body, p, id)` resolves with `{ body: b, hazard: h }` for a live hazard:
  `h.status` is `'deleted'`; `h.updatedBy` is `p.id`; `h.updatedAtAest` is the clock's now;
  every other field of `h` equals the hazard's before the call; `getHazard(b, id)` is
  deep-equal to `h`; `listHazards(b)` is `listHazards(body)` without it; and by C-002 no
  later `createHazard` yields `id`. An id no hazard has rejects with `UnknownHazardError`;
  a hazard that is not live rejects with `HazardNotLiveError`; either way the body is
  unchanged. A hazard's links, causal factors, consequences, and ratings are left exactly
  as they were; the hazard leaves every list because it is no longer live (C-006, C-019).
  (REQ-050; SL-01 criterion 4. The record of the deletion a user can see is REQ-010,
  `change-log`'s at SL-05; the row staying is what makes that record possible.)
- **C-006 The list is complete and ordered.** `listHazards` resolves with every hazard in
  `collections.hazard` whose status is `'live'`, once each, in ascending order of the
  number in its global ID, and with nothing else: no deleted hazard, no retired hazard, no
  record of another kind. It resolves with an empty list when the body has no
  `collections.hazard` or the collection is empty. `getHazard` resolves with the hazard
  whatever its status, and with null when no entry has the id. (REQ-024.)
- **C-007 Confinement.** No operation reads or writes the data folder, the browser's
  storage, or any global state; the only things outside its arguments an operation reads are
  the baseline clock and `change-log.recordChange`, and only a changing operation reads
  either. `modules/change-log/contract` is the one module this contract imports (DEC-016), and
  it is imported for that one operation: nothing here calls `change-log.acknowledge`, which is
  the consumer's with the owner check `views` makes, and nothing here reads or writes
  `collections['change-log-entry']` directly — every entry this module causes is written by
  `change-log` from what this module handed it (C-023). This module still never imports
  `store`, `views`, `rating`, or `profiles`: it stores the two values an assessor entered
  and never the band they mean (DEC-002, C-017). The graph stays acyclic because `change-log`
  imports nothing (DEC-004, DEC-015). (DEC-006; REQ-069 as `store`'s to keep.)
- **C-008 A malformed record is refused or named, never skipped.** An entry of a collection
  this module owns is malformed when its key differs from its `id`, its `id` is not an id
  of that kind, its `kind` is not the collection's kind, its `status` is not a
  `RecordStatus`, a header id is not a user profile id, a header time is not a
  `TimestampAest`, or one of the kind's own fields is missing or of the wrong shape — for a
  `Link`, a `linkKind` outside the three or a field the shape does not carry; for a
  `Justification`, any of its three ids missing or not an id of its kind. Every
  operation that reads a collection rejects with that kind's `Malformed*Error` naming the
  entry's key and returns nothing, so a list is never shown with a record silently missing
  from it. The one exception is `listPlatformHazards`, which resolves and names the hazard
  in `omitted` when the malformed record is a control, a justification, or a rating a row
  depends on (C-019); a malformed hazard, link, or platform rejects there as everywhere. A
  blank stored title, name, or text is malformed only in that it would not have been created
  by C-001, C-010, C-011, C-014, or C-020; it is listed, not refused, so a record is never
  hidden for its content. (REQ-024; HZ-004 with C-019.)
- **C-009 A hazard's title is changed on the one record.** After
  `updateHazard(body, p, id, { title })` resolves with `{ body: b, hazard: h }` for a live
  hazard: `h.title` is `title` trimmed; `h.updatedBy` is `p.id`; `h.updatedAtAest` is the
  clock's now; `h.id`, `h.kind`, `h.status`, `h.createdBy`, and `h.createdAtAest` are what
  they were; `b` differs from `body` only in that entry of `collections.hazard`. No link,
  no other record, and no other platform's data is touched, so every platform the hazard is
  linked to reads the new title from the same record (C-004). A blank title rejects, an
  unknown id rejects, a hazard that is not live rejects; the body is unchanged.
  (REQ-024; SL-03 criterion 1.)
- **C-010 A hazard holds its causal factors and consequences, and gives them back as
  stored.** After `addCausalFactor(body, p, hazardId, { text })` resolves with
  `{ body: b, causalFactor: c }` for a live hazard: `c.id` is a fresh `CausalFactorId`
  held by no entry of `collections['causal-factor']`; `c.hazardId` is `hazardId`; `c.text`
  is `text` trimmed; `c.kind` is `'causal-factor'`; `c.status` is `'live'`; the header is
  stamped with `p` and the clock's now; and `b` differs from `body` only by that entry.
  `addConsequence` is the same for `collections.consequence` and `ConsequenceId`.
  `getHazardDetail(b, hazardId)` resolves with the hazard, every live causal factor and
  every live consequence whose `hazardId` is that hazard, each once and with its `text`
  exactly as stored, in ascending order of `createdAtAest` then id, and the hazard's
  controls (C-012). It does so whatever the hazard's own status: a deleted or retired hazard's
  detail is given as stored, with the same live causal factors, consequences, and controls,
  and `getHazardDetail` resolves with null only when no entry of `collections.hazard` has the
  id (5.0 states this; 4.0 did not say otherwise). A blank text rejects, an unknown or
  not-live hazard rejects; the body is unchanged. (REQ-044 in part; SL-03 criterion 2.)
- **C-011 A control is stored once in the library, independently of hazards and
  platforms.** After `createControl(body, p, { title })` resolves with
  `{ body: b, control: c }`: `c.id` is a fresh `ControlId` held by no entry of
  `collections.control`; `c.title` is `title` trimmed; `c.kind` is `'control'`; `c.status`
  is `'live'`; the header is stamped with `p` and the clock's now; `b` differs from `body`
  only by that entry. `c` has no hazard, no platform, and no `ControlKind` (DEC-013), so
  the same entry is the one every hazard and every platform reads. `listControls` resolves
  with every live control, once each, in ascending order of `createdAtAest` then id, and
  with nothing else; empty when the body has no `collections.control`. A blank title
  rejects; the body is unchanged. (REQ-032; SL-03 criterion 3.)
- **C-012 A control is linked to a hazard as preventative or mitigating, once per pair.**
  After `linkControlToHazard(body, p, { hazardId, controlId, controlKind })` resolves with
  `{ body: b, link: l }`: `l.linkKind` is `'hazard-control'`; `l.id` is a fresh `LinkId`;
  `l.hazardId`, `l.controlId`, and `l.controlKind` are as given; `l.status` is `'live'`;
  the header is stamped with `p` and the clock's now; and `b` differs from `body` only by
  that entry of `collections.link`. `getHazardDetail(b, hazardId).controls` is the
  hazard's controls before plus `{ control, controlKind }` for this one, each control once
  per live link, in ascending order of the link's `createdAtAest` then the control's id. The
  link's status decides what is in that list and the control's never does, so a control
  retired in the library is still one of the hazard's and is still given here, as stored and
  with its status (C-025, C-027).
  One control may be linked to any number of hazards, and a hazard's count of links to a
  control is at most one: a second live link of the same pair rejects with
  `DuplicateLinkError` carrying the first link's id. A `controlKind` outside the two
  rejects; an unknown or not-live hazard or control rejects; the body is unchanged.
  (REQ-033, REQ-044 in part; SL-03 criteria 2 and 3.)
- **C-013 A control is on a platform only by a confirmation, one control and one platform at
  a time.** `confirmControlForPlatform(body, p, { hazardId, controlId, platformId })`
  resolves with `{ body: b, link: l, clearedJustification }` where `l` is a
  `control-platform` link over those three ids, live, stamped with `p` and the clock's now;
  `b` differs from `body` only by that entry of `collections.link` and, when the control was
  excluded, by the entry C-021 supersedes. It is the only operation of this contract that
  creates a `control-platform` link: no other operation creates, revives, or copies one, and
  this one takes exactly one `controlId`, so no call puts a second control on a platform and
  nothing puts one there as a side effect of something else — linking a hazard to a platform
  creates no control link (C-015), and neither does creating, linking, or retitling a control
  (C-011, C-012, C-009). A control is therefore on a platform only because a person confirmed
  it there (REQ-013; HZ-007), and only while that link is live (REQ-001; HZ-001). Confirming
  again while the link is live rejects with `DuplicateLinkError` carrying it; confirming after
  an exclusion adds a new link row with a new `LinkId` and supersedes the justification
  (C-021). Because the link names all three ids, a control confirmed on one platform for a
  hazard is not on another platform, and not on another hazard on the same platform, until a
  confirmation of its own says so (DEC-013). Confirming for a platform the hazard is not on
  rejects with `HazardNotOnPlatformError`; confirming a control that is not one of the
  hazard's rejects with `ControlNotOnHazardError`; the body is unchanged. (REQ-001, REQ-013,
  REQ-034; HZ-001, HZ-007; SL-03 criterion 3, SL-04 criteria 1 and 4.)
- **C-014 A platform is stored with exactly one owner, and adding one changes nothing
  else.** After `createPlatform(body, p, { name, ownerProfileId })` resolves with
  `{ body: b, platform: q }`: `q.id` is a fresh `PlatformId`; `q.name` is `name` trimmed;
  `q.ownerProfileId` is `ownerProfileId`, one `UserProfileId` and never absent, never a
  list, and never changed by any other operation of this contract; `q.kind` is
  `'platform'`; `q.status` is `'live'`; the header is stamped with `p` and the clock's now.
  `b` differs from `body` only by that one entry of `collections.platform`: every entry of
  every other collection — every hazard, control, causal factor, consequence, rating, link,
  and every collection of a kind this module does not own, the reference register's
  included — is deep-equal to what it was, compared entry for entry, and
  `sequences` is unchanged. `listPlatforms` resolves with every live platform, once each,
  in ascending order of `createdAtAest` then id. A blank name rejects; an
  `ownerProfileId` that is not a user profile id rejects with `InvalidOwnerError`; the body
  is unchanged. (REQ-035, REQ-065; SL-03 criteria 4 and 7.)
- **C-015 A hazard is linked to any number of platforms, and linking copies nothing.**
  After `linkHazardToPlatform(body, p, { hazardId, platformId })` resolves with
  `{ body: b, link: l }`: `l.linkKind` is `'hazard-platform'`; `l.id` is a fresh `LinkId`;
  `l.hazardId` and `l.platformId` are as given; `l.reportId` is `platformReportId` of the
  hazard's global ID (C-016); `l.status` is `'live'`; the header is stamped with `p` and
  the clock's now; and `b` differs from `body` only by that entry of `collections.link`.
  The hazard's own entry is deep-equal to what it was, and no causal factor, consequence,
  control, justification, or rating is added or changed, and no `control-platform` link:
  nothing of the hazard is copied, so every one of its controls starts `awaiting` on the new
  platform and none is on it until confirmed (C-013, C-021; HZ-007). A hazard may
  hold any number of live `hazard-platform` links, one per platform; a second over the same
  pair rejects with `DuplicateLinkError`. An unknown or not-live hazard or platform
  rejects; the body is unchanged. (REQ-025; SL-03 criterion 1.)
- **C-016 A hazard linked to a platform has an ID for that platform's reports, stable until
  a user changes it.** The `reportId` a `hazard-platform` link is created with is the
  hazard's global ID as a `PlatformReportId` (C-015), and no operation of this contract
  changes it except `setPlatformReportId`, which resolves with that link's `reportId` set
  to `fields.reportId`, its `updatedBy` and `updatedAtAest` restamped, and a body differing
  from `body` only by that entry — the hazard's global ID, every other link, and the link's
  own `hazardId` and `platformId` unchanged, and the hazard's `reportId` on every other
  platform unchanged. A `reportId` that is empty or carries leading or trailing whitespace
  rejects with `InvalidPlatformReportIdError`; a hazard not linked to the platform rejects
  with `HazardNotOnPlatformError`; the body is unchanged. (REQ-051, REQ-052; SL-03
  criterion 8.)
- **C-017 A rating is what the assessor entered, per hazard, per platform, per stage, and
  no link changes it.** After `setRating(body, p, { hazardId, platformId, stage,
  consequence, likelihood })` resolves with `{ body: b, rating: r }` for a hazard linked to
  the platform: `r.hazardId`, `r.platformId`, and `r.stage` are as given; `r.consequence`
  and `r.likelihood` are the values given, unchanged and underived — equal to the
  arguments, or null where null was given; `r.status` is `'live'`; the header is stamped
  with `p` and the clock's now. At most one live rating exists per
  `(hazardId, platformId, stage)`: a second `setRating` over the same three updates that
  record, keeping its `RatingId` and its `createdBy` and `createdAtAest`, and `b` differs
  from `body` only by that one entry of `collections.rating`. `getRatings(b, hazardId,
  platformId)` resolves with `{ initial, residual }`, each the values of that stage's live
  rating or both null when there is none — it is a read, so an id it does not find and a
  hazard not linked to the platform are both "none", not a rejection — and the residual
  values it gives are the ones last passed to `setRating`, whatever controls the hazard has
  and whatever platforms it is on. No operation of this contract reads `collections.link` or
  `collections.justification` to compute a rating and none
  writes `collections.rating` except `setRating`: after `linkControlToHazard`,
  `confirmControlForPlatform`, `excludeControlFromPlatform`, `linkHazardToPlatform`, and
  `setPlatformReportId`, the returned body's `collections.rating` is deep-equal to the
  input's. A hazard not linked to the platform rejects with `HazardNotOnPlatformError`; the
  body is unchanged. (REQ-003, REQ-042, REQ-043; HZ-002; SL-03 criterion 5.)
- **C-018 A value outside the scales is refused, not stored.** `setRating` rejects with
  `InvalidRatingValueError` naming the field and the value when `consequence` is neither
  null nor a whole number 1 to 5, or `likelihood` is neither null nor one of `A` to `G`
  (DEC-002's scales, `baseline/types.js`), and when `stage` is neither `initial` nor
  `residual` it rejects with `InvalidRatingStageError`; in each case nothing is written and
  the body is unchanged, so no out-of-scale value is ever stored and none can be read back
  to be shown. A null consequence or likelihood is in scale and is stored: it is the
  uncategorised case DEC-002's matrix names, and what it means is `rating.ratingFor`'s to
  say. (REQ-017 as the storage half of it; HZ-010 is `rating` C-001's; SL-03 criterion 6.)
- **C-019 One query produces every list of a platform's hazards, and a hazard is in it or
  named as omitted.** `listPlatformHazards(body, platformId)` resolves with
  `{ platform, rows, omitted }` where, for every hazard with a live `hazard-platform` link
  to that platform whose own status is `live` — so neither deleted nor retired — exactly
  one of these holds: it is the `hazard` of exactly one row, or its id is in `omitted`
  exactly once with the key of the record that stopped it and the reason. Nothing else is
  in `rows` or `omitted`: no hazard without a live link to this platform, no hazard that is
  not live, no duplicate. `rows` is in ascending order of the number in the hazard's global
  ID. Each row carries the hazard as stored; the `reportId` of that link (C-016); `controls`
  — every one of the hazard's live `hazard-control` links as a `PlatformControl` with its
  `controlKind`, its `state` on this platform, its `confirmation`, and its `justification`,
  each as C-021 defines them, the link's status deciding and the control's never (C-027) — in
  C-012's order; and
  `residual`, the values of the live residual rating for that hazard and platform, both
  null when there is none (C-017). Every one of the hazard's controls is in `controls`
  whatever its state, so a control excluded from this platform is shown against it with the
  reason stored, and one nobody has ruled on is shown as awaiting rather than as absent or as
  the platform's (REQ-002; SL-04 criteria 2 and 4). A hazard is omitted only when a control,
  a justification, or a rating the row would carry is malformed (C-008), with `reason`
  `'malformed-control'`, `'malformed-justification'`, or
  `'malformed-rating'`; a malformed hazard, link, or platform rejects the whole query, and
  an unknown platform rejects with `UnknownPlatformError`. A body with no `collections.link`
  resolves with empty `rows` and empty `omitted`. Every list of a platform's hazards that
  Pivot shows — assessment, review, report — is this query's result, so a hazard cannot be
  in one and absent from another (REQ-009 is `views`' half of this, at SL-03). (HZ-004;
  SL-03 criterion 9, SL-04 criterion 2.)
- **C-020 A control leaves a platform, or is declined for it, only with a reason a person
  wrote.** After `excludeControlFromPlatform(body, p, { hazardId, controlId, platformId,
  text })` resolves with `{ body: b, justification: j, removedLink }`: `j.id` is a fresh
  `JustificationId` held by no entry of `collections.justification`; `j.hazardId`,
  `j.controlId`, and `j.platformId` are as given; `j.text` is `text` trimmed; `j.kind` is
  `'justification'`; `j.status` is `'live'`; the header is stamped with `p` and the clock's
  now; and `b` differs from `body` only by that entry and, when the control was confirmed, by
  the link C-021 supersedes. It is the only operation of this contract that writes
  `collections.justification`, and it writes one only with a text that is not empty once
  trimmed: a blank text rejects with `InvalidJustificationTextError` and stores nothing, so a
  control is never recorded as ruled off a platform with no reason (REQ-058; HZ-001). The
  reason names all three ids, so the same control excluded from two platforms carries two
  reasons and one may be changed only by an act of its own. A control already excluded
  rejects with `AlreadyExcludedError` carrying the live justification's id; a hazard not on
  the platform rejects with `HazardNotOnPlatformError`; a control that is not one of the
  hazard's rejects with `ControlNotOnHazardError`; an unknown control rejects; the body is
  unchanged. (REQ-058; HZ-001; SL-04 criteria 2 and 3. What is refused at the moment of
  saving is `views`' and `store`'s; this clause is what makes the state unwritable.)
- **C-021 A hazard's control is confirmed, excluded, or awaiting on a platform, and never two
  of them.** For each `(hazardId, controlId, platformId)` triple, a body this module has
  written holds at most one live `control-platform` link, at most one live `Justification`,
  and never one of each: `confirmControlForPlatform` sets a live justification for the triple
  to `'deleted'` with `updatedBy` and `updatedAtAest` restamped, every other field of it
  unchanged, and returns it as `clearedJustification`, null when there was none;
  `excludeControlFromPlatform` does the same to a live link for the triple and returns it as
  `removedLink`. No row is removed, so SL-05 can show every confirmation and every exclusion,
  and a later act adds a new row rather than reviving an old one. The `state` of a
  `PlatformControl` is `'confirmed'` when a live link holds the triple, `'excluded'` when a
  live justification does, and `'awaiting'` when neither does — which is what every one of a
  hazard's controls is from the moment the hazard is linked to the platform (C-015) until a
  person acts. `confirmation` is C-022's value when the state is `'confirmed'` and null
  otherwise; `justification` is that live record when the state is `'excluded'` and null
  otherwise. (REQ-001, REQ-002, REQ-013, REQ-058; HZ-001, HZ-007; SL-04 criteria 1, 2 and 4.)
- **C-022 A confirmation records who confirmed the control and when, and nothing changes
  it.** For a `control-platform` link, `createdBy` and `createdAtAest` are the profile that
  confirmed the control for that platform and the clock's now at that moment, and they are
  the `Confirmation` C-019 carries: `byProfileId` is `createdBy` and `atAest` is
  `createdAtAest`. No operation of this contract writes either field of an existing link —
  an exclusion restamps `updatedBy` and `updatedAtAest` only — so the record of who confirmed
  a control survives the control being taken off the platform, and a control confirmed again
  afterwards carries the second confirmer on its new row. No separate confirmation field is
  stored anywhere (DEC-014). (REQ-070; HZ-007; SL-04 criterion 4.)
- **C-023 No change this module makes is unrecorded, and no record is written without its
  entry.** Every changing operation of this contract calls `change-log.recordChange` exactly
  once, with `act.profile` and a `RecordedChange` whose `records` are the records that
  operation's own clause names as added or changed, each as it was — null where the act
  created it — and as it now is, in this order: for `createHazard`, `addCausalFactor`,
  `addConsequence`, `createControl`, `createPlatform`, `linkControlToHazard`, and
  `linkHazardToPlatform`, the one record it created; for `updateHazard`, `deleteHazard`,
  `retireHazard`, `retireControl`, `retirePlatform`, `setPlatformOwner`,
  `setPlatformReportId`, and `setRating`, that one record before and after; for
  `confirmControlForPlatform`, the `control-platform` link it created and then, when
  `clearedJustification` is not null, that justification before and after; for
  `excludeControlFromPlatform`, the justification it created and then, when `removedLink` is
  not null, that link before and after.
  `madeForPlatformId` is `act.madeForPlatformId` unchanged, and `affectedPlatformIds` is the
  union of `platformsAffected(b, ref)` over those records' refs, computed on the body `b` the
  operation resolves with (C-024). So the body a changing operation resolves with holds
  exactly one entry of `collections['change-log-entry']` that its input did not, and that
  entry is the one act (`change-log` C-001), whose item actions `change-log` derives from the
  status transitions and this module never states (`change-log` C-005). There is no operation
  of this contract that writes a record and no entry: a create, an edit, a deletion, a
  retirement, a confirmation, and an exclusion are each recorded, whatever the record's kind,
  which is what makes REQ-010's and REQ-045's clauses reachable for every kind SL-03 and SL-04
  store (SL-05 criteria 1 and 2). When `recordChange` rejects, the operation rejects with that
  error and the body passed in is unchanged: no record is stored without its entry and no
  entry without its record, so there is no state in which the two disagree, and a
  `collections['change-log-entry']` this module cannot write to stops every change rather than
  letting one through unrecorded (HZ-005). A read of this contract writes nothing and records
  nothing. (REQ-010, REQ-012, REQ-045 as `change-log`'s, reachable only through this clause;
  HZ-005, HZ-006; DEC-016; SL-05 criteria 1, 2 and 4.) *Mitigation support for HZ-005: the
  mitigation clause is `change-log` C-004, and this clause is what every registry act reaches
  it by.*
- **C-024 The platforms a change reaches are one derivation from the live links.**
  `platformsAffected(body, ref)` resolves with every platform id its kind names below, each
  once, ascending as strings, and with nothing else. For a `hazard`: every platform a live
  `hazard-platform` link joins that hazard to. For a `control`: every platform a live
  `hazard-platform` link joins a hazard to that a live `hazard-control` link joins that
  control to. For a `platform`: that platform, when an entry of `collections.platform` has the
  id. For a `causal-factor` or a `consequence`: the platforms its `hazardId` reaches. For a
  `justification` or a `rating`: the one platform its `platformId` names, when an entry of
  `collections.platform` has that id. For a `link` whose `linkKind` is `hazard-platform` or
  `control-platform`: the one platform its `platformId` names, likewise. For a `link` whose
  `linkKind` is `hazard-control`: the platforms its `hazardId` reaches.
  A link's status decides — only live links carry a change to a platform — and the status of
  the records it names never does, so a change to a deleted or retired record still reaches
  every platform still linked to it, which is how a deletion reaches the owners who were
  reading it (C-005; HZ-004, HZ-005). A platform's own status is not consulted either: a
  retired platform still has an owner and a queue. A `ref` of an owned kind that nothing in
  the body has resolves with an empty list, as a read does (section 4); a kind this module does
  not own rejects with `UnownedRecordKindError`, because an empty list would be this module
  claiming a change reaches nowhere when it holds no link to say so. This is the same list
  C-023 gives an entry as its `affectedPlatformIds` and the same list a consumer shows the user
  before saving, so the platforms a user was warned about and the platforms that then await the
  change cannot differ (REQ-011 is `views`' half, over this one; REQ-012; SL-05 criteria 3
  and 4). (HZ-006; DEC-016.)
- **C-025 Retirement takes a record out of the lists and leaves its row exactly where it is.**
  After `retireHazard(body, act, id)` resolves with `{ body: b, hazard: h }` for a live
  hazard: `h.status` is `'retired'`; `h.updatedBy` is `act.profile.id`; `h.updatedAtAest` is
  the clock's now; every other field of `h` equals what it was; `getHazard(b, id)` is
  deep-equal to `h`; `listHazards(b)` is `listHazards(body)` without it (C-006); and `b`
  differs from `body` only by that entry and the entry of C-023. `retireControl` and
  `retirePlatform` are the same for `collections.control` and `collections.platform`, leaving
  `listControls` and `listPlatforms` (C-011, C-014). No link, causal factor, consequence,
  justification, or rating is added, changed, or removed by any of the three, and no id is
  freed: a retired hazard's id is never assigned again (C-002). An unknown id rejects; a record
  that is not live rejects, so retiring twice fails the second time and a deleted record cannot
  be retired. Nothing in this version sets a status back to `live`. The act is recorded with
  the item action `retired`, which `change-log` derives from the transition (C-023;
  `change-log` C-005). (REQ-067; SL-05 criterion 6.)
- **C-026 A hazard on a platform is not retired, and the refusal names the platforms.**
  `retireHazard` rejects with `HazardOnPlatformsError` when one or more live
  `hazard-platform` links hold `id`, carrying every such `platformId` ascending as strings and
  never an empty list; the body is unchanged, the hazard stays live, and no entry is written.
  So a hazard cannot leave a platform's list by being retired, and the user is told which
  platforms stand in the way rather than that the attempt failed (REQ-076; HZ-004, HZ-005;
  SL-05 criterion 6). This version has no operation that unlinks a hazard from a platform, so
  a hazard that is on one cannot be retired at all until a later version adds one; that is a
  refusal to lose a hazard quietly, not an oversight. (REQ-076; SL-05 criterion 6.)
  *Mitigation clause for REQ-076 under HZ-005.*
- **C-027 Retiring takes a thing out of the library, never off a platform.** A retired control
  is still named by every live `hazard-control` and `control-platform` link that named it: it
  is still in `getHazardDetail(...).controls` (C-012) and still in the `controls` of every row
  of `listPlatformHazards` (C-019), with the same `state`, `confirmation`, and `justification`
  it had before, and the control record as stored with `status: 'retired'`. It is out of
  `listControls`, so it is not offered for a new link, and `linkControlToHazard` of it rejects
  with `ControlNotLiveError` (C-012). A retired platform likewise keeps every link that names
  it: `listPlatformHazards` still resolves for it, `getRatings` and `platformsAffected` still
  name it, and `linkHazardToPlatform` to it rejects with `PlatformNotLiveError` (C-015). So
  retiring never removes a control from a platform that a person confirmed it for, which the
  two readings of SL-05 criterion 6 differ on and which HZ-001 and HZ-004 decide; a control
  leaves a platform only by an exclusion carrying a reason (C-020, C-021). (REQ-067; HZ-001,
  HZ-004; SL-05 criterion 6.)
- **C-028 A platform's owner changes on one field, and its queue is untouched.** After
  `setPlatformOwner(body, act, { platformId, ownerProfileId })` resolves with
  `{ body: b, platform: q }` for a live platform: `q.ownerProfileId` is `ownerProfileId`;
  `q.id`, `q.kind`, `q.name`, `q.status`, `q.createdBy`, and `q.createdAtAest` are what they
  were; `q.updatedBy` is `act.profile.id` and `q.updatedAtAest` is the clock's now; and `b`
  differs from `body` only by that entry of `collections.platform` and the entry of C-023.
  No link, justification, rating, or existing entry of `collections['change-log-entry']` is
  touched, so `change-log.listAwaiting(b, platformId)` is `listAwaiting(body, platformId)` in
  the same order with nothing removed, plus this act's own entry when
  `act.madeForPlatformId` is not `platformId`: every change the outgoing owner had not
  acknowledged is what the incoming owner is shown, because the queue is keyed by platform and
  names no owner (`change-log` C-012). An owner that is not a user profile id rejects, an
  unknown or not-live platform rejects, and the owner the platform already has rejects
  (C-029); the body is unchanged. (REQ-081 as `change-log`'s, which this act is the only way to
  reach; HZ-006; SL-05 criterion 5.)
- **C-029 A change that changes nothing is refused, not recorded.** `updateHazard` with a
  `title` equal once trimmed to the hazard's stored `title`, `setPlatformReportId` with a
  `reportId` equal to the link's, `setPlatformOwner` with the platform's current
  `ownerProfileId`, and `setRating` over a live rating whose `consequence` and `likelihood`
  both equal the values given, each reject with `NoChangeError` carrying the record's
  `RecordRef` and the field; the body is unchanged, no header is restamped, and no entry is
  written. So every entry this module causes is an act that changed something, and
  `change-log`'s `UnchangedRecordError` is unreachable from here — which it would not be
  otherwise, since two calls in the same second stamp the same `TimestampAest` and would hand
  `change-log` a `before` deep-equal to its `after` (`change-log` section 4). A `setRating`
  with no live rating for those three ids is never a no change: it creates one. (REQ-045 as
  `change-log`'s; DEC-016; SL-05 criterion 2.)
- **C-030 Every hazard, control, and platform can be listed whatever its status.**
  `listAllHazards(body)` resolves with every entry of `collections.hazard`, once each, whatever
  its `status` — `live`, `retired`, or `deleted` — in C-006's order, each deep-equal to
  `getHazard(body, id)`; `listHazards(body)` is exactly its `live` entries in the same order.
  `listAllControls` is the same over `collections.control` in C-011's order, and
  `listAllPlatforms` over `collections.platform` in C-014's order, each of which
  `listControls` and `listPlatforms` are the `live` entries of. Each record carries its stored
  `status`, and nothing else is in the list: no record of another kind and no duplicate. A
  body with no such collection lists as empty; a malformed entry rejects with that kind's
  `Malformed*Error` (C-008). So a list filtered by status is a subset of this one, and a
  retired or deleted record can be found to be filtered. (REQ-047 is `views`', over this;
  SL-11 criterion 1.)
- **C-031 The live links that name a record are listed whatever the records at either end
  are.** `listLinks(body, ref)` resolves with every entry of `collections.link` whose
  `status` is `live` and which names `ref.id` in the field of `ref.kind`, once each, in
  ascending order of `createdAtAest` then id, and with nothing else. For a `hazard` that is
  every live link whose `hazardId` is `ref.id`, of all three `linkKind`s; for a `control`,
  every live `hazard-control` and `control-platform` link whose `controlId` is; for a
  `platform`, every live `hazard-platform` and `control-platform` link whose `platformId` is.
  No other record kind is named by a link, so a `ref` of any other kind this module owns
  resolves with an empty list, as does a `ref` whose id nothing in the body has. A link's own
  status decides and the status of the records it names never does, which is section 3's
  "linked" and C-024's rule: a control whose only `hazard-control` link names a deleted or
  retired hazard has that link listed, and so does a platform whose only `hazard-platform`
  link names one. The `ref`'s own record is not read, so the links of a retired or deleted
  hazard, control, or platform are listed as a live one's are. A `ref` of a kind this module
  does not own rejects with `UnownedRecordKindError`; a malformed link rejects with
  `MalformedLinkError` (C-008). Causal factors and consequences are not links and are not
  here: they are `getHazardDetail`'s (C-010). (REQ-068 is `views`', over this and C-010;
  SL-11 criteria 1 and 4.)

Ordering: C-006 for hazards; ascending `createdAtAest` then id for controls, platforms,
causal factors, and consequences (C-010, C-011, C-012, C-014); the hazard's global ID
number for C-019's rows; ascending as strings for C-024's platform ids and for the platform
ids `HazardOnPlatformsError` carries (C-026); the order of C-023's table for an entry's
`items`; C-006, C-011, and C-014's orders for C-030's lists, and ascending `createdAtAest`
then id for C-031's links. Collections are keyed, so the order of their entries is not data.
Idempotency: every read is harmless and, on the same body, resolves with deep-equal
results. Creating the same title twice yields two
records with two ids: titles and names are not unique. Linking or confirming twice fails the
second time (C-012, C-013, C-015); deleting twice fails the second time (C-005), and so does
excluding a control already excluded (C-020) and retiring a record already retired (C-025).
Confirming a control that is excluded, and
excluding one that is confirmed, each succeed and supersede the other (C-021). From 4.0 no
changing operation is idempotent by repetition: a second call that would write what is
already written rejects with `NoChangeError` rather than restamping a header and recording a
second act (C-029), which is where 3.0's "`setRating` over the same three ids is idempotent in
effect" went.
Determinism: with the baseline clock held, every operation is a function of its arguments
and of the ids `IdKind.fresh` returns; a hazard's id comes from the body's sequence, and
every other new id is a random UUID, which is the one thing a conformance test must not
assume (DEC-005).
Null and empty semantics: a missing collection lists as empty; a blank title, name, or text
is refused; `getHazard` and `getHazardDetail` of an unknown id are null; a rating never
entered reads as both values null, which is not an error; a body with no
`collections.justification` has no control excluded, so every one of a hazard's controls on a
platform is `confirmed` or `awaiting` (C-021); a body with no `collections['change-log-entry']`
gains one on the first change (`change-log` C-006); an `act.madeForPlatformId` of null is a
value and means the act was made for no platform, so every platform it reaches awaits it,
while an absent one is refused (C-023).
Concurrency safety: two copies of Pivot on one folder are the designed case (ASM-004).
Each holds its own working body, so two copies may both assign the same next hazard id, and
may both confirm the same control for the same platform, or one confirm what the other
excluded, before either saves; `store` C-004
keeps the first save when the second overwrites it, and what `data.json` then holds is that
clause's outcome, not this module's. The same is true of the entries two copies record: each
body carries its own, and the save that is kept carries the history of the changes it kept.
Within one copy, calls are made one at a time by the
caller on the body it holds; overlapping calls on one body are not promised, and a consumer
that discards a returned body discards the change and its entry together.
Side effects: none (C-007). No changing operation has a state to stop in part-way: it resolves
with a body carrying the record and its entry, or it rejects and the body it was given is
unchanged (C-003, C-023).
Tolerance and precision: none; every comparison is exact, and a consequence and a likelihood
are compared as the values entered, never as a band (C-017).

## 6. Performance envelope
Each operation is linear in the entries of the collections it reads and touches no other
collection. `listPlatformHazards` is linear in `collections.link` plus
`collections.justification` plus the hazards,
controls, and ratings its rows name. `platformsAffected` is linear in `collections.link` for
every kind but `control`, which is linear in it twice — the hazards a control is on, then the
platforms those hazards are on. From 4.0 every changing operation also carries
`change-log.recordChange`'s cost, which is linear in the fields of the records handed over
plus `collections['change-log-entry']` (`change-log` section 6), and that collection only
grows; a change is therefore no longer independent of how long the folder has been in use.
Each of C-030's lists is linear in its one collection, and `listLinks` in `collections.link`. No
bound beyond DEC-003's is claimed: the body is in memory, and the folder's I/O is `store`'s.

## 7. Trace
Allocated to this module in `trace/requirements.yaml`; mitigations in `trace/hazards.yaml`;
the dependency graph in `modules/registry/manifest.yaml`, checked against the real imports.
These are the sources, not this list (DEC-011 retired `docs/module-map.md`, which earlier
versions of this section cited). Checked by `check_traces.py` and `check_boundaries.js`.

Promised at version 1.0: REQ-024, REQ-050.

Promised at version 2.0: REQ-003 (C-017), REQ-025 (C-015), REQ-032 (C-011), REQ-033
(C-012), REQ-034 (C-013), REQ-035 (C-014), REQ-042 and REQ-043 (C-017), REQ-044 (C-010,
C-012), REQ-051 and REQ-052 (C-016), REQ-065 (C-014). This module's half of REQ-017 is
C-018, the storage half; the band is `rating`'s. HZ-002 is mitigated at C-017 and HZ-004 at
C-019; HZ-010 is `rating` C-001's, and C-018 keeps out of its way by storing no band.

Promised at version 3.0: REQ-001 (C-013 with C-021), REQ-013 (C-013), REQ-058 (C-020),
REQ-070 (C-022). HZ-001 is mitigated at C-021 and HZ-007 at C-013. REQ-002 is `views`' half,
as REQ-009 is: this version supplies every one of a hazard's controls with its state and its
reason in C-019's rows, and which of them a screen shows is `views`' to promise, so its
`allocated_to` is written by `views`' SL-04 CONTRACT session and is not claimed here.

Promised at version 4.0: REQ-067 (C-025 with C-027), REQ-076 (C-026). Both are written to
`allocated_to: registry` by this session.

REQ-067 names four record kinds and this module owns three of them; the reference register's
entry is `reference-entry`, which no module holds until SL-10. Its retirement is that module's
and will need either a requirement of its own or a reallocation of REQ-067, which is a GATE
decision at SL-10 and not this session's to take. Recorded here so it is not discovered as a
gap: at 4.0, REQ-067 is verified for a hazard, a control, and a platform only.

Not claimed at version 4.0, and reachable only through this version: REQ-010, REQ-012,
REQ-045, and REQ-081 are `change-log`'s, allocated there. C-023 is what every act of this
module reaches them by — without it a registry record could be created, edited, deleted, or
retired with no entry, and `change-log`'s clauses would promise a history of acts nobody
records. REQ-011 is `views`', over C-024: this version supplies the platforms a change
reaches, and showing them before a save is the screen's. HZ-005 and HZ-006 are mitigated at
`change-log` C-004 and C-010; this module's contribution is C-023 for both and C-026 for
REQ-076 under HZ-005.

Promised at version 5.0: no requirement is claimed. REQ-047 and REQ-068 are `views`', allocated
there; C-030 and C-031, with C-010 stated for every status, are what `views` builds their
status filter and their flag from (DEC-036). Which statuses a filter offers, which links and
which of a hazard's causal factors and consequences make a thing "linked", and whether a
deleted record is flagged are `views`' to promise, not this module's.

## Explicitly not promised
- Any field of any record beyond those in section 3, or any record kind beyond the seven.
  Adding a field is an Interface change to this module (DEC-005).
- That a title, a name, a text, or a `PlatformReportId` is unique, has a maximum length, or
  is normalised beyond trimming. Two hazards on one platform may be given the same
  `reportId` by a user; whether that should be refused is a decision SL-09's reports will
  force, not one this version makes.
- Changing a control's title, a platform's name, a causal factor's or a
  consequence's text, a justification's text, or a `ControlKind` once linked; removing a
  causal factor or a consequence; deleting a control or a platform; unlinking a hazard from a
  platform; unlinking a control from a hazard. Only a hazard's title changes (C-009), only a
  control's place on a platform changes (C-013, C-020, C-021), and from 4.0 only a platform's
  owner changes (C-028), because those are what SL-03, SL-04, and SL-05 ask for. Each of the
  rest is a later version. A reason a user wants to reword is recorded by excluding again after
  a confirmation, or is a later version; nothing here edits a stored `Justification`.
- Unretiring. Nothing in this version sets a status back to `live` from `retired` or
  `deleted`, so retiring is one-way at 4.0 and a record retired in error is answered by the
  history (C-023) rather than by a reversal. SL-05's criteria ask for retirement and not for
  its undoing; adding one is an Interface change that must decide what the act is called in
  the log and whether a hazard may return to a platform.
- Any refusal to retire a control or a platform. REQ-076 names hazards only, so a control on
  platforms and a platform carrying hazards are both retired without objection — which is safe
  only because retiring takes neither of them off anything (C-027). If a later version makes
  retirement remove things, this exemption has to be revisited with it.
- Confirming or excluding more than one control in a call, and any bulk or default
  confirmation. Each act names one control and carries one profile (C-013, C-020); the
  onboarding workflow that walks a user through a platform's awaiting controls is SL-07's and
  is built from these acts, never from a widening of them (HZ-007).
- Any meaning for the order of a triple's superseded rows beyond their headers' times, or
  any promise that a `control-platform` link and a `Justification` for one triple are
  interleaved in a single history. What a user sees of that history is REQ-045's, and
  `change-log.listHistory` gives it from the entries C-023 writes.
- What an entry holds, how a history reads, what a platform still awaits, and who may
  acknowledge it. This module hands `change-log` one act and reads nothing back: every promise
  about the entry is that contract's, and a consumer reads the history and the queue from it
  directly (C-007, C-023). Nothing here acknowledges anything.
- That `affectedPlatformIds` is complete for anything but the records C-023 names. It is this
  module's statement about its own links (C-024); a consumer that changes a record some other
  way and then calls `change-log` itself is outside both clauses.
- Any history of who changed what on the record itself, beyond the header's last writer. The
  visible record is the log's; this module leaves rows in place (C-005, C-013, C-025) so that
  record can be made.
- What a rating *means*. No band, word, or colour is stored or returned; `rating.ratingFor`
  is the only source of one (DEC-002, DEC-012), and this module does not import it.
- Whether a returned record is the same object as the entry in the returned body, or a
  copy. Treat every returned value as read-only.
- Any restriction on `act.profile` or on `ownerProfileId` beyond their shape: that either
  names a stored profile is `profiles` C-004's promise to the consumer that passes it on.
  Nothing here checks that the profile performing an act is entitled to perform it, that it
  owns the platform an act is made for, or that `act.madeForPlatformId` is one of the
  platforms the act reaches — a user may edit a hazard from one platform's screen and change
  nothing that platform can see (C-024).
- The order of entries inside a collection, or anything about the body a consumer reads
  directly rather than through this contract. `DataBody` is baseline; the collections
  listed in section 3 are this module's to interpret.
- What a consumer may do with a body between calls, including saving it. `store` C-002
  decides what a save needs; this module only requires an act to stamp a header and record
  what was done. A consumer that makes two calls for what a user saw as one act has performed
  two acts and the log holds two entries (`change-log` C-001); this version has no operation
  that spans two of its own changes, apart from the supersessions C-021 already makes one act.
- The wording of anything shown to the user, and which screen shows it. This module
  signals; `views` speaks.
- Whether a record is "linked to nothing" in REQ-068's sense. `listLinks` gives the live links
  that name a record and says nothing about whether they are enough (C-031); a hazard's causal
  factors and consequences are in `getHazardDetail` (C-010), and combining the two is `views`'.
- A link that is not live. `listLinks` does not list a superseded `control-platform` link
  (C-021); the history of one is `change-log`'s (C-023).
