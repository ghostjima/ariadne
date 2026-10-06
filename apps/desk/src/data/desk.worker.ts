// The desk worker: generation, filtering, sorting, search and CSV off the
// main thread.
import { loadRules } from "@ariadne/rules";
import { createDeskHandler } from "./handler";
import type { DeskRequest } from "./protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const handle = createDeskHandler((msg, transfer) => scope.postMessage(msg, transfer));
// The register's deadlines come from ariadne-rules: its WebAssembly module
// loads first, and messages that arrive meanwhile wait, in order. If it
// cannot load, the error leaves the worker, and the page falls back to the
// main thread.
const ready = loadRules();
ready.catch((e: unknown) => {
  setTimeout(() => {
    throw e;
  }, 0);
});
scope.onmessage = (event: MessageEvent<DeskRequest>) => {
  void ready.then(() => handle(event.data));
};
