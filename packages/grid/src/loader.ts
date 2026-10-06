import { chunkBounds, chunkCount, generateChunk } from "./generator.js";
import { CHUNK_SIZE, DEFAULT_SEED, TOTAL_ROWS } from "./schema.js";
import { applyChunk, createStore, type ColumnStore } from "./store.js";
import type { WorkerRequest, WorkerResponse } from "./worker/protocol.js";

/*
  Loads the dataset chunk by chunk into one store. With a worker, chunks are
  generated off the main thread and arrive with transferred buffers; without
  one (no factory, the factory throws, or the worker reports an error) the
  remaining chunks are generated on the main thread, one per task, so the
  page stays responsive. The loader is a small external store: subscribe
  and getSnapshot fit React's useSyncExternalStore, and nothing in it
  depends on a framework.
*/

/* The part of a Worker the loader uses */
export type WorkerLike = {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

export type ChunkError = { index: number; start: number; count: number };

export type LoadMode = "idle" | "worker" | "main";

export type LoadSnapshot = {
  /* Bumps on every change to the store */
  version: number;
  loadedRows: number;
  loading: boolean;
  chunkErrors: readonly ChunkError[];
  mode: LoadMode;
};

export type LoaderOptions = {
  seed?: number;
  total?: number;
  chunkSize?: number;
  /* Chunk indices that fail once, to exercise the error state */
  failChunks?: readonly number[];
  createWorker?: () => WorkerLike;
  /* Called after a chunk lands in the store, before subscribers run */
  onChunk?: (start: number, count: number) => void;
};

export class DatasetLoader {
  readonly store: ColumnStore;
  readonly seed: number;
  readonly total: number;
  readonly chunkSize: number;
  private readonly failChunks: Set<number>;
  private readonly chunks: number;
  private readonly createWorker: (() => WorkerLike) | undefined;
  private readonly onChunk: ((start: number, count: number) => void) | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly loadedChunks = new Set<number>();
  private errors: ChunkError[] = [];
  /* Chunks whose simulated failure has been reported; they never fail again */
  private readonly failedOnce = new Set<number>();
  private worker: WorkerLike | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private mode: LoadMode = "idle";
  private snap: LoadSnapshot;

  constructor(options: LoaderOptions = {}) {
    this.seed = options.seed ?? DEFAULT_SEED;
    this.total = options.total ?? TOTAL_ROWS;
    this.chunkSize = options.chunkSize ?? CHUNK_SIZE;
    this.failChunks = new Set(options.failChunks ?? []);
    this.createWorker = options.createWorker;
    this.onChunk = options.onChunk;
    this.chunks = chunkCount(this.total, this.chunkSize);
    this.store = createStore(this.total);
    this.snap = { version: 0, loadedRows: 0, loading: true, chunkErrors: [], mode: "idle" };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): LoadSnapshot => this.snap;

  /* Publishes a new snapshot after a change made outside the loader (an edit) */
  notify = (): void => {
    this.emit();
  };

  private emit(): void {
    let loadedRows = 0;
    for (const i of this.loadedChunks) loadedRows += chunkBounds(i, this.total, this.chunkSize).count;
    this.snap = {
      version: this.snap.version + 1,
      loadedRows,
      loading: this.loadedChunks.size + this.errors.length < this.chunks,
      chunkErrors: this.errors,
      mode: this.mode,
    };
    for (const listener of this.listeners) listener();
  }

  private accept(msg: WorkerResponse): void {
    if (this.stopped) return;
    if (msg.type === "chunk") {
      /* A chunk that is already in the store may carry edits; never reload it */
      if (this.loadedChunks.has(msg.index)) return;
      applyChunk(this.store, msg.chunk);
      this.loadedChunks.add(msg.index);
      if (this.errors.some((e) => e.index === msg.index)) {
        this.errors = this.errors.filter((e) => e.index !== msg.index);
      }
      this.onChunk?.(msg.chunk.start, msg.chunk.count);
    } else if (!this.errors.some((e) => e.index === msg.index)) {
      this.failedOnce.add(msg.index);
      this.errors = [...this.errors, { index: msg.index, start: msg.start, count: msg.count }];
    }
    this.emit();
  }

  /* Starts or resumes loading; safe to call again after stop() */
  start = (): void => {
    this.stopped = false;
    if (this.worker || this.timer !== null) return;
    if (this.loadedChunks.size === this.chunks) return;
    if (this.createWorker) {
      try {
        const worker = this.createWorker();
        this.worker = worker;
        this.mode = "worker";
        worker.onmessage = (e: MessageEvent) => this.accept(e.data as WorkerResponse);
        worker.onerror = () => this.fallBack();
        const req: WorkerRequest = {
          type: "generate",
          seed: this.seed,
          total: this.total,
          chunkSize: this.chunkSize,
          failChunks: this.pendingFails(),
        };
        worker.postMessage(req);
        return;
      } catch {
        this.worker = null;
      }
    }
    this.runOnMainThread();
  };

  private pendingFails(): number[] {
    return [...this.failChunks].filter((i) => !this.failedOnce.has(i) && !this.loadedChunks.has(i));
  }

  /* The worker failed: generate what has not arrived yet on the main thread */
  private fallBack(): void {
    this.worker?.terminate();
    this.worker = null;
    if (!this.stopped) this.runOnMainThread();
  }

  /* One chunk per task; loaded chunks and chunks waiting for a retry are skipped */
  private runOnMainThread(): void {
    this.mode = "main";
    const failNow = new Set(this.pendingFails());
    const skip = (i: number) => this.loadedChunks.has(i) || this.errors.some((e) => e.index === i);
    let i = 0;
    const step = () => {
      this.timer = null;
      while (i < this.chunks && skip(i)) i++;
      if (this.stopped || i >= this.chunks) return;
      const { start, count } = chunkBounds(i, this.total, this.chunkSize);
      if (failNow.has(i)) {
        failNow.delete(i);
        this.accept({ type: "chunk-error", index: i, start, count });
      } else {
        this.accept({ type: "chunk", index: i, chunk: generateChunk(this.seed, start, count) });
      }
      i++;
      this.timer = setTimeout(step, 0);
    };
    this.timer = setTimeout(step, 0);
  }

  stop = (): void => {
    this.stopped = true;
    this.worker?.terminate();
    this.worker = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  };

  retry = (index: number): void => {
    this.stopped = false;
    if (this.worker) {
      const req: WorkerRequest = {
        type: "retry",
        seed: this.seed,
        index,
        total: this.total,
        chunkSize: this.chunkSize,
      };
      this.worker.postMessage(req);
      return;
    }
    const { start, count } = chunkBounds(index, this.total, this.chunkSize);
    this.accept({ type: "chunk", index, chunk: generateChunk(this.seed, start, count) });
  };
}
