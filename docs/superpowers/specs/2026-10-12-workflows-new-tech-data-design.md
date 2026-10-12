# Workflows, part 4: New Tech Data

Date: 2026-10-12
Status: approved design, awaiting spec review
Builds on:
- `2026-10-08-workflows-platform-review-design.md` (the workflow framework: WF-n, owner, Take over, Cancel, "via WF-n" tracing, rail layout)
- `2026-10-09-workflows-platform-onboarding-design.md`
- `2026-10-09-workflows-transfer-and-reference-design.md`

## Purpose

New technical data arrives, for example a manufacturer bulletin, a test report or a revised manual. This workflow works it through everything it affects:

- The data is kept as a **Reference**.
- You say which platforms, and which hazards on them, it affects.
- For each affected platform-hazard, you go through four sections:
  - controls
  - safety reports
  - residual rating and justification
  - SFARP.

  Each section is answered "Changed" or "No change".
- On completion, the reference is linked to what it changed.

## Decisions

- **The tech data is a Reference.** At the start you pick an existing live, unarchived reference, or create a new one.
- **Scope is platforms, then hazards.**
  - Tick the affected platforms, then the affected hazards on each.
  - A scoped platform can also gain a hazard: link an existing one, or create a new one by title. An added hazard is scoped automatically.
- **Each scoped platform-hazard gets one page with four cards:**
  1. Controls
  2. Safety reports
  3. Residual rating & justification
  4. SFARP

  Each card has the same editor the platform page uses, a **Changed / No change** answer and an optional note. Edits are made in place and stamped "via WF-n".
- **Complete is strict.**
  - At least one platform-hazard must be in scope.
  - Every card on every scoped platform-hazard must be answered.
  - A card answered Changed with no "via WF-n" edit on it shows a soft warning, but this does not block completing.
- **Complete links the reference to what changed:**
  - every scoped platform
  - every scoped hazard with at least one Changed answer, or that was added through the workflow
  - every control touched by a change stamped "via WF-n".

  Links that already exist are left alone.

## Data

There is no schema bump: this is a new workflow type plus a new optional field on `workflowStep`.

### `newTechData` workflow

| Field | Meaning |
|---|---|
| `referenceId` | The reference holding the tech data. |
| `platformId` | `null`. |
| `outcome` | Free text, as in Platform Review. |
| `linked` | Set on completion: the `{ targetKind, targetId }[]` links Complete made (new ones only). `null` until then. |

`workflow.at.hazardId` keeps the resume position:
- `'@scope'` for the scope step
- `'<platformId>|<hazardId>'` for a platform-hazard page
- `null` for the summary.

### `workflowStep` records

The id stays `ws:<workflowId>:<hazardId>:<check>`. The `hazardId` field holds a key:

| `hazardId` key | `check` | Meaning |
|---|---|---|
| `p:<platformId>` | `scope` | The platform is in scope while `checked` is true. |
| `<platformId>\|<hazardId>` | `scope` | The hazard is in scope on that platform while `checked` is true. `added: true` when the workflow linked or created it. |
| `<platformId>\|<hazardId>` | `controls`, `safetyReports`, `residual` or `sfarp` | The card's `answer` (`'changed'`, `'none'` or `null`) and its `note`. |

`answer` is new. It is optional and only used by this type. A missing `answer` reads as `null`.

Unticking a platform or hazard sets `checked: false`. Its answers stay in the data and come back if it is ticked again.

## Core

### Queries (`src/core/workflows.js`)

- **`TECH_CARDS`:** `['controls', 'safetyReports', 'residual', 'sfarp']`, with their words.
- **`openTechData(data, referenceId)`:** the open `newTechData` workflow on that reference, or `null`.
- **`techScope(data, wf)`** returns `{ platform, hazards: { hazard, reportId, key, added }[] }[]`:
  - the scoped platforms that are live and not Onboarding, in platform order
  - each with its scoped hazards that are still live and linked to it, in hazard order.
- **`techPairs(data, wf)`:** the flat list of `{ platform, hazard, reportId, key, added }` from `techScope`.
- **`techTouched(data, wf)`** returns `Map<key, Set<card>>`, built from the changes stamped with this workflow. Each record a change touched is mapped to a scoped key and a card:

  | Card | Record kinds |
  |---|---|
  | controls | `hazardControl`, `controlOn`, `implementationStatus`, `control`, and the control's `implementer` |
  | safetyReports | `safetyReport` |
  | residual | `assessment` records with stage `residual` |
  | sfarp | `sfarp` |

  A `control` record that matches no single pair counts towards every scoped pair the control is on. This mapping is used for the soft warning and for the controls to link.
- **`techLinks(data, wf)`** returns the `{ targetKind, targetId }[]` that Complete would add:
  - platforms in scope
  - hazards that have a Changed answer or are `added`
  - controls touched.

  Links that already exist are left out.
- **`workflowProgress`** for `newTechData`:
  - `total` = 4 × pairs + 1
  - `done` = answered cards on current pairs + 1 if any pair is in scope.

  `perHazard` is keyed by pair key, with counts 0–4.
- **`workflowSubject`** names the reference.

### Ops (`src/core/ops/workflows.js`)

