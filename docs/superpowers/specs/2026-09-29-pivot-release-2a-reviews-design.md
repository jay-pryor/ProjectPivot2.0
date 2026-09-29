# Pivot release 2a: platform reviews

Date: 2026-09-29. Status: draft for jay-pryor's review.

## 1. Where this fits

The rebuild design (`2026-09-28-pivot-rebuild-design.md`, section 3) puts reviews, acknowledgements,
workflows, the dashboard, the reference register and the out-of-date report warning in release 2.
That is three independent pieces, built and released in order, each usable on its own:

- **2a Reviews** (this spec): review schedules on platforms, due and overdue flags, a review
  checklist per platform, and the out-of-date warning before a report.
- **2b Teamwork**: acknowledgement of changes that reach other owners' platforms, the per-user
  dashboard and open-items view, and the guided workflows of the rebuild design's section 3.1.
- **2c References**: the reference register.

2b's dashboard will list overdue platforms through the query this spec adds (`reviewDueList`). The
rebuild design's "review a platform's data" workflow is replaced by the review checklist here; 2b does
not build it again.

The archive (`archive/hyperion/`, review-schedule and workflows) is guidance. This spec keeps its
date rules (a stored due date, completion moving on from the old due date, month-end clamping, overdue
from the day after) and drops its schedules on hazards, controls and references, its per-record
tempo gate, and its forward-only wizard.

## 2. What is reviewed

**A platform** is the only thing with a review schedule. Reviewing a platform means going through each
of its hazards (their ratings and control states) and ticking each one as reviewed, with an optional
note. A hazard's "last reviewed" date on a platform is read from the reviews of that platform; hazards
and controls carry no schedule of their own.

## 3. Data

### 3.1 Platform fields

| Field | Value | Default |
|---|---|---|
| `reviewMonths` | a whole number of months, 1 or more, or null | null |
| `reviewDue` | an AEST calendar date `YYYY-MM-DD`, or null | null |

Both are set together by `setSchedule`, which requires both or clears both. There is no default period.
A platform with no schedule is never due or overdue. Older data files are brought up to date on load
(`normalizeData`) with both fields null. The schema version does not change: the new fields and kinds
are additions that `normalizeData` fills in.

### 3.2 New record kinds

| Kind | Fields beyond the header | Id |
|---|---|---|
| review | `platformId`, `state` (`open` or `completed`), `outcome`, `dueBefore`, `dueAfter`, `completedBy`, `completedAt` | uuid |
| reviewRow | `reviewId`, `hazardId`, `reviewed` (boolean), `note` | `rr:<review>:<hazard>` |

A review's record `status` (live, retired, deleted) is separate from its `state` field (open,
completed). Abandoning a review sets the record to `deleted`. `dueBefore`, `dueAfter`, `completedBy`
and `completedAt` are null until completion.

A reviewRow exists only once someone has ticked or noted that hazard; a hazard with no row is
"not reviewed" with no note. Row ids are built from the review and hazard, so two users working on the
same review write different records for different hazards, and the same record for the same hazard.

### 3.3 Dates

`core/time.js` gains:

- `addMonths(date, n)`: calendar months on a `YYYY-MM-DD` date. A day the target month lacks becomes
  its last day, and the day does not come back: 31 Jan + 1 = 28 Feb (29 in a leap year),
  28 Feb + 1 = 28 Mar, 29 Feb 2028 + 12 = 28 Feb 2029. Ported from the archive's review-schedule.
- `reviewState(platform, today)`: `none` with no schedule; `overdue` when `today` is after
  `reviewDue`; `dueSoon` when `reviewDue` is within 30 days of `today` (inclusive); otherwise `ok`.
  Dates compare as AEST calendar dates. "Today" comes from the clock the UI already injects.

## 4. Operations

A new file, `core/ops/reviews.js`. Each op is `(data, act, args) -> data` and appends one history
entry, like every other op.

- `setSchedule({ platformId, months, due })`: sets both fields, or clears both when `months` and
  `due` are null. `months` is a whole number from 1 to 120; `due` a valid date.
- `startReview({ id?, platformId })`: creates an open review. Refused if the platform is not live, or
  already has an open review ("Alpha already has a review in progress").
- `markRow({ reviewId, hazardId, reviewed?, note? })`: creates or updates the row. Refused unless the
  review is open and the hazard is live on the review's platform.
