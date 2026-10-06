import { describe, expect, it } from "vitest";
import { generateChunk } from "../src/generator.js";
import { allocColumns, chunkTransferables } from "../src/store.js";
import {
  createChunkProducer,
  type WorkerRequest,
  type WorkerResponse,
} from "../src/worker/protocol.js";

function collect() {
  const out: { msg: WorkerResponse; transfer: ArrayBuffer[] }[] = [];
  const handle = createChunkProducer((msg, transfer) => out.push({ msg, transfer }));
  return { out, handle };
}

const generate = (failChunks: number[] = []): WorkerRequest => ({
  type: "generate",
  seed: 5,
  total: 2_500,
  chunkSize: 1_000,
  failChunks,
});

describe("worker protocol", () => {
  it("posts every chunk with all of its buffers to transfer", () => {
    const { out, handle } = collect();
    handle(generate());
    expect(out.map((o) => o.msg.type)).toEqual(["chunk", "chunk", "chunk"]);
    const last = out[2]!.msg;
    expect(last.type === "chunk" && [last.chunk.start, last.chunk.count]).toEqual([2_000, 500]);
    for (const { msg, transfer } of out) {
      if (msg.type !== "chunk") continue;
      expect(transfer).toEqual(chunkTransferables(msg.chunk));
    }
  });

  it("transfers every column, so a new column cannot be left behind", () => {
    const columns = Object.values(allocColumns(1));
    const chunk = generateChunk(1, 0, 10);
    const transfer = chunkTransferables(chunk);
    expect(transfer).toHaveLength(columns.length);
    expect(new Set(transfer).size).toBe(columns.length);
  });

  it("moves the buffers on postMessage instead of copying them", () => {
    const { out, handle } = collect();
    handle(generate());
    const { msg, transfer } = out[0]!;
    const received = structuredClone(msg, { transfer });
    if (msg.type !== "chunk" || received.type !== "chunk") throw new Error("expected a chunk");
    /* The sender's arrays are detached; the receiver has the data */
    expect(msg.chunk.metrics.byteLength).toBe(0);
    expect(msg.chunk.status.byteLength).toBe(0);
    const expected = generateChunk(5, 0, 1_000);
    expect(Array.from(received.chunk.metrics)).toEqual(Array.from(expected.metrics));
    expect(Array.from(received.chunk.client)).toEqual(Array.from(expected.client));
  });

  it("fails a listed chunk once, then serves it on retry", () => {
    const { out, handle } = collect();
    handle(generate([1]));
    expect(out.map((o) => o.msg.type)).toEqual(["chunk", "chunk-error", "chunk"]);
    expect(out[1]!.msg).toEqual({ type: "chunk-error", index: 1, start: 1_000, count: 1_000 });
    expect(out[1]!.transfer).toEqual([]);
    handle({ type: "retry", seed: 5, index: 1, total: 2_500, chunkSize: 1_000 });
    expect(out[3]!.msg.type).toBe("chunk");
    /* A second generate does not fail the same chunk again */
    handle(generate([1]));
    expect(out.slice(4).map((o) => o.msg.type)).toEqual(["chunk", "chunk", "chunk"]);
  });

  it("the entry module answers requests through the worker global scope", async () => {
    const posted: WorkerResponse[] = [];
    const scope = globalThis as unknown as {
      postMessage: (msg: WorkerResponse, transfer: ArrayBuffer[]) => void;
      onmessage: ((e: { data: WorkerRequest }) => void) | null;
    };
    scope.postMessage = (msg) => posted.push(msg);
    await import("../src/worker/entry.js");
    expect(typeof scope.onmessage).toBe("function");
    scope.onmessage!({ data: generate() });
    expect(posted).toHaveLength(3);
  });
});
