# Pivot release 2c: the reference register

Date: 2026-09-29. Status: draft for jay-pryor's review.

## 1. Where this fits

Release 2 is built in pieces: 2a reviews, 2b acknowledgements and the Home page, and this piece,
the **reference register**. A reference is a supporting document (a standard, safety case, test
report, drawing, procedure) recorded once and linked to the records it supports. The rebuild design
reserved `files/` in the data folder for it (section 6.1).

The archive (`archive/hyperion/`, reference-register) is guidance. This keeps its "a name plus any
of a link, a path and a stored file", its stored files copied into the data folder, and its flag for
a stored file gone missing. It departs from it where jay chose to: references can be edited, retired
and unlinked like everything else; old revisions of a stored file are kept; and references appear in
reports as a DocGen section.

## 2. Data

### 2.1 Records

| Kind | Fields beyond the header | Id |
|---|---|---|
| reference | `number` (R-0001, set at save), `title`, `docNumber`, `revision`, `note`, `url`, `path`, `file`, `pastFiles` | uuid |
| referenceLink | `referenceId`, `targetKind` (`hazard`, `causalFactor`, `consequence`, `control`, `platform`), `targetId` | `rl:<reference>:<kind>:<target>` |

- `title` is required. `docNumber`, `revision`, `note` are optional text (`''` when unset).
- `url` and `path` are text or `''`. `file` is a stored file or null. A live reference has at
  least one of `url`, `path`, `file`.
- A **stored file** is `{ name, stored, size, type, addedBy, addedAt }`: the name it was uploaded
  with, its path inside the data folder, its size in bytes, its media type, and who added it when.
- `pastFiles` is the list of stored files it replaced, newest first. They stay in the folder and can
  be opened.
- References are numbered at save like hazards, controls and platforms (`nextReferenceNumber`,
  never reused; older data files gain the counter on load).
- Link ids are built from what they join, so two users making the same link write one record; two
  users linking one reference to different records write two.

### 2.2 Stored files

A file is copied to `files/<reference id>/<n>-<safe name>`, where `n` counts the reference's files
from 1 and `safe name` is the uploaded name with anything unsafe in a Windows file name replaced.
A stored path is never written twice, so concurrent uploads cannot collide and old revisions stay
put. The write is whole-or-nothing (`createWritable`, as for saves). The copy is written before the
edit that records it; an edit that is never saved leaves an unused file in `files/`, which is
harmless. Nothing Pivot does removes a file from `files/`.

## 3. Operations

A new file, `src/core/ops/references.js`; each op is `(data, act, args) -> data` with one history
entry:

- `createReference({ id?, title, docNumber?, revision?, note?, url?, path?, file? })`: refused
  without at least one of url, path, file. The add form on the list asks for the title and one of: a
  file to upload, a web link, a network path; an uploaded file is copied into the folder first, then
  the reference is created with it in one edit.
- `updateReference({ id, title?, docNumber?, revision?, note?, url?, path? })`: refused if it
  would leave a reference with none of url, path, file.
- `attachFile({ id, file })`: `file` is the stored-file object; the current file, if any, moves to
  the front of `pastFiles`.
- `retireReference`, `restoreRecord` (existing, gains `reference`), `deleteReference`: refused while
  it has live links ("Unlink it first").
- `linkReference({ referenceId, targetKind, targetId })`, `unlinkReference(...)`.

Deleting a hazard also deletes the links to it and to its causal factors and consequences; deleting a
causal factor, consequence, control or platform deletes the links to it. Retiring deletes nothing.

## 4. Rules

Added to `rules.js`, checked by the ops and after a merge:

- A live link needs a live or retired reference and a target that is not deleted.
- A live reference has at least one of url, path, file.

## 5. Where changes reach

`platformsReached` gains: a reference reaches every platform its linked records are on (a platform
link reaches that platform; a hazard, its causal factors and consequences reach the hazard's
platforms; a control reaches the platforms of the hazards it is linked to); a link reaches its
target's platforms. So an edit to a shared reference waits for acknowledgement by other owners (2b).

## 6. Screens

- **References list** (nav item after Platforms): ID, title, doc number, revision, what it points
  at (file, link, path), how many records it supports, status; the File missing badge. Its + opens a
  small form: title, and a file to upload, a web link or a network path (at least one).
- **A reference's page**, in the record-page style:
  - title, doc number, revision, note, url and path edited in place;
  - the stored file: **Open** (read from the folder and opened in a new tab; the browser shows PDFs
    and images and downloads the rest), **Upload file…** or **Replace with new revision…**; *Past
    files* listed with their own Open;
  - the url opens in a new tab; the path has **Copy path** and an Open link (browsers may block
    opening a network path; copying always works);
  - **Supports**: a card table of linked records (kind, ID, name) with a + picker covering hazards,
    their causal factors and consequences, controls and platforms, and ✕ to unlink;
  - Retire, Delete (when nothing is linked) and History, as on other pages.
- **Hazard, control and platform pages** gain a **References** card with a + picker of references
  and ✕ to unlink. A hazard's card also lists references linked to its causal factors and
  consequences, marked *for causal factor: …*.
- **File missing**: when the list or a reference's page opens, and after each upload, Pivot checks
  each stored file (current and past) exists in `files/`; a missing one shows a red *File missing*
  badge. The result is kept in the app state until the next check.

## 7. Reports

- The snapshot gains `references: [{ number, title, docNumber, revision, supports }]`: every live
  reference linked to the platform, to a hazard on it or one of that hazard's causal factors or
  consequences, or to a control linked to one of those hazards; each once, with `supports` listing
  what it supports on this platform (*Platform*, a hazard's report ID, *H-0001 causal factor*,
  a control's title).
- The DocGen host declares a **References** section (ID, Title, Doc number, Revision, Supports),
  placed, worded or left out in the designer like the others. Following DocGen's rule that a
  section a saved design does not mention is included, it appears in existing designs until
  switched off (DocGen is not changed for this).
- A produced report keeps its reference list as produced.

## 8. Storage

`src/storage/folder.js` gains a binary whole-or-nothing write (`writeBytes`), a read that returns a
`File` (`readFile`), and an existence check (`exists`). `src/storage/store.js` gains
`storeReferenceFile(handle, referenceId, n, file)`, `openReferenceFile(handle, stored)`, and
`missingFiles(handle, storedPaths)`. The in-memory folder fake gains binary contents.

## 9. Tests

`node:test`, in the existing layout:

- Ops: create (needs one of url, path, file), edit, attach and replace (old file to past files),
  retire, restore, delete refused while linked, link and unlink for each target kind; deleting a
  hazard, causal factor, control or platform removes its links.
- Rules, and a merge where two users link one reference to different records (both kept).
- `platformsReached` for references and links.
- Storage: a binary file written whole into `files/`, read back, never overwritten, and the
  missing-file check, against the in-memory folder.
- Snapshot: the reference list, each reference once, `supports` labels, unchanged after later edits;
  DocGen: the section's rows.
- Controller: create, upload and replace, open, copy path, link from each page, the missing check.
- Screens: the list, a reference's page, the References cards, the File missing badge, markup shown
  literally.
- A Playwright pass that uploads a real file, opens it, and produces a report with the section.

## 10. Not in this piece

Review schedules on references; searching inside documents; previews inside Pivot; deleting stored
files.
