# Pivot: capability as a third risk type, and levels only ever calculated

Date: 2026-09-30. Status: approved in conversation by jay-pryor; for review as written.

## 1. Purpose

Each hazard on a platform is assessed, initial and residual, for **personnel** and the
**environment** (SSRA piece 1). jay's organisation also assesses the risk to **capability**. This
adds it as a third risk type, alongside the other two in every place risk appears.

Separately, a risk level (e.g. *2C Serious*) must always be **calculated** from a likelihood and a
consequence chosen on their own, never picked as a cell. The hazard's platform tab already works this
way; the platform page's Hazards table does not (its dropdowns list matrix cells), and changes here.

## 2. Decisions (jay's)

| Question | Decision |
|---|---|
| Capability's scales | The same matrix as personnel and environment: likelihoods A–G, consequences 1–5 with the same words, the same bands. |
| Existing data | No conversion. Capability starts unassessed on every hazard on a platform, so Home lists each as missing its capability ratings until done. |
| The platform page's risk columns | Read-only calculated levels; editing happens on the hazard's platform tab. |
| The single "worst" band | The worst of all three receptors: platform tab badges, the hazards list, the controls list's band, filters. |

## 3. Approach

The receptors are one list, `RECEPTORS = ['personnel', 'environment', 'capability']`, and every
place that shows, counts, filters, reports or checks per-receptor risk is built from it rather than
naming receptors one by one. Adding capability is a change to that list plus layout; a fourth type
later would be the same.

## 4. Data

- Assessments are as today (`assessment`, id `ra:<hazard>:<platform>:<stage>:<receptor>`), with
  `receptor` now also `capability`. `setAssessment` accepts it; `rating.receptor` refuses anything
  else.
- `ratingsOf` returns `{ initial: { personnel, environment, capability }, residual: { … } }`.
- Unlinking a hazard from a platform deletes all its assessments there (unchanged in kind).
- Old `rating` records still convert on load to personnel and environment only (as piece 1); nothing
  converts to capability.
- Removed: picking a level as a matrix cell (`setRatingCell` and the cell dropdowns). `setRating`
  (a pair for one receptor, or every receptor when none is named) stays as a convenience for tests
  and conversions only; the UI never calls it.

## 5. Screens

- **Hazard platform tab.** Initial risk and Residual risk each show three panels, Personnel,
  Environment and Capability, side by side on a wide screen and stacking when narrow; each has
  likelihood, consequence, both justifications and the calculated level. The tab's badge is the
  worst residual of the three. The Overview's Platforms table gains a Residual (capability) column.
- **Platform page.** The Hazards table's risk columns are six read-only level badges (initial and
  residual × personnel, environment, capability), sortable; each hazard links to its platform tab.
- **Hazards list.** Each platform shows P, E and C bands; a worst-residual column and filter for each
  receptor.
- **Home.** Each platform card has three risk bars. "Unrated" (tile, Needs attention, Open items)
  counts a hazard on a platform with any of its six assessments incomplete, and says which.
- **Review checklist.** Residual personnel, environment and capability.
- **Controls list.** A row's band is the worst residual of the three.

## 6. Reports

- The snapshot's `ratings` gains `initialCapability` and `residualCapability`; `assessments` has six
  entries (stage, then receptor order).
- Hazards section: `initialCapability` and `residualCapability` columns beside the existing four
  (existing column ids unchanged, so saved designs keep working).
- Risk assessments section: capability rows.

## 7. Tests

Test first, in the existing layout: the receptor list and `setAssessment` for capability; queries
(ratings, worst band over three, open items naming capability, platform cards' three bars); the
platform page shows six read-only levels and no cell dropdowns; the hazard tab's three panels per
stage; the hazards list columns and filters; the review checklist; reports (snapshot and sections);
a merge where two people fill in different receptors of the same hazard on a platform keeps both; a
browser check; a fresh whole-branch review.

## 8. Not in this change

Capability-specific consequence wording; converting any existing rating to capability; editing
likelihood and consequence inline on the platform page.
