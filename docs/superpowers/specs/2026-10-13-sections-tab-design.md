# Report designer: a friendlier Sections tab

**Date:** 2026-10-13. **Status:** for review. **Where:** `DocGen/doc-designer.js` (the Sections pane and the section list), `DocGen/doc-designer.css`, `src/ui/styles.css`.

## Why

PIVOT is going to team members who have never seen it. The Sections tab currently stacks every option for a section in one long column (heading, placement, introduction, table wording, column widths, a note, then the preview at the bottom) with a line of explanation under most of them. The preview, the thing that shows what a change does, is the furthest thing from the change. This makes the tab hard to learn.

Already done on the branch (`sections-tab`): the section list is resizable and the "Name in this list" box is gone.

## What changes

### 1. Three columns, the same shape as the Styles tab

The Sections tab becomes: **section list** (left, resizable, unchanged) | **settings for the chosen section** | **live preview of that section**.

- The settings column has a **category menu** on its left (the same look as the Styles pane's section list and the record pages' section menu), and the fields of the chosen category beside it.
- The preview column shows the selected section cropped from the laid-out pages (as now), with its zoom buttons. It is always visible beside the settings and scrolls on its own.
- The category last chosen is kept when moving between sections, where that section has it; otherwise the first category opens.

### 2. Categories

| Category | Shown for | Holds (existing controls, moved, not changed) |
|---|---|---|
| **Heading** | every section | the heading text (generated: "Heading in the document"; own section: "Heading"); the heading level (the same choice as the list's level box) |
| **Placement** | every section | centre the section; start on a new page; leave out of the contents; space above (mm) |
| **Introduction** | generated sections (including Meta) | the introduction text with its toolbar; "Number it" |
| **Table** | generated sections with columns | which optional columns and groups (moved here from the ☰ menu on the list row; the ☰ button goes); title row; caption; no caption; column headings; column widths |
| **Rows** | Meta ("About this platform") | which details it lists (the existing picker) |
| **Content** | your own sections | the paragraphs, tables, lines, spaces and page breaks, with their + buttons; Save as template; Delete section |

The Contents section shows Heading and Placement only.

### 3. No single lines of explanation

Across the whole designer (all five tabs), the one-line explanatory paragraphs (`<p class="muted">…` / `rd-hint` notes such as "These are the columns this section's table will have…") are removed. Where a field is not self-explanatory, a short version moves into the field label's hover tooltip (`title`) or the box's placeholder. Kept: messages that report state rather than explain (for example "The Standard style … cannot be changed", values held by a Style, placeholders still to fill, characters the PDF cannot show, empty states such as "Nothing in this section yet.").

### 4. Smaller changes

- **Opens on a section.** With nothing selected, the Sections tab opens the first section rather than "Pick a section on the left to open it."
- **The preview follows typing.** Text boxes in the Sections tab (heading, introduction, table wording, paragraphs and cells) update the preview about half a second after typing stops, not only when the box is left. Focus and the caret stay where they are; only the preview redraws.
- **The section list's blurb goes** (the paragraph above "+ Add section").
- **Plain level names** in the list's level box and in the Heading category: **Auto (Heading 1)**, **Title**, **Heading 1–4**, **Normal text** (was Auto (H1), T, H1–H4, N). The level-skip warning reads "↰ Heading 2" rather than "↰ H2".
- **Tags under each name in the list:** **Auto-populated** (a section generated from the register), **Meta** (the platform's details), **Table of Contents**; a section you added gets no tag.

## What does not change

- What the report contains or how it is laid out: every control keeps its storage and its effect.
- The other tabs' layouts (they lose only their one-line explanations).
- The section list's order, ticks, ▲/▼, dragging and resize.

## Testing

- Pane tests (`test/docgen/designer-panes.test.js`): the three-column structure; each kind of section offers exactly its categories; each category renders its existing controls (by their `data-rd-*` attributes); the ☰ button is gone and the column/group ticks are in Table; no explanatory paragraphs remain (a guard listing the allowed state messages); the Sections tab opens on the first section; level labels and list tags as above.
- The live-preview-on-typing path is DOM-only: checked in the browser walkthrough (type in a heading and an introduction, see the preview change, focus kept).
- Browser walkthrough of every category for a generated section, Meta, Contents and an own section, in both themes.
