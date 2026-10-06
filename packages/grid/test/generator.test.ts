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
import { COLUMNS, DEFAULT_SEED, METRIC_COUNT, STATUS_COUNT, TOTAL_ROWS } from "../src/schema.js";
import { buildSearchIndex, rowText } from "../src/text.js";
import { pools as en } from "../src/pools/en.js";
import { storeDigest } from "./digest.js";

describe("generator", () => {
  it("has a 30-column catalogue with unique ids", () => {
    expect(COLUMNS).toHaveLength(30);
    expect(new Set(COLUMNS.map((c) => c.id)).size).toBe(30);
  });

  it("is deterministic for the same seed", () => {
    const a = generateAll(7, 2_000, 500);
    const b = generateAll(7, 2_000, 500);
    expect(Array.from(a.client)).toEqual(Array.from(b.client));
    expect(Array.from(a.amount)).toEqual(Array.from(b.amount));
    expect(Array.from(a.metrics)).toEqual(Array.from(b.metrics));
    expect(buildSearchIndex(a, en)).toEqual(buildSearchIndex(b, en));
    expect(storeDigest(a)).toBe(storeDigest(b));
  });

  it("differs for a different seed", () => {
    const a = generateAll(1, 1_000, 500);
    const b = generateAll(2, 1_000, 500);
    expect(Array.from(a.client)).not.toEqual(Array.from(b.client));
  });

  it("chunks are independent: a single chunk equals its slice of the whole", () => {
    const whole = generateAll(42, 3_000, 1_000);
    const chunk = generateChunk(42, 1_000, 1_000);
    expect(Array.from(chunk.client)).toEqual(Array.from(whole.client.subarray(1_000, 2_000)));
    expect(Array.from(chunk.status)).toEqual(Array.from(whole.status.subarray(1_000, 2_000)));
    expect(Array.from(chunk.metrics)).toEqual(
      Array.from(whole.metrics.subarray(1_000 * METRIC_COUNT, 2_000 * METRIC_COUNT)),
    );
  });

  it("generates the full 50 000 rows with all fields populated", () => {
    const store = generateAll(20260904, TOTAL_ROWS);
    expect(store.size).toBe(50_000);
    expect(rowId(0)).toBe(padId(1));
    expect(rowId(49_999)).toBe(padId(50_000));
    expect(store.loaded.every((v) => v === 1)).toBe(true);
    expect(store.metrics).toHaveLength(50_000 * METRIC_COUNT);
    const statuses = new Set<number>();
    for (let i = 0; i < 5_000; i++) statuses.add(store.status[i] ?? -1);
    expect(statuses.size).toBe(STATUS_COUNT);
    const row = getRow(store, 999);
    expect(row.id).toBe(padId(1_000));
    expect(row.metrics).toHaveLength(METRIC_COUNT);
    const text = rowText(store, en, 999);
    expect(text.client.length).toBeGreaterThan(0);
    const search = buildSearchIndex(store, en);
    expect(search[999]).toContain(text.client.toLowerCase());
  });

  it("applyChunk marks rows as loaded and leaves others missing", () => {
    const store = createStore(100);
    applyChunk(store, generateChunk(3, 50, 50));
    expect(store.loaded[49]).toBe(0);
    expect(store.loaded[50]).toBe(1);
    const search = buildSearchIndex(store, en);
    expect(search[50]?.startsWith(padId(51).toLowerCase())).toBe(true);
    expect(search[0]).toBe("");
  });

  it("keeps the same rows for the default seed across versions", () => {
    /* A change here means existing seeds no longer reproduce earlier data */
    expect(storeDigest(generateAll(DEFAULT_SEED))).toBe(GOLDEN_DIGEST);
  });

  it("splits a total into chunk bounds", () => {
    expect(chunkCount(50_000)).toBe(10);
    expect(chunkCount(50_001)).toBe(11);
    expect(chunkBounds(9, 50_000)).toEqual({ start: 45_000, count: 5_000 });
    expect(chunkBounds(10, 50_001)).toEqual({ start: 50_000, count: 1 });
    expect(chunkBounds(11, 50_001)).toEqual({ start: 55_000, count: 0 });
  });

  it("maps request ids back to rows", () => {
    expect(rowOfId("Z-000001", 10)).toBe(0);
    expect(rowOfId(rowId(9), 10)).toBe(9);
    expect(rowOfId("Z-000011", 10)).toBe(-1);
    expect(rowOfId("Z-000000", 10)).toBe(-1);
    expect(rowOfId("nope", 10)).toBe(-1);
  });
});

const GOLDEN_DIGEST = "cb046f1f";
