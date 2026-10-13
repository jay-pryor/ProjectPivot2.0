# Report designs in their own files, and a fixed Default Report Template

**Date:** 2026-10-14. **Status:** approved design, awaiting spec review.

**Where:**
- `src/storage/store.js` (load, save, backups, restore)
- `src/core/data.js` (`SCHEMA_VERSION`)
- `src/reports/docgen-host.js` (new designs, report hosts)
- `src/ui/controller.js`
- `src/ui/screens/reports.js`
- a throwaway script in the scratchpad for the practice data

## Why

New reports start as a copy of "the shared design": the arrangement kept in `data.json` under `reportDesign`. Until the reports-with-their-own-design work, every edit in the designer went into it, so it still holds a test section from an old report. Since the Reports tab tidy-up nothing in the app can change it, so every new report inherits that leftover.

Reports should start from a fixed, clean **Default Report Template** that nothing can change. Each report's design should be a file of its own.

## Decisions (agreed)

1. **A built-in Default Report Template** gives the standard arrangement. It is never edited, and starting from it always gives the same report.
2. **Each report's design is its own file** in the data folder. `data.json` lists the reports.
3. **The old shared arrangement goes.** Only the shared library stays in `reportDesign`: Styles, section templates, report templates and Standard Images.
4. **Pre-release:** `SCHEMA_VERSION` goes to 7, and a one-off script converts the practice data. There is no conversion in the app.

## What changes

### 1. The Default Report Template

- **Start from** lists **Default Report Template** first (value `''`), then the saved report templates. "The shared design" goes.
- **What it gives:** the empty arrangement `{}`. The designer shows every auto-populated section in the standard order, with today's defaults:
  - Section Numbering on;
  - each section on a new page;
  - generated tables centred;
  - the Standard Style;
  - no sections of your own.
- **A saved template** gives that template applied to the empty arrangement, as now, including bringing its Style into the shared library under its own id.
- **A report whose design is missing** (Section 2) opens on the Default Report Template.

### 2. A report's design file

**Where and what:**
- Path: `files/reports/<report id>.json`.
- Contents: `{ "format": "pivot-report-design", "version": 1, "reportId": "<id>", "design": { … } }`, as pretty-printed JSON.

**In memory, nothing changes:** the design is held on the report record (`record.design`). Merging, the browser's copy of unsaved work and the designer all work as today. Only the folder layer moves it in and out.

**Loading** (`readDisk`):
- After `data.json` is opened, each live report's file is read in parallel and its `design` attached.
- A live report saved without a file comes back with no `design`. Its id is listed in `missingDesigns`, which `load` returns.

**Saving** (`save`):
- **What is merged:** the disk's `data.json` *with its designs attached* is what mine is merged with, so clashes over a report's design behave as record clashes do now.
- **Writing designs:** before `data.json` is written, each report whose design differs from the disk's has its file written.
  - Doing this first means a failed design write stops the save before `data.json` changes.
  - A design file newer than its `data.json` entry is harmless: it is still a valid design.
- **Writing `data.json`:** it is written with `design` taken off every report.
- **A deleted report's file** is left in the folder.
- **The second disk read** (the "has anyone saved meanwhile" check) does not need designs, and does not read them.

**Backups:**
- `backupIfDue` already writes the in-memory data, which carries the designs, so a backup holds every report's design inline. It is one file, as now.
- `restore` writes each restored report's design file, then `data.json` without designs.
- Superseded Saves keep only `data.json`, as now.

**The browser's copy of unsaved work** is unchanged. It holds designs with the records, as today.

### 3. What is left of the shared design

- `reportDesign` keeps only the library keys: `formats`, `sectionTemplates`, `reportTemplates`, `standardImages`.
- The report host (`hostFor`) lays a report's own design over that library, as now. Without a design it uses `{}`, the Default Report Template, rather than a copy of the shared arrangement.
- `newDesign('')` returns `{}`.
- **The shared host's role:** the designer always opens on a report. The shared host remains only as the base the report hosts extend, so it has no heading and no "Default for new reports".
- **Removed actions:** `openDesigner`, and `produceReport` as a way to make a report without one. `generateFromDesigner` requires an open report, and every made report is a report record with its own design. Tests and seed scripts move to `startReport`.

### 4. The Reports list

A live report listed in `missingDesigns` shows a **Design missing** tag next to its title, with the tooltip "Its design file is not in the folder; it opens on the Default Report Template". The controller keeps `missingDesigns` from the last load or save.

### 5. Practice data

- **Schema:** `SCHEMA_VERSION` goes 6 → 7. A version-6 `data.json` is refused as now, by whatever the envelope does for an older version.
- **A throwaway script** (scratchpad, not in the repo), given a data folder:
  - writes `files/reports/<id>.json` for every report record that has a `design`;
  - removes `design` from those records;
  - removes every non-library key from `reportDesign`;
  - writes `data.json` back at version 7, with its envelope stamp updated.
- **Running it:** on `ConversionFiles` (and any folder the user names), after a backup copy of each file it changes.

## What does not change

- How a report is designed, made, downloaded, saved and merged.
- The browser's copy of unsaved work.
- The library: Styles, templates, Standard Images.

## Testing

**`test/storage` (with the MemoryFolder fake):**
- A save writes each changed report's design file and a `data.json` without designs.
- A load attaches designs, and lists a live report with no file in `missingDesigns`.
- Saving over someone else's newer save merges the designs as records.
- A backup holds the designs, and restoring it writes the files back.
- A deleted report's file is left alone.

**`test/reports/docgen-host.test.js`:**
- `newDesign('')` is `{}`.
- A report with no design opens on `{}` and not on any leftover shared arrangement.

**`test/ui/controller*.test.js`:**
- `openDesigner` and producing a report without one are gone.
- Make PDF from an open report works as before.
- After a reload, `missingDesigns` reaches the state.

**`test/ui/render.test.js`:**
- Start from lists Default Report Template first.
- The Design missing tag.

**The conversion script:** run on a copy of `ConversionFiles` and load the result in the browser: reports open with their designs, and a new report starts clean.

**Browser walkthrough:**
- Start a report from the Default Report Template: no test section.
- Edit it, save, and check the file appears in `files/reports/`.
- Reload: the design comes back.
- Delete the file and reload: the Design missing tag shows and the report opens on the default.
