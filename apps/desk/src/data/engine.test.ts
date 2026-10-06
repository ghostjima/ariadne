import { describe, expect, it } from "vitest";
import { EMPTY_CRITERIA, writeStatus } from "@ariadne/grid";
import { DeskEngine } from "./engine";
import { createDeskHandler } from "./handler";
import type { DeskRequest } from "./protocol";

/** A worker that runs the desk handler in this thread, one task per message
 * each way, like a real worker. */
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  failOnQuery = false;
  private handle = createDeskHandler((msg) => setTimeout(() => !this.terminated && this.onmessage?.({ data: msg } as MessageEvent), 0));
  postMessage(msg: DeskRequest) {
    setTimeout(() => {
      if (this.terminated) return;
      if (this.failOnQuery && msg.type === "query") this.onerror?.({} as ErrorEvent);
      else this.handle(msg);
    }, 0);
  }
  terminate() {
    this.terminated = true;
  }
}

function settled(engine: DeskEngine, done: (e: DeskEngine) => boolean, ms = 5_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    const check = () => {
      if (done(engine)) {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    };
    const unsubscribe = engine.subscribe(check);
    check();
  });
}

const all = { criteria: EMPTY_CRITERIA, sort: null, lang: "en" as const };

describe("DeskEngine", () => {
  it("loads through the worker and answers the latest query once", async () => {
    const worker = new FakeWorker();
    const engine = new DeskEngine({ total: 12_000, createWorker: () => worker as unknown as Worker });
    engine.query(all);
    engine.start();
    await settled(engine, (e) => !e.getSnapshot().load.loading && e.getSnapshot().result?.index.length === 12_000 && !e.getSnapshot().busy);
    expect(engine.getSnapshot().mode).toBe("worker");
    // Three queries asked at once: one goes out now, the last one after it.
    const before = engine.getSnapshot().result!.id;
    engine.query({ ...all, criteria: { ...EMPTY_CRITERIA, status: [0] } });
    engine.query({ ...all, criteria: { ...EMPTY_CRITERIA, status: [1] } });
    engine.query({ ...all, criteria: { ...EMPTY_CRITERIA, status: [2] } });
    await settled(engine, (e) => !e.getSnapshot().busy && e.getSnapshot().result!.id > before + 1);
    const result = engine.getSnapshot().result!;
    expect(result.id).toBe(before + 2);
    const store = engine.store;
    expect(Array.from(result.index).every((i) => store.status[i] === 2)).toBe(true);
    expect(result.roundTripMs).toBeGreaterThanOrEqual(0);
    engine.stop();
  });

  it("copies edits to the worker before asking again", async () => {
    const worker = new FakeWorker();
    const engine = new DeskEngine({ total: 5_000, createWorker: () => worker as unknown as Worker });
    const closed = { ...all, criteria: { ...EMPTY_CRITERIA, status: [6] } };
    engine.query(closed);
    engine.start();
    await settled(engine, (e) => !e.getSnapshot().load.loading && !e.getSnapshot().busy && e.getSnapshot().result !== null);
    const before = engine.getSnapshot().result!.index.length;
    const row = Array.from({ length: 5_000 }, (_, i) => i).find((i) => engine.store.status[i] !== 6)!;
    writeStatus(engine.store, row, 6, Date.now());
    const id = engine.getSnapshot().result!.id;
    engine.sync([row], false);
    await settled(engine, (e) => e.getSnapshot().result!.id > id && !e.getSnapshot().busy);
    expect(engine.getSnapshot().result!.index.length).toBe(before + 1);
    engine.stop();
  });

  it("moves to the main thread when the worker fails, and still answers", async () => {
    const worker = new FakeWorker();
    const engine = new DeskEngine({ total: 5_000, createWorker: () => worker as unknown as Worker });
    engine.query(all);
    engine.start();
    await settled(engine, (e) => !e.getSnapshot().load.loading && e.getSnapshot().result !== null && !e.getSnapshot().busy);
    worker.failOnQuery = true;
    engine.query({ ...all, criteria: { ...EMPTY_CRITERIA, priority: [2] } });
    await settled(engine, (e) => e.getSnapshot().mode === "main" && !e.getSnapshot().busy && e.getSnapshot().result!.index.length < 5_000);
    expect(Array.from(engine.getSnapshot().result!.index).every((i) => engine.store.priority[i] === 2)).toBe(true);
    const csv = await engine.csv(engine.getSnapshot().result!.index, ["id", "priority"], "en", 3);
    expect(csv.split("\r\n")).toHaveLength(4);
    engine.stop();
  });

  it("works without a worker, and reports failed chunks until retried", async () => {
    const engine = new DeskEngine({ total: 10_000, failChunks: [1] });
    engine.query(all);
    engine.start();
    await settled(engine, (e) => !e.getSnapshot().load.loading && !e.getSnapshot().busy && e.getSnapshot().result !== null);
    expect(engine.getSnapshot().mode).toBe("main");
    expect(engine.getSnapshot().load.chunkErrors).toEqual([{ index: 1, start: 5_000, count: 5_000 }]);
    expect(engine.getSnapshot().result!.index.length).toBe(5_000);
    engine.retry(1);
    await settled(engine, (e) => e.getSnapshot().result!.index.length === 10_000 && !e.getSnapshot().busy);
    expect(engine.getSnapshot().load.chunkErrors).toEqual([]);
    engine.stop();
  });
});
