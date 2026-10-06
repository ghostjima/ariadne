// The page's side of the data: @ariadne/grid's DatasetLoader fills the page's
// store, and the desk worker answers queries over its own copy. Queries
// are latest-wins: one is in flight at a time, and whatever was asked
// meanwhile goes out, once, when it returns. Without a worker (none
// created, or it failed) the same work runs on the main thread, one task
// per query. A small external store for useSyncExternalStore.
import { DatasetLoader, getNote, type ColumnStore, type Facets, type LoadSnapshot, type WorkerLike } from "@ariadne/grid";
import { isLoaderMessage, type DeskRequest, type DeskResponse, type QueryResponse, type SyncRequest } from "./protocol";
import { QueryEngine, type Query } from "./query";

export type EngineMode = "worker" | "main";

export type QueryResult = {
  id: number;
  index: Uint32Array;
  facets: Facets;
  sortMs: number;
  searchMs: number;
  filterMs: number;
  /** From posting the query to receiving its result, on the main thread. */
  roundTripMs: number;
};

export type EngineSnapshot = {
  load: LoadSnapshot;
  result: QueryResult | null;
  mode: EngineMode;
  /** A query is on its way. */
  busy: boolean;
};

export type EngineOptions = {
  /** Creates the desk worker; without it everything runs on the main thread. */
  createWorker?: () => Worker;
  failChunks?: number[];
  total?: number;
  chunkSize?: number;
  seed?: number;
};

export class DeskEngine {
  readonly loader: DatasetLoader;
  private worker: Worker | null = null;
  private local: QueryEngine | null = null;
  private latest: Query | null = null;
  private inFlight: { id: number; sentAt: number } | null = null;
  private dirty = false;
  private nextId = 1;
  private readonly csvWaiters = new Map<number, (text: string) => void>();
  private readonly listeners = new Set<() => void>();
  private lastLoaded = 0;
  private snap: EngineSnapshot;

  constructor(options: EngineOptions = {}) {
    const create = options.createWorker;
    this.loader = new DatasetLoader({
      total: options.total,
      chunkSize: options.chunkSize,
      seed: options.seed,
      failChunks: options.failChunks,
      createWorker: create ? () => this.attach(create()) : undefined,
    });
    this.snap = { load: this.loader.getSnapshot(), result: null, mode: create ? "worker" : "main", busy: false };
    if (!create) this.local = new QueryEngine(this.loader.store);
    this.loader.subscribe(this.onLoad);
  }

  get store(): ColumnStore {
    return this.loader.store;
  }

  /** The id the next query will carry: any result with this id or a later
   * one reflects everything asked before now. */
  get upcomingId(): number {
    return this.nextId;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): EngineSnapshot => this.snap;

  stop(): void {
    this.loader.stop();
    this.worker = null;
    // A query sent to the stopped worker never returns; ask it again on
    // the next start.
    if (this.inFlight) this.dirty = true;
    this.inFlight = null;
  }

  start(): void {
    this.loader.start();
    this.pump();
  }

  retry(index: number): void {
    this.loader.retry(index);
  }

  query(q: Query): void {
    this.latest = q;
    this.dirty = true;
    this.pump();
  }

  /** Asks the latest query again, after the data changed. */
  requery(): void {
    if (!this.latest) return;
    this.dirty = true;
    this.pump();
  }

  /** Rows of the page's store were edited: copies them to the worker (or
   * tells the main-thread engine), then asks the query again. */
  sync(rows: ArrayLike<number>, notes: boolean): void {
    if (rows.length === 0) return;
    if (this.worker) {
      const store = this.store;
      const n = rows.length;
      const msg: SyncRequest = {
        type: "sync",
        rows: Uint32Array.from(rows),
        stage: new Uint8Array(n),
        outcome: new Uint8Array(n),
        ground: new Uint8Array(n),
        extension: new Uint8Array(n),
        assignee: new Uint8Array(n),
        sentOn: new Int32Array(n),
        breach: new Uint8Array(n),
        copies: new Uint8Array(n),
        rules: new Uint8Array(n),
        updatedAt: new Float64Array(n),
        notes: notes ? [] : undefined,
      };
      for (let k = 0; k < n; k++) {
        const row = rows[k]!;
        msg.stage[k] = store.stage[row] ?? 0;
        msg.outcome[k] = store.outcome[row] ?? 0;
        msg.ground[k] = store.ground[row] ?? 0;
        msg.extension[k] = store.extension[row] ?? 0;
        msg.assignee[k] = store.assignee[row] ?? 0;
        msg.sentOn[k] = store.sentOn[row] ?? -1;
        msg.breach[k] = store.breach[row] ?? 0;
        msg.copies[k] = store.copies[row] ?? 0;
        msg.rules[k] = store.rules[row] ?? 0;
        msg.updatedAt[k] = store.updatedAt[row] ?? 0;
        msg.notes?.push(getNote(store, row));
      }
      const buffers = [msg.rows, msg.stage, msg.outcome, msg.ground, msg.extension, msg.assignee, msg.sentOn, msg.breach, msg.copies, msg.rules, msg.updatedAt];
      this.post(msg, buffers.map((b) => b.buffer as ArrayBuffer));
    } else {
      this.local?.rowsEdited(rows);
    }
    this.requery();
  }

