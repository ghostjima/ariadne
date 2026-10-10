/*
  The bench itself, without a model: a client that answers from the truth
  stands in for one. The files it writes, their stamps, the metrics over
  them, resuming, the timed stops, and a model stopped for swapping.
*/
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inboxItem, openInbox, type InboxItem } from "@ariadne/inbox";
import { answerOf, readTranscript, type ProposalTask } from "@ariadne/runner";
import type { ChatRequest, ChatResponse, ModelClient, ModelStamp } from "@ariadne/runner/model";
import {
  MATRIX,
  fileOf,
  metricsOf,
  percentile,
  readResults,
  runBench,
  runOnce,
  share,
  spread,
  stopWhileStepRuns,
  summarise,
  summaryMarkdown,
  type AgentFooter,
  type AgentHeader,
  type AgentLine,
  type AgentSpec,
  type BenchConfig,
  type BenchStamp,
  type MemoryWatch,
  type RunRecord,
  type StopTrial,
} from "../src/index.js";

const inbox = openInbox();
const STAMP: BenchStamp = { commit: "0123456789ab", dirty: false, build: "test", node: process.version, machine: "test machine", date: "2026-10-10T00:00:00.000Z" };
const DIGEST = "a".repeat(64);
const MODEL: ModelStamp = { engine: "fake", engineVersion: "1.2.3", model: "fake:reader", digest: DIGEST, family: "fake", parameters: "0B", quantisation: "Q4_K_M", thinking: true };
const READER: AgentSpec = { id: "fake:reader think=off", kind: "model", model: "fake:reader", think: false };

const taskOf = (chat: ChatRequest): ProposalTask => {
  const system = chat.messages[0]!.content;
  return system.includes("which stream") ? "classify" : system.includes("which team") ? "request_facts" : "draft_reply";
};
const itemOf = (chat: ChatRequest): InboxItem => {
  const user = chat.messages[1]!.content;
  for (const set of ["clean", "hard", "adversarial"] as const) {
    for (const lang of ["ru", "en"] as const) {
      for (let seed = 1; seed <= 4; seed++) {
        const item = inboxItem(inbox, set, seed, lang);
        if (user.includes(item.complaint.body)) return item;
      }
    }
  }
  throw new Error("no item for the prompt");
};

/* A model that reads every complaint right and writes one short letter;
   its first answer to the classification is malformed every time, so the
   repair is exercised; drafting takes `draftMs` */
function reader(options: { draftMs?: number; calls?: ChatRequest[] } = {}): ModelClient {
  return {
    describe: () => Promise.resolve(MODEL),
    chat(chat: ChatRequest, signal: AbortSignal): Promise<ChatResponse> {
      options.calls?.push(chat);
      const item = itemOf(chat);
      const task = taskOf(chat);
      const repaired = chat.messages.length > 2;
      const content = task === "classify" && !repaired ? '{"stream":"general"}' : JSON.stringify(answerOf(item.truth.proposals[task], false, item.lang === "ru" ? "Уважаемый клиент!\nМы рассмотрели вашу жалобу." : "Dear client,\nWe have reviewed your complaint."));
      const response: ChatResponse = { content, thinking: null, finish: "stop", usage: { promptTokens: 100, answerTokens: 50, loadMs: 5, promptMs: 10, answerMs: 500, totalMs: 520 }, firstChunkMs: 3, wallMs: 520 };
      if (task !== "draft_reply" || !options.draftMs) return Promise.resolve(response);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(response), options.draftMs);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(signal.reason);
        });
      });
    },
  };
}

const QUIET: MemoryWatch = { ollamaPeakRssMb: 1234, samples: 3, everyMs: 500, swapBefore: { swapouts: 10, usedMb: 0, pressure: 1 }, swapAfter: { swapouts: 10, usedMb: 0, pressure: 1 }, swapoutsGrew: 0, pressureMax: 1 };

function config(over: Partial<BenchConfig> = {}): BenchConfig {
  return {
    agents: [MATRIX[0]!, MATRIX[1]!, READER],
    sets: ["clean", "adversarial"],
    langs: ["ru"],
    seeds: [1, 2],
    repeats: 2,
    stopTrials: 0,
    contextTokens: 8192,
    modelSeed: 7,
    outDir: mkdtempSync(join(tmpdir(), "ariadne-bench-")),
    stamp: STAMP,
    digests: { "fake:reader": DIGEST },
    clientFor: () => reader(),
    watchMemory: () => ({ stop: () => Promise.resolve(QUIET), peek: () => ({ swapoutsGrew: 0, pressureMax: 1 }) }),
    loaded: () => Promise.resolve([{ name: "fake:reader", sizeMb: 100, vramMb: 100 }]),
    ...over,
  };
}

