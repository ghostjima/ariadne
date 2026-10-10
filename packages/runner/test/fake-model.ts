/*
  A model client for tests: it answers each call with the next scripted
  answer, records what it was asked, and can be made to hang until its
  signal aborts. No model runs.
*/

import { ModelError, type ChatRequest, type ChatResponse, type ModelClient, type ModelStamp, type Prompts } from "../src/model/index.js";
import { answerOf, type ProposalIssue, type ProposalRequest } from "../src/index.js";
import { SCRIPTED } from "../src/index.js";

/* What the fake answers a call with: the content of an answer, a failure
   of the model, or nothing until aborted */
export type Scripted = string | { fail: string } | { hang: true } | ((request: ChatRequest) => string);

export const STAMP: ModelStamp = {
  engine: "fake",
  engineVersion: "0",
  model: "fake:test",
  digest: "0".repeat(64),
  family: null,
  parameters: null,
  quantisation: null,
  thinking: true,
};

export class FakeModel implements ModelClient {
  readonly requests: ChatRequest[] = [];
  /* Calls that were aborted while hanging */
  aborted = 0;
  constructor(private readonly answers: Scripted[]) {}

  describe(): Promise<ModelStamp> {
    return Promise.resolve(STAMP);
  }

  chat(request: ChatRequest, signal: AbortSignal): Promise<ChatResponse> {
    this.requests.push(request);
    const next = this.answers.shift();
    if (next === undefined) return Promise.reject(new ModelError("no answer scripted"));
    if (typeof next === "object" && "fail" in next) return Promise.reject(new ModelError(next.fail));
    if (typeof next === "object") {
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          this.aborted += 1;
          reject(signal.reason);
        });
      });
    }
    const content = typeof next === "function" ? next(request) : next;
    return Promise.resolve({
      content,
      thinking: null,
      finish: "stop",
      usage: { promptTokens: 10, answerTokens: 5, loadMs: 0, promptMs: 1, answerMs: 2, totalMs: 3 },
      firstChunkMs: 1,
      wallMs: 3,
    });
  }
}

/* Prompts that say only which task is asked: what a model is told is the
   application's, and nothing of it matters to these tests */
export const PROMPTS: Prompts = {
  messages: (request: ProposalRequest) => [
    { role: "system", content: `task ${request.task}` },
    { role: "user", content: "<complaint>...</complaint>" },
  ],
  repair: (_request: ProposalRequest, issues: readonly ProposalIssue[]) => `not accepted: ${issues.map((i) => `${i.path} ${i.code}`).join("; ")}`,
};

/* The JSON a model would answer to give the scripted proposal of a task */
export function scriptedAnswer(request: ProposalRequest, text = "Dear client, ..."): string {
  return JSON.stringify(answerOf(SCRIPTED.proposeNow(request), false, text));
}