  /** CSV of the first `limit` rows of `index`, computed where queries are. */
  csv(index: Uint32Array, columns: string[], lang: Query["lang"], limit: number): Promise<string> {
    const part = index.slice(0, limit);
    if (!this.worker) return Promise.resolve(this.mainThread().csv(part, columns, lang, limit));
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.csvWaiters.set(id, resolve);
      this.post({ type: "csv", id, index: part, columns, lang, limit }, [part.buffer]);
    });
  }

  private set(patch: Partial<EngineSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const listener of this.listeners) listener();
  }

  private post(msg: DeskRequest, transfer: Transferable[] = []): void {
    this.worker?.postMessage(msg, transfer);
  }

  /** Wraps the desk worker for the loader: chunk messages go to the loader,
   * query and CSV replies come here. */
  private attach(real: Worker): WorkerLike {
    const facade: WorkerLike = {
      postMessage: (message) => real.postMessage(message),
      terminate: () => real.terminate(),
      onmessage: null,
      onerror: null,
    };
    real.onmessage = (event: MessageEvent<DeskResponse>) => {
      if (isLoaderMessage(event.data)) facade.onmessage?.(event);
      else this.receive(event.data);
    };
    real.onerror = (event) => {
      this.failOver();
      facade.onerror?.(event);
    };
    this.worker = real;
    return facade;
  }

  private mainThread(): QueryEngine {
    this.local ??= new QueryEngine(this.loader.store);
    return this.local;
  }

  /** The worker failed: the loader generates what is missing on the main
   * thread, and queries and CSV move there too. */
  private failOver(): void {
    this.worker = null;
    this.mainThread();
    const waiting = this.inFlight !== null;
    this.inFlight = null;
    if (waiting) this.dirty = true;
    this.set({ mode: "main" });
    this.pump();
  }

  private onLoad = (): void => {
    const load = this.loader.getSnapshot();
    if (load.mode === "main" && this.snap.mode === "worker") this.failOver();
    this.set({ load });
    if (load.loadedRows !== this.lastLoaded) {
      this.lastLoaded = load.loadedRows;
      this.local?.rowsLoaded();
      this.requery();
    }
  };

  private pump(): void {
    if (this.inFlight || !this.dirty || !this.latest || this.lastLoaded === 0) return;
    this.dirty = false;
    const q = this.latest;
    const id = this.nextId++;
    this.inFlight = { id, sentAt: performance.now() };
    if (!this.snap.busy) this.set({ busy: true });
    if (this.worker) {
      this.post({ type: "query", id, ...q });
    } else {
      const local = this.mainThread();
      setTimeout(() => this.receive({ type: "result", id, ...local.run(q) }), 0);
    }
  }

  private receive(msg: DeskResponse): void {
    if (msg.type === "csv") {
      this.csvWaiters.get(msg.id)?.(msg.text);
      this.csvWaiters.delete(msg.id);
      return;
    }
    if (msg.type !== "result") return;
    this.accept(msg);
  }

  private accept(msg: QueryResponse): void {
    if (!this.inFlight || msg.id !== this.inFlight.id) return;
    const roundTripMs = performance.now() - this.inFlight.sentAt;
    this.inFlight = null;
    const { type: _type, ...rest } = msg;
    this.set({ result: { ...rest, roundTripMs }, busy: this.dirty });
    this.pump();
  }
}
