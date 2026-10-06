# Measurements

Taken in the Valkyra-Labs/argus-desk repository before its import here; the
commits named below are that repository's.

Taken on commit `7da277e` (the code as it is now; only documentation
followed it) with `pnpm build && node scripts/measure.mjs`, run twice in a
row on 2026-10-04. Cells read run 1 / run 2.

Host: Apple M4 Pro (12 cores), 24 GB, macOS 26.6.2. Browser: Chromium
153.0.8010.12 headless (Playwright 1.63.0). Node 22.18.0. Viewport
1440 x 900. Production build served by `vite preview`. Engine: argus-grid
`091a721`, built locally. Dataset: 50,000 rows by 30 columns, seed
20260904, generated in the desk worker.

## What each number measures

- **First rows**: from navigation start to the first painted frame with
  rows in the grid (the app's `argus:first-rows` performance measure: a
  layout effect after the first result, then a frame, then a task). Five
  fresh page loads; median, min and max. Generation of all 50,000 rows in
  the worker is inside it.
- **Filter and sort latency**: from the input handler (the chip's change,
  the search field's change, the header's sort) to the frame after the grid
  committed the matching result (`argus:filter`, `argus:sort`): the worker
  query, the message both ways, React's render and one frame. 40 chip
  toggles over six chips, 30 search values, 30 header clicks over five
  columns (two numeric, three text). Nearest-rank p50 and p95, and the
  worst sample.
- **Worker round trip**: from posting a query to receiving its result on
  the main thread (`argus:round-trip`), every query of the session above
  (104, including the first one after load). **Worker compute** is the
  time the worker reports for sorting, building the search index and
  filtering in those same queries.
- **Scroll frames**: intervals between animation frames while a script
  scrolls the grid 56 px down per frame for 300 frames, then 24 px
  sideways per frame for 120 frames, three runs pooled (1,260 intervals).
  At 60 Hz, 16.7 ms is on time. It does not measure compositor-only frames
  or blank areas.
- **Active-cell move**: ArrowDown on the focused cell, 300 presses from
  row 1. Two figures: from the key event's capture to its bubbling at the
  window (the grid's handler, React's synchronous render and commit, and
  the focus move), and from the key event to the frame after it. Every run
  landed on row 301 (aria-rowindex 302).
- **JS heap**: the main thread's `JSHeapUsedSize` (Chrome DevTools
  Protocol) after load, then after a forced garbage collection. The
  worker's heap (its own copy of the store and the search index) is not
  included.
- **Bundle**: every JavaScript and CSS file the build emits, raw and gzip
  (zlib default level). Font files are not counted.

## Results

| | run 1 | run 2 |
|---|---|---|
| First rows, median (min, max) | 121.5 ms (119.3, 141.8) | 119.7 ms (117.7, 132.0) |
| Filter, chips: p50 / p95 / max | 32.1 / 32.8 / 47.3 ms | 31.9 / 32.6 / 47.7 ms |
| Filter, search text: p50 / p95 / max | 14.9 / 15.6 / 28.8 ms | 15.2 / 16.1 / 28.3 ms |
| Sort, header click: p50 / p95 / max | 34.3 / 35.4 / 35.5 ms | 34.6 / 35.3 / 35.7 ms |
| Worker round trip: p50 / p95 / max | 13.0 / 13.7 / 29.6 ms | 12.7 / 14.3 / 27.3 ms |
| Worker compute: p50 / p95 / max | 1.3 / 11.9 / 13.5 ms | 1.3 / 13.6 / 15.9 ms |
| Scroll frames: p50 / p95 / max | 16.7 / 16.7 / 16.8 ms | 16.7 / 16.7 / 16.8 ms |
| Scroll frames over 20 ms | 0 of 1,260 | 0 of 1,260 |
| Move, handler to commit: p50 / p95 / max | 0.7 / 0.8 / 1.0 ms | 0.8 / 1.0 / 1.2 ms |
| Move, key to next frame: p50 / p95 / max | 16.7 / 17.5 / 17.9 ms | 16.9 / 17.6 / 18.3 ms |
| JS heap, main thread, after load / after GC | 12.6 / 8.9 MiB | 12.1 / 8.9 MiB |
| JS: app | 719.1 KiB raw, 208.8 KiB gzip | same |
| JS: desk worker | 21.0 KiB raw, 8.8 KiB gzip | same |
| CSS | 77.5 KiB raw, 17.1 KiB gzip | same |

## Reading them

- The compute is small: half the queries take 1.3 ms or less in the
  worker; the slow tail (12 to 16 ms) is the queries that sort 50,000
  rows or build a language's search index. A separate probe (the code of
  `bd9c9e1` with temporary timestamps in the worker, not committed; four
  chip toggles, same host and browser) timed chip toggles inside the worker at 0.6 to 0.7 ms after the
  first one. Most of a round trip is waiting for the main thread: in that
  probe the result was ready 2.5 ms after the click and handled at about
  14 ms, after the frame that draws the click itself.
- So filter and sort latency are about two frames after a click (the
  click's own frame, then the result's) and about one after typing. In the
  probe the first chip toggle after load was the slowest sample (about
  46 to 51 ms).
- Scrolling stayed on every frame. A key move costs under 1.2 ms of main
  thread work; it reaches the screen with the next frame.
- The app's JavaScript is mostly React Aria (Select, Dialog, Sheet,
  toasts, the reorderable list's GridList) and React DOM; argus-grid adds
  about 62 KB of source before minification.

## What this does not show

- Safari, Firefox, a slower machine, a phone, a laptop on battery.
- Headed Chrome: frame timing headless may differ from a visible window.
- The worker's memory.
- Edits, bulk changes and CSV export: not timed (CSV runs in the worker).
- Numbers from argus-grid's own record (Node) were not used as inputs;
  the compute times above are the browser's own.
