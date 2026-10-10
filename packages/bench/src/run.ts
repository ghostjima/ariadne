/*
  Running the bench: every agent of the matrix on every item, a number of
  times, each run driven through the engine and scored.

  One run is one agent on one inbox item. The agent proposes the
  classification, the fact request and the reply; the engine runs on the
  item's brief, validates what was proposed and asks for a person where
  its rules say so; the bench answers as a person who lets the run go on
  (goOn of @ariadne/inbox). The run is then scored against the item's
  ground truth (score.ts).

  Runs go repeat by repeat over all items, not item by item, so the
  repeats of an item are not back to back. A model is called once before
  its first measured run, to load it; that call is not measured. Between
  agents the bench tells ollama it is done with the model it used.

  Everything is written as it is produced: one JSONL file an agent, its
  first line a header with the stamps, then one line a run. A bench that
  stopped half-way goes on from its files (`resume`).
*/

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { INBOX_SETS, goOn, inboxItem, openInbox, recordRun, type Inbox, type InboxItem, type InboxSet, type Lang } from "@ariadne/inbox";
import { PROTOCOL_VERSION, connectInProcess, driveRun, encodeDecisions, encodePlanPayload, generatePlan, type Decision, type ProposalTask, type Proposer, type Transcript } from "@ariadne/runner";
import type { Exchange, ModelClient, ModelStamp } from "@ariadne/runner/model";
import { naiveProposer, oracleProposer, type AgentSpec } from "./agents.js";
import type { CallRecord, RunRecord } from "./metrics.js";
import { scoreRun } from "./score.js";
import type { BenchStamp, MemoryWatch } from "./system.js";

export type BenchConfig = {
  agents: readonly AgentSpec[];
  sets: readonly InboxSet[];
  langs: readonly Lang[];
  seeds: readonly number[];
  repeats: number;
  /* Stops timed per agent while it works (0 for none) */
  stopTrials: number;
  /* The context window every model runs with, in tokens */
  contextTokens: number;
  /* The seed every model call runs with */
  modelSeed: number;
  /* The longest one call to a model may take before it counts as a model
     that could not answer, in ms */
  callTimeoutMs: number;
  outDir: string;
  stamp: BenchStamp;
  /* The recorded digest of each model tag, to compare with */
  digests: Readonly<Record<string, string>>;
  clientFor: (model: string) => ModelClient;
  /* The machine's load average over 1, 5 and 15 minutes, read when an
     agent's block starts and ends; left out in tests */
  loadAverage?: () => number[];
  /* The machine, as far as the bench looks at it; left out in tests */
  watchMemory?: () => { stop: () => Promise<MemoryWatch>; peek: () => { swapoutsGrew: number | null; pressureMax: number | null } };
  loaded?: () => Promise<{ name: string; sizeMb: number; vramMb: number }[] | null>;
  release?: (model: string) => Promise<void>;
  /* Which runs to keep whole transcripts of */
  keepTranscript?: (record: Pick<RunRecord, "set" | "lang" | "seed" | "repeat">) => boolean;
  resume?: boolean;
  log?: (line: string) => void;
  now?: () => number;
};

/* The first line of an agent's file */
export type AgentHeader = {
  type: "header";
  stamp: BenchStamp;
  protocol: number;
  agent: AgentSpec;
  /* The model as ollama identified it; null for an agent that is not one */
  model: ModelStamp | null;
  /* Whether the digest ollama gave equals the recorded one; null without a
     model or a recorded digest */
  digestAsRecorded: boolean | null;
  /* Thinking as the calls ran: what was asked, where the model has the
     switch; null otherwise */
  think: boolean | null;
  options: { temperature: 0; seed: number; contextTokens: number; callTimeoutMs: number };
  /* The machine's load average (1, 5, 15 minutes) when the agent's block
     started; null where it was not read */
  loadAverage: number[] | null;
  /* The call that loaded the model, not measured as a run */
  warmUp: { ms: number; loadMs: number | null; loaded: { name: string; sizeMb: number; vramMb: number }[] | null } | null;
};

