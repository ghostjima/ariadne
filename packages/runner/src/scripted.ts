/*
  The scripted proposer: the seeded script of the scenario, as a proposer.

  It reads nothing but the case brief, so its answers are the ones the
  register and the rules give: the stream and the grounds of the brief, the
  team that holds the facts of that stream with the questions for it (and,
  for a case with a linked case, the request to take that case's facts),
  and a reply that states what the brief carries. The same brief gives the
  same answers under every seed: the seed sets the pace of a run and its
  one scheduled failure (scenario.ts), not what is proposed.
*/

import { NEXT_STEPS, type FactQuestion, type StreamCode, type Team } from "./codes.js";
import type {
  ImmediateProposer,
  ProposalFor,
  ProposalRequest,
  ProposalTask,
} from "./proposer.js";

/* The team that holds the facts of a stream */
export function teamOf(stream: StreamCode): Team {
  if (stream === "antifraud") return "antifraud";
  if (stream === "aml_refusal") return "aml";
  return "operations";
}

/* What the fact request asks the team */
export const QUESTIONS_BY_TEAM: Record<Team, readonly FactQuestion[]> = {
  antifraud: ["sign_detected", "client_confirmation", "database_match", "measure_status"],
  aml: ["decision_basis", "documents_received", "measure_status"],
  operations: ["operation_record", "contract_terms", "charges"],
};

export class ScriptedProposer implements ImmediateProposer {
  proposeNow<T extends ProposalTask>(request: ProposalRequest<T>): ProposalFor<T>;
  proposeNow({ task, brief }: ProposalRequest): ProposalFor<ProposalTask> {
    switch (task) {
      case "classify":
        return { task, stream: brief.stream, grounds: [...brief.grounds] };
      case "request_facts": {
        const team = teamOf(brief.stream);
        return {
          task,
          team,
          questions: [...QUESTIONS_BY_TEAM[team]],
          reuseLinked: brief.linkedCase !== null,
        };
      }
      case "draft_reply":
        return {
          task,
          grounds: [...brief.grounds],
          reasons: brief.reason === null ? [] : [brief.reason],
          clientOptions: [...brief.clientOptions],
          deadlines: brief.deadlines.map((d) => ({ ...d })),
          measures: [...brief.measures],
          nextSteps: [...NEXT_STEPS],
        };
    }
  }

  propose<T extends ProposalTask>(
    request: ProposalRequest<T>,
    signal: AbortSignal,
  ): Promise<ProposalFor<T>> {
    if (signal.aborted) return Promise.reject(signal.reason);
    return Promise.resolve(this.proposeNow(request));
  }
}

/* The engine's own proposer */
export const SCRIPTED: ImmediateProposer = new ScriptedProposer();
