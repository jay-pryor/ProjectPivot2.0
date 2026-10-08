# Workflows, part 1: the framework and Platform Review

Date: 2026-10-08
Status: approved design, awaiting spec review

## Context and scope

Workflows are guided, persistent, owned pieces of work. Five are planned:

- A. Platform Onboarding
- B. Platform Review
- C. New Tech Data
- D. Transfer Platform Owner
- E. Reference Update

They are built in four parts, each with its own spec, plan and build:

1. **The framework plus B (Platform Review).** This spec.
2. A (Platform Onboarding).
3. D (Transfer Platform Owner) and E (Reference Update).
4. C (New Tech Data).

This part does four things:

- adds a **Workflows** tab
- moves the review checklist out of the Reviews tab and into a Platform Review workflow
- adds a Workflows in progress panel on Home
- makes every edit made through a workflow traceable to the workflow's number

## Decisions

- **Edits are made inside the workflow.** Each check embeds the editors the platform page already uses, so edits are real edits that are recorded in history straight away.
- **Each check has a tick and an optional note.** A hazard is reviewed once all six of its checks are ticked.
- **Complete is strict.** It is refused until every check on every hazard currently on the platform is ticked. A review schedule is also needed, as today.
- **Layout is one hazard per screen.** A rail on the left lists the hazards with their progress (x/6) and ends with Summary and complete. Hazards can be visited in any order. Resuming opens the hazard the user was last on.
- **Owner:**
  - The owner is the person who started the workflow.
  - Anyone can view a workflow, but only the owner can act on it.
  - Anyone can **Take over…** a workflow. Taking over takes two clicks and is recorded in history.
- **One open Platform Review per platform.**
- **Cancel takes two clicks.** It keeps the workflow's ticks and notes as a cancelled record. It cannot undo edits already made to hazards, and the confirm text says so.
- **Every workflow gets a number** (WF-n) that is never reused. Every history entry made through a workflow carries that workflow, so the changes a cancelled workflow made can be traced.
- **Storage approach 1:**
  - The workflow is stored as one record, with one record per step.
  - Completing a workflow still writes the `review` record, so the scheduling code is unchanged.
  - An in-progress review *is* an open Platform Review workflow. No `review` record exists until the workflow completes.

## Data

### New kinds

Both are added to `KINDS` in `src/core/data.js`. `workflow` is also added to `NUMBERED`, with the counter `nextWorkflowNumber`, and is displayed as `WF-<number>`.

**`workflow`**

| Field | Meaning |
|---|---|
| `number` | The WF number. |
| `type` | `'platformReview'`. Later parts add their own types. |
| `platformId` | The platform the workflow is about (its subject). |
| `ownerId` | A profile id. |
| `state` | `'open'`, `'completed'` or `'cancelled'`. |
| `at` | `{ hazardId: string \| null }`, the resume position. `null` means the Summary. |
| `outcome`, `notes` | Text, as on today's review. |
| `endedBy`, `endedAt` | Who completed or cancelled it, and when. `null` while it is open. |

**`workflowStep`**

| Field | Meaning |
|---|---|
| `id` | `ids.workflowStep(workflowId, hazardId, check)`. |
| `workflowId` | The workflow it belongs to. |
| `hazardId` | The hazard being checked. |
| `check` | One of `safetyReports`, `references`, `controls`, `residualRatings`, `residualJustifications`, `sfarp`. |
| `checked` | Boolean. |
| `note` | String. |

A step record only exists once it has been touched. A missing step counts as unticked with no note.

### Changed kinds

- `review` gains `workflowId`, which is `null` on reviews completed before workflows existed.
- `reviewRow` is removed from `KINDS`. Its ops (`markRow`, `completeReview`, `abandonReview`) are removed too.

### Schema

- `SCHEMA_VERSION` goes from 4 to 5.
- A throwaway conversion script in `scripts/` (with a test, following the convert-to-v4 script) takes schema-4 data and:
  - drops every open review and every `reviewRow`
  - keeps completed reviews, setting `workflowId: null`
  - reseals `data.json` and `profiles.json` at schema 5.
- Past reviews completed before workflows show "Recorded before workflows" in place of the check grid. Their outcome and notes are still shown.

### History tracing

