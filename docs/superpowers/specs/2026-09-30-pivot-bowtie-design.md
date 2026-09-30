# Pivot: bow-tie diagrams (release 3, part a)

Date: 2026-09-30. Status: approved in conversation by jay-pryor; for review as written.

## 1. Purpose

Draw the bow-tie of one hazard on one platform, with the controls chosen by filters, and let people
compare two diagrams side by side: different platforms, or the same platform with different sets of
controls. A person can save a diagram's choices as a named view, keep it personal, and share it with
chosen profiles.

This is part (a) of release 3: the bow-tie view and SVG export. Image support in DocGen (b) and
bow-ties in reports (c) wait for the DocGen tidy-up and are out of scope here.

## 2. Decisions (jay's)

| Question | Decision |
|---|---|
| Scope of this cycle | The view and SVG export only; (b) and (c) later. |
| Which controls are drawn | Existing controls and additional controls, rejected hidden by default, each marked with its set and status. |
| Filters | A set filter (Existing / Additional / All) and, for additional controls, a tick per status (Recommended, Planned, Implemented, Rejected). |
| Comparing | Two windows side by side, placed by dragging to the left or right of the screen; each has its own hazard, platform and filters. |
| What a saved view holds | Name, hazard, platform and filters. |
| Who sees it | Its owner; the owner can share it with chosen profiles, who see it in a separate "Shared with me" section. |
| What sharing allows | Open, export and save a copy. Only the owner changes, renames, shares or deletes it. |
| Where it lives | A Bow-ties page in the top bar; a hazard's platform tab links to it. |
| Storage | A new record kind in the shared data file. |

## 3. What a diagram shows

- **Columns, left to right:** causal factors, preventative controls, the hazard, mitigating controls,
  consequences. A line joins each causal factor to the hazard and the hazard to each consequence;
  controls sit on those wings as barriers.
- **Hazard box:** the H-number and title.
- **Caption:** the platform's name and the filters, e.g. *Frigate · Existing + Additional (Planned,
  Implemented)*.
- **Control box:** the C-number and title, and a last line naming its set and status in words:
  *Existing · Engineering* (the tier; *Existing* alone when it has none) or *Additional · Planned*
  (or Recommended, Implemented, Rejected). Existing controls have a solid border and additional
  controls a dashed one, so colour is never the only difference.
- **Order:** causal factors and consequences in the hazard's order; within a wing, existing controls
  first, then additional controls, each by tier then number (as `existingControlsOn` and
  `controlsOnPlatform` already sort).
- **Unsaved window:** Save on a window with no view asks for a name, as Save as… does.
- **Empty wing:** a line saying so, e.g. *No preventative controls in this view*.
- **Text:** never truncated. Long text wraps at spaces; each box carries its full text as a
  `<title>` for hover.
- **Freshness:** built from the working data every time it is drawn. A saved view stores choices,
  never a picture.
- **Cannot draw:** if the hazard is deleted or retired, or is no longer on the platform, the window
  says which instead of drawing.
- **Export SVG:** each window exports exactly what it shows, caption included, as one self-contained
  SVG file through the same save-file picker as report downloads.

## 4. The Bow-ties page

A **Bow-ties** tab in the top bar, between Platforms and References.

**Side list** (left):
- **New diagram:** pick a hazard and a platform it is on; it opens in a window.
- **My views:** the active profile's views by name, with hazard and platform beneath.
- **Shared with me:** views other profiles have shared with the active one, with the owner's name.
- A search box narrowing both lists on screen.
- A view whose diagram cannot be drawn (section 3) is listed with a warning.

**Stage** (right): one or two windows. A window has a title bar (the view's name, or *Unsaved: H-12
on Frigate*), its filters, the diagram, and Save, Save as…, Share…, Export SVG and Close.

**Placing windows:**
- One window fills the stage.
- Dragging a window's title bar, or a view from the side list, shows two drop targets, **Left** and
  **Right**. Dropping splits the stage: the dropped window takes that half and the other window the
  other half.
