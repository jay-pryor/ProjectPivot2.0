# Pivot release 2b: acknowledgements and the Home page

Date: 2026-09-29. Status: draft for jay-pryor's review.

## 1. Where this fits

Release 2 is built in pieces (see `2026-09-29-pivot-release-2a-reviews-design.md`, section 1). 2a gave
platforms review schedules. This piece, 2b, adds:

- **acknowledgements**: a platform's owner sees and acknowledges changes other people made that reach
  their platform;
- **the Home page**: one page of open items (changes to acknowledge, reviews, controls awaiting a
  decision, unrated hazards) for a chosen owner, opened first.

Guided workflows (the rebuild design's section 3.1) are **not** in 2b. The screens now link hazards,
change owners and rule on controls in a click or two; a workflow is added only when a job proves to
need guiding. The reference register remains a later piece.

The archive (`archive/hyperion/`, change-log and views) is guidance: this keeps its "the waiting list
belongs to the platform" and "nothing is blocked" and drops its confirmation screen before a shared
edit and its per-act acknowledgement of retired platforms.

## 2. What waits for acknowledgement

Every change entry already carries `platforms`, the platforms the action reached (rebuild design,
section 5.4). A change entry `e` is **waiting on platform P** when all of these hold:

1. `e.type === 'change'` and `e.platforms` includes P;
2. `e.at` is at or after the acknowledgement start (section 3.2);
3. `e.by` is not P's owner **at the time of the change** (section 2.1);
4. `e.action` is not a review-row action (`REVIEW_DETAIL_ACTIONS`: ticks, notes, outcome edits) and not
   `Produce report`;
5. no ack entry exists for (`e.id`, P);
6. P is live.

A change reaching three platforms is acknowledged three times, once per platform, by whoever deals
with each. Nothing is blocked while changes wait; a change never stops waiting with time.

### 2.1 The owner at the time

A platform's owner at time `t` is the `ownerId` it had then: read from the platform's history items
that changed `ownerId` (their `before` and `after`), falling back to the current `ownerId` when there
are none. When ownership moves, the new owner inherits whatever is still waiting on the platform; the
previous owner's own changes, made while it was theirs, do not start waiting.

## 3. Data

No record kinds, fields or schema version change. Two new history entry types, appended like
comments and `noticeSeen` entries, so they merge as a union and are never edited:

### 3.1 Ack

`{ id, type: 'ack', at, by, entryId, platformId }`: `by` acknowledged change `entryId` for
`platformId` at `at`.

### 3.2 Acknowledgement start

`{ id, type: 'acksStarted', at, by }`. The earliest such entry is the acknowledgement start; with none,
nothing waits. Older changes are treated as already seen.

So that opening Pivot does not by itself leave unsaved work, the controller appends `acksStarted`
together with the first edit of a session when the data has none, dated at the moment that session
opened the data. Two users doing so at once both write one; the merge keeps both and the earliest
counts.

## 4. Core

A new file, `src/core/acks.js`:

- `startAcks(data, act)`: appends an `acksStarted` entry unless one exists.
- `acknowledge(data, act, { entryId, platformId })`: appends an ack. Returns `data` unchanged when the
  change is already acknowledged for that platform, or when it is not waiting there (unknown entry,
  platform not reached). It is not a `change` entry: it does not itself wait, and does not show in
  any History tab.
- `ackStart(data)`: the acknowledgement start timestamp, or null.
- `ownerAt(data, platformId, at)`: section 2.1.
- `waitingChanges(data, platformId)`: the entries waiting on that platform, oldest first.

`src/core/queries.js` gains `openItems(data, today, ownerId)`: for every live platform owned by
`ownerId` (or every live platform when `ownerId` is null), the four Home sections:

- `acks`: `{ entry, platform }` for each waiting change, newest first;
- `reviews`: `{ platform, state, due, lastReviewed, open }` for each platform overdue, due soon, or
  with a review in progress (from 2a's `reviewDueList`, `openReview`, `lastReviewed`);
- `awaiting`: `{ platform, hazard, control }` for each control with no decision on a platform
  (from `platformHazards`);
- `unrated`: `{ platform, hazard, missing: 'initial' | 'residual' | 'both' }` for each hazard on a
  platform lacking a rating.

## 5. The Home page

- **Navigation.** A **Home** item first in the top bar, showing the count of changes waiting on the
  active profile's platforms when there are any: *Home (3)*. Pivot opens on Home after the profile is
  picked (and after recovery or notices).
- **Owner.** An *Owner* chooser at the top: *Me* (default), each profile by name, *Everyone*. It
  changes what is shown only, and is not saved.
- **Summary line.** e.g. *3 changes to acknowledge · 1 review overdue · 4 controls awaiting · 2
  hazards unrated*.
- **Sections**, each a card-style table (sort, filter, a Platform column), each row linking to
  where it is dealt with:
  1. **Changes to acknowledge**: when, who, platform, what (the action), the before → after detail
     (the History tab's rendering), and an **Acknowledge** button per row. **Acknowledge all shown**
     above the table acknowledges exactly the rows the table's filters leave showing.
  2. **Reviews**: platform, due date with its badge, last reviewed, and *In progress* when a review is
     open; linking to the platform's Reviews tab.
  3. **Controls awaiting a decision**: platform, hazard, control; linking to the platform page.
  4. **Hazards without ratings**: platform, hazard, which rating is missing; linking to the
     platform page.
- An empty section says so in one line (*Nothing to acknowledge.*).

**Platform page.** Under the review line, when changes are waiting there: *2 changes to
acknowledge*, linking to Home with the owner set to the platform's owner.

**Shared filtering.** `src/ui/screens/table.js` exports its filtering and sorting as `shownRows(state,
spec)`, used by `dataTable` itself and by the Acknowledge all button, so the button acts on what is on
screen.

## 6. Controller

- Actions: `acknowledge({ entryId, platformId })`; `acknowledgeAll({ keys })`, where `keys` is the
  shown rows' `entryId|platformId` pairs, acknowledged in one action; `setHomeOwner({ ownerId })`,
  quiet (`me`, a profile id, or `everyone`).
- `state.homeOwner` (default `me`), and the session's open time for `startAcks`.
- The first edit of a session calls `startAcks` first when the data has no start.
- After opening, the view is `home`.

## 7. Merge

No change to `merge.js`: ack and start entries are history, which merges as the union of both sides.
Two users acknowledging the same change for the same platform leave two ack entries; either one means
acknowledged.

## 8. Tests

`node:test`, in the existing layout:

- Waiting rules: own changes excluded; another's change waits; owner at the time across a transfer
  (the old owner's changes do not wait for the new owner, and what was waiting is inherited); before
  the start not waiting; review-row actions and report production excluded; a retired platform has
  nothing waiting; a change reaching two platforms waits on each; acknowledging one platform leaves
  the other waiting; acknowledging twice changes nothing.
- `openItems`: each section, and the owner filter (me, one profile, everyone).
- Merge: concurrent acks of the same change; two start entries, the earliest counts.
- Controller: the start is written with the first edit only; acknowledge; acknowledge all shown
  honours the filters; opening lands on Home.
- Screens: Home's sections and summary, the nav count, the platform-page line, markup in before/after
  values shown literally.
- A Playwright pass over the built `pivot.html` during development.

## 9. Not in 2b

Guided workflows; the reference register; notifications or email; acknowledging on behalf of a
platform from its own page (acknowledging happens on Home).
