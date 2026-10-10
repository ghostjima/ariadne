/*
  The transcript of a run a model proposed: everything needed to see what
  the model was asked and what it answered, and to replay the run without
  the model.

  A model does not answer the same way twice, so a run with one cannot be
  replayed from a seed. It is replayed from its transcript: the case, the
  plan, the proposal log and the decision log are what the engine takes,
  exactly as a transport hands them over (payloadOf gives the plan payload
  a Service Worker or an in-process segment is opened with). The rest of a
  transcript is a record for a reader and is never given to the engine:
  what the application told the model (`input`), every request and raw
  response with its validation and timings (`exchanges`), the letters the
  model wrote (`texts`), and the stamp of the model, its runtime and the
  build that recorded it.

  readTranscript takes a transcript from untrusted JSON. The parts the
  engine replays are validated as a plan payload is: the brief field by
  field against the code lists, every proposal against its schema. The
  record parts are kept as they are; they are text, and nothing reads them
  as anything else.
*/

import { PROTOCOL_VERSION, type Autonomy, type RequestError } from "./codes.js";
import type { Exchange } from "./model/proposer.js";
import type { ModelStamp } from "./model/client.js";
import type { ProposalEntry } from "./proposal.js";
import {
  decodeDecisions,
  decodePlanPayload,
  encodeDecisions,
  encodePlanPayload,
  type Decision,
  type PlanPayload,
  type PlanPayloadStep,
} from "./protocol.js";
import type { ProposedText } from "./drive.js";
import { resolvePlan, runPlan, type RunItem } from "./runner.js";
import type { CaseBrief } from "./scenario.js";

export const TRANSCRIPT_FORMAT = "ariadne_runner.transcript";
export const TRANSCRIPT_VERSION = 1;

/* Which model, runtime and build a transcript was recorded with */
export type TranscriptStamp = {
  /* The commit and the build of the code that recorded it */
  commit: string;
  build: string;
  model: ModelStamp;
  /* The options every call ran with */
  temperature: number;
  seed: number;
  think: boolean | null;
  contextTokens: number | null;
  /* The machine, in the recorder's words, and the time, ISO 8601 */
  machine: string;
  recordedAt: string;
};

export type Transcript = {
  format: typeof TRANSCRIPT_FORMAT;
  version: typeof TRANSCRIPT_VERSION;
  /* The event protocol the run replays in */
  protocol: number;
  stamp: TranscriptStamp;
  /* What the engine replays */
  run: { seed: number; autonomy: Autonomy; brief: CaseBrief; steps: PlanPayloadStep[] };
  entries: ProposalEntry[];
  decisions: Decision[];
  /* The record: what the model was told beyond the brief (the application's
     own shape: a complaint, a case sheet), each call, and each letter */
  input: unknown;
  exchanges: (Exchange & { stepId: string })[];
  texts: ProposedText[];
};

/* The plan payload a transport replays the transcript's run with */
export function payloadOf(transcript: Pick<Transcript, "run" | "entries">): PlanPayload {
  const { seed, autonomy, brief, steps } = transcript.run;
  return { v: PROTOCOL_VERSION, seed, autonomy, brief, steps, agent: "model", proposals: transcript.entries };
}

export type TranscriptError = RequestError | "invalid_transcript";

export type ReadTranscript = { ok: true; transcript: Transcript } | { ok: false; error: TranscriptError };

/* Reads a transcript from untrusted JSON */
export function readTranscript(raw: unknown): ReadTranscript {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "invalid_transcript" };
  const r = raw as Record<string, unknown>;
  if (r.format !== TRANSCRIPT_FORMAT || r.version !== TRANSCRIPT_VERSION) return { ok: false, error: "invalid_transcript" };
  if (r.protocol !== PROTOCOL_VERSION) return { ok: false, error: "unsupported_version" };
  const run = r.run as Record<string, unknown> | null;
  if (run === null || typeof run !== "object") return { ok: false, error: "invalid_transcript" };
  /* The engine's parts go through the plan payload's own reader */
  let text: string;
  try {
    text = encodePlanPayload({ v: PROTOCOL_VERSION, ...run, agent: "model", proposals: r.entries } as PlanPayload);
  } catch {
    return { ok: false, error: "invalid_transcript" };
  }
  const decoded = decodePlanPayload(text);
  if (!decoded.ok) return decoded;
  const { payload } = decoded;
  if (!Array.isArray(r.decisions)) return { ok: false, error: "invalid_decisions" };
  let decisions: Decision[] | null;
  try {
    decisions = decodeDecisions(encodeDecisions(r.decisions as Decision[]));
  } catch {
    decisions = null;
  }
  if (decisions === null) return { ok: false, error: "invalid_decisions" };
  if (r.stamp === null || typeof r.stamp !== "object" || !Array.isArray(r.exchanges) || !Array.isArray(r.texts)) return { ok: false, error: "invalid_transcript" };
  return {
    ok: true,
    transcript: {
      format: TRANSCRIPT_FORMAT,
      version: TRANSCRIPT_VERSION,
      protocol: PROTOCOL_VERSION,
      stamp: r.stamp as TranscriptStamp,
      run: { seed: payload.seed, autonomy: payload.autonomy, brief: payload.brief, steps: payload.steps },
      entries: payload.proposals ?? [],
      decisions,
      input: r.input ?? null,
      exchanges: r.exchanges as Transcript["exchanges"],
      texts: r.texts as ProposedText[],
    },
  };
}

export type ReplayOptions = {
  /* Another decision log than the recorded one: the same proposals under
     other decisions */
  decisions?: readonly Decision[];
  undoWindowSec?: number | null;
  /* Multiplies every delay; 0, the default, replays at once */
  timeScale?: number;
  now?: () => number;
};

/* The run of a transcript, replayed: the same items runPlan gives for a
   seed, from the recorded proposals instead */
export function* replayTranscript(transcript: Transcript, options: ReplayOptions = {}): Generator<RunItem> {
  const plan = resolvePlan(payloadOf(transcript));
  if (!plan.ok) throw new RangeError(plan.error);
  yield* runPlan({
    steps: plan.steps,
    autonomy: plan.autonomy,
    decisions: options.decisions ?? transcript.decisions,
    model: plan.model,
    undoWindowSec: options.undoWindowSec ?? null,
    timeScale: options.timeScale ?? 0,
    ...(options.now ? { now: options.now } : {}),
  });
}
