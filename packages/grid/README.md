# @ariadne/grid

Part of the [Ariadne Desk](../../README.md) repository; the measured
badges are in its README.

Data engine for an operations grid of 50,000 requests, in TypeScript.

`@ariadne/grid` generates a deterministic dataset of service requests
(status, priority, SLA, region, client, comment, amount and fifteen
metrics, 30 columns in all), keeps it in a columnar store of typed
arrays, and answers what an operations grid asks of it: filtering with
facet counts, sorting, saved views in the URL, role rules, inline edit
validation, bulk edits with undo, a simulated colleague editing the same
rows, and CSV export. It draws nothing: the grid component is separate.
No runtime dependencies.

Status: early. Measured on commit `12164c3` of the Valkyra-Labs/argus-grid
repository (Node 22.18, Apple M4 Pro): no operation reaches the 50 ms
budget. A view switch (sort and filter
with facets over 50,000 rows) takes 7-16 ms at p95, a chip toggle on the
current order under 1 ms (under 5 ms with a text query), a 5,000-row
chunk 2.4-2.5 ms to generate, and CSV of 5,000 rows 4-17 ms depending on
the column count, all at p95.
Method, both runs and limits:
[docs/MEASUREMENTS.md](docs/MEASUREMENTS.md). It is TypeScript because
no measurement showed the compute near its budget; those numbers are
there so the question can be asked again on a browser or a slower
device.

## Data model

- One request per row; the request id (`Z-000001`) is derived from the
  row position and not stored.
- Every generated field is a typed array. Status, priority, region,
  channel and currency are enum codes. Client, owner, author and comment
  are codes into fixed-size text pools; tags are an 8-bit mask. Amounts,
  dates, SLA hours and metrics are `Float64Array`s (metrics row-major,
  15 per row).
- Amounts are in roubles, US dollars or euros. The generator draws each
  amount in roubles and converts it at the dataset's fixed rates
  (`CURRENCY_RATES`, 80 roubles to the dollar and to the euro; not market
  rates), and sorting by amount compares amounts at those same rates, so
  the largest requests come first whatever their currency.
- Comments written after generation (by the user or the colleague) live
  in a map beside the arrays, as free text or as the colleague's
  numbered note.
- Generation is seeded per chunk from the seed and the chunk's offset,
  so a chunk regenerated alone equals its slice of the whole, and every
  chunk transfers between threads without copying.
- The generator never sees a language. English, Russian and Arabic pools
  ship as separate modules (`@ariadne/grid/pools/en`, `/ru`, `/ar`), each
  with the free text (invented companies, places, people, comments,
  tags) and the interface labels (columns, statuses, priorities,
  channels, preset names). The same seed gives the same rows in every
  language; only the displayed strings change.

## API

All of it is exported from `@ariadne/grid`.

| area | functions and types |
|---|---|
| schema | `COLUMNS`, `Status`, `Priority`, `Channel`, `CURRENCIES`, `CURRENCY_RATES` and `REFERENCE_CURRENCY`, pool sizes, `TOTAL_ROWS`, `CHUNK_SIZE`, `DEFAULT_SEED`, `OPERATOR_REGIONS`, `PRESET_IDS` |
| store | `createStore`, `applyChunk`, `chunkTransferables`, `getRow`, `rowId`, `rowOfId`, `convertedAmount`, `getComment`, `writeStatus`, `writeComment` |
| generation | `generateChunk(seed, start, count)`, `generateAll(seed, total?, chunkSize?)`, `chunkCount`, `chunkBounds`, `makeRng` |
| text | `TextPools`, `Labels`, `validatePools`, `validateLabels`, `rowText`, `commentText`, `tagsText`, `buildSearchIndex`, `refreshSearch` |
| filter | `filterRows(store, order, criteria, search?)` returns the index array, facets (status, priority, region, SLA breach) and compute time; `sortOrder(store, sort, pools?)` (amounts by their value in roubles); `percentile`; `splitMatches` |
| views | `View`, `PRESET_VIEWS` (all requests, urgent, finance, and the open requests that need action), `criteriaFor(view, role)`, `serializeView` and `parseView` (base64url), `viewToUrl`, `saveView`, `removeView`, `validateViewName`, `serializeViews`, `parseViews` |
| roles | `roleRules(role)`, `visibleColumns`, `hiddenForRole`, `allowedRegions`, `canEdit`, `canBulk`, `canExport`, `canSeeRow` |
| edits | `validateEdit(col, draft, row)` and `checkStatus`, `checkComment` return an error code or null; `normalizeDraft`; `editContext` |
| undo | `EditHistory`: `setStatus(store, rows, status, now)`, `setComment(store, row, value, now)`, `undo(store, { overwrite? })` |
| colleague | `colleagueSchedule(seed, count)`, `dueTicks`, `planColleagueEdit`, `applyRemoteEdit`, `beginEdit`, `detectConflict` |
| CSV | `toCsv(store, index, columns, { headers, pools, labels, limit? })`, `cellText`, `csvEscape`, `neutralizeFormula` (text that starts like a spreadsheet formula gets a leading apostrophe; number columns are left as they are), `CSV_LIMIT` (5,000) |
| loading | `DatasetLoader` (worker or main thread, `subscribe` and `getSnapshot`), `createChunkProducer`, `WorkerRequest`, `WorkerResponse` |

Errors meant for people are codes with the numbers a message needs, never
sentences: `{ code: "comment-too-long", max: 200, length: 214 }`,
`{ code: "approve-needs-comment" }`, `{ code: "name-is-preset" }`.

```ts
import { DatasetLoader, buildSearchIndex, criteriaFor, filterRows, PRESET_VIEWS, sortOrder } from "@ariadne/grid";
import { pools } from "@ariadne/grid/pools/en";

const loader = new DatasetLoader({
  createWorker: () =>
    new Worker(new URL("@ariadne/grid/worker", import.meta.url), { type: "module" }),
});
loader.start();
// ...once loaded:
const view = PRESET_VIEWS[1]!;
const search = buildSearchIndex(loader.store, pools);
const order = sortOrder(loader.store, view.sort, pools);
const { index, facets } = filterRows(loader.store, order, criteriaFor(view, "operator"), search);
```

Without `createWorker`, or when the worker fails, the loader generates
the remaining chunks on the main thread, one per task.

## Development

From this folder, after `pnpm install --frozen-lockfile` at the
repository root:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm measure   # builds, then prints the timing tables with the commit stamp
```

## License

MIT OR Apache-2.0, at your option.
