# Review scheduling — design

Date: 2026-10-08

## Goal

Move review scheduling and the running of reviews out of each platform's Reviews sub-tab into a new
top-level **Reviews** tab. Let a platform's review period be fixed (months or years) or follow its
residual risk through a named **review policy**, show the schedule as a month-by-month timeline, and
tell the platform owner whenever a change of risk moves a review date.

"Review owner" throughout means the platform's existing owner (`ownerId`).

## 1. Scheduling model

### Rule

Each platform stores a review rule and a start date (replacing `reviewMonths` / `reviewDue`):

- `reviewRule`: `null` (no schedule), `{ kind: 'fixed', months }` or `{ kind: 'policy', policyId }`.
- `reviewStart`: an ISO date. Set by the user when the rule is first set (e.g. the date of the last
  review done outside Pivot; defaults to today). After each completed review it becomes the date
  that review was due.
- `reviewDueSeen`: the calculated due date the owner last acknowledged (see §3). Set when the rule
  is set, when the owner acknowledges a move, and when a review is completed.

Periods are entered as *N months* or *N years* and stored as whole months, from 1 to 120
(`MAX_REVIEW_MONTHS`).

### Review policy (new record kind `reviewPolicy`)

- `name` (unique among live policies, non-empty).
- `receptors`: for each of personnel, environment, capability: `{ considered: boolean, periods }`,
  where `periods` maps each band in `BANDS` (High, Serious, Medium, Low, Eliminated, Not Credible,
  Uncategorised) to a number of months or `null` (that band does not drive a review).
- `longest`: months; the period used when nothing gives a shorter one (required).

A policy that any live platform uses cannot be deleted; the attempt names the platforms.

### The period a platform gets

- Fixed: its months.
- Policy: for every live hazard on the platform and every *considered* receptor, look up the
  hazard's residual band for that receptor in the policy; the period is the shortest of those
  lookups and `longest`. Blank cells and unconsidered receptors contribute nothing, so a platform
  with no hazards (or only blank-cell bands) gets `longest`.
- The result carries its **driver**: the hazard, receptor and band that gave the shortest period
  (or "longest period" when none did), shown wherever the period is explained.

### The next due date (calculated, never stored)

`due = reviewStart + period`. If the platform has a completed review whose completion date is on or
after that date, step on by whole periods to the first date after that completion. Completing a
review sets `reviewStart` to the due date it answered (so a late review does not drift the
schedule) and `reviewDueSeen` to the new calculated due date. A review in progress does not change
the date.

Because the date is calculated, it is right after merges, policy edits, rule changes, hazards being
linked or unlinked, and rating or control changes that alter residual bands. Calculations are
memoised per `Data` object, as acks are.

`reviewState` (overdue / dueSoon / ok / none) is unchanged in meaning; `DUE_SOON_DAYS` stays 30.

### Existing data

Practice data only: bump `SCHEMA_VERSION` to 4 and convert the practice folder with a throwaway
script under `scripts/` (not shipped in the app): `reviewMonths`+`reviewDue` become
`reviewRule: { kind: 'fixed', months }`, `reviewStart = reviewDue − months`,
`reviewDueSeen = reviewDue`; platforms with neither get `reviewRule: null`. Completed review
records keep `dueBefore` / `dueAfter`.

## 2. Screens

### Top-level Reviews tab

Added to the nav between Platforms and Bow-ties. Sub-tabs (the existing `pageTabs` style):

1. **Schedule** (default): one row per live platform — owner, rule (Fixed 2 years / policy name /
   None), current period, driver, start date, next due, last reviewed, state (overdue, due soon,
   OK, in progress, none). Sorted by next due, overdue first, unscheduled last. Filters: owner
   (Me / everyone / a named owner, as on Home) and platform group. Selecting a row opens the
   platform's review page.
2. **Timeline**: the Gantt (§4).
3. **Policies**: list of policies; create, rename, edit, delete. Editing shows a band × receptor
   grid: each cell a number with a months/years picker or blank; a *Not considered* switch per
   receptor; a longest-period field. Shows which platforms use the policy.

### Platform review page (Reviews → a platform)

Everything the old platform Reviews sub-tab had, plus the new rule:

- **Rule** card: None / Fixed (N + months/years) / Policy (choose one); the start date.
- **Next due** card: the date, how long until it or how overdue, and a "because…" line naming the
  driver.
- **Last review** card with Start review / Continue review.
- The in-progress checklist, outcome, notes, Complete and Abandon, as now.
- Past reviews, as now.

### Platform page

- The Reviews sub-tab is removed; links that went to it (e.g. "Reviews →") go to the platform's
  review page in the Reviews tab.
