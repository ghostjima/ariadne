import { chunkBounds, generateChunk } from "../generator.js";
import { chunkTransferables, type Chunk } from "../store.js";

/*
  Messages between the loader and the dataset worker. A chunk travels with
  all of its buffers transferred, so the post is zero-copy. A chunk index
  listed in `failChunks` reports an error once (to exercise the partial-load
  error state); a retry succeeds.
*/

export type WorkerRequest =
  | {
      type: "generate";
      seed: number;
      total: number;
      chunkSize: number;
      failChunks: number[];
    }
  | { type: "retry"; seed: number; index: number; total: number; chunkSize: number };

export type WorkerResponse =
  | { type: "chunk"; index: number; chunk: Chunk }
  | { type: "chunk-error"; index: number; start: number; count: number };

export type Post = (msg: WorkerResponse, transfer: ArrayBuffer[]) => void;

/*
  The worker's message handler, kept apart from the global scope so the
  same code runs inside a worker, on the main thread and in tests.
*/
export function createChunkProducer(post: Post): (msg: WorkerRequest) => void {
  const failedOnce = new Set<number>();

  const produce = (seed: number, index: number, total: number, chunkSize: number, fail: boolean) => {
    const { start, count } = chunkBounds(index, total, chunkSize);
    if (fail && !failedOnce.has(index)) {
      failedOnce.add(index);
      post({ type: "chunk-error", index, start, count }, []);
      return;
    }
    const chunk = generateChunk(seed, start, count);
    post({ type: "chunk", index, chunk }, chunkTransferables(chunk));
  };

  return (msg) => {
    if (msg.type === "generate") {
      const n = Math.ceil(msg.total / msg.chunkSize);
      const fail = new Set(msg.failChunks);
      for (let i = 0; i < n; i++) produce(msg.seed, i, msg.total, msg.chunkSize, fail.has(i));
    } else if (msg.type === "retry") {
      produce(msg.seed, msg.index, msg.total, msg.chunkSize, false);
    }
  };
}