- Dropping onto an occupied half replaces it; if that window has unsaved filter changes, the person
  is asked first.
- Closing one of two windows gives the other the whole stage.
- Clicking a view in the list opens it in the window used last.
- Each list item and window has a menu with *Open left*, *Open right* and *Swap sides*, calling the
  same handler as a drop, so everything works from the keyboard.
- At most two windows. On a narrow screen the halves stack.

**Saving and sharing:**
- **Save** updates the view when the active profile owns it. On a view shared with them it is
  **Save a copy**, which lands in My views.
- **Save as…** makes a new view owned by the active profile.
- **Share…** is a tick-list of the other profiles; unticking removes the view from that person's
  Shared with me.
- **Rename** and **Delete** are in the menu of the active profile's own views. Delete asks first and
  can be undone like any change.
- Views reach other people through the normal Save of the data file.

**A hazard's platform tab** has an **Open bow-tie** button that goes to the page with that hazard and
platform in a window.

**Remembered per browser:** which views are open, on which side, and their current filters, per
folder and profile, in `localStorage`. A missing or broken value restores one empty window.

## 5. Data

- `bowtieView` joins `KINDS`: `{ name, ownerId, hazardId, platformId, filters: { set, statuses },
  sharedWith: string[] }` with the usual header. `set` is `existing`, `additional` or `all`;
  `statuses` is a subset of `CONTROL_STATUSES`. Files without the kind get an empty collection
  (as `normalizeData` does for every kind).
- Changes to views are recorded in History but never wait for acknowledgement: their actions join
  `NOT_ACKNOWLEDGED`.
- Deleting or retiring a hazard, or unlinking it from a platform, leaves views of it in place; they
  show the warning of section 4, and the owner can delete them.
- `sharedWith` never holds the owner. Visibility is the screen's rule: a profile sees views it owns
  and views whose `sharedWith` holds it.

## 6. Build

| File | Job |
|---|---|
| `src/core/bowtie.js` | `bowtieOf(data, hazardId, platformId, filters)`: the diagram's contents after filtering, or the reason it cannot be drawn. No drawing. |
| `src/ui/bowtie-svg.js` | `bowtieSvg(bowtie)`: one self-contained SVG string (layout, wrapping, borders, caption), used on screen and in the export. Adapted from `archive/hyperion/modules/bowtie/src/bowtie.js`. |
| `src/core/ops/bowtie-views.js` | `saveBowtieView`, `renameBowtieView`, `shareBowtieView`, `deleteBowtieView`, `copyBowtieView`; changes by anyone but the owner are refused with a plain message. |
| `src/ui/screens/bowties.js` | The page: side list, stage, windows; render()/wire() like the other screens. |

- **Controller state:** `workspace: { panes: [left, right], lastUsed }`; a pane is `{ viewId | null,
  hazardId, platformId, filters }`, and is unsaved when its choices differ from its view's.
- **Drag and drop:** the browser's own (`draggable`, `dragover`, `drop`); `wire()` shows the drop
  targets while a drag is on.
- `KIND_LABEL` and `recordName` gain the new kind (*Bow-tie view*, named by its name).

## 7. Testing

- `bowtieOf`: every set and status combination selects exactly the right controls; rejected hidden
  by default; each cannot-draw reason.
- `bowtieSvg`: one box per item carrying its record id; text whole; columns in order with no overlaps;
  existing and additional drawn differently; caption names the platform and filters.
- Ops: owner-only changes; share and unshare; copy of a shared view; the kind merges on save like
  other records; its changes need no acknowledgement.
- Screens and controller: My views and Shared with me per profile; placing, replacing (with the
  unsaved-changes question), swapping and closing panes; a broken remembered workspace falls back to
  one empty window.
- In the browser at the end: a real drag, both themes, a narrow screen, an exported SVG opened on its
  own.