- `setOutcome({ reviewId, outcome })`: open reviews only.
- `completeReview({ reviewId })`: refused if the platform has no schedule ("Set a review schedule
  first"). Sets `dueBefore` = the platform's `reviewDue`, `dueAfter` = `addMonths(dueBefore,
  k × reviewMonths)` for the smallest k ≥ 1 that puts it after the completion date,
  `completedBy`/`completedAt` from the act, `state: 'completed'`, and the platform's `reviewDue` =
  `dueAfter`, in one entry. The due date moves on from the old due date, in whole periods, not from
  today: a late review does not pull the schedule forward and an early one does not push it out, and
  a review completed more than a period late does not leave the platform still overdue.
- `abandonReview({ reviewId })`: sets the open review and its rows to `deleted`.

The history entry's `platforms` is the review's platform for all of these.

## 5. Rules

Added to `rules.js`, checked by the ops and after a merge:

7. A live reviewRow belongs to a live review on a live platform, for a hazard live on that platform
   when the row was last changed. (A hazard unlinked later keeps its row; the row is shown as "no
   longer on this platform" in an open review and as recorded in a completed one.)
8. A platform has at most one live open review.
9. A completed review, and its rows, are never changed again. Ops refuse; after a merge, a row
   changed after its review was completed is a conflict that keeps the completed version, and a
   row of a live review is deleted only with its review.
10. Retiring or deleting a platform abandons its open review in the same entry.

## 6. Merge

The existing three-way merge handles the new kinds by record id. Two cases need care:

- **Both users completed the same review.** The review record conflicts; mine wins, as everywhere.
  The platform's `reviewDue` is then set from the winning review's `dueAfter`, so the due date moves
  on once, not twice.
- **Both users started a review on the same platform.** Rule 8 breaks. Mine wins: their open review
  and its rows are kept as `deleted` (nothing is removed), and the override entry names it, so they
  are told on their next open as with any conflict.

## 7. Queries

In `queries.js`:

- `openReview(data, platformId)`: the live open review, or null.
- `reviewRows(data, reviewId)`: for an open review, each hazard now live on the platform (in the
  platform's order) joined with its row, if any, plus rows for hazards since unlinked; for a
  completed review, exactly its rows and the hazards it listed at completion. Each item carries the
  hazard, its report ID, `reviewed` and `note`; in an open review, also both current ratings with bands
  and control-state counts (`confirmed`, `excluded`, `awaiting`). A completed review's items carry no
  ratings, because the review does not record what they were when it was completed.
- `completedReviews(data, platformId)`: newest first.
- `lastReviewed(data, platformId)`: the latest `completedAt` date, or null.
- `hazardLastReviewed(data, hazardId, platformId)`: the latest completed review of that platform in
  which the hazard was ticked, or null.
- `reviewDueList(data, today)`: every live platform with a schedule and its `reviewState`, overdue
  first. Used for the flags now and 2b's dashboard later.

A completed review stores which hazards it listed: `completeReview` writes a row, with
`reviewed: false`, for every listed hazard that has none, so the completed review is self-contained and
"not reviewed" hazards are recorded, not inferred.

## 8. Screens

The record pages keep their current style: document-like, tables in card blocks, edited in place.

### 8.1 Platforms list

A **Next review** column: the due date with a badge, amber *Due soon* or red *Overdue*, or "—" with no
schedule. It sorts by date and filters by Any, Overdue, Due soon, No schedule.

### 8.2 Platform page, Details tab

Under the owner line, a review line:

- With a schedule: *Every 6 months · next due 12 Aug 2026 [Overdue] · last reviewed 12 Feb 2026*. The
  period and due date are changed in place (a number input and a date input), applied on leaving the
  field like other edits.
- Without: *No review schedule*, with a **Set schedule** link that shows both inputs.
- A **Start review** button, or **Continue review** when one is open, which opens the Reviews tab.

### 8.3 Platform page, Reviews tab

The tabs become Details, Reviews, History.

**An open review**, if any, at the top: a table in the card style with one row per hazard:

| Column | Content |
|---|---|
| ID | the report ID |
| Hazard | the title, linking to the hazard |
| Initial / Residual | the bands |
| Controls | e.g. *3 confirmed · 1 excluded · 1 awaiting* |
| Reviewed | a tickbox |
| Note | text, changed by double-click |

Rows sort and filter like every table (e.g. Reviewed: No). Ratings and control states are read-only
here; they are changed in the Details tab and the review shows the current values. Below the table: an
**Outcome** text box, **Complete review**, and **Abandon…** behind the usual two-click confirm. While
hazards are unticked the button reads *Complete — 2 not ticked*; it still completes in one click.

Without an open review, the tab shows **Start review** (or, with no schedule, a note that completing a
review needs a schedule, and the Set schedule link).

**Past reviews** below: a table of completed reviews (completed date, by, due date cleared, outcome,
ticked and not-ticked counts). Choosing one shows it read-only in the same layout, with a back link.

### 8.4 Hazard page

The Platforms table gains **Last reviewed**, from `hazardLastReviewed`.

### 8.5 History

Setting a schedule, starting, completing and abandoning a review appear in the platform's History tab
(they are entries whose `platforms` names it). Row ticks, notes and outcome edits are entries too, but
the platform's History tab hides actions of the review-row and outcome kind to keep it readable; they
remain in the data and in the review itself.

## 9. Reports

- The snapshot gains `review: { state, due, months, lastReviewed }`, taken at production, so a report
  records whether its platform was overdue then, whatever happens later.
- On the Reports screen, the Produce form's platform choice updates a line beside it. Overdue: *Alpha
  was due for review on 12 Aug 2026 (last reviewed 12 Feb 2026). You can still produce the report; it
  will be marked as produced while overdue.* Due soon: a quieter note with the date. Otherwise nothing.
  Producing is never blocked.
- The produced-reports list shows an **Overdue** badge on reports produced while overdue.
- DocGen and the generated document do not change in 2a. Printing the review state in the document
  can be added later from the stored snapshot without migrating anything.

## 10. Tests

`node:test`, in the existing layout:

- `addMonths` clamping: 31 Jan, 29 Feb in leap and common years, the day not coming back, year
  rollover, 12 and 120 months. `reviewState` on the due date, the day after, and the 30-day edge.
- Ops: the one-open-review rule; `completeReview` from the old due date, both late and early; refusal
  without a schedule; a completed review frozen; abandon; retiring a platform abandoning its review;
  `markRow` refused for a hazard not on the platform; a hazard linked during a review appearing in it;
  "not reviewed" rows written at completion.
- Merge: different rows ticked by two users both survive; both completing moves the due date once; two
  started reviews resolve to mine with an override; the randomised merge test gains the review ops and
  checks rules 7 to 10.
- Queries, the snapshot's review block, and screen HTML, as in the existing `screens-*.test.js`.
- A Playwright pass over the built `pivot.html` during development.

## 11. Not in 2a

The dashboard, open items, acknowledgements and workflows (2b); references (2c); review schedules on
hazards, controls or references; reminders or notifications; a due-soon window other than 30 days.
