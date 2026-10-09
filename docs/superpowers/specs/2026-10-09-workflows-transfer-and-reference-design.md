# Workflows, part 3: Transfer Platform Owner and Reference Update

Date: 2026-10-09
Status: approved design, awaiting spec review
Builds on:
- `2026-10-08-workflows-platform-review-design.md` (the workflow framework: WF-n, owner, Take over, Cancel, "via WF-n" tracing)
- `2026-10-09-workflows-platform-onboarding-design.md`

## Decisions

### Transfer Platform Owner (D)

- **When the owner changes.** The platform's owner changes when the transfer is **confirmed**. The recipient does not accept or decline. Instead they get an urgent item to review what they have taken on.
- **All owner changes go through the workflow.** The Owner dropdown on the platform page becomes **Transfer owner…**. Anyone can start a transfer. The one exception is a new platform's owner chosen in onboarding's Details step.
- **The responsibilities list** is built from the platform's own data, as groups. Each group has a **Checked** tick and an optional note. Groups with nothing in them show "None" and need no tick.
- **Confirming hands over open workflows.** The platform's open workflows that the old owner owns pass to the recipient. Workflows owned by anyone else stay with them.

### Reference Update (E)

- **What the workflow collects at the start:** the new revision number and at least one of a file, a link or a path.
- **When they take effect:** only on **confirmation**. Until then the reference is unchanged. Cancelling leaves it untouched.
- **Affected items:** every live item the reference is linked to. Each row has a tick, an optional note and **Open →**. Confirmation needs every row ticked.
- **"Open →"** goes to the item's own page, with a banner "Working on WF-n · ← Back to WF-n". Edits made there while the banner shows are stamped "via WF-n". Leaving that page drops the banner.

## Data

No schema bump: these are new workflow types and fields on `workflow`.

### `transferOwner` workflow

| Field | Meaning |
|---|---|
| `platformId` | The platform being transferred. |
| `toOwnerId` | The recipient. `null` until chosen. |
| `fromOwnerId` | The platform's owner when the transfer was confirmed. `null` until then. |
| `reviewed` | `{ by, at }` once the recipient marks the transfer reviewed, otherwise `null`. |

Its `workflowStep` records use these keys:
- `hazardId`: the placeholder `'-'`
- `check`: `group:<key>`, one of `acks`, `review`, `workflows`, `awaiting`, `toImplement`, `controlGaps`, `hazardGaps`.

### `referenceUpdate` workflow

| Field | Meaning |
|---|---|
| `referenceId` | The reference being updated. |
| `platformId` | `null`. |
| `revision` | The pending new revision. |
| `file` | The pending new file (a `StoredFile` already written to the folder), or `null`. |
| `url`, `path` | The pending new link and path, or `null` to keep the reference's current ones. |

Its `workflowStep` records use these keys:
- `hazardId`: the linked target, as `<targetKind>:<targetId>`
- `check`: `'item'`.

### Rules (`src/core/rules.js`)

- An open workflow with a `platformId` needs a live platform (as today).
- An open `referenceUpdate` needs a live, non-archived reference.
- At most one open workflow of each type per platform: review, onboarding, transfer.
- At most one open `referenceUpdate` per reference.

## Core

### Ops (`src/core/ops/workflows.js`)

**`startWorkflow({ type: 'transferOwner', platformId })`**
- Refused if the platform is not live.
- Refused if the platform is Onboarding: "Finish onboarding first."
- Refused if the platform already has an open transfer.

**`startWorkflow({ type: 'referenceUpdate', referenceId })`**
- Refused if the reference is not live, or is archived.
- Refused if the reference already has an open update.

**`setTransferRecipient({ workflowId, toOwnerId })`**
- Owner-only.
- The recipient must be a profile id other than the platform's current owner. Profiles are not in the data, so the controller checks the id against the profiles it has. The op checks only that it differs from the current owner.

**`setReferenceDraft({ workflowId, revision?, url?, path?, file? })`**
- Owner-only.
- `file` is a `StoredFile`. The controller writes it to the folder before dispatching, the same way `uploadReferenceFile` does.

**`setStep`** accepts:
- for a transfer: `hazardId: '-'` with `check: 'group:<key>'`
- for a reference update: `hazardId: '<kind>:<id>'` with `check: 'item'`.

**`completeWorkflow` for `transferOwner`**
- Refused unless a recipient is set and every non-empty group is ticked.
- In one change it:
  - sets the platform's `ownerId` to `toOwnerId` (history action "Change platform owner")
  - makes `toOwnerId` the owner of every open workflow on that platform owned by the old owner (other than this transfer)
  - sets `fromOwnerId` and completes the workflow.

**`completeWorkflow` for `referenceUpdate`**
- Refused unless:
  - the revision is non-blank and differs from the reference's current revision
  - at least one of `file`, `url` or `path` is given in the workflow
  - every current item is ticked.
- In one change, the reference gets:
  - the new `revision`
  - `file`, if one was given, with the old file put first in `pastFiles`
  - `url` and `path`, if given.
- The workflow is completed. The history action is "Update reference to rev <revision>".

**`markTransferReviewed({ workflowId })`**
- Only for a completed transfer.
- Only the recipient (`act.by === toOwnerId`) may do it.
- Sets `reviewed`. The action is in `NOT_ACKNOWLEDGED`, so it never waits for anyone.

