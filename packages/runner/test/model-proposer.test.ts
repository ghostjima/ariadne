/*
  The model-backed proposer and the ollama client, without a model: a fake
  client answers the proposer, and a fake fetch answers the client.
*/

import { describe, expect, it } from "vitest";
import { proposalSchema, proposeAll, SCRIPTED, type ProposalRequest } from "../src/index.js";
import { DEFAULT_MAX_TOKENS, ModelError, ModelProposer, OllamaClient, type ChatRequest, type Exchange } from "../src/model/index.js";
import { AML, BRIEF, PLAIN } from "./briefs.js";
import { FakeModel, PROMPTS, scriptedAnswer, type Scripted } from "./fake-model.js";

const live = () => new AbortController().signal;
const classify: ProposalRequest<"classify"> = { task: "classify", seed: 8, brief: AML, attempt: 1 };
const draft: ProposalRequest<"draft_reply"> = { task: "draft_reply", seed: 8, brief: AML, attempt: 1 };

function proposerWith(answers: Scripted[], options: { think?: boolean | null } = {}) {
  const model = new FakeModel(answers);
  const exchanges: Exchange[] = [];
  const proposer = new ModelProposer({ client: model, prompts: PROMPTS, record: (e) => exchanges.push(e), now: () => 0, ...options });
  return { model, exchanges, proposer };
}

describe("ModelProposer", () => {
  it("asks once, with the task's schema, at temperature 0 and a fixed seed, and takes a valid answer", async () => {
    const { model, exchanges, proposer } = proposerWith([scriptedAnswer(draft, "Уважаемый клиент! ...")], { think: false });
    const outcome = await proposer.propose(draft, live());
    expect(outcome).toEqual({ ok: true, proposal: proposeAll(SCRIPTED, 8, AML).draft_reply, askFirst: false, text: "Уважаемый клиент! ..." });
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]).toEqual({
      messages: PROMPTS.messages(draft),
      schema: proposalSchema("draft_reply"),
      options: { temperature: 0, seed: 7, think: false, maxTokens: DEFAULT_MAX_TOKENS.draft_reply },
    });
    expect(exchanges.map((e) => [e.task, e.attempt, e.call, e.valid, e.failure, e.issues])).toEqual([["draft_reply", 1, 1, true, null, []]]);
    expect(exchanges[0]!.response?.content).toBe(scriptedAnswer(draft, "Уважаемый клиент! ..."));
  });

  it("gives an answer that does not validate one repair: the answer and its issues go back, and a valid second answer is taken", async () => {
    const wrong = JSON.stringify({ stream: "fraud", grounds: ["contract", "contract"], askFirst: false });
    const { model, exchanges, proposer } = proposerWith([wrong, scriptedAnswer(classify)]);
    expect(await proposer.propose(classify, live())).toEqual({ ok: true, proposal: proposeAll(SCRIPTED, 8, AML).classify, askFirst: false, text: null });
    expect(model.requests).toHaveLength(2);
    expect(model.requests[1]!.messages).toEqual([
      ...PROMPTS.messages(classify),
      { role: "assistant", content: wrong },
      { role: "user", content: "not accepted: stream not_in_list; grounds[1] duplicate" },
    ]);
    expect(model.requests[1]!.schema).toEqual(proposalSchema("classify"));
    expect(exchanges.map((e) => [e.call, e.valid, e.issues.map((i) => i.code)])).toEqual([
      [1, false, ["not_in_list", "duplicate"]],
      [2, true, []],
    ]);
  });

  it("fails with proposal_invalid after a second answer that does not validate, and asks no third time", async () => {
    const { model, exchanges, proposer } = proposerWith(["```json\n{}\n```", "{}", scriptedAnswer(classify)]);
    expect(await proposer.propose(classify, live())).toEqual({ ok: false, error: "proposal_invalid" });
    expect(model.requests).toHaveLength(2);
    expect(exchanges.map((e) => e.issues.map((i) => `${i.path}:${i.code}`))).toEqual([[":not_json"], ["stream:missing_field", "grounds:missing_field", "askFirst:missing_field"]]);
  });

  it("checks the answer against the case: the facts of a linked case only where there is one", async () => {
    const request: ProposalRequest<"request_facts"> = { task: "request_facts", seed: 8, brief: PLAIN, attempt: 1 };
    const linked = JSON.stringify({ team: "operations", questions: ["charges"], reuseLinked: true, askFirst: false });
    const { exchanges, proposer } = proposerWith([linked, linked]);
    expect(await proposer.propose(request, live())).toEqual({ ok: false, error: "proposal_invalid" });
    expect(exchanges[0]!.issues).toEqual([{ path: "reuseLinked", code: "no_linked_case" }]);
    const again = proposerWith([linked]);
    expect((await again.proposer.propose({ ...request, brief: BRIEF }, live())).ok).toBe(true);
  });

  it("fails with model_unavailable when the model cannot answer, on the first call or on the repair", async () => {
    const down = proposerWith([{ fail: "connection refused" }]);
    expect(await down.proposer.propose(classify, live())).toEqual({ ok: false, error: "model_unavailable" });
    expect(down.exchanges.map((e) => [e.failure, e.detail, e.response])).toEqual([["model_unavailable", "connection refused", null]]);
    const later = proposerWith(["{}", { fail: "HTTP 500" }]);
    expect(await later.proposer.propose(classify, live())).toEqual({ ok: false, error: "model_unavailable" });
    expect(later.exchanges.map((e) => e.failure)).toEqual([null, "model_unavailable"]);
  });

  it("an aborted call rejects and proposes nothing; the exchange is recorded as aborted", async () => {
    const { model, exchanges, proposer } = proposerWith([{ hang: true }]);
    const stop = new AbortController();
    const pending = proposer.propose(draft, stop.signal);
    stop.abort();
    await expect(pending).rejects.toBe(stop.signal.reason);
    expect(model.aborted).toBe(1);
    expect(exchanges.map((e) => [e.failure, e.valid, e.response])).toEqual([["aborted", false, null]]);
    /* And one aborted before it starts never reaches the model */
    const before = proposerWith([scriptedAnswer(draft)]);
    await expect(before.proposer.propose(draft, stop.signal)).rejects.toBe(stop.signal.reason);
    expect(before.model.requests).toHaveLength(0);
  });

  it("a call that takes too long is a model that could not answer, not a stop", async () => {
    const model = new FakeModel([{ hang: true }]);
    const exchanges: Exchange[] = [];
    const proposer = new ModelProposer({ client: model, prompts: PROMPTS, record: (e) => exchanges.push(e), timeoutMs: 20 });
    expect(await proposer.propose(classify, live())).toEqual({ ok: false, error: "model_unavailable" });
    expect(model.aborted).toBe(1);
    expect(exchanges.map((e) => [e.failure, e.detail])).toEqual([["model_unavailable", "no answer within 20 ms"]]);
  });

  it("an abort during the repair rejects as well, after the first answer was recorded", async () => {
    const { exchanges, proposer } = proposerWith(["{}", { hang: true }]);
    const stop = new AbortController();
    const pending = proposer.propose(classify, stop.signal);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    stop.abort();
    await expect(pending).rejects.toBe(stop.signal.reason);
    expect(exchanges.map((e) => [e.call, e.failure])).toEqual([
      [1, null],
      [2, "aborted"],
    ]);
  });
});

