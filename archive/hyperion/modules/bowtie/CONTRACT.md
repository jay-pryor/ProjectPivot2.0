# Contract: bowtie
Version: 1.0 · Status: draft

Written for SL-08. Promises the bow-tie diagram of one hazard on one platform as two things: the
value the diagram depicts, read from `registry` every time it is asked for (DEC-028), and the SVG
document that draws that value. Nothing here is stored: the value and the document are generated
on every call and neither is written anywhere (REQ-059). Showing the document is `views`', and so
is exporting it; this module gives `views` one string for both, so the shown and the exported
drawing are the same drawing (SL-08 criterion 3).

Two readings of SL-08 are recorded here rather than resolved silently.

SL-08's "Contracts touched" says the slice consumes `rating`, and criterion 1 lists what the
drawing shows without any rating. On the first reading the bow-tie carries the hazard's initial
and residual rating on the platform, which is why `rating` is consumed. On the second the drawing
is exactly the hazard and criterion 1's four kinds of thing, and `rating` is consumed by the
screen around it. This version takes the second, the smaller promise: no rating is in `Bowtie`
and none is drawn, and this module does not import `rating`. Adding the ratings is an Interface
change to this module (a field of `Bowtie`, a clause, a node) and is jay-pryor's to rule on.

Criterion 3's "writes the diagram to a file the user chooses" names a write outside the data
folder. `store` 3.0 has no operation that writes a file the user chooses (`chooseSaveStateFile`
reads one), and `views` C-009 confines this module's consumer to writing through `store`. So the
file half of criterion 3 needs an operation no contract exposes, and SL-08's "Contracts touched"
does not name `store`. This module's half, the document, does not depend on it. The write is for
the SL-08 CONTRACT session on `views` to take up, with `store`, before SL-08 is implemented.

## 1. Purpose
Give the bow-tie of one hazard on one platform, as the registry holds it, and draw it.

## 2. Operations
In `contract.js`. Both operations are asynchronous and return a promise (DEC-012). Both are pure:
`bowtieFor` is a function of the `DataBody` passed in, read only through `registry`'s contract,
and `renderBowtieSvg` is a function of the `Bowtie` passed in (C-003).

| Operation | Signature | Verified by |
|---|---|---|
| bowtieFor | `(body: DataBody, hazardId: HazardId, platformId: PlatformId) → Bowtie` | conformance |
| renderBowtieSvg | `(bowtie: Bowtie) → BowtieSvgText` | conformance |

A conformance test builds a body through `registry`'s changing operations from
`schema.emptyDataBody()`, and compares against `registry.getHazardDetail` and
`registry.listPlatformHazards` on the same body; it needs no folder and no browser. It reads a
document through the syntax C-009 restricts it to, so no XML library is needed (IMP-06).

## 3. Data shapes
From `baseline/types.js`: `HazardId`, `PlatformId`, `PlatformReportId`, `ControlKind`. From
`baseline/schema.js`: `DataBody`. From `modules/registry/contract.js`: `Hazard`, `Platform`,
`CausalFactor`, `Consequence`, `PlatformControl`, `OmissionReason`. Defined in `contract.js`:

- `Bowtie`: `{ platform: Platform, hazard: Hazard, reportId: PlatformReportId, causalFactors:
  readonly CausalFactor[], consequences: readonly Consequence[], preventativeControls: readonly
  PlatformControl[], mitigatingControls: readonly PlatformControl[] }`, frozen. Every element is
  the registry's own value, unchanged and uncopied in meaning (C-001); this module defines no
  record shape of its own.
- `BowtieSvgText`: a string holding one SVG document (C-004 to C-010). Coordinates inside it are
  SVG user units of its own `viewBox`; no quantity crosses this boundary as a number.
- `BowtieNodeKind`: `'causal-factor' | 'preventative-control' | 'hazard' | 'mitigating-control' |
  'consequence'`, the value of a node's `data-bowtie-node` attribute (C-004), and the left-to-right
  order of the drawing (C-007).

## 4. Error conditions
Signalled as a rejected promise. Nothing is returned and nothing is written; neither operation
has anything to leave changed (C-003).

