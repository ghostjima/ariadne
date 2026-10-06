import { CURRENCY_RATES, METRIC_COUNT, Status } from "./schema.js";

/*
  Columnar store. Every generated field is a typed array of codes or
  numbers, so a chunk moves between threads with transferable buffers and
  the same rows serve every display language. The only non-typed part is
  `commentEdits`: comments written after generation (by the user or the
  simulated colleague), keyed by row.
*/

/* A comment cell: a pool entry (code 0 is empty), free text, or the
   colleague's numbered note. The text is resolved per language. */
export type CommentValue =
  | { kind: "pool"; code: number }
  | { kind: "text"; text: string }
  | { kind: "colleague"; n: number };

export type Columns = {
  date: Float64Array;
  amount: Float64Array;
  currency: Uint8Array;
  status: Uint8Array;
  /* index into pools.clients */
  client: Uint8Array;
  /* index into pools.owners */
  owner: Uint8Array;
  region: Uint8Array;
  priority: Uint8Array;
  sla: Float64Array;
  slaBreached: Uint8Array;
  /* bit k set means pools.tags[k] */
  tags: Uint8Array;
  /* row-major, METRIC_COUNT values per row */
  metrics: Float64Array;
  /* 0 is empty, k > 0 is pools.comments[k - 1] */
  comment: Uint8Array;
  channel: Uint8Array;
  updatedAt: Float64Array;
  /* index into pools.authors */
  createdBy: Uint8Array;
};

export type ColumnStore = Columns & {
  size: number;
  /* rows that have been loaded (1) or are still missing (0) */
  loaded: Uint8Array;
  /* comments edited after generation, overriding `comment` */
  commentEdits: Map<number, CommentValue>;
};

export type Chunk = Columns & { start: number; count: number };

export function allocColumns(size: number): Columns {
  return {
    date: new Float64Array(size),
    amount: new Float64Array(size),
    currency: new Uint8Array(size),
    status: new Uint8Array(size),
    client: new Uint8Array(size),
    owner: new Uint8Array(size),
    region: new Uint8Array(size),
    priority: new Uint8Array(size),
    sla: new Float64Array(size),
    slaBreached: new Uint8Array(size),
    tags: new Uint8Array(size),
    metrics: new Float64Array(size * METRIC_COUNT),
    comment: new Uint8Array(size),
    channel: new Uint8Array(size),
    updatedAt: new Float64Array(size),
    createdBy: new Uint8Array(size),
  };
}

export function createStore(size: number): ColumnStore {
  return { ...allocColumns(size), size, loaded: new Uint8Array(size), commentEdits: new Map() };
}

/* Copies a chunk into the store at its start offset */
export function applyChunk(store: ColumnStore, chunk: Chunk): void {
  const { start, count } = chunk;
  store.date.set(chunk.date, start);
  store.amount.set(chunk.amount, start);
  store.currency.set(chunk.currency, start);
  store.status.set(chunk.status, start);
  store.client.set(chunk.client, start);
  store.owner.set(chunk.owner, start);
  store.region.set(chunk.region, start);
  store.priority.set(chunk.priority, start);
  store.sla.set(chunk.sla, start);
  store.slaBreached.set(chunk.slaBreached, start);
  store.tags.set(chunk.tags, start);
  store.metrics.set(chunk.metrics, start * METRIC_COUNT);
  store.comment.set(chunk.comment, start);
  store.channel.set(chunk.channel, start);
  store.updatedAt.set(chunk.updatedAt, start);
  store.createdBy.set(chunk.createdBy, start);
  store.loaded.fill(1, start, start + count);
  for (let i = start; i < start + count; i++) store.commentEdits.delete(i);
}

/* Every buffer of a chunk, for a zero-copy postMessage */
export function chunkTransferables(chunk: Chunk): ArrayBuffer[] {
  return [
    chunk.date.buffer,
    chunk.amount.buffer,
    chunk.currency.buffer,
    chunk.status.buffer,
    chunk.client.buffer,
    chunk.owner.buffer,
    chunk.region.buffer,
    chunk.priority.buffer,
    chunk.sla.buffer,
    chunk.slaBreached.buffer,
    chunk.tags.buffer,
    chunk.metrics.buffer,
    chunk.comment.buffer,
    chunk.channel.buffer,
    chunk.updatedAt.buffer,
    chunk.createdBy.buffer,
  ] as ArrayBuffer[];
}