/* One timed stop */
export type StopTrial = {
  type: "stop";
  agent: string;
  item: string;
  /* From Stop to the run's last event, in ms */
  stopToQuietMs: number;
  /* Whether the stop came while the agent was generating (a model's call
     was aborted) or while a step ran (the script) */
  during: "generation" | "step" | "nothing";
};

/* The last line of an agent's file */
export type AgentFooter = {
  type: "footer";
  agent: string;
  runs: number;
  wallMs: number;
  /* The load average when the block ended */
  loadAverage: number[] | null;
  memory: MemoryWatch | null;
  /* Whether the bench told ollama it was done with the agent's model when
     its runs ended (an empty request with keep_alive 0), so the next
     agent's model does not share memory with it */
  released: boolean;
  /* Set when the agent was stopped before its runs were done, with why */
  dropped: { reason: "swapped" | "memory_pressure_critical"; afterRuns: number; swapoutsGrew: number | null; pressureMax: number | null } | null;
};

export type AgentLine = AgentHeader | ({ type: "run" } & RunRecord) | StopTrial | AgentFooter;

export const fileOf = (agent: AgentSpec): string => `${agent.id.replace(/[^A-Za-z0-9.=-]+/g, "_")}.jsonl`;

function callOf(e: Exchange): CallRecord {
  return {
    task: e.task,
    attempt: e.attempt,
    call: e.call,
    valid: e.valid,
    issues: e.issues.map((i) => `${i.path}:${i.code}`),
    failure: e.failure,
    detail: e.detail,
    finish: e.response?.finish ?? null,
    ms: e.ms,
    firstChunkMs: e.response?.firstChunkMs ?? null,
    promptTokens: e.response?.usage.promptTokens ?? null,
    answerTokens: e.response?.usage.answerTokens ?? null,
    promptMs: e.response?.usage.promptMs ?? null,
    answerMs: e.response?.usage.answerMs ?? null,
    loadMs: e.response?.usage.loadMs ?? null,
    thinkingChars: e.response?.thinking?.length ?? 0,
    content: e.response?.content ?? null,
  };
}

type Ran = { record: RunRecord; transcript: Transcript | null };

/* One run of an agent on an item */
export async function runOnce(
  agent: AgentSpec,
  item: InboxItem,
  repeat: number,
  config: Pick<BenchConfig, "clientFor" | "contextTokens" | "modelSeed" | "callTimeoutMs" | "stamp" | "now">,
  model: ModelStamp | null,
  signal?: AbortSignal,
  onProposal?: (task: ProposalTask, phase: "asked" | "answered") => void,
): Promise<Ran> {
  const now = config.now ?? (() => performance.now());
  const asked = new Map<string, number>();
  const latency: Partial<Record<ProposalTask, number>> = {};
  const timing = (need: { task: ProposalTask; attempt: number }, phase: "asked" | "answered") => {
    const key = `${need.task}:${need.attempt}`;
    if (phase === "asked") asked.set(key, now());
    else if (need.attempt === 1) latency[need.task] = now() - (asked.get(key) ?? now());
    onProposal?.(need.task, phase);
  };
  let entries: RunRecord["entries"];
  let texts: RunRecord["texts"];
  let decisions: Decision[];
  let calls: CallRecord[] = [];
  let transcript: Transcript | null = null;
  if (agent.kind === "model") {
    const think = model?.thinking ? agent.think : null;
    const recorded = await recordRun({
      item,
      client: config.clientFor(agent.model),
      ...(model ? { model } : {}),
      think,
      seed: config.modelSeed,
      timeoutMs: config.callTimeoutMs,
      stamp: {
        commit: config.stamp.dirty ? `${config.stamp.commit}+changes` : config.stamp.commit,
        build: config.stamp.build,
        machine: config.stamp.machine,
        recordedAt: new Date().toISOString(),
        contextTokens: config.contextTokens,
      },
      ...(signal ? { signal } : {}),
      onProposal: timing,
    });
    ({ entries, texts, decisions } = recorded.result);
    calls = recorded.transcript.exchanges.map(callOf);
    transcript = recorded.transcript;
  } else {
    const proposer: Proposer = agent.kind === "scripted" ? oracleProposer(item) : naiveProposer(item);
    const result = await driveRun({ seed: item.seed, brief: item.brief, autonomy: "high_only", proposer, decide: goOn, ...(signal ? { signal } : {}), onProposal: timing });
    ({ entries, texts, decisions } = result);
  }
  const record: RunRecord = {
    agent: agent.id,
    item: item.id,
    set: item.set,
    lang: item.lang,
    seed: item.seed,
    kind: item.kind,
    row: item.row,
    repeat,
    entries,
    texts,
    decisions,
    calls,
    latency,
    score: scoreRun(item, entries, texts),
  };
  return { record, transcript };
}

