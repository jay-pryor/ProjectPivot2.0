# Contract: store
Version: 4.0 · Status: draft

Written for SL-01 at 1.0, extended for SL-02 at 2.0, extended for SL-10 at 3.0, and extended
for SL-08 at 4.0.
Promises the save path (open the folder, read and write profiles, load, save, detect another
copy's save in between, HZ-008); what HZ-003 rides on: a save that is whole or not at all,
the changes a failed save did not store, a check of every file Pivot wrote, hourly backups
of the working state in a ring of 72, a browser-storage mirror with recovery, and restore
from a backup or a save state file; and at 3.0 the file a record carries: a file kept whole
in the folder under a location the record holds, and a presence check so a record whose file
has gone can be flagged. Every 1.0 clause holds unchanged except C-009, which widened at 2.0
to the new files and again at 3.0 to `files/`. Every 2.0 clause holds unchanged except C-012,
which narrows at 3.0 to the files Pivot writes in its own format (DEC-022). At 4.0, a file
the user chooses outside the folder, written once with text the caller gives (DEC-030): a picker
and a write. Every 3.0 clause holds unchanged except C-009, which widens at 4.0 to that one
write.

## 1. Purpose
Persist Pivot's data in the one folder the user chose, so that no save silently
overwrites another user's and no stored data is lost or corrupted without the user being told.

## 2. Operations
In `contract.js`. Every operation is asynchronous and returns a promise.

| Operation | Signature | Verified by |
|---|---|---|
| chooseDataFolder | `() → DataStore` | demonstration (SL-01 criterion 1; REQ-040, REQ-041) |
| openDataFolder | `(handle: DataFolderHandle) → DataStore` | conformance |
| readProfiles | `(store: DataStore) → readonly UserProfile[]` | conformance |
| putProfile | `(store: DataStore, profile: UserProfile) → void` | conformance |
| load | `(store: DataStore) → LoadedData` | conformance |
| checkFolder | `(store: DataStore) → readonly FileCheckFailure[]` | conformance |
| save | `(store: DataStore, profile: ActiveProfile, body: DataBody) → SaveOutcome` | conformance |
| unsavedChanges | `(store: DataStore, body: DataBody) → readonly RecordRef[]` | conformance |
| putStoredFile | `(store: DataStore, profile: ActiveProfile, file: IncomingFile) → StoredFileLocation` | conformance |
| checkStoredFiles | `(store: DataStore, locations: readonly StoredFileLocation[]) → readonly StoredFilePresence[]` | conformance |
| noteChange | `(store: DataStore, profile: ActiveProfile, body: DataBody) → ChangeOutcome` | conformance |
| readRecoverable | `(store: DataStore) → RecoverableState \| null` | conformance |
| recoverWorkingState | `(store: DataStore, state: RecoverableState) → DataBody` | conformance |
| discardWorkingState | `(store: DataStore) → void` | conformance |
| listBackups | `(store: DataStore) → readonly BackupEntry[]` | conformance |
| chooseSaveStateFile | `() → SaveStateFile` | demonstration (SL-02 criterion 4) |
| prepareRestore | `(store: DataStore, source: RestoreSource) → RestorePlan` | conformance |
| restore | `(store: DataStore, profile: ActiveProfile, plan: RestorePlan) → SaveOutcome` | conformance |
| chooseExportFile | `(suggestedName: string) → ExportFileHandle` | demonstration (SL-08 criterion 3) |
| writeExportFile | `(target: ExportFileHandle, text: string) → void` | conformance |

`chooseDataFolder`, `chooseSaveStateFile`, and `chooseExportFile` are the browser's pickers;
they are the only operations the suite cannot exercise, and the only ones that talk to the
user. `writeExportFile` takes no `DataStore`: a test hands it an in-memory
`ExportFileHandle`, as `openDataFolder` takes an in-memory `DataFolderHandle`.

## 3. Data shapes
From `baseline/schema.js`: `DataBody`, `SaveStamp`, `OpenFailure`, and the mirror's stored
shape `WorkingStateMirror` under `BROWSER_STORAGE_KEY`. From `baseline/types.js`:
`UserProfile`, `ActiveProfile`, `UserProfileId`, `TimestampAest`, `SaveToken`, `RecordRef`.
Defined in `contract.js`:

- `DataFolderHandle`: the three members of `FileSystemDirectoryHandle` the module uses
  (`name`, `getFileHandle`, `getDirectoryHandle`). A test supplies an in-memory one.
- `DataStore`: an open folder plus what this copy last loaded, saved, restored, recovered,
  or was told of. Opaque beyond `folderName`.
- `LoadedData`: `{ body: DataBody, lastSave: SaveStamp | null }`.
- `SaveOutcome`: `{ stamp, superseded: SaveStamp | null, keptAs: string | null, mirrorError: StoreWriteError | null }`.
- `FileCheckFailure`: `{ file, reason: OpenFailure | 'inaccessible', detail, affects: AffectedData }`,
  where `AffectedData` is `stored-data`, `profiles`, `backup` with its `takenAtAest`, or `superseded-save`.
- `ChangeOutcome`: `{ changed: boolean, backupFile: string | null, backupError, mirrorError }`,
  each error a `StoreWriteError` or null.
- `BackupEntry`: `{ file, takenAtAest }`.
- `SaveStateFile`: `{ name, text }`, a file chosen from outside the folder.
- `RestoreSource`: `{ kind: 'backup', file }` or `{ kind: 'save-state', saveState }`.
- `RestorePlan`: `{ source, body, stampInFile: SaveStamp, replaces: SaveStamp | null }`.
- `RecoverableState`: `{ body, mirroredAtAest, loadedStamp: SaveStamp | null }`.
- `IncomingFile`: `{ name, bytes: Uint8Array }`, a file as the user chose it. A browser
  `File` supplies both members; a test constructs one.
- `StoredFileLocation`: a `string`, a path relative to the data folder under
  `schema.DATA_FOLDER.files`. Opaque: a record field holds it and hands it back, and nothing
  else is read from it or built into it (C-018).
- `StoredFilePresence`: `{ location, present: boolean, reason: 'missing' | 'inaccessible' | 'not-a-stored-file-location' | null }`,
  `reason` null exactly when `present`.
- `ExportFileHandle`: the two members of `FileSystemFileHandle` the module uses (`name`,
  `createWritable`), a file outside the data folder that the user chose to write to. A test
  supplies an in-memory one. What is written through it is text; this module does not know
  what the text is (C-020).

Every time in these shapes is a `TimestampAest`. Every file name in `keptAs`, `backupFile`,
a `BackupEntry`, a `FileCheckFailure`, a `StoredFileLocation`, and an error is relative to
the data folder, with three exceptions: an error about a save state file names it as the
browser gave it, an error about an export file names it by the handle's `name` (the empty
string when there is none), and an error about the browser's storage names
`BROWSER_STORAGE_KEY`.

