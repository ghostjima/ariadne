/*
  A model client: the one thing a model-backed proposer needs from a model
  runtime. A chat call that takes messages and a JSON schema the answer
  must satisfy, runs at a fixed temperature and seed, and stops at once
  when its signal aborts. Nothing here names a runtime: OllamaClient
  (ollama.ts) speaks ollama's HTTP API, and a client over a model running
  in the page (WebGPU) or a fake one in a test implements the same two
  calls.
*/

import type { JsonSchema } from "../proposal.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatOptions = {
  temperature: number;
  seed: number;
  /* The most tokens the model may generate for the call */
  maxTokens: number;
  /* Thinking before the answer: on, off, or null to leave the runtime's
     default (a model without the switch) */
  think: boolean | null;
};

export type ChatRequest = {
  messages: ChatMessage[];
  /* The answer must be one JSON value of this schema; a client constrains
     the decoding with it where its runtime can */
  schema: JsonSchema;
  options: ChatOptions;
};

/* What the runtime reports of a call, null where it reports nothing.
   Counts are tokens, times are milliseconds. */
export type ChatUsage = {
  promptTokens: number | null;
  answerTokens: number | null;
  loadMs: number | null;
  promptMs: number | null;
  answerMs: number | null;
  totalMs: number | null;
};

export type ChatResponse = {
  /* The answer as the model gave it */
  content: string;
  /* What it thought before answering, where the runtime gives it apart */
  thinking: string | null;
  /* Why it stopped, as the runtime names it ("stop", "length") */
  finish: string | null;
  usage: ChatUsage;
  /* Measured by the client: from the request to the first chunk of the
     response, and to its end */
  firstChunkMs: number | null;
  wallMs: number;
};

/* Which model answered, as the runtime identifies it */
export type ModelStamp = {
  /* The runtime ("ollama") and its version */
  engine: string;
  engineVersion: string | null;
  /* The model's tag in the runtime, and the digest of its manifest */
  model: string;
  digest: string | null;
  family: string | null;
  parameters: string | null;
  quantisation: string | null;
  /* Whether the runtime lists a thinking switch for the model */
  thinking: boolean;
};

/* The model could not be reached or did not complete the call. `detail` is
   for a log, not for a person. */
export class ModelError extends Error {
  readonly code = "model_unavailable";
  constructor(readonly detail: string) {
    super(detail);
    this.name = "ModelError";
  }
}

export interface ModelClient {
  describe(signal?: AbortSignal): Promise<ModelStamp>;
  /* Rejects with the signal's reason when it aborts, and with a ModelError
     when the model cannot answer */
  chat(request: ChatRequest, signal: AbortSignal): Promise<ChatResponse>;
}
