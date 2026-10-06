// The desk worker: generation, filtering, sorting, search and CSV off the
// main thread.
import { createDeskHandler } from "./handler";
import type { DeskRequest } from "./protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const handle = createDeskHandler((msg, transfer) => scope.postMessage(msg, transfer));
scope.onmessage = (event: MessageEvent<DeskRequest>) => handle(event.data);
