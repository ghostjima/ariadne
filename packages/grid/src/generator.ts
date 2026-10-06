import {
  AUTHOR_COUNT,
  CHANNEL_COUNT,
  CHUNK_SIZE,
  CLIENT_COUNT,
  COMMENT_COUNT,
  CURRENCY_COUNT,
  CURRENCY_RATES,
  METRIC_COUNT,
  OWNER_COUNT,
  REGION_COUNT,
  Status,
  TAG_COUNT,
  TOTAL_ROWS,
} from "./schema.js";
import { allocColumns, applyChunk, createStore, type Chunk, type ColumnStore } from "./store.js";

/*
  Deterministic dataset generation. Each chunk is seeded from (seed, start),
  so a chunk can be regenerated on its own (worker retry) and still equal the
  matching slice of a full synchronous generation. Every draw picks a code
  from a fixed-size range, so the rows do not depend on the language the
  caller later displays them in.
*/

/* mulberry32: small, fast, good enough for demo data */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Mixes a second number into a seed so derived streams are independent */
export function mixSeed(seed: number, salt: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (salt + 1), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const DAY = 86_400_000;
const EPOCH_START = Date.UTC(2025, 8, 1);

/* Comment draws: three empty slots out of twelve, then the pool entries */
const COMMENT_SLOTS = COMMENT_COUNT + 3;

export function generateChunk(seed: number, start: number, count: number): Chunk {
  const rng = makeRng(mixSeed(seed, start));
  const c: Chunk = { start, count, ...allocColumns(count) };
  const pick = (n: number) => Math.floor(rng() * n);
  for (let i = 0; i < count; i++) {
    const client = pick(CLIENT_COUNT);
    const date = EPOCH_START + pick(365) * DAY + pick(DAY);
    const currency = pick(CURRENCY_COUNT);
    const base = Math.round(Math.exp(rng() * 7 + 6) / 10) * 10;
    const rate = CURRENCY_RATES[currency] ?? 1;
    const amount = rate === 1 ? base : Math.round(base / rate);
    /* Skewed status distribution: most requests are in progress or closed */
    const r = rng();
    const status =
      r < 0.18 ? 0 : r < 0.42 ? 1 : r < 0.52 ? 2 : r < 0.62 ? 3 : r < 0.74 ? 4 : r < 0.82 ? 5 : 6;
    const owner = pick(OWNER_COUNT);
    const region = pick(REGION_COUNT);
    const p = rng();
    const priority = p < 0.5 ? 0 : p < 0.85 ? 1 : 2;
    const sla = Math.round((rng() * 96 + 2) * 10) / 10;
    const slaBreached = status < Status.Approved && rng() < 0.22 ? 1 : 0;
    const tagCount = pick(3);
    let tags = 0;
    for (let t = 0; t < tagCount; t++) tags |= 1 << pick(TAG_COUNT);
    const revenue = amount * (1 + rng() * 0.4);
    const cost = revenue * (0.45 + rng() * 0.35);
    const marginAbs = revenue - cost;
    const marginPct = revenue > 0 ? (marginAbs / revenue) * 100 : 0;
    const marginPlan = revenue * (0.25 + rng() * 0.1);
    const m = i * METRIC_COUNT;
    c.metrics[m] = Math.round(revenue);
    c.metrics[m + 1] = Math.round(cost);
    c.metrics[m + 2] = Math.round(marginAbs);
    c.metrics[m + 3] = Math.round(marginPct * 10) / 10;
    c.metrics[m + 4] = Math.round(marginPlan);
    c.metrics[m + 5] = Math.round(revenue * rng() * 0.15);
    c.metrics[m + 6] = Math.round(revenue * 0.02 * rng() * 100) / 100;
    c.metrics[m + 7] = Math.round(revenue * 0.2);
    c.metrics[m + 8] = rng() < 0.1 ? Math.round(revenue * rng() * 0.5) : 0;
    c.metrics[m + 9] = Math.round(revenue * (1 + rng() * 6));
    c.metrics[m + 10] = Math.round(rng() * 1000) / 10;
    c.metrics[m + 11] = Math.round(rng() * 4000) / 100;
    c.metrics[m + 12] = 1 + pick(12);
    c.metrics[m + 13] = pick(45);
    c.metrics[m + 14] = pick(9);
    const slot = pick(COMMENT_SLOTS);
    const comment = slot < 3 ? 0 : slot - 2;
    const channel = pick(CHANNEL_COUNT);
    const updatedAt = date + pick(20) * DAY;
    const createdBy = pick(AUTHOR_COUNT);

    c.date[i] = date;
    c.amount[i] = amount;
    c.currency[i] = currency;
    c.status[i] = status;
    c.client[i] = client;
    c.owner[i] = owner;
    c.region[i] = region;
    c.priority[i] = priority;
    c.sla[i] = sla;
    c.slaBreached[i] = slaBreached;
    c.tags[i] = tags;
    c.comment[i] = comment;
    c.channel[i] = channel;
    c.updatedAt[i] = updatedAt;
    c.createdBy[i] = createdBy;
  }
  return c;
}

export function chunkCount(total: number, chunkSize = CHUNK_SIZE): number {
  return Math.ceil(total / chunkSize);
}

/* Start and row count of chunk `index` */
export function chunkBounds(
  index: number,
  total: number,
  chunkSize = CHUNK_SIZE,
): { start: number; count: number } {
  const start = index * chunkSize;
  return { start, count: Math.max(0, Math.min(chunkSize, total - start)) };
}

/* Synchronous generation, used by tests, measurements and the no-Worker fallback */
export function generateAll(seed: number, total = TOTAL_ROWS, chunkSize = CHUNK_SIZE): ColumnStore {
  const store = createStore(total);
  for (let start = 0; start < total; start += chunkSize) {
    applyChunk(store, generateChunk(seed, start, Math.min(chunkSize, total - start)));
  }
  return store;
}
