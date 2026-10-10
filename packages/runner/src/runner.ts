/*
  Deterministic replay of one approved plan.

  The runner is a pure generator over (plan, autonomy, decision log). The same
  inputs always produce the same events with the same ids, which is what makes
  the transport stateless: an application that reconnects sends the plan and
  the log it already has, the runner replays the run and the transport drops
  the events the application has already seen.

  The runner never waits. When it reaches a point that needs a decision the log
  does not contain, it yields a "pause" and returns: the transport closes the
  segment there. A decision is only accepted at the exact point it belongs to,
  so no log can make a high-risk step run without its own confirmation.
*/

import { PROTOCOL_VERSION, type ActionType, type Autonomy, type Command, type ProgressPhase } from "./codes.js";
import { isProposalTask, MAX_PROPOSAL_ATTEMPTS, type ProposalEntry } from "./proposal.js";
import type { Decision, PlanPayload, ProposalNeed, RunEvent } from "./protocol.js";
import type { ImmediateProposer } from "./proposer.js";
import { SCRIPTED } from "./scripted.js";
import {
  applyDeviation,
  contests,
  generateScenario,
  requiresConfirmation,
  stepWith,
  type CaseBrief,
  type PlanStep,
} from "./scenario.js";

export type RunItem =
  | { kind: "delay"; ms: number }
  | { kind: "event"; id: number; event: RunEvent }
  /* The run waits: for a decision among `accepts`, or, with `proposal`,
     for the proposal of the step */
  | { kind: "pause"; stepId: string; accepts: readonly Command[]; proposal?: ProposalNeed };

/*
  A run whose classification, fact request and reply are proposed from
  outside the engine (a model): the case, and the log of what was proposed
  so far. The run is replayed from the plan, the decision log and this log;
  where it reaches a step the log has no proposal for, it pauses for one.
*/
export type ModelRun = { seed: number; brief: CaseBrief; entries: readonly ProposalEntry[] };

export type RunInput = {
  steps: readonly PlanStep[];
  autonomy: Autonomy;
  decisions: readonly Decision[];
  /* Set for a run a model proposes; the seeded script otherwise */
  model?: ModelRun | null;
  /* Overrides finite undo windows, in seconds */
  undoWindowSec: number | null;
  /* Multiplies every delay; 0 makes the run instant (unit tests) */
  timeScale: number;
  now?: () => number;
};

/* Number of frames after which a first segment with drop=1 is closed */
export const DROP_AFTER_FRAMES = 6;

export type ResolveResult =
  | { ok: true; steps: PlanStep[]; autonomy: Autonomy; model: ModelRun | null }
  | { ok: false; error: "empty_plan" | "too_many_steps" }
  | { ok: false; error: "unknown_step"; stepId: string };

/* Turns the payload from the application into the steps of the scenario,
   as the proposer fills them: the scripted one unless another is given */
export function resolvePlan(
  payload: PlanPayload,
  proposer: ImmediateProposer = SCRIPTED,
): ResolveResult {
  const scenario = generateScenario(payload.seed, payload.brief, proposer);
  const byId = new Map(scenario.steps.map((s) => [s.id, s]));
  if (payload.steps.length === 0) return { ok: false, error: "empty_plan" };
  if (payload.steps.length > scenario.steps.length) return { ok: false, error: "too_many_steps" };
  const steps: PlanStep[] = [];
  for (const s of payload.steps) {
    const known = byId.get(s.id);
    if (!known) return { ok: false, error: "unknown_step", stepId: s.id };
    steps.push({ ...known, askFirst: s.askFirst });
  }
  /* A model's run starts from the same plan: the steps, their order, their
     risk and their pace are the engine's. What the three proposed steps
     say is filled in from the proposal log as the run reaches them. */
  const model = payload.agent === "model" ? { seed: payload.seed, brief: payload.brief, entries: payload.proposals ?? [] } : null;
  return { ok: true, steps, autonomy: payload.autonomy, model };
}

/* The two progress phases each action type reports, at 30% and 65% */
export const PROGRESS_PHASES_BY_TYPE: Record<ActionType, readonly [ProgressPhase, ProgressPhase]> =
  {
    classify: ["reading_case_facts", "matching_reason_codes"],
    request_facts: ["composing_request", "sending_request"],
    reuse_facts: ["opening_linked_case", "copying_facts"],
    draft_reply: ["filling_template", "citing_grounds"],
    check_draft: ["checking_grounds", "checking_deadlines"],
    hand_to_review: ["assembling_package", "assigning_reviewer"],
  };

