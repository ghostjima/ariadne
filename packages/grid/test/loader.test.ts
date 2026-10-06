import { describe, expect, it } from "vitest";
import { generateAll } from "../src/generator.js";
import { DatasetLoader, type LoadSnapshot, type WorkerLike } from "../src/loader.js";
import { getComment, writeComment } from "../src/store.js";
import { buildSearchIndex, refreshSearch } from "../src/text.js";
import { createChunkProducer, type WorkerRequest } from "../src/worker/protocol.js";
import { pools as en } from "../src/pools/en.js";
import { storeDigest } from "./digest.js";

/* A browser Worker satisfies WorkerLike (checked by the type checker only) */
export const workerFits = (w: Worker): WorkerLike => w;

const opts = { seed: 77, total: 2_300, chunkSize: 500 };
const expected = storeDigest(generateAll(77, 2_300, 500));

function until(loader: DatasetLoader, pred: (s: LoadSnapshot) => boolean): Promise<LoadSnapshot> {
  return new Promise((resolve) => {
    if (pred(loader.getSnapshot())) return resolve(loader.getSnapshot());
    const off = loader.subscribe(() => {
      const s = loader.getSnapshot();
      if (pred(s)) {
        off();
        resolve(s);
      }
    });
  });
}

/* An in-process worker: real protocol, real transfer, asynchronous delivery */
class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  posts = 0;
  constructor(private readonly failAfter = Infinity) {}
  private readonly handle = createChunkProducer((msg, transfer) => {
    const data = structuredClone(msg, { transfer });
    const n = ++this.posts;
    setTimeout(() => {
      if (this.terminated) return;
      if (n > this.failAfter) {
        if (n === this.failAfter + 1) this.onerror?.({} as ErrorEvent);
        return;
      }
      this.onmessage?.({ data } as MessageEvent);
    }, 0);
  });
  postMessage(message: WorkerRequest): void {
    this.handle(message);
  }
  terminate(): void {
    this.terminated = true;
  }
}

describe("DatasetLoader", () => {
  it("generates on the main thread without a worker, one chunk per task", async () => {
    const loader = new DatasetLoader(opts);
    const versions: number[] = [];
    loader.subscribe(() => versions.push(loader.getSnapshot().version));
    loader.start();
    expect(loader.getSnapshot().loadedRows).toBe(0);
    const s = await until(loader, (x) => !x.loading);
    expect(s.mode).toBe("main");
    expect(s.loadedRows).toBe(2_300);
    expect(versions).toEqual([1, 2, 3, 4, 5]);
    expect(storeDigest(loader.store)).toBe(expected);
  });

  it("reports a failing chunk once and loads it on retry", async () => {
    const loader = new DatasetLoader({ ...opts, failChunks: [2] });
    loader.start();
    const s = await until(loader, (x) => !x.loading);
    expect(s.chunkErrors).toEqual([{ index: 2, start: 1_000, count: 500 }]);
    expect(s.loadedRows).toBe(1_800);
    expect(loader.store.loaded[1_000]).toBe(0);
    loader.retry(2);
    expect(loader.getSnapshot().chunkErrors).toEqual([]);
    expect(storeDigest(loader.store)).toBe(expected);
  });

  it("loads through a worker with transferred buffers", async () => {
    const workers: FakeWorker[] = [];
    const loader = new DatasetLoader({
      ...opts,
      failChunks: [0],
      createWorker: () => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      },
    });
    loader.start();
    const s = await until(loader, (x) => !x.loading);
    expect(s.mode).toBe("worker");
    expect(s.chunkErrors.map((e) => e.index)).toEqual([0]);
    loader.retry(0);
    const done = await until(loader, (x) => x.chunkErrors.length === 0);
    expect(done.loadedRows).toBe(2_300);
    expect(storeDigest(loader.store)).toBe(expected);
    loader.stop();
    expect(workers[0]?.terminated).toBe(true);
  });

  it("falls back to the main thread when the worker cannot start", async () => {
    const loader = new DatasetLoader({
      ...opts,
      createWorker: () => {
        throw new Error("no workers here");
      },
    });
    loader.start();
    const s = await until(loader, (x) => !x.loading);
    expect(s.mode).toBe("main");
    expect(storeDigest(loader.store)).toBe(expected);
  });

  it("finishes on the main thread when the worker fails midway", async () => {
    let worker: FakeWorker | null = null;
    const loader = new DatasetLoader({
      ...opts,
      createWorker: () => (worker = new FakeWorker(2)),
    });
    loader.start();
    const s = await until(loader, (x) => !x.loading);
    expect(worker!.terminated).toBe(true);
    expect(s.mode).toBe("main");
    expect(storeDigest(loader.store)).toBe(expected);
  });

  it("resumes after stop and never reloads a chunk over an edit", async () => {
    const loader = new DatasetLoader(opts);
    loader.start();
    loader.stop();
    loader.start();
    await until(loader, (x) => x.loadedRows >= 500);
    writeComment(loader.store, 3, { kind: "text", text: "kept" }, 0);
    loader.stop();
    loader.start();
    const s = await until(loader, (x) => !x.loading);
    expect(s.loadedRows).toBe(2_300);
    expect(getComment(loader.store, 3)).toEqual({ kind: "text", text: "kept" });
    loader.retry(0);
    expect(getComment(loader.store, 3)).toEqual({ kind: "text", text: "kept" });
    const v = loader.getSnapshot().version;
    loader.notify();
    expect(loader.getSnapshot().version).toBe(v + 1);
  });

  it("tells the caller where each chunk landed, so a search index can follow", async () => {
    const search: string[] = new Array<string>(2_300).fill("");
    const seen: [number, number][] = [];
    const loader: DatasetLoader = new DatasetLoader({
      ...opts,
      onChunk: (start, count) => {
        seen.push([start, count]);
        for (let i = start; i < start + count; i++) refreshSearch(search, loader.store, en, i);
      },
    });
    loader.start();
    await until(loader, (x) => !x.loading);
    expect(seen).toEqual([
      [0, 500],
      [500, 500],
      [1_000, 500],
      [1_500, 500],
      [2_000, 300],
    ]);
    expect(search).toEqual(buildSearchIndex(loader.store, en));
  });
});
