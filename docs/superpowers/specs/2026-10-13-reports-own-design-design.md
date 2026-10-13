# Reports with their own design, a status, and Save in the designer

**Date:** 2026-10-13. **Status:** approved design, awaiting spec review.

**Where:**
- `src/ui/screens/reports.js` (the Reports tab)
- `src/ui/controller.js` (the actions)
- `src/core/ops/reports.js` and `src/core/data.js` (the report record)
- `src/storage/mirror.js` (the browser's copy of unsaved work)
- `src/reports/docgen-host.js` (the designer's host)
- `DocGen/doc-designer.js` and `DocGen/doc-designer.css` (the designer's header)
- `src/ui/mount.js` (wiring the designer's Save button)

## Why

Today the folder has one report design that everyone shares, and each Make PDF adds a finished snapshot to the Produced reports list. A report cannot be worked on, put aside and come back to. Two people shaping two different reports overwrite each other, because the shared design is saved as one whole thing.

From now on, each report is a piece of work with its own name, its own design and a status. The designer also gets the app's Save button, so work done there can be saved without leaving it.

## Decisions (agreed)

1. **A report has its own copy of a design.** Editing one report never changes another.
2. **The starting point is chosen when a report is made:**
   - the shared design (the default);
   - or any saved report template.
3. **The shared design stays.** It is edited through the existing "Open the report designer" button, as the default for new reports.
4. **Two statuses:**
   - **In-Progress** when a report is made, and again after any change to its design.
   - **For Review** after Make PDF or Make HTML.
5. **Making a report again replaces its made document.** One report, one current version.

## What changes

### 1. Save in the designer

The designer's header (beside ×) shows the app's Save button, with the same states and wording:
- **Save**, when there are unsaved changes, with their count as in the top bar;
- **Saving…** while it runs;
- **Saved**.

It runs the app's own save: records, the shared design and every report's design. The top bar's button is behind the designer, so this one is the way to save while it is open. Messages after a save (merged, replaced) appear as they do now.

### 2. Making a report from the Reports tab

Above the Produced reports list, a row:

**Report name** [box] · **Start from** [The shared design ▾ / each report template by name] · **[Open in Report Designer]**

- **The name is required.** With the box blank, the button is disabled and its tooltip says why.
- **Pressing the button:**
  - adds a report record (Section 4) at stage In-Progress, by you, now;
  - its design is a deep copy of the chosen starting point:
    - the shared design;
    - or the template's sections, order, levels, wording and Style, built the way Apply does;
  - opens the designer on it.
- **Saving:** the new report is an unsaved change like any other new record, and Save keeps it.

The existing "Open the report designer" button stays, unchanged in what it does. The designer's header then reads **Default for new reports**, so it is clear which design is open.

The explanatory paragraph under the Reports heading is shortened to one line saying the designer edits the default for new reports, and each report has its own copy.

### 3. The Produced reports list

| Column | Change |
|---|---|
| **Status** (new, after Title) | **In-Progress** or **For Review**, as a tag. |
| Produced | When it was last made. Blank (—) while it has never been made. |
| Title | The report's name. |
| Download | PDF and HTML only once the report has been made. |
| **Open** (new, before the delete column) | A small icon button (a pencil, ✎). Its tooltip and accessible name are **"Open in Report Designer"**. |

The new report row shows at the top, as the newest reports do now.

### 4. The report record

A report record gains:

| Field | What it holds |
|---|---|
| `stage` | `'in-progress'` or `'for-review'`. Record `status` (`live`/`deleted`) is already taken. A record with no `stage` (every report made before this) counts as For Review. |
| `design` | The report's own design, in the same shape as the shared design. A report with no `design` (made before this) opens with a copy of the shared design, taken when it is opened. |
| `title` | The name typed. It is also the document title when made. |
| `platformId` / `platformName` | Taken from the designer's platform choice when the report is made, as now. While In-Progress the list shows the platform last chosen for it in the designer, or — before one is chosen. |

The made document, Style, `producedAt` and `producedBy` are set when it is made.

**History:**
- Making a report writes a history entry, "Make report", as producing one does now.
- Creating one writes "Start report".
- Edits to a report's design are **not** written to the history, as edits to the shared design are not. They are many and small (every tick).
- `design` joins `document`, `style` and `html` as fields the history leaves out.

**No conversion:** old reports simply lack `stage` and `design`, and `normalizeData` leaves them as they are. `SCHEMA_VERSION` stays at 6, because no existing field changes.

### 5. The designer, open on a report

- **What it edits:** the designer edits the report's `design` instead of the shared design. The host's `getState`/`commit` read and write `records.report[id].design` for the open report.
- **Header:** the report's name, and its status as a tag.
- **Stage:** any commit that changes the design of a For Review report sets its stage back to In-Progress, in the same change.
- **Platform:** the platform chosen in the designer is stored on the report (`platformId`) and is chosen again when it is reopened.
- **Make PDF / Make HTML:**
  - make the document from the report's own design;
  - store it on **this** report (document, Style, `producedAt`, `producedBy`, `platformId`/`platformName`, classification);
  - set stage For Review;
  - then download as now.
  - They no longer add a new report.
- **Opening an old report:** the button on a report with no `design` gives it a copy of the shared design on opening. Opening never changes a report's stage by itself.

### 6. Saving and merging

- **Separate records:** a report's design is part of its record, so it is merged per report. Two people working on two different reports no longer clash.
- **Same report:** two people changing the same report is a record conflict, reported as conflicts are now ("Report: <name>").
- **The browser's copy of unsaved work** currently drops the document of a saved report on the assumption that it never changes. It now keeps a saved report's document whenever it differs from the saved one (`producedAt` differs), so a report made again since the last save survives a recovery.

### 7. Images

`imagesInUse` also counts every live report's `design`, so the tidy-up after a save keeps images that any report uses.

## What does not change

- How a report is drawn (layout, PDF, HTML, Styles), and how templates are saved and applied.
- Deleting a report: the same × and confirmation.
- Downloading: same buttons, same file names.

## Testing

**Core (`test/core` / `test/ui/controller*.test.js`):**
- A report starts In-Progress with a deep copy of the shared design or of a template.
- Editing its design sets a For Review report back to In-Progress and does not write history.
- Making it sets For Review, stores the document on the same record, and adds no new report.
- An old report counts as For Review, and opening it gives it a copy of the shared design.
- Two saves changing two different reports merge without conflict.
- The browser copy keeps a re-made report's document.

**Host (`test/reports/docgen-host.test.js`):**
- A host opened on a report reads and writes that report's design and leaves the shared design alone.
- `imagesInUse` counts report designs.

**Screens (`test/ui/screens-*.test.js`):**
- The name row: the button is disabled while the name is blank, and Start from lists the shared design and the templates.
- The Status column.
- Download buttons only once made.
- The Open icon with its tooltip.

**Designer (`test/docgen/designer-panes.test.js`):**
- The header shows Save, its states, and the report's name or "Default for new reports".

**Browser walkthrough:**
- Make a report from the tab, edit it, save from the designer's button, and Make PDF (For Review).
- Edit it again (In-Progress), reopen it from the list, and check the old reports.
- Check both themes.
