# Tutorial

Date: 2026-10-12
Status: approved design, awaiting spec review
Builds on: the Help page (Getting started, the first-visit landing).

## Purpose

A video-game-style tour of PIVOT. It moves through the tabs and highlights each part with a dimmed overlay and a text bubble, and asks the person to try a few things themselves. It runs on a built-in sample register, so every step has something to show and nothing real is touched.

## Decisions

- **Sample data.** Starting the tutorial sets the real session aside in memory and loads a sample register. Leaving puts the real session back exactly as it was, including unsaved edits.
- **Mostly Next, with a few "now you try" steps.** A try step moves on by itself once its action happens. Next always skips ahead.
- **Where it is offered:**
  - a **Start the tutorial** button at the top of Help → Getting started;
  - on a new profile's first visit, an invitation card at the top of Getting started, with **Start** and **Not now**.
  - It never starts on its own.

## Tutorial mode

### State

`state.tour` is `null`, or:

```
{ step: number, real: { session, profiles }, invite?: false }
```

- `real` holds the set-aside session (`base`, `working`, `loadedStamp`) and the real profile list.
- While `state.tour` is set:
  - `state.session` is the sample session.
  - `state.profiles` is the real list plus "Sam (sample)".

### Starting: `startTour`

1. Keep `{ session, profiles }` in `state.tour.real`.
2. Set `state.session` to `{ base: sample, working: sample, loadedStamp: null }`. `sample` comes from `sampleRegister(profileId, today)`.
3. Add the sample profile to `state.profiles`.
4. Go to step 0.

### Leaving: `endTour`

Leave tutorial, Esc, Skip and Finish all end the tutorial the same way:
1. Put back `session` and `profiles` from `state.tour.real`.
2. Clear `state.tour`, close any picker, edit or dialog, and go to Help → Getting started.

### Guarded while the tutorial runs

These handlers refuse with the PivotError `tour.off` and the message "That is switched off in the tutorial." (for Save: "Saving is off in the tutorial: nothing here is kept."):

- `save`
- `changeFolder`, `chooseFolder`, `recallFolder`
- `restoreBackup` and restore from file
- every handler that calls `storeFile`: the reference file upload, attach, `uploadTechFile`, `uploadUpdateFile`, and the platform image
- `produceReport`
- `selectProfile`

Other effects are held back rather than refused:

- **`afterChange`:** does not write the mirror (the browser's unsaved-work copy) while `state.tour` is set.
- **`savePrefs`:** applies a change to `state.profiles` in memory but does not write `profiles.json`. Theme, favourites and column widths therefore work in the tutorial and are dropped when it ends.

### The sample register: `src/ui/tour/sample.js`

`sampleRegister(profileId, today)` builds the data with the core ops, the same way the test fixtures are built. Records are dated relative to `today`, and the result is passed through `assignNumbers`. It contains:

**Platforms**
- **Harbour Patrol Boat** (P-001): owned by the person taking the tutorial, on a review policy, review due soon.
- **Training Range** (P-002): owned by Sam (`sample-sam`), on a fixed schedule, review overdue.
- One platform group, "Maritime".

**Hazards**
- Four hazards across the two platforms, with causal factors, consequences and facets.
- Initial and residual ratings with justifications.
- One hazard on P-001 is missing a residual justification, so Home has a gap to show.

**Controls**
- Controls with statuses Implemented, Planned (implemented by HighCom) and Recommended (one awaiting a decision on P-001).

**Other records**
- One reference linked to a hazard, and one safety report.
- **A change by Sam** to a hazard on P-001 (an edit acted as `sample-sam`, after acknowledgements start), waiting for acknowledgement.
- **A Platform Review** on P-001, open and owned by the person, with some checks ticked.
- **A saved bow-tie view** of a P-001 hazard, owned by the person.

The register passes `checkRules`.

## The engine

### Steps: `src/ui/tour/steps.js`

```
{ id, view: { name, id?, tab?, hazardId? }, target?: string (CSS selector),
  title, text, try?: { action: string | string[], says: string } }
```

- `view` may be a function of the sample data, for records found by name.
- With no `target`, or a target missing from the page, the bubble shows centred.

### Moving

| Action | What it does |
|---|---|
| `tourNext` / `tourBack` | Set the step, then `go` to its view. |
| `tourSkip` | Same as `endTour`. |
| `tourTo({ step })` | Used by "Back to the tutorial". |

**After each dispatched action** (in `dispatch`, once the handler or edit has finished):
- If the current step has `try` and the action type is in `try.action`, advance to the next step.
- The tour's own actions, and `go`, never count as a try.

**Wandering off:** when the shown view is not the current step's view, the bubble collapses to a corner card, "Back to the tutorial (step n)", which calls `tourTo`.

### Overlay: `src/ui/screens/tour.js`

The overlay is drawn by `shell` after the main view, while `state.tour` is set.

- **Banner:** under the top bar, "Tutorial: sample data. Nothing here is saved." with **Leave tutorial**.
- **Bubble:** shows "Step n of N", the title and the text. A try step adds "✋ Your turn:" and its `says`.
  - Buttons: **Back** (hidden on step 1), **Next** (**Finish** on the last step), **Skip tutorial**.
  - The bubble carries `data-tour-target="<selector>"`.
- **Positioning** (`mount.js`, after each render):
  - Find the target and scroll it into view (`block: 'center'`).
  - Size a spotlight element to the target's rectangle. A large box-shadow on it dims everything else, and the target stays clickable because the spotlight has `pointer-events: none`.
  - Place the bubble below the target if it fits, otherwise above, then right, then left, kept within the viewport.
  - With no target found, centre the bubble and dim the whole page.
  - Reposition on resize and scroll.
  - A try step's target gets the class `tour-pulse`.
- **Keys:** → and Enter for Next, ← for Back, Esc to leave. These are ignored while typing in an input or textarea.

## The steps

There are 22 steps. ✋ marks a try step, with the actions that complete it.

| # | Chapter | Step |
|---|---|---|
| 1 | Getting around | Welcome (centred) |
| 2 | Getting around | Tabs (`.topbar nav`) |
| 3 | Getting around | Save button (`.topbar .save`) |
| 4 | Getting around | Help button (`.help-button`) |
| 5 | Home | Indicator tiles |
| 6 | Home | Needs attention |
| 7 | Home | ✋ Acknowledge Sam's change (`acknowledge`) |
| 8 | Home | Coming up and Workflows in progress |
| 9 | The register | Hazards list |
| 10 | The register | A hazard's Overview |
| 11 | The register | Its P-001 tab |
| 12 | The register | ✋ Set a residual likelihood (`setRating` / `setAssessment`, whichever the panel dispatches) |
| 13 | The register | The review date moved (centred, or the moved-date dialog if shown) |
| 14 | The register | Controls on that tab |
| 15 | The register | The Platforms list, then P-001's page |
| 16 | Doing the work | Workflows tab |
| 17 | Doing the work | The open Platform Review, a hazard page |
| 18 | Doing the work | ✋ Tick a check (`setStep`) |
| 19 | Doing the work | Reviews tab |
| 20 | The rest | Bow-ties, with the saved view |
| 21 | The rest | Info, Reports and References (the three tabs) |
| 22 | The rest | Finish (centred) |

Each step's text is one or two short sentences, in the same voice as Help.

## Getting started

`helpView` adds, for the Getting started topic only:

- The **Start the tutorial** button (`startTour`), above the topic's text.
- An **invitation card** while the profile's `prefs.tutorialOffered === false`, with **Start** and **Not now**.
  - New profiles are created with `tutorialOffered: false`. Profiles made earlier lack the field and are never invited.
  - **Start** and **Not now** both write `tutorialOffered: true`. Not now does it through `dismissTourInvite`.

## Errors

PivotError `tour.off` for the guarded actions. Nothing else is new.

## Testing

**Controller**
- Starting keeps the real session, including unsaved edits. Leaving by each route restores it exactly.
- The profile list goes back to the real one.
- Every guarded action is refused with `tour.off`, and no folder file is written. A fake folder is checked for no writes.
- The mirror is not written while the tutorial runs. `savePrefs` changes nothing on disk.
- Next and Back go to each step's view. A try step advances on its action and not on others. Next skips a try step.
- The invitation shows while `tutorialOffered` is false. Start and Not now both clear it, and it is never shown for older profiles.

**Sample and steps**
- `sampleRegister` passes `checkRules` and has what the steps rely on:
  - Sam's waiting change
  - P-001 due soon and P-002 overdue
  - the open review
  - the bow-tie view
  - a hazard on P-001 with a residual justification missing.
- For every step: render its view with the sample, and assert its `target` selector matches an element (a DOM-free check of the rendered HTML, via a small selector matcher for the `#id`, `.class`, `[attr]` and `tag` forms used).

**Screens**
- The banner, the bubble (count, buttons, Finish, a try step's line), the corner card when the view differs from the step's, and the Getting started button and invitation.

**Browser**
- The whole tour by Next, and with the tries.
- Bubble placement at wide and narrow widths.
- Unsaved real edits survive a tutorial run.

## Out of scope

- Tutorials for single pages started from Help topics.
- Remembering how far someone got through the tutorial between sessions.
