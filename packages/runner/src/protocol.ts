/*
  Wire protocol between an application and the run.

  GET <agent path>?plan=<base64url JSON of PlanPayload>[&decisions=<log>]
      [&speed=fast][&drop=1][&undoWindow=<sec>][&after=<eventId>]
    Returns text/event-stream.

  Every request is one short segment of the run. The application owns the
  approved plan and the ordered decision log; the handler rebuilds the run from
  them, replays it deterministically, sends the events after "after" (or the
  Last-Event-ID header) and closes as soon as it reaches a decision it has not
  been given, or the end of the plan. It never waits for anything, so no
  request depends on state written by another one.

  When the stream stops on a decision, the last frame is a "stream.waiting"
  event naming the step and the commands it accepts. The application appends
  the user decision to its log and opens the next segment with a larger
  "after". A dropped connection resumes through the same mechanism, with the
  event id the application last saw.

  Every field of every event is a code, a number, a boolean, an ISO date or a
  step id; see codes.ts.

  Version 6 (PROTOCOL_VERSION). The payload carries "v": 6 and the case brief
  (scenario.ts): the run is about one complaint, and every string in the
  brief must be one of the engine's codes or an ISO date, so no text of the
  complaint can travel with it. plan.started repeats the version. A payload
  without "v": 6 is refused with unsupported_version: version 1 (the
  procurement scenario), version 2 (the complaint before the grounds of
  161-FZ art. 9 parts 11.6 and 11.7), version 3 (before the client's
  option to apply for the removal of the client's data), version 4
  (before the restrictions a brief states for those data) and version 5
  (before a model could propose the content of the steps) are no longer
  served; a brief that does not validate is refused with invalid_case. A code added to a list
  the brief, the events or the log draw from makes a new version: a reader
  of the old one would refuse the new code as an invalid case, not as
  another version.

  A payload may name its agent. "scripted" (the default) is the seeded
  script: the plan and what its steps say follow from the seed and the
  brief. "model" is a run whose classification, fact request and reply are
  proposed from outside the engine: the payload then carries the proposal
  log ("proposals"), one entry per step and attempt, each a proposal in
  codes or a coded failure (proposal.ts). The handler validates every entry
  as it validates the brief and refuses the payload with invalid_proposals
  otherwise. When the run reaches a step whose proposal the log does not
  hold, the segment ends as it does for a decision, with a "stream.waiting"
  frame that names the step, accepts "stop" and says which proposal it
  waits for ("proposal": the task and the attempt). The application gets
  the proposal, appends it to the log and opens the next segment.
*/

import {
  AGENT_KINDS,
  AUTONOMIES,
  CASE_STAGES,
  CLIENT_DEADLINE_KINDS,
  CLIENT_OPTIONS,
  COMMANDS,
  GROUND_CODES,
  MEASURE_CODES,
  OPERATIONS,
  OUTCOMES,
  PROTOCOL_VERSION,
  REASON_CODES,
  REGIMES,
  STREAMS,
  type ActionType,
  type AgentKind,
  type Autonomy,
  type Command,
  type DeviationProposalCode,
  type ProgressPhase,
  type Risk,
  type SkipReason,
  type Speed,
} from "./codes.js";
import { isProposalTask, validateEntries, type ProposalEntry } from "./proposal.js";
import type { ProposalTask } from "./proposer.js";
import {
  generateScenario,
  type AffectedObject,
  type CaseBrief,
  type Deviation,
  type Draft,
  type StepError,
  type Summary,
  type UndoEffect,
} from "./scenario.js";

export type PlanPayloadStep = { id: string; askFirst: boolean };

export type PlanPayload = {
  v: typeof PROTOCOL_VERSION;
  seed: number;
  autonomy: Autonomy;
  brief: CaseBrief;
  steps: PlanPayloadStep[];
  /* Who proposes what the steps say; the seeded script when left out */
  agent?: AgentKind;
  /* The proposal log of a run whose agent is a model */
  proposals?: ProposalEntry[];
};

/*
  One user decision. "stop" belongs to the whole plan, not to a step, so it
  carries the id of the last event the application had seen when the user
  pressed it: that is what places it on the timeline of the replay.
*/
export type Decision = { command: Command; stepId: string | null; afterEventId: number };

/* The proposal a run waits for: the step's task, and which attempt */
export type ProposalNeed = { task: ProposalTask; attempt: number };

/* What a run waits for at a step: a decision among `accepts`, or, with
   `proposal`, the proposal of that step (only "stop" is accepted then) */
export type WaitingNotice = { stepId: string; accepts: readonly Command[]; proposal?: ProposalNeed };

export type StepResult = {
  summary: Summary;
  objects: AffectedObject[];
  undo: UndoEffect;
  undoWindowSec: number | null;
};

