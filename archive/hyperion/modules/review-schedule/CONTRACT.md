# Contract: review-schedule
Version: 1.0 · Status: draft

Written for SL-06. Promises the review tempo STK-016 and STK-025 ask for and the overdue flag
STK-016 asks for, from one collection: one record per scheduled record, holding the tempo a
user set, the date the schedule next falls due, and the date a review was last completed
(REQ-015, REQ-020, REQ-021, REQ-022, REQ-072; HZ-009, HZ-012). It owns the record kind
`review-schedule`, which baseline gained for it at DEC-018 — the alternative, three fields on
`registry`'s and `reference-register`'s record kinds, is rejected there.

Two questions G1 deferred to this slice (REV-002 M21, carried as FND-021) are settled by this
contract and by the G3 rulings it records: the tempo is a whole number of calendar months
(C-005), and a record is overdue from the day after its due date, so a review done on the due
date is on time (C-009). Both were ruled by jay-pryor at G3 and are stated here as clauses a
conformance test is written from, which is what closes the finding.

Nothing here knows what a hazard, a control, or a platform is. A schedule names its record by
a baseline `RecordRef` and this module resolves no id and imports no module that could
(C-003, C-011), so `reference-entry` is schedulable at 1.0 although no module owns that kind
until SL-10: a schedule for a reference entry is stored, listed, and flagged overdue by this
version, and the entry it points at arrives later. For the same reason the platforms a
schedule change reaches are named by the caller and never derived here (DEC-020), as they are
for `change-log` (DEC-015).

REQ-021 says the due date shall be "the date its user-set review schedule next falls due" and
"shall never derive it from the last reviewed date". That admits two readings of what "next
falls due" is, and G3 settled it: a user-set next-due date, advanced one tempo each time a
review completes, not a user-set start date plus n tempos. The consequence is the shape of
this contract's record — `nextDueAest` is a stored field and no operation reads
`lastReviewedAest` to produce it (C-006) — so the prohibition is kept by there being nothing
to derive from rather than by a rule anyone has to remember (P2). The rejected reading would
have made the due date a computation over a start date, a tempo, and a count of completions,
and the count is the thing a completed review would have had to store anyway.

## 1. Purpose
Hold each scheduled record's review tempo, the date its schedule next falls due, and the date
a review on it was last completed, and say from those whether it is overdue.

## 2. Operations
In `contract.js`. Every operation is asynchronous and returns a promise (DEC-012). Every
operation is a function of the `DataBody` passed in and, for the two that change it and the
two that flag, of the baseline clock; the two that change it are also a function of
`change-log.recordChange` (C-012). None reads or writes the data folder, the browser's
storage, or anything else (DEC-006). A consumer holds the working body from `store.load`,
replaces it with the `body` each changing operation returns, and passes it to `store.save`
when the user saves. Each changing operation takes a `ScheduleAct`: one call, one profile, one
instant, the platform the user was working on, and the platforms the act reaches (DEC-016,
DEC-020).

| Operation | Signature | Verified by |
|---|---|---|
| setSchedule | `(body: DataBody, act: ScheduleAct, fields: ScheduleFields) → ScheduleChange` | conformance |
| completeReview | `(body: DataBody, act: ScheduleAct, ref: RecordRef) → ScheduleChange` | conformance |
| getSchedule | `(body: DataBody, ref: RecordRef) → ReviewSchedule \| null` | conformance |
| listSchedules | `(body: DataBody) → readonly ReviewSchedule[]` | conformance |
| reviewStateOf | `(body: DataBody, ref: RecordRef) → ReviewState` | conformance |
| listOverdue | `(body: DataBody) → readonly ReviewState[]` | conformance |

A conformance test starts from `schema.emptyDataBody()` or a body it builds, holds the
baseline clock where a clause names it, and needs no folder and no module but `change-log`:
the refs it schedules are `RecordRef` values built in test code, which is what this module
sees of every kind whoever owns it (C-011), and the entries its acts wrote are read back
through `change-log`'s own contract — `listEntries`, `listHistory`, `listAwaiting` — and never
by reading `collections['change-log-entry']` itself, as registry's suite does (registry
section 2). Criterion 4's two directions are one test each with the clock fixed either side of
a due date, which is why the clock is baseline and held rather than read (`baseline/clock.js`).

## 3. Data shapes
From `baseline/types.js`: `ReviewScheduleId`, `ReviewTempoMonths`, `DateAest`, `PlatformId`,
`UserProfileId`, `ActiveProfile`, `RecordKind`, `RecordStatus`, `RecordRef`, `TimestampAest`.
From `baseline/schema.js`: `DataBody`, whose `collections['review-schedule']` is the one
collection this module reads and writes. `collections['change-log-entry']` is not among them:
it is `change-log`'s, and this module only ever adds to it by calling that contract (C-003,
C-012). Defined in `contract.js`:

**What may be scheduled**: `SCHEDULABLE_KINDS`, the four `RecordKind` values SL-06 criterion 1
names and REQ-021, REQ-022, and REQ-072 name — `hazard`, `control`, `platform`,
`reference-entry`. A `ref` of any other kind is refused (C-011).

**The record**, the baseline record header narrowed to this kind and id, plus its own fields
(DEC-005), in `collections['review-schedule']` keyed by its id:

- `ReviewSchedule`: `kind: 'review-schedule'`, `id: ReviewScheduleId`, `ref: RecordRef` — the
  record scheduled — `tempoMonths: ReviewTempoMonths`, `nextDueAest: DateAest`, and
  `lastReviewedAest: DateAest | null`. At most one live schedule per `ref` (C-001).
  `createdBy` and `createdAtAest` are who first set a tempo for the record and when;
  `updatedBy` and `updatedAtAest` are the last act that changed the schedule, which is a
  `setSchedule` or a `completeReview` and nothing else.

The unit is in the type name and not in a comment (IMP-05): `tempoMonths` is a
`ReviewTempoMonths`, a whole number of calendar months of at least one, and both dates are a
`DateAest`, a calendar date in AEST with no time and no zone to confuse (`baseline/types.js`,
ASM-005). A tempo is never a number of days and never a count of anything else; a date is
never a `TimestampAest`, so no comparison in this contract depends on a time of day.

**The act**, what a consumer supplies to each changing operation:

- `ScheduleAct`: `{ profile: ActiveProfile, madeForPlatformId: PlatformId | null,
  affectedPlatformIds: readonly PlatformId[] }` — registry's `Act` (registry section 3) plus
  the platforms the act reaches. The profile stamps the header. `madeForPlatformId` and
  `affectedPlatformIds` are not stored on the schedule: they are passed through to the entry
  C-012 writes, where they are what decides which platforms await the act (`change-log`
  C-010). All three are required and never defaulted (C-012). `affectedPlatformIds` is the
  caller's statement, computed from `registry.platformsAffected` for the record being
  scheduled, and this module neither checks nor completes it (DEC-020).

**Field bundles** a consumer supplies: `ScheduleFields`
`{ ref: RecordRef, tempoMonths: ReviewTempoMonths, nextDueAest: DateAest }` — the tempo and
the due date are given together, so no tempo is stored without a due date to apply it to.
`completeReview` takes a `RecordRef` and no bundle: what it sets is the clock's today and one
tempo, neither of them the caller's to supply (C-008).

**Reads**:

- `ReviewState`: `{ ref: RecordRef, schedule: ReviewSchedule | null, overdue: boolean,
  asAtAest: DateAest }` — a record's review standing as at one date. `asAtAest` is the
  baseline clock's today at the moment of the call, carried so the flag is auditable and no
  consumer has to know which clock decided it (C-009).

**Changes**, what a changing operation returns: `ScheduleChange` `{ body: DataBody, schedule:
ReviewSchedule }`, the body as it now is and the schedule as it now is. The body passed in is
untouched (C-002). No change shape carries the entry the act wrote: it is in the returned body
and is read from there through `change-log` (C-012), as registry's are.

Every field of every stored schedule is a string, a whole number, or null, so the body after
any operation is deep-equal to itself after JSON serialisation and parsing, which is what
`store` C-001 carries across a save and a load. "Live" everywhere in this contract means a
schedule whose own `status` is `live` — the schedule's status, never the status of the record
its `ref` names, which this module cannot read (C-011).

## 4. Error conditions
Signalled as a rejected promise carrying the named error class. "Body unchanged" means the
body passed in is deep-equal to what it was before the call, which C-002 promises of every
call, and that nothing was returned as a new body.