/* Stop while a model generates the reply: from the abort to the run's
   last event */
async function stopWhileGenerating(agent: AgentSpec, item: InboxItem, config: BenchConfig, model: ModelStamp | null, afterMs: number): Promise<StopTrial> {
  const now = config.now ?? (() => performance.now());
  const stop = new AbortController();
  let stoppedAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const ran = await runOnce(agent, item, 0, config, model, stop.signal, (task, phase) => {
    if (task === "draft_reply" && phase === "asked") {
      timer = setTimeout(() => {
        stoppedAt = now();
        stop.abort();
      }, afterMs);
    }
  });
  const done = now();
  if (timer) clearTimeout(timer);
  const aborted = ran.record.calls.some((c) => c.failure === "aborted");
  return { type: "stop", agent: agent.id, item: item.id, stopToQuietMs: stoppedAt === 0 ? 0 : done - stoppedAt, during: aborted ? "generation" : "nothing" };
}

/* Stop while a step of the script runs, at normal speed: the step in
   progress finishes, no new one starts. From the stop to plan.stopped. */
export async function stopWhileStepRuns(item: InboxItem, now: () => number = () => performance.now()): Promise<StopTrial> {
  const steps = generatePlan(item.seed, item.brief).map((s) => ({ id: s.id, askFirst: false }));
  const plan = encodePlanPayload({ v: PROTOCOL_VERSION, seed: item.seed, autonomy: "ask_none", brief: item.brief, steps });
  let lastId = 0;
  /* The first segment, up to the first progress report of the first step */
  const first = connectInProcess(`plan=${plan}`);
  if (!first.ok) throw new RangeError(first.error);
  for await (const i of first.items) {
    if (i.kind !== "event") break;
    lastId = i.id;
    if (i.event.type === "step.progress") break;
  }
  await first.items.return(undefined);
  const stoppedAt = now();
  const decisions: Decision[] = [{ command: "stop", stepId: null, afterEventId: lastId }];
  const second = connectInProcess(`plan=${plan}&decisions=${encodeDecisions(decisions)}&after=${lastId}`);
  if (!second.ok) throw new RangeError(second.error);
  let ended = false;
  for await (const i of second.items) if (i.kind === "event" && i.event.type === "plan.stopped") ended = true;
  return { type: "stop", agent: "scripted", item: item.id, stopToQuietMs: now() - stoppedAt, during: ended ? "step" : "nothing" };
}

function readLines(path: string): AgentLine[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as AgentLine);
}

/* Every line of every agent's file in a results folder */
export function readResults(outDir: string, agents: readonly AgentSpec[]): Map<string, AgentLine[]> {
  return new Map(agents.map((a) => [a.id, readLines(join(outDir, fileOf(a)))]));
}

