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
scope.onmessage = (event) => handle(event.data);
