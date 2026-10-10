/*
  The proposer: where the content of a step comes from.

  The plan of a run is the engine's: five steps in a fixed order, each with
  the risk of its action. What three of them say is proposed: how the
  complaint is classified, which team is asked for the facts and what it is
  asked, and what the reply states. A proposer answers those three tasks for
  one case. The engine takes its answers as proposals in codes, builds the
  steps from them, and computes the risk, the confirmation and the undo
  itself: nothing a proposer answers sets them.

  ScriptedProposer (scripted.ts) is the seeded script the engine has always
  run. Another proposer may take time and may fail, so the interface is
  asynchronous and every call carries an AbortSignal; one whose answers are
  known at once also answers synchronously, which is what lets the engine
  plan and replay a run without waiting.
*/

import type {
  ActionType,
  ClientOption,
  FactQuestion,
  GroundCode,
  MeasureCode,
  NextStep,
  ReasonCode,
  StreamCode,
  Team,
} from "./codes.js";
import type { CaseBrief, ClientDeadline } from "./scenario.js";

/* The steps whose content is proposed, by their action */
export const PROPOSAL_TASKS = [
  "classify",
  "request_facts",
  "draft_reply",
] as const satisfies readonly ActionType[];
export type ProposalTask = (typeof PROPOSAL_TASKS)[number];

/* How the complaint reads: its stream and the grounds a reply to it names */
export type ClassifyProposal = {
  task: "classify";
  stream: StreamCode;
  grounds: GroundCode[];
};

/* Which team holds the facts and what to ask it; or, for a case with a
   linked case, a request to take that case's facts instead */
export type FactRequestProposal = {
  task: "request_facts";
  team: Team;
  questions: FactQuestion[];
  reuseLinked: boolean;
};

/* What the reply states, in codes: the application writes the words out,
   and the rubric checks these */
export type ReplyProposal = {
  task: "draft_reply";
  grounds: GroundCode[];
  reasons: ReasonCode[];
  clientOptions: ClientOption[];
  deadlines: ClientDeadline[];
  measures: MeasureCode[];
  nextSteps: NextStep[];
};

export type Proposal = ClassifyProposal | FactRequestProposal | ReplyProposal;
export type ProposalFor<T extends ProposalTask> = Extract<Proposal, { task: T }>;

/* One proposal per task: everything the engine needs to build a plan */
export type ProposalSet = { [T in ProposalTask]: ProposalFor<T> };

/* What a proposer is asked: the task, for which case, under which seed.
   Codes, numbers and dates only, as the brief is. */
export type ProposalRequest<T extends ProposalTask = ProposalTask> = {
  task: T;
  seed: number;
  brief: CaseBrief;
};

export interface Proposer {
  /* Rejects when the signal aborts: an aborted call proposes nothing */
  propose<T extends ProposalTask>(
    request: ProposalRequest<T>,
    signal: AbortSignal,
  ): Promise<ProposalFor<T>>;
}

/* A proposer whose answers are known at once */
export interface ImmediateProposer extends Proposer {
  proposeNow<T extends ProposalTask>(request: ProposalRequest<T>): ProposalFor<T>;
}

/* The three proposals of a case, from a proposer that answers at once */
export function proposeAll(proposer: ImmediateProposer, seed: number, brief: CaseBrief): ProposalSet {
  return {
    classify: proposer.proposeNow({ task: "classify", seed, brief }),
    request_facts: proposer.proposeNow({ task: "request_facts", seed, brief }),
    draft_reply: proposer.proposeNow({ task: "draft_reply", seed, brief }),
  };
}
