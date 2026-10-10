/*
  Driving a run whose steps a proposer fills in as it goes: the loop an
  application runs around the engine, without a page.

  The engine never waits and never calls a proposer: runPlan replays the
  run from the plan, the decision log and the proposal log, and pauses
  where it needs a decision or a proposal. The driver answers the pauses.
  For a proposal it calls the proposer, appends its outcome to the proposal
  log and replays; for a decision it asks `decide`. The run is replayed
  from its first event each time, which costs microseconds and keeps the
  driver as stateless as the transports.

  Stop is the driver's signal. While a proposer is working, an abort ends
  its call at once; the call's rejection writes nothing, a stop goes into
  the decision log after the last event seen, and the next replay ends the
  run: the step that waited for its proposal is skipped as stopped.
*/

import type { Autonomy, Command } from "./codes.js";
import type { ProposalEntry } from "./proposal.js";
import type { Decision, PlanPayloadStep, ProposalNeed, RunEvent } from "./protocol.js";
import type { Proposer } from "./proposer.js";
import { runPlan } from "./runner.js";
import { generatePlan, type CaseBrief } from "./scenario.js";

/* A letter a proposer wrote for a step: untrusted text, kept beside the
   run and never in it */
export type ProposedText = { stepId: string; attempt: number; text: string };

export type DriveOptions = {
  seed: number;
  brief: CaseBrief;
  autonomy: Autonomy;
  /* The steps to run, in order; the whole plan when left out */
  steps?: readonly PlanPayloadStep[];
  proposer: Proposer;
  /* The decision for a pause, or null to leave the run waiting there.
     `events` is the run so far: the last one says what the pause is for
     (a draft to confirm, a failed step and why). */
  decide: (pause: { stepId: string; accepts: readonly Command[] }, lastEventId: number, events: readonly { id: number; event: RunEvent }[]) => Command | null;
  /* Stop: aborting it stops the run */
  signal?: AbortSignal;
  /* Logs to start from, to go on with a run */
  entries?: readonly ProposalEntry[];
  decisions?: readonly Decision[];
  now?: () => number;
  /* Called before the proposer is asked and after it answered */
  onProposal?: (need: ProposalNeed & { stepId: string }, phase: "asked" | "answered") => void;
};

export type DriveResult = {
  /* Every event of the run as it stands, with its id */
  events: { id: number; event: RunEvent }[];
  entries: ProposalEntry[];
  texts: ProposedText[];
  decisions: Decision[];
  /* The pause the run was left at, or null when it ended */
  waiting: { stepId: string; accepts: readonly Command[] } | null;
};

export async function driveRun(options: DriveOptions): Promise<DriveResult> {
  const { seed, brief, autonomy, proposer } = options;
  const plan = generatePlan(seed, brief);
  const order = options.steps ?? plan.map((s) => ({ id: s.id, askFirst: false }));
  const steps = order.flatMap((o) => {
    const step = plan.find((s) => s.id === o.id);
    return step ? [{ ...step, askFirst: o.askFirst }] : [];
  });
  const entries: ProposalEntry[] = [...(options.entries ?? [])];
  const decisions: Decision[] = [...(options.decisions ?? [])];
  const texts: ProposedText[] = [];
  const signal = options.signal ?? new AbortController().signal;

  for (;;) {
    const events: DriveResult["events"] = [];
    let pause: { stepId: string; accepts: readonly Command[]; proposal?: ProposalNeed } | null = null;
    const run = runPlan({
      steps,
      autonomy,
      decisions,
      model: { seed, brief, entries },
      undoWindowSec: null,
      timeScale: 0,
      ...(options.now ? { now: options.now } : {}),
    });
    for (const item of run) {
      if (item.kind === "event") events.push({ id: item.id, event: item.event });
      else if (item.kind === "pause") pause = item;
    }
    const lastId = events.at(-1)?.id ?? 0;
    if (pause === null) return { events, entries, texts, decisions, waiting: null };
    const stop = () => decisions.push({ command: "stop", stepId: null, afterEventId: lastId });
    if (signal.aborted) {
      stop();
      continue;
    }
    if (pause.proposal) {
      const { stepId } = pause;
      const { task, attempt } = pause.proposal;
      options.onProposal?.({ stepId, task, attempt }, "asked");
      try {
        const outcome = await proposer.propose({ task, seed, brief, attempt }, signal);
        if (outcome.ok) {
          entries.push({ stepId, attempt, proposal: outcome.proposal, askFirst: outcome.askFirst });
          if (outcome.text !== null) texts.push({ stepId, attempt, text: outcome.text });
        } else entries.push({ stepId, attempt, error: outcome.error });
      } catch (error) {
        /* Stopped while the proposer worked: nothing was proposed, so
           nothing is written; the stop goes into the decision log */
        if (!signal.aborted) throw error;
        stop();
        continue;
      }
      options.onProposal?.({ stepId, task, attempt }, "answered");
      continue;
    }
    const command = options.decide({ stepId: pause.stepId, accepts: pause.accepts }, lastId, events);
    if (command === null) return { events, entries, texts, decisions, waiting: { stepId: pause.stepId, accepts: pause.accepts } };
    decisions.push({ command, stepId: command === "stop" ? null : pause.stepId, afterEventId: lastId });
  }
}