const linesOf = (c: BenchConfig, agent: AgentSpec): AgentLine[] =>
  readFileSync(join(c.outDir, fileOf(agent)), "utf8")
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as AgentLine);
const runsOf = (lines: AgentLine[]) => lines.filter((l): l is { type: "run" } & RunRecord => l.type === "run");

describe("the matrix", () => {
  it("is the oracle, the baseline and the local models, thinking on for one of them", () => {
    expect(MATRIX.map((a) => a.id)).toEqual([
      "scripted",
      "naive",
      "qwen3:8b think=off",
      "qwen3:8b think=on",
      "qwen2.5:14b",
      "qwen3:1.7b think=off",
      "gigachat3.1-lightning:q4_K_M",
      "t-tech/T-lite-it-2.1:q4_k_m think=off",
      "gemma4-26a4b:latest think=off",
    ]);
    expect(MATRIX.filter((a) => a.kind === "model" && a.guardSwap).map((a) => a.id)).toEqual(["gemma4-26a4b:latest think=off"]);
    expect(new Set(MATRIX.map(fileOf)).size).toBe(MATRIX.length);
    /* Every model of the matrix has a recorded digest to compare with */
    const recorded = JSON.parse(readFileSync(new URL("../models.json", import.meta.url), "utf8")) as { digests: Record<string, string> };
    for (const a of MATRIX) if (a.kind === "model") expect(recorded.digests[a.model], a.model).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("runBench", () => {
  it("writes one stamped file an agent: a header, a line a run, a footer", async () => {
    const c = config();
    await runBench(c);
    expect(readdirSync(c.outDir).sort()).toEqual(["fake_reader_think=off.jsonl", "naive.jsonl", "scripted.jsonl"]);
    for (const agent of c.agents) {
      const lines = linesOf(c, agent);
      expect(lines.map((l) => l.type), agent.id).toEqual(["header", ...Array.from({ length: 8 }, () => "run"), "footer"]);
      const header = lines[0] as AgentHeader;
      expect(header.stamp).toEqual(STAMP);
      expect(header.options).toEqual({ temperature: 0, seed: 7, contextTokens: 8192 });
      expect(header.agent).toEqual(agent);
      const runs = runsOf(lines);
      /* Repeat by repeat over the items, so an item's repeats are apart */
      expect(runs.map((r) => `${r.item}#${r.repeat}`)).toEqual([1, 2].flatMap((repeat) => ["clean-ru-01", "clean-ru-02", "adversarial-ru-01", "adversarial-ru-02"].map((i) => `${i}#${repeat}`)));
      expect((lines.at(-1) as AgentFooter).runs).toBe(8);
    }
    const header = linesOf(c, READER)[0] as AgentHeader;
    expect([header.model, header.digestAsRecorded, header.think]).toEqual([MODEL, true, false]);
    expect(header.warmUp?.loaded).toEqual([{ name: "fake:reader", sizeMb: 100, vramMb: 100 }]);
    expect((linesOf(c, READER).at(-1) as AgentFooter).memory).toEqual(QUIET);
    const scripted = linesOf(c, MATRIX[0]!)[0] as AgentHeader;
    expect([scripted.model, scripted.digestAsRecorded, scripted.think, scripted.warmUp]).toEqual([null, null, null, null]);
  });

  it("says when a model's digest is not the recorded one", async () => {
    const c = config({ agents: [READER], digests: { "fake:reader": "b".repeat(64) }, seeds: [1], sets: ["clean"], repeats: 1 });
    await runBench(c);
    expect((linesOf(c, READER)[0] as AgentHeader).digestAsRecorded).toBe(false);
    const md = summaryMarkdown(summarise(readResults(c.outDir, c.agents), c.agents, c));
    expect(md).toContain("DIFFERS");
  });

  it("records every call of a run with its validation, tokens and timings, and scores the run", async () => {
    const c = config({ agents: [READER] });
    await runBench(c);
    const run = runsOf(linesOf(c, READER))[0]!;
    expect(run.calls.map((x) => [x.task, x.call, x.valid, x.issues])).toEqual([
      ["classify", 1, false, ["grounds:missing_field", "askFirst:missing_field"]],
      ["classify", 2, true, []],
      ["request_facts", 1, true, []],
      ["draft_reply", 1, true, []],
    ]);
    expect(run.calls[0]).toMatchObject({ promptTokens: 100, answerTokens: 50, answerMs: 500, finish: "stop", content: '{"stream":"general"}' });
    expect(Object.keys(run.latency).sort()).toEqual(["classify", "draft_reply", "request_facts"]);
    expect(run.score.classify).toMatchObject({ streamCorrect: true, groundsCorrect: true });
    expect(run.texts).toHaveLength(1);
    const m = metricsOf(runsOf(linesOf(c, READER)));
    expect(m.proposal_schema_valid_first).toEqual(share(16, 24));
    expect(m.proposal_schema_valid_after_repair).toEqual(share(24, 24));
    expect(m.first_answer_issues).toEqual({ missing_field: 16 });
    expect(m.answer_tokens_per_second.median).toBe(100);
  });

  it("goes on from its files: runs already written are not made again", async () => {
    const calls: ChatRequest[] = [];
    const c = config({ agents: [READER], clientFor: () => reader({ calls }), repeats: 1 });
    await runBench(c);
    const first = calls.length;
    const before = readFileSync(join(c.outDir, fileOf(READER)), "utf8");
    await runBench({ ...c, resume: true });
    expect(calls.length).toBe(first);
    expect(readFileSync(join(c.outDir, fileOf(READER)), "utf8")).toBe(before);
    /* A file cut after two runs is finished, with one header and no run twice */
    const cut = config({ agents: [READER], repeats: 1 });
    await runBench(cut);
    const { writeFileSync } = await import("node:fs");
    const kept = readFileSync(join(cut.outDir, fileOf(READER)), "utf8").split("\n").slice(0, 3).join("\n");
    writeFileSync(join(cut.outDir, fileOf(READER)), `${kept}\n`);
    await runBench({ ...cut, resume: true });
    const lines = linesOf(cut, READER);
    expect(lines.map((l) => l.type)).toEqual(["header", "run", "run", "run", "run", "footer"]);
    expect(new Set(runsOf(lines).map((r) => r.item)).size).toBe(4);
  });

  it("keeps whole transcripts of the runs asked for, which the engine reads back", async () => {
    const c = config({ agents: [READER], keepTranscript: (r) => r.set === "adversarial" && r.repeat === 1 });
    await runBench(c);
    const files = readdirSync(join(c.outDir, "transcripts")).sort();
    expect(files).toEqual(["fake_reader_think=off.adversarial-ru-01.1.json", "fake_reader_think=off.adversarial-ru-02.1.json"]);
    const read = readTranscript(JSON.parse(readFileSync(join(c.outDir, "transcripts", files[0]!), "utf8")));
    expect(read.ok && read.transcript.stamp).toMatchObject({ commit: "0123456789ab", model: MODEL, think: false, contextTokens: 8192 });
  });

  it("stops a guarded model once the machine swaps, and says what it saw", async () => {
    let peeks = 0;
    const guarded: AgentSpec = { ...READER, guardSwap: true } as AgentSpec;
    const c = config({
      agents: [guarded],
      watchMemory: () => ({ stop: () => Promise.resolve({ ...QUIET, swapoutsGrew: 512 }), peek: () => ({ swapoutsGrew: ++peeks >= 3 ? 512 : 0, pressureMax: 2 }) }),
    });
    await runBench(c);
    const lines = linesOf(c, guarded);
    expect(runsOf(lines)).toHaveLength(3);
    expect((lines.at(-1) as AgentFooter).dropped).toEqual({ reason: "swapped", afterRuns: 3, swapoutsGrew: 512, pressureMax: 2 });
    const md = summaryMarkdown(summarise(readResults(c.outDir, c.agents), c.agents, c));
    expect(md).toContain("swapped after 3 runs (swapouts grew 512, pressure 2)");
    /* An unguarded model is measured to the end whatever the machine does */
    const free = config({ agents: [READER], watchMemory: c.watchMemory! });
    await runBench(free);
    expect(runsOf(linesOf(free, READER))).toHaveLength(8);
  });

  it("releases a model when its runs are done, and only a model", async () => {
    const released: string[] = [];
    await runBench(config({ release: (model) => Promise.resolve(void released.push(model)), repeats: 1, seeds: [1] }));
    expect(released).toEqual(["fake:reader"]);
  });
});

describe("timed stops", () => {
  it("while a model drafts: the call is aborted, and the run is quiet within milliseconds", async () => {
    const c = config({ agents: [READER], clientFor: () => reader({ draftMs: 3000 }), stopTrials: 2, repeats: 1, seeds: [1], sets: ["clean"] });
    const started = performance.now();
    /* The measured run drafts for 3 s once; the two stopped ones are cut at 0.4 s */
    await runBench(c);
    const stops = linesOf(c, READER).filter((l): l is StopTrial => l.type === "stop");
    expect(stops.map((s) => s.during)).toEqual(["generation", "generation"]);
    for (const s of stops) expect(s.stopToQuietMs).toBeLessThan(100);
    expect(performance.now() - started).toBeLessThan(9000);
    const summary = summarise(readResults(c.outDir, c.agents), c.agents, c);
    expect(summary.agents[0]!.stop_to_quiet_ms.n).toBe(2);
  }, 20_000);

  it("while a step of the script runs, at normal speed: the step finishes and the run stops after it", async () => {
    const item = inboxItem(inbox, "clean", 2, "ru");
    const trial = await stopWhileStepRuns(item);
    expect(trial.during).toBe("step");
    /* The rest of a step of 300 to 900 ms */
    expect(trial.stopToQuietMs).toBeGreaterThan(20);
    expect(trial.stopToQuietMs).toBeLessThan(1500);
  }, 10_000);
});

describe("the summary", () => {
  it("gives every agent's metrics by language and set, under the stamps, as JSON and as tables", async () => {
    const c = config({ langs: ["ru", "en"], seeds: [1, 2, 3] });
    await runBench(c);
    const summary = summarise(readResults(c.outDir, c.agents), c.agents, c);
    expect(summary.stamp).toEqual(STAMP);
    expect(summary.agents.map((a) => [a.agent.id, Object.keys(a.metrics), Object.keys(a.metrics.ru ?? {})])).toEqual(c.agents.map((a) => [a.id, ["ru", "en"], ["all", "clean", "adversarial"]]));
    const [scripted, naive, model] = summary.agents.map((a) => a.metrics.ru!.all!);
    expect([scripted!.stream_accuracy, scripted!.ground_accuracy, scripted!.fact_unit_accuracy, scripted!.reply_clean_share, scripted!.reply_passes_every_check_share]).toEqual([share(12, 12), share(12, 12), share(12, 12), share(12, 12), share(12, 12)]);
    expect(scripted!.proposal_schema_valid_first).toEqual(share(0, 0));
    expect(naive!.stream_accuracy.share).toBeLessThan(1);
    expect(model!.stream_accuracy).toEqual(share(12, 12));
    /* The fake's letter cites nothing: its grounds are declared and not cited */
    expect(model!.ground_declared_not_cited_share.count).toBeGreaterThan(0);
    expect(model!.repeat_agreement_classify).toEqual(share(6, 6));
    expect(summary.agents[2]!.metrics.ru!.adversarial!.injection_executed).toEqual({ ask_all: 0, high_only: 0, ask_none: 0 });
    const md = summaryMarkdown(summary);
    for (const name of ["proposal_schema_valid_first", "proposal_schema_valid_after_repair", "stream_accuracy", "ground_accuracy", "fact_unit_accuracy", "rubric_findings_per_reply", "reply_clean_share", "citation_outside_case_share", "injection_followed", "injection_executed", "consent_stops", "latency_classify_ms", "latency_draft_ms", "answer_tokens_per_second", "ollama_peak_rss_mb", "stop_to_quiet_ms", "repeat_agreement_classify"]) {
      expect(md, name).toContain(name);
    }
    expect(md).toContain("Commit `0123456789ab`, protocol");
    expect(md).toContain(`\`${DIGEST}\``);
    expect(md).toContain("## Russian");
    expect(md).toContain("## English");
    expect(md).not.toMatch(/undefined|NaN/);
  });

  it("counts a share with its counts, and a percentile by nearest rank", () => {
    expect(share(3, 4)).toEqual({ share: 0.75, count: 3, of: 4 });
    expect(share(0, 0)).toEqual({ share: null, count: 0, of: 0 });
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([5, 1, 3, 2, 4], 95)).toBe(5);
    expect(percentile([1, 2], 50)).toBe(1);
    expect(percentile([], 50)).toBeNull();
    expect(spread([4, 2, 6])).toEqual({ median: 4, p95: 6, min: 2, max: 6, n: 3 });
  });

  it("a run of one agent on one item is scored whoever the agent is", async () => {
    const item = inboxItem(inbox, "hard", 2, "en");
    const c = config();
    for (const agent of c.agents) {
      const { record } = await runOnce(agent, item, 1, c, agent.kind === "model" ? MODEL : null);
      expect([record.agent, record.item, record.set, record.lang, record.seed, record.kind, record.repeat]).toEqual([agent.id, "hard-en-02", "hard", "en", 2, "block_second_card", 1]);
      expect(record.score.truth).toEqual({ stream: "antifraud", grounds: "payment_8_3_10+payment_8_3_4" });
      expect(record.score.classify.groundsCorrect).toBe(agent.kind !== "naive");
    }
  });
});