- `Act` gains an optional `workflowId`.
- `history.recordChange` writes `workflow: act.workflowId` onto the change entry when the act carries one.
- The controller sets `workflowId` on any edit dispatched while the view is a `workflow` page owned by the current profile.
- The query `workflowChanges(data, workflowId)` returns those entries, oldest first, leaving out deleted history entries.

## Core

### Ops: `src/core/ops/workflows.js`

All are pure `(data, act, args) → data` ops ending in `commit`, and all are registered in the controller's `EDITS`.

| Op | What it does |
|---|---|
| `startWorkflow({ type:'platformReview', platformId })` | Creates an open workflow owned by `act.by`, positioned on the first hazard. Refused if the platform is not live or already has an open Platform Review. |
| `setWorkflowPosition({ workflowId, hazardId \| null })` | Moves the resume position. |
| `setStep({ workflowId, hazardId, check, checked?, note? })` | Creates or updates a step. |
| `setWorkflowOutcome`, `setWorkflowNotes` | Set the text. |
| `takeOverWorkflow({ workflowId })` | Sets `ownerId` to `act.by`. Anyone may do it while the workflow is open. |
| `cancelWorkflow({ workflowId })` | Sets the state to cancelled and fills `endedBy`/`endedAt`. Steps are kept. |
| `completeWorkflow({ workflowId })` | Writes a completed `review` linked by `workflowId` and marks the workflow completed. |

Every op except `startWorkflow` and `takeOverWorkflow` is refused unless `act.by` is the owner. Every op except `startWorkflow` is refused unless the workflow is open.

`completeWorkflow` details:

- It is refused while any check on any hazard currently linked to the platform is unticked.
- It is refused when the platform has no review schedule.
- When it succeeds it writes the completed `review` exactly as `completeReview` does today: `dueBefore`/`dueAfter`, `completedBy`/`completedAt`, `platform.reviewStart` and `reviewSeen`.

A hazard added to the platform mid-review appears in the rail at 0/6. A hazard unlinked mid-review drops out, and its steps are ignored.

### Queries: `src/core/queries.js`

- `openWorkflows(data, ownerId | null)`
- `endedWorkflows(data, { from?, to?, ownerId? })`: completed and cancelled workflows, newest first.
- `workflowHazards(data, wf)`: the hazards currently linked to the platform, in report order.
- `workflowProgress(data, wf)`: `{ perHazard: Map<hazardId, number>, done, total }`.
- `workflowChanges(data, workflowId)`
- `openReview(data, platformId)` now returns the open platformReview workflow. `openItems().reviews` reads it.

## UI

### Navigation

- `NAV` gets `['workflows', 'Workflows']` between Platforms and Reviews.
- The views are `workflows` (with `view.tab` set to `dashboard` or `history`) and `workflow` (with `id` set to the workflow id).
- `SECTION` maps both views to `workflows`. `PAGE_WORD` gets "Workflows" and "Workflow".

### Dashboard: `src/ui/screens/workflows.js`

- **Owner filter** in the head. It defaults to Everyone, offers each profile, and is remembered per browser (folder and profile), like the Reviews prefs.
- **In progress:** a `dataTable` with the columns WF no. · Workflow · Subject · Owner · Progress (bar plus done/total) · Started · Last activity · Resume →. Double-clicking a row opens the workflow.
- **Start a workflow:** a grid of cards.
  - **Platform Review** has a platform picker listing live platforms, with due and overdue platforms first and tagged.
    - A platform with an open review shows "WF-n in progress" and opens that workflow.
    - Any other platform shows Start, which runs `startWorkflow` and opens the new workflow.
  - **Coming soon:** Platform Onboarding, New Tech Data, Transfer Platform Owner and Reference Update are greyed cards with one line each.
- **Recently completed:** completed and cancelled workflows within a chosen range (7 days, 30 days, 90 days or 1 year), remembered per browser, plus a link "All history →".

### History sub-tab

A `dataTable` of every completed and cancelled workflow:

- **Columns:** WF no. · Workflow · Subject · Status (Completed or Cancelled tag) · Owner · Ended by · Ended · Started.
- **Interaction:** the existing column filters and sorting. Clicking a row opens the workflow's read-only page.

### Workflow page

- **Head:** "Workflows · WF-n Platform Review · <platform>". It shows the owner, and **Take over…** (`confirmButton`) when the viewer is not the owner and the workflow is open.