/* A fetch that answers ollama's routes from a table and records the calls */
function fakeFetch(routes: Record<string, (body: unknown, signal: AbortSignal | null) => Response | Promise<Response>>) {
  const calls: { path: string; body: unknown }[] = [];
  const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ path, body });
    const route = routes[path];
    if (!route) return Promise.resolve(new Response("not found", { status: 404 }));
    return Promise.resolve(route(body, init?.signal ?? null));
  }) as typeof fetch;
  return { calls, fetcher };
}

/* A streamed body from text chunks, cut wherever the test cuts them */
function streamOf(chunks: string[], signal?: AbortSignal | null, hangAfter = false): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (!hangAfter) return controller.close();
      signal?.addEventListener("abort", () => controller.error(signal.reason));
    },
  });
}

const request: ChatRequest = {
  messages: [
    { role: "system", content: "task classify" },
    { role: "user", content: "<complaint>...</complaint>" },
  ],
  schema: proposalSchema("classify"),
  options: { temperature: 0, seed: 7, maxTokens: 256, think: false },
};

describe("OllamaClient", () => {
  const line = (o: unknown) => `${JSON.stringify(o)}\n`;
  const answer = '{"stream":"general","grounds":["contract"],"askFirst":false}';
  const body = [
    line({ message: { thinking: "The client complains " } }),
    line({ message: { thinking: "about a fee." } }),
    line({ message: { content: answer.slice(0, 20) } }),
    line({ message: { content: answer.slice(20) } }),
    line({ done: true, done_reason: "stop", prompt_eval_count: 75, eval_count: 54, load_duration: 87_000_000, prompt_eval_duration: 7_700_000, eval_duration: 568_000_000, total_duration: 666_000_000 }),
  ].join("");

  it("posts a streamed chat with the schema as the format and the fixed options", async () => {
    const { calls, fetcher } = fakeFetch({ "/api/chat": () => new Response(streamOf([body])) });
    let clock = 0;
    const client = new OllamaClient({ model: "qwen3:8b", contextTokens: 8192, fetch: fetcher, now: () => (clock += 10) });
    const response = await client.chat(request, new AbortController().signal);
    expect(calls).toEqual([
      {
        path: "/api/chat",
        body: { model: "qwen3:8b", messages: request.messages, stream: true, format: proposalSchema("classify"), think: false, options: { temperature: 0, seed: 7, num_predict: 256, num_ctx: 8192 } },
      },
    ]);
    expect(response).toEqual({
      content: answer,
      thinking: "The client complains about a fee.",
      finish: "stop",
      usage: { promptTokens: 75, answerTokens: 54, loadMs: 87, promptMs: 7.7, answerMs: 568, totalMs: 666 },
      firstChunkMs: 10,
      wallMs: 20,
    });
  });

  it("leaves thinking and the context to ollama when the caller sets neither", async () => {
    const { calls, fetcher } = fakeFetch({ "/api/chat": () => new Response(streamOf([body])) });
    await new OllamaClient({ model: "qwen2.5:14b", fetch: fetcher }).chat({ ...request, options: { ...request.options, think: null } }, new AbortController().signal);
    const sent = calls[0]!.body as Record<string, unknown>;
    expect("think" in sent).toBe(false);
    expect(sent.options).toEqual({ temperature: 0, seed: 7, num_predict: 256 });
  });

  it("reads the stream whatever way it is cut into chunks, a multi-byte character included", async () => {
    const russian = line({ message: { content: "Уважаемый клиент" } }) + line({ done: true, done_reason: "stop" });
    const bytes = new TextEncoder().encode(russian);
    for (const cut of [1, 17, 18, 19, 40, bytes.length - 1]) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, cut));
          controller.enqueue(bytes.slice(cut));
          controller.close();
        },
      });
      const { fetcher } = fakeFetch({ "/api/chat": () => new Response(stream) });
      const response = await new OllamaClient({ model: "m", fetch: fetcher }).chat(request, new AbortController().signal);
      expect([response.content, response.thinking, response.usage.answerTokens], String(cut)).toEqual(["Уважаемый клиент", null, null]);
    }
  });

  it("fails with a ModelError on a refused connection, an HTTP error, an error in the stream and a stream that ends early", async () => {
    const failing: [string, typeof fetch][] = [
      ["refused", (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch],
      ["http", fakeFetch({ "/api/chat": () => new Response("no such model", { status: 404 }) }).fetcher],
      ["stream", fakeFetch({ "/api/chat": () => new Response(streamOf([line({ error: "model runner has unexpectedly stopped" })])) }).fetcher],
      ["early", fakeFetch({ "/api/chat": () => new Response(streamOf([line({ message: { content: "{" } })])) }).fetcher],
    ];
    for (const [name, fetcher] of failing) {
      const error = await new OllamaClient({ model: "m", fetch: fetcher }).chat(request, new AbortController().signal).catch((e: unknown) => e);
      expect(error, name).toBeInstanceOf(ModelError);
      expect((error as ModelError).code, name).toBe("model_unavailable");
    }
  });

  it("an abort while the answer streams rejects with the signal's reason and keeps nothing of it", async () => {
    const stop = new AbortController();
    const { fetcher } = fakeFetch({ "/api/chat": (_body, signal) => new Response(streamOf([line({ message: { content: '{"stream":' } })], signal, true)) });
    const pending = new OllamaClient({ model: "m", fetch: fetcher }).chat(request, stop.signal);
    await new Promise((resolve) => setTimeout(resolve, 5));
    stop.abort();
    await expect(pending).rejects.toBe(stop.signal.reason);
  });

  it("describes the model by ollama's version, the tag's manifest digest and its thinking switch", async () => {
    const digest = "8f68893c685c3ddff2aa3fffce2aa60a30bb2da65ca488b61fff134a4d1730e7";
    const routes = {
      "/api/version": () => Response.json({ version: "0.32.1" }),
      "/api/tags": () => Response.json({ models: [{ name: "qwen3:1.7b", digest, details: { family: "qwen3", parameter_size: "2.0B", quantization_level: "Q4_K_M" } }] }),
      "/api/show": () => Response.json({ capabilities: ["completion", "tools", "thinking"] }),
    };
    const { calls, fetcher } = fakeFetch(routes);
    expect(await new OllamaClient({ model: "qwen3:1.7b", fetch: fetcher, baseUrl: "http://127.0.0.1:11434/" }).describe()).toEqual({
      engine: "ollama",
      engineVersion: "0.32.1",
      model: "qwen3:1.7b",
      digest,
      family: "qwen3",
      parameters: "2.0B",
      quantisation: "Q4_K_M",
      thinking: true,
    });
    expect(calls.map((c) => c.path)).toEqual(["/api/version", "/api/tags", "/api/show"]);
    expect(calls[2]!.body).toEqual({ model: "qwen3:1.7b" });
    await expect(new OllamaClient({ model: "missing:tag", fetch: fetcher }).describe()).rejects.toBeInstanceOf(ModelError);
  });
});