"The browser's storage" is `globalThis.localStorage` as found at the call (DEC-009). "A
Pivot file name" is `data.json`, `profiles.json`, a name under `backups/` matching
`schema.BACKUP_FILE_RE`, or a name under `Superseded Saves/` of the form
`schema.supersededFileName` gives. A stored file under `files/` is **not** a Pivot file
name: it is the user's own bytes in the user's own format, not an envelope Pivot wrote
(C-012, DEC-022).

## 4. Error conditions
Signalled as a rejected promise carrying the named error class, except where the table says
the outcome carries it. "Folder unchanged" means no file under the data folder was created,
written, or removed by the call. "Storage untouched" means the browser's storage was not
written by the call.

| Operation | Condition | Signalled as | Caller obligation |
|---|---|---|---|
| save, restore, noteChange, putStoredFile | `profile` is missing or not an `ActiveProfile` with a valid id | `NoActiveProfileError`; folder unchanged; storage untouched | Show the profile screen; do not retry until a profile is selected (REQ-055) |
| save, restore, noteChange, unsavedChanges, recoverWorkingState | this `DataStore` has not completed a `load` | `NotLoadedError`; folder unchanged; storage untouched | Load first; never construct a stamp to get past this |
| save, restore | the copy into `Superseded Saves` did not complete | `StoreWriteError` with `stage: 'superseded-copy'`; `data.json` unchanged | Tell the user the save did not happen and name `unsavedChanges` (REQ-005) |
| save, restore | the write of `data.json` did not complete | `StoreWriteError` with `stage: 'data'`; `data.json` unchanged (C-010) | As above |
| save, restore | this store mirrors, and marking the browser's copy saved failed | not an error: `SaveOutcome.mirrorError` at `stage: 'mirror'`; the save completed | Tell the user recovery may be offered for data already saved |
| putProfile | the write of `profiles.json` did not complete | `StoreWriteError` with `stage: 'profiles'` | Tell the user the profile was not saved |
| load, readProfiles | the file exists and fails `schema.open`, or is not the envelope kind its name calls for | `StoreReadError` with the file and the `OpenFailure` reason; nothing from the file is returned | Show nothing from that file; name it and what it affects (REQ-006, REQ-074) |
| checkFolder | a Pivot file fails its check or cannot be read | not an error: a `FileCheckFailure` in the result | Name each file and what it affects before showing anything from the folder (SL-02 criterion 1) |
| noteChange | the backup did not complete | not an error: `ChangeOutcome.backupError` at `stage: 'backup'`; no backup removed | Tell the user no backup was taken |
| noteChange | the backup completed and removing an older one did not | not an error: `ChangeOutcome.backupError` at `stage: 'backup-prune'`; the new backup is kept | Tell the user; the next backup removes it (C-014) |
| noteChange | the browser's storage is absent, refuses the write, or is full | not an error: `ChangeOutcome.mirrorError` at `stage: 'mirror'` | Tell the user the working state is not being kept in the browser (REQ-079) |
| readRecoverable, recoverWorkingState | the browser's storage is absent or cannot be read | `StoreReadError` naming the key, `reason: 'inaccessible'` | Offer no recovery, and say so |
| readRecoverable, recoverWorkingState | the value under the key is not JSON, not a mirror, or of a newer schema | `StoreReadError` naming the key, with `unreadable`, `not-a-pivot-file`, or `newer-schema`; nothing returned | Tell the user the working state in the browser could not be recovered |
| discardWorkingState | the browser's storage refuses the removal | `StoreWriteError` naming the key, `stage: 'mirror'` | Tell the user; recovery will be offered again |
| putStoredFile | `file` is missing, its `name` is empty, or its `bytes` is not a `Uint8Array` | `StoreWriteError` with `stage: 'stored-file'` naming `files/`; folder unchanged | Tell the user the file was not kept; do not store a location |
| putStoredFile | the write under `files/` did not complete, for any reason including an armed fault point | `StoreWriteError` with `stage: 'stored-file'` naming the location it was writing; no file left under `files/` (C-018) | Tell the user the file was not kept; do not store a location, and do not retry with the same location |
| checkStoredFiles | a location is absent, unreadable, or not a location `putStoredFile` could have returned | not an error: `present: false` with `reason` `missing`, `inaccessible`, or `not-a-stored-file-location` | Flag the record wherever it is listed (REQ-078); offer the file again |
| prepareRestore | the backup is not a kept backup, or the file fails `schema.open`, or is not a `data` envelope | `StoreReadError` naming the file (or the save state's name) and the reason; nothing returned; folder unchanged | Name the file; offer another |
| any on the folder | the folder or a file in it cannot be read | `StoreReadError` with `reason: 'inaccessible'` (for `checkFolder` and `checkStoredFiles`, only when the data folder itself cannot be read) | Offer to choose the folder again |
| writeExportFile | `target` is missing or has no `createWritable`, or `text` is not a string | `StoreWriteError` with `stage: 'export'` naming the target; nothing written | Tell the user nothing was exported; pass the handle `chooseExportFile` resolved with and the text to write |
| writeExportFile | the write did not complete, for any reason including a refused permission, a full disk, or an armed fault point | `StoreWriteError` with `stage: 'export'` naming the target, the browser's error as `cause`; the target holds what it held before the call (C-020) | Tell the user the export did not happen; offer to export again |
| chooseDataFolder, chooseSaveStateFile, chooseExportFile | the user cancels, or the browser denies access | rejected promise (the browser's error, passed through) | Offer to choose again; a folder denial on a target machine is the DEC-003 reversal trigger; a cancelled export is not a failure to report |

A missing `data.json` or `profiles.json` is not an error (C-007, C-008). A missing
`backups/` or `Superseded Saves/` is an empty one. An armed fault point rejects with the
injected error, whatever the table says of that stage (section 5, fault points).

## 5. Behavioural promises

- **C-001 Round trip.** After `save(store, p, body)` resolves with `stamp`, `load` on any
  `DataStore` opened on the same folder, in this copy of Pivot or another, resolves with
  `body` deep-equal to the one saved and `lastSave` equal to `stamp`. Field values,
  record ids, and `sequences` survive unchanged; nothing is added, dropped, or reordered
  inside `body`. (REQ-004, REQ-050 as it depends on the sequence persisting; SL-01
  criterion 4.)
- **C-002 No stored-data write without a profile.** `save` with no active profile rejects
  with `NoActiveProfileError` and the folder is unchanged. `readProfiles` and `putProfile`
  need no profile: REQ-069 lists user profiles separately from stored data, and the first
  user must create a profile before any exists (REQ-056). (REQ-055; SL-01 criterion 2.)
- **C-003 No save without a load.** `save` on a `DataStore` that has not completed `load`
  rejects with `NotLoadedError` and the folder is unchanged. A store that has not loaded
  cannot know whose save it would overwrite. (HZ-008.)
- **C-004 Another user's save is kept before it is overwritten.** When `save` finds a
  stamp on `data.json` that differs from the stamp this store last loaded, saved, or
  recovered from (C-016) (the save stamp decided at G3: the saving profile's id, the AEST
  time, and a random token), it first writes the data file exactly as found into
  `Superseded Saves/` under the name `schema.supersededFileName` gives for the stamp found,
  and only when that copy is complete writes `data.json`. The outcome carries `superseded`
  equal to the stamp found and `keptAs` naming the copy. Afterwards `data.json` holds this
  save and the copy holds the other user's. If the copy fails, `data.json` is not written
  and `save` rejects with `StoreWriteError` at `stage: 'superseded-copy'`. (HZ-008, REQ-014,
  REQ-071; SL-01 criterion 5.) *Mitigation clause for HZ-008.*
- **C-005 No false alarm.** When the stamp on `data.json` equals the stamp this store last
  loaded, saved, or recovered from, `save` creates nothing under `Superseded Saves/` and the
  outcome has `superseded: null` and `keptAs: null`. (SL-01 criterion 6.)
- **C-006 Every save carries a fresh stamp, and the store adopts it.** Each successful
  `save` writes a stamp whose `savedByProfileId` is the active profile's, whose
  `savedAtAest` is the baseline clock's now, and whose token differs from every stamp this
  store has read or written. After it resolves, the store treats that stamp as the one it
  loaded and `body` as the stored data it last saved, so a second `save` by the same copy
  with no one else in between is not a supersession (C-005), and `load` in another copy
  returns it as `lastSave` (C-001).
- **C-007 A folder never saved to is empty, and a bad file is refused.** `load` on a
  folder with no `data.json` resolves with `schema.emptyDataBody()` and `lastSave: null`,
  and the first `save` into it is not a supersession. `load` on a folder whose `data.json`
  exists but fails `schema.open`, or is not a `data` envelope, rejects with `StoreReadError`
  naming the file and the reason; no part of the file's contents is returned or kept in the
  store. A `data.json` that has disappeared since this store loaded is treated as never
  saved to: the save proceeds and nothing is kept, because a deletion is not another user's
  save.
- **C-008 Profiles are a set that only grows.** `readProfiles` resolves with every profile
  in `profiles.json`, and with an empty list when the file is absent. `putProfile` adds the
  profile or replaces the one with the same id, and after it resolves `readProfiles`
  returns every profile that was there before plus this one. Neither needs an active
  profile. (REQ-053 as the file's owner; REQ-054 and REQ-073 are `profiles`' and
  `views`' promises, not this module's.)
- **C-009 Confinement.** The module creates, writes, or removes nothing outside the
  chosen folder and the one browser storage key, except the one file `writeExportFile` is
  handed, which it writes and nothing else (C-020). Inside the folder it touches only
  `data.json`, `profiles.json`, files it creates under `Superseded Saves/`, files it
  creates or removes under `backups/`, and files it creates under `files/`. Only
  `noteChange` writes `backups/`; only `putStoredFile` writes `files/`, and it only ever
  creates there — no operation of this module replaces or removes a file under `files/`
  (C-018). Only `noteChange`, `recoverWorkingState`, `discardWorkingState`, and a `save` or
  `restore` by a store that mirrors (C-015) write the browser's storage. `openDataFolder`,
  `load`, `readProfiles`, `checkFolder`, `checkStoredFiles`, `unsavedChanges`,
  `readRecoverable`, `listBackups`, and `prepareRestore` write nothing anywhere.
  `putStoredFile` writes only `files/`: it does not write `data.json`, and it does not
  write the browser's storage. A store that has never called `noteChange` or
  `recoverWorkingState` never writes the browser's storage. `writeExportFile` writes only
  its target: nothing under the data folder, and not the browser's storage. `chooseExportFile`
  writes nothing itself; whatever the browser's picker does to the chosen file before
  `writeExportFile` is called is the browser's. `sessionStorage`, IndexedDB, and every other
  key are untouched. (REQ-069.)
- **C-010 A save is whole or not at all.** When `save` or `restore` rejects before
  `data.json` is committed, for any reason including an armed fault point, `data.json` is
  byte-for-byte what it was before the call and still opens with `schema.open`. When it
  rejects after the commit, `data.json` holds this save's envelope whole. No call leaves
  `data.json` holding part of one envelope and part of another, or a file that fails its
  check. (REQ-005 as the precondition for telling the user which changes are not stored;
  HZ-003; SL-02 criterion 2, REV-002 M3.) *Mitigation clause for HZ-003.*
- **C-011 The changes a failed save did not store are named.** `unsavedChanges(store, body)`
  resolves with one `RecordRef` for every record whose content in `body` differs from the
  stored data as this store last loaded, saved, or restored it: present in `body` and not
  there (added), present in both and not deep-equal (changed), or there and not in `body`
  (removed). Order: by `kind`, then by `id`, each as strings. A change to `sequences` alone
  names no record. The result is empty exactly when every collection is deep-equal. After a
  `save` that rejected before commit, the store's last-saved data is unchanged, so the
  result names the changes that are not in the folder. (REQ-005; SL-02 criterion 2.)
- **C-012 Every file Pivot wrote in its own format is checked, and each failure says what
  it affects.** Every file the module writes to the folder under a Pivot file name is a
  sealed `schema` envelope carrying the integrity check of its body (a superseded copy is
  the file as found, C-004). A stored file under `files/` is the one exception: it is the
  user's own bytes, written and returned unchanged, so it carries no envelope and no
  integrity check, is not a Pivot file name, and is neither opened nor listed by
  `checkFolder` (DEC-022). Whether a stored file is there at all is `checkStoredFiles`'
  question, not this one (C-019).
  `checkFolder` opens every Pivot file name in the folder with `schema.open` and resolves
  with one `FileCheckFailure` per file that fails, cannot be read, or is not the envelope
  kind its name calls for (`profiles` for `profiles.json`, `data` for every other), sorted
  by `file`. `affects` is `stored-data` for `data.json`, `profiles` for `profiles.json`,
  `backup` with the time in its name for a backup, and `superseded-save` for a superseded
  copy. A file altered after Pivot wrote it, so that its body no longer matches its check,
  is listed with `integrity-failed`. Files that are not Pivot file names are neither
  checked nor listed. A missing file is not a failure. A failed `data.json` or
  `profiles.json` is also refused by `load` and `readProfiles` (C-007, section 4); a failed
  backup or superseded copy does not stop `load`. (REQ-006, REQ-074; SL-02 criterion 1.)
- **C-013 A change backs up the working state when an hour has passed.** `noteChange(store,
  profile, body)` first compares `body` with the working state this store last held: the
  body last loaded, saved, restored, recovered, or passed to `noteChange`. When they are
  deep-equal it resolves with `changed: false` and writes nothing anywhere. Otherwise, when
  `backups/` holds no backup, or the newest backup's name time (`schema.backupFileName`) is
  more than `schema.BACKUP_INTERVAL_MS` before the baseline clock's now, it writes `body`
  sealed as a `data` envelope with a fresh stamp for `profile` under `backups/` at the name
  `schema.backupFileName` gives for now, and `backupFile` names it. When the newest backup
  is an hour old or less, it writes no backup and `backupFile` is null. Newest is by name
  time across every backup in the folder, whichever copy of Pivot wrote it. `load`, `save`,
  `restore`, and every other operation write no backup. (REQ-062 as ruled for SL-02, DEC-008;
  SL-02 criterion 3.)
- **C-014 The ring keeps the 72 newest backups.** After `noteChange` writes a backup, it
  removes backups oldest by name time first until at most `schema.BACKUP_RING_SIZE` remain,
  and only then resolves. It never removes the backup it just wrote or any backup newer than
  one it keeps. A backup is removed only after the new one is complete; if the write fails,
  nothing is removed. `listBackups` resolves with every backup under `backups/`, newest
  first. (REQ-063; SL-02 criterion 3.)
- **C-015 Every change is mirrored to the browser's storage.** When `noteChange` resolves
  with `changed: true` and `mirrorError: null`, the browser's storage holds under
  `schema.BROWSER_STORAGE_KEY` a `WorkingStateMirror` with `unsaved: true`, `body` deep-equal
  to the body passed, `mirroredAtAest` the baseline clock's now, and `loadedStamp` the stamp
  this store last loaded, saved, or recovered from. From then on the store mirrors: when a
  later `save` or `restore` by it resolves, the mirror holds that body with `unsaved: false`
  and `loadedStamp` the new stamp, or the outcome carries `mirrorError`. A save that rejects
  leaves the mirror as it was. (REQ-079; SL-02 criterion 5.)
- **C-016 Unsaved working state is offered for recovery, and the folder waits for a save.**
  `readRecoverable` resolves with the mirror's `body`, `mirroredAtAest`, and `loadedStamp`
  when the browser's storage holds a mirror with `unsaved: true`, and with null when it holds
  none or one with `unsaved: false`. `recoverWorkingState(store, state)` resolves with
  `state.body`; afterwards the store's next `save` compares the stamp on `data.json` with
  `state.loadedStamp` instead of the stamp it loaded (C-004, C-005), so another user's save
  since that state was changed is kept rather than overwritten, and the store mirrors with
  `state.body` as the working state it last held. `discardWorkingState` removes the key.
  Neither writes to the folder; the folder changes only on a later `save` or `restore`.
  (REQ-080, HZ-008 across a crash; SL-02 criterion 5.)
- **C-017 A backup and a save state file restore through one path.** `prepareRestore`
  reads the named backup under `backups/`, or the given save state file's text, opens it
  with `schema.open`, requires a `data` envelope, and resolves with a plan whose `body` is
  the file's body, `stampInFile` its stamp, and `replaces` the stamp this store last loaded
  or saved; it writes nothing anywhere. `restore(store, profile, plan)` writes `plan.body`
  exactly as `save(store, profile, plan.body)` would, with every promise and error of
  `save`, so `load` afterwards resolves with `body` deep-equal to `plan.body`. The file's
  own stamp is not written back; the restore carries a fresh one (C-006). Warning the user
  and waiting for confirmation between the two calls is the caller's (REQ-075 as `views`'
  half); this module's half is that nothing is written before `restore` is called.
  (REQ-064, REQ-075; SL-02 criterion 4.)
- **C-018 A carried file is kept whole, under a location that is never reused.**
  `putStoredFile(store, profile, file)` writes `file.bytes` under `schema.DATA_FOLDER.files`
  and resolves with the location it wrote, relative to the data folder. When it resolves,
  that location opens and yields `file.bytes` byte-for-byte, with nothing added, wrapped, or
  transformed; when it rejects, for any reason including an armed fault point, no file
  remains at the location it was writing and no other file under `files/` was created,
  replaced, or removed. The location is fresh on every call: two calls, with equal names and
  equal bytes or not, resolve with different locations, and no call ever resolves with a
  location an earlier call returned, so a record's location is not disturbed by a later
  record carrying a file of the same name. The file's contents are never returned to the
  caller and never enter `DataBody`: what crosses the boundary back is the location alone
  (REQ-029). It needs an active profile, because a stored file is the user's data in the
  user's folder (C-002); it does not need a `load`, because it replaces nothing and so
  cannot overwrite another copy's save (C-003's reason does not reach it). (REQ-029;
  SL-10 criterion 2.)