| Operation | Condition | Signalled as | Caller obligation |
|---|---|---|---|
| bowtieFor | `registry.listPlatformHazards(body, platformId)` rejects: the platform is unknown, or a hazard, link, or platform record is malformed | that error unchanged (`registry`'s `UnknownPlatformError`, `Malformed*Error`) | Show no diagram; name the platform or the record, as `registry`'s obligations say |
| bowtieFor | `registry.getHazardDetail(body, hazardId)` rejects: a hazard, causal factor, consequence, control, or link record is malformed | that error unchanged (`registry`'s `Malformed*Error`) | Show no diagram; name the record |
| bowtieFor | no hazard in the body has `hazardId` | `registry`'s `UnknownHazardError` | Show no diagram; list again |
| bowtieFor | the hazard's status is not `live` | `registry`'s `HazardNotLiveError` carrying the status | Say the hazard is deleted or retired |
| bowtieFor | no live `hazard-platform` link joins the hazard to the platform | `registry`'s `HazardNotOnPlatformError` | Say the hazard is not on this platform (REQ-059 is for platforms it is linked to) |
| bowtieFor | the hazard is in `listPlatformHazards(body, platformId).omitted` | `HazardOmittedError` carrying the hazard id, the `reason`, the `key`, and the `detail` registry gave | Show no diagram; name the record that stopped it, as `registry` C-019 obliges for a list |
| renderBowtieSvg | `bowtie` is not a `Bowtie` (C-011) | `InvalidBowtieError` naming the field | Draw nothing; pass what `bowtieFor` resolved with |

When two conditions of `bowtieFor` hold at once, the one signalled is the first in the table's
order, so a conformance test has one expected rejection.

## 5. Behavioural promises

- **C-001 The bow-tie is the registry's data for that hazard on that platform, and nothing else.**
  When `bowtieFor(body, hazardId, platformId)` resolves with `w`, and `d` is
  `registry.getHazardDetail(body, hazardId)` and `r` is the row of
  `registry.listPlatformHazards(body, platformId).rows` whose `hazard.id` is `hazardId`:
  `w.platform` is deep-equal to that query's `platform`; `w.hazard` to `r.hazard`; `w.reportId`
  equals `r.reportId`; `w.causalFactors` to `d.causalFactors` and `w.consequences` to
  `d.consequences`, same elements, same order; `w.preventativeControls` to the elements of
  `r.controls` whose `controlKind` is `preventative`, and `w.mitigatingControls` to those whose
  `controlKind` is `mitigating`, each in `r.controls`' order. Nothing is added, dropped, merged,
  reordered, or reworded, and the `state` of each control is the state registry gives it on this
  platform (registry C-021). A causal factor, consequence, or control a person adds, and a control
  confirmed or excluded, is in the next `bowtieFor` of the body that holds the change.
  (REQ-018, REQ-059; HZ-011; SL-08 criteria 1 and 2.)
- **C-002 A bow-tie that cannot be complete is refused, never drawn in part.** `bowtieFor` resolves
  only when the hazard is a row of `listPlatformHazards` for the platform. Each other case rejects
  as section 4 says, and in particular a hazard `registry` names as omitted rejects with
  `HazardOmittedError` rather than resolving without the record that stopped it: a bow-tie with a
  control silently missing is a diagram that differs from the stored data. (HZ-011; REQ-018.)
- **C-003 Generated on every call, stored nowhere.** Neither operation reads or writes the data
  folder, the browser's storage, the document or any DOM, the clock, or any global state, and
  neither holds anything between calls: the result of a call depends on its arguments alone, so no
  earlier call can make a later one stale. `bowtieFor` reads the body only through
  `registry.getHazardDetail` and `registry.listPlatformHazards`, calls no changing operation, and
  leaves the body deep-equal to what it was. This module imports `baseline/types.js`,
  `baseline/schema.js`, and `modules/registry/contract.js`, and nothing else. (REQ-059; SL-08
  criterion 2, this module's half: nothing about the diagram is written. That the screen writes
  nothing either is `views`'.)
- **C-004 One node per thing, each marked with what it is.** In `renderBowtieSvg(w)`, a node is a
  `<g>` element carrying a `data-bowtie-node` attribute. The document holds exactly: one node of
  kind `hazard` whose `data-record-id` is `w.hazard.id`; one of kind `causal-factor` for each
  element of `w.causalFactors`, one of kind `consequence` for each of `w.consequences`, one of
  kind `preventative-control` for each of `w.preventativeControls`, and one of kind
  `mitigating-control` for each of `w.mitigatingControls`, each with `data-record-id` the element's
  id (for a control, `control.id`). Each control node also carries `data-control-state`, its
  `state`. No other element carries `data-bowtie-node`, and no node is inside another. So the set of
  `(data-bowtie-node, data-record-id, data-control-state)` in the document equals the set C-001
  reads from the registry, and that is checked by comparison, not by eye. (REQ-018; HZ-011; SL-08
  criteria 1 and 3.) *Mitigation clause for HZ-011, with C-001 and C-005.*
- **C-005 Every text is drawn whole, as stored.** Each node has exactly one child `<title>` whose
  text is exactly the stored text: the hazard's `title`, a causal factor's or consequence's `text`,
  a control's `control.title`. Each node has exactly one child `<text>`, whose `<tspan>` children
  are its visible lines, none empty. The hazard node's first line is `w.reportId` exactly. Its
  remaining lines, a causal factor's and a consequence's lines, and a control's lines other than
  its last (C-006) are the text's lines: trimmed of their outer whitespace and joined with single
  spaces, they equal the stored text trimmed with every run of whitespace replaced by one space.
  A line breaks only at whitespace, so no word is split, and nothing is truncated, elided, or
  added. The document holds one more `<text>`, outside every node, carrying `data-bowtie-caption`,
  whose text contains the platform's `name` and `w.reportId`. There is no other `<text>`. (REQ-018;
  HZ-011.)
- **C-006 Each control's state on the platform is drawn in words, not by colour alone.** A control
  node's last visible line is its state line. Every control in the same state has the same state
  line, in every document, and the three states' lines are three different non-empty strings. The
  state is what C-001 gave, so a control awaiting a ruling is never drawn as confirmed. (REQ-018,
  "the stored state of each control on that platform"; REQ-001 and REQ-002 as they read on a
  diagram.)
- **C-007 Each thing sits on its side, in its order, and nothing sits on anything else.** Each node
  has exactly one child `<rect>` with numeric `x`, `y`, `width`, and `height`, the last two greater
  than zero, and no element in the document carries a `transform`, so these are coordinates of the
  root `viewBox`. For a node `a` let its box be `[x, x + width] × [y, y + height]`. Then: every
  box lies inside the `viewBox`; no two boxes intersect; for any node `a` of a kind earlier than
  node `b`'s in `BowtieNodeKind`'s order, `a`'s right edge is less than `b`'s left edge; and within
  one kind, each node's bottom edge is less than the top edge of the node for the next element of
  its list. So preventative controls lie between the causal factors and the hazard, mitigating
  controls between the hazard and the consequences, and each column reads in the registry's order.
  (REQ-018; DEC-003: no library, so the layout promised is only this.)
- **C-008 The drawing relates nothing the registry does not.** Every `<line>`, `<polyline>`, and
  `<path>` element carries `data-bowtie-edge`, whose value is the `data-record-id` of one node of
  kind `causal-factor` or `consequence`. Each such node is named by exactly one edge, and no edge
  names a control or the hazard: an edge stands for "this causal factor leads to the hazard" or
  "the hazard leads to this consequence", which `registry` stores (registry C-010). No element
  joins a particular causal factor or consequence to a particular control, because `registry`
  stores no such relation (DEC-013, DEC-029). (HZ-011.)
- **C-009 A self-contained document in a syntax a small reader can check.** The text begins with
  `<svg` and is one well-formed XML element with no XML declaration, doctype, comment, CDATA
  section, or processing instruction. Its root is `svg` with `xmlns="http://www.w3.org/2000/svg"`,
  a `viewBox` of `0 0 W H`, and `width` `W` and `height` `H`, `W` and `H` positive numbers. The
  only elements are `svg`, `g`, `title`, `rect`, `text`, `tspan`, `line`, `polyline`, and `path`.
  Attribute values are double-quoted; the only entity references are `&amp;`, `&lt;`, `&gt;`, and
  `&quot;`; no attribute is named `style`, `href`, `xlink:href`, `class`, or anything beginning
  `on`; and no attribute value contains `url(`. So the document references nothing outside itself,
  runs nothing, and draws the same wherever it is pasted. (REQ-060; SL-08's G3 decision for SVG.)
- **C-010 One bow-tie, one document.** Two calls of `renderBowtieSvg` with deep-equal arguments
  resolve with identical strings, in this copy of Pivot and any other; two calls of `bowtieFor` with
  deep-equal arguments resolve with deep-equal values. So a diagram shown and a diagram exported from
  the same `Bowtie` are the same text, and hold the same nodes. (SL-08 criterion 3; REQ-060.)
- **C-011 A value that is not a bow-tie is refused, not drawn.** `renderBowtieSvg` rejects with
  `InvalidBowtieError`, naming the first failing field in the order `hazard`, `platform`,
  `reportId`, `causalFactors`, `consequences`, `preventativeControls`, `mitigatingControls` and
  within a list the lowest index, when: `bowtie` is not an object; `hazard` has no string `id` and
  string `title`; `platform` has no string `name`; `reportId` is not a non-empty string; a list is
  not an array; a causal factor or consequence has no string `id` and string `text`; a control
  entry has no `control` with string `id` and string `title`, or its `state` is not `confirmed`,
  `excluded`, or `awaiting`, or its `controlKind` is not the one its list is named for; or two
  entries of one list share an id. Nothing is drawn. Every value `bowtieFor` resolves with is
  accepted. (HZ-011: a diagram drawn from a value that is not what the registry holds.)

Ordering: C-001 gives each list the registry's order; C-007 draws it.
Idempotency: both operations are reads, harmless to repeat (C-003, C-010).
Determinism: total (C-010). No randomness, no clock, no font measurement, no ambient input.
Null and empty semantics: a hazard with no causal factors, consequences, or controls is a bow-tie
with those lists empty, and draws the hazard node alone with no edges; that is not an error.
Concurrency safety: safe without qualification; there is no state (C-003).
Side effects: none (C-003).
Tolerance and precision: none. Every comparison in this contract is exact. Coordinates are
compared only with each other, with strict inequality (C-007).

## 6. Performance envelope
`bowtieFor` costs the two `registry` reads it is made of (registry section 6). `renderBowtieSvg`
is linear in the number of nodes plus the length of their text. No latency budget is claimed: a
diagram is drawn on request, one at a time.

## 7. Trace
Allocated to this module in `trace/requirements.yaml`; the mitigation in `trace/hazards.yaml`;
the graph in `modules/bowtie/manifest.yaml`. Checked by `check_traces.py` and
`check_boundaries.js`.

Promised at version 1.0: REQ-018 (C-001, C-004 to C-006), REQ-059 (C-001, C-003). HZ-011 is
mitigated at C-004, which holds only with C-001 and C-005.

Not claimed at version 1.0. REQ-060, letting a user export, is an act a user performs on a
screen, so it is `views`', over C-009 and C-010. Its file write needs a `store` operation that
does not exist (see the preamble). REQ-059's "each time it is shown, exported, or included in a
report" is kept here by C-003; that the screens and SL-09's reports call this module each time,
and keep no copy of their own, is `views`' and `reports`' to promise.

## Explicitly not promised
- Any rating, band, or cell on the diagram (see the preamble).
- Any relation between a particular causal factor and a particular preventative control, or a
  particular mitigating control and a particular consequence (C-008, DEC-029).
- A control's confirmation, justification, or library status on the drawing. They are in the
  `Bowtie` value because registry carries them on `PlatformControl`, and are not drawn at 1.0.
- The wording of a state line or the caption beyond C-005 and C-006, any colour, font, stroke,
  size, spacing, or the number of characters to a line.
- That drawn text fits inside its box in every viewer. Fonts differ between machines, and this
  module measures none (C-010); a box is laid out from its text's length, and C-005's `<title>`
  holds the whole text whatever a viewer renders.
- That the document is suitable for inserting as HTML by string concatenation into a page the
  consumer does not control, or anything about the DOM a consumer builds from it.
- Where the file is written, what it is named, and how the user chooses it: `views`' and `store`'s.
- The bow-tie inside a report (SL-09), and editing anything from the diagram.
- That `Bowtie` or the set of elements in C-009 gains nothing. Adding either is an Interface change.