export function padId(n: number): string {
  return `Z-${String(n).padStart(6, "0")}`;
}

/* The request id of a row is derived from its position, so it is not stored */
export function rowId(i: number): string {
  return padId(i + 1);
}

/* Row position of a request id, or -1 */
export function rowOfId(id: string, size: number): number {
  const m = /^Z-(\d{6})$/.exec(id);
  if (!m) return -1;
  const i = Number(m[1]) - 1;
  return i >= 0 && i < size ? i : -1;
}

/* A row's amount in the reference currency, at the dataset's fixed rates */
export function convertedAmount(store: ColumnStore, i: number): number {
  return (store.amount[i] ?? 0) * (CURRENCY_RATES[store.currency[i] ?? 0] ?? 1);
}

export function getComment(store: ColumnStore, i: number): CommentValue {
  return store.commentEdits.get(i) ?? { kind: "pool", code: store.comment[i] ?? 0 };
}

/* Whether a row has no comment, in any language */
export function isCommentBlank(store: ColumnStore, i: number): boolean {
  const c = getComment(store, i);
  if (c.kind === "pool") return c.code === 0;
  if (c.kind === "text") return c.text.trim() === "";
  return false;
}

export function sameComment(a: CommentValue, b: CommentValue): boolean {
  if (a.kind === "pool" && b.kind === "pool") return a.code === b.code;
  if (a.kind === "text" && b.kind === "text") return a.text === b.text;
  if (a.kind === "colleague" && b.kind === "colleague") return a.n === b.n;
  return false;
}

/* One row as codes, language-neutral */
export type RowCodes = {
  index: number;
  id: string;
  date: number;
  amount: number;
  currency: number;
  status: number;
  client: number;
  owner: number;
  region: number;
  priority: number;
  sla: number;
  slaBreached: boolean;
  tags: number;
  metrics: Float64Array;
  comment: CommentValue;
  channel: number;
  updatedAt: number;
  createdBy: number;
};

export function getRow(store: ColumnStore, i: number): RowCodes {
  return {
    index: i,
    id: rowId(i),
    date: store.date[i] ?? 0,
    amount: store.amount[i] ?? 0,
    currency: store.currency[i] ?? 0,
    status: store.status[i] ?? 0,
    client: store.client[i] ?? 0,
    owner: store.owner[i] ?? 0,
    region: store.region[i] ?? 0,
    priority: store.priority[i] ?? 0,
    sla: store.sla[i] ?? 0,
    slaBreached: (store.slaBreached[i] ?? 0) === 1,
    tags: store.tags[i] ?? 0,
    metrics: store.metrics.subarray(i * METRIC_COUNT, (i + 1) * METRIC_COUNT),
    comment: getComment(store, i),
    channel: store.channel[i] ?? 0,
    updatedAt: store.updatedAt[i] ?? 0,
    createdBy: store.createdBy[i] ?? 0,
  };
}

const DAY = 86_400_000;

/* Start of the UTC day of `now`: what an edit writes into updatedAt */
export function dayOf(now: number): number {
  return Math.floor(now / DAY) * DAY;
}

/* Writes a status. A settled request no longer breaches its SLA. */
export function writeStatus(store: ColumnStore, row: number, status: number, now: number): void {
  store.status[row] = status;
  if (status >= Status.Approved) store.slaBreached[row] = 0;
  store.updatedAt[row] = dayOf(now);
}

/* Writes a comment. A pool value clears any edit; other values override. */
export function writeComment(
  store: ColumnStore,
  row: number,
  value: CommentValue,
  now: number,
): void {
  if (value.kind === "pool") {
    store.comment[row] = value.code;
    store.commentEdits.delete(row);
  } else if (value.kind === "text" && value.text === "") {
    store.comment[row] = 0;
    store.commentEdits.delete(row);
  } else {
    store.commentEdits.set(row, value);
  }
  store.updatedAt[row] = dayOf(now);
}
