/*
  A model client over ollama's HTTP API (POST /api/chat), for a local
  ollama. It uses fetch and a streamed body, so it runs in Node and in a
  page alike.

  The call is streamed: the answer is read as it is generated, and an
  aborted signal closes the connection, at which ollama stops generating.
  `format` carries the JSON schema, which ollama turns into a grammar for
  the decoder; `think` is sent only when the caller says on or off.
*/

import {
  ModelError,
  type ChatRequest,
  type ChatResponse,
  type ChatUsage,
  type ModelClient,
  type ModelStamp,
} from "./client.js";

export const OLLAMA_URL = "http://127.0.0.1:11434";

export type OllamaOptions = {
  /* The model's tag ("qwen3:8b") */
  model: string;
  baseUrl?: string;
  /* The context window to run with, in tokens; ollama's own when left out */
  contextTokens?: number;
  fetch?: typeof fetch;
  now?: () => number;
};

type Chunk = {
  message?: { content?: string; thinking?: string };
  done?: boolean;
  done_reason?: string;
  error?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
  total_duration?: number;
};

const ms = (ns: number | undefined): number | null => (typeof ns === "number" ? ns / 1e6 : null);
const count = (n: number | undefined): number | null => (typeof n === "number" ? n : null);

export class OllamaClient implements ModelClient {
  readonly model: string;
  readonly baseUrl: string;
  readonly contextTokens: number | null;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;

  constructor(options: OllamaOptions) {
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? OLLAMA_URL).replace(/\/+$/, "");
    this.contextTokens = options.contextTokens ?? null;
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.#now = options.now ?? (() => performance.now());
  }

  async #json(path: string, signal: AbortSignal | undefined, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.baseUrl}${path}`, {
        ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ModelError(`${path}: ${String(error)}`);
    }
    if (!response.ok) throw new ModelError(`${path}: HTTP ${response.status}`);
    return response.json();
  }

  /* The model as ollama identifies it: its version, the digest of the
     tag's manifest (the ID `ollama list` shows) and whether the model has
     a thinking switch */
  async describe(signal?: AbortSignal): Promise<ModelStamp> {
    const version = (await this.#json("/api/version", signal)) as { version?: string };
    const tags = (await this.#json("/api/tags", signal)) as {
      models?: { name?: string; model?: string; digest?: string; details?: { family?: string; parameter_size?: string; quantization_level?: string } }[];
    };
    const found = tags.models?.find((m) => m.name === this.model || m.model === this.model);
    if (!found) throw new ModelError(`/api/tags: no model ${this.model}`);
    const show = (await this.#json("/api/show", signal, { model: this.model })) as { capabilities?: string[] };
    return {
      engine: "ollama",
      engineVersion: version.version ?? null,
      model: this.model,
      digest: found.digest ?? null,
      family: found.details?.family ?? null,
      parameters: found.details?.parameter_size ?? null,
      quantisation: found.details?.quantization_level ?? null,
      thinking: show.capabilities?.includes("thinking") ?? false,
    };
  }

  async chat(request: ChatRequest, signal: AbortSignal): Promise<ChatResponse> {
    const { temperature, seed, maxTokens, think } = request.options;
    const body = {
      model: this.model,
      messages: request.messages,
      stream: true,
      format: request.schema,
      ...(think === null ? {} : { think }),
      options: {
        temperature,
        seed,
        num_predict: maxTokens,
        ...(this.contextTokens === null ? {} : { num_ctx: this.contextTokens }),
      },
    };
    const started = this.#now();
    let content = "";
    let thinking = "";
    let firstChunkMs: number | null = null;
    let last: Chunk | null = null;
    try {
      const response = await this.#fetch(`${this.baseUrl}/api/chat`, { method: "POST", body: JSON.stringify(body), signal });
      if (!response.ok || !response.body) throw new ModelError(`/api/chat: HTTP ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const take = (line: string) => {
        if (line.trim() === "") return;
        const chunk = JSON.parse(line) as Chunk;
        if (chunk.error) throw new ModelError(`/api/chat: ${chunk.error}`);
        firstChunkMs ??= this.#now() - started;
        content += chunk.message?.content ?? "";
        thinking += chunk.message?.thinking ?? "";
        if (chunk.done) last = chunk;
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
          take(buffer.slice(0, end));
          buffer = buffer.slice(end + 1);
        }
      }
      take(buffer + decoder.decode());
    } catch (error) {
      /* Stopped by the caller: nothing of the answer is kept */
      if (signal.aborted) throw error;
      if (error instanceof ModelError) throw error;
      throw new ModelError(`/api/chat: ${String(error)}`);
    }
    if (last === null) throw new ModelError("/api/chat: the stream ended before the answer did");
    const end = last as Chunk;
    const usage: ChatUsage = {
      promptTokens: count(end.prompt_eval_count),
      answerTokens: count(end.eval_count),
      loadMs: ms(end.load_duration),
      promptMs: ms(end.prompt_eval_duration),
      answerMs: ms(end.eval_duration),
      totalMs: ms(end.total_duration),
    };
    return {
      content,
      thinking: thinking === "" ? null : thinking,
      finish: end.done_reason ?? null,
      usage,
      firstChunkMs,
      wallMs: this.#now() - started,
    };
  }
}
