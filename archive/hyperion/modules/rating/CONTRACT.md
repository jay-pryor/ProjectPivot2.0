# Contract: rating
Version: 1.0 · Status: draft

Written for SL-03. Promises the one thing DEC-004 kept out of `baseline/` so that HZ-010
could have a clause and a test: the DEC-002 risk matrix, as a function from an entered
consequence and likelihood to the band the matrix gives. It is the whole of REQ-017's
"equal the DEC-002 matrix rating"; that every rating Pivot *shows* comes from here is
`views`' half, kept by `check_boundaries.js` and by `views`' own confinement clause.

This module stores nothing and is stored in nothing: a rating is recomputed from the two
values every time it is shown, so no stored band can go stale against the matrix
(DEC-002's "the matrix is fixed in Pivot, not user-editable data").

## 1. Purpose
Give the DEC-002 matrix band for a consequence and a likelihood.

## 2. Operations
In `contract.js`. The single operation is asynchronous and returns a promise, as every
operation of every Pivot module is (DEC-012); it is nonetheless a pure function of its two
arguments and reads nothing else (C-004).

| Operation | Signature | Verified by |
|---|---|---|
| ratingFor | `(consequence: ConsequenceLevel1to5 \| null, likelihood: LikelihoodLetterAtoG \| null) → Rating` | conformance |

A conformance test calls it with values built by `baseline/types.js` and needs no body, no
folder, and no clock. The 35-cell fixture criterion 6 names is the reference validation of
REQ-017 under `validation/`, transcribed from DEC-002 independently of the table in
section 5; the conformance suite and that fixture are written in a CONFORMANCE session.

## 3. Data shapes
From `baseline/types.js`: `ConsequenceLevel1to5`, `LikelihoodLetterAtoG`, `RiskCell`.
Defined in `contract.js`:

- `RatingBand`: one of `'High'`, `'Serious'`, `'Medium'`, `'Low'`, `'Not Credible'`,
  `'Eliminated'`, `'Uncategorised'` — the seven band names DEC-002 gives, spelled as the
  decision spells them. Not baseline: DEC-004 keeps the matrix values in this module and
  the level and letter types in `baseline/` (IMP-05).
- `Rating`: `{ band: RatingBand, cell: RiskCell | null }`, frozen. `cell` is the entered
  level then letter, `baseline/types.js`'s `riskCell`, and is null exactly when `band` is
  `'Uncategorised'` (C-002).

`cell` is always the level and letter the assessor entered. DEC-002's table labels its
own bands parenthetically — `Not Credible (5G)`, and row F with no notation at all — and
those labels are the decision naming its bands, not a relabelling of an entry: `4A` is
returned as `4A` with band `'Medium'`, and `5A` as `5A` with band `'Not Credible'`.
`baseline/types.js` allows a `RiskCell` no other shape, so a rating never shows a cell the
assessor did not enter.

## 4. Error conditions
Signalled as a rejected promise carrying the named error class. Nothing is returned and
nothing is written; this module has nothing to leave changed (C-004).

| Operation | Condition | Signalled as | Caller obligation |
|---|---|---|---|
| ratingFor | `consequence` is neither absent nor a whole number 1 to 5 | `ConsequenceOutOfScaleError` carrying what was given | Show no rating for this hazard on this platform; name the record, as `registry`'s malformed-record obligation does |
| ratingFor | `likelihood` is neither absent nor one of `A` to `G` | `LikelihoodOutOfScaleError` carrying what was given | As above |

"Absent" is `null` or `undefined`, and means the assessor has not entered the value; it is
not an error (C-002). When both arguments are out of scale, `ConsequenceOutOfScaleError` is
the one signalled, so the rejection is a function of the arguments like everything else
(C-004).

## 5. Behavioural promises

- **C-001 The band is the DEC-002 cell, for all 35 cells.** With both values present,
  `ratingFor(c, l)` resolves with `{ cell: riskCell(c, l), band: B }`, where `B` is the
  table below — the DEC-002 risk severity matrix, one row per consequence level:

  | Consequence \ Likelihood | A | B | C | D | E | F | G |
  |---|---|---|---|---|---|---|---|
  | **1 Catastrophic** | High | High | High | Serious | Medium | Eliminated | Not Credible |
  | **2 Critical** | High | High | Serious | Medium | Medium | Eliminated | Not Credible |
  | **3 Marginal** | Serious | Serious | Medium | Medium | Medium | Eliminated | Not Credible |
  | **4 Negligible** | Medium | Medium | Low | Low | Low | Eliminated | Not Credible |
  | **5 None** | Not Credible | Not Credible | Not Credible | Not Credible | Not Credible | Not Credible | Not Credible |

  Consequence 5 is `'Not Credible'` at every likelihood, F included: DEC-002's `None (5)`
  column reads `Not Credible (5G)` in every row, which is the column winning over row F's
  `Eliminated`. No band outside the seven is ever returned, and no pair of values in scale
  is ever refused: the function is total over the 35 cells. (REQ-017, HZ-010; SL-03
  criterion 6.)
- **C-002 Uncategorised is exactly "not entered".** `band` is `'Uncategorised'` if and only
  if `cell` is null, if and only if `consequence` is absent or `likelihood` is absent. A
  rating with one value entered and the other not is `'Uncategorised'`, not a band read off
  the entered half. (SL-03 criterion 6; DEC-002's Uncategorised row and column.)
- **C-003 A value outside the scales is refused, not rated.** A `consequence` that is
  present and not a whole number 1 to 5, or a `likelihood` that is present and not one of
  `A` to `G`, rejects with the error section 4 names and resolves with nothing. In
  particular it does not resolve with `'Uncategorised'`: a value the matrix cannot read is
  not the same as a value the assessor has not entered, and a caller that shows the second
  in place of the first shows a rating for data the matrix never rated. (REQ-017, HZ-010;
  SL-03 criterion 6.)
- **C-004 A pure total function of the two values and nothing else.** `ratingFor` reads no
  clock, no data folder, no browser storage, and no global state; it writes nothing
  anywhere; it holds nothing between calls. Two calls with equal arguments resolve with
  deep-equal frozen results, in this copy of Pivot and in any other, now and after any
  sequence of other calls. Nothing outside the signature can reach the result: no control,
  no platform, no hazard, no count of linked controls is an argument, so no implementation
  of this contract can adjust a residual band for the controls linked to a platform
  (HZ-002, and REQ-003's half that `registry` and `views` keep by storing and showing the
  entered values). This module imports `baseline/types.js` and nothing else. (REQ-017.)

Ordering: none; the operation takes two scalars and returns one value.
Idempotency: every call is idempotent and harmless (C-004).
Determinism: total (C-004). No randomness, no clock, no ambient input.
Null and empty semantics: absent means `null` or `undefined` and rates as
`'Uncategorised'` (C-002); out of scale is refused (C-003). There is no empty case.
Concurrency safety: safe without qualification. The module has no state, so overlapping
calls, calls from two copies of Pivot on one folder (ASM-004), and calls interleaved with
any other module's are all promised.
Side effects: none (C-004).
Tolerance and precision: none. Every comparison is exact equality against the table in
C-001; no threshold, epsilon, or rounding appears in this contract or is permitted in an
implementation of it.

## 6. Performance envelope
Constant time and constant space per call, independent of anything stored: a lookup of one
of 35 cells. A list of a platform's hazards calls it once per hazard per stage shown, so
`views` may call it a few hundred times in one render without a budget being claimed.
No caching is needed and none is promised (C-004 makes any caching invisible).

## 7. Trace
Allocated to this module in `trace/requirements.yaml`; checked by `check_traces.py`.

Promised at version 1.0: REQ-017, jointly with `views`, which is the module that shows.
HZ-010 names C-001 as its mitigation; HZ-002 is named at C-004 and is `registry`'s and
`views`' to mitigate.

## Explicitly not promised
- That the values passed in came from a well-formed stored record. A stored rating record
  is `registry`'s to hold and to refuse when malformed; this contract refuses only a value
  outside the scales (C-003).
- Any order over `RatingBand`: that `'High'` is worse than `'Serious'`, or any comparison,
  sort, or filter by band. SL-11's filtering by rating is not promised at this version.
- Any relation between an initial and a residual rating. This module rates one pair at a
  time and never sees the other, so nothing here says a residual is lower than an initial,
  nor may any implementation assume it.
- The DEC-001 integer likelihood encoding. It is for `trace/` records only (DEC-002); no
  operation here accepts or returns it, and a caller that passes `1` for Frequent is
  passing a consequence level.
- Any per-platform, per-customer, or user-editable matrix. DEC-002 rejected that and this
  contract has no argument through which one could be supplied.
- How a rating is shown. DEC-002's `2C = Serious` is the decision's example, not a format
  this contract promises; joining `cell` and `band` into anything a user reads is `views`'.
  This module gives a value; `views` speaks.
- That `Rating` gains no field. Adding one is an Interface change to this module.