- The ⋯ menu gains **Review schedule…**, opening a read-only panel: rule, period and driver, next
  due with its state, last reviewed, whether a review is in progress, and "Open in Reviews →".

## 3. Review date moved: open item and pop-up

### Open item

When a live, scheduled platform's calculated due date differs from its `reviewDueSeen`, its owner
has a **Review date moved** item: "Review date moved: 3 Mar 2028 → 9 Apr 2027 (HZ-12 residual
Personnel now Serious)".

- **Urgent** when the new date has passed or is within 30 days: highlighted red and placed first in
  Needs attention, above overdue reviews.
- **Normal** otherwise: listed with the change acknowledgements.
- Raised whoever made the change, including the owner.
- Cleared by the owner's Acknowledge (records `reviewDueSeen` = current due, as a change to the
  platform that does not itself wait for acknowledgement) or by completing a review.
- Counts toward the Home attention dot and the Needs attention totals.

### Pop-up

After any save that moves one or more platforms' calculated due date (rating edits, hazards linked
or unlinked, control decisions that change a residual band, policy edits, rule changes), the
controller compares each live platform's due date before and after and, if any moved, shows a
dialog listing each platform: old → new date and why. Per platform it says "You own *X* — check its
review date" or "*X* is owned by *Name* — they have been asked to check its review date". If any
move is urgent, the dialog shows a red **Urgent** banner and marks those platforms ("now overdue" /
"due within 30 days"). The dialog informs only; it does not acknowledge. Merges that move dates do
not open the dialog — the open items cover them.

## 4. Timeline (Gantt)

- **Rows**: one per platform passing the filters, grouped by platform group when groups exist;
  labelled with platform name and owner. Unscheduled platforms are listed last, greyed, "No
  schedule".
- **Columns**: one per month, with year bands above; a "today" line in the current month.
- **Range**: start month (default this month) and length 6 months, 1, 2, 3, 5 or 10 years (default
  3 years); ‹ › shift by a year; "Show past" starts the range a year back. Range and filters are
  remembered per browser (localStorage, wrapped in try/catch, as the bow-tie workspace).
- **Filters**: owner and platform group, as on Schedule.
- **Marks**:
  - Next due: solid marker; red when overdue (pinned in the current month, with a bar back to the
    due month), amber when due soon.
  - Later reviews in range: hollow markers at the *current* period (projections).
  - Completed reviews in range: ticks, coloured on time / late (completed after the date they
    answered).
  - In progress: striped bar from its start month to now.
  - Thin bars between markers show the period.
- **Interaction**: hover shows date, period and driver; clicking a row opens the platform's review
  page.
- **Build**: HTML table/grid with CSS (not SVG), horizontally scrollable with the platform column
  frozen, using the existing light/dark theme tokens.

## 5. Code shape

- `src/core/schedule.js` (new): period and driver calculation, due-date stepping, date-moved
  detection; pure functions over `Data`, memoised per `Data`.
- `src/core/ops/reviews.js`: `setRule` (replaces `setSchedule`), `acknowledgeReviewDate`, policy
  ops (`addPolicy`, `updatePolicy`, `renamePolicy`, `deletePolicy`); `completeReview` uses the new
  model. `Acknowledge review date` joins `NOT_ACKNOWLEDGED`; rule and policy edits are ordinary
  changes (a non-owner's rule change waits for the owner's acknowledgement, as other edits do).
- `src/core/queries.js`: `openItems`, `attentionItems`, `upcomingReviews`, `platformCards`,
  `reviewDueList` read due dates from `schedule.js`; new `dateMoved` items.
- `src/core/time.js`: `reviewState` takes a calculated due date.
- `src/ui/screens/reviews.js`: becomes the Reviews tab (Schedule, Policies, platform review page);
  `src/ui/screens/timeline.js` (new) for the Gantt; platforms.js loses the sub-tab and gains the
  menu panel; common.js nav; controller/mount for new actions and the pop-up.

## 6. Testing

- Core: period calculation (shortest per hazard, unconsidered receptors, blank cells, longest cap,
  no hazards); due stepping (late completion, changed period); date-moved items and urgency;
  acknowledgement and completion clearing them; policy validation (range, unique name, delete in
  use); the conversion script on a fixture.
- UI: Schedule table, Policies editor, platform review page, Timeline cells for a known fixture,
  the ⋯ menu panel, the pop-up after a rating edit (owner / non-owner, urgent / not), Needs
  attention ordering.
- Tests for the old platform Reviews sub-tab move or go.
- `npm run build` after every change.

## Out of scope

Manually overriding a calculated due date; a separate review owner; per-hazard review schedules;
notifications outside the app.
