# Ariadne Desk: the desk app

Part of the [Ariadne Desk](../../README.md) repository; the measured
badges, and what each one counts, are in its README.

A desk for 50,000 service requests in one grid, keyboard first.

- **Filters with counts**: status, priority, SLA breached and region
  chips, each with the number of requests it would show, and a text search
  over ID, client, owner, tags, comment and author, marked in the cells.
- **Views**: four built-in views, saved views kept in this browser, and
  a link that carries the current view (`?view=`). The desk opens on
  "Needs action": the requests not yet approved, rejected or closed, with
  their SLA hours, the least time first.
- **Roles**: an operator sees three regions and no margin columns, and
  has no bulk changes or export; a manager sees everything.
- **Bulk changes** on the selection (Space, Shift with the arrows, Ctrl or
  Cmd with A), undone from the toast or with Ctrl or Cmd with Z.
- **Inline edits** of status and comment (Enter, F2 or a double click), checked before
  they are saved: an approval needs a comment, a comment has at most 200
  characters, a rejected request needs one.
- **Edit conflicts**: a simulated colleague edits rows now and then
  (`?colleague=off` stops it, `?colleague=N` sets the mean interval in
  seconds, the "Colleague's edit" button or C makes one now). The demo's
  own controls (the role and the colleague's edit) sit in a strip of
  their own above the desk, which says what the colleague does. When the
  colleague changes the cell you are editing, saving opens a dialog with
  both values and the one you started from.
- **CSV export** of the current view, its columns and order, at most
  5,000 rows.
- **Columns**: show, hide and reorder them; ID and client stay pinned.
- **Narrow screens** (below 40rem, a phone): no column is pinned, so the
  grid scrolls sideways to every column, and the filter groups fold into
  one line above the grid.
- **Shortcuts**: `?` lists them, `/` goes to the search, G to the grid, X
  clears the filters, S saves the view, E exports.

Loading, a partial load failure (`?failChunk=3` fails one 5,000-row chunk
once, with a retry), no matches, and running without a worker
(`?worker=off`) each have their own state; changes are announced to
screen readers. A performance panel at the bottom shows what this tab
measured.

The header switches the theme (System, Light, Dark; System by default)
and the language (English, Russian, Arabic right to left with
Arabic-Indic digits); both are kept in the link (`?theme=`, `?lang=`) and
for the next visit. The data follows the language: the same rows, with
client names, places, people and comments from the engine's pool for that
language.

## Engine

[`@ariadne/grid`](../../packages/grid) (TypeScript, no runtime
dependencies) generates the requests and does the data work:
columnar store, filters with facet counts, sorting, search, views, role
rules, edit validation, undo history, the simulated colleague and CSV.
Generation, filtering, sorting, search and CSV run in a Web Worker: the
desk worker answers the engine's own `generate` and `retry` requests with
its chunk producer (so the engine's `DatasetLoader` drives it), keeps a
copy of every chunk it sends, and answers queries over that copy. Edits
are made on the page's store through the engine's `EditHistory` and
copied to the worker. Without a worker the same code runs on the main
thread.

The interface is React and TypeScript on the
[Stoa](https://github.com/ghostjima/stoa) design system; the grid is
Stoa's DataGrid (virtualised, pinned columns, sort, selection,
active cell, inline editors). Everything runs in the browser.

## Accessibility, as far as the tests go

The end-to-end tests (Playwright, Chromium) run axe-core 4.13.0 and find
no serious or critical violation in English, Russian and Arabic, each in
the light and the dark theme, on: the loaded desk, a selection with the
bulk bar, an editor showing an error, the shortcuts, save-view and
columns dialogs, no matches, loading, a partial load failure with the
operator role; and on the conflict dialog with a toast in Arabic, dark.
They also check: the main tasks by keyboard (grid moves, sorting from a
header, editing and its errors, selecting rows, undo, the app
shortcuts) and editing with the mouse (a double click opens the editor);
where the focus goes after a bulk change, a Retry, the conflict dialog
and deleting a view (never to the page's body), and that Escape in the
conflict dialog keeps the typed value; Arabic right to left with the
arrow keys mirrored and the pinned columns at the right, `lang` and
`dir` set before the application's script runs, US$ read in its own
order, and tabular Arabic-Indic digits; no sideways page scroll at 1280
and 375 px in every language, and at 375 px every column reachable and
editable, with an axe scan in each language; the header staying put
while the page scrolls under it, and the page's and the grid's
scrollbars drawn in Stoa's tokens.
Screen readers were not tested by hand.

## Measurements

On commit `7da277e` of the Valkyra-Labs/argus-desk repository, Apple M4
Pro, Chromium 153 headless, production build, 50,000 rows by 30 columns:
first rows on screen about 120 ms from navigation; a filter chip about
32 ms from input to the repainted grid (p95 under 34 ms), a typed search
about 15 ms, a sort about 35 ms; worker round trip p50 13 ms with 1.3 ms
of compute; scrolling 0 of 1,260 frames over 20 ms; a key move under 1.2
ms of main-thread work; main-thread JS heap 12.6 MiB after load;
JavaScript 719 KiB (209 KiB gzip) plus a 21 KiB worker.
Method, both runs and limits:
[docs/MEASUREMENTS.md](docs/MEASUREMENTS.md).

## Development

Stoa is linked from a sibling checkout: clone
[ghostjima/stoa](https://github.com/ghostjima/stoa) next to this
repository and build it (`pnpm install --frozen-lockfile && pnpm build`).
At this repository's root, `pnpm install --frozen-lockfile && pnpm build`
builds the engine and the apps; then, from this folder:

```bash
pnpm dev                          # http://localhost:5182
pnpm test && pnpm e2e             # e2e builds and serves on port 4178
pnpm build && pnpm measure        # the measurement record
```

`pnpm e2e` builds the app every time and tests the build through
`vite preview` on 4178; `E2E_PORT` moves it to another port, as CI does:

```bash
E2E_PORT=4181 pnpm e2e
```

## License

MIT OR Apache-2.0, at your option.