**Open and owned by the viewer:**

- The rail lists the hazards with their done/6 counts and the current hazard marked, then Summary and complete.
- A hazard page shows six check cards, each embedding an existing editor scoped to this hazard and platform:

| Check | What the card shows |
|---|---|
| 1. Safety reports | `safetyReportsSection` |
| 2. References | The references linked to the hazard, its causal factors, consequences, phases and facets, and the controls on it, each with its revision and archived flag. Link and unlink are available. |
| 3. Controls | The platform controls section for the hazard. |
| 4. Residual risk ratings | The residual `riskPanels`, ratings only. |
| 5. Residual risk justifications | The residual likelihood and consequence "why" fields for each receptor. |
| 6. SFARP | The SFARP area. |

- Each card's footer has a note input and a **Checked** toggle.
- Previous hazard and Next hazard buttons sit at the bottom.
- Moving between hazards sets the position.
- **Summary and complete** shows:
  - a hazards × checks grid (a ✓ or a blank, with the note as the title)
  - Outcome and Additional notes
  - **Complete review**, which is disabled with "N checks not ticked" until every check is ticked, and also while the platform has no review schedule.
- **Cancel workflow…** (`confirmButton`) reads: "Cancel WF-n? Its ticks and notes are kept in History as cancelled; changes you made to hazards stay."

**Open and owned by someone else:** the same layout, read-only, with a banner "Owned by <name> · Take over…".

**Completed or cancelled:**

- read-only: the status, who ended it and when, the check grid, outcome and notes
- **Changes made through WF-n:** each entry's action, the records it touched (as links), who made it and when.

### History tabs

A change entry carrying `workflow` shows a **via WF-n** chip linking to the workflow page.

### Reviews tab

- `openReviewBlock` is removed. The platform's review page keeps the rule, the dates and Past reviews.
- **Start review** runs `startWorkflow` and navigates to the workflow. While a review is open, the card shows "WF-n in progress · Resume →".
- Past reviews gets a WF column linking to each review's workflow (blank for reviews completed before workflows).

### Home

- A new **Workflows in progress** panel follows the Home owner picker. It shows WF no., Workflow, Subject, a progress bar and Resume → for up to 5 rows, then "All workflows →".
- "Continue review →" on Needs attention and Open items opens the workflow.

## Errors and merging

Refusals are `PivotError`s, surfaced as other edit refusals are:

- the platform is retired
- a review is already open
- the viewer is not the owner ("WF-n is owned by <name>. Take over to work on it.")
- the workflow is no longer open
- checks are still unticked
- there is no review schedule.

Merging:

- The new kinds merge per record under the existing rules.
- A take-over and a tick made in separate saves both land, because the owner and the steps are separate records.
- If the same workflow is completed in two saves, the merge keeps a single completed review. The test covers this, and the merge rule is adjusted if it is needed.

## Testing

All tests use `node:test` and follow the existing layout. `npm run build` runs after every change.

- `test/core/ops/workflows.test.js`:
  - every op
  - the owner guard and the open-state guard
  - strict complete
  - hazards added or removed mid-review
  - the review written on complete, and the schedule moving on.
- `test/core/workflows-queries.test.js`: open and ended workflows, the owner filter, progress, and `workflowChanges`.
- History tests: the `workflow` field is written only when `act.workflowId` is set.
- Rewritten for workflow-backed open reviews: the reviews data and merge tests, `open-items`, `dashboard`. The `markRow` and `abandonReview` tests are deleted.
- `test/ui/screens-workflows.test.js`:
  - the dashboard: filter, Coming soon cards, recently completed range
  - History
  - the workflow page in its three modes
  - the Cancel and Take over confirms.
- `screens-home` and the reviews screen tests: the Home panel, Resume, the WF column in Past reviews.
- `controller-workflows.test.js`:
  - Start review opens the workflow
  - edits on the workflow page carry `workflowId`, and others do not
  - a workflow survives save and reload.
- A test for the schema 4 → 5 conversion script.

## Out of scope for this part

- Workflows A, C, D and E: shown only as Coming soon cards.
- Assigning a workflow to someone other than its owner, except by Take over.
- Undoing a cancelled workflow's edits.
