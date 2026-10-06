# Measurements

Taken in the Valkyra-Labs/argus-grid repository before its import here; the
commits named below are that repository's.

Every number in the README comes from here, with its stamp. Host: Apple
M4 Pro (12 CPU cores: 8 performance, 4 efficiency), 24 GB, macOS 26.6
(Darwin 25.6.0). Runtime: Node v22.18.0, default flags. Code: the built
package (`dist/`, TypeScript 6.0.3, target ES2022), commit `12164c3`.
Command: `pnpm measure` (`bench/measure.mjs`), run twice in a row on
2026-10-04; cells read run 1 / run 2.

Method: every sample is one call timed with `performance.now()`, after
warm-up calls that are not counted. p50 and p95 are nearest-rank over the
samples of one run; "worst" is the slowest single sample of both runs.
Data: `generateAll(20260904)`, 50,000 rows, 30 columns; the search index
is English unless a row says otherwise.

## Verdict on the 50 ms budget

No measured operation reaches 50 ms. The slowest are the search index
rebuild on a language switch (p95 19.4-22.7 ms, worst sample 29.2 ms),
the one-call generation of all 50,000 rows (p95 24.8-25.3 ms; the loader
never runs it as one task, it generates 5,000-row chunks of 2.2-2.5 ms),
sort plus filter with a text query (p95 13.6-15.7 ms) and CSV of 5,000
rows with all 30 columns (p95 16.1-17.1 ms). A chip toggle that reuses
the current sort order costs the filter with facets alone: under 0.7 ms
at p95 without a text query, under 5 ms with one.

These numbers give no reason to move the compute to Rust. They are Node
on a fast desktop chip; whether a browser on a slower device stays inside
the budget is not measured (see the end of this file).

## Generation (30 runs, or 300 per chunk operation)

| operation | p50 ms | p95 ms | worst ms | samples per run |
|---|---|---|---|---|
| `generateAll`, 50,000 rows x 30 columns, one call | 23.70 / 23.03 | 25.33 / 24.75 | 26.95 | 30 |
| `generateChunk`, 5,000 rows | 2.23 / 2.24 | 2.38 / 2.45 | 3.41 | 300 (30 per chunk offset) |
| `applyChunk`, 5,000 rows into the store | 0.03 / 0.03 | 0.03 / 0.03 | 0.11 | 300 |
| `buildSearchIndex`, 50,000 rows, en | 7.67 / 8.43 | 19.57 / 22.66 | 29.22 | 30 |
| `buildSearchIndex`, 50,000 rows, ru | 7.34 / 7.74 | 19.79 / 19.41 | 21.04 | 30 |
| `buildSearchIndex`, 50,000 rows, ar | 7.23 / 7.29 | 20.21 / 20.40 | 21.06 | 30 |

`applyChunk` is what the main thread pays when a chunk arrives from the
worker. The search index samples are bimodal (about 7 ms, or about 20 ms
when a run includes garbage collection of the previous 50,000 strings);
the p95 is the second mode.

## Filter, facets and sort (200 runs each after 20 warm-up runs)

"filter" is `filterRows` (the index array and the four facet groups) on a
precomputed order; "sort" is `sortOrder`, a full permutation of 50,000
rows; "sort + filter" is both in one sample, what a view switch costs.

| combination | rows out | filter p50 | filter p95 | sort p50 | sort p95 | sort + filter p50 | sort + filter p95 | worst |
|---|---|---|---|---|---|---|---|---|
| all requests, no sort | 50,000 | 0.37 / 0.37 | 0.42 / 0.39 | - | - | 0.27 / 0.36 | 0.29 / 0.40 | 0.86 |
| preset urgent: status 0,1, high priority, SLA breached; sort by SLA | 671 | 0.35 / 0.44 | 0.47 / 0.55 | 9.38 / 9.32 | 10.12 / 9.87 | 9.99 / 9.92 | 10.78 / 10.71 | 14.08 |
| preset finance: status 4,6; sort by amount, descending | 15,058 | 0.39 / 0.38 | 0.47 / 0.43 | 8.87 / 8.84 | 9.67 / 9.45 | 9.29 / 9.25 | 10.17 / 9.86 | 13.26 |
| one status chip (in progress), no sort | 11,963 | 0.29 / 0.28 | 0.32 / 0.31 | - | - | 0.28 / 0.28 | 0.31 / 0.30 | 1.41 |
| two regions, medium and high priority; sort by date, descending | 6,255 | 0.50 / 0.48 | 0.61 / 0.57 | 10.48 / 10.36 | 11.75 / 10.80 | 11.09 / 10.84 | 12.59 / 11.29 | 19.71 |
| text query "logistics"; sort by amount | 1,986 | 3.68 / 3.47 | 4.95 / 3.98 | 8.92 / 8.90 | 9.96 / 9.36 | 13.70 / 12.86 | 15.73 / 13.63 | 17.68 |
| operator role (regions 0-2), no sort | 18,881 | 0.28 / 0.27 | 0.31 / 0.29 | - | - | 0.26 / 0.26 | 0.30 / 0.29 | 0.59 |
| one status chip; sort by client name (English collation) | 9,135 | 0.35 / 0.35 | 0.37 / 0.36 | 6.16 / 6.14 | 6.70 / 6.61 | 6.57 / 6.53 | 7.33 / 6.97 | 10.81 |

The sort dominates every view switch that has one. A text query costs
about 3 ms more than a chip filter: it is a substring scan over 50,000
strings. Differences under 0.1 ms between columns (the first row's sort +
filter below its filter alone) are within the spread between runs.

## View serialisation (10,000 runs after 1,000 warm-up runs)

A view with three status codes, a priority, the SLA flag, two regions, a
text query, nine columns and a sort; 236 characters serialised.

| operation | p50 us | p95 us | worst us |
|---|---|---|---|
| `serializeView` | 2.2 / 2.3 | 2.5 / 2.5 | 366.5 |
| `parseView` | 1.3 / 1.3 | 1.7 / 1.7 | 205.0 |

## CSV of 5,000 rows (50 runs after 5 warm-up runs)

English pools and labels, the first 5,000 rows in natural order, default
number and date formatting.

| columns | p50 ms | p95 ms | worst ms | output |
|---|---|---|---|---|
| 8 (the default view) | 3.92 / 3.94 | 4.20 / 4.19 | 4.74 | 420 KiB |
| 30 (the whole catalogue) | 15.02 / 14.85 | 17.09 / 16.07 | 18.61 | 1,039 KiB |

## What this does not show

- A browser. Chromium uses the same JavaScript engine as Node, but no
  browser, worker `postMessage` latency or rendering time was measured;
  Safari and Firefox were not run at all.
- Slower machines. One fast desktop chip; no laptop on battery, no phone.
- Memory. Not measured. By construction the typed arrays take 164 bytes
  per row (four Float64 columns, fifteen Float64 metrics, twelve Uint8
  columns including the loaded flag), 8.2 MB at 50,000 rows; the search
  index strings come on top and were not measured.
- Bulk edits and undo, and the colleague simulation: not timed.