`cancelWorkflow` and `takeOverWorkflow` are unchanged.

### Queries

**`transferGroups(data, platformId)`** returns `{ key, title, items }[]` in this order:

| Key | Title | Items |
|---|---|---|
| `acks` | Changes waiting acknowledgement | `waitingChanges` |
| `review` | Review schedule | the platform's rule, next due date and state, plus any moved date. Always at least one item: either the schedule or "No review schedule". |
| `workflows` | Workflows on this platform | open workflows on the platform, other than this transfer |
| `awaiting` | Controls awaiting a decision | |
| `toImplement` | Controls to implement | |
| `controlGaps` | Controls incomplete | |
| `hazardGaps` | Hazards unrated, unjustified or SFARP incomplete | the open-items entries for this platform |

**`referenceItems(data, referenceId)`** returns `{ key: '<kind>:<id>', kind, label, platforms, open: { view, id, tab? } }[]` for live links to live targets.

**`openItems(data, today, ownerId)`** gains a `transfers` category: completed `transferOwner` workflows with `toOwnerId === ownerId` (any owner when `ownerId` is null) and `reviewed === null`. `attentionItems` puts these first, as urgent.

Workflow-type branches that are **not** reached by these two types:
- `workflowProgress`'s per-hazard breakdown
- `workflowHazards`.

Progress is measured as follows:

| Workflow | `done` | `total` |
|---|---|---|
| Transfer | non-empty groups ticked, plus 1 when a recipient is set | non-empty groups + 1 |
| Reference update | items ticked, plus 1 when the revision and a file, link or path are given | items + 1 |

`workflowSubject` names the reference for a reference update.

## UI

### Workflows dashboard

The Transfer Platform Owner and Reference Update tiles become ready.

- **Transfer Platform Owner:** "Select platform…" listing live platforms that are not Onboarding, then Start.
- **Reference Update:** "Select reference…" listing live, non-archived references, then Start.

### Workflow page

Each type gets its own body, in `screens/transfer.js` and `screens/reference-update.js`.

**Transfer, open (single page):**
- **Recipient:** "Select new owner…", a dropdown listing every profile except the current owner.
- **Group cards:** each with a count; expands to its items (with links); a note; a Checked tick. An empty group shows "None".
- **Summary:** the unmet list, then **Confirm transfer**, disabled until everything is met.

**Transfer, completed:**
- The groups, with their ticks and notes.
- "Transferred from Ada to Grace".
- **Mark as reviewed**, shown only to the recipient while it is unreviewed. Otherwise, "Reviewed by Grace, <when>".

**Reference update, open (single page):**
- **New revision:**
  - current revision (read-only)
  - New revision input
  - New file upload, showing the uploaded file's name
  - link and path inputs, empty, with the current ones shown as placeholders.
- **Affected items table:**
  - Kind · Item · Platforms · Note · Checked · Open →
- **Summary:** the unmet list, then **Confirm update**.

**Reference update, completed:** the revision change (old → new), the items with their ticks and notes, and "Changes made through WF-n".

### Elsewhere

- **Platform page:** the Owner dropdown is replaced by the owner's name and a **Transfer owner…** button. The button goes to the platform's open transfer if there is one, otherwise it starts one.
- **Reference page:** **Update revision…** goes to the open update, or starts one. The plain revision input and the "Replace with new revision" upload stay as they are. They remain quick edits outside the workflow, as before.
- **Home, Needs attention:** a transfers row with a red "Urgent" chip reading "Review the transfer of <platform> from <name> (WF-n)", and **Review →**, which opens the workflow.
- **"Open →" banner:**
  - Navigating with `via: workflowId` keeps `view.via`, and the page shows "Working on WF-n · ← Back to WF-n".
  - The controller's `act()` stamps edits with `view.via` when that workflow is open and owned by the current profile.
  - Any other navigation clears `via`.

## Errors

These are `PivotError`s:

- starting either workflow when it is refused (see Ops)
- choosing the current owner as the recipient
- confirming while something is unmet
- marking a transfer reviewed by anyone but the recipient, or before it is completed
- a draft change to a reference update by anyone but its owner.

## Testing

**Core:**
- Starting refusals for both types.
- Transfer:
  - the recipient and groups
  - strict confirm
  - the owner change and the handover of workflows (only those owned by the old owner)
  - the transfers open item for the recipient, cleared by Mark as reviewed, which only the recipient can do.
- Reference update:
  - the draft
  - live items: one linked mid-workflow appears, one unlinked drops out
  - strict confirm
  - the revision, file, url and path applied on confirm, with the old file put into `pastFiles`
  - cancel leaves the reference untouched.
- Rules: one open workflow of each kind; live subject.
- A merge where two people start a transfer of the same platform: mine is kept.

**Screens:**
- the dashboard tiles
- both bodies, open and completed
- the platform page's Transfer owner… button
- the reference page's Update revision…
- the Needs attention transfers row
- the banner.

**Controller:**
- edits under the banner are stamped and others are not
- the file uploaded during an update is stored but not attached until confirm.

**Browser:** a walkthrough after the build.

## Out of scope

- Workflow C (New Tech Data).
- Editing affected items inline in a Reference Update.
- A recipient declining a transfer.