**`startWorkflow({ type: 'newTechData', referenceId })`**
- Refused if the reference is not live (`reference.retired`), or is archived (`reference.archived`).
- Refused if the reference already has an open New Tech Data workflow (`techData.open`).
- Opens at `'@scope'`.

**`startTechData({ id?, referenceId?, title, docNumber, revision, url, path })`**
- Creates the reference (via `createReference`'s rules) and the workflow, in one commit.

**`setTechScope({ workflowId, platformId, hazardId?, checked })`**
- Owner-only.
- **Platform:** must be live and not Onboarding.
- **Hazard:** the platform must be in scope and the hazard live and linked to it.
- Writes the `scope` step.

**`addTechHazard({ workflowId, platformId, hazardId?, title? })`**
- Owner-only. The platform must be in scope.
- With `hazardId`: links the hazard to the platform (the same as `linkHazard`).
- With `title`: creates the hazard (the same as `createHazard`) and links it.
- In both cases it writes the scope step with `checked: true, added: true`, all in one commit.

**`setStep` for `newTechData`**
- `check` must be one of `TECH_CARDS`, and `hazardId` a pair key currently in scope.
- Accepts `answer` (`'changed'`, `'none'` or `''` to clear) and `note`.

**`setWorkflowPosition`** accepts `'@scope'` and current pair keys.

**`completeWorkflow` for `newTechData`**
- Refused unless there is at least one pair and every card on every pair is answered: "N things are still needed."
- In one commit, it:
  - adds a `referenceLink` for each of `techLinks`
  - sets `linked`
  - completes the workflow, recording `covered` as the pair keys.
- The history action is "Work through new tech data".

### Cancelling with the reference

`updateCancelled(data, act, referenceId)` in `ops/references.js` also cancels an open `newTechData` on the reference. It is used by:
- archiving a reference
- `retireReference`
- `deleteReference`.

Platforms are not cancelled: a retired platform simply drops out of scope.

### Rules (`src/core/rules.js`)

- An open `newTechData` needs a live, unarchived reference (`workflow-subject-not-live`).
- At most one open `newTechData` per reference (`two-open-techdata`).

## UI

### Dashboard tile

The New Tech Data tile becomes ready:
- "Select reference…", listing live, unarchived references, then **Start**.
- A **New reference…** toggle opening these fields, then **Start**:
  - title
  - doc number
  - revision
  - link
  - path

  A file can be attached later on the reference page.

### Workflow page (`screens/tech-data.js`)

**Rail:**
- **Scope** (✓ once any pair is in scope)
- per platform, a heading followed by its hazards, each with n/4 and ✓ when all four are answered
- **Summary & complete**

**Scope step:**
- One card per live, non-Onboarding platform, each with a tick. Ticked platforms are listed first.
- A ticked platform shows its hazards as ticks.
- It also offers **Add hazard…**, which opens the link-hazards picker carrying the workflow id, so each picked hazard is dispatched as `addTechHazard`.
- It also offers a **New hazard title** input with Add.

**Platform-hazard page:**
- The head shows the hazard and the platform, both as links.
- **Four cards:**
  - **Controls:** `controlsSection`
  - **Safety reports:** `safetyReportsSection`
  - **Residual rating & justification:** `riskPanels(…, 'residual')` with both the ratings and the justifications
  - **SFARP:** `sfarpArea`
- Each card has a Changed / No change radio pair and a note.
- Changed with nothing in `techTouched` for that card shows "No changes recorded here yet".
- Previous and Next buttons at the bottom.

**Summary:**
- the grid (pairs × cards: Changed, No change or blank, with notes)
- "Will link the reference to …"
- an Outcome box
- **Complete**, disabled with "N still needed".

**Completed:**
- the grid
- "Linked to …" (from `linked`)
- the outcome
- "Changes made through WF-n".

### Elsewhere

- **Reference page:** a **Work through as new tech data…** button next to Update revision…. It opens the open workflow, or starts one.
- **Home and dashboard:** listed in Workflows in progress like the others. There is no Needs attention item.

## Errors

These are `PivotError`s:

- starting when refused
- scoping a platform that is not live or is Onboarding
- scoping a hazard not on a scoped platform
- an answer for a pair not in scope
- Complete with unmet items
- edits by anyone other than the owner.

## Testing

**Core:**
- Starting:
  - the refusals
  - `startTechData` creates both records in one entry.
- Scope:
  - add and remove
  - answers kept across an untick and a re-tick
  - `addTechHazard` with an existing hazard and with a new title.
- `setStep` refused for pairs not in scope.
- Drop-out when a hazard is unlinked or a platform retired.
- `techTouched` maps stamped changes to cards.
- Strict Complete, and `techLinks`:
  - changed or added hazards only
  - controls found from the stamps
  - existing links skipped.
- Cancelling when the reference is retired, archived or deleted.
- Rules.
- A merge where two people start one on the same reference.

**Screens:**
- the tile
- the scope step
- the platform-hazard page with its answers and the soft warning
- the summary
- the completed view
- the reference-page button.

**Controller:**
- the reference-page button opens the existing workflow
- the picker dispatches `addTechHazard` when it carries a workflow.

**Browser:** a walkthrough after the build.

## Out of scope

- Linking the reference to facets.
- Attaching a file at the start: it is attached on the reference page.
- Workflows beyond the MVP five.
