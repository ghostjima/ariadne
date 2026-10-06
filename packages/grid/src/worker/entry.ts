import { loadRules } from "@ariadne/rules";
import { createChunkProducer, type WorkerRequest, type WorkerResponse } from "./protocol.js";

/*
  Dataset worker entry. Load it as a module worker, for example
  new Worker(new URL("@ariadne/grid/worker", import.meta.url), { type: "module" }),
  and hand it to DatasetLoader through `createWorker`.
*/

type Scope = {
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
  postMessage(msg: WorkerResponse, transfer: ArrayBuffer[]): void;
};

const scope = globalThis as unknown as Scope;
const handle = createChunkProducer((msg, transfer) => scope.postMessage(msg, transfer));
/* Messages that arrive while the rules module loads wait for it, in
   order. If it cannot load, the error is thrown from the worker, so the
   loader's onerror falls back to the main thread. */
const ready = loadRules();
ready.catch((e: unknown) => {
  setTimeout(() => {
    throw e;
  }, 0);
});
scope.onmessage = (event) => {
  void ready.then(() => handle(event.data));
};
