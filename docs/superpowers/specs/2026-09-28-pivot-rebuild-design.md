# Pivot rebuild: design

Date: 2026-09-28. Status: draft for jay-pryor's review.

## 1. What Pivot is for

Pivot is a hazard register for platforms. It exists to cut the effort of two jobs:

1. managing and reviewing hazards across many platforms, and
2. producing hazard documentation and reports.

A feature earns its place if it removes a step from one of those jobs or shortens one. Anything that
adds steps for the sake of process (confirmation screens, mandatory fields nobody reads) needs a
reason.

The first build of Pivot, under the Hyperion framework, is in `archive/hyperion/`. Its requirements,
slice criteria and decision records describe what jay wants and are read as broad guidance, not as
rules. This rebuild starts from scratch in `src/` and ports only the pieces listed in section 10.

## 2. Constraints

These are real constraints of where Pivot runs, not choices:

- **Runtime.** A Chromium-based browser on a locked-down company Windows machine: no administrator
  rights, nothing installed.
- **Distribution.** One self-contained `pivot.html`, copied next to the data folder and opened from
  it. A page opened from a file path has a null origin, so it cannot import a second module file; the
  build inlines every module (section 9).
- **Storage.** One shared data folder that every user reaches from their own machine, read and
  written through the File System Access API. jay has confirmed this works from the shared folder on
  company machines; it is not treated as a risk.
- **Users.** Several people use the same folder. There is no server, so concurrency is handled with
  files alone (section 6).