| Operation | Condition | Signalled as | Caller obligation |
|---|---|---|---|
| every operation | an entry of `collections['review-schedule']` is not a `ReviewSchedule` (C-004) | `MalformedScheduleError` naming the entry's key and one sentence naming the field; nothing returned; body unchanged | Name the record to the user; show no schedule and no overdue flag from that collection |
| every operation that takes a ref | `ref` is missing, or is not a record kind and a string id | `InvalidRefError` naming the value; body unchanged | Pass the kind and id of the record being scheduled |
| every operation that takes a ref | `ref.kind` is a `RecordKind` outside `SCHEDULABLE_KINDS` | `UnschedulableKindError` carrying the kind; body unchanged | Do not offer a review tempo for that kind at this version (section 7) |
| setSchedule, completeReview | `act` is missing, or `act.profile` is missing, or its `id` is not a user profile id | `MissingProfileError`; body unchanged | Show the profile screen (REQ-055) |
| setSchedule, completeReview | `act.madeForPlatformId` is absent or is neither null nor a platform id, or `act.affectedPlatformIds` is absent or holds an entry that is not a platform id | `InvalidActError` naming the value; body unchanged | Pass the platform the screen is on, or null, and the ids `registry.platformsAffected` gave; never leave either field off (DEC-016, DEC-020) |
| setSchedule | `fields.tempoMonths` is not a whole number of at least one | `InvalidTempoError` naming the value; body unchanged | Ask for a whole number of months (REQ-020, REQ-022) |
| setSchedule | `fields.nextDueAest` is not a real calendar date as `YYYY-MM-DD` | `InvalidDueDateError` naming the value; body unchanged | Ask when the review next falls due (REQ-021) |
| completeReview | no schedule in the body has `ref`, live or otherwise | `UnknownScheduleError` carrying the ref; body unchanged | Set a tempo for the record before recording a review against it |
| setSchedule, completeReview | a schedule has `ref` and its status is not `live` | `ScheduleNotLiveError` carrying the ref and the status; body unchanged | Say the schedule is deleted or retired; nothing at this version sets a status back (not promised) |
| setSchedule | the live schedule for `ref` already holds both `tempoMonths` and `nextDueAest` as given | `NoChangeError` carrying the ref and the field; body unchanged; no entry written | Say nothing changed; the values given are the values stored (C-013) |
| setSchedule, completeReview | `change-log.recordChange` rejects, which for a body this module wrote can only be an entry of `collections['change-log-entry']` that `change-log` cannot read | that error unchanged, `MalformedEntryError`; nothing written; body unchanged | Name the entry to the user; nothing may be changed while the history cannot be read (C-012) |

A body with no `collections['review-schedule']` is not an error: it has no schedule, so
`getSchedule` is null, `listSchedules` and `listOverdue` are empty, `reviewStateOf` has
`schedule` null and `overdue` false, and the first `setSchedule` creates the collection
(C-001). A read never rejects for a ref nothing has: `getSchedule` resolves with null and
`reviewStateOf` with a state whose `schedule` is null, whether or not a record of that kind
and id exists anywhere — this module holds no record of another kind and cannot say (C-011).
An ill-formed or unschedulable ref rejects on a read as on a change, because it is a question
this contract has no answer to rather than a record it does not hold.

When two conditions of an operation hold at once, the one signalled is the first of these that
applies, so that a conformance test has one expected rejection and not a choice: a malformed
schedule in the collection; a missing profile; an ill-formed act; an ill-formed ref; an
unschedulable kind; an unknown schedule; a schedule that is not live; a field value
(`InvalidTempoError`, `InvalidDueDateError`); then a change that changes nothing
(`NoChangeError`); and last, whatever `change-log.recordChange` rejects with, which this module
reaches only once it has accepted the act. The body is unchanged whichever fires. So a tempo of
zero for an unschedulable kind is `UnschedulableKindError`, and an unchanged tempo on a retired
schedule is `ScheduleNotLiveError`.

## 5. Behavioural promises

- **C-001 A record has at most one schedule, under an id of its own.** After
  `setSchedule(body, act, { ref, tempoMonths, nextDueAest })` resolves with
  `{ body: b, schedule: s }` for a `ref` no live schedule names: `s.id` is a fresh
  `ReviewScheduleId` held by no entry of `collections['review-schedule']`; `s.ref` is `ref`;
  `s.tempoMonths` and `s.nextDueAest` are as given; `s.lastReviewedAest` is null; `s.kind` is
  `'review-schedule'`; `s.status` is `'live'`; `s.createdBy` and `s.updatedBy` are
  `act.profile.id`; `s.createdAtAest` and `s.updatedAtAest` are the baseline clock's now;
  `getSchedule(b, ref)` is deep-equal to `s`; and `listSchedules(b)` is `listSchedules(body)`
  plus `s`. For a `ref` a live schedule already names, the same call updates that record,
  keeping its `ReviewScheduleId`, its `createdBy`, its `createdAtAest`, and its
  `lastReviewedAest`, and `b` differs from `body` only by that one entry and the entry of
  C-012. A schedule is therefore addressable in its own right and is one record, not a field of
  four other kinds (DEC-018): a second `setSchedule` for one record never yields a second live
  schedule, and `listSchedules` never lists two for one `ref`. (REQ-072; SL-06 criterion 1.)
- **C-002 The body is a value.** No operation modifies the body passed in: after any call,
  resolved or rejected, that body is deep-equal to what it was. The `body` a changing
  operation returns differs from the one passed in only in the one entry of
  `collections['review-schedule']` that operation's clause names and in the one entry of
  `collections['change-log-entry']` its act added (C-012); every other collection, every other
  entry of the two it touches, and every sequence is deep-equal to the input's. A collection of
  a kind this module does not own is carried through untouched and unread, however it is
  shaped, so a body whose hazards or controls are malformed is scheduled and flagged without
  objection: what a `ref` points at is not this module's to read (C-011). (REQ-004 as this
  module's half of it; REQ-072.)
