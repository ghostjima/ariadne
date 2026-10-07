// The desk worker's message handler, kept apart from the worker's global
// scope so the same code runs in a worker and in tests.
import { applyChunk, createChunkProducer, createStore, writeNote, type ColumnStore, type WorkerResponse } from "@ariadne/grid";
import type { DeskRequest, DeskResponse, SyncRequest } from "./protocol";
import { QueryEngine } from "./query";

export type DeskPost = (msg: DeskResponse, transfer: Transferable[]) => void;

/** Copies edited values into a store. */
export function applySync(store: ColumnStore, msg: SyncRequest): void {
  msg.rows.forEach((row, k) => {
    store.stage[row] = msg.stage[k] ?? 0;
    store.outcome[row] = msg.outcome[k] ?? 0;
    store.ground[row] = msg.ground[k] ?? 0;
    store.extension[row] = msg.extension[k] ?? 0;
    store.assignee[row] = msg.assignee[k] ?? 0;
    store.sentOn[row] = msg.sentOn[k] ?? -1;
    store.breach[row] = msg.breach[k] ?? 0;
    store.copies[row] = msg.copies[k] ?? 0;
    store.rules[row] = msg.rules[k] ?? 0;
    const note = msg.notes?.[k];
    if (note) writeNote(store, row, note, 0);
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
