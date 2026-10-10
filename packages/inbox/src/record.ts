/*
  Recording a run a model proposes for an inbox item: the model reads the
  item's complaint (and, for the reply, its case sheet), the engine runs on
  the item's brief and validates what the model proposes, and everything
  said in both directions goes into a transcript the engine can replay
  without the model.

  The model never gets the brief as instructions and the engine never gets
  the complaint: the two meet only in the proposals, which are codes.
*/

import {
  DEFAULT_AUTONOMY,
  PROTOCOL_VERSION,
  TRANSCRIPT_FORMAT,
  TRANSCRIPT_VERSION,
  driveRun,
  generatePlan,
  type Autonomy,
  type DriveOptions,
  type DriveResult,
  type Transcript,
  type TranscriptStamp,
} from "@ariadne/runner";
import { DEFAULT_MODEL_SEED, ModelProposer, type Exchange, type ModelClient, type ModelStamp } from "@ariadne/runner/model";
import type { ProposalTask } from "@ariadne/runner";
import type { InboxItem } from "./inbox.js";
import { casePrompts } from "./prompts.js";
import { caseSheet } from "./read.js";

/*
  Answers every pause as a person who lets the run go on would: confirms,
  allows, and retries a service that timed out. A proposal that failed is
  skipped, not asked for again: at temperature 0 with a fixed seed the
  model would be asked the same thing to answer it the same way.
*/
export const goOn: DriveOptions["decide"] = (pause, _lastEventId, events) => {
  const last = events.at(-1)?.event;
  if (last?.type === "step.error" && last.error.service === "model") return "skip";
  return (["confirm", "allow", "retry"] as const).find((c) => pause.accepts.includes(c)) ?? null;
};

/* The token limits of a model that thinks before it answers: its thinking
   is spent from the same limit as its answer */
export const THINKING_MAX_TOKENS: Record<ProposalTask, number> = { classify: 2304, request_facts: 2304, draft_reply: 4096 };

export type RecordOptions = {
  item: InboxItem;
  client: ModelClient;
  /* The model's stamp, when the caller already has it (describe is asked
     otherwise) */
  model?: ModelStamp;
  think?: boolean | null;
  temperature?: number;
  seed?: number;
  maxTokens?: Partial<Record<ProposalTask, number>>;
  autonomy?: Autonomy;
  /* The decision for a pause; by default the run goes on (goOn) */
  decide?: DriveOptions["decide"];
  /* Stop */
  signal?: AbortSignal;
  /* Called before the model is asked for a step's proposal and after it
     answered */
  onProposal?: DriveOptions["onProposal"];
  /* What the recorder knows of itself */
  stamp: Pick<TranscriptStamp, "commit" | "build" | "machine" | "recordedAt" | "contextTokens">;
  now?: () => number;
};

export type Recorded = { transcript: Transcript; result: DriveResult };

export async function recordRun(options: RecordOptions): Promise<Recorded> {
  const { item, client } = options;
  const model = options.model ?? (await client.describe(options.signal));
  const autonomy = options.autonomy ?? DEFAULT_AUTONOMY;
  const temperature = options.temperature ?? 0;
  const seed = options.seed ?? DEFAULT_MODEL_SEED;
  const think = options.think ?? null;
  const sheet = caseSheet(item.brief, item.facts, item.lang);
  const exchanges: Exchange[] = [];
  const proposer = new ModelProposer({
    client,
    prompts: casePrompts({ complaint: item.complaint, sheet }),
    temperature,
    seed,
    think,
    maxTokens: options.maxTokens ?? (think === true ? THINKING_MAX_TOKENS : {}),
    record: (exchange) => exchanges.push(exchange),
  });
  /* The step each task belongs to, to file its exchanges under */
  const stepOf = new Map<ProposalTask, string>();
  const result = await driveRun({
    seed: item.seed,
    brief: item.brief,
    autonomy,
    proposer,
    decide: options.decide ?? goOn,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.now ? { now: options.now } : {}),
    onProposal: (need, phase) => {
      stepOf.set(need.task, need.stepId);
      options.onProposal?.(need, phase);
    },
  });
  const transcript: Transcript = {
    format: TRANSCRIPT_FORMAT,
    version: TRANSCRIPT_VERSION,
    protocol: PROTOCOL_VERSION,
    stamp: { ...options.stamp, model, temperature, seed, think },
    run: {
      seed: item.seed,
      autonomy,
      brief: item.brief,
      steps: generatePlan(item.seed, item.brief).map((s) => ({ id: s.id, askFirst: false })),
    },
    entries: result.entries,
    decisions: result.decisions,
    input: { item: item.id, set: item.set, lang: item.lang, row: item.row, complaint: item.complaint, sheet },
    exchanges: exchanges.map((e) => ({ ...e, stepId: stepOf.get(e.task) ?? "" })),
    texts: result.texts,
  };
  return { transcript, result };
}
