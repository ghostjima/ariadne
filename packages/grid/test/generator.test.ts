import { describe, expect, it } from "vitest";
import {
  applyChunk,
  chunkBounds,
  chunkCount,
  createStore,
  generateAll,
  generateChunk,
  getRow,
  padId,
  rowId,
  rowOfId,
} from "../src/index.js";
import {
  AS_OF,
  COLUMNS,
  CORPUS_CHUNK,
  CORPUS_ROWS,
  DEFAULT_SEED,
  SCALE_CHUNK,
  SCALE_ROWS,
  STAGE_COUNT,
  STREAM_COUNT,
  Stage,
  WINDOW_DAYS,
} from "../src/schema.js";
import { dayNumber } from "../src/days.js";
import { COLUMN_KEYS, isAnswered } from "../src/store.js";
import { buildSearchIndex, rowText } from "../src/text.js";
import { pools as ru } from "../src/pools/ru.js";
import { storeDigest } from "./digest.js";

describe("generator", () => {
  it("has a 24-column catalogue with unique ids", () => {
    expect(COLUMNS).toHaveLength(24);
    expect(new Set(COLUMNS.map((c) => c.id)).size).toBe(24);
  });

  it("is deterministic for the same seed", () => {
    const a = generateAll(7, 1_200, 400);
    const b = generateAll(7, 1_200, 400);
    expect(Array.from(a.client)).toEqual(Array.from(b.client));
    expect(Array.from(a.due)).toEqual(Array.from(b.due));
    expect(buildSearchIndex(a, ru)).toEqual(buildSearchIndex(b, ru));
    expect(storeDigest(a)).toBe(storeDigest(b));
  });

  it("differs for a different seed", () => {
    const a = generateAll(1, 600, 300);
    const b = generateAll(2, 600, 300);
    expect(Array.from(a.client)).not.toEqual(Array.from(b.client));
    expect(storeDigest(a)).not.toBe(storeDigest(b));
  });

  it("chunks are independent: a single chunk equals its slice of the whole", () => {
    const whole = generateAll(42, 1_200, 400);
    const chunk = generateChunk(42, 400, 400, 1_200);
    for (const key of COLUMN_KEYS) {
      expect(Array.from(chunk[key]), key).toEqual(Array.from(whole[key].subarray(400, 800)));
    }
  });

  it("numbers the cases in the order they arrived, over the window up to the day the data is taken", () => {
    const store = generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK);
    const asOf = dayNumber(AS_OF);
    expect(store.received[0]).toBeGreaterThanOrEqual(asOf - WINDOW_DAYS + 1);
    expect(store.received[store.size - 1]).toBeLessThanOrEqual(asOf);
    for (let i = 1; i < store.size; i++) expect(store.received[i]! >= store.received[i - 1]!).toBe(true);
  });

  it("by default holds the volume of a bank ranked 50 to 250: about 300 a month, a few hundred open", () => {
    const store = generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK);
    expect(store.size).toBe(1_200);
    let open = 0;
    for (let i = 0; i < store.size; i++) if (!isAnswered(store, i)) open++;
    expect(open).toBeGreaterThanOrEqual(150);
    expect(open).toBeLessThanOrEqual(400);
    const monthly = (store.size / WINDOW_DAYS) * 30;
    expect(monthly).toBeGreaterThan(250);
    expect(monthly).toBeLessThan(350);
  });

  it("closes old cases and keeps young ones open", () => {
    const store = generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK);
    let oldOpen = 0;
    for (let i = 0; i < 300; i++) if ((store.stage[i] ?? 0) < Stage.Sent) oldOpen++;
    expect(oldOpen / 300).toBeLessThan(0.1);
    let young = 0;
    for (let i = store.size - 30; i < store.size; i++) if ((store.stage[i] ?? 0) < Stage.Sent) young++;
    expect(young).toBe(30);
  });

  it("generates the 50,000 rows of the scale mode with every field populated", () => {
    const store = generateAll(DEFAULT_SEED, SCALE_ROWS, SCALE_CHUNK);
    expect(store.size).toBe(50_000);
    expect(rowId(0)).toBe(padId(1));
    expect(rowId(49_999)).toBe("C-050000");
    expect(store.loaded.every((v) => v === 1)).toBe(true);
    const stages = new Set<number>();
    const streams = new Set<number>();
    for (let i = 0; i < store.size; i += 7) {
      stages.add(store.stage[i] ?? -1);
      streams.add(store.stream[i] ?? -1);
    }
    expect(stages.size).toBe(STAGE_COUNT);
    expect(streams.size).toBe(STREAM_COUNT);
    const row = getRow(store, 999);
    expect(row.id).toBe(padId(1_000));
    expect(row.due).toBeGreaterThan(row.registered);
    const text = rowText(store, ru, 999);
    expect(text.client.length).toBeGreaterThan(0);
    expect(buildSearchIndex(store, ru)[999]).toContain(text.client.toLowerCase());
  });

  it("applyChunk marks rows as loaded and leaves others missing", () => {
    const store = createStore(100);
    applyChunk(store, generateChunk(3, 50, 50, 100));
    expect(store.loaded[49]).toBe(0);
    expect(store.loaded[50]).toBe(1);
    const search = buildSearchIndex(store, ru);
    expect(search[50]?.startsWith(padId(51).toLowerCase())).toBe(true);
    expect(search[0]).toBe("");
  });

  it("keeps the same rows for the default seed across versions", () => {
    /* A change here means existing seeds no longer reproduce earlier data.
       Re-pinned when the register became the complaints corpus: every
       column changed, and the deadlines now come from ariadne-rules. */
    expect(storeDigest(generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK))).toBe(GOLDEN_DIGEST);
  });

  it("splits a total into chunk bounds", () => {
    expect(chunkCount(1_200, 400)).toBe(3);
    expect(chunkCount(50_000, 5_000)).toBe(10);
    expect(chunkCount(50_001, 5_000)).toBe(11);
    expect(chunkBounds(9, 50_000, 5_000)).toEqual({ start: 45_000, count: 5_000 });
    expect(chunkBounds(10, 50_001, 5_000)).toEqual({ start: 50_000, count: 1 });
    expect(chunkBounds(11, 50_001, 5_000)).toEqual({ start: 55_000, count: 0 });
  });

  it("maps case ids back to rows", () => {
    expect(rowOfId("C-000001", 10)).toBe(0);
    expect(rowOfId(rowId(9), 10)).toBe(9);
    expect(rowOfId("C-000011", 10)).toBe(-1);
    expect(rowOfId("C-000000", 10)).toBe(-1);
    expect(rowOfId("Z-000001", 10)).toBe(-1);
    expect(rowOfId("nope", 10)).toBe(-1);
  });
});

const GOLDEN_DIGEST = "9f315c85";