export async function runBench(config: BenchConfig): Promise<void> {
  const log = config.log ?? (() => {});
  const now = config.now ?? (() => performance.now());
  mkdirSync(config.outDir, { recursive: true });
  const inbox: Inbox = openInbox();
  const items = config.langs.flatMap((lang) => config.sets.flatMap((set) => config.seeds.map((seed) => inboxItem(inbox, set, seed, lang))));
  const first = inboxItem(inbox, INBOX_SETS[0], 1, config.langs[0] ?? "ru");

  for (const agent of config.agents) {
    const path = join(config.outDir, fileOf(agent));
    const before = config.resume ? readLines(path) : [];
    if (before.some((l) => l.type === "footer")) {
      log(`${agent.id}: done already`);
      continue;
    }
    const done = new Set(before.flatMap((l) => (l.type === "run" ? [`${l.item}#${l.repeat}`] : [])));
    const started = now();
    let model: ModelStamp | null = null;
    let header = before.find((l): l is AgentHeader => l.type === "header");
    const watch = agent.kind === "model" ? config.watchMemory?.() : undefined;
    if (!header) {
      const loadAverage = config.loadAverage?.() ?? null;
      let warmUp: AgentHeader["warmUp"] = null;
      if (agent.kind === "model") {
        model = await config.clientFor(agent.model).describe();
        /* One call to load the model, which no run is charged for */
        const t = now();
        const warm = await runOnce(agent, first, 0, config, model);
        warmUp = { ms: now() - t, loadMs: warm.record.calls[0]?.loadMs ?? null, loaded: (await config.loaded?.()) ?? null };
      }
      header = {
        type: "header",
        stamp: config.stamp,
        protocol: PROTOCOL_VERSION,
        agent,
        model,
        digestAsRecorded: model?.digest && config.digests[model.model] ? model.digest === config.digests[model.model] : null,
        think: agent.kind === "model" && model?.thinking ? agent.think : null,
        options: { temperature: 0, seed: config.modelSeed, contextTokens: config.contextTokens, callTimeoutMs: config.callTimeoutMs },
        loadAverage,
        warmUp,
      };
      writeFileSync(path, `${JSON.stringify(header)}\n`);
    } else model = header.model;
    log(`${agent.id}: ${model ? `${model.digest?.slice(0, 12)} ${model.quantisation}, ` : ""}${items.length} items x ${config.repeats} repeats`);

    let runs = done.size;
    let dropped: AgentFooter["dropped"] = null;
    outer: for (let repeat = 1; repeat <= config.repeats; repeat++) {
      for (const item of items) {
        if (done.has(`${item.id}#${repeat}`)) continue;
        const { record, transcript } = await runOnce(agent, item, repeat, config, model);
        appendFileSync(path, `${JSON.stringify({ type: "run", ...record })}\n`);
        if (transcript && config.keepTranscript?.(record)) {
          const dir = join(config.outDir, "transcripts");
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, `${fileOf(agent).replace(/\.jsonl$/, "")}.${item.id}.${repeat}.json`), `${JSON.stringify(transcript, null, 1)}\n`);
        }
        runs += 1;
        if (runs % 10 === 0) log(`${agent.id}: ${runs} runs`);
        /* A model that makes the machine swap is measured on the disk, not
           on itself: it is stopped, with what was seen */
        if (agent.kind === "model" && agent.guardSwap && watch) {
          const seen = watch.peek();
          const critical = seen.pressureMax !== null && seen.pressureMax >= 4;
          if ((seen.swapoutsGrew ?? 0) > 0 || critical) {
            dropped = { reason: critical ? "memory_pressure_critical" : "swapped", afterRuns: runs, ...seen };
            break outer;
          }
        }
      }
    }

    if (!dropped) {
      for (let k = 0; k < config.stopTrials; k++) {
        const item = items[k % items.length]!;
        const trial = agent.kind === "model" ? await stopWhileGenerating(agent, item, config, model, 400) : agent.kind === "scripted" ? await stopWhileStepRuns(item, now) : null;
        if (trial) appendFileSync(path, `${JSON.stringify(trial)}\n`);
      }
    }
    const memory = watch ? await watch.stop() : null;
    const released = agent.kind === "model" && config.release !== undefined;
    const footer: AgentFooter = { type: "footer", agent: agent.id, runs, wallMs: now() - started, loadAverage: config.loadAverage?.() ?? null, memory, released, dropped };
    appendFileSync(path, `${JSON.stringify(footer)}\n`);
    if (agent.kind === "model") await config.release?.(agent.model);
    log(`${agent.id}: ${runs} runs in ${Math.round((now() - started) / 1000)} s${dropped ? `, dropped: ${dropped.reason}` : ""}`);
  }
}
