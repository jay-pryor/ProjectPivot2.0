# Workflows, part 2: Platform Onboarding

Date: 2026-10-09
Status: approved design, awaiting spec review
Builds on: `2026-10-08-workflows-platform-review-design.md`, which defines the workflow framework (WF-n, owner, Take over, Cancel, "via WF-n" tracing, rail layout).

## Purpose

Every new platform is set up through a guided, saved and owned workflow. Onboarding makes sure the platform has the essentials before it counts as a normal platform:

- a description
- its groups
- its hazards
- for each hazard: its facets and its implemented controls, with their properties set.

Suggestions come from what has already been assigned to platform groups on the Info page.

## Decisions

- **The platform exists from step 1.** All later steps edit it in place, as Platform Review does, and every edit is stamped "via WF-n".
- **The platform is marked Onboarding** until its onboarding workflow completes. While marked:
  - it shows an "Onboarding · WF-n" tag
  - it is left out of Open items (and so the attention dot and Home tiles), Coming up and the Reviews timeline
  - it can still be opened and edited.
- **Cancel keeps the platform marked Onboarding.** Its page then offers **Onboard again**. Deleting the platform works as today.
- **The Platforms tab's New platform always starts an onboarding.** There is no other way to make a platform. Platforms that existed before onboarding are normal and never get Onboard again.
- **Suggestions use shared groups:** the groups the hazard and the platform have in common, plus All platforms. Hazard suggestions use the platform's groups plus All platforms.
- **Facets requirement:** each of the four per-platform facets has at least one entry or an explicit "None applies" tick.
- **Implemented controls requirement:** at least one Implemented control here, each with tier, origin, description and implemented-by (on this platform) set, or an explicit "No controls implemented" tick.
  - Kind and prevents/mitigates are editable but not required.
  - Tier, origin and description belong to the control, so filling them in sets them everywhere the control is used.
- **Optional:** other controls (Recommended / Planned / Rejected), initial and residual risk ratings, initial and residual justifications, and SFARP.
- **Progress is worked out from the data,** not ticked. The only ticks are the "none" ticks.
- **Complete is strict.** It is refused while any requirement is unmet. Completing removes the Onboarding mark.

## Data

- **Platform `description`:** a new string field, set by `updatePlatform({ id, name?, description? })`. A missing field reads as `''`, so no schema bump is needed.
- **Workflow type `'platformOnboarding'`:** it reuses `workflow` and `workflowStep` from part 1.
  - The "none" ticks are `workflowStep` records with these checks: `none:failureMode`, `none:systemElement`, `none:affectedGroup`, `none:causalFactor`, `none:controls`. Their `checked` field holds the tick.
  - `workflow.at.hazardId` keeps the resume position. The platform steps use the reserved positions `'@details'`, `'@groups'` and `'@hazards'`, and `null` means the summary.
- **Onboarding status is worked out, not stored.** `onboardingOf(data, platformId)` returns the platform's most recently created live `platformOnboarding` workflow if its state is not `completed`, and otherwise `null`. A platform is Onboarding when this is not null.

## Core

### Ops (`src/core/ops/workflows.js`)

| Op | Behaviour |
|---|---|
| `startOnboarding({ id?, platformId?, name, ownerId })` | Creates the platform (`createPlatform`) and an open `platformOnboarding` workflow owned by `act.by`, positioned on `'@details'`, in one commit. |
| `startWorkflow({ type: 'platformOnboarding', platformId })` | This is Onboard again. Refused unless the platform is live, is Onboarding, and has no open onboarding. |
| `startWorkflow({ type: 'platformReview', … })` | Now also refused while the platform is Onboarding: "Finish onboarding <name> first." |
| `setWorkflowPosition` | Also accepts the three `'@…'` positions for onboarding. |
| `setStep` | Accepts onboarding's "none" checks. For `none:*` the hazard must be on the platform. |
| `completeWorkflow` | Type-aware. Onboarding is refused while `onboardingProgress(...).unmet` is non-empty, with the message "N things are still needed." On success the workflow is marked completed and records `covered`. No review record is written. |

`cancelWorkflow`, `takeOverWorkflow` and the owner and open-state guards are unchanged from part 1.

### Queries (`src/core/workflows.js`)

**`onboardingProgress(data, wf)`** returns:

```
{
  details: boolean,    // name and description are not blank
  groups: boolean,     // at least one group
  hazards: boolean,    // at least one hazard
  perHazard: Map<hazardId, {
    facets: Record<'failureMode'|'systemElement'|'affectedGroup'|'causalFactor', boolean>,
    implemented: boolean,
    optional: Record<'otherControls'|'ratings'|'justifications'|'sfarp', boolean>,
    required: number,  // 0–2: facets complete, implemented complete
  }>,
  unmet: { hazardId: string | null, what: string }[],
}
```

The causal factors that count are those on this platform, including ones that apply to every platform (`causalFactorsOn`).

