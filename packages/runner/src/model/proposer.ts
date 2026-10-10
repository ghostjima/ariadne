/*
  The model-backed proposer: a model answers each task with JSON of the
  task's schema, and the answer becomes a proposal only through the
  engine's validation.

  One call, the answer parsed and validated (proposal.ts). An answer that
  does not validate gets one repair attempt: the same conversation with the
  answer and its issues appended. A second failure is the coded failure
  proposal_invalid; a model that cannot be reached is model_unavailable.
  Neither is thrown: a failed proposal is a step's error, which a person
  retries or skips.

  Every call carries the caller's AbortSignal. An aborted call rejects and
  proposes nothing: no outcome is returned for it, so nothing can be
  written to a proposal log.

  What a model is told is not the engine's business: the conversation of
  each task comes from a Prompts object the application supplies, which is
  where a complaint's text and a case's facts enter. The proposer only
  sends it, with the schema, at temperature 0 and a fixed seed by default.
*/

import type { ProposalError } from "../codes.js";
import { parseAnswer, proposalSchema, type ProposalIssue } from "../proposal.js";
import type { ProposalOutcome, ProposalRequest, ProposalTask, Proposer } from "../proposer.js";
import { ModelError, type ChatMessage, type ChatOptions, type ChatRequest, type ChatResponse, type ModelClient } from "./client.js";

export interface Prompts {
  /* The conversation that asks for the proposal of a task */
  messages(request: ProposalRequest): ChatMessage[];
  /* What is said to the model after an answer that did not validate */
  repair(request: ProposalRequest, issues: readonly ProposalIssue[]): string;
}

/* The seed every call runs with unless another is given */
export const DEFAULT_MODEL_SEED = 7;

/* How long one call may take before it counts as a model that could not
   answer, in ms */
export const DEFAULT_CALL_TIMEOUT_MS = 180_000;

/* The most tokens a call may generate, by task. A model that thinks
   before it answers spends these on its thinking too: give it more. */
export const DEFAULT_MAX_TOKENS: Record<ProposalTask, number> = {
  classify: 256,
  request_facts: 256,
  draft_reply: 1536,
};

/* One call to the model and what became of its answer */
export type Exchange = {
  task: ProposalTask;
  /* The step's attempt the call belongs to, and whether it is the first
     answer (1) or the repair (2) */
  attempt: number;
  call: 1 | 2;
  request: ChatRequest;
  /* Null when the call failed or was aborted */
  response: ChatResponse | null;
  failure: "model_unavailable" | "aborted" | null;
  /* The runtime's own words for a failure, for a log */
  detail: string | null;
  /* What validation found; empty for an answer that became a proposal */
  issues: ProposalIssue[];
  valid: boolean;
  /* From the call to its end, as the proposer measured it */
  ms: number;
};

export type ModelProposerOptions = {
  client: ModelClient;
  prompts: Prompts;
  temperature?: number;
  seed?: number;
  think?: boolean | null;
  maxTokens?: Partial<Record<ProposalTask, number>>;
  /* The longest one call may take, in ms */
  timeoutMs?: number;
  /* Called with every exchange as it ends, an aborted one included */
  record?: (exchange: Exchange) => void;
  now?: () => number;
};

export class ModelProposer implements Proposer {
  readonly #client: ModelClient;
  readonly #prompts: Prompts;
  readonly #options: Omit<ChatOptions, "maxTokens">;
  readonly #maxTokens: Record<ProposalTask, number>;
  readonly #timeoutMs: number;
  readonly #record: (exchange: Exchange) => void;
  readonly #now: () => number;

  constructor(options: ModelProposerOptions) {
    this.#client = options.client;
    this.#prompts = options.prompts;
    this.#options = { temperature: options.temperature ?? 0, seed: options.seed ?? DEFAULT_MODEL_SEED, think: options.think ?? null };
    this.#maxTokens = { ...DEFAULT_MAX_TOKENS, ...options.maxTokens };
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
    this.#record = options.record ?? (() => {});
    this.#now = options.now ?? (() => performance.now());
  }

  /* One call: the response, or the failure as a code. Rejects only when
     the signal aborted. */
  async #call(
    request: ProposalRequest,
    call: 1 | 2,
    messages: ChatMessage[],
    signal: AbortSignal,
  ): Promise<{ exchange: Exchange; outcome: ProposalOutcome | null; error: ProposalError | null }> {
    const chat: ChatRequest = {
      messages,
      schema: proposalSchema(request.task),
      options: { ...this.#options, maxTokens: this.#maxTokens[request.task] },
    };
    const base = { task: request.task, attempt: request.attempt ?? 1, call, request: chat };
    const started = this.#now();
    let response: ChatResponse;
    /* The call ends when the caller stops it or when it has taken too
       long; only the first is a stop */
    const limit = new AbortController();
    const timer = setTimeout(() => limit.abort(), this.#timeoutMs);
    const stop = () => limit.abort(signal.reason);
    signal.addEventListener("abort", stop, { once: true });
    try {
      response = await this.#client.chat(chat, limit.signal);
    } catch (error) {
      const ms = this.#now() - started;
      if (signal.aborted) {
        this.#record({ ...base, response: null, failure: "aborted", detail: null, issues: [], valid: false, ms });
        throw signal.reason;
      }
      const detail = limit.signal.aborted ? `no answer within ${this.#timeoutMs} ms` : error instanceof ModelError ? error.detail : String(error);
      const exchange: Exchange = { ...base, response: null, failure: "model_unavailable", detail, issues: [], valid: false, ms };
      this.#record(exchange);
      return { exchange, outcome: null, error: "model_unavailable" };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
    }
    const checked = parseAnswer(request.task, response.content, request.brief);
    const exchange: Exchange = {
      ...base,
      response,
      failure: null,
      detail: null,
      issues: checked.ok ? [] : checked.issues,
      valid: checked.ok,
      ms: this.#now() - started,
    };
    this.#record(exchange);
    return { exchange, outcome: checked.ok ? checked : null, error: null };
  }

  async propose<T extends ProposalTask>(request: ProposalRequest<T>, signal: AbortSignal): Promise<ProposalOutcome<T>>;
  async propose(request: ProposalRequest, signal: AbortSignal): Promise<ProposalOutcome> {
    if (signal.aborted) throw signal.reason;
    const messages = this.#prompts.messages(request);
    const first = await this.#call(request, 1, messages, signal);
    if (first.error) return { ok: false, error: first.error };
    if (first.outcome) return first.outcome;
    /* One repair: the same conversation, the answer, and what was wrong */
    const again: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: first.exchange.response?.content ?? "" },
      { role: "user", content: this.#prompts.repair(request, first.exchange.issues) },
    ];
    const second = await this.#call(request, 2, again, signal);
    if (second.error) return { ok: false, error: second.error };
    return second.outcome ?? { ok: false, error: "proposal_invalid" };
  }
}
