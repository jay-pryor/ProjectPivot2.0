# Pivot

A hazard register for platforms: hazards stored once and linked to many platforms, a shared
control library, per-platform control decisions and risk ratings on the company matrix, full
change history, and reports produced through the DocGen document designer.

Pivot is one file, `pivot.html`, opened from the shared data folder in a Chromium-based
browser. Nothing is installed.

```
npm install        # TypeScript, for the type check only
npm test           # every test, including DocGen's own suite
npm run build      # -> dist/pivot.html
npm run typecheck
```

Always run `npm run build` after any change to the source, so `dist/pivot.html` is never
behind the code.

## The data folder

Everything Pivot stores is in the folder you choose when it opens:

- `data.json`: the register itself. Pivot only ever writes it whole, with a check it verifies on
  every open. **Don't move, rename or edit it by hand.** If it goes missing while someone has Pivot
  open, their next save keeps what they had, but anyone who opened the folder in between starts
  from an empty register.
- `profiles.json`: the list of people.
- `backups/`: a copy of the register taken at most once an hour while people work; the newest 72
  are kept. Restore one from the Backups page.
- `Superseded Saves/`: when two people save over each other, Pivot merges their changes and keeps
  the other person's file here first, exactly as they left it. Pivot never reads it; it is there
  so nothing is ever lost. Old files can be deleted by hand once you are happy with the register.

## Documents

- Design: `docs/superpowers/specs/2026-09-28-pivot-rebuild-design.md`
- Release 1 plan: `docs/superpowers/plans/2026-09-28-pivot-release-1.md`
- The earlier build, for reference only: `archive/hyperion/`