**`sharedGroups(data, platformId, hazardId)`** returns the ids of the groups the platform is in and the hazard is assigned to, plus `'all'` when the hazard is assigned to All platforms.

**`groupSuggestions(data, { kind, platformId, hazardId? })`**, where `kind` is `'hazard'`, a facet, or `'control'`:

| Kind | Suggests | Excludes |
|---|---|---|
| `'hazard'` | Live hazards assigned to any of the platform's groups or to All platforms | Hazards already on the platform |
| Facet (`failureMode` / `systemElement` / `affectedGroup` / `causalFactor`) | Facet options assigned to `sharedGroups` | Options whose text (ignoring case) is already on this platform-hazard |
| `'control'` | Live controls assigned to `sharedGroups` | Controls already on this platform-hazard |

Each suggestion carries the names of the groups it came from.

### Leaving Onboarding platforms out

These leave out platforms for which `onboardingOf` is not null:

- `openItems` (and so the attention dot and Home tiles)
- `upcomingReviews`
- the timeline rows.

`platformCards` and the platform lists keep them, with a tag.

## UI

### Starting an onboarding

- **Platforms tab:** New platform (name and owner) dispatches `startOnboarding` and opens the workflow.
- **Workflows dashboard:** the Platform Onboarding card loses "Coming soon" and gets the same name and owner form.

### Workflow page

`screens/workflow.js` keeps the shared head and the ended view, and sends onboarding to the new `screens/onboarding.js`.

**Rail:**

```
Platform:   Details ✓ · Groups ✓ · Hazards ✓
Hazards:    each with n/2 required, ✓ when both are met
Summary & complete
```

**Details step:**
- name and description (each saved when you leave the field)
- owner select
- image: the existing upload (PNG/SVG), reused from the platform menu.

**Groups step:** the platform's group tags, with + opening the existing tag picker.

**Hazards step:**
- "Suggested from <groups>": checkboxes, then Add, which links each ticked hazard.
- The existing link-hazards picker for any other hazard.
- The hazards already linked.

**Hazard page cards:**

1. **Facets (required).** The four per-platform list cards. Each has a "Suggested from <groups>" checkbox block, accepted like today's suggestions, and a "None applies" tick (`setStep none:<facet>`). The tick is disabled while the facet has entries. Consequences and lifecycle phases are shown read-only beneath.
2. **Implemented controls (required).**
   - "Suggested from <groups>" checkboxes add each ticked control to this platform-hazard (`addControlHere`) and set it Implemented (`setControlStatus`).
   - A table of the Implemented controls with inline tier, origin, description and implemented-by. Missing values are highlighted.
   - A "No controls implemented" tick, disabled while any control is Implemented.
3. **Other controls (optional):** the existing platform controls section, without the Implemented ones.
4. **Risk ratings (optional):** initial and residual risk panels, ratings only.
5. **Risk justifications (optional):** initial and residual, justifications only.
6. **SFARP (optional):** `sfarpArea`.

Each card shows ✓ (required and met), "Needed" (required and unmet) or "Filled" / "Empty" (optional).

**Summary:** a list of every unmet requirement as a link to its step or hazard, then Complete, which is disabled with "N still needed" until the list is empty.

**Ended view:** a requirements grid (hazards × Facets / Implemented ✓) in place of the six-check grid, plus "Changes made through WF-n".

### Elsewhere

- **Onboarding tag:** "Onboarding · WF-n" on the platform page head, in the platform lists and on Home platform cards.
- **Onboard again:** shown in the platform page head while the platform is Onboarding with no open onboarding.
- **Review start:** while the platform is Onboarding, the Reviews tab's Start review is replaced by "Finish onboarding first", with a link to the workflow.

## Errors

These are `PivotError`s:

- Complete with unmet requirements.
- Onboard again for a platform that is not Onboarding, or that already has an open onboarding.
- A Platform Review on an Onboarding platform.
- A "none" tick for a hazard not on the platform.

The existing guards apply to everything else.

## Testing

**Core:**
- `startOnboarding` creates both records in one entry.
- `onboardingOf`: open, cancelled, completed, and none at all.
- `onboardingProgress`: each requirement met and unmet, including the none-ticks and the four control properties.
- Strict Complete.
- Suggestions from shared groups (shared group and All platforms included; a group only the hazard has and a group only the platform has excluded; items already present excluded).
- Leaving Onboarding platforms out of `openItems` and `upcomingReviews`.
- Platform Review refused while Onboarding.
- Onboard again rules.
- Merge: two people editing the same onboarding.

**Screens:**
- The rail in each state.
- The details, groups and hazards steps.
- Each card in its required, met and optional states.
- Suggestions labelled with group names.
- The summary's unmet list.
- The Onboarding tag and Onboard again.

**Controller:** New platform opens the onboarding; save and resume.

**Browser:** a walkthrough after the build.

## Out of scope

- Onboarding platforms that existed before this part.
- Assigning things to groups from inside the workflow (that is done on the Info page).
- Workflows C, D and E.
