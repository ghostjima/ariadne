/*
  Timings of the engine on this machine, printed as markdown. Runs against
  the built package (dist/), so `pnpm measure` builds first. Every sample is
  one call timed with performance.now(); percentiles are nearest-rank.
*/
import { execSync } from "node:child_process";
import os from "node:os";
import {
  CHUNK_SIZE,
  COLUMN_IDS,
  DEFAULT_COLUMNS,
  DEFAULT_SEED,
  EMPTY_CRITERIA,
  OPERATOR_REGIONS,
  PRESET_VIEWS,
  TOTAL_ROWS,
  applyChunk,
  buildSearchIndex,
  createStore,
  filterRows,
  generateAll,
  generateChunk,
  parseView,
  percentile,
  serializeView,
  sortOrder,
  toCsv,
} from "../dist/index.js";
import { labels as en, pools as enPools } from "../dist/pools/en.js";
import { pools as ruPools } from "../dist/pools/ru.js";
import { pools as arPools } from "../dist/pools/ar.js";

const sh = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const commit = sh("git rev-parse --short HEAD");
const dirty = sh("git status --porcelain --untracked-files=no") !== "";

function sample(runs, warmup, fn) {
  for (let k = 0; k < warmup; k++) fn(k);
  const out = [];
  for (let k = 0; k < runs; k++) {
    const t0 = performance.now();
    fn(k);
    out.push(performance.now() - t0);
  }
  return out;
}

const ms = (x) => x.toFixed(2);
const us = (x) => (x * 1000).toFixed(1);
function stats(samples, fmt = ms) {
  return {
    p50: fmt(percentile(samples, 50)),
    p95: fmt(percentile(samples, 95)),
    max: fmt(Math.max(...samples)),
    n: samples.length,
  };
}
const row = (cells) => `| ${cells.join(" | ")} |`;

console.log(`commit ${commit}${dirty ? " (working tree has uncommitted changes)" : ""}`);
console.log(`node ${process.version}, ${os.cpus()[0]?.model}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.type()} ${os.release()}`);
console.log(`date ${new Date().toISOString()}`);
console.log();

/* Generation */
console.log("## Generation");
console.log(row(["operation", "p50 ms", "p95 ms", "max ms", "runs"]));
console.log(row(["---", "---", "---", "---", "---"]));
{
  const s = stats(sample(30, 3, () => generateAll(DEFAULT_SEED, TOTAL_ROWS)));
  console.log(row([`generateAll, ${TOTAL_ROWS} rows x ${COLUMN_IDS.length} columns`, s.p50, s.p95, s.max, s.n]));
  const chunks = TOTAL_ROWS / CHUNK_SIZE;
  const c = stats(
    sample(30 * chunks, chunks, (k) => generateChunk(DEFAULT_SEED, (k % chunks) * CHUNK_SIZE, CHUNK_SIZE)),
  );
  console.log(row([`generateChunk, ${CHUNK_SIZE} rows`, c.p50, c.p95, c.max, c.n]));
  const ready = Array.from({ length: chunks }, (_, k) => generateChunk(DEFAULT_SEED, k * CHUNK_SIZE, CHUNK_SIZE));
  const store = createStore(TOTAL_ROWS);
  const a = stats(sample(30 * chunks, chunks, (k) => applyChunk(store, ready[k % chunks])));
  console.log(row([`applyChunk, ${CHUNK_SIZE} rows (main thread, on arrival)`, a.p50, a.p95, a.max, a.n]));
  const full = generateAll(DEFAULT_SEED);
  for (const [name, p] of [["en", enPools], ["ru", ruPools], ["ar", arPools]]) {
    const b = stats(sample(30, 3, () => buildSearchIndex(full, p)));
    console.log(row([`buildSearchIndex, ${TOTAL_ROWS} rows, ${name}`, b.p50, b.p95, b.max, b.n]));
  }
}
console.log();

