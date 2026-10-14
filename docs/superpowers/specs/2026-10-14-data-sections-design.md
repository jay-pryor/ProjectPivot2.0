# Data sections: register data shaped in the designer

**Date:** 2026-10-14. **Status:** approved in chat (approach A, stages 1–4); the user asked for the build to follow without further check-ins.

**Where:**
- `DocGen/doc-designer.js`: the token grammar, field resolution, repeat expansion, the designer UI, the store
- `DocGen/doc-designer.css`: chips, menus, the repeat editors
- `src/reports/docgen-host.js`, `src/reports/snapshot.js`: PIVOT's catalogue, the SSRA starter
- `src/core/data.js`, `scripts/convert-to-v8.mjs`: schema 8 (register tables become opt-in)
- tests

## Why

Register data reaches a report only through eight hard-coded tables (`sectionsFor`), one register each. A document organised another way — an SSRA, a section per hazard with its justifications in prose and small tables — would need its layout written into the code, one report type at a time. The point of the designer is that the user shapes the document; this extends that to the register data itself.

## Stages

Each is built, tested and committed in turn.

1. **Foundation.** The data catalogue; field chips in paragraphs, headings and table cells; repeating sections with a filter and a sort.
2. **Lists.** Lists in a cell or paragraph (numbered, bulleted, comma-separated; sorted; filtered); table rows repeated per item; Repeat parts inside a section; the empty wording.
3. **Fill-ins.** Hand-written blanks kept per entry in the report, listed until filled.
4. **Sections UI.** The **+ Add section** menu; register tables opt-in (schema 8); an SSRA starter template.

## 1. The data catalogue (stage 1)

### The contract

A host may declare `catalogue(run)`, beside `sections(run)`. It returns:

```js
{
  root: 'platform',
  collections: {
    platform: { label: 'Platform', fields: [...], children: ['hazard', 'control', 'safetyReport', 'reference'] },
    hazard:   { label: 'Hazard', plural: 'Hazards', fields: [...], children: ['control', 'assessment', 'safetyReport', 'reference'] },
    ...
  },
  data: null | Entry      // the root entry, bound to the run; null when unbound
}
// Field: { id, label, type: 'text' | 'date' | 'rating' | 'list' }
// Entry: { key, values: { [fieldId]: Value }, children: { [collectionId]: Entry[] } }
// Value: string | { text, sort } | Array<string | { text, sort }>  (lists)
```

- **Unbound** (no run, or no subject): `data` is null. The designer still has every collection and field, so it can offer them.
- **`key`** is stable: the record's id, never its display number, so per-entry text (stage 3) survives renumbering.
- **`{ text, sort }`** carries what prints and what sorts and compares: a date prints `14 Oct 2026` and sorts `2026-10-14`; a rating prints `Serious (2C)` and sorts by its band's rank.
- **A collection may appear under more than one parent.** Under a hazard, *Control* is that hazard's controls; under the platform it is every control once (the gathered row the Controls table already shows). The fields are the same; a per-hazard value at platform level reads as the Controls table reads it (once when every hazard agrees, else one line per hazard).
- DocGen knows nothing of hazards: a collection is a label, fields and children.

### PIVOT's catalogue

Built from the report snapshot, which already holds this tree. The snapshot gains stable ids (hazard, control, safety report, reference) and, per hazard, the references that support it.

| Collection | Fields |
|---|---|
| Platform | Name, Owner, Number of hazards, Review due, Last reviewed |
| Hazard | ID, Title, Description, Lifecycle phases (list), Causal factors (list), Consequences (list), Initial / Residual risk to Personnel / Environment / Capability (rating, six fields), SFARP justification, SFARP conclusion, Conditions of validity |
| Control | ID, Title, Description, Kind, Tier, Status, Recommendation, Justification, Reason rejected, Implemented by, Hazards (list; at platform level) |
| Assessment | Stage, Receptor, Likelihood, Likelihood justification, Consequence, Consequence justification, Level (rating) |
| Safety report | ID, Date (date), Type, Summary, Description, Location, Parties involved |
| Reference | ID, Title, Doc number, Revision, Supports |

Children: Platform → Hazard, Control (gathered), Safety report (gathered), Reference (all). Hazard → Control, Assessment, Safety report, Reference (those supporting it).