export type RunEvent =
  | { type: "plan.started"; at: number; total: number; protocol: number }
  | { type: "step.started"; stepId: string; at: number; requiresConfirmation: boolean }
  | { type: "step.deviation"; stepId: string; deviation: Deviation }
  | {
      type: "step.deviated";
      stepId: string;
      deviatedTo: DeviationProposalCode;
      actionType: ActionType;
      risk: Risk;
      requiresConfirmation: boolean;
    }
  | { type: "step.awaiting"; stepId: string; draft: Draft }
  | { type: "step.running"; stepId: string; attempt: number }
  | { type: "step.progress"; stepId: string; percent: number; phase: ProgressPhase }
  | { type: "step.finished"; stepId: string; at: number; result: StepResult }
  | { type: "step.skipped"; stepId: string; reason: SkipReason }
  | { type: "step.error"; stepId: string; error: StepError; attempt: number }
  | { type: "plan.finished"; at: number }
  | { type: "plan.stopped"; at: number; afterStepId: string | null };

export type StreamOptions = {
  speed: Speed;
  /* Close the first segment early once, to demonstrate reconnection */
  drop: boolean;
  /* Overrides finite undo windows, in seconds */
  undoWindowSec: number | null;
};

/* base64url helpers; atob and btoa exist in browsers, workers and Node 16+ */
function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodePlanPayload(payload: PlanPayload): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

export function isAutonomy(value: unknown): value is Autonomy {
  return typeof value === "string" && (AUTONOMIES as readonly string[]).includes(value);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CASE_NO = 999_999;
/* Kopecks of the largest amount a register holds: 10^15, well inside the
   integers a double keeps exactly */
const MAX_KOPECKS = 1e15;

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function isCount(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

function isCode<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

function codeList<T extends string>(list: readonly T[], value: unknown): T[] | null {
  if (!Array.isArray(value) || value.length > list.length) return null;
  const out: T[] = [];
  for (const item of value) {
    if (!isCode(list, item) || out.includes(item)) return null;
    out.push(item);
  }
  return out;
}

/*
  The case brief, rebuilt field by field from untrusted JSON: only the
  fields the engine knows are kept, every string must be a code from its own
  list or an ISO date, every number a whole number in range. Anything else
  (a sentence, a field the engine does not know, a nested object) makes the
  brief invalid. This is what keeps a complaint's text out of the run.
*/
export function validateBrief(raw: unknown): CaseBrief | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isCount(r.caseNo, MAX_CASE_NO) || r.caseNo === 0) return null;
  if (!isCode(STREAMS, r.stream) || !isCode(REGIMES, r.regime)) return null;
  if (r.reason !== null && !isCode(REASON_CODES, r.reason)) return null;
  if (!isCode(OPERATIONS, r.operation)) return null;
  if (!isCount(r.opRef, 0xffffffff)) return null;
  if (r.opOn !== null && !isIsoDate(r.opOn)) return null;
  if (!isCount(r.amountKopecks, MAX_KOPECKS) || !isCount(r.claimKopecks, MAX_KOPECKS)) return null;
  if (typeof r.forwarded !== "boolean") return null;
  if (!isCode(CASE_STAGES, r.stage) || !isCode(OUTCOMES, r.outcome)) return null;
  for (const day of [r.receivedOn, r.asOf, r.replyDue, r.factsDue]) if (!isIsoDate(day)) return null;
  if (r.linkedCase !== null && (!isCount(r.linkedCase, MAX_CASE_NO) || r.linkedCase === 0)) return null;
  const grounds = codeList(GROUND_CODES, r.grounds);
  const clientOptions = codeList(CLIENT_OPTIONS, r.clientOptions);
  const measures = codeList(MEASURE_CODES, r.measures);
  if (!grounds || !clientOptions || !measures) return null;
  if (!Array.isArray(r.deadlines) || r.deadlines.length > CLIENT_DEADLINE_KINDS.length) return null;
  const deadlines: CaseBrief["deadlines"] = [];
  for (const d of r.deadlines as unknown[]) {
    if (!d || typeof d !== "object") return null;
    const { kind, due } = d as Record<string, unknown>;
    if (!isCode(CLIENT_DEADLINE_KINDS, kind) || !isIsoDate(due)) return null;
    if (deadlines.some((x) => x.kind === kind)) return null;
    deadlines.push({ kind, due });
  }
  return {
    caseNo: r.caseNo,
    stream: r.stream,
    regime: r.regime,
    reason: r.reason,
    operation: r.operation,
    opRef: r.opRef,
    opOn: r.opOn,
    amountKopecks: r.amountKopecks,
    claimKopecks: r.claimKopecks,
    forwarded: r.forwarded,
    stage: r.stage,
    outcome: r.outcome,
    receivedOn: r.receivedOn as string,
    asOf: r.asOf as string,
    replyDue: r.replyDue as string,
    factsDue: r.factsDue as string,
    linkedCase: r.linkedCase,
    grounds,
    clientOptions,
    deadlines,
    measures,
  };
}