- **C-003 Confinement.** No operation reads or writes the data folder, the browser's storage,
  or any global state; the only things outside its arguments an operation reads are the
  baseline clock and `change-log.recordChange`. The clock is read by `completeReview` (C-008),
  `reviewStateOf`, and `listOverdue` (C-009) and by nothing else, so `setSchedule`,
  `getSchedule`, and `listSchedules` are functions of their arguments alone;
  `change-log.recordChange` is read by the two changing operations and by nothing else.
  `modules/change-log/contract` is the one module this contract imports, and it is imported for
  that one operation: nothing here calls `change-log.acknowledge`, and nothing here reads or
  writes `collections['change-log-entry']` directly — every entry this module causes is written
  by `change-log` from what this module handed it (C-012). This module never imports `store`,
  `views`, `rating`, `profiles`, or `registry`: it holds no link, so the platforms an act
  reaches are the caller's (DEC-020), and the graph stays acyclic because `change-log` imports
  nothing (DEC-004, DEC-015). It keeps no index, no cache, and no state between calls.
  (DEC-006; REQ-069 as `store`'s to keep.)
- **C-004 A malformed schedule is refused or named, never skipped.** An entry of
  `collections['review-schedule']` is malformed when its key differs from its `id`, its `id`
  is not a `ReviewScheduleId`, its `kind` is not `'review-schedule'`, its `status` is not a
  `RecordStatus`, a header id is not a user profile id, a header time is not a
  `TimestampAest`, its `ref` is not a record kind and a string id, its `ref.kind` is outside
  `SCHEDULABLE_KINDS`, its `tempoMonths` is not a whole number of at least one, its
  `nextDueAest` is not a `DateAest`, or its `lastReviewedAest` is neither null nor a
  `DateAest`. Every operation rejects with `MalformedScheduleError` naming the entry's key and
  returns nothing. There is no operation of this contract that resolves while omitting a
  schedule it could not read: a list is never shown with one silently missing from it, and — the
  reason this is a refusal and not an omission — a record whose schedule cannot be read is
  never reported as not overdue, which is the shape of HZ-012's never-statement (C-009). A
  schedule whose `nextDueAest` is in the distant past or future is not malformed; it is a date,
  and it is overdue or not by C-009 like any other. (REQ-072; HZ-012 with C-009.)
- **C-005 The tempo is a whole number of calendar months, set per record, and stored as
  given.** `fields.tempoMonths` is a `ReviewTempoMonths`: a whole number of at least one,
  meaning that many calendar months, and never a number of days (DEC-019, `baseline/types.js`).
  `setSchedule` stores it unchanged — not rounded, not converted, not normalised — and
  `getSchedule` and `listSchedules` give back the number that was set. Each call names exactly
  one `ref`, so a tempo is set for one record at a time and this surface has no operation that
  sets a tempo for a kind, for a list, for every record a platform holds, or by default: a
  record has the tempo a person set for it or no schedule at all. The four kinds of
  `SCHEDULABLE_KINDS` are set the same way by the same operation, with no per-kind tempo, no
  per-kind default, and no inheritance from one kind to another. (REQ-020, REQ-022, REQ-072;
  SL-06 criterion 1.)
- **C-006 The due date is stored, and no operation derives it from the last reviewed date.**
  `nextDueAest` is a stored field of the schedule, set by `setSchedule` to the value given and
  changed by `completeReview` to one tempo later (C-008), and by nothing else. No operation of
  this contract reads `lastReviewedAest` — not `setSchedule`, not `completeReview`, not
  `getSchedule`, not `listSchedules`, not `reviewStateOf`, not `listOverdue` — so no due date
  this module gives is a function of it, whatever value it holds and however it came to hold
  it. Setting `lastReviewedAest` by any route therefore leaves `nextDueAest` deep-equal to what
  it was: this version has one such route, `completeReview`, which changes the due date by the
  schedule and not by the review's date (C-008), and a body in which a schedule's
  `lastReviewedAest` was changed by some other means gives the same due date as one in which it
  was not. That is REQ-021's prohibition kept by there being nothing to derive from rather than
  by a rule (P2), and it is what makes criterion 2 falsifiable: complete a review with the clock
  at any date, or alter the last reviewed date and read the schedule back, and the due date is
  unmoved. (REQ-021; HZ-009; SL-06 criterion 2.) *Mitigation support for HZ-009: the telling
  before a report is REQ-016 at SL-09, and this clause is what makes "out of date" a determinate
  fact about a record for it to tell.*
- **C-007 The last reviewed date moves only when a review is completed.** `lastReviewedAest`
  is null on a schedule `setSchedule` created (C-001) and is changed by `completeReview` and by
  no other operation of any contract: `setSchedule` over an existing schedule keeps the value
  it holds, whatever tempo and due date it is given, and the three reads change nothing. This
  contract has no operation that sets, clears, backdates, or takes a last reviewed date as an
  argument, so there is no call by which editing a record, saving, restoring, retiring, or
  changing a tempo sets it — an edit to a hazard is `registry`'s and touches no collection of
  this module (registry C-003), and this module is the only writer of its own collection. The
  only way a last reviewed date exists is that a review workflow completed and called
  `completeReview`; a test calls it at SL-06 and `workflows` calls it at SL-07, over this same
  surface and with no wider one. (REQ-015; HZ-009; SL-06 criterion 3.)
- **C-008 Completing a review stamps today and advances the due date one tempo from the due
  date.** After `completeReview(body, act, ref)` resolves with `{ body: b, schedule: s }` for a
  live schedule `s0`: `s.lastReviewedAest` is the baseline clock's `todayAest()`;
  `s.nextDueAest` is `s0.nextDueAest` plus `s0.tempoMonths` calendar months, by DEC-019's
  arithmetic — the same day of the month, or that month's last day when it has fewer;
  `s.tempoMonths`, `s.ref`, `s.id`, `s.kind`, `s.status`, `s.createdBy`, and `s.createdAtAest`
  are what they were; `s.updatedBy` is `act.profile.id` and `s.updatedAtAest` is the clock's
  now; and `b` differs from `body` only by that entry and the entry of C-012. The new due date
  is a function of the old due date and the tempo and of nothing else: not of
  `s.lastReviewedAest`, not of `s0.lastReviewedAest`, and not of the clock, so completing the
  same review with the clock fixed to two different dates gives two different last reviewed
  dates and one identical due date (C-006). A review completed after the due date has passed
  does not pull the schedule forward to today, and one completed early does not push it out
  beyond one tempo: the schedule keeps its cadence, which is what "next falls due" was ruled to
  mean at G3. Examples fixed by DEC-019, each a conformance case: 31 January with a tempo of 1
  advances to 28 February, or 29 February in a leap year; 31 March with a tempo of 1 advances to
  30 April; 15 June with a tempo of 12 advances to 15 June the next year; 29 February with a
  tempo of 12 advances to 28 February. (REQ-015, REQ-021; SL-06 criteria 2 and 3.)
- **C-009 Overdue begins the day after the due date, against the baseline clock.**
  `reviewStateOf(body, ref)` resolves with a `ReviewState` whose `asAtAest` is the baseline
  clock's `todayAest()` at the moment of the call, whose `schedule` is the live schedule for
  `ref` or null when none names it, and whose `overdue` is true exactly when that schedule is
  not null and its `nextDueAest` is strictly earlier than `asAtAest`, compared as calendar
  dates. So with the clock fixed to the due date, `overdue` is false; with it fixed to the day
  after, `overdue` is true; and with it fixed to any earlier date, false — the boundary ruled at
  G3, and the whole of what this contract means by overdue. A record with no live schedule has
  `overdue` false: nothing is due, so nothing has fallen overdue. The comparison is of dates
  and never of times, so the flag does not turn over at an hour of the day and is the same for
  every user of the folder, AEST having no daylight saving (ASM-005). No other rule bears on
  the flag: not the last reviewed date, not the tempo, not the record's own status, not how far
  past the due date it is, and not whether a review was ever completed. (REQ-019 and REQ-023 as
  `views`' halves, over this one; HZ-012; SL-06 criterion 4.) *Mitigation clause for HZ-012.*
- **C-010 Every overdue flag comes from one call.** `listOverdue(body)` resolves with a
  `ReviewState` for every live schedule whose `nextDueAest` is strictly earlier than the
  clock's today, once each, in ascending order of `nextDueAest` then the schedule's id, and
  with nothing else: no schedule that is not live, no schedule not yet due, no duplicate, and
  no record without a schedule. Every state it gives has `overdue` true, a `schedule` that is
  not null, and the same `asAtAest`, which is the clock's today read once for the whole call.
  For every `ref` it names, `reviewStateOf(body, ref)` called at the same clock gives a
  deep-equal state, and for every live schedule it omits, `reviewStateOf` gives `overdue`
  false — so the two agree by construction and a consumer may use either. Every list Pivot
  shows that flags a record as overdue is built from this one call or from `reviewStateOf` for
  the one record a screen is about, and from no rule of its own: no consumer compares a due
  date to a clock itself, and `views` obtains the flag here and nowhere else, which is what
  makes criterion 4's "in every list that shows it" one thing to verify rather than one per
  list (registry C-019 and C-020 are the same arrangement for a platform's hazards). Empty when
  nothing is overdue. (REQ-019 and REQ-023 as `views`' halves; HZ-012; SL-06 criterion 4.)
- **C-011 A schedule is set for one of four kinds, and no id is ever resolved.** The `ref` of
  every schedule this module writes has a `kind` in `SCHEDULABLE_KINDS`; a `ref` of any other
  `RecordKind` is refused on every operation, read or change, and no schedule for one can be
  created or read back (section 4). Within those four, this module resolves nothing: it never
  asks whether a record of that kind and id exists, whether it is live, whether it is on a
  platform, or what it contains, and it imports no module that could tell it (C-003). So a
  schedule for a `reference-entry` is stored and flagged although no module owns that kind
  until SL-10; a schedule survives the record it names being deleted or retired by its owner,
  and goes on falling due and reading as overdue, because nothing here is told; and two
  schedules for two kinds that happen to share an id string are two schedules, since a `ref` is
  a kind and an id together. What a schedule's `ref` points at is the owning module's, and this
  contract records what it was told (DEC-004, DEC-015, DEC-020). What becomes of the schedule of
  a record its owner retires is not promised at 1.0 and is named in the not-promised section.
  (REQ-015, REQ-021, REQ-022, REQ-072 as the four kinds each names; DEC-018.)
- **C-012 No change this module makes is unrecorded, and no schedule is written without its
  entry.** Each of `setSchedule` and `completeReview` calls `change-log.recordChange` exactly
  once, with `act.profile` and a `RecordedChange` whose `records` are the one schedule its
  clause names, as it was — null where the act created it — and as it now is;
  `madeForPlatformId` is `act.madeForPlatformId` unchanged and `affectedPlatformIds` is
  `act.affectedPlatformIds` unchanged, neither derived here (DEC-020). So the body each
  resolves with holds exactly one entry of `collections['change-log-entry']` that its input did
  not, and that entry is the one act (`change-log` C-001), whose item action `change-log`
  derives from the status transition and this module never states (`change-log` C-005): a
  created schedule is `created` and every later change to one is `edited`. There is no operation
  of this contract that writes a schedule and no entry, so setting a tempo, moving a due date,
  and recording a completed review are each in the history, with the previous and new value of
  every field that changed (`change-log` C-002) — which is what puts a review tempo and a due
  date under REQ-010's and REQ-045's clauses for the kind DEC-018 added. When `recordChange`
  rejects, the operation rejects with that error and the body passed in is unchanged: no
  schedule is stored without its entry and no entry without its schedule, so there is no state
  in which the two disagree (HZ-005). A read of this contract writes nothing and records
  nothing. (REQ-010, REQ-012, REQ-045 as `change-log`'s, reachable for this kind only through
  this clause; HZ-005, HZ-006; DEC-016, DEC-020.)
- **C-013 A change that changes nothing is refused, not recorded.** `setSchedule` over a live
  schedule whose `tempoMonths` and `nextDueAest` both equal the values given rejects with
  `NoChangeError` carrying the schedule's `ref` and the field; the body is unchanged, no header
  is restamped, and no entry is written. A call that changes one of the two and not the other
  is a change and is stored. So every entry this module causes is an act that changed something,
  and `change-log`'s `UnchangedRecordError` is unreachable from here — which it would not be
  otherwise, since two calls in the same second stamp the same `TimestampAest` and would hand
  `change-log` a `before` deep-equal to its `after` (`change-log` section 4). `completeReview`
  is never a no change: it advances the due date by a tempo of at least one month and stamps a
  last reviewed date, so its `before` and `after` always differ (C-008). (REQ-045 as
  `change-log`'s; registry C-029 for the same reason; SL-06 criterion 1.)

Ordering: ascending `nextDueAest` then id for `listSchedules` and `listOverdue` (C-001,
C-010); the one record of C-012's `records` is the only item of an entry. Collections are
keyed, so the order of their entries is not data.
Idempotency: every read is harmless and, on the same body and at the same clock, resolves with
deep-equal results; `reviewStateOf` and `listOverdue` read the clock, so two calls across a
midnight boundary may differ, which is the flag doing its job. `setSchedule` twice with the
same tempo and due date fails the second time (C-013); with either changed it succeeds and
leaves one live schedule (C-001). `completeReview` is not idempotent by repetition and is not
made so: a second call stamps the same last reviewed date and advances the due date a second
tempo, because two completed reviews are two reviews and this module cannot tell a repeat from
a review genuinely done twice (`change-log`'s reasoning for `recordChange`). Whether a user may
complete two reviews of one record in a day is `workflows`' at SL-07; nothing here guards it,
and it is named in the not-promised section.
Determinism: with the baseline clock held, every operation is a function of its arguments and
of the ids `IdKind.fresh` returns; a new id is a random UUID, which is the one thing a
conformance test must not assume (DEC-005). Month arithmetic is a pure function of a date and
a whole number (DEC-019), so the same schedule and the same tempo advance the same way on
every machine and in every run.
Null and empty semantics: a missing collection reads as empty (C-001); `getSchedule` of a ref
nothing has is null and `reviewStateOf` of one has `schedule` null and `overdue` false; a
`lastReviewedAest` of null means no review has been completed, which is a value and not an
absence, and is what every schedule starts with (C-001, C-007); an empty
`act.affectedPlatformIds` is stored as given and means the act reaches no platform, so nobody
awaits it, while an absent one is refused (C-012); a `madeForPlatformId` of null means the act
was made for no platform, so every platform it reaches awaits it.
Concurrency safety: two copies of Pivot on one folder are the designed case (ASM-004). Each
holds its own working body, so two copies may both set a tempo for one record and may both
complete a review against it before either saves, and the second copy's schedule may advance
from a due date the first has already moved; `store` C-004 keeps the first save when the second
overwrites it, and what `data.json` then holds is that clause's outcome, not this module's.
Within one copy, calls are made one at a time by the caller on the body it holds; overlapping
calls on one body are not promised, and a consumer that discards a returned body discards the
change and its entry together.
Side effects: none (C-003). No changing operation has a state to stop in part-way: it resolves
with a body carrying the schedule and its entry, or it rejects and the body it was given is
unchanged (C-002, C-012).
Tolerance and precision: none; every comparison is exact. A date is compared as a calendar
date and never as an instant, and a tempo as a whole number of months and never as a duration
in days (C-009, DEC-019).

This module places no fault points at 1.0. C-004 is reached by an entry of
`collections['review-schedule']` built in test code, as registry's malformed records are;
C-009's two directions by `clock.fixClock` either side of a due date, released in a finally
block; C-008's month cases by a fixed clock and a due date on the 29th, 30th, or 31st; and the
`MalformedEntryError` of section 4 by a body whose `collections['change-log-entry']` holds an
entry `change-log` C-008 refuses. Nothing here needs arming of its own.

## 6. Performance envelope
Each operation is linear in `collections['review-schedule']` and touches no other collection
of its own: `getSchedule` and `reviewStateOf` scan it for one `ref`, `listSchedules` and
`listOverdue` scan it once and sort what they give, and `setSchedule` and `completeReview`
scan it for the `ref` and for a free id. No index is kept, so a lookup by `ref` is a scan; the
collection holds at most one entry per scheduled record, so it is bounded by the number of
records a user has set a tempo for and not by the history's growth. The two changing
operations also carry `change-log.recordChange`'s cost, which is linear in the fields of the
one schedule handed over plus `collections['change-log-entry']` (`change-log` section 6), and
that collection only grows. The clock is read once per call, never once per entry, so
`listOverdue` gives one `asAtAest` for the whole list (C-010). No bound beyond DEC-003's is
claimed: the body is in memory, and the folder's I/O is `store`'s.

## 7. Trace
Allocated to this module in `trace/requirements.yaml`; mitigations in `trace/hazards.yaml`;
the dependency graph in `modules/review-schedule/manifest.yaml`, checked against the real
imports. These are the sources, not this list (DEC-011 retired `docs/module-map.md`). Checked
by `check_traces.py` and `check_boundaries.js`.

Promised at version 1.0: REQ-015 (C-007), REQ-020 (C-005), REQ-021 (C-006 with C-008), REQ-022
(C-005), REQ-072 (C-001 with C-005). All five are written to `allocated_to: review-schedule` by
this session. HZ-012 is mitigated at C-009, with C-010 as the one call every list's flag comes
from and C-004 as the refusal that keeps an unreadable schedule from reading as not overdue.

Not claimed at version 1.0, and expected at `views`' own CONTRACT session: REQ-019 and REQ-023,
the overdue flag shown "wherever it is listed". This version supplies the flag and the one call
that gives every overdue record (C-009, C-010); which lists show it is the screen's, so their
`allocated_to` is `views`' to write, as REQ-002's and REQ-009's were at SL-03 and SL-04. They
are left `TBD` here rather than allocated on `views`' behalf.

Not claimed at version 1.0, and reachable only through this version: REQ-010, REQ-045, and, for
a schedule change that reaches a platform, REQ-012 are `change-log`'s. C-012 is what every act
of this module reaches them by — without it a tempo, a due date, or a completed review could be
written with no entry, for the record kind DEC-018 added after `change-log` 1.0 was written.
HZ-005 and HZ-006 are mitigated at `change-log` C-004 and C-010; this module's contribution to
both is C-012.

HZ-009 is not verifiable at this version, and is recorded here so it is not discovered as a gap.
Its never-statement is about a report produced from out-of-date data without the user being
told, and the telling is REQ-016, which SL-06 puts out of scope and SL-09 carries. This version
supplies what a report needs to tell — a due date that is a fact about a record and not a
derivation (C-006) and an overdue flag against a fixed clock (C-009) — and nothing that produces
or warns before a report. `trace/hazards.yaml` therefore points HZ-009's `mitigation_contract`
at C-009 as its earliest checkable clause, with `mitigation_status: proposed`; it cannot reach
`verified` until SL-09, so SL-06's claim on HZ-009 in `trace/slices.yaml` will block the slice's
acceptance record and must be narrowed or moved at a GATE session. That is not this session's to
decide (P10).

REQ-015 names ten record kinds and this version schedules four. The six it does not —
causal factor, consequence, justification, rating, report, and workflow record — carry no
schedule at 1.0, so none has a last reviewed date and REQ-015's "only when a review workflow is
completed" is kept for them by there being no field to set. Widening `SCHEDULABLE_KINDS` is an
Interface change to this module and is expected when SL-07's workflow records or SL-09's reports
need reviewing; at 1.0, REQ-015 is verified for a hazard, a control, a platform, and a reference
entry only. Recorded here as registry 4.0 recorded the same shape of gap for REQ-067.

FND-021 (REV-002 M21) closes with this contract: the tempo unit is C-005 and the overdue
boundary is C-009, each a clause with a conformance case rather than a G3 ruling in prose.

## Explicitly not promised
- That a `ref` names a record that exists, is live, or is of the kind it claims. A `RecordRef`
  and a `PlatformId` are stored as given and never resolved (C-011): this module imports no
  module that could resolve one, and it does not import `registry` at any version (DEC-018,
  DEC-020).
- What becomes of a schedule when the record it names is deleted or retired by its owner.
  Nothing here is told, so the schedule stays live, goes on falling due, and appears in
  `listOverdue` (C-011). Whether a retired hazard's review should still read as overdue is a
  question for the consumer that lists both, and a `views` or `workflows` clause at SL-07 or
  SL-11 is where it is answered; a rule here would need the edge DEC-020 refuses.
- That `affectedPlatformIds` is right, or complete. It is the caller's statement of which
  platforms the act reaches, computed from the links `registry` holds (DEC-015, DEC-020). An act
  recorded with a platform missing from that list never reaches that platform's queue, and this
  module cannot tell.
- That the day of the month of a due date recovers after a tempo lands on a month too short for
  it. 31 January with a tempo of 1 advances to 28 February and then to 28 March, not to 31
  March: the day of the month can move earlier, once per clamping, and does not come back,
  because the stored due date is the only anchor a schedule holds. DEC-019 records the rejected
  alternative, a stored anchor day, and why.
- Any guard against a review completed twice. `completeReview` advances the due date one tempo
  per call and stamps the clock's today, so two calls advance two tempos (idempotency above).
  Whether a user can complete two reviews of one record, in a day or at all, is the workflow's
  at SL-07; this contract records what it was told to record.
- Retiring, deleting, or un-retiring a schedule, and any operation that clears one. This version
  creates and updates a schedule and nothing else: `ScheduleNotLiveError` exists because a
  status is baseline and a body may hold a schedule this version did not write, not because
  anything here sets one. A record whose tempo should no longer apply is a later version, and
  what it does to the history is `change-log`'s.
- Setting, clearing, or backdating a last reviewed date directly, and any operation that takes
  one as an argument. C-007 is the whole of how the field moves, and it is what makes REQ-015
  checkable; a surface that set it would make the requirement unfalsifiable.
- Deriving a due date from a last reviewed date, a created date, a start date and a count of
  completions, or anything else. The due date is stored (C-006). REQ-021's rejected reading is
  named in the preamble.
- Any default tempo, per-kind tempo, inherited tempo, or bulk set. Each act names one `ref`
  (C-005); a record has the tempo a person set for it or no schedule, and a record with no
  schedule is never overdue (C-009). Whether every hazard ought to have a schedule is not a
  question this version asks, and the dashboard's open items are REQ-066 and REQ-068, at SL-11.
- Any warning, reminder, notification, or escalation before or after a due date, and any second
  threshold between due and overdue. There is one boundary and it is C-009's. The out-of-date
  warning before a report is REQ-016, at SL-09.
- Any grouping, filtering, paging, or search over schedules beyond the two lists of section 2:
  by kind, by owner, by platform, by tempo, or by how far past due. A list of a platform's
  overdue hazards is a composition of `registry.listPlatformHazards` with `listOverdue`, done in
  `views` (DEC-018's accepted cost).
- Any history of a schedule on a screen of its own, or any record here of who completed a
  review beyond the entry C-012 writes. The schedule holds the last reviewed date and the header's
  last writer; who reviewed, when, and what they found is the entry's and, at SL-07, the
  workflow record's.
- The clock. `nowAest` and `todayAest` are `baseline/clock.js`'s and are read by the three
  operations C-003 names; this module holds no clock, no offset, and no zone, and a test fixes
  the baseline clock rather than passing a date in (ASM-005).
- Whether a returned schedule is the same object as the entry in the returned body, or a copy.
  Treat every returned value as read-only.
- The order of entries inside the collection, or anything about the body a consumer reads
  directly rather than through this contract. `DataBody` is baseline;
  `collections['review-schedule']` is this module's to interpret.
- What a consumer may do with a body between calls, including saving it. `store` C-002 decides
  what a save needs; this module only requires an act to stamp a header and record what was
  done.
- The wording of anything shown to the user, and which screen shows it. This module signals;
  `views` speaks.
