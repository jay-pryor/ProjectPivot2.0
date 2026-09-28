# Contract: profiles
Version: 1.0 · Status: draft

Written for SL-01. Promises the profile screen's half of the walking skeleton: list the
profiles stored in the data folder, create one, and select the one this open of Pivot acts
as, with nothing remembered from the last open. What the selection permits is `store`'s
promise (REQ-055, its C-002); what the top bar shows is `views`' (REQ-057).

## 1. Purpose
Create user profiles and select the one this open of Pivot acts as. The "and" is DEC-004's:
both are the one record kind, and the selection is a value consumers pass on, so only
`views` depends on this module.

## 2. Operations
In `contract.js`. Every operation is asynchronous and returns a promise.

| Operation | Signature | Verified by |
|---|---|---|
| openProfiles | `(store: DataStore) → ProfileSession` | conformance |
| listProfiles | `(session: ProfileSession) → readonly UserProfile[]` | conformance |
| createProfile | `(session: ProfileSession, name: string) → UserProfile` | conformance |
| selectProfile | `(session: ProfileSession, id: UserProfileId) → ActiveProfile` | conformance |

The folder is reached only through `modules/store/contract.js` (`readProfiles`,
`putProfile`); a conformance test opens a `DataStore` on an in-memory folder the same way
the store suite does, and holds the baseline clock where a clause names it.

## 3. Data shapes
From `baseline/types.js`: `UserProfile`, `UserProfileId`, `ActiveProfile`, `TimestampAest`.
From `modules/store/contract.js`: `DataStore`. Defined in `contract.js`:

- `ProfileSession`: one open of Pivot's choice of user over one folder. `active` is
  `ActiveProfile | null`. Opaque beyond `active`.

A profile's `name` is what the user typed with leading and trailing whitespace removed;
its `createdAtAest` is a `TimestampAest`.

## 4. Error conditions
Signalled as a rejected promise carrying the named error class. "Folder unchanged" means
no file under the data folder was created, written, or removed by the call; "`active`
unchanged" means the session's selection is what it was before the call.

| Operation | Condition | Signalled as | Caller obligation |
|---|---|---|---|
| createProfile | `name` is empty once trimmed | `InvalidProfileNameError`; folder and `active` unchanged | Ask for a name |
| createProfile | a stored profile has the same name, compared trimmed and without regard to case | `DuplicateProfileNameError` carrying that profile; folder and `active` unchanged | Offer to select the existing profile or ask for a different name |
| createProfile | the write of `profiles.json` did not complete | `StoreWriteError` from `store`, passed through; `active` unchanged | Tell the user the profile was not saved |
| selectProfile | no stored profile has `id` at the time of the call | `UnknownProfileError`; folder and `active` unchanged | List again and ask again |
| listProfiles, createProfile, selectProfile | the folder or `profiles.json` cannot be read, or the file fails `schema.open` | `StoreReadError` from `store`, passed through; folder and `active` unchanged | As `store` section 4: show nothing from the file as profiles; offer to choose the folder again |

A folder with no `profiles.json` is not an error: it has no profiles (C-005).

## 5. Behavioural promises

- **C-001 A created profile is stored in the folder.** After `createProfile(session, name)`
  resolves with `p`: `p.name` is `name` trimmed; `p.id` differs from every id stored before
  the call; `p.createdAtAest` is the baseline clock's now; and `listProfiles` in this
  session, and in a session opened on any `DataStore` over the same folder in this copy of
  Pivot or another, includes a profile deep-equal to `p`. Every profile stored before the
  call is still listed. `session.active` is what it was before the call: creating is not
  selecting. (REQ-053, REQ-056; SL-01 criterion 2.)
- **C-002 Names are non-blank and unique.** `createProfile` with a name that is empty once
  trimmed rejects with `InvalidProfileNameError`; with a name equal, trimmed and without
  regard to case, to a stored profile's rejects with `DuplicateProfileNameError` carrying
  that profile. Either way the folder and `active` are unchanged. The name is the one thing
  that tells users apart on the profile screen, in the top bar, and in a superseded save's
  stamp (store C-004), so two profiles may not share it. (REQ-056.)