- **Time.** All dates and times are AEST (UTC+10, no daylight saving), from the machine clock.
- **Output.** Reports end at Markdown (for jay's pandoc + tectonic stack, run outside Pivot) and an
  optional standalone HTML page. PDF is out of scope.

Stack, confirmed by jay: plain ES modules, types in JSDoc checked by `tsc --checkJs` (development
only), `node:test`, no UI framework, no runtime dependency.

## 3. Releases

Each release is something jay can use on its own.

**Release 1: register and reports.** The subject of this spec's detail.

- Choosing the data folder; user profiles, one picked on every open.
- One data file with a per-record merge on save; backups; crash recovery; integrity check.
- Hazards with causal factors and consequences; a control library; platforms with one owner.
- Controls linked to a hazard as preventative or mitigating; per hazard, control and platform, a
  control is confirmed, excluded with a reason, or awaiting a decision.
- Initial and residual ratings per hazard per platform, on the fixed company matrix.
- A per-platform report ID for each hazard.
- Create, edit, delete and retire for every record kind; link and unlink everywhere.
- A change history per record.
- Filters over hazards and controls by platform, residual rating, record status and control state.
- Reports through DocGen: produced as a stored snapshot, downloaded as `.md` or `.html`.

**Release 2: reviews and teamwork.** Review schedules with due and overdue flags; acknowledgement of
changes that reach other owners' platforms; guided workflows (section 3.1); a per-user dashboard and an
open-items view; the reference register; the out-of-date warning before a report.

**Release 3: bow-ties.** The bow-tie view and SVG export; image support in DocGen with a PNG written
beside the `.md`; bow-ties included in reports.

### 3.1 Workflows (release 2)

Workflows will be reconfigured often, so adding or changing one must be cheap. Each workflow is a
**definition** in one file, `src/core/workflows/definitions.js`: a name, what it runs on (a platform,
a hazard, or nothing), and an ordered list of steps. Each step names a **step type** from a small
library and the labels it shows, for example:

- `pickRecords`: choose hazards, controls or platforms;
- `decidePerRow`: a decision and note for each row of a list, such as each hazard on the platform;
- `settleRatings`: confirm or re-enter the residual rating of each listed hazard;
- `ruleControls`: confirm or exclude controls on a platform;
- `note`: free text for a decision, action or outcome;
- `setOwner`: choose a platform's new owner.

A step type does its work through the same core ops as the screens, so it adds no new rules. Adding a
workflow is adding a definition, and a new step type is needed only for a genuinely new kind of step.
A completed workflow record keeps the step labels it was run with, so it still reads correctly after
its definition changes, and cannot be edited afterwards.

The starting set is four definitions: onboard a platform, review a platform's data, remove a control
from a platform (settling the affected residual ratings first), and transfer platform ownership. "Add
data" is left out until it is needed. Workflows are defined in code, not edited inside Pivot; editing
them in the app can be added later if reconfiguring through code proves too slow.

Release 1 records what releases 2 and 3 need so that no data has to be migrated later: every change
entry carries the platforms it reaches (section 5.4).

## 4. Architecture

```
src/
  core/            pure, synchronous, no DOM, no IO
    errors.js        PivotError
    time.js          AEST now/today, formatting; clock injectable for tests
    ids.js           uuids, link ids, H-number label
    json.js          canonical JSON
    matrix.js        the company risk matrix (ported)
    data.js          the data shape, emptyData(), validateData(), record helpers
    history.js       change entries: field diff (ported), override notices
    apply.js         commit(): put records and append one history entry
    ops/             each op is (data, act, args) -> data
      hazards.js       hazards, causal factors, consequences, save-time numbering
      controls.js      control library, hazard-control links
      platforms.js     platforms, hazard-platform links, report IDs, ownership
      assessment.js    confirm / exclude / reset a control on a platform; ratings
      reports.js       report records (snapshots); the shared report design
    rules.js         cross-record rules, checked by ops and after a merge
    queries.js       every derived view: a platform's hazards, filters, platforms reached
    merge.js         three-way merge of data by record id
  storage/         async; the only code that touches files or browser storage
    envelope.js      canonical JSON hash, seal/open, stamps, file names (ported)
    folder.js        thin File System Access wrapper: read, write whole-or-nothing, list
    store.js         check folder, profiles, load, save with merge, backups, restore, export
    mirror.js        the localStorage copy of unsaved work
  reports/
    classifications.js  the fixed list of protective markings
    snapshot.js      a platform's current state -> a report snapshot (pure)
    docgen-host.js   the DocGen host: sections, subject, state; report production
  ui/
    controller.js    app state and every action (no DOM; tested in Node)
    names.js         how records and people are named on screen
    html.js          escaping tagged template
    render.js        state -> HTML string
    screens/*.js     one render function per screen
    mount.js         event delegation on a stable root; mounts the DocGen designer
    styles.css
  main.js          entry: builds the browser environment, mounts the app
DocGen/            the document designer (section 8's changes)
scripts/build.js   builds dist/pivot.html (ported)
test/              mirrors src/; test/fakes/ holds the in-memory folder and localStorage (ported)
```

Rules that keep this simple:

- **Core is pure and synchronous.** An operation takes the data and returns new data; it never
  mutates its input and never reads the clock or storage except through the `act` it is given
  (`{ profileId, at }`). Only `storage/` is async.
- **Validation happens once, at load.** `validateData` checks the whole file when it is opened. After
  that, ops trust the data they are given and validate only their arguments.
- **One error type.** Ops throw `PivotError(code, message, details)`. The UI turns any `PivotError`
  into a message; anything else is a bug and is shown as one.
- **Every derived view comes from `queries.js`.** A platform's hazard list, the filter results and
  (in release 2) the dashboard are all built there, so two screens cannot disagree about what a
  platform holds.
- **The UI follows DocGen's pattern.** Screens render HTML strings from the app state, and one
  `wire(root, dispatch)` sets up event delegation once on a root that stays put. All user text passes
  through one escaping helper. The whole app then works one way, including the DocGen designer it
  hosts.

## 5. Data model

### 5.1 The file

`data.json` holds everything but profiles and attached files. It is written inside an envelope:

```
{ "pivot": "pivot", "schemaVersion": 2, "writtenAt": <AEST>, "stamp": <SaveStamp>,
  "integrity": <sha256 of canonical JSON of body>, "body": <Data> }
```

`SaveStamp` is `{ savedBy: profileId, savedAt: AEST, token: 32 hex }`. Schema version 2 marks the
new format; this build refuses version 1 (the Hyperion build) with a message, and an older build
refuses version 2. There is no Hyperion data to migrate: it never went into use.

```
Data = {
  records: { hazard: {id: Hazard}, causalFactor: {...}, consequence: {...}, control: {...},
             platform: {...}, hazardControl: {...}, hazardPlatform: {...}, ruling: {...},
             rating: {...}, report: {...} },
  nextHazardNumber: number,
  history: { id: Entry },
  reportDesign: object        // DocGen's state.report, shared by everyone
}
```

### 5.2 Records

Every record has a header: `id`, `status` (`live`, `retired` or `deleted`), `createdBy`, `createdAt`,
`updatedBy`, `updatedAt`. Nothing is ever removed from the file: deleting sets `status: 'deleted'`,
so history stays whole and the merge never has to reason about a record that vanished.

- **Delete** is for mistakes. A deleted record disappears from every view but its history.
- **Retire** is for things no longer in use. A retired record leaves the default lists; the status
  filter can show it.

| Kind | Fields beyond the header | Id |
|---|---|---|
| hazard | `number` (H-0001, set at save), `title`, `description` | uuid |
| causalFactor | `hazardId`, `text` | uuid |
| consequence | `hazardId`, `text` | uuid |
| control | `title`, `description` | uuid |
| platform | `name`, `ownerId` | uuid |
| hazardControl | `hazardId`, `controlId`, `kind` (`preventative` or `mitigating`) | `hc:<hazard>:<control>` |
| hazardPlatform | `hazardId`, `platformId`, `reportId` | `hp:<hazard>:<platform>` |
| ruling | `hazardId`, `controlId`, `platformId`, `state` (`confirmed` or `excluded`), `reason` | `ru:<hazard>:<control>:<platform>` |
| rating | `hazardId`, `platformId`, `initial`, `residual`, each `{consequence, likelihood}` or null | `rt:<hazard>:<platform>` |
| report | the snapshot (section 7) | uuid |

Link, ruling and rating ids are built from the ids they join. Two users who link the same pair, or
rule on the same control on the same platform, therefore write the same record, and the merge sees
one record changed twice rather than two records that contradict each other.

A hazard's identity is its uuid; everything refers to it by that. Its global ID for people is its
`number`, shown as `H-0001`, which comes from `nextHazardNumber`, only counts up, and so is never
reused. A new hazard gets its number when it is first saved (section 6), so two users creating
hazards at once cannot take the same number; until then the UI shows it as "New". Because nothing
refers to a hazard by its number, giving it one changes no other record.

A hazard's `reportId` on a platform is null until a user sets one, and null means "use the global
ID", so a report shows `H-0042` unless someone has given the hazard a platform-specific ID.

Ratings are stored exactly as entered: a consequence 1 to 5 and a likelihood A to G, or null. The band
(`2C = Serious`) is always read from `core/matrix.js`, never stored. The matrix is fixed in Pivot, as
DEC-002 records.

### 5.3 A control on a platform

For a hazard linked to a platform, each of the hazard's controls is in one of three states:

- **confirmed**: a live ruling with `state: 'confirmed'`. Its `updatedBy`/`updatedAt` say who
  confirmed it and when.
- **excluded**: a live ruling with `state: 'excluded'` and a non-empty `reason`.
- **awaiting**: no live ruling.

`confirm` and `exclude` each act on one control at a time, so a platform never takes on controls in
bulk without a person ruling on each. `reset` returns a control to awaiting.

### 5.4 History

Every op appends one entry per user action:

```
Entry = { id, at, by, action, items: [{ kind, id, change: 'created'|'edited'|'deleted'|'retired'|'restored',
          fields: [{ field, before, after }] }], platforms: [platformId] }
```

`fields` holds each changed field's before and after; for a create or delete it holds every field.
The diff is ported from the old change-log module. `platforms` is every platform the action reaches,
from `queries.platformsReached`; release 1 stores it, and release 2's acknowledgement queue is built
on it. Two further entry kinds support the merge: `override` (section 6) and `noticeSeen`.

The history view in release 1 shows a record's entries. History is append-only and merges as a union.

### 5.5 Rules

`rules.js` holds the cross-record rules. Ops check them before changing anything, and the merge checks
them afterwards:

1. A hazard cannot be retired or deleted while it is linked to a live platform; the refusal names the
   platforms. Unlink it first.
2. A control cannot be deleted while it is linked to a live hazard. Retiring a control takes it out
   of the library but off no hazard or platform.
3. A ruling exists only for a live hazard-control link and a live hazard-platform link. Unlinking a
   control from a hazard, or a hazard from a platform, deletes the rulings it carried, so relinking
   starts every control at awaiting again.
4. An excluded ruling has a non-empty reason.
5. A rating exists only for a live hazard-platform link.
6. A platform has exactly one owner, and it is an existing profile.

## 6. Storage, saving and merge

### 6.1 The folder

```
data.json            the data (section 5.1)
profiles.json        user profiles, in an envelope with no stamp
files/               attachments (release 2's reference register)
backups/             data-YYYYMMDD-HHMMSS.json, the newest 72 kept
Superseded Saves/    the on-disk data.json as it was before a save that overrode it
```

Every JSON file Pivot writes is sealed with the integrity hash. Opening checks `data.json` and
`profiles.json`. If either fails, Pivot names the file, shows nothing from it, and offers a restore.
Backups are checked when they are listed for restore.

Writes go through `createWritable`, which commits on `close` and is discarded on `abort`, so a file is
replaced whole or not at all. That write path is ported from the old `store`.

### 6.2 Opening

1. Choose the data folder (the picker remembers its last location).
2. Check the files; stop on a failed check (6.1).
3. Pick a profile, or create one. None is pre-selected, and nothing can change until one is picked.
4. If the browser's storage holds unsaved work for this folder, offer to recover or discard it.
5. If the history holds `override` entries naming this profile that it has not seen, show them (6.4)
   and record a `noticeSeen` entry, which is saved with the user's next save.

The app keeps three things: `base` (the data as loaded or last saved), `working` (base plus this
user's changes) and `loadedStamp`.

### 6.3 Saving

1. Read `data.json` from disk and check it.
2. If its stamp equals `loadedStamp`, nobody else has saved: `merged = working`.
3. Otherwise merge three ways by record id (`base`, `working` = mine, disk = theirs):
   - a record only I changed takes mine; only they changed takes theirs; neither, base;
   - a record we both changed to different values is a **conflict**, and mine wins;
   - history is the union of both;
   - `nextHazardNumber` is the larger of the two, and above every number in use, so a number is
     never given twice even when data.json has been replaced;
   - a record I loaded that is missing from disk is kept: nothing is ever removed from data.json,
     so its absence means the file was replaced, not that it was deleted. The saver is told.
4. Check the rules on `merged`. A rule broken by the combination (for example they linked a hazard to
   a platform while I retired it) is also a **conflict**. Mine wins: each record in the broken rule
   takes my version, or base if I did not touch it. Check again; if a rule is still broken, the save
   stops with a message and nothing is written.
5. Give every hazard that has no number the next one from `nextHazardNumber`, in order of creation.
6. If the disk stamp differed, copy the disk file to `Superseded Saves/`, named from its stamp.
7. If there were conflicts, append an `override` entry listing each overridden record, whose edit it
   was (the record's `updatedBy` on disk) and what it held.
8. Seal with a fresh stamp and write `data.json`. Just before writing, read the stamp once more; if it
   changed during steps 1 to 7, go back to step 1.
9. `base = working = merged`, `loadedStamp` = the new stamp, and clear the unsaved-work copy.

After a save that merged, the saver is told who else had saved, what was merged in, any conflicts
their save won, and the name of the superseded file.

### 6.4 The overridden user

The next time a user whose edit was overridden opens Pivot, they see each `override` entry naming
them: the record, what they had saved, and what replaced it. Seeing it records `noticeSeen`, so each
notice is shown once per user.

### 6.5 Backups, recovery and restore

- **Backups.** After any change to `working`, if the newest file in `backups/` is more than an hour
  old (or there is none), write `working` there, then delete all but the newest 72.
- **Unsaved work.** After every change, `{ folderName, base, working, loadedStamp }` is written to one
  `localStorage` key. Because `base` is kept, recovered work saves through the normal merge. If
  storage is full or unavailable, Pivot says so and carries on.
- **Restore** from a backup or any chosen data file: Pivot warns that the stored data will be
  replaced and lists the unsaved changes that would be lost. On confirmation it copies the current
  `data.json` to `Superseded Saves/` and writes the chosen body with a fresh stamp. Restore replaces;
  it does not merge.

### 6.6 Profiles

`profiles.json` holds `{ id, name, createdAt }` per profile. There are no passwords: a profile says
who did what, not who may. Creating a profile re-reads the file and adds to it, so two people creating
profiles at once both keep theirs. Names are unique ignoring case.

### 6.7 Exports

Report downloads (and, in release 3, bow-tie SVGs) go through `showSaveFilePicker` and the same
whole-or-nothing write. An export is not a change and is not recorded in history.

## 7. Reports (release 1)

**Producing a report** takes a platform and the current report design and builds a snapshot from
`queries.platformHazards` in `reports/snapshot.js`:

```
Report = { platformId, platformName, ownerName, producedAt, producedBy, title, classification,
           rows: [{ hazardId, number, reportId, title, description, causalFactors, consequences,
                    controls: [{ title, kind, state, reason }], initial, residual }],
           markdown, html }
```

The snapshot holds values, not references, so a report stays what it was when produced. The `.md` is
generated through DocGen at production and stored in the record, and so is the `.html`
(`App.docGen.emitHtml`). Downloading writes the stored text. A report list shows what was produced,
when and by whom.

**The DocGen host** (`reports/docgen-host.js`):

- `getState()` returns `{ report: data.reportDesign }`, and `commit(mutator)` applies the change to
  `working` as an ordinary edit, so the design is saved, merged and backed up like everything else.
- `clock.nowIso()` is Pivot's clock.
- `subject`: `noun: 'platform'`; `list()` is the live platforms; `meta(id)` gives the platform name,
  owner and produced date.
- `sections(run)` declares the report's tables from the snapshot being produced: hazards (key column
  the report ID; title, initial and residual rating with its band), controls per hazard (kind, state,
  reason), and causal factors and consequences. jay arranges, words and formats them in the
  designer.
- The designer's Generate buttons (`data-generate-format="md"` or `"html"`) produce a report and
  offer the download.

Release 1 reports carry no out-of-date warning (reviews arrive in release 2) and no reference
documents.

## 8. DocGen changes

DocGen stays as it is, with three small changes for release 1:

1. **The classification marking is chosen per report design, from a fixed list.** The host supplies
   the list (`host.classifications`: `OFFICIAL`, `OFFICIAL: Sensitive`, `PROTECTED`). The designer's
   on/off checkbox becomes a choice of "None" or one entry from the list, stored in the report design
   as the marking's text. That text is printed in the PDF's header and footer and above and below the
   HTML page, as the checkbox's fixed text was. There is no free text, so a marking cannot be
   mistyped. The list is defined in one place in Pivot (`src/reports/classifications.js`) and can be
   changed there; a new report design starts at "None". A produced report stores the marking it was
   produced with.
2. Its CSS tokens are mapped onto Pivot's (`.docgen { --c-accent: ... }`) in `src/ui/styles.css`,
   so the designer matches the rest of the app.
3. The designer's per-section preview calls `host.subject.context` and `host.subject.chosenMeta`,
   which the host contract never declared, so it fails for any host without them (the example page
   included). DocGen gains defaults for both (`App.docHost.context`, `App.docHost.chosenMeta`).

Image support is release 3's.

## 9. Build and tests

**Build.** `scripts/build.js`, ported from the archive, reads every file under `src/` and
`DocGen/doc-designer.js`, embeds each as a `data:` module behind an inline import map, inlines
`src/ui/styles.css` and `DocGen/doc-designer.css`, and writes `dist/pivot.html`. There is no
bundler and no runtime dependency. `dist/` is not committed.

**Commands** (root `package.json`, `"type": "module"`): `npm test` (every `node:test` file, then
DocGen's own suite), `npm run build`, `npm run typecheck`. TypeScript is the only development dependency.

**Tests** (`node:test`):

- Core: each op and rule, the matrix (all 35 cells and the uncategorised case, ported), the history
  diff and the queries, all against in-memory data.
- Merge: a randomised test that applies random ops on two sides from one base and checks the result.
  Non-conflicting changes all survive; every conflict resolves to mine; the rules hold; history is the
  union; no H-number repeats.
- Storage: save, merge, supersede, backups, restore, recovery and the integrity check, against the
  in-memory folder fake ported from the archive.
- Reports: a snapshot does not change after its source data does; DocGen produces `.md` and `.html`
  from it.
- UI: screens are checked by driving the built `pivot.html` in a browser (Playwright) during
  development. Browser tooling is not a project dependency.
- DocGen keeps its own suite (`DocGen/doc-designer.test.js`).

## 10. What is ported from the archive

From `archive/hyperion/`, adapted to the shapes above:

| Piece | From |
|---|---|
| Whole-or-nothing write, stamp compare, superseded copy, backup ring, recovery | `modules/store/src/store.js` |
| Envelope, canonical JSON, SHA-256, backup and superseded file names | `baseline/schema.js` |
| AEST formatting | `baseline/clock.js` |
| The risk matrix and its reference test | `modules/rating/src/rating.js`, `validation/reference/dec-002-matrix.test.js` |
| Field-level diff | `modules/change-log/src/change-log.js` |
| Month arithmetic with clamping (release 2) | `modules/review-schedule/src/review-schedule.js` |
| Bow-tie layout and SVG (release 3) | `modules/bowtie/src/bowtie.js` |
| Single-file build | `baseline/scripts/build.js` |
| In-memory File System Access and localStorage fakes | `modules/store/conformance/harness.js` |

Everything else is written fresh.

## 11. Screens (release 1)

- **Open**: choose the folder; the file check, with the failed files named if any.
- **Profile**: pick or create; then the recovery offer and any override notices.
- **Top bar** on every screen: the active profile's name, an unsaved-changes marker, Save, and the
  save result.
- **Hazards**: list with filters; a hazard's page with its description, causal factors, consequences
  and controls, the platforms it is on, and its history.
- **Controls**: the library; a control's page with the hazards that use it and its history.
- **Platforms**: list; a platform's page listing its hazards with residual rating and control
  states; link and unlink hazards; owner and report IDs.
- **Assessment**: one hazard on one platform: both ratings with their bands, and each control's state
  with confirm, exclude (with reason) and reset.
- **Reports**: the DocGen designer, produce a report for a platform, the list of produced reports,
  and downloads.
- **Backups**: list, restore from a backup or a chosen file.

An edit to something shared by two or more platforms (renaming a shared hazard, for example) shows a
note in its form naming those platforms before it is applied. It is a note, not an extra
confirmation step.

## 12. Open questions

None for release 1.