## 2. Field tokens (stage 1, lists in stage 2)

### Grammar

A field is a token in the existing rich-text markup, beside `{{ref:…}}`:

```
{{f:hazard.title}}
{{f:safetyReport.description?sort=date&list=num}}
{{f:control.title?where=status:is:Implemented&list=comma&empty=None}}
```

- `collection.field`, then optional `?` options, `&`-separated, values URI-encoded:
  - `sort=<field>` or `sort=<field>:desc`
  - `where=<field>:<op>:<value>` (one condition; see §4)
  - `list=num | bullet | comma | lines` (default `lines`)
  - `empty=<text>` (default `Nil`)
- `App.md.TOKEN` accepts the new tokens. Editors that know nothing of fields (older text) are unaffected: a token is literal text only where it is not recognised.

### Resolution: scope

A token is read against a **scope**: the chain of entries it sits inside, outermost first. The root entry (the platform) is always in it; a repeating section adds its entry; a Repeat part (stage 2) adds its own; a repeated table row adds its row's.

`{{f:c.f}}` resolves as follows:
1. **In scope:** if an entry of collection `c` is in the scope (innermost first), its field `f` — a single value.
2. **A child list:** otherwise, if an entry in the scope (innermost first) has children of collection `c`, field `f` of each child — a list. `where` and `sort` apply to the children; `list` sets how it prints.
3. **Otherwise** it prints **[unknown field]** in bold, and the designer flags it. So does a field the collection does not declare (a token from a later version, a typo).

A list-type field (Causal factors) is a list under rule 1 too.

**Printing:**
- A single value prints its text. Line breaks in register text are line breaks.
- A list prints per `list`: `lines` one per line; `num` `1.`, `2.`, … one per line; `bullet` `•` one per line; `comma` joined with `, `.
- An empty value or empty list prints the `empty` text (`Nil` by default). Bound but empty is different from unbound: in the designer with no platform chosen, a field shows its chip, never `Nil`.

### Where they work

- **Paragraphs, introductions and table cells:** through `App.md.runs`, which gains a `resolveField(tag)` option returning runs. A field's text is never parsed as markup: register text containing `{{b}}` or `/[Tag]` prints as typed.
- **Headings:** a section's heading becomes a one-line rich box, so a field chip can sit in it (`{{f:hazard.id}} {{f:hazard.title}}`). It prints as plain text, as headings do now.
- **Captions:** table captions resolve fields too.
- **Plain readings** (the Sections list, a template's name) show a field as its label in angle quotes: `‹Hazard ID›`.

### In the editor

- **Chips:** a field token is an uneditable chip, like a reference without its own words. It reads `Hazard › Title`: the chip names the field, not a value, so the template reads as a template.
- **The Field menu:** a **{ } Field** button beside **🔗 Link** on every box (paragraph, introduction, cell, heading). It lists the collections in scope for that box, then the child collections (marked *list*), each with its fields. Clicking a field inserts its chip at the caret. A field can also be dragged from the menu into any box.
- **A list chip's options:** clicking a chip that resolves to a list (in the box's scope) opens a small panel: sort (field, direction), filter (field, operator, value), style (lines, numbered, bulleted, comma), empty wording. Clicking any chip offers its empty wording.

## 3. Repeating sections (stage 1)

### What is stored

A custom section may carry `repeat: { each: 'hazard', where?: { field, op, value }, sort?: { field, dir } }`.

### The group

A repeating section repeats **with the sections under it**: those after it in the order whose resolved level is deeper, up to the next section at its level or above. So an H2 "‹Hazard ID› ‹Hazard Title›" repeating per hazard, followed by an H3 "Controls" and an H4 repeating per control, gives per hazard: its H2, its H3, and an H4 per control of *that* hazard. Groups nest: a repeating section inside a group adds to the scope its copies are read in.

The sections in a group may be of any kind except Contents and Metadata, which are not repeated (they print once, where they are, as if outside the group). A register table inside a group prints once per copy, unchanged — allowed, but not useful; the designer says so on the section.

### Expansion

In `documentFor`, between the included blocks and their content (`contentOf`), a pure function `expandRepeats(blocks, catalogue)` replaces each group with one copy per entry:

- **Ids:** a copy's id is `<sectionId>~<entryKey>` (nested: `<sectionId>~<hazardKey>~<controlKey>`), and its parts' ids are suffixed the same way, so anchors, table numbers, figure numbers and cross-references are distinct per copy.
- **Levels:** each copy is pinned to the level its template resolved to. An automatic level would otherwise drift: a copy after an H3 would become an H3.
- **Scope:** each copy carries its scope, which `buildDocument` hands to `App.md.runs` for its heading, introduction, parts and captions.
- **Per-section settings** (page break, landscape, space, centring, contents listing, paragraph numbering) apply to every copy. "Start this section on a new page" puts each hazard on a new page.
- **No entries** (none on the platform, or none passing the filter): the group prints nothing. The designer notes it on the section.
- **Unbound** (no platform): no copies; the designer's preview shows the template's note instead.

Everything after expansion — the outline, numbering, the contents list, references, landscape, `/[Tag]` values — is the existing machinery, unchanged.

### Filter and sort

- **Filter:** one condition, `{ field, op, value }`. Operators: *is*, *is not*, *contains*, *is empty*, *is not empty*, *at least*, *at most*. *At least* and *at most* compare sort keys: rank for ratings, ISO for dates, numeric-aware text otherwise. *Is* compares printed text, ignoring case. A list field *is*/*contains* when any item does.
- **Sort:** a field and a direction, by sort key; ties keep register order. No sort is register order.
- The same `where` and `sort` shape serves sections, Repeat parts, repeated rows and list tokens.

### In the designer

- The Sections list shows the template once, with a ↻ marker: "Repeats per Hazard".
- The section's categories gain **Repeat**: *Repeat this section* — off, or a collection available in its scope (the platform's children at the top; a hazard's children inside a hazard group); then the filter and the sort. The section's group is shown ("Repeats with: Controls, ‹Control ID›").
- The section preview, with a platform chosen, shows the pages of the first copy, with a note "1 of 12 hazards — the whole document shows them all".

## 4. Lists, repeated rows and Repeat parts (stage 2)

- **List tokens:** the options in §2 (`sort`, `where`, `list`, `empty`) and the chip panel.
- **Repeated rows:** a table part may carry `each`, `where`, `sort`. Its header prints once; each of its rows is a **row template**, printed once per item, in order (two template rows give two rows per item). The row's item joins the scope of its cells. No items: one row, its first cell the table's `empty` text (`Nil`), the rest blank. In the editor: a **Rows** select in the table's head ("One row per: —, Assessment, Reference, …"), then filter and sort; the template rows are marked ↻.
- **Repeat parts:** a new part kind `repeat`, `{ each, where?, sort?, parts: [] }`, holding paragraphs, tables, lines, spaces, page breaks, images and further Repeat parts. Each item prints its parts in turn, in its own scope. It has no heading of its own (a per-item heading is a repeating section). Part ids stay unique across the nesting; every part function (move, delete, cell edit, widths, images) finds a part wherever it is nested. In the editor it is a framed box with its own add bar.
- Your SSRA's "a table for each control" is a Repeat part over Control holding one fixed table; "initial risk" is a table with one row per Assessment, filtered to *Stage is Initial*.

## 5. Fill-ins (stage 3)

- **The token:** `{{fill:<id>?label=<text>}}`, inserted from the Field menu's **To fill in…** item, which asks for its label ("Control rationale"). The id is unique in the design (`fill1`, `fill2`, …).
- **Values:** stored in the report's design, `fills: { <id>: { <instanceKey>: <tokens> } }`. The instance key is the scope's entry keys below the root, `hazard:<key>/control:<key>`; a fill outside any repeat has the key `''`. Values are rich text (bold, italic, code, line breaks, references; no fields).
- **Printing:** a filled value prints its text; an empty one prints **[To fill in: Control rationale]** in bold, the same visible-gap rule as a missing reference.
- **Filling in:** a section whose parts hold a fill token gains a **Fill in** category, listing every copy's blanks under the copy's heading (with a platform chosen), each a rich box. The Sections list marks a section with blanks still empty ("3 to fill in"). The Generate tab counts them with the placeholders and names the sections. Making the document is still allowed, like an unfilled `/[Tag]`.
- **Leftovers:** values for entries no longer in the document (a hazard removed, a filter changed) are kept, not shown in the document, and counted in the Fill in category with **Remove** to clear them.
- Values are the report's: they do not travel in section or report templates. Deleting a section takes its fills with it.

## 6. Sections UI (stage 4)

- **+ Add section** becomes one button with a menu:
  - **Blank section**
  - **Repeating section ▸** the collections at the top level (Hazard, Control, Safety report, Reference)
  - **Register table ▸** the host's tables not yet in the document
  - **From template ▸** the section templates (the separate "From template…" select goes)
- **Register tables are chosen.** The design lists the ones it holds: `registers: ['hazards', 'sfarp', …]`. A design that has never chosen (no `registers`) holds them all, as every design did before; a list, even an empty one, holds exactly those. **✕** on a register table's row takes it out (and its settings, as deleting a section does); **+ Add section › Register table** puts one back, at the end. The include tick still leaves one out without removing it.
- *(Changed while building: the first plan made absent mean none, with schema 8 and a conversion. That broke every host that never chooses and left a new report with only its contents list, so absent means all and no conversion is needed.)*
- **The SSRA starter.** The **Start from** list for a new report offers **SSRA (by hazard)**, a built-in report template declared by the host (PIVOT; DocGen offers what a host declares under `starterTemplates`). It holds the structure agreed in chat: an H1 "Hazard Assessments"; then an H2 repeating per hazard ("‹Hazard ID› ‹Hazard Title›") holding a summary table (title, description, numbered causal factors, lifecycle phases, date-sorted safety report descriptions), a references table (a row per reference), an initial-risk table (a row per assessment, *Stage is Initial*: receptor, likelihood + justification, consequence + justification, level), a Repeat part per control holding a table (ID, title, description, a *Control rationale* fill-in, justification, status), a residual-risk table, and an SFARP table. It is a starting point: once applied it is the report's own design, edited like any other.

## 7. Templates, import and housekeeping

- **Section templates** carry a section's `repeat` and its parts (Repeat parts, repeated rows, chips, fill tokens). **Report templates** carry `registers` and the sections' repeats. Neither carries `fills`.
- **Import validation** accepts the `repeat` part kind (its `parts` validated recursively), a table's `each`/`where`/`sort`, a section's `repeat`, and checks `where`/`sort` shape.
- **Ids:** `allParts` and part lookup reach into Repeat parts, so `nextId('part', …)` stays unique and every part edit finds its part.
- **Images in use:** `imagesInUse` visits Repeat parts' children.

## 8. Errors and edges

- A field the catalogue does not have, or used outside its scope: **[unknown field]** in print, a red chip in the editor.
- A repeat over a collection not available where the section sits (moved out of its hazard group, say): the section prints once with no entry in scope — its fields print **[unknown field]** — and the Repeat category says why.
- A filter on a field the collection does not have: no filter, and the Repeat category says so.
- A host with no `catalogue`: no Field button, no Repeat category; everything else as now.
- Large documents: expansion is linear in entries; nothing is laid out twice.

## What does not change

Styles; the layout engine and the PDF and HTML writers; how references, numbering, the contents list, landscape and placeholders work; the existing register tables' content.

## Testing

- **Tokens and resolution (unit):** scope rules 1–3; list styles; `where` operators per type; `sort` by sort key with ties stable; `empty`; register text with markup prints literally; unknown field.
- **Expansion (unit):** groups by resolved level; nested groups; ids and anchors suffixed; levels pinned; no entries prints nothing; per-section flags on every copy.
- **Repeated rows and Repeat parts (unit):** rows per item with two template rows; empty table row; nested Repeat part scope; part functions find nested parts.
- **Fill-ins (unit):** instance keys; unfilled text; leftovers counted and removed; not in templates.
- **Designer panes:** Field button and menu by scope; chips render and round-trip (`fromNode`); Repeat category; Fill in category; Add section menu; register ✕.
- **Host:** PIVOT's catalogue from a snapshot (keys, children, per-hazard references, sort keys for dates and ratings).
- **Schema 8:** the convert script on a schema 7 body and design files.
- **Browser:** build the SSRA starter on a platform with several hazards; check the preview, the contents list, numbering, a fill-in round trip, and the PDF.