export const DEVIATION_ACCEPTS: readonly Command[] = ["allow", "deny"];
export const CONFIRM_ACCEPTS: readonly Command[] = ["confirm", "skip"];
export const ERROR_ACCEPTS: readonly Command[] = ["retry", "skip", "stop"];
/* After the last attempt at a step's proposal */
export const LAST_ERROR_ACCEPTS: readonly Command[] = ["skip", "stop"];
/* While a step's proposal is awaited, the run takes nothing but a stop */
export const PROPOSAL_ACCEPTS: readonly Command[] = ["stop"];

export function* runPlan(input: RunInput): Generator<RunItem> {
  const now = input.now ?? Date.now;
  const { autonomy, decisions, steps } = input;
  let id = 0;
  let cursor = 0;

  function* delay(ms: number): Generator<RunItem> {
    const scaled = Math.round(ms * input.timeScale);
    if (scaled > 0) yield { kind: "delay", ms: scaled };
  }

  function* emit(event: RunEvent): Generator<RunItem> {
    id += 1;
    yield { kind: "event", id, event };
  }

  /*
    The decision for the point the run has reached, or null when the log ends
    here. A stop is taken wherever it is found: the application can only
    append it after every decision that came before it.
  */
  function take(stepId: string, accepts: readonly Command[]): Command | null {
    const decision = decisions[cursor];
    if (!decision) return null;
    if (decision.command === "stop") {
      cursor += 1;
      return "stop";
    }
    if (decision.stepId !== stepId) return null;
    if (!accepts.includes(decision.command)) return null;
    cursor += 1;
    return decision.command;
  }

  /* A stop taken while a step was running only ends the plan after that step */
  function stopReached(): boolean {
    const decision = decisions[cursor];
    return decision?.command === "stop" && decision.afterEventId <= id;
  }

  yield* emit({ type: "plan.started", at: now(), total: steps.length, protocol: PROTOCOL_VERSION });

  let lastDone: string | null = null;
  let stopped = false;

  /*
    The proposal of a step in a run a model proposes. The log is read by
    step and attempt: a missing entry pauses the run for it (a stop waiting
    in the decision log is taken instead, so stopping never waits for a
    model); a failed one is the step's error, which a person retries,
    skips or stops at, as any failed step. Returns the step saying what
    was proposed, whether the engine must ask because of it, and the
    attempts used.
  */
  type Proposed =
    | { status: "ready"; step: PlanStep; mustAsk: boolean; attempt: number }
    | { status: "paused" }
    | { status: "skipped" }
    | { status: "stopped" };

  function* proposalOf(planned: PlanStep, model: ModelRun): Generator<RunItem, Proposed> {
    const stepId = planned.id;
    if (!isProposalTask(planned.type)) return { status: "ready", step: planned, mustAsk: false, attempt: 1 };
    for (let attempt = 1; ; attempt++) {
      const entry = model.entries.find((e) => e.stepId === stepId && e.attempt === attempt);
      if (!entry) {
        if (decisions[cursor]?.command === "stop") {
          cursor += 1;
          yield* emit({ type: "step.skipped", stepId, reason: "stopped_by_user" });
          return { status: "stopped" };
        }
        yield { kind: "pause", stepId, accepts: PROPOSAL_ACCEPTS, proposal: { task: planned.type, attempt } };
        return { status: "paused" };
      }
      if ("error" in entry) {
        yield* emit({ type: "step.error", stepId, error: { code: entry.error, service: "model" }, attempt });
        /* The last attempt cannot be retried */
        const accepts = attempt < MAX_PROPOSAL_ATTEMPTS ? ERROR_ACCEPTS : LAST_ERROR_ACCEPTS;
        const decision = take(stepId, accepts);
        if (decision === null) {
          yield { kind: "pause", stepId, accepts };
          return { status: "paused" };
        }
        if (decision === "retry") continue;
        if (decision === "skip") {
          yield* emit({ type: "step.skipped", stepId, reason: "skipped_after_error" });
          return { status: "skipped" };
        }
        yield* emit({ type: "step.skipped", stepId, reason: "stopped_by_user" });
        return { status: "stopped" };
      }
      return {
        status: "ready",
        step: { ...stepWith(planned, model.seed, model.brief, entry.proposal), askFirst: planned.askFirst },
        /* The proposer's own flag, and a proposal that departs from the
           register, add a confirmation; nothing proposed removes one */
        mustAsk: entry.askFirst || contests(entry.proposal, model.brief),
        attempt,
      };
    }
  }

  for (const planned of steps) {
    if (stopReached()) {
      cursor += 1;
      stopped = true;
      break;
    }

    let step = planned;
    const stepId = step.id;
    yield* emit({
      type: "step.started",
      stepId,
      at: now(),
      requiresConfirmation: requiresConfirmation(step, autonomy),
    });
    yield* delay(150);

    /* Every try of the step counts: a proposal asked for again, a service
       called again */
    let attempt = 1;
    let mustAsk = false;
    if (input.model) {
      const proposed = yield* proposalOf(planned, input.model);
      if (proposed.status === "paused") return;
      if (proposed.status === "skipped") continue;
      if (proposed.status === "stopped") {
        stopped = true;
        break;
      }
      ({ step, mustAsk, attempt } = proposed);
    }
    const asks = (s: PlanStep) => mustAsk || requiresConfirmation(s, autonomy);

    if (step.deviation) {
      yield* emit({ type: "step.deviation", stepId, deviation: step.deviation });
      const decision = take(stepId, DEVIATION_ACCEPTS);
      if (decision === null) {
        yield { kind: "pause", stepId, accepts: DEVIATION_ACCEPTS };
        return;
      }
      if (decision === "stop") {
        yield* emit({ type: "step.skipped", stepId, reason: "stopped_by_user" });
        stopped = true;
        break;
      }
      if (decision === "allow") {
        const proposal = step.deviation.proposal;
        step = { ...applyDeviation(step), askFirst: step.askFirst };
        yield* emit({
          type: "step.deviated",
          stepId,
          deviatedTo: proposal,
          actionType: step.type,
          risk: step.risk,
          requiresConfirmation: asks(step),
        });
      }
    }

    if (asks(step)) {
      yield* emit({ type: "step.awaiting", stepId, draft: step.draft });
      const decision = take(stepId, CONFIRM_ACCEPTS);
      if (decision === null) {
        yield { kind: "pause", stepId, accepts: CONFIRM_ACCEPTS };
        return;
      }
      if (decision === "stop") {
        yield* emit({ type: "step.skipped", stepId, reason: "stopped_by_user" });
        stopped = true;
        break;
      }
      if (decision === "skip") {
        yield* emit({ type: "step.skipped", stepId, reason: "skipped_by_user" });
        continue;
      }
    }

    /* The scheduled failure of the step's service happens once */
    let failed = false;
    let stopNow = false;
    for (;;) {
      yield* emit({ type: "step.running", stepId, attempt });
      const phases = PROGRESS_PHASES_BY_TYPE[step.type];
      yield* delay(step.durationMs * 0.3);
      yield* emit({ type: "step.progress", stepId, percent: 30, phase: phases[0] });
      yield* delay(step.durationMs * 0.35);
      yield* emit({ type: "step.progress", stepId, percent: 65, phase: phases[1] });

      if (step.error && !failed) {
        failed = true;
        yield* emit({ type: "step.error", stepId, error: step.error, attempt });
        const decision = take(stepId, ERROR_ACCEPTS);
        if (decision === null) {
          yield { kind: "pause", stepId, accepts: ERROR_ACCEPTS };
          return;
        }
        if (decision === "retry") {
          attempt += 1;
          continue;
        }
        if (decision === "skip") {
          yield* emit({ type: "step.skipped", stepId, reason: "skipped_after_error" });
          break;
        }
        yield* emit({ type: "step.skipped", stepId, reason: "stopped_by_user" });
        stopNow = true;
        break;
      }

      yield* delay(step.durationMs * 0.35);
      const undoWindowSec =
        step.undoWindowSec === null ? null : (input.undoWindowSec ?? step.undoWindowSec);
      yield* emit({
        type: "step.finished",
        stepId,
        at: now(),
        result: {
          summary: step.summary,
          objects: step.objects,
          undo: step.undo,
          undoWindowSec,
        },
      });
      lastDone = stepId;
      break;
    }

    if (stopNow) {
      stopped = true;
      break;
    }
  }

  /* A stop taken during the last step still ends the plan as stopped */
  if (!stopped && stopReached()) {
    cursor += 1;
    stopped = true;
  }

  if (stopped) {
    yield* emit({ type: "plan.stopped", at: now(), afterStepId: lastDone });
  } else {
    yield* emit({ type: "plan.finished", at: now() });
  }
}
