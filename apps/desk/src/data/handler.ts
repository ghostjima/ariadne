// The desk worker's message handler, kept apart from the worker's global
// scope so the same code runs in a worker and in tests.
import { applyChunk, createChunkProducer, createStore, writeComment, type ColumnStore, type WorkerResponse } from "@ariadne/grid";
import type { DeskRequest, DeskResponse, SyncRequest } from "./protocol";
import { QueryEngine } from "./query";

export type DeskPost = (msg: DeskResponse, transfer: Transferable[]) => void;

/** Copies edited values into a store. */
export function applySync(store: ColumnStore, msg: SyncRequest): void {
  msg.rows.forEach((row, k) => {
    store.status[row] = msg.status[k] ?? 0;
    store.slaBreached[row] = msg.slaBreached[k] ?? 0;
    const comment = msg.comments?.[k];
    if (comment) writeComment(store, row, comment, 0);
    store.updatedAt[row] = msg.updatedAt[k] ?? 0;
  });
}

export function createDeskHandler(post: DeskPost): (msg: DeskRequest) => void {
  let engine: QueryEngine | null = null;
  // A chunk is copied into the worker's store before its buffers are
  // transferred to the page, so both sides hold the rows.
  const produce = createChunkProducer((msg: WorkerResponse, transfer) => {
    if (msg.type === "chunk" && engine) {
      applyChunk(engine.store, msg.chunk);
      engine.rowsLoaded();
    }
    post(msg, transfer);
  });

  return (msg) => {
    switch (msg.type) {
      case "generate":
      case "retry":
        engine ??= new QueryEngine(createStore(msg.total));
        produce(msg);
        return;
      case "sync":
        if (!engine) return;
        applySync(engine.store, msg);
        engine.rowsEdited(msg.rows);
        return;
      case "query": {
        if (!engine) return;
        const out = engine.run(msg);
        post({ type: "result", id: msg.id, ...out }, [out.index.buffer as ArrayBuffer]);
        return;
      }
      case "csv":
        if (!engine) return;
        post({ type: "csv", id: msg.id, text: engine.csv(msg.index, msg.columns, msg.lang, msg.limit) }, []);
        return;
    }
  };
}
