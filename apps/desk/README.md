# Ariadne Desk: the desk app

Part of the [Ariadne Desk](../../README.md) repository; the measured
badges, and what each one counts, are in its README.

A desk for the complaints register of a bank, keyboard first: the cases
in one grid, each with its legal deadline counted by the rules engine.

- **The register**: 1,200 invented complaints received over four months
  (about 300 a month, a few hundred open), in four streams: complaints
  under 442-FZ, money claims under 123-FZ, blocks under 161-FZ with the
  sign of Order No. OD-2506, refusals under 115-FZ with their category.
  `?scale=50000` opens the scale mode, the same generator over 50,000
  rows.
- **Deadlines**: the reply's last day and the working days left, counted
  from the day the data is taken (6 October 2026) by ariadne-rules on its
  production calendar; extended by ten working days where the rules allow
  it.
- **Filters with counts**: stage, deadline (overdue, due within 3 working
  days, later, answered), stream and source chips, each with the number of
  cases it would show, and a text search over case, applicant, subject,
  operation, assignee and note, marked in the cells.
- **Views**: open cases (where the desk opens, the least time left first),
  due within 3 working days, overdue, forwarded by the Bank of Russia,
  waiting for facts, awaiting signature and all cases; saved views kept
  in this browser, and a link that carries the current view (`?view=`).
- **Roles**: the operator works the cases assigned to them (the stage up
  to signature, the decision, the ground, notes); the signatory signs and
  sends the replies assigned to them, or returns one to drafting; the
  supervisor sees every case, approves extensions, reassigns cases in
  bulk and exports.
- **Inline edits** of the stage, the decision, the ground, the extension,
  the assignee and the note (Enter, F2 or a double click), checked by the
  engine before they are saved: a refusal needs a legal ground of its own
  stream (161-FZ and 115-FZ are not mixed), a reply goes to legal review
  only once decided and out only after signature, a money claim under
  123-FZ is never extended, an extension comes no later than the last day
  for its notice, a note has at most 200 characters.
- **Bulk reassignment** of the selection (Space, Shift with the arrows,
  Ctrl or Cmd with A), undone from the toast or with Ctrl or Cmd with Z.
- **Edit conflicts**: a simulated colleague edits cases now and then
  (`?colleague=off` stops it, `?colleague=N` sets the mean interval in
  seconds, the "Colleague's edit" button or C makes one now). The demo's
  own controls (the role and the colleague's edit) sit in a strip of
  their own above the desk. When the colleague changes the cell you are
  editing, saving opens a dialog with both values and the one you started
  from.
- **CSV export** of the current view, its columns and order, at most
  5,000 rows.
- **Columns**: show, hide and reorder them; the case and the applicant
  stay pinned.
- **Narrow screens** (below 40rem, a phone): no column is pinned, so the
  grid scrolls sideways to every column, and the filter groups fold into
  one line above the grid.
- **Shortcuts**: `?` lists them, `/` goes to the search, G to the grid, X
  clears the filters, S saves the view, E exports.

Loading, a partial load failure (`?failChunk=1` fails one 400-row chunk
once, with a retry), no matches, and running without a worker
(`?worker=off`) each have their own state; changes are announced to
screen readers. A performance panel at the bottom shows what this tab
measured.

The header switches the theme (System, Light, Dark; System by default)
and the language (English and Russian); both are kept in the link
(`?theme=`, `?lang=`) and for the next visit. The data follows the
language: the same cases, with names, complaint texts and notes from the
engine's pool for that language.

## Engine

[`@ariadne/grid`](../../packages/grid) generates the register and does
the data work: columnar store, filters with facet counts, sorting, search,
views, role rules, edit validation, undo history, the simulated colleague
and CSV. Its legal dates come from
[ariadne-rules](../../crates/ariadne-rules) through
[`@ariadne/rules`](../../packages/rules), the WebAssembly build of the
Rust engine, which the worker loads before it generates a row.
Generation, filtering, sorting, search and CSV run in a Web Worker: the
desk worker answers the engine's own `generate` and `retry` requests with
its chunk producer (so the engine's `DatasetLoader` drives it), keeps a
copy of every chunk it sends, and answers queries over that copy. Edits
are made on the page's store through the engine's `EditHistory` and
copied to the worker. Without a worker the same code, the rules module
included, runs on the main thread.

The interface is React and TypeScript on the
[Stoa](https://github.com/ghostjima/stoa) design system; the grid is
Stoa's DataGrid (virtualised, pinned columns, sort, selection,
active cell, inline editors). Everything runs in the browser.

## Accessibility, as far as the tests go

The end-to-end tests (Playwright, Chromium) run axe-core 4.13.0 and find
no serious or critical violation in Russian and English, each in the
light and the dark theme, on: the loaded desk, a selection with the bulk
bar, an editor showing an error, the shortcuts, save-view and columns
dialogs, no matches, loading, a partial load failure with the operator
role; and on the conflict dialog with a toast in Russian, dark. They also
check: the main tasks by keyboard (grid moves, sorting from a header,
editing and the rules' refusals, selecting rows, undo, the app
shortcuts) and editing with the mouse (a double click opens the editor);
where the focus goes after a bulk change, a Retry, the conflict dialog
and deleting a view (never to the page's body), and that Escape in the
conflict dialog keeps the typed value; `lang` set before the
application's script runs; no sideways page scroll at 1280 and 375 px in
both languages, and at 375 px every column reachable and editable, with
an axe scan in each language; the header staying put while the page
scrolls under it, and the page's and the grid's scrollbars drawn in
Stoa's tokens. Screen readers were not tested by hand.

## Measurements

Taken on commit `7da277e` of the Valkyra-Labs/argus-desk repository, on
the register this desk replaced (50,000 sales requests by 30 columns), and
kept as a record: they are not current for the complaints register until
taken again. Apple M4 Pro, Chromium 153 headless, production build: first
rows on screen about 120 ms from navigation; a filter chip about 32 ms
from input to the repainted grid (p95 under 34 ms), a typed search about
15 ms, a sort about 35 ms; worker round trip p50 13 ms with 1.3 ms of
compute. Method, both runs and limits:
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
