# Pivot: the full SSRA

Date: 2026-09-29. Status: draft for jay-pryor's review.

## 1. Purpose and shape

A hazard page in Pivot is, in jay's organisation, an SSRA (a system safety risk assessment). The
SSRA document has, in order: an Overview (title, description, causal factors, lifecycle phases,
safety reports); existing controls by tier; references; initial risk to personnel and to the
environment (each with a likelihood and its justification, a consequence and its justification, and
the assessed level); an additional control analysis (control ID, measure, description,
recommendation, justification, implementation status per platform); residual risk to personnel and
to the environment (as initial); and SFARP considerations (justification, conclusion, conditions of
validity). This spec brings all of it into Pivot.

Some content is **shared** by the hazard on every platform; some is **per platform** (per hazard on a
platform). jay's rulings:

| Content | Shared or per platform |
|---|---|
| Title, description, causal factors, consequences | shared |
| Lifecycle phases | shared (the hazard ticks phases from a managed list) |
| Safety reports | per platform |
| Existing controls | per platform |
| References | shared (as built) |
| Initial and residual risk, personnel and environment | per platform |
| Additional controls, with recommendation and justification | shared |
| Implementation status of each additional control | per platform |
| SFARP considerations | per platform |

It is built in three pieces, each released on its own, each with its own plan and review:

1. **Platform tabs, the four risk assessments, SFARP** (with their report sections).
2. **The controls model**: existing controls per platform, additional controls with recommendation,
   justification and a per-platform status (with their report sections).
3. **Lifecycle phases and safety reports** (with their report sections).

## 2. Data

Every new record has the usual header and is never removed from the file. Per-platform records have
ids built from what they join, so two users writing the same thing write one record, and two users
writing different things never collide (one small record each rather than one large one).

### 2.1 Risk assessments (piece 1)

| Kind | Fields | Id |
|---|---|---|
| assessment | `hazardId`, `platformId`, `stage` (`initial`, `residual`), `receptor` (`personnel`, `environment`), `likelihood` (A–G or null), `consequence` (1–5 or null), `likelihoodWhy`, `consequenceWhy` (text) | `ra:<hazard>:<platform>:<stage>:<receptor>` |

- The assessed level (cell and band, e.g. *2C Serious*) is always read from the company matrix,
  never stored. Personnel and environment use the same matrix.
- **Carrying over.** On load, each old `rating` record (`initial`, `residual` pairs) gives four
  assessments: personnel and environment each copied from it, justifications empty. The old rating
  is then marked deleted. The conversion is deterministic (ids, headers and values come from the old
  record), so two users loading the same file produce identical records and the merge sees no
  conflict. The `rating` kind is no longer written.

| Kind | Fields | Id |
|---|---|---|
| sfarp | `hazardId`, `platformId`, `justification`, `conclusion`, `conditions` (text) | `sf:<hazard>:<platform>` |

### 2.2 Controls (piece 2)

- **Additional controls** are today's hazard–control links (`hazardControl`), which gain
  `recommendation` and `justification` (text, shared). `kind` (preventative or mitigating) is kept.
- **Status on a platform** replaces today's rulings. The `ruling` record's `state` becomes one of
  `recommended`, `planned`, `implemented`, `rejected`; `reason` is required for `rejected`. No record
  means `recommended`. Carrying over: `confirmed` → `implemented`, `excluded` → `rejected` (reason
  kept); no ruling stays recommended.
- **Existing controls**:

| Kind | Fields | Id |
|---|---|---|
| existingControl | `hazardId`, `platformId`, `controlId`, `kind` | `ec:<hazard>:<platform>:<control>` |

  shown grouped by the control's tier.

### 2.3 Phases and safety reports (piece 3)

| Kind | Fields | Id |
|---|---|---|
| phase | `name` | uuid |
| hazardPhase | `hazardId`, `phaseId` | `hph:<hazard>:<phase>` |
| safetyReport | `hazardId`, `platformId`, `number`, `date` (YYYY-MM-DD), `type` (`Occurrence`, `Near miss`, `Hazard report`, `Other`), `summary`, `description`, `location`, `parties` | uuid |