- **C-003 Every open starts with no one selected.** `openProfiles` resolves with a session
  whose `active` is null, whatever any session before it, on this `DataStore` or another
  over the same folder, created or selected. Nothing this module writes to the folder and
  nothing it writes anywhere else records a selection, so no implementation of this
  contract can pre-select: the folder after any sequence of calls holds only what
  `store` C-008 and C-009 describe, and the browser's storage is untouched. (REQ-054,
  REQ-073; SL-01 criterion 2.)
- **C-004 A selection is a stored profile.** `selectProfile(session, id)` resolves with an
  `ActiveProfile` whose `id` and `name` equal the stored profile's at the time of the call,
  and afterwards `session.active` is that value. An `id` no stored profile has at the time
  of the call rejects with `UnknownProfileError` and leaves `active` unchanged. A second
  `selectProfile` replaces `active`. So every `ActiveProfile` a consumer passes into
  `store.save` names a profile the folder holds, and the stamp store C-006 writes can be
  read back as a name. (REQ-054.)
- **C-005 The list is complete and ordered.** `listProfiles` resolves with every profile
  in the folder at the time of the call, once each, ordered by `name` compared without
  regard to case by code point, equal names impossible (C-002) except across copies that
  raced, in which case by `id`. It resolves with an empty list when the folder has no
  `profiles.json`. It reads the folder on every call, so a profile another copy of Pivot
  created since the last call appears. Nothing in the result says which, if any, is
  `active`. (REQ-053.)
- **C-006 Confinement.** `createProfile` writes through `store.putProfile` and nothing
  else writes: `openProfiles`, `listProfiles`, and `selectProfile` create, write, and
  remove nothing, in the folder or in the browser's storage. This module never calls
  `store.save` or `store.load`. (REQ-073, and store's REQ-069.)

Ordering: C-005. Idempotency: creating the same name twice fails the second time (C-002);
selecting the same id twice yields equal `active` values; listing is harmless.
Determinism: ids are not deterministic (fresh UUIDs); with the baseline clock held,
`createdAtAest` is. Everything else is a function of the folder's contents and the
session's calls.
Null and empty semantics: no `profiles.json` lists as empty (C-005); `active` is null
until selected (C-003); a blank name is refused (C-002).
Concurrency safety: two copies of Pivot on one folder are the designed case (ASM-004).
Two copies creating profiles concurrently is `store` C-008's case, a set that only
grows; both profiles are listed afterwards. Two copies creating the same name in the
window between one's list and its write is not detected and is the only way C-005's
tie-break is reached. Within one copy, calls on one session are made one at a time by
the caller; overlapping calls are not promised.
Side effects: the one write in C-006, and nothing else.
Tolerance and precision: none; every comparison is exact.

## 6. Performance envelope
One `store.readProfiles` per `listProfiles` and per `selectProfile`; one read and one
`store.putProfile` per `createProfile`; nothing per `openProfiles`. No caching across
calls. The number of profiles is the number of users (STK-029), so no bound beyond
`store`'s is claimed.

## 7. Trace
Allocated to this module in `trace/requirements.yaml`; checked by `check_traces.py`.

Promised at version 1.0: REQ-053, REQ-054, REQ-056, REQ-073. No hazard names this module.

## Explicitly not promised
- That a selection survives anything: a page reload, a second `openProfiles`, or a
  `DataStore` opened later. Each open selects again (C-003).
- Whether `views` offers a change of user mid-session. C-004 permits a second
  `selectProfile`; whether the screen has a control for it is `views`' choice.
- What a data-changing call may do with `active`. That is `store` C-002 and each record
  module's contract; this module only supplies the value.
- Removing or renaming a profile, or any field on a profile beyond `id`, `name`, and
  `createdAtAest`. `store` C-008 keeps the set growing; this contract adds no way to
  shrink it.
- A maximum name length, or any normalisation of a name beyond trimming.
- The layout of `profiles.json` or that the profiles live in one file. A consumer reads
  profiles through this contract or `store`'s, not from the folder.
- The wording of anything shown to the user. This module signals; `views` speaks.
