import { describe, expect, it } from "vitest";
import { EMPTY_CRITERIA, buildSearchIndex, filterRows, generateAll, sortOrder, type WorkerRequest } from "@ariadne/grid";
import { pools as ruPools } from "@ariadne/grid/pools/ru";
import { createDeskHandler } from "./handler";
import type { DeskResponse, QueryResponse } from "./protocol";

const SEED = 20260904;
const TOTAL = 12_000;

function worker() {
  const out: DeskResponse[] = [];
  const handle = createDeskHandler((msg) => out.push(msg));
  const generate: WorkerRequest = { type: "generate", seed: SEED, total: TOTAL, chunkSize: 5_000, failChunks: [] };
  handle(generate);
  return { out, handle };
}

const last = (out: DeskResponse[]) => out[out.length - 1] as QueryResponse;

describe("desk worker handler", () => {
  it("answers @ariadne/grid's generate request with every chunk, for the loader", () => {
    const { out } = worker();
    expect(out.map((m) => m.type)).toEqual(["chunk", "chunk", "chunk"]);
  });

  it("filters and sorts its own copy exactly as @ariadne/grid does on the whole dataset", () => {
    const { out, handle } = worker();
    const store = generateAll(SEED, TOTAL);
    const criteria = { ...EMPTY_CRITERIA, status: [1, 4], priority: [2], search: "ООО" };
    handle({ type: "query", id: 1, criteria, sort: { id: "client", desc: true }, lang: "ru" });
    const reply = last(out);
    expect(reply.type).toBe("result");
    const expected = filterRows(store, sortOrder(store, { id: "client", desc: true }, ruPools), criteria, buildSearchIndex(store, ruPools));
    expect(Array.from(reply.index)).toEqual(Array.from(expected.index));
    expect(Array.from(reply.facets.status)).toEqual(Array.from(expected.facets.status));
    expect(reply.facets.slaBreached).toBe(expected.facets.slaBreached);
    expect(reply.sortMs).toBeGreaterThan(0);
  });

  it("reuses a cached order for the same sort and recomputes it after an edit of that column", () => {
    const { out, handle } = worker();
    const q = { type: "query" as const, criteria: EMPTY_CRITERIA, sort: { id: "status", desc: false }, lang: "en" as const };
    handle({ ...q, id: 1 });
    handle({ ...q, id: 2 });
    expect(last(out).sortMs).toBe(0);
    const row = last(out).index[0]!;
    handle({
      type: "sync",
      rows: Uint32Array.of(row),
      status: Uint8Array.of(6),
      slaBreached: Uint8Array.of(0),
      updatedAt: Float64Array.of(0),
    });
    handle({ ...q, id: 3 });
    const reply = last(out);
    expect(reply.sortMs).toBeGreaterThan(0);
    // The row moved from the first status to the last.
    expect(Array.from(reply.index).indexOf(row)).toBeGreaterThan(reply.index.length / 2);
  });

  it("finds an edited comment by search", () => {
    const { out, handle } = worker();
    const criteria = { ...EMPTY_CRITERIA, search: "kumquat" };
    handle({ type: "query", id: 1, criteria, sort: null, lang: "en" });
    expect(last(out).index.length).toBe(0);
    handle({
      type: "sync",
      rows: Uint32Array.of(42),
      status: Uint8Array.of(1),
      slaBreached: Uint8Array.of(0),
      updatedAt: Float64Array.of(0),
      comments: [{ kind: "text", text: "Kumquat delivery" }],
    });
    handle({ type: "query", id: 2, criteria, sort: null, lang: "en" });
    expect(Array.from(last(out).index)).toEqual([42]);
  });

  it("writes CSV in the language asked for, with a byte order mark", () => {
    const { out, handle } = worker();
    handle({ type: "csv", id: 9, index: Uint32Array.of(0, 1, 2), columns: ["id", "client", "status"], lang: "ru", limit: 5_000 });
    const reply = out[out.length - 1]!;
    expect(reply.type).toBe("csv");
    if (reply.type !== "csv") return;
    const lines = reply.text.split("\r\n");
    expect(lines[0]).toBe("﻿ID;Клиент;Статус");
    expect(lines).toHaveLength(4);
    expect(lines[1]!.startsWith("Z-000001;")).toBe(true);
  });
});