- **C-019 A record whose file has gone can be told from one whose file is there.**
  `checkStoredFiles(store, locations)` resolves with one `StoredFilePresence` per entry of
  `locations`, in the order given, including repeats. `present` is true exactly when the
  location is one `putStoredFile` could have returned and the file is there and can be
  opened, and `reason` is then null. Otherwise `present` is false and `reason` is `missing`
  when `files/` or the file is not there, `inaccessible` when it is there and cannot be
  opened, and `not-a-stored-file-location` when the string is not a location under
  `schema.DATA_FOLDER.files`. None of the three is an error: only the data folder itself
  being unreadable rejects (section 4). An empty `locations` resolves with an empty list and
  reads nothing. The call writes nothing anywhere, and its answer is a function of the
  folder's contents at the call, so a file put back by hand is reported present on the next
  call. (REQ-078; SL-10 criterion 4, for the file half only — see *Explicitly not promised*
  for the path half.)
- **C-020 An export writes exactly the text given to the file the user chose, and keeps
  nothing.** `writeExportFile(target, text)` writes `text` to `target` through one
  `createWritable()` stream, replacing whatever the file held. When it resolves, the file
  holds the UTF-8 encoding of `text` byte-for-byte, with no byte-order mark and nothing
  added, wrapped, sealed, or transformed; an empty `text` leaves an empty file. When it
  rejects, for any reason including an armed fault point, the stream is aborted and not
  committed, so the file holds what it held before the call. The call reads and writes
  nothing under the data folder and does not touch the browser's storage (C-009), needs no
  `DataStore`, no `load`, and no active profile, because it replaces no stored data and so
  can neither overwrite another copy's save (C-003's reason) nor put data into the folder
  (C-002's). Nothing of `text` or `target` is kept after the call: no copy, mirror, backup, or
  record of the export is made anywhere. The text is opaque: the module neither parses nor
  checks it, so what it is (an SVG document for SL-08) is the caller's. (SL-08 criterion 3.)

Ordering: within `save` and `restore`, the superseded copy is complete before `data.json` is
touched; `data.json` is written as one whole envelope and committed in one step, never
appended or patched. Within `noteChange`, the mirror is written, then the backup, then the
ring is pruned; the backup is not skipped when the mirror fails, nor the reverse.
`putStoredFile` writes one file and commits it in one step, never appended or patched, and
touches no other file; it is not ordered against `save`, and the caller may call it before or
after the save that stores the location. `writeExportFile` writes the whole text into its
stream and commits it by closing the stream in one step, never appended or patched; it is not
ordered against any other operation.
Idempotency: saving an equal body twice writes two stamps and yields two outcomes; the
second is not a supersession. `noteChange` with the body it last held does nothing. Loading,
checking, listing, preparing, and `checkStoredFiles` twice are harmless. `putStoredFile` is
not idempotent by design: the same file twice is two files at two locations (C-018).
`discardWorkingState` with no mirror resolves. `writeExportFile` twice with the same text
leaves the file as once; with different text, the last call that resolved wins.
Determinism: stamps are not deterministic (random token, clock); with the baseline clock
fixed, `savedAtAest`, backup names, `mirroredAtAest`, and whether a backup is due are.
Everything else is a function of the folder's contents, the browser storage key, and the
calls this store has had.
Null and empty semantics: C-007, C-008, C-011, C-012, C-016, C-019. An empty `collections`
saves, backs up, mirrors, and loads as empty. An empty `locations` reads nothing and
resolves empty; an `IncomingFile` of zero bytes is a file like any other and is stored,
resolved, and then reported present. An empty export text writes an empty file (C-020).
Concurrency safety: two copies of Pivot on one folder are the designed case (ASM-004); C-004
to C-006, C-013's newest-across-copies, and C-016 are the whole of what is promised about
them. One browser storage key per machine is ASM-006. Within one copy, calls on one
`DataStore` are made one at a time by the caller; overlapping calls are not promised.
Side effects: the files and the key named in C-009, and nothing else.
Tolerance and precision: none; every comparison is exact, and time is compared at the second
resolution of `TimestampAest`.

Fault points the implementation places for the conformance suite (CORE-TST-002, rung 3),
so that the partial-failure lens has a reproducing test for C-004, C-010, and C-014:
`store.save.superseded-copied` (the copy is complete, `data.json` not yet written);
`store.save.data-staged` (the new envelope is written to `data.json`'s pending write and not
committed); `store.save.data-written` (`data.json` committed, the store has not yet adopted
the stamp); `store.backup.written` (the new backup is complete, no older one yet removed);
`store.stored-file.staged` (the bytes are written to the pending write under `files/` and
not committed, for C-018's whole-or-not-at-all); `store.export.staged` (the text is written
into the export stream and the stream not closed, for C-020's file-as-it-was). `restore`
passes through the three save points.

## 6. Performance envelope
One read of `data.json` per `load`; per `save` or `restore`, one read of the stamp, at most
one copy, one write, and at most one browser storage write. `checkFolder` reads and hashes
every Pivot file once: at most 2 + 72 files plus the superseded copies. `noteChange` makes
one browser storage write of the whole body, one listing of `backups/`, and at most one
backup write and the removals C-014 needs. The file is the whole stored data (DEC-005), so
each is bounded by the folder's I/O and the body's size, not by the number of records. No
caching of the folder across calls: `load` and `checkFolder` always read it. `putStoredFile`
makes one write of the whole file, bounded by that file's size and by nothing else.
`checkStoredFiles` makes one listing of `files/` however many locations it is given, so a
list of any length costs one read of the folder and not one read per row — which is why it
takes a list rather than a location (REQ-078). `writeExportFile` makes one write of the whole
text to its target, bounded by the text's size, and reads nothing.

## 7. Trace
Allocated to this module in `trace/requirements.yaml`; checked by `check_traces.py`.

Promised at version 4.0, unchanged from 3.0: REQ-004, REQ-005, REQ-006, REQ-014, REQ-029, REQ-055, REQ-062,
REQ-063, REQ-064, REQ-069, REQ-071, REQ-074, REQ-075, REQ-079, REQ-080. Hazard HZ-008 at
C-004; hazard HZ-003 at C-010, with C-011 to C-016 behind it.

REQ-029 is allocated here as the folder's owner: C-018 is the half that keeps the file in
the data folder and hands back a location. Its other half — that the entry holds the
location and never the contents — is `reference-register`'s promise, not this module's, in
the way C-008 splits REQ-053 from REQ-054 and REQ-073. REQ-078 is not this module's: C-019
answers whether a stored file is there, and flagging the record wherever it is listed is
`views`' (SL-10 criterion 4).

C-020 and `chooseExportFile` allocate no requirement. REQ-060 (export a bow-tie) is `views`'
to take: this module gives the write, `bowtie` gives the text, and joining them for a user is
the screen's (SL-08 criterion 3, DEC-030).

## Explicitly not promised
- The layout of the folder or the format of any file or of the browser's copy. A consumer
  reads and writes them through this contract or not at all; `baseline/schema.js` is the
  format's owner and may change under CORE-CHG-002 without this contract changing.
- The wording of anything shown to the user. This module signals; `views` speaks.
- Warning the user before a restore, or offering recovery on opening. Both are `views`'
  (REQ-075, REQ-080); this module promises only that nothing is written until asked.
- That `unsavedChanges` is accurate after a `save` that rejected after its commit
  (`store.save.data-written`): the store has not adopted what it wrote, so it names changes
  that are in fact stored. That errs toward saving again, which C-004 makes safe.
- Detection of a `data.json` deleted or replaced by something other than a Pivot save
  (C-007 treats deletion as never saved to; a replacement fails `schema.open` on load).
- Closing the window between comparing the stamp and writing `data.json`. Two copies
  saving within that window are ASM-004's revisit trigger, not a promise.
- Two copies writing a backup in the same second, or a newest backup whose name time is
  ahead of this machine's clock (ASM-005).
- A backup of the data a restore replaces. The warning before it is the control.
- Keeping the browser's copy apart by folder or by user: there is one key per machine
  (ASM-006, DEC-009), and a mirror from another folder is offered like any other. C-016's
  stamp comparison keeps whatever that folder holds if it is then saved there.
- A mirror larger than the browser's storage quota; that is a `mirrorError`, not a promise.
- Changes `noteChange` is not told of. The caller calls it on every change (REQ-079 as
  `views`' half).
- Removing a profile, or any order in which `readProfiles` lists them.
- Files under `backups/` or `Superseded Saves/` whose names are not Pivot file names.
- Behaviour in any browser without the File System Access API (DEC-003).
- Anything about a **path** a user typed. A `path` on a reference entry names a place on
  some machine's filesystem, which this module was never handed a handle for and under
  DEC-003 cannot open or stat. `checkStoredFiles` answers only for locations
  `putStoredFile` returned. The path half of REQ-078 and of SL-10 criterion 4 has no
  mechanism here and none is promised; what it means is an open GATE question (DEC-022,
  Consequences).
- Removing, moving, renaming, or replacing a stored file. `files/` only grows. No
  operation of this module deletes from it, and a record that stops naming a location
  leaves its file behind. Retiring a reference entry is REQ-067's fourth kind, which has
  no home yet (registry CONTRACT.md section 7), so no removal is promised until it does.
- A stored file left by a `putStoredFile` whose record was never saved. The file is kept,
  unreferenced; nothing collects it.
- The integrity of a stored file. It carries no envelope and no check (C-012, DEC-022), so
  a file altered or truncated after Pivot wrote it is reported present by C-019 and its
  contents are whatever is on disk. Only presence is promised.
- Any relation between a `StoredFileLocation` and the `IncomingFile.name` it came from.
  The name may appear in the location, or not; a consumer that parses one to recover the
  other is depending on the folder's layout, which is not promised.
- That `save`, `restore`, `noteChange`, or the backup ring carries `files/`. A backup and a
  save state file hold the body alone, so a restore can leave a record naming a location
  this folder never received — from a save state written on another machine — or naming one
  that is still there because `files/` never rewinds. Both are C-019's answer to give, and
  that is criterion 4's flag doing its job, not a gap this module closes.
- The type, size, or safety of an `IncomingFile`. The bytes are written as given; Pivot
  does not inspect, convert, scan, or limit them.
- Anything about the export's text: that it is SVG, well formed, or the drawing shown.
  `writeExportFile` writes the string it is handed; that the exported drawing holds the
  same nodes as the shown one is the caller passing the same string to both (bowtie's and
  `views`' half of SL-08 criterion 3).
- Where the export file is, what it is called, what file types the picker offers, or whether
  the picker warns before replacing an existing file. `suggestedName` is a suggestion the
  browser may change and the user may overwrite; the confirmation to replace is the
  browser's picker's.
- That an `ExportFileHandle` can be written again later. The browser may withdraw permission
  between calls; a later write that is refused is C-020's rejection, and the caller asks
  again with `chooseExportFile`.
- That an export file is ever read, listed, remembered, or offered again by Pivot, or that
  the file is still there after the call. Once written it is the user's.
- That an interrupted export in a browser whose stream commits other than on close leaves the
  file as it was. C-020's file-as-it-was rides on `createWritable`'s commit-on-close, which
  the File System Access API gives (DEC-003).