/* Filter, facets and sort */
const store = generateAll(DEFAULT_SEED);
const search = buildSearchIndex(store, enPools);
const [all, urgent, finance] = PRESET_VIEWS;
const fromView = (v, allowedRegions = null) => ({
  criteria: {
    status: v.filters.status,
    priority: v.filters.priority,
    slaBreached: v.filters.slaBreached,
    regions: v.filters.regions,
    search: v.search,
    allowedRegions,
  },
  sort: v.sort,
});
const combos = [
  ["all requests, no sort", fromView(all)],
  ["preset urgent: status 0,1 + high priority + SLA breached, sort by SLA", fromView(urgent)],
  ["preset finance: status 4,6, sort by amount desc", fromView(finance)],
  ["one status chip (in progress), no sort", { criteria: { ...EMPTY_CRITERIA, status: [1] }, sort: null }],
  ["two regions + medium/high priority, sort by date desc", {
    criteria: { ...EMPTY_CRITERIA, regions: [3, 5], priority: [1, 2] },
    sort: { id: "date", desc: true },
  }],
  ['search "logistics" (en), sort by amount', {
    criteria: { ...EMPTY_CRITERIA, search: "logistics" },
    sort: { id: "amount", desc: false },
  }],
  ["operator role: regions 0-2, no sort", fromView(all, OPERATOR_REGIONS)],
  ["status chip + sort by client name (en collation)", {
    criteria: { ...EMPTY_CRITERIA, status: [0] },
    sort: { id: "client", desc: false },
  }],
];
const RUNS = 200;
const WARMUP = 20;
console.log(`## Filter, facets and sort (${TOTAL_ROWS} rows, ${RUNS} runs each after ${WARMUP} warm-up runs)`);
console.log(row(["combination", "rows", "filter+facets p50", "p95", "sort p50", "p95", "sort+filter p50", "p95", "max"]));
console.log(row(["---", "---", "---", "---", "---", "---", "---", "---", "---"]));
for (const [name, { criteria, sort }] of combos) {
  const order = sortOrder(store, sort, enPools);
  const rows = filterRows(store, order, criteria, search).index.length;
  const f = stats(sample(RUNS, WARMUP, () => filterRows(store, order, criteria, search)));
  const s = sort ? stats(sample(RUNS, WARMUP, () => sortOrder(store, sort, enPools))) : { p50: "-", p95: "-" };
  const both = stats(
    sample(RUNS, WARMUP, () => filterRows(store, sortOrder(store, sort, enPools), criteria, search)),
  );
  console.log(row([name, rows, f.p50, f.p95, s.p50, s.p95, both.p50, both.p95, both.max]));
}
console.log();

/* View serialisation */
console.log("## View serialisation (microseconds)");
console.log(row(["operation", "p50 us", "p95 us", "max us", "runs"]));
console.log(row(["---", "---", "---", "---", "---"]));
{
  const view = {
    name: "My overdue requests",
    filters: { status: [0, 1, 2], priority: [2], slaBreached: true, regions: [1, 4] },
    search: "freight",
    columns: ["id", "client", "status", "priority", "sla", "owner", "region", "amount", "comment"],
    sort: { id: "sla", desc: false },
    density: "compact",
  };
  const encoded = serializeView(view);
  const s = stats(sample(10_000, 1_000, () => serializeView(view)), us);
  console.log(row([`serializeView (${encoded.length} characters out)`, s.p50, s.p95, s.max, s.n]));
  const p = stats(sample(10_000, 1_000, () => parseView(encoded)), us);
  console.log(row(["parseView", p.p50, p.p95, p.max, p.n]));
}
console.log();

/* CSV */
console.log("## CSV export of 5,000 rows (en)");
console.log(row(["columns", "p50 ms", "p95 ms", "max ms", "runs", "output"]));
console.log(row(["---", "---", "---", "---", "---", "---"]));
{
  const index = filterRows(store, null, EMPTY_CRITERIA).index.subarray(0, 5_000);
  const options = { headers: en.columns, pools: enPools, labels: en };
  for (const cols of [[...DEFAULT_COLUMNS], [...COLUMN_IDS]]) {
    const bytes = Buffer.byteLength(toCsv(store, index, cols, options));
    const s = stats(sample(50, 5, () => toCsv(store, index, cols, options)));
    console.log(row([`${cols.length}`, s.p50, s.p95, s.max, s.n, `${(bytes / 1024).toFixed(0)} KiB`]));
  }
}