### 2.4 Rules and cascades

- An assessment, sfarp, existing control or status needs a live hazard-on-platform link. Unlinking a
  hazard from a platform deletes them in the same entry (as today for rulings and ratings).
- A safety report needs a hazard and a platform that are not deleted. Unlinking does **not** delete
  it: it records an event that happened; it shows again if the hazard is linked back.
- A rejected status has a non-empty reason (as today's excluded).
- A hazard-phase link needs a live hazard and a phase that is not deleted; retiring a phase keeps
  its links (shown with a Retired tag), deleting is refused while linked.
- An existing control needs a control that is not deleted.

### 2.5 Where changes reach

`platformsReached` gains: assessment, sfarp, existingControl, safetyReport → their platform;
hazardPhase → the hazard's platforms; phase → the platforms of hazards using it. So acknowledgements
(2b) cover the new content.

## 3. Screens

### 3.1 The hazard page (piece 1)

Tabs: **Overview** | one tab per platform the hazard is on (named for the platform, with its worst
residual band) | **History**. Shared sections carry a *Shared across platforms* marker; editing one
from a platform tab edits it everywhere.

- **Overview**: title, description, causal factors and consequences; phases (piece 3); additional
  controls by tier with ID, measure (title), description, kind, recommendation, justification
  (piece 2); references; the Platforms table with personnel and environment columns.
- **A platform tab**, in SSRA order:
  1. the shared overview (description, causal factors, consequences, phases), editable;
  2. safety reports: a table, + to add, double-click to edit (piece 3);
  3. existing controls by tier, + to link, ✕ to unlink (piece 2);
  4. references (shared);
  5. **Initial risk**: two panels, *Personnel* and *Environment*, each with a likelihood dropdown and
     its justification, a consequence dropdown and its justification, and the assessed level;
  6. additional control analysis: the hazard's additional controls by tier with recommendation and
     justification (shared) and this platform's Status dropdown, with a reason when Rejected
     (piece 2);
  7. **Residual risk**: as initial;
  8. **SFARP considerations**: justification, conclusion, conditions of validity.

Text boxes apply when left, like the other fields.

### 3.2 Elsewhere

- **Platform page** (piece 1): the Hazards table's two rating dropdowns become four (initial and
  residual, personnel and environment; each sets that assessment's cell); each hazard links to its
  platform tab. The controls table's State becomes Status (piece 2).
- **Hazards list** (piece 1): residual risk per platform shown as personnel and environment, with a
  filter on each.
- **Home** (piece 1): each platform card has two risk bars (personnel, environment); "hazards
  unrated" and Open items count a hazard-on-platform with any of its four assessments incomplete,
  saying which.
- **Review checklist** (piece 1): residual personnel and residual environment columns.
- **Phases** (piece 3): a small page in the nav: + to add, rename in place, retire, restore.

## 4. Reports

Each piece adds designer sections; the snapshot stores their values so a produced report stays as
produced:

- Piece 1: the Hazards section's risk columns become initial and residual for personnel and
  environment; **Risk assessments** (per hazard, per stage and receptor: likelihood, likelihood
  justification, consequence, consequence justification, level); **SFARP considerations** (per
  hazard: justification, conclusion, conditions of validity).
- Piece 2: **Additional control analysis** replaces Controls (tier, control, description, kind,
  recommendation, justification, status, reason); **Existing controls** (per hazard, by tier).
- Piece 3: a Phases column in Hazards; **Safety reports** (per hazard: number, date, type, summary,
  location, parties, description).

## 5. Tests

Per piece, test first, in the existing layout: ops and validation; rules and cascades (unlink clears
per-platform content, safety reports stay); carrying over (an old file converts as described, and
converting twice gives identical records); merge (two users editing different assessments, or
statuses, both kept); queries (headline personnel and environment levels, open items); screens (tabs,
panels, dropdowns, pages, markup shown literally); report sections; a browser check; a fresh
whole-branch review.

## 6. Not in this piece

A separate environmental consequence scale; approvals or sign-off workflow; bow-ties; importing SSRAs
from existing documents.