export type DecodedPlan =
  | { ok: true; payload: PlanPayload }
  | { ok: false; error: "invalid_plan" | "unsupported_version" | "invalid_case" | "invalid_proposals" };

/* The steps of a case's plan whose content is proposed, by id */
export function proposalSteps(seed: number, brief: CaseBrief): Map<string, ProposalTask> {
  const out = new Map<string, ProposalTask>();
  for (const step of generateScenario(seed, brief).steps) if (isProposalTask(step.type)) out.set(step.id, step.type);
  return out;
}

/* Reads a plan payload: malformed, of another protocol version, with a
   brief that does not validate, or with a proposal log that does not,
   each with its own error */
export function decodePlanPayload(text: string): DecodedPlan {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(fromBase64Url(text)));
  } catch {
    return { ok: false, error: "invalid_plan" };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "invalid_plan" };
  const r = raw as Record<string, unknown>;
  if (r.v !== PROTOCOL_VERSION) return { ok: false, error: "unsupported_version" };
  if (typeof r.seed !== "number" || !Number.isFinite(r.seed)) return { ok: false, error: "invalid_plan" };
  if (!isAutonomy(r.autonomy)) return { ok: false, error: "invalid_plan" };
  if (!Array.isArray(r.steps)) return { ok: false, error: "invalid_plan" };
  const steps: PlanPayloadStep[] = [];
  const seen = new Set<string>();
  for (const s of r.steps as unknown[]) {
    if (!s || typeof s !== "object") return { ok: false, error: "invalid_plan" };
    const step = s as Record<string, unknown>;
    if (typeof step.id !== "string" || seen.has(step.id)) return { ok: false, error: "invalid_plan" };
    seen.add(step.id);
    steps.push({ id: step.id, askFirst: step.askFirst === true });
  }
  const agent = r.agent === undefined ? "scripted" : r.agent;
  if (!isCode(AGENT_KINDS, agent)) return { ok: false, error: "invalid_plan" };
  const brief = validateBrief(r.brief);
  if (!brief) return { ok: false, error: "invalid_case" };
  const payload: PlanPayload = { v: PROTOCOL_VERSION, seed: r.seed, autonomy: r.autonomy, brief, steps };
  if (agent === "scripted") {
    /* The script proposes for itself: a log has no place in its payload */
    if (r.proposals !== undefined) return { ok: false, error: "invalid_proposals" };
    return { ok: true, payload: r.agent === undefined ? payload : { ...payload, agent } };
  }
  const proposals = validateEntries(r.proposals ?? [], proposalSteps(r.seed, brief), brief);
  if (!proposals) return { ok: false, error: "invalid_proposals" };
  return { ok: true, payload: { ...payload, agent, proposals } };
}

/* Enough for two decisions per step of the longest plan plus a stop */
const MAX_DECISIONS = 64;
const MAX_EVENT_ID = 100_000;
const STEP_ID = /^[a-z][a-z0-9]{0,7}$/;

/*
  The decision log as one query parameter: "confirm-s3-14.retry-s2-9.stop--33".
  Fields are command, step id (empty for stop) and the event id the decision
  was taken after. The whole log of a plan stays under 200 bytes,
  which keeps the URL far below any limit and keeps the log readable in the
  network panel.
*/
export function encodeDecisions(list: readonly Decision[]): string {
  return list.map((d) => `${d.command}-${d.stepId ?? ""}-${d.afterEventId}`).join(".");
}

/* Returns null when the log is malformed, an empty list when there is none */
export function decodeDecisions(text: string | null): Decision[] | null {
  if (text === null || text === "") return [];
  const out: Decision[] = [];
  for (const chunk of text.split(".")) {
    if (chunk === "") continue;
    if (out.length >= MAX_DECISIONS) return null;
    const parts = chunk.split("-");
    if (parts.length !== 3) return null;
    const [command, stepId, after] = parts as [string, string, string];
    if (!(COMMANDS as readonly string[]).includes(command)) return null;
    if (stepId !== "" && !STEP_ID.test(stepId)) return null;
    if (command === "stop" ? stepId !== "" : stepId === "") return null;
    const afterEventId = Number(after);
    if (!Number.isInteger(afterEventId) || afterEventId < 0 || afterEventId > MAX_EVENT_ID)
      return null;
    out.push({
      command: command as Command,
      stepId: stepId === "" ? null : stepId,
      afterEventId,
    });
  }
  return out;
}

export function parseStreamOptions(params: URLSearchParams): StreamOptions {
  const undoRaw = params.get("undoWindow");
  const undo = undoRaw === null ? NaN : Number(undoRaw);
  return {
    speed: params.get("speed") === "fast" ? "fast" : "normal",
    drop: params.get("drop") === "1",
    undoWindowSec: Number.isFinite(undo) && undo > 0 ? Math.min(undo, 3600) : null,
  };
}
