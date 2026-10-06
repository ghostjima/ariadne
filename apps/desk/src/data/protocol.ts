// Messages between the page and the desk worker. The worker answers
// @ariadne/grid's own generate and retry requests with its chunk producer (so
// DatasetLoader drives it unchanged), and adds queries, edits and CSV.
import type { CommentValue, Facets, WorkerRequest, WorkerResponse } from "@ariadne/grid";
import type { Query } from "./query";

export type QueryRequest = { type: "query"; id: number } & Query;

/** Values of edited rows, copied from the page's store into the worker's. */
export type SyncRequest = {
  type: "sync";
  rows: Uint32Array;
  status: Uint8Array;
  slaBreached: Uint8Array;
  updatedAt: Float64Array;
  /** Present when comments changed. */
  comments?: CommentValue[];
};

export type CsvRequest = { type: "csv"; id: number; index: Uint32Array; columns: string[]; lang: Query["lang"]; limit: number };

export type DeskRequest = WorkerRequest | QueryRequest | SyncRequest | CsvRequest;

export type QueryResponse = {
  type: "result";
  id: number;
  index: Uint32Array;
  facets: Facets;
  sortMs: number;
  searchMs: number;
  filterMs: number;
};

export type CsvResponse = { type: "csv"; id: number; text: string };

export type DeskResponse = WorkerResponse | QueryResponse | CsvResponse;

export const isLoaderMessage = (msg: DeskResponse): msg is WorkerResponse => msg.type === "chunk" || msg.type === "chunk-error";
